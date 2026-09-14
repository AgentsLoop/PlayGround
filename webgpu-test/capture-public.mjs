// Final capture: playable game at the public tunnel URL.
// Screenshots go to <repo>/screenshots/final-public-*.png (gitignored; workflow uploads).
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(REPO, 'screenshots');
const URL = process.env.PUBLIC_URL || 'https://anthony-meetings-roots-marketing.trycloudflare.com';
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

await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
check('public page loads PlayGround 3D', await page.evaluate(() => document.title.includes('PlayGround 3D')), await page.title());
try {
  await page.waitForFunction(() => window.__done === true, null, { timeout: 25000 });
  check('scene boot marker __done', true);
} catch { check('scene boot marker __done', false); }
const state = await page.evaluate(() => ({ scene: window.__scene, errors: window.__errors }));
check('WebGL cube ok', !!(state.scene?.gl?.ok), (state.scene?.gl?.renderer || '').slice(0, 120));
check('WebGPU triangle rendered', !!(state.scene?.webgpu?.rendered), `rendered=${state.scene?.webgpu?.rendered}`);
check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await page.screenshot({ path: path.join(SHOTS, 'final-public-game.png') });
const before = await page.evaluate(() => ({ ...window.__play }));
await page.mouse.move(200, 300); await page.mouse.down();
await page.mouse.move(330, 370, { steps: 12 }); await page.mouse.up();
await page.waitForTimeout(600);
const after = await page.evaluate(() => ({ ...window.__play }));
check('drag-to-play rotates cube', before.ay !== after.ay, `ay ${before.ay} -> ${after.ay}`);
await page.screenshot({ path: path.join(SHOTS, 'final-public-game-play.png') });

await fs.writeFile(path.join(SHOTS, 'final-public-verify.txt'),
  [`url=${URL}`, `browser=${browser.version()}`, `result=${failures.length === 0 ? 'ALL-PASS' : 'FAILURES:' + failures.join(',')}`,
   `webgl=${JSON.stringify(state.scene?.gl)}`, `webgpu_rendered=${state.scene?.webgpu?.rendered}`, `pageerrors=${JSON.stringify(errors)}`].join('\n'));
await browser.close().catch(() => {});
if (failures.length) { console.error('FAILURES:', failures.join(', ')); process.exit(1); }
console.log('PUBLIC VERIFY ALL-PASS');
