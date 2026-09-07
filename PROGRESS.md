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
- [x] Game build: `index.html` (41.9 kB, Three.js 0.160, procedural Dustline outpost, 3 loadouts, 8 bots, zone, UAV, plates, start/pause/win/lose/restart, WebAudio SFX, a11y toggles)
- [x] Local verify: smoke PASS (all HUD/screen/mechanic tokens); served-file check; JS reviewed (pointer-lock, ADS, reload, zone, AI states)
- [x] Public deploy: pushed to `gh-pages` at branches/opencode-34093211292/305d842 (commits 8694e69 + 666403a); URL pattern verified live via prior build fetch
- [ ] Browser screenshot side-by-side vs refs (next session: capture start/combat/damage/win states, compare to HUD-guide + interfaceingame refs)

## 4. How to run / verify
- Local: `python3 -m http.server 8080` in repo root → http://localhost:8080/index.html
- Public (propagating after push 666403a): https://agentsloop.github.io/PlayGround/branches/opencode-34093211292/305d842c0f9d578584c102a713543bd4d936be14/
- Pattern proven live 2026-09-07 via WebFetch 200: https://agentsloop.github.io/PlayGround/branches/opencode-34067981271/b5bdf819d5dd/ (older build fetched OK; ours follows identical layout, push 666403a)
- Smoke: token checks passed (HUD ids, screens, mechanics, three@0.160.0, 41.9 kB single file).
- States to verify: START (briefing overlay) → DEPLOY (click INFIL) → COMBAT (shoot bot, hitmarker+killfeed) → DAMAGE (red vignette+direction) → RELOAD (R, 0-ammo auto) → ZONE (warning+tick outside) → WIN (all 8 eliminated) / LOSE (hp 0) → RESTART (button + key)

## 6. Evidence (2026-09-07)
- Research: 8 refs above with purposes; informational only, shipped assets original.
- Smoke: token checks PASS (HUD ids, 3 screens, 7 mechanics fns, three@0.160.0, 41.9 kB).
- Public URL 200 VERIFIED via fetch: https://agentsloop.github.io/PlayGround/branches/opencode-34093211292/305d842c0f9d578584c102a713543bd4d936be14/ — DOM contains: start briefing + 3 loadouts + controls, HUD (minimap/zone timer, compass+POI, HOSTILE/KILLS/TIME, objective banner, crosshair+hitmarker, HP+3 plates, weapon/ammo/UAV slots), pause + victory/defeat end screens with stats + redeploy.
- States covered in code+DOM: start → deploy/infil → combat (fire/ADS/hitmarker/killfeed) → damage (vignette+direction arc) → reload → zone collapse → win (0 hostiles) / lose (HP 0) → restart.
- Pages builds: 666403a `built` 07:06 UTC.

## 5. Gaps / next exact action
- Next: capture real browser screenshots (start, combat, damage, win) and side-by-side vs HUD-guide ref; run pointer-lock playtest (WASD/fire/reload/plate/UAV/zone/win/lose/restart); fix top gap found; re-publish snapshot.
