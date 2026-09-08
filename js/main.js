import * as THREE from 'three';
import { GameAudio } from './audio.js';

/* ============================================================
   GRIM IRON — original arena vehicular-combat game.
   Procedural everything. No external assets besides three.js.
   ============================================================ */

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }

// ---------- config ----------
const ARENA = 104;               // drivable half-extent
const WALL = 112;                // wall half-extent
const MATCH_TIME = 300;          // 5:00
const PLAYER_LIVES = 3;
const WEAPONS = {
  mg:      { name: 'MG',     key: 'MG', max: Infinity, dmg: 6,   cd: 0.13 },
  homing:  { name: 'Homing', key: 'HOM', max: 9, dmg: 18,  cd: 0.9 },
  power:   { name: 'Power',  key: 'PWR', max: 6, dmg: 42,  cd: 1.4 },
  napalm:  { name: 'Napalm', key: 'NAP', max: 6, dmg: 8,   cd: 1.1 },
  mine:    { name: 'Mine',   key: 'MNE', max: 6, dmg: 35,  cd: 1.0 },
  special: { name: 'Bloom',  key: 'SPC', max: 1, dmg: 22,  cd: 2.0 },
};
const RIVALS = [
  { name: 'Vex',      color: 0xc23b2e, hp: 100, top: 26, accel: 22, agg: 0.9,  tint: '#ff6b5e' },
  { name: 'Marrow',   color: 0x7a4fd0, hp: 130, top: 23, accel: 19, agg: 0.7,  tint: '#b493ff' },
  { name: 'Grille',   color: 0x2e7dc2, hp: 110, top: 25, accel: 21, agg: 0.8,  tint: '#6ec3ff' },
  { name: 'Sweet Rot',color: 0xe08a2d, hp: 150, top: 21, accel: 17, agg: 0.6,  tint: '#ffc46b' },
  { name: 'Hollow',   color: 0x3fae6a, hp: 90,  top: 28, accel: 24, agg: 1.0,  tint: '#7dffb0' },
];

// ---------- state ----------
const G = {
  mode: 'title', // title|countdown|playing|paused|over
  time: MATCH_TIME, lives: PLAYER_LIVES, kos: 0,
  shake: 0, slowmo: 1, elapsed: 0, countGen: 0,
  stats: null, highDetail: true,
  muted: false, over: null,
};
function freshStats() { return { shots: 0, hits: 0, kills: 0, pickups: 0, dmgDealt: 0, start: performance.now() }; }

// ---------- dom ----------
const canvas = $('scene'), hud = $('hud'), mm = $('minimap'), mmc = mm.getContext('2d');
const ui = {
  hpFill: $('hp-fill'), hpGhost: $('hp-ghost'), turboFill: $('turbo-fill'),
  speedo: $('speedo'), wbar: $('weapon-bar'), feed: $('feed'), clock: $('match-clock'),
  kos: $('kos'), lives: $('lives'), banner: $('banner'), sub: $('subbanner'),
  toast: $('hint-toast'), ret: $('hitmarker'), vig: $('dmg-vignette'),
};

// ---------- audio ----------
const audio = new GameAudio();

// ---------- three setup ----------
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) { renderer = null; }
if (!renderer || !renderer.getContext()) {
  $('title').classList.add('hidden'); $('nogl').classList.remove('hidden');
  throw new Error('WebGL unavailable');
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x53290f);
scene.fog = new THREE.Fog(0x53290f, 190, 620);

const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.5, 1200);
function onResize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', onResize);

// dusk lighting (TM2012 sunset-arena language: low orange sun, long shadows)
const hemi = new THREE.HemisphereLight(0xffc490, 0x3a2620, 1.35);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffa050, 2.6);
sun.position.set(-120, 150, 90);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
sun.shadow.camera.far = 500; sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(new THREE.AmbientLight(0x584050, 0.9));
const fill = new THREE.DirectionalLight(0x6a86ff, 0.55); // cool rim from opposite side
fill.position.set(130, 70, -90);
scene.add(fill);
const boomLight = new THREE.PointLight(0xffa040, 0, 90, 1.8); // reused explosion flash
scene.add(boomLight);

// ---------- arena ----------
const solids = [];   // {minX,maxX,minZ,maxZ} for collision
const obstacles = []; // meshes for minimap static layer
function addSolid(x, z, w, d) { solids.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 }); }

