# IRON MAYHEM — canonical live progress page

**What:** original browser 3D vehicular arena-combat game (Twisted-Metal-inspired, no source assets reused).
**Play:** `twisted-arena/index.html` (serve over HTTP, e.g. `python3 -m http.server` from repo root → `/twisted-arena/`).
**Stack:** three.js 0.160.0 via jsDelivr importmap; all models procedural; all audio WebAudio-synthesized.

## References + provenance
- Anchors in `../reference-assets/` (7 files), provenance table in `../reference-assets/PROVENANCE.md`.
- Visual language taken: night urban arena, armored DIY rigs, big orange muzzle bloom,
  stat-bar garage (SPEED/ARMOR/SPECIAL), green/red hull LEDs, parody signage ("GOING OUT OF BUSINESS").
- Inspected directly (image viewer): 01–03 vehicle renders, 04–06 PS3 gameplay frames, 07 2012 preview.

## Decisions
- Original rigs (SCRAPJACK / BLACK WIDOW / BULWARK) + original rivals (RUSTBUCKET / GASLIGHT / CLOWN PRINCE).
- Arcade drive model (throttle/steer/grip), mouse-ground-point turret aim, MG + homing missiles, 1v3 last-rig-rolling.
- Pickups: health +35, missiles +4, shield 8s. Wrecks drop pickups. R = instant restart, T = unstuck, P/Esc = pause, M = mute.
- `?autostart=1` URL hook exists for headless smoke tests. `window.__game` exposes snapshot/killAll/damagePlayer.

## Completed work
- Full loop: loading → garage select → playing → win/lose → restart/garage, pause, mute, error overlays.
- 3 AI with orbit/strafe/pickup-seeking/missiles; splash damage; wall/obstacle impact damage; smoke/explosion particles; screen shake; hit vignette; killfeed; toasts; minimap; end stats (time/kills/accuracy/missiles).
- Critic-fix pass: match-epoch guard on delayed endMatch (restart race), player-only kill credit, CDN-failure watchdog in index.html, crosshair follows mouse, minimap wedge 180° fix, headlight emissive preservation, camera clamped inside walls, menu particle double-tick removed.
- Visual pass: plow/cage/driver/hubs/exhausts vehicle kit, concrete silo beacon, lit-window city silhouettes, tires/barrels, muzzle-flash bloom sprites, player nameplate hidden.

## Evidence (all inspected directly)
- `evidence/01-menu.png` — garage with 3 stat-bar rigs, controls, START ENGINE; arena behind.
- `evidence/02-gameplay.png`, `03-drive.png` — third-person chase, headlights, pickups, HUD, enemy plates.
- `evidence/04-combat.png` — mid-burst: city, silo, enemy rig, crosshair at mouse, missile count ×4→×3, player 110/120 (enemy return fire works).
- `evidence/05-win.png` — ★ YOU WIN ★, toasts, TIME/KILLS/ACCURACY/MISSILES, RUN IT BACK / CHANGE RIG.
- `evidence/06-lose.png` — ☠ WRECKED ☠ screen.
- Automated puppeteer run (system Chrome, SwiftShader): MENU_OK, START_OK, DRIVE_OK (21.2 m),
  DAMAGE_OK (hp falls), PAUSE_OK, WIN_OK, RESTART_OK (3 alive, full hp), LOSE_OK, **0 console errors**.

## Blockers
- None. Server: tmux session `ironmayhem` (`python3 -m http.server 8765`).

## Current gaps (accepted, non-blocking)
- MG accuracy in headless test 0% (aim is real-mouse skill; fine for humans).
- Ground texture still simple painted asphalt; no skid marks / wet reflections.
- No gamepad support; desktop keyboard+mouse only (per goal).

## Next exact action (for whoever resumes)
1. `tmux attach -t ironmayhem` (server) — or restart: `tmux new-session -d -s ironmayhem 'python3 -m http.server 8765'`.
2. Open `http://localhost:8765/twisted-arena/index.html`, click START ENGINE, verify W/turret/missile/pickup/win/lose/R.
3. To re-run headless proof: `node test.js` in `/var/folders/d8/hvxvltxn0fl4rmnd52sncbth0000gn/T/opencode/imtest` (needs puppeteer-core + system Chrome).
4. Biggest visual lever left: richer enemy paint/livery + wreck husks persisting after kills.
