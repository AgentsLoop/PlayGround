# Pocket Comet Courier: Neon Delivery Dash — PROGRESS

## Goal
Polished, small, playable 2D browser game. Pilot a tiny comet through neon city, thread moving hazards, collect parcels, reach next checkpoint before route collapses. Downwell fidelity reference: terse arcade composition, high-contrast readability, momentum-first input, compact repeatable run loop. Playable in browser, keyboard + touch, responsive, title/play/score/pause/gameover/restart/progression/high-score.

## Research — visual / interaction anchors (all local in `reference-assets/`)
Inspected local files directly with vision (01,02,05,07 viewed; all validated via `file`).

| # | Local file | Source URL (provenance) | Anchor taken |
|---|------------|-------------------------|--------------|
| 1 | `01-downwell-vg247.jpg` (1920x1080) | https://assetsio.reedpopcdn.com/VG247-x-Downwell.jpg?width=1920&height=1920&fit=bounds&quality=80&format=jpg&auto=webp (via https://www.vg247.com/downwell-best-mobile-game-heads-to-apple-arcade) | GEMHIGH top decay bar → route-collapse timer bar; terse 3-color HUD |
| 2 | `02-downwell-mobygames-cave.png` (1200x750) | https://cdn.mobygames.com/screenshots/15735975-downwell-windows-a-cave-with-lots-of-gems.png (via https://www.mobygames.com/game/76071/downwell/screenshots/windows/818358/) | HP `3/4` bar + gem counter + vertical charge meter; white-on-black shaft, red pickups |
| 3 | `03-downwell-nintendolife.jpg` (1280x720) | https://images.nintendolife.com/screenshots/94824/large.jpg (via https://www.nintendolife.com/games/switch-eshop/downwell) | Narrow vertical well + side walls; sparse terse composition |
| 4 | `04-downwell-linclo.png` (1280x800) | https://linclogames.com/wp-content/uploads/2021/08/downwell_screen02.png (via https://linclogames.com/3-reasons-why-downwell-is-so-good/) | White=safe / red=danger readability rule |
| 5 | `05-synthwave-runner-steam.jpg` (1920x1017) | https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2694390/ss_15801caff6b47588b5198f41b7be1240fc3c3feb.1920x1080.jpg?t=1701709311 (via https://store.steampowered.com/app/2694390/Synthwave_Runner/) | Synthwave sun + magenta grid; chunky SCORE HUD |
| 6 | `06-synthwave-runner-itch.png` (1525x909) | https://img.itch.zone/aW1hZ2UvMzA2ODg2OC8xODM1NDA0Mi5wbmc=/original/dXy4TX.png (via https://ryan-garcia.itch.io/synthwave-runner) | Runner platform rhythm; crate obstacle language |
| 7 | `07-pixel-comet-freepik.jpg` (2000x2000) | https://img.freepik.com/premium-vector/pixel-art-meteor-colorful-retro-comet-illustration-with-fiery-trail-space_1292377-23478.jpg?w=2000 (via https://www.freepik.com/premium-vector/pixel-art-meteor-colorful-retro-comet-illustration-with-fiery-trail-space_358844816.htm) | Comet head + fiery trail + debris particles |

## Decisions
- Side-view neon canyon flyer with momentum flight (Downwell momentum-first analog).
- Route-collapse timer (GEMHIGH analog): 30s, +3.5s/parcel, checkpoint every 5 parcels (+6s, +250, +1HP, speed ramp). Timeout or 0 HP ends run.
- 3–4 HP with i-frames, streak multiplier (combo analog), boost dash with 3s cooldown (gunboots-hover analog).
- Single-file `index.html` (31KB, 600 lines, 0 external refs) — file:// + any static host.
- Persistence `pcc_best_v1 / pcc_best_route_v1 / pcc_muted_v1 / pcc_total_deliveries_v1` with in-memory fallback; audio WebAudio bleeps with autoplay-safe fallback.
- Accessibility: real buttons, aria-live, progressbar roles, focus-visible, `prefers-reduced-motion`, high-contrast.

## Completed
- [x] Research + 7 downloads + vision inspection + provenance.
- [x] Full game: title/start, how-to, play, score/streak/route HUD, timer bar, HP, boost, pause/resume, game-over, restart, progression, best persistence, keyboard (Arrows/WASD/Space/P/Esc/Enter) + pointer-drag + touch D-pad + BOOST/PAUSE buttons, responsive desktop+mobile, mute, auto-pause on hide.
- [x] Browser verification: chromium headless captures desktop 1280x900 + mobile 390x844 (title, play, pause, game-over); 11/11 selftest PASS via `?selftest=1`; console clean except expected AudioContext-autoplay INFO (handled).
- [x] Critic pass (fresh-context subagent): largest gap was desktop controls below fold → FIXED via `width:min(100%,calc((100dvh-270px)*0.6667))` so D-pad+BOOST+PAUSE visible without scroll; hpRow per-frame churn fixed; laser-bar contrast outline added; game-over visual proof captured.

## Evidence
- `index.html` — the game (open directly or `python3 -m http.server 8099`, then http://127.0.0.1:8099/index.html).
- `evidence/01-title-desktop.png` — title card, START/HOW/SOUND, best line.
- `evidence/02-play-desktop.png` — active play: comet, 3 parcels, drone+mine+laser-bar, synth sun/grid, SCORE/ROUTE/timer/HP/boost, full controls visible.
- `evidence/03-play-mobile.png` — 390x844 mobile: HUD + large touch targets, no overflow.
- `evidence/04-pause-desktop.png` — PAUSED with RESUME/RESTART/TITLE.
- `evidence/05-gameover-desktop.png` — COURIER DOWN 1,250, 7 parcels route 2, NEW BEST, FLY AGAIN/TITLE, footer BEST persisted.
- Selftest (`?selftest=1`): 11/11 PASS — start, timer decay, pickup, damage, boost, pause, resume, death→over, restart, timeout, persistence.
- Perf/operability: 31KB single file, 0 network deps, 60fps rAF, particle cap 220, trail cap 26, works with blocked storage/audio (fallbacks + footer note).
- A/B vs anchors: timer bar↔GEMHIGH, HP/boost↔Downwell meters, red=danger on dark, amber parcels↔gems, sun/grid↔synthwave ref, comet+trail↔pixel-comet ref.

## Blockers
- None.

## Current gaps
- None blocking. Future polish (optional): route-themed palettes, more hazard patterns, engine hum.

## Next exact action
- Done. To resume: `python3 -m http.server 8099 --directory .` and open `index.html`; verification via `?selftest=1`, `?autostart=1`, `?gameover=1`, `?pause=1`.

## Port-3000 verification (Agents.md pass)
- Entrypoint confirmed: `./index.html` (31KB) exists; `dist/index.html` absent (not needed — root file is served).
- Server: tmux session `app-server` running `python3 -m http.server 3000`; `curl http://127.0.0.1:3000/index.html` → 200 with `<title>Pocket Comet Courier: Neon Delivery Dash</title>`.
- Browser tests on port 3000 via `?selftest=1`: 11/11 PASS (start, timer decay, pickup, damage, boost, pause, resume, death→over, restart, timeout, persistence).
- Console: no uncaught errors; only expected AudioContext-autoplay INFO (handled with gesture-safe fallback).
- Final captures in `screenshots/`: `final-title-desktop.png`, `final-play-desktop.png`, `final-play-mobile.png`, `final-gameover-desktop.png` — all visually inspected.
- Agents.md skills review: `npx skills find` returned off-stack candidates (java-mcp/blazor/marketing-browser/playwright bundles requiring heavy browser downloads); no credible required install — used validated direct path (python http.server + system chromium smoke-tested). No blocking dependency; limitation recorded here.
