# Attribution

## Enemy soldier model
- Model: "Low Poly Soldier" (`b715ac1b71824543bb7f22aa40c7404e`)
- Author: MLGprogect (https://sketchfab.com/MLGprogect)
- Source: https://sketchfab.com/3d-models/none-b715ac1b71824543bb7f22aa40c7404e
- License: CC Attribution
- Asset: `public/models/soldier.glb` (277 KB, 2962 faces, 6 meshes, 6 materials, static pose, no skins/animations)
- Reference thumbnail: https://media.sketchfab.com/models/b715ac1b71824543bb7f22aa40c7404e/thumbnails/709e5d97ab8348eeaefc007173af86d0/3b0e4ac3edfc4cf1ada5b1b6977ff043.jpeg
- Verification: rendered in Three.js (GLTFLoader r160) in `/tmp/cmp-soldier3.png` — pose, proportions, vest/balaclava materials match the Sketchfab reference tile; also verified live as in-game enemy bots.
- Note: first candidate (`daf5de38902e458aa57ff5ba9460ca02`, Kolos Studios) was rejected — its skinned export assembles incorrectly in standards-compliant loaders (exploded limbs at any scale; verified via isolated renders).

Rifle viewmodel is fully procedural (no external asset) — purpose-built as an FPS viewmodel.
