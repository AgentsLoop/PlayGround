import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const TARGET = 20, ARENA_R = 22, TIME_LIMIT = 90;
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1020);
scene.fog = new THREE.Fog(0x0b1020, 30, 90);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 300);

scene.add(new THREE.HemisphereLight(0xbdd4ff, 0x1a2438, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(12, 20, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
scene.add(sun);
const rim = new THREE.DirectionalLight(0x66aaff, 0.6);
rim.position.set(-10, 8, -12);
scene.add(rim);

// stars
{
  const g = new THREE.BufferGeometry(), n = 600, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 120 + Math.random() * 80, t = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI;
    p[i*3] = r * Math.sin(ph) * Math.cos(t); p[i*3+1] = Math.abs(r * Math.cos(ph)) * 0.6 + 2; p[i*3+2] = r * Math.sin(ph) * Math.sin(t);
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9fc4ff, size: 0.7, sizeAttenuation: true })));
}

// ground
const groundTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#16213c'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(90,160,255,0.35)'; x.lineWidth = 3;
  x.strokeRect(4, 4, 248, 248);
  x.strokeStyle = 'rgba(90,160,255,0.12)'; x.lineWidth = 1;
  x.beginPath(); x.moveTo(128, 0); x.lineTo(128, 256); x.moveTo(0, 128); x.lineTo(256, 128); x.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10);
  return t;
})();
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(ARENA_R + 3, 64),
  new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.9, metalness: 0.1 })
);
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
scene.add(ground);

// boundary ring
{
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(ARENA_R + 1.2, 0.35, 12, 90),
    new THREE.MeshStandardMaterial({ color: 0x38f0ff, emissive: 0x1a9ec4, emissiveIntensity: 1.4, roughness: 0.3 })
  );
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.6;
  scene.add(ring);
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(ARENA_R + 1.2, ARENA_R + 1.2, 2.2, 64, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x274069, transparent: true, opacity: 0.28, side: THREE.DoubleSide })
  );
  wall.position.y = 1.1; scene.add(wall);
}

// decorative pillars
for (let i = 0; i < 8; i++) {
  const a = (i / 8) * Math.PI * 2;
  const h = 2 + Math.random() * 3;
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(1, h, 1),
    new THREE.MeshStandardMaterial({ color: 0x2b3c63, emissive: 0x123, emissiveIntensity: 0.4, roughness: 0.6 })
  );
  m.position.set(Math.cos(a) * (ARENA_R - 1), h / 2, Math.sin(a) * (ARENA_R - 1));
  m.castShadow = true; scene.add(m);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0x38f0ff, emissive: 0x38f0ff, emissiveIntensity: 2 }));
  tip.position.set(m.position.x, h + 0.3, m.position.z); scene.add(tip);
}

// ---------- player ----------
const player = new THREE.Group();
scene.add(player);
let robotRoot = null, mixer = null, modelReady = false;

function buildFallbackRobot() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xe8edf5, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x11141c, roughness: 0.7 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x0af, emissive: 0x22ccff, emissiveIntensity: 2 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.6, 6, 14), white);
  body.position.y = 1.0; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 18), white);
  head.position.y = 1.85; g.add(head);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.27, 18, 18, -0.9, 1.8, 1.1, 1.0), dark);
  visor.position.set(0, 1.88, 0.12); g.add(visor);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), glow);
    eye.position.set(s * 0.12, 1.9, 0.32); g.add(eye);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

async function loadHero() {
  try {
    const gltf = await new GLTFLoader().loadAsync('public/models/robot.glb');
    robotRoot = gltf.scene;
    robotRoot.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    // normalize scale to ~1.6 units tall
    const box = new THREE.Box3().setFromObject(robotRoot);
    const size = new THREE.Vector3(); box.getSize(size);
    const s = 1.7 / Math.max(size.y, 0.001);
    const wrap = new THREE.Group(); wrap.add(robotRoot);
    robotRoot.position.sub(box.getCenter(new THREE.Vector3()).multiplyScalar(1));
    // after centering x/z, lift so feet at y=0
    const box2 = new THREE.Box3().setFromObject(wrap);
    robotRoot.position.y -= box2.min.y;
    wrap.scale.setScalar(s);
    player.add(wrap);
    if (gltf.animations?.length) {
      mixer = new THREE.AnimationMixer(wrap);
      mixer.clipAction(gltf.animations[0]).play();
      console.log('hero clips:', gltf.animations.map(a => a.name));
    }
    modelReady = true;
  } catch (e) {
    console.warn('GLB load failed, using fallback', e);
    player.add(buildFallbackRobot());
  }
}

