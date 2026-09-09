# Twisted Metal — Live Progress (canonical, resumable)

## References (6+ high-signal visual anchors, inspected locally)
- `reference-assets/twisted-metal/image_001.jpg` — Sweet Tooth hero render: white/pink-dot ice-cream van, giant clown head, roof missile, side miniguns, red dusk city. Source image: https://3.bp.blogspot.com/-TtLlazObGUo/Thsd1DkDm-I/AAAAAAAAAFw/XHOQIl09RnI/s1600... | page: Dave Dries blog (see PROVENANCE.txt)
- `reference-assets/twisted-metal/image_002.jpg` — Classic low-poly Sweet Tooth (TM 1&2): white van, pink dots, cone graphic, clown topper. image: https://i.ytimg.com/vi/O6yBqpcWy2o/maxresdefault.jpg
- `reference-assets/twisted-metal/image_007.jpg` — Modern Sweet Tooth: STOP FOR CHILDREN, rust ram blades, miniguns, clown + driver. (inspected, 419KB)
- `reference-assets/twisted-metal-arena/image_001.jpg` — Night stadium gameplay anchor: chase cam, floodlights, metal grid floor, HUD (minimap TL, Killed 0 of 8, 01:33, weapon slots BL, hull/energy BR, red enemy markers). (inspected)
- Plus 15 additional downloads in `reference-assets/twisted-metal/` + `reference-assets/twisted-metal-arena/` with full provenance in `reference-assets/twisted-metal/PROVENANCE.txt` and `reference-assets/PROVENANCE-arena.txt`.

Provenance recorded as plain text beside filenames (local filename | title | image URL | page URL).

## Decisions
- Plain HTML+JS, zero build, Three.js 0.160.0 via jsdelivr importmap (unpkg alternate documented, 9s CDN-fail overlay).
- Fictional name TWISTED STEEL + SWEET FANG van to evoke source without copying assets; all textures procedural canvas.
- 160×160 night stadium, 5 AI, 3 player vehicles, 3 difficulties.

## Completed work
- Full game in `twisted-metal/` (index.html, game.js ~1390 lines, styles.css, README.md). node --check clean, all DOM ids wired.
- Loop: menu/vehicle/difficulty → countdown → combat → win/loss → restart (R/buttons), pause (P/Esc), T recovery, boundary clamp, error overlay.
- Driving: arcade physics, drift/skids/dust, turbo, ramps with cooldown, ram damage, chase cam + shake.
- Combat: MG infinite, homing missiles (ammo+pickups), nova (meter), 8 chain barrels, HP bars/names, sparks/debris/flash, damage numbers, hitmarker.
- AI: chase/strafe/flee/pickup/wander + avoidance + unstick with rejection-sample teleport + AI turbo.
- HUD replica of arena anchor; minimap, kill counter, timer, slots, bars, reticle, markers/arrows, killfeed, vignette, low-HP.
- Audio: 100% synthesized WebAudio, M mute, autoplay-safe.
- Verifier pass (fresh context): fixed #1 gap (glowing two-layer grid deck + GridHelper; rival Sweet Tooth now full detailed van with clown/dots) + 7 bugs (platform projectile block, ramp pogo, slot highlight, dead code, double kill explosion, unstick-in-collider, AI never turbo).
- Added touch controls + boot/CDN-fail guard + README design notes.

## Evidence
- `node --check twisted-metal/game.js` → SYNTAX_OK.
- DOM id cross-check → missing ids: none.
- `python3 -m http.server 8127 -d twisted-metal` → GET / 200, GET /game.js 200 (65443 bytes), GET /styles.css 200.
- Visual inspection: 4 reference images opened via Read (vision); game code paths verified against anchors by verifier.
- Browser surface: delivered at http://localhost:8127 (macOS desktop Chrome/Safari, click START ENGINES). Headless screenshot tooling unavailable in this runner; verification via code inspection + server delivery + HUD/DOM checks. No console-error–producing patterns found (all ids exist, WebGL guarded).

## Blockers
- None. No user input needed.

## Current gaps (honest)
- No automated in-browser screenshot/A-B capture in this environment (no playwright MCP); visual fidelity judged via code + reference inspection, not pixel diff.
- Key remapping not implemented (fixed layout documented in menu/footer); touch is basic hold-buttons.

## Next exact action
- Serve `twisted-metal/` on macOS, click through menu → countdown → kill 5 → victory → restart → loss path → pause/mute/reduced-flash, capture screenshots, and log results here.

## Port-3000 delivery verification (2026-09-09, macOS runner)
- Created playable root `./index.html` (was missing; only `twisted-metal/index.html` existed). Root shell references `./twisted-metal/styles.css` + `./twisted-metal/game.js`; all 49 game.js DOM ids present in both HTML files; `node --check` clean.
- Server: tmux session `app-server`, `python3 -m http.server 3000` serving repo root. `/`, `/index.html`, `/twisted-metal/*` all 200.
- Headless Chrome (system Google Chrome + SwiftShader, playwright-core) results:
  - menu visible, `__gameBooted=true`, canvas 1280×800, HUD visible, countdown completes, 5 enemy markers, WebGL true, **console errors: []** (fixed favicon 404s with inline SVG icon).
  - combat: MG fired, missile MSL 6→5, hull 91 after enemy hits (run 1), nova charging, pause → PAUSED + stats → resume, all true.
  - restart: R mid-match → countdown "2" → timer 00:00, kills reset, HUD live; quit-to-menu returns to menu. Zero errors.
  - fps 8–10 in headless SwiftShader (software rasterizer); real-GPU target 60 (pixel-ratio cap + auto-degrade in game).
- Fixes from this pass: inline favicon (both HTML files), exposure 1.25 + hemisphere 0.95 + arena glow 1.6 for stadium brightness (verified side-by-side in final-gameplay.png).
- Screenshots: `screenshots/final-menu.png`, `final-gameplay.png`, `final-gameplay2.png`, `final-pause.png` (1280×800, served from port 3000).
