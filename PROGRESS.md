# Mortal Combat — Live Progress (canonical, resume here)

## Objective
Polished, immediately playable browser 1v1 fighting game. Original assets, arcade fighting-game visual language: HUD health/timer/round pips, ROUND/FIGHT/FINISH HIM flow, best-of-3, blocking, hit feedback, win/loss + restart, responsive controls, AV feedback.

## Reference anchors (authoritative URLs + downloaded images)
URL anchors (web search, 2026-09-07): SuperCombo MK1992 HUD, arcade-museum cabinet spec,
gamesdatabase format description, 2× MobyGames screenshots (select + gameplay),
LaunchBox state gallery, Fatality-wiki FINISH HIM flow, announcer vocabulary.
Downloaded via image-search skill (`mortal-kombat/references/` + JSON metadata):
- `mk/` (6 imgs) — Scorpion-vs-Sub-Zero rivalry art; guided BLAZE-vs-FROST warm/cool coding + masked-fighter art.
- `arena/` (4 imgs) — temple/dark-arena stages; guided canvas arena (silhouette, torches, emblem, floor ring, vignette).
- 2 early queries returned junk (cars/paintings) — deleted, recorded honestly.

## Execution (builder → fresh-context critics → fixes)
- Lead built `mortal-kombat/index.html` (~44KB, zero deps).
- Critic 1 (combat/rounds): found round-accounting flaws — FIXED: atomic `roundSettled` guard,
  `roundEnd` state driven by in-loop countdown (no setTimeout round flow → pause/tab-hide safe),
  `finishWinner`/`finishLoser` refs, harmless projectiles during FINISH HIM, CPU finisher path,
  bolt cooldown charged on fire, pause extended to intro/finish/roundEnd, 10s timer announcement.
- Critic 2 (visual/a11y): found identical silhouettes + gaps — FIXED: per-fighter bulk/height/gear
  (BLAZE horns+ember fist, FROST pads, VIPER sash, ONYX plates), rim-light hit flash,
  vector knot emblem (emoji removed), reduced-motion gating (bob/flicker/scroll/glow),
  HUD text strokes, canvas focus + select focus-restore + arrow-key select, scrollable screens,
  honest touch=P1-only help note.

## Evidence (all recorded, re-runnable)
- `node --check` on extracted script: OK. DOM ID cross-check: 25 used, 0 missing.
- Headless logic harness (`/tmp/opencode/harness.js`, DOM/canvas stubs): **11/11 PASS** —
  intro→fight→roundEnd→round2→finish→finisher→gameOver 2-0→rematch reset, double-resolution ignored,
  finish projectile immunity, bolt cooldown timing.
- Delivery: `python3 -m http.server` serves `index.html` → **HTTP 200, 44497 bytes**.
- References inspected with vision (arena colosseum, temple stage, Scorpion/Sub-Zero art).

## Known limitations (explicit, not blockers)
- No real-browser pixel screenshot in this env (no browser tooling); verification via code checks,
  headless logic tests, vision-read references, and 2 fresh-context critics.
- Touch drives P1 only (documented in Help); canvas is CSS-scaled, no DPR supersampling.

## Status: COMPLETE — next action: none (goal satisfied, evidence above).
