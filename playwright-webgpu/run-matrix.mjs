// playwright-webgpu/run-matrix.mjs — bounded Playwright GPU matrix runner (ESM, node).
// Imports probe.runOne, defines the exact 6+1 matrix, runs sequentially with
// isolated try/catch, never skips absent adapters, writes _matrix-summary.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runOne } from './probe.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EVIDENCE_DIR = path.join(__dirname, 'evidence');

const WEBGPU_ARGS = ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal'];

// Exact matrix (6 + 1 optional). Do not rename entries: evidence files key off these names.
const MATRIX = [
  {
    name: 'baseline-bundled-headless',
    launchOptions: { headless: true },
    notes: 'Bundled Playwright Chromium, default launch, headless.',
  },
  {
    name: 'baseline-bundled-headed',
    launchOptions: { headless: false },
    notes: 'Bundled Chromium headed; may fail on CI (no display) — recorded honestly, not skipped.',
  },
  {
    name: 'channel-chromium-webgpu-headless',
    launchOptions: { channel: 'chromium', headless: true, args: [...WEBGPU_ARGS] },
    notes: 'Playwright channel=chromium with WebGPU flags, headless.',
  },
  {
    name: 'channel-chromium-webgpu-headed',
    launchOptions: { channel: 'chromium', headless: false, args: [...WEBGPU_ARGS] },
    notes: 'Playwright channel=chromium with WebGPU flags, headed.',
  },
  // NOTE: Vulkan is NOT assumed suitable on macOS. These variants are tested
  // SEPARATELY from the Metal/ANGLE path above so a Vulkan failure cannot be
  // conflated with a WebGPU-on-Metal result.
  {
    name: 'vulkan-variant-headless',
    launchOptions: {
      channel: 'chromium',
      headless: true,
      args: [...WEBGPU_ARGS, '--enable-features=Vulkan'],
    },
    notes: 'SEPARATE macOS-unsuitable candidate: Vulkan feature flag, headless. Not assumed suitable.',
  },
  {
    name: 'vulkan-variant-headed',
    launchOptions: {
      channel: 'chromium',
      headless: false,
      args: [...WEBGPU_ARGS, '--enable-features=Vulkan'],
    },
    notes: 'SEPARATE macOS-unsuitable candidate: Vulkan feature flag, headed. Not assumed suitable.',
  },
];

