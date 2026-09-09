/* ============================================================================
 * TWISTED STEEL — night-stadium vehicular combat (plain Three.js, no build)
 * States: MENU -> COUNTDOWN -> PLAYING <-> PAUSED -> WIN / LOSS
 * ========================================================================== */
import * as THREE from 'three';

/* ---------------- utils ---------------- */
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
function fmtTime(s) { s = Math.max(0, Math.floor(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }

/* ---------------- error overlay (never hard-crash) ---------------- */
const errorOverlay = $('errorOverlay'), errorMsg = $('errorMsg');
function showError(msg) {
  try {
    errorMsg.textContent = String(msg).slice(0, 300);
    errorOverlay.classList.remove('hidden');
  } catch (_) { /* noop */ }
}
$('errorClose').addEventListener('click', () => errorOverlay.classList.add('hidden'));
window.addEventListener('error', (e) => showError(e.message || 'unknown error'));
window.addEventListener('unhandledrejection', (e) => showError((e.reason && e.reason.message) || 'async error'));

/* ---------------- audio: all synthesized WebAudio ---------------- */
const AudioSys = {
  ctx: null, master: null, engineOsc: null, engineGain: null, engineFilter: null,
  muted: false, volume: 0.5,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      // engine: saw osc -> lowpass -> gain
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 60;
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 500;
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineFilter).connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
    } catch (err) { showError('audio unavailable'); }
  },
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
    $('muteBtn').textContent = m ? '🔇' : '🔊';
  },
  engine(speedRatio, turbo) {
    if (!this.ctx || this.muted) { if (this.engineGain) this.engineGain.gain.value = 0; return; }
    const t = this.ctx.currentTime;
    const f = 55 + speedRatio * 160 + (turbo ? 60 : 0);
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(400 + speedRatio * 1600, t, 0.1);
    this.engineGain.gain.setTargetAtTime(0.05 + speedRatio * 0.06, t, 0.1);
  },
  blip(freq, dur, type = 'square', vol = 0.2, slide = 0) {
    if (!this.ctx || this.muted) return;
    try {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.02);
    } catch (_) {}
  },
  noise(dur, vol = 0.4, lowFreq = 400) {
    if (!this.ctx || this.muted) return;
    try {
      const t = this.ctx.currentTime;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowFreq;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f).connect(g).connect(this.master); src.start(t);
    } catch (_) {}
  },
  mg() { this.noise(0.07, 0.25, 3000); this.blip(220, 0.05, 'square', 0.08, -120); },
  missile() { this.blip(300, 0.5, 'sawtooth', 0.2, 900); this.noise(0.3, 0.15, 1200); },
  explosion(big = 1) { this.noise(0.7 * big, 0.5, 500); this.blip(90, 0.6 * big, 'sine', 0.4, -60); },
  pickup() { this.blip(660, 0.09, 'sine', 0.25); setTimeout(() => this.blip(990, 0.12, 'sine', 0.25), 80); },
  ui() { this.blip(520, 0.06, 'square', 0.12); },
  countBeep(final) { this.blip(final ? 880 : 440, final ? 0.4 : 0.15, 'square', 0.25); },
  stinger(win) {
    if (!this.ctx || this.muted) return;
    const seq = win ? [523, 659, 784, 1046] : [400, 350, 300, 180];
    seq.forEach((f, i) => setTimeout(() => this.blip(f, 0.3, 'triangle', 0.3), i * 160));
  }
};

/* ---------------- input ---------------- */
const keys = {};
const mouse = { mg: false, missileQueued: false };
window.addEventListener('keydown', (e) => {
  if (e.repeat) { if (['SPACE'].includes(e.code)) e.preventDefault(); return; }
  keys[e.code] = true;
  AudioSys.init();
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  handleKeyPress(e.code);
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
function handleKeyPress(code) {
  if (code === 'KeyM') { AudioSys.init(); AudioSys.setMuted(!AudioSys.muted); }
  if (code === 'KeyF') toggleFps();
  if (code === 'KeyP' || code === 'Escape') togglePause();
  if (code === 'KeyT' && state === 'playing') resetStuck();
  if (code === 'KeyR') {
    if (state === 'playing' || state === 'paused' || state === 'win' || state === 'loss') restartMatch();
  }
  if (code === 'KeyE' && state === 'playing') fireNova(player);
  if (code === 'KeyK' && state === 'playing') fireMissile(player);
  if (code === 'Enter' && state === 'menu') startMatch();
  if (state === 'menu' && (code === 'ArrowLeft' || code === 'ArrowRight')) {
    const d = code === 'ArrowRight' ? 1 : -1;
    selectVehicle((selectedVehicle + d + 3) % 3);
  }
}
// mouse combat
const canvas = $('game-canvas');
canvas.addEventListener('mousedown', (e) => {
  AudioSys.init();
  if (state !== 'playing') return;
  if (e.button === 0) mouse.mg = true;
  if (e.button === 2) fireMissile(player);
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) mouse.mg = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
// touch controls (pointer coarse): hold-to-drive/fire
document.querySelectorAll('#touchControls button').forEach((b) => {
  const code = b.dataset.k;
  const on = (e) => { e.preventDefault(); AudioSys.init(); keys[code] = true; if (code === 'KeyK') fireMissile(player); if (code === 'KeyE') fireNova(player); };
  const off = (e) => { e.preventDefault(); keys[code] = false; };
  b.addEventListener('pointerdown', on);
  b.addEventListener('pointerup', off);
  b.addEventListener('pointercancel', off);
  b.addEventListener('pointerleave', off);
});
if (matchMedia('(pointer:coarse)').matches) document.getElementById('touchControls')?.classList.remove('hidden');
window.__gameBooted = true;

/* ---------------- config ---------------- */
const ARENA_HALF = 80;
const VEHICLES = [
  { name: 'SWEET FANG', hp: 100, maxSpeed: 30, accel: 24, handling: 2.4, color: 0xf2ede4, kind: 'van' },
  { name: 'ROAD RIPPER', hp: 80, maxSpeed: 36, accel: 28, handling: 2.1, color: 0xb02020, kind: 'muscle' },
  { name: 'IRON BULWARK', hp: 140, maxSpeed: 25, accel: 19, handling: 2.6, color: 0x4a5a6a, kind: 'tank' },
];
const ENEMY_DEFS = [
  { name: 'Sweet Tooth', color: 0xd8cfc0, tint: 0xffffff, kind: 'van', hp: 90, maxSpeed: 27 },
  { name: 'Roadkill', color: 0x7a4a20, kind: 'muscle', hp: 75, maxSpeed: 31 },
  { name: 'Axel', color: 0x303030, kind: 'tank', hp: 120, maxSpeed: 24 },
  { name: 'Warthog', color: 0x2a6a3a, kind: 'tank', hp: 110, maxSpeed: 26 },
  { name: 'Reaper', color: 0x5a2a8a, kind: 'muscle', hp: 85, maxSpeed: 30 },
];
const DIFFS = {
  rookie: { dmg: 0.55, accuracy: 0.35, hpMul: 0.8, aiTick: 0.4, label: 'ROOKIE' },
  pro: { dmg: 1.0, accuracy: 0.6, hpMul: 1.0, aiTick: 0.25, label: 'PRO' },
  insane: { dmg: 1.5, accuracy: 0.85, hpMul: 1.3, aiTick: 0.15, label: 'INSANE' },
};
let selectedVehicle = 0, selectedDiff = 'pro';
let reducedFlash = false;

/* ---------------- three.js setup ---------------- */
let renderer, scene, camera;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) { showError('WebGL unavailable: ' + err.message); throw err; }
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMappingExposure = 1.25;
scene = new THREE.Scene();
scene.background = new THREE.Color(0x120a18);
scene.fog = new THREE.FogExp2(0x3a1522, 0.0075);
camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 800);
camera.position.set(0, 8, -14);

scene.add(new THREE.HemisphereLight(0x9a8aff, 0x3a1c14, 0.95));
const moon = new THREE.DirectionalLight(0x8a9aff, 0.7);
moon.position.set(-40, 80, -30); scene.add(moon);
const arenaGlow = new THREE.PointLight(0xff6a40, 1.6, 400); arenaGlow.position.set(0, 40, 0); scene.add(arenaGlow);
const flashLight = new THREE.PointLight(0xffaa40, 0, 120); scene.add(flashLight);
const flashLight2 = new THREE.PointLight(0xff3020, 0, 90); scene.add(flashLight2);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------------- canvas textures ---------------- */
function makeVanTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f0ebe0'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(255,110,170,0.55)';
  const dots = [[40, 50, 22], [120, 80, 30], [200, 45, 20], [70, 150, 26], [160, 160, 32], [220, 140, 18], [30, 220, 20], [120, 220, 24], [200, 215, 26]];
  for (const [x, y, r] of dots) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  // rust streaks
  g.fillStyle = 'rgba(150,80,30,0.35)';
  for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 256, Math.random() * 256, 3, 8 + Math.random() * 14);
  g.strokeStyle = 'rgba(60,30,10,0.5)'; g.lineWidth = 3; g.strokeRect(4, 4, 248, 248);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function makeClownTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#e8e4da'; g.fillRect(0, 0, 256, 128);
  // angry eyes
  g.fillStyle = '#111';
  g.beginPath(); g.ellipse(80, 45, 34, 22, -0.3, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(176, 45, 34, 22, 0.3, 0, TAU); g.fill();
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(86, 42, 8, 0, TAU); g.fill();
  g.beginPath(); g.arc(170, 42, 8, 0, TAU); g.fill();
  // grin
  g.strokeStyle = '#a00'; g.lineWidth = 7;
  g.beginPath(); g.arc(128, 78, 52, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  g.fillStyle = '#fff';
  for (let i = 0; i < 5; i++) g.fillRect(88 + i * 17, 96, 12, 12);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function makeFloorTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#181820'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#3d3d52'; g.lineWidth = 3;
  for (let i = 0; i <= 8; i++) {
    g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i * 64); g.lineTo(512, i * 64); g.stroke();
  }
  g.strokeStyle = '#23232f'; g.lineWidth = 1;
  for (let i = 0; i <= 32; i++) {
    g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i * 16); g.lineTo(512, i * 16); g.stroke();
  }
  // hazard glow strips
  g.fillStyle = 'rgba(255,60,40,0.16)'; g.fillRect(0, 0, 512, 10); g.fillRect(0, 502, 512, 10);
  g.fillStyle = 'rgba(60,200,255,0.10)'; g.fillRect(0, 0, 10, 512); g.fillRect(502, 0, 10, 512);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10);
  t.colorSpace = THREE.SRGBColorSpace; return t;
}
const vanTexture = makeVanTexture(), clownTexture = makeClownTexture(), floorTexture = makeFloorTexture();

