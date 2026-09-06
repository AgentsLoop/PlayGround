import * as THREE from 'three';
import { buildWorld, removeSolid } from './world.js';
import { createWeapon, updateWeapon, playMuzzleFlash, spawnTracer, spawnImpact, spawnShell, explodeBarrel, updateEffects, addShake, getShakeOffset } from './weapon.js';
import { createEnemy, updateEnemy, takeDamage } from './enemy.js';
import { initHUD } from './hud.js';
import { initAudio } from './audio.js';

const DEMO = new URLSearchParams(location.search).has('demo');

// ---------- renderer / scene ----------
const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 900);
camera.rotation.order = 'YXZ';

const world = buildWorld(scene);
let colliders = scene.userData.colliders;
let solidMeshes = scene.userData.solids.filter(m => m.isMesh);

const hud = initHUD();
const audio = initAudio();

// ---------- player state ----------
const player = {
  pos: world.playerSpawn.clone(),
  vel: new THREE.Vector3(),
  yaw: Math.PI, pitch: 0,
  health: 100, maxHealth: 100,
  alive: false, playing: false,
  mag: 30, magSize: 30, reserve: 120,
  reloading: false, reloadT: 0,
  fireCooldown: 0, spread: 0,
  ads: false, adsAmount: 0,
  lastDamageT: -99, bobPhase: 0, stepT: 0,
  score: 0, kills: 0, headshots: 0,
  wave: 0,
};
const EYE = 1.62;
player.pos.y = 0;

// ---------- weapon ----------
const weapon = createWeapon(camera, scene);
scene.add(camera);
// small fill light so the viewmodel reads well in shadow
const weaponLight = new THREE.PointLight(0xfff2e0, 2.5, 5, 1.6);
weaponLight.position.set(0.15, 0.1, -0.2);
camera.add(weaponLight);
const muzzleWorld = new THREE.Vector3();
const camDir = new THREE.Vector3();
const raycaster = new THREE.Raycaster();

// ---------- enemies / waves ----------
let enemies = [];
let waveActive = false;
let waveBreakT = 0;
let spawnDone = false;
const MAX_ALIVE = 9;

function spawnWave(n) {
  player.wave = n;
  hud.setWave(n);
  hud.banner('WAVE ' + n);
  audio.wave();
  const count = 3 + n * 2;
  let spawned = 0;
  spawnDone = false;
  const spawnTimer = setInterval(() => {
    if (!player.playing || !player.alive) { clearInterval(spawnTimer); return; }
    const alive = enemies.filter(e => !e.dead).length;
    if (alive >= MAX_ALIVE || spawned >= count) {
      if (spawned >= count) { clearInterval(spawnTimer); spawnDone = true; }
      return;
    }
    const sp = world.enemySpawns[(Math.random() * world.enemySpawns.length) | 0];
    const e = createEnemy(scene, new THREE.Vector3(sp.x + (Math.random() - 0.5) * 4, 0, sp.z + (Math.random() - 0.5) * 4), n);
    e.onEnemyFire = onEnemyFire;
    e.onHit = (p) => spawnImpact(scene, p, new THREE.Vector3(0, 1, 0), 'flesh');
    e.onDeath = onEnemyDeath;
    e.losT = Math.random() * 0.3;
    e.canSee = true;
    enemies.push(e);
    spawned++;
    hud.setEnemies(enemies.filter(x => !x.dead).length);
  }, 700);
  waveActive = true;
}

function onEnemyDeath(e) {
  player.score += 100;
  player.kills++;
  hud.setScore(player.score);
  hud.killfeed('Hostile down  +100');
  hud.killpop('HOSTILE DOWN');
  audio.kill();
  hud.setEnemies(enemies.filter(x => !x.dead).length);
}

