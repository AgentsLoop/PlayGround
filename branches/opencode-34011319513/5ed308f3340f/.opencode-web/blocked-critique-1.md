Resume your existing Goal in this same session — do not create a new session, new branch, or restart. You are still on `opencode/34011319513` with `project/` STRIKEPOINT as your base. Keep working toward the original request: a ThreeJS first-person shooter at the visual/mechanical level of recent Call of Duty, utterly polished across textures, physics, lighting, animation, audio, HUD and gunfeel.

Do NOT emit `[goal:blocked]` for scope, difficulty, lack of AAA polish, time/token budget pressure, or missing optional assets. Those are not blockers — implement the best-achievable version now instead of explaining why perfection is impossible. Only use `[goal:blocked]` if concrete user input/credentials are genuinely required, stated on the line immediately before it. Do NOT emit `[goal:complete]` while blind side-by-side vs CoD would still clearly favor CoD.

Make the highest-impact achievable improvements now, using fan-out sub-agents + ultracode:
1. Visual fidelity: ACES/post, PBR material tuning, procedural detail textures, improved compound set-dressing, dynamic shadows/fog/dust/muzzle-light, weapon viewmodel polish.
2. 3D assets via `load-sketchfab-threejs` skill only: select suitable downloadable GLBs for weapon/enemies/props, preserve attribution sidecars in `project/public/models/`, run inspect/validate scripts to verify geometry/materials/animations (fix skinned-clone rebinding, skinning-aware scale, T-pose to patrol-carry/walk, frustum culling).
3. Gameplay: recoil/ADS/spread/damage-falloff, tracers/impacts/blood-puffs, enemy patrol/chase/attack AI + waves + death anims, audio, HUD/minimap/killfeed/touch.
4. Harsh AAA critic sub-agent: after every meaningful change, do real headless-Chrome verification (`node --check`, `--dump-dom`, `--screenshot`), read the screenshots, run a brutal blind CoD-vs-this critique, and iterate until wowed or budget exhausted.

Never claim a milestone complete without opening the running game and capturing visible evidence under `project/screenshots/`, committing+pusing, and posting `gh issue comment`. Stop only after the configured execution budget is exhausted or concrete user input is genuinely required.