/* ---------------- arena ---------------- */
const colliders = [];   // {x,z,r} static circles + {x,z,hw,hd} boxes handled as circles approx
const obstacles = [];   // meshes with userData
const ramps = [];       // {x,z,r,dirX,dirZ}
let barrels = [], pickups = [];
const SPAWNS = [
  { x: 0, z: -55 }, { x: 55, z: 0 }, { x: -55, z: 0 },
  { x: 0, z: 55 }, { x: 45, z: 45 }, { x: -45, z: -45 },
];
const PICKUP_SPOTS = [
  { x: 30, z: 30, type: 'health' }, { x: -30, z: 30, type: 'missiles' },
  { x: 30, z: -30, type: 'turbo' }, { x: -30, z: -30, type: 'health' },
  { x: 0, z: 0, type: 'missiles' }, { x: 60, z: -60, type: 'turbo' },
  { x: -60, z: 60, type: 'health' }, { x: 60, z: 60, type: 'missiles' },
];

function buildArena() {
  // floor: two-layer glowing steel-grid deck (anchor: elevated translucent grid + under-glow)
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(ARENA_HALF * 2 + 20, 0.5, ARENA_HALF * 2 + 20),
    new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.7, metalness: 0.6, transparent: true, opacity: 0.96 })
  );
  deck.position.y = -0.25; scene.add(deck);
  const underGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_HALF * 2 + 20, ARENA_HALF * 2 + 20),
    new THREE.MeshBasicMaterial({ color: 0x182838 })
  );
  underGlow.rotation.x = -Math.PI / 2; underGlow.position.y = -0.55; scene.add(underGlow);
  // emissive grid lines overlay for stadium-deck read
  const grid = new THREE.GridHelper(ARENA_HALF * 2 + 20, 41, 0x40d8ff, 0x27435a);
  grid.position.y = 0.02; grid.material.transparent = true; grid.material.opacity = 0.35; scene.add(grid);
  // outer glow ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(ARENA_HALF + 1, ARENA_HALF + 6, 64),
    new THREE.MeshBasicMaterial({ color: 0xff3040, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; scene.add(ring);

  // walls: 4 boxes + posts
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.6, metalness: 0.7 });
  const H = ARENA_HALF;
  const mkWall = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 8, d), wallMat);
    m.position.set(x, 4, z); scene.add(m);
  };
  mkWall(H * 2 + 4, 2, 0, -H - 1); mkWall(H * 2 + 4, 2, 0, H + 1);
  mkWall(2, H * 2 + 4, -H - 1, 0); mkWall(2, H * 2 + 4, H + 1, 0);
  // wall top neon strip
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xff2244 });
  for (const [w, d, x, z] of [[H * 2, 0.4, 0, -H], [H * 2, 0.4, 0, H], [0.4, H * 2, -H, 0], [0.4, H * 2, H, 0]]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(w || 0.4, 0.3, d || 0.4), stripMat);
    s.position.set(x, 8.2, z); scene.add(s);
  }

  // floodlight towers at corners
  const towerPositions = [[-H - 6, -H - 6], [H + 6, -H - 6], [-H - 6, H + 6], [H + 6, H + 6]];
  for (const [x, z] of towerPositions) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 34, 8),
      new THREE.MeshStandardMaterial({ color: 0x333344, metalness: 0.8, roughness: 0.4 }));
    pole.position.y = 17; g.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(7, 2.4, 1),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveIntensity: 1.6 }));
    head.position.y = 34; head.lookAt(0, 0, 0); g.add(head);
    const spot = new THREE.SpotLight(0xcfe8ff, 900, 220, 0.5, 0.5, 1.4);
    spot.position.set(x, 34, z);
    spot.target.position.set(0, 0, 0);
    scene.add(spot); scene.add(spot.target);
    g.position.set(x, 0, z); scene.add(g);
  }

  // city silhouette backdrop: dark boxes ring + red dusk glow plane
  const cityMat = new THREE.MeshBasicMaterial({ color: 0x0d0714 });
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * TAU + rand(-0.05, 0.05);
    const r = rand(150, 240);
    const w = rand(12, 34), h = rand(18, 90), d = rand(12, 30);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cityMat);
    b.position.set(Math.cos(a) * r, h / 2 - 4, Math.sin(a) * r);
    scene.add(b);
    if (i % 4 === 0) { // lit window strip
      const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, 2),
        new THREE.MeshBasicMaterial({ color: i % 8 === 0 ? 0xff5040 : 0x40c8ff }));
      win.position.set(b.position.x, rand(8, h - 6), b.position.z);
      win.lookAt(0, win.position.y, 0); scene.add(win);
    }
  }
  // red dusk sky dome
  const skyGeo = new THREE.SphereGeometry(500, 16, 12);
  const skyMat = new THREE.MeshBasicMaterial({
    color: 0x521826, side: THREE.BackSide, fog: false,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
  // stars
  const starGeo = new THREE.BufferGeometry();
  const sp = [];
  for (let i = 0; i < 400; i++) {
    const a = rand(0, TAU), e = rand(0.15, 1.4), r = 460;
    sp.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, fog: false })));

  // obstacles: crates, barriers, ramps
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x6a5a3a, roughness: 0.9 });
  const barrierMat = new THREE.MeshStandardMaterial({ color: 0xcc7020, roughness: 0.7, metalness: 0.3 });
  const crateSpots = [[-20, -10], [20, 12], [0, -25], [-35, 40], [38, -42], [12, 48], [-12, -48], [48, 10]];
  for (const [x, z] of crateSpots) {
    const s = rand(2.4, 4);
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
    m.position.set(x, s / 2, z); m.rotation.y = rand(0, 1); scene.add(m);
    obstacles.push(m); colliders.push({ x, z, r: s * 0.85 });
  }
  const barrierSpots = [[0, 20, 0], [0, -8, 0], [-25, 0, 1], [25, 0, 1], [-50, -20, 0], [50, 20, 0]];
  for (const [x, z, rot] of barrierSpots) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(rot ? 2 : 12, 1.4, rot ? 12 : 2), barrierMat);
    m.position.set(x, 0.7, z); scene.add(m);
    obstacles.push(m); colliders.push({ x, z, r: 5.2 });
  }
  // center platform + ramps
  const plat = new THREE.Mesh(new THREE.BoxGeometry(16, 1.2, 16),
    new THREE.MeshStandardMaterial({ color: 0x3a3a4a, metalness: 0.7, roughness: 0.4 }));
  plat.position.set(0, 0.6, 0); scene.add(plat);
  colliders.push({ x: 0, z: 0, r: 11.5, low: true, tall: false });
  const rampMat = new THREE.MeshStandardMaterial({ color: 0x884422, roughness: 0.8 });
  const rampDefs = [
    { x: 0, z: 12, dx: 0, dz: -1 }, { x: 0, z: -12, dx: 0, dz: 1 },
    { x: 12, z: 0, dx: -1, dz: 0 }, { x: -12, z: 0, dx: 1, dz: 0 },
  ];
  for (const r of rampDefs) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(6, 0.6, 5), rampMat);
    m.position.set(r.x, 0.5, r.z);
    m.rotation.x = r.dz !== 0 ? (r.dz > 0 ? -0.35 : 0.35) : 0;
    m.rotation.z = r.dx !== 0 ? (r.dx > 0 ? 0.35 : -0.35) : 0;
    scene.add(m);
    ramps.push({ x: r.x, z: r.z, r: 4.5, dirX: r.dx, dirZ: r.dz });
  }
}

