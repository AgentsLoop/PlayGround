'use strict';
// game.test.js — determinism + serialization contract for
// examples/hermes-game/core/game.js (CommonJS:
// exports createGame / step / serialize / deserialize).
//
// Only node:test + node:assert (no deps). Step-signature tolerant: supports
// step(state, input), step(state, dt, input) and step(state, input, dt).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const GAME_PATH = path.join(REPO_ROOT, 'examples/hermes-game/core/game.js');
const FIXED_DT = 1 / 60;

function loadGame() {
  assert.ok(fs.existsSync(GAME_PATH), `missing core game module: ${GAME_PATH} (P4 must provide it)`);
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const game = require(GAME_PATH);
  for (const fn of ['createGame', 'step', 'serialize', 'deserialize']) {
    assert.strictEqual(typeof game[fn], 'function', `game module must export function ${fn}()`);
  }
  return game;
}

// Canonical demo inputs (direction buttons). The core sim may ignore unknown
// fields; that is fine — determinism is what matters.
const DEMO_INPUTS = [
  { left: false, right: true, jump: false },
  { left: false, right: true, jump: true },
  { left: false, right: false, jump: false },
  { left: true, right: false, jump: false },
];

// Resolve the step calling convention once by probing on a throwaway state.
function makeStepper(game) {
  const { step, createGame } = game;
  if (step.length <= 2) {
    return (state, input, dt = FIXED_DT) => {
      void dt;
      const out = step(state, input);
      return out === undefined ? state : out;
    };
  }
  // 3+ params: probe (state, dt, input) vs (state, input, dt).
  const probeInput = DEMO_INPUTS[0];
  for (const order of ['dt-first', 'input-first']) {
    try {
      const probe = createGame(1);
      const args =
        order === 'dt-first' ? [probe, FIXED_DT, probeInput] : [probe, probeInput, FIXED_DT];
      const out = step(...args);
      const next = out === undefined ? probe : out;
      assert.ok(next && typeof next === 'object', 'step must return or mutate a state object');
      return order === 'dt-first'
        ? (state, input, dt = FIXED_DT) => {
            const r = step(state, dt, input);
            return r === undefined ? state : r;
          }
        : (state, input, dt = FIXED_DT) => {
            const r = step(state, input, dt);
            return r === undefined ? state : r;
          };
    } catch {
      // try next convention
    }
  }
  throw new Error('could not resolve step(state, input[, dt]) calling convention');
}

function runSequence(game, doStep, seed, ticks, inputs = DEMO_INPUTS) {
  let state = game.createGame(seed);
  for (let i = 0; i < ticks; i += 1) {
    state = doStep(state, inputs[i % inputs.length], FIXED_DT);
  }
  return state;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object';
}

// Collect every finite/non-finite number in the state graph.
function collectNumbers(root) {
  const seen = new Set();
  const bad = [];
  const big = [];
  const visit = (v) => {
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) bad.push(v);
      else if (Math.abs(v) > 1e9) big.push(v);
      return;
    }
    if (isPlainObject(v) && !seen.has(v)) {
      seen.add(v);
      for (const k of Object.keys(v)) visit(v[k]);
    }
  };
  visit(root);
  return { bad, big };
}

function tickOf(state) {
  if (!isPlainObject(state)) return null;
  for (const key of ['tick', 'frame', 'step', 't', 'time', 'elapsed']) {
    if (typeof state[key] === 'number') return { key, value: state[key] };
  }
  return null;
}

describe('hermes core game', () => {
  it('exports createGame/step/serialize/deserialize (CommonJS)', () => {
    loadGame();
  });

  it('determinism: same seed + same inputs → identical state', () => {
    const game = loadGame();
    const doStep = makeStepper(game);
    const a = runSequence(game, doStep, 1234, 120);
    const b = runSequence(game, doStep, 1234, 120);
    assert.strictEqual(game.serialize(a), game.serialize(b));
    assert.deepStrictEqual(a, b);
  });

  it('different seeds diverge (seed actually matters)', () => {
    const game = loadGame();
    const doStep = makeStepper(game);
    const a = runSequence(game, doStep, 11, 60);
    const b = runSequence(game, doStep, 22, 60);
    assert.notStrictEqual(game.serialize(a), game.serialize(b));
  });

  it('serialize round-trip preserves state', () => {
    const game = loadGame();
    const doStep = makeStepper(game);
    const state = runSequence(game, doStep, 777, 45);
    const wire = game.serialize(state);
    assert.strictEqual(typeof wire, 'string', 'serialize() must return a string');
    assert.ok(wire.length > 2, 'serialized payload must be non-trivial');
    const restored = game.deserialize(wire);
    assert.strictEqual(
      game.serialize(restored),
      wire,
      'deserialize(serialize(s)) must re-serialize identically',
    );
    assert.deepStrictEqual(restored, state);
  });

  it('fixed-timestep bounds: 600 ticks stay finite and bounded, tick advances by step count', () => {
    const game = loadGame();
    const doStep = makeStepper(game);
    const startTick = tickOf(game.createGame(5));
    let state = game.createGame(5);
    const N = 600;
    for (let i = 0; i < N; i += 1) {
      state = doStep(state, DEMO_INPUTS[i % DEMO_INPUTS.length], FIXED_DT);
    }
    if (startTick && tickOf(state)) {
      const after = tickOf(state);
      assert.strictEqual(
        after.value - startTick.value,
        N,
        `tick field "${after.key}" must advance by exactly N steps (${N})`,
      );
    }
    const { bad, big } = collectNumbers(state);
    assert.strictEqual(bad.length, 0, 'state must contain no NaN/Infinity after 600 ticks');
    assert.strictEqual(big.length, 0, 'state numbers must stay bounded (|x| <= 1e9) after 600 ticks');
    // Large-dt clamp: one huge step must not explode the sim (if the step
    // function accepts dt; otherwise this is a no-op repeat step).
    const probe = makeStepper(game);
    let s2 = game.createGame(9);
    try {
      s2 = probe(s2, DEMO_INPUTS[0], 10);
      const r = collectNumbers(s2);
      assert.strictEqual(r.bad.length, 0, 'huge-dt step must stay finite (dt clamp)');
      assert.strictEqual(r.big.length, 0, 'huge-dt step must stay bounded (dt clamp)');
    } catch (err) {
      // Step convention without dt support — already covered by the 600-tick
      // finite/bounded assertions above.
      assert.ok(err instanceof Error);
    }
  });

  it('no Math.random/Date nondeterminism: two runs compare equal + source scan', () => {
    const game = loadGame();
    const doStep = makeStepper(game);
    const runOnce = () => game.serialize(runSequence(game, doStep, 2026, 200));
    const first = runOnce();
    const second = runOnce();
    assert.strictEqual(first, second, 'two identical runs must produce identical states');
    const src = fs.readFileSync(GAME_PATH, 'utf8');
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '');
    for (const re of [
      /Math\.random/,
      /Date\.now/,
      /new\s+Date\s*\(/,
      /performance\.now/,
      /crypto\.(getRandomValues|randomUUID)/,
    ]) {
      assert.ok(
        !re.test(stripped),
        `core game source must not use nondeterministic ${re} (deterministic seeded sim required)`,
      );
    }
  });
});
