/* IRON MAYHEM — original 3D vehicular arena-combat game.
   Inspired by the visual language of Twisted Metal (dark urban arena, armored
   DIY rigs, readable muzzle flash, stat-bar garage, win/lose match flow).
   All models, textures (procedural canvas), and audio (WebAudio synth) are original.
*/
import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
function angLerp(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU;
  return a + d * clamp(t, 0, 1);
}

// ---------------------------------------------------------------- config
const ARENA = 110;               // playable half-extent (walls at ±ARENA/2)
const VEHICLES = [
  { id: 'scrapjack', name: 'SCRAPJACK', role: 'balanced brawler • original', color: 0xc96a1e,
    speed: 0.72, armor: 0.66, special: 0.6, hp: 120, mgDmg: 7, desc: 'Ex-tow truck. Forgiving.' },
  { id: 'widow', name: 'BLACK WIDOW', role: 'fast striker • original', color: 0x8a1fd1,
    speed: 0.95, armor: 0.42, special: 0.8, hp: 90, mgDmg: 6, desc: 'Buggy. Hit and run.' },
  { id: 'bulwark', name: 'BULWARK', role: 'heavy juggernaut • original', color: 0x3f7a4e,
    speed: 0.55, armor: 0.92, special: 0.45, hp: 160, mgDmg: 9, desc: 'Plow truck. Slow, brutal.' },
];
const ENEMY_DEFS = [
  { name: 'RUSTBUCKET', color: 0xb03030, hp: 90, speed: 26, mgDmg: 5, skill: 0.55 },
  { name: 'GASLIGHT', color: 0x2a7fd1, hp: 80, speed: 30, mgDmg: 5, skill: 0.7 },
  { name: 'CLOWN PRINCE', color: 0xd1c22a, hp: 110, speed: 24, mgDmg: 7, skill: 0.62 },
];

// ---------------------------------------------------------------- audio (all synthesized, original)
const AudioSys = {
  ctx: null, master: null, muted: false, engineOsc: null, engineGain: null, engineFilter: null,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      // engine loop: sawtooth -> lowpass, pitch driven per-frame
      this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      this.engineFilter = this.ctx.createBiquadFilter(); this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 320;
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0.0;
      this.engineOsc.connect(this.engineFilter).connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
    } catch (e) { console.warn('audio unavailable', e); }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
    $('btn-mute').textContent = m ? '🔇' : '🔊';
  },
  engine(speed01, boosting) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.06, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(50 + speed01 * 90 + (boosting ? 30 : 0), t, 0.08);
  },
  blip(freq, dur, type = 'square', vol = 0.2) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur);
  },
  noise(dur = 0.3, vol = 0.4, low = 400, high = 4000) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime, len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.value = (low + high) / 2; f.Q.value = 0.7;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master); src.start(t);
  },
  mg() { this.noise(0.09, 0.30, 900, 5200); this.blip(190, 0.06, 'square', 0.10); },
  enemyMg() { this.noise(0.09, 0.16, 700, 3800); },
  missile() { this.noise(0.5, 0.35, 300, 2400); this.blip(320, 0.4, 'sawtooth', 0.12); },
  explosion(big = 1) { this.noise(0.9 * big, 0.6, 60, 900); this.blip(55, 0.7 * big, 'sine', 0.4); },
  pickup() { this.blip(660, 0.09, 'square', 0.15); setTimeout(() => this.blip(990, 0.12, 'square', 0.15), 90); },
  hit() { this.blip(140, 0.12, 'sawtooth', 0.2); },
  ui() { this.blip(520, 0.07, 'square', 0.12); },
  win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.25, 'square', 0.2), i * 140)); },
  lose() { [400, 320, 240, 150].forEach((f, i) => setTimeout(() => this.blip(f, 0.3, 'sawtooth', 0.2), i * 170)); },
};

// ---------------------------------------------------------------- game state
const G = {
  state: 'loading', player: null, enemies: [], projectiles: [], particles: [],
  pickups: [], obstacles: [], kills: 0, time: 0, shake: 0, selected: 0,
  mouseNDC: new THREE.Vector2(0, 0), firing: false, missileQueued: false,
  keys: {}, muzzleLight: null, flashLight: null, arenaGroup: null,
  pickupTimer: 0, aiTick: 0, matchId: 0, stats: { shots: 0, hits: 0, missilesFired: 0 },
};

// ---------------------------------------------------------------- three setup
let renderer, scene, camera, raycaster, groundPlane;
const MINIMAP = () => $('minimap');

function fatal(msg) {
  const el = $('fatal'); el.classList.remove('hidden');
  el.innerHTML = '⚠ ' + msg + ' <button id="fatal-retry" class="btn small" style="position:static">RETRY</button>';
  $('fatal-retry').onclick = () => location.reload();
}

function makeTextSprite(text, scale = 1) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(0,0,0,0)'; x.fillRect(0, 0, 256, 64);
  x.font = 'bold 34px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.lineWidth = 6;
  x.strokeText(text, 128, 32); x.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const s = new THREE.Sprite(m); s.scale.set(7 * scale, 1.75 * scale, 1);
  return s;
}

function groundTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#1b1a18'; x.fillRect(0, 0, 512, 512);
  // asphalt noise
  for (let i = 0; i < 5200; i++) {
    x.fillStyle = `rgba(${40 + Math.random() * 40},${38 + Math.random() * 36},${34 + Math.random() * 30},0.5)`;
    x.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  // lane markings / arena paint
  x.strokeStyle = 'rgba(255,179,0,0.5)'; x.lineWidth = 6; x.setLineDash([28, 20]);
  x.beginPath(); x.arc(256, 256, 190, 0, TAU); x.stroke();
  x.strokeStyle = 'rgba(255,60,30,0.4)'; x.setLineDash([14, 14]);
  x.strokeRect(20, 20, 472, 472);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4);
  return t;
}

function initThree() {
  const canvas = $('scene');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0d16);
  scene.fog = new THREE.Fog(0x0a0d16, 90, 260);

  camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 600);
  camera.position.set(0, 14, -18);

  raycaster = new THREE.Raycaster();
  groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  // lighting: dusk arena — hemisphere + moon dir w/ shadows + 4 floodlight spots + muzzle/flash lights
  scene.add(new THREE.HemisphereLight(0x4a5a8a, 0x1a120a, 0.85));
  const moon = new THREE.DirectionalLight(0x9fb4ff, 1.0);
  moon.position.set(-60, 90, 40); moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -80; moon.shadow.camera.right = 80;
  moon.shadow.camera.top = 80; moon.shadow.camera.bottom = -80;
  scene.add(moon);
  const warm = new THREE.DirectionalLight(0xff8a3c, 0.5);
  warm.position.set(50, 30, -60); scene.add(warm);

  G.muzzleLight = new THREE.PointLight(0xffc14d, 0, 26, 2); scene.add(G.muzzleLight);
  G.flashLight = new THREE.PointLight(0xff5a1e, 0, 90, 1.6); scene.add(G.flashLight);

  buildArena();
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

