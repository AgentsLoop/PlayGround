# WARZONE-OPS — Live Progress (canonical, resumable)

> Browser FPS inspired by CoD: Warzone's military visual language. All code + assets original/procedural. No proprietary files.

## 1. Reference bar (6+ high-signal, inspected 2026-09-07)
1. https://www.callofduty.com/warzone — Official Warzone hub. Purpose: modes (BR/Resurgence/Black Ops Royale), match loop (drop → loot → survive gas → last squad wins), operator/loadout fantasy. Guides: start briefing → deployment → shrinking circle → win.
2. https://www.youtube.com/watch?v=0HmMOlsqibg ("Easy Guide To The WARZONE HUD") — Purpose: HUD hierarchy spec — minimap top-left w/ red dots + elevation arrows, gas-circle timer below it, compass top-center with degrees/POI, squad/alive counts + kills top-right, weapon/ammo/perks/lethals bottom-right, armor/health bottom-center. Replicated in our HUD layout.
3. https://interfaceingame.com/screenshots/call-of-duty-modern-warfare-warzone/ — Purpose: in-game interface screenshots — dark translucent plates, white condensed type, cyan/amber accents, killfeed, damage direction arcs. Guides our CSS visual system.
4. https://www.gameuidatabase.com/gameData.php?id=279 — Purpose: HUD taxonomy (vitals, minimap, compass, timer, reticles, notifications) — checklist that all elements exist.
5. https://www.youtube.com/watch?v=n3xervhIznE (Rebirth Island 19-kill 4K) — Purpose: combat feel reference — fast TTK, ADS snap, hitmarker + damage feedback, recoil, close-quarters pacing. Guides TTK (~4-5 chest hits), ADS FOV/sensitivity scaling, enemy strafing.
6. https://www.youtube.com/watch?v=tZa2Lxcyyio (Black Ops Royale 41-kill Avalon) — Purpose: large-map flow, POI navigation, vehicle/foot pacing, end-circle clutch. Guides map layout (POIs + cover lanes) and shrinking-zone pressure.
7. https://www.charlieintel.com/call-of-duty-warzone/warzone-season-3-reloaded-squad-hud-overhaul-178883/ — Purpose: squad HUD overhaul (armor count, gas mask, killstreak, team cash, loadout-affordable icon). Guides armor-plate + killstreak (UAV) row in HUD.
8. https://www.callofduty.com/blog/2026/03/call-of-duty-black-ops-7-warzone-season-03-announcement — Purpose: current-season mechanics (Wall Jump/grapple, Buy Station spikes, Cluster Grenade, Gulag). Guides loadout screen + buy-station/UAV killstreak decision (we ship UAV only, documented).

Proprietary references are informational only; shipped game is original.

## 2. Decisions (CTO)
- Stack: single-file `index.html` + Three.js 0.160 via CDN importmap (no build step, Pages-friendly), procedural low-poly military outpost (containers, HQ, tower, walls, crates), baked-ish hemisphere+directional lighting + fog, WebAudio procedural gunshots/hits (no binary assets).
- Scope cut to hit bar in timebox: 8 enemy bots, shrinking safe-zone ("gas"), 3 loadouts (Assault/SMG/Scout), UAV killstreak at 3 kills, armor plates (3 max, key 4/E), revive-free solo last-one-standing win.
- Controls: WASD+mouse (pointer lock), LMB fire, RMB ADS, R reload, Shift sprint, Space jump, C crouch, E/4 plate, Q UAV, M mute, P/Esc pause, H help.

## 3. Completed
- [x] Research + references recorded (above)
- [ ] Game build (in progress)
- [ ] Local verify (states: start/combat/damage/reload/win/lose/restart)
- [ ] Public deploy + browser inspection + evidence

## 4. How to run / verify
- Local: `python3 -m http.server 8080` in repo root → http://localhost:8080/index.html
- Smoke: `python3 scripts/smoke.py` (checks file exists, required tokens, HUD ids, no "call of duty" asset theft, size)
- States to verify: START (briefing overlay) → DEPLOY (click INFIL) → COMBAT (shoot bot, hitmarker+killfeed) → DAMAGE (red vignette+direction) → RELOAD (R, 0-ammo auto) → ZONE (warning+tick outside) → WIN (all 8 eliminated) / LOSE (hp 0) → RESTART (button + key)

## 5. Gaps / next exact action
- Next: write `index.html`, run smoke, screenshot via local server, push + enable Pages, verify public URL.
