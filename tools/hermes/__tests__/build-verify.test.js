'use strict';
// build-verify.test.js — contract tests for tools/hermes/build.js +
// tools/hermes/verify.js
//
// Contract under test:
//   build.js: --config --out --json --check-only; exit 0 ok, 2 config error,
//     3 compile error, 4 fallback (no hermes binary, manifest written).
//     Writes <out>/game.bundle.js (or configured bundle path) +
//     (<out>/game.hbc via hermes binary OR <out>/game.hbc.json fallback).
//   verify.js: inspects dist/game.hbc header (magic/version/sha256/size) or
//     fallback manifest; --json; exit 0 ok / 3 invalid.
//
// Accepts exit 0 (real HBC) or 4 (fallback) from build; verify must exit 0
// after a successful build. Only node:test + node:assert (no deps).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const BUILD_JS = path.join(REPO_ROOT, 'tools/hermes/build.js');
const VERIFY_JS = path.join(REPO_ROOT, 'tools/hermes/verify.js');
const CONFIG = path.join(REPO_ROOT, 'hermes.config.json');

const BUILD_TIMEOUT_MS = 120000;

function loadConfig() {
  assert.ok(fs.existsSync(CONFIG), `missing config ${CONFIG}`);
  return JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
}

function resolveFromRoot(p, fallback) {
  if (!p) return path.join(REPO_ROOT, fallback);
  return path.isAbsolute(p) ? p : path.join(REPO_ROOT, p);
}

function runTool(tool, args) {
  return spawnSync(process.execPath, [tool, ...args], {
    encoding: 'utf8',
    timeout: BUILD_TIMEOUT_MS,
  });
}

function combinedText(res) {
  return `${res.stdout || ''}\n${res.stderr || ''}`;
}