/* ---------------- vehicle meshes ---------------- */
function buildWheel(r = 0.55) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.5, 14),
    new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 }));
  tire.rotation.z = Math.PI / 2; g.add(tire);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.52, 10),
    new THREE.MeshStandardMaterial({ color: 0xcc1620, roughness: 0.5, metalness: 0.4 }));
  hub.rotation.z = Math.PI / 2; g.add(hub);
  return g;
}
function buildMinigun() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x222228, metalness: 0.85, roughness: 0.3 });
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.6, 8), mat);
    b.rotation.z = Math.PI / 2;
    b.position.set(0, (i - 1) * 0.22, ((i % 2) - 0.5) * 0.2);
    g.add(b);
  }
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), mat);
  housing.position.x = 0.7; g.add(housing);
  return g;
}
function buildClownHead() {
  const g = new THREE.Group();
  const faceMat = new THREE.MeshStandardMaterial({ map: clownTexture, roughness: 0.6 });
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.95, 20, 16), faceMat);
  skull.scale.set(1.15, 0.95, 0.9); g.add(skull);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xff1010, roughness: 0.35 }));
  nose.position.set(0, 0.05, 0.95); g.add(nose);
  const hairMat = new THREE.MeshStandardMaterial({ color: 0xffb300, emissive: 0xff8800, emissiveIntensity: 0.7, roughness: 0.8 });
  for (const sx of [-1, 1]) for (const sy of [-0.4, 0.3, 0.8]) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), hairMat);
    puff.position.set(sx * 0.95, sy, -0.15); g.add(puff);
  }
  return g;
}
function buildVehicleMesh(kind, bodyColor, isPlayerVan, tintColor = 0xffffff) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const detailed = kind === 'van'; // every van reads as Sweet-Tooth-like (player + rival)
  const vanTex = vanTexture.clone(); vanTex.needsUpdate = true;
  const paint = detailed
    ? new THREE.MeshStandardMaterial({ map: vanTex, color: tintColor, roughness: 0.65, metalness: 0.25 })
    : new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.55, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 0.7, metalness: 0.4 });
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x9999aa, metalness: 0.9, roughness: 0.25 });

  if (kind === 'van') {
    const main = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.7, 4.6), paint);
    main.position.y = 1.35; body.add(main);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.0, 1.4), paint);
    cab.position.set(0, 2.4, 0.6); body.add(cab);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.7, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x0a1420, roughness: 0.2, metalness: 0.8 }));
    glass.position.set(0, 2.4, 1.32); body.add(glass);
    if (detailed) {
      const clown = buildClownHead(); clown.position.set(0, 3.6, -0.4); body.add(clown);
      body.userData.clown = clown;
      // roof missile prop
      const prop = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.4, 8),
        new THREE.MeshStandardMaterial({ color: 0xd8d8d8 }));
      prop.rotation.z = Math.PI / 2; prop.position.set(0, 3.0, 0.4); body.add(prop);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 8),
        new THREE.MeshStandardMaterial({ color: 0xff2020 }));
      tip.rotation.z = -Math.PI / 2; tip.position.set(1.4, 3.0, 0.4); body.add(tip);
      // STOP FOR CHILDREN sign
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 1.6),
        new THREE.MeshStandardMaterial({ color: 0xcc1020, emissive: 0x550000, emissiveIntensity: 0.5 }));
      sign.position.set(1.35, 1.6, -0.5); body.add(sign);
    }
  } else if (kind === 'muscle') {
    const main = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 4.4), paint);
    main.position.y = 0.95; body.add(main);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 2.0), dark);
    cabin.position.set(0, 1.6, -0.3); body.add(cabin);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 1.6), dark);
    hood.position.set(0, 1.5, 1.3); body.add(hood);
  } else { // tank
    const main = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.3, 4.2), paint);
    main.position.y = 1.2; body.add(main);
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 2.2), dark);
    top.position.set(0, 2.1, -0.4); body.add(top);
  }
  // front ram blade
  const blade = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.5, 0.25), bladeMat);
  blade.position.set(0, 0.6, kind === 'van' ? 2.45 : 2.3); blade.rotation.x = 0.25; body.add(blade);
  // side miniguns
  for (const sx of [-1, 1]) {
    const gun = buildMinigun();
    gun.position.set(sx * (kind === 'tank' ? 1.6 : 1.45), 1.3, 1.2);
    gun.rotation.y = sx > 0 ? 0 : Math.PI;
    body.add(gun);
  }
  // wheels (red hubs like Sweet Tooth)
  const wheels = [];
  const wz = kind === 'van' ? 1.6 : 1.5, wx = kind === 'tank' ? 1.45 : 1.25;
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const w = buildWheel(kind === 'tank' ? 0.65 : 0.55);
    w.position.set(sx * wx, 0.55, sz * wz); root.add(w); wheels.push(w);
  }
  // headlight glow
  const lightBar = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.18, 0.1),
    new THREE.MeshBasicMaterial({ color: 0xffeeaa }));
  lightBar.position.set(0, 1.1, kind === 'van' ? 2.32 : 2.22); body.add(lightBar);
  // blob shadow
  const blob = new THREE.Mesh(new THREE.CircleGeometry(2.4, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.03; root.add(blob);
  root.userData = { body, wheels };
  return root;
}

/* ---------------- entities ---------------- */
function makeCar(def, isPlayer, idx) {
  const tint = isPlayer ? 0xffffff : (def.tint || 0xffd8d8);
  const mesh = buildVehicleMesh(def.kind, def.color, isPlayer && def.kind === 'van', tint);
  scene.add(mesh);
  return {
    isPlayer, idx, def, mesh,
    name: isPlayer ? VEHICLES[selectedVehicle].name : def.name,
    pos: new THREE.Vector3(), heading: 0, speed: 0,
    y: 0, vy: 0, steerVis: 0, jumpCd: 0,
    hp: def.hp, maxHp: def.hp,
    alive: true, radius: 2.6,
    missiles: isPlayer ? 6 : 3, turbo: 100, nova: 0,
    mgCd: 0, missileCd: 0, ramCd: 0, aiTick: rand(0, 0.3),
    aiState: 'chase', aiTarget: new THREE.Vector3(), strafeDir: 1, stuckT: 0, lastPos: new THREE.Vector3(),
    muzzleT: 0, hitT: 0, wheelsSpin: 0,
  };
}
let player = null, enemies = [];
let projectiles = [], particles = [], debris = [], skids = [], dmgNumbers = [];
let kills = 0, matchTime = 0, state = 'menu';
let camShake = 0, hitFlash = 0, novaRingT = 0;
let fpsFrames = 0, fpsTime = 0, fpsValue = 60, showFps = false, lowFpsT = 0;

/* ---------------- particles / fx pools ---------------- */
const sparkGeo = new THREE.SphereGeometry(0.12, 6, 5);
function spawnParticle(x, y, z, vx, vy, vz, color, life, size = 1) {
  if (particles.length > 450) return;
  const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
  m.position.set(x, y, z); m.scale.setScalar(size);
  scene.add(m);
  particles.push({ m, vx, vy, vz, life, maxLife: life });
}
function burst(p, color, n, speed, up = 4) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU);
    spawnParticle(p.x, (p.y || 0) + 1, p.z, Math.cos(a) * rand(1, speed), rand(1, up), Math.sin(a) * rand(1, speed), color, rand(0.3, 0.9), rand(0.6, 1.8));
  }
}
function spawnDebris(p, color = 0x333333) {
  if (debris.length > 60) return;
  const m = new THREE.Mesh(new THREE.BoxGeometry(rand(0.2, 0.6), rand(0.2, 0.6), rand(0.2, 0.6)),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  m.position.set(p.x, 1.5, p.z); scene.add(m);
  debris.push({ m, vx: rand(-8, 8), vy: rand(4, 12), vz: rand(-8, 8), rx: rand(-6, 6), rz: rand(-6, 6), life: rand(1, 2) });
}
function addSkid(x, z, heading) {
  if (skids.length > 220) { const s = skids.shift(); scene.remove(s.m); s.m.geometry.dispose(); s.m.material.dispose(); }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 1.1),
    new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.55 }));
  m.rotation.x = -Math.PI / 2; m.rotation.z = -heading;
  m.position.set(x, 0.04, z); scene.add(m);
  skids.push({ m, life: 6 });
}
function explode(pos, dmg, owner, radius = 9) {
  AudioSys.explosion(1);
  burst(pos, 0xffa030, 22, 12, 9); burst(pos, 0xff3020, 14, 9, 7); burst(pos, 0x555555, 10, 5, 8);
  for (let i = 0; i < 4; i++) spawnDebris(pos);
  flashLight.position.set(pos.x, 5, pos.z);
  flashLight.intensity = reducedFlash ? 60 : 400;
  camShake = Math.min(2.2, camShake + (owner === player ? 0.7 : 0.35));
  // radial damage
  const targets = [player, ...enemies];
  for (const t of targets) {
    if (!t.alive) continue;
    const d = Math.hypot(t.pos.x - pos.x, t.pos.z - pos.z);
    if (d < radius) {
      const fall = 1 - d / radius;
      damageCar(t, dmg * (0.35 + 0.65 * fall), owner);
      // knockback
      const nx = (t.pos.x - pos.x) / (d + 0.01), nz = (t.pos.z - pos.z) / (d + 0.01);
      t.pos.x += nx * fall * 3; t.pos.z += nz * fall * 3;
    }
  }
  // chain barrels
  for (const b of barrels) {
    if (b.dead) continue;
    if (Math.hypot(b.mesh.position.x - pos.x, b.mesh.position.z - pos.z) < radius + 2) detonateBarrel(b, owner);
  }
}
function damageCar(car, dmg, owner) {
  if (!car.alive || state !== 'playing') return;
  car.hp -= dmg; car.hitT = 0.25;
  if (owner && owner.nova !== undefined && owner !== car) owner.nova = clamp(owner.nova + dmg * 0.7, 0, 100);
  burst(car.pos, 0xffee60, 5, 7, 5);
  if (car.isPlayer) {
    hitFlash = clamp(hitFlash + dmg * 0.02, 0, 1);
    camShake = Math.min(1.6, camShake + dmg * 0.012);
    AudioSys.noise(0.15, 0.3, 900);
  } else if (owner === player) {
    showHitmarker();
    spawnDmgNumber(car, Math.round(dmg));
  }
  if (car.hp <= 0) killCar(car, owner);
}
function killCar(car, owner) {
  car.hp = 0; car.alive = false;
  // single unified kill FX (no double explode/audio)
  burst({ x: car.pos.x, y: 0, z: car.pos.z }, 0xffa030, 22, 12, 9);
  burst({ x: car.pos.x, y: 0, z: car.pos.z }, 0xff6020, 30, 14, 10);
  burst({ x: car.pos.x, y: 0, z: car.pos.z }, 0x555555, 10, 5, 8);
  for (let i = 0; i < 4; i++) spawnDebris(car.pos);
  flashLight.position.set(car.pos.x, 5, car.pos.z);
  flashLight.intensity = reducedFlash ? 60 : 400;
  camShake = Math.min(2.2, camShake + 0.7);
  AudioSys.explosion(1.3);
  car.mesh.visible = false;
  // wreck marker: dark hulk
  spawnDebris(car.pos, 0x552222); spawnDebris(car.pos, 0x222222);
  if (!car.isPlayer) {
    kills++;
    feed((owner === player ? 'YOU' : (owner ? owner.name : 'ARENA')) + ' ☠ ' + car.name, owner === player);
    AudioSys.blip(700, 0.2, 'square', 0.2, 300);
    // drop pickup
    spawnPickupAt(car.pos.x + rand(-3, 3), car.pos.z + rand(-3, 3), Math.random() < 0.45 ? 'health' : 'missiles');
    if (kills >= enemies.length) endMatch(true);
  } else {
    endMatch(false);
  }
}
function spawnDmgNumber(car, n) {
  dmgNumbers.push({ car, n, life: 0.8 });
}