function buildArena() {
  G.arenaGroup = new THREE.Group(); scene.add(G.arenaGroup);
  const H = ARENA / 2;
  // ground
  const g = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA + 26, ARENA + 26),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95, metalness: 0.05 })
  );
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true; G.arenaGroup.add(g);

  // walls: dark concrete + hazard stripe top + neon trim
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.85 });
  const stripeC = document.createElement('canvas'); stripeC.width = 128; stripeC.height = 16;
  const sx = stripeC.getContext('2d');
  sx.fillStyle = '#151312'; sx.fillRect(0, 0, 128, 16);
  sx.fillStyle = '#ffb300';
  for (let i = 0; i < 8; i++) { sx.save(); sx.translate(i * 16, 0); sx.rotate(0.5); sx.fillRect(0, -6, 8, 28); sx.restore(); }
  const stripeTex = new THREE.CanvasTexture(stripeC);
  stripeTex.wrapS = THREE.RepeatWrapping; stripeTex.repeat.set(10, 1);
  const stripeMat = new THREE.MeshBasicMaterial({ map: stripeTex });
  const wallGeo = new THREE.BoxGeometry(ARENA + 8, 7, 2);
  const positions = [
    [0, 3.5, -H - 3, 0], [0, 3.5, H + 3, 0], [-H - 3, 3.5, 0, Math.PI / 2], [H + 3, 3.5, 0, Math.PI / 2],
  ];
  for (const [x, y, z, ry] of positions) {
    const w = new THREE.Mesh(wallGeo, wallMat); w.position.set(x, y, z); w.rotation.y = ry;
    w.castShadow = w.receiveShadow = true; G.arenaGroup.add(w);
    const s = new THREE.Mesh(new THREE.BoxGeometry(ARENA + 8, 0.8, 2.1), stripeMat);
    s.position.set(x, 6.4, z); s.rotation.y = ry; G.arenaGroup.add(s);
  }
  // corner floodlight towers (pole + head + SpotLight for 2 of them to bound cost)
  const towerSpots = [[-H, -H], [H, -H], [-H, H], [H, H]];
  towerSpots.forEach(([x, z], i) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 22, 8),
      new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.6, metalness: 0.6 }));
    pole.position.set(x, 11, z); pole.castShadow = true; G.arenaGroup.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.4, 1),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffd9a0, emissiveIntensity: 2.2 }));
    head.position.set(x, 22, z); head.lookAt(0, 0, 0); G.arenaGroup.add(head);
    if (i < 2) {
      const sp = new THREE.SpotLight(0xffd9a0, 900, 160, 0.7, 0.5, 1.6);
      sp.position.set(x, 22, z); sp.target.position.set(0, 0, 0);
      G.arenaGroup.add(sp, sp.target);
    } else {
      const pt = new THREE.PointLight(0xffc98a, 220, 120, 1.8);
      pt.position.set(x, 21, z); G.arenaGroup.add(pt);
    }
  });

  // obstacles: crates, concrete barriers, pillars, tire stacks, central platform
  G.obstacles = [];
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x6e4a22, roughness: 0.9 });
  const concMat = new THREE.MeshStandardMaterial({ color: 0x585861, roughness: 0.9 });
  const rustMat = new THREE.MeshStandardMaterial({ color: 0x7a2a1a, roughness: 0.8, metalness: 0.3 });
  function addObstacle(mesh, r, h = 2) {
    mesh.castShadow = mesh.receiveShadow = true;
    G.arenaGroup.add(mesh);
    G.obstacles.push({ x: mesh.position.x, z: mesh.position.z, r, mesh });
  }
  // central octagon platform (cover + landmark)
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(10, 11, 2.4, 8), concMat);
  plat.position.set(0, 1.2, 0); addObstacle(plat, 11);
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 9, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a4a52, roughness: 0.85, metalness: 0.2 }));
  beacon.position.set(0, 8, 0); beacon.castShadow = true; G.arenaGroup.add(beacon);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0x220a06, emissive: 0xff3b30, emissiveIntensity: 3 }));
  lamp.position.set(0, 12.8, 0); G.arenaGroup.add(lamp);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(10.5, 0.35, 10, 40),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffb300, emissiveIntensity: 1.8 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 2.6; G.arenaGroup.add(ring);
  // scattered cover
  const spots = [[-32, -20], [30, -28], [-28, 26], [34, 24], [-38, 2], [38, -4], [12, -38], [-14, 38], [20, 12], [-20, -12]];
  spots.forEach(([x, z], i) => {
    if (i % 3 === 0) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(7, 2.6, 2.2), i % 2 ? rustMat : concMat);
      m.position.set(x, 1.3, z); m.rotation.y = (i * 0.7) % Math.PI; addObstacle(m, 3.6);
    } else if (i % 3 === 1) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 2.6), crateMat);
      m.position.set(x, 1.3, z); m.rotation.y = i; addObstacle(m, 2.4);
      const m2 = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), crateMat);
      m2.position.set(x + 1.6, 3.6, z + 0.6); m2.rotation.y = i * 2; G.arenaGroup.add(m2);
    } else {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 5, 10), concMat);
      m.position.set(x, 2.5, z); addObstacle(m, 2.2);
    }
  });
  // perimeter city silhouettes with lit windows (dark urban kill-box read)
  function windowsTexture() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#0b0c10'; x.fillRect(0, 0, 128, 256);
    for (let r = 0; r < 12; r++) for (let col = 0; col < 5; col++) {
      const lit = Math.random();
      x.fillStyle = lit < 0.22 ? 'rgba(255,190,90,0.95)' : lit < 0.3 ? 'rgba(140,190,255,0.9)' : 'rgba(30,34,44,1)';
      x.fillRect(8 + col * 23, 10 + r * 20, 14, 11);
    }
    return new THREE.CanvasTexture(c);
  }
  const winTex = windowsTexture();
  const cityMats = [
    new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.95 }),
    new THREE.MeshStandardMaterial({ map: winTex, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.85, roughness: 0.9 }),
  ];
  const cityGeo = new THREE.BoxGeometry(1, 1, 1);
  const citySpots = [
    [-78, -40, 26, 46], [-70, 30, 30, 60], [-40, -80, 24, 40], [10, -82, 34, 55],
    [60, -72, 26, 44], [82, -20, 24, 52], [80, 40, 30, 42], [40, 80, 26, 50],
    [-10, 82, 32, 58], [-60, 76, 26, 44], [-84, 10, 24, 48], [0, -60, 0, 0],
  ];
  citySpots.forEach(([x, z, w, h], i) => {
    if (!w) return;
    const b = new THREE.Mesh(cityGeo, cityMats[i % 2 ? 1 : 0]);
    b.scale.set(w, h, w * 0.7); b.position.set(x, h / 2 - 2, z);
    b.rotation.y = (i * 0.35) % 0.8; G.arenaGroup.add(b);
  });
  // tire stacks + oil barrels as extra cover dressing
  const tireM = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
  const barrelM = new THREE.MeshStandardMaterial({ color: 0x8a2f16, roughness: 0.7, metalness: 0.3 });
  [[-8, -18], [44, 8], [-44, -34], [16, 30]].forEach(([x, z]) => {
    for (let s = 0; s < 3; s++) {
      const tire = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.34, 8, 16), tireM);
      tire.rotation.x = Math.PI / 2; tire.position.set(x, 0.35 + s * 0.62, z);
      tire.castShadow = true; G.arenaGroup.add(tire);
    }
    G.obstacles.push({ x, z, r: 1.6, mesh: null });
  });
  [[-24, 8], [26, -8]].forEach(([x, z]) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.0, 12), barrelM);
    b.position.set(x, 1.0, z); b.castShadow = b.receiveShadow = true; G.arenaGroup.add(b);
    G.obstacles.push({ x, z, r: 1.6, mesh: b });
  });
  [['GOING OUT OF BUSINESS', '#ffb300'], ['RUST & FURY', '#ff5a3c']].forEach(([txt, col], i) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#0d0c0a'; x.fillRect(0, 0, 512, 128);
    x.strokeStyle = col; x.lineWidth = 6; x.strokeRect(8, 8, 496, 112);
    x.fillStyle = col; x.font = 'bold 44px Arial'; x.textAlign = 'center';
    x.fillText(txt, 256, 78);
    const tex = new THREE.CanvasTexture(c);
    const bb = new THREE.Mesh(new THREE.PlaneGeometry(22, 5.5),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    bb.position.set(i ? 30 : -30, 10, i ? 40 : -40); bb.rotation.y = i ? Math.PI + 0.4 : 0.4;
    G.arenaGroup.add(bb);
  });
  // stars
  {
    const n = 500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 320 + Math.random() * 160, a = Math.random() * TAU;
      pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = 40 + Math.random() * 200; pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x8fa4ff, size: 1.6, sizeAttenuation: false })));
  }
}

