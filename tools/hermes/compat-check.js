#!/usr/bin/env node
'use strict';
/**
 * compat-check.js — static Hermes-safety scanner for core + hermes-entry.
 *
 *   node tools/hermes/compat-check.js [--config <path>] [--json]
 *
 * Rules:
 *   core (strict): forbid DOM/BOM globals, Node-isms, dynamic import → errors.
 *   risky ES (Proxy/Reflect/WeakRef/FinalizationRegistry/Atomics/
 *     SharedArrayBuffer, generators) → warnings (not errors), everywhere.
 *   browser.js is never scanned (DOM adapter, excluded from HBC by design).
 *
 * Exit: 0 clean (warnings allowed), 1 violations, 2 config/file error.
 */
const fs = require('fs');
const path = require('path');

const DOM_GLOBALS = [
  'document', 'window', 'navigator', 'location', 'localStorage',
  'sessionStorage', 'alert', 'canvas', 'WebGL', 'XMLHttpRequest',
  'fetch', 'indexedDB', 'Worker', 'DOMParser', 'HTMLElement'
];
const NODE_STRICT_RES = [
  { re: /\brequire\s*\(/, name: 'require(' },
  { re: /\bprocess\s*\./, name: 'process.' },
  { re: /\b__dirname\b/, name: '__dirname' },
  { re: /\b__filename\b/, name: '__filename' },
  { re: /\bmodule\s*\.\s*exports\b/, name: 'module.exports (UMD shim only)' },
  { re: /\bimport\s*\(/, name: 'dynamic import(' }
];
// module.exports needs a carve-out: game.js uses a guarded UMD export which
// is Hermes-safe once concatenated (guarded by typeof checks). We still flag
// bare `require(` etc. For module.exports we only error when it is NOT part
// of the known UMD guard pattern.
const RISKY_RES = [
  { re: /\bProxy\b/, name: 'Proxy' },
  { re: /\bReflect\b/, name: 'Reflect' },
  { re: /\bWeakRef\b/, name: 'WeakRef' },
  { re: /\bFinalizationRegistry\b/, name: 'FinalizationRegistry' },
  { re: /\bAtomics\b/, name: 'Atomics' },
  { re: /\bSharedArrayBuffer\b/, name: 'SharedArrayBuffer' },
  { re: /\bfunction\s*\*/, name: 'generator function*' },
  { re: /\byield\b/, name: 'yield' }
];
const BANNED_IN_SIM = [
  { re: /\bMath\s*\.\s*random\b/, name: 'Math.random (non-deterministic)' },
  { re: /\bDate\s*\.\s*(now|parse)\b/, name: 'Date.now/parse (non-deterministic)' },
  { re: /\bnew\s+Date\s*\(/, name: 'new Date() (non-deterministic)' }
];

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
      throw new Error(`unknown flag: ${a}\nUsage: node tools/hermes/compat-check.js [--config <path>] [--json]`);
    }
  }
  return out;
}

