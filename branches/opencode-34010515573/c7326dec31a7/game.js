import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

/* Enemy model: "Low Poly Soldier" by MLGprogect, CC Attribution, via Sketchfab.
   See ATTRIBUTION.md. Async load; procedural fallback if fetch fails. */
let soldierAsset = null, soldierDone = false;
function calibrateSoldier(template) {
  // Skinned bind-pose spans thousands of units (mm-ish export); measure the
  // bone-posed bounds on CPU and derive a uniform scale for a 1.8m soldier.
  try {
    const grp = skeletonClone(template.scene);
    const mixer = new THREE.AnimationMixer(grp);
    if (template.animations[0]) mixer.clipAction(template.animations[0]).play();
    mixer.update(0.01); grp.updateMatrixWorld(true);
    const cal = new THREE.Box3();
    grp.traverse(o => {
      if (o.isSkinnedMesh) { try { o.computeBoundingBox(); } catch (e) { /* ignore */ } }
      if (o.isMesh && o.geometry && o.geometry.boundingBox) {
        const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
        if (b.getSize(new THREE.Vector3()).length() < 1e7) cal.union(b);
      }
    });
    const h = cal.max.y - cal.min.y;
    if (h > 0.1 && h < 1e7) {
      console.log('[soldier] posed height', h.toFixed(1), 'units -> scale', (1.8 / h).toExponential(2));
      return 1.8 / h;
    }
  } catch (e) { console.warn('[soldier] calibration failed', e); }
  return 1;
}
new GLTFLoader().load('./public/models/soldier.glb',
  gltf => {
    soldierAsset = { gltf, scale: calibrateSoldier(gltf) };
    soldierDone = true;
    console.log('[soldier] GLB ready, anims:', gltf.animations.length);
  },
  undefined,
  err => { soldierDone = true; console.warn('[soldier] GLB load failed, procedural fallback:', err); }
);

const $ = id => document.getElementById(id);
const canvas = $('game-canvas'), hud = $('hud'), menu = $('menu');
const pauseEl = $('pause'), overEl = $('gameover');
const mm = $('minimap').getContext('2d');
const QS = new URLSearchParams(location.search);

const WORLD = 30, WIN_WAVE = 8;
const settings = {
  sens: parseFloat($('opt-sens').value) || 1,
  quality: $('opt-quality').value || 'medium',
  shake: $('opt-shake').checked,
  muted: false,
};
$('opt-sens').oninput = e => settings.sens = parseFloat(e.target.value);
$('opt-quality').onchange = e => { settings.quality = e.target.value; applyQuality(); };
$('opt-shake').onchange = e => settings.shake = e.target.checked;

// ---------------- procedural audio ----------------
let AC = null, master = null, noiseBuf = null;
function audio() {
  if (AC) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 0.9; master.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.5, AC.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { console.warn('audio unavailable', e); }
}
function env(g, t0, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec);
}
function noiseHit(t, freq, peak, dec) {
  const s = AC.createBufferSource(); s.buffer = noiseBuf;
  const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = AC.createGain(); env(g, t, 0.002, peak, dec);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dec + 0.1);
}
function tone(t, freq0, freq1, peak, dec, type = 'square') {
  const o = AC.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(freq0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, freq1), t + dec);
  const g = AC.createGain(); env(g, t, 0.003, peak, dec);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dec + 0.1);
}
function sfx(name, far = false) {
  if (!AC || settings.muted) return;
  const t = AC.currentTime;
  if (name === 'shot') { noiseHit(t, far ? 900 : 3400, far ? 0.22 : 0.6, 0.12); tone(t, 170, 45, 0.45, 0.1); }
  else if (name === 'hit') tone(t, 1250, 900, 0.3, 0.06);
  else if (name === 'kill') { tone(t, 700, 700, 0.35, 0.07); tone(t + 0.07, 1050, 1050, 0.35, 0.09); }
  else if (name === 'hurt') { noiseHit(t, 600, 0.4, 0.15); tone(t, 120, 60, 0.4, 0.15, 'sawtooth'); }
  else if (name === 'reload') { tone(t, 300, 300, 0.28, 0.05); tone(t + 0.14, 500, 500, 0.28, 0.05); tone(t + 0.42, 760, 760, 0.28, 0.05); }
  else if (name === 'empty') tone(t, 220, 180, 0.25, 0.05);
  else if (name === 'step') noiseHit(t, 480, 0.1, 0.06);
  else if (name === 'boom') { noiseHit(t, 2500, 0.9, 0.7); tone(t, 90, 30, 0.8, 0.6, 'sine'); }
  else if (name === 'supply') { tone(t, 520, 520, 0.3, 0.08); tone(t + 0.1, 780, 780, 0.3, 0.1); }
  else if (name === 'wave') { tone(t, 392, 392, 0.32, 0.12); tone(t + 0.14, 523, 523, 0.32, 0.16); }
}
function toast(msg, ms = 2400) {
  const el = $('toast');
  el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add('hidden'), ms);
}
function feed(text) {
  const kf = $('killfeed');
  const d = document.createElement('div'); d.className = 'kf'; d.textContent = text;
  kf.prepend(d);
  while (kf.children.length > 5) kf.lastChild.remove();
  setTimeout(() => d.remove(), 4200);
}