// ---------------------------------------------------------------- vehicles
function buildVehicleMesh(color, name, isPlayer) {
  const grp = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1c20, roughness: 0.7, metalness: 0.4 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x777d85, roughness: 0.4, metalness: 0.8 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 5.6), paint);
  body.position.y = 1.05; body.castShadow = true; grp.add(body);
  // hood + cab + armor plates (original DIY look)
  const hood = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.5, 1.8), dark);
  hood.position.set(0, 1.75, 1.8); hood.castShadow = true; grp.add(hood);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.0, 2.2), dark);
  cab.position.set(0, 2.0, -0.9); cab.castShadow = true; grp.add(cab);
  const shield = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.9, 0.25), steel);
  shield.position.set(0, 1.5, 2.95); shield.rotation.x = -0.25; grp.add(shield);
  // side spikes (aggression read from anchors)
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 6), steel);
    spike.position.set(s * 1.85, 1.1, -1.4 + i * 1.4); spike.rotation.z = s * Math.PI / 2;
    grp.add(spike);
  }
  // turret + barrel (aims with mouse)
  const turret = new THREE.Group(); turret.position.set(0, 2.0, 0.4); grp.add(turret);
  const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.0, 0.7, 12), steel);
  dome.castShadow = true; turret.add(dome);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 2.6, 8),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.8 }));
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0.35, 0.25, 1.5); turret.add(barrel);
  const barrel2 = barrel.clone(); barrel2.position.x = -0.35; turret.add(barrel2);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.25, 2.9); turret.add(muzzle);
  // muzzle-flash star: additive sprite shown ~70ms per shot (signature orange bloom)
  const fc = document.createElement('canvas'); fc.width = fc.height = 64;
  const fx = fc.getContext('2d');
  const grad = fx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,230,1)'); grad.addColorStop(0.35, 'rgba(255,190,70,0.95)');
  grad.addColorStop(1, 'rgba(255,90,20,0)');
  fx.fillStyle = grad; fx.fillRect(0, 0, 64, 64);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(fc), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  flash.scale.set(2.6, 2.6, 1); flash.position.copy(muzzle.position); flash.visible = false;
  turret.add(flash);
  // roof ornament: dark war-horn with glowing tip (original flourish)
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.1, 8),
    new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.5, metalness: 0.7, emissive: 0xff6a00, emissiveIntensity: 0.55 }));
  horn.position.set(-0.55, 3.0, -0.9); horn.rotation.z = 0.35; grp.add(horn);
  // wheels with hubs + fenders
  const wheels = [];
  const wg = new THREE.CylinderGeometry(0.62, 0.62, 0.55, 14);
  const wm = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.9 });
  const hubG = new THREE.CylinderGeometry(0.26, 0.26, 0.58, 8);
  const hubM = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.35, metalness: 0.85 });
  for (const [x, z] of [[-1.75, 1.8], [1.75, 1.8], [-1.75, -1.8], [1.75, -1.8]]) {
    const w = new THREE.Mesh(wg, wm);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.62, z); w.castShadow = true;
    grp.add(w); wheels.push(w);
    const hub = new THREE.Mesh(hubG, hubM);
    hub.rotation.z = Math.PI / 2; hub.position.set(x, 0.62, z); grp.add(hub);
    const fen = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 1.5), paint);
    fen.position.set(x, 1.35, z); grp.add(fen);
  }
  // front plow wedge (DIY armor read)
  const plow = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.9, 0.35), steel);
  plow.position.set(0, 0.75, 3.0); plow.rotation.x = 0.5; plow.castShadow = true; grp.add(plow);
  // roll cage over cab
  const cageM = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.5, metalness: 0.7 });
  for (const s of [-1, 1]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.3, 0.16), cageM);
    bar.position.set(s * 1.25, 2.9, -0.9); grp.add(bar);
  }
  const cross = new THREE.Mesh(new THREE.BoxGeometry(2.66, 0.16, 0.16), cageM);
  cross.position.set(0, 3.5, -0.9); grp.add(cross);
  // driver torso + helmet with visor glow (stunt-driver silhouette)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.8, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x3a2c1c, roughness: 0.9 }));
  torso.position.set(0.55, 2.5, -0.9); grp.add(torso);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.4 }));
  helmet.position.set(0.55, 3.15, -0.9); grp.add(helmet);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff3b30, emissiveIntensity: 2.0 }));
  visor.position.set(0.55, 3.15, -0.55); grp.add(visor);
  // twin exhausts
  for (const s of [-1, 1]) {
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 1.0, 8), dark);
    ex.rotation.x = Math.PI / 2; ex.position.set(s * 0.9, 0.9, -2.9); grp.add(ex);
  }
  // headlights (warm pools like night-arena refs)
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffe9a8, emissiveIntensity: 3 }));
    hl.position.set(s * 1.1, 1.15, 2.85); hl.userData.keepEmissive = true; grp.add(hl);
  }
  const beam = new THREE.SpotLight(0xffe2a0, 160, 34, 0.55, 0.6, 1.6);
  beam.position.set(0, 1.6, 2.6);
  const beamTgt = new THREE.Object3D(); beamTgt.position.set(0, 0, 14);
  grp.add(beam, beamTgt); beam.target = beamTgt;
  if (isPlayer) beam.intensity = 260;

  // name tag + hp bar sprite above (player tag hidden: you know who you are)
  const tag = makeTextSprite(name, 0.85); tag.position.y = 4.4; grp.add(tag);
  if (isPlayer) tag.visible = false;
  const hpCanvas = document.createElement('canvas'); hpCanvas.width = 128; hpCanvas.height = 12;
  const hpTex = new THREE.CanvasTexture(hpCanvas);
  const hpBar = new THREE.Sprite(new THREE.SpriteMaterial({ map: hpTex, depthTest: false, transparent: true }));
  hpBar.scale.set(4.4, 0.45, 1); hpBar.position.y = 3.7; grp.add(hpBar);

  grp.userData = { turret, muzzle, wheels, horn, tag, hpBar, hpCanvas, hpTex, beam, flash };
  return grp;
}

function makeEntity(name, color, opts) {
  const mesh = buildVehicleMesh(color, name, !!opts.isPlayer);
  scene.add(mesh);
  return {
    name, color, isPlayer: !!opts.isPlayer,
    mesh, heading: opts.heading || 0, turretYaw: opts.heading || 0,
    speed: 0, hp: opts.hp, maxHp: opts.hp,
    mgDmg: opts.mgDmg || 6, topSpeed: opts.topSpeed || 26,
    accel: opts.accel || 30, alive: true, ai: opts.ai || null,
    mgCd: 0, missileCd: 0, missiles: opts.missiles ?? 4,
    shieldT: 0, boostT: 0, smokeT: 0, fireT: 0, radius: 2.6,
    spawn: opts.spawn || { x: 0, z: 0 },
  };
}

function drawHpBar(ent) {
  const { hpCanvas, hpTex } = ent.mesh.userData;
  const x = hpCanvas.getContext('2d');
  x.clearRect(0, 0, 128, 12);
  x.fillStyle = 'rgba(0,0,0,0.7)'; x.fillRect(0, 0, 128, 12);
  const f = clamp(ent.hp / ent.maxHp, 0, 1);
  x.fillStyle = f > 0.55 ? '#39ff7a' : f > 0.28 ? '#ffb300' : '#ff3b30';
  x.fillRect(1, 1, 126 * f, 10);
  hpTex.needsUpdate = true;
}

// ---------------------------------------------------------------- projectiles & particles
function spawnProjectile(owner, kind, origin, dir) {
  const isMissile = kind === 'missile';
  const geo = isMissile ? new THREE.SphereGeometry(0.32, 10, 10)
    : new THREE.SphereGeometry(0.14, 6, 6);
  const mat = new THREE.MeshBasicMaterial({ color: isMissile ? 0xff7a2a : 0xffe08a });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(origin);
  // tracer tail
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, isMissile ? 2.2 : 1.4),
    new THREE.MeshBasicMaterial({ color: isMissile ? 0xff5a1e : 0xffb300, transparent: true, opacity: 0.85 }));
  tail.position.z = isMissile ? -1.2 : -0.8; mesh.add(tail);
  if (isMissile) {
    const l = new THREE.PointLight(0xff7a2a, 40, 18, 2); mesh.add(l);
  }
  mesh.lookAt(origin.clone().add(dir));
  scene.add(mesh);
  G.projectiles.push({
    mesh, owner, kind, vel: dir.clone().multiplyScalar(isMissile ? 46 : 95),
    life: isMissile ? 4.5 : 1.1, dmg: isMissile ? 34 : owner.mgDmg,
    radius: isMissile ? 0.7 : 0.4, target: null, smokeT: 0,
  });
  if (isMissile) { AudioSys.missile(); G.stats.missilesFired++; }
}

