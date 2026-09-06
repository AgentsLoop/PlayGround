const { chromium } = require('/tmp/shot/node_modules/playwright-core');
(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const bad = [];
  page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().slice(-90)); });
  page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
  await page.goto('http://localhost:8123/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  console.log('DIAG', JSON.stringify(await page.evaluate(() => window.__diag()), null, 1).slice(0, 3000));
  console.log('BAD-URLS', JSON.stringify(bad.slice(0, 10)));
  await browser.close();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
