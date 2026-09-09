# Hermes Support (PlayGround)

> Authoritative doc for Hermes support in this repo (piece P6).
> Scope (lead decision): **Hermes = Meta Hermes JS engine**
> ([facebook/hermes](https://github.com/facebook/hermes)). Support = compile
> game JS to Hermes bytecode (`.hbc`), run DOM-free game logic under Hermes,
> compat checking, config, errors/recovery, operability.

## 1. What Hermes is + why

**Hermes** is Meta's JavaScript engine built for fast app startup, originally
for React Native (Hermes is the default RN engine —
[reactnative.dev/docs/hermes](https://reactnative.dev/docs/hermes)). Instead of
parsing + compiling JS on device at launch, Hermes ahead-of-time compiles JS
to **register bytecode** (`.hbc`) which loads and executes faster with lower
memory use.

Why it matters for PlayGround:

- **Startup:** prebuilt `.hbc` skips parse/compile on the hot path. Game logic
  boots by memory-mapping bytecode instead of compiling source.
- **Bytecode portability (with a catch):** `.hbc` runs on any host with a
  matching Hermes VM (`hermes`, `hvm`, RN's Hermes), but bytecode is
  **version-coupled** — see §7. Always rebuild on engine upgrade.
- **Discipline:** Hermes forces game logic to be **DOM-free and portable**
  (no DOM/BOM/Node APIs in the sim core). That same split makes the core
  testable under plain Node and reusable in the browser.

Key upstream references:

- Engine + tools: [facebook/hermes](https://github.com/facebook/hermes) —
  README and `BuildingAndRunning.md`
  (`hermes -emit-binary -out test.hbc test.js`, `hermes test.hbc`; tools
  `hdb` / `hbcdump` / `hermesc` / `hvm`)
- RN integration: [reactnative.dev/docs/hermes](https://reactnative.dev/docs/hermes)
  (`HermesInternal` global; Hermes default in RN)
- Expo guide: [docs.expo.dev/guides/using-hermes](https://docs.expo.dev/guides/using-hermes/)
  (bytecode tied to Hermes version — rebuild on upgrade)
- Hermes blog 2026-06-05: **bytecode version 98 → 99** (prebuilt bytecode
  must be rebuilt on upgrade)
- Engine design: `doc/Design.md` (register bytecode), `doc/BytecodeFileFormat.h`
  (file format), `doc/Strings.md` (string table)

## 2. Architecture

Game code is split into three layers. Only the first two ship inside the HBC:

```text
┌─────────────────────────────┐
│ examples/hermes-game/core/  │  PURE sim: createGame/step/serialize/deserialize
│ game.js (CommonJS, DOM-free)│  Hermes-safe JS, runs in Hermes / Node / browser
└──────────────┬──────────────┘
               │ require()
┌──────────────▼──────────────┐
│ hermes-entry.js             │  Hermes-safe entry: `print` shim, HERMES_TICK
│ (DOM-free, HERMES marker)   │  loop driver, HERMES_DONE sentinel
└──────────────┬──────────────┘
               │ build.js bundles + compiles
┌──────────────▼──────────────┐
│ dist/game.bundle.js  ──►    │  concatenated JS bundle (input to compiler)
│ dist/game.hbc               │  real bytecode (hermes binary present), OR
│ dist/game.hbc.json          │  fallback manifest (sha256/size, no binary)
└─────────────────────────────┘

┌─────────────────────────────┐
│ browser.js (NOT in HBC)     │  DOM adapter: canvas/input/rAF render loop.
│ excluded from bundle        │  Imports core/, never bundled into bytecode.
└─────────────────────────────┘
```

Data flow:

1. `compat-check.js` statically scans `core/` + `hermes-entry.js`.
2. `build.js` concatenates them into `dist/game.bundle.js`, then either runs
   `hermes -emit-binary -O -out dist/game.hbc` or writes `dist/game.hbc.json`.
3. `run.js` executes the bundle (`--mode hermes|node`) for N ticks, printing
   `HERMES_TICK <i> <state>` lines + `HERMES_DONE`.
4. `verify.js` inspects the `.hbc` header (magic/version/sha256/size) or the
   fallback manifest and reports JSON.

### File map

| Path | Role |
| --- | --- |
| `hermes.config.json` / `hermes.schema.json` | Toolchain config + JSON Schema (P2) |
| `tools/hermes/build.js` | Bundler + bytecode compiler driver (P3) |
| `tools/hermes/compat-check.js` | Static DOM/Node ban + risky-ES warnings (P3) |
| `tools/hermes/run.js` | Tick runner, hermes|node modes (P3) |
| `tools/hermes/verify.js` | `.hbc` header / manifest inspector (P3) |
| `examples/hermes-game/core/game.js` | Pure deterministic sim core (P4) |
| `examples/hermes-game/hermes-entry.js` | Hermes-safe entry (P4) |
| `examples/hermes-game/browser.js` | DOM adapter, excluded from HBC (P4) |
| `tools/hermes/__tests__/` | P5 contract tests + fixtures |
| `docs/HERMES.md` (this file) | P6 authoritative doc |
| `examples/hermes-game/README.md` | P6 per-example run guide |

## 3. Config reference (`hermes.config.json`)

Validated against `hermes.schema.json` (`additionalProperties: false` — do
not invent top-level keys). All relative paths resolve from the repo root.

| Key | Type | Meaning |
| --- | --- | --- |
| `engineVersion` | `x.y.z` string | Hermes engine version the bytecode is built for. Bump deliberately; bytecode is version-coupled (§7). |
| `bytecodeTarget` | integer | Expected Hermes bytecode version (e.g. `96` for Hermes 0.12.0). `verify.js` compares the `.hbc` header against it and emits a warning on drift (exit stays 0; see §7). |
| `entry` | path string | Hermes-safe entry file (DOM-free), bundled into the HBC. Default `examples/hermes-game/hermes-entry.js`. |
| `coreDir` | path string | Directory of DOM-free core files. Everything here is scanned by compat-check and bundled. |
| `browserEntry` | path string | DOM adapter. **Excluded** from the HBC bundle. |
| `outDir` | path string | Output directory (`dist`). |
| `bundle` | path string | Concatenated JS bundle (`dist/game.bundle.js`) — compiler input and Node-fallback runnable. |
| `bytecode` | path string | Real bytecode output (`dist/game.hbc`). Exists only when a Hermes binary compiled it. |
| `fallbackManifest` | path string | Fallback manifest (`dist/game.hbc.json`) with `sha256` + `size` of the bundle when no binary is available. |
| `compat.level` | `strict`\|`lax` | `strict` also forbids Node-isms and dynamic `import()` in core. |
| `compat.forbidDomInCore` | bool | When `true`, any DOM/BOM API in core is an error (exit 1). |
| `hermes.binary` | string | Hermes binary name/path (`hermes`). |
| `hermes.compiler` | string | Optional alternate compiler (`hermesc`). |
| `hermes.dumper` | string | Optional disassembler (`hbcdump`) used by verify when present. |
| `hermes.allowFallback` | bool | When `true`, build exits 4 with a manifest instead of failing when no binary exists. When `false`, missing binary is a compile error (exit 3). |

Minimal example:

```json
{
  "$schema": "./hermes.schema.json",
  "engineVersion": "0.12.0",
  "bytecodeTarget": 96,
  "entry": "examples/hermes-game/hermes-entry.js",
  "coreDir": "examples/hermes-game/core",
  "browserEntry": "examples/hermes-game/browser.js",
  "outDir": "dist",
  "bundle": "dist/game.bundle.js",
  "bytecode": "dist/game.hbc",
  "fallbackManifest": "dist/game.hbc.json",
  "compat": { "level": "strict", "forbidDomInCore": true },
  "hermes": { "binary": "hermes", "allowFallback": true }
}
```

## 4. Workflows

Prerequisites: Node ≥ 18. Optional: a `hermes` binary on `PATH`
(doc §8 covers acquisition). Every tool supports `--json` for
machine-readable output and `--help`.

```sh
npm run hermes:compat   # 1. static check (exit 0 clean / 1 violations / 2 error)
npm run hermes:build    # 2. bundle + compile (exit 0 hbc / 4 fallback manifest)
npm run hermes:run      # 3. tick run, hermes|node (prints HERMES_TICK/HERMES_DONE)
npm run hermes:verify   # 4. header/manifest inspection (exit 0 ok / 3 invalid)
npm test                # P5 contract suite (node:test, no deps)
```

### 4.1 compat → build → run → verify (happy path)

```sh
node tools/hermes/compat-check.js --config hermes.config.json --json
# exit 0 → clean (warnings allowed)

node tools/hermes/build.js --config hermes.config.json --out dist --json
# exit 0 → dist/game.bundle.js + dist/game.hbc (real bytecode)
# exit 4 → dist/game.bundle.js + dist/game.hbc.json (fallback manifest)

node tools/hermes/run.js --config hermes.config.json --mode node --ticks 10 --json
# HERMES_TICK 0 {...}
# ...
# HERMES_DONE ticks=10

node tools/hermes/verify.js --config hermes.config.json --json
# exit 0 → { magic, version, sha256, size } or fallback manifest report
```

Use `--mode hermes` when a Hermes binary is installed; `--mode node` runs the
same bundle as a DOM-free fallback (same `HERMES_TICK`/`HERMES_DONE` protocol).

`build.js --check-only` runs the compat gate and always refreshes
`dist/game.bundle.js`, but skips emitting `.hbc`/manifest (useful as a fast
CI lint step that still proves the bundle assembles).

## 5. CLI reference (condensed)

| Tool | Key flags | Stdout contract |
| --- | --- | --- |
| `compat-check.js` | `--config <p> --json` | JSON `{ ok, errors[], warnings[] }`; human text without `--json` |
| `build.js` | `--config <p> --out <dir> --json --check-only` | JSON `{ ok, bundle, bytecode\|manifest, fallback: bool }` |
| `run.js` | `--config <p> --mode hermes\|node --ticks N --json` | `HERMES_TICK <i> <json>` per tick + `HERMES_DONE …`; JSON envelope with `--json` |
| `verify.js` | `--config <p> --json` | JSON `{ ok, magic, version, sha256, size }` or `{ ok, fallback: true, sha256, size }` |

## 6. Error catalog (exit codes + recovery)

Exit codes are distinct per tool so CI can branch on them:

| Tool | Code | Meaning | Recovery |
| --- | --- | --- | --- |
| all | `0` | Success (compat warnings allowed; build `0` = real `.hbc`) | — |
| compat-check | `1` | Violations: DOM/BOM/Node API in core | Move DOM access into `browser.js`; keep `core/` + `hermes-entry.js` DOM-free; re-run `hermes:compat` |
| compat-check / build / verify / run | `2` | Config/usage error: bad JSON, missing entry/coreDir file, unknown flag | `node tools/hermes/<tool>.js --help`; check `entry`/`coreDir` paths exist and JSON parses (note: tools do not full-validate against `hermes.schema.json`; extra keys are ignored, not rejected) |
| build / verify | `3` | Compile/artifact error: `hermes -emit-binary` failed, or `.hbc` header invalid/corrupt (`verify`), or `run --mode hermes` with no binary | Read stderr JSON hint; with `allowFallback:false` install/pin the Hermes binary; with fallback enabled expect exit 4 instead; for `verify` 3 → rebuild (`hermes:build`) |
| build | `4` | Fallback: no Hermes binary, wrote `dist/game.hbc.json` manifest and removed any stale `.hbc` | Expected without a native binary. Ship/run via the Node fallback (`run --mode node`), or install Hermes (see §8) and rebuild for a real `.hbc` |
| run | `3` | Execution error in hermes mode (no binary, non-zero exit, missing `HERMES_DONE`) | Use `--mode node` without a binary; check `--ticks N ≥ 1`; inspect JSON `hint` |

`--json` always pairs the exit code with a machine-readable payload
(`{ ok:false, code, error, hint }` shape) so CI can log the reason without
parsing prose. Recovery order for most failures:

1. `npm run hermes:compat` — isolate DOM/Node leaks to `browser.js`.
2. `npm run hermes:build` — rebuild bundle + bytecode/manifest.
3. `npm run hermes:verify` — confirm header/manifest matches config.
4. If versions changed — see §7 (rebuild; never ship stale `.hbc`).

## 7. Version-coupling warning

**Hermes bytecode is tied to the engine version. Rebuild `.hbc` on every
engine/compiler upgrade; never ship a stale `.hbc` against a new VM.**

Concretely: the Hermes blog entry of **2026-06-05** bumped the bytecode
version **98 → 99** on the static_h branch — prebuilt bytecode from v98 is
rejected by a v99 runtime and must be recompiled. This repo records the
coupling in config (`engineVersion` + `bytecodeTarget`) and `verify.js`
compares the `.hbc` header version against `bytecodeTarget`, emitting a
**warning (exit stays 0)** on drift. Measured evidence in this repo:
Hermes release v0.13.0 ships CLI reporting `Hermes release version: 0.12.0`,
`HBC bytecode version: 96` (see `PROGRESS_HERMES.md` evidence) — hence the
shipped config pins `engineVersion 0.12.0` / `bytecodeTarget 96`.

Rules:

- Pin `engineVersion` in `hermes.config.json`; bump it deliberately with the
  bytecode rebuild in the same commit.
- Keep `bytecodeTarget` in sync with the compiler that produced the `.hbc`
  (96 for the measured Hermes 0.12.0 toolchain; 99 for the upcoming
  static_h/stable release line).
- CI must run `hermes:build` + `hermes:verify` after any Hermes upgrade; check
  in the rebuilt `.hbc` (or regenerate it in release pipelines), never reuse
  the old one.
- The fallback manifest (`game.hbc.json`) records the producing
  `engineVersion`/`bytecodeTarget` alongside `sha256`/`size` for the same
  reason — a manifest from another engine version must not be trusted.

Background: Expo's Hermes guide states the same rule ("bytecode tied to
Hermes version, rebuild on upgrade"), and `verify.js` optionally uses
`hbcdump` for disassembly-level confirmation when installed.

## 8. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `compat-check` exit 1 names `document`/`window`/`localStorage` | DOM/BOM API leaked into `core/` | Move it to `browser.js`; core may only use pure JS + the `print` shim |
| `compat-check` exit 1 names `require('fs')`/`process`/`__dirname` | Node API in core (strict level) | Same fix; inject host capabilities via entry args instead of importing Node in core |
| `compat-check` warns on `Proxy`/`Reflect`/`WeakRef`/`function*` | Risky ES for Hermes bytecode | Warning only (exit stays 0). Prefer plain objects/classes; if you must use them, test under real Hermes (`run --mode hermes`) |
| `build` exit 4 (fallback) | No `hermes` binary on `PATH` | Expected without native toolchain. `npm run hermes:run -- --mode node` still works. For real `.hbc`: install via `npm i hermes-engine` (JS VM, no compiler) or download a Hermes release (`hermes`, `hermesc`, `hbcdump`) from [facebook/hermes releases](https://github.com/facebook/hermes/releases) and re-run build |
| `build` exit 3 | Compiler failed (syntax error or `allowFallback:false` + no binary) | Read the JSON `hint`; run `build --check-only`; fix the flagged file; ensure `hermes -emit-binary` works manually |
| `verify` exit 3 (corrupt/missing) | Bad magic, truncated file, or nothing to verify | Rebuild (`hermes:build`); never hand-edit `dist/` |
| `verify` warns `header version X != bytecodeTarget Y` | `.hbc` built by a different engine than config pins | Warning only (exit 0). Rebuild with the pinned engine or bump `engineVersion`/`bytecodeTarget` deliberately with the rebuild in the same commit |
| `verify` hash mismatch (fallback) | Bundle edited after manifest written | Rebuild; never hand-edit `dist/` |
| `run` prints nothing / no `HERMES_DONE` | Wrong `--mode` or `--ticks 0` | Use `--mode node` without a binary; pass `--ticks N` with N ≥ 1 |
| Tests fail on missing `examples/hermes-game/core` | P4 example not checked out | Restore the example dir; P5 tests assert its presence with explicit messages |

## 9. Operability (CI, logging, JSON mode)

CI snippet (compat gate → build → run → verify; fallback-tolerant):

```yaml
# .github/workflows/hermes.yml
jobs:
  hermes:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm run hermes:compat -- --json
      - run: npm run hermes:build -- --json
      - run: npm run hermes:run -- --mode node --ticks 60 --json
      - run: npm run hermes:verify -- --json
      # Build exits 4 (not 0) when no Hermes binary is installed — allow it:
      # replace the build step with:
      # - run: npm run hermes:build -- --json || test $? -eq 4
```

Logging conventions:

- Human mode (no `--json`): `INFO`/`WARN`/`ERROR` lines on stderr,
  `HERMES_TICK`/`HERMES_DONE` protocol lines on stdout for `run.js`.
- `--json` mode: single JSON object on stdout (safe to `JSON.parse` even when
  warnings were emitted); diagnostics go to stderr.
- Exit codes are the primary signal (see §6); JSON payloads carry
  `hint` fields with the recovery action.

`package.json` scripts (contract; must match `package.json` exactly):

```json
{
  "scripts": {
    "hermes:compat": "node tools/hermes/compat-check.js",
    "hermes:build": "node tools/hermes/build.js",
    "hermes:run": "node tools/hermes/run.js",
    "hermes:verify": "node tools/hermes/verify.js",
    "test": "node --test \"tools/hermes/__tests__/compat-check.test.js\" \"tools/hermes/__tests__/game.test.js\" \"tools/hermes/__tests__/build-verify.test.js\""
  }
}
```

Pass tool flags after `--`, e.g. `npm run hermes:run -- --mode node --ticks 60 --json`.
The `hermes:build` compiler invocation is `<hermes-bin> -emit-binary -O -out
<bytecode> <bundle>`; `verify` disassembles via `hbcdump -c
"disassemble;quit" <bytecode>` when `hbcdump` is on `PATH`.