/* ---------------- combat ---------------- */
function fireMG(car) {
  if (!car.alive || car.mgCd > 0 || state !== 'playing') return;
  car.mgCd = car.isPlayer ? 0.13 : 0.45;
  car.muzzleT = 0.06;
  AudioSys.mg();
  const dirX = Math.sin(car.heading), dirZ = Math.cos(car.heading);
  // inaccuracy
  const spread = car.isPlayer ? 0.03 : (1 - DIFFS[selectedDiff].accuracy) * 0.22 + 0.03;
  const a = car.heading + rand(-spread, spread);
  const isP = car.isPlayer;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5),
    new THREE.MeshBasicMaterial({ color: isP ? 0xffe060 : 0xff5040 }));
  mesh.position.set(car.pos.x + dirX * 3, 1.4, car.pos.z + dirZ * 3);
  scene.add(mesh);
  projectiles.push({
    mesh, owner: car, kind: 'mg',
    vx: Math.sin(a) * 95, vz: Math.cos(a) * 95,
    life: 1.1, dmg: isP ? 6 : 6 * DIFFS[selectedDiff].dmg,
  });
  // muzzle spark + slight recoil
  spawnParticle(mesh.position.x, 1.4, mesh.position.z, 0, 1, 0, 0xffee80, 0.12, 1.4);
  if (!isP) { /* enemies telegraph */ }
}
function fireMissile(car) {
  if (!car.alive || car.missileCd > 0 || state !== 'playing') return;
  if (car.missiles <= 0) {
    if (car.isPlayer) { centerMsg('NO MISSILES — grab a 🚀 pickup!', 1.2); AudioSys.blip(160, 0.2, 'square', 0.2); }
    return;
  }
  car.missiles--; car.missileCd = 0.9;
  AudioSys.missile();
  const dirX = Math.sin(car.heading), dirZ = Math.cos(car.heading);
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.1, 8),
    new THREE.MeshBasicMaterial({ color: 0xff4020 }));
  mesh.position.set(car.pos.x + dirX * 3, 1.4, car.pos.z + dirZ * 3);
  scene.add(mesh);
  // target: nearest live enemy (or player for AI)
  let target = null, best = 1e9;
  const foes = car.isPlayer ? enemies : [player];
  for (const f of foes) {
    if (!f.alive) continue;
    const d = f.pos.distanceTo(car.pos);
    if (d < best) { best = d; target = f; }
  }
  projectiles.push({
    mesh, owner: car, kind: 'missile', target,
    vx: dirX * 30, vz: dirZ * 30, heading: car.heading,
    life: 4, dmg: car.isPlayer ? 38 : 26 * DIFFS[selectedDiff].dmg, smokeT: 0,
  });
}
function fireNova(car) {
  if (!car.alive || state !== 'playing') return;
  if (car.nova < 100) { if (car.isPlayer) centerMsg('NOVA CHARGING… ' + Math.floor(car.nova) + '%', 1); return; }
  car.nova = 0;
  AudioSys.explosion(1.6); AudioSys.blip(120, 0.8, 'sawtooth', 0.3, 500);
  camShake = reducedFlash ? 0.4 : 2.4;
  novaRingT = 0.6;
  const fl = $('nova-flash');
  fl.classList.remove('hidden');
  setTimeout(() => fl.classList.add('hidden'), reducedFlash ? 60 : 280);
  flashLight2.position.set(car.pos.x, 6, car.pos.z);
  flashLight2.intensity = reducedFlash ? 80 : 600;
  burst(car.pos, 0xc080ff, 40, 18, 12); burst(car.pos, 0xffffff, 20, 10, 8);
  const targets = car.isPlayer ? enemies : [player];
  for (const t of targets) {
    if (!t.alive) continue;
    const d = Math.hypot(t.pos.x - car.pos.x, t.pos.z - car.pos.z);
    if (d < 26) damageCar(t, 85 * (1 - d / 32), car);
  }
  // also pop barrels
  for (const b of [...barrels]) {
    if (!b.dead && Math.hypot(b.mesh.position.x - car.pos.x, b.mesh.position.z - car.pos.z) < 26) detonateBarrel(b, car);
  }
  if (car.isPlayer) feed('YOU unleashed NOVA 💥', true);
}

/* ---------------- barrels & pickups ---------------- */
function buildBarrels() {
  for (const b of barrels) scene.remove(b.mesh);
  barrels = [];
  const spots = [[-40, -40], [40, 40], [-40, 40], [40, -40], [15, -35], [-15, 35], [55, 30], [-55, -30]];
  for (const [x, z] of spots) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.8, 12),
      new THREE.MeshStandardMaterial({ color: 0xcc2020, emissive: 0x550000, emissiveIntensity: 0.6, roughness: 0.6 }));
    mesh.position.set(x + rand(-2, 2), 0.9, z + rand(-2, 2));
    // warning stripe
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.4, 12),
      new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.7 }));
    stripe.position.y = 0.2; mesh.add(stripe);
    scene.add(mesh);
    barrels.push({ mesh, hp: 12, dead: false });
    colliders.push({ x: mesh.position.x, z: mesh.position.z, r: 1.4, barrel: barrels[barrels.length - 1] });
  }
}
function detonateBarrel(b, owner) {
  if (b.dead) return;
  b.dead = true;
  const p = { x: b.mesh.position.x, y: 0, z: b.mesh.position.z };
  scene.remove(b.mesh);
  const ci = colliders.findIndex((c) => c.barrel === b);
  if (ci >= 0) colliders.splice(ci, 1);
  explode(p, 45, owner, 10);
}
function pickupColor(t) { return t === 'health' ? 0x30ff60 : t === 'missiles' ? 0xff8030 : 0x30c8ff; }
function pickupGlyph(t) { return t === 'health' ? '✚' : t === 'missiles' ? '🚀' : '⚡'; }
function spawnPickupAt(x, z, type) {
  x = clamp(x, -ARENA_HALF + 5, ARENA_HALF - 5);
  z = clamp(z, -ARENA_HALF + 5, ARENA_HALF - 5);
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.9),
    new THREE.MeshStandardMaterial({ color: pickupColor(type), emissive: pickupColor(type), emissiveIntensity: 0.9, roughness: 0.3 }));
  core.position.y = 1.2; g.add(core);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.08, 8, 24),
    new THREE.MeshBasicMaterial({ color: pickupColor(type) }));
  halo.position.y = 0.3; halo.rotation.x = Math.PI / 2; g.add(halo);
  g.position.set(x, 0, z); scene.add(g);
  pickups.push({ mesh: g, core, type, x, z, active: true, respawn: 0, bob: rand(0, TAU) });
}
function buildPickups() {
  for (const p of pickups) scene.remove(p.mesh);
  pickups = [];
  for (const s of PICKUP_SPOTS) spawnPickupAt(s.x, s.z, s.type);
}
function applyPickup(car, p) {
  if (p.type === 'health') car.hp = clamp(car.hp + 40, 0, car.maxHp);
  if (p.type === 'missiles') car.missiles = clamp(car.missiles + 4, 0, 12);
  if (p.type === 'turbo') car.turbo = 100;
  if (car.isPlayer) { AudioSys.pickup(); centerMsg(pickupGlyph(p.type) + ' ' + p.type.toUpperCase() + '!', 0.9); }
  p.active = false; p.respawn = 12; p.mesh.visible = false;
}

