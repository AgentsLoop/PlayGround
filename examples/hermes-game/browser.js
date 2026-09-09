// BROWSER ADAPTER — EXCLUDED FROM HERMES BYTECODE (HBC).
// ---------------------------------------------------------------------------
// This file is intentionally NOT Hermes-compiled: it touches DOM/BOM APIs
// (document, canvas, requestAnimationFrame, keyboard) which are forbidden in
// `core/` by tools/hermes/compat-check.js. The HBC bundle contains only
// `core/game.js` + `hermes-entry.js` (see hermes.config.json).
//
// Usage (bundler or <script type="module"> with an import map / build step):
//   import { createGame, step } from './core/game.js'; // or the CJS build
//   startBrowserGame(document.getElementById('game'));
'use strict';

var game = require('./core/game.js');

var TICK_MS = 100; // fixed timestep for rendering; sim itself is tick-based

function startBrowserGame(canvas, opts) {
  opts = opts || {};
  if (!canvas || typeof canvas.getContext !== 'function') {
    throw new Error('browser: a <canvas> element is required');
  }
  var ctx = canvas.getContext('2d');
  var state = game.createGame(typeof opts.seed === 'number' ? opts.seed : 42);
  var input = { dx: 0, dy: 0 };
  var pressed = {};

  function recompute() {
    input.dx = (pressed.ArrowRight || pressed.d ? 1 : 0) - (pressed.ArrowLeft || pressed.a ? 1 : 0);
    input.dy = (pressed.ArrowDown || pressed.s ? 1 : 0) - (pressed.ArrowUp || pressed.w ? 1 : 0);
  }

  function onKey(down, e) {
    pressed[e.key] = down;
    pressed[e.key.length === 1 ? e.key.toLowerCase() : e.key] = down;
    recompute();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].indexOf(e.key) !== -1) {
      e.preventDefault();
    }
  }

  var keyDown = function (e) { onKey(true, e); };
  var keyUp = function (e) { onKey(false, e); };
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);

  var last = performance.now();
  var acc = 0;
  var raf = 0;
  var running = true;

  function draw() {
    var cw = canvas.width / game.WORLD_W;
    var ch = canvas.height / game.WORLD_H;
    ctx.fillStyle = '#101418';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (state.pickup) {
      ctx.fillStyle = '#ffd54a';
      ctx.fillRect(state.pickup.x * cw + 1, state.pickup.y * ch + 1, cw - 2, ch - 2);
    }
    ctx.fillStyle = '#5ad1ff';
    ctx.fillRect(state.x * cw + 1, state.y * ch + 1, cw - 2, ch - 2);
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.fillText('tick ' + state.tick + '  score ' + state.score, 8, 14);
  }

  function frame(now) {
    if (!running) {
      return;
    }
    acc += now - last;
    last = now;
    var guard = 0;
    while (acc >= TICK_MS && guard++ < 5) {
      game.step(state, input);
      acc -= TICK_MS;
    }
    draw();
    raf = window.requestAnimationFrame(frame);
  }
  raf = window.requestAnimationFrame(frame);

  return {
    state: state,
    destroy: function () {
      running = false;
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.cancelAnimationFrame(raf);
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { startBrowserGame: startBrowserGame };
}
