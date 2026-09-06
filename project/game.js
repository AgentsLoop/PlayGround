import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

/* ============================================================
   STRIKEPOINT — tactical compound assault (Three.js FPS)
   Viewmodel: "Low poly M4 rifle" by Jithran (CC Attribution)
   Enemies: "FREE [Military Soldier] RIGGED" by BAMEN (CC Attr.)
   ============================================================ */
const $ = id => document.getElementById(id);
const hudEl = $('hud'), menuEl = $('menu'), overEl = $('gameover');
const params = new URLSearchParams(location.search);
const BARE = params.has('bare');          // headless-screenshot mode
const clamp = THREE.MathUtils.clamp;

/* ---------------- Audio (all procedural, no assets) ---------------- */
let AC = null;
function ac() { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); return AC; }
function noiseBuf(c, dur, pow = 2.2) {
  const b = c.createBuffer(1, c.sampleRate * dur, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, pow);
  return b;
}
function playShot(enemyFar = 0) {
  try {
    const c = ac(), t = c.currentTime, dur = 0.22;
    const src = c.createBufferSource(); src.buffer = noiseBuf(c, dur);
    const f = c.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(6500 * (0.9 + Math.random() * 0.2), t);
    f.frequency.exponentialRampToValueAtTime(400, t + 0.18);
    const g = c.createGain(); const vol = enemyFar ? 0.22 / (1 + enemyFar * 0.08) : 0.5;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(c.destination); src.start(t);
    const o = c.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g2 = c.createGain(); g2.gain.setValueAtTime(0.22, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g2); g2.connect(c.destination); o.start(t); o.stop(t + 0.13);
  } catch (e) { /* audio unavailable */ }
}
function playHit(kill) {
  try {
    const c = ac(), t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(kill ? 1400 : 1050, t);
    o.frequency.exponentialRampToValueAtTime(kill ? 500 : 800, t + 0.08);
    g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.11);
  } catch (e) {}
}
function playReload() {
  try {
    const c = ac(), t = c.currentTime;
    [0, 0.18, 0.55].forEach((off, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'square'; o.frequency.setValueAtTime(300 + i * 150, t + off);
      g.gain.setValueAtTime(0.12, t + off); g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.07);
      o.connect(g); g.connect(c.destination); o.start(t + off); o.stop(t + off + 0.08);
    });
  } catch (e) {}
}
function playHurt() {
  try {
    const c = ac(), t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.25);
    g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.3);
  } catch (e) {}
}

/* ---------------- Renderer / scene ---------------- */
const canvas = $('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd9b98c, 28, 115);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 500);
const playerObj = new THREE.Object3D();
playerObj.position.set(0, 1.7, 22);
playerObj.add(camera);
scene.add(playerObj);
/* NOTE: never scene.add(camera) — it would reparent the camera away from
   playerObj (Object3D.add removes from the previous parent). The camera
   stays in the graph via playerObj, so its children (rifle rig, fill) render. */

/* Lights */
scene.add(new THREE.HemisphereLight(0xbdd7ff, 0x8a6b4a, 0.85));
const sun = new THREE.DirectionalLight(0xffe9c4, 2.3);
sun.position.set(38, 55, 22);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -55; sun.shadow.camera.right = 55;
sun.shadow.camera.top = 55; sun.shadow.camera.bottom = -55;
sun.shadow.camera.far = 220; sun.shadow.bias = -0.0004;
scene.add(sun);
const rim = new THREE.DirectionalLight(0x8fb4ff, 0.3);
rim.position.set(-30, 20, -40);
scene.add(rim);
/* Camera fill light so the viewmodel always reads well */
const fill = new THREE.PointLight(0xfff2dd, 1.6, 4.5, 1.8);
fill.position.set(0.2, 0.1, -0.4);
camera.add(fill);

/* Sky dome + sun disc */
{
  const skyGeo = new THREE.SphereGeometry(420, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x2f6fd0) },
      mid: { value: new THREE.Color(0x9fc3e2) },
      bot: { value: new THREE.Color(0xe6c48d) },
      sunDir: { value: new THREE.Vector3(38, 55, 22).normalize() }
    },
    vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 top,mid,bot,sunDir;
      void main(){ vec3 d=normalize(vP); float h=d.y*0.5+0.5;
        vec3 c=mix(bot,mid,smoothstep(0.42,0.62,h)); c=mix(c,top,smoothstep(0.62,0.95,h));
        float s=max(dot(d,normalize(sunDir)),0.0);
        c+=vec3(1.0,0.85,0.6)*pow(s,600.0)*1.6 + vec3(1.0,0.8,0.55)*pow(s,8.0)*0.18;
        gl_FragColor=vec4(c,1.0); }`
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
  /* Procedural drifting clouds (soft sprites, horizon haze layer) */
  const cloudTex = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const x = c.getContext('2d');
    [[40, 38, 26], [64, 30, 30], [90, 38, 24], [64, 42, 28]].forEach(([cx, cy, r]) => {
      const g = x.createRadialGradient(cx, cy, 2, cx, cy, r);
      g.addColorStop(0, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 64);
    });
    return new THREE.CanvasTexture(c);
  })();
  window.__clouds = [];
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.5 + Math.random() * 0.3, depthWrite: false, fog: false }));
    s.position.set((Math.random() - 0.5) * 600, 90 + Math.random() * 90, -180 - Math.random() * 150);
    s.scale.set(90 + Math.random() * 90, 28 + Math.random() * 22, 1);
    scene.add(s); window.__clouds.push(s);
  }
}

/* ---------------- Procedural textures ---------------- */
function canvasTex(fn, s = 512, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = c.height = s;
  fn(c.getContext('2d'), s);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const groundTex = canvasTex((c, s) => {
  c.fillStyle = '#c4a26d'; c.fillRect(0, 0, s, s);
  c.fillStyle = '#8f8f8c'; c.fillRect(s * 0.26, s * 0.26, s * 0.48, s * 0.48);
  c.fillStyle = '#7c7c79'; c.fillRect(s * 0.26, s * 0.48, s * 0.48, s * 0.04);
  c.strokeStyle = 'rgba(60,50,35,.35)'; c.lineWidth = 2;
  for (let i = 0; i <= 6; i++) {
    c.beginPath(); c.moveTo(i * s / 6, 0); c.lineTo(i * s / 6, s); c.stroke();
    c.beginPath(); c.moveTo(0, i * s / 6); c.lineTo(s, i * s / 6); c.stroke();
  }
  for (let i = 0; i < 1400; i++) {
    c.fillStyle = `rgba(${Math.random() > 0.5 ? '0,0,0' : '255,240,210'},${(Math.random() * 0.1).toFixed(3)})`;
    c.fillRect(Math.random() * s, Math.random() * s, 2.5, 2.5);
  }
}, 512, 16, 16);
const crateTex = canvasTex((c, s) => {
  c.fillStyle = '#7a5c33'; c.fillRect(0, 0, s, s);
  for (let i = 0; i < 500; i++) { c.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; c.fillRect(Math.random() * s, Math.random() * s, 3, 2); }
  c.strokeStyle = '#43300f'; c.lineWidth = 14; c.strokeRect(10, 10, s - 20, s - 20);
  c.lineWidth = 8; c.beginPath(); c.moveTo(0, 0); c.lineTo(s, s); c.moveTo(s, 0); c.lineTo(0, s); c.stroke();
});
const contTex = canvasTex((c, s) => {
  c.fillStyle = '#2e6e5e'; c.fillRect(0, 0, s, s);
  c.fillStyle = 'rgba(255,255,255,.14)';
  for (let i = 0; i < 10; i++) c.fillRect(i * s / 10 + 5, 0, 7, s);
  c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(0, 0, s, 18); c.fillRect(0, s - 18, s, 18);
  c.fillStyle = '#e8e8e8'; c.font = 'bold 44px sans-serif'; c.fillText('T-07', s * 0.32, s * 0.55);
});
const wallTex = canvasTex((c, s) => {
  c.fillStyle = '#b3a284'; c.fillRect(0, 0, s, s);
  for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(0,0,0,${Math.random() * 0.09})`; c.fillRect(Math.random() * s, Math.random() * s, 3, 3); }
  c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(0, 0, s, 10);
  for (let y = 0; y < s; y += 64) { c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(0, y, s, 3); }
}, 512, 6, 1);