/* ---------------- physics & collisions ---------------- */
function updateCarPhysics(car, dt, throttle, steer) {
  const def = car.isPlayer ? VEHICLES[selectedVehicle] : car.def;
  const aiTurbo = !car.isPlayer && throttle > 0 && car.turbo > 30 && Math.abs(car.speed) > 8;
  const turboOn = ((keys['ShiftLeft'] || keys['ShiftRight']) && car.isPlayer && car.turbo > 1 && throttle > 0) || aiTurbo;
  const handbrake = !!(keys['Space'] && car.isPlayer);
  const maxSp = def.maxSpeed * (turboOn ? 1.5 : 1);
  const accel = def.accel * (turboOn ? 1.8 : 1);
  if (turboOn) car.turbo = Math.max(0, car.turbo - 30 * dt);
  else car.turbo = Math.min(100, car.turbo + 6 * dt);

  if (throttle > 0) car.speed += accel * throttle * dt;
  else if (throttle < 0) car.speed += accel * 0.6 * throttle * dt; // reverse weaker
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), (handbrake ? 30 : 8) * dt);
  car.speed = clamp(car.speed, -maxSp * 0.4, maxSp);

  // steering scaled by speed
  const spdF = clamp(Math.abs(car.speed) / def.maxSpeed, 0, 1);
  const grip = handbrake ? 2.6 : 1.0;
  const turnRate = def.handling * (0.4 + 0.6 * spdF) * grip * Math.sign(car.speed || 1);
  car.heading += steer * turnRate * dt * (car.speed < 0 ? -1 : 1);
  car.steerVis = lerp(car.steerVis, steer, 8 * dt);

  const dx = Math.sin(car.heading), dz = Math.cos(car.heading);
  car.pos.x += dx * car.speed * dt;
  car.pos.z += dz * car.speed * dt;

  // jumps / ramps (per-car cooldown stops pogo loop)
  car.jumpCd = Math.max(0, (car.jumpCd || 0) - dt);
  for (const r of ramps) {
    if (car.jumpCd <= 0 && Math.hypot(car.pos.x - r.x, car.pos.z - r.z) < r.r && Math.abs(car.speed) > 12 && car.y <= 0.1) {
      car.vy = 7 + Math.abs(car.speed) * 0.15;
      car.pos.x += r.dirX * 2; car.pos.z += r.dirZ * 2;
      car.jumpCd = 1.0;
      if (car.isPlayer) { AudioSys.blip(200, 0.3, 'sine', 0.15, 400); }
    }
  }
  if (car.y > 0 || car.vy !== 0) {
    car.vy -= 22 * dt; car.y += car.vy * dt;
    if (car.y <= 0) {
      car.y = 0; car.vy = 0;
      if (car.isPlayer && Math.abs(car.speed) > 10) { burst(car.pos, 0x999999, 6, 4, 2); camShake += 0.15; }
    }
  }

  // boundary clamp (walls)
  const L = ARENA_HALF - 2.5;
  if (car.pos.x < -L || car.pos.x > L || car.pos.z < -L || car.pos.z > L) {
    car.pos.x = clamp(car.pos.x, -L, L); car.pos.z = clamp(car.pos.z, -L, L);
    if (Math.abs(car.speed) > 14) { damageCar(car, 4, null); burst(car.pos, 0xffcc40, 6, 6, 3); }
    car.speed *= 0.55;
    AudioSys.noise(0.1, 0.15, 700);
  }
  // static colliders
  for (const c of colliders) {
    const ddx = car.pos.x - c.x, ddz = car.pos.z - c.z;
    const d = Math.hypot(ddx, ddz), min = c.r + car.radius * 0.55;
    if (d < min && d > 0.001) {
      const nx = ddx / d, nz = ddz / d;
      car.pos.x = c.x + nx * min; car.pos.z = c.z + nz * min;
      const impact = Math.abs(car.speed);
      car.speed *= 0.5;
      if (impact > 16) {
        damageCar(car, (impact - 14) * 0.5, null);
        burst(car.pos, 0xffcc40, 8, 7, 4); camShake += car.isPlayer ? 0.3 : 0;
        AudioSys.noise(0.12, 0.25, 800);
      }
      if (c.barrel && impact > 10) detonateBarrel(c.barrel, car);
    }
  }

  // skid marks + dust
  const drifting = handbrake && Math.abs(steer) > 0.2 && Math.abs(car.speed) > 10;
  if ((drifting || Math.abs(car.speed) > def.maxSpeed * 0.85) && car.y <= 0.1 && Math.random() < 0.6) {
    spawnParticle(car.pos.x - dx * 2, 0.3, car.pos.z - dz * 2,
      rand(-2, 2), rand(1, 3), rand(-2, 2), drifting ? 0xbbbbbb : 0x776655, 0.7, 1.2);
  }
  if (drifting && Math.random() < 0.8) {
    addSkid(car.pos.x - dx * 1.5 + rand(-0.5, 0.5), car.pos.z - dz * 1.5 + rand(-0.5, 0.5), car.heading);
  }
  car.wheelsSpin += car.speed * dt * 1.5;

  // write transform
  car.mesh.position.set(car.pos.x, car.y, car.pos.z);
  car.mesh.rotation.y = car.heading;
  car.mesh.rotation.z = lerp(car.mesh.rotation.z, -car.steerVis * clamp(car.speed / 20, -1, 1) * (handbrake ? 0.22 : 0.1), 6 * dt);
  const wu = car.mesh.userData;
  if (wu && wu.wheels) for (const w of wu.wheels) w.rotation.x = car.wheelsSpin;
  if (wu && wu.body && wu.body.userData.clown) wu.body.userData.clown.rotation.y = Math.sin(performance.now() * 0.001) * 0.25;
  if (car.hitT > 0) car.hitT -= dt;
}
function carVsCar(a, b) {
  if (!a.alive || !b.alive) return;
  const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
  const d = Math.hypot(dx, dz), min = a.radius + b.radius - 1.2;
  if (d < min && d > 0.01) {
    const nx = dx / d, nz = dz / d, overlap = min - d;
    a.pos.x -= nx * overlap / 2; a.pos.z -= nz * overlap / 2;
    b.pos.x += nx * overlap / 2; b.pos.z += nz * overlap / 2;
    const rel = Math.abs(a.speed) + Math.abs(b.speed);
    if (rel > 18 && (a.ramCd <= 0 || b.ramCd <= 0)) {
      const dmg = (rel - 16) * 0.9;
      damageCar(b, dmg * (Math.abs(a.speed) > Math.abs(b.speed) ? 1 : 0.4), a);
      damageCar(a, dmg * (Math.abs(b.speed) > Math.abs(a.speed) ? 1 : 0.4), b);
      burst({ x: (a.pos.x + b.pos.x) / 2, y: 0, z: (a.pos.z + b.pos.z) / 2 }, 0xffd040, 10, 8, 5);
      AudioSys.noise(0.2, 0.35, 600);
      camShake += a.isPlayer || b.isPlayer ? 0.4 : 0;
      a.ramCd = b.ramCd = 0.8;
      const avg = (a.speed + b.speed) / 2;
      a.speed = avg * 0.5; b.speed = avg * 0.5;
    }
  }
}