/** Strip block/line comments + string/template literals to cut false positives. */
function stripNoise(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let q = null; // quote char or ` template
  while (i < n) {
    const c = src[i];
    const nx = src[i + 1];
    if (q) {
      if (c === '\\') {
        out += '  ';
        i += 2;
        continue;
      }
      if (c === q) {
        q = null;
      }
      out += q === null && c === q ? c : ' ';
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      q = c;
      out += ' ';
      i++;
      continue;
    }
    if (c === '/' && nx === '/') {
      while (i < n && src[i] !== '\n') {
        out += ' ';
        i++;
      }
      continue;
    }
    if (c === '/' && nx === '*') {
      out += '  ';
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      out += '  ';
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function findLine(src, index) {
  return src.slice(0, index).split('\n').length;
}

function collectFiles(coreDir, entry) {
  const files = [];
  if (!fs.existsSync(coreDir) || !fs.statSync(coreDir).isDirectory()) {
    throw new Error(`coreDir not found: ${coreDir}`);
  }
  for (const f of fs.readdirSync(coreDir).sort()) {
    const p = path.join(coreDir, f);
    if (fs.statSync(p).isFile() && /\.js$/.test(f)) {
      files.push({ file: p, kind: 'core' });
    }
  }
  if (!fs.existsSync(entry) || !fs.statSync(entry).isFile()) {
    throw new Error(`entry not found: ${entry}`);
  }
  files.push({ file: entry, kind: 'entry' });
  return files;
}

function scanFile(rel, kind, raw, compat) {
  const errors = [];
  const warnings = [];
  const clean = stripNoise(raw);
  const strict = compat.level === 'strict';

  if (compat.forbidDomInCore && kind === 'core') {
    for (const name of DOM_GLOBALS) {
      const re = new RegExp(`\\b${name}\\b`, 'g');
      let m;
      while ((m = re.exec(clean)) !== null) {
        // `fetch`/`Worker` etc. could appear as property names; still flag in
        // core — conservative by design. Report first occurrence per name only.
        errors.push({
          file: rel, line: findLine(clean, m.index),
          rule: 'no-dom-in-core', symbol: name,
          message: `'${name}' is a DOM/BOM API and is forbidden in core/ (move it to browser.js)`
        });
        break;
      }
    }
    for (const b of BANNED_IN_SIM) {
      const re = new RegExp(b.re.source, 'g');
      let m;
      while ((m = re.exec(clean)) !== null) {
        errors.push({
          file: rel, line: findLine(clean, m.index),
          rule: 'no-nondeterminism', symbol: b.name,
          message: `'${b.name}' breaks determinism; derive randomness from the seeded PRNG`
        });
        break;
      }
    }
  }

  if (strict && kind === 'core') {
    for (const r of NODE_STRICT_RES) {
      if (r.name.startsWith('module.exports')) {
        // Allow the single guarded UMD pattern used by core/game.js.
        const stripped = clean.replace(/typeof\s+module\s*!==\s*['"]undefined['"]/g, '');
        const re = new RegExp(r.re.source, 'g');
        if (re.test(stripped)) {
          // Check whether the remaining occurrence is the guarded UMD export.
          if (!/typeof\s+module/.test(clean)) {
            errors.push({
              file: rel, line: 1, rule: 'no-node-in-core',
              symbol: 'module.exports',
              message: `'module.exports' outside a typeof-guarded UMD shim is forbidden in strict core`
            });
          }
        }
        continue;
      }
      const re = new RegExp(r.re.source, 'g');
      const m = re.exec(clean);
      if (m) {
        // `require` gets a carve-out in hermes-entry (Node fallback loader);
        // core files must not use it at all.
        errors.push({
          file: rel, line: findLine(clean, m.index), rule: 'no-node-in-core',
          symbol: r.name,
          message: `'${r.name}' is a Node/dynamic-module API forbidden in strict core`
        });
      }
    }
    // Entry may use `require` only via the guarded loader; flag unguarded use.
    if (kind === 'entry' && /\brequire\s*\(/.test(clean) && !/typeof\s+require/.test(clean)) {
      errors.push({
        file: rel, line: 1, rule: 'no-node-in-core', symbol: 'require(',
        message: `'require(' in entry must be guarded by typeof require === 'function'`
      });
    }
  }

  for (const r of RISKY_RES) {
    const re = new RegExp(r.re.source, 'g');
    const m = re.exec(clean);
    if (m) {
      warnings.push({
        file: rel, line: findLine(clean, m.index), rule: 'risky-es',
        symbol: r.name,
        message: `'${r.name}' may be unsupported or slow on Hermes; avoid in hot paths`
      });
    }
  }
  return { errors, warnings };
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (e) {
    console.error(`compat-check: ${e.message}`);
    process.exit(2);
  }
  if (args.help) {
    console.log('Usage: node tools/hermes/compat-check.js [--config <path>] [--json]');
    process.exit(0);
  }
  let cfg;
  try {
    const raw = fs.readFileSync(args.config, 'utf8');
    cfg = JSON.parse(raw);
  } catch (e) {
    console.error(`compat-check: cannot read/parse config ${args.config}: ${e.message}`);
    process.exit(2);
  }
  const compat = cfg.compat || { level: 'strict', forbidDomInCore: true };
  const repoRoot = path.dirname(path.resolve(args.config));
  const coreDir = path.resolve(repoRoot, cfg.coreDir || 'examples/hermes-game/core');
  const entry = path.resolve(repoRoot, cfg.entry || 'examples/hermes-game/hermes-entry.js');

  let targets;
  try {
    targets = collectFiles(coreDir, entry);
  } catch (e) {
    if (args.json) {
      console.log(JSON.stringify({ ok: false, errors: [{ message: e.message }], warnings: [], files: [] }));
    } else {
      console.error(`compat-check: ${e.message}`);
    }
    process.exit(2);
  }

  const errors = [];
  const warnings = [];
  const files = [];
  for (const t of targets) {
    let raw;
    try {
      raw = fs.readFileSync(t.file, 'utf8');
    } catch (e) {
      errors.push({ file: t.file, line: 1, rule: 'io', symbol: '', message: `cannot read file: ${e.message}` });
      continue;
    }
    files.push(path.relative(repoRoot, t.file));
    const r = scanFile(path.relative(repoRoot, t.file), t.kind, raw, compat);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  }

  const ok = errors.length === 0;
  if (args.json) {
    console.log(JSON.stringify({ ok, errors, warnings, files }, null, 2));
  } else if (ok) {
    console.log(`compat-check: OK — ${files.length} file(s) clean` + (warnings.length ? ` (${warnings.length} warning(s))` : ''));
    for (const w of warnings) {
      console.log(`  warning ${w.file}:${w.line}: ${w.message}`);
    }
  } else {
    console.error(`compat-check: FAIL — ${errors.length} error(s), ${warnings.length} warning(s) in ${files.length} file(s)`);
    for (const e of errors) {
      console.error(`  error ${e.file}:${e.line}: ${e.message}`);
    }
    for (const w of warnings) {
      console.error(`  warning ${w.file}:${w.line}: ${w.message}`);
    }
    console.error('Recovery: move DOM/Node usage out of core/ into browser.js; keep sim on seeded PRNG.');
  }
  process.exit(ok ? 0 : 1);
}

main();