// glow ring under player
const disc = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 32),
  new THREE.MeshBasicMaterial({ color: 0x38f0ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
disc.rotation.x = -Math.PI / 2; disc.position.y = 0.05; player.add(disc);

// ---------- orbs ----------
const orbs = [];
const orbGeo = new THREE.SphereGeometry(0.42, 20, 20);
function spawnOrb(orb) {
  const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * (ARENA_R - 5);
  orb.position.set(Math.cos(a) * r, 1.0, Math.sin(a) * r);
}
for (let i = 0; i < 12; i++) {
  const m = new THREE.Mesh(orbGeo, new THREE.MeshStandardMaterial({
    color: 0xffd34d, emissive: 0xffaa00, emissiveIntensity: 2.2, roughness: 0.25
  }));
  m.castShadow = true; spawnOrb(m); scene.add(m); orbs.push(m);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffb833, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.add(halo);
}

// ---------- hazards ----------
const hazards = [];
for (let i = 0; i < 5; i++) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 14),
    new THREE.MeshStandardMaterial({ color: 0x330a0a, roughness: 0.5 }));
  body.position.y = 0.6; body.castShadow = true; g.add(body);
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 8),
    new THREE.MeshStandardMaterial({ color: 0xff2233, emissive: 0xff0022, emissiveIntensity: 1.6, roughness: 0.35 }));
  spike.position.y = 1.5; spike.castShadow = true; g.add(spike);
  const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 12;
  g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
  g.userData = { t: Math.random() * 10, cx: g.position.x, cz: g.position.z, rad: 2 + Math.random() * 4, sp: 0.5 + Math.random() * 0.7 };
  scene.add(g); hazards.push(g);
}

// particles
const particles = [];
function burst(pos, color) {
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }));
    m.position.copy(pos);
    m.userData.v = new THREE.Vector3((Math.random()-0.5)*8, Math.random()*7, (Math.random()-0.5)*8);
    m.userData.life = 0.7;
    scene.add(m); particles.push(m);
  }
}

// audio (procedural)
let AC = null;
function beep(freq, dur = 0.12, type = 'sine', vol = 0.15) {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + dur);
    o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime + dur);
  } catch {}
}

// ---------- state & input ----------
const S = { running: false, score: 0, lives: 3, time: TIME_LIMIT, invuln: 0, vel: new THREE.Vector3(), yaw: 0 };
const keys = {};
addEventListener('keydown', e => { keys[e.code] = true; if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault(); });
addEventListener('keyup', e => keys[e.code] = false);

const stick = document.getElementById('stick'), nub = document.getElementById('nub');
let joy = { x: 0, y: 0, id: null };
function stickPos(e) {
  const r = stick.getBoundingClientRect();
  const t = e.changedTouches ? e.changedTouches[0] : e;
  let dx = (t.clientX - (r.left + r.width / 2)) / (r.width / 2);
  let dy = (t.clientY - (r.top + r.height / 2)) / (r.height / 2);
  const l = Math.hypot(dx, dy) || 1;
  if (l > 1) { dx /= l; dy /= l; }
  return { dx, dy };
}
stick.addEventListener('touchstart', e => { e.preventDefault(); const { dx, dy } = stickPos(e); joy.x = dx; joy.y = dy; }, { passive: false });
stick.addEventListener('touchmove', e => { e.preventDefault(); const { dx, dy } = stickPos(e); joy.x = dx; joy.y = dy; nub.style.transform = `translate(${dx*30}px,${dy*30}px)`; }, { passive: false });
stick.addEventListener('touchend', () => { joy.x = joy.y = 0; nub.style.transform = ''; });

