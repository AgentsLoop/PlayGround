'use strict';
/**
 * Pure DOM-free game logic. Hermes-safe: ES5-ish + CommonJS, no DOM/BOM,
 * no Math.random, no Date in the simulation path.
 *
 * Fixed-timestep model: each `step(state, input)` advances exactly one tick.
 * Deterministic: all randomness derives from a mulberry32 PRNG seeded at
 * createGame(seed). Same seed + same input sequence => same states.
 *
 * UMD export: works via require() in Node/bundlers AND via
 * `globalThis.__HERMES_GAME_CORE__` when concatenated for Hermes (no require).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.__HERMES_GAME_CORE__ = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var WORLD_W = 20;
  var WORLD_H = 12;
  var MAX_SPEED = 2;

  function toUint32(n) {
    return n >>> 0;
  }

  /** Deterministic PRNG (mulberry32). */
  function mulberry32(seed) {
    var a = toUint32(seed);
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function nextPickup(rand) {
    return {
      x: Math.floor(rand() * WORLD_W),
      y: Math.floor(rand() * WORLD_H)
    };
  }

  function createGame(seed) {
    var s = toUint32(typeof seed === 'number' ? seed : 1);
    var rand = mulberry32(s);
    // Advance PRNG past construction so pickup placement is a pure
    // function of (seed) but not trivially (0,0)-anchored.
    rand();
    var state = {
      v: 1,
      tick: 0,
      seed: s,
      rngCalls: 1,
      x: Math.floor(rand() * WORLD_W),
      y: Math.floor(rand() * WORLD_H),
      vx: 0,
      vy: 0,
      score: 0,
      pickup: null
    };
    state.rngCalls += 2;
    state.pickup = nextPickup(rand);
    state.rngCalls += 2;
    return state;
  }

  function normInput(input) {
    input = input || {};
    return {
      dx: clamp(typeof input.dx === 'number' ? input.dx : 0, -1, 1),
      dy: clamp(typeof input.dy === 'number' ? input.dy : 0, -1, 1)
    };
  }

  /**
   * Advance one fixed tick. Mutates and returns `state`.
   * Scoring is deterministic: stepping onto the pickup scores +1 and
   * respawns it via a PRNG re-seeded from (seed, tick) — no stored
   * function state, so serialize/deserialize round-trips exactly.
   */
  function step(state, input) {
    if (!state || typeof state.tick !== 'number') {
      throw new Error('game.step: invalid state');
    }
    var mv = normInput(input);
    state.vx = clamp(mv.dx * MAX_SPEED, -MAX_SPEED, MAX_SPEED);
    state.vy = clamp(mv.dy * MAX_SPEED, -MAX_SPEED, MAX_SPEED);
    state.x = clamp(state.x + state.vx, 0, WORLD_W - 1);
    state.y = clamp(state.y + state.vy, 0, WORLD_H - 1);
    state.tick += 1;
    if (state.pickup && state.x === state.pickup.x && state.y === state.pickup.y) {
      state.score += 1;
      var rand = mulberry32((state.seed ^ Math.imul(state.tick + 1, 0x9E3779B1)) >>> 0);
      state.pickup = nextPickup(rand);
      state.rngCalls += 2;
    }
    return state;
  }

  function serialize(state) {
    return JSON.stringify({
      v: 1,
      tick: state.tick,
      seed: state.seed,
      rngCalls: state.rngCalls,
      x: state.x,
      y: state.y,
      vx: state.vx,
      vy: state.vy,
      score: state.score,
      pickup: state.pickup
    });
  }

  function deserialize(json) {
    var o = typeof json === 'string' ? JSON.parse(json) : json;
    if (!o || typeof o.tick !== 'number' || typeof o.seed !== 'number') {
      throw new Error('game.deserialize: corrupt snapshot');
    }
    return {
      v: 1,
      tick: o.tick,
      seed: toUint32(o.seed),
      rngCalls: o.rngCalls | 0,
      x: o.x | 0,
      y: o.y | 0,
      vx: o.vx | 0,
      vy: o.vy | 0,
      score: o.score | 0,
      pickup: o.pickup ? { x: o.pickup.x | 0, y: o.pickup.y | 0 } : null
    };
  }

  return {
    WORLD_W: WORLD_W,
    WORLD_H: WORLD_H,
    MAX_SPEED: MAX_SPEED,
    mulberry32: mulberry32,
    createGame: createGame,
    step: step,
    serialize: serialize,
    deserialize: deserialize
  };
}));
