# PlayGround — Robo Orb Run 🤖⚡

A tiny 3D browser game: drive a hover-robot around a neon arena, collect **20 energy orbs**
before the 90-second timer runs out, and dodge the patrolling spike-bots. 3 lives.

The game is self-contained under [`project/`](project/) — just static files, no build step,
no dependencies.

**Run it:**

```sh
npm start          # serves project/ on http://127.0.0.1:3000/
# or: npm --prefix project start
# or: PORT=8080 npm start
```

- Controls: **WASD / Arrows** to move, **Shift** to boost, touch drag-stick on mobile.
- Hero character: “Futuristic flying animated Robot - Low Poly” by Shayan (CC Attribution)
  via Sketchfab — see [project/ATTRIBUTION.md](project/ATTRIBUTION.md). Model lives at
  `project/public/models/robot.glb` with its attribution sidecar.
- Built with Three.js 0.160 + official `GLTFLoader`. All other art and sounds are
  procedural (no extra assets).
