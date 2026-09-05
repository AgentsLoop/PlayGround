# Star Runner 3D

Playable Three.js browser game. Fly a Sketchfab spaceship, collect 12 stars in 60 seconds, avoid drifting asteroids.

## Play

Open `index.html` via a local server (module imports require HTTP):

```sh
python3 -m http.server 8000 --directory project
# → http://127.0.0.1:8000/
```

Or open the GitHub Pages deployment for this repo.

Controls: **WASD / Arrow keys** (touch buttons on mobile).

## Attribution

Hero ship: “Low Poly Spaceship” by EdwiixGG, CC Attribution.
Source: https://sketchfab.com/3d-models/none-82f637f65f894ffe948300183ebe904d
UID: `82f637f65f894ffe948300183ebe904d`
Local model: `public/models/spaceship.glb` + `.attribution.json`
Note: GLB uses archived `KHR_materials_pbrSpecularGlossiness`; the bundled
normalizer refused conversion (non-dielectric specular values), so the original
GLB is used as-is with a procedural fallback ship if loading fails.
