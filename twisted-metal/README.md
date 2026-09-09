# TWISTED STEEL — Arena Vehicular Combat

A complete Twisted-Metal-inspired 3D browser deathmatch. Plain HTML + JS, zero build step,
Three.js loaded from CDN via importmap. Night stadium arena, Sweet-Tooth-style van,
5 AI rivals, full menu → countdown → combat → win/loss loop.

## Run

```bash
cd twisted-metal
python3 -m http.server 8000
# open http://localhost:8000 in desktop Chrome or Safari
```

> `file://` also renders, but a local server is recommended (module scripts + CDN).

## Files

| File | Purpose |
|---|---|
| `index.html` | DOM shell: menu, HUD (minimap, kill counter, timer, weapons, bars, reticle, markers, killfeed), overlays, importmap (`three@0.160.0` via jsdelivr, unpkg alternate documented) + touch controls |
| `game.js` | Full game (~1400 lines, ES module): arena, vehicles, physics, AI, combat, particles, HUD, synth audio, states |
| `styles.css` | Night-stadium theme, responsive, reduced-motion support |
| `README.md` | This file |

## Controls

| Key | Action |
|---|---|
| W/A/S/D or Arrows | Drive / steer |
| Space | Handbrake / drift (skid marks + dust) |
| Shift | Turbo (drains meter, refills over time / ⚡ pickups) |
| LMB or J | Machine gun (infinite) |
| RMB or K | Homing missile (limited, 🚀 pickups) |
| E | NOVA blast when meter hits 100% |
| T | Stuck recovery (teleport upright) |
| P / Esc | Pause · R restart · M mute · F FPS counter |

Menus are fully keyboard-operable: `←/→` change vehicle, `Enter` starts, `R` restarts.

## Game systems

- **Loop:** vehicle select (3) + difficulty (Rookie/Pro/Insane) → 3-2-1-GO → kill 5 AI → victory / wrecked screens → restart.
- **Vehicles:** Sweet Fang (balanced van with clown head, pink dots, miniguns, ram blade, roof missile), Road Ripper (fast/fragile), Iron Bulwark (slow tank).
- **AI (Sweet Tooth, Roadkill, Axel, Warthog, Reaper):** chase / strafe-orbit / flee-when-low / pickup-seek states, wall + obstacle avoidance, unstick reverse, MG + missile fire with difficulty-scaled damage/accuracy, own NOVA blasts.
- **Arena:** 160×160 walled night stadium, metal-grid canvas floor, 4 floodlight towers (real spotlights), city-silhouette + red-dusk sky + stars + fog, crates, barriers, center platform with jump ramps, 8 explosive barrels, 8 pickup spawners (✚ repair / 🚀 missiles / ⚡ turbo, 12 s respawn).
- **FX:** hit sparks, explosions with light flash + debris, muzzle flashes, drift smoke, skid marks, damage numbers, hitmarker, damage vignette, low-HP warning, screen shake + nova flash (both tamed by reduced-flash toggle).
- **HUD (anchor replica):** minimap canvas top-left, "Killed X of 5", match timer, bottom-left weapon slots, bottom-right hull/turbo/nova bars, center reticle, enemy name + HP bars with shape prefixes (colorblind-safe), offscreen edge arrows, kill feed.
- **Audio (100% synthesized WebAudio):** engine pitch follows speed, MG / missile / explosion / pickup / UI / countdown / win-lose stingers, M mute, autoplay-safe (starts on first click).
- **Ops:** 60 fps target, pixel-ratio capped at 2 with auto-degrade/recover, boundary clamp, T recovery, global error overlay that never hard-crashes, localStorage best-time/most-kills, FPS toggle.
- **Design notes:** point-blank own missiles / nova / barrels damage self by design (risk/reward); MG is infinite with overheat-free cooldown; AI also uses turbo and nova; rival Sweet Tooth is a full detailed van (clown head + dots), not a flat box.
- **Touch:** on coarse-pointer devices on-screen ◀▲▼▶ + 🔫🚀💥 buttons appear; menus remain click/tap operable.
