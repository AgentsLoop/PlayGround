// App verification: loads the tmux app-server page on :3000 in channel Chromium
// (Metal WebGPU flags), asserts boot markers, exercises drag-to-play, captures
// final-* screenshots under <repo>/screenshots/.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(REPO, 'screenshots');
const URL = 'http://127.0.0.1:3000/';
await fs.mkdir(SHOTS, { recursive: true });

const failures = [];
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures.push(name);
};

const browser = await chromium.launch({
  channel: 'chromium', headless: true, timeout: 60000,
  args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal'],
});
console.log('browserVersion', browser.version());
const page = await browser.newPage({ viewport: { width: 900, height: 760 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String((e && e.stack) || e)));

await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
check('serves index.html entrypoint', await page.evaluate(() => document.title.includes('PlayGround 3D')), await page.title());
try {
  await page.waitForFunction(() => window.__done === true, null, { timeout: 20000 });
  check('scene boot marker __done', true);
} catch { check('scene boot marker __done', false); }

const state = await page.evaluate(() => ({ done: window.__done, scene: window.__scene, errors: window.__errors }));
check('WebGL cube ok', !!(state.scene && state.scene.gl && state.scene.gl.ok), JSON.stringify((state.scene && state.scene.gl) || null).slice(0, 200));
check('WebGPU triangle rendered', !!(state.scene && state.scene.webgpu && state.scene.webgpu.rendered), JSON.stringify((state.scene && state.scene.webgpu && (state.scene.webgpu.adapterInfo || state.scene.webgpu.reason)) || null).slice(0, 200));
check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await page.screenshot({ path: path.join(SHOTS, 'final-app.png') });
// playability: drag the cube, confirm angle changed and re-rendered frame differs
const before = await page.evaluate(() => ({ ...window.__play }));
await page.mouse.move(200, 300); await page.mouse.down();
await page.mouse.move(320, 360, { steps: 12 }); await page.mouse.up();
await page.waitForTimeout(600);
const after = await page.evaluate(() => ({ ...window.__play }));
check('drag-to-rotate changes angle', before.ay !== after.ay || before.ax !== after.ax, `ay ${before.ay} -> ${after.ay}`);
await page.screenshot({ path: path.join(SHOTS, 'final-app-interaction.png') });
check('final screenshots written', await fs.stat(path.join(SHOTS, 'final-app.png')).then(s => s.size > 10000).catch(() => false));

await fs.writeFile(path.join(SHOTS, 'verify-output.txt'),
  [`url=${URL}`, `browser=${browser.version()}`, `checks=${failures.length === 0 ? 'ALL-PASS' : 'FAILURES:' + failures.join(',')}`,
   `webgl=${JSON.stringify(state.scene?.gl)}`, `webgpu=${JSON.stringify(state.scene?.webgpu?.rendered)} errors=${JSON.stringify(errors)}`].join('\n'));
await browser.close().catch(() => {});
if (failures.length) { console.error('FAILURES:', failures.join(', ')); process.exit(1); }
console.log('VERIFY ALL-PASS');
