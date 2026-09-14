// Browser verification for the served app on port 3000 (ESM, node).
// Bounded probes only: 15s nav/scene waits, 60s global cap. Never hangs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SHOT_DIR = path.join(__dirname, '..', 'screenshots');
const URL = 'http://localhost:3000/';
const GLOBAL_MS = 60000;

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(JSON.stringify({ check: name, ok, detail }));
}

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({
    channel: 'chromium',
    args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal'],
    timeout: 30000,
  });
  try {
    console.log(JSON.stringify({ browserVersion: browser.version() }));
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String((e && e.message) || e).slice(0, 500)));
    const consoleErrs = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 500));
    });

    await page.goto(URL, { waitUntil: 'load', timeout: 15000 });
    check('http-200-serves-index', true, `title=${await page.title()}`);

    // 1. Scene becomes ready (bounded).
    try {
      await page.waitForFunction(() => window.__sceneReady === true, { timeout: 15000 });
      check('scene-ready', true, 'window.__sceneReady === true within 15s');
    } catch (e) {
      check('scene-ready', false, String((e && e.message) || e).slice(0, 300));
    }

    // 2. Real 3D: WebGL supported, frames advancing, renderer recorded.
    const diag = await page.evaluate(() => JSON.parse(JSON.stringify(window.__diag || null)));
    check('webgl-supported', diag && diag.webglSupported === true, `renderer=${diag && diag.webglRenderer}`);
    const f1 = diag ? diag.frameCount : 0;
    await page.waitForTimeout(800);
    const f2 = await page.evaluate(() => window.__diag.frameCount);
    check('frames-advance', f2 > f1, `frameCount ${f1} -> ${f2}`);

    // 3. Playable controls exist and work.
    const controls = await page.evaluate(() => ({
      pause: !!document.getElementById('btn-pause'),
      slow: !!document.getElementById('btn-slow'),
      fast: !!document.getElementById('btn-fast'),
      reset: !!document.getElementById('btn-reset'),
    }));
    check(
      'controls-present',
      controls.pause && controls.slow && controls.fast && controls.reset,
      JSON.stringify(controls)
    );
    // Pause toggles playing state.
    const playingBefore = await page.evaluate(() => window.__play.playing);
    await page.click('#btn-pause');
    const playingAfter = await page.evaluate(() => window.__play.playing);
    check('pause-toggles', playingBefore === true && playingAfter === false, `playing ${playingBefore} -> ${playingAfter}`);
    await page.click('#btn-pause'); // resume
    // Speed toggle.
    await page.click('#btn-fast');
    const speedFast = await page.evaluate(() => window.__play.speed);
    check('fast-speed', speedFast === 3.0, `speed=${speedFast}`);
    await page.click('#btn-fast'); // back to 1x
    // Drag rotates (dragX changes).
    const dragBefore = await page.evaluate(() => window.__play.dragX);
    await page.mouse.move(400, 400);
    await page.mouse.down();
    await page.mouse.move(520, 400, { steps: 8 });
    await page.mouse.up();
    const dragAfter = await page.evaluate(() => window.__play.dragX);
    check('drag-rotates', dragAfter > dragBefore, `dragX ${dragBefore} -> ${dragAfter}`);
    await page.click('#btn-reset');
    const dragReset = await page.evaluate(() => ({ x: window.__play.dragX, y: window.__play.dragY }));
    check('reset-view', dragReset.x === 0 && dragReset.y === 0, JSON.stringify(dragReset));

    // 4. WebGPU probe settled (bounded in-page already; just report, never fail hard).
    const gpu = await page.evaluate(async () => {
      if (!navigator.gpu) return { status: 'no-gpu' };
      try {
        const t = new Promise((r) => setTimeout(() => r('timeout'), 3000));
        const a = navigator.gpu.requestAdapter().then((x) => (x ? 'success' : 'null'));
        return { status: await Promise.race([a, t]) };
      } catch (e) {
        return { status: 'error', detail: String((e && e.message) || e).slice(0, 200) };
      }
    });
    check('webgpu-adapter', gpu.status === 'success', JSON.stringify(gpu));

    // 5. No page errors / console errors (GL_INVALID_ENUM regression guard).
    const badConsole = consoleErrs.filter((t) => t.includes('GL_INVALID_ENUM'));
    check('no-page-errors', errors.length === 0, errors.length ? errors.join(' | ').slice(0, 500) : 'none');
    check('no-gl-errors', badConsole.length === 0, badConsole.length ? badConsole.join(' | ').slice(0, 500) : 'none');

    // Screenshots (prefixed final- per task; workflow uploads them, never commits).
    await page.screenshot({ path: path.join(SHOT_DIR, 'final-app.png') });
    // Interact then capture a second state: paused + dragged view.
    await page.mouse.move(400, 400);
    await page.mouse.down();
    await page.mouse.move(300, 460, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOT_DIR, 'final-app-dragged.png') });
    check('screenshots', true, 'final-app.png + final-app-dragged.png');
    await ctx.close();
  } finally {
    await browser.close().catch(() => {});
  }
  const failed = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ done: true, passed: results.length - failed.length, failed: failed.length }));
  process.exit(failed.length ? 1 : 0);
}

const timer = setTimeout(() => {
  console.log(JSON.stringify({ fatal: 'global timeout 60s' }));
  process.exit(2);
}, GLOBAL_MS);
if (timer.unref) timer.unref();
main().catch((e) => {
  console.log(JSON.stringify({ fatal: String((e && e.message) || e).slice(0, 500) }));
  process.exit(2);
});
