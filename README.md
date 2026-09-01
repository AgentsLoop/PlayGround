# Lantern Moth — Dark Garden

Small playable browser game: guide a lantern moth through a dark garden, collect glowing pollen before the 60-second timer runs out while avoiding spiders.

## Run locally

No build step — single file, no external assets, no dependencies.

**Option A — just open:**
```
open index.html
```
Double-click `index.html` in your file browser.

**Option B — local server (recommended for audio):**
```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```
or
```bash
npx serve .
```

## Controls

- **Move:** `WASD` or `Arrow Keys` — also drag/swipe on the garden, or use on-screen D-pad on mobile
- **Start:** `Space` or click `Enter the Garden`
- **Pause:** `P` or `Esc` (auto-pauses when tab hidden)
- **Restart:** `R` or `Space` on game-over screen

## Rules

- Collect **pollen orbs** → **+10 score** + brief **light radius expansion** (~0.95s, +82px)
- Touch a **spider** → **−1 life** (3 lives total) + 1.35s invulnerability + screen shake + light collapse
- **60-second timer** — when it hits 0, game ends (rank: Night Ends / Guardian / Dawn Bringer)
- HUD shows score, time, lives; game has start screen, pause, and game-over states with restart

## Stack

Pure `index.html` (HTML/CSS/Canvas JS). Visuals are procedural canvas gradients/ellipses/arcs; audio is Web Audio beeps (no files). Responsive via `aspect-ratio` and fluid width.

## Files

- `index.html` — the entire game (open it)
- `README.md` — this file