function buildArena() {
  // ground
  const g = new THREE.Mesh(
    new THREE.PlaneGeometry(WALL * 2 + 60, WALL * 2 + 60),
    new THREE.MeshStandardMaterial({ color: 0x5c4d3b, roughness: 0.95 })
  );
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g);
  // street grid overlay
  const grid = new THREE.GridHelper(WALL * 2, 28, 0x66553a, 0x4a3f30);
  grid.position.y = 0.02; grid.material.transparent = true; grid.material.opacity = 0.5;
  scene.add(grid);
  // center emblem
  const ring = new THREE.Mesh(new THREE.RingGeometry(9, 12, 40),
    new THREE.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; scene.add(ring);
  // ground variation: dark asphalt streets + pale dirt patches (cheap quads)
  const patchGeo = new THREE.PlaneGeometry(1, 1);
  const streetMat = new THREE.MeshBasicMaterial({ color: 0x2e2a26, transparent: true, opacity: 0.55 });
  const dirtMat = new THREE.MeshBasicMaterial({ color: 0x6e5a40, transparent: true, opacity: 0.5 });
  const patchSpots = [
    [0, -60, 26, 90, 0], [0, 60, 26, 90, 0], [-60, 0, 90, 26, 1], [60, 0, 90, 26, 1],
    [0, 0, 40, 40, 1], [-30, -48, 30, 20, 0], [30, 48, 30, 20, 0],
  ];
  patchSpots.forEach(([x, z, w, d, dirt]) => {
    const m = new THREE.Mesh(patchGeo, dirt ? dirtMat : streetMat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.015, z); m.scale.set(w, d, 1);
    scene.add(m);
  });

  // walls
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.8 });
  const wallGeoH = new THREE.BoxGeometry(WALL * 2 + 8, 7, 3);
  const wallGeoV = new THREE.BoxGeometry(3, 7, WALL * 2 + 8);
  [[0, -WALL - 1, wallGeoH], [0, WALL + 1, wallGeoH]].forEach(([x, z, geo]) => {
    const m = new THREE.Mesh(geo, wallMat); m.position.set(x, 3.5, z); m.castShadow = m.receiveShadow = true; scene.add(m);
  });
  [[-WALL - 1, 0], [WALL + 1, 0]].forEach(([x, z]) => {
    const m = new THREE.Mesh(wallGeoV, wallMat); m.position.set(x, 3.5, z); m.castShadow = m.receiveShadow = true; scene.add(m);
  });
  // hazard stripes on walls
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffb02e });
  for (let i = -5; i <= 5; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 0.2), stripeMat);
    s.position.set(i * 20, 5.6, -WALL + 0.6); scene.add(s);
    const s2 = s.clone(); s2.position.z = WALL - 0.6; scene.add(s2);
  }

  // building blocks: perimeter + inner islands, streets between (TM city-arena feel)
  const blocks = [
    // corners (perimeter)
    [-78, -78, 34, 30], [78, -78, 34, 30], [-78, 78, 34, 30], [78, 78, 34, 30],
    [0, -84, 44, 22], [0, 84, 44, 22], [-84, 0, 22, 44], [84, 0, 22, 44],
    // inner islands
    [-38, -36, 22, 18], [38, -36, 22, 18], [-38, 36, 22, 18], [38, 36, 22, 18],
  ];
  const palette = [0x6b5c48, 0x77603f, 0x5a4c42, 0x7d6540];
  blocks.forEach(([x, z, w, d], i) => {
    const h = 14 + ((i * 37) % 22);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: palette[i % palette.length], roughness: 0.9 }));
    m.position.set(x, h / 2, z); m.castShadow = m.receiveShadow = true; scene.add(m);
    // emissive windows strip
    const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, h * 0.7, d * 0.92),
      new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.16 }));
    win.position.set(x, h / 2, z); scene.add(win);
    // rooftop beacon
    const bc = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 10),
      new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff3b30 : 0x57e6ff }));
    bc.position.set(x, h + 1, z); scene.add(bc);
    addSolid(x, z, w, d); obstacles.push({ x, z, w, d, c: '#6b5b45' });
  });

  // scattered concrete barriers (cover)
  const barMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5e, roughness: 0.9 });
  const bars = [[-14, 0, 8, 2], [14, 0, 8, 2], [0, -14, 2, 8], [0, 14, 2, 8],
    [-60, 8, 6, 2], [60, -8, 6, 2], [-8, -60, 2, 6], [8, 60, 2, 6]];
  bars.forEach(([x, z, w, d]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, d), barMat);
    m.position.set(x, 1.1, z); m.castShadow = m.receiveShadow = true; scene.add(m);
    addSolid(x, z, w, d); obstacles.push({ x, z, w, d, c: '#8a7a5e' });
  });

  // floodlight poles
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.6 });
  [[-50, -50], [50, -50], [-50, 50], [50, 50]].forEach(([x, z]) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 26, 8), poleMat);
    p.position.set(x, 13, z); p.castShadow = true; scene.add(p);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xfff2cc }));
    lamp.position.set(x, 26.5, z); scene.add(lamp);
  });

  // gradient dusk sky dome + sun disc + distant skyline silhouettes
  const skyGeo = new THREE.SphereGeometry(800, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x1a0e2a) }, mid: { value: new THREE.Color(0xb34a12) }, bot: { value: new THREE.Color(0xff9a3c) } },
    vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 top,mid,bot;
      void main(){ float h=normalize(vP).y;
        vec3 c = h>0.25 ? mix(mid,top,smoothstep(0.25,0.9,h)) : mix(bot,mid,smoothstep(-0.05,0.25,h));
        gl_FragColor=vec4(c,1.0); }`,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(34, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false }));
  sunDisc.position.set(-480, 150, 300); sunDisc.lookAt(0, 40, 0); scene.add(sunDisc);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(70, 32),
    new THREE.MeshBasicMaterial({ color: 0xff7a20, transparent: true, opacity: 0.35, fog: false }));
  glow.position.set(-482, 150, 302); glow.lookAt(0, 40, 0); scene.add(glow);
  // far skyline (cheap dark boxes outside walls)
  const farMat = new THREE.MeshBasicMaterial({ color: 0x241207 });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU;
    const r = 260 + (i * 53) % 120;
    const w = 24 + (i * 29) % 40, h = 40 + (i * 47) % 90;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), farMat);
    m.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
    scene.add(m);
  }
  // water tower silhouette (TM city-arena motif)
  const wt = new THREE.Group();
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 10, 12), new THREE.MeshStandardMaterial({ color: 0x4a3428, roughness: 0.9 }));
  tank.position.y = 26; wt.add(tank);
  const legG = new THREE.CylinderGeometry(0.5, 0.5, 22, 6);
  const legM = new THREE.MeshStandardMaterial({ color: 0x33241a });
  [[-4, -4], [4, -4], [-4, 4], [4, 4]].forEach(([lx, lz]) => {
    const l = new THREE.Mesh(legG, legM); l.position.set(lx, 11, lz); wt.add(l);
  });
  wt.position.set(-78, 0, -44); // beside corner block, legs on the ground
  scene.add(wt);
  addSolid(-78, -44, 10, 10); obstacles.push({ x: -78, z: -44, w: 10, d: 10, c: '#6b5b45' });
}

// explosive barrels
const barrels = [];
function spawnBarrels() {
  const geo = new THREE.CylinderGeometry(1.1, 1.1, 2.4, 12);
  const spots = [[-22, -8], [22, 8], [-8, 22], [8, -22], [-60, -20], [60, 20], [-20, 60], [20, -60], [0, 0]];
  spots.forEach(([x, z], i) => {
    if (i === 8) { x = 4; z = -4; }
    const mat = new THREE.MeshStandardMaterial({ color: 0xb03020, roughness: 0.6, emissive: 0x550a00 });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, 1.2, z); m.castShadow = true; scene.add(m);
    barrels.push({ mesh: m, x, z, hp: 20, alive: true, respawn: 0 });
  });
}

// ---------- pickups ----------
const pickups = [];
const PICKUP_KINDS = ['homing', 'power', 'napalm', 'mine', 'repair', 'turbo'];
const PICKUP_COLORS = { homing: 0xb46bff, power: 0xff5a2d, napalm: 0xffb02e, mine: 0x57e6ff, repair: 0x7dff5e, turbo: 0xfff2a0 };
const pickupGeoCrate = new THREE.BoxGeometry(2.2, 2.2, 2.2);
const pickupGeoOrb = new THREE.OctahedronGeometry(1.5);
function pickupMesh(kind) {
  const mat = new THREE.MeshStandardMaterial({
    color: PICKUP_COLORS[kind], emissive: PICKUP_COLORS[kind], emissiveIntensity: 0.55, roughness: 0.4,
  });
  const m = new THREE.Mesh(kind === 'repair' || kind === 'turbo' ? pickupGeoOrb : pickupGeoCrate, mat);
  m.castShadow = true;
  const halo = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.4, 24),
    new THREE.MeshBasicMaterial({ color: PICKUP_COLORS[kind], transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = -0.9; m.add(halo);
  return m;
}
const pickupSpots = [
  [-22, -22], [22, -22], [-22, 22], [22, 22], [0, -48], [0, 48],
  [-48, 0], [48, 0], [-64, -52], [64, 52], [-64, 52], [64, -52],
];
function spawnPickups() {
  pickupSpots.forEach(([x, z], i) => {
    const kind = PICKUP_KINDS[i % PICKUP_KINDS.length];
    const mesh = pickupMesh(kind);
    mesh.position.set(x, 1.6, z); scene.add(mesh);
    pickups.push({ mesh, x, z, kind, alive: true, respawn: 0, phase: Math.random() * TAU });
  });
}
function setPickupKind(p, kind) {
  p.kind = kind;
  scene.remove(p.mesh);
  p.mesh = pickupMesh(kind); p.mesh.position.set(p.x, 1.6, p.z); scene.add(p.mesh);
}

// ---------- vehicles ----------
function makeNameplate(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = '900 30px Trebuchet MS, sans-serif'; x.textAlign = 'center';
  x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,.85)'; x.strokeText(text, 128, 32);
  x.fillStyle = color; x.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(7.5, 1.9, 1);
  return { sprite: sp, canvas: c, ctx: x, tex, text, color };
}
function redrawPlate(p, frac) {
  const x = p.ctx;
  x.clearRect(0, 0, 256, 64);
  x.font = '900 30px Trebuchet MS, sans-serif'; x.textAlign = 'center';
  x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,.85)'; x.strokeText(p.text, 128, 32);
  x.fillStyle = p.color; x.fillText(p.text, 128, 32);
  x.fillStyle = 'rgba(0,0,0,.7)'; x.fillRect(48, 42, 160, 12);
  x.fillStyle = frac > 0.5 ? '#7dff5e' : frac > 0.25 ? '#ffb02e' : '#ff3b30';
  x.fillRect(48, 42, 160 * clamp(frac, 0, 1), 12);
  p.tex.needsUpdate = true;
}

function buildCarMesh(color) {
  const car = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.8 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.2, metalness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 6.2), paint);
  body.position.y = 1.05; body.castShadow = true; car.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.7, 1.6), paint);
  nose.position.set(0, 0.85, 3.6); nose.castShadow = true; car.add(nose);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 2.6), glass);
  cab.position.set(0, 1.95, -0.4); cab.castShadow = true; car.add(cab);
  // armor spikes
  const spikeGeo = new THREE.ConeGeometry(0.28, 1.1, 6);
  [[-1.5, 1.9], [1.5, 1.9], [-1.5, -0.5], [1.5, -0.5]].forEach(([sx, sz]) => {
    const s = new THREE.Mesh(spikeGeo, dark); s.position.set(sx, 2.1, sz); car.add(s);
  });
  // wheels
  const wg = new THREE.CylinderGeometry(0.85, 0.85, 0.7, 14);
  const wheels = [];
  [[-1.8, 2.1], [1.8, 2.1], [-1.8, -2.1], [1.8, -2.1]].forEach(([wx, wz]) => {
    const w = new THREE.Mesh(wg, dark);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.85, wz); w.castShadow = true;
    car.add(w); wheels.push(w);
  });
  // turret
  const turret = new THREE.Group(); turret.position.set(0, 2.0, 1.4);
  const tdome = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), dark);
  tdome.castShadow = true; turret.add(tdome);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 2.6, 8), dark);
  barrel.rotation.x = Math.PI / 2; barrel.position.z = 1.5; turret.add(barrel);
  car.add(turret);
  // tail flames (turbo)
  const flameMat = new THREE.MeshBasicMaterial({ color: 0x66d5ff, transparent: true, opacity: 0 });
  const flames = [];
  [[-0.9], [0.9]].forEach(([fx]) => {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.4, 2.2, 8), flameMat.clone());
    f.rotation.x = -Math.PI / 2; f.position.set(fx, 0.8, -3.8); car.add(f); flames.push(f);
  });
  car.userData = { wheels, turret, flames, paint };
  return car;
}

function makeVehicle(name, color, tint, opts, isPlayer) {
  const mesh = buildCarMesh(color);
  scene.add(mesh);
  const plate = makeNameplate(isPlayer ? 'YOU · ' + name : name, isPlayer ? '#ffd75e' : tint);
  plate.sprite.position.y = 4.6; mesh.add(plate.sprite);
  if (isPlayer) plate.sprite.visible = false; // own plate would sit on the aim reticle
  redrawPlate(plate, 1);
  return {
    name, tint, isPlayer, mesh, plate,
    x: 0, z: 0, heading: 0, speed: 0,
    top: opts.top, accel: opts.accel, hp: opts.hp, maxhp: opts.hp,
    alive: true, respawnT: 0, invuln: 0, turretYaw: 0,
    mgHeat: 0, mgCd: 0, wpnCd: 0, aiCd: 1 + Math.random() * 2,
    ammo: { homing: 2, power: 1, napalm: 1, mine: 1 },
    sel: 'homing', special: 0, turbo: 100, boosting: false,
    ai: null, flash: 0, firePoolT: 0, wheelSpin: 0,
  };
}

let player, enemies = [], vehicles = [];
function spawnVehicles() {
  player = makeVehicle('Jester', 0xc03038, '#ffd75e', { hp: 140, top: 30, accel: 26 }, true);
  const spawns = [[-30, -55, 0], [30, -55, 0], [-30, 55, Math.PI], [30, 55, Math.PI], [0, 70, Math.PI]];
  enemies = RIVALS.map((r, i) => {
    const v = makeVehicle(r.name, r.color, r.tint, r, false);
    const [sx, sz, hd] = spawns[i];
    v.x = sx; v.z = sz; v.heading = hd;
    v.ai = { agg: r.agg, think: Math.random(), strafe: Math.random() < 0.5 ? 1 : -1, repick: 0, wpX: 0, wpZ: 0 };
    pickAIWaypoint(v);
    return v;
  });
  player.x = 0; player.z = -70; player.heading = 0;
  vehicles = [player, ...enemies];
}
function pickAIWaypoint(v) {
  v.ai.wpX = (Math.random() * 2 - 1) * (ARENA - 15);
  v.ai.wpZ = (Math.random() * 2 - 1) * (ARENA - 15);
}

// ---------- projectiles / effects ----------
const shots = [];   // {mesh,x,y,z,vx,vy,vz,life,dmg,homing,target,owner,type,radius}
const mines = [];   // {mesh,x,z,owner,dmg,armT,life,blink}
const pools = [];   // fire pools {mesh,x,z,r,life,tick,owner,dmg}
const bursts = [];  // particle systems {pts,vel,life,maxlife}
const tracers = []; // mg tracers {mesh,life}

const missileGeo = new THREE.ConeGeometry(0.35, 1.8, 8);
const mineGeo = new THREE.CylinderGeometry(0.9, 1.1, 0.6, 10);
function shotColor(t) {
  return t === 'homing' ? 0xc77dff : t === 'power' ? 0xff5a2d : t === 'napalm' ? 0xffb02e : 0xffffff;
}
function fireShot(type, owner, ox, oz, dirX, dirZ, opts = {}) {
  const speed = type === 'power' ? 34 : type === 'homing' ? 40 : type === 'napalm' ? 26 : 30;
  const mat = new THREE.MeshBasicMaterial({ color: shotColor(type) });
  const m = new THREE.Mesh(missileGeo, mat);
  const y0 = type === 'napalm' ? 3.2 : 2.0;
  m.position.set(ox, y0, oz);
  scene.add(m);
  const vy = type === 'napalm' ? 9 : 0;
  shots.push({
    mesh: m, x: ox, y: y0, z: oz,
    vx: dirX * speed, vy, vz: dirZ * speed,
    life: opts.life || 4, dmg: opts.dmg, homing: type === 'homing',
    target: opts.target || null, owner, type,
    trailT: 0,
  });
  // orient
  m.lookAt(ox + dirX * 5, y0 + (type === 'napalm' ? 2 : 0), oz + dirZ * 5);
  m.rotateX(Math.PI / 2);
}
function explode(x, y, z, radius, dmg, owner, big = 1, opts = {}) {
  const chains = opts.chains !== false;
  spawnBurst(x, y, z, big);
  boomLight.position.set(x, 6, z); boomLight.intensity = 60 * big;
  audio.explosion(big);
  G.shake = Math.min(1.4, G.shake + 0.5 * big);
  // damage falloff — never splash the shooter with their own direct hit
  for (const v of vehicles) {
    if (!v.alive || v === owner) continue;
    const d = Math.hypot(v.x - x, v.z - z);
    if (d < radius) {
      const f = 1 - (d / radius) * 0.6;
      damageVehicle(v, dmg * f, owner);
    }
  }
  if (!chains) return;
  // chain barrels
  for (const b of barrels) {
    if (!b.alive) continue;
    if (Math.hypot(b.x - x, b.z - z) < radius) { b.hp = 0; detonateBarrel(b, owner); }
  }
  // mines caught in blast
  for (let i = mines.length - 1; i >= 0; i--) {
    const mn = mines[i];
    if (Math.hypot(mn.x - x, mn.z - z) < radius) {
      scene.remove(mn.mesh); mines.splice(i, 1);
      explode(mn.x, 1, mn.z, 10, mn.dmg * 0.7, mn.owner, 0.8);
    }
  }
}
function detonateBarrel(b, owner) {
  if (!b.alive) return;
  b.alive = false; b.respawn = 14;
  b.mesh.visible = false;
  explode(b.x, 1.5, b.z, 13, 45, owner, 1.1);
  feed(`${owner.isPlayer ? 'You' : owner.name} blew a fuel barrel`, owner.isPlayer ? 'me' : 'foe');
}
function spawnBurst(x, y, z, big) {
  if (bursts.length > 46) { const old = bursts.shift(); scene.remove(old.pts); }
  const n = G.highDetail ? Math.floor(26 * big) + 10 : 12;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), vel = [];
  for (let i = 0; i < n; i++) {
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    const a = Math.random() * TAU, e = Math.random() * Math.PI - Math.PI / 2;
    const s = (6 + Math.random() * 16) * big;
    vel.push([Math.cos(a) * Math.cos(e) * s, Math.abs(Math.sin(e)) * s + 4, Math.sin(a) * Math.cos(e) * s]);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: Math.random() < 0.5 ? 0xffa040 : 0xff5522, size: 1.6 * big, transparent: true, opacity: 1,
  });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  bursts.push({ pts, vel, life: 0.9, maxlife: 0.9 });
  if (big < 0.5) return; // small arms fire: sparks only, no smoke
  // smoke puff
  const sgeo = new THREE.BufferGeometry();
  const spos = new Float32Array(8 * 3); const svel = [];
  for (let i = 0; i < 8; i++) {
    spos[i * 3] = x; spos[i * 3 + 1] = y + 1; spos[i * 3 + 2] = z;
    svel.push([(Math.random() - 0.5) * 6, 3 + Math.random() * 4, (Math.random() - 0.5) * 6]);
  }
  sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
  const spts = new THREE.Points(sgeo, new THREE.PointsMaterial({ color: 0x3a2c26, size: 2.1, transparent: true, opacity: 0.5 }));
  scene.add(spts);
  bursts.push({ pts: spts, vel: svel, life: 1.1, maxlife: 1.1, smoke: true });
}
function spawnTracer(x1, y1, z1, x2, y2, z2) {
  const len = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
  const geo = new THREE.CylinderGeometry(0.07, 0.07, len, 5);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 }));
  m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
  m.lookAt(x2, y2, z2); m.rotateX(Math.PI / 2);
  scene.add(m);
  tracers.push({ mesh: m, life: 0.09 });
}
function spawnMuzzle(x, y, z) {
  spawnBurst(x, y, z, 0.25);
}

// ---------- damage / death ----------
function damageVehicle(v, dmg, from) {
  if (!v.alive || v.invuln > 0 || G.mode !== 'playing') return;
  dmg = Math.max(0, dmg);
  v.hp -= dmg;
  v.flash = 0.15;
  if (v.isPlayer) {
    ui.vig.style.opacity = clamp(0.4 + (1 - v.hp / v.maxhp) * 0.5, 0, 1);
    setTimeout(() => { ui.vig.style.opacity = 0; }, 220);
    audio.hurt();
    G.shake = Math.min(1.2, G.shake + 0.35);
    if (v.hp / v.maxhp < 0.3 && !v._lowWarned) { v._lowWarned = true; toast('Hull critical — grab a green repair cell!'); }
  } else if (from === player) {
    G.stats.dmgDealt += dmg;
    hitmarker();
    audio.hit();
    floatDmg(v, Math.round(dmg));
  }
  redrawPlate(v.plate, v.hp / v.maxhp);
  if (v.hp <= 0) killVehicle(v, from);
}
function floatDmg(v, amount) {
  // project to screen for floating damage number
  const p = new THREE.Vector3(v.x, 5.5, v.z).project(camera);
  if (p.z > 1) return;
  const el = document.createElement('div');
  el.textContent = amount;
  el.style.cssText = `position:absolute;left:${(p.x * 0.5 + 0.5) * innerWidth}px;top:${(-p.y * 0.5 + 0.5) * innerHeight}px;color:#ffe95e;font-weight:900;font-size:20px;text-shadow:0 2px 3px #000;pointer-events:none;transition:all .8s;z-index:6`;
  hud.appendChild(el);
  requestAnimationFrame(() => { el.style.transform = 'translateY(-46px)'; el.style.opacity = '0'; });
  setTimeout(() => el.remove(), 850);
}
function killVehicle(v, by) {
  v.alive = false; v.hp = 0;
  explode(v.x, 1.5, v.z, 6, 0, by || v, 1.4, { chains: false }); // visual only
  v.mesh.visible = false; v.plate.sprite.visible = false;
  const killer = by && by.name ? (by.isPlayer ? 'You' : by.name) : 'The arena';
  if (v.isPlayer) {
    G.lives--;
    renderLives();
    banner('WRECKED', `${killer} totaled you${G.lives > 0 ? ' — re-entering…' : ''}`);
    feed(`${killer} wrecked YOU`, 'foe');
    if (G.lives <= 0) { endMatch(false, 'Out of rides. The crowd wanted blood.'); }
    else { v.respawnT = 3; }
  } else {
    G.kos++; G.stats.kills++;
    ui.kos.textContent = G.kos;
    banner('RIVAL DOWN', `${killer} destroyed ${v.name}  (${G.kos}/5)`);
    feed(`${killer} destroyed ${v.name}`, by === player ? 'me' : 'foe');
    audio.pickup();
    dropReward(v);
    if (enemies.every(e => !e.alive)) endMatch(true, 'Last engine running. Name your prize.');
  }
}
function dropReward(v) {
  // losers drop a repair + random weapon at their wreck
  const kinds = ['repair', PICKUP_KINDS[Math.floor(Math.random() * 4)]];
  kinds.forEach((kind, i) => {
    const mesh = pickupMesh(kind);
    const px = clamp(v.x + (i ? 5 : -5), -ARENA, ARENA), pz = clamp(v.z + 3, -ARENA, ARENA);
    mesh.position.set(px, 1.6, pz); scene.add(mesh);
    pickups.push({ mesh, x: px, z: pz, kind, alive: true, respawn: 0, phase: 0, temp: true, life: 25 });
  });
}
function respawnPlayer() {
  const v = player;
  v.alive = true; v.hp = v.maxhp; v._lowWarned = false;
  v.x = 0; v.z = -70; v.heading = 0; v.speed = 0;
  v.ammo = {
    homing: Math.max(2, v.ammo.homing), power: Math.max(1, v.ammo.power),
    napalm: Math.max(1, v.ammo.napalm), mine: Math.max(1, v.ammo.mine),
  };
  v.sel = 'homing'; v.turbo = 100; v.invuln = 3; v.mgHeat = 0;
  v.mesh.visible = true; if (!v.isPlayer) v.plate.sprite.visible = true;
  redrawPlate(v.plate, 1);
  banner('BACK IN', 'Re-entered with full hull');
  renderWeapons();
}

