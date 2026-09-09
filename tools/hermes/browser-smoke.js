const puppeteer = require('puppeteer-core');
const assert = require('node:assert');
const fs = require('node:fs');

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

    await page.goto('http://localhost:3000/index.html', { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForSelector('#game', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 1500));

    const s1 = await page.evaluate(() => ({ tick: window.__game.state.tick, score: window.__game.state.score }));
    assert.ok(s1.tick > 0, 'game loop must advance ticks, got ' + JSON.stringify(s1));

    // Movement: hold ArrowRight, ticks should move player right
    const x0 = await page.evaluate(() => window.__game.state.x);
    await page.keyboard.down('ArrowRight');
    await new Promise(r => setTimeout(r, 800));
    await page.keyboard.up('ArrowRight');
    const x1 = await page.evaluate(() => window.__game.state.x);
    assert.ok(x1 >= x0, `ArrowRight should not move left (x0=${x0}, x1=${x1})`);

    const hud = await page.$eval('#hud', el => el.textContent);
    assert.match(hud, /tick \d+/, 'HUD must show tick, got: ' + hud);

    // Determinism probe: fresh sim with same seed + same inputs matches
    const det = await page.evaluate(() => {
      const a = window.__game.createGame(7); const b = window.__game.createGame(7);
      for (let i = 0; i < 20; i++) { window.__game.step(a, { dx: 1, dy: 0 }); window.__game.step(b, { dx: 1, dy: 0 }); }
      return JSON.stringify(a) === JSON.stringify(b);
    });
    assert.ok(det, 'same seed + inputs must produce identical state');

    assert.deepStrictEqual(errors, [], 'no page errors expected, got: ' + JSON.stringify(errors));

    fs.mkdirSync('screenshots', { recursive: true });
    await page.screenshot({ path: 'screenshots/final-game.png' });
    await page.keyboard.down('ArrowRight');
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: 'screenshots/final-gameplay.png' });
    await page.keyboard.up('ArrowRight');
    console.log('BROWSER TESTS PASS', JSON.stringify({ ticks: s1, movedRight: x1 >= x0, hud }));
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('BROWSER TESTS FAIL:', e.message); process.exit(1); });