/* ---------------- AI ---------------- */
function nearestPickup(car, type) {
  let best = null, bd = 1e9;
  for (const p of pickups) {
    if (!p.active) continue;
    if (type && p.type !== type) continue;
    const d = Math.hypot(p.x - car.pos.x, p.z - car.pos.z);
    if (d < bd) { bd = d; best = p; }
  }
  return best ? { p: best, d: bd } : null;
}
function updateAI(car, dt) {
  car.aiTick -= dt; car.stuckT += dt;
  if (car.mesh.position.distanceTo(car.lastPos) > 3 || Math.abs(car.speed) > 4) { car.stuckT = 0; car.lastPos.copy(car.mesh.position); }
  const diff = DIFFS[selectedDiff];
  const toPlayerX = player.pos.x - car.pos.x, toPlayerZ = player.pos.z - car.pos.z;
  const distP = Math.hypot(toPlayerX, toPlayerZ);

  if (car.aiTick <= 0) {
    car.aiTick = diff.aiTick + rand(0, 0.15);
    // state selection
    if (!player.alive) car.aiState = 'wander';
    else if (car.hp < car.maxHp * 0.3) {
      const h = nearestPickup(car, 'health');
      car.aiState = h && h.d < 90 ? 'flee' : 'chase';
      if (car.aiState === 'flee' && h) car.aiTarget.set(h.p.x, 0, h.p.z);
    } else if ((car.missiles <= 0 || car.hp < car.maxHp * 0.6) && Math.random() < 0.5) {
      const any = nearestPickup(car, null);
      if (any && any.d < 70 && Math.random() < 0.7) { car.aiState = 'pickup'; car.aiTarget.set(any.p.x, 0, any.p.z); }
      else car.aiState = distP < 14 ? 'strafe' : 'chase';
    } else {
      car.aiState = distP < 13 ? 'strafe' : 'chase';
      if (car.aiState === 'strafe' && Math.random() < 0.3) car.strafeDir *= -1;
    }
  }
  let tx, tz;
  if (car.aiState === 'chase') { tx = player.pos.x; tz = player.pos.z; }
  else if (car.aiState === 'strafe') {
    const a = Math.atan2(toPlayerX, toPlayerZ) + car.strafeDir * 1.1;
    tx = player.pos.x - Math.sin(a) * 16; tz = player.pos.z - Math.cos(a) * 16;
  } else if (car.aiState === 'flee' || car.aiState === 'pickup') { tx = car.aiTarget.x; tz = car.aiTarget.z; }
  else { tx = Math.sin(car.heading) * 40; tz = Math.cos(car.heading) * 40; }

  // wall avoidance: probe ahead
  const ahead = 10;
  const px = car.pos.x + Math.sin(car.heading) * ahead, pz = car.pos.z + Math.cos(car.heading) * ahead;
  if (Math.abs(px) > ARENA_HALF - 10 || Math.abs(pz) > ARENA_HALF - 10) {
    tx = -Math.sign(px) * 30; tz = -Math.sign(pz) * 30;
  }
  // obstacle repulsion
  for (const c of colliders) {
    const d = Math.hypot(car.pos.x - c.x, car.pos.z - c.z);
    if (d < c.r + 9) { tx += (car.pos.x - c.x) * 1.5; tz += (car.pos.z - c.z) * 1.5; }
  }
  if (car.stuckT > 2.5) { // reverse out
    updateCarPhysics(car, dt, -1, 0.8);
    if (car.stuckT > 4) {
      // rejection-sample so teleport never lands inside a collider
      let nx = car.pos.x, nz = car.pos.z;
      for (let tries = 0; tries < 12; tries++) {
        const cx = rand(-50, 50), cz = rand(-50, 50);
        let ok = true;
        for (const c of colliders) { if (Math.hypot(cx - c.x, cz - c.z) < c.r + 4) { ok = false; break; } }
        if (ok) { nx = cx; nz = cz; break; }
      }
      car.pos.x = nx; car.pos.z = nz; car.stuckT = 0;
    }
  } else {
    const desired = Math.atan2(tx - car.pos.x, tz - car.pos.z);
    const dd = angDiff(car.heading, desired);
    const steer = clamp(dd * 2, -1, 1);
    const throttle = Math.abs(dd) > 2.2 ? -0.6 : 1;
    updateCarPhysics(car, dt, player.alive ? throttle : 0.3, steer);
  }
  // cooldowns tick globally in main loop
  // fire control: in range + roughly facing
  if (player.alive && distP < 60) {
    const desired = Math.atan2(toPlayerX, toPlayerZ);
    if (Math.abs(angDiff(car.heading, desired)) < 0.25) {
      if (Math.random() < diff.accuracy * 0.06) fireMG(car);
      if (distP > 18 && distP < 70 && car.missiles > 0 && car.missileCd <= 0 && Math.random() < 0.012) fireMissile(car);
    }
  }
}
function resetStuck() {
  player.pos.x = clamp(player.pos.x + rand(-6, 6), -60, 60);
  player.pos.z = clamp(player.pos.z + rand(-6, 6), -60, 60);
  player.y = 2; player.vy = 0; player.speed = 0;
  centerMsg('RECOVERED!', 1);
  AudioSys.pickup();
}

/* ---------------- projectiles update ---------------- */
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i];
    pr.life -= dt;
    let dead = pr.life <= 0;
    if (pr.kind === 'missile') {
      if (pr.target && pr.target.alive) {
        const want = Math.atan2(pr.target.pos.x - pr.mesh.position.x, pr.target.pos.z - pr.mesh.position.z);
        pr.heading += clamp(angDiff(pr.heading, want), -2.6 * dt, 2.6 * dt);
      }
      const sp = 46;
      pr.vx = Math.sin(pr.heading) * sp; pr.vz = Math.cos(pr.heading) * sp;
      pr.mesh.rotation.y = pr.heading; pr.mesh.rotation.x = Math.PI / 2;
      pr.smokeT -= dt;
      if (pr.smokeT <= 0) {
        pr.smokeT = 0.05;
        spawnParticle(pr.mesh.position.x, pr.mesh.position.y, pr.mesh.position.z, rand(-1, 1), rand(0, 1), rand(-1, 1), 0xcccccc, 0.5, 0.8);
      }
    }
    pr.mesh.position.x += pr.vx * dt;
    pr.mesh.position.z += pr.vz * dt;
    if (Math.abs(pr.mesh.position.x) > ARENA_HALF || Math.abs(pr.mesh.position.z) > ARENA_HALF) dead = true;
    // hit static (skip low platform deck: projectiles fly at y=1.4 above its top)
    if (!dead) for (const c of colliders) {
      if (c.barrel || c.low) continue;
      if (Math.hypot(pr.mesh.position.x - c.x, pr.mesh.position.z - c.z) < c.r) {
        burst(pr.mesh.position, 0xffcc60, 4, 5, 3); dead = true; break;
      }
    }
    // hit barrels
    if (!dead) for (const b of barrels) {
      if (b.dead) continue;
      if (pr.mesh.position.distanceTo(b.mesh.position) < 1.6) {
        b.hp -= pr.dmg;
        burst(pr.mesh.position, 0xff9040, 4, 5, 3);
        if (b.hp <= 0) detonateBarrel(b, pr.owner);
        dead = true; break;
      }
    }
    // hit cars
    if (!dead) {
      const targets = pr.owner.isPlayer ? enemies : [player, ...enemies.filter((e) => e !== pr.owner)];
      for (const t of targets) {
        if (!t.alive || t === pr.owner) continue;
        const d = Math.hypot(pr.mesh.position.x - t.pos.x, pr.mesh.position.z - t.pos.z);
        if (d < t.radius) {
          if (pr.kind === 'missile') explode({ x: pr.mesh.position.x, y: 0, z: pr.mesh.position.z }, pr.dmg, pr.owner, 7);
          else { damageCar(t, pr.dmg, pr.owner); burst(pr.mesh.position, 0xffee60, 4, 6, 3); }
          dead = true; break;
        }
      }
    }
    if (dead) { scene.remove(pr.mesh); pr.mesh.geometry.dispose(); pr.mesh.material.dispose(); projectiles.splice(i, 1); }
  }
}

