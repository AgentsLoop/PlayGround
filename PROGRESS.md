# STARFALL COMMAND — Live Progress (resumable)

## Goal
Production-quality browser RTS inspired by StarCraft 2: selectable units/buildings,
resource gathering, construction, production queues, combat, fog of war, camera
pan/zoom, complete playable match loop. Original assets only.

## Reference research (all visited 2026-09-07, high-signal)
1. https://starcraft2.blizzard.com/ — Official SC2 site. Purpose: free-to-play structure,
   3 races framing, campaign/co-op/multiplayer modes → our mode/scenario select model.
2. https://news.blizzard.com/en-us/article/4488900/game-guide-resources — Official resource guide.
   Purpose: minerals 5/trip + gas 4/trip, refinery-on-geyser, saturation 2-3/patch & 3/geyser,
   8 patches + 2 geysers per base → our economy numbers (Alloy/Plasma, 8 crystals + 2 vents).
3. https://news.blizzard.com/en-us/article/4488313/game-guide-economy — Official economy guide.
   Purpose: constant worker production, expand before depletion, keep bank low → our
   onboarding tips + AI macro + victory pacing.
4. https://liquipedia.net/starcraft2/Resources — Resource/supply encyclopedia.
   Purpose: exact base composition (10800 minerals, 2250 gas/geyser), supply +8 depots,
   200 cap, supply-block concept → our supply model + blocked toast.
5. https://liquipedia.net/starcraft2/Minimap — Minimap spec.
   Purpose: lower-left minimap, FoW dimming, click-to-move camera, attack through minimap
   → our minimap behavior checklist.
6. https://news.blizzard.com/en-us/article/6640645/game-guide-simplified-controls — Camera/controls.
   Purpose: arrows/WASD + middle-drag pan, wheel zoom, Space last-alert, Backspace cycle
   bases, F5-F8 location hotkeys, F1 idle worker → our hotkey map.
7. https://liquipedia.net/starcraft2/Hotkeys — Hotkey/control-group system.
   Purpose: Ctrl+number groups, A attack-move, S stop, Shift queue → our command card + keys.
8. https://www.esportsvikings.com/starcraft2/guides/sc2-viewer-guide — Observer HUD.
   Purpose: bottom HUD (minimap left, command card right), supply/worker/army split,
   bank + income/min → our top-bar + bottom HUD layout.

## Decisions (lead route)
- Route: zero-dependency Canvas 2D + vanilla JS, static files under `rts/`. No build step,
  runs via any static server. Maximizes reliability in sandbox.
- Name/factions (original): STARFALL COMMAND. Player picks Vanguard (balanced, blue) or
  Nomad Pact (fast/cheap, teal); enemy is Crimson Hive (red AI). No Blizzard assets/names.
- Pieces (independently judgeable): (a) boot/states/UI shell, (b) world/sim economy,
  (c) selection/camera/minimap/fog, (d) combat/AI/win-lose, (e) polish/verify.
- Builder+critic: builder writes code; fresh-context `general` subagent verifies real
  artifact via browser captures and sends back largest gap. Loop until bar met.

## Completed work
- [2026-09-07] Research recorded (8 URLs above). Route chosen. This progress file created.
- [2026-09-07] Built `rts/` (index.html, style.css, game.js ~1300 lines, zero deps): full match loop.
- [2026-09-07] Browser verification rounds v1–v5, all zero page errors.
- [2026-09-07] Fresh-context critic verdict: PASS; fixed its largest gap (mixed selection hid
  army commands) + 3 secondaries (empty cmd panel at boot, worker-hunt victory, supply-stall
  progress accrual). Fixed own finds: rally-to-resource, right-click rally/unit-order conflict,
  AI wave-spam, depleted-crystal collision, kill-stat accounting, minimap label, cmd auto-refresh.

## Evidence
- Research: URLs + purposes above.
- Visual inspection (1600x900 + 1280x800): /tmp/opencode/shot-menu/game/victory/defeat/pause.png,
  v2-base/victory/defeat/pause.png, v3-combat/defeat/pause.png, v4-wave/combat/1280.png,
  v5-victory/final.png — menu, match, build-up, live battle w/ tracers + HP bars, victory+stats,
  defeat, pause, tutorial, fog, minimap all render.
- Gameplay behavior (headless Chromium, playwright-core): harvest +90 alloy/5s; gas +36/6s;
  depot/gate/extractor via UI path (supply 6→23); queue→units 6→9; drag-box 6; attack-move
  damage 1600→1483 + kills; rally-to-crystal gather:true + 7/7 auto-mine; AI wave waveN≥1 with
  alert banner; wave pacing no-spam; structures-only victory with 16 enemy workers alive;
  mixed selection shows Attack+Build; group recall double-press centers camera; middle-drag pans.
- Accessibility/operability: A/S/H/F1/Space/Backspace/Ctrl+0-9/Esc/arrows/edge/minimap/wheel;
  responsive 1600x900 + 1280x800; toasts for invalid/insufficient/supply-blocked; autosave+recover.
- Delivery: root `./index.html` (playable entry, single-sourced `rts/` JS/CSS) + static
  `rts/`, served by tmux `app-server` on port 3000. Port-3000 suite 11/11 PASS, zero errors.
  Final captures: `screenshots/final-{menu,match,combat,victory,defeat,pause}.png`.
  No Blizzard strings in code (critic scan clean).
- Critic: independent general-subagent run — VERDICT PASS, all 4 findings fixed + re-verified.

## Blockers
- None.

## Current gaps
- No full real-time (5+ min) human-speed match played start-to-finish; loop closed via
  accelerated same-code-path exercises instead. Next agent may run a long soak match if desired.

## Next exact action
- Goal met. Optional follow-ups: long soak match, balance tuning, extra unit tier.