function onEnemyFire(origin, dir, e) {
  const dist = origin.distanceTo(player.pos.clone().setY(EYE));
  spawnTracer(scene, origin, origin.clone().addScaledVector(dir, 60), 0xff6a5a);
  audio.enemyShoot(dist);
  // hit chance falls with distance
  const hitP = dist < 15 ? 0.30 : dist < 28 ? 0.18 : 0.08;
  if (player.alive && Math.random() < hitP) {
    damagePlayer(4 + Math.random() * 4, e.group.position);
  } else {
    // near-miss crack
    spawnTracer(scene, origin, player.pos.clone().setY(EYE).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2)), 0xff6a5a);
  }
}

function damagePlayer(amount, fromPos) {
  if (!player.alive || !player.playing) return;
  player.health -= amount;
  player.lastDamageT = perfNow();
  audio.hurt();
  addShake(0.35);
  const dx = player.pos.x - fromPos.x, dz = player.pos.z - fromPos.z;
  const worldAngle = Math.atan2(dx, dz);
  hud.damageFrom(worldAngle - player.yaw + Math.PI);
  hud.setHealth(player.health, player.maxHealth);
  if (player.health <= 0) {
    player.health = 0;
    hud.setHealth(0, player.maxHealth);
    player.alive = false;
    gameOver();
  }
}

// ---------- shooting ----------
function tryFire(dt) {
  player.fireCooldown -= dt;
  if (player.reloading || !player.alive) return;
  if (!mouseDown && !DEMO) return;
  if (player.fireCooldown > 0) return;
  if (player.mag <= 0) {
    audio.empty();
    startReload();
    player.fireCooldown = 0.3;
    return;
  }
  player.fireCooldown = 1 / 9; // 540 RPM
  player.mag--;
  hud.setAmmo(player.mag, player.reserve);
  audio.shoot();
  weapon.kick(player.ads ? 0.5 : 1);
  playMuzzleFlash(weapon);
  addShake(0.08);
  player.spread = Math.min(1, player.spread + 0.12);

  weapon.muzzle.getWorldPosition(muzzleWorld);
  camera.getWorldDirection(camDir);
  // apply spread
  const spreadRad = (player.ads ? 0.004 : 0.014) + player.spread * 0.02;
  camDir.x += (Math.random() - 0.5) * 2 * spreadRad;
  camDir.y += (Math.random() - 0.5) * 2 * spreadRad;
  camDir.z += (Math.random() - 0.5) * 2 * spreadRad;
  camDir.normalize();
  raycaster.set(camera.position, camDir);
  raycaster.far = 150;

  const enemyMeshes = [];
  for (const e of enemies) if (!e.dead) enemyMeshes.push(e.group);
  const targets = [...enemyMeshes, ...world.barrels.filter(b => b.parent), ...solidMeshes, groundMesh()].filter(Boolean);
  const hits = raycaster.intersectObjects(targets, true);
  // shell eject
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  spawnShell(scene, muzzleWorld, right);

  if (!hits.length) {
    spawnTracer(scene, muzzleWorld, muzzleWorld.clone().addScaledVector(camDir, 120));
    return;
  }
  const h = hits[0];
  const end = h.point;
  spawnTracer(scene, muzzleWorld, end);
  let obj = h.object;
  // walk up to find enemy ref
  let eRef = obj.userData.enemyRef || null;
  let p = obj;
  while (!eRef && p.parent) { p = p.parent; eRef = p.userData?.enemyRef || null; }
  if (eRef && !eRef.dead) {
    const isHead = obj.userData.isHead || obj === eRef.headMesh;
    const dmg = isHead ? 85 : 34;
    takeDamage(eRef, dmg, camDir);
    hud.hitmarker(eRef.dead);
    audio.hit();
    if (isHead && eRef.dead) { player.score += 50; player.headshots++; hud.setScore(player.score); hud.killpop('HEADSHOT +150'); audio.headshot(); }
    else if (isHead) { audio.headshot(); hud.killpop('HEADSHOT'); }
    spawnImpact(scene, h.point, h.face?.normal || new THREE.Vector3(0, 1, 0), 'flesh');
  } else if (obj.userData.explosive && obj.parent) {
    detonateBarrel(obj);
  } else {
    const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
    spawnImpact(scene, h.point, n, 'concrete');
  }
}