// ---------------- procedural textures ----------------
function canvasTex(size, fn, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  fn(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const groundTex = canvasTex(512, (g, s) => {
  g.fillStyle = '#77756c'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 3600; i++) {
    const v = 90 + Math.random() * 40 | 0;
    g.fillStyle = `rgba(${v},${v - 3},${v - 10},${0.12 + Math.random() * 0.16})`;
    g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  g.strokeStyle = 'rgba(20,20,18,.22)'; g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    g.beginPath(); g.moveTo(i * s / 4, 0); g.lineTo(i * s / 4, s); g.stroke();
    g.beginPath(); g.moveTo(0, i * s / 4); g.lineTo(s, i * s / 4); g.stroke();
  }
  for (let i = 0; i < 26; i++) {
    g.fillStyle = 'rgba(60,50,35,.25)'; g.beginPath();
    g.ellipse(Math.random() * s, Math.random() * s, 12 + Math.random() * 40, 8 + Math.random() * 26, Math.random() * 3, 0, 7); g.fill();
  }
}, 10, 10);
// one shared lit-window layout so albedo + emissive agree
const litWin = [];
for (let r = 0; r < 3; r++) { litWin[r] = []; for (let c = 0; c < 6; c++) litWin[r][c] = Math.random() < 0.3; }
const facadeTex = canvasTex(512, (g, s) => {
  g.fillStyle = '#9a948a'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; g.fillRect(Math.random() * s, Math.random() * s, 3, 3); }
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, s - 40, s, 40);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
    const x = 24 + c * 80, y = 40 + r * 130, lit = litWin[r][c];
    g.fillStyle = '#2b2f36'; g.fillRect(x - 4, y - 4, 56, 76);
    const grd = g.createLinearGradient(x, y, x, y + 68);
    if (lit) { grd.addColorStop(0, '#ffe9b0'); grd.addColorStop(1, '#c98a2e'); }
    else { grd.addColorStop(0, '#3d4a5c'); grd.addColorStop(1, '#151a22'); }
    g.fillStyle = grd; g.fillRect(x, y, 48, 68);
    g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(x, y, 48, 6);
    g.strokeStyle = '#14161a'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x + 24, y); g.lineTo(x + 24, y + 68); g.stroke();
  }
});
const facadeEmis = canvasTex(512, (g, s) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, s, s);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
    if (litWin[r][c]) { g.fillStyle = '#c98a3a'; g.fillRect(24 + c * 80, 40 + r * 130, 48, 68); }
  }
});
const woodTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#8a6a3f'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(60,40,20,${0.2 + Math.random() * 0.3})`; g.lineWidth = 1 + Math.random() * 2;
    g.beginPath(); const y = Math.random() * s;
    g.moveTo(0, y); g.bezierCurveTo(s * 0.3, y + 6, s * 0.6, y - 6, s, y); g.stroke();
  }
  g.strokeStyle = '#4a3519'; g.lineWidth = 10; g.strokeRect(4, 4, s - 8, s - 8);
  g.beginPath(); g.moveTo(0, 0); g.lineTo(s, s); g.moveTo(s, 0); g.lineTo(0, s); g.stroke();
});
const sandTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#a08c5e'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(${120 + Math.random() * 60 | 0},${100 + Math.random() * 50 | 0},60,.5)`;
    g.beginPath(); g.ellipse(Math.random() * s, Math.random() * s, 14 + Math.random() * 18, 8 + Math.random() * 10, Math.random(), 0, 7); g.fill();
  }
  g.strokeStyle = 'rgba(60,50,30,.4)';
  for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(0, i * s / 4); g.lineTo(s, i * s / 4); g.stroke(); }
}, 2, 1);
const concreteTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#9b9b98'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.1})`; g.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
  g.fillStyle = 'rgba(200,60,30,.75)'; g.fillRect(0, s * 0.42, s, 14);
  g.fillStyle = '#ddd'; g.font = 'bold 20px sans-serif'; g.fillText('A-03', 20, 40);
});
const holeTex = canvasTex(64, (g, s) => {
  g.clearRect(0, 0, s, s);
  g.fillStyle = 'rgba(120,100,80,.6)'; g.beginPath(); g.arc(s / 2, s / 2, 14, 0, 7); g.fill();
  g.fillStyle = '#0a0a0a'; g.beginPath(); g.arc(s / 2, s / 2, 8, 0, 7); g.fill();
});

// ---------------- renderer / scene ----------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5e0);
scene.fog = new THREE.Fog(0xa8c0d8, 42, 125);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.08, 300);
camera.rotation.order = 'YXZ';

scene.add(new THREE.HemisphereLight(0xbcd8ff, 0x6b6a5a, 0.9));
const fill = new THREE.PointLight(0xfff4e0, 3.5, 4, 1.6); // viewmodel fill
camera.add(fill);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
sun.position.set(30, 45, 15);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -38; sun.shadow.camera.right = 38;
sun.shadow.camera.top = 38; sun.shadow.camera.bottom = -38;
sun.shadow.camera.far = 130; sun.shadow.bias = -0.0004;
scene.add(sun); scene.add(sun.target);
{ // gradient sky dome
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x3d6fb4) }, mid: { value: new THREE.Color(0x87b5e0) }, bot: { value: new THREE.Color(0xd8c9a8) } },
    vertexShader: 'varying vec3 vP; void main(){vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec3 vP; uniform vec3 top,mid,bot; void main(){float h=normalize(vP).y; vec3 c=h>0.?mix(mid,top,pow(h,.6)):mix(mid,bot,pow(-h,.5)); gl_FragColor=vec4(c,1.);}'
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(220, 16, 12), skyMat));
}
function applyQuality() {
  const q = settings.quality;
  renderer.setPixelRatio(q === 'high' ? Math.min(devicePixelRatio, 2) : q === 'medium' ? Math.min(devicePixelRatio, 1.5) : 1);
  const shadows = q !== 'low';
  renderer.shadowMap.enabled = shadows; sun.castShadow = shadows;
  const sz = q === 'high' ? 2048 : 1024;
  if (sun.shadow.mapSize.x !== sz) {
    sun.shadow.mapSize.set(sz, sz);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
}
applyQuality();
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
renderer.setSize(innerWidth, innerHeight);

// ---------------- map: warzone courtyard 64x64 ----------------
const colliders = [];
const obstacles = [];
function addSolid(mesh, collide = true) {
  scene.add(mesh); obstacles.push(mesh);
  if (collide) { mesh.updateMatrixWorld(true); colliders.push(new THREE.Box3().setFromObject(mesh)); }
  return mesh;
}
const MAT = {
  ground: new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.96 }),
  plaza: new THREE.MeshStandardMaterial({ color: 0x8f8b80, roughness: 0.9 }),
  build: new THREE.MeshStandardMaterial({ map: facadeTex, emissiveMap: facadeEmis, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.85 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.95 }),
  wood: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.8 }),
  sand: new THREE.MeshStandardMaterial({ map: sandTex, roughness: 0.95 }),
  concrete: new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 0.9 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2e3138, roughness: 0.7, metalness: 0.3 }),
  rustRed: new THREE.MeshStandardMaterial({ color: 0xa33327, roughness: 0.6, metalness: 0.35 }),
  rustBlue: new THREE.MeshStandardMaterial({ color: 0x2e5f8a, roughness: 0.6, metalness: 0.35 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.95 }),
  lampOn: new THREE.MeshStandardMaterial({ color: 0x444444, emissive: 0xfff2cc, emissiveIntensity: 2.2 }),
  supply: new THREE.MeshStandardMaterial({ color: 0x1d4a2c, roughness: 0.7, emissive: 0x1a5c30, emissiveIntensity: 0.25 }),
};
{
  const g = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), MAT.ground);
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g);
  const skirt = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x5c5f52, roughness: 1 }));
  skirt.rotation.x = -Math.PI / 2; skirt.position.y = -0.05; scene.add(skirt);
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(9, 40), MAT.plaza);
  plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.02; plaza.receiveShadow = true; scene.add(plaza);
  const base = addSolid(new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 1.0, 12), MAT.concrete));
  base.position.set(0, 0.5, 0); base.castShadow = base.receiveShadow = true;
  const ob = addSolid(new THREE.Mesh(new THREE.BoxGeometry(1.2, 3.4, 1.2), MAT.concrete));
  ob.position.set(0, 2.6, 0); ob.castShadow = true;
  const obTop = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.4, 1.7), MAT.dark);
  obTop.position.set(0, 4.5, 0); obTop.castShadow = true; scene.add(obTop);
}
function building(w, h, d, x, z) {
  const grp = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MAT.build);
  m.position.y = h / 2; m.castShadow = m.receiveShadow = true; grp.add(m);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6), MAT.roof);
  roof.position.y = h + 0.25; roof.castShadow = true; grp.add(roof);
  for (let i = 0; i < 4; i++) {
    const ac = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 1), MAT.dark);
    ac.position.set(-w / 2 + 2 + i * Math.max(1, (w - 4) / 3), h + 0.9, (Math.random() - 0.5) * d * 0.4);
    grp.add(ac);
  }
  grp.position.set(x, 0, z);
  scene.add(grp); grp.updateMatrixWorld(true);
  colliders.push(new THREE.Box3().setFromObject(m)); obstacles.push(m);
}
building(64, 13, 9, 0, -36.5); building(64, 12, 9, 0, 36.5);
building(9, 14, 64, -36.5, 0); building(9, 11, 64, 36.5, 0);
building(12, 9, 12, -33, -33); building(12, 10, 12, 33, -33);
building(12, 9, 12, -33, 33); building(12, 10, 12, 33, 33);

