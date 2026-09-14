# Playwright Chromium WebGPU — Live Progress (macOS GH runner)

> Leave uncommitted — workflow commits + pushes the result branch.

## Bar (gauntlet-loop)
Hardest reachable bar: Three.js official lit WebGL cube + Playwright docs expectation
(headless-shell renders WebGL via SwiftShader; `channel:'chromium'` = new headless = real Chrome).
Critic compares our screenshots + diagnostics blind against that bar and names the single biggest gap per loop.

## Environment (exact)
- macOS 26.6.2 (25G83), Darwin 25.6.0 ARM64, hw.model VirtualMac2,1, cpu Apple M1 (Virtual)
- Playwright 1.63.0, bundled Chromium 153.0.8010.12 (playwright chromium v1243)
  + headless-shell 153.0.8010.12 (chromium_headless_shell-1243)
- System Google Chrome 152.0.7977.83 at /Applications/Google Chrome.app
- Scene: playwright-webgpu/scene.html (offline, no CDN), 640x480 WebGL2 lit cube + 320x240 WebGPU clear-color canvas

## Repro commands
```
cd playwright-webgpu
npm install --no-audit --no-fund
npx playwright install chromium
node run-matrix.mjs > evidence/logs/matrix-stdout-rerun.log 2> evidence/logs/matrix-stderr-rerun.log
python3 -c "from PIL import Image; ..."  # nonblank check (uniq>20 and var>50)
```

## Matrix (7 configs, bounded: 15s goto / 15s sceneReady / 3s adapter race / 60s global / finally close)
| config | ok | sceneReady | adapter | ms | WebGL renderer |
|---|---|---|---|---|---|
| baseline-bundled-headless | true | true | null | 1426 | ANGLE Google SwiftShader (software) |
| baseline-bundled-headed | true | true | success | 4721 | ANGLE Apple Paravirtual |
| channel-chromium-webgpu-headless | true | true | success | 2084 | ANGLE Apple Paravirtual |
| channel-chromium-webgpu-headed | true | true | success | 2182 | ANGLE Apple Paravirtual |
| vulkan-variant-headless (SEPARATE) | true | true | success | 2011 | ANGLE Apple Paravirtual (unchanged) |
| vulkan-variant-headed (SEPARATE) | true | true | success | 2362 | ANGLE Apple Paravirtual (unchanged) |
| system-chrome (distinct, execPath) | true | true | success | 3582 | ANGLE Apple Paravirtual |

- `navigator.gpu`: present in ALL configs (never silently skipped).
- Bounded `requestAdapter`: `null` only in baseline headless-shell ("No available adapters." console warning);
  `success` with `adapterInfo {vendor:apple, architecture/device/description:null}` everywhere else.
- `webgl2Supported`: true everywhere. `pageErrors`: [] everywhere.
- Screenshots: all 1280x800 nonblank, inspected directly (PIL uniq 435–502, var 341–894).
  WebGL lit cube visible in all; blue WebGPU clear-color canvas visible wherever adapter=success,
  black canvas in baseline-headless (honest blocked-path evidence).

## Authoritative docs checked BEFORE recovery
- https://playwright.dev/docs/browsers#chromium-headless-shell (default headless = headless shell)
- https://playwright.dev/docs/browsers#chromium-new-headless-mode (channel:'chromium' = real Chrome, more authentic)
- https://playwright.dev/docs/api/class-browsertype#browser-type-launch-option-channel
- Recovery chosen from docs: null adapter in headless-shell → rerun on full Chromium via
  channel:'chromium' with --enable-unsafe-webgpu --ignore-gpu-blocklist --use-angle=metal.
  Vulkan flag tested separately per prompt; docs + result show it is not a macOS/Metal replacement.

## Honesty disclaimers (load-bearing)
- "Apple Paravirtual device" = virtualized Metal path on VirtualMac2,1 — NOT proof of physical-GPU
  access. No FPS / hardware-performance claim is made from any renderer string.
- "SwiftShader" = software rasterizer, no GPU.
- Vulkan variant still reports Paravirtual Metal renderer — flag has no Metal-replacing effect here.

## Failures → fixes (gauntlet loop 1)
1. FAIL (scene critic): flat unlit cube + `GL_INVALID_ENUM: glCullFace: Cull mode not recognized`
   (cause: `gl.cullFace(gl.BACK_FACE)` — valid enum is `gl.BACK`).
   Fix: per-face normals + directional diffuse (`vLight = max(dot(n,lightDir),0)*0.7+0.3`),
   `gl.cullFace(gl.BACK); gl.frontFace(gl.CCW)`. Re-ran: 0 GL errors in 6/7 configs.
2. FAIL (diagnostics critic): probe `adapterInfo:{}` (JSON.stringify of GPUAdapterInfo getters),
   missing Paravirtual disclaimer + docs citation.
   Fix: explicit field extraction (vendor/architecture/device/description) in probe.mjs;
   docs + disclaimers block written into evidence/_matrix-summary.json. Re-ran: vendor=apple captured.

## Captures (preserved, inspect via SSH)
- evidence/*.png (7) + evidence/*.json (7) + evidence/_matrix-summary.json
- evidence/logs/matrix-stdout.log + matrix-stderr.log (first run, unlit + cull bug)
- evidence/logs/matrix-stdout-rerun.log + matrix-stderr-rerun.log (final run, lit + fixed)
- Per-run stdout JSON lines preserved; no stderr swallowed (final stderr empty = clean).

## Next actions
- [ ] Optional: fresh-context critic re-run on rerun evidence to confirm PASS (loop exit).
- [ ] Do NOT commit here — leave all changes uncommitted for the workflow.