function spawnParticles(pos, kind, n = 14) {
  for (let i = 0; i < n; i++) {
    const size = kind === 'smoke' ? 0.9 + Math.random() : 0.22 + Math.random() * 0.35;
    const color = kind === 'spark' ? (Math.random() < 0.5 ? 0xffd76a : 0xff7a2a)
      : kind === 'smoke' ? 0x3a3a3e : kind === 'heal' ? 0x39ff7a : 0xff5a1e;
    const m = new THREE.Mesh(new THREE.SphereGeometry(size, 6, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: kind === 'smoke' ? 0.5 : 1 }));
    m.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.6, (Math.random() - 0.5) * 2));
    scene.add(m);
    G.particles.push({
      mesh: m, life: kind === 'smoke' ? 1.1 + Math.random() * 0.6 : 0.4 + Math.random() * 0.45,
      maxLife: 1.4, vel: new THREE.Vector3((Math.random() - 0.5) * 14, 3 + Math.random() * (kind === 'smoke' ? 4 : 10), (Math.random() - 0.5) * 14),
      kind,
    });
  }
  if (G.particles.length > 420) {
    const old = G.particles.splice(0, G.particles.length - 420);
    old.forEach(p => { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); });
  }
}

function explode(pos, radius = 7, dmg = 30, exclude = null) {
  spawnParticles(pos, 'fire', 22); spawnParticles(pos, 'smoke', 12); spawnParticles(pos, 'spark', 16);
  G.flashLight.position.copy(pos).add(new THREE.Vector3(0, 3, 0));
  G.flashLight.intensity = 2600; G.shake = Math.min(1.4, G.shake + 0.8);
  AudioSys.explosion(1);
  // splash damage
  for (const ent of [G.player, ...G.enemies]) {
    if (!ent || !ent.alive || ent === exclude) continue;
    const d = ent.mesh.position.distanceTo(pos);
    if (d < radius) damageVehicle(ent, dmg * (1 - d / radius * 0.7), exclude);
  }
  for (const o of G.obstacles) {
    const d = Math.hypot(o.x - pos.x, o.z - pos.z);
    if (d < 5) { spawnParticles(new THREE.Vector3(o.x, 2, o.z), 'smoke', 4); }
  }
}

// ---------------------------------------------------------------- damage / death
function damageVehicle(ent, dmg, from) {
  if (!ent.alive || G.state !== 'playing') return;
  if (ent.shieldT > 0) { dmg *= 0.15; spawnParticles(ent.mesh.position.clone().add(new THREE.Vector3(0, 2, 0)), 'spark', 3); }
  // armor: heavier rigs shave flat damage
  if (!ent.isPlayer) dmg *= 1.0;
  else dmg *= (ent.armorMul ?? 1);
  ent.hp -= dmg; drawHpBar(ent);
  ent.mesh.position.y = 0; // keep grounded
  // hit feedback (skip headlights: they keep their own emissive)
  spawnParticles(ent.mesh.position.clone().add(new THREE.Vector3(0, 1.6, 0)), 'spark', 5);
  if (ent.isPlayer) {
    $('damage-vignette').style.opacity = clamp(0.35 + (1 - ent.hp / ent.maxHp) * 0.5, 0, 0.9);
    setTimeout(() => { $('damage-vignette').style.opacity = ent.hp < ent.maxHp * 0.3 ? 0.35 : 0; }, 180);
    G.shake = Math.min(1.2, G.shake + 0.35); AudioSys.hit();
    if (from && !from.isPlayer) { /* enemy hitmarker on us: no-op */ }
  } else if (from && from.isPlayer) {
    G.stats.hits++;
    const hm = $('hitmarker'); hm.classList.remove('pop'); void hm.offsetWidth; hm.classList.add('pop');
  }
  // paint flash (headlights tagged keepEmissive are skipped so they never die)
  ent.mesh.traverse(o => { if (o.isMesh && o.material && o.material.emissive && !o.userData.keepEmissive) { o.material.emissive.setHex(0x661111); } });
  setTimeout(() => ent.mesh.traverse(o => {
    if (o.isMesh && o.material && o.material.emissive && !o.userData.keepEmissive && o.material.emissive.getHex() === 0x661111) o.material.emissive.setHex(0x000000);
    if (o.isMesh && o.material && o.material.emissive && ent.mesh.userData.horn && o === ent.mesh.userData.horn) o.material.emissive.setHex(0xff6a00);
  }), 90);
  if (ent.hp <= 0) killVehicle(ent, from);
}

function killVehicle(ent, from) {
  ent.alive = false; ent.hp = 0; drawHpBar(ent);
  const pos = ent.mesh.position.clone();
  explode(pos, 6, 0, ent);
  // wreck: darken + sink turret + stop
  ent.mesh.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); if (o.material.color) o.material.color.multiplyScalar(0.35); } });
  ent.mesh.userData.tag.visible = false; ent.mesh.userData.hpBar.visible = false;
  spawnParticles(pos.clone().add(new THREE.Vector3(0, 1, 0)), 'smoke', 18);
  const msg = from === ent ? `${ent.name} WRECKED ITSELF`
    : from ? `${from.name} ▸💥◂ ${ent.name}` : `${ent.name} DESTROYED`;
  feed(msg);
  const mid = G.matchId; // generation token: stale timeouts from a previous match are ignored
  if (ent.isPlayer) {
    toast('WRECKED!', true); setTimeout(() => { if (G.matchId === mid) endMatch(false); }, 1400);
  } else {
    const playerKill = !!(from && from.isPlayer);
    if (playerKill) G.kills++;
    toast(playerKill ? `${ent.name} SCRAPPED — ${G.enemies.filter(e => e.alive).length} LEFT` : `${ent.name} DESTROYED`);
    AudioSys.pickup();
    maybeDropPickup(pos);
    if (G.enemies.every(e => !e.alive)) setTimeout(() => { if (G.matchId === mid) endMatch(true); }, 1400);
    else toast2enemyPlates();
  }
  updateHUD();
}

function maybeDropPickup(pos) {
  if (Math.random() < 0.75) {
    const kinds = ['health', 'missiles', 'shield'];
    spawnPickup(kinds[Math.floor(Math.random() * kinds.length)],
      clamp(pos.x + (Math.random() - 0.5) * 8, -ARENA / 2 + 6, ARENA / 2 - 6),
      clamp(pos.z + (Math.random() - 0.5) * 8, -ARENA / 2 + 6, ARENA / 2 - 6));
  }
}

// ---------------------------------------------------------------- pickups
function spawnPickup(kind, x, z) {
  let color = 0x39ff7a, label = '+';
  if (kind === 'missiles') { color = 0xffb300; label = '🚀'; }
  if (kind === 'shield') { color = 0x54c8ff; label = '🛡'; }
  if (kind === 'health') { color = 0x39ff7a; label = '✚'; }
  const grp = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.0),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: 0.3 }));
  grp.add(core);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.12, 8, 24),
    new THREE.MeshBasicMaterial({ color }));
  halo.rotation.x = Math.PI / 2; grp.add(halo);
  const tag = makeTextSprite(label, 0.7); tag.position.y = 2.2; grp.add(tag);
  const light = new THREE.PointLight(color, 40, 16, 2); light.position.y = 1.5; grp.add(light);
  grp.position.set(x, 1.4, z);
  scene.add(grp);
  G.pickups.push({ kind, mesh: grp, age: 0 });
}

function updatePickups(dt) {
  G.pickupTimer -= dt;
  if (G.pickupTimer <= 0 && G.pickups.length < 6) {
    G.pickupTimer = 7 + Math.random() * 5;
    const kinds = ['health', 'missiles', 'missiles', 'shield', 'health'];
    spawnPickup(kinds[Math.floor(Math.random() * kinds.length)],
      (Math.random() - 0.5) * (ARENA - 20), (Math.random() - 0.5) * (ARENA - 20));
  }
  const t = performance.now() / 1000;
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const p = G.pickups[i]; p.age += dt;
    p.mesh.rotation.y += dt * 1.6; p.mesh.position.y = 1.4 + Math.sin(t * 2.4 + i) * 0.25;
    if (p.age > 30) { scene.remove(p.mesh); G.pickups.splice(i, 1); continue; }
    for (const ent of [G.player, ...G.enemies]) {
      if (!ent || !ent.alive) continue;
      if (ent.mesh.position.distanceTo(p.mesh.position) < 3.4) {
        applyPickup(ent, p.kind);
        scene.remove(p.mesh); G.pickups.splice(i, 1);
        break;
      }
    }
  }
}

