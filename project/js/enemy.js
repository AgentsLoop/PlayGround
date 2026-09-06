import * as THREE from 'three';

export function createEnemy(scene, pos, level = 1) {
  const g = new THREE.Group();
  const matBody = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.8 });
  const matRed = new THREE.MeshStandardMaterial({ color: 0x8a1414, roughness: 0.6 });
  const matSkin = new THREE.MeshStandardMaterial({ color: 0xc9a17a, roughness: 0.7 });
  const matVisor = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0xff2222, emissiveIntensity: 0.9 });
  const matGun = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.5, metalness: 0.4 });
  const allMats = [matBody, matRed, matSkin, matVisor, matGun];
  allMats.forEach(m => { m.userData.baseEmissive = m.emissive.clone(); });

  const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = true; g.add(mesh); return mesh; };
  add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.32), matBody), 0, 1.15, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.57, 0.18, 0.34), matRed), 0, 1.28, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.02), matRed), 0, 1.05, 0.17);
  const headMesh = add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), matSkin), 0, 1.66, 0);
  headMesh.userData.isHead = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.09, 0.02), matVisor);
  visor.position.set(0, 1.68, 0.16); g.add(visor);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.32), matRed), 0, 1.83, 0);
  const mkLimb = (geo, mat, px, py) => {
    const p = new THREE.Group(); p.position.set(px, py, 0); g.add(p);
    const m = new THREE.Mesh(geo, mat); m.position.y = -geo.parameters.height / 2 + 0.05; m.castShadow = true; p.add(m);
    return p;
  };
  const armGeo = new THREE.CapsuleGeometry(0.08, 0.5, 3, 8);
  const legGeo = new THREE.CapsuleGeometry(0.11, 0.6, 3, 8);
  const armL = mkLimb(armGeo, matBody, -0.36, 1.45);
  const armR = mkLimb(armGeo, matBody, 0.36, 1.45);
  const legL = mkLimb(legGeo, matBody, -0.15, 0.85);
  const legR = mkLimb(legGeo, matBody, 0.15, 0.85);
  for (const a of [armL, armR]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.16), matRed);
    s.position.y = -0.05; a.add(s);
  }
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.7), matGun);
  gun.position.set(0.36, 1.15, 0.35); gun.castShadow = true; g.add(gun);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0.36, 1.18, 0.75); g.add(muzzle);

  g.position.copy(pos); g.position.y = 0;
  g.traverse(o => { o.userData.enemyRef = null; });
  scene.add(g);

  const e = {
    group: g, headMesh, headBox: new THREE.Box3(),
    health: 100 + (level - 1) * 30, maxHealth: 100 + (level - 1) * 30,
    speed: 2.8 + Math.min(level * 0.15, 1.0) + Math.random() * 0.4,
    state: 'advance', dead: false, level,
    preferDist: 12 + Math.random() * 13, strafeDir: Math.random() < 0.5 ? 1 : -1,
    strafeTimer: 2 + Math.random() * 3, walkPhase: Math.random() * 6,
    burstLeft: 0, shotTimer: 0, coolTimer: 1 + Math.random(),
    flash: 0, deadTimer: 0, fallT: 0, moving: false,
    onEnemyFire: null, onHit: null, onDeath: null,
    _mats: allMats, _armL: armL, _armR: armR, _legL: legL, _legR: legR, _muzzle: muzzle,
  };
  g.traverse(o => { o.userData.enemyRef = e; });
  e.headMesh.userData.enemyRef = e;
  e.headBox.setFromObject(headMesh);
  return e;
}

function blockedAt(pos, colliders, r = 0.45) {
  for (const c of colliders) {
    if (c.min.x - r < pos.x && pos.x < c.max.x + r &&
      c.min.z - r < pos.z && pos.z < c.max.z + r &&
      c.min.y < 1.6 && pos.y !== undefined) return true;
  }
  return false;
}

function tryMove(e, nx, nz, colliders) {
  const p = e.group.position;
  _tmp.set(nx, 0, nz);
  if (!blockedAt(_tmp, colliders)) { p.x = nx; p.z = nz; return true; }
  _tmp.set(nx, 0, p.z);
  if (!blockedAt(_tmp, colliders)) { p.x = nx; return true; }
  _tmp.set(p.x, 0, nz);
  if (!blockedAt(_tmp, colliders)) { p.z = nz; return true; }
  return false;
}
const _tmp = new THREE.Vector3();

function facePlayer(e, playerPos, dt) {
  const dx = playerPos.x - e.group.position.x, dz = playerPos.z - e.group.position.z;
  const target = Math.atan2(dx, dz);
  let d = target - e.group.rotation.y;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  e.group.rotation.y += THREE.MathUtils.clamp(d, -3.5 * dt, 3.5 * dt);
}