let _ground = null;
function groundMesh() {
  if (!_ground) {
    scene.traverse(o => { if (o.isMesh && o.geometry?.type === 'PlaneGeometry') _ground = o; });
  }
  return _ground;
}

function detonateBarrel(b) {
  const pos = b.position.clone(); pos.y = 1;
  world.barrels = world.barrels.filter(x => x !== b);
  solidMeshes = solidMeshes.filter(x => x !== b);
  removeSolid(scene, b);
  colliders = scene.userData.colliders;
  explodeBarrel(scene, pos);
  audio.explosion();
  addShake(0.7);
  // radius damage
  for (const e of enemies) {
    if (e.dead) continue;
    const d = e.group.position.distanceTo(pos);
    if (d < 7) {
      takeDamage(e, d < 3 ? 220 : 120, null);
      if (e.dead) { hud.hitmarker(true); }
    }
  }
  const pd = player.pos.distanceTo(pos);
  if (pd < 6 && player.alive) damagePlayer(pd < 2.5 ? 70 : 30, pos);
  // chain other barrels
  for (const other of [...world.barrels]) {
    if (other.position.distanceTo(pos) < 5) setTimeout(() => { if (other.parent) detonateBarrel(other); }, 150);
  }
}

function startReload() {
  if (player.reloading || player.mag === player.magSize || player.reserve <= 0) return;
  player.reloading = true;
  player.reloadT = 1.8;
  hud.showReload(true);
  audio.reload();
}

// ---------- input ----------
let mouseDown = false;
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyR') startReload();
  if (['Space', 'ArrowUp'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('mousedown', e => {
  if (!player.playing || !player.alive) return;
  if (document.pointerLockElement == null && !DEMO) return;
  if (e.button === 0) mouseDown = true;
  if (e.button === 2) player.ads = true;
});
addEventListener('mouseup', e => {
  if (e.button === 0) mouseDown = false;
  if (e.button === 2) player.ads = false;
});
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => {
  if (document.pointerLockElement == null && !DEMO) return;
  if (!player.playing || !player.alive) return;
  const sens = 0.0022 * (player.ads ? 0.6 : 1);
  player.yaw -= e.movementX * sens;
  player.pitch -= e.movementY * sens;
  player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch));
});
document.addEventListener('pointerlockchange', () => {
  if (DEMO) return;
  if (document.pointerLockElement == null && player.playing && player.alive) {
    hud.showPause(true);
    player.playing = false;
  }
});
document.getElementById('deploy').addEventListener('click', () => {
  audio.unlock(); audio.click();
  startGame();
  renderer.domElement.requestPointerLock?.();
});
document.getElementById('pause').addEventListener('click', () => {
  hud.showPause(false);
  player.playing = true;
  renderer.domElement.requestPointerLock?.();
});
document.getElementById('again').addEventListener('click', () => {
  audio.click();
  resetGame();
  hud.hideOver();
  player.playing = true; player.alive = true;
  if (!DEMO) renderer.domElement.requestPointerLock?.();
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- game flow ----------
function startGame() {
  hud.showMenu(false);
  hud.showPause(false);
  player.playing = true; player.alive = true;
  hud.banner('DEFEND THE OUTPOST');
  if (player.wave === 0) spawnWave(1);
  else waveBreakT = 0.5;
}

function resetGame() {
  for (const e of enemies) scene.remove(e.group);
  enemies = [];
  // restore barrels
  for (const b of world.barrels) scene.remove(b);
  world.barrels.length = 0;
  // rebuild barrels via fresh world? simplest: reload page state manually
  location.reload();
}

function gameOver() {
  mouseDown = false;
  hud.showGameOver(player.score, player.wave);
  hud.banner('');
  if (document.pointerLockElement) document.exitPointerLock?.();
}

// ---------- movement & collision ----------
const _fwd = new THREE.Vector3(), _rgt = new THREE.Vector3(), _wish = new THREE.Vector3();

function collide(pos, r = 0.5) {
  for (const c of colliders) {
    if (c.min.y > 1.5) continue; // overhead, ignore
    const nx = Math.max(c.min.x, Math.min(pos.x, c.max.x));
    const nz = Math.max(c.min.z, Math.min(pos.z, c.max.z));
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * r;
        pos.z = nz + (dz / d) * r;
      } else {
        // inside: push out along smallest penetration axis
        const pxa = Math.min(pos.x - c.min.x + r, c.max.x - pos.x + r);
        const pza = Math.min(pos.z - c.min.z + r, c.max.z - pos.z + r);
        if (pxa < pza) pos.x = (pos.x - c.min.x < c.max.x - pos.x) ? c.min.x - r : c.max.x + r;
        else pos.z = (pos.z - c.min.z < c.max.z - pos.z) ? c.min.z - r : c.max.z + r;
      }
    }
  }
  pos.x = Math.max(-56.5, Math.min(56.5, pos.x));
  pos.z = Math.max(-56.5, Math.min(56.5, pos.z));
}

