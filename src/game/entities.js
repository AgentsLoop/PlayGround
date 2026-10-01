import * as THREE from 'three';
import { UNITS, BUILDINGS, FACTIONS } from './config.js';
import { groundHeight } from './world.js';

let nextId = 1;
export const eid = () => nextId++;

// shared health-bar sprite textures
function barTexture(bg) {
  const c = document.createElement('canvas'); c.width = 32; c.height = 4;
  const g = c.getContext('2d');
  g.fillStyle = bg ? '#1a0505' : '#4ade80'; g.fillRect(0, 0, 32, 4);
  const t = new THREE.CanvasTexture(c); return t;
}
let texBg = null, texFg = null;

function addBars(obj, y) {
  if (!texBg) { texBg = barTexture(true); texFg = barTexture(false); }
  const bg = new THREE.Sprite(new THREE.SpriteMaterial({ map: texBg, depthTest: false }));
  bg.scale.set(2.4, 0.3, 1); bg.position.y = y;
  const fg = new THREE.Sprite(new THREE.SpriteMaterial({ map: texFg, depthTest: false }));
  fg.scale.set(2.4, 0.3, 1); fg.position.y = y; fg.position.z = 0.001;
  obj.add(bg); obj.add(fg);
  return { bg, fg };
}

function teamTrim(owner) {
  return new THREE.MeshStandardMaterial({
    color: FACTIONS[owner].color, emissive: FACTIONS[owner].dark,
    emissiveIntensity: 0.7, roughness: 0.5, metalness: 0.3,
  });
}
const bodyMat = () => new THREE.MeshStandardMaterial({ color: 0x9aa8ad, roughness: 0.6, metalness: 0.55 });
const darkMat = () => new THREE.MeshStandardMaterial({ color: 0x2b3438, roughness: 0.7, metalness: 0.4 });

function ring(color, r) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.34, r, 30),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.12;
  return m;
}

// --- unit meshes: exaggerated silhouettes, saturated team color ----------------
export function makeUnitMesh(type, owner) {
  const g = new THREE.Group();
  const body = bodyMat(), trim = teamTrim(owner), dark = darkMat();
  if (type === 'drudge') {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), body);
    b.position.y = 0.75; b.scale.set(1, 0.8, 1.15); g.add(b);
    // big team-color shell so owner reads at zoom-out (SC2: team is body, not dot)
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), trim);
    shell.position.y = 0.95; g.add(shell);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), trim);
    lamp.position.set(0, 1.15, 0.35); g.add(lamp);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 1.0), trim);
    arm.position.set(0.5, 0.6, 0.5); g.add(arm);
    const arm2 = arm.clone(); arm2.position.x = -0.5; g.add(arm2);
  } else if (type === 'lancer') {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.65, 1.5, 8), body);
    b.position.y = 1.0; g.add(b);
    // team-color chest plate + shoulder mass
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.9, 0.3), trim);
    plate.position.set(0, 1.1, 0.42); g.add(plate);
    for (const s of [-1, 1]) {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), trim);
      pad.position.set(s * 0.62, 1.55, 0); g.add(pad);
    }
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.2), trim);
    visor.position.set(0, 1.45, 0.5); g.add(visor);
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 1.7, 6), dark);
    gun.rotation.x = Math.PI / 2; gun.position.set(0.4, 1.1, 0.8); g.add(gun);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.5), trim);
    fin.position.set(0, 1.9, -0.3); g.add(fin);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.8, 0.4), dark);
      leg.position.set(s * 0.32, 0.4, 0); g.add(leg);
    }
  } else { // bulwark
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.9, 2.4), body);
    hull.position.y = 0.9; g.add(hull);
    // team-color side skirts + big dome
    for (const s of [-1, 1]) {
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.55, 2.2), trim);
      skirt.position.set(s * 0.95, 1.0, 0); g.add(skirt);
    }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), trim);
    dome.position.y = 1.35; g.add(dome);
    const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 2.2, 8), dark);
    cannon.rotation.x = Math.PI / 2; cannon.position.set(0, 1.25, 1.8); g.add(cannon);
    for (const s of [-1, 1]) {
      const track = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 2.7), dark);
      track.position.set(s * 1.0, 0.45, 0); g.add(track);
    }
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  // snapshot base emissive so hit-flash can restore exactly
  g.traverse(o => {
    if (o.isMesh && o.material.emissive) {
      o.material.userData.baseEmissive = o.material.emissive.getHex();
      o.material.userData.baseEmissiveI = o.material.emissiveIntensity;
    }
  });
  return g;
}