/* ---------------- Map ---------------- */
const colliders = [];   // THREE.Box3
const solids = [];      // meshes for bullet impact
const spawnPoints = [new THREE.Vector3(-12, 0, 6), new THREE.Vector3(12, 0, 2),
  new THREE.Vector3(0, 0, -14), new THREE.Vector3(-14, 0, -10), new THREE.Vector3(14, 0, -12)];

function addSolid(mesh) {
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh); mesh.updateMatrixWorld(true);
  colliders.push(new THREE.Box3().setFromObject(mesh));
  solids.push(mesh);
  return mesh;
}
{
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(130, 130),
    new THREE.MeshStandardMaterial({ map: groundTex, color: 0xbfb3a1, roughness: 1, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground); solids.push(ground);
  /* Low walled rooms / dividers for depth */
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 1 });
  [[0, -28, 62, 2.2], [0, 28, 62, 2.2], [-29, 0, 2.2, 60], [29, 0, 2.2, 60]].forEach(([x, z, w, d]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 4.2, d), wallMat);
    m.position.set(x, 2.1, z); addSolid(m);
  });
  [[-8, -14, 10, 1], [8, 12, 10, 1]].forEach(([x, z, w, d]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, d), wallMat);
    m.position.set(x, 1.1, z); addSolid(m);
  });
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.9 });
  const contMat = new THREE.MeshStandardMaterial({ map: contTex, roughness: 0.6, metalness: 0.3 });
  const barMat = new THREE.MeshStandardMaterial({ color: 0x9a8a68, roughness: 0.9 });
  const put = (w, h, d, x, z, mat, ry = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, h / 2, z); m.rotation.y = ry; return addSolid(m);
  };
  put(2, 2, 2, -6, 2, crateMat); put(2, 2, 2, -6, 2, crateMat).position.y = 2 + 1; // stacked
  put(2, 2, 2, 6, -2, crateMat); put(1.6, 1.6, 1.6, 6.4, -2.2, crateMat).position.y = 2 + 0.8;
  put(2, 1.2, 2, 0, 6, crateMat); put(2, 2, 2, -2, -8, crateMat);
  put(6, 2.6, 2.4, -11, -2, contMat, 0.25); put(6, 2.6, 2.4, 11, -6, contMat, -0.3);
  put(6, 2.6, 2.4, 2, -18, contMat, 0.05);
  put(3.2, 1, 1, -3, 12, barMat); put(3.2, 1, 1, 4, -12, barMat); put(3.2, 1, 1, -12, 12, barMat, 0.5);
  put(1.4, 1.4, 1.4, 14, 8, crateMat); put(1.4, 1.4, 1.4, -15, -4, crateMat);
  /* Watchtower */
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.95 });
  const tw = new THREE.Group(); tw.position.set(-19, 0, -19);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6, 0.4), wood);
    leg.position.set(lx, 3, lz); leg.castShadow = true; tw.add(leg);
  });
  const cab = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.7, 3.4), wood);
  cab.position.y = 6.6; cab.castShadow = true; tw.add(cab);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.25, 4.2),
    new THREE.MeshStandardMaterial({ color: 0x3d3d3d, roughness: 0.8 }));
  roof.position.y = 7.7; tw.add(roof); scene.add(tw); tw.updateMatrixWorld(true);
  colliders.push(new THREE.Box3().setFromObject(tw)); solids.push(cab);
  /* Sandbag lines (stacked squashed spheres + one box collider each) */
  const bagMat = new THREE.MeshStandardMaterial({ color: 0x9d8a5f, roughness: 1 });
  const bagGeo = new THREE.SphereGeometry(0.32, 8, 6);
  function sandbags(x, z, len, ry = 0) {
    const grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.y = ry;
    for (let r = 0; r < 2; r++)
      for (let i = 0; i < len; i++) {
        const b = new THREE.Mesh(bagGeo, bagMat);
        b.position.set((i - (len - 1) / 2) * 0.58 + (r ? 0.29 : 0), 0.17 + r * 0.3, (Math.random() - 0.5) * 0.06);
        b.scale.set(1, 0.55, 0.8); b.castShadow = b.receiveShadow = true; grp.add(b);
      }
    scene.add(grp); grp.updateMatrixWorld(true);
    colliders.push(new THREE.Box3().setFromObject(grp));
    grp.traverse(o => { if (o.isMesh) solids.push(o); });
  }
  sandbags(-7, 15, 7, 0.1); sandbags(8, -11, 7, -0.15); sandbags(-14, 3, 5, 1.35);
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x7a2e22, roughness: 0.6, metalness: 0.4 });
  [[-4, -16], [-3, -16.6], [9, 8]].forEach(([x, z]) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.3, 14), barrelMat);
    b.position.set(x, 0.65, z); addSolid(b);
  });
  /* Floating dust */
  const N = 320, p = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { p[i * 3] = (Math.random() - 0.5) * 95; p[i * 3 + 1] = Math.random() * 11; p[i * 3 + 2] = (Math.random() - 0.5) * 95; }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(p, 3));
  window.__dust = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xe8d0a0, size: 0.05, transparent: true, opacity: 0.3 }));
  scene.add(window.__dust);
}

