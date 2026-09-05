# PlayGround — Robo Orb Run 🤖⚡

A tiny 3D browser game: drive a hover-robot around a neon arena, collect **20 energy orbs**
before the 90-second timer runs out, and dodge the patrolling spike-bots. 3 lives.

**Play it:** open `index.html` (served over HTTP, e.g. `python3 -m http.server`) or use the
GitHub Pages deployment.

- Controls: **WASD / Arrows** to move, **Shift** to boost, touch drag-stick on mobile.
- Hero character: “Futuristic flying animated Robot - Low Poly” by Shayan (CC Attribution)
  via Sketchfab — see [ATTRIBUTION.md](ATTRIBUTION.md). Model lives at
  `public/models/robot.glb` with its attribution sidecar.
- Built with Three.js 0.160 + official `GLTFLoader`. All other art and sounds are
  procedural (no extra assets).