const crateGeo = new THREE.BoxGeometry(1.1, 1.1, 1.1);
const cratePos = [[-8, -6], [-7.2, -6.4], [-8.5, 2], [8, 6], [9.2, 6], [8, -3], [-3, 10], [4, -10], [-12, 0], [12, 1], [0, 14], [2, -15], [-16, -10], [16, -12], [-16, 12], [15, 13], [6, 0], [-6, 1]];
for (const [x, z] of cratePos) {
  const s = 0.8 + Math.random() * 0.6;
  const c = new THREE.Mesh(crateGeo, MAT.wood);
  c.scale.setScalar(s); c.position.set(x, 0.55 * s, z); c.rotation.y = Math.random() * Math.PI;
  c.castShadow = c.receiveShadow = true; addSolid(c);
  if (Math.random() < 0.35) {
    const c2 = new THREE.Mesh(crateGeo, MAT.wood);
    c2.scale.setScalar(s * 0.9); c2.position.set(x + 0.3, 1.1 * s + 0.45 * s, z - 0.2);
    c2.rotation.y = c.rotation.y + 0.4; c2.castShadow = true; addSolid(c2);
  }
}
for (const [x, z, ry] of [[-4, -4, 0.4], [4, 4, 0.4], [-4, 5, -0.5], [5, -5, -0.5], [0, -7, 0], [0, 7, 0], [-11, 6, 1.2], [11, -6, 1.2]]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.85, 0.6), MAT.concrete);
  m.position.set(x, 0.42, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; addSolid(m);
}
function sandbags(x, z, ry, n = 3) {
  const grp = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), MAT.sand);
    m.scale.set(1.6, 0.55, 0.8);
    m.position.set((i - (n - 1) / 2) * 1.5, 0.3 + (i % 2) * 0.42, (Math.random() - 0.5) * 0.15);
    m.castShadow = true; grp.add(m);
  }
  grp.position.set(x, 0, z); grp.rotation.y = ry; scene.add(grp);
  grp.updateMatrixWorld(true); colliders.push(new THREE.Box3().setFromObject(grp));
  grp.children.forEach(c => obstacles.push(c));
}
sandbags(-2, -12, 0.1); sandbags(3, 12, -0.15); sandbags(-13, -3, 1.5);
sandbags(13, 3, 1.5); sandbags(-6, 8, 0.5); sandbags(7, -8, 0.5);
for (const [x, z, ry] of [[-10, -14, 0.3], [10, 14, 0.3], [-14, 10, 1.2], [14, -10, 1.2]]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(6, 1.4, 0.5), MAT.concrete);
  m.position.set(x, 0.7, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; addSolid(m);
}
const barrels = [];
{
  const bg = new THREE.CylinderGeometry(0.42, 0.42, 0.95, 14);
  const spots = [[6, 10], [6.9, 10.4], [-7, -11], [12, -2], [-12, 3], [3, 16], [-4, -16], [18, 8]];
  spots.forEach(([x, z], i) => {
    const explosive = i % 2 === 0;
    const m = new THREE.Mesh(bg, explosive ? MAT.rustRed : MAT.rustBlue);
    m.position.set(x, 0.48, z); m.castShadow = true; addSolid(m);
    barrels.push({ mesh: m, hp: 30, explosive, dead: false, pos: new THREE.Vector3(x, 0.6, z) });
  });
}
{
  const tg = new THREE.TorusGeometry(0.36, 0.15, 8, 18);
  for (const [x, z] of [[-9, 13], [10, -14], [9, 8], [-10, -8]]) {
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(tg, MAT.tire);
      t.position.set(x, 0.16 + i * 0.3, z); t.rotation.x = Math.PI / 2; t.castShadow = true; scene.add(t);
    }
    const col = new THREE.Mesh(new THREE.BoxGeometry(1, 1.1, 1), new THREE.MeshBasicMaterial({ visible: false }));
    col.position.set(x, 0.55, z); scene.add(col); colliders.push(new THREE.Box3().setFromObject(col));
  }
}
for (const [x, z] of [[-18, -18], [18, 18], [-18, 18], [18, -18]]) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.6, 8), MAT.dark);
  pole.position.set(x, 2.3, z); pole.castShadow = true; scene.add(pole);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), MAT.lampOn);
  bulb.position.set(x, 4.7, z); scene.add(bulb);
  if (x < 0 && z < 0 || x > 0 && z > 0) {
    const pl = new THREE.PointLight(0xffcc88, 12, 17, 1.8);
    pl.position.set(x, 4.6, z); scene.add(pl);
  }
  const col = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.6, 0.4), new THREE.MeshBasicMaterial({ visible: false }));
  col.position.set(x, 2.3, z); scene.add(col); colliders.push(new THREE.Box3().setFromObject(col));
}
// resupply depot (hold F nearby)
const depot = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.4), MAT.supply);
depot.position.set(-5, 0.55, 17.5); depot.castShadow = true; addSolid(depot);

