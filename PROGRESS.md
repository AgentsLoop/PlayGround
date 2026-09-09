# Lantern Lake Dash — Live Progress

## Play
- Open `lantern-lake-dash/index.html` in a browser (double-click works, no server needed).
- `?play` autostarts; title → Set sail → collect 8 lanterns → dock before 90s.

## References (Mini Metro visual anchors, local + provenance)
Visual bar: calm flat minimalism, strong hierarchy, simple shapes, readable state.
- `reference-assets/mini-metro-01-screenshot-2.jpg` — https://dinopoloclub.com/wp-content/uploads/2019/09/screenshot-2.jpg
- `reference-assets/mini-metro-02-classic-map.jpg` — https://dinopoloclub.com/wp-content/uploads/2019/09/ss_a4dd86e1cc077d2a4c1e246fb051c72a73d5b4a0.1920x1080.jpg
- `reference-assets/mini-metro-03-network.jpg` — https://dinopoloclub.com/wp-content/uploads/2019/09/ss_3114bd0ec26d8b64bc832ecd00c2bff4d894a903.1920x1080.jpg
- `reference-assets/mini-metro-04-stations.jpg` — https://dinopoloclub.com/wp-content/uploads/2019/09/ss_91f0aa6b072d28da4d4fcb2335f4c346a099bbba.1920x1080.jpg
- `reference-assets/mini-metro-05-lisbon-miniversary.png` — https://dinopoloclub.com/wp-content/uploads/2023/12/Miniversary_Lisbon-1.png
- `reference-assets/mini-metro-06-crowding.jpg` — https://dinopoloclub.com/wp-content/uploads/2019/09/ss_461ce77cf14dd24bf361831f93bf6c1620e55384.1920x1080.jpg
- All 6 verified with `file` as valid JPEG/PNG 1920x1080. Adapted as: dark-lake grid, flat vector boat/lantern/rock/dock, cream HUD cards, thin lines. Original art, no copied assets.

## Decisions
- Single-file `lantern-lake-dash/index.html` (Canvas 960x600, responsive CSS, DPR-friendly).
- Rules: 90s, 3 hull, quota 8 lanterns, +10 & +3s per lantern, dock opens (green) at quota, win bonus time*5+hull*25, best in localStorage with try/catch.
- Controls: Arrows/WASD + pointer drag steer; P/Esc pause, R restart, M mute, Enter start. Buttons are real `<button>`s.
- Feedback: particles, floaters, shake (off under reduced-motion), invuln flash 1.6s, timer bar red pulse <15s, toast + aria-live announcements, WebAudio beeps with guard.

## Completed
- [x] 6 anchors downloaded + inspected
- [x] Playable loop built (movement, collection, rocks, dock, timer, score, win/loss, pause, restart, sound toggle)
- [x] JS syntax `node --check` OK
- [x] Critic round: fixed title-screen draw crash (initScene + draw guard + loop-first-rAF), fixed dead `shot` hook, fixed Close-strand → back to title, fixed dock label contrast + toast overlap
- [x] Headless Chromium screenshots desktop + mobile + title + gameplay inspected

## Evidence
- Logic harness (13 checks): start, spawn, collect +10, quota, timer ticks, pause/resume, double-restart safe, timer-expiry loss, dock win — ALL PASS.
- Hazard harness: rock hit 3→2 PASS, invuln PASS, no multi-hit during invuln PASS.
- Screenshots: `/tmp/opencode/lld-desktop.png` (title v1), `/tmp/opencode/lld-mobile.png` (420px 2-col HUD), `/tmp/opencode/lld-play.png` (gameplay v1), `/tmp/opencode/lld-title2.png` (title v2 with live lake backdrop), `/tmp/opencode/lld-play2.png` (gameplay v2, readable DOCK label).
- A/B vs Mini Metro ref: grid + flat shapes + cream panel match calm hierarchy; theme-adapted to moonlit navy (intentional day/night inversion).

## Blockers
- None. No server needed.

## Current gaps (accepted, minor)
- Moon glow can overlap a lantern spawn; cosmetic only.
- In-canvas shoreline duplicates DOM HUD (kept intentionally for screenshot readability).
- Emoji carry some icon meaning (🏮/▲) alongside vector shapes; contrast passes for gameplay-critical text.

## Next exact action
- Ship as-is; to resume: open `lantern-lake-dash/index.html?play`, verify, then iterate on juice (wake trails, dock arrow pointer).
