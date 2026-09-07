# CoD-Fidelity Browser Game — Live Progress Page

## Research anchors (6+ high-signal, guiding implementation)
1. Official MW4 hub — https://www.callofduty.com/modernwarfare4 — Purpose: visual language, campaign premise (Korea/NY/Paris/Mumbai), editions/progression framing.
2. MW4 Multiplayer systems (NEXT) — https://www.callofduty.com/blog/2026/08/call-of-duty-modern-warfare-4-next-highlights-multiplayer-gameplay-systems — Purpose: Create-a-Class, Apex Attachments, Prestige paths, modes (TDM/Domination/Hardpoint/Kill Confirmed/Inflation/S&D/Gunfight/Kill Block/Combat Outpost).
3. MW2 launch progression — https://www.callofduty.com/blog/2022/10/call-of-duty-modern-warfare-II-launch-progression-overview-ranks — Purpose: Military Ranks 1-55, Daily/Career challenges, Weapon Mastery camos, Kit Tiers.
4. MW Beta Boot Camp HUD/controls — https://blog.activision.com/uk/en/call-of-duty/2019-09/Modern-Warfare-Beta-Boot-Camp-Gaining-Complete-Control — Purpose: canonical HUD elements (compass, faction/score/timer, crosshair, killstreaks, weapon detail), ADS/mount/mantle, colorblind/accessibility options. Guides our HUD layout.
5. BO7 HUD guide — https://www.thegamer.com/call-of-duty-black-ops-7-cod-bo7-hud-themes-layouts-guide/ — Purpose: 9 HUD layouts, widget visibility, themes, readability/color customization. Guides settings + minimal/clutter tradeoff.
6. CoD4 HUD reference — https://strategywiki.org/wiki/Call_of_Duty_4:_Modern_Warfare/HUD — Purpose: classic crosshair/inventory/stance/compass-star objective/ammo+grenade gauges/damage-direction arrows/red-veil + heartbeat regen model. Direct model for damage/recovery.
7. BO7 Campaign Endgame intel — https://news.blizzard.com/en-gb/article/24243859/intel-campaign-endgame-in-black-ops-7 — Purpose: mission-oriented pacing, assignments, Combat Rating/skill tracks, exfil loop, unified XP across modes. Guides objectives + replayability.

## Decisions
- Original implementation + assets only: all art procedural on Canvas, all audio synthesized via WebAudio. No ripped CoD assets.
- Tech: single-file `game/index.html` (no build step), Canvas 2D raycaster-lite arena (top-down/over-shoulder hybrid actually: 2.5D raycast corridor for FPS feel, fallback top-down minimap). Chosen for: immediate play, performance, touch support.
- Fidelity targets mapped: compass+minimap, ADS + recoil/spread, 3 weapons, grenade/lethal+tactical, killstreak (UAV + airstrike), health-regen red veil + directional hitmarker, objectives star, killfeed, XP/rank persistence (localStorage), 3-mission campaign + endless mode, pause/restart/win/fail, subtitles, colorblind toggle, keyboard/mouse+touch.
- Route split (judgeable pieces): (A) core loop+AI, (B) HUD/presentation, (C) audio/feedback+progression/persistence, (D) verification/critique.

## Completed
- [x] Research anchors recorded (2026-09-07)
- [x] Core game built: `game/index.html` single file, zero deps (now ~49KB)
- [x] Real-browser inspection (Chrome headless + puppeteer-core, file://, 1280x720 + 390x844 touch): 14 screenshots in /tmp/sp_shots
- [x] Critical load crash found+fixed (updateTrack null-weapons TypeError killed all logic on load)
- [x] Per-frame TDZ crash found+fixed (drawMinimap `m` collision blanked minimap+compass every frame)
- [x] Visual pass: floor/ceiling gradients, distance fog, rifle-profile gun, star muzzle flash at barrel tip, isolated HUD draws
- [x] Touch layout pass: USE/UAV/STRK buttons, portrait media query, FIRE-tap verified
- [x] Full loop verified live: gun kill, grenade kill, win, mission-2 chain, fail, pause/resume, reload persistence

## Evidence
- Research: 7 anchors with URLs+purpose (see above).
- drive.js: aim 3.91m ADS fire 13rds → 1 kill +100, frag run, hp 65 under fire, pause/resume OK, 0 pageerrors, ~23fps software-rendered (real GPUs faster).
- verify2.js: MISSION COMPLETE (8 kills/score 2215), NEXT→mission 2 (3 intel), MISSION FAILED path, reload persistence RANK 2 · 1522 XP · BEST 2215 · DMR UNLOCKED.
- verify3/4.js: ADS ring + star flash screenshot, touch layout display:block, FIRE touchstart→firing:true, 0 errors.
- Screenshots: brief, spawn, combat, ADS, nade, pause, restart, gunkill, win, mission2, fail, ads_enemy, touch, touch2.

## Blockers
- None. Localhost TCP blocked in sandbox; used file:// + Chrome headless instead. No GPU screenshots (software rendering only).

## Current gaps
- Enemies render as abstract billboards (no walk anim); spawn view often faces a wall; software-renderer fps ~23 (GPU-backed browsers will exceed this).
- Next exact action if continuing: enemy walk/fire animation frames + spawn yaw toward open lane.
