# Delivery Evidence — RUSTCARNAGE (2026-09-07)

## Gameplay behavior (played via headless auto-combat sim + state hooks)
- Auto-combat runs (`?auto=combat` steps 300 physics ticks headless): bots hunt, killfeed records kills
  (`MORG wrecked by YOU-CHUCKLES`, `KILLS 1/6` visible in `evidence/03-combat-rustyard.png`,
  `VEX wrecked by YOU-BASTION · MINE` in `04-combat-dustbowl.png`). No JS errors (only expected
  AudioContext-autoplay warnings before first gesture).
- States verified by screenshot: title (01), select with 3 rides + 2 arenas (02), combat ×2 arenas (03, 04),
  pause overlay with RESUME/RESTART/MANUAL (06), game-over WRECKED + REMATCH/GARAGE (07).
- Mechanics in code: MG overheat (`game.js` heat+7/shot, 26/s cool), 5 pickup weapons + per-vehicle specials,
  14 s pickup respawn, repair pads 4 charges @55 hp/s, turbo 1.5× drain 38/s regen 14/s, ram damage,
  3 s respawn w/ 2 s invuln, 2 spare lives, 6-kill quota, 5:00 timer, AI hunt/strafe/pickup/repair modes.

## Visual quality (vision-inspected, blind A/B vs bar)
- Compared captures against reference anchors (derby damage, van silhouette, night-fire palette, rust texture,
  desert openness, heavy-vs-light, junkyard packing): readable colored archetypes (yellow truck / red sedan /
  green rig), name + HP bars, color-coded labeled pickups, green repair pads, orange/red barrels, fire+smoke
  particles, minimap with player/bots/pickups/repairs, damage vignette + hit flash.
- Critic loop closed: 3 fresh-context critics (P1 shell, P3 combat, P4 polish) each named largest gap;
  two agreed (no pause overlay) + one respawn-starvation risk — both fixed and re-captured (06 re-shot).

## Responsive operation
- `evidence/05-mobile.png` (390×844): HUD stacks, minimap relocates, pause/mute/help/reset bottom-docked,
  touch stick + 4 buttons visible, combat readable. Desktop 1280×800 verified in 01–04/06/07.
- `@media (max-width:700px)` layout, DPR capped at 2, canvas resize handler.

## Recovery behavior
- `contextlost`/`webglcontextlost` → error banner + safe-restart prompt; `#err` + `showErr` path;
  `visibilitychange` auto-pause; R / ↻ always restarts; help-from-play pauses sim (no background death);
  fixed timestep (`dt≤0.25`, ≤4 steps) prevents spiral; particle/projectile caps.
- Headless runs: zero `ReferenceError`s after fix (`rnd` scoping, camera double-transform bugs found by
  screenshots and fixed).

## Delivery
- `twisted-metal/`: `index.html`, `style.css`, `game.js` (node --check clean), `README.md`,
  `reference-assets/` (9 files + PROVENANCE.md), `evidence/` (7 PNGs), `PROGRESS.md`.
- Run: open `index.html` directly or any static server. No build, no CDN, no keys.
- Perf design: fixed 60 Hz step, pooled arrays, cached ground layer, ≤600 particles / ≤120 projectiles.
