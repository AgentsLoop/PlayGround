# TWISTED METAL — Canonical Live Progress Page
> Another agent can resume from here. Updated 2026-09-07 — STATUS: SHIPPED + CRITIC PASS 28.5/40.

## 1. Objective
Production-quality browser game inspired by Twisted Metal: fast chaotic vehicular combat, original implementation, shippable web artifact.

## 2. Quality Bar / Acceptance
- 6+ research anchors recorded (below)
- Playable workflows: drive, aim, shoot, pickups, enemies, damage/destruction, arena nav, restart/recovery, responsive input, audio/feedback, accessibility, deployed artifact
- Screenshots from running artifact, side-by-side / blind A/B vs bar
- Fresh-context critic (writes no code, brutal AAA art director), several viewpoints/zooms, score 0-10; AAA>8.5, indie 7, programmer-art 5; PASS only ≥28.5 total + zero blocking errors

## 3. Research Anchors (high-signal visual + interaction)
1. Core loop: arena battles, 12 vehicles, special moves, accelerator/brake/tight-turn/turbo + MG shoulder buttons — https://giantbomb.com/wiki/Games/Twisted_Metal — purpose: control scheme + arena structure anchor
2. Story/mode: 6 stages, destroy all rivals, health via repair zones, co-op battlefield select — https://gamesdb.launchbox-app.com/games/details/8959-twisted-metal — purpose: progression + repair-zone mechanic
3. Vehicle fantasy: Sweet Tooth ice-cream truck, Mr Grimm motorcycle, Axel two-wheeler, Outlaw — https://www.gamespot.com/gallery/twisted-metal-revolutionized-car-combat-30-years-ago/2900-7243/ — purpose: roster silhouettes + personality-through-vehicle
4. Arsenal: twin MG unlimited + pickups (fire/homing/power/napalm/ricochet/remote-bomb/shotgun/swarmer/mines/spikes/freeze), 20-slot bay — https://www.ign.com/wikis/twisted-metal/Main_Weapons — purpose: weapon set + HUD bay design
5. Pickups/health economy: blue health cubes ~1/3 heal, driver(run over=health)/gunner(=weapon) drops, markers — https://www.ign.com/wikis/twisted-metal/Health_Pickup — purpose: pickup visuals + economy
6. HUD/UI: cross menu, enemy health/damage, clock/timer, minimap, game-over/results/leaderboards — https://www.gameuidatabase.com/gameData.php?id=349 — purpose: HUD layout anchor
7. Arena look: LA urban ruins, overpasses, neon alleys, industrial wasteland, headlight/explosion lighting, destructible landmarks (TM2 world tour) — https://retro-replay.com/db/playstation/twisted-metal/ — purpose: arena art direction
8. Screenshots corpus: 29 shots for palette/composition — https://vgtimes.com/games/twisted-metal/screenshots/ — purpose: visual reference set

## 4. Decisions (CTO)
- Stack: single-file Three.js via CDN + vanilla JS, no build step → instantly shippable (index.html). Fallback 2D canvas if WebGL missing.
- Scope v1: 1 arena (Neon Scrapyard), 3 playable vehicles (original: Clown Truck "Giggles", Bike "Wraith", Sedan "Outlaw-X"), 5 AI enemies, weapons: MG + homing/fire/napalm/mines + special per vehicle.
- Camera: 3rd-person chase cam (cancelled-AAA anchor: third-person vehicle combat).
- Original names/models to avoid IP copy; preserve language: chase cam, cross-menu weapon bay, minimap, timer, kill feed, repair pad, pickup markers.
- Roadmap: P1 research ✅ → P2 playable build → P3 verify/critic → P4 deploy (GitHub Pages artifact + local file).

## 5. Completed Work
- [2026-09-07] Research anchors recorded (8 URLs).
- [2026-09-07] PROGRESS.md created.
- [2026-09-07] Build v1: twisted-metal/index.html 1662 lines / 85KB (builder subagent).
- [2026-09-07] Critic v1: 24.5/40 FAIL (6.0/6.0/7.0/5.5), 0 blockers.
- [2026-09-07] Iteration 2: 2004 lines / 105KB (clown tex, 2-wheel bike, hitFlash, skybox, banners, glyphs, autostart). Critic v2: 27.0/40 FAIL.
- [2026-09-07] Iteration 3: FOV60, 1.25x scale, lit-window skyline, slim beacons, minimap grid+legend, HULL hsl-fix, ?demo=1. 2044 lines / 107KB.
- [2026-09-07] Micro-fix: HULL stepped green/red, minimap bg #16203a + 6px dots, ?demo=1 persistent pool + delayed boom. node --check PASS, HTTP 200.
- [2026-09-07] Critic FINAL: 28.5/40 PASS (6.5/8.5/6.0/7.5), 0 blocking errors. Screenshots: shot_title2, shot_demo2, shot_close, shot_game. Artifact: twisted-metal/index.html served at :8077, HTTP 200.

## 6. Evidence
- Research: URLs above.
- Build: pending.
- Screenshots: pending.
- Tests: pending.
- Deployment: pending (target: `twisted-metal/` folder + served via python http / Pages).

## 7. Blockers
- None currently.

## 8. Current Gaps
- No playable build yet; no screenshots; no critic score; no deployed artifact.

## 9. Next Exact Action
- Builder subagent: create `twisted-metal/index.html` complete game per spec in §10, then report file path + controls + how to run.
- Then verifier subagent: playtest via node/python checks + screenshots (if headless) + critic score.

## 10. Builder Spec (judgeable piece)
File: `twisted-metal/index.html` (single file, CDN three.js ok, offline fallback).
Must include:
- Vehicle select (3 cars, stats + color + special), HUD (health bar, weapon bay cross-menu 1-4 + Q/E cycle, timer, kills, minimap canvas, enemy health bars, damage vignette), menus (title/pause/gameover/victory/restart R), arena (walled scrapyard ~200x200, ramps, containers, repair pad glowing green, pickup spawners with floating icons + beacon pillars).
- Controls: WASD/arrows drive, Space/Mouse fire MG, 1-4/Q/E select+fire missiles (F or RMB for special?), Shift turbo, H handbrake, M mute, P pause, R restart, touch joystick+fire buttons. Responsive + remappable-ish help overlay.
- Combat: MG unlimited w/ spread+recoil, homing/fire/napalm (AoE burn)/mine weapons, pickups respawn 8s, AI (seek/strafe/flee-when-low + repair-seek), HP, explosions w/ particles/shake/flash, wreck state (burning hulk, respawn after 3s or elimination), kill feed, win when all enemies dead, lose on death (with restart).
- Audio: WebAudio synth engine/explosion/pickup/UI, mute.
- Accessibility: colorblind-safe markers + shapes, subtitles for events, reduced-flash toggle, keyboard-only playable, high-contrast HUD toggle.
- Performance: 60fps target, pixel-ratio cap.
- Code quality: commented, no external assets except CDN.
