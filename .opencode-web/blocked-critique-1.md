Resume your existing Goal: `call of duty` in this same session - do not create a new session, do not restart, keep working on the current files.

Per `Agents.md Goal-mode continuation policy`: use `[goal:blocked]` ONLY when concrete user input is genuinely required. Do NOT use `[goal:blocked]` for vague scope, difficulty, missing polish, budget/time pressure, or lack of optional assets. A vague prompt like `call of duty` is NOT a blocker - make best assumptions and build the best achievable playable homage until your execution budget (10 auto-continues, 900s, 200,000 tokens) is exhausted.

Current state to resume from: `index.html` (~21KB single-file top-down wave shooter - Call of Duty: Browser Ops). Your job now is highest-impact achievable improvements, not explaining why a perfect AAA clone is impossible:

1. Audit: `ls -la`, Read `index.html`, confirm it still parses and runs.
2. Visible browser verification NOW: launch/serve `index.html` in a real browser (playwright/puppeteer/screenshot tool if available, else `python3 -m http.server` + capture), take screenshots of menu, gameplay, wave combat, game-over. View them.
3. Harsh visual + gameplay critique after each run: list concrete flaws vs real Call of Duty feel (lighting, terrain/cover readability, character/weapon readability, HUD/m Hitmarkers/killfeed/minimap, menu polish, gunfeel/screen-shake/tracers/muzzle-flash, enemy AI variety, audio) and fix them immediately.
4. Implement the biggest wins first in `index.html` keeping zero-dependency single-file where possible: CoD-style main menu + HUD + minimap + killfeed + hitmarkers, WASD+sprint+mouse aim/shoot, 2-3 weapons (e.g. M4A1/MP5 + ADS/zoom, reload/reserve), escalating waves with distinct enemy types + cover + pickups, health-regen + armor, particles/tracers/shake, procedural WebAudio SFX, pause/game-over/restart, mobile fallback, 60fps performance. Use requested browser stack. If you upgrade to 3D FPS, you MUST use Three.js + the `load-sketchfab-threejs` skill for suitable downloadable soldier/weapon/map GLBs.
5. Re-verify after EVERY meaningful improvement: HTML parse + JS syntax check + fresh browser screenshots + harsh self-critique, then iterate again. Never ship blind.
6. Never claim `[goal:complete]` while it is not visibly playable, fun, and recognizably CoD-inspired in screenshots. When fully satisfied, summarize evidence on a `[goal:evidence]` line then `[goal:complete]`.

Stop only when budget is exhausted or concrete user input (e.g. credentials, private assets) is genuinely required - with that specific blocker stated immediately before `[goal:blocked]`.