// ---------- HUD helpers ----------
function feed(text, cls = 'sys') {
  const d = document.createElement('div'); d.textContent = text; d.className = cls;
  ui.feed.prepend(d);
  while (ui.feed.children.length > 5) ui.feed.lastChild.remove();
  setTimeout(() => { d.style.opacity = '0'; d.style.transition = 'opacity 1s'; }, 3800);
  setTimeout(() => d.remove(), 5000);
}
function banner(text, sub = '') {
  ui.banner.textContent = text;
  ui.banner.classList.remove('show'); void ui.banner.offsetWidth;
  ui.banner.classList.add('show');
  if (sub) {
    ui.sub.textContent = sub;
    ui.sub.classList.remove('show'); void ui.sub.offsetWidth;
    ui.sub.classList.add('show');
  }
}
let toastT = null;
function toast(text, ms = 3200) {
  ui.toast.textContent = text; ui.toast.style.opacity = 1;
  clearTimeout(toastT); toastT = setTimeout(() => ui.toast.style.opacity = 0, ms);
}
function hitmarker() { ui.ret.classList.remove('pop'); void ui.ret.offsetWidth; ui.ret.classList.add('pop'); }
function renderLives() { ui.lives.textContent = '●'.repeat(Math.max(0, G.lives)) + '○'.repeat(PLAYER_LIVES - Math.max(0, G.lives)); }
const WORDER = ['mg', 'homing', 'power', 'napalm', 'mine', 'special'];
const WICON = { mg: '🔫', homing: '🚀', power: '💥', napalm: '🔥', mine: '⚙', special: '✸' };
function renderWeapons() {
  ui.wbar.innerHTML = '';
  WORDER.forEach((k, i) => {
    const d = document.createElement('div');
    d.className = 'wslot' + (player.sel === k ? ' sel' : '') + (k === 'special' ? ' special' : '');
    let count;
    if (k === 'mg') count = player.mgHeat >= 100 ? 'HOT' : '∞';
    else if (k === 'special') count = player.special >= 100 ? 'READY' : Math.floor(player.special) + '%';
    else count = '×' + player.ammo[k];
    if (k !== 'mg' && k !== 'special' && player.ammo[k] <= 0) d.classList.add('empty');
    if (k === 'special' && player.special < 100) d.classList.add('empty');
    d.innerHTML = `<div class="k">${i === 0 ? 'CLK' : i} ${WICON[k]}</div><div class="n">${WEAPONS[k].name}</div><div class="c">${count}</div>`;
    d.style.pointerEvents = 'auto'; d.style.cursor = 'pointer';
    d.title = 'Select ' + WEAPONS[k].name;
    d.addEventListener('click', () => selectWeapon(k));
    ui.wbar.appendChild(d);
  });
}