function tryParseJson(stdout) {
  const raw = String(stdout || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function sha256FileHex(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function looksLikeUsageError(res) {
  return res.status === 2 && /usage|unknown option|unknown argument/i.test(combinedText(res));
}

// Run build with the documented CLI first (--config --out --json),
// falling back to config-default out-dir if the runner rejects --out.
function runBuild(outDir) {
  const primary = runTool(BUILD_JS, ['--config', CONFIG, '--out', outDir, '--json']);
  if (!looksLikeUsageError(primary)) return { res: primary, argv: ['--config', CONFIG, '--out', outDir, '--json'] };
  const fallback = runTool(BUILD_JS, ['--config', CONFIG, '--json']);
  return { res: fallback, argv: ['--config', CONFIG, '--json'] };
}

// Run verify with the documented CLI first (--config --json).
function runVerify(outDir) {
  const variants = [
    ['--config', CONFIG, '--json'],
    ['--config', CONFIG, '--out', outDir, '--json'],
    ['--json'],
  ];
  let last = null;
  let lastArgv = null;
  for (const argv of variants) {
    const res = runTool(VERIFY_JS, argv);
    last = res;
    lastArgv = argv;
    if (!looksLikeUsageError(res)) return { res, argv };
  }
  return { res: last, argv: lastArgv };
}

describe('hermes build + verify', () => {
  it('tools exist', () => {
    assert.ok(fs.existsSync(BUILD_JS), `missing ${BUILD_JS}`);
    assert.ok(fs.existsSync(VERIFY_JS), `missing ${VERIFY_JS}`);
  });

  it('build succeeds (exit 0 real HBC or 4 fallback), bundle has HERMES marker', () => {
    const cfg = loadConfig();
    const outDir = resolveFromRoot(cfg.outDir, 'dist');
    const bundlePath = resolveFromRoot(cfg.bundle, 'dist/game.bundle.js');
    const { res, argv } = runBuild(outDir);
    assert.ok(
      res.status === 0 || res.status === 4,
      `build ${argv.join(' ')} must exit 0 (ok) or 4 (fallback), got ${
        res.status
      }. output:\n${combinedText(res)}`,
    );
    assert.ok(
      fs.existsSync(bundlePath),
      `build must write bundle at ${bundlePath}. output:\n${combinedText(res)}`,
    );
    const stat = fs.statSync(bundlePath);
    assert.ok(stat.size > 0, 'bundle must be non-empty');
    const content = fs.readFileSync(bundlePath, 'utf8');
    assert.match(content, /hermes/i, 'bundle must contain the HERMES marker (hermes-entry banner)');
  });

  it('build artifact set: real .hbc on exit 0, fallback manifest on exit 4', () => {
    const cfg = loadConfig();
    const outDir = resolveFromRoot(cfg.outDir, 'dist');
    const hbcPath = resolveFromRoot(cfg.bytecode, 'dist/game.hbc');
    const manifestPath = resolveFromRoot(cfg.fallbackManifest, 'dist/game.hbc.json');
    const { res } = runBuild(outDir);
    if (res.status === 0) {
      assert.ok(fs.existsSync(hbcPath), `exit 0 must produce real bytecode at ${hbcPath}`);
    } else {
      assert.strictEqual(res.status, 4, `expected exit 4 for fallback, got ${res.status}`);
      assert.ok(
        fs.existsSync(manifestPath),
        `exit 4 must write fallback manifest at ${manifestPath}. output:\n${combinedText(res)}`,
      );
      assert.ok(
        !fs.existsSync(hbcPath),
        `exit 4 (fallback) must remove any stale real bytecode at ${hbcPath} so verify cannot pass on a desynced artifact`,
      );
    }
  });

  it('fallback manifest hash matches the bundle (when fallback)', () => {
    const cfg = loadConfig();
    const outDir = resolveFromRoot(cfg.outDir, 'dist');
    const bundlePath = resolveFromRoot(cfg.bundle, 'dist/game.bundle.js');
    const manifestPath = resolveFromRoot(cfg.fallbackManifest, 'dist/game.hbc.json');
    const { res } = runBuild(outDir);
    if (!fs.existsSync(manifestPath)) {
      // Real-HBC environment: nothing to compare; build already asserted above.
      assert.strictEqual(res.status, 0, 'without a fallback manifest, build must exit 0');
      return;
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const manifestHash = manifest.sha256 || manifest.hash || manifest.bundleSha256 || manifest.bundleHash;
    assert.ok(manifestHash, `fallback manifest must carry a sha256/hash field: ${JSON.stringify(manifest).slice(0, 500)}`);
    const actual = sha256FileHex(bundlePath);
    assert.strictEqual(
      String(manifestHash).toLowerCase(),
      actual.toLowerCase(),
      'fallback manifest hash must equal sha256(bundle)',
    );
    const bundleSize = fs.statSync(bundlePath).size;
    const manifestSize = manifest.size || manifest.bundleSize || manifest.bundleBytes;
    if (manifestSize !== undefined) {
      assert.strictEqual(
        Number(manifestSize),
        bundleSize,
        'fallback manifest size must equal bundle byte length',
      );
    }
  });

  it('verify exits 0 and reports header/manifest as JSON after build', () => {
    const cfg = loadConfig();
    const outDir = resolveFromRoot(cfg.outDir, 'dist');
    runBuild(outDir); // ensure fresh artifacts
    const { res, argv } = runVerify(outDir);
    assert.strictEqual(
      res.status,
      0,
      `verify ${argv.join(' ')} must exit 0 after successful build, got ${
        res.status
      }. output:\n${combinedText(res)}`,
    );
    const payload = tryParseJson(res.stdout);
    assert.ok(payload, `verify --json must print a JSON payload. output:\n${combinedText(res)}`);
    const text = JSON.stringify(payload);
    assert.match(
      text,
      /magic|version|sha256|hash|size|fallback|bytecode|hbc/i,
      'verify JSON must describe the header or fallback manifest (magic/version/sha256/size)',
    );
  });

  it('build --check-only passes the compat gate (exit 0, JSON ok)', () => {
    const cfg = loadConfig();
    const outDir = resolveFromRoot(cfg.outDir, 'dist');
    const hbcPath = resolveFromRoot(cfg.bytecode, 'dist/game.hbc');
    const hbcBefore = fs.existsSync(hbcPath) ? sha256FileHex(hbcPath) : null;
    const res = runTool(BUILD_JS, ['--config', CONFIG, '--out', outDir, '--check-only', '--json']);
    const done = (r) => {
      assert.strictEqual(
        r.status,
        0,
        `build --check-only must exit 0 on clean tree, got ${r.status}. output:\n${combinedText(r)}`,
      );
      const payload = tryParseJson(r.stdout);
      assert.ok(payload, `build --check-only --json must print JSON. output:\n${combinedText(r)}`);
      assert.strictEqual(payload.ok, true, `--check-only payload must report ok:true: ${JSON.stringify(payload).slice(0, 500)}`);
      // --check-only is a gate: it must never (re)write compiled bytecode.
      if (hbcBefore !== null && fs.existsSync(hbcPath)) {
        assert.strictEqual(sha256FileHex(hbcPath), hbcBefore, '--check-only must not rewrite the .hbc artifact');
      }
    };
    if (looksLikeUsageError(res)) {
      done(runTool(BUILD_JS, ['--config', CONFIG, '--check-only', '--json']));
      return;
    }
    done(res);
  });
});