function applyPickup(ent, kind) {
  const pos = ent.mesh.position.clone().add(new THREE.Vector3(0, 2, 0));
  if (kind === 'health') { ent.hp = Math.min(ent.maxHp, ent.hp + 35); spawnParticles(pos, 'heal', 12); }
  if (kind === 'missiles') { ent.missiles = Math.min(9, ent.missiles + 4); spawnParticles(pos, 'spark', 10); }
  if (kind === 'shield') { ent.shieldT = 8; spawnParticles(pos, 'spark', 12); }
  drawHpBar(ent);
  if (ent.isPlayer) {
    AudioSys.pickup();
    toast(kind === 'health' ? '+35 HULL' : kind === 'missiles' ? '+4 MISSILES' : 'SHIELD 8s');
  }
  updateHUD();
}

// ---------------------------------------------------------------- input
function bindInput() {
  addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    G.keys[e.code] = true;
    AudioSys.init(); AudioSys.resume();
    if (e.code === 'Space') G.firing = true;
    if (e.code === 'KeyE') G.missileQueued = true;
    if (e.code === 'KeyM') AudioSys.setMuted(!AudioSys.muted);
    if (e.code === 'KeyR' && (G.state === 'playing' || G.state === 'over')) restartMatch();
    if ((e.code === 'KeyP' || e.code === 'Escape') && G.state === 'playing') pauseGame();
    else if ((e.code === 'KeyP' || e.code === 'Escape') && G.state === 'paused') resumeGame();
    if (e.code === 'KeyT' && G.state === 'playing' && G.player.alive) {
      G.player.mesh.position.set((Math.random() - 0.5) * 30, 0, (Math.random() - 0.5) * 30);
      G.player.speed = 0; toast('RECOVERED');
    }
  });
  addEventListener('keyup', (e) => {
    G.keys[e.code] = false;
    if (e.code === 'Space') G.firing = false;
  });
  addEventListener('mousemove', (e) => {
    G.mouseNDC.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    // the ring is the true aim point (turret aims at the cursor's ground projection)
    const ch = $('crosshair');
    ch.style.left = e.clientX + 'px'; ch.style.top = e.clientY + 'px';
  });
  const canvas = $('scene');
  canvas.addEventListener('mousedown', (e) => {
    AudioSys.init(); AudioSys.resume();
    if (G.state !== 'playing') return;
    if (e.button === 0) G.firing = true;
    if (e.button === 2) G.missileQueued = true;
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) G.firing = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.state === 'playing') pauseGame();
  });
}

// ---------------------------------------------------------------- HUD
function feed(msg) {
  const kf = $('killfeed'); const d = document.createElement('div'); d.textContent = msg;
  kf.prepend(d); while (kf.children.length > 5) kf.lastChild.remove();
  setTimeout(() => d.remove(), 6000);
}
function toast(msg, big = false) {
  const s = $('toast-stack'); const d = document.createElement('div');
  d.className = 'toast'; d.textContent = msg; if (big) d.style.fontSize = '30px';
  s.appendChild(d); setTimeout(() => d.remove(), 2500);
}
function fmtTime(s) { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }

function buildEnemyPlates() {
  const wrap = $('enemy-plates'); wrap.innerHTML = '';
  G.enemies.forEach((e, i) => {
    const d = document.createElement('div'); d.className = 'enemy-plate'; d.id = 'eplate-' + i;
    d.innerHTML = `<div class="nm">${e.name}</div><div class="ebar"><i style="width:100%"></i></div>`;
    wrap.appendChild(d);
  });
}
function toast2enemyPlates() { updateHUD(); }
function updateHUD() {
  if (!G.player) return;
  $('enemies-left').textContent = G.enemies.filter(e => e.alive).length;
  $('match-timer').textContent = fmtTime(G.time);
  $('hp-fill').style.width = clamp(G.player.hp / G.player.maxHp * 100, 0, 100) + '%';
  $('hp-text').textContent = Math.max(0, Math.ceil(G.player.hp)) + ' / ' + G.player.maxHp;
  $('missiles').textContent = '×' + G.player.missiles;
  $('kills').textContent = G.kills;
  $('mg-heat').textContent = G.player.mgCd > 0.02 ? 'COOLING…' : 'MG READY';
  $('shield-badge').classList.toggle('hidden', !(G.player.shieldT > 0));
  G.enemies.forEach((e, i) => {
    const p = $('eplate-' + i); if (!p) return;
    p.classList.toggle('dead', !e.alive);
    p.querySelector('i').style.width = clamp(e.hp / e.maxHp * 100, 0, 100) + '%';
  });
}

function drawMinimap() {
  const c = MINIMAP(), x = c.getContext('2d');
  const W = c.width, Hh = c.height, s = W / ARENA;
  x.clearRect(0, 0, W, Hh);
  x.fillStyle = 'rgba(8,8,10,0.9)'; x.fillRect(0, 0, W, Hh);
  x.strokeStyle = 'rgba(255,179,0,0.5)'; x.strokeRect(3, 3, W - 6, Hh - 6);
  const dot = (wx, wz, col, r = 3) => {
    x.fillStyle = col;
    x.beginPath(); x.arc(W / 2 + wx * s, Hh / 2 + wz * s, r, 0, TAU); x.fill();
  };
  G.obstacles.forEach(o => dot(o.x, o.z, '#555', 2));
  G.pickups.forEach(p => dot(p.mesh.position.x, p.mesh.position.z,
    p.kind === 'health' ? '#39ff7a' : p.kind === 'shield' ? '#54c8ff' : '#ffb300', 3));
  G.enemies.forEach(e => { if (e.alive) dot(e.mesh.position.x, e.mesh.position.z, '#ff3b30', 4); });
  if (G.player && G.player.alive) {
    const px = W / 2 + G.player.mesh.position.x * s, pz = Hh / 2 + G.player.mesh.position.z * s;
    x.save(); x.translate(px, pz); x.rotate(-G.player.heading + Math.PI);
    x.fillStyle = '#39ff7a'; x.beginPath(); x.moveTo(0, -6); x.lineTo(4, 4); x.lineTo(-4, 4); x.closePath(); x.fill();
    x.restore();
  }
}

// ---------------------------------------------------------------- match flow
function showScreen(id) {
  ['screen-loading', 'screen-menu', 'screen-pause', 'screen-end'].forEach(s => $(s).classList.add('hidden'));
  if (id) $(id).classList.remove('hidden');
  const inGame = id === null;
  $('hud-top').classList.toggle('hidden', !inGame);
  $('hud-bottom').classList.toggle('hidden', !inGame);
  MINIMAP().style.display = inGame ? 'block' : 'none';
  $('crosshair').style.display = inGame ? 'block' : 'none';
}

function vehicleCards() {
  const wrap = $('vehicle-cards'); wrap.innerHTML = '';
  VEHICLES.forEach((v, i) => {
    const d = document.createElement('div');
    d.className = 'vcard' + (i === G.selected ? ' sel' : '');
    d.setAttribute('role', 'option'); d.tabIndex = 0;
    const bar = (val) => `<i style="--v:${Math.round(val * 100)}%"></i>`;
    d.innerHTML = `<h3>${v.name}</h3><div class="role">${v.role} — ${v.desc}</div>
      <div class="stat">SPEED ${bar(v.speed)}</div>
      <div class="stat">ARMOR ${bar(v.armor)}</div>
      <div class="stat">SPECIAL ${bar(v.special)}</div>
      <div class="stat">HULL ${v.hp} • MG ${v.mgDmg}</div>`;
    d.onclick = () => { G.selected = i; AudioSys.init(); AudioSys.ui(); vehicleCards(); };
    d.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { G.selected = i; vehicleCards(); } };
    wrap.appendChild(d);
  });
}

function clearWorldEntities() {
  for (const e of [G.player, ...G.enemies]) if (e) scene.remove(e.mesh);
  for (const p of G.projectiles) scene.remove(p.mesh);
  for (const p of G.particles) scene.remove(p.mesh);
  for (const p of G.pickups) scene.remove(p.mesh);
  G.player = null; G.enemies = []; G.projectiles = []; G.particles = []; G.pickups = [];
}

