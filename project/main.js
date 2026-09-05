import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const canvas = document.getElementById('game');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start-btn');
const statusLine = document.getElementById('status-line');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const timeEl = document.getElementById('time');
const starsLeftEl = document.getElementById('stars-left');

const ARENA = 26;          // half-size of play field
const TOTAL_STARS = 12;
const GAME_TIME = 60;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070f);
scene.fog = new THREE.Fog(0x05070f, 40, 110);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 300);

scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x1a1030, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(12, 20, 8);
scene.add(sun);
const neon = new THREE.PointLight(0x4f7cff, 1.2, 60);
neon.position.set(0, 8, 0);
scene.add(neon);

// Ground grid + starfield
const grid = new THREE.GridHelper(ARENA * 2 + 10, 30, 0x4f7cff, 0x223066);
grid.position.y = -2.2;
scene.add(grid);

function makeStarfield() {
  const g = new THREE.BufferGeometry();
  const N = 900;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 90 + Math.random() * 60;
    const t = Math.random() * Math.PI * 2;
    const p = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(p) * Math.cos(t);
    pos[i * 3 + 1] = Math.abs(r * Math.cos(p)) - 5;
    pos[i * 3 + 2] = r * Math.sin(p) * Math.sin(t);
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.7 }));
}
scene.add(makeStarfield());

// ---- Player rig ----
const playerRig = new THREE.Group();   // moves on XZ
const playerTilt = new THREE.Group();  // visual banking
playerRig.add(playerTilt);
playerRig.position.set(0, 0, 10);
scene.add(playerRig);

let shipModel = null;
async function loadShip() {
  const loader = new GLTFLoader();
  const urls = ['./public/models/spaceship.glb', './models/spaceship.glb'];
  for (const u of urls) {
    try {
      const gltf = await loader.loadAsync(u);
      return gltf.scene;
    } catch (e) { /* try next */ }
  }
  return null;
}

function fallbackShip() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.ConeGeometry(0.7, 2.4, 8),
    new THREE.MeshStandardMaterial({ color: 0xff7a2a, roughness: 0.4, metalness: 0.3 })
  );
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const wingMat = new THREE.MeshStandardMaterial({ color: 0x2a3a5f, roughness: 0.5, metalness: 0.4 });
  const w1 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.8), wingMat);
  w1.position.z = 0.5; g.add(w1);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0x66ccff }));
  glow.position.z = 1.25; g.add(glow);
  return g;
}

// ---- Pickups & hazards ----
const stars = [];
const asteroids = [];
const starGeo = new THREE.OctahedronGeometry(0.7);
const starMat = new THREE.MeshStandardMaterial({ color: 0xffd54f, emissive: 0xffb300, emissiveIntensity: 1.2, roughness: 0.2, metalness: 0.6 });
const rockGeo = new THREE.IcosahedronGeometry(1.1, 0);
const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8f9d, roughness: 0.9, metalness: 0.1, flatShading: true });

function randPos(margin = 3, avoid = null, avoidDist = 5) {
  for (let tries = 0; tries < 20; tries++) {
    const p = new THREE.Vector3(
      (Math.random() * 2 - 1) * (ARENA - margin),
      0,
      (Math.random() * 2 - 1) * (ARENA - margin)
    );
    if (!avoid || p.distanceTo(avoid) >= avoidDist) return p;
  }
  return new THREE.Vector3(-ARENA + margin, 0, -ARENA + margin);
}

function spawnWorld() {
  for (const s of stars) scene.remove(s.mesh);
  for (const a of asteroids) scene.remove(a.mesh);
  stars.length = 0; asteroids.length = 0;
  const spawn = new THREE.Vector3(0, 0, 10);
  for (let i = 0; i < TOTAL_STARS; i++) {
    const m = new THREE.Mesh(starGeo, starMat.clone());
    m.position.copy(randPos(3, spawn, 5)).y = 0.2 + Math.random() * 0.8;
    scene.add(m);
    stars.push({ mesh: m, taken: false, phase: Math.random() * Math.PI * 2 });
  }
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(rockGeo, rockMat);
    const s = 0.7 + Math.random() * 0.9;
    m.scale.setScalar(s);
    m.position.copy(randPos(5, spawn, 6)).y = 0;
    m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    scene.add(m);
    asteroids.push({ mesh: m, vel: new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2), spin: (Math.random() - 0.5) * 2, radius: s * 1.1 });
  }
}

