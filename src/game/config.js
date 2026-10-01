// Original factions, units, buildings, costs. All names/art original.
export const FACTIONS = {
  player: { name: 'Vanguard', color: 0x35e0d2, dark: 0x0e6b64, mm: '#35e0d2' },
  enemy: { name: 'Crimson Swarm', color: 0xff5a4e, dark: 0x8c231c, mm: '#ff5a4e' },
};

export const UNITS = {
  drudge:  { name: 'Drudge',  icon: '👷', cost: { flux: 50, alloy: 0 },  buildTime: 8,  hp: 60,  speed: 7.5, range: 1.6, dmg: 4,  cooldown: 1.0, supply: 1, harvest: 5, desc: 'Worker. Harvests + builds.' },
  lancer:  { name: 'Lancer',  icon: '🔷', cost: { flux: 100, alloy: 25 }, buildTime: 14, hp: 120, speed: 6.5, range: 9,   dmg: 9,  cooldown: 1.1, supply: 2, desc: 'Ranged skirmisher.' },
  bulwark: { name: 'Bulwark', icon: '🛡️', cost: { flux: 150, alloy: 75 }, buildTime: 20, hp: 300, speed: 4.6, range: 6.5, dmg: 18, cooldown: 1.6, supply: 3, desc: 'Heavy assault.' },
};

export const BUILDINGS = {
  core:    { name: 'Command Core', icon: '🏠', cost: { flux: 400, alloy: 0 },  buildTime: 45, hp: 1200, size: 7,   supply: 10, trains: ['drudge'], atk: { range: 10, dmg: 8, cooldown: 1.2 }, desc: 'HQ. Trains Drudges. Drop-off. Light cannon.' },
  foundry: { name: 'War Foundry',  icon: '🏭', cost: { flux: 250, alloy: 0 },  buildTime: 35, hp: 700,  size: 5.5, trains: ['lancer', 'bulwark'], desc: 'Trains Lancer + Bulwark.' },
  pylon:   { name: 'Relay Pylon',  icon: '🗼', cost: { flux: 100, alloy: 0 },  buildTime: 15, hp: 250,  size: 2.6, supply: 8, desc: '+8 supply.' },
  turret:  { name: 'Aegis Turret', icon: '🔥', cost: { flux: 200, alloy: 50 }, buildTime: 25, hp: 450,  size: 3, atk: { range: 11, dmg: 14, cooldown: 1.0 }, desc: 'Static defense.' },
};

export const MAP_SIZE = 96;
export const START = {
  flux: 250, alloy: 60,
  playerBase: { x: -30, z: 30 }, enemyBase: { x: 30, z: -30 },
};
