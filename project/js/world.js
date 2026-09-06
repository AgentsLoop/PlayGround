import * as THREE from 'three';

function canvasTex(size, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noiseOn(g, s, n, cols, aMin = 0.04, aMax = 0.14, szMax = 3) {
  for (let i = 0; i < n; i++) {
    g.globalAlpha = aMin + Math.random() * (aMax - aMin);
    g.fillStyle = cols[(Math.random() * cols.length) | 0];
    const s2 = 1 + Math.random() * szMax;
    g.fillRect(Math.random() * s, Math.random() * s, s2, s2);
  }
  g.globalAlpha = 1;
}

export function buildWorld(scene) {
  const solids = [];
  const addSolid = (m) => { m.updateMatrixWorld(true); solids.push(m); return m; };

  scene.fog = new THREE.Fog(0xd9c39a, 55, 260);
  scene.background = new THREE.Color(0x87b5d9);
  const hemi = new THREE.HemisphereLight(0xcfe4f8, 0x6a6252, 1.32);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.0);
  sun.position.set(45, 70, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -70; sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 200;
  sun.shadow.bias = -0.0006;
  scene.add(sun); scene.add(sun.target);

  // gradient sky dome
  const skyGeo = new THREE.SphereGeometry(420, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x2f6fc2) }, mid: { value: new THREE.Color(0x87b5d9) }, bot: { value: new THREE.Color(0xd9c9a8) } },
    vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top,mid,bot;' +
      'void main(){ float h=normalize(vP).y; vec3 c=h>0.0?mix(mid,top,pow(h,0.6)):mix(mid,bot,pow(-h,0.5));' +
      ' gl_FragColor=vec4(c,1.0); }'
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(18, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false }));
  sunDisc.position.set(220, 190, 110); sunDisc.lookAt(0, 0, 0); scene.add(sunDisc);
  // sun glow halo
  const glowTex = canvasTex(128, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,250,220,0.9)'); grad.addColorStop(0.4, 'rgba(255,240,200,0.35)'); grad.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
  });
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
  glow.position.copy(sunDisc.position); glow.scale.set(150, 150, 1); scene.add(glow);

  // distant mountains silhouette ring
  const mtnTex = canvasTex(256, (g, s) => {
    g.clearRect(0, 0, s, s);
    g.fillStyle = 'rgba(90,110,140,0.9)';
    g.beginPath(); g.moveTo(0, s);
    for (let x = 0; x <= s; x += 8) g.lineTo(x, s * 0.55 - Math.abs(Math.sin(x * 0.11)) * s * 0.3 - Math.random() * 8);
    g.lineTo(s, s); g.closePath(); g.fill();
  });
  const mtnMat = new THREE.MeshBasicMaterial({ map: mtnTex, transparent: true, fog: false, side: THREE.DoubleSide });
  for (let i = 0; i < 10; i++) {
    const w = 190;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 46), mtnMat);
    const a = (i / 10) * Math.PI * 2;
    m.position.set(Math.cos(a) * 330, 12, Math.sin(a) * 330);
    m.lookAt(0, 12, 0);
    scene.add(m);
  }

  // clouds
  const cloudTex = canvasTex(128, (g, s) => {
    g.clearRect(0, 0, s, s);
    for (let i = 0; i < 22; i++) {
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.beginPath();
      g.ellipse(20 + Math.random() * 88, 45 + Math.random() * 38, 8 + Math.random() * 18, 5 + Math.random() * 9, 0, 0, 7);
      g.fill();
    }
  });
  const cloudMat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.85, depthWrite: false, fog: false });
  for (let i = 0; i < 10; i++) {
    const sp = new THREE.Sprite(cloudMat);
    sp.position.set((Math.random() - 0.5) * 500, 120 + Math.random() * 80, (Math.random() - 0.5) * 500);
    sp.scale.set(70 + Math.random() * 70, 22 + Math.random() * 18, 1);
    scene.add(sp);
  }

  // ground — desert sand: grain noise, sun-bleached blotches, faint tire arcs
  const groundTex = canvasTex(512, (g, s) => {
    g.fillStyle = '#b99a68'; g.fillRect(0, 0, s, s);
    noiseOn(g, s, 7000, ['#8f7448', '#d3b67e', '#7a6550', '#a8895a'], 0.05, 0.17, 3);
    for (let i = 0; i < 12; i++) { // soft darker patches break tiling
      g.globalAlpha = 0.07 + Math.random() * 0.06; g.fillStyle = '#7c6540';
      g.beginPath(); g.ellipse(Math.random() * s, Math.random() * s, 30 + Math.random() * 90, 20 + Math.random() * 60, Math.random() * 3, 0, 7); g.fill();
    }
    g.globalAlpha = 1; g.strokeStyle = 'rgba(90,70,45,0.20)'; g.lineWidth = 7;
    for (let i = 0; i < 4; i++) { // faint tire arcs
      g.beginPath(); g.arc(Math.random() * s, Math.random() * s, 90 + Math.random() * 160, Math.random() * 3, Math.random() * 1.2 + 0.4); g.stroke();
    }
    g.globalAlpha = 1;
  }, 14, 14);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.96, metalness: 0.02 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  // shared geo/mat
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const edgeGeo = new THREE.EdgesGeometry(unitBox);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x1c1e22 });
  function trimBox(m) { const e = new THREE.LineSegments(edgeGeo, edgeMat); m.add(e); return m; }
  const crateTex = canvasTex(256, (g, s) => {
    g.fillStyle = '#7d6a4a'; g.fillRect(0, 0, s, s);
    noiseOn(g, s, 900, ['#5f5138', '#96835c'], 0.08, 0.2, 4);
    g.strokeStyle = '#4a3f2c'; g.lineWidth = 10; g.strokeRect(5, 5, s - 10, s - 10);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(s, s); g.moveTo(s, 0); g.lineTo(0, s); g.stroke();
  });
  const contTexA = canvasTex(256, (g, s) => {
    g.fillStyle = '#5a7f9e'; g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 16) { g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(x, 0, 6, s); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 6, 0, 3, s); }
    noiseOn(g, s, 700, ['#33506b', '#6b93b3'], 0.06, 0.18, 3);
  });
  const contTexB = canvasTex(256, (g, s) => {
    g.fillStyle = '#9c6a3e'; g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 16) { g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(x, 0, 6, s); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 6, 0, 3, s); }
    noiseOn(g, s, 700, ['#6b421f', '#b3804d'], 0.06, 0.18, 3);
  });
  const wallTex = canvasTex(256, (g, s) => {
    g.fillStyle = '#a89f8d'; g.fillRect(0, 0, s, s);
    noiseOn(g, s, 1200, ['#8a8272', '#c4bba6'], 0.06, 0.18, 3);
    g.fillStyle = 'rgba(40,40,44,0.6)'; g.fillRect(0, 0, s, 10); g.fillRect(0, s - 10, s, 10);
  }, 8, 1);
  const matCrate = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.9 });
  const matContA = new THREE.MeshStandardMaterial({ map: contTexA, roughness: 0.6, metalness: 0.35 });
  const matContB = new THREE.MeshStandardMaterial({ map: contTexB, roughness: 0.6, metalness: 0.35 });
  const matWall = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.8 });
  const matWood = new THREE.MeshStandardMaterial({ color: 0x6e5c3e, roughness: 0.9 });

  function box(mat, sx, sy, sz, x, y, z, ry = 0, solid = true) {
    const m = new THREE.Mesh(unitBox, mat);
    m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true; trimBox(m); scene.add(m);
    if (solid) addSolid(m); return m;
  }

  // perimeter walls
  const H = 58, WH = 4, WT = 1;
  box(matWall, 120, WH, WT, 0, WH / 2, -H, 0); box(matWall, 120, WH, WT, 0, WH / 2, H, 0);
  box(matWall, WT, WH, 120, -H, WH / 2, 0, 0); box(matWall, WT, WH, 120, H, WH / 2, 0, 0);

  // cover objects
  const cover = [
    ['c', 2, 2, 2, -8, 1, 4, 0.3], ['c', 2, 2, 2, -6, 1, 5.5, -0.2], ['c', 1.4, 1.4, 1.4, -7.2, 2.7, 4.6, 0.5],
    ['b', 4, 1.1, 0.6, 8, 0.55, 2, 0.4], ['b', 4, 1.1, 0.6, 10, 0.55, -6, -0.3],
    ['c', 3, 1.6, 1.6, 14, 0.8, 10, 0.2], ['c', 2, 2, 2, -16, 1, -8, 0.7],
    ['A', 8, 2.6, 2.6, -20, 1.3, 16, 0], ['A', 8, 2.6, 2.6, -20, 1.3, 13, 0],
    ['B', 8, 2.6, 2.6, 20, 1.3, -16, Math.PI / 2], ['B', 8, 2.6, 2.6, 17, 1.3, -16, Math.PI / 2],
    ['c', 2.4, 2.4, 2.4, 0, 1.2, -14, 0.15], ['c', 1.6, 1.6, 1.6, 2.2, 0.8, -13.4, 0.6],
    ['b', 5, 1.2, 0.8, -4, 0.6, -28, 0], ['b', 5, 1.2, 0.8, 6, 0.6, 28, 0.1],
    ['c', 2, 2, 2, -32, 1, -2, 0.4], ['c', 2, 2, 2, 32, 1, 6, -0.5],
    ['B', 7, 2.6, 2.6, 2, 1.3, -34, 0.1], ['A', 7, 2.6, 2.6, -6, 1.3, 36, -0.15],
    ['c', 1.8, 1.8, 1.8, 26, 0.9, 26, 0.3]
  ];
  const coverDots = [];
  for (const [k, sx, sy, sz, x, y, z, ry] of cover) {
    const mt = k === 'A' ? matContA : k === 'B' ? matContB : k === 'b' ? matDark : matCrate;
    box(mt, sx, sy, sz, x, y, z, ry);
    coverDots.push({ x, z });
  }

  // watchtowers (legs are individual colliders)
  function tower(x, z, ry) {
    const grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.y = ry; scene.add(grp);
    const legG = new THREE.CylinderGeometry(0.14, 0.18, 6, 6);
    for (const [lx, lz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
      const l = new THREE.Mesh(legG, matWood); l.position.set(lx, 3, lz); l.castShadow = true; grp.add(l);
    }
    const cab = new THREE.Mesh(unitBox, matWood); cab.scale.set(3.4, 1.6, 3.4);
    cab.position.y = 6.8; cab.castShadow = cab.receiveShadow = true; trimBox(cab); grp.add(cab);
    const roof = new THREE.Mesh(unitBox, matDark); roof.scale.set(4, 0.25, 4);
    roof.position.y = 8.1; roof.castShadow = true; grp.add(roof);
    grp.updateMatrixWorld(true);
    for (const child of grp.children) addSolid(child);
    coverDots.push({ x, z });
  }
  tower(-30, -30, 0.4); tower(30, 30, -0.5);

  // explosive barrels
  const barrelTex = canvasTex(128, (g, s) => {
    g.fillStyle = '#b02418'; g.fillRect(0, 0, s, s);
    noiseOn(g, s, 350, ['#7d150d', '#e05a3a'], 0.08, 0.2, 3);
    g.fillStyle = '#e8e3d5'; g.fillRect(0, s * 0.42, s, s * 0.16);
    g.fillStyle = '#222'; g.font = 'bold 20px sans-serif'; g.textAlign = 'center';
    g.fillText('!', s / 2, s * 0.56);
  });
  const barrelGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.4, 14);
  const barrelMat = new THREE.MeshStandardMaterial({ map: barrelTex, roughness: 0.55, metalness: 0.25 });
  const barrels = [];
  for (const [x, z] of [[-10, -4], [12, 6], [-2, -22], [4, 14]]) {
    const b = new THREE.Mesh(barrelGeo, barrelMat);
    b.position.set(x, 0.7, z); b.castShadow = b.receiveShadow = true;
    b.userData.explosive = true; scene.add(b); addSolid(b);
    barrels.push(b);
  }

  // streetlights
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 8);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.6, metalness: 0.5 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffd977, emissiveIntensity: 2 });
  for (const [x, z] of [[-14, -14], [14, 14], [-14, 22], [14, -22]]) {
    const p = new THREE.Mesh(poleGeo, poleMat); p.position.set(x, 3.5, z); p.castShadow = true; scene.add(p); addSolid(p);
    const head = new THREE.Mesh(unitBox, lampMat); head.scale.set(0.5, 0.25, 0.9);
    head.position.set(x, 7.05, z); scene.add(head);
    const pl = new THREE.PointLight(0xffd9a0, 18, 30, 1.8); pl.position.set(x, 6.8, z); scene.add(pl);
  }

  const colliders = solids.map(o => new THREE.Box3().setFromObject(o));
  scene.userData.colliders = colliders;
  scene.userData.solids = solids;
  const enemySpawns = [
    new THREE.Vector3(-50, 0, -50), new THREE.Vector3(50, 0, -50),
    new THREE.Vector3(-50, 0, 50), new THREE.Vector3(50, 0, 50),
    new THREE.Vector3(-26, 0, -26), new THREE.Vector3(26, 0, 26),
    new THREE.Vector3(30, 0, -30), new THREE.Vector3(-30, 0, 30)
  ];
  const playerSpawn = new THREE.Vector3(0, 1.7, 20);
  return { colliders, solids, enemySpawns, playerSpawn, barrels, coverDots };
}

export function removeSolid(scene, mesh) {
  const solids = scene.userData.solids || [];
  const idx = solids.indexOf(mesh);
  if (idx >= 0) {
    solids.splice(idx, 1);
    scene.userData.colliders = solids.map(o => {
      try { return new THREE.Box3().setFromObject(o); } catch { return null; }
    }).filter(Boolean);
  }
  scene.remove(mesh);
}
