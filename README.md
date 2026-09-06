# PlayGround — Canyon Courier

A small, polished arcade browser game. Pilot a glider through a canyon, thread moving gate pairs and grab delivery packages before the 60s timer runs out.

## Play

```bash
npm run dev
# → http://localhost:3000
```

No dependencies, no build step — just a static `index.html` + `styles.css` + `game.js` served by `server.js`.

## Controls

- ⌨️ `◀ ▶` / `A D` to steer
- 🖱️ drag with mouse, 👆 slide with touch
- `Space` / `Enter` to start / restart

## Rules

- 🚪 Gate gaps: **+10** (combo multiplies)
- 📦 Packages: **+25** (combo multiplies)
- 🔥 Every 3 streak steps raise the combo multiplier (up to ×5)
- 💥 Wall / pylon hits cost 1 ❤ — 3 hits = crash
- ⏱ 60-second run · gates drift, narrow and speed up each level
