import * as THREE from 'three';

const live = [];
const _v1 = new THREE.Vector3();
let _flashTex = null, _dotTex = null, _smokeTex = null;

function canvasTex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function texs() {
  if (!_flashTex) {
    _flashTex = canvasTex(128, (g, s) => {
      g.clearRect(0, 0, s, s); g.translate(s / 2, s / 2);
      const grad = g.createRadialGradient(0, 0, 2, 0, 0, s / 2);
      grad.addColorStop(0, 'rgba(255,255,230,1)'); grad.addColorStop(0.25, 'rgba(255,210,120,1)');
      grad.addColorStop(0.6, 'rgba(255,120,30,0.55)'); grad.addColorStop(1, 'rgba(255,80,0,0)');
      g.fillStyle = grad; g.fillRect(-s / 2, -s / 2, s, s);
      g.fillStyle = 'rgba(255,240,200,0.95)';
      g.fillRect(-s / 2, -4, s, 8); g.fillRect(-4, -s / 2, 8, s);
      g.rotate(Math.PI / 4); g.fillRect(-s / 3, -3, s * 0.66, 6); g.fillRect(-3, -s / 3, 6, s * 0.66);
    });
    _dotTex = canvasTex(64, (g, s) => {
      const grad = g.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
      grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.4, 'rgba(255,255,255,0.8)');
      grad.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grad; g.fillRect(0, 0, s, s);
    });
    _smokeTex = canvasTex(128, (g, s) => {
      for (let i = 0; i < 14; i++) {
        const x = s / 2 + (Math.random() - 0.5) * s * 0.5, y = s / 2 + (Math.random() - 0.5) * s * 0.5, r = 12 + Math.random() * 22;
        const gr = g.createRadialGradient(x, y, 1, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
    });
  }
  return { flash: _flashTex, dot: _dotTex, smoke: _smokeTex };
}

function push(e) { live.push(e); return e; }

export function createWeapon(camera, scene) {
  const { flash } = texs();
  const gunmetal = new THREE.MeshStandardMaterial({ color: 0x3d454f, metalness: 0.55, roughness: 0.45 });
  const darkPoly = new THREE.MeshStandardMaterial({ color: 0x26292f, metalness: 0.2, roughness: 0.75 });
  const tan = new THREE.MeshStandardMaterial({ color: 0xc9a06a, metalness: 0.1, roughness: 0.65 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x70767e, metalness: 0.85, roughness: 0.35 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x8a5f43, roughness: 0.9 });
  const glove = new THREE.MeshStandardMaterial({ color: 0x3a3f2e, roughness: 0.95 });

  const gun = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); gun.add(m); return m;
  };
  add(new THREE.BoxGeometry(0.075, 0.105, 0.42), gunmetal, 0, 0, -0.05);
  add(new THREE.BoxGeometry(0.06, 0.05, 0.30), tan, 0, -0.005, -0.10);
  add(new THREE.CylinderGeometry(0.021, 0.021, 0.34, 14), steel, 0, 0.012, -0.42, Math.PI / 2, 0, 0);
  add(new THREE.CylinderGeometry(0.032, 0.032, 0.12, 12), darkPoly, 0, 0.012, -0.30, Math.PI / 2, 0, 0);
  add(new THREE.BoxGeometry(0.055, 0.05, 0.16), tan, 0, -0.045, -0.28);
  add(new THREE.BoxGeometry(0.055, 0.16, 0.07), darkPoly, 0, -0.13, -0.02, 0.28, 0, 0);
  add(new THREE.BoxGeometry(0.05, 0.07, 0.05), darkPoly, 0, -0.09, 0.10, 0.35, 0, 0);
  add(new THREE.BoxGeometry(0.06, 0.09, 0.20), tan, 0, -0.01, 0.28);
  add(new THREE.BoxGeometry(0.05, 0.03, 0.06), darkPoly, 0, -0.045, 0.36);
  add(new THREE.BoxGeometry(0.02, 0.05, 0.34), steel, 0, 0.075, -0.06);
  add(new THREE.TorusGeometry(0.026, 0.006, 10, 24), steel, 0, 0.105, -0.06);
  add(new THREE.BoxGeometry(0.008, 0.035, 0.008), steel, 0, 0.085, 0.02);
  add(new THREE.BoxGeometry(0.012, 0.03, 0.012), steel, 0, 0.085, -0.16);
  const handF = add(new THREE.CapsuleGeometry(0.032, 0.07, 4, 10), glove, 0.005, -0.055, -0.28, 0.4, 0, 0.15);
  const handR = add(new THREE.CapsuleGeometry(0.034, 0.06, 4, 10), skin, 0.01, -0.10, 0.10, 0.5, 0, -0.2);
  handF.scale.set(1, 1, 0.9); handR.scale.set(1, 1, 0.9);

  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.012, -0.60); gun.add(muzzle);

  const flashMat = new THREE.MeshBasicMaterial({ map: flash, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const f1 = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.30), flashMat);
  const f2 = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flashMat.clone());
  f2.rotation.z = Math.PI / 2.4;
  const muzzleFlash = new THREE.Group(); muzzleFlash.add(f1, f2); muzzleFlash.position.copy(muzzle.position); muzzleFlash.visible = false; gun.add(muzzleFlash);
  const flashLight = new THREE.PointLight(0xffb457, 0, 6, 2); flashLight.position.copy(muzzle.position); gun.add(flashLight);

  gun.scale.setScalar(0.8);
  gun.position.set(0.24, -0.235, -0.5); gun.rotation.set(0, -0.02, 0);
  gun.userData.basePos = gun.position.clone(); gun.userData.baseRot = gun.rotation.clone();
  gun.userData.adsPos = new THREE.Vector3(0, -0.128, -0.32);
  gun.muzzle = muzzle; gun.muzzleFlash = muzzleFlash; gun.flashLight = flashLight;
  gun.recoil = { kick: 0, lateral: 0 };
  gun.kick = (n = 1) => { gun.recoil.kick = Math.min(0.09, gun.recoil.kick + 0.028 * n); gun.recoil.lateral += (Math.random() - 0.5) * 0.008 * n; };
  camera.add(gun);
  if (scene && !scene.children.includes(camera)) scene.add(camera);
  return gun;
}