// ---------- input ----------
const keys = {};
let mouseNX = 0, mouseNY = 0, mouseDown = false, rmbDown = false;
addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  keys[e.key.toLowerCase()] = true;
  if (G.mode !== 'playing') {
    if (e.key.toLowerCase() === 'r' && (G.mode === 'over')) restart();
    if ((e.key.toLowerCase() === 'p' || e.key === 'Escape') && G.mode === 'paused') togglePause();
    return;
  }
  const k = e.key.toLowerCase();
  if (k === 'p' || e.key === 'Escape') togglePause();
  else if (k === 'm') { G.muted = audio.toggleMute(); toast(G.muted ? 'Muted' : 'Sound on'); }
  else if (k === 'r') restart();
  else if (k === 'q') cycleWeapon(-1);
  else if (k === 'e') cycleWeapon(1);
  else if (k === 'f') fireSelected(player);
  else if (k >= '1' && k <= '5') {
    const map = ['homing', 'power', 'napalm', 'mine', 'special'];
    selectWeapon(map[+k - 1]);
  }
});
addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);
addEventListener('mousemove', (e) => {
  mouseNX = (e.clientX / innerWidth) * 2 - 1;
  mouseNY = -(e.clientY / innerHeight) * 2 + 1;
});
canvas.addEventListener('mousedown', (e) => {
  audio.ensure();
  if (e.button === 0) mouseDown = true;
  if (e.button === 2) { rmbDown = true; if (G.mode === 'playing') fireSelected(player); }
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseDown = false;
  if (e.button === 2) rmbDown = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.mode === 'playing') togglePause(true);
});
function cycleWeapon(d) {
  const order = ['mg', 'homing', 'power', 'napalm', 'mine', 'special'];
  let i = order.indexOf(player.sel);
  for (let n = 0; n < order.length; n++) {
    i = (i + d + order.length) % order.length;
    const k = order[i];
    const ok = k === 'mg' || (k === 'special' ? player.special >= 100 : player.ammo[k] > 0);
    if (ok) { selectWeapon(k); return; }
  }
}
function selectWeapon(k) {
  if (k === 'special' && player.special < 100) { toast('Iron Bloom charging… ' + Math.floor(player.special) + '%'); return; }
  if (k !== 'mg' && k !== 'special' && player.ammo[k] <= 0) { toast('No ' + WEAPONS[k].name + ' left — grab a crate'); return; }
  player.sel = k; renderWeapons(); audio.lock();
}

