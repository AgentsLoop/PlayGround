Resume this same Goal-mode session and keep working — do not create a new session, do not restart, do not ask for user input for scope/difficulty/polish/budget reasons.

You are under Goal-mode continuation policy: use [goal:blocked] only when concrete user input is genuinely required. Difficulty, large scope, missing polish, budget pressure, or lack of optional assets are never blockers — make the highest-impact achievable improvements now with the best available implementation until time/token/turn budget is exhausted.

Original objective remains: production-quality browser RTS inspired by StarCraft 2 in rts/ (STARFALL COMMAND) with selectable units/buildings, resource gathering, construction, production queues, combat, fog of war/visibility, camera pan/zoom, and complete match loop with loading, onboarding, faction/scenario choice, active match, pause/restart, victory, defeat, invalid/insufficient-resources, and error recovery — operable keyboard+mouse, responsive desktop, polished without devtools.

Current state: rts/index.html, style.css, game.js exist; PROGRESS.md exists; headless Chromium verification via playwright-core showed economy +90 alloy/5s, +36 plasma/6s, depot/gate/extractor placement supply 6->23, production 6->9, box-select 6 units, attack-move damage 1600->1483, zero page errors with screenshots in /tmp/opencode/; a fresh-context critic was launched but final gaps not yet closed.

Do now in this session:

1. Read PROGRESS.md, rts/index.html, rts/style.css, rts/game.js, .opencode-web/opencode-run.log and inspect /tmp/opencode/*.png. Restart http.server on 8901 if needed and re-verify syntax and live load.
2. Use the requested stack (vanilla HTML/CSS/JS canvas) and any matching installed skills; include load-sketchfab-threejs for suitable downloadable GLB assets only if the request were 3D — for this 2D canvas RTS keep original canvas assets, no copying protected SC2 assets.
3. Identify and fix the single largest remaining gap vs acceptance bar (desktop layout, combat readability, selection feedback, economy, build flow, end states, onboarding/faction/pause/restart/victory/defeat/toasts, camera/minimap/fog, keyboard operability) then re-verify.
4. Require visible browser verification after each meaningful improvement: run playwright-core with executablePath /usr/bin/chromium --no-sandbox, exercise a fresh match start-to-finish — resource collection, construction, unit production, selection/movement, attack/damage/kills, defeat and victory paths — capture new screenshots and log zero console errors; then run a fresh harsh visual/implementation critique inspecting real artifacts and send work back for improvement if bar unmet.
5. Update PROGRESS.md live with reference URLs (at least 6 with purpose), decisions, completed work, evidence, blockers, current gaps, next exact action so another agent can resume.
6. Never claim completion while success criteria are unmet; do not emit [goal:complete] without a [goal:evidence] line backed by real browser evidence. Stop only after configured execution budget is exhausted or concrete user input is genuinely required with reason stated before [goal:blocked].
