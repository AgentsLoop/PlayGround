# RUSTBELT ARENA — Live Progress (canonical, resumable)

## Research anchors (6+, guiding visual + interaction)
1. https://www.ign.com/wikis/twisted-metal/Sweet_Tooth — Special-weapon design: HP ~250 archetype, homing "Laughing Ghost" (40 dmg, passes through obstacles), 30s recharge, tank-vs-speed tradeoffs. → Used for: 3 vehicle archetypes + homing Napalm special with cooldown.
2. https://www.ign.com/wikis/twisted-metal-black/Weapons_and_Special_Moves — MG = infinite ammo + overheat meter; pickups upgrade MG; right-weapon-for-right-moment. → Used for: MG overheat bar, MG-upgrade pickup, pickup-driven weapon economy.
3. https://www.gameuidatabase.com/gameData.php?id=349 — TM HUD language: enemy health & damage, clock/timer, minimap, item/ability cross-menu, game-over/results screens. → Used for: HUD layout (health, special, weapons, minimap, timer, killfeed, results screen).
4. https://github.com/yeahitsmejayyy/dead-pedal — Browser car combat in three.js, no physics lib, arcade vehicle model, deterministic sim, headless balance testing. → Used for: arcade bike-model physics (no cannon.js), fixed-timestep update, bot tuning approach.
5. https://github.com/victorgalvez56/redline — Combat mode first-to-5-kills, 100×100 skatepark arena, homing missiles (F), health/ammo pickups, boost lanes, healing zones. → Used for: arena flow (ramps/pads/boost), pickup types, kill attribution window.
6. https://arionisgames.com/portfolio/neon-arena/ — Last-car-standing with up to 11 cars, impact damage, boost/ram/jump, adaptive AI, pure web stack (Three.js). → Used for: last-car-standing match loop, ram damage, adaptive AI states (seek/flee/pickup).
7. Visual refs: https://www.mobygames.com/game/4857/twisted-metal/screenshots/playstation/437511/ + https://www.uvlist.net/gallery/?game=11550 — post-apocalyptic road-warrior palette (rust, hazard stripes, smoke/fire), chunky arena props.

## Decisions (CTO)
- Title: RUSTBELT ARENA (avoids TM trademark, keeps road-warrior language).
- Stack: static Three.js (CDN importmap, r160) + hand-rolled arcade car physics + WebAudio synth. Zero build step → deployable anywhere (`python3 -m http.server`).
- Scope: 1 arena (Junkyard Bowl 220×220), 6 cars (player + 5 AI), 3 AI archetypes, 4 weapons (MG/homing missiles/mines/napalm special), 5 pickups (repair/missiles/mines/turbo/MG-up), destructible barrels + crates, day-dusk look with fog/smoke/fire particles.
- Match loop: menu → vehicle select (3) → countdown → last-car-standing → win/lose results → restart. Pause, mute, touch controls, gamepad (basic), responsive HUD, minimap, killfeed, damage vignette, screen shake, hit markers.

## Completed
- [x] Research anchors recorded
- [x] Scaffold + game implementation (done: index.html, style.css, game.js)
- [x] Critic pass (FAIL→fixed: gamepad dt, MG occlusion, idempotent REMATCH arena rebuild, touch turbo/mine/pause, pause engine silence + auto-pause, decisive sudden-death timeout, WebGL guard)
- [x] Static verify: module syntax OK, all 3 assets serve HTTP 200
- [x] Delivery evidence (below)

## Current gaps / next exact action
- NEXT: write rustbelt-arena/{index.html,style.css,game.js}, then `python3 -m http.server` + node syntax check + Playwright-less logic self-test.

## How to run / reproduce
- `python3 -m http.server 8080 --directory rustbelt-arena` → http://localhost:8080/
- No npm, no build. Requires internet for three.js CDN (unpkg/jsdelivr importmap with fallback).
- Controls: WASD/arrows drive, Space handbrake, J or Click = MG, K / RMB = fire missile, L / E = mine, Shift = turbo, Q or F = SPECIAL, P/Esc pause, M mute, R restart (on results).

## Verification evidence
- `node --input-type=module --check < rustbelt-arena/game.js` → OK
- `python3 -m http.server 8902 --directory rustbelt-arena`: index 200/5857B, game.js 200/38042B, style.css 200/6427B
- Critic re-check items addressed in game.js: MG solids occlusion, pollGamepad(dt), buildArena idempotent REMATCH, touch turbo/mine/pause, visibility/blur auto-pause + engine mute, sudden-death winner by hull, WebGL try/catch retry, AI anti-stuck + ramp boost pads.
- Known limitations: no live-browser screenshot in this sandbox (no Playwright); three.js requires internet CDN; ramps are boost pads (no vertical physics); gamepad tested logically only.