// ---------- firing ----------
const _v3 = new THREE.Vector3(), _ray = new THREE.Raycaster(), _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const DEMO = new URLSearchParams(location.search).has('demo') ? {} : null;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
function aimPoint(v) {
  // mouse ray onto ground plane ahead of vehicle
  _ray.setFromCamera({ x: mouseNX, y: mouseNY }, camera);
  const hit = new THREE.Vector3();
  if (_ray.ray.intersectPlane(_plane, hit)) return hit;
  return new THREE.Vector3(v.x + Math.sin(v.heading) * 30, 0, v.z + Math.cos(v.heading) * 30);
}
function turretDir(v) {
  const a = v.heading + v.turretYaw;
  return { x: Math.sin(a), z: Math.cos(a), ang: a };
}
function fireMG(v) {
  if (v.mgCd > 0 || v.mgHeat >= 100) return;
  v.mgCd = WEAPONS.mg.cd; v.mgHeat = Math.min(100, v.mgHeat + 7);
  G.stats && v.isPlayer && G.stats.shots++;
  const d = turretDir(v);
  const ox = v.x + d.x * 4, oz = v.z + d.z * 4;
  // hitscan: nearest wall distance via segment-vs-AABB slab test (cover matters)
  const range = 70;
  let wallD = range;
  for (const s of solids) {
    let t0 = 0, t1 = wallD, ok = true;
    for (const [o, dd, mn, mx] of [[ox, d.x, s.minX, s.maxX], [oz, d.z, s.minZ, s.maxZ]]) {
      if (Math.abs(dd) < 1e-8) { if (o < mn || o > mx) { ok = false; break; } }
      else {
        let ta = (mn - o) / dd, tb = (mx - o) / dd;
        if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) { ok = false; break; }
      }
    }
    if (ok && t0 > 0.5 && t0 < wallD) wallD = t0;
  }
  // nearest vehicle inside the unobstructed span
  let hx = ox + d.x * wallD, hz = oz + d.z * wallD, hy = 1.6;
  let best = null, bestD = wallD;
  for (const t of vehicles) {
    if (t === v || !t.alive) continue;
    const rx = t.x - ox, rz = t.z - oz;
    const along = rx * d.x + rz * d.z;
    if (along < 2 || along > bestD) continue;
    const perp = Math.abs(rx * d.z - rz * d.x);
    if (perp < 3.2 && along < bestD) { best = t; bestD = along; }
  }
  hx = ox + d.x * bestD; hz = oz + d.z * bestD;
  spawnTracer(ox, 2.2, oz, hx, hy, hz);
  spawnMuzzle(ox, 2.2, oz);
  if (v.isPlayer) audio.mg();
  if (best) {
    damageVehicle(best, WEAPONS.mg.dmg, v);
    if (v.isPlayer) G.stats.hits++;
    spawnBurst(hx, hy, hz, 0.3);
  }
}
function nearestEnemyAhead(v, maxD = 90) {
  let best = null, bestScore = -2;
  for (const t of vehicles) {
    if (t === v || !t.alive) continue;
    const dx = t.x - v.x, dz = t.z - v.z, d = Math.hypot(dx, dz);
    if (d > maxD) continue;
    const ang = Math.atan2(dx, dz);
    const rel = Math.abs(angDiff(v.heading + v.turretYaw, ang));
    const score = (1 - d / maxD) + (rel < 0.6 ? 0.8 : 0);
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best;
}
function fireSelected(v) {
  if (G.mode !== 'playing' || !v.alive || v.wpnCd > 0) return;
  const k = v.sel;
  if (k === 'mg') { // single aimed shot on the shared trigger
    v.wpnCd = 0.14;
    fireMG(v);
    return;
  }
  if (k === 'special') {
    if (v.special < 100) { if (v.isPlayer) toast('Iron Bloom charging…'); return; }
    v.special = 0; v.wpnCd = WEAPONS.special.cd;
    const d = turretDir(v);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + Math.random() * 0.2;
      fireShot('homing', v, v.x + Math.sin(a) * 4, v.z + Math.cos(a) * 4,
        Math.sin(a), Math.cos(a),
        { dmg: WEAPONS.special.dmg, target: nearestEnemyAhead(v), life: 3 });
    }
    audio.special();
    banner(v.isPlayer ? 'IRON BLOOM' : v.name + ' BLOOMS', v.isPlayer ? 'Twelve seekers away' : '');
    if (v.isPlayer) { G.stats.shots += 12; renderWeapons(); }
    return;
  }
  if (v.ammo[k] <= 0) {
    if (v.isPlayer) { toast('Empty — grab a crate'); cycleWeapon(1); }
    return;
  }
  const d = turretDir(v);
  const ox = v.x + d.x * 4, oz = v.z + d.z * 4;
  if (k === 'mine') {
    v.ammo[k]--; v.wpnCd = WEAPONS[k].cd;
    const m = new THREE.Mesh(mineGeo, new THREE.MeshStandardMaterial({ color: 0x57e6ff, emissive: 0x57e6ff, emissiveIntensity: 0.7 }));
    m.position.set(v.x - d.x * 4, 0.4, v.z - d.z * 4); m.castShadow = true; scene.add(m);
    mines.push({ mesh: m, x: m.position.x, z: m.position.z, owner: v, dmg: WEAPONS.mine.dmg, armT: 1, life: 30 });
    audio.mine();
  } else {
    v.ammo[k]--; v.wpnCd = WEAPONS[k].cd;
    fireShot(k, v, ox, oz, d.x, d.z, { dmg: WEAPONS[k].dmg, target: k === 'homing' ? nearestEnemyAhead(v) : null });
    if (k === 'homing') audio.homing(); else if (k === 'power') audio.power(); else audio.napalm();
    if (v.isPlayer) G.stats.shots++;
  }
  if (v.isPlayer) renderWeapons();
}

// ---------- physics ----------
function collideCircle(x, z, r) {
  // returns corrected {x,z,hit}
  let hit = false;
  for (const s of solids) {
    const cx = clamp(x, s.minX, s.maxX), cz = clamp(z, s.minZ, s.maxZ);
    const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
    if (d < r) {
      hit = true;
      if (d > 0.001) { x = cx + (dx / d) * r; z = cz + (dz / d) * r; }
      else { x = s.maxX + r; }
    }
  }
  // walls
  if (x < -ARENA) { x = -ARENA; hit = true; }
  if (x > ARENA) { x = ARENA; hit = true; }
  if (z < -ARENA) { z = -ARENA; hit = true; }
  if (z > ARENA) { z = ARENA; hit = true; }
  return { x, z, hit };
}
function driveVehicle(v, dt, throttle, steer) {
  const boosting = throttle > 0 && v.turbo > 0 && (v.isPlayer ? !!keys['shift'] : v.aiBoost);
  v.boosting = boosting;
  const top = v.top * (boosting ? 1.55 : 1);
  const acc = v.accel * (boosting ? 1.8 : 1);
  if (throttle > 0) v.speed = Math.min(top, v.speed + acc * dt * throttle);
  else if (throttle < 0) v.speed = Math.max(-v.top * 0.55, v.speed + acc * 1.2 * dt * throttle);
  else v.speed = lerp(v.speed, 0, Math.min(1, dt * (v.speed > 1 ? 1.4 : 3)));
  v.heading += steer * dt * (1.9 - Math.min(0.7, Math.abs(v.speed) / v.top * 0.7)) * (v.speed < 0 ? -1 : 1);
  v._lastSteer = steer;
  if (boosting) v.turbo = Math.max(0, v.turbo - 30 * dt);
  else v.turbo = Math.min(100, v.turbo + 7 * dt);

  const nx = v.x + Math.sin(v.heading) * v.speed * dt;
  const nz = v.z + Math.cos(v.heading) * v.speed * dt;
  const res = collideCircle(nx, nz, 2.6);
  if (res.hit && Math.abs(v.speed) > 12) {
    spawnBurst(v.x, 1.5, v.z, 0.4);
    G.shake = Math.min(1, G.shake + (v.isPlayer ? 0.3 : 0));
    if (v.isPlayer) audio.hit();
    v.speed *= 0.45;
  } else if (res.hit) v.speed *= 0.7;
  v.x = res.x; v.z = res.z;
  // flames
  const fl = v.mesh.userData.flames;
  fl.forEach(f => { f.material.opacity = lerp(f.material.opacity, boosting ? 0.9 : 0, dt * 8); f.scale.z = boosting ? 1 + Math.random() * 0.5 : 0.6; });
  v.wheelSpin += v.speed * dt * 1.2;
}

// vehicle-vehicle ramming
function ramCheck(dt) {
  for (let i = 0; i < vehicles.length; i++) {
    for (let j = i + 1; j < vehicles.length; j++) {
      const a = vehicles[i], b = vehicles[j];
      if (!a.alive || !b.alive) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d < 5.2 && d > 0.01) {
        const push = (5.2 - d) / 2;
        const nx = dx / d, nz = dz / d;
        a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
        const rel = Math.abs(a.speed - b.speed);
        if (rel > 10) {
          const faster = Math.abs(a.speed) > Math.abs(b.speed) ? a : b;
          const slower = faster === a ? b : a;
          damageVehicle(slower, 6 + rel * 0.5, faster);
          spawnBurst((a.x + b.x) / 2, 1.5, (a.z + b.z) / 2, 0.35);
          if (faster.isPlayer || slower.isPlayer) { audio.hit(); G.shake = Math.min(1, G.shake + 0.25); }
          a.speed *= 0.8; b.speed *= 0.8;
        }
      }
    }
  }
}