function perfNow() { return performance.now() / 1000; }

function updatePlayer(dt) {
  const sprint = (keys['ShiftLeft'] || keys['ShiftRight']) && !player.ads;
  const speed = player.ads ? 3.2 : sprint ? 7.2 : 4.8;
  _fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  _rgt.set(-_fwd.z, 0, _fwd.x);
  _wish.set(0, 0, 0);
  if (keys['KeyW']) _wish.add(_fwd);
  if (keys['KeyS']) _wish.sub(_fwd);
  if (keys['KeyD']) _wish.add(_rgt);
  if (keys['KeyA']) _wish.sub(_rgt);
  const moving = _wish.lengthSq() > 0.01;
  if (moving) _wish.normalize().multiplyScalar(speed);
  const accel = moving ? 14 : 10;
  player.vel.lerp(_wish, Math.min(1, accel * dt));
  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  collide(player.pos);
  // headbob + footsteps
  const planarSpeed = Math.hypot(player.vel.x, player.vel.z);
  if (planarSpeed > 0.8 && player.alive) {
    player.bobPhase += dt * (4 + planarSpeed * 1.1);
    player.stepT += dt * planarSpeed;
    if (player.stepT > 2.6) { player.stepT = 0; audio.footstep(); }
  }
  const bobY = Math.sin(player.bobPhase * 2) * (planarSpeed > 0.8 ? 0.035 : 0.008);
  camera.position.set(player.pos.x, EYE + bobY, player.pos.z);
  // ADS
  player.adsAmount += ((player.ads ? 1 : 0) - player.adsAmount) * Math.min(1, dt * 12);
  const targetFov = 75 - player.adsAmount * 25;
  if (Math.abs(camera.fov - targetFov) > 0.1) { camera.fov = targetFov; camera.updateProjectionMatrix(); }
  hud.setADS(player.adsAmount > 0.5);
  // shake
  const sh = getShakeOffset(dt);
  camera.rotation.set(player.pitch + sh.x, player.yaw + sh.y, sh.z);
  // reload
  if (player.reloading) {
    player.reloadT -= dt;
    if (player.reloadT <= 0) {
      const need = player.magSize - player.mag;
      const take = Math.min(need, player.reserve);
      player.mag += take; player.reserve -= take;
      player.reloading = false;
      hud.showReload(false);
      hud.setAmmo(player.mag, player.reserve);
    }
  }
  // spread decay
  player.spread = Math.max(0, player.spread - dt * 1.4);
  hud.setSpread(player.spread * 22 + (moving ? 6 : 0) + (player.ads ? -4 : 0));
  // health regen
  if (player.alive && player.health < player.maxHealth && perfNow() - player.lastDamageT > 4) {
    player.health = Math.min(player.maxHealth, player.health + 26 * dt);
    hud.setHealth(player.health, player.maxHealth);
  }
  updateWeapon(weapon, dt, player.adsAmount, player.bobPhase, moving);
  hud.setYaw(player.yaw);
}

