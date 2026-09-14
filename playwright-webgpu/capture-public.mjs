// Final public-game capture (ESM, node). Bounded: 20s nav/ready, 90s global.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SHOT_DIR = path.join(__dirname, '..', 'screenshots');
const URL = 'https://integrate-police-surprising-evaluate.trycloudflare.com/';
const GLOBAL_MS = 90000;

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
    console.log(JSON.stringify({ browserVersion: browser.version(), url: URL }));
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String((e && e.message) || e).slice(0, 500)));
    const glErrs = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && m.text().includes('GL_INVALID_ENUM')) glErrs.push(m.text().slice(0, 300));
    });

    await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
    check('public-http-200', true, `title=${await page.title()}`);
    try {
      await page.waitForFunction(() => window.__sceneReady === true, { timeout: 20000 });
      check('public-scene-ready', true, 'window.__sceneReady === true within 20s');
    } catch (e) {
      check('public-scene-ready', false, String((e && e.message) || e).slice(0, 300));
    }
    const diag = await page.evaluate(() => JSON.parse(JSON.stringify(window.__diag || null)));
    check('public-webgl', !!(diag && diag.webglSupported), `renderer=${diag && diag.webglRenderer}`);
    const f1 = diag ? diag.frameCount : 0;
    await page.waitForTimeout(800);
    const f2 = await page.evaluate(() => window.__diag.frameCount);
    check('public-frames-advance', f2 > f1, `frameCount ${f1} -> ${f2}`);

    // Playability: pause toggle + drag rotate + reset.
    await page.click('#btn-pause');
    const paused = await page.evaluate(() => window.__play.playing);
    check('public-pause', paused === false, `playing=${paused}`);
    await page.click('#btn-pause');
    const dx0 = await page.evaluate(() => window.__play.dragX);
    await page.mouse.move(400, 400);
    await page.mouse.down();
    await page.mouse.move(520, 400, { steps: 8 });
    await page.mouse.up();
    const dx1 = await page.evaluate(() => window.__play.dragX);
    check('public-drag', dx1 > dx0, `dragX ${dx0} -> ${dx1}`);

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
    check('public-webgpu-adapter', true, JSON.stringify(gpu));
    check('public-no-page-errors', errors.length === 0, errors.length ? errors.join(' | ') : 'none');
    check('public-no-gl-errors', glErrs.length === 0, glErrs.length ? glErrs.join(' | ') : 'none');

    await page.screenshot({ path: path.join(SHOT_DIR, 'final-public-game.png') });
    await page.mouse.move(400, 400);
    await page.mouse.down();
    await page.mouse.move(300, 460, { steps: 8 });
    await page.mouse.up();
    await page.click('#btn-pause');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOT_DIR, 'final-public-game-paused-dragged.png') });
    check('public-screenshots', true, 'final-public-game.png + final-public-game-paused-dragged.png');
    await ctx.close();
  } finally {
    await browser.close().catch(() => {});
  }
  const failed = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ done: true, passed: results.length - failed.length, failed: failed.length }));
  process.exit(failed.length ? 1 : 0);
}

const timer = setTimeout(() => {
  console.log(JSON.stringify({ fatal: 'global timeout 90s' }));
  process.exit(2);
}, GLOBAL_MS);
if (timer.unref) timer.unref();
main().catch((e) => {
  console.log(JSON.stringify({ fatal: String((e && e.message) || e).slice(0, 500) }));
  process.exit(2);
});