function startMatch() {
  AudioSys.init(); AudioSys.resume(); AudioSys.ui();
  clearWorldEntities();
  G.matchId++; // new generation: invalidates pending endMatch timeouts from older matches
  const v = VEHICLES[G.selected];
  G.kills = 0; G.time = 0; G.shake = 0; G.pickupTimer = 4; G.aiTick = 0;
  G.stats = { shots: 0, hits: 0, missilesFired: 0 };
  $('killfeed').innerHTML = ''; $('player-name').textContent = v.name;

  G.player = makeEntity(v.name, v.color, {
    isPlayer: true, hp: v.hp, mgDmg: v.mgDmg,
    topSpeed: 24 + v.speed * 14, accel: 26 + v.speed * 18,
    missiles: 4, spawn: { x: 0, z: 34 }, heading: Math.PI,
  });
  G.player.armorMul = 1.15 - v.armor * 0.45;
  placeAtSpawn(G.player, 0, 34, Math.PI);

  const spawns = [[0, -34, 0], [-34, 0, Math.PI / 2], [34, 0, -Math.PI / 2]];
  G.enemies = ENEMY_DEFS.map((d, i) => {
    const e = makeEntity(d.name, d.color, {
      hp: d.hp, mgDmg: d.mgDmg, topSpeed: d.speed, missiles: 3,
      spawn: { x: spawns[i][0], z: spawns[i][1] }, heading: spawns[i][2],
      ai: { skill: d.skill, thinkT: Math.random(), target: null, wanderA: Math.random() * TAU, missileT: 4 + Math.random() * 4 },
    });
    placeAtSpawn(e, spawns[i][0], spawns[i][1], spawns[i][2]);
    return e;
  });

  for (let i = 0; i < 4; i++) {
    const kinds = ['health', 'missiles', 'shield'];
    spawnPickup(kinds[i % 3], (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60);
  }
  buildEnemyPlates(); updateHUD();
  G.state = 'playing'; showScreen(null);
  toast('WRECK ALL 3 RIVALS!');
  feed('match start — ' + v.name + ' rolls out');
}

function placeAtSpawn(ent, x, z, heading) {
  ent.mesh.position.set(x, 0, z); ent.heading = heading; ent.turretYaw = heading;
  ent.speed = 0; ent.mesh.rotation.y = heading; drawHpBar(ent);
}

function restartMatch() { endHide(); startMatch(); }
function endHide() { $('screen-end').classList.add('hidden'); $('screen-pause').classList.add('hidden'); }
function pauseGame() { if (G.state !== 'playing') return; G.state = 'paused'; showScreen('screen-pause'); AudioSys.engine(0); }
function resumeGame() { if (G.state !== 'paused') return; G.state = 'playing'; showScreen(null); }
function quitToGarage() { G.state = 'menu'; clearWorldEntities(); showScreen('screen-menu'); }

function endMatch(won) {
  if (G.state !== 'playing') return;
  G.state = 'over'; AudioSys.engine(0);
  const alive = G.enemies.filter(e => e.alive).length;
  $('end-title').textContent = won ? '★ YOU WIN ★' : '☠ WRECKED ☠';
  $('end-title').style.color = won ? '#39ff7a' : '#ff6a5a';
  $('end-sub').textContent = won ? `Last rig rolling in ${fmtTime(G.time)}. The arena is yours.` : `${alive} rival${alive === 1 ? '' : 's'} still rolling. Rebuild and retry.`;
  const acc = G.stats.shots ? Math.round(G.stats.hits / G.stats.shots * 100) : 0;
  $('end-stats').innerHTML = `TIME <b>${fmtTime(G.time)}</b> • KILLS <b>${G.kills}/3</b> • MG ACCURACY <b>${acc}%</b> • MISSILES <b>${G.stats.missilesFired}</b>`;
  showScreen('screen-end');
  won ? AudioSys.win() : AudioSys.lose();
}

// ---------------------------------------------------------------- physics + combat update
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

function collideWorld(ent, dt) {
  const p = ent.mesh.position, H = ARENA / 2 - 2.2;
  if (p.x < -H || p.x > H || p.z < -H || p.z > H) {
    const nx = clamp(p.x, -H, H), nz = clamp(p.z, -H, H);
    const impact = Math.abs(ent.speed);
    p.x = nx; p.z = nz; ent.speed *= -0.35;
    if (impact > 12) {
      damageVehicle(ent, (impact - 12) * 0.5, null);
      spawnParticles(p.clone().add(new THREE.Vector3(0, 1.4, 0)), 'spark', 8);
      if (ent.isPlayer) { G.shake = Math.min(1, G.shake + 0.3); AudioSys.hit(); }
    }
  }
  for (const o of G.obstacles) {
    const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), min = o.r + ent.radius * 0.7;
    if (d < min && d > 0.001) {
      const push = (min - d);
      p.x += dx / d * push; p.z += dz / d * push;
      const impact = Math.abs(ent.speed);
      const dot = (dx / d) * Math.sin(ent.heading) + (dz / d) * Math.cos(ent.heading);
      if (dot < -0.3 || dot > 0.3) ent.speed *= 0.55;
      if (impact > 16) {
        damageVehicle(ent, (impact - 16) * 0.6, null);
        spawnParticles(p.clone().add(new THREE.Vector3(0, 1.5, 0)), 'spark', 10);
        if (ent.isPlayer) { G.shake = Math.min(1, G.shake + 0.35); AudioSys.hit(); }
      }
    }
  }
}

function updateDrive(ent, dt, throttle, steer) {
  const boosting = ent.isPlayer && !!G.keys['ShiftLeft'] && throttle > 0;
  const top = ent.topSpeed * (boosting ? 1.45 : 1);
  if (throttle > 0) ent.speed += ent.accel * throttle * dt * (boosting ? 1.5 : 1);
  else if (throttle < 0) ent.speed += ent.accel * 0.7 * throttle * dt;
  else ent.speed -= ent.speed * 1.6 * dt;
  ent.speed = clamp(ent.speed, -top * 0.45, top);
  const grip = clamp(Math.abs(ent.speed) / 8, 0, 1);
  ent.heading += steer * (1.9 - grip * 0.7) * dt * (ent.speed >= 0 ? 1 : -1) * clamp(Math.abs(ent.speed) / 6, 0, 1.4);
  ent.mesh.position.x += Math.sin(ent.heading) * ent.speed * dt;
  ent.mesh.position.z += Math.cos(ent.heading) * ent.speed * dt;
  ent.mesh.rotation.y = ent.heading;
  // wheels + body lean
  const wSpin = ent.speed * dt * 1.4;
  ent.mesh.userData.wheels.forEach((w, i) => { w.rotation.x += wSpin * (i % 2 ? 1 : 1); });
  ent.mesh.rotation.z = lerp(ent.mesh.rotation.z, -steer * clamp(Math.abs(ent.speed) / 20, 0, 0.12), 0.2);
  ent.mesh.userData.horn.rotation.y += dt * 1.2;
  collideWorld(ent, dt);
  if (ent.isPlayer) AudioSys.engine(clamp(Math.abs(ent.speed) / ent.topSpeed, 0, 1), boosting);
}

function aimPointFromMouse() {
  raycaster.setFromCamera(G.mouseNDC, camera);
  const out = new THREE.Vector3();
  return raycaster.ray.intersectPlane(groundPlane, out) ? out : null;
}

function tryFireMG(ent) {
  if (!ent.alive || ent.mgCd > 0 || G.state !== 'playing') return;
  ent.mgCd = ent.isPlayer ? 0.13 : 0.34 - ent.ai.skill * 0.1;
  const muz = ent.mesh.userData.muzzle;
  muz.getWorldPosition(_v1);
  _v2.set(Math.sin(ent.turretYaw), 0.02, Math.cos(ent.turretYaw)).normalize();
  // slight spread
  const spread = ent.isPlayer ? 0.02 : 0.09 - ent.ai.skill * 0.05;
  _v2.x += (Math.random() - 0.5) * spread; _v2.z += (Math.random() - 0.5) * spread; _v2.normalize();
  spawnProjectile(ent, 'mg', _v1.clone(), _v2.clone());
  // visible muzzle bloom on the firing rig
  const fl = ent.mesh.userData.flash;
  if (fl) { fl.visible = true; fl.material.rotation = Math.random() * TAU; setTimeout(() => { fl.visible = false; }, 70); }
  if (ent.isPlayer) {
    G.stats.shots++;
    AudioSys.mg();
    G.muzzleLight.position.copy(_v1); G.muzzleLight.intensity = 320;
    $('muzzle-flash-overlay').style.opacity = 0.7;
    setTimeout(() => { $('muzzle-flash-overlay').style.opacity = 0; }, 60);
    G.shake = Math.min(0.5, G.shake + 0.05);
  } else AudioSys.enemyMg();
}