/* ---------------- Player state ---------------- */
const P = {
  yaw: 0, pitch: 0, vy: 0, grounded: true, bobT: 0,
  hp: 100, lastDmg: -9999, alive: true, started: false,
  kills: 0, wave: 1, shotsFired: 0, shotsHit: 0,
  keys: {}, firing: false, ads: false,
  ammo: 30, MAG: 30, reloading: false, lastShot: 0, RPM: 600,
  moveX: 0, moveZ: 0, // touch stick
};
addEventListener('keydown', e => { P.keys[e.code] = true; if (e.code === 'KeyR') reload(); });
addEventListener('keyup', e => { P.keys[e.code] = false; });
addEventListener('mousedown', e => {
  if (!P.started || !P.alive) return;
  if (document.pointerLockElement && e.button === 0) P.firing = true;
  if (e.button === 2) P.ads = true;
});
addEventListener('mouseup', e => {
  if (e.button === 0) P.firing = false;
  if (e.button === 2) P.ads = false;
});
addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && P.started && P.alive && !BARE && !isTouch) pauseToMenu();
});
addEventListener('mousemove', e => {
  if (!document.pointerLockElement || !P.started) return;
  P.yaw -= e.movementX * 0.0021; P.pitch -= e.movementY * 0.0021;
  P.pitch = clamp(P.pitch, -1.5, 1.5);
  playerObj.rotation.y = P.yaw; camera.rotation.x = P.pitch;
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ---------------- Weapon viewmodel ---------------- */
const rig = new THREE.Group();
const HIP = new THREE.Vector3(0.26, -0.25, -0.5);
const ADS = new THREE.Vector3(0, -0.155, -0.35);
rig.position.copy(HIP);
camera.add(rig);
const muzzleTip = new THREE.Object3D();
let flashMesh, flashLight, gunReady = false;

function buildFallbackRifle() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.65, metalness: 0.4 });
  const acc = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.5, metalness: 0.55 });
  const tan = new THREE.MeshStandardMaterial({ color: 0x8a6b46, roughness: 0.85 });
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
  box(0.09, 0.11, 0.46, mat, 0, 0, 0);
  box(0.05, 0.05, 0.42, acc, 0, 0.01, -0.42);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.3, 10), acc);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.01, -0.72); g.add(barrel);
  box(0.06, 0.16, 0.09, tan, 0, -0.12, -0.05);
  const mag = box(0.055, 0.18, 0.08, acc, 0, -0.14, -0.22); mag.rotation.x = 0.25;
  box(0.03, 0.06, 0.03, acc, 0, 0.085, -0.02);
  box(0.07, 0.02, 0.02, acc, 0, 0.09, 0.12);
  box(0.09, 0.09, 0.22, tan, 0, -0.02, 0.22);
  muzzleTip.position.set(0, 0.01, -0.9); g.add(muzzleTip);
  return g;
}
function addMuzzleFX() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.35, 'rgba(255,190,90,0.95)');
  g.addColorStop(1, 'rgba(255,120,20,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const m = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  flashMesh = new THREE.Group();
  const p1 = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), m);
  const p2 = p1.clone(); p2.rotation.y = Math.PI / 2;
  flashMesh.add(p1, p2);
  flashMesh.position.copy(muzzleTip.position);
  flashMesh.userData.mat = m;
  rig.add(flashMesh);
  flashLight = new THREE.PointLight(0xffb45e, 0, 6, 2);
  flashLight.position.copy(muzzleTip.position); rig.add(flashLight);
}
async function loadRifleGLB() {
  try {
    const gltf = await new GLTFLoader().loadAsync('./public/models/rifle.glb');
    const model = gltf.scene;
    /* Normalize: longest axis -> barrel (-Z), overall length ~0.85m */
    const bb = new THREE.Box3().setFromObject(model);
    const size = bb.getSize(new THREE.Vector3());
    const ctr = bb.getCenter(new THREE.Vector3());
    model.position.sub(ctr);
    const longest = size.x >= size.y && size.x >= size.z ? 'x' : (size.z >= size.y ? 'z' : 'y');
    const wrap = new THREE.Group(); wrap.add(model);
    if (longest === 'x') wrap.rotation.y = Math.PI / 2;
    if (longest === 'y') wrap.rotation.x = Math.PI / 2;
    const maxLen = Math.max(size.x, size.y, size.z);
    wrap.scale.setScalar(0.68 / maxLen);
    /* Muzzle = furthest -Z point */
    const nb = new THREE.Box3().setFromObject(wrap);
    muzzleTip.position.set(0, 0, nb.min.z - 0.02); wrap.add(muzzleTip);
    /* Brighten the near-black authored material with a fill-friendly tweak */
    wrap.traverse(o => {
      if (o.isMesh && o.material) {
        o.material = o.material.clone();
        if (o.material.color && o.material.color.r < 0.08) o.material.color.setHex(0x23262b);
        if ('metalness' in o.material) o.material.metalness = Math.min(o.material.metalness ?? 0.4, 0.35);
        if ('roughness' in o.material) o.material.roughness = 0.62;
        o.frustumCulled = false;
      }
    });
    rig.add(wrap);
    addMuzzleFX();
    gunReady = true;
  } catch (e) {
    rig.add(buildFallbackRifle());
    addMuzzleFX();
    gunReady = true;
  }
}
let kickZ = 0, kickR = 0, adsK = 0, swayT = 0, reloadT = 99;
function updateGun(dt) {
  adsK += ((P.ads ? 1 : 0) - adsK) * Math.min(1, dt * 11);
  rig.position.lerpVectors(HIP, ADS, adsK);
  swayT += dt * (1 + (movingNow ? 2.2 : 0));
  if (!P.ads) {
    rig.position.x += Math.sin(swayT * 1.7) * 0.0035;
    rig.position.y += Math.cos(swayT * 2.3) * 0.003;
  }
  rig.position.z += kickZ; rig.rotation.x = kickR;
  kickZ *= Math.exp(-dt * 11); kickR *= Math.exp(-dt * 9);
  if (P.reloading) reloadT += dt;
  if (P.reloading) {
    const dip = Math.sin(Math.min(reloadT / 1.6, 1) * Math.PI);
    rig.position.y -= dip * 0.16; rig.position.z += dip * 0.06;
    rig.rotation.x += dip * 0.65; rig.rotation.z += dip * 0.3;
  }
  const targetFov = P.ads ? 52 : (sprintingNow && movingNow ? 83 : 75);
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
  camera.updateProjectionMatrix();
}
function muzzleKick() {
  kickZ += 0.055; kickR += 0.032;
  if (!flashMesh) return;
  const m = flashMesh.userData.mat;
  m.opacity = 1;
  flashMesh.rotation.z = Math.random() * 6.28;
  flashMesh.scale.setScalar(0.7 + Math.random() * 0.8);
  flashLight.intensity = 12;
  muzzleTip.getWorldPosition(_mp);
  spawnP(_mp.x, _mp.y, _mp.z, (Math.random() - 0.5) * 0.6, 0.9 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6, 0.7, 0.55, 0.53, 0.5);
  setTimeout(() => { if (flashMesh) { m.opacity = 0; flashLight.intensity = 0; } }, 45);
}

