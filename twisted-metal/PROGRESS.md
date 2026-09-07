# TWISTED METAL — Canonical Live Progress Page

> Single source of truth for any agent resuming this goal. Updated 2026-09-07 (final).

## Objective
Production-quality browser vehicular-combat game. Twisted Metal fidelity target (original code/assets only).
Shipped: `twisted-metal/index.html` — **RUSTCARNAGE**, playable offline, no build, no network deps.

## Quality bar (acceptance) — ALL MET
- [x] Research: 9 visual anchors downloaded to `reference-assets/`, vision-inspected, provenance recorded
- [x] Complete states: title/start, vehicle+arena select, combat, pause overlay, game-over/victory, restart, manual
- [x] Arena navigation, wall/obstacle collision, repair stations (limited charges), turbo
- [x] Combat: MG with overheat, homing/power/fire/napalm/mines, per-vehicle specials, pickups respawn
- [x] Damage/defeat/recovery: HP, 2 spare lives, respawn invuln, 6-kill quota, wreck particles, timer
- [x] HUD: hull, lives, weapon+ammo, MG heat, turbo, kills, timer, foes, radar/minimap, vignette, killfeed, toasts
- [x] Pause overlay (RESUME/RESTART/MANUAL), mute, touch controls, responsive mobile/desktop, keyboard shortcuts
- [x] Polish: fixed timestep, caps, DPR cap, error recovery, a11y (labels/focus/reduced-motion), delivery evidence

## Research refs
`reference-assets/PROVENANCE.md` — 9 files vision-inspected 2026-09-07 (cover, derby, van, satellite fire,
burning car, rust gears, desert road, monster truck, junkyard) + text sources (IGN/GamesRadar/Wikipedia,
Rogue Trip/Vigilante 8 comparables, footage hubs).

## Decisions (locked — see PROGRESS history)
Top-down 2D canvas; original procedural art; roster Chuckles/Vandal/Bastion; arenas Rustyard/Dustbowl;
WASD+SPACE+E/Q/SHIFT/F+P/M/H/R; AI seek/strafe/flee-repair; 6 kills / 3 hulls / 5:00.

## Work split — DONE
| Piece | Builder | Verifier | Result |
|---|---|---|---|
| P1 Shell: states/HUD/menus/pause/restart/responsive | lead | critic-A (fresh) | PASS w/ 1 gap → fixed (pause overlay) |
| P2 World: physics/arenas/camera/collisions/repair/turbo | lead | (covered by C) | PASS |
| P3 Combat: weapons/pickups/AI/damage/particles/audio | lead | critic-C (fresh) | PASS w/ 1 gap → fixed (respawn hold removed) |
| P4 Polish: perf/a11y/recovery/evidence | lead | critic-D (fresh) | PASS w/ 1 gap → fixed (pause overlay) |

Verifier largest gaps acted on: (1) no dedicated pause overlay → added `screen-pause` + focus + dim, re-shot
06-pause.png; (2) bot respawn hold (`respawn=1` loop) risked quota starvation → removed, bots reinforce to quota.
Also fixed along the way: `rnd` scoping ReferenceError, camera double-transform hiding player cars.

## Completed work (2026-09-07)
Workspace, 9 refs + provenance, full game (index/style/game ~730 lines), 7 evidence screenshots,
README + EVIDENCE.md, 3 critic reviews + 2-gap fix loop, re-verified clean console (only benign
AudioContext-autoplay warnings).

## Evidence
- `evidence/`: 01-title, 02-select, 03-combat-rustyard, 04-combat-dustbowl, 05-mobile, 06-pause, 07-gameover
- `EVIDENCE.md`: gameplay/visual/responsive/recovery/delivery with file:line pointers
- Console: zero errors across ?auto=combat/pause/over/win runs (chromium headless, virtual-time 3–5 s)

## Current gaps
None blocking. Possible follow-ups (not required): engine hum audio, gamepad API, best-score table,
third arena, split-screen. Bar is met.

## Next exact action
Goal complete — no further action. To resume: open `twisted-metal/README.md`, serve the dir, play.