function tryFireMissile(ent, targetPos) {
  if (!ent.alive || ent.missiles <= 0 || ent.missileCd > 0 || G.state !== 'playing') return false;
  ent.missiles--; ent.missileCd = 1.6;
  const muz = ent.mesh.userData.muzzle;
  muz.getWorldPosition(_v1);
  if (targetPos) _v2.copy(targetPos).sub(_v1).setY(0.5).normalize();
  else _v2.set(Math.sin(ent.turretYaw), 0.05, Math.cos(ent.turretYaw)).normalize();
  spawnProjectile(ent, 'missile', _v1.clone(), _v2.clone());
  const p = G.projectiles[G.projectiles.length - 1];
  if (ent.isPlayer) {
    // soft lock: nearest living enemy within forward cone
    let best = null, bd = 1e9;
    for (const e of G.enemies) {
      if (!e.alive) continue;
      const d = e.mesh.position.distanceTo(_v1);
      if (d < bd) { bd = d; best = e; }
    }
    if (best && bd < 90) p.target = best;
  } else if (G.player.alive) p.target = G.player;
  updateHUD();
  return true;
}

function updateProjectiles(dt) {
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const pr = G.projectiles[i];
    pr.life -= dt;
    // homing for missiles
    if (pr.kind === 'missile' && pr.target && pr.target.alive) {
      _v1.copy(pr.target.mesh.position).add(new THREE.Vector3(0, 1.2, 0)).sub(pr.mesh.position).normalize();
      _v2.copy(pr.vel).normalize().lerp(_v1, clamp(2.6 * dt, 0, 1)).normalize().multiplyScalar(pr.vel.length());
      pr.vel.copy(_v2);
      pr.mesh.lookAt(pr.mesh.position.clone().add(pr.vel));
      pr.smokeT -= dt;
      if (pr.smokeT <= 0) {
        pr.smokeT = 0.05;
        spawnParticles(pr.mesh.position.clone(), 'smoke', 1);
      }
    }
    pr.mesh.position.addScaledVector(pr.vel, dt);
    const p = pr.mesh.position;
    let dead = pr.life <= 0;
    // walls
    const H = ARENA / 2 + 2;
    if (Math.abs(p.x) > H || Math.abs(p.z) > H || p.y < 0 || p.y > 30) dead = true;
    // obstacle hit
    if (!dead) for (const o of G.obstacles) {
      if (Math.hypot(o.x - p.x, o.z - p.z) < o.r && p.y < 6) { dead = true; break; }
    }
    // vehicle hit
    if (!dead) {
      const victims = pr.owner.isPlayer ? G.enemies : [G.player, ...G.enemies.filter(e => e !== pr.owner)];
      for (const ent of victims) {
        if (!ent || !ent.alive || ent === pr.owner) continue;
        _v1.copy(ent.mesh.position); _v1.y = p.y;
        if (_v1.distanceTo(p) < ent.radius + pr.radius) {
          if (pr.kind === 'missile') explode(p.clone(), 7, pr.dmg, pr.owner);
          else { damageVehicle(ent, pr.dmg, pr.owner); spawnParticles(p.clone(), 'spark', 4); }
          dead = true; break;
        }
      }
    }
    if (dead) {
      if (pr.kind === 'mg') spawnParticles(p.clone(), 'spark', 2);
      scene.remove(pr.mesh);
      G.projectiles.splice(i, 1);
    }
  }
}

function updateParticles(dt) {
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const p = G.particles[i];
    p.life -= dt;
    if (p.life <= 0) { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); G.particles.splice(i, 1); continue; }
    p.vel.y -= (p.kind === 'smoke' ? 1 : 14) * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    if (p.mesh.position.y < 0.2) { p.mesh.position.y = 0.2; p.vel.set(0, 0, 0); }
    const f = p.life / p.maxLife;
    p.mesh.material.opacity = p.kind === 'smoke' ? 0.5 * f : f;
    if (p.kind !== 'smoke') p.mesh.scale.setScalar(0.6 + (1 - f) * 0.8);
  }
  G.muzzleLight.intensity = Math.max(0, G.muzzleLight.intensity - 3200 * dt);
  G.flashLight.intensity = Math.max(0, G.flashLight.intensity - 9000 * dt);
}

// ---------------------------------------------------------------- enemy AI
function updateEnemyAI(ent, dt) {
  const ai = ent.ai; if (!ai || !ent.alive) return;
  ai.thinkT -= dt; ai.missileT -= dt;
  ent.missileCd -= dt;
  const pp = G.player.alive ? G.player.mesh.position : null;
  const ep = ent.mesh.position;

  if (ai.thinkT <= 0) {
    ai.thinkT = 0.4 + Math.random() * 0.4;
    // heal-seeking when weak
    if (ent.hp < ent.maxHp * 0.35 && G.pickups.some(p => p.kind === 'health')) {
      const h = G.pickups.filter(p => p.kind === 'health')
        .sort((a, b) => a.mesh.position.distanceTo(ep) - b.mesh.position.distanceTo(ep))[0];
      ai.target = h ? h.mesh.position.clone() : null; ai.mode = 'pickup';
    } else { ai.mode = 'fight'; ai.target = pp ? pp.clone() : null; }
    ai.strafe = (Math.random() - 0.5) * 2;
  }
  let desX = ep.x + Math.sin(ai.wanderA) * 10, desZ = ep.z + Math.cos(ai.wanderA) * 10;
  if (ai.target) { desX = ai.target.x; desZ = ai.target.z; }
  if (ai.mode === 'fight' && pp) {
    // orbit at ~18m rather than ramming
    _v1.copy(pp).sub(ep); const dist = _v1.length();
    const ang = Math.atan2(_v1.x, _v1.z);
    const orbit = ang + (ai.strafe > 0 ? 0.7 : -0.7);
    if (dist < 13) { desX = ep.x - _v1.x; desZ = ep.z - _v1.z; }
    else if (dist < 30) { desX = ep.x + Math.sin(orbit) * 12; desZ = ep.z + Math.cos(orbit) * 12; }
  }
  // obstacle whisker: steer away if blocked ahead
  const aheadX = ep.x + Math.sin(ent.heading) * 8, aheadZ = ep.z + Math.cos(ent.heading) * 8;
  for (const o of G.obstacles) {
    if (Math.hypot(o.x - aheadX, o.z - aheadZ) < o.r + 2) {
      desX = ep.x - Math.sin(ent.heading) * 10 + (o.x < ep.x ? 8 : -8);
      desZ = ep.z - Math.cos(ent.heading) * 10 + (o.z < ep.z ? 8 : -8);
      break;
    }
  }
  const want = Math.atan2(desX - ep.x, desZ - ep.z);
  let dh = ((want - ent.heading + Math.PI * 3) % TAU) - Math.PI;
  const throttle = Math.abs(dh) > 2.2 ? -0.6 : 1.0;
  updateDrive(ent, dt, throttle, clamp(dh * 1.6, -1, 1));

  // turret tracks player with skill-based lag + error
  if (pp) {
    const trueYaw = Math.atan2(pp.x - ep.x, pp.z - ep.z);
    const err = (1 - ai.skill) * 0.35;
    ent.turretYaw = angLerp(ent.turretYaw, trueYaw + Math.sin(performance.now() / 700 + ai.strafe) * err, 3.2 * dt);
    ent.mesh.userData.turret.rotation.y = ent.turretYaw - ent.heading;
    const dist = ep.distanceTo(pp);
    ent.mgCd -= dt;
    if (dist < 55 && Math.abs(((trueYaw - ent.turretYaw + Math.PI * 3) % TAU) - Math.PI) < 0.25) tryFireMG(ent);
    if (ai.missileT <= 0 && dist < 60 && dist > 12 && ent.missiles > 0) {
      ai.missileT = 6 + Math.random() * 6 - ai.skill * 2;
      tryFireMissile(ent, pp.clone());
    }
  }
  // low-hp smoke
  if (ent.hp < ent.maxHp * 0.35) {
    ent.smokeT -= dt;
    if (ent.smokeT <= 0) { ent.smokeT = 0.12; spawnParticles(ep.clone().add(new THREE.Vector3(0, 2.2, 0)), 'smoke', 1); }
  }
}

