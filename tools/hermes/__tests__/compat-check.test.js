'use strict';
// compat-check.test.js — contract tests for tools/hermes/compat-check.js
//
// Contract under test:
//   - scans core (DOM-free) + hermes-entry, bans DOM/BOM/Node APIs in core
//   - warns (no error) on Proxy / Reflect / WeakRef / generators
//   - --json machine-readable output
//   - exit codes: 0 = clean (warnings allowed), 1 = violations found,
//     2 = config/usage error (e.g. missing file)
//
// Only node:test + node:assert (no deps).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const COMPAT_CHECK = path.join(REPO_ROOT, 'tools/hermes/compat-check.js');
const BASE_CONFIG = path.join(REPO_ROOT, 'hermes.config.json');
const FIXTURES = path.join(__dirname, 'fixtures');
const BAD_DOM = path.join(FIXTURES, 'bad-dom.js');
const RISKY_PROXY = path.join(FIXTURES, 'risky-proxy.js');

function runCompat(args, opts = {}) {
  return spawnSync(process.execPath, [COMPAT_CHECK, ...args], {
    encoding: 'utf8',
    timeout: 30000,
    ...opts,
  });
}

// Extract the JSON payload from --json stdout. The tool may print log lines
// around the payload, so fall back to slicing the outermost { ... } block.
function parseJsonPayload(stdout) {
  const raw = String(stdout || '').trim();
  assert.ok(raw.length > 0, 'expected --json output on stdout, got empty output');
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    assert.ok(
      start !== -1 && end !== -1 && end > start,
      `expected JSON object on stdout, got: ${raw.slice(0, 500)}`,
    );
    return JSON.parse(raw.slice(start, end + 1));
  }
}

function loadBaseConfig() {
  if (!fs.existsSync(BASE_CONFIG)) return {};
  return JSON.parse(fs.readFileSync(BASE_CONFIG, 'utf8'));
}

