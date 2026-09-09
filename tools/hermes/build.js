#!/usr/bin/env node
'use strict';
/**
 * build.js — bundle core + hermes-entry and compile to Hermes bytecode.
 *
 *   node tools/hermes/build.js [--config <path>] [--out <dir>] [--json] [--check-only]
 *
 * Steps:
 *   1. Read hermes.config.json (drives entry/coreDir/out paths + compat/hermes).
 *   2. Concatenate core/*.js + entry into dist/game.bundle.js with a header
 *      (no bundler dependency; Hermes has no require, so concat is the bundle).
 *   3. If --check-only: stop after bundling.
 *   4. Locate a hermes binary (config.hermes.binary, config.hermes.compiler,
 *      $HERMES_BIN, PATH `hermes`/`hermesc`). If found, run:
 *        <bin> -emit-binary -O -out dist/game.hbc dist/game.bundle.js
 *      else write dist/game.hbc.json fallback manifest (+ keep the bundle),
 *      exit 4 with code FALLBACK_NO_BINARY.
 *
 * Exit codes: 0 ok, 2 config error, 3 compile error, 4 fallback used.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

function parseArgs(argv) {
  const out = { config: 'hermes.config.json', out: null, json: false, checkOnly: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--config') {
      out.config = argv[++i];
      if (!out.config) {
        throw new Error('missing value for --config');
      }
    } else if (a === '--out') {
      out.out = argv[++i];
      if (!out.out) {
        throw new Error('missing value for --out');
      }
    } else if (a === '--json') {
      out.json = true;
    } else if (a === '--check-only') {
      out.checkOnly = true;
    } else if (a === '--help' || a === '-h') {
      out.help = true;
    } else {
      throw new Error(`unknown flag: ${a}\nUsage: node tools/hermes/build.js [--config <path>] [--out <dir>] [--json] [--check-only]`);
    }
  }
  return out;
}

function failJson(json, code, exitCode, message, extra) {
  if (json) {
    console.log(JSON.stringify({ ok: false, code, message, ...extra }, null, 2));
  } else {
    console.error(`build: ${message}`);
  }
  process.exit(exitCode);
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

function findHermesBinary(hermesCfg) {
  const candidates = [];
  if (process.env.HERMES_BIN) {
    candidates.push(process.env.HERMES_BIN);
  }
  if (hermesCfg) {
    if (hermesCfg.binary) {
      candidates.push(hermesCfg.binary);
    }
    if (hermesCfg.compiler && hermesCfg.compiler !== hermesCfg.binary) {
      candidates.push(hermesCfg.compiler);
    }
  }
  candidates.push('hermes', 'hermesc');
  const seen = new Set();
  for (const c of candidates) {
    if (!c || seen.has(c)) {
      continue;
    }
    seen.add(c);
    if (path.isAbsolute(c) || c.includes(path.sep)) {
      if (fs.existsSync(c)) {
        return c;
      }
      continue;
    }
    const found = which(c);
    if (found) {
      return found;
    }
  }
  return null;
}

function sha256File(p) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(p));
  return h.digest('hex');
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (e) {
    console.error(`build: ${e.message}`);
    process.exit(2);
  }
  if (args.help) {
    console.log('Usage: node tools/hermes/build.js [--config <path>] [--out <dir>] [--json] [--check-only]');
    process.exit(0);
  }

  let cfg;
  const configPath = path.resolve(args.config);
  try {
    cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    failJson(args.json, 'CONFIG_ERROR', 2, `cannot read/parse config ${args.config}: ${e.message}`);
    return;
  }
  if (!cfg.entry || !cfg.coreDir) {
    failJson(args.json, 'CONFIG_ERROR', 2, 'config must define entry and coreDir');
    return;
  }
  const repoRoot = path.dirname(configPath);
  const outDir = path.resolve(repoRoot, args.out || cfg.outDir || 'dist');
  const bundlePath = path.resolve(repoRoot, args.out ? path.join(args.out, 'game.bundle.js') : (cfg.bundle || 'dist/game.bundle.js'));
  const hbcPath = path.resolve(repoRoot, args.out ? path.join(args.out, 'game.hbc') : (cfg.bytecode || 'dist/game.hbc'));
  const manifestPath = path.resolve(repoRoot, args.out ? path.join(args.out, 'game.hbc.json') : (cfg.fallbackManifest || 'dist/game.hbc.json'));
  const coreDir = path.resolve(repoRoot, cfg.coreDir);
  const entryPath = path.resolve(repoRoot, cfg.entry);

  if (!fs.existsSync(coreDir) || !fs.statSync(coreDir).isDirectory()) {
    failJson(args.json, 'CONFIG_ERROR', 2, `coreDir not found: ${cfg.coreDir}`);
    return;
  }
  if (!fs.existsSync(entryPath)) {
    failJson(args.json, 'CONFIG_ERROR', 2, `entry not found: ${cfg.entry}`);
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });

  // Bundle: simple deterministic concat (sorted core files, then entry).
  let coreFiles;
  try {
    coreFiles = fs.readdirSync(coreDir).filter((f) => /\.js$/.test(f)).sort()
      .map((f) => path.join(coreDir, f));
  } catch (e) {
    failJson(args.json, 'CONFIG_ERROR', 2, `cannot list coreDir: ${e.message}`);
    return;
  }
  const parts = [];
  parts.push(`// PlayGround Hermes bundle — generated by tools/hermes/build.js; do not edit.`);
  parts.push(`// engine: ${cfg.engineVersion || 'unknown'} | bytecodeTarget: ${cfg.bytecodeTarget || 'unknown'} | sources: ${coreFiles.length + 1}`);
  coreFiles.forEach((f, i) => {
    parts.push(`\n// ---- source[${i}]: ${path.relative(repoRoot, f)} ----`);
    parts.push(fs.readFileSync(f, 'utf8'));
  });
  parts.push(`\n// ---- entry: ${path.relative(repoRoot, entryPath)} ----`);
  parts.push(fs.readFileSync(entryPath, 'utf8'));
  parts.push('\n');
  fs.writeFileSync(bundlePath, parts.join('\n'), 'utf8');
  const bundleHash = sha256File(bundlePath);
  const bundleSize = fs.statSync(bundlePath).size;

  if (args.checkOnly) {
    const msg = `bundle written: ${path.relative(repoRoot, bundlePath)} (${bundleSize} bytes)`;
    if (args.json) {
      console.log(JSON.stringify({
        ok: true, code: 'CHECK_ONLY', bundle: path.relative(repoRoot, bundlePath),
        sha256: bundleHash, bytes: bundleSize
      }, null, 2));
    } else {
      console.log(`build: ${msg}`);
    }
    process.exit(0);
  }

  const bin = findHermesBinary(cfg.hermes);
  if (!bin) {
    if (cfg.hermes && cfg.hermes.allowFallback === false) {
      failJson(args.json, 'COMPILE_ERROR', 3, 'no hermes binary found and allowFallback=false. Install Hermes (https://github.com/facebook/hermes/blob/main/doc/BuildingAndRunning.md) or set hermes.allowFallback=true.');
      return;
    }
    const manifest = {
      fallback: true,
      code: 'FALLBACK_NO_BINARY',
      engineVersion: cfg.engineVersion || 'unknown',
      bytecodeTarget: cfg.bytecodeTarget || null,
      bundle: path.relative(repoRoot, bundlePath),
      sha256: bundleHash,
      bytes: bundleSize,
      hint: 'hermes/hermesc binary not found on PATH (tried $HERMES_BIN, config hermes.binary/compiler, PATH). Bundle is runnable via `npm run hermes:run -- --mode node`. To emit real bytecode, install Hermes and re-run `npm run hermes:build`.'
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    // Remove any stale real bytecode so fallback state is unambiguous:
    // verify.js prefers .hbc when present, so leaving it would mask the
    // bundle/bytecode desync with a green verify on a stale artifact.
    try {
      if (fs.existsSync(hbcPath)) {
        fs.unlinkSync(hbcPath);
      }
    } catch (e) { /* ignore */ }
    if (args.json) {
      console.log(JSON.stringify({ ok: true, fallback: true, ...manifest, manifest: path.relative(repoRoot, manifestPath) }, null, 2));
    } else {
      console.warn(`build: WARNING [FALLBACK_NO_BINARY] hermes binary not found — wrote fallback manifest ${path.relative(repoRoot, manifestPath)}; bundle remains runnable via node.`);
      console.warn('build: recovery: install Hermes (doc/BuildingAndRunning.md) or set HERMES_BIN, then re-run `npm run hermes:build`.');
    }
    process.exit(4);
  }

  // Compile with the real binary.
  const r = spawnSync(bin, ['-emit-binary', '-O', '-out', hbcPath, bundlePath], { encoding: 'utf8' });
  if (r.status !== 0) {
    const detail = (r.stderr || r.stdout || `exit ${r.status}`).trim().slice(0, 2000);
    // Remove any half-written output so verify.js reports missing, not corrupt.
    try {
      if (fs.existsSync(hbcPath)) {
        fs.unlinkSync(hbcPath);
      }
    } catch (e) { /* ignore */ }
    failJson(args.json, 'COMPILE_ERROR', 3, `hermes compile failed (${bin}): ${detail}\nRecovery: run \`npm run hermes:compat\` to isolate DOM/Node APIs; ensure entry is Hermes-safe ES.`);
    return;
  }
  let hbcHash = null;
  let hbcSize = 0;
  try {
    hbcHash = sha256File(hbcPath);
    hbcSize = fs.statSync(hbcPath).size;
  } catch (e) {
    failJson(args.json, 'COMPILE_ERROR', 3, `hermes reported success but output missing: ${e.message}`);
    return;
  }
  if (args.json) {
    console.log(JSON.stringify({
      ok: true, code: 'OK', binary: bin,
      bundle: path.relative(repoRoot, bundlePath),
      bytecode: path.relative(repoRoot, hbcPath),
      sha256: hbcHash, bytes: hbcSize, bundleSha256: bundleHash
    }, null, 2));
  } else {
    console.log(`build: OK via ${bin} — ${path.relative(repoRoot, hbcPath)} (${hbcSize} bytes, sha256 ${hbcHash.slice(0, 12)}…)`);
  }
  process.exit(0);
}

main();