// ---------- AI ----------
function updateAI(v, dt) {
  const ai = v.ai;
  ai.think -= dt;
  if (ai.think <= 0) {
    ai.think = 0.5 + Math.random() * 0.5;
    // target: player if alive, else nearest rival, else waypoint
    let t = player.alive ? player : null;
    if (!t || t === v) {
      let bd = 1e9;
      for (const o of vehicles) {
        if (o === v || !o.alive) continue;
        const d = Math.hypot(o.x - v.x, o.z - v.z);
        if (d < bd) { bd = d; t = o; }
      }
    }
    ai.target = t && t.alive ? t : null;
    if (Math.random() < 0.3) pickAIWaypoint(v);
    if (Math.random() < 0.4) ai.strafe *= -1;
    // grab nearby pickup?
    ai.repick -= 1;
    if (ai.repick <= 0) {
      ai.repick = 4;
      let bp = null, bd = 60;
      for (const p of pickups) {
        if (!p.alive) continue;
        const d = Math.hypot(p.x - v.x, p.z - v.z);
        if (d < bd && (p.kind !== 'repair' || v.hp / v.maxhp < 0.7)) { bd = d; bp = p; }
      }
      ai.pickup = bp;
    }
  }
  const tgt = ai.pickup && ai.pickup.alive && Math.hypot(ai.pickup.x - v.x, ai.pickup.z - v.z) < 70
    ? { x: ai.pickup.x, z: ai.pickup.z } : ai.target
      ? { x: ai.target.x + Math.cos(G.elapsed * 0.7 + ai.strafe) * 14 * ai.strafe, z: ai.target.z + Math.sin(G.elapsed * 0.7) * 14 }
      : { x: ai.wpX, z: ai.wpZ };
  let des = Math.atan2(tgt.x - v.x, tgt.z - v.z);
  // obstacle probe
  const px = v.x + Math.sin(des) * 12, pz = v.z + Math.cos(des) * 12;
  for (const s of solids) {
    if (px > s.minX - 3 && px < s.maxX + 3 && pz > s.minZ - 3 && pz < s.maxZ + 3) { des += 0.9 * ai.strafe; break; }
  }
  const diff = angDiff(v.heading, des);
  const steer = clamp(-diff * 2.2, -1, 1);
  const dist = Math.hypot(tgt.x - v.x, tgt.z - v.z);
  const throttle = Math.abs(diff) > 2.2 ? -0.6 : dist < 8 ? 0.25 : 1;
  v.aiBoost = ai.target && dist > 40 && Math.abs(diff) < 0.3 && v.turbo > 30;
  driveVehicle(v, dt, throttle, steer);
  // aim turret at target
  if (ai.target && ai.target.alive) {
    const ta = Math.atan2(ai.target.x - v.x, ai.target.z - v.z);
    v.turretYaw = clamp(angDiff(v.heading, ta), -1.4, 1.4);
    const d = Math.hypot(ai.target.x - v.x, ai.target.z - v.z);
    v.aiCd -= dt;
    if (v.aiCd <= 0 && d < 65 && Math.abs(angDiff(v.heading + v.turretYaw, ta)) < 0.25) {
      v.aiCd = lerp(3.2, 1.4, ai.agg) + Math.random();
      // choose strongest available
      const opts = ['homing', 'power', 'napalm'].filter(k => v.ammo[k] > 0);
      if (opts.length && Math.random() < ai.agg) {
        v.sel = opts[Math.floor(Math.random() * opts.length)];
        fireSelected(v);
      } else fireMG(v); // MG trigger pull (cd-gated inside)
      if (v.special >= 100 && d < 40 && Math.random() < 0.5) { v.sel = 'special'; fireSelected(v); }
    } else if (d < 55) fireMG(v);
  } else { v.turretYaw = lerp(v.turretYaw, 0, dt); }
}

// ---------- pickups / mines / pools ----------
function updatePickups(dt) {
  for (const p of pickups) {
    if (!p.alive) {
      p.respawn -= dt;
      if (p.respawn <= 0 && !p.temp) {
        p.alive = true;
        setPickupKind(p, PICKUP_KINDS[Math.floor(Math.random() * PICKUP_KINDS.length)]);
        p.mesh.visible = true;
      } else if (p.respawn <= 0 && p.temp) {
        scene.remove(p.mesh);
        pickups.splice(pickups.indexOf(p), 1);
      }
      continue;
    }
    if (p.temp) { p.life -= dt; if (p.life <= 0) { p.alive = false; p.respawn = 0.01; continue; } }
    p.mesh.rotation.y += dt * 1.6;
    p.mesh.position.y = 1.6 + Math.sin(G.elapsed * 2 + p.phase) * 0.25;
    for (const v of vehicles) {
      if (!v.alive) continue;
      if (Math.hypot(p.x - v.x, p.z - v.z) < 4.2) {
        applyPickup(v, p);
        break;
      }
    }
  }
}
function applyPickup(v, p) {
  p.alive = false; p.respawn = p.temp ? 0.01 : 18; p.mesh.visible = false;
  if (p.kind === 'repair') {
    v.hp = Math.min(v.maxhp, v.hp + 45);
    redrawPlate(v.plate, v.hp / v.maxhp);
    if (v.isPlayer) { audio.repair(); toast('+45 hull'); }
  } else if (p.kind === 'turbo') {
    v.turbo = 100;
    if (v.isPlayer) { audio.pickup(); toast('Turbo full — hold SHIFT'); }
  } else {
    v.ammo[p.kind] = Math.min(WEAPONS[p.kind].max, v.ammo[p.kind] + (p.kind === 'power' ? 2 : 3));
    if (v.isPlayer) {
      audio.pickup(); toast(`${WEAPONS[p.kind].name} +${p.kind === 'power' ? 2 : 3}`);
      if (v.ammo[v.sel] <= 0 || v.sel === 'mg') v.sel = p.kind;
      renderWeapons();
      G.stats.pickups++;
    } else if (v.ammo[v.sel] <= 0) v.sel = p.kind;
  }
  spawnBurst(p.x, 2, p.z, 0.4);
  feed(`${v.isPlayer ? 'You' : v.name} grabbed ${p.kind}`, v.isPlayer ? 'me' : 'foe');
}
function updateMines(dt) {
  for (let i = mines.length - 1; i >= 0; i--) {
    const m = mines[i];
    m.life -= dt;
    m.mesh.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(G.elapsed * (m.armT > 0 ? 3 : 9))) * 0.6;
    if (m.armT > 0) { m.armT -= dt; }
    else {
      m.armT -= dt; // keep counting so owner re-trigger (armT <= -4) is reachable
      for (const v of vehicles) {
        if (!v.alive || v === m.owner) continue;
        if (Math.hypot(m.x - v.x, m.z - v.z) < 4.5) {
          scene.remove(m.mesh); mines.splice(i, 1);
          explode(m.x, 1, m.z, 11, m.dmg, m.owner, 1);
          break;
        }
      }
      // owner driving away then back also triggers after arm
      if (mines.includes(m) && m.armT <= -4) {
        const o = m.owner;
        if (o.alive && Math.hypot(m.x - o.x, m.z - o.z) < 3.5) {
          scene.remove(m.mesh); mines.splice(i, 1);
          explode(m.x, 1, m.z, 11, m.dmg * 0.8, m.owner, 1);
        }
      }
      if (mines.includes(m)) m.armT -= 0; // armed marker (counter keeps running above)
    }
    if (mines.includes(m) && m.life <= 0) { scene.remove(m.mesh); mines.splice(i, 1); explode(m.x, 1, m.z, 9, m.dmg * 0.6, m.owner, 0.8); }
  }
}
function updatePools(dt) {
  for (let i = pools.length - 1; i >= 0; i--) {
    const p = pools[i];
    p.life -= dt; p.tick -= dt;
    p.mesh.material.opacity = Math.min(0.75, p.life * 0.3);
    p.mesh.scale.multiplyScalar(1 + dt * 0.05);
    if (p.tick <= 0) {
      p.tick = 0.5;
      for (const v of vehicles) {
        if (!v.alive) continue;
        if (Math.hypot(p.x - v.x, p.z - v.z) < p.r) {
          damageVehicle(v, p.dmg, p.owner);
          v.firePoolT = 0.5;
        }
      }
    }
    if (p.life <= 0) { scene.remove(p.mesh); pools.splice(i, 1); }
  }
}
function updateShots(dt) {
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    s.life -= dt;
    if (s.homing && s.target && s.target.alive) {
      const ta = Math.atan2(s.target.x - s.x, s.target.z - s.z);
      const ca = Math.atan2(s.vx, s.vz);
      const na = ca + clamp(angDiff(ca, ta), -2.6 * dt, 2.6 * dt);
      const sp = Math.hypot(s.vx, s.vz);
      s.vx = Math.sin(na) * sp; s.vz = Math.cos(na) * sp;
      s.mesh.lookAt(s.x + s.vx, s.y, s.z + s.vz); s.mesh.rotateX(Math.PI / 2);
    }
    if (s.type === 'napalm') s.vy -= 22 * dt;
    s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
    s.mesh.position.set(s.x, s.y, s.z);
    s.trailT -= dt;
    if (s.trailT <= 0) { s.trailT = 0.06; spawnBurst(s.x, s.y, s.z, 0.12); }
    let dead = s.life <= 0 || Math.abs(s.x) > WALL + 4 || Math.abs(s.z) > WALL + 4;
    // building impact
    if (!dead) for (const so of solids) {
      if (s.x > so.minX && s.x < so.maxX && s.z > so.minZ && s.z < so.maxZ && s.y < 30) { dead = true; break; }
    }
    // napalm lands -> pool
    if (s.type === 'napalm' && s.y <= 0.3) {
      scene.remove(s.mesh); shots.splice(i, 1);
      const m = new THREE.Mesh(new THREE.CircleGeometry(5, 20),
        new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.75 }));
      m.rotation.x = -Math.PI / 2; m.position.set(s.x, 0.06, s.z); scene.add(m);
      pools.push({ mesh: m, x: s.x, z: s.z, r: 5.5, life: 6, tick: 0, owner: s.owner, dmg: s.dmg });
      explode(s.x, 0.5, s.z, 7, s.dmg * 1.5, s.owner, 0.8);
      continue;
    }
    // vehicle impact
    if (!dead) for (const v of vehicles) {
      if (v === s.owner || !v.alive) continue;
      if (s.y > 4.5) continue;
      if (Math.hypot(v.x - s.x, v.z - s.z) < 3.4) { dead = true; break; }
    }
    // barrel impact
    if (!dead) for (const b of barrels) {
      if (!b.alive) continue;
      if (Math.hypot(b.x - s.x, b.z - s.z) < 2.4 && s.y < 4) {
        b.hp -= s.dmg;
        if (b.hp <= 0) detonateBarrel(b, s.owner);
        else { spawnBurst(b.x, 1.5, b.z, 0.3); }
        dead = true; break;
      }
    }
    if (dead) {
      const hitV = s.type !== 'napalm';
      scene.remove(s.mesh); shots.splice(i, 1);
      if (s.type === 'power') explode(s.x, Math.max(1, s.y), s.z, 9, s.dmg, s.owner, 1);
      else if (s.type === 'homing') {
        // only count accuracy when we actually finish near the mark
        const tgt = s.target;
        const near = tgt && tgt.alive && Math.hypot(tgt.x - s.x, tgt.z - s.z) < 9;
        explode(s.x, Math.max(1, s.y), s.z, 7, s.dmg, s.owner, 0.7);
        if (s.owner.isPlayer && near) G.stats.hits++;
      } else if (hitV) explode(s.x, Math.max(1, s.y), s.z, 5, s.dmg * 0.5, s.owner, 0.5);
      continue;
    }
  }
}
function updateBursts(dt) {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    b.life -= dt;
    const pos = b.pts.geometry.attributes.position;
    for (let j = 0; j < b.vel.length; j++) {
      pos.array[j * 3] += b.vel[j][0] * dt;
      pos.array[j * 3 + 1] += b.vel[j][1] * dt;
      pos.array[j * 3 + 2] += b.vel[j][2] * dt;
      if (!b.smoke) b.vel[j][1] -= 22 * dt;
    }
    pos.needsUpdate = true;
    b.pts.material.opacity = Math.max(0, b.life / b.maxlife);
    if (b.life <= 0) { scene.remove(b.pts); b.pts.geometry.dispose(); b.pts.material.dispose(); bursts.splice(i, 1); }
  }
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.life -= dt;
    if (t.life <= 0) { scene.remove(t.mesh); t.mesh.geometry.dispose(); t.mesh.material.dispose(); tracers.splice(i, 1); }
  }
  boomLight.intensity = Math.max(0, boomLight.intensity - dt * 220);
}

