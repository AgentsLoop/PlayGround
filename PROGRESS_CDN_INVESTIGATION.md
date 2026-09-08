# Three.js CDN Download Failure — Canonical Progress Page

Goal: Investigate Three.js CDN download failure via SSH (issue #66).
Worker: mac runner `sjc22-...local`, user `runner`, branch `opencode/34172132419`.
Updated: 2026-09-08T00:17Z. No application code modified (only this page + /tmp artifacts).

## 1. Committed entrypoint + dependency-loading code (inspected before testing)

- Real 3D artifact = issue #61 build, commit `e889141b77c6cae6316d6314119795e99483b709`
  on branch `opencode/34119865115` (fetched 2026-09-08T00:16Z; `git cat-file -t` = commit).
  - `git show e889141:index.html | shasum -a 256` = `b15e5557...433a5`,
    identical to `/tmp/tm61.html` (107270 bytes). Provenance verified.
  - Line 313: `<script src="https://unpkg.com/three@0.160.0/build/three.min.js"></script>`
    (classic script, global `window.THREE`).
  - `World.init` (~line 668): `if(!window.THREE) throw new Error('no three')` then
    `new THREE.WebGLRenderer({canvas...})` in the SAME try → catch →
    `Game.threeOK=false; Game.fallback=true; Fallback2D.init(); return;`
    (catch conflates CDN-missing and WebGL-throw — key to the diagnosis).
  - `Fallback2D` (~line 1805): shows `#fallback2d`, subtitle
    `WebGL unavailable — running 2D fallback mode.`
- Issue #60 variant referenced `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js`
  and `https://unpkg.com/three@0.160.0/build/three.module.js`.
- Issue #65 RUSTCARNAGE is pure 2D, zero three.js refs — offline substitution, NOT a 3D success.

### Canonical dependency URLs under test
1. (PRIMARY, actual entrypoint) `https://unpkg.com/three@0.160.0/build/three.min.js`
2. (ALT) `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js`
3. (ALT) `https://unpkg.com/three@0.160.0/build/three.module.js`

## 2. SSH worker session (connected, then tested through it)

- `ssh -o BatchMode=yes -i opencode-agentsweb-id_ed25519 -p 2222 localhost "<cmd>"` →
  `SSH_WORKER_SESSION_OK`, same host/user, `ssh_exit=0` (2026-09-08T00:12:17Z).
  sshd listener on `*.2222`; local shell = same worker environment (documented equivalence).
- Proxy env: no `*proxy*` names in environment (python name-only check); browser inherits empty proxy env.
  (Raw `env | grep -i proxy` is polluted by multi-line goal text — use the name-only check.)

## 3. Worker network diagnostics (via SSH session, 2026-09-08T00:12:23–00:12:32Z)

DNS (dscacheutil + nslookup, resolver 192.168.64.1):
- `unpkg.com` → 104.18.0.22, 104.18.1.22 (+ipv6 2606:4700::6812:116, ::6812:16)
- `cdn.jsdelivr.net` (alias `cdn.jsdelivr.net.cdn.cloudflare.net`) → 104.17.208.5, 104.17.207.5

TCP: `/dev/tcp/unpkg.com/443` and `/dev/tcp/cdn.jsdelivr.net/443` both connect (~9ms).
TLS: `openssl s_client -verify_return_error` → `Verify return code: 0 (ok)` for both;
unpkg cert CN=unpkg.com (Google Trust WE1, valid 2026-08-14→11-12);
jsdelivr cert CN=*.jsdelivr.net (Sectigo, valid 2026-04-22→11-06).

HTTP download (curl `-sSL -D hdr -o file -w`, exit 0, redirects 0 for all):
| URL | http | bytes | sha256 | content-type | remote_ip |
|---|---|---|---|---|---|
| unpkg three.min.js | 200 | 669884 | `170c6789f43217c96b3170f4b42fafe135de7f7cd48497a4218f9757ee1d49fa` | text/javascript; charset=utf-8 | 104.18.0.22 |
| jsdelivr three.module.js | 200 | 1272972 | `76dea8151bc9352aef3528b4262e249b2604f62543828328db978d060d61a495` | application/javascript; charset=utf-8 | 104.17.207.5 |
| unpkg three.module.js | 200 | 1272972 | `76dea8151bc9352aef3528b4262e249b2604f62543828328db978d060d61a495` | text/javascript; charset=utf-8 | 104.18.0.22 |

Headers (unpkg min.js): `cf-cache-status: HIT`, `access-control-allow-origin: *`,
`cross-origin-resource-policy: cross-origin`, `content-digest: sha256=:Fwxn...fo=:`.
Body head: deprecation `console.warn('Scripts "build/three.js"...deprecated with r150+...')`
then `@license ... Three.js Authors`; module.js head: `const REVISION = '160'`.
(Time_total ~0.04–0.05s; `age`/`cf-ray` vary per fetch — cache HIT.)

## 4. Browser-side evidence (headless Chrome for Testing 152.0.7977.64, file:// probes)

Isolated probes (`--disable-gpu --virtual-time-budget=8000 --dump-dom`), zero net errors:
- classic unpkg: `<title>typeof THREE=object REV=160</title>`, stderr `net::ERR|CORS|CERT` count 0.
- module jsdelivr: `<div>module THREE REV=160 WebGL=false</div>`, count 0 (ES-module + CORS OK).

Full game (`/tmp/cdn-test/game-clean.html` = byte-identical copy of committed entrypoint):
- RUN A (original failure, `--disable-gpu`): `#fallback2d style="display: block;"` (2D fallback
  ACTIVE); console (`--enable-logging=stderr`): deprecation INFO (line 1, benign warn) +
  6× `THREE.WebGLRenderer: A WebGL context could not be created... GL_VENDOR = Disabled...
  BindToCurrentSequence failed` + `Error creating WebGL context`, ALL sourced from
  `https://unpkg.com/three@0.160.0/build/three.min.js` — proving the CDN script
  downloaded AND executed; zero `net::ERR` / `Failed to load resource` / game `Uncaught`.
- RUN B (control, `--use-angle=swiftshader --enable-unsafe-swiftshader`): `#fallback2d`
  has NO style attr (CSS `display:none`, 3D path); console: deprecation INFO +
  SwiftShader `GL Driver Message... GPU stall due to ReadPixels` (WebGL working); zero net errors.
- NOTE: an `Uncaught SyntaxError: missing ) after argument list` seen in one instrumented
  probe was my own injected reporter script (`node --check` FAIL on the injected snippet —
  extra `}`), absent in the clean copy. Test-harness bug, NOT application code.

## 5. Root cause, recovery, and verdict

- First failing layer: **WebGL context creation** (`new THREE.WebGLRenderer` throws under
  `--disable-gpu` headless) → `World.init` catch → `Fallback2D`. Exonerated with evidence:
  URL resolution, proxy policy (empty), TCP/TLS, CDN status/content, CORS/module loading,
  and application code (clean copy: zero uncaught from game).
- There is NO Three.js CDN download failure in this worker: all 3 URLs return HTTP 200,
  correct content-types, sizes, and hashes, from both curl-via-SSH and headless Chrome.
- Minimal recovery: no code change needed for CDN. For headless verification use
  `--use-angle=swiftshader --enable-unsafe-swiftshader` (proves 3D path, RUN B).
  Optional hardening (unproven-necessary): vendor `three.min.js` (669884 bytes,
  sha256 `170c6789...49fa`) locally to remove the CDN runtime dependency.
- Verdict: **proves CDN access + conditional 3D** (3D with SwiftShader GL; 2D fallback
  only when GL is unavailable). The offline 2D renderer was NOT substituted for success.
- Limitations: http-origin serving untested (loopback `http.server` blocked: `curl
  127.0.0.1:8092/8093/8931` → CLOSED/timeout); file:// classic-script success transfers
  fully, module-over-http CORS relies on the observed `access-control-allow-origin: *`.
  Real-GPU headed browsers not tested here.

## 6. Subagents (Execution requirement)

- Browser builder (general subagent): loopback-block finding, file:// classic+module probes,
  game Run A/B with threeOK/fallback flags — adopted after independent re-run.
- Fresh-context critic: CHALLENGED first draft (progress page lacked hashes; e889141
  unfetched; DOM-only causality; file://→http transfer) — all 4 gaps closed above
  (§1 hash match, §3 table, §4 clean-copy console citations, §5 limitations).
- Next exact action: DONE — no open diagnostics. Re-verify with:
  `curl -sSL -o /dev/null -w "%{http_code} %{size_download}\n" https://unpkg.com/three@0.160.0/build/three.min.js`
  (expect `200 669884`).