export function updateWeapon(weapon, dt, adsAmount, bobPhase, moving) {
  const r = weapon.recoil; if (!r) return;
  r.kick = Math.max(0, r.kick - dt * 0.35); r.lateral *= Math.max(0, 1 - dt * 10);
  const b = weapon.userData;
  const bobA = moving ? (adsAmount > 0.5 ? 0.002 : 0.008) : 0.0015;
  const bobY = Math.sin(bobPhase * 2) * bobA;
  const bobX = Math.cos(bobPhase) * bobA * 0.7;
  const px = b.basePos.x + (b.adsPos.x - b.basePos.x) * adsAmount;
  const py = b.basePos.y + (b.adsPos.y - b.basePos.y) * adsAmount;
  const pz = b.basePos.z + (b.adsPos.z - b.basePos.z) * adsAmount;
  weapon.position.set(px + r.lateral + bobX, py + r.kick * 0.35 + bobY, pz + r.kick);
  weapon.rotation.set(b.baseRot.x + r.kick * 1.6, b.baseRot.y + r.lateral * 2.0, b.baseRot.z);
}

export function playMuzzleFlash(weapon) {
  const { muzzleFlash, flashLight } = weapon; if (!muzzleFlash) return;
  muzzleFlash.visible = true;
  muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
  const s = 0.8 + Math.random() * 0.6; muzzleFlash.scale.set(s, s, s);
  muzzleFlash.children.forEach(m => { m.material.opacity = 1; });
  if (flashLight) flashLight.intensity = 14;
  push({ kind: 'flash', obj: muzzleFlash, light: flashLight, life: 0.08, max: 0.08 });
}

