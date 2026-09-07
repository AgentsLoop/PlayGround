# RUSTCARNAGE — original arena vehicular-combat tribute

Fast, readable browser vehicular combat in the spirit of Twisted Metal. **100% original code and procedural art** — no ripped assets, no network dependencies. Open `index.html` and fight.

## Play (no build)

- Double-click `twisted-metal/index.html`, or serve: `python3 -m http.server --directory twisted-metal` → http://localhost:8000/
- Works offline. Desktop + mobile (touch stick + MG/WPN/SPC/turbo buttons).

## Controls

| Action | Key |
|---|---|
| Drive | WASD / arrows (touch: left stick) |
| Machine gun (overheats) | SPACE hold / MG button |
| Fire pickup weapon | E or J / WPN |
| Cycle weapon | Q |
| Vehicle special | F or K / SPC |
| Turbo | SHIFT / ≫ |
| Pause | P or Esc · Mute M · Help H · Restart R |

## Rules

- 3 rides (Chuckles/Carnival ×10 seekers, Vandal/Scatter fan, Bastion/Slam+mines), 2 arenas (Rustyard junkyard, Dustbowl desert ring).
- 5 AI drivers (hunt / strafe / steal pickups / flee to repair). First to **6 kills** wins; you have **3 hulls**; 5:00 timer.
- Pickups: Homing, Power, Fire (burn), Napalm (pool), Mines. Green-cross pads repair (limited charges). Red barrels explode. Ramming works at speed.

## Files

- `index.html` — shell, screens, HUD, touch
- `style.css` — theme, responsive, focus states
- `game.js` — engine (fixed-timestep, pooled particles, procedural audio)
- `reference-assets/` — 9 researched refs + `PROVENANCE.md` (research only, never shipped)
- `evidence/` — 7 screenshots of the running game
- `PROGRESS.md` — canonical live progress page