/* ---------------- Particles / tracers / impacts ---------------- */
const MAXP = 500;
const softTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(MAXP * 3), pVel = new Float32Array(MAXP * 3),
  pLife = new Float32Array(MAXP), pCol = new Float32Array(MAXP * 3);
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const points = new THREE.Points(pGeo, new THREE.PointsMaterial({
  size: 0.13, map: softTex, vertexColors: true, transparent: true,
  opacity: 0.95, depthWrite: false, alphaTest: 0.01
}));
points.frustumCulled = false; scene.add(points);
const SPARK = [[1, 0.6, 0.2], [1, 0.82, 0.45]], DUSTC = [[0.62, 0.58, 0.5], [0.45, 0.42, 0.38]],
  BLOOD = [[0.75, 0.08, 0.08], [0.5, 0.03, 0.03]];
let pHead = 0;
function spawnP(x, y, z, vx, vy, vz, life, r = 1, g = 0.72, b = 0.35) {
  pPos[pHead * 3] = x; pPos[pHead * 3 + 1] = y; pPos[pHead * 3 + 2] = z;
  pVel[pHead * 3] = vx; pVel[pHead * 3 + 1] = vy; pVel[pHead * 3 + 2] = vz;
  pLife[pHead] = life;
  pCol[pHead * 3] = r; pCol[pHead * 3 + 1] = g; pCol[pHead * 3 + 2] = b;
  pHead = (pHead + 1) % MAXP;
  pGeo.attributes.color.needsUpdate = true;
}
function burst(pt, n, nrm) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2;
    spawnP(pt.x, pt.y, pt.z,
      Math.cos(a) * e + (nrm ? nrm.x * 2 : 0), 1 + Math.random() * 2.5, Math.sin(a) * e + (nrm ? nrm.z * 2 : 0),
      0.25 + Math.random() * 0.3);
  }
}
function puff(pt, n, cols, spd = 2.5, up = 2, life = 0.4) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28, c = cols[i % cols.length];
    spawnP(pt.x, pt.y, pt.z,
      Math.cos(a) * Math.random() * spd, Math.random() * up, Math.sin(a) * Math.random() * spd,
      (Math.random() * 0.5 + 0.5) * life, c[0], c[1], c[2]);
  }
}
function updateParticles(dt) {
  for (let i = 0; i < MAXP; i++) {
    if (pLife[i] <= 0) { pPos[i * 3 + 1] = -100; continue; }
    pLife[i] -= dt;
    pVel[i * 3 + 1] -= 6 * dt;
    pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
  }
  pGeo.attributes.position.needsUpdate = true;
}
const tracers = [];
function tracer(a, b, color = 0xffe2a8) {
  const g = new THREE.BufferGeometry().setFromPoints([a, b]);
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  scene.add(l); tracers.push({ l, t: 0.07 });
}
function updateTracers(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    tracers[i].t -= dt;
    tracers[i].l.material.opacity = Math.max(0, tracers[i].t / 0.07);
    if (tracers[i].t <= 0) { scene.remove(tracers[i].l); tracers[i].l.geometry.dispose(); tracers.splice(i, 1); }
  }
}

/* ---------------- Enemies ---------------- */
const enemies = [];
let enemyGLB = null, enemyLoadFailed = false;
async function loadEnemyGLB() {
  try { enemyGLB = await new GLTFLoader().loadAsync('./public/models/enemy.glb'); }
  catch (e) { enemyLoadFailed = true; }
}
function makeBar() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 8;
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set(0.95, 0.12, 1); s.position.y = 2.3;
  return { c, tex, s };
}
function drawBar(e) {
  const c = e.bar.c.getContext('2d');
  c.clearRect(0, 0, 64, 8); c.fillStyle = '#2a0000'; c.fillRect(0, 0, 64, 8);
  c.fillStyle = e.hp > 50 ? '#4dff5e' : (e.hp > 25 ? '#ffb02e' : '#ff4438');
  c.fillRect(0, 0, Math.max(0, 64 * e.hp / e.max), 8);
  e.bar.tex.needsUpdate = true;
}
function buildFallbackSoldier() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a4030, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.75, 4, 10), mat);
  body.position.y = 1.05; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xc9a06a, roughness: 0.7 }));
  head.position.y = 1.85; g.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff2222, emissiveIntensity: 2.2 }));
  visor.position.set(0, 1.87, 0.19); g.add(visor);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 }));
  gun.position.set(0.3, 1.25, 0.45); g.add(gun);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  return { g, mats: [mat], visor };
}
/* Mixamo bind pose is a T-pose; settle arms into a relaxed patrol carry.
   Sign convention verified visually (left limb extends +X, right -X). */