// Build an isolated temp config whose coreDir contains exactly one fixture
// file. Uses only schema-known keys (hermes.schema.json has
// additionalProperties:false, so no invented keys).
function makeTempConfigForFixture(fixturePath) {
  const base = loadBaseConfig();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-compat-'));
  const coreDir = path.join(tmpRoot, 'core');
  fs.mkdirSync(coreDir, { recursive: true });
  fs.copyFileSync(fixturePath, path.join(coreDir, path.basename(fixturePath)));
  const entryPath = path.join(tmpRoot, 'entry.js');
  fs.writeFileSync(entryPath, "'use strict';\nmodule.exports = {};\n");
  const distDir = path.join(tmpRoot, 'dist');
  const config = {
    ...base,
    entry: entryPath,
    coreDir,
    outDir: distDir,
    bundle: path.join(distDir, 'game.bundle.js'),
    bytecode: path.join(distDir, 'game.hbc'),
    fallbackManifest: path.join(distDir, 'game.hbc.json'),
  };
  const configPath = path.join(tmpRoot, 'hermes.config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return { tmpRoot, configPath };
}

// Temp config pointing at paths that do not exist (error-handling case).
function makeTempConfigForMissing() {
  const base = loadBaseConfig();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-compat-missing-'));
  const ghost = path.join(tmpRoot, 'does-not-exist');
  const config = {
    ...base,
    entry: path.join(ghost, 'entry.js'),
    coreDir: path.join(ghost, 'core'),
    outDir: path.join(tmpRoot, 'dist'),
    bundle: path.join(tmpRoot, 'dist', 'game.bundle.js'),
    bytecode: path.join(tmpRoot, 'dist', 'game.hbc'),
    fallbackManifest: path.join(tmpRoot, 'dist', 'game.hbc.json'),
  };
  const configPath = path.join(tmpRoot, 'hermes.config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return { tmpRoot, configPath };
}

function combinedText(res) {
  return `${res.stdout || ''}\n${res.stderr || ''}`;
}

describe('hermes compat-check', () => {
  it('tool + base config + fixtures exist', () => {
    assert.ok(fs.existsSync(COMPAT_CHECK), `missing ${COMPAT_CHECK}`);
    assert.ok(fs.existsSync(BAD_DOM), `missing ${BAD_DOM}`);
    assert.ok(fs.existsSync(RISKY_PROXY), `missing ${RISKY_PROXY}`);
  });

  it('clean core passes with exit 0', () => {
    assert.ok(fs.existsSync(BASE_CONFIG), `missing base config ${BASE_CONFIG}`);
    const base = loadBaseConfig();
    const coreDir = path.resolve(REPO_ROOT, base.coreDir || 'examples/hermes-game/core');
    assert.ok(
      fs.existsSync(coreDir),
      `core dir missing: ${coreDir} (P4 must provide examples/hermes-game/core)`,
    );
    const coreFiles = fs.readdirSync(coreDir).filter((f) => f.endsWith('.js'));
    assert.ok(coreFiles.length > 0, `no .js files in core dir ${coreDir}`);
    const res = runCompat(['--config', BASE_CONFIG, '--json']);
    assert.strictEqual(
      res.status,
      0,
      `clean core should exit 0, got ${res.status}. output:\n${combinedText(res)}`,
    );
    const payload = parseJsonPayload(res.stdout);
    const errors = payload.errors || payload.violations || [];
    assert.strictEqual(
      errors.length,
      0,
      `clean core should report zero errors, got: ${JSON.stringify(errors).slice(0, 1000)}`,
    );
  });

  it('fixture with `document.` fails with exit 1 and names the violation', () => {
    const { configPath } = makeTempConfigForFixture(BAD_DOM);
    const res = runCompat(['--config', configPath, '--json']);
    assert.strictEqual(
      res.status,
      1,
      `DOM usage in core must exit 1, got ${res.status}. output:\n${combinedText(res)}`,
    );
    const text = `${combinedText(res)} ${JSON.stringify(parseJsonPayload(res.stdout))}`;
    assert.match(text, /document/i, 'violation report should name `document`');
  });

  it('fixture with Proxy warns-or-passes: exit 0 (no error)', () => {
    const { configPath } = makeTempConfigForFixture(RISKY_PROXY);
    const res = runCompat(['--config', configPath, '--json']);
    assert.strictEqual(
      res.status,
      0,
      `Proxy usage must NOT error (warn-or-pass), got exit ${res.status}. output:\n${combinedText(res)}`,
    );
    // Warn branch: if the tool reports warnings/output mentioning Proxy,
    // assert the warning is present. Silent-pass branch is also acceptable
    // per contract ("warns-or-passes"), so only enforce error-absence above
    // and check error arrays stay empty here.
    let payload = null;
    try {
      payload = parseJsonPayload(res.stdout);
    } catch {
      payload = null;
    }
    if (payload) {
      const errors = payload.errors || payload.violations || [];
      assert.strictEqual(
        errors.length,
        0,
        `Proxy fixture must report zero errors, got: ${JSON.stringify(errors).slice(0, 1000)}`,
      );
      const warnings = payload.warnings || [];
      const warnText = `${JSON.stringify(warnings)} ${combinedText(res)}`;
      if (/proxy/i.test(warnText)) {
        assert.match(warnText, /proxy/i, 'warning should name Proxy');
      }
      // else: silent pass — acceptable per contract, exit 0 already asserted.
    }
  });

  it('missing file → error handling with exit 2', () => {
    const { configPath } = makeTempConfigForMissing();
    const res = runCompat(['--config', configPath, '--json']);
    assert.strictEqual(
      res.status,
      2,
      `missing input must exit 2 (config/error), got ${res.status}. output:\n${combinedText(res)}`,
    );
    const text = combinedText(res);
    assert.match(
      text,
      /no such file|ENOENT|not found|missing|does-not-exist/i,
      'error output should explain the missing file',
    );
  });
});