// ---------------- player ----------------
const player = {
  pos: new THREE.Vector3(0, 1.7, 22), vel: new THREE.Vector3(),
  yaw: 0, pitch: -0.02, hp: 100, armor: 50, onGround: true,
  radius: 0.45, dead: false, bob: 0, stepT: 0, lastDmg: -99,
};
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyM') { settings.muted = !settings.muted; toast(settings.muted ? 'Audio muted (M)' : 'Audio on (M)'); }
  if (e.code === 'KeyP') togglePause();
  if (['Space', 'ArrowUp'].includes(e.code) && state === 'play') e.preventDefault();
});
addEventListener('keyup', e => keys[e.code] = false);
let locked = false, state = 'menu';
canvas.addEventListener('click', () => { if (state === 'play' && !locked) lock(); });
function lock() {
  try {
    const r = canvas.requestPointerLock && canvas.requestPointerLock();
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch (e) { /* headless / denied: game still runs */ }
}
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked) { weapon.trigger = false; weapon.aim = false; }
  if (!locked && state === 'play' && !QS.has('autostart')) pauseEl.classList.remove('hidden');
  else pauseEl.classList.add('hidden');
});
document.addEventListener('mousemove', e => {
  if (!locked || state !== 'play') return;
  player.yaw -= e.movementX * 0.0021 * settings.sens;
  player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - e.movementY * 0.0021 * settings.sens));
});
function togglePause() {
  if (state !== 'play') return;
  if (locked) document.exitPointerLock();
  else lock();
}
function collideCircle(p, r) {
  for (const b of colliders) {
    if (1.0 < b.min.y || 0.25 > b.max.y) continue;
    const cx = Math.max(b.min.x, Math.min(p.x, b.max.x));
    const cz = Math.max(b.min.z, Math.min(p.z, b.max.z));
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      const d = Math.sqrt(d2) || 0.001;
      p.x = cx + dx / d * r; p.z = cz + dz / d * r;
    }
  }
  p.x = Math.max(-WORLD, Math.min(WORLD, p.x));
  p.z = Math.max(-WORLD, Math.min(WORLD, p.z));
}

// ---------------- rifle viewmodel (procedural) ----------------
const gun = new THREE.Group();
{
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.45, metalness: 0.7 });
  const poly = new THREE.MeshStandardMaterial({ color: 0x4c4f43, roughness: 0.8, metalness: 0.1 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xc98a2e, roughness: 0.5, metalness: 0.4 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); gun.add(m); return m; };
  add(new THREE.BoxGeometry(0.07, 0.11, 0.55), metal, 0, -0.02, -0.15);
  const barrel = add(new THREE.CylinderGeometry(0.022, 0.022, 0.4, 10), metal, 0, 0.005, -0.6);
  barrel.rotation.x = Math.PI / 2;
  add(new THREE.BoxGeometry(0.06, 0.07, 0.22), poly, 0, -0.03, -0.48);
  add(new THREE.BoxGeometry(0.055, 0.12, 0.1), poly, 0, -0.1, -0.02);
  add(new THREE.BoxGeometry(0.05, 0.14, 0.09), poly, 0, -0.11, 0.12);
  add(new THREE.BoxGeometry(0.045, 0.1, 0.07), metal, 0, -0.11, -0.12);
  add(new THREE.BoxGeometry(0.012, 0.035, 0.012), accent, 0, 0.05, -0.3);
  add(new THREE.BoxGeometry(0.03, 0.03, 0.02), metal, 0, 0.045, -0.02);
  gun.position.set(0.26, -0.24, -0.45);
  gun.scale.setScalar(0.7);
}
camera.add(gun); scene.add(camera);
const muzzle = new THREE.Object3D(); muzzle.position.set(0.24, -0.17, -1.3); camera.add(muzzle);
const flashTex = canvasTex(128, (g, s) => {
  const gr = g.createRadialGradient(s/2, s/2, 2, s/2, s/2, s/2);
  gr.addColorStop(0, 'rgba(255,255,225,1)'); gr.addColorStop(0.35, 'rgba(255,190,100,.9)');
  gr.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(255,240,200,.85)'; g.lineWidth = 7;
  g.beginPath(); g.moveTo(s/2, 6); g.lineTo(s/2, s-6); g.moveTo(6, s/2); g.lineTo(s-6, s/2); g.stroke();
});
const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
flash.scale.set(0.42, 0.42, 1);
flash.position.copy(muzzle.position); camera.add(flash);
const flashLight = new THREE.PointLight(0xffb454, 0, 9, 2);
flashLight.position.set(0.26, -0.1, -1.2); camera.add(flashLight);

const weapon = {
  mag: 30, magSize: 30, reserve: 90, reloading: false,
  nextShot: 0, rpm: 720, dmg: 34, spread: 0.012,
  ads: 0, recoil: 0, trigger: false, aim: false,
};
function startReload() {
  if (state !== 'play' || weapon.reloading || weapon.mag === weapon.magSize || weapon.reserve <= 0) return;
  weapon.reloading = true; sfx('reload');
  $('reload-tip').classList.remove('hidden');
  setTimeout(() => {
    const take = Math.min(weapon.magSize - weapon.mag, weapon.reserve);
    weapon.mag += take; weapon.reserve -= take; weapon.reloading = false;
    $('reload-tip').classList.add('hidden');
  }, 1400);
}
addEventListener('mousedown', e => {
  if (state !== 'play' || !locked) return;
  if (e.button === 0) weapon.trigger = true;
  if (e.button === 2) weapon.aim = true;
});
addEventListener('mouseup', e => {
  if (e.button === 0) weapon.trigger = false;
  if (e.button === 2) weapon.aim = false;
});
addEventListener('contextmenu', e => e.preventDefault());

