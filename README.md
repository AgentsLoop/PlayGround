# Lantern Moth — Dark Garden

Small playable browser game. Move a moth with **Arrow Keys / WASD** (or drag/swipe on touch) inside a dark garden, collect glowing pollen before the **60-second** timer expires. Each pollen is **+10 score** and briefly expands the light radius (2s, 110 → 185px). Touching a **spider** costs one life (**3 lives**). Features start screen, HUD (score/time/lives/light), game-over with rank, pause (P), restart (R / Space / button), responsive HiDPI canvas, and original Canvas-only visuals (no external assets).

## Run locally

**Option A — just open:**
```
open index.html
# or double-click index.html
```

**Option B — local server (recommended for mobile testing):**
```
npx serve .
# or: python3 -m http.server 8000
# then visit http://localhost:3000  (or 8000)
```

No build step, no dependencies, no CDN. All assets are drawn with Canvas API.

## Controls
- **Move:** Arrow Keys / WASD, or touch & drag
- **Pause:** P or Esc
- **Restart:** R or Space (on game-over) or buttons
- **Start:** Space or "Enter the Garden" button or canvas click

## Files
- `index.html` — structure + overlays + HUD
- `style.css` — responsive layout, themes, HUD
- `game.js` — game loop, physics, light cutout (`destination-out` radial gradient), pollen/spiders, particles

## Responsive / HiDPI
Canvas bitmap resizes to `container width × devicePixelRatio` and scales logical 960×600 coordinates via `ctx.scale(scaleX, scaleY)` (`game.js: resizeCanvas()`). Input mapping uses `getBoundingClientRect()` → logical space, so touch/pointer stays aligned on phones, tablets, and Retina screens.

## Verification
```
node --check game.js  # syntax OK
# Open index.html and confirm: score increments, timer 60→0, light blooms on pollen, 3 lives, spider damage with invuln flash, start/game-over/restart work, no network requests.
```
