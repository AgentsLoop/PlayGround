import * as THREE from 'three';

export type ProceduralModelOptions = {
  wireframe?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  textureSize?: number;
  textureAnisotropy?: number;
  qualityPriority?: 'reference-fidelity' | 'balanced';
};

export type ProceduralModelRuntime = {
  nodes: Record<string, THREE.Object3D>;
  meshes: Record<string, THREE.Mesh>;
  sockets: Record<string, THREE.Object3D>;
  colliders: Record<string, unknown>;
  destructionGroups: Record<string, THREE.Object3D[]>;
};

// Renamon — code-only procedural model.
// Derived from img2threejs spec project/forge-out/object-sculpt-spec.json
// (Renamon, character profile) and reference project/assets/renamon-reference.png:
// tall yellow fox-humanoid, long ears with white tips, narrow snout, blue eyes,
// purple facial marking, white chest ruff, baggy purple sleeves (yin-yang on
// right), yellow thighs with purple spirals, white feet with dark claws,
// long bushy tail with white tip. All primitives, no external mesh files.
export function createRenamonModel(options: ProceduralModelOptions = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Renamon';
  root.userData.reconstructionEvidence = {
    spec: 'project/forge-out/object-sculpt-spec.json',
    reference: 'project/assets/renamon-reference.png',
    pipeline: 'img2threejs character profile: image probe -> pre-spec assessment -> detail inventory (12 details) -> sculpt spec (strict-quality) -> staged factory',
  };

  const YELLOW = 0xfed954;
  const YELLOW_DK = 0xc9a13f;
  const WHITE = 0xf6f4ec;
  const PURPLE = 0x7b5aa6;
  const PURPLE_DK = 0x583e80;
  const EYE_BLUE = 0x2a5db0;
  const DARK = 0x1a1a1e;

  const wire = options.wireframe ?? false;
  const cast = options.castShadow ?? true;
  const recv = options.receiveShadow ?? true;

  function mat(color: number, roughness = 0.7, extra: Record<string, unknown> = {}): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, wireframe: wire, ...extra });
    return m;
  }
  const mFur = mat(YELLOW, 0.75);
  const mFurDk = mat(YELLOW_DK, 0.8);
  const mWhite = mat(WHITE, 0.85);
  const mPurple = mat(PURPLE, 0.7);
  const mPurpleDk = mat(PURPLE_DK, 0.7);
  const mEye = new THREE.MeshStandardMaterial({ color: EYE_BLUE, roughness: 0.25, metalness: 0.1, wireframe: wire });
  const mDark = mat(DARK, 0.5);

  const nodes: Record<string, THREE.Object3D> = { root };
  const meshes: Record<string, THREE.Mesh> = {};
  const sockets: Record<string, THREE.Object3D> = {};

  function add(
    parent: THREE.Object3D, name: string,
    geo: THREE.BufferGeometry, material: THREE.Material,
    pos: [number, number, number] = [0, 0, 0],
    rot: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1],
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = name;
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.rotation.set(rot[0], rot[1], rot[2]);
    mesh.scale.set(scale[0], scale[1], scale[2]);
    mesh.castShadow = cast;
    mesh.receiveShadow = recv;
    parent.add(mesh);
    meshes[name] = mesh;
    return mesh;
  }
  function group(parent: THREE.Object3D, name: string, pos: [number, number, number] = [0, 0, 0]): THREE.Group {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(pos[0], pos[1], pos[2]);
    parent.add(g);
    nodes[name] = g;
    return g;
  }

  // ---- hips / torso (yellow) ----
  const hips = group(root, 'hips', [0, 1.08, 0]);
  add(hips, 'pelvis', new THREE.SphereGeometry(0.16, 24, 18), mFur, [0, 0, 0], [0, 0, 0], [1.15, 0.8, 0.9]);
  const torso = group(hips, 'torso', [0, 0.22, 0]);
  add(torso, 'abdomen', new THREE.CapsuleGeometry(0.13, 0.22, 6, 20), mFur, [0, 0.1, 0]);
  add(torso, 'chest', new THREE.SphereGeometry(0.17, 24, 18), mFur, [0, 0.32, 0.01], [0, 0, 0], [1.05, 1.0, 0.85]);
  // white chest blaze under ruff
  add(torso, 'chest-blaze', new THREE.SphereGeometry(0.11, 20, 16), mWhite, [0, 0.28, 0.12], [0.2, 0, 0], [0.8, 1.0, 0.5]);

  // white chest ruff: ring of spikes
  const ruff = group(torso, 'ruff', [0, 0.38, 0.06]);
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 6 - 0.5) * 1.9;
    const spike = add(ruff, `ruff-spike-${i}`, new THREE.ConeGeometry(0.05, 0.22, 10), mWhite,
      [Math.sin(a) * 0.13, -0.05 - Math.abs(Math.cos(a)) * 0.04, 0.05 + Math.cos(a * 0.5) * 0.03],
      [2.6 + Math.cos(a) * 0.3, 0, -a * 0.6]);
    spike.geometry.translate(0, -0.08, 0);
  }

  const neck = group(torso, 'neck', [0, 0.48, 0.02]);
  add(neck, 'neck-mesh', new THREE.CylinderGeometry(0.07, 0.09, 0.14, 16), mFur, [0, 0.05, 0]);

  // ---- head: fox skull + snout + ears ----
  const head = group(neck, 'head', [0, 0.2, 0.01]);
  add(head, 'skull', new THREE.SphereGeometry(0.155, 28, 22), mFur, [0, 0.08, 0.01], [0, 0, 0], [0.95, 1.0, 1.0]);
  // snout: tapered box-ish cone pointing +Z
  add(head, 'snout', new THREE.CylinderGeometry(0.045, 0.095, 0.22, 16), mFur, [0, 0.03, 0.2], [Math.PI / 2 + 0.08, 0, 0]);
  add(head, 'nose', new THREE.SphereGeometry(0.022, 12, 10), mDark, [0, 0.045, 0.31]);
  // eyes: blue, set into sides of snout base
  for (const s of [1, -1]) {
    add(head, s > 0 ? 'eye-r' : 'eye-l', new THREE.SphereGeometry(0.032, 16, 12), mEye,
      [s * 0.085, 0.09, 0.135], [0, s * 0.5, s * -0.15], [1, 0.7, 0.5]);
    // purple jagged facial marking under eye
    add(head, s > 0 ? 'mark-r' : 'mark-l', new THREE.BoxGeometry(0.075, 0.014, 0.012), mPurple,
      [s * 0.095, 0.045, 0.14], [0, s * 0.45, s * -0.35]);
  }
  // tall erect ears with white tips
  for (const s of [1, -1]) {
    const ear = group(head, s > 0 ? 'ear-r' : 'ear-l', [s * 0.09, 0.2, -0.02]);
    ear.rotation.set(-0.15, 0, s * -0.35);
    add(ear, s > 0 ? 'ear-mesh-r' : 'ear-mesh-l', new THREE.ConeGeometry(0.06, 0.34, 14), mFur, [0, 0.15, 0]);
    add(ear, s > 0 ? 'ear-tip-r' : 'ear-tip-l', new THREE.ConeGeometry(0.032, 0.12, 12), mWhite, [0, 0.3, 0]);
    // inner ear
    add(ear, s > 0 ? 'ear-inner-r' : 'ear-inner-l', new THREE.ConeGeometry(0.028, 0.18, 10), mFurDk, [0, 0.12, 0.025], [0.15, 0, 0]);
  }
  sockets['head'] = head;

  // ---- arms: yellow upper, baggy purple forearms, white gloves ----
  for (const s of [1, -1]) {
    const side = s > 0 ? 'r' : 'l';
    const shoulder = group(torso, `shoulder-${side}`, [s * 0.2, 0.36, 0]);
    add(shoulder, `upper-arm-${side}`, new THREE.CapsuleGeometry(0.05, 0.16, 4, 12), mFur, [s * 0.04, -0.12, 0], [0, 0, s * 0.18]);
    const elbow = group(shoulder, `elbow-${side}`, [s * 0.07, -0.24, 0]);
    // baggy sleeve: flared cylinder
    add(elbow, `sleeve-${side}`, new THREE.CylinderGeometry(0.075, 0.115, 0.34, 18), mPurple, [0, -0.15, 0]);
    add(elbow, `cuff-${side}`, new THREE.CylinderGeometry(0.115, 0.125, 0.06, 18), mPurpleDk, [0, -0.33, 0]);
    const hand = group(elbow, `hand-${side}`, [0, -0.4, 0]);
    add(hand, `glove-${side}`, new THREE.SphereGeometry(0.06, 16, 12), mWhite, [0, -0.03, 0], [0, 0, 0], [0.9, 1.2, 0.9]);
    // small claws
    for (let c = 0; c < 3; c += 1) {
      add(hand, `claw-${side}-${c}`, new THREE.ConeGeometry(0.012, 0.05, 8), mDark,
        [(c - 1) * 0.03, -0.1, 0.01], [Math.PI, 0, 0]);
    }
    sockets[`hand-${side}`] = hand;
    // yin-yang emblem on right sleeve
    if (s > 0) {
      const emblem = group(elbow, 'yin-yang', [0.085, -0.2, 0.055]);
      emblem.rotation.set(0, 0.5, 0);
      add(emblem, 'yinyang-disc', new THREE.CylinderGeometry(0.035, 0.035, 0.012, 20), mWhite, [0, 0, 0], [Math.PI / 2, 0, 0]);
      add(emblem, 'yinyang-dark', new THREE.SphereGeometry(0.017, 12, 10), mDark, [0.009, 0, 0.008], [0, 0, 0], [1, 1, 0.4]);
      add(emblem, 'yinyang-dot', new THREE.SphereGeometry(0.007, 8, 8), mWhite, [-0.009, 0.005, 0.009]);
    }
  }

  // ---- legs: yellow thighs with purple spirals, white shins/feet, dark claws ----
  for (const s of [1, -1]) {
    const side = s > 0 ? 'r' : 'l';
    const hip = group(hips, `hip-${side}`, [s * 0.1, -0.08, 0]);
    add(hip, `thigh-${side}`, new THREE.CapsuleGeometry(0.085, 0.22, 4, 14), mFur, [0, -0.16, 0]);
    // purple spiral markings: two flattened tori around thigh
    add(hip, `spiral-${side}-a`, new THREE.TorusGeometry(0.085, 0.014, 8, 24), mPurple, [0, -0.1, 0.01], [Math.PI / 2, 0, 0.4]);
    add(hip, `spiral-${side}-b`, new THREE.TorusGeometry(0.08, 0.012, 8, 24), mPurple, [0, -0.22, 0.01], [Math.PI / 2, 0, -0.3]);
    const knee = group(hip, `knee-${side}`, [0, -0.34, 0]);
    // digitigrade: shin angles slightly back, white lower leg
    add(knee, `shin-${side}`, new THREE.CapsuleGeometry(0.055, 0.24, 4, 12), mWhite, [0, -0.15, -0.02], [0.12, 0, 0]);
    const ankle = group(knee, `ankle-${side}`, [0, -0.32, 0.02]);
    // broad foot
    add(ankle, `foot-${side}`, new THREE.BoxGeometry(0.11, 0.07, 0.26), mWhite, [0, -0.04, 0.07]);
    add(ankle, `foot-toe-${side}`, new THREE.SphereGeometry(0.06, 14, 12), mWhite, [0, -0.05, 0.2], [0, 0, 0], [0.9, 0.7, 1.0]);
    for (let c = 0; c < 3; c += 1) {
      add(ankle, `toe-claw-${side}-${c}`, new THREE.ConeGeometry(0.016, 0.06, 8), mDark,
        [(c - 1) * 0.038, -0.06, 0.27], [Math.PI / 2 + 0.2, 0, 0]);
    }
  }

  // ---- tail: long, bushy, sweeping back with white tip ----
  const tailBase = group(hips, 'tail', [0, 0.02, -0.14]);
  tailBase.rotation.set(-0.9, 0, 0);
  add(tailBase, 'tail-seg-a', new THREE.CapsuleGeometry(0.09, 0.3, 4, 14), mFur, [0, 0.2, 0]);
  const tailMid = group(tailBase, 'tail-mid', [0, 0.42, 0]);
  tailMid.rotation.set(-0.5, 0, 0);
  add(tailMid, 'tail-seg-b', new THREE.CapsuleGeometry(0.075, 0.3, 4, 14), mFur, [0, 0.18, 0]);
  const tailTip = group(tailMid, 'tail-tip', [0, 0.38, 0]);
  tailTip.rotation.set(-0.4, 0, 0);
  add(tailTip, 'tail-seg-c', new THREE.CapsuleGeometry(0.06, 0.2, 4, 12), mFur, [0, 0.12, 0]);
  add(tailTip, 'tail-tip-white', new THREE.ConeGeometry(0.055, 0.22, 12), mWhite, [0, 0.32, 0]);
  sockets['tail'] = tailMid;

  root.userData.sculptRuntime = {
    nodes, meshes, sockets,
    colliders: {},
    destructionGroups: {},
  } satisfies ProceduralModelRuntime;

  // idle animation: tail sway + ear twitch
  const runtime = root.userData.sculptRuntime as ProceduralModelRuntime & { tick?: (t: number) => void };
  runtime.tick = (t: number) => {
    tailMid.rotation.y = Math.sin(t * 1.8) * 0.14;
    tailBase.rotation.y = Math.sin(t * 0.9) * 0.06;
    const earL = nodes['ear-l'];
    const earR = nodes['ear-r'];
    if (earL) earL.rotation.x = -0.15 + Math.sin(t * 2.3) * 0.03;
    if (earR) earR.rotation.x = -0.15 + Math.sin(t * 2.3 + 1) * 0.03;
  };
  root.userData.sculptRuntime = runtime;

  return root;
}