// line of sight (staggered)
const _losRay = new THREE.Raycaster();
const _eyeV = new THREE.Vector3(), _tgtV = new THREE.Vector3();
function checkLOS(e) {
  _eyeV.set(e.group.position.x, 1.6, e.group.position.z);
  _tgtV.set(player.pos.x - _eyeV.x, EYE - 0.2 - _eyeV.y, player.pos.z - _eyeV.z);
  const dist = _tgtV.length();
  _tgtV.normalize();
  _losRay.set(_eyeV, _tgtV);
  _losRay.far = dist;
  const hits = _losRay.intersectObjects(solidMeshes, false);
  return hits.length === 0;
}

// ---------- main loop ----------
const clock = new THREE.Clock();
const t0 = perfNow();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (player.playing && player.alive) {
    if (DEMO) {
      player.yaw += dt * 0.1; // slow pan for screenshots
      mouseDown = true; // auto fire in demo for lively FX
      // stage a few hostiles in view for screenshots
      if (!window.__staged && perfNow() - t0 > 6) {
        window.__staged = true;
        const alive = enemies.filter(e => !e.dead);
        const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
        alive.slice(0, 3).forEach((e, i) => {
          const d = 11 + i * 4, side = (i - 1) * 5;
          e.group.position.set(player.pos.x + fx * d - fz * side, 0, player.pos.z + fz * d + fx * side);
        });
      }
    }
    updatePlayer(dt);
    tryFire(dt);
    // enemies
    for (const e of enemies) {
      if (e.dead && e.deadTimer > 4.5) continue;
      e.losT -= dt;
      if (e.losT <= 0) { e.losT = 0.25 + Math.random() * 0.2; e.canSee = checkLOS(e); }
      const remove = updateEnemy(e, dt, { x: player.pos.x, y: EYE, z: player.pos.z }, colliders, e.canSee);
      if (remove) { scene.remove(e.group); }
    }
    enemies = enemies.filter(e => !(e.dead && e.deadTimer > 4.5));
    // wave clear?
    const aliveCount = enemies.filter(e => !e.dead).length;
    if (waveActive && spawnDone && aliveCount === 0) {
      // wait until spawn interval finished: check all dead and no pending
      waveActive = false;
      waveBreakT = 5;
      const bonus = 200 * player.wave;
      player.score += bonus;
      player.reserve = Math.min(240, player.reserve + 60);
      hud.setScore(player.score);
      hud.setAmmo(player.mag, player.reserve);
      hud.banner('WAVE ' + player.wave + ' CLEAR  +' + bonus);
      hud.killfeed('Wave ' + player.wave + ' cleared +' + bonus);
      audio.wave();
    }
    if (!waveActive && player.alive) {
      waveBreakT -= dt;
      if (waveBreakT <= 0) spawnWave(player.wave + 1);
    }
    // minimap
    hud.minimap.draw(
      { x: player.pos.x, z: player.pos.z, yaw: player.yaw },
      enemies.filter(e => !e.dead).map(e => ({ x: e.group.position.x, z: e.group.position.z })),
      world.coverDots
    );
    hud.setEnemies(aliveCount);
  } else if (DEMO && !player.playing) {
    // demo boot: start immediately
    startGame();
  }
  updateEffects(dt);
  renderer.render(scene, camera);
}

// ---------- boot ----------
hud.setAmmo(player.mag, player.reserve);
hud.setHealth(100, 100);
hud.setScore(0);
hud.setWave(1);
hud.setEnemies(0);
camera.position.set(player.pos.x, EYE, player.pos.z);
camera.rotation.set(0, player.yaw, 0);
if (DEMO) {
  hud.showMenu(false);
  player.playing = true; player.alive = true;
  player.yaw = Math.PI - 0.5;
  spawnWave(1);
  // pre-warm: run a few frames of enemy movement before screenshot
  window.__demoReady = true;
}
window.__game = {
  player,
  get enemies() { return enemies; },
  get waveActive() { return waveActive; },
  spawnWave,
  debugKillAll() { for (const e of enemies) if (!e.dead) takeDamage(e, 1000, null); },
  debugDetonate() { const b = world.barrels[0]; if (b) detonateBarrel(b); return world.barrels.length; },
  debugHurt(n) { damagePlayer(n, { x: player.pos.x + 5, z: player.pos.z }); },
};
animate();