// ---- Audio blips (no assets) ----
let audioCtx = null;
function beep(freq, dur = 0.12, type = 'sine', vol = 0.15) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch (e) {}
}

// ---- Game state ----
const state = { mode: 'menu', score: 0, lives: 3, timeLeft: GAME_TIME, collected: 0, invuln: 0 };
const keys = {};
window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key.toLowerCase())) e.preventDefault(); });
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
document.querySelectorAll('#touch-controls button').forEach(b => {
  const d = b.dataset.dir;
  const on = e => { e.preventDefault(); keys[d] = true; };
  const off = e => { e.preventDefault(); keys[d] = false; };
  b.addEventListener('pointerdown', on);
  b.addEventListener('pointerup', off);
  b.addEventListener('pointerleave', off);
});
// map touch buttons to movement keys
function touchActive(name) { return keys[name]; }

function updateHUD() {
  scoreEl.textContent = `⭐ ${state.score}`;
  livesEl.textContent = '❤️'.repeat(state.lives) + '🖤'.repeat(Math.max(0, 3 - state.lives));
  timeEl.textContent = `⏱ ${Math.ceil(state.timeLeft)}`;
  starsLeftEl.textContent = `◆ ${state.collected}/${TOTAL_STARS}`;
}

function endGame(win, reason) {
  state.mode = 'over';
  overlay.classList.remove('hidden');
  overlay.querySelector('h1').textContent = win ? '🏆 YOU WIN!' : '💥 GAME OVER';
  overlay.querySelector('.sub').innerHTML = win
    ? `You collected all <b>${TOTAL_STARS} stars</b> with <b>${Math.ceil(state.timeLeft)}s</b> left! Score: <b>${state.score}</b>`
    : `${reason}<br>Score: <b>${state.score}</b> — Stars: <b>${state.collected}/${TOTAL_STARS}</b>`;
  startBtn.textContent = '↻ Play Again';
  beep(win ? 880 : 160, 0.4, win ? 'sine' : 'sawtooth', 0.2);
}

function startGame() {
  state.mode = 'play';
  state.score = 0; state.lives = 3; state.timeLeft = GAME_TIME; state.collected = 0; state.invuln = 1.0;
  playerRig.position.set(0, 0, 10);
  spawnWorld();
  updateHUD();
  overlay.classList.add('hidden');
  beep(440, 0.15);
}
startBtn.addEventListener('click', startGame);

const SPEED = 14;
const clock = new THREE.Clock();