/* ---------------- HUD ---------------- */
const mm = $('minimap').getContext('2d');
const markerPool = [];
function feed(text, good) {
  const kf = $('killfeed');
  const d = document.createElement('div');
  d.className = 'kf' + (good ? ' good' : ''); d.textContent = text;
  kf.prepend(d);
  while (kf.children.length > 5) kf.lastChild.remove();
  setTimeout(() => d.remove(), 5000);
}
let msgTimer = null;
function centerMsg(text, dur = 1.5) {
  const el = $('centerMsg');
  el.textContent = text; el.classList.remove('hidden');
  clearTimeout(msgTimer); msgTimer = setTimeout(() => el.classList.add('hidden'), dur * 1000);
}
let hitT = null;
function showHitmarker() {
  const el = $('hitmarker');
  el.classList.remove('hidden');
  clearTimeout(hitT); hitT = setTimeout(() => el.classList.add('hidden'), 90);
}
const projV = new THREE.Vector3();
function updateHUD() {
  $('killCounter').textContent = `Killed ${kills} of ${enemies.length}`;
  $('matchTimer').textContent = fmtTime(matchTime);
  $('weaponMissiles').textContent = player ? player.missiles : 0;
  $('weaponMgAmmo').textContent = '∞'; // MG has infinite reserve by design
  $('slot-mg').classList.toggle('active', !!(mouse.mg || keys['KeyJ']));
  $('weaponSpecial').textContent = player ? Math.floor(player.nova) + '%' : '0%';
  $('healthBar').style.width = clamp((player.hp / player.maxHp) * 100, 0, 100) + '%';
  $('healthBar').classList.toggle('low', player.hp < player.maxHp * 0.3);
  $('healthText').textContent = Math.max(0, Math.ceil(player.hp));
  $('turboBar').style.width = clamp(player.turbo, 0, 100) + '%';
  $('turboText').textContent = Math.floor(player.turbo);
  $('specialBar').style.width = clamp(player.nova, 0, 100) + '%';
  $('slot-special').classList.toggle('active', player.nova >= 100);
  $('slot-missile').classList.toggle('active', player.missiles > 0);
  $('lowhp').classList.toggle('hidden', player.hp >= player.maxHp * 0.3);
  hitFlash = Math.max(0, hitFlash - 0.03);
  $('vignette').style.opacity = reducedFlash ? hitFlash * 0.25 : hitFlash;
  // minimap
  const W = 180, S = W / (ARENA_HALF * 2 + 10);
  mm.fillStyle = '#0c0c14'; mm.fillRect(0, 0, W, W);
  mm.strokeStyle = '#ff2a3c'; mm.lineWidth = 3; mm.strokeRect(2, 2, W - 4, W - 4);
  const dot = (x, z, color, r = 3) => {
    mm.fillStyle = color;
    mm.beginPath(); mm.arc((x + ARENA_HALF) * S + 4, (z + ARENA_HALF) * S + 4, r, 0, TAU); mm.fill();
  };
  for (const c of colliders) { if (!c.barrel) dot(c.x, c.z, '#3a3a55', 2); }
  for (const b of barrels) if (!b.dead) dot(b.mesh.position.x, b.mesh.position.z, '#ff2020', 3);
  for (const p of pickups) if (p.active) dot(p.x, p.z, p.type === 'health' ? '#30ff60' : p.type === 'missiles' ? '#ff8030' : '#30c8ff', 3);
  for (const e of enemies) {
    if (!e.alive) continue;
    dot(e.pos.x, e.pos.z, '#ff2020', 4);
    // label shapes: draw triangle heading
    mm.save();
    mm.translate((e.pos.x + ARENA_HALF) * S + 4, (e.pos.z + ARENA_HALF) * S + 4);
    mm.rotate(Math.atan2(Math.sin(e.heading), -Math.cos(e.heading)) + Math.PI);
    mm.fillStyle = '#ff8080';
    mm.beginPath(); mm.moveTo(0, -6); mm.lineTo(4, 4); mm.lineTo(-4, 4); mm.closePath(); mm.fill();
    mm.restore();
  }
  if (player && player.alive) {
    mm.save();
    mm.translate((player.pos.x + ARENA_HALF) * S + 4, (player.pos.z + ARENA_HALF) * S + 4);
    mm.rotate(Math.atan2(Math.sin(player.heading), -Math.cos(player.heading)) + Math.PI);
    mm.fillStyle = '#fff';
    mm.beginPath(); mm.moveTo(0, -7); mm.lineTo(5, 5); mm.lineTo(-5, 5); mm.closePath(); mm.fill();
    mm.restore();
  }
  // enemy markers + offscreen arrows
  const cont = $('enemy-markers'), arr = $('offscreen-arrows');
  while (markerPool.length < enemies.length) {
    const d = document.createElement('div');
    d.className = 'emarker';
    d.innerHTML = '<div class="etriangle">▼</div><div class="ename"></div><div class="ehp"><i></i></div>';
    cont.appendChild(d); markerPool.push(d);
  }
  arr.innerHTML = '';
  enemies.forEach((e, i) => {
    const el = markerPool[i];
    if (!e.alive) { el.style.display = 'none'; return; }
    projV.set(e.pos.x, 3.5, e.pos.z).project(camera);
    const behind = projV.z > 1;
    const sx = (projV.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-projV.y * 0.5 + 0.5) * window.innerHeight;
    if (!behind && sx > 40 && sx < window.innerWidth - 40 && sy > 40 && sy < window.innerHeight - 40) {
      el.style.display = 'block';
      el.style.left = sx + 'px'; el.style.top = sy + 'px';
      el.querySelector('.ename').textContent = '◆ ' + e.name; // shape prefix = colorblind-safe
      el.querySelector('.ehp>i').style.width = clamp(e.hp / e.maxHp * 100, 0, 100) + '%';
    } else {
      el.style.display = 'none';
      const a = document.createElement('div');
      a.className = 'oarrow';
      let ax = behind ? window.innerWidth - sx : sx;
      let ay = behind ? window.innerHeight : sy;
      ax = clamp(ax, 50, window.innerWidth - 50); ay = clamp(ay, 90, window.innerHeight - 130);
      a.style.left = ax + 'px'; a.style.top = ay + 'px';
      const ang = Math.atan2(ay - window.innerHeight / 2, ax - window.innerWidth / 2);
      a.style.transform = `rotate(${ang}rad)`;
      a.textContent = '➤';
      a.title = e.name;
      arr.appendChild(a);
    }
  });
}

/* ---------------- camera ---------------- */
const camPos = new THREE.Vector3(0, 8, -14), camLook = new THREE.Vector3();
function updateCamera(dt) {
  const dx = Math.sin(player.heading), dz = Math.cos(player.heading);
  const dist = 10.5 + Math.abs(player.speed) * 0.08, height = 5.2 + Math.abs(player.speed) * 0.02;
  const tx = player.pos.x - dx * dist, tz = player.pos.z - dz * dist;
  camPos.x = lerp(camPos.x, tx, 1 - Math.pow(0.001, dt));
  camPos.y = lerp(camPos.y, player.y + height, 1 - Math.pow(0.01, dt));
  camPos.z = lerp(camPos.z, tz, 1 - Math.pow(0.001, dt));
  camShake = Math.max(0, camShake - dt * 3);
  const sh = reducedFlash ? camShake * 0.25 : camShake;
  camera.position.set(camPos.x + rand(-sh, sh) * 0.5, camPos.y + rand(-sh, sh) * 0.3, camPos.z + rand(-sh, sh) * 0.5);
  camLook.set(player.pos.x + dx * 8, 2 + player.y * 0.5, player.pos.z + dz * 8);
  camera.lookAt(camLook);
}

/* ---------------- game flow ---------------- */
function clearDynamic() {
  for (const p of projectiles) scene.remove(p.mesh);
  for (const p of particles) scene.remove(p.m);
  for (const d of debris) scene.remove(d.m);
  for (const s of skids) { scene.remove(s.m); }
  projectiles = []; particles = []; debris = []; skids = []; dmgNumbers = [];
  if (player) { scene.remove(player.mesh); player = null; }
  for (const e of enemies) scene.remove(e.mesh);
  enemies = [];
  $('killfeed').innerHTML = '';
}
function spawnCars() {
  const pdef = VEHICLES[selectedVehicle];
  player = makeCar({ ...pdef, color: pdef.color }, true, -1);
  player.maxHp = pdef.hp; player.hp = pdef.hp; player.name = pdef.name;
  player.pos.set(SPAWNS[0].x, 0, SPAWNS[0].z); player.heading = 0;
  player.mesh.position.copy(player.pos);
  enemies = ENEMY_DEFS.map((d, i) => {
    const c = makeCar(d, false, i);
    const hp = Math.round(d.hp * DIFFS[selectedDiff].hpMul);
    c.hp = c.maxHp = hp;
    const s = SPAWNS[(i + 1) % SPAWNS.length];
    c.pos.set(s.x + rand(-4, 4), 0, s.z + rand(-4, 4));
    c.heading = rand(0, TAU);
    c.mesh.position.copy(c.pos);
    return c;
  });
}
function startMatch() {
  AudioSys.init(); AudioSys.ui();
  selectedDiff = document.querySelector('.diff.selected')?.dataset.diff || 'pro';
  reducedFlash = $('reducedFlashMenu').checked;
  syncFlashBtn();
  clearDynamic(); buildBarrels(); buildPickups(); spawnCars();
  kills = 0; matchTime = 0; camShake = 0; hitFlash = 0;
  $('menu').classList.add('hidden'); $('endScreen').classList.add('hidden');
  $('pauseMenu').classList.add('hidden'); $('hud').classList.remove('hidden');
  $('hud').setAttribute('aria-hidden', 'false');
  state = 'countdown';
  runCountdown();
}
function runCountdown() {
  const cd = $('countdown'), num = $('countdownNumber');
  cd.classList.remove('hidden');
  const seq = ['3', '2', '1', 'GO!'];
  let i = 0;
  const step = () => {
    if (state !== 'countdown') return;
    num.textContent = seq[i];
    AudioSys.countBeep(i === 3);
    if (i === 3) centerMsg('DESTROY ALL 5 RIVALS!', 1.5);
    i++;
    if (i < seq.length) setTimeout(step, 750);
    else setTimeout(() => { cd.classList.add('hidden'); if (state === 'countdown') state = 'playing'; }, 750);
  };
  step();
}
function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    $('pauseMenu').classList.remove('hidden');
    $('pauseStats').textContent = `Kills ${kills}/5 · Time ${fmtTime(matchTime)} · Hull ${Math.max(0, Math.ceil(player.hp))}`;
    AudioSys.engine(0); AudioSys.ui();
  } else if (state === 'paused') {
    $('pauseMenu').classList.add('hidden'); state = 'playing'; AudioSys.ui();
  }
}
function restartMatch() { AudioSys.ui(); startMatch(); }
function quitToMenu() {
  state = 'menu'; clearDynamic();
  $('pauseMenu').classList.add('hidden'); $('endScreen').classList.add('hidden');
  $('hud').classList.add('hidden'); $('menu').classList.remove('hidden');
  $('startBtn').focus();
  refreshBest();
}
function endMatch(win) {
  if (state !== 'playing') return;
  state = win ? 'win' : 'loss';
  AudioSys.stinger(win);
  AudioSys.engine(0);
  const t = matchTime;
  let best = null;
  try {
    const bk = JSON.parse(localStorage.getItem('twisted-steel-best') || '{}');
    if (win && (!bk.time || t < bk.time)) { bk.time = t; }
    bk.kills = Math.max(bk.kills || 0, kills);
    localStorage.setItem('twisted-steel-best', JSON.stringify(bk));
    best = bk;
  } catch (_) {}
  $('hud').classList.add('hidden');
  $('endScreen').classList.remove('hidden');
  $('endTitle').textContent = win ? '🏆 VICTORY!' : '💀 WRECKED';
  $('endTitle').style.color = win ? '#51ff7a' : '#ff5252';
  $('endStats').textContent = win
    ? `All 5 rivals destroyed in ${fmtTime(t)} with ${player.missiles} missiles left. Hull ${Math.max(0, Math.ceil(player.hp))}.`
    : `You were destroyed. Rivals killed: ${kills} of 5 · Survived ${fmtTime(t)}.`;
  $('endBest').textContent = best ? `Best time: ${best.time ? fmtTime(best.time) : '—'} · Most kills: ${best.kills || 0}` : '';
  $('endRestartBtn').focus();
}
function refreshBest() {
  try {
    const bk = JSON.parse(localStorage.getItem('twisted-steel-best') || '{}');
    $('bestStats').textContent = (bk.time || bk.kills)
      ? `Best: ${bk.time ? fmtTime(bk.time) : '—'} · Most kills: ${bk.kills || 0}`
      : 'Best: — (no matches yet)';
  } catch (_) { $('bestStats').textContent = 'Best: —'; }
}

