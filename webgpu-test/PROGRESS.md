# Playwright Chromium WebGPU — live progress (macOS runner)

Goal: reproducible real-3D browser scene + autonomous screenshot capture + evidence-backed GPU diagnostic,
comparing bundled Chromium baseline vs `channel: chromium` + Metal WebGPU flags, with the Vulkan variant tested separately.
Method: gauntlet-loop — each piece got a builder; a separate fresh-context critic inspected the running artifacts
(screenshots viewed directly, JSON, console logs) and named the biggest gap; the gap was fixed and the matrix re-run.

## Reproduce (preserved stdout/stderr alongside)

```
cd webgpu-test
npm install --no-audit --no-fund
npx playwright install chromium
node probe.mjs > results-final-stdout.txt 2> results-final-stderr.txt
```

Bounded probes everywhere: `requestAdapter`/`requestDevice` race an 8000 ms page-side timeout,
`page.evaluate` has an outer timeout, `waitForFunction(__done)` is capped at 20 s, browser launch at 60 s.
Absent adapters are recorded (`NULL (blocked/unsupported — recorded, not skipped)`), never skipped.

## Environment (exact)

- macOS 26.6.2 arm64 (GitHub-hosted runner, VM), node v24.20.0, playwright 1.63.0
- Playwright browsers: `chromium-1243` full build + `chromium_headless_shell-1243` (Chrome Headless Shell 153.0.8010.12)
- Installed system Chromes (not under test, listed for context): Google Chrome 152.0.7977.83, Google Chrome for Testing
- Matrix browser.version: 153.0.8010.12 in all four configs

## Authoritative docs checked before choosing flags/recovery

- Chrome for Developers “Supercharge Web AI model testing” — Vulkan ANGLE flags (`--use-angle=vulkan`,
  `--enable-features=Vulkan`, `--disable-vulkan-surface`, `--enable-unsafe-webgpu`) are the **Linux** recipe;
  not assumed suitable on macOS (hence tested as a separate variant).
- Chrome WebGPU troubleshooting tips — `--enable-unsafe-webgpu` disables the adapters blocklist;
  `--ignore-gpu-blocklist` overrides the software-rendering list.
- Chromium `docs/gpu/debugging_gpu_related_code.md` — `--ignore-gpu-blocklist` as the documented override
  when `about:gpu` reports disabled acceleration.
- Promaton/Playwright GPU testing (2025) — full `channel: "chromium"` build (not headless-shell) + new headless
  mode is the WebGPU-capable combination since Playwright v1.49; `ignoreDefaultArgs: ['--disable-gpu']`-style
  handling noted. Our matrix mirrors this: A = bundled default (headless shell), B/C/D = `channel: chromium`.
- Recovery chosen from docs: Metal ANGLE (`--use-angle=metal`) is the macOS path; Vulkan kept isolated as variant D.

## Matrix results (final run, all inspected directly + machine-checked)

| Config | Launch | WebGL | WebGPU adapter | Screenshots (inspected) | Verdict |
|---|---|---|---|---|---|
| A baseline-bundled-headless | bundled default, headless, no flags | SwiftShader `ANGLE (Google, Vulkan 1.3.0 SwiftShader…)` cube ✅ nonblank (5076 colors) | `navigator.gpu` present, `requestAdapter → NULL`, console `No available adapters` | cube ✅ / wgpu canvas blank (2 colors, mean 5.85) | 3D capture works; **no WebGPU** at baseline |
| B metal-channel-headless | `channel: chromium`, headless, `--enable-unsafe-webgpu --ignore-gpu-blocklist --use-angle=metal` | `ANGLE (Apple, ANGLE Metal Renderer: Apple Paravirtual device…)` cube ✅ (5075 colors, centerPixel 136,63,136,255) | vendor `apple`, device/description empty, features include `core-features-and-limits`; triangle **rendered** ✅ (3 colors, mean 203.1) | cube ✅ + green triangle ✅ | **reproducible 3D screenshot capture demonstrated** |
| C metal-channel-headed | same flags, `headless: false` | identical to B | identical to B (UA `Chrome/153`, not `HeadlessChrome`) | identical to B | headed == headless here; headed unexpectedly works on this runner |
| D vulkan-channel-headless | `channel: chromium`, headless, `--enable-unsafe-webgpu --ignore-gpu-blocklist --enable-features=Vulkan --use-angle=vulkan --disable-vulkan-surface` | context lost: `CONTEXT_LOST_WEBGL: loseContext`, scene `gl.ok=false`, canvas white (1435 B) | scene `requestAdapter → NULL`; later probe spuriously got a `google/swiftshader` adapter (flaky) | GL broken-white / wgpu blank | **Vulkan unsuitable on macOS — reported, not recommended** |

Honesty notes (do not over-read renderer names):
- `Apple Paravirtual device` = VM paravirtual Metal, **not proof of physical-GPU access**; no hardware-performance claim is made.
- SwiftShader strings likewise describe software rendering, not hardware speed.
- D’s outer probe once returned a swiftshader adapter while the scene’s own bounded `requestAdapter` returned NULL —
  recorded verbatim in `results/D-*/result.json`; flakiness is itself evidence the path is unsuitable.

## Failures → fixes (gauntlet-loop rounds)

1. Builder’s first projection matrix was hand-rolled garbage (camera-inside-cube smear, `readPixels(200,150,1,4)` overflow warning). Fixed with a real perspective matrix (`fov 45°, eye z=-6, rotY 0.6 × rotX 0.4`); centerPixel now `136,63,136,255`, cube recognizable.
2. Critic’s biggest gap: automated `nonblank` used `drawImage` sampling, which reads back blank for WebGPU canvases (false-negative: B/C reported `distinctColors: 1` like blank A/D). Fixed with a pure-node PNG decoder (`pngStats` in `probe.mjs`) measuring the actual screenshot files; metric now agrees with direct inspection on all four configs. `webglcontextlost` listener added so D’s compositor failure surfaces as `scene.gl.ok=false`.

## Artifacts (all uncommitted; workflow commits)

- `webgpu-test/scene.html` — self-contained deterministic scene (no network): WebGL cube + WebGPU triangle + bounded in-page probes
- `webgpu-test/probe.mjs` — matrix runner (4 configs), bounded evals, PNG-stat nonblank check
- `webgpu-test/results/<config>/` — `page.png`, `canvas-gl.png`, `canvas-wgpu.png`, `result.json`, `console.txt`, `pageerrors.txt`
- `webgpu-test/results/matrix.json` — combined machine-readable verdicts
- `webgpu-test/results-*.txt` — preserved stdout/stderr per run (`.txt` so they survive the repo’s `*.log` ignore rule)

## Next actions

- None blocking: reproducible capture is demonstrated (B headless). Optional follow-ups: pin `--use-angle=metal` set as the macOS default in CI config; keep Vulkan flags Linux-only; re-run on a physical-Mac runner to compare `Apple Paravirtual` vs real GPU adapter strings.