const overlay = document.getElementById('overlay');
const playBtn = document.getElementById('playBtn');
const hudScore = document.getElementById('hud-score');
const hudLives = document.getElementById('hud-lives');
const hudTime = document.getElementById('hud-time');
const toast = document.getElementById('toast');
let toastT = null;
function say(msg) {
  toast.textContent = msg; toast.style.opacity = 1;
  clearTimeout(toastT); toastT = setTimeout(() => toast.style.opacity = 0, 1400);
}
playBtn.onclick = () => { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); startGame(); };
function startGame() {
  S.running = true; S.presented = true; S.score = 0; S.lives = 3; S.time = TIME_LIMIT; S.invuln = 0;
  player.position.set(0, 0, 0);
  orbs.forEach(spawnOrb);
  overlay.classList.add('hidden');
  say('Collect the orbs! ⚡');
  beep(660, 0.15, 'square');
}
function endGame(win) {
  S.running = false;
  overlay.classList.remove('hidden');
  overlay.querySelector('h1').textContent = win ? '🏆 You win!' : '💥 Game over';
  overlay.querySelector('p').innerHTML = win
    ? `You collected <b>${S.score}</b> orbs with <b>${Math.ceil(S.time)}s</b> left!`
    : `You scored <b>${S.score} / ${TARGET}</b>. Try again!`;
  playBtn.textContent = '↻ Play again';
  beep(win ? 880 : 160, 0.4, win ? 'sine' : 'sawtooth', 0.2);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- loop ----------
const clock = new THREE.Clock();
const camTarget = new THREE.Vector3();
function update(dt, t) {
  // orbs idle motion
  for (const o of orbs) { o.rotation.y += dt * 2; o.position.y = 1.0 + Math.sin(t * 3 + o.position.x) * 0.22; }
  // hazards patrol
  for (const h of hazards) {
    const u = h.userData; u.t += dt * u.sp;
    h.position.x = u.cx + Math.cos(u.t) * u.rad;
    h.position.z = u.cz + Math.sin(u.t) * u.rad;
    h.children[1].rotation.y += dt * 3;
    h.position.x = THREE.MathUtils.clamp(h.position.x, -ARENA_R, ARENA_R);
    h.position.z = THREE.MathUtils.clamp(h.position.z, -ARENA_R, ARENA_R);
  }
  // particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.userData.life -= dt;
    p.userData.v.y -= 12 * dt;
    p.position.addScaledVector(p.userData.v, dt);
    p.material.opacity = Math.max(0, p.userData.life);
    if (p.userData.life <= 0) { scene.remove(p); particles.splice(i, 1); }
  }
  disc.material.opacity = 0.55 + Math.sin(t * 5) * 0.25;
  if (mixer) mixer.update(dt);

  if (!S.running) {
    // idle camera orbit
    camera.position.set(Math.cos(t * 0.25) * 14, 7, Math.sin(t * 0.25) * 14);
    camera.lookAt(0, 1.2, 0);
    if (!S.presented) {
      // before the first run, park the hero beside the title card, facing the camera
      const toC = new THREE.Vector3(-camera.position.x, 0, -camera.position.z).normalize();
      const right = new THREE.Vector3(-toC.z, 0, toC.x); // screen-right for a camera looking along toC
      player.position.copy(camera.position).addScaledVector(toC, 7).addScaledVector(right, -4.2);
      player.position.y = 0;
    }
    const faceYaw = Math.atan2(camera.position.x - player.position.x, camera.position.z - player.position.z);
    let d = faceYaw - S.yaw;
    while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    S.yaw += d * Math.min(1, dt * 5);
    player.rotation.y = S.yaw;
    player.position.y = Math.sin(t * 2) * 0.12;
    return;
  }

  // input
  let ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joy.x;
  let iz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0) + joy.y;
  const boost = (keys.ShiftLeft || keys.ShiftRight) ? 1.6 : 1;
  const len = Math.hypot(ix, iz);
  if (len > 1) { ix /= len; iz /= len; }
  const speed = 8 * boost;
  // camera-relative movement
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const move = new THREE.Vector3().addScaledVector(fwd, -iz).addScaledVector(right, ix);
  if (move.lengthSq() > 0.001) {
    move.normalize();
    player.position.addScaledVector(move, speed * dt);
    const targetYaw = Math.atan2(move.x, move.z);
    let d = targetYaw - S.yaw;
    while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    S.yaw += d * Math.min(1, dt * 10);
    player.rotation.y = S.yaw;
    player.position.y = Math.abs(Math.sin(t * 10)) * 0.08;
  }
  // arena clamp
  const pr = Math.hypot(player.position.x, player.position.z);
  if (pr > ARENA_R) { player.position.multiplyScalar(ARENA_R / pr); }

  // camera follow
  camTarget.set(player.position.x - Math.sin(S.yaw) * 8, 5.2, player.position.z - Math.cos(S.yaw) * 8);
  camera.position.lerp(camTarget, Math.min(1, dt * 4));
  camera.lookAt(player.position.x, 1.6, player.position.z);

  // orb pickup
  for (const o of orbs) {
    if (player.position.distanceTo(o.position) < 1.25) {
      S.score++;
      burst(o.position, 0xffcc33); beep(520 + S.score * 30, 0.12, 'sine');
      spawnOrb(o);
      hudScore.textContent = `⚡ ${S.score} / ${TARGET}`;
      if (S.score >= TARGET) { endGame(true); return; }
      else if (S.score % 5 === 0) say(`${S.score} orbs! Keep going!`);
    }
  }
  // hazard hit
  S.invuln = Math.max(0, S.invuln - dt);
  player.visible = S.invuln <= 0 || Math.floor(t * 10) % 2 === 0;
  if (S.invuln <= 0) {
    for (const h of hazards) {
      if (player.position.distanceTo(h.position) < 1.3) {
        S.lives--; S.invuln = 1.6;
        burst(player.position.clone().setY(1), 0xff3344); beep(140, 0.3, 'sawtooth', 0.2);
        hudLives.textContent = '❤'.repeat(S.lives) + '🖤'.repeat(Math.max(0, 3 - S.lives));
        // knockback
        const k = player.position.clone().sub(h.position).setY(0).normalize().multiplyScalar(4);
        player.position.add(k);
        say(S.lives > 0 ? 'Ouch! Spike-bot hit!' : 'No lives left!');
        if (S.lives <= 0) { endGame(false); return; }
        break;
      }
    }
  }
  // timer
  S.time -= dt;
  hudTime.textContent = `⏱ ${Math.max(0, Math.ceil(S.time))}`;
  if (S.time <= 10 && S.time > 0) hudTime.style.color = '#ff8899'; else hudTime.style.color = '';
  if (S.time <= 0) { endGame(false); return; }
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt, clock.elapsedTime);
  renderer.render(scene, camera);
});

loadHero();
document.body.dataset.gameState = 'ready';
window.__game = { S, player, orbs, hazards, startGame, endGame, THREE };