function poseSoldier(model) {
  model.traverse(o => {
    if (!o.isBone) return;
    const n = o.name;
    if (n.includes('LeftArm_09')) o.rotation.z -= 1.45;
    if (n.includes('RightArm_033')) o.rotation.z += 1.45;
    if (n.includes('LeftForeArm_010')) o.rotation.z -= 0.35;
    if (n.includes('RightForeArm_034')) o.rotation.z += 0.35;
    if (n.includes('LeftShoulder_08')) o.rotation.z -= 0.12;
    if (n.includes('RightShoulder_032')) o.rotation.z += 0.12;
  });
  model.updateMatrixWorld(true);
}
/* True rendered vertical extents of a (possibly skinned) model.
   Skinning can move vertices far from stored positions, so raw geometry
   bounds lie; bone world positions give robust head/feet extents. */
const _sv = new THREE.Vector3();
function skinnedHeight(root) {
  root.updateMatrixWorld(true);
  let mn = Infinity, mx = -Infinity;
  root.traverse(o => { if (o.isSkinnedMesh) o.skeleton.update(); });
  root.traverse(o => {
    if (o.isBone) {
      o.getWorldPosition(_sv);
      mn = Math.min(mn, _sv.y); mx = Math.max(mx, _sv.y);
    } else if (o.isMesh && !o.isSkinnedMesh) {
      const b = new THREE.Box3().setFromObject(o);
      mn = Math.min(mn, b.min.y); mx = Math.max(mx, b.max.y);
    }
  });
  if (!isFinite(mn)) { mn = 0; mx = 1.8; }
  return { mn, mx, h: Math.max(0.2, (mx - mn) + 0.22) }; // +head/sole margin
}
function spawnSoldier(pos, waveNum) {
  const g = new THREE.Group();
  let mats = [], visor = null;
  if (enemyGLB && !enemyLoadFailed) {
    const model = skeletonClone(enemyGLB.scene);
    poseSoldier(model); // T-pose -> patrol carry (must precede measuring)
    const wrap = new THREE.Group(); wrap.add(model); g.add(wrap);
    const sh = skinnedHeight(wrap);
    wrap.scale.setScalar(1.8 / sh.h);
    wrap.position.y -= sh.mn * (1.8 / sh.h);
    model.rotation.y = Math.PI; // face +Z (corrected by lookAt each frame anyway)
    model.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false; // skinned bounds are bind-pose; never wrongly cull
        o.material = o.material.clone();
        mats.push(o.material);
        o.material.emissive = o.material.emissive || new THREE.Color(0);
      }
    });
    g.add(model);
    /* hostile visor glow so enemies read instantly */
    visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x110000, emissive: 0xff2222, emissiveIntensity: 2.4 }));
    visor.position.set(0, 1.62, 0.28); g.add(visor);
  } else {
    const f = buildFallbackSoldier(); g.add(f.g); mats = f.mats; visor = f.visor;
  }
  const bar = makeBar(); g.add(bar.s);
  g.position.copy(pos); scene.add(g);
  const e = {
    g, mats, visor, bar, hp: 100, max: 100, state: 'patrol',
    t: Math.random() * 9, seed: Math.random() * 10,
    speed: 2.1 + waveNum * 0.28, atkCd: 1 + Math.random(),
    dead: 0, dmg: 7 + waveNum * 1.5, walkPh: Math.random() * 6,
    walkAmt: 0, bones: null,
  };
  if (enemyGLB && !enemyLoadFailed) {
    const fb = r => { let f = null; g.traverse(o => { if (o.isBone && o.name.includes(r)) f = o; }); return f; };
    e.bones = {
      LU: fb('LeftUpLeg'), RU: fb('RightUpLeg'),
      LL: fb('LeftLeg_056'), RL: fb('RightLeg_061'),
      LA: fb('LeftArm_09'), RA: fb('RightArm_033'),
      LFA: fb('LeftForeArm_010'), RFA: fb('RightForeArm_034'),
    };
  }
  g.traverse(o => { o.userData.enemyRef = e; });
  g.userData.enemyRef = e;
  drawBar(e);
  enemies.push(e);
  return e;
}
function damageEnemy(e, d, point) {
  if (e.dead || !P.alive) return false;
  e.hp -= d;
  e.mats.forEach(m => { if (m.emissive) { m.emissive.setHex(0xff4444); m.emissiveIntensity = 0.45; } });
  setTimeout(() => e.mats.forEach(m => { if (m.emissive && m !== e.visor?.material) { m.emissiveIntensity = 0; } }), 55);
  if (point) puff(point, 10, BLOOD, 2.2, 2.5, 0.5);
  if (e.hp <= 0) {
    e.dead = 0.001; e.bar.s.visible = false;
    e.g.rotation.y = Math.random() * 6.28; // ragdoll-ish random fall direction
    P.kills++; updateScore(); addFeed('☠ Hostile down');
    playHit(true); return true;
  }
  drawBar(e); playHit(false); return false;
}
const _ed = new THREE.Vector3(), _ep = new THREE.Vector3();
function updateEnemies(dt, t) {
  _ep.copy(playerObj.position);
  for (const e of enemies) {
    if (e.dead) {
      e.dead += dt;
      e.g.rotation.x = Math.min(Math.PI / 2, e.dead * 2.6);
      if (e.dead > 1) e.g.traverse(o => {
        if (o.isMesh && o.material && o.material.transparent !== undefined && o.material.emissiveIntensity !== 2.4) {
          o.material.transparent = true; o.material.opacity = Math.max(0, 1 - (e.dead - 1) / 1.2);
        }
      });
      continue;
    }
    e.t += dt;
    _ed.subVectors(_ep, e.g.position); _ed.y = 0;
    const d = _ed.length(); _ed.normalize();
    e.state = d < 20 ? (d < 13 ? 'attack' : 'chase') : 'patrol';
    if (e.state === 'patrol') {
      e.g.position.x += Math.sin(e.t * 0.5 + e.seed) * dt * 1.3;
      e.g.position.z += Math.cos(e.t * 0.4 + e.seed) * dt * 1.3;
    } else if (e.state === 'chase') {
      e.g.position.x += _ed.x * e.speed * dt;
      e.g.position.z += _ed.z * e.speed * dt;
    } else {
      e.g.position.x += -_ed.z * Math.sin(t * 1.8 + e.seed) * dt * 2.2;
      e.g.position.z += _ed.x * Math.sin(t * 1.8 + e.seed) * dt * 2.2;
      e.atkCd -= dt;
      if (e.atkCd <= 0 && d < 19) { e.atkCd = Math.max(0.55, 1.25 - P.wave * 0.06); enemyFire(e, d); }
    }
    /* keep inside compound */
    e.g.position.x = clamp(e.g.position.x, -27, 27);
    e.g.position.z = clamp(e.g.position.z, -26, 26);
    e.g.lookAt(_ep.x, e.g.position.y, _ep.z);
    /* walk bob */
    /* walk bob + procedural Mixamo walk cycle (rotation.x only; .z is pose) */
    if (e.state !== 'attack') { e.walkPh += dt * 9; e.g.position.y = Math.abs(Math.sin(e.walkPh)) * 0.05; }
    const wTarget = e.dead ? 0 : (e.state === 'attack' ? 0.55 : 1);
    e.walkAmt += (wTarget - e.walkAmt) * Math.min(1, dt * 8);
    if (e.bones) {
      const w = e.walkAmt, s = Math.sin(e.walkPh), B = e.bones;
      if (B.LU) B.LU.rotation.x = s * 0.55 * w;
      if (B.RU) B.RU.rotation.x = -s * 0.55 * w;
      if (B.LL) B.LL.rotation.x = Math.max(0, -s) * 0.9 * w;
      if (B.RL) B.RL.rotation.x = Math.max(0, s) * 0.9 * w;
      if (B.LA) B.LA.rotation.x = -s * 0.3 * w;
      if (B.RA) B.RA.rotation.x = s * 0.3 * w;
      if (B.LFA) B.LFA.rotation.x = (-0.3 - Math.max(0, -s) * 0.4) * w;
      if (B.RFA) B.RFA.rotation.x = (-0.3 - Math.max(0, s) * 0.4) * w;
    }
  }
}
function enemyFire(e, d) {
  if (!P.alive) return;
  const from = e.g.position.clone(); from.y += 1.4;
  const to = playerObj.position.clone(); to.y -= 0.15;
  to.x += (Math.random() - 0.5) * (1.2 + d * 0.12);
  to.y += (Math.random() - 0.5) * 0.8;
  to.z += (Math.random() - 0.5) * (1.2 + d * 0.12);
  tracer(from, to, 0xff6a5e);
  puff(from, 3, SPARK, 1.2, 0.5, 0.14); // gun-pop at the hostile's muzzle
  playShot(d);
  /* hit chance falls with distance */
  if (Math.random() < clamp(0.75 - d * 0.03, 0.12, 0.7)) {
    setTimeout(() => { if (P.alive) damagePlayer(e.dmg * (0.8 + Math.random() * 0.4)); }, 120);
  }
}
function waveCheck() {
  if (enemies.length && enemies.every(e => e.dead > 1.6)) {
    enemies.forEach(e => scene.remove(e.g));
    enemies.length = 0;
    P.wave++;
    $('obj-wave').textContent = P.wave;
    const n = Math.min(3 + P.wave, 9);
    for (let i = 0; i < n; i++) {
      const sp = spawnPoints[(i + P.wave) % spawnPoints.length].clone();
      sp.x += (Math.random() - 0.5) * 3; sp.z += (Math.random() - 0.5) * 3;
      spawnSoldier(sp, P.wave);
    }
    banner(`WAVE ${P.wave}`, `${n} HOSTILES INBOUND`);
    updateScore();
  }
}