/* ---------------- menu wiring ---------------- */
function selectVehicle(i) {
  selectedVehicle = i;
  document.querySelectorAll('.vcard').forEach((el, j) => {
    el.classList.toggle('selected', j === i);
    el.setAttribute('aria-checked', j === i ? 'true' : 'false');
  });
  AudioSys.ui();
}
document.querySelectorAll('.vcard').forEach((el) => {
  el.addEventListener('click', () => { AudioSys.init(); selectVehicle(Number(el.dataset.veh)); });
});
document.querySelectorAll('.diff').forEach((el) => {
  el.addEventListener('click', () => {
    AudioSys.init(); AudioSys.ui();
    document.querySelectorAll('.diff').forEach((d) => {
      d.classList.toggle('selected', d === el);
      d.setAttribute('aria-checked', d === el ? 'true' : 'false');
    });
  });
});
$('startBtn').addEventListener('click', startMatch);
$('resumeBtn').addEventListener('click', togglePause);
$('restartBtnPause').addEventListener('click', restartMatch);
$('quitBtnPause').addEventListener('click', quitToMenu);
$('endRestartBtn').addEventListener('click', restartMatch);
$('menuBtn').addEventListener('click', quitToMenu);
$('pauseBtn').addEventListener('click', () => { if (state === 'playing' || state === 'paused') togglePause(); });
$('muteBtn').addEventListener('click', () => { AudioSys.init(); AudioSys.setMuted(!AudioSys.muted); });
function syncFlashBtn() {
  $('flashToggle').textContent = reducedFlash ? '✨ Flash: OFF' : '✨ Flash: ON';
  $('flashToggle').setAttribute('aria-pressed', String(reducedFlash));
}
$('flashToggle').addEventListener('click', () => { reducedFlash = !reducedFlash; syncFlashBtn(); });
function toggleFps() { showFps = !showFps; $('fpsCounter').classList.toggle('hidden', !showFps); }
$('fpsBtn').addEventListener('click', toggleFps);
// unlock audio on first interaction
window.addEventListener('pointerdown', () => AudioSys.init(), { passive: true });

/* ---------------- main loop ---------------- */
const clock = new THREE.Clock();
let hudT = 0;
function tick() {
  requestAnimationFrame(tick);
  const rawDt = Math.min(clock.getDelta(), 0.05);
  const dt = rawDt || 0.016;
  try {
    if (state === 'playing' || state === 'countdown') {
      if (state === 'playing') matchTime += dt;
      // player input
      if (player && player.alive) {
        const fwd = (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) + (keys['KeyS'] || keys['ArrowDown'] ? -1 : 0);
        const str = (keys['KeyA'] || keys['ArrowLeft'] ? -1 : 0) + (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0);
        updateCarPhysics(player, state === 'playing' ? dt : 0, state === 'playing' ? fwd : 0, str);
        if (state === 'playing') {
          if ((mouse.mg || keys['KeyJ']) ) fireMG(player);
          player.mgCd -= dt; player.missileCd -= dt; player.ramCd -= dt;
          player.nova = clamp(player.nova + dt * 1.6, 0, 100);
        }
        AudioSys.engine(clamp(Math.abs(player.speed) / 36, 0, 1), keys['ShiftLeft'] || keys['ShiftRight']);
      }
      // enemies
      for (const e of enemies) {
        if (!e.alive) continue;
        e.mgCd -= dt; e.missileCd -= dt; e.ramCd -= dt;
        e.nova = clamp(e.nova + dt * 0.8, 0, 100);
        if (state === 'playing') updateAI(e, dt);
        else updateCarPhysics(e, 0, 0, 0);
        if (e.nova >= 100 && e.aiState === 'chase' && player.alive) {
          const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
          if (d < 20) fireNova(e);
        }
      }
      // car-car collisions
      const all = player ? [player, ...enemies] : enemies;
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) carVsCar(all[i], all[j]);
      if (state === 'playing') {
        updateProjectiles(dt);
        // pickups
        for (const p of pickups) {
          if (!p.active) {
            p.respawn -= dt;
            if (p.respawn <= 0) { p.active = true; p.mesh.visible = true; }
            continue;
          }
          p.bob += dt * 3; p.core.rotation.y += dt * 2; p.core.position.y = 1.2 + Math.sin(p.bob) * 0.2;
          for (const c of all) {
            if (!c.alive) continue;
            if (Math.hypot(c.pos.x - p.x, c.pos.z - p.z) < 3.2) { applyPickup(c, p); break; }
          }
        }
        // fx decay
        for (let i = particles.length - 1; i >= 0; i--) {
          const pt = particles[i];
          pt.life -= dt;
          pt.m.position.x += pt.vx * dt; pt.m.position.y += pt.vy * dt; pt.m.position.z += pt.vz * dt;
          pt.vy -= 12 * dt;
          pt.m.material.opacity = clamp(pt.life / pt.maxLife, 0, 1);
          if (pt.life <= 0) { scene.remove(pt.m); pt.m.geometry.dispose(); pt.m.material.dispose(); particles.splice(i, 1); }
        }
        for (let i = debris.length - 1; i >= 0; i--) {
          const d = debris[i]; d.life -= dt;
          d.vy -= 20 * dt;
          d.m.position.x += d.vx * dt; d.m.position.y = Math.max(0.2, d.m.position.y + d.vy * dt); d.m.position.z += d.vz * dt;
          d.m.rotation.x += d.rx * dt; d.m.rotation.z += d.rz * dt;
          if (d.life <= 0) { scene.remove(d.m); debris.splice(i, 1); }
        }
        for (let i = skids.length - 1; i >= 0; i--) {
          skids[i].life -= dt;
          if (skids[i].life <= 0) { scene.remove(skids[i].m); skids.splice(i, 1); }
        }
        flashLight.intensity = Math.max(0, flashLight.intensity - dt * 2000);
        flashLight2.intensity = Math.max(0, flashLight2.intensity - dt * 2500);
        novaRingT = Math.max(0, novaRingT - dt);
      }
      if (player) { updateCamera(rawDt); hudT -= dt; if (hudT <= 0) { hudT = 0.05; updateHUD(); } }
    }
    // fps + auto-degrade
    fpsFrames++; fpsTime += rawDt;
    if (fpsTime >= 0.5) {
      fpsValue = Math.round(fpsFrames / fpsTime); fpsFrames = 0; fpsTime = 0;
      if (showFps) $('fpsCounter').textContent = fpsValue + ' fps';
      const pr = renderer.getPixelRatio();
      if (fpsValue < 42 && pr > 1) { renderer.setPixelRatio(Math.max(1, pr - 0.25)); lowFpsT = 0; }
      else if (fpsValue > 55 && pr < Math.min(window.devicePixelRatio || 1, 2)) { lowFpsT += 0.5; if (lowFpsT > 4) { renderer.setPixelRatio(Math.min(pr + 0.25, 2)); lowFpsT = 0; } }
    }
    renderer.render(scene, camera);
  } catch (err) {
    showError(err.message || 'frame error');
  }
}

/* ---------------- boot ---------------- */
buildArena();
refreshBest();
syncFlashBtn();
$('menu').classList.remove('hidden');
$('startBtn').focus();
tick();
