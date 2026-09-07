Resume your existing Goal in this same session — do not create a new session, do not restart, keep working on `index.html` now.

`[goal:blocked]` is rejected here. Scope, difficulty, missing polish, budget, or lack of optional assets are not blockers. Make the highest-impact achievable improvements now instead of explaining why a perfect result is impossible. Stop only after your execution budget is exhausted or concrete user input is genuinely required.

Do this now:

1. Inspect and repair `index.html`. Your last diffs show `@BLOCKED_CONTEXT@` corruption in input/reload logic (`if(k==='r')...`, `if(keys['r']...`). Read the full file, remove all corruption, restore clean logic: WASD/arrows move, mouse aims, click/hold fires, R reloads in `play` and restarts in `win/lose/menu`, P pauses, Enter starts/restarts, START/RESTART/REDEPLOY buttons call `reset()`.
2. Use the requested stack: single self-contained vanilla HTML/CSS/JS canvas with original names/assets, restrained military-console style. This is 2D so `load-sketchfab-threejs` GLBs are not applicable — do not add external 3D/models.
3. Verify all acceptance criteria are truly met: movement + pointer aim/fire, short wave (e.g. 12 hostiles) with visible hit-flash/knockback/floaters/death bursts, clear HP/ammo + reloading feedback, obvious MISSION COMPLETE victory and OPERATOR DOWN defeat overlays with stats, reliable visible restart control + keys.
4. After each meaningful fix, do visible browser verification + harsh visual critique: serve via `python3 -m http.server`, open in browser, screenshot gameplay, victory, defeat, HUD, check console for errors, critique readability, contrast, arena bounds, effects, WebAudio cues, and fix before proceeding.
5. Never claim completion while criteria are unmet. Only when fully playable and verified, summarize evidence on a line starting with `[goal:evidence]`, then end with `[goal:complete]`.