/* ---------------- Shooting ---------------- */
const ray = new THREE.Raycaster();
const center2 = new THREE.Vector2(0, 0);
const _mp = new THREE.Vector3(), _end = new THREE.Vector3();
function spreadRad() { return P.ads ? 0.004 : 0.02; }
function tryFire(now) {
  if (!P.firing || P.reloading || !P.alive || !P.started) return;
  if (now - P.lastShot < 60000 / P.RPM) return;
  if (P.ammo <= 0) { reload(); return; }
  P.lastShot = now; P.ammo--; P.shotsFired++;
  setAmmoUI(); muzzleKick(); playShot();
  ray.setFromCamera(center2, camera);
  ray.ray.direction.x += (Math.random() - 0.5) * spreadRad() * 2;
  ray.ray.direction.y += (Math.random() - 0.5) * spreadRad() * 2;
  ray.ray.direction.normalize();
  const targets = [];
  enemies.forEach(e => { if (!e.dead) e.g.traverse(o => { if (o.isMesh) targets.push(o); }); });
  const hits = ray.intersectObjects([...targets, ...solids], false);
  muzzleTip.getWorldPosition(_mp);
  if (hits.length) {
    const h = hits[0];
    tracer(_mp.clone(), h.point.clone());
    let o = h.object, ref = null;
    while (o) { if (o.userData.enemyRef) { ref = o.userData.enemyRef; break; } o = o.parent; }
    if (ref && !ref.dead) {
      P.shotsHit++;
      const dist = h.distance;
      const base = 34, dmg = dist < 15 ? base : dist < 40 ? base * (1 - (dist - 15) / 25 * 0.6) : base * 0.4;
      const killed = damageEnemy(ref, dmg, h.point);
      hitmarker(killed);
    } else {
      const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : null;
      puff(h.point, 5, SPARK, 2.5, 2.5, 0.3);
      puff(h.point, 4, DUSTC, 1.4, 1.2, 0.6);
    }
  } else {
    tracer(_mp.clone(), ray.ray.at(70, _end).clone());
  }
  const hud = document.documentElement.style;
  hud.setProperty('--sp', `${7 + (movingNow ? 6 : 0) + 10}px`);
  setTimeout(() => hud.setProperty('--sp', `${7 + (movingNow ? 6 : 0)}px`), 90);
}
function reload() {
  if (P.reloading || P.ammo === P.MAG || !P.alive) return;
  P.reloading = true; reloadT = 0; playReload();
  $('reload-tip').textContent = ' — RELOADING';
  setTimeout(() => { P.ammo = P.MAG; P.reloading = false; setAmmoUI(); $('reload-tip').textContent = ''; }, 1600);
}

