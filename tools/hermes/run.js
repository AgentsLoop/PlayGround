#!/usr/bin/env node
'use strict';
/**
 * run.js — execute the bundled game deterministically.
 *
 *   node tools/hermes/run.js [--config <path>] [--mode hermes|node]
 *                            [--ticks N] [--seed S] [--json]
 *
 * Behavior:
 *   --mode hermes: use the hermes binary on dist/game.hbc (preferred) or the
 *     bundle if no .hbc exists. Fails with exit 3 when no binary is present
 *     (hint suggests --mode node).
 *   --mode node (default when no binary is found): load dist/game.bundle.js
 *     in a `vm` sandbox with a `print` shim, pre-seeding
 *     globalThis.__HERMES_TICKS__/__HERMES_SEED__ so entry output matches
 *     the Hermes run exactly (HERMES_TICK lines + HERMES_DONE).
 *
 * Exit: 0 ok, 2 config/file error, 3 hermes execution error.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

function parseArgs(argv) {
  const out = { config: 'hermes.config.json', mode: null, ticks: null, seed: null, json: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--config') {
      out.config = argv[++i];
      if (!out.config) {
        throw new Error('missing value for --config');
      }
    } else if (a === '--mode') {
      out.mode = argv[++i];
      if (out.mode !== 'hermes' && out.mode !== 'node') {
        throw new Error('--mode must be hermes|node');
      }
    } else if (a === '--ticks') {
      out.ticks = Number(argv[++i]);
      if (!Number.isInteger(out.ticks) || out.ticks < 0 || out.ticks > 100000) {
        throw new Error('--ticks must be an integer 0..100000');
      }
    } else if (a === '--seed') {
      out.seed = Number(argv[++i]);
      if (!Number.isInteger(out.seed) || out.seed < 0 || out.seed > 0xFFFFFFFF) {
        throw new Error('--seed must be an integer 0..4294967295');
      }
    } else if (a === '--json') {
      out.json = true;
    } else if (a === '--help' || a === '-h') {
      out.help = true;
    } else {
      throw new Error(`unknown flag: ${a}\nUsage: node tools/hermes/run.js [--config <p>] [--mode hermes|node] [--ticks N] [--seed S] [--json]`);
    }
  }
  return out;
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
  const cands = [];
  if (process.env.HERMES_BIN) {
    cands.push(process.env.HERMES_BIN);
  }
  if (hermesCfg && hermesCfg.binary) {
    cands.push(hermesCfg.binary);
  }
  cands.push('hermes');
  const seen = new Set();
  for (const c of cands) {
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
    const f = which(c);
    if (f) {
      return f;
    }
  }
  return null;
}

function parseTickLines(output) {
  const ticks = [];
  let done = null;
  for (const line of output.split('\n')) {
    if (line.startsWith('HERMES_TICK ')) {
      const sp = line.indexOf(' ', 12);
      const n = Number(line.slice(12, sp === -1 ? undefined : sp));
      let state = null;
      try {
        state = JSON.parse(sp === -1 ? '{}' : line.slice(sp + 1));
      } catch (e) { /* keep null */ }
      ticks.push({ tick: n, state });
    } else if (line.startsWith('HERMES_DONE ')) {
      try {
        done = JSON.parse(line.slice('HERMES_DONE '.length));
      } catch (e) {
        done = { raw: line };
      }
    }
  }
  return { ticks, done };
}

