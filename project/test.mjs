import { existsSync, statSync } from 'fs';
const files = ['project/index.html', 'project/main.js', 'project/style.css', 'project/public/models/spaceship.glb'];
let ok = true;
for (const f of files) {
  const e = existsSync(f);
  const sz = e ? statSync(f).size : 0;
  console.log(`${e ? 'OK  ' : 'MISS'} ${f} (${sz} bytes)`);
  if (!e || sz === 0) ok = false;
}
// sanity: main.js must contain game loop markers
import { readFileSync } from 'fs';
const main = readFileSync('project/main.js', 'utf8');
for (const token of ['GLTFLoader', 'startGame', 'TOTAL_STARS', 'requestAnimationFrame']) {
  const has = main.includes(token);
  console.log(`${has ? 'OK  ' : 'MISS'} main.js contains "${token}"`);
  if (!has) ok = false;
}
if (!ok) { console.error('SMOKE TEST FAILED'); process.exit(1); }
console.log('SMOKE TEST PASSED');
