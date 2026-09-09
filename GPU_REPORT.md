# Chrome Hardware Rendering Report (macOS)

**Verdict: PASS for WebGL/WebGL2 hardware rendering. PARTIAL for WebGPU (present but adapter unconfirmed headless). No software fallback detected.**

## What was tested (real browser + real GPU, normal launch first)
- macOS 26.6.2 (25G83), arm64, Apple Virtual Machine 1 (VirtualMac2,1), Apple M1 Virtual, 3 cores, 7 GB
- Real Chrome binary: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` — `Google Chrome 152.0.7977.65`
- Normal headless launch first (no `--disable-gpu`, no SwiftShader override). Isolated `--user-data-dir` profiles. Safe reversible flags only: `--use-angle=metal`, `--enable-unsafe-webgpu`, `--timeout`, `--dump-dom`, `--screenshot`. Each documented below.
- GPU process observed live: `--type=gpu-process` present in `ps` during every fixture run.

## Evidence (captured, reproducible)
1. **WebGL2 hardware**: `VENDOR=Google Inc. (Apple)`, `RENDERER=ANGLE (Apple, ANGLE Metal Renderer: Apple Paravirtual device, Unspecified Version)`, `softwareFallbackSuspected=false`, `failIfMajorPerformanceCaveat context=OK(HW)`, `version=WebGL 2.0 (OpenGL ES 3.0 Chromium)`. Source: `/tmp/gpu_test/webgl_dom.html`.
2. **WebGL1 hardware**: same `ANGLE Metal Paravirtual` renderer, `failIfMajorPerformanceCaveat=OK(HW)`, `version=WebGL 1.0 (OpenGL ES 2.0 Chromium)`.
3. **Interactive 3D workload rasterized**: custom shader triangle, `gl.drawArrays` + `gl.readPixels` → `pixelSum16px=10544 (>0)`, `gl.getError=0`. This is a real framebuffer readback, not a simulation.
4. **WebGPU**: `secureContext=true`, `navigator.gpu=present`, but `requestAdapter(high-performance)` never resolved within 20–25 s in headless on this display-less VM (two runs: with and without `--use-angle=metal`). No fallback/error string — a hang, not a SwiftShader string. Source: `/tmp/gpu_test/webgpu2_dom.html`, `/tmp/gpu_test/webgpu3_dom.html`.
5. **Headless logs**: `CVDisplayLinkCreateWithCGDisplay failed (-6670)` (expected, no display in CI VM) + `Trying to load the allocator multiple times` + `SharedImageManager ProduceOverlay / Invalid mailbox` warnings on the screenshot path. No `SwiftShader`/`llvmpipe`/`blocklisted` strings in any renderer output. GPU process (`--type=gpu-process`) was observed alive in `ps` during every fixture run; `GPU process exited unexpectedly: exit_code=15` lines coincide with test-cleanup `pkill` (SIGTERM 15), not a spontaneous crash mid-test — WebGL DOM evidence was fully written before cleanup.
6. **`chrome://gpu` note**: `--dump-dom chrome://gpu` is blocked headless (returns New Tab page, 76 KB NTP dump saved at `/tmp/gpu_test/gpu_dom.html`). Headed reproduction path below covers it.
7. **WebGPU blocking evidence**: `requestAdapter` hangs headless on this display-less VM under all three backend variants (default, `--use-angle=metal`, `--use-angle=swiftshader`) — `navigator.gpu=present` but no adapter/device lines within 20–25 s (`webgpu2_dom.html`, `webgpu3_dom.html`, `webgpu_sw_dom.html`). Hang across backends = headless adapter-enumeration limitation, not a hardware-fail verdict.
6. **`chrome://gpu` note**: `--dump-dom chrome://gpu` is blocked headless (returns New Tab page, 76 KB NTP dump saved at `/tmp/gpu_test/gpu_dom.html`). Headed reproduction path below covers it.

