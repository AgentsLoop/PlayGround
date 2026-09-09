# Hermes Support — Live Progress

**Goal:** production-quality Hermes support for PlayGround (browser game experiments).
**Scope decision (lead):** Hermes = Meta Hermes JS engine (facebook/hermes). Support = compile game JS to Hermes bytecode (.hbc), run DOM-free game logic under Hermes, compat checking, config, errors/recovery, operability.
**Repo state at start:** empty playground (only README "Playground for browser game experiments"). No existing behavior to break.

## References (authoritative)
- https://github.com/facebook/hermes — README, BuildingAndRunning.md (`hermes -emit-binary -out test.hbc test.js`, `hermes test.hbc`, tools: hdb/hbcdump/hermesc/hvm)
- `include/hermes/BCGen/HBC/BytecodeFileFormat.h` — `MAGIC = 0x1F1903C103BC1FC6` (u64 LE), `version u32 @ offset 8`, 20-byte SHA1 source hash @ 12 (verified live; verify.js implements exactly this)
- https://reactnative.dev/docs/hermes — Hermes default in RN, `HermesInternal` global, bytecode version coupling
- https://docs.expo.dev/guides/using-hermes/ — bytecode tied to Hermes version, rebuild on upgrade
- Hermes blog 2026-06-05: bytecode version 98 → 99 on static_h (must rebuild prebuilt bytecode on upgrade)
- Hermes docs: Design.md (register bytecode), Strings.md (string table)

## Decisions
1. Toolchain in Node (no native build required to use repo); native `hermes`/`hermesc`/`hbcdump` used opportunistically if installed, else clear fallback + header parser.
2. Game code split: `core/` (pure, Hermes-safe) vs `browser.js` (DOM adapter, excluded from HBC) vs `hermes-entry.js` (Hermes-safe entry with `print` shim).
3. Compat checker is static + conservative: bans DOM/BOM/Node APIs in core, flags risky ES as warnings.
4. Bytecode verification: u64 magic + version + SHA1 header inspection + `hbcdump -c "disassemble;quit"` excerpt; engine version coupling recorded in config.
5. Errors: distinct exit codes (build 0/2/3/4, compat 0/1/2, run 0/2/3, verify 0/2/3) + machine-readable JSON + recovery hints. Version drift = warning (exit 0), corrupt/missing = exit 3.
6. Fallback builds delete stale `.hbc` so verify can never pass on a desynced artifact (critic-1 fix).

## Pieces (judgeable)
- [x] P0 scope + progress page
- [x] P1 research fixtures (refs above + docs/HERMES.md)
- [x] P2 `hermes.config.json` + schema (engineVersion 0.12.0, bytecodeTarget 96 — measured)
- [x] P3 `tools/hermes/` (build, compat-check, run, verify)
- [x] P4 `examples/hermes-game/` (core, browser adapter, hermes entry, bundle fixture)
- [x] P5 tests `tools/hermes/__tests__/` + acceptance fixtures (17/17)
- [x] P6 docs + operability (errors/recovery/troubleshooting)
- [x] P7 verification evidence (real `hermes` binary v0.13.0 release / engine 0.12.0 / HBC v96 — see below)

## Completed work
- Full toolchain + example + tests + docs built (2 builder subagents), then critic-reviewed (2 fresh-context critics).
- Critic fixes applied: verify.js u64 magic (was wrong u32 → rejected real bytecode), `hbcdump -c "disassemble;quit"` invocation, config pinned to measured 0.12.0/96, docs drift fixed (99→96, check-only semantics, run.js error row, schema-validation wording, scripts block synced to package.json), fallback stale-.hbc deletion + regression test, package.json test glob fix.

## Evidence
- Real Hermes CLI (v0.13.0 release tarball, reports engine 0.12.0 / HBC v96):
  - `build: OK via hermes — dist/game.hbc (6352 bytes)`
  - `verify: OK — magic 0x1F1903C103BC1FC6 version 96 … mode bytecode+hbcdump` (header matches BytecodeFileFormat.h; sourceHash == hbcdump "Source hash")
  - `hbcdump -c "disassemble;quit"`: `Bytecode version number: 96, Function count: 17, String count: 65`, string table contains HERMES_TICK/HERMES_DONE markers
  - `run --mode hermes --ticks 10` under REAL `hermes dist/game.hbc`: `HERMES_TICK 1..10` + `HERMES_DONE {seed:42,ticks:10,…}` (deterministic; matches Node fallback output)
- Fallback (no binary on PATH): `build` exit 4 + `game.hbc.json` manifest (sha256 matches bundle, stale `.hbc` removed); `verify` reports FALLBACK with hash match, exit 0; `run --mode node` same tick protocol.
- `npm test`: 17/17 pass (compat 5, game 6, build-verify 6) in both real-binary and fallback states.
- `compat-check`: exit 0 clean on 2 files; exit 1 on `document` fixture; exit 0 warn-only on `Proxy` fixture; exit 2 on missing config.

## Blockers / gaps
- None blocking. Known low-severity note (critic): config paths not containment-checked (trusted-local-config assumption, documented). `dist/` left untracked with freshly built real `.hbc` for inspection.

## Next exact action
- Done. If Hermes upgrades (e.g. to bytecode v99 line), bump `engineVersion`/`bytecodeTarget` + rebuild `.hbc` in the same commit and re-run `hermes:verify`.