/* ---------------- HUD ---------------- */
function hitmarker(kill) {
  const el = $('hitm');
  el.classList.remove('on', 'kill'); void el.offsetWidth;
  el.classList.add('on'); if (kill) el.classList.add('kill');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on', 'kill'), 140);
}
function setAmmoUI() {
  const a = $('ammo');
  a.textContent = P.reloading ? '––' : P.ammo;
  a.classList.toggle('low', P.ammo <= 6);
  if (P.ammo === 0 && !P.reloading) $('reload-tip').textContent = ' — PRESS R';
  else if (!P.reloading) $('reload-tip').textContent = '';
}
function updateScore() { $('score').textContent = `KILLS ${P.kills} · WAVE ${P.wave}`; }
function banner(t, sub = '') {
  const b = $('banner'), s = $('subbanner');
  b.textContent = t; s.textContent = sub;
  b.classList.add('on'); if (sub) s.classList.add('on');
  clearTimeout(b._t); b._t = setTimeout(() => { b.classList.remove('on'); s.classList.remove('on'); }, 2200);
}
function addFeed(t) {
  const f = $('feed'), d = document.createElement('div');
  d.textContent = t; f.prepend(d);
  while (f.children.length > 5) f.lastChild.remove();
  setTimeout(() => d.remove(), 4200);
}
function updateHP() {
  $('hpnum').textContent = Math.ceil(P.hp);
  const b = document.querySelector('#hpbar i');
  b.style.width = P.hp + '%';
  b.style.background = P.hp > 50 ? 'linear-gradient(90deg,#3fe05a,#7CFC00)' : P.hp > 25 ? '#ffb02e' : '#ff4438';
}
function damagePlayer(d) {
  if (BARE) return; // screenshots: full sim, invincible camera
  if (!P.alive || !P.started) return;
  P.hp = Math.max(0, P.hp - d); P.lastDmg = performance.now();
  updateHP(); playHurt();
  const v = $('dmg'); v.classList.add('on');
  clearTimeout(v._t); v._t = setTimeout(() => v.classList.remove('on'), 200);
  if (P.hp <= 0) gameOver();
}
const mini = $('mini').getContext('2d');
function drawMini() {
  mini.clearRect(0, 0, 140, 140);
  mini.save(); mini.translate(70, 70);
  mini.strokeStyle = 'rgba(140,255,140,.7)'; mini.lineWidth = 2;
  mini.beginPath(); mini.arc(0, 0, 58, 0, 7); mini.stroke();
  mini.rotate(-P.yaw + Math.PI);
  const R = 60;
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.g.position.x - playerObj.position.x, dz = e.g.position.z - playerObj.position.z;
    if (Math.hypot(dx, dz) > R) continue;
    mini.fillStyle = '#ff4b3e';
    mini.beginPath(); mini.arc(dx / R * 58, dz / R * 58, 3.4, 0, 7); mini.fill();
  }
  mini.fillStyle = '#7CFC00';
  mini.beginPath(); mini.moveTo(0, -7); mini.lineTo(5, 6); mini.lineTo(-5, 6); mini.fill();
  mini.restore();
}

/* ---------------- Movement ---------------- */
const _mv = new THREE.Vector3(), _ax = new THREE.Vector3(0, 1, 0);
let movingNow = false, sprintingNow = false;
function collide(pos, r) {
  for (const b of colliders) {
    if (pos.y < b.min.y - 1.4 || pos.y > b.max.y + 0.6) continue;
    const cx = clamp(pos.x, b.min.x, b.max.x), cz = clamp(pos.z, b.min.z, b.max.z);
    const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
    if (d2 < r * r && d2 > 1e-8) {
      const d = Math.sqrt(d2), push = (r - d) / d;
      pos.x += dx * push; pos.z += dz * push;
    }
  }
  pos.x = clamp(pos.x, -28, 28); pos.z = clamp(pos.z, -27, 27);
}
function updateMove(dt) {
  const sprintKey = P.keys['ShiftLeft'] || P.keys['ShiftRight'];
  sprintingNow = !!sprintKey && !P.ads;
  const sp = (sprintingNow ? 7.6 : 4.8) * (P.ads ? 0.55 : 1);
  const f = (P.keys['KeyW'] ? 1 : 0) - (P.keys['KeyS'] ? 1 : 0) - P.moveZ;
  const s = (P.keys['KeyD'] ? 1 : 0) - (P.keys['KeyA'] ? 1 : 0) + P.moveX;
  movingNow = !!(f || s);
  if (movingNow) {
    _mv.set(s, 0, -f).normalize().multiplyScalar(sp * dt);
    _mv.applyAxisAngle(_ax, P.yaw);
    playerObj.position.x += _mv.x; playerObj.position.z += _mv.z;
    collide(playerObj.position, 0.55);
  }
  P.vy -= 15 * dt; playerObj.position.y += P.vy * dt;
  if (playerObj.position.y <= 1.7) { playerObj.position.y = 1.7; P.vy = 0; P.grounded = true; }
  if ((P.keys['Space'] && P.grounded)) { P.vy = 5.4; P.grounded = false; }
  if (P.grounded && movingNow) P.bobT += dt * (sprintingNow ? 13 : 10);
  camera.position.y = Math.sin(P.bobT) * 0.042 * (movingNow ? 1 : 0);
  camera.position.x = Math.cos(P.bobT * 0.5) * 0.02 * (movingNow ? 1 : 0);
  camera.rotation.z = Math.sin(P.bobT * 0.5) * 0.004 * (movingNow ? 1 : 0);
}