export function spawnTracer(scene, from, to, color = 0xffd27a) {
  const g = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const line = new THREE.Line(g, m); line.frustumCulled = false; scene.add(line);
  push({ kind: 'tracer', obj: line, life: 0.06, max: 0.06 });
}

const IMPACT_COLORS = { concrete: 0xffd9a0, metal: 0xffe9a8, wood: 0xd8a05a, flesh: 0xc0392b, dirt: 0xb99a6b, default: 0xffc46b };

export function spawnImpact(scene, pos, normal = new THREE.Vector3(0, 1, 0), type = 'concrete') {
  const { dot, smoke } = texs();
  const N = 14, p = new Float32Array(N * 3), v = [];
  for (let i = 0; i < N; i++) {
    p.set([pos.x, pos.y, pos.z], i * 3);
    _v1.set(Math.random() - 0.5, Math.random() * 0.9 + 0.1, Math.random() - 0.5).normalize()
      .addScaledVector(normal, 1.4 + Math.random()).multiplyScalar(2 + Math.random() * 4);
    v.push(_v1.clone());
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({
    color: IMPACT_COLORS[type] ?? IMPACT_COLORS.default,
    size: 0.035, map: dot, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  pts.frustumCulled = false; scene.add(pts);
  push({ kind: 'sparks', obj: pts, vel: v, life: 0.4, max: 0.4 });
  const dm = new THREE.SpriteMaterial({ map: smoke, color: type === 'flesh' ? 0x7a2020 : 0x9a938a, transparent: true, opacity: 0.5, depthWrite: false });
  const puff = new THREE.Sprite(dm); puff.position.copy(pos).addScaledVector(normal, 0.03); puff.scale.setScalar(0.12); scene.add(puff);
  push({ kind: 'sprite', obj: puff, life: 0.6, max: 0.6, grow: 0.55, fade: 0.5, rise: 0.35 });
}

const _shellGeo = new THREE.BoxGeometry(0.012, 0.012, 0.028);
const _shellMat = new THREE.MeshStandardMaterial({ color: 0xc8a038, metalness: 0.9, roughness: 0.35 });

export function spawnShell(scene, pos, right = new THREE.Vector3(1, 0, 0)) {
  const m = new THREE.Mesh(_shellGeo, _shellMat); m.position.copy(pos);
  const vel = right.clone().multiplyScalar(1.2 + Math.random() * 0.6); vel.y += 1.4 + Math.random() * 0.5; vel.z += (Math.random() - 0.5) * 0.5;
  scene.add(m);
  push({ kind: 'shell', obj: m, vel, ang: new THREE.Vector3(Math.random() * 20, Math.random() * 20, Math.random() * 20), life: 1.1, max: 1.1 });
}

export function explodeBarrel(scene, pos) {
  const { dot, smoke } = texs();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  ball.position.copy(pos); scene.add(ball);
  push({ kind: 'fireball', obj: ball, life: 0.5, max: 0.5, grow: 4.2 });
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xfff2c0, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
  core.position.copy(pos); core.scale.setScalar(1.2); scene.add(core);
  push({ kind: 'sprite', obj: core, life: 0.3, max: 0.3, grow: 5.0, fade: 1.0, rise: 0 });
  const light = new THREE.PointLight(0xff7a22, 60, 22, 2); light.position.copy(pos); scene.add(light);
  push({ kind: 'blastlight', obj: light, life: 0.6, max: 0.6 });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 40),
    new THREE.MeshBasicMaterial({ color: 0xffcf90, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  ring.position.copy(pos); ring.position.y = Math.max(0.1, pos.y - 0.5); ring.rotation.x = -Math.PI / 2; scene.add(ring);
  push({ kind: 'ring', obj: ring, life: 0.55, max: 0.55, grow: 14 });
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smoke, color: 0x3a3733, transparent: true, opacity: 0.55, depthWrite: false }));
    s.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 1.4, Math.random() * 0.8, (Math.random() - 0.5) * 1.4));
    s.scale.setScalar(0.5 + Math.random() * 0.6); s.userData.v = new THREE.Vector3((Math.random() - 0.5) * 2, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 2);
    scene.add(s); push({ kind: 'smoke', obj: s, life: 1.3, max: 1.3, grow: 1.4, fade: 0.55, rise: 0 });
  }
  addShake(0.9);
}

