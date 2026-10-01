import * as THREE from 'three';
import { MAP_SIZE, START } from './config.js';

// Height field: gentle hills + flattened base pads. Deterministic.
export function groundHeight(x, z) {
  const dPad = (cx, cz, r) => {
    const d = Math.hypot(x - cx, z - cz);
    return d < r ? 0 : Math.min(1, (d - r) / 10);
  };
  const mask = Math.min(
    dPad(START.playerBase.x, START.playerBase.z, 14),
    dPad(START.enemyBase.x, START.enemyBase.z, 14),
    dPad(0, 0, 8),
  );
  const h = Math.sin(x * 0.16) * Math.cos(z * 0.14) * 1.1
    + Math.sin(x * 0.05 + 1.7) * Math.cos(z * 0.06 + 0.6) * 1.6;
  return h * mask;
}

export function buildWorld(scene) {
  const S = MAP_SIZE;
  // lights
  const hemi = new THREE.HemisphereLight(0xcfeaff, 0x223322, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.9);
  sun.position.set(-40, 60, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
  sun.shadow.camera.far = 160;
  scene.add(sun);
  scene.fog = new THREE.Fog(0x04090c, 90, 220);

  // terrain with vertex colors (muted ground so saturated units pop)
  const seg = 110;
  const geo = new THREE.PlaneGeometry(S + 30, S + 30, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cGrass = new THREE.Color(0x2a4a33), cDry = new THREE.Color(0x4a4a2c),
    cRock = new THREE.Color(0x3a3f45), cPad = new THREE.Color(0x2e3d3a);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = groundHeight(x, z);
    pos.setY(i, h);
    const n = Math.sin(x * 0.5) * Math.cos(z * 0.45);
    tmp.copy(cGrass).lerp(n > 0.2 ? cDry : cRock, Math.abs(n) * 0.55);
    const dP = Math.min(Math.hypot(x - START.playerBase.x, z - START.playerBase.z),
      Math.hypot(x - START.enemyBase.x, z - START.enemyBase.z));
    if (dP < 13) tmp.lerp(cPad, 0.7);
    if (Math.abs(x) > S / 2 + 2 || Math.abs(z) > S / 2 + 2) tmp.multiplyScalar(0.35); // void rim
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const ground = new THREE.Mesh(geo, mat);
  ground.receiveShadow = true;
  scene.add(ground);

  // grid-ish subtle border walls (playable bounds)
  const wallMat = new THREE.MeshBasicMaterial({ color: 0x35e0d2, transparent: true, opacity: 0.25 });
  const mkWall = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), wallMat);
    m.position.set(x, 0.6, z); scene.add(m);
  };
  mkWall(S, 0.3, 0, -S / 2); mkWall(S, 0.3, 0, S / 2);
  mkWall(0.3, S, -S / 2, 0); mkWall(0.3, S, S / 2, 0);

  // decorative rocks / alien trees (procedural, non-interactive)
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x4a5257, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x1f6b4a, roughness: 1 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 });
  const deco = new THREE.Group();
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 46; i++) {
    const x = (rnd() - 0.5) * (S - 8), z = (rnd() - 0.5) * (S - 8);
    if (Math.hypot(x - START.playerBase.x, z - START.playerBase.z) < 15) continue;
    if (Math.hypot(x - START.enemyBase.x, z - START.enemyBase.z) < 15) continue;
    if (Math.abs(x) < 6 && Math.abs(z) < 6) continue;
    const y = groundHeight(x, z);
    if (rnd() < 0.5) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + rnd() * 1.1, 0), rockMat);
      r.position.set(x, y + 0.4, z); r.castShadow = true; deco.add(r);
    } else {
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 2.2, 6), trunkMat);
      trunk.position.y = 1.1; trunk.castShadow = true; t.add(trunk);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(1.5 + rnd(), 2.6 + rnd() * 1.4, 7), leafMat);
      crown.position.y = 3.1; crown.castShadow = true; t.add(crown);
      t.position.set(x, y, z); deco.add(t);
    }
  }
  scene.add(deco);
  return { ground, sun };
}

// Resource nodes -----------------------------------------------------------
export function makeNodeMesh(kind) {
  const g = new THREE.Group();
  if (kind === 'flux') {
    const m = new THREE.MeshStandardMaterial({ color: 0x2a9fe8, emissive: 0x1a66cc, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.1 });
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.55 + (i % 3) * 0.22, 0), m);
      c.position.set((i - 2) * 0.55, 0.7 + (i % 2) * 0.35, ((i * 37) % 3 - 1) * 0.5);
      c.rotation.set(i, i * 2, i * 0.5);
      c.castShadow = true; g.add(c);
    }
  } else {
    const m = new THREE.MeshStandardMaterial({ color: 0xd97a2a, emissive: 0x7a3a00, emissiveIntensity: 0.35, roughness: 0.9 });
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + (i % 2) * 0.3, 0), m);
      r.position.set((i - 1.5) * 0.6, 0.5, ((i * 53) % 3 - 1) * 0.5);
      r.castShadow = true; g.add(r);
    }
  }
  // faint glow ring so harvestables read at a glance without hijacking selection language
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.55, 1.7, 28),
    new THREE.MeshBasicMaterial({ color: kind === 'flux' ? 0x41b6ff : 0xff9b3d, transparent: true, opacity: 0.28, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; g.add(ring);
  return g;
}

export function scatterNodes() {
  // lines of flux + alloy near each base, mirrored
  const nodes = [];
  const lines = [
    { kind: 'flux', cx: -22, cz: 30, dx: 2.6, dz: 0.4, n: 6, amount: 1500 },
    { kind: 'alloy', cx: -30, cz: 21, dx: 2.6, dz: -0.3, n: 4, amount: 1000 },
    { kind: 'flux', cx: 26, cz: -30, dx: -2.6, dz: 0.4, n: 6, amount: 1500 },
    { kind: 'alloy', cx: 32, cz: -21, dx: -2.6, dz: -0.3, n: 4, amount: 1000 },
    { kind: 'flux', cx: -6, cz: -2, dx: 2.4, dz: 0.8, n: 4, amount: 1500 }, // contested middle
    { kind: 'alloy', cx: 6, cz: 4, dx: 2.4, dz: -0.8, n: 3, amount: 1000 },
  ];
  let id = 1;
  for (const L of lines)
    for (let i = 0; i < L.n; i++)
      nodes.push({ id: id++, kind: L.kind, x: L.cx + L.dx * i, z: L.cz + L.dz * i, amount: L.amount });
  return nodes;
}
