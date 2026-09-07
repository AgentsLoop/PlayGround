Resume your existing Goal `call of duty` in this same OpenCode session — do NOT create a new session, new goal, or new workspace. You are continuing Goal-mode work until the execution budget (time/tokens/turns) is exhausted.

Per `AGENTS.md` Goal-mode continuation policy: `[goal:blocked]` is FORBIDDEN for scope, difficulty, size, polish gaps, budget, or missing optional assets. Only use `[goal:blocked]` if concrete user input is genuinely required and state that blocker on the line before it. Otherwise keep building the best achievable implementation now — do not explain why a perfect Call of Duty clone is impossible.

Source of truth: original request = `call of duty`. Current state: `index.html` 15.7KB single-file canvas arena shooter exists and passes `node --check` + stubbed smoke test. Do NOT start over. Inspect `index.html`, `README.md`, `Agents.md`, and installed skills under `.agents/skills/` + `skills/`.

Make the highest-impact achievable improvements NOW in priority order:
1. Playability as CoD-inspired FPS/arena shooter: WASD+mouse, sprint/ADS/reload, health-regen, waves, cover, HUD/score/killfeed, game-over/redeploy, audio.
2. Visual fidelity leap: textured ground, lighting/muzzle-flash/screenshake/particles/hitmarkers/blood, animated enemies, weapon viewmodel, minimap, CoD-style menu/HUD fonts.
3. If moving to true 3D FPS, you MUST use the `load-sketchfab-threejs` skill for suitable downloadable GLB assets (weapon, soldier, props) and use Three.js — check skill docs first, vendor GLBs locally, wire them in.

After EACH meaningful improvement you MUST: launch visible browser verification (load `index.html` via local server + screenshot with available browser tooling), look at the screenshot yourself, write a harsh visual critique (what looks cheap/broken vs real CoD), fix it in code, and re-verify. Never claim `[goal:complete]` while the game is unplayable, blank, errors, or visually unconvincing — keep iterating.

Stop only when the configured budget is exhausted or concrete user input is genuinely required.