export function updateEnemy(e, dt, playerPos, colliders = [], canSee = true) {
  const g = e.group;
  if (e.flash > 0) {
    e.flash = Math.max(0, e.flash - dt * 5);
    e._mats.forEach(m => m.emissive.copy(m.userData.baseEmissive).add(new THREE.Color(e.flash * 0.9, 0, 0)));
  }
  if (e.dead) {
    e.deadTimer += dt;
    if (e.fallT < 1) {
      e.fallT = Math.min(1, e.fallT + dt / 0.4);
      g.rotation.x = -Math.PI / 2 * (1 - (1 - e.fallT) * (1 - e.fallT));
      g.position.y = 0.15 * e.fallT;
    } else if (e.deadTimer > 3) { g.position.y -= dt * 0.45; }
    return e.deadTimer > 4.5;
  }
  const toPx = playerPos.x - g.position.x, toPz = playerPos.z - g.position.z;
  const dist = Math.hypot(toPx, toPz) || 0.001;
  const dirx = toPx / dist, dirz = toPz / dist;
  if (!canSee || dist > e.preferDist + 2) e.state = 'advance';
  else if (dist < 7) e.state = 'strafe';
  else e.state = 'attack';
  if (e.state === 'strafe') {
    e.strafeTimer -= dt;
    if (e.strafeTimer <= 0) { e.strafeDir *= -1; e.strafeTimer = 2 + Math.random() * 3; }
  }
  e.moving = false;
  if (e.state === 'advance') {
    facePlayer(e, playerPos, dt);
    if (canSee || dist > 3) e.moving = tryMove(e, g.position.x + dirx * e.speed * dt, g.position.z + dirz * e.speed * dt, colliders);
  } else if (e.state === 'strafe') {
    facePlayer(e, playerPos, dt);
    const radial = dist > e.preferDist + 1 ? 1 : dist < e.preferDist - 4 ? -0.7 : 0;
    const mx = (dirx * radial + -dirz * e.strafeDir * 0.9) * e.speed * 0.7 * dt;
    const mz = (dirz * radial + dirx * e.strafeDir * 0.9) * e.speed * 0.7 * dt;
    e.moving = tryMove(e, g.position.x + mx, g.position.z + mz, colliders);
    fireLogic(e, dt, playerPos, canSee, 0.5);
  } else {
    facePlayer(e, playerPos, dt);
    fireLogic(e, dt, playerPos, canSee, 1.0);
  }
  if (e.moving) e.walkPhase += dt * e.speed * 2.4;
  const sw = e.moving ? Math.sin(e.walkPhase) * 0.6 : 0;
  e._legL.rotation.x += (sw - e._legL.rotation.x) * Math.min(1, dt * 12);
  e._legR.rotation.x += (-sw - e._legR.rotation.x) * Math.min(1, dt * 12);
  e._armL.rotation.x += (-sw * 0.8 - e._armL.rotation.x) * Math.min(1, dt * 12);
  e._armR.rotation.x += ((e.state === 'attack' ? -1.2 : sw * 0.8) - e._armR.rotation.x) * Math.min(1, dt * 10);
  e.headBox.setFromObject(e.headMesh);
  return false;
}

const _o = new THREE.Vector3(), _d = new THREE.Vector3();

function fireLogic(e, dt, playerPos, canSee, rate) {
  if (!canSee) { e.coolTimer = Math.max(e.coolTimer, 0.4); return; }
  e.coolTimer -= dt;
  if (e.burstLeft > 0) {
    e.shotTimer -= dt;
    if (e.shotTimer <= 0) {
      e.shotTimer = 0.11;
      e.burstLeft--;
      e._muzzle.getWorldPosition(_o);
      _d.set(playerPos.x - _o.x, (playerPos.y || 1.5) - _o.y + 1.4, playerPos.z - _o.z).normalize();
      _d.x += (Math.random() - 0.5) * 0.07; _d.y += (Math.random() - 0.5) * 0.05; _d.z += (Math.random() - 0.5) * 0.07;
      _d.normalize();
      if (typeof e.onEnemyFire === 'function') e.onEnemyFire(_o.clone(), _d.clone(), e);
    }
  } else if (e.coolTimer <= 0) {
    e.burstLeft = 3 + Math.floor(Math.random() * 3);
    e.shotTimer = 0;
    e.coolTimer = (1.2 + Math.random() * 1.4) / rate;
  }
}

export function takeDamage(e, amount, hitDir) {
  if (e.dead) return;
  e.health -= amount;
  e.flash = 1;
  if (typeof e.onHit === 'function') {
    const p = e.group.position.clone(); p.y = 1.3;
    e.onHit(p, amount, e);
  }
  if (e.health <= 0) {
    e.health = 0; e.dead = true; e.deadTimer = 0; e.fallT = 0; e.state = 'dead';
    if (typeof e.onDeath === 'function') e.onDeath(e);
  }
}
