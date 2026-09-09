# Lantern Dash — Live Progress (canonical resume page)

## Goal
Polished small browser game: top-down night-market courier run. Move through a compact
lantern-lit street, collect 6 glowing parcels, avoid 4 moving patrol carts, reach the
east gate before the 90s timer expires. Immediately playable in a real browser.

## Entry point
- `lantern-dash/index.html` — single self-contained file (no dependencies, no build).
  Serve the repo root (e.g. `python3 -m http.server`) and open `/lantern-dash/index.html`.

## References & provenance (all downloaded, inspected visually)
Visual direction: deep-indigo night + warm lantern amber (Jiufen/HK neon refs) for lighting;
bold Kenney-style silhouettes + neon-maze readability (Neon Labyrinth / NEON PAC / Neon
Sprint research) for gameplay shapes. Palette: indigo `#141126`, amber `#ffb43a`,
gold `#ffd34d`, jade `#2fe6a8`, magenta `#ff4dd2`.
- `reference-assets/PROVENANCE.tsv` — filename ↔ source URL map (7 files).
- ref-01 Jiufen lantern glow · ref-02 Shilin night market · ref-03 Raohe market ·
  ref-04 HK neon street · ref-05 Kowloon neon · ref-06 Temple Street market ·
  ref-07 Kenney CC0 top-down shooter sample (readability direction).

## Decisions
- Single-file Canvas 2D (zero deps, runs from file:// or any static server).
- Hearts (3) + 90s timer: cart hit = −1 heart, knockback, 1.4s invuln; 0 hearts or
  timeout = loss. All 6 parcels unlock the gate; win bonus = 10×seconds + 50×hearts.
- Keyboard: WASD/arrows move, Enter start, P/Esc pause, R restart, M mute.
- Auto-pause on tab hide; dt clamp; try/catch around AudioContext + localStorage +
  render loop (recovery banner, never hard-crashes).
- Accessibility: aria-live status announcements, focusable buttons, high-contrast HUD
  pills, `prefers-reduced-motion` disables shake/flicker/blink.
- Test hooks: `?autoplay=1`, `?scene=win|lose`, `?selftest=1` (11 real-system checks,
  report in DOM + title), `window.LanternDash` API.

## Completed work
- [x] Research + 7 reference assets + PROVENANCE.tsv (inspected: lantern glow, neon street, Kenney sample)
- [x] Full game: title → play → pause → win/lose → restart, HUD, particles, audio blips, best score
- [x] Headless Chromium verification: SELFTEST 11/11 (move, walls, collect, collision, timeout-loss, restart, win, resize, best-save)
- [x] Screenshots inspected: title, gameplay, win, loss, narrow-viewport (HUD wrap fixed)
- [x] Evidence saved in `lantern-dash/evidence/` (5 PNGs)
- [x] Fresh-context critic review (general subagent): verified code paths, screenshots, refs,
      re-ran SELFTEST 11/11 independently. Largest gap named: pointer/touch access.
      Fixed in-scope items: clickable HUD Pause button, headlamp facing, dead-code removal,
      static timer id. Full touch d-pad explicitly out of scope (goal: casual DESKTOP players,
      keyboard controls) — documented as known limitation below.
- [x] Post-fix re-verification: SELFTEST 11/11, pause button present in DOM, play screenshot re-captured

## Evidence
- `evidence/shot-title.png` — title card with instructions + start button.
- `evidence/shot-play.png` — live play: HUD 0/6, lanterns, parcels, carts, locked gate.
- `evidence/shot-win.png` — "Delivery complete! Score 1650 · 6/6 · Best 1650".
- `evidence/shot-lose.png` — "Run failed … time expired" + restart.
- `evidence/shot-narrow.png` — 420px viewport: playfield + HUD wrap correctly, no overflow.
- Self-test transcript (Chromium headless `--dump-dom`, `?selftest=1`): 11/11 PASS
  (boot, move-right, move-up, wall-blocks, collect, obstacle-heart, timeout-loss,
  restart, win, resize, best-save). No JS errors (only Chromium dbus stderr noise).

## Blockers
None.

## Current gaps
- Human keyboard play-feel (turn tightness, difficulty balance) judged from screenshots
  only — no live human playtest yet.
- No mobile touch controls (desktop-casual scope; footer documents keyboard).

## Next exact action
Open `/lantern-dash/index.html` in a real browser, play one full run with keyboard,
confirm fun/fair difficulty, then record the playtest note here.
