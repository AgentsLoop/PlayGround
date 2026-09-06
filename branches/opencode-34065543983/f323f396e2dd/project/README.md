# Renamon — procedural Three.js model (img2threejs)

Renamon (Digimon) rebuilt as a **code-only procedural `THREE.Group` factory**:
`src/createRenamonModel.ts`. No mesh files, no downloads — every part is a
primitive (sphere / capsule / cone / torus / box) assembled from the
img2threejs sculpt spec.

## Run

Any static server works (prebuilt `bundle.js` is committed, no build needed):

```bash
cd project
python3 -m http.server 8123
# open http://localhost:8123/index.html
```

Or rebuild the bundle after editing the factory:

```bash
cd project
npm install
npx esbuild main.js --bundle --format=iife --loader:.ts=ts --outfile=bundle.js
```

Viewer goodies: drag to orbit, wheel to zoom, `R` resets. URL params:
`?static=1` (freeze turntable), `?view=side|front|hero|back`,
`?flat=1` (unlit map-stripped geometry proof), `?wire=1`.

## Pipeline evidence (`forge-out/`)

- `object-sculpt-spec.json` — sculpt spec, passes
  `validate_sculpt_spec.py --strict-quality` with zero errors/warnings
- `assessment.json`, `di.json`, `anatomy.json`, `landmarks.png` — intake artifacts
- `pbr/` — reference-derived PBR evidence (`extract_pbr_evidence.py`) + per-region albedo fields
- `review-blockout.png`, `comparison-blockout.png` — blockout review (refine-code:
  humanoid template cannot express fox anatomy)
- `verify-side/front/hero.png`, `comparison-structural.png`,
  `review-structural-flat.png` — structural-pass review (continue, vision 0.80)

## Reference

`assets/renamon-reference.png` — chosen via the image-search skill
(`assets/search_results.json`, query "Renamon Digimon full body"):
side-stance full body on black, clean silhouette, all identity details visible.

## Fidelity statement

Stylized/low-poly reconstruction from a single side view. Back side, soles,
and inner-ear detail are inferred (per-region confidence in the spec); the
model does not claim exact geometry. Idle animation: tail sway + ear twitch
via `userData.sculptRuntime.tick`; `sockets.head/hand-l/hand-r/tail` exposed.
