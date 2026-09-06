import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createRenamonModel } from './src/createRenamonModel.ts';

const qs = new URLSearchParams(location.search);
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0b0d);
scene.fog = new THREE.Fog(0x0b0b0d, 8, 20);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
function sideView() { camera.position.set(2.6, 1.5, 0.6); controls.target.set(0, 1.0, 0); }
function frontView() { camera.position.set(0.4, 1.5, 2.8); controls.target.set(0, 1.0, 0); }
camera.position.set(2.6, 1.5, 0.6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1.0, 0);

// key / fill / rim per spec lightingFromPhoto
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(-3, 5, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
scene.add(key);
const fill = new THREE.DirectionalLight(0xbfd0ff, 0.55);
fill.position.set(4, 2, -1);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xfff2cc, 1.1);
rim.position.set(1, 4, -4);
scene.add(rim);
scene.add(new THREE.AmbientLight(0xffffff, 0.25));

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(4, 48),
  new THREE.ShadowMaterial({ opacity: 0.35 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(8, 16, 0x333333, 0x222222);
grid.position.y = -0.001;
scene.add(grid);

const model = createRenamonModel({ castShadow: true, receiveShadow: true });
model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
// drop fully-transparent blockout proxies (e.g. root volume) in all modes
{
  const dead = [];
  model.traverse((o) => {
    if (o.isMesh) {
      const m = o.material;
      if (m && (m.transparent || (typeof m.opacity === 'number' && m.opacity < 0.5))) dead.push(o);
    }
  });
  for (const o of dead) o.parent?.remove(o);
}
// map-stripped evidence mode: unlit flat gray proves geometry carries the form
if (qs.get('flat') === '1') {
  const flat = new THREE.MeshBasicMaterial({ color: 0xbbbbbb });
  model.traverse((o) => {
    if (o.isMesh) {
      const m = o.material;
      if (m && (m.transparent || (typeof m.opacity === 'number' && m.opacity < 0.5))) {
        o.visible = false; // hide transparent blockout proxies (e.g. root volume)
      } else {
        o.material = flat;
      }
    }
  });
}
let wire = false;
scene.add(model);

// normalize: fit model into ~2.2 units tall standing on ground
let baseY = 0;
{
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const s = 2.2 / Math.max(size.y, 1e-6);
  model.scale.setScalar(s);
  model.position.x -= center.x * s;
  model.position.z -= center.z * s;
  model.position.y -= box.min.y * s;
  baseY = model.position.y;
}

let spin = qs.get('static') !== '1';

// ---- run-cycle preview (procedural, in place) ----
const POSE_NODES = ['hips', 'torso', 'neck', 'head', 'ear-l', 'ear-r',
  'shoulder-l', 'shoulder-r', 'elbow-l', 'elbow-r',
  'hip-l', 'hip-r', 'knee-l', 'knee-r', 'ankle-l', 'ankle-r',
  'tail', 'tail-mid', 'tail-tip'];
const rt0 = model.userData && model.userData.sculptRuntime;
const nodeMap = (rt0 && rt0.nodes) || {};
const basePose = {};
for (const n of POSE_NODES) {
  const o = nodeMap[n];
  if (o) basePose[n] = { p: o.position.clone(), r: o.rotation.clone() };
}
let runMode = qs.get('run') === '1';
let runPhase = parseFloat(qs.get('runphase') || 'NaN');
const runFrozen = Number.isFinite(runPhase);
if (runFrozen) { runMode = true; spin = false; }
if (!Number.isFinite(runPhase)) runPhase = 0;
const RUN_SPEED = 9.0; // rad/s ~ 1.4 strides/s
let lastT = 0;

function applyRunPose(ph) {
  const set = (n, rx = 0, ry = 0, rz = 0, dy = 0) => {
    const o = nodeMap[n]; const b = basePose[n];
    if (!o || !b) return;
    o.rotation.set(b.r.x + rx, b.r.y + ry, b.r.z + rz);
    o.position.set(b.p.x, b.p.y + dy, b.p.z);
  };
  const sL = Math.sin(ph), sR = Math.sin(ph + Math.PI);
  // legs: swing + knee flexion during swing-through + ankle compensation
  const kneeL = 0.3 + 1.1 * Math.pow(Math.max(0, -Math.sin(ph - 0.9)), 1.2);
  const kneeR = 0.3 + 1.1 * Math.pow(Math.max(0, -Math.sin(ph + Math.PI - 0.9)), 1.2);
  const hipL = -0.85 * sL, hipR = -0.85 * sR;
  set('hip-l', hipL); set('hip-r', hipR);
  set('knee-l', kneeL); set('knee-r', kneeR);
  set('ankle-l', -(hipL + kneeL) * 0.38); set('ankle-r', -(hipR + kneeR) * 0.38);
  // arms: opposite swing, elbows bent
  set('shoulder-l', 0.7 * sL); set('shoulder-r', 0.7 * sR);
  set('elbow-l', -0.6 - 0.35 * Math.max(0, sL)); set('elbow-r', -0.6 - 0.35 * Math.max(0, sR));
  // torso lean + double-frequency bob, head steady
  set('torso', 0.18); set('hips', 0, 0, 0, -0.04 + 0.045 * Math.cos(2 * ph));
  set('head', 0.08); set('neck', 0.05);
  // ears pinned back, tail streams behind with wag
  set('ear-l', -0.45); set('ear-r', -0.45);
  set('tail', -0.35, 0.1 * Math.sin(2 * ph));
  set('tail-mid', -0.25, 0.14 * Math.sin(2 * ph + 0.7));
  set('tail-tip', -0.15);
}
function restoreBasePose() {
  for (const n of POSE_NODES) {
    const o = nodeMap[n]; const b = basePose[n];
    if (!o || !b) continue;
    o.rotation.copy(b.r); o.position.copy(b.p);
  }
}

const clock = new THREE.Clock();
// fit camera to model after the skeleton settles (bbox can grow post-bind)
let fitted = false, fitFrames = 0;
function fitCamera() {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const h = Math.max(size.y, 0.5);
  const dist = (h * 1.15) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const view = qs.get('view') || 'hero';
  const dirs = {
    hero: new THREE.Vector3(0.85, 0.32, 0.45),
    front: new THREE.Vector3(0.12, 0.18, 1),
    side: new THREE.Vector3(1, 0.15, 0.12),
    back: new THREE.Vector3(-0.5, 0.3, -1),
  };
  const dir = (dirs[view] || dirs.hero).clone().normalize();
  camera.position.copy(center).addScaledVector(dir, dist);
  controls.target.copy(center);
  camera.near = dist / 100; camera.far = dist * 20;
  camera.updateProjectionMatrix();
}
function tickFn() {
  const t = clock.getElapsedTime();
  const dt = Math.min(0.05, t - lastT); lastT = t;
  // gentle idle: breathing sway + tail sway via runtime sockets if present
  model.rotation.y += spin ? 0.0035 : 0;
  if (runMode) {
    if (!runFrozen) runPhase += dt * RUN_SPEED;
    applyRunPose(runPhase);
    model.position.y = baseY;
  } else {
    model.position.y = baseY + Math.abs(Math.sin(t * 1.4)) * 0.008;
  }
  const rt = model.userData && model.userData.sculptRuntime;
  if (!runMode && rt && typeof rt.tick === 'function') { try { rt.tick(t); } catch (e) {} }
  else if (!runMode && rt && rt.sockets) {
    const tail = rt.sockets.tail || rt.nodes?.tail;
    if (tail) tail.rotation.y = Math.sin(t * 1.8) * 0.12;
  }
}

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
try { fitCamera(); fitted = true; } catch (e) { console.error('initial fit', e); }

renderer.setAnimationLoop(() => {
  tickFn(); controls.update(); renderer.render(scene, camera);
  if (!fitted && ++fitFrames >= 5) { try { fitCamera(); } catch (e) { console.error('fitCamera', e); } fitted = true; }
});

document.getElementById('btn-spin').onclick = (e) => {
  spin = !spin; e.target.classList.toggle('on', spin);
};
if (runMode && !runFrozen) document.getElementById('btn-run')?.classList.add('on');
document.getElementById('btn-run').onclick = (e) => {
  runMode = !runMode;
  e.target.classList.toggle('on', runMode);
  if (!runMode) restoreBasePose();
};
document.getElementById('btn-wire').onclick = (e) => {
  wire = !wire; e.target.classList.toggle('on', wire);
  model.traverse((o) => { if (o.isMesh) o.material.wireframe = wire; });
};
document.getElementById('btn-front').onclick = () => frontView();
document.getElementById('btn-side').onclick = () => sideView();
window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') sideView();
});

// expose for automated verification
window.__renamon = { scene, camera, model, renderer, controls, THREE };
window.__diag = () => {
  const box = new THREE.Box3().setFromObject(model);
  const mats = {};
  let n = 0;
  model.traverse((o) => {
    if (o.isMesh) {
      n++;
      const mt = o.material;
      const k = (mt.type || '?') + ' color=#' + (mt.color ? mt.color.getHexString() : '?')
        + ' rough=' + mt.roughness + ' metal=' + mt.metalness
        + ' map=' + (mt.map ? 'Y' : 'N');
      mats[k] = (mats[k] || 0) + 1;
    }
  });
  return { meshes: n, boxMin: box.min.toArray(), boxMax: box.max.toArray(),
    modelPos: model.position.toArray(), modelScale: model.scale.x,
    camPos: camera.position.toArray(), tgt: controls.target.toArray(), mats };
};
console.log('renamon meshes:', (() => { let n = 0; model.traverse((o) => { if (o.isMesh) n++; }); return n; })());