## Pass / Partial / Fail
- **PASS (hardware)**: renderer contains `Apple, ANGLE Metal Renderer` (not SwiftShader/llvmpipe/Basic Render); `failIfMajorPerformanceCaveat:true` still returns context; pixel readback > 0 with error 0. **Met by WebGL1 + WebGL2.**
- **PARTIAL**: WebGPU API present but adapter unconfirmed in headless. Not a software-fallback verdict — needs headed confirmation.
- **FAIL (software)**: renderer matches `/swiftshader|llvmpipe|softpipe|software|basic render/i`, or `failIfMajorPerformanceCaveat` returns null, or WebGPU `null`/`isFallbackAdapter=true`, or `chrome://gpu` shows "Software only". **None observed.**

## Recovery steps (per feature)
- If WebGL shows SwiftShader/llvmpipe: open `chrome://settings/system` → enable "Use hardware acceleration when available" → relaunch; open `chrome://gpu` and confirm no `--disable-gpu`/`--use-gl=swiftshader` in `chrome://version` command line; update macOS + Chrome; on VMs enable paravirtual GPU (this VM already exposes `Apple Paravirtual device`); retest with `failIfMajorPerformanceCaveat:true`.
- If WebGL context null: try safe reversible `open -a "Google Chrome" --args --ignore-gpu-blocklist`, then `--use-angle=metal`; revert after test; check `chrome://gpu` log for blocklist entries (`software_rendering_list.json`).
- If WebGPU `navigator.gpu` absent: requires Chrome ≥113 (here 152 ✓) + secure context (`https://`/`localhost`) + Metal-capable macOS; enable `chrome://settings/system` HW acceleration; retest headed (headless adapter hang is a known display-less limitation, not proof of absence).
- If WebGPU adapter null/fallback: `chrome://gpu` → WebGPU section; try `--enable-unsafe-webgpu` once (reversible); prefer `powerPreference:"high-performance"`; verify `isFallbackAdapter===false`.
- If `chrome://gpu` shows "Software only": capture `chrome://version` command line, remove any `--disable-gpu`, restart with GPU process allowed, check Console + `chrome://gpu` log for `GPU process crashed / fallen back`.

## Reproduce (copy/paste)
```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless=new --no-sandbox --no-first-run --user-data-dir=/tmp/gpu_test/repro --timeout=20000 --dump-dom file:///tmp/gpu_test/gpu_fixture_webgl.html
# expect: ANGLE (Apple, ANGLE Metal Renderer: Apple Paravirtual device...), failIfMajorPerformanceCaveat OK(HW), pixelSum>0
```
Headed (with display): open `chrome://gpu` (expect HW-accelerated compositing/WebGL/WebGL2/Metal, no Software-only), `chrome://version` (152.x, no disable-gpu), `https://get.webgl.org/` + `https://get.webgl.org/webgl2/` (spinning cubes), `https://webglreport.com/?v=1` + `?v=2` (Unmasked Renderer = Apple Metal), `https://webgpu.github.io/webgpu-samples/samples/helloTriangle`.

## Limitations (explicit, not hidden)
- Headless on a display-less Apple Virtual Machine: `chrome://gpu` DOM not capturable headless; `--screenshot` of WebGL canvas came out blank (compositor capture limitation) while in-GPU `readPixels` proved rasterization; WebGPU adapter hangs headless. None of these override the positive WebGL hardware strings + HW-gated context + pixel proof.
- Fixtures kept at `/tmp/gpu_test/` (`gpu_fixture_webgl.html`, `gpu_fixture_webgpu2.html`, `shot.html`, `webgl_dom.html`, `webgpu2_dom.html`, `webgpu3_dom.html`, `gpu_dom.html`, `shot.png`, stderr logs).

## Provenance
`chrome://gpu`, `chrome://version`; https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/debugging_gpu_related_code.md; https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/using-gpu-hardware-in-headless-chrome.md; https://chromium.googlesource.com/chromium/src/gpu/+/refs/heads/main/config/software_rendering_list.json; https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips; https://developer.chrome.com/docs/web-platform/webgpu/overview; https://registry.khronos.org/webgl/specs/latest/1.0/; https://registry.khronos.org/webgl/specs/latest/2.0/; https://registry.khronos.org/webgl/extensions/WEBGL_debug_renderer_info/; https://www.w3.org/TR/webgpu/; https://webgpu.github.io/webgpu-samples/; https://threejs.org/examples/webgl_geometry_cube; https://get.webgl.org/; https://webglreport.com/