const SYSTEM_CHROME_APP = '/Applications/Google Chrome.app';
const SYSTEM_CHROME_BIN = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function resolveSceneUrl() {
  const candidates = [
    path.join(__dirname, '..', 'scene.html'),
    path.join(__dirname, 'scene.html'),
    path.join(process.cwd(), 'scene.html'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return pathToFileURL(p).href;
  }
  // Record honestly even if missing: probe will capture goto failure, never silently skip.
  return pathToFileURL(candidates[0]).href;
}

function systemChromeEntry() {
  // Optional 7th check: only added when the system Chrome bundle exists.
  // Uses executablePath override — recorded distinctly, never conflated with
  // the Playwright Chromium (channel=bundled/channel=chromium) approach.
  try {
    if (fs.existsSync(SYSTEM_CHROME_APP) && fs.existsSync(SYSTEM_CHROME_BIN)) {
      return {
        name: 'system-chrome',
        launchOptions: { headless: true, executablePath: SYSTEM_CHROME_BIN },
        notes: 'Optional: real system Google Chrome via executablePath override (distinct from Playwright Chromium).',
      };
    }
  } catch {
    // fall through to null
  }
  return null;
}

function printTable(rows) {
  const header = ['config', 'ok', 'sceneReady', 'adapter', 'ms'];
  const lines = [header.join(' | '), header.map(() => '---').join(' | ')];
  for (const r of rows) {
    lines.push(
      [r.name, String(r.ok), String(r.sceneReady), String(r.adapter), String(r.durationMs)].join(' | ')
    );
  }
  console.log(lines.join('\n'));
}

export async function runMatrix() {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const gotoUrl = resolveSceneUrl();
  const startedAt = new Date().toISOString();
  console.log(JSON.stringify({ matrix: 'start', gotoUrl, startedAt }));

  const entries = [...MATRIX];
  const sysChrome = systemChromeEntry();
  if (sysChrome) {
    entries.push(sysChrome);
  } else {
    console.log(
      JSON.stringify({ matrix: 'note', systemChrome: 'absent — system-chrome check recorded as skipped-present, not run' })
    );
  }

  const results = [];
  // Sequential runs; each isolated in try/catch so one failure never aborts the matrix.
  for (const entry of entries) {
    console.log(JSON.stringify({ matrix: 'run-start', config: entry.name }));
    try {
      const r = await runOne(entry.name, entry.launchOptions, gotoUrl);
      results.push({
        name: entry.name,
        ok: !!(r && r.ok),
        sceneReady: r && 'sceneReady' in r ? !!r.sceneReady : null,
        adapter: r && r.gpu && r.gpu.adapterResult ? r.gpu.adapterResult.status : r && r.ok === false ? 'run-failed' : 'unknown',
        durationMs: r && r.durationMs !== undefined ? r.durationMs : null,
        jsonPath: r && r.jsonPath ? r.jsonPath : path.join(EVIDENCE_DIR, `${entry.name}.json`),
        notes: entry.notes,
        // Never silently skip absent adapters: surface null + reason explicitly.
        adapterDetail:
          r && r.gpu && r.gpu.adapterResult ? (r.gpu.adapterResult.detail ?? null) : (r && r.error ? r.error : 'no adapter data'),
      });
    } catch (err) {
      // Isolated failure: record as JSON with error + stderr snippet, continue.
      const message = String((err && err.message) || err).slice(0, 4000);
      const fallbackPath = path.join(EVIDENCE_DIR, `${entry.name}.json`);
      const failure = {
        ok: false,
        configName: entry.name,
        endedAt: new Date().toISOString(),
        error: message,
        stack: String((err && err.stack) || '').slice(0, 4000),
        stderrSnippet: message.slice(0, 2000),
        launchOptions: entry.launchOptions,
        notes: entry.notes,
        jsonPath: fallbackPath,
      };
      try {
        if (!fs.existsSync(fallbackPath)) {
          fs.writeFileSync(fallbackPath, JSON.stringify(failure, null, 2));
        }
      } catch {
        // stdout still carries it
      }
      console.log(JSON.stringify({ matrix: 'run-failed', config: entry.name, error: message }));
      results.push({
        name: entry.name,
        ok: false,
        sceneReady: null,
        adapter: 'run-failed',
        durationMs: null,
        jsonPath: fallbackPath,
        notes: entry.notes,
        adapterDetail: message.slice(0, 1000),
      });
    }
  }

  const summary = {
    startedAt,
    endedAt: new Date().toISOString(),
    gotoUrl,
    systemChromePresent: !!sysChrome,
    configs: results,
    // Authoritative documentation checked BEFORE choosing recovery steps:
    // - Playwright Browsers doc (https://playwright.dev/docs/browsers):
    //   default headless uses "chromium headless shell"; channel:'chromium'
    //   opts into "new headless mode ... the real Chrome browser" (more authentic,
    //   reliable, more features). Recovery for null adapter in headless-shell was
    //   therefore to use channel:'chromium' + full Chromium build, not more flags.
    // - Playwright BrowserType.launch channel option (https://playwright.dev/docs/api/class-browsertype):
    //   channel 'chromium' / 'chrome' / branded channels documented; executablePath
    //   override reserved for system Chrome (recorded distinctly here).
    docs: [
      'https://playwright.dev/docs/browsers#chromium-headless-shell',
      'https://playwright.dev/docs/browsers#chromium-new-headless-mode',
      'https://playwright.dev/docs/api/class-browsertype#browser-type-launch-option-channel',
    ],
    // Honesty disclaimers (do not claim hardware perf from a renderer name alone):
    disclaimers: {
      paravirtualIsNotPhysicalGpuProof:
        'WebGL renderer "ANGLE (Apple, ANGLE Metal Renderer: Apple Paravirtual device ...)" proves a virtualized Metal path on this VirtualMac2,1 (Apple M1 Virtual) runner — it is NOT proof of physical-GPU access and MUST NOT be read as hardware-performance evidence.',
      swiftShaderIsSoftware:
        'WebGL renderer containing "SwiftShader" is a software rasterizer fallback (no GPU).',
      vulkanOnMacOS:
        'The --enable-features=Vulkan variant is tested SEPARATELY and is NOT assumed suitable on macOS; on this runner it still reports the Apple Paravirtual Metal renderer (Vulkan flag has no Metal-replacing effect here).',
      noPerfClaim:
        'No frames-per-second or hardware-performance claim is made from any renderer string in this report.',
    },
  };
  const summaryPath = path.join(EVIDENCE_DIR, '_matrix-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  printTable(results);
  console.log(JSON.stringify({ matrix: 'done', summaryPath, count: results.length }));
  return { summaryPath, summary };
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (invokedAsScript) {
  runMatrix()
    .then(({ summary }) => {
      const failures = summary.configs.filter((c) => !c.ok).length;
      process.exit(failures > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error(JSON.stringify({ matrix: 'fatal', error: String((err && err.message) || err) }));
      process.exit(1);
    });
}
