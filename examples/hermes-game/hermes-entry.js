'use strict';
/**
 * Hermes-safe entry point. Compiled into the .hbc bundle.
 * Hermes-safe subset only: var, functions, plain objects/arrays,
 * JSON, Math. No Proxy/Reflect/generators/dynamic import/DOM/Node APIs.
 *
 * Contract:
 *   - defines a `print` shim when the host does not provide one (Hermes CLI
 *     provides `print`; Node fallback is installed by tools/hermes/run.js).
 *   - exposes `globalThis.__HERMES_GAME__ = { seed, ticks, states }` marker.
 *   - prints `HERMES_TICK <n> <json>` per tick and a final `HERMES_DONE <json>`.
 *   - tick count comes from `globalThis.__HERMES_TICKS__` (set by run.js) or
 *     defaults to 10; seed from `globalThis.__HERMES_SEED__` or 42.
 *
 * The core is loaded without `require` so plain concatenation works under
 * Hermes: the bundle is `core/game.js + hermes-entry.js`, and game.js
 * registers itself on `globalThis.__HERMES_GAME_CORE__`.
 */
(function () {
  if (typeof print === 'undefined') {
    var _p = function (s) {
      if (typeof console !== 'undefined' && console.log) {
        console.log(s);
      }
    };
    if (typeof globalThis !== 'undefined') {
      globalThis.print = _p;
    } else {
      // eslint-disable-next-line no-global-assign
      print = _p;
    }
  }

  function loadCore() {
    if (typeof globalThis !== 'undefined' && globalThis.__HERMES_GAME_CORE__) {
      return globalThis.__HERMES_GAME_CORE__;
    }
    // Node/bundler path (kept Hermes-safe: plain try/catch, no dynamic import).
    try {
      if (typeof require === 'function' && typeof module !== 'undefined') {
        return require('./core/game.js');
      }
    } catch (e) {
      // fall through to error below
    }
    throw new Error('hermes-entry: game core not found (expected globalThis.__HERMES_GAME_CORE__)');
  }

  function numGlobal(name, fallback) {
    try {
      var v = globalThis ? globalThis[name] : undefined;
      if (typeof v === 'number' && isFinite(v) && v >= 0) {
        return Math.floor(v);
      }
    } catch (e) {}
    return fallback;
  }

  function scriptedInput(t) {
    // Deterministic demo pattern: clockwise walk, Hermes-safe (no closures over Proxy etc.)
    var seq = [
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: -1 }
    ];
    return seq[t % seq.length];
  }

  function main() {
    var core = loadCore();
    var seed = numGlobal('__HERMES_SEED__', 42);
    var total = numGlobal('__HERMES_TICKS__', 10);
    if (total > 100000) {
      total = 100000;
    }
    var state = core.createGame(seed);
    var states = [];
    for (var t = 0; t < total; t++) {
      core.step(state, scriptedInput(t));
      var snap = {
        tick: state.tick,
        x: state.x,
        y: state.y,
        score: state.score,
        pickup: state.pickup
      };
      states.push(snap);
      print('HERMES_TICK ' + state.tick + ' ' + JSON.stringify(snap));
    }
    var summary = { seed: seed, ticks: total, final: states.length ? states[states.length - 1] : null };
    globalThis.__HERMES_GAME__ = summary;
    print('HERMES_DONE ' + JSON.stringify(summary));
    return summary;
  }

  // Run on load (both `hermes bundle.hbc` and `node bundle.js` execute top-level).
  main();
})();
