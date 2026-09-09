# Hermes Game Example

Minimal DOM-free game core with three runners: **browser**, **Hermes
bytecode**, and **Node fallback**. The deterministic sim lives in `core/`;
each host supplies its own adapter around it.

```text
examples/hermes-game/
  core/game.js       pure sim: createGame/step/serialize/deserialize (CommonJS, DOM-free)
  hermes-entry.js    Hermes-safe entry (print shim, HERMES_TICK/HERMES_DONE driver)
  browser.js         DOM adapter (canvas/input/rAF — excluded from the HBC)
```

## 1. Run in the browser

Serves the visual build. `browser.js` imports `core/` and drives it with
`requestAnimationFrame` + canvas input; no Hermes tooling needed.

```sh
# any static server from the repo root, then open the example page:
npx serve .                 # or: python3 -m http.server
# open http://localhost:3000/examples/hermes-game/ (see browser.js wiring)
```

What you get: canvas rendering, keyboard input, same fixed-timestep sim as the
other modes (rendering only — sim state stays DOM-free).

## 2. Run under Hermes (bytecode)

Requires a Hermes binary (`hermes` on `PATH` — release builds at
[facebook/hermes](https://github.com/facebook/hermes/releases)).

```sh
npm run hermes:compat
npm run hermes:build
# exit 0 → dist/game.hbc is real bytecode; exit 4 → fallback (no binary, see §3)

# execute the bytecode on the Hermes VM:
hermes dist/game.hbc
# or via the repo runner (hermes mode):
node tools/hermes/run.js --config hermes.config.json --mode hermes --ticks 60

node tools/hermes/verify.js --config hermes.config.json --json
# exit 0 → header ok (magic 0x1F1903C103BC1FC6, version matches bytecodeTarget 96 for Hermes 0.12.0)
```

Bytecode is **version-coupled**: after any Hermes upgrade, rebuild
(`hermes:build`) — e.g. a v98 `.hbc` will not run on a v99 VM. See `docs/HERMES.md`
§7.

## 3. Run under Node (fallback, no Hermes binary)

Same bundle, same tick protocol, plain Node — for development and CI without
the native toolchain:

```sh
npm run hermes:build        # exit 4 + dist/game.hbc.json manifest is expected here
npm run hermes:run          # --mode node --ticks 60: HERMES_TICK lines + HERMES_DONE
npm test                    # P5 contract suite (compat + determinism + build/verify)
```

`run --mode node` output protocol (shared with hermes mode):

```text
HERMES_TICK 0 {"tick":0,...}
HERMES_TICK 1 {"tick":1,...}
...
HERMES_DONE ticks=60
```

## Choosing a mode

| Goal | Command |
| --- | --- |
| Visual playtest | Browser (§1) |
| Ship/fast-startup path | Hermes bytecode (§2) |
| Dev loop / CI without native deps | Node fallback (§3) |

Core rules (enforced by `hermes:compat`): `core/` + `hermes-entry.js` must stay
DOM-free (no `document`/`window`/Node APIs); all DOM access belongs in
`browser.js`. `Proxy`/`Reflect`/`WeakRef`/generators warn but still pass —
prefer plain objects for best Hermes results.
