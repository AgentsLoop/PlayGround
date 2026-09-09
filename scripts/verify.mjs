import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const root = process.cwd();
const fail = (message) => {
  console.error(`verify: FAIL — ${message}`);
  process.exit(1);
};

for (const file of ['index.html', 'package.json', 'start.mjs', 'styles.css', 'app.js', 'evidence.json']) {
  if (!existsSync(`${root}/${file}`)) fail(`missing ${file}`);
}
const pkg = JSON.parse(await readFile(`${root}/package.json`, 'utf8'));
if (!pkg.scripts || !pkg.scripts.start) fail('package.json missing scripts.start');
const html = await readFile(`${root}/index.html`, 'utf8');
if (!html.includes('omg-e2e-dashboard')) fail('index.html missing dashboard marker');

const port = 3000;
const server = spawn('node', ['start.mjs', '--port', String(port)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const stop = () => server.kill('SIGTERM');
process.on('exit', stop);

let ok = false;
let body = '';
for (let attempt = 0; attempt < 30; attempt += 1) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`);
    body = await response.text();
    const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
    if (response.ok && body.includes('OMG E2E') && health && health.ok) {
      ok = true;
      break;
    }
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
if (!ok) {
  stop();
  fail('server did not serve dashboard + /health on :3000');
}
console.log('verify: server ok on :3000, marker + /health present');

let screenshots = [];
try {
  const files = await readdir(`${root}/screenshots`);
  screenshots = files.filter((f) => /^final-.*\.(png|jpg|jpeg|webp)$/i.test(f));
} catch {
  // missing dir treated as no screenshots
}
stop();
if (screenshots.length === 0) fail('no screenshots/final-* evidence image found');
console.log(`verify: PASS — screenshots: ${screenshots.join(', ')}`);
