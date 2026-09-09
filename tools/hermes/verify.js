#!/usr/bin/env node
'use strict';
/**
 * verify.js — inspect the Hermes bytecode artifact.
 *
 *   node tools/hermes/verify.js [--config <path>] [--json]
 *
 * Real .hbc path: reads the Hermes bytecode file header per
 * include/hermes/BCGen/HBC/BytecodeFileFormat.h — magic u64 LE
 * 0x1F1903C103BC1FC6 ("Hermes" in ancient Greek, UTF-16BE truncated),
 * version u32 LE at offset 8, 20-byte SHA1 source hash at offset 12 —
 * prints magic/version/sha256/size; runs `hbcdump -c "disassemble;quit"`
 * for a disassembly excerpt when available, else header-only. Compares header version with
 * config.bytecodeTarget when set (mismatch = warning, not failure: bytecode
 * is engine-coupled, rebuild on upgrade).
 *
 * Fallback path: when only dist/game.hbc.json exists, verifies the bundle
 * hash recorded in the manifest and reports FALLBACK.
 *
 * Exit: 0 verified (or fallback-verified), 2 config error, 3 corrupt/missing.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const HBC_MAGIC_LO = 0x03BC1FC6; // low 32 bits of 0x1F1903C103BC1FC6 (LE)
const HBC_MAGIC_HI = 0x1F1903C1; // high 32 bits
const HBC_MAGIC_HEX = '0x1F1903C103BC1FC6';

function parseArgs(argv) {
  const out = { config: 'hermes.config.json', json: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--config') {
      out.config = argv[++i];
      if (!out.config) {
        throw new Error('missing value for --config');
      }
    } else if (a === '--json') {
      out.json = true;
    } else if (a === '--help' || a === '-h') {
      out.help = true;
    } else {
      throw new Error(`unknown flag: ${a}\nUsage: node tools/hermes/verify.js [--config <path>] [--json]`);
    }
  }
  return out;
}

function sha256File(p) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(p));
  return h.digest('hex');
}

function which(bin) {
  try {
    const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) {
      return r.stdout.trim().split('\n')[0].trim();
    }
  } catch (e) { /* ignore */ }
  return null;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (e) {
    console.error(`verify: ${e.message}`);
    process.exit(2);
  }
  if (args.help) {
    console.log('Usage: node tools/hermes/verify.js [--config <path>] [--json]');
    process.exit(0);
  }
  const configPath = path.resolve(args.config);
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    console.error(`verify: cannot read/parse config ${args.config}: ${e.message}`);
    process.exit(2);
  }
  const repoRoot = path.dirname(configPath);
  const hbcPath = path.resolve(repoRoot, cfg.bytecode || 'dist/game.hbc');
  const bundlePath = path.resolve(repoRoot, cfg.bundle || 'dist/game.bundle.js');
  const manifestPath = path.resolve(repoRoot, cfg.fallbackManifest || 'dist/game.hbc.json');

  // --- Real bytecode path ------------------------------------------------
  if (fs.existsSync(hbcPath)) {
    let buf;
    try {
      buf = fs.readFileSync(hbcPath);
    } catch (e) {
      fail(3, `cannot read bytecode: ${e.message}`);
      return;
    }
    if (buf.length < 32) {
      fail(3, `bytecode corrupt: file too small (${buf.length} bytes, need >= 32 for header). Recovery: re-run \`npm run hermes:build\`.`);
      return;
    }
    const magicLo = buf.readUInt32LE(0);
    const magicHi = buf.readUInt32LE(4);
    const version = buf.readUInt32LE(8);
    const sourceHash = buf.subarray(12, 32).toString('hex');
    const size = buf.length;
    const sha256 = sha256File(hbcPath);
    const magicHex = '0x' + magicHi.toString(16).toUpperCase().padStart(8, '0') + magicLo.toString(16).toUpperCase().padStart(8, '0');
    if (magicLo !== HBC_MAGIC_LO || magicHi !== HBC_MAGIC_HI) {
      fail(3, `bytecode corrupt: bad magic ${magicHex} (expected ${HBC_MAGIC_HEX}). Recovery: re-run \`npm run hermes:build\`; ensure no text editor touched dist/.`);
      return;
    }
    const warnings = [];
    if (cfg.bytecodeTarget && version !== cfg.bytecodeTarget) {
      warnings.push(`header version ${version} != config bytecodeTarget ${cfg.bytecodeTarget}: bytecode is engine-coupled; rebuild after Hermes upgrades.`);
    }
    // Optional hbcdump excerpt.
    let disasm = null;
    const dumper = (cfg.hermes && cfg.hermes.dumper) || 'hbcdump';
    const dumpBin = which(dumper);
    if (dumpBin) {
      try {
        const r = spawnSync(dumpBin, ['-c', 'disassemble;quit', hbcPath], { encoding: 'utf8', timeout: 30000 });
        if (r.status === 0 && r.stdout) {
          disasm = r.stdout.split('\n').slice(0, 20).join('\n');
        } else {
          warnings.push(`hbcdump ran but failed (exit ${r.status}); header-only verification used.`);
        }
      } catch (e) {
        warnings.push(`hbcdump error (${e.message}); header-only verification used.`);
      }
    }
    const report = {
      ok: true, mode: dumpBin ? 'bytecode+hbcdump' : 'bytecode-header',
      file: path.relative(repoRoot, hbcPath),
      magic: magicHex, version, sourceHash,
      size, sha256, warnings,
      excerpt: disasm
    };
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`verify: OK — ${report.file}`);
      console.log(`  magic ${magicHex}  version ${version}  sourceHash ${sourceHash}`);
      console.log(`  size ${size} bytes  sha256 ${sha256}`);
      for (const w of warnings) {
        console.warn(`  warning: ${w}`);
      }
      if (disasm) {
        console.log('  --- hbcdump excerpt (first 20 lines) ---');
        console.log(disasm);
      } else {
        console.log('  (header-only: hbcdump not found on PATH)');
      }
    }
    process.exit(0);
  }

  // --- Fallback manifest path --------------------------------------------
  if (fs.existsSync(manifestPath)) {
    let m;
    try {
      m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (e) {
      fail(3, `fallback manifest corrupt: ${e.message}. Recovery: re-run \`npm run hermes:build\`.`);
      return;
    }
    if (!m.fallback || m.code !== 'FALLBACK_NO_BINARY') {
      fail(3, 'fallback manifest unrecognized. Recovery: re-run `npm run hermes:build`.');
      return;
    }
    let bundleHash = null;
    let match = null;
    if (fs.existsSync(bundlePath)) {
      bundleHash = sha256File(bundlePath);
      match = bundleHash === m.sha256;
    }
    const report = {
      ok: true, mode: 'FALLBACK', code: 'FALLBACK_NO_BINARY',
      manifest: path.relative(repoRoot, manifestPath),
      bundle: path.relative(repoRoot, bundlePath),
      expectedSha256: m.sha256, actualSha256: bundleHash,
      hashMatch: match,
      hint: m.hint || 'Install Hermes and re-run `npm run hermes:build` for real bytecode.'
    };
    if (!match) {
      if (args.json) {
        console.log(JSON.stringify({ ...report, ok: false }, null, 2));
      } else {
        console.error(`verify: FALLBACK manifest present but bundle hash mismatch (expected ${m.sha256}, got ${bundleHash}). Recovery: re-run \`npm run hermes:build\`.`);
      }
      process.exit(3);
    }
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`verify: FALLBACK — no real .hbc (hermes binary was absent at build time).`);
      console.log(`  bundle ${report.bundle} sha256 ${bundleHash} (matches manifest)`);
      console.log(`  recovery: ${report.hint}`);
    }
    process.exit(0);
  }

  fail(3, `nothing to verify: neither ${path.relative(repoRoot, hbcPath)} nor fallback manifest exists. Recovery: run \`npm run hermes:build\` first.`);

  function fail(code, message) {
    if (args.json) {
      console.log(JSON.stringify({ ok: false, code: 'VERIFY_FAILED', message }, null, 2));
    } else {
      console.error(`verify: FAIL — ${message}`);
    }
    process.exit(code);
  }
}

main();
