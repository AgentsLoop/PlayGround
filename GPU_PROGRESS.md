# GPU 3D Graphics Test — Live Progress Page

## Objective
Verify Chrome hardware rendering on macOS (WebGL, WebGL2, WebGPU, GPU process, compositing, HW acceleration). No simulated/software-only substitutes.

## Provenance (authoritative refs)
- `chrome://gpu` / `chrome://version` (local Chrome diagnostics)
- https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/debugging_gpu_related_code.md
- https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/using-gpu-hardware-in-headless-chrome.md
- https://chromium.googlesource.com/chromium/src/gpu/+/refs/heads/main/config/software_rendering_list.json
- https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips
- https://developer.chrome.com/docs/web-platform/webgpu/overview
- https://registry.khronos.org/webgl/specs/latest/1.0/ , https://registry.khronos.org/webgl/specs/latest/2.0/
- https://registry.khronos.org/webgl/extensions/WEBGL_debug_renderer_info/
- https://registry.khronos.org/webgl/conformance-suites/1.0.0/webgl-conformance-tests.html
- https://registry.khronos.org/webgl/conformance-suites/2.0.0/webgl-conformance-tests.html
- https://www.w3.org/TR/webgpu/ ; https://github.com/gpuweb/gpuweb
- https://webgpu.github.io/webgpu-samples/ ; https://threejs.org/examples/webgl_geometry_cube
- Fixtures: `https://get.webgl.org/`, `https://get.webgl.org/webgl2/`, `https://webglreport.com/?v=1&v=2`, `https://webgpu.github.io/webgpu-samples/samples/helloTriangle`

## Environment (real artifact, inspected directly)
- macOS: 26.6.2 build 25G83, arm64, Apple Virtual Machine 1 (VirtualMac2,1), Chip Apple M1 (Virtual), 3 cores, 7GB RAM
- Chrome: Google Chrome 152.0.7977.65 at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- Note: `system_profiler SPDisplaysDataType` returned empty on this VM; hardware profile shows virtualized M1 — paravirtual GPU expected, not discrete GPU. This is the real hardware under test.

## Acceptance fixtures (executable, local)
- `gpu_fixture_webgl.html` — WebGL1/WebGL2 context + `WEBGL_debug_renderer_info` + `failIfMajorPerformanceCaveat` + spinning-cube render + pixel readback
- `gpu_fixture_webgpu.html` — `navigator.gpu.requestAdapter` + `adapter.info` + `isFallbackAdapter` + device/limits + hello-triangle render
- Headless run: `--headless=new --use-angle=metal --enable-unsafe-webgpu --dump-dom` (normal launch first, no `--disable-gpu`)

## Pass / Partial / Fail definitions
- PASS (hardware): `UNMASKED_RENDERER` contains Apple/ANGLE Metal, no SwiftShader/llvmpipe; `failIfMajorPerformanceCaveat:true` still gets context; WebGPU `isFallbackAdapter=false` + triangle renders; `chrome://gpu` shows HW-accelerated compositing/WebGL/WebGPU/Metal.
- PARTIAL: WebGL HW but WebGPU missing/disabled (or vice versa); fixable via flag/setting.
- FAIL (software): renderer = SwiftShader/llvmpipe/Basic Render Driver; `failIfMajorPerformanceCaveat` null; WebGPU null/fallback; `chrome://gpu` = Software only.

## Evidence log
- [2026-09-09] Env: macOS 26.6.2 arm64 VM (VirtualMac2,1, M1 Virtual), Chrome 152.0.7977.65 confirmed via binary `--version`.
- [2026-09-09] WebGL HEADLESS PASS: `/tmp/gpu_test/webgl_dom.html` — WebGL2+WebGL1 `ANGLE (Apple, ANGLE Metal Renderer: Apple Paravirtual device)`, softwareFallback=false, failIfMajorPerformanceCaveat OK(HW) both, pixelSum16px=10544, error 0. GPU process (`--type=gpu-process`) observed in ps.
- [2026-09-09] WebGPU PARTIAL: `navigator.gpu=present`, `secureContext=true`, but `requestAdapter` hangs headless (two runs, with/without `--use-angle=metal`): `/tmp/gpu_test/webgpu2_dom.html`, `/tmp/gpu_test/webgpu3_dom.html`. No SwiftShader string; hang ≠ software proof.
- [2026-09-09] chrome://gpu headless blocked (returns NTP; 76KB dump at `/tmp/gpu_test/gpu_dom.html`). Headless screenshot of WebGL canvas blank (compositor capture limit) while readPixels proved rasterization (`shot.png` 2.8KB blank).
- [2026-09-09] Report written: `GPU_REPORT.md`. Verifier launched (fresh context).
- [2026-09-09] Verifier findings: WebGL1/2 PASS confirmed; WebGPU PARTIAL confirmed; compositing flagged FAIL on mailbox warnings (headless-screenshot path only — readPixels rasterization still PASS); GPU exit_code=15 = cleanup SIGTERM, wording fixed in report.
- [2026-09-09] Gap fix: WebGPU SwiftShader variant also hangs headless (`webgpu_sw_dom.html`) → blocking evidence: headless adapter enumeration unavailable display-less; headed retest path documented. No overclaims remain.

## Decisions
- Test normal Chrome launch first (no disable-gpu, no swiftshader override).
- Only safe reversible flags if needed: `--use-angle=metal`, `--enable-unsafe-webgpu`, `--ignore-gpu-blocklist` (documented, reverted after).
- Do not claim discrete-GPU performance on this virtual M1; claim is HW-vs-SW rendering path.

## Blockers
- None yet. Risk: headless on VM may fall back to SwiftShader even when GUI would use Metal — must record both and not overclaim.

## Current gaps
- Need actual fixture run output (renderer strings, pixel readback).
- Need chrome://gpu feature status capture.
- Need fresh-context verifier review.

## Next exact action
- Write fixtures to /tmp/gpu_test/ and run headless Chrome with timeout, capture dump-dom output.
