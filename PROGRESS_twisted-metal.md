# Twisted Metal — Canonical Live Progress Page

> Resume here. Single source of truth. Last updated: 2026-09-07 (session start).

## 1. Selected reference anchors (quality bar: ≥6)

1. [Twisted Metal: Black — official PlayStation page](https://www.playstation.com/en-us/games/twisted-metal-black/) — Purpose: canonical tone/setting anchor — asylum contestants, vehicular carnage premise, ESRB/Mature dark-grunge art direction.
2. [Twisted Metal (PS1 original) — PlayStation Store concept](https://store.playstation.com/concept/10008366) — Purpose: core interaction model anchor — "drive anywhere/any direction, MG + homing missiles, last survivor wins", 12 machines, rooftop/suburb arenas.
3. [IGN Twisted Metal Guide — Vehicles](https://www.ign.com/wikis/twisted-metal/Vehicles) — Purpose: vehicle roster/stats anchor — armor/speed/special-weapon ratings, unlockables (Axel, Warthog), paint customization → our vehicle-select stats bars.
4. [Game UI Database — Twisted Metal (2012)](https://www.gameuidatabase.com/gameData.php?id=349) — Purpose: HUD/interface anchor — title/settings, game-over/results/leaderboards, HUD overlays (item/ability cross menu, enemy health & damage, clock/timer, minimap).
5. [Twisted Metal 2 weapon-HUD discussion — GameFAQs](https://gamefaqs.gamespot.com/ps/199136-twisted-metal-2/answers/574032-is-there-any-way-to-change-the-weapon-hud) — Purpose: weapon-inventory UX anchor — lower-right weapon thumbnail vs full green text inventory list, rear-view/cam toggles → our weapon-switch + inventory list.
6. [Twisted Metal gameplay battles giant mech — Gematsu (E3 broll)](https://www.gematsu.com/2011/06/twisted-metal-gameplay-battles-giant-mech) — Purpose: arena/hazard spectacle anchor — Sweet Tooth vs Doll-faction mech, destructible set-pieces.
7. [New Twisted Metal gameplay footage — Gematsu broll](https://www.gematsu.com/2011/04/new-twisted-metal-gameplay-footage) — Purpose: motion/combat-feel anchor — arena broll + semi broll, drift/handling and explosion pacing reference.
8. [MobyGames — Twisted Metal (PS1) screenshot: Car information](https://www.mobygames.com/game/4857/twisted-metal/screenshots/playstation/437511/) — Purpose: visual-language anchor — PS1 car-info screen layout, low-fi grunge panels.

## 2. Lead decision — implementation route

- **Stack:** Static web, no build step. `twisted-metal/` folder: `index.html` + `style.css` + `game.js`. Three.js via CDN importmap (unpkg/jsdelivr, pinned 0.160.0) for true 3rd-person 3D arena combat. Zero npm deps, file:// + http-server friendly.
- **Why:** Preserves recognizable Twisted Metal language (chase cam, walled arena, pickups, explosions, minimap) vs flat 2D mockup. Single-folder delivery = easy deploy (any static host).
- **Scope (judgeable pieces):**
  - P1: Arena + driving (chase cam, drift/handbrake, turbo, collisions, AI traffic/enemies).
  - P2: Combat (MG, homing missiles, napalm special, health/damage, explosions/particles, barrels + turret hazard).
  - P3: Pickups + HUD (weapon pickups, repair, turbo refill, minimap/radar, timer, kill feed, damage direction).
  - P4: Flows (title → vehicle select → countdown → battle → pause → victory/defeat → restart; localStorage best, accessibility, responsive, error overlay).

## 3. Completed work

- [x] Research anchors recorded (8, exceeds 6).
- [x] P1–P4 built: `twisted-metal/index.html` + `style.css` + `game.js` + `README.md`. Three.js chase-cam 3D + automatic offline 2D fallback (`?force2d=1`), 4 selectable vehicles with stats/specials, 5 AI rivals, MG/homing/napalm/shield + specials, repair/turbo/weapon pickups, explosive barrels, center turret, minimap, kill feed, timer, HULL/TURBO/HEAT HUD, TM2-style green weapon inventory.
- [x] Browser playtest (Playwright + system Chrome, 1280×800 & 390×844): title→select→countdown→battle→pause→victory/defeat→restart all pass; P/Esc pause+resume pass; damage/kill/sudden-death paths pass; zero page errors.
- [x] Critic loop: 3 fresh-context critics → fixed pause soft-lock (setState cleared G.paused), timer stalemate (sudden death 5 HP/s), AI rearming + napalm use, 2D art upgrade + damage-direction arc, focus management + reduced-motion + touch pause button.
- [x] Delivery: serve `python3 -m http.server 8000` → `/twisted-metal/`; evidence in `twisted-metal/evidence/` (01-title, 02-select, 04-battle, 05-pause, 08-victory, 09-restart, 10-mobile, 11-sudden-death).

## 4. Evidence log

- `STATE:{"state":"play","kills":0,"playerHp":72..104,"bots":5,"pickups":9..10,"fps":17..29}` (SwiftShader software rendering; real GPUs faster).
- `COMBAT: damage 130→105, kill credit +1, alive 5→4`; `WIN-TRIG over:true`; `RESTART: state play, hp 130, bots 5`.
- `PAUSE1:{hidden:false,st:pause}` + `RESUME:{st:play}` via both P and Escape; focus lands on Resume/Play Again.
- `SUDDEN-DEATH TRIGGERED → TERMINATED over:true → OVER-VISIBLE:shown`.
- Limitation: sandbox has no external network → Three.js CDN unverifiable here; 2D fallback (same rules) verified instead. 3D path (chase cam, shadows, car meshes, particles) is code-reviewed and activates automatically when online.

## 5. Blockers / gaps

- None yet. Risk: CDN offline in sandbox → fallback: inline 2.5D canvas renderer flag `?no3d=1` (to be added if time permits).

## 6. Next exact action

- Builders write `twisted-metal/` game files; then run smoke test (`python3 -m http.server`), screenshot with Playwright/puppeteer or manual capture, critic review.