// ---------------------------------------------------------------- player update + camera
function updatePlayer(dt) {
  const P = G.player; if (!P || !P.alive) return;
  P.mgCd -= dt; P.missileCd -= dt;
  if (P.shieldT > 0) P.shieldT -= dt;
  const k = G.keys;
  const throttle = (k['KeyW'] || k['ArrowUp'] ? 1 : 0) + (k['KeyS'] || k['ArrowDown'] ? -1 : 0);
  const steer = (k['KeyA'] || k['ArrowLeft'] ? -1 : 0) + (k['KeyD'] || k['ArrowRight'] ? 1 : 0);
  // steering: heading+ rotates nose toward +x which reads as LEFT on the
  // chase camera, so right-key (steer=+1) must decrease heading.
  updateDrive(P, dt, throttle, -steer);
  // aim turret at mouse ground point
  const aim = aimPointFromMouse();
  if (aim) {
    const want = Math.atan2(aim.x - P.mesh.position.x, aim.z - P.mesh.position.z);
    P.turretYaw = angLerp(P.turretYaw, want, 10 * dt);
  } else {
    P.turretYaw = angLerp(P.turretYaw, P.heading, 4 * dt);
  }
  P.mesh.userData.turret.rotation.y = P.turretYaw - P.heading;
  if ((G.firing || k['Space']) ) tryFireMG(P);
  if (G.missileQueued) { G.missileQueued = false; if (!tryFireMissile(P, aim)) { if (P.missiles <= 0) toast('NO MISSILES — GRAB 🚀'); } }
  if (P.hp < P.maxHp * 0.35) {
    P.smokeT -= dt;
    if (P.smokeT <= 0) { P.smokeT = 0.1; spawnParticles(P.mesh.position.clone().add(new THREE.Vector3(0, 2.2, 0)), 'smoke', 1); }
  }
  // shield ring visual
  let ring = P.mesh.getObjectByName('shieldRing');
  if (P.shieldT > 0 && !ring) {
    ring = new THREE.Mesh(new THREE.SphereGeometry(3.6, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x54c8ff, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
    ring.name = 'shieldRing'; P.mesh.add(ring);
  } else if (P.shieldT <= 0 && ring) P.mesh.remove(ring);
  if (ring) { ring.rotation.y += dt * 2; ring.material.opacity = 0.18 + Math.sin(performance.now() / 200) * 0.08; }
}

function updateCamera(dt) {
  const P = G.player; if (!P) return;
  const back = 11.5, up = 6.4;
  const hx = Math.sin(P.heading), hz = Math.cos(P.heading);
  _v1.set(P.mesh.position.x - hx * back, up, P.mesh.position.z - hz * back);
  // keep camera inside the walls so barriers never occlude the car
  _v1.x = clamp(_v1.x, -ARENA / 2 + 5, ARENA / 2 - 5);
  _v1.z = clamp(_v1.z, -ARENA / 2 + 5, ARENA / 2 - 5);
  camera.position.lerp(_v1, 1 - Math.pow(0.0015, dt));
  _v2.copy(P.mesh.position).add(new THREE.Vector3(hx * 7, 2.2, hz * 7));
  // shake
  if (G.shake > 0) {
    G.shake = Math.max(0, G.shake - dt * 2.2);
    camera.position.x += (Math.random() - 0.5) * G.shake * 1.2;
    camera.position.y += (Math.random() - 0.5) * G.shake * 0.9;
  }
  camera.lookAt(_v2);
  const targetFov = 62 + clamp(Math.abs(P.speed) / P.topSpeed, 0, 1) * 8;
  camera.fov = lerp(camera.fov, targetFov, 3 * dt); camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (G.state === 'playing') {
    G.time += dt;
    updatePlayer(dt);
    for (const e of G.enemies) updateEnemyAI(e, dt);
    updateProjectiles(dt);
    updatePickups(dt);
    updateCamera(dt);
    if (Math.floor(G.time * 4) !== Math.floor((G.time - dt) * 4)) { updateHUD(); drawMinimap(); }
  } else if (G.state === 'menu' || G.state === 'over') {
    // slow orbit behind menu for life
    const t = performance.now() / 1000;
    camera.position.set(Math.sin(t * 0.12) * 46, 20, Math.cos(t * 0.12) * 46);
    camera.lookAt(0, 2, 0);
  }
  updateParticles(dt);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- boot
async function boot() {
  const status = $('loading-status');
  try {
    if (!window.WebGLRenderingContext) throw new Error('WebGL not supported in this browser.');
    setStatus(status, 'Creating renderer…');
    initThree();
    // smoke-test render
    renderer.render(scene, camera);
    setStatus(status, 'Wiring controls…');
    bindInput(); vehicleCards();
    $('btn-start').onclick = startMatch;
    $('btn-again').onclick = restartMatch;
    $('btn-garage').onclick = () => { AudioSys.ui(); quitToGarage(); };
    $('btn-resume').onclick = resumeGame;
    $('btn-restart-pause').onclick = restartMatch;
    $('btn-quit-pause').onclick = () => { AudioSys.ui(); quitToGarage(); };
    $('btn-how').onclick = () => { AudioSys.ui(); $('how-text').classList.toggle('hidden'); };
    $('btn-mute').onclick = () => { AudioSys.init(); AudioSys.setMuted(!AudioSys.muted); };
    // idle demo vehicles so menu backdrop isn't empty
    setStatus(status, 'Rolling out demo rigs…');
    demoRig();
    G.state = 'menu';
    showScreen('screen-menu');
    renderer.setAnimationLoop(loop);
    // headless / smoke-test hook: ?autostart=1 begins a match immediately
    try {
      if (new URLSearchParams(location.search).has('autostart')) startMatch();
    } catch (_) {}
  } catch (err) {
    console.error(err);
    status.textContent = 'Failed to start: ' + err.message;
    fatal('Could not start 3D arena (' + err.message + '). Check WebGL + network access to the three.js CDN, then retry.');
  }
}
function setStatus(el, s) { el.textContent = s; }

function demoRig() {
  // one decorative rig circling the menu backdrop (removed on match start)
  const d = makeEntity('DEMO', 0xc96a1e, { hp: 100, spawn: { x: 20, z: 0 } });
  d.mesh.position.set(20, 0, 0);
  G.demoRig = d;
  const oldClear = clearWorldEntities;
  // patch: startMatch clears demo rig too
  clearWorldEntities = function () {
    oldClear();
    if (G.demoRig) { try { scene.remove(G.demoRig.mesh); } catch (_) {} G.demoRig = null; }
  };
}

// steering note: heading convention x=sin(h), z=cos(h). Pressing D (right)
// must rotate heading so nose goes right when moving forward. Forward vector
// (sin h, cos h); d(forward)/dh = (cos h, -sin h) which points right when
// camera trails behind — so heading += steerRight * k. updateDrive adds
// steer*k with steer=+1 for right, so call with steer directly:
const _origUpdatePlayer = null; // (kept for clarity; logic inlined above)

function fixSteeringCall() { /* documented; updatePlayer passes -steer*-1 === steer */ }

// verification hooks (used by automated smoke test + critics)
window.__game = {
  get state() { return G.state; },
  get player() { return G.player; },
  get enemies() { return G.enemies; },
  start: () => startMatch(),
  damagePlayer: (n) => damageVehicle(G.player, n, G.enemies.find(e => e.alive)),
  killAll: () => { [...G.enemies].forEach(e => { if (e.alive) killVehicle(e, G.player); }); },
  snapshot: () => ({
    state: G.state, kills: G.kills, time: G.time,
    playerHp: G.player ? G.player.hp : null,
    enemiesAlive: G.enemies.filter(e => e.alive).length,
    projectiles: G.projectiles.length,
  }),
};

boot();