// ---------- turret aim (player) ----------
function updatePlayerTurret() {
  const ap = aimPoint(player);
  const ta = Math.atan2(ap.x - player.x, ap.z - player.z);
  const want = clamp(angDiff(player.heading, ta), -1.5, 1.5);
  player.turretYaw = lerp(player.turretYaw, want, 0.25);
}

// ---------- camera ----------
const camPos = new THREE.Vector3(0, 30, -80);
function updateCamera(dt) {
  const back = 17, up = 8.5;
  const dx = Math.sin(player.heading), dz = Math.cos(player.heading);
  const tx = player.x - dx * back, tz = player.z - dz * back;
  const k = 1 - Math.pow(0.001, dt);
  camPos.x = lerp(camPos.x, tx, k); camPos.z = lerp(camPos.z, tz, k);
  camPos.y = lerp(camPos.y, up + Math.abs(player.speed) * 0.05, k);
  G.shake = Math.max(0, G.shake - dt * 2.2);
  const sh = REDUCED ? 0 : G.shake * G.shake;
  camera.position.set(
    camPos.x + (Math.random() - 0.5) * sh * 3,
    camPos.y + (Math.random() - 0.5) * sh * 2,
    camPos.z + (Math.random() - 0.5) * sh * 3
  );
  camera.lookAt(player.x + dx * 10, 3, player.z + dz * 10);
}

// ---------- minimap ----------
const mmStatic = document.createElement('canvas');
mmStatic.width = mmStatic.height = 168;
function renderMmStatic() {
  const c = mmStatic.getContext('2d');
  const S = 168 / (WALL * 2 + 16);
  c.fillStyle = '#0d0a06'; c.fillRect(0, 0, 168, 168);
  const px = (x) => (x + WALL + 8) * S;
  c.fillStyle = '#6b5b45';
  for (const o of obstacles) c.fillRect(px(o.x - o.w / 2), px(o.z - o.d / 2), o.w * S, o.d * S);
  c.strokeStyle = '#ffb02e'; c.lineWidth = 2; c.strokeRect(px(-WALL), px(-WALL), WALL * 2 * S, WALL * 2 * S);
}
function drawMinimap() {
  const c = mmc, S = 168 / (WALL * 2 + 16);
  const px = (x) => (x + WALL + 8) * S;
  c.clearRect(0, 0, 168, 168);
  c.drawImage(mmStatic, 0, 0);
  for (const p of pickups) {
    if (!p.alive) continue;
    c.fillStyle = '#' + PICKUP_COLORS[p.kind].toString(16).padStart(6, '0');
    c.fillRect(px(p.x) - 2, px(p.z) - 2, 4, 4);
  }
  for (const mn of mines) {
    c.fillStyle = '#57e6ff';
    c.beginPath(); c.arc(px(mn.x), px(mn.z), 2.5, 0, TAU); c.fill();
  }
  for (const v of vehicles) {
    if (!v.alive) continue;
    c.save();
    c.translate(px(v.x), px(v.z)); c.rotate(Math.atan2(Math.sin(v.heading), -Math.cos(v.heading)));
    c.fillStyle = v.isPlayer ? '#ffffff' : '#ff3b30';
    c.beginPath();
    c.moveTo(0, -5); c.lineTo(3.4, 4); c.lineTo(-3.4, 4); c.closePath(); c.fill();
    c.restore();
  }
}

// ---------- match flow ----------
function startMatch() {
  resetWorld();
  $('title').classList.add('hidden');
  $('end').classList.add('hidden');
  hud.classList.remove('hidden');
  G.mode = 'countdown';
  const gen = ++G.countGen;
  let n = 3;
  banner('READY', 'Eliminate all 5 rivals');
  audio.countBeep(false);
  feed('Match started — 5 rivals, 3 rides', 'sys');
  const iv = setInterval(() => {
    if (G.mode !== 'countdown' || gen !== G.countGen) { clearInterval(iv); return; } // superseded (restart / early end)
    n--;
    if (n > 0) { banner(String(n)); audio.countBeep(false); }
    else {
      clearInterval(iv);
      banner('GO!', 'Good hunting');
      audio.countBeep(true);
      G.mode = 'playing';
      toast('WASD drive · mouse aim · click MG · F weapon · SHIFT turbo', 5000);
    }
  }, 800);
}
function endMatch(won, reason) {
  if (G.mode === 'over') return;
  G.mode = 'over';
  G.over = { won, reason };
  const secs = Math.floor((performance.now() - G.stats.start) / 1000);
  if (won) audio.win(); else audio.lose();
  setTimeout(() => {
    document.title = 'PANEL_SHOWN_' + (won ? 'win' : 'lose');
    $('end-kicker').textContent = won ? '★ VICTORY ★' : 'WRECKED OUT';
    $('end-title').textContent = won ? 'Last Engine Running' : 'Scrap Metal';
    $('end-sub').textContent = reason;
    const acc = G.stats.shots ? Math.round(G.stats.hits / G.stats.shots * 100) : 0;
    $('end-stats').innerHTML =
      `Rivals destroyed <b>${G.kos} / 5</b> &nbsp;·&nbsp; Time <b>${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</b><br>` +
      `Shots <b>${G.stats.shots}</b> · Accuracy <b>${acc}%</b> · Pickups <b>${G.stats.pickups}</b> · Damage <b>${Math.round(G.stats.dmgDealt)}</b>`;
    $('end').classList.remove('hidden');
  }, won ? 1200 : 1800);
}
function togglePause(force) {
  if (G.mode === 'playing' || force === true) {
    if (G.mode !== 'playing') return;
    G.mode = 'paused';
    audio.setEngine(0, false);
    $('pause').classList.remove('hidden');
  } else if (G.mode === 'paused') {
    G.mode = 'playing';
    $('pause').classList.add('hidden');
  }
}
function clearDynamic() {
  for (const s of shots) scene.remove(s.mesh); shots.length = 0;
  for (const m of mines) scene.remove(m.mesh); mines.length = 0;
  for (const p of pools) scene.remove(p.mesh); pools.length = 0;
  for (const b of bursts) { scene.remove(b.pts); } bursts.length = 0;
  for (const t of tracers) scene.remove(t.mesh); tracers.length = 0;
  for (const v of vehicles) { scene.remove(v.mesh); }
  for (const p of pickups) scene.remove(p.mesh); pickups.length = 0;
  for (const b of barrels) scene.remove(b.mesh); barrels.length = 0;
  ui.feed.innerHTML = '';
}
function resetWorld() {
  clearDynamic();
  spawnVehicles(); spawnPickups(); spawnBarrels();
  G.time = MATCH_TIME; G.lives = PLAYER_LIVES; G.kos = 0; G.elapsed = 0; G.shake = 0;
  G.stats = freshStats(); G.over = null;
  ui.kos.textContent = '0';
  ui.clock.textContent = '05:00';
  ui.clock.style.color = '';
  renderLives(); renderWeapons();
  camPos.set(player.x, 9, player.z - 17);
}
function restart() {
  $('pause').classList.add('hidden');
  $('end').classList.add('hidden');
  startMatch();
}

