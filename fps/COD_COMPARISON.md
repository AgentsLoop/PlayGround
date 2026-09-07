# FINAL vs Real Call of Duty — Feel/Visual Bar Comparison

All art, audio, and code in `fps/index.html` are original and procedural.
Three.js via CDN importmap only. **No CoD assets, names, maps, or audio copied.**

| Dimension | Real Call of Duty bar | Final build (`fps/index.html`) | Gap / verdict |
|---|---|---|---|
| Responsiveness (move/look) | 60–120fps, accel-tuned strafe, sprint-out ~200–300ms, slide/cancel systems | WASD 4.8 / sprint 7.2 / ADS 3.2 m/s, accel 14 ground, delta-clamped 120Hz substeps, FPS meter, 0.25s sprint-out gating fire+ADS (Critic-A fix) | Close at 60fps on desktop; no slide/dolphin-dive (scope cut) |
| Gunfeel (ADS/recoil/reload) | ADS FOV snap ~50–55, weapon kick + visual spray, per-gun recoil tables, reload anims + sprint-cancel | ADS FOV 75→55 with ~150ms critically-damped spring settle, sens halved, spread tighten, 700rpm auto / 30rd / 1.8s reload, persistent-ish recoil with fixed slight-right bias (player pulls down) | No per-gun tables or anims; single procedural rifle only |
| Feedback readability | White hitmarker + red kill confirm, damage numbers (HC), tracers, muzzle/impact VFX, directional damage, killfeed, low-HP overlay + heartbeat | White-X pop + red-X larger kill confirm (transform keyframes), pooled damage numbers (cap 12, transform-based), box-additive tracers (life .14, width .045), muzzle flash+light, spark+dust impacts, vignette + correct directional indicator (`rel = worldAng + yaw`, verified ahead/behind/left/right), low-HP pulse+heartbeat, screen shake, killfeed max 5, health bar, compass strip, all WebAudio synth | Readability bar met; numbers/VFX simpler than AAA |
| Objective flow | Mission/round objectives, waves, win/lose screens, pause, stats, restart | Eliminate 8 hostiles / 120s, waves (max 3 alive, spawn 1.6s), kills-remaining + timer + wave + score HUD, start menu with objective+controls, pause on lock-loss (elapsed/timeLeft/AI frozen), distinct MISSION COMPLETE / KIA / TIMEOUT screens with time/kills/accuracy/score + restart via `resetGame` (Critic-C fixes: paused-until-relock, enemyId=0, keys cleared, clock flushed, tracer dispose, vignette/timer reset) | No campaign/round economy; single mission loop only |
| Visuals | Photogrammetry maps, PBR, mocap, volumetric light, gore | Procedural low-poly walled compound + crates, capsule bots, Lambert/Standard mats, fog + grid, no gore | Deliberately stylized (see divergences) |

## Round 2 upgrades (resumed session, browser-verified 2026-09-07)

Baseline headless screenshot (`/tmp/fps-baseline.png`, 90911B) showed the scene nearly BLACK
behind the start menu with no gun visible. Two separate builders + two fresh critics fixed it:

- **Builder-M (map readability):** ACESFilmic exposure 1.1, hemi 1.0 + ambient 0.25 + sun 1.35,
  sky gradient + fog 40–90, tan two-tone ground 8x8, sand walls + crate edge trim,
  enemy emissive red eye + white foot ring. Screenshot `/tmp/fps-mapfix.png` readable.
- **Builder-W (weapon, via `load-sketchfab-threejs` skill):** queries
  `"low poly rifle gun"` + `"stylized rifle FPS"` (downloadable, ≤5MB/≤20k faces) → 11 candidates,
  picked tile 0. GLB `fps/models/rifle.glb` (411408B, 8 meshes, 6081 tris, 0 textures, no extensions).
  Isolated A/B viewer `?only=three`: Reference + Three.js Rendered, 0 errors, screenshot
  `/tmp/sketchfab-ab-three.png`. Integrated async with procedural fallback (BUILDER-W block).
- **Builder-E + Fixer:** RoomEnvironment IBL (`three/addons/`, environmentIntensity 0.35) +
  PBR clamp (metal ≤0.6, rough ≥0.4, envInt ≥0.5), camera fill PointLight 0.8/3m,
  exposure 1.1→1.25, ground/crates +15%, sight dots, relock-failure recovery
  (pauseHint + ensurePauseOverlay + focusPrimary/Enter), +REGEN + SPRINT… HUD cues.
  Final `fps/index.html` 53880B, module 43089B `node --check` PASS,
  screenshots `/tmp/fixer-now.png` + `/tmp/final-verify.png` (~130KB): tan grid ground,
  crates/walls readable, rifle bottom-right gunmetal (was black/absent), zero JS errors
  (only headless dbus/gpu infra noise).
- **Critic-V (fresh, blind NOW vs BASE):** NOW wins wide — map readable vs void, gun present
  vs absent. Scores NOW: map 5/10, weapon 4/10, lighting 4/10, HUD 8/10. Largest gap: weapon
  hero-readability (addressed by fill+clamp+exposure above; sights still simpler than CoD optic).
- **Critic-P (fresh, logic + console):** all flow checks PASS (8/120s, waves 3/1.6s, three endings
  + stats, resetGame enemyId/keys/clock/dispose/paused-until-relock, sprint-out 0.25, 700rpm/30rd/1.8s,
  ADS FOV 75→55, pause-on-unlock, regen). Zero console/404/THREE errors. Start-menu A/B vs baseline:
  TIE on copy (identical, readable <5s). Largest gap fixed: failed-relock limbo recovery above.

Weapon viewmodel: "Low-poly M4 assault rifle" by szaw (CC Attribution, Sketchfab,
UID fb85c455cf374675a1db7988def2d926) — `fps/models/rifle.glb` + sidecar
`fps/models/rifle.glb.attribution.json`; procedural fallback retained, no CoD assets.

- **Critic A (movement): piece-a won movement** — responsive WASD/sprint/jump core, ADS FOV kick, recoil, and wall collision (`wallMeshes`) felt closest to a real shooter baseline. Integrated verbatim + sprint-out fix.
- **Critic B (readability): piece-b won readability** — hitmarker/kill-confirm language, tracers, damage numbers, directional indicator, killfeed, and synth audio were the clearest. Integrated verbatim + transform-keyframe + correct-indicator fixes.
- **Critic C (flow): piece-c won flow** — 8-kill/120s objective, wave spawner, pause-on-unlock, and MISSION COMPLETE / KIA / TIMEOUT + stats + restart gave the only complete game loop. Integrated verbatim + reset fixes.

## Deliberate divergences (originality / scope choices)

1. **Procedural low-poly vs photogrammetry** — originality + scope: zero copied assets, runs anywhere, single self-contained file.
2. **No gore / dismemberment** — originality/tone: death is fall+fade only; keeps the game non-graphic.
3. **Simplified WebAudio synth vs studio audio** — scope: all SFX synthesized (shot/hit/kill/hurt/heartbeat/reload); no samples, no mixing bus.
4. **No minimap / killstreaks / perks** — scope: compass strip + killfeed + score only; keeps the loop to one mission.
5. **Simple seek bot AI vs tactical AI** — scope: capsule bots approach/strafe, melee <2.3m, ranged spit 4–26m; no cover, squading, or pathfinding.