/* ---------------- Touch controls ---------------- */
const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) $('touch-ui').style.display = 'block';
{
  const stick = $('stick'), nub = $('nub');
  let sid = null, sx = 0, sy = 0;
  stick.addEventListener('touchstart', e => { const t = e.changedTouches[0]; sid = t.identifier; sx = t.clientX; sy = t.clientY; e.preventDefault(); }, { passive: false });
  addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === sid) {
        const dx = clamp(t.clientX - sx, -45, 45), dy = clamp(t.clientY - sy, -45, 45);
        nub.style.left = 38 + dx + 'px'; nub.style.top = 38 + dy + 'px';
        P.moveX = dx / 45; P.moveZ = dy / 45;
      } else if (lookId === t.identifier && P.started) {
        P.yaw -= (t.clientX - lx) * 0.0045; P.pitch = clamp(P.pitch - (t.clientY - ly) * 0.0045, -1.5, 1.5);
        playerObj.rotation.y = P.yaw; camera.rotation.x = P.pitch;
        lx = t.clientX; ly = t.clientY;
      }
    }
    if (P.started) e.preventDefault();
  }, { passive: false });
  addEventListener('touchend', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === sid) { sid = null; P.moveX = P.moveZ = 0; nub.style.left = '38px'; nub.style.top = '38px'; }
      if (t.identifier === lookId) lookId = null;
    }
  });
  let lookId = null, lx = 0, ly = 0;
  addEventListener('touchstart', e => {
    for (const t of e.changedTouches) {
      if (t.clientX > innerWidth * 0.4 && t.target.tagName !== 'BUTTON' && lookId === null) {
        lookId = t.identifier; lx = t.clientX; ly = t.clientY;
      }
    }
  }, { passive: true });
  const fb = $('fire-btn');
  fb.addEventListener('touchstart', e => { P.firing = true; e.preventDefault(); }, { passive: false });
  fb.addEventListener('touchend', () => { P.firing = false; });
  $('ads-btn').addEventListener('touchstart', e => { P.ads = !P.ads; e.preventDefault(); }, { passive: false });
}

/* ---------------- Flow ---------------- */
function startGame() {
  P.started = true; P.alive = true;
  P.hp = 100; P.kills = 0; P.wave = 1; P.ammo = P.MAG;
  playerObj.position.set(0, 1.7, 22); P.yaw = 0; P.pitch = 0;
  playerObj.rotation.y = 0; camera.rotation.x = 0;
  enemies.forEach(e => scene.remove(e.g)); enemies.length = 0;
  for (let i = 0; i < 4; i++) spawnSoldier(spawnPoints[i % spawnPoints.length].clone(), 1);
  $('obj-wave').textContent = '1';
  updateHP(); updateScore(); setAmmoUI();
  menuEl.style.display = 'none'; overEl.style.display = 'none';
  hudEl.classList.add('on');
  banner('STRIKEPOINT', 'ELIMINATE ALL HOSTILES');
  try { ac().resume(); } catch (e) {}
  if (!BARE && !isTouch) canvas.requestPointerLock?.();
}
function pauseToMenu() {
  P.started = false; P.firing = false;
  hudEl.classList.remove('on');
  menuEl.style.display = 'flex';
}
function gameOver() {
  P.alive = false; P.firing = false;
  document.exitPointerLock?.();
  $('final-stats').textContent = `KILLS ${P.kills} · REACHED WAVE ${P.wave} · ACCURACY ${P.shotsFired ? Math.round(P.shotsHit / P.shotsFired * 100) : 0}%`;
  setTimeout(() => { hudEl.classList.remove('on'); overEl.style.display = 'flex'; }, 900);
}
$('play-btn').addEventListener('click', () => { startGame(); });
$('play-btn-2').addEventListener('click', () => { startGame(); });

/* ---------------- Boot ---------------- */
(async function boot() {
  await Promise.all([loadRifleGLB(), loadEnemyGLB()]);
  if (BARE) {
    /* scripted framing for headless screenshots: view of compound + hostiles */
    startGame();
    hudEl.classList.add('on');
    playerObj.position.set(0, 2.1, 16);
    P.yaw = 0.0; P.pitch = -0.045;
    playerObj.rotation.y = P.yaw; camera.rotation.x = P.pitch;
    /* stage hostiles in open ground, clearly in view (no overlap w/ cover) */
    const stage = [[-3.5, 9], [3.5, 9], [0, 13.5], [-8, 10]];
    enemies.forEach((e, i) => {
      const s = stage[i % stage.length];
      e.g.position.set(s[0], 0, s[1]);
      e.g.lookAt(playerObj.position.x, 0, playerObj.position.z);
    });
    P.firing = false;
    if (params.has('fire')) P.firing = true; // screenshot gunplay: tracers/impacts
    if (params.has('debug')) {
      const names = [];
      enemies[0]?.g.traverse(o => { if (o.isBone) names.push(o.name); });
      console.log('BONES ' + names.join(','));
      const bb = new THREE.Box3();
      const info = {
        enemies: enemies.length, gunReady, enemyGLB: !!enemyGLB, enemyLoadFailed,
        list: enemies.map(e => {
          const sh = skinnedHeight(e.g);
          const ndc = e.g.position.clone(); ndc.y += 1.2; ndc.project(camera);
          return { pos: e.g.position.toArray().map(v => +v.toFixed(2)),
            kids: e.g.children.length, visible: e.g.visible,
            ndc: 'skip',
            bones: [+sh.mn.toFixed(2), +sh.mx.toFixed(2), +sh.h.toFixed(2)] };
        })
      };
      document.title = 'DEBUG ' + JSON.stringify(info);
    }
  }
  window.__ready = true;
})();

/* ---------------- Main loop ---------------- */
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  const t = now / 1000;
  if (P.started && P.alive) {
    updateMove(dt);
    tryFire(now);
    updateEnemies(dt, t);
    if (!BARE) waveCheck();
    if (performance.now() - P.lastDmg > 3000 && P.hp < 100) {
      P.hp = Math.min(100, P.hp + 14 * dt); updateHP();
    }
    drawMini();
  } else if (BARE) {
    updateEnemies(dt, t);
  }
  if (window.__dust) window.__dust.rotation.y += dt * 0.01;
  if (window.__clouds) for (const c of window.__clouds) {
    c.position.x += dt * 1.2;
    if (c.position.x > 320) c.position.x = -320;
  }
  updateGun(dt);
  updateParticles(dt);
  updateTracers(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);
