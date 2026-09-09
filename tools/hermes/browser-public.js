const puppeteer = require('puppeteer-core');
const assert = require('node:assert');
const fs = require('node:fs');

const URL = process.env.GAME_URL || 'https://researchers-clarity-remove-rebates.trycloudflare.com/index.html';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-gpu', '--headless=new'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 600 });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push('console: ' + m.text()); });

    await page.goto(URL, { waitUntil: 'networkidle0', timeout: 45000 });
    await page.waitForSelector('#game', { timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));

    const s1 = await page.evaluate(() => ({ tick: window.__game.state.tick, score: window.__game.state.score }));
    assert.ok(s1.tick > 0, 'game loop must advance ticks, got ' + JSON.stringify(s1));
    const hud = await page.$eval('#hud', el => el.textContent);
    assert.match(hud, /tick \d+/, 'HUD must show tick, got: ' + hud);

    fs.mkdirSync('screenshots', { recursive: true });
    await page.screenshot({ path: 'screenshots/final-game.png' });
    const x0 = await page.evaluate(() => window.__game.state.x);
    await page.keyboard.down('ArrowRight');
    await new Promise(r => setTimeout(r, 800));
    await page.keyboard.up('ArrowRight');
    const x1 = await page.evaluate(() => window.__game.state.x);
    await page.screenshot({ path: 'screenshots/final-gameplay.png' });
    assert.ok(errors.length === 0, 'no page errors expected, got: ' + JSON.stringify(errors));
    console.log('PUBLIC BROWSER CHECK PASS', JSON.stringify({ url: URL, ticks: s1.tick, hud, movedFromX: x0, movedToX: x1 }));
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('PUBLIC BROWSER CHECK FAIL:', e.message); process.exit(1); });