function runNode(bundlePath, ticks, seed) {
  const src = fs.readFileSync(bundlePath, 'utf8');
  const lines = [];
  const sandbox = {
    console,
    __HERMES_TICKS__: ticks,
    __HERMES_SEED__: seed,
  };
  sandbox.globalThis = sandbox;
  sandbox.print = (s) => {
    lines.push(String(s));
  };
  const ctx = vm.createContext(sandbox);
  // Prefix globals before the bundle so the entry picks them up.
  const wrapped = `globalThis.__HERMES_TICKS__ = ${JSON.stringify(ticks)};\n` +
    `globalThis.__HERMES_SEED__ = ${JSON.stringify(seed)};\n` + src;
  vm.runInContext(wrapped, ctx, { filename: path.basename(bundlePath), timeout: 30000 });
  return lines.join('\n') + '\n';
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (e) {
    console.error(`run: ${e.message}`);
    process.exit(2);
  }
  if (args.help) {
    console.log('Usage: node tools/hermes/run.js [--config <p>] [--mode hermes|node] [--ticks N] [--seed S] [--json]');
    process.exit(0);
  }
  const configPath = path.resolve(args.config);
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    console.error(`run: cannot read/parse config ${args.config}: ${e.message}`);
    process.exit(2);
  }
  const repoRoot = path.dirname(configPath);
  const bundlePath = path.resolve(repoRoot, cfg.bundle || 'dist/game.bundle.js');
  const hbcPath = path.resolve(repoRoot, cfg.bytecode || 'dist/game.hbc');
  const ticks = args.ticks !== null && args.ticks !== undefined ? args.ticks : 10;
  const seed = args.seed !== null && args.seed !== undefined ? args.seed : 42;

  if (!fs.existsSync(bundlePath) && !fs.existsSync(hbcPath)) {
    console.error(`run: nothing to run — neither bundle nor bytecode exists. Recovery: run \`npm run hermes:build\` first.`);
    process.exit(2);
  }

  const bin = findHermesBinary(cfg.hermes);
  let mode = args.mode;
  if (!mode) {
    mode = bin ? 'hermes' : 'node';
  }
  if (mode === 'hermes' && !bin) {
    console.error('run: --mode hermes requested but no hermes binary found on PATH/$HERMES_BIN. Recovery: install Hermes or re-run with --mode node.');
    process.exit(3);
  }

  let output = '';
  let used = '';
  try {
    if (mode === 'hermes') {
      const target = fs.existsSync(hbcPath) ? hbcPath : bundlePath;
      used = `${bin} ${path.relative(repoRoot, target)}`;
      // Inject tick/seed overrides via a temp wrapper when non-default.
      let targetPath = target;
      let tmp = null;
      if (args.ticks !== null || args.seed !== null) {
        const base = target === hbcPath
          ? bundlePath // cannot wrap bytecode; fall back to bundle source
          : target;
        if (!fs.existsSync(base)) {
          console.error('run: --ticks/--seed override needs the JS bundle, but only game.hbc exists. Re-run build to regenerate it.');
          process.exit(2);
        }
        tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-run-')), 'run.bundle.js');
        const prefix = `var __HERMES_TICKS__=${ticks};globalThis.__HERMES_TICKS__=${ticks};` +
          `var __HERMES_SEED__=${seed};globalThis.__HERMES_SEED__=${seed};\n`;
        fs.writeFileSync(tmp, prefix + fs.readFileSync(base, 'utf8'));
        targetPath = tmp;
        used += ` (ticks=${ticks} seed=${seed})`;
      }
      const r = spawnSync(bin, [targetPath], { encoding: 'utf8', timeout: 60000 });
      if (tmp) {
        try {
          fs.unlinkSync(tmp);
        } catch (e) { /* ignore */ }
      }
      if (r.status !== 0) {
        console.error(`run: hermes execution failed: ${(r.stderr || r.stdout || `exit ${r.status}`).trim().slice(0, 2000)}`);
        process.exit(3);
      }
      output = r.stdout || '';
    } else {
      if (!fs.existsSync(bundlePath)) {
        console.error('run: --mode node needs the JS bundle but only game.hbc exists. Recovery: re-run `npm run hermes:build` to regenerate dist/game.bundle.js.');
        process.exit(2);
      }
      used = `node ${path.relative(repoRoot, bundlePath)}`;
      output = runNode(bundlePath, ticks, seed);
    }
  } catch (e) {
    console.error(`run: execution error: ${e.message}`);
    process.exit(3);
  }

  const { ticks: parsed, done } = parseTickLines(output);
  if (args.json) {
    console.log(JSON.stringify({
      ok: true, mode, used, ticksRequested: ticks, seed, lines: parsed, done
    }, null, 2));
  } else {
    process.stdout.write(output);
  }
  process.exit(0);
}

main();
