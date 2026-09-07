# TWISTED METAL: Rust Arena — fan homage (playable browser demo)

Original code + art. Not affiliated with Sony / SingleTrac / Eat Sleep Play.
Inspired by Twisted Metal (1995), Twisted Metal 2/Black, TM (2012).

## Play
Open `index.html` directly or serve: `python3 -m http.server 8000` → http://localhost:8000/twisted-metal/

`?force2d=1` forces the offline top-down renderer (same logic, no CDN needed).

## Controls
W/S gas/brake · A/D steer · Space handbrake · Shift turbo · J/click MG · K missile ·
1–4 weapons · E special · P/Esc pause · M mute · C camera · R restart · touch buttons on mobile.

## What counts as "Twisted Metal-like"
- Walled arena deathmatch, last driver alive wins (6 cars, 4 selectable with armor/speed/hull stats).
- Machine gun + homing + napalm + shield + per-vehicle special (Sweet Tooth napalm cone, Warthog ram shield, Axel shock rings, Yellow Jacket seeker swarm).
- Weapon/repair/turbo pickups, explosive barrels, center turret hazard, minimap radar, kill feed, timer, damage feedback.
- Title → vehicle select → countdown → battle → pause → victory/defeat → restart; best score in localStorage.