// ---------------- effects pools ----------------
const raycaster = new THREE.Raycaster();
const tracers = [];
{
  const tg = new THREE.BoxGeometry(0.012, 0.012, 1);
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.visible = false; scene.add(m); tracers.push({ m, t: 1 });
  }
}
function spawnTracer(a, b, enemy = false) {
  const tr = tracers.find(t => t.t >= 1); if (!tr) return;
  tr.m.material.color.set(enemy ? 0xff6a5a : 0xffe2a0);
  tr.m.visible = true; tr.t = 0;
  tr.m.position.copy(a).add(b).multiplyScalar(0.5);
  tr.m.lookAt(b); tr.m.scale.set(1, 1, a.distanceTo(b));
}
const holes = []; let holeIx = 0;
for (let i = 0; i < 40; i++) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ map: holeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
  m.visible = false; scene.add(m); holes.push(m);
}
const PMAX = 400;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(PMAX * 3), pVel = new Float32Array(PMAX * 3), pLife = new Float32Array(PMAX);
for (let i = 0; i < PMAX; i++) pPos[i * 3 + 1] = -50;
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
const sparkTex = canvasTex(64, (g, s) => {
  const grd = g.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,220,150,.9)');
  grd.addColorStop(1, 'rgba(255,180,80,0)');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
});
const pMat = new THREE.PointsMaterial({ color: 0xffcc88, size: 0.09, map: sparkTex, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
const points = new THREE.Points(pGeo, pMat); points.frustumCulled = false; scene.add(points);
let pHead = 0;
function burst(p, n, color, spd = 4, up = 2) {
  pMat.color.set(color);
  for (let i = 0; i < n; i++) {
    const k = pHead; pHead = (pHead + 1) % PMAX;
    pPos[k * 3] = p.x; pPos[k * 3 + 1] = p.y; pPos[k * 3 + 2] = p.z;
    pVel[k * 3] = (Math.random() - 0.5) * spd;
    pVel[k * 3 + 1] = Math.random() * up;
    pVel[k * 3 + 2] = (Math.random() - 0.5) * spd;
    pLife[k] = 0.5 + Math.random() * 0.5;
  }
}
const boomLight = new THREE.PointLight(0xff8a3a, 0, 30, 1.6); scene.add(boomLight);

// ---------------- enemies ----------------
function fallbackSoldier() {
  const grp = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x5a6b4a, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a17a, roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), body); torso.position.y = 1.15; grp.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.28), skin); head.position.y = 1.7; grp.add(head);
  const helm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.34), new THREE.MeshStandardMaterial({ color: 0x4a4a3a })); helm.position.y = 1.88; grp.add(helm);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.14), body); arm.position.set(s * 0.34, 1.15, 0); grp.add(arm);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.75, 0.17), new THREE.MeshStandardMaterial({ color: 0x3f4a35 })); leg.position.set(s * 0.13, 0.38, 0); grp.add(leg);
  }
  const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.8), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  rifle.position.set(0.2, 1.2, -0.3); grp.add(rifle);
  grp.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { grp, mixer: null };
}
const bots = []; let botId = 0, pendingSpawns = 0;
function spawnBot(wave) {
  const corners = [[-24, -24], [24, -24], [-24, 24], [24, 24], [0, -24], [-24, 0], [24, 0]];
  const [sx, sz] = corners[Math.floor(Math.random() * corners.length)];
  let grp, mixer = null;
  if (soldierAsset) {
    grp = skeletonClone(soldierAsset.gltf.scene);
    grp.scale.setScalar(soldierAsset.scale);
    mixer = new THREE.AnimationMixer(grp);
    const clip = soldierAsset.gltf.animations[0];
    if (clip) mixer.clipAction(clip).play();
  } else ({ grp, mixer } = fallbackSoldier());
  grp.position.set(sx + (Math.random() - 0.5) * 3, 0, sz + (Math.random() - 0.5) * 3);
  // per-bot material instances so hit-flash never bleeds across clones
  grp.traverse(o => { if (o.isMesh && o.material && o.material.emissive) o.material = o.material.clone(); });
  grp.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.botId = botId; } });
  scene.add(grp);
  const hc = document.createElement('canvas'); hc.width = 64; hc.height = 8;
  const htex = new THREE.CanvasTexture(hc);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: htex, depthTest: false }));
  spr.scale.set(0.9, 0.11, 1); spr.position.y = 2.05; grp.add(spr);
  const bot = {
    id: botId++, grp, mixer, hp: 100 + wave * 8, maxHp: 100 + wave * 8,
    soldier: !!soldierAsset,
    speed: 2.2 + Math.random() * 1.2 + wave * 0.12,
    fireT: 1 + Math.random() * 2, strafe: Math.random() * 6.28,
    alive: true, hcan: hc, htex, spr, hitT: 0,
  };
  drawHp(bot); bots.push(bot);
}
function drawHp(bot) {
  const g = bot.hcan.getContext('2d');
  g.clearRect(0, 0, 64, 8);
  g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, 0, 64, 8);
  g.fillStyle = bot.hp > bot.maxHp * 0.5 ? '#39e07f' : bot.hp > bot.maxHp * 0.25 ? '#ffb454' : '#ff3b3b';
  g.fillRect(1, 1, 62 * Math.max(0, bot.hp) / bot.maxHp, 6);
  bot.htex.needsUpdate = true;
  bot.spr.visible = bot.hp < bot.maxHp && bot.alive;
}

