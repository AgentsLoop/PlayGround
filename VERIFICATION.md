# Verification note — Neon Orchard Courier

How to play: open `index.html` in any modern browser (no build step).
Fly with WASD / arrows, `P` pause, `R` restart, `M` mute, `Enter` start. Touch: drag to steer.

## Checks run (all passed)
- `node --check game.js` → OK; HTML parsed with Python `html.parser` → OK.
- Headless smoke test (stubbed DOM/canvas, `/tmp` harness, not committed):
  boot snapshot = `{state:title, parcels:3, fireflies:6, hp:3, time:90}` as specified;
  after `__courier.start()` → `state:playing`. PASS.
- Gauntlet-loop critic (independent subagent) vs bar
  (Geometry Wars glow + Chrome-Dino completeness): found 6 issues, all fixed —
  parcel soft-lock while carrying removed (warn + cooldown instead of shove);
  firefly spawn exclusion around drone/parcels/pad; unified firefly floor;
  corrected pause copy; smooth parcel ping ring; resize clamps all entities;
  floating touch joystick re-anchors.

## Manual play expectations
Title → playing → paused/win/lose overlays all reachable; win = 3 deliveries
before 90 s; lose = timer expiry or 3 firefly hits; HUD, score, mute/pause/restart
buttons verified in code paths. Responsive: canvas rescales with DPR ≤ 2 and a
mobile layout under 640 px.

Files: `index.html`, `styles.css`, `game.js`. Changes left uncommitted for the workflow to commit.