function update(dt, t) {
  // idle menu rotation
  if (state.mode !== 'play') {
    playerRig.rotation.y += dt * 0.6;
    for (const s of stars) { s.mesh.rotation.y += dt; }
    return;
  }
  state.timeLeft -= dt;
  state.invuln = Math.max(0, state.invuln - dt);

  let mx = 0, mz = 0;
  if (keys['a'] || keys['arrowleft'] || touchActive('left')) mx -= 1;
  if (keys['d'] || keys['arrowright'] || touchActive('right')) mx += 1;
  if (keys['w'] || keys['arrowup'] || touchActive('up')) mz -= 1;
  if (keys['s'] || keys['arrowdown'] || touchActive('down')) mz += 1;
  const len = Math.hypot(mx, mz) || 1;
  playerRig.position.x = THREE.MathUtils.clamp(playerRig.position.x + (mx / len) * SPEED * dt, -ARENA, ARENA);
  playerRig.position.z = THREE.MathUtils.clamp(playerRig.position.z + (mz / len) * SPEED * dt, -ARENA, ARENA);
  playerTilt.rotation.z = THREE.MathUtils.lerp(playerTilt.rotation.z, -mx * 0.4, 0.15);
  playerTilt.rotation.x = THREE.MathUtils.lerp(playerTilt.rotation.x, mz * 0.25, 0.15);
  playerTilt.position.y = Math.sin(t * 3) * 0.12;
  if (shipModel) shipModel.rotation.y = Math.PI; // face -Z (forward)

  // blink when invulnerable
  playerTilt.visible = state.invuln > 0 ? (Math.floor(t * 10) % 2 === 0) : true;

  // stars
  for (const s of stars) {
    if (s.taken) continue;
    s.mesh.rotation.y += dt * 2.5;
    s.mesh.position.y = 0.5 + Math.sin(t * 2 + s.phase) * 0.25;
    if (s.mesh.position.distanceTo(playerRig.position) < 1.8) {
      s.taken = true;
      scene.remove(s.mesh);
      state.collected++;
      state.score += 10;
      beep(660 + state.collected * 30, 0.12);
      updateHUD();
      if (state.collected >= TOTAL_STARS) { endGame(true); return; }
    }
  }
  // asteroids drift + collide
  for (const a of asteroids) {
    a.mesh.position.addScaledVector(a.vel, dt);
    a.mesh.rotation.x += dt * a.spin;
    a.mesh.rotation.y += dt * a.spin * 0.7;
    for (const ax of ['x', 'z']) {
      if (Math.abs(a.mesh.position[ax]) > ARENA) a.vel[ax] *= -1;
      a.mesh.position[ax] = THREE.MathUtils.clamp(a.mesh.position[ax], -ARENA, ARENA);
    }
    if (state.invuln <= 0 && a.mesh.position.distanceTo(playerRig.position) < a.radius + 1.0) {
      state.lives--;
      state.invuln = 1.5;
      state.score = Math.max(0, state.score - 5);
      beep(140, 0.3, 'sawtooth');
      updateHUD();
      if (state.lives <= 0) { endGame(false, 'Your ship was destroyed by asteroids!'); return; }
    }
  }

  if (state.timeLeft <= 0) {
    state.timeLeft = 0; updateHUD();
    if (state.collected >= TOTAL_STARS) endGame(true);
    else endGame(false, 'Time ran out!');
    return;
  }
  updateHUD();
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  update(dt, t);
  // chase camera
  const camTarget = new THREE.Vector3(playerRig.position.x * 0.6, 9, playerRig.position.z + 13);
  camera.position.lerp(camTarget, 0.06);
  camera.lookAt(playerRig.position.x * 0.8, 0, playerRig.position.z - 4);
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// boot
spawnWorld();
updateHUD();
animate();
loadShip().then(model => {
  if (model) {
    shipModel = model;
    // The source GLB uses archived KHR_materials_pbrSpecularGlossiness with no
    // textures, so Three.js renders it near-white. Tint by part index to
    // restore an orange/grey look matching the Sketchfab thumbnail.
    const palette = [0xff7a2a, 0x2e3a55, 0x9fb2cc, 0x303848, 0x66ccff, 0xff5252, 0xbbbbbb];
    let i = 0;
    model.traverse(o => {
      if (o.isMesh) {
        o.material = new THREE.MeshStandardMaterial({
          color: palette[i++ % palette.length], roughness: 0.45, metalness: 0.35
        });
        o.castShadow = false;
      }
    });
    // normalize scale: frame from visible bounds
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const s = 2.6 / maxDim;
    model.scale.setScalar(s);
    const c = box.getCenter(new THREE.Vector3());
    model.position.sub(c.clone().multiplyScalar(s));
    model.position.y += 0;
    playerTilt.add(model);
    statusLine.textContent = '✅ Spaceship loaded — press Start!';
  } else {
    playerTilt.add(fallbackShip());
    statusLine.textContent = '⚠️ GLB not found, using fallback ship — press Start!';
  }
  window.__shipLoaded = true;
}).catch(() => {
  playerTilt.add(fallbackShip());
  statusLine.textContent = '⚠️ GLB failed, using fallback ship — press Start!';
  window.__shipLoaded = true;
});
window.__game = { state, startGame };
