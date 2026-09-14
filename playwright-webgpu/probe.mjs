// playwright-webgpu/probe.mjs — bounded single-run Playwright GPU diagnostic probe (ESM, node).
// Does NOT install browsers. Never hangs: 15s scene-ready wait, 3s in-page
// adapter race, ~60s per-run global timeout, browser always closed in finally.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EVIDENCE_DIR = path.join(__dirname, 'evidence');

const GLOBAL_TIMEOUT_MS = 60000;
const GOTO_TIMEOUT_MS = 15000;
const SCENE_READY_TIMEOUT_MS = 15000;

function nowIso() {
  return new Date().toISOString();
}

function getPlaywrightVersion() {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require('playwright/package.json');
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function getChromiumExecutablePath() {
  try {
    return chromium.executablePath();
  } catch (err) {
    return `unknown (${String(err && err.message ? err.message : err)})`;
  }
}

function ensureEvidenceDir() {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

/**
 * runOne(configName, launchOptions, gotoUrl)
 * - launches chromium via playwright with given launchOptions (channel/headless/args pass-through)
 * - records versions, flags, console + pageerrors, scene readiness, GPU/WebGL probes
 * - screenshot -> evidence/<configName>.png ; JSON -> evidence/<configName>.json
 * - always closes browser in finally; global ~60s timeout via Promise.race
 * - logs JSON summary lines to stdout (preserves stdout/stderr, never swallows)
 */
export async function runOne(configName, launchOptions = {}, gotoUrl) {
  ensureEvidenceDir();
  const startedAt = nowIso();
  const startMs = Date.now();
  const playwrightVersion = getPlaywrightVersion();
  const chromiumExecutablePath = getChromiumExecutablePath();

  const safeName = String(configName).replace(/[^a-zA-Z0-9._-]+/g, '_');
  const jsonPath = path.join(EVIDENCE_DIR, `${safeName}.json`);
  const pngPath = path.join(EVIDENCE_DIR, `${safeName}.png`);

  // Default goto: sibling scene.html via file:// (no server needed) if caller passes none.
  let resolvedGotoUrl = gotoUrl;
  if (!resolvedGotoUrl) {
    const candidates = [
      path.join(__dirname, '..', 'scene.html'),
      path.join(__dirname, 'scene.html'),
      path.join(process.cwd(), 'scene.html'),
    ];
    const found = candidates.find((p) => fs.existsSync(p));
    const target = found ?? candidates[0];
    resolvedGotoUrl = pathToFileURL(target).href;
  }

  const requestedChannel = launchOptions.channel ?? 'bundled-default';
  const requestedHeadless = launchOptions.headless ?? true;
  const requestedArgs = launchOptions.args ?? [];

  async function doRun() {
    let browser = null;
    const consoleMessages = [];
    const pageErrors = [];
    let browserVersion = null;
    let gotoOk = false;
    let gotoError = null;
    let sceneReady = false;
    let sceneReadyError = null;
    let sceneDiag = null;
    let gpuProbe = null;
    let screenshotPath = null;
    let screenshotError = null;

    try {
      browser = await chromium.launch({
        ...launchOptions,
        timeout: 30000,
      });
      try {
        browserVersion = browser.version();
      } catch {
        browserVersion = null;
      }

      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
      const page = await context.newPage();

      page.on('console', (msg) => {
        try {
          consoleMessages.push({
            timestamp: nowIso(),
            type: msg.type(),
            text: msg.text().slice(0, 4000),
          });
        } catch {
          consoleMessages.push({ timestamp: nowIso(), type: 'unknown', text: '<unreadable>' });
        }
      });
      page.on('pageerror', (err) => {
        pageErrors.push({
          timestamp: nowIso(),
          message: String(err && err.message ? err.message : err).slice(0, 4000),
          stack: String(err && err.stack ? err.stack : '').slice(0, 4000),
        });
      });

      try {
        await page.goto(resolvedGotoUrl, { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS });
        gotoOk = true;
      } catch (err) {
        gotoOk = false;
        gotoError = String(err && err.message ? err.message : err).slice(0, 2000);
      }

      // Bounded wait for scene readiness — never hangs (15s cap).
      try {
        await page.waitForFunction(() => window.__sceneReady === true, {
          timeout: SCENE_READY_TIMEOUT_MS,
        });
        sceneReady = true;
      } catch (err) {
        sceneReady = false;
        sceneReadyError = String(err && err.message ? err.message : err).slice(0, 2000);
      }

      try {
        sceneDiag = await page.evaluate(() => {
          const v = window.__diag;
          if (v === undefined) return null;
          try {
            return JSON.parse(JSON.stringify(v));
          } catch {
            return String(v).slice(0, 4000);
          }
        });
      } catch (err) {
        sceneDiag = { __captureError: String(err && err.message ? err.message : err).slice(0, 2000) };
      }

      // In-page GPU/WebGL evaluation with bounded 3000ms adapter race.
      try {
        gpuProbe = await page.evaluate(async () => {
          const errors = [];
          const hasNavigatorGpu = typeof navigator !== 'undefined' && !!navigator.gpu;
          let adapterResult = { status: 'not-attempted', detail: null };
          let adapterInfo = null;

          if (!hasNavigatorGpu) {
            adapterResult = { status: 'no-gpu', detail: 'navigator.gpu is undefined' };
          } else {
            try {
              const timeout = new Promise((resolve) =>
                setTimeout(() => resolve({ __timeout: true }), 3000)
              );
              const attempt = (async () => {
                try {
                  const adapter = await navigator.gpu.requestAdapter();
                  return { __adapter: adapter || null };
                } catch (e) {
                  return { __error: String((e && e.message) || e) };
                }
              })();
              const raced = await Promise.race([attempt, timeout]);
              if (raced && raced.__timeout) {
                adapterResult = { status: 'timeout', detail: 'requestAdapter exceeded 3000ms race' };
              } else if (raced && raced.__error) {
                adapterResult = { status: 'error', detail: String(raced.__error).slice(0, 2000) };
              } else if (raced && raced.__adapter) {
                const adapter = raced.__adapter;
                adapterResult = { status: 'success', detail: 'requestAdapter returned an adapter' };
                try {
                  if (typeof adapter.requestAdapterInfo === 'function') {
                    const info = await adapter.requestAdapterInfo();
                    adapterInfo = JSON.parse(JSON.stringify(info));
                  } else if (adapter.info) {
                    adapterInfo = JSON.parse(JSON.stringify(adapter.info));
                  } else {
                    adapterInfo = null;
                  }
                } catch (e) {
                  errors.push('adapterInfo: ' + String((e && e.message) || e).slice(0, 1000));
                  adapterInfo = null;
                }
              } else {
                adapterResult = { status: 'null', detail: 'requestAdapter returned null (no suitable adapter)' };
              }
            } catch (e) {
              adapterResult = { status: 'error', detail: String((e && e.message) || e).slice(0, 2000) };
            }
          }

          // WebGL renderer string + WebGL2 support (never throws out).
          let webglRenderer = null;
          let webgl2Supported = false;
          try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl');
            if (gl) {
              const dbg = gl.getExtension('WEBGL_debug_renderer_info');
              if (dbg) {
                try {
                  webglRenderer = gl
                    .getParameter(dbg.UNMASKED_RENDERER_WEBGL)
                    .toString()
                    .slice(0, 1000);
                } catch (e) {
                  errors.push('webgl-renderer: ' + String((e && e.message) || e).slice(0, 500));
                }
              } else {
                try {
                  webglRenderer = gl.getParameter(gl.RENDERER).toString().slice(0, 1000);
                } catch (e) {
                  errors.push('webgl-renderer-fallback: ' + String((e && e.message) || e).slice(0, 500));
                }
              }
            } else {
              webglRenderer = null;
              errors.push('webgl: context unavailable (null)');
            }
          } catch (e) {
            errors.push('webgl: ' + String((e && e.message) || e).slice(0, 1000));
          }
          try {
            const canvas2 = document.createElement('canvas');
            webgl2Supported = !!canvas2.getContext('webgl2');
          } catch (e) {
            errors.push('webgl2: ' + String((e && e.message) || e).slice(0, 500));
            webgl2Supported = false;
          }

          return {
            hasNavigatorGpu,
            adapterResult,
            adapterInfo,
            webglRenderer,
            webgl2Supported,
            errors,
          };
        });
      } catch (err) {
        gpuProbe = {
          hasNavigatorGpu: null,
          adapterResult: {
            status: 'error',
            detail: 'page.evaluate failed: ' + String(err && err.message ? err.message : err).slice(0, 2000),
          },
          adapterInfo: null,
          webglRenderer: null,
          webgl2Supported: null,
          errors: [String(err && err.message ? err.message : err).slice(0, 2000)],
        };
      }

      try {
        await page.screenshot({ path: pngPath });
        screenshotPath = pngPath;
      } catch (err) {
        screenshotPath = null;
        screenshotError = String(err && err.message ? err.message : err).slice(0, 2000);
      }

      await context.close().catch(() => {});
    } finally {
      // Always closes browser, even on navigation/eval/screenshot failure.
      if (browser) {
        await browser.close().catch(() => {});
      }
    }

    const endMs = Date.now();
    const result = {
      ok: true,
      configName: safeName,
      startedAt,
      endedAt: nowIso(),
      durationMs: endMs - startMs,
      playwrightVersion,
      chromiumExecutablePath,
      browserVersion,
      launch: {
        channel: requestedChannel,
        headless: requestedHeadless,
        args: requestedArgs,
        rawLaunchOptions: launchOptions,
      },
      gotoUrl: resolvedGotoUrl,
      gotoOk,
      gotoError,
      sceneReady,
      sceneReadyError,
      sceneDiag,
      gpu: gpuProbe,
      consoleMessages,
      pageErrors,
      screenshotPath,
      screenshotError,
      jsonPath,
    };
    ensureEvidenceDir();
    fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
    // Preserve stdout: JSON summary line per run.
    console.log(JSON.stringify({ probe: safeName, ok: true, sceneReady, gpu: gpuProbe, durationMs: result.durationMs }));
    return result;
  }

  async function doRunWithFailureCapture() {
    try {
      return await doRun();
    } catch (err) {
      // Failures recorded as JSON with error (+ stderr snippet field), never thrown silently.
      const endMs = Date.now();
      const failure = {
        ok: false,
        configName: safeName,
        startedAt,
        endedAt: nowIso(),
        durationMs: endMs - startMs,
        playwrightVersion,
        chromiumExecutablePath,
        browserVersion: null,
        launch: {
          channel: requestedChannel,
          headless: requestedHeadless,
          args: requestedArgs,
          rawLaunchOptions: launchOptions,
        },
        gotoUrl: resolvedGotoUrl,
        error: String(err && err.message ? err.message : err).slice(0, 4000),
        stack: String(err && err.stack ? err.stack : '').slice(0, 4000),
        stderrSnippet: String(err && err.message ? err.message : err).slice(0, 2000),
        jsonPath,
      };
      try {
        ensureEvidenceDir();
        fs.writeFileSync(jsonPath, JSON.stringify(failure, null, 2));
      } catch {
        // last resort: stdout still carries the failure
      }
      console.log(JSON.stringify({ probe: safeName, ok: false, error: failure.error }));
      return failure;
    }
  }

  // Per-run global timeout (~60s): race the run against a timer so nothing hangs forever.
  const timeoutPromise = new Promise((resolve) => {
    const t = setTimeout(() => {
      const failure = {
        ok: false,
        configName: safeName,
        startedAt,
        endedAt: nowIso(),
        durationMs: Date.now() - startMs,
        playwrightVersion,
        chromiumExecutablePath,
        browserVersion: null,
        launch: {
          channel: requestedChannel,
          headless: requestedHeadless,
          args: requestedArgs,
          rawLaunchOptions: launchOptions,
        },
        gotoUrl: resolvedGotoUrl,
        error: `global timeout: exceeded ${GLOBAL_TIMEOUT_MS}ms`,
        stderrSnippet: `global timeout after ${GLOBAL_TIMEOUT_MS}ms (launch/ nav/ eval bounded individually)`,
        jsonPath,
      };
      try {
        ensureEvidenceDir();
        if (!fs.existsSync(jsonPath)) {
          fs.writeFileSync(jsonPath, JSON.stringify(failure, null, 2));
        }
      } catch {
        // ignore
      }
      console.log(JSON.stringify({ probe: safeName, ok: false, error: failure.error }));
      clearTimeout(t);
      resolve(failure);
    }, GLOBAL_TIMEOUT_MS);
    // Avoid keeping the process alive just for the timer when the run finishes first.
    if (typeof t.unref === 'function') t.unref();
  });

  return Promise.race([doRunWithFailureCapture(), timeoutPromise]);
}

// Minimal CLI: node probe.mjs <configName> [gotoUrl] [launchOptionsJson]
const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (invokedAsScript) {
  const name = process.argv[2] || 'manual-probe';
  const url = process.argv[3] || undefined;
  let opts = {};
  if (process.argv[4]) {
    try {
      opts = JSON.parse(process.argv[4]);
    } catch (err) {
      console.error(`[probe] invalid launchOptions JSON: ${err.message}`);
      process.exit(2);
    }
  }
  runOne(name, opts, url)
    .then((r) => process.exit(r && r.ok ? 0 : 1))
    .catch((err) => {
      console.error(JSON.stringify({ probe: name, ok: false, error: String((err && err.message) || err) }));
      process.exit(1);
    });
}