export function updateEffects(dt) {
  dt = Math.min(dt, 0.05);
  for (let i = live.length - 1; i >= 0; i--) {
    const e = live[i]; e.life -= dt; const t = Math.max(e.life / e.max, 0);
    let dead = e.life <= 0;
    switch (e.kind) {
      case 'flash':
        e.obj.children.forEach(m => m.material.opacity = t);
        if (e.light) e.light.intensity = 14 * t;
        if (dead) { e.obj.visible = false; if (e.light) e.light.intensity = 0; }
        break;
      case 'tracer': e.obj.material.opacity = t; break;
      case 'sparks': {
        const a = e.obj.geometry.attributes.position;
        for (let j = 0; j < e.vel.length; j++) {
          e.vel[j].y -= 9 * dt;
          a.setXYZ(j, a.getX(j) + e.vel[j].x * dt, Math.max(0.01, a.getY(j) + e.vel[j].y * dt), a.getZ(j) + e.vel[j].z * dt);
        }
        a.needsUpdate = true; e.obj.material.opacity = t; break;
      }
      case 'sprite': case 'smoke':
        e.obj.scale.addScalar((e.grow ?? 0.5) * dt); e.obj.material.opacity = (e.fade ?? 0.5) * t;
        if (e.rise) e.obj.position.y += e.rise * dt;
        if (e.obj.userData.v) { e.obj.position.addScaledVector(e.obj.userData.v, dt); e.obj.userData.v.multiplyScalar(1 - dt * 1.4); }
        break;
      case 'fireball': e.obj.scale.addScalar((e.grow ?? 4) * dt); e.obj.material.opacity = 0.95 * t; break;
      case 'ring': { const s = 1 + (e.grow ?? 14) * dt; e.obj.scale.multiplyScalar(s); e.obj.material.opacity = 0.9 * t; break; }
      case 'blastlight': e.obj.intensity = 60 * t; break;
      case 'shell':
        e.vel.y -= 9.8 * dt; e.obj.position.addScaledVector(e.vel, dt);
        e.obj.rotation.x += e.ang.x * dt; e.obj.rotation.y += e.ang.y * dt;
        if (e.obj.position.y < 0.01) { e.obj.position.y = 0.01; e.vel.multiplyScalar(0.4); e.vel.y = Math.abs(e.vel.y); }
        break;
    }
    if (dead) {
      live.splice(i, 1);
      if (e.obj && e.obj.parent) e.obj.parent.remove(e.obj);
      if (e.obj && e.obj.geometry && e.kind !== 'shell') e.obj.geometry.dispose?.();
      if (e.obj && e.obj.material && e.kind !== 'shell') {
        (Array.isArray(e.obj.material) ? e.obj.material : [e.obj.material]).forEach(m => m.dispose?.());
      }
    }
  }
}

let trauma = 0;
export function addShake(amount = 0.3) { trauma = Math.min(1, trauma + amount); return trauma; }
export function getShakeOffset(dt, time = performance.now() / 1000) {
  trauma = Math.max(0, trauma - dt * 1.6);
  const s = trauma * trauma;
  return new THREE.Vector3(
    Math.sin(time * 91.3) * 0.045 * s + Math.sin(time * 47.7) * 0.02 * s,
    Math.cos(time * 83.1) * 0.045 * s,
    Math.sin(time * 59.5) * 0.02 * s);
}
