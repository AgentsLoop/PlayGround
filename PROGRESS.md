# GRIM IRON — live progress (canonical)

**Play it:** https://typing-grace-complexity-adjust.trycloudflare.com
(verified live: HTTP 200, correct title, title + gameplay screenshots captured against
this URL into `screenshots/final-*.png`). Local dev: tmux `app-server` on :3000.

Original browser 3D vehicular arena-combat game (Twisted-Metal-inspired, all-original
assets/code) for desktop Mac users. Serves from repo root: `python3 -m http.server 8765`
→ http://127.0.0.1:8765/index.html (persistent tmux session `grimiron`).

## References & provenance
- 12 visual anchors in `reference-assets/image_001–012.jpg`, sources in
  `reference-assets/PROVENANCE.md` + `search-results.json` (TM 2012 sunset street combat,
  dusk arenas, chase cam, minimap + nameplates + weapon-bar HUD language).
- Inspected directly: IGN TM-PS3 street shot (minimap top-left, enemy name tags, bottom
  weapon strip, turbo flames), gamingpastime arena shot ("Homing Missile Hit 18 damage"
  floater, timer, hull bars), TM2 classic HUD (Turbo/SPECIAL meter).
- Decisions: dusk-orange city arena, 3rd-person chase cam, minimap + floating nameplates
  + bottom weapon strip, 5 rivals / 3 lives / 5:00 clock, MG + 4 pickups + charging special.

## Completed work
- Full game: `index.html`, `css/style.css`, `js/main.js` (~1440 lines), `js/audio.js`
  (synthesized WebAudio, no assets), vendored `vendor/three.module.js` (r160, zero runtime CDN).
- Systems: arcade driving + turbo + ramming, mouse-aim turret, MG (overheat) + Homing /
  Power / Napalm (fire pools) / Mines + Iron Bloom radial special, 5 distinct AI rivals
  (seek/strafe/pickup-grab/obstacle probe), weapon/repair/turbo pickups + wreck drops,
  explosive barrels, damage falloff + floaters + hitmarker + vignette, minimap, kill feed,
  banners, pause (P/Esc, auto-pause on tab-hide), mute, hints, WebGL/load-error screens,
  countdown → playing → win/lose → restart, keyboard + mouse + clickable weapon slots,
  ARIA live regions, autofocus start, reduced-motion support.
- Verification hooks (kept, harmless): `?play=1` autostart, `?demo=1` autopilot,
  `?scenario=killall|diew|timeout` + `#verify` JSON + `window.__grim`.

## Evidence
- Screenshots: `/tmp/shot-title.png` (title), `/tmp/shot-action3.png` (73 mph combat,
  sparks, HUD) — both inspected; compare vs `reference-assets/` anchors.
- Headless Chrome (SwiftShader) dump-dom checks — all PASS:
  - `scenario=killall` → `{"mode":"over","kos":5,"lives":3,"won":true,"endVisible":true,"title":"Last Engine Running"}`
  - `scenario=diew` → `{"mode":"over","kos":0,"lives":0,"won":false,"endVisible":true,"title":"Scrap Metal"}`
  - `scenario=timeout` → defeat on clock expiry, panel visible
  - `?play=1` → `#nogl` hidden, `#hud` shown, clock ticks 05:00→04:59, no JS errors
  - `grep -rn http index.html js/ css/` → no external URLs (fully vendored/offline-safe)
- Fresh-context critic reviewed code + artifact + runs; all 9 reported bugs fixed:
  self-splash excluded, segment-vs-AABB MG wall blocking, mine owner-retrigger reachable,
  kill visuals chain-free, countdown generation counter, engine silenced on pause, honest
  homing accuracy, clickable/selectable MG, car lean, own-nameplate off aim axis.

## Blockers
- None. SwiftShader headless renders slowly (dt-cap 0.05 slows game-time under virtual
  time) — verification-only quirk, not a game bug.

## Current gaps / next exact action
1. Beauty gap vs TM bar: flat untextured boxes, no clouds, boxy cars (accepted — original
   procedural scope; cheapest next win = window-grid texture + street decals).
2. Real-input playtest (keyboard/mouse feel, balance over full 5:00 match) not yet done —
   NEXT: open http://127.0.0.1:8765/index.html in a real Mac browser, play a full match,
   tune AI/damage numbers from feel.
3. Accessibility beyond current ARIA/focus/reduced-motion (e.g. keyboard-only aiming,
   remapping) deferred.