// ---------- per-frame ----------
const clock = new THREE.Clock();
let wbarT = 0, plateSyncT = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  if (G.mode === 'playing') {
    G.elapsed += dt;
    G.time -= dt;
    // clock
    const t = Math.max(0, G.time);
    ui.clock.textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    if (t < 60) ui.clock.style.color = '#ff5a4d';
    if (t <= 0) { endMatch(G.kos >= 5, G.kos >= 5 ? 'Finished them just in time.' : 'Time expired with rivals still rolling.'); }

    // --- player drive ---
    if (player.alive) {
      let th = 0, st = 0;
      if (keys['w'] || keys['arrowup']) th += 1;
      if (keys['s'] || keys['arrowdown']) th -= 1;
      if (keys['a'] || keys['arrowleft']) st += 1;
      if (keys['d'] || keys['arrowright']) st -= 1;
      if (DEMO) { // verification autopilot: cruise, aim forward, shoot
        th = 0.8; st = Math.sin(G.elapsed * 0.5) * 0.5;
        mouseNX = 0.1; mouseNY = 0.05;
        if (Math.floor(G.elapsed * 2) % 4 === 0) fireMG(player);
        if (!DEMO._fired && G.elapsed > 0.8) { DEMO._fired = true; fireSelected(player); }
        if (!DEMO._fired2 && G.elapsed > 1.8) { DEMO._fired2 = true; player.sel = 'power'; renderWeapons(); fireSelected(player); }
        if (!DEMO._fired3 && G.elapsed > 3.0) { DEMO._fired3 = true; player.sel = 'napalm'; renderWeapons(); fireSelected(player); }
      }
      driveVehicle(player, dt, th, st);
      updatePlayerTurret();
      if ((mouseDown || keys[' ']) && player.mgHeat < 100) fireMG(player);
      if (keys['f'] && !player._fHeld) { fireSelected(player); }
      player._fHeld = !!keys['f'];
      // burn in fire pools handled via damage; show flame on victim
      player.special = Math.min(100, player.special + dt * (100 / 50));
      player.invuln = Math.max(0, player.invuln - dt);
      player.mesh.visible = player.invuln > 0 ? (Math.floor(G.elapsed * 8) % 2 === 0) : true;
      // contextual hints
      if (G.elapsed > 6 && !player._hint1) { player._hint1 = true; toast('Grab glowing crates for weapons · green = repair'); }
    } else if (player.respawnT > 0) {
      player.respawnT -= dt;
      if (player.respawnT <= 0 && G.mode === 'playing') respawnPlayer();
    }

    // --- AI ---
    for (const e of enemies) {
      if (!e.alive) continue;
      e.special = Math.min(100, e.special + dt * (100 / 65));
      e.invuln = Math.max(0, e.invuln - dt);
      updateAI(e, dt);
    }

    // cooldowns
    for (const v of vehicles) {
      v.mgCd = Math.max(0, v.mgCd - dt);
      v.wpnCd = Math.max(0, v.wpnCd - dt);
      v.mgHeat = Math.max(0, v.mgHeat - dt * 26);
      v.flash = Math.max(0, v.flash - dt);
      v.firePoolT = Math.max(0, v.firePoolT - dt);
      v.mesh.userData.paint.emissive.setRGB(v.flash * 2 + (v.firePoolT > 0 ? 0.5 : 0), v.flash * 0.4, v.flash * 0.2);
    }

    ramCheck(dt);
    updateShots(dt); updateMines(dt); updatePools(dt); updatePickups(dt); updateBursts(dt);

    // barrels respawn
    for (const b of barrels) {
      if (!b.alive) {
        b.respawn -= dt;
        if (b.respawn <= 0) { b.alive = true; b.hp = 20; b.mesh.visible = true; }
      }
    }

    // sync meshes
    for (const v of vehicles) {
      if (!v.alive) continue;
      v.mesh.position.set(v.x, v.firePoolT > 0 ? Math.random() * 0.15 : 0, v.z);
      v.mesh.rotation.y = v.heading;
      v.mesh.userData.turret.rotation.y = v.turretYaw;
      v.mesh.userData.wheels.forEach(w => w.rotation.x += v.wheelSpin * 0.1);
      // lean
      v.mesh.rotation.z = lerp(v.mesh.rotation.z, -v._lastSteer * 0.06 || 0, 0.1);
    }

    updateCamera(dt);
    drawMinimap();
    audio.setEngine(clamp(Math.abs(player.speed) / player.top, 0, 1), player.boosting);

    // HUD
    const frac = clamp(player.hp / player.maxhp, 0, 1);
    ui.hpFill.style.width = (frac * 100) + '%';
    ui.hpGhost.style.width = (frac * 100) + '%';
    ui.turboFill.style.width = player.turbo + '%';
    ui.speedo.textContent = `${Math.round(Math.abs(player.speed) * 4.2)} mph${player.boosting ? ' · BOOST' : ''}`;
    wbarT -= dt;
    if (wbarT <= 0) { wbarT = 0.25; renderWeapons(); }
  } else if (G.mode === 'countdown') {
    updateCamera(dt); updateBursts(dt);
  }
  renderer.render(scene, camera);
}

// ---------- boot ----------
function applyQuality(high) {
  G.highDetail = high;
  renderer.shadowMap.enabled = high;
  sun.castShadow = high;
  renderer.setPixelRatio(high ? Math.min(devicePixelRatio, 2) : 1);
  onResize();
  scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
}
function boot() {
  buildArena();
  renderMmStatic();
  spawnVehicles(); spawnPickups(); spawnBarrels();
  G.stats = freshStats();
  renderLives(); renderWeapons();
  applyQuality($('opt-quality').checked);
  $('opt-quality').addEventListener('change', (e) => applyQuality(e.target.checked));
  $('btn-start').addEventListener('click', () => { audio.ensure(); startMatch(); });
  $('btn-resume').addEventListener('click', () => togglePause());
  $('btn-restart-pause').addEventListener('click', () => restart());
  $('btn-again').addEventListener('click', () => restart());
  // headless/verification hook: ?play=1 skips the title screen
  const QS = new URLSearchParams(location.search);
  if (QS.has('play')) {
    setTimeout(() => { audio.ensure(); startMatch(); }, 600);
  }
  // scripted acceptance scenarios (?play=1&scenario=killall|diew|timeout)
  window.__grim = { G, get vehicles() { return vehicles; }, get player() { return player; }, killVehicle, damageVehicle, endMatch, restart };
  const scen = QS.get('scenario');
  if (scen) {
    const poll = setInterval(() => {
      if (G.mode !== 'playing') return;
      clearInterval(poll);
      if (scen === 'killall') enemies.forEach((e, i) => setTimeout(() => killVehicle(e, player), 400 + i * 450));
      else if (scen === 'diew') { G.lives = 1; setTimeout(() => damageVehicle(player, 9999, enemies[0]), 800); }
      else if (scen === 'timeout') { G.time = 0.05; }
    }, 300);
    setInterval(() => {
      if (G.mode === 'over') {
        let d = document.getElementById('verify');
        if (!d) { d = document.createElement('div'); d.id = 'verify'; document.body.appendChild(d); }
        d.textContent = JSON.stringify({
          mode: G.mode, kos: G.kos, lives: G.lives, won: G.over && G.over.won,
          endVisible: !$('end').classList.contains('hidden'),
          title: $('end-title').textContent,
        });
      }
    }, 500);
  }
  onResize();
  // idle camera drift on title
  camPos.set(0, 40, -90);
  camera.position.copy(camPos);
  camera.lookAt(0, 0, 0);
  const idle = setInterval(() => {
    if (G.mode !== 'title') { clearInterval(idle); return; }
    const a = performance.now() * 0.00008;
    camera.position.set(Math.sin(a) * 120, 46, Math.cos(a) * 120);
    camera.lookAt(0, 2, 0);
    renderer.render(scene, camera);
  }, 33);
  frame();
}
try {
  boot();
} catch (err) {
  console.error(err);
  const le = $('load-error');
  le.textContent = 'Failed to start: ' + err.message + ' — reload the page.';
  le.classList.remove('hidden');
}
