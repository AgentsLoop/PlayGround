const { chromium } = require('/tmp/shot/node_modules/playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(process.argv[2] || 'http://127.0.0.1:8123/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  const info = await page.evaluate(() => ({
    meshes: (() => { let n = 0; window.__renamon?.model.traverse((o) => { if (o.isMesh) n++; }); return n; })(),
    console: true,
  }));
  console.log('INFO', JSON.stringify(info));
  console.log('ERRORS', JSON.stringify(errors.slice(0, 5)));
  await page.screenshot({ path: process.argv[3] || 'shot.png' });
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