// --- building meshes ----------------------------------------------------------
export function makeBuildingMesh(type, owner) {
  const g = new THREE.Group();
  const trim = teamTrim(owner), dark = darkMat();
  const conc = new THREE.MeshStandardMaterial({ color: 0x6b767c, roughness: 0.85, metalness: 0.2 });
  if (type === 'core') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(7, 2.2, 7), conc); base.position.y = 1.1; g.add(base);
    const hall = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 3.4, 8), conc); hall.position.y = 3.9; g.add(hall);
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.5, 12), trim); glow.position.y = 5.8; g.add(glow);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.2, 6), trim); spire.position.y = 7.4; g.add(spire);
  } else if (type === 'foundry') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.6, 5.5), conc); base.position.y = 0.8; g.add(base);
    for (const s of [-1.4, 1.4]) {
      const stack = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3.4, 1.4), dark); stack.position.set(s, 2.6, -1.2); g.add(stack);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 1.5), trim); tip.position.set(s, 4.4, -1.2); g.add(tip);
    }
    const bay = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 1.2), trim); bay.position.set(0, 1.8, 2.2); g.add(bay);
  } else if (type === 'pylon') {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.4, 1.0, 8), dark); b.position.y = 0.5; g.add(b);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 4.6, 6), dark); shaft.position.y = 3.2; g.add(shaft);
    const cry = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), trim); cry.position.y = 6.2; g.add(cry);
    g.userData.spin = cry;
  } else { // turret
    const b = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.6, 1.4, 8), dark); b.position.y = 0.7; g.add(b);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), dark); head.position.y = 2.2; g.add(head);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 2.4, 6), trim);
    barrel.rotation.x = Math.PI / 2 - 0.25; barrel.position.set(0, 2.4, 1.1); g.add(barrel);
    g.userData.barrel = barrel;
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.traverse(o => {
    if (o.isMesh && o.material.emissive) {
      o.material.userData.baseEmissive = o.material.emissive.getHex();
      o.material.userData.baseEmissiveI = o.material.emissiveIntensity;
    }
  });
  return g;
}

// --- entity classes -----------------------------------------------------------
export class Unit {
  constructor(type, owner, x, z) {
    const s = UNITS[type];
    this.id = eid(); this.kind = 'unit'; this.type = type; this.owner = owner;
    this.hp = s.hp; this.maxHp = s.hp;
    this.x = x; this.z = z; this.y = groundHeight(x, z);
    this.speed = s.speed; this.range = s.range; this.dmg = s.dmg; this.cooldown = s.cooldown;
    this.cd = 0; this.supply = s.supply;
    this.order = { t: 'idle' }; this.queue = [];
    this.cargo = 0; this.cargoKind = null; this.harvestT = 0; this.buildTarget = null;
    this.holdPos = false; this.attackMove = null; this.target = null;
    this.mesh = new THREE.Group();
    this.body = makeUnitMesh(type, owner);
    this.mesh.add(this.body);
    this.selRing = ring(0x35e0d2, 1.1);
    this.selRing.visible = false; this.mesh.add(this.selRing);
    this.bars = addBars(this.mesh, type === 'bulwark' ? 3.0 : 2.4);
    this.mesh.position.set(x, this.y, z);
    this.flash = 0; this.alive = true; this.bob = Math.random() * 6;
  }
  get r() { return this.type === 'bulwark' ? 1.2 : 0.7; }
}

export class Building {
  constructor(type, owner, x, z) {
    const s = BUILDINGS[type];
    this.id = eid(); this.kind = 'building'; this.type = type; this.owner = owner;
    this.hp = 1; this.maxHp = s.hp; // under construction
    this.x = x; this.z = z; this.y = groundHeight(x, z);
    this.size = s.size; this.done = false; this.progress = 0; this.buildTime = s.buildTime;
    this.queue = []; this.prodT = 0; this.rally = null; this.cd = 0;
    this.mesh = new THREE.Group();
    this.body = makeBuildingMesh(type, owner);
    this.mesh.add(this.body);
    this.selRing = ring(0x35e0d2, s.size * 0.75);
    this.selRing.visible = false; this.mesh.add(this.selRing);
    this.bars = addBars(this.mesh, type === 'core' ? 8.6 : type === 'foundry' ? 5.6 : 5.2);
    this.mesh.position.set(x, this.y, z);
    this.alive = true; this.flash = 0;
  }
  get r() { return this.size * 0.62; }
}