// ---------------- game state ----------------
let score = 0, kills = 0, shots = 0, hits = 0, wave = 1;
let startT = performance.now(), elapsed = 0, shakeAmt = 0;
const hostilesLeft = () => bots.filter(b => b.alive).length + pendingSpawns;
function banner(text, ms = 2200) {
  $('wave-banner-text').textContent = text;
  $('wave-banner').classList.remove('hidden');
  clearTimeout(banner.t); banner.t = setTimeout(() => $('wave-banner').classList.add('hidden'), ms);
}
function startWave(n) {
  wave = n; sfx('wave');
  $('wave').textContent = n;
  banner(n === 1 ? 'WAVE 1 — CONTACT!' : `WAVE ${n} — HOLD THE LINE`);
  const count = Math.min(3 + n, 8);
  pendingSpawns = count;
  for (let i = 0; i < count; i++) setTimeout(() => { if (state === 'play') { spawnBot(n); pendingSpawns--; } }, 400 + i * 700);
}
function addScore(n) { score += n; $('score').textContent = score; }
function damagePlayer(amount, fromPos) {
  if (state !== 'play' || player.dead) return;
  if (player.armor > 0) {
    const absorbed = Math.min(player.armor, amount * 0.5);
    player.armor -= absorbed; amount -= absorbed;
  }
  player.hp -= amount; player.lastDmg = elapsed;
  sfx('hurt');
  const dv = $('damage-vignette');
  dv.style.opacity = 0.95; setTimeout(() => dv.style.opacity = 0, 140);
  if (settings.shake) shakeAmt = Math.min(0.5, shakeAmt + 0.18);
  if (fromPos) {
    const el = document.createElement('div');
    el.className = 'hd';
    $('hitdir').appendChild(el); setTimeout(() => el.remove(), 600);
  }
  if (player.hp <= 0) { player.hp = 0; player.dead = true; gameOver(false); }
}
function gameOver(win) {
  state = 'over';
  document.exitPointerLock && document.exitPointerLock();
  pauseEl.classList.add('hidden');
  $('final-stats').innerHTML =
    `${win ? 'Courtyard cleared!' : 'KIA on wave ' + wave}<br>` +
    `Score <b>${score}</b> · Kills <b>${kills}</b> · Wave <b>${wave}</b><br>` +
    `Time ${Math.round(elapsed)}s · Accuracy ${shots ? Math.round(hits / shots * 100) : 0}%`;
  overEl.classList.remove('hidden');
  hud.classList.add('hidden');
}
function hurtBot(bot, dmg, point, head) {
  if (!bot.alive) return;
  bot.hp -= dmg; bot.hitT = 0.15; drawHp(bot);
  burst(point, 6, 0xc22e2e, 3, 2);
  if (bot.hp <= 0) {
    bot.alive = false; kills++;
    addScore(head ? 150 : 100);
    sfx('kill'); showHit(true);
    feed(`${head ? 'HEADSHOT' : 'Hostile down'} +${head ? 150 : 100} (${kills})`);
    bot.grp.rotation.x = -Math.PI / 2; bot.grp.position.y = 0.25;
    setTimeout(() => scene.remove(bot.grp), 2500);
    if (!bots.some(b => b.alive) && pendingSpawns === 0) {
      if (wave >= WIN_WAVE) gameOver(true);
      else {
        addScore(200); feed(`Wave ${wave} cleared +200`);
        setTimeout(() => { if (state === 'play') startWave(wave + 1); }, 2400);
      }
    }
  } else sfx('hit');
}
function showHit(kill) {
  const h = $('hitmarker');
  h.classList.add('show'); h.classList.toggle('kill', !!kill);
  clearTimeout(showHit.t); showHit.t = setTimeout(() => h.classList.remove('show'), 130);
}
function explodeBarrel(b) {
  if (b.dead) return; b.dead = true;
  burst(b.pos, 60, 0xff8a3a, 9, 6); burst(b.pos, 30, 0x333333, 5, 4);
  boomLight.position.copy(b.pos); boomLight.position.y += 1; boomLight.intensity = 120;
  sfx('boom');
  if (settings.shake) shakeAmt = Math.min(0.8, shakeAmt + 0.4);
  scene.remove(b.mesh);
  const ix = obstacles.indexOf(b.mesh); if (ix >= 0) obstacles.splice(ix, 1);
  for (const bot of bots) {
    if (!bot.alive) continue;
    const d = bot.grp.position.distanceTo(b.pos);
    if (d < 7) hurtBot(bot, d < 3 ? 170 : 70, bot.grp.position.clone().add(new THREE.Vector3(0, 1.2, 0)), false);
  }
  const pd = player.pos.distanceTo(b.pos);
  if (pd < 7) damagePlayer(pd < 3.5 ? 55 : 22, b.pos);
}

// ---------------- shooting ----------------
const _dir = new THREE.Vector3(), _o = new THREE.Vector3(), _mzl = new THREE.Vector3();
function shoot() {
  if (weapon.reloading) return;
  if (weapon.mag <= 0) { sfx('empty'); startReload(); return; }
  const now = performance.now() / 1000;
  if (now < weapon.nextShot) return;
  weapon.nextShot = now + 60 / weapon.rpm;
  weapon.mag--; shots++;
  sfx('shot');
  if (settings.shake) shakeAmt = Math.min(0.4, shakeAmt + 0.07);
  weapon.recoil = Math.min(weapon.recoil + 0.028, 0.12);
  flash.material.opacity = 1; flash.material.rotation = Math.random() * 6.28; flashLight.intensity = 14;
  camera.getWorldPosition(_o); camera.getWorldDirection(_dir);
  const spread = weapon.spread * (weapon.ads > 0.5 ? 0.35 : 1) * (1 + player.vel.length() * 0.08);
  _dir.x += (Math.random() - 0.5) * spread * 2;
  _dir.y += (Math.random() - 0.5) * spread * 2;
  _dir.z += (Math.random() - 0.5) * spread * 2;
  _dir.normalize();
  raycaster.set(_o, _dir); raycaster.far = 120;
  muzzle.getWorldPosition(_mzl);
  const botMeshes = [];
  for (const b of bots) if (b.alive) b.grp.traverse(o => { if (o.isMesh) botMeshes.push(o); });
  const targets = botMeshes.concat(obstacles);
  for (const b of barrels) if (!b.dead) targets.push(b.mesh);
  targets.push(depot);
  const hitsArr = raycaster.intersectObjects(targets, false);
  let end = _o.clone().add(_dir.clone().multiplyScalar(90));
  if (hitsArr.length) {
    const h = hitsArr[0]; end = h.point.clone();
    const bot = h.object.userData.botId !== undefined ? bots.find(b => b.id === h.object.userData.botId && b.alive) : null;
    if (bot) {
      hits++;
      const head = h.point.y > bot.grp.position.y + 1.42;
      showHit(false);
      hurtBot(bot, head ? weapon.dmg * 2 : weapon.dmg, h.point.clone(), head);
    } else {
      const barrel = barrels.find(b => !b.dead && b.mesh === h.object);
      if (barrel) {
        barrel.hp -= weapon.dmg;
        burst(h.point, 5, 0xffaa44, 3, 2);
        if (barrel.hp <= 0) explodeBarrel(barrel);
      } else {
        burst(h.point, 5, 0xd8c9a8, 3, 2);
        const hole = holes[holeIx++ % holes.length];
        hole.visible = true;
        if (h.face) {
          hole.position.copy(h.point).add(h.face.normal.clone().multiplyScalar(0.02));
          hole.lookAt(h.point.clone().add(h.face.normal));
        } else { hole.position.copy(h.point); hole.position.y += 0.02; hole.rotation.x = -Math.PI / 2; }
      }
    }
  }
  spawnTracer(_mzl.clone(), end.clone());
  if (weapon.mag === 0) setTimeout(startReload, 250);
}

