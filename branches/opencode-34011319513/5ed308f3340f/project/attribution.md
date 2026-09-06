# Attribution — 3D assets (CC Attribution via Sketchfab)

## Viewmodel — tactical rifle
- Model: “Low poly M4 rifle”
- UID: `9836b8d7a1984d5a83f0be2827af1d60`
- Author: Jithran (https://sketchfab.com/theassman)
- License: CC Attribution
- File: `public/models/rifle.glb` (556,936 bytes, 8,135 faces, 2 meshes, 1 material)
- Sidecar: `public/models/rifle.glb.attribution.json`

## Enemies — rigged soldier
- Model: “FREE [Military Soldier] RIGGED”
- UID: `e9c56308a67d4a3db62e914fafa4d198`
- Author: BAMEN (https://sketchfab.com/bamenwo05)
- License: CC Attribution
- File: `public/models/enemy.glb` (914,972 bytes, 11,104 faces, 11 meshes, skinned 79 joints)
- Sidecar: `public/models/enemy.glb.attribution.json`

Both models load through the official Three.js `GLTFLoader` (CDN-pinned three@0.185.0).
A procedural fallback (rifle viewmodel + soldier) is built in code if a GLB ever fails to load.
