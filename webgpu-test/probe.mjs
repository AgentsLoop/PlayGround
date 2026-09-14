// Bounded Playwright probe matrix for Chromium WebGPU on macOS.
// Compares: baseline bundled Chromium vs channel=chromium + Metal WebGPU flags,
// plus a SEPARATE Vulkan variant (not assumed suitable on macOS).
// Headless vs headed compared. All probes bounded; absent adapters recorded, never skipped.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

// Pure-node PNG decoder (8-bit, non-interlaced RGB/RGBA) — lets the
// nonblank metric measure the actual screenshot files instead of trying
// to sample a WebGPU canvas through drawImage (which reads back blank).
function pngStats(buf) {
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) return { error: 'not-png' };
  let pos = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || ![2, 6].includes(colorType)) return { error: `unsupported bitDepth=${bitDepth} colorType=${colorType}` };
  const ch = colorType === 6 ? 4 : 3;
  let raw;
  try { raw = zlib.inflateSync(Buffer.concat(idat)); } catch (e) { return { error: 'inflate-failed' }; }
  const stride = width * ch, colors = new Set();
  let prev = Buffer.alloc(stride), sum = 0, n = 0;
  let p = 0;
  for (let y = 0; y < height; y++) {
    const f = raw[p++];
    const row = Buffer.alloc(stride);
    raw.copy(row, 0, p, p + stride); p += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? row[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v;
      if (f === 0) v = row[i]; else if (f === 1) v = (row[i] + a) & 255; else if (f === 2) v = (row[i] + b) & 255;
      else if (f === 3) v = (row[i] + ((a + b) >> 1)) & 255;
      else { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v = (row[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
      row[i] = v;
    }
    for (let i = 0; i < stride; i += ch) { colors.add((row[i] << 16) | (row[i + 1] << 8) | row[i + 2]); sum += row[i] + row[i + 1] + row[i + 2]; n++; }
    prev = row;
    if (colors.size > 5000 && y > height / 4) break; // early-out: already proven nonblank
  }
  return { width, height, distinctColors: colors.size, mean: +(sum / Math.max(n, 1)).toFixed(2), nonblank: colors.size > 2 };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCENE = path.join(__dirname, 'scene.html');
const OUT = path.join(__dirname, 'results');
const EVAL_TIMEOUT = 15000;

const METAL_FLAGS = ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal'];
const VULKAN_FLAGS = ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--enable-features=Vulkan', '--use-angle=vulkan', '--disable-vulkan-surface'];

const MATRIX = [
  { name: 'A-baseline-bundled-headless', channel: undefined, headless: true,  args: [], note: 'baseline: bundled chromium, stock Playwright defaults' },
  { name: 'B-metal-channel-headless',    channel: 'chromium', headless: true,  args: METAL_FLAGS, note: 'proposed macOS path: full chromium + Metal ANGLE + unsafe-webgpu + ignore-blocklist' },
  { name: 'C-metal-channel-headed',      channel: 'chromium', headless: false, args: METAL_FLAGS, note: 'headed comparison (may fail without display on CI — recorded honestly)' },
  { name: 'D-vulkan-channel-headless',   channel: 'chromium', headless: true,  args: VULKAN_FLAGS, note: 'SEPARATE Vulkan variant; NOT assumed suitable on macOS' },
];

function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer(async (req, res) => {
      try {
        const html = await fs.readFile(SCENE, 'utf8');
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(html);
      } catch (e) { res.writeHead(500); res.end(String(e)); }
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function boundedEval(page, fn, timeoutMs = EVAL_TIMEOUT) {
  return await Promise.race([
    page.evaluate(fn),
    new Promise((_, rej) => setTimeout(() => rej(new Error(`evaluate outer-timeout ${timeoutMs}ms`)), timeoutMs + 2000)),
  ]);
}

async function runOne(cfg, url) {
  const dir = path.join(OUT, cfg.name);
  await fs.mkdir(dir, { recursive: true });
  const consoleLines = [];
  const pageErrors = [];
  const out = { config: cfg, startedAt: new Date().toISOString(), ok: false };
  let browser = null;
  try {
    console.log(`\n=== ${cfg.name}: launching (channel=${cfg.channel ?? 'bundled-default'} headless=${cfg.headless} args=${JSON.stringify(cfg.args)})`);
    browser = await chromium.launch({
      channel: cfg.channel,
      headless: cfg.headless,
      args: cfg.args,
      timeout: 60000,
    });
    out.browserVersion = browser.version();
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => pageErrors.push(String((e && e.stack) || e)));
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    // wait for scene marker, bounded
    try {
      await page.waitForFunction(() => window.__done === true, null, { timeout: 20000 });
      out.sceneDone = true;
    } catch (e) { out.sceneDone = false; out.sceneWaitError = String(e.message || e); }
    // diagnostics probe (bounded inside + outside)
    try {
      out.probe = await boundedEval(page, async () => {
        const r = { ua: navigator.userAgent, hasGpu: ('gpu' in navigator) };
        try {
          const c = document.createElement('canvas');
          const gl = c.getContext('webgl2') || c.getContext('webgl');
          if (gl) {
            const dbg = gl.getExtension('WEBGL_debug_renderer_info');
            r.webglRenderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)).slice(0, 300) : String(gl.getParameter(gl.RENDERER)).slice(0, 300);
          } else r.webglRenderer = 'NO-CONTEXT';
        } catch (e) { r.webglRenderer = 'QUERY-FAILED: ' + (e.message || e); }
        if (!('gpu' in navigator)) { r.adapter = 'navigator.gpu ABSENT'; return r; }
        let adapter = null;
        try {
          adapter = await Promise.race([
            navigator.gpu.requestAdapter(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('requestAdapter inner-timeout 8000ms')), 8000)),
          ]);
        } catch (e) { r.adapter = 'THREW: ' + (e.message || e); return r; }
        if (!adapter) { r.adapter = 'NULL (blocked/unsupported — recorded, not skipped)'; return r; }
        const info = {};
        try {
          if (adapter.requestAdapterInfo) Object.assign(info, await adapter.requestAdapterInfo());
          else if (adapter.info) Object.assign(info, { vendor: adapter.info.vendor, device: adapter.info.device, description: adapter.info.description, architecture: adapter.info.architecture });
          info.isFallbackAdapter = adapter.isFallbackAdapter;
          try { info.features = Array.from(adapter.features || []).slice(0, 60); } catch {}
        } catch (e) { info.error = String(e.message || e); }
        r.adapter = info;
        r.scene = window.__scene || null;
        return r;
      });
    } catch (e) { out.probeError = String((e && e.message) || e); }
    try { out.sceneState = await boundedEval(page, () => ({ done: window.__done, scene: window.__scene, errors: window.__errors, title: document.title })); }
    catch (e) { out.sceneStateError = String((e && e.message) || e); }
    // screenshots: full page + each canvas
    try {
      await page.screenshot({ path: path.join(dir, 'page.png') });
      out.screenshots = ['page.png'];
      const glShot = await boundedEval(page, () => { const c = document.getElementById('gl'); return !!(c && c.width); });
      if (glShot) {
        const glCanvas = page.locator('#gl');
        await glCanvas.screenshot({ path: path.join(dir, 'canvas-gl.png') });
        const wgpuCanvas = page.locator('#wgpu');
        await wgpuCanvas.screenshot({ path: path.join(dir, 'canvas-wgpu.png') });
        out.screenshots.push('canvas-gl.png', 'canvas-wgpu.png');
      }
      // nonblank check: sample pixels via canvas readback + screenshot file sizes
      out.nonblank = await boundedEval(page, () => {
        function stats(id) {
          const c = document.getElementById(id);
          if (!c) return { id, present: false };
          let ctx = null, kind = '';
          if (id === 'gl') { ctx = c.getContext('webgl2') || c.getContext('webgl'); kind = 'webgl'; }
          if (!ctx || id === 'wgpu') {
            // 2d overlay copy is impossible for webgpu; sample via screenshot-side only — report size via canvas pixels through drawImage
            try {
              const tmp = document.createElement('canvas'); tmp.width = 64; tmp.height = 48;
              const t2 = tmp.getContext('2d'); t2.drawImage(c, 0, 0, 64, 48);
              const d = t2.getImageData(0, 0, 64, 48).data;
              const set = new Set(); let sum = 0;
              for (let i = 0; i < d.length; i += 4) { const k = (d[i] << 16) | (d[i+1] << 8) | d[i+2]; set.add(k); sum += d[i] + d[i+1] + d[i+2]; }
              return { id, present: true, method: 'drawImage-sample', distinctColors: set.size, mean: +(sum / (64*48)).toFixed(2) };
            } catch (e) { return { id, present: true, method: 'sample-failed', error: String(e.message || e) }; }
          }
          return { id, present: true, method: 'n/a-webgl-context-owned-by-scene', note: 'see centerPixel in scene state + file sizes' };
        }
        return [stats('gl'), stats('wgpu')];
      });
      for (const f of out.screenshots) {
        const st = await fs.stat(path.join(dir, f));
        out[`size_${f}`] = st.size;
        try { out[`png_${f}`] = pngStats(await fs.readFile(path.join(dir, f))); }
        catch (e) { out[`png_${f}`] = { error: String((e && e.message) || e) }; }
      }
      out.ok = true;
    } catch (e) { out.screenshotError = String((e && e.message) || e); }
    await browser.close().catch(() => {});
  } catch (e) {
    out.launchOrRunError = String((e && e.stack) || e);
    console.error(`--- ${cfg.name} FAILED:`, (e && e.message) || e);
    try { if (browser) await browser.close().catch(() => {}); } catch {}
  }
  out.finishedAt = new Date().toISOString();
  out.console = consoleLines;
  out.pageErrors = pageErrors;
  await fs.writeFile(path.join(dir, 'result.json'), JSON.stringify(out, null, 2));
  await fs.writeFile(path.join(dir, 'console.txt'), consoleLines.join('\n'));
  await fs.writeFile(path.join(dir, 'pageerrors.txt'), pageErrors.join('\n---\n'));
  console.log(`--- ${cfg.name} done ok=${out.ok} sceneDone=${out.sceneDone} probe=${JSON.stringify(out.probe || out.probeError || out.launchOrRunError || '').slice(0, 400)}`);
  return out;
}

const srv = await startServer();
const port = srv.address().port;
const url = `http://127.0.0.1:${port}/`;
console.log('serving scene at', url, 'playwright', (await import('playwright/package.json', { with: { type: 'json' } })).default.version);
const only = process.env.ONLY || '';
const summary = [];
for (const cfg of MATRIX) {
  if (only && cfg.name !== only) continue;
  summary.push(await runOne(cfg, url));
}
await fs.writeFile(path.join(OUT, 'matrix.json'), JSON.stringify(summary, null, 2));
srv.close();
console.log('\nMATRIX COMPLETE. See results/matrix.json');
