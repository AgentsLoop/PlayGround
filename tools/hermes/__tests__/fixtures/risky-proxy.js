'use strict';
// Risky-ES fixture: Proxy/Reflect usage must WARN, never error.
// Uses a typeof-guarded export (no bare `module.exports`) so the ONLY
// compat signal from this file is the risky-es Proxy warning.
function makeTracked(target) {
  return new Proxy(target, {
    get: function (t, p, r) { return Reflect.get(t, p, r); },
    set: function (t, p, v, r) { return Reflect.set(t, p, v, r); },
  });
}
var api = { makeTracked: makeTracked };
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