// ---------------- menu / flow ----------------
function deploy() {
  audio(); if (AC && AC.resume) AC.resume();
  menu.classList.add('hidden'); overEl.classList.add('hidden');
  hud.classList.remove('hidden');
  state = 'play'; startT = performance.now();
  if (!QS.has('autostart')) lock();
  const begin = () => { if (bots.length === 0 && pendingSpawns === 0) startWave(1); };
  if (soldierDone) begin();
  else {
    const t0 = performance.now();
    const wait = setInterval(() => {
      if (soldierDone || performance.now() - t0 > 4000) { clearInterval(wait); if (state === 'play') begin(); }
    }, 100);
  }
  toast('WASD move · LMB fire · RMB aim · R reload · F resupply');
}
$('play-btn').onclick = deploy;
$('retry-btn').onclick = () => location.reload();
$('restart-btn').onclick = () => location.reload();
$('resume-btn').onclick = () => lock();
if (QS.has('autostart')) deploy();

// ---------------- per-frame ----------------
const clock = new THREE.Clock();
const crosshair = $('crosshair');
let fpsA = 60, firstFrame = true;
const fwd = new THREE.Vector3(), rgt = new THREE.Vector3(), wish = new THREE.Vector3(), tmpV = new THREE.Vector3();
function update(dt) {
  elapsed = (performance.now() - startT) / 1000;
  if (QS.has('autostart') && !player.dead) {
    // demo mode: track nearest live bot and fire for screenshots / attract mode
    let best = null, bd = 1e9;
    for (const b of bots) {
      if (!b.alive) continue;
      const d = b.grp.position.distanceToSquared(player.pos);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) {
      const dx = best.grp.position.x - player.pos.x, dz = best.grp.position.z - player.pos.z;
      player.yaw = Math.atan2(-dx, -dz);
      player.pitch = -0.02;
      weapon.trigger = true;
    } else { player.yaw += dt * 0.15; weapon.trigger = false; }
  }
  // resupply (hold F near depot)
  const nearDepot = player.pos.distanceTo(tmpV.set(-5, 1.7, 17.5)) < 3.2;
  $('interact-tip').classList.toggle('hidden', !nearDepot);
  if (nearDepot && keys.KeyF && (player.armor < 100 || weapon.reserve < 120)) {
    player.armor = 100; weapon.reserve = 120;
    sfx('supply'); toast('Resupplied: armor 100 · reserve ammo 120'); feed('Resupplied at depot');
    keys.KeyF = false;
  }
  // movement
  const sprint = (keys.ShiftLeft || keys.ShiftRight) && keys.KeyW;
  const sp = (sprint ? 7.4 : 5.2) * (weapon.ads > 0.5 ? 0.55 : 1);
  fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  rgt.set(-fwd.z, 0, fwd.x);
  wish.set(0, 0, 0);
  if (keys.KeyW) wish.add(fwd); if (keys.KeyS) wish.sub(fwd);
  if (keys.KeyD) wish.add(rgt); if (keys.KeyA) wish.sub(rgt);
  if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(sp);
  const k = Math.min(1, dt * 10);
  player.vel.x += (wish.x - player.vel.x) * k;
  player.vel.z += (wish.z - player.vel.z) * k;
  player.vel.y -= 18 * dt;
  if (keys.Space && player.onGround) { player.vel.y = 6.2; player.onGround = false; }
  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  player.pos.y += player.vel.y * dt;
  if (player.pos.y <= 1.7) { player.pos.y = 1.7; player.vel.y = 0; player.onGround = true; }
  collideCircle(player.pos, player.radius);
  const moving = Math.hypot(player.vel.x, player.vel.z) > 1.2 && player.onGround;
  if (moving) {
    player.bob += dt * (sprint ? 11 : 8);
    player.stepT += dt * Math.hypot(player.vel.x, player.vel.z);
    if (player.stepT > 3.4) { player.stepT = 0; sfx('step'); }
  }
  const bobY = moving ? Math.sin(player.bob) * 0.035 : 0;
  shakeAmt = Math.max(0, shakeAmt - dt * 1.6);
  const sh = settings.shake ? shakeAmt : 0;
  camera.position.set(
    player.pos.x + (Math.random() - 0.5) * sh * 0.15,
    player.pos.y + bobY + (Math.random() - 0.5) * sh * 0.15,
    player.pos.z);
  camera.rotation.set(player.pitch + weapon.recoil * 0.35, player.yaw, Math.sin(player.bob * 0.5) * 0.003);
  weapon.recoil = Math.max(0, weapon.recoil - dt * 1.8);
  // ADS
  const wantAds = (weapon.aim && !weapon.reloading) ? 1 : 0;
  weapon.ads += (wantAds - weapon.ads) * Math.min(1, dt * 10);
  gun.position.set(weapon.ads > 0.5 ? 0 : 0.24, weapon.ads > 0.5 ? -0.175 : -0.22 + bobY * 0.5, -0.5);
  gun.rotation.x = weapon.recoil * 1.4;
  const fovT = 75 - weapon.ads * 18;
  if (Math.abs(camera.fov - fovT) > 0.1) { camera.fov = fovT; camera.updateProjectionMatrix(); }
  crosshair.style.setProperty('--sp', (4 + Math.hypot(player.vel.x, player.vel.z) * 1.6 + weapon.recoil * 260) + 'px');
  crosshair.style.opacity = weapon.ads > 0.5 ? 0.25 : 1;
  if (weapon.trigger && state === 'play') shoot();
  flash.material.opacity = Math.max(0, flash.material.opacity - dt * 14);
  flashLight.intensity = Math.max(0, flashLight.intensity - dt * 160);
  // regen
  if (elapsed - player.lastDmg > 4 && player.hp < 100 && !player.dead) {
    player.hp = Math.min(100, player.hp + dt * 14);
    const hv = $('heal-vignette');
    hv.style.opacity = 0.5; clearTimeout(update.ht);
    update.ht = setTimeout(() => hv.style.opacity = 0, 200);
  }
  // fx
  for (const t of tracers) {
    if (!t.m.visible) continue;
    t.t += dt * 9; t.m.material.opacity = Math.max(0, 1 - t.t);
    if (t.t >= 1) t.m.visible = false;
  }
  for (let i = 0; i < PMAX; i++) {
    if (pLife[i] <= 0) continue;
    pLife[i] -= dt;
    pVel[i * 3 + 1] -= 9 * dt;
    pPos[i * 3] += pVel[i * 3] * dt;
    pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
    pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    if (pLife[i] <= 0) pPos[i * 3 + 1] = -50;
  }
  pGeo.attributes.position.needsUpdate = true;
  boomLight.intensity = Math.max(0, boomLight.intensity - dt * 220);
  // bots
  for (const bot of bots) {
    if (!bot.alive) continue;
    if (bot.mixer) bot.mixer.update(dt);
    bot.hitT = Math.max(0, bot.hitT - dt);
    const bp = bot.grp.position;
    tmpV.set(player.pos.x - bp.x, 0, player.pos.z - bp.z);
    const dist = tmpV.length(); tmpV.normalize();
    bot.grp.rotation.y = Math.atan2(tmpV.x, tmpV.z);
    _o.set(bp.x, 1.55, bp.z);
    _dir.set(player.pos.x - bp.x, (player.pos.y - 0.2) - 1.55, player.pos.z - bp.z);
    const dlen = _dir.length(); _dir.normalize();
    raycaster.set(_o, _dir); raycaster.far = dlen;
    const blocked = raycaster.intersectObjects(obstacles, false).length > 0;
    bot.strafe += dt * 0.8;
    if (!blocked && dist < 30 && state === 'play' && !player.dead) {
      if (dist > 12) { bp.x += tmpV.x * bot.speed * dt; bp.z += tmpV.z * bot.speed * dt; }
      else if (dist < 5) { bp.x -= tmpV.x * bot.speed * 0.7 * dt; bp.z -= tmpV.z * bot.speed * 0.7 * dt; }
      else { bp.x += Math.cos(bot.strafe) * bot.speed * 0.5 * dt; bp.z += Math.sin(bot.strafe) * bot.speed * 0.3 * dt; }
      bp.y = Math.abs(Math.sin(elapsed * 7 + bot.id)) * 0.05;
      bot.fireT -= dt;
      if (bot.fireT <= 0 && dist < 28) {
        bot.fireT = Math.max(0.55, 0.9 + Math.random() * 1.4 - wave * 0.04);
        const from = new THREE.Vector3(bp.x, 1.45, bp.z);
        const sprinting = Math.hypot(player.vel.x, player.vel.z) > 6;
        const to = new THREE.Vector3(
          player.pos.x + (Math.random() - 0.5) * (sprinting ? 1.2 : 0.6),
          player.pos.y - 0.15 + (Math.random() - 0.5) * 0.5,
          player.pos.z + (Math.random() - 0.5) * 0.6);
        spawnTracer(from, to, true); sfx('shot', true);
        burst(to, 2, 0xff5040, 2, 1);
        damagePlayer(Math.max(4, 13 - dist * 0.28) * (0.8 + Math.random() * 0.5), from);
      }
    } else {
      bp.x += tmpV.x * bot.speed * dt; bp.z += tmpV.z * bot.speed * dt;
      bp.y = Math.abs(Math.sin(elapsed * 8 + bot.id)) * 0.08;
    }
    collideCircle(bp, 0.45);
    // hard separation vs player: never enter the camera
    {
      const sx = bp.x - player.pos.x, sz = bp.z - player.pos.z;
      const sd = Math.hypot(sx, sz);
      if (sd < 2.2 && sd > 0.001) { bp.x = player.pos.x + sx / sd * 2.2; bp.z = player.pos.z + sz / sd * 2.2; }
    }
    for (const o of bots) {
      if (o === bot || !o.alive) continue;
      const dx = bp.x - o.grp.position.x, dz = bp.z - o.grp.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.1 && d > 0.001) { bp.x += dx / d * dt * 2; bp.z += dz / d * dt * 2; }
    }
    if (bot.hitT > 0) bot.grp.traverse(m => { if (m.isMesh && m.material && m.material.emissive) m.material.emissive.setHex(0x661111); });
    else if (bot.hitT === 0 && bot.wasHit) { bot.wasHit = false; bot.grp.traverse(m => { if (m.isMesh && m.material && m.material.emissive) m.material.emissive.setHex(0x000000); }); }
    if (bot.hitT > 0) bot.wasHit = true;
  }
  // HUD
  $('health-num').textContent = Math.ceil(player.hp);
  $('health-bar').style.width = player.hp + '%';
  $('health-bar').style.background = player.hp > 50 ? '' : '#ff5040';
  $('armor-bar').style.width = player.armor + '%';
  $('ammo-mag').textContent = weapon.mag;
  $('ammo-reserve').textContent = weapon.reserve;
  $('ammo').classList.toggle('low', weapon.mag <= 6);
  $('enemies').textContent = hostilesLeft();
  // minimap
  mm.clearRect(0, 0, 140, 140);
  mm.fillStyle = 'rgba(16,22,30,.92)'; mm.fillRect(0, 0, 140, 140);
  const w2m = v => 70 + v / 64 * 140;
  mm.fillStyle = '#39434f'; mm.fillRect(w2m(-32), w2m(-32), w2m(32) - w2m(-32), w2m(32) - w2m(-32));
  mm.fillStyle = '#4a5460'; mm.beginPath(); mm.arc(70, 70, 20, 0, 7); mm.fill();
  mm.fillStyle = '#8a6a3f';
  for (const [x, z] of cratePos) mm.fillRect(w2m(x) - 2, w2m(z) - 2, 4, 4);
  mm.fillStyle = '#ff3b3b';
  for (const b of barrels) if (!b.dead) { mm.beginPath(); mm.arc(w2m(b.pos.x), w2m(b.pos.z), 2.2, 0, 7); mm.fill(); }
  mm.fillStyle = '#2aff7a'; mm.fillRect(w2m(-5) - 3, w2m(17.5) - 3, 6, 6);
  for (const bot of bots) {
    if (!bot.alive) continue;
    mm.fillStyle = '#ff5040';
    mm.beginPath(); mm.arc(w2m(bot.grp.position.x), w2m(bot.grp.position.z), 3, 0, 7); mm.fill();
  }
  mm.save();
  mm.translate(w2m(player.pos.x), w2m(player.pos.z)); mm.rotate(-player.yaw + Math.PI);
  mm.fillStyle = '#39e07f';
  mm.beginPath(); mm.moveTo(0, -6); mm.lineTo(4, 5); mm.lineTo(-4, 5); mm.closePath(); mm.fill();
  mm.restore();
}
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  fpsA += ((1 / Math.max(dt, 1e-4)) - fpsA) * 0.05;
  if (state === 'play') update(dt);
  $('fps-counter').textContent = Math.round(fpsA);
  renderer.render(scene, camera);
  if (firstFrame) {
    firstFrame = false;
    window.__ready = true;
    window.__game = {
      player, bots, weapon,
      get state() { return state; },
      get wave() { return wave; },
      get score() { return score; },
      get kills() { return kills; },
      soldierReady: () => !!soldierAsset,
    };
  }
}
loop();
window.__shoot = shoot;
window.__deploy = deploy;
