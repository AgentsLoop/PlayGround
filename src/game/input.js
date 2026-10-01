import * as THREE from 'three';
import { MAP_SIZE } from './config.js';
import { groundHeight } from './world.js';
import { sfx } from './audio.js';

export class Input {
  constructor(game, ui, camera, renderer) {
    this.game = game; this.ui = ui; this.camera = camera; this.renderer = renderer;
    this.cam = { x: -30, z: 30, dist: 42, yaw: Math.PI / 4, pitch: 0.9 };
    this.keys = {};
    this.drag = null; // {x0,y0,x1,y1}
    this.placeType = null; this.placeGhost = null;
    this.attackMode = false; this.buildMenu = false;
    this.groups = { 1: [], 2: [], 3: [] };
    this.rallySet = null;
    this.edge = { x: 0, y: 0 };
    this.bind();
  }

  bind() {
    const cv = this.renderer.domElement;
    window.addEventListener('keydown', e => this.onKey(e, true));
    window.addEventListener('keyup', e => this.onKey(e, false));
    cv.addEventListener('mousedown', e => this.onDown(e));
    window.addEventListener('mousemove', e => this.onMove(e));
    window.addEventListener('mouseup', e => this.onUp(e));
    cv.addEventListener('wheel', e => { this.cam.dist = Math.min(90, Math.max(16, this.cam.dist + e.deltaY * 0.03)); e.preventDefault(); }, { passive: false });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    // middle-drag pan
    this.mmid = null;
  }

  onKey(e, down) {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    this.keys[k] = down;
    if (!down) return;
    if (this.game.over) return;
    if (k === 'escape') {
      if (this.placeType) this.cancelPlace();
      else if (this.attackMode) { this.attackMode = false; this.ui.hint(''); }
      else this.ui.clearSel();
    }
    else if (k === 'a' && !this.buildMenu) { this.attackMode = true; this.ui.hint('ATTACK-MOVE: left-click a target location'); }
    else if (k === 's') this.game.orderStop(this.ui.sel);
    else if (k === 'h') this.game.orderHold(this.ui.sel);
    else if (k === 'b') this.ui.toggleBuildMenu();
    else if (k === 'p') this.ui.togglePause();
    else if (k === ' ') { if (this.game.lastAlert) { this.cam.x = this.game.lastAlert.x; this.cam.z = this.game.lastAlert.z; } e.preventDefault(); }
    else if (['1', '2', '3'].includes(k)) {
      if (this.keys['control']) { this.groups[k] = this.ui.sel.filter(e2 => e2.alive); this.ui.hint(`Group ${k} set (${this.groups[k].length})`); }
      else { const g = this.groups[k].filter(e2 => e2.alive); if (g.length) this.ui.setSel(g); }
    }
    else if (k === 'q' || k === 'w' || k === 'e') this.ui.hotkey(k);
  }

  screenToGround(cx, cy) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const m = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(m, this.camera);
    const t = -rc.ray.origin.y / rc.ray.direction.y;
    if (t < 0) return null;
    const p = rc.ray.origin.clone().add(rc.ray.direction.clone().multiplyScalar(t));
    // refine against terrain height (2 iterations)
    for (let i = 0; i < 2; i++) {
      const h = groundHeight(p.x, p.z);
      const t2 = (h - rc.ray.origin.y) / rc.ray.direction.y;
      p.copy(rc.ray.origin).add(rc.ray.direction.clone().multiplyScalar(t2));
    }
    return p;
  }

  pick(cx, cy) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const m = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(m, this.camera);
    const targets = [];
    for (const u of this.game.units) if (u.alive) targets.push(u.mesh);
    for (const b of this.game.buildings) if (b.alive) targets.push(b.mesh);
    for (const n of this.game.nodes) if (!n.depleted) targets.push(n.mesh);
    const hits = rc.intersectObjects(targets, true);
    if (!hits.length) return null;
    let o = hits[0].object;
    while (o && !o.userData.ent) o = o.parent;
    return o ? o.userData.ent : null;
  }

  tagMeshes() {
    for (const u of this.game.units) u.mesh.traverse(o => o.userData.ent = u);
    for (const b of this.game.buildings) b.mesh.traverse(o => o.userData.ent = b);
    for (const n of this.game.nodes) n.mesh.traverse(o => o.userData.ent = { kind: 'node', node: n });
  }

  onDown(e) {
    if (this.game.over || !this.ui.playing) return;
    this.tagMeshes();
    if (e.button === 1) { this.mmid = { x: e.clientX, y: e.clientY }; e.preventDefault(); return; }
    if (e.button === 2) { this.rightClick(e); return; }
    if (e.button !== 0) return;
    const p = this.screenToGround(e.clientX, e.clientY);
    // attack-mode click
    if (this.attackMode) {
      if (p) { this.game.orderAttackMove(this.ui.sel, p.x, p.z, !!this.keys['shift']); this.game.action(); }
      this.attackMode = false; this.ui.hint('');
      return;
    }
    // placement click
    if (this.placeType) {
      if (p) {
        const workers = this.ui.sel.filter(s2 => s2.kind === 'unit' && s2.type === 'drudge' && s2.owner === 'player');
        if (workers.length) this.game.orderBuild(workers[0], this.placeType, p.x, p.z);
        if (!this.keys['shift']) this.cancelPlace();
      }
      return;
    }
    this.drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, moved: false };
  }

  onMove(e) {
    this.edge.x = e.clientX < 8 ? -1 : e.clientX > innerWidth - 8 ? 1 : 0;
    this.edge.y = e.clientY < 8 ? -1 : e.clientY > innerHeight - 8 ? 1 : 0;
    if (this.mmid) {
      const s = this.cam.dist * 0.0016;
      const yaw = this.cam.yaw;
      this.cam.x -= ((e.clientX - this.mmid.x) * Math.cos(yaw) - (e.clientY - this.mmid.y) * Math.sin(yaw)) * s * 10;
      this.cam.z -= ((e.clientX - this.mmid.x) * Math.sin(yaw) + (e.clientY - this.mmid.y) * Math.cos(yaw)) * s * 10;
      this.mmid = { x: e.clientX, y: e.clientY };
      return;
    }
    if (this.drag) {
      this.drag.x1 = e.clientX; this.drag.y1 = e.clientY;
      if (Math.abs(this.drag.x1 - this.drag.x0) + Math.abs(this.drag.y1 - this.drag.y0) > 8) this.drag.moved = true;
      this.ui.drawDrag(this.drag);
    }
    if (this.placeType) {
      const p = this.screenToGround(e.clientX, e.clientY);
      if (p && this.placeGhost) {
        this.placeGhost.position.set(p.x, groundHeight(p.x, p.z) + 0.2, p.z);
        const ok = this.game.canPlace(this.placeType, p.x, p.z);
        this.placeGhost.material.color.set(ok ? 0x35e0d2 : 0xff5a4e);
      }
    }
  }

  onUp(e) {
    if (this.mmid && e.button === 1) { this.mmid = null; return; }
    if (e.button !== 0 || !this.drag) return;
    const d = this.drag; this.drag = null;
    this.ui.drawDrag(null);
    if (!d.moved) { this.clickSelect(e); return; }
    // box select (player units only + own buildings)
    const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1);
    const y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
    const v = new THREE.Vector3();
    const found = [];
    for (const u of this.game.units) {
      if (!u.alive || u.owner !== 'player') continue;
      v.set(u.x, u.y + 1, u.z).project(this.camera);
      const sx = (v.x * 0.5 + 0.5) * innerWidth, sy = (-v.y * 0.5 + 0.5) * innerHeight;
      if (sx > x0 && sx < x1 && sy > y0 && sy < y1) found.push(u);
    }
    if (found.length) this.ui.setSel(this.keys['shift'] ? [...this.ui.sel, ...found] : found, true);
    sfx.select();
  }

  clickSelect(e) {
    const ent = this.pick(e.clientX, e.clientY);
    if (!ent) { if (!this.keys['shift']) this.ui.clearSel(); return; }
    if (ent.kind === 'node') {
      const drudges = this.ui.sel.filter(s2 => s2.kind === 'unit' && s2.type === 'drudge');
      if (drudges.length) this.game.orderHarvest(drudges, ent.node);
      return;
    }
    if ((ent.kind === 'unit' && ent.owner === 'player') || (ent.kind === 'building' && ent.owner === 'player')) {
      if (this.keys['shift']) this.ui.toggleSel(ent);
      else if (this.keys['control'] && ent.kind === 'unit') {
        this.ui.setSel(this.game.units.filter(u => u.alive && u.owner === 'player' && u.type === ent.type), true);
      }
      else this.ui.setSel([ent]);
      sfx.select();
    } else {
      // clicked enemy with army selected → attack
      const army = this.ui.sel.filter(s2 => s2.kind === 'unit' && s2.alive && s2.type !== 'drudge');
      if (army.length) this.game.orderAttack(army, ent);
      else this.ui.setSel([ent]); // inspect enemy
    }
  }

  rightClick(e) {
    const sel = this.ui.sel.filter(s2 => s2.alive);
    if (!sel.length) return;
    this.tagMeshes();
    const ent = this.pick(e.clientX, e.clientY);
    const p = this.screenToGround(e.clientX, e.clientY);
    const queue = !!this.keys['shift'];
    // building selected alone → rally
    if (sel.length === 1 && sel[0].kind === 'building' && sel[0].owner === 'player' && (!ent || ent === sel[0])) {
      if (p) { sel[0].rally = { x: p.x, z: p.z }; this.ui.ping(p.x, p.z, 0x35e0d2); this.game.action(); sfx.move(); }
      return;
    }
    const units = sel.filter(s2 => s2.kind === 'unit');
    if (!units.length) return;
    if (ent && (ent.kind === 'unit' || ent.kind === 'building') && ent.owner === 'enemy') {
      const army = units.filter(u => u.type !== 'drudge');
      if (army.length) this.game.orderAttack(army, ent);
      else if (p) this.game.orderMove(units, p.x, p.z, queue);
    } else if (ent && ent.kind === 'node') {
      const dr = units.filter(u => u.type === 'drudge');
      if (dr.length) this.game.orderHarvest(dr, ent.node);
      const rest = units.filter(u => u.type !== 'drudge');
      if (rest.length && p) this.game.orderMove(rest, p.x, p.z, queue);
    } else if (p) {
      // smart: combat units attack-move on right-click vs ground? No — SC2 default is move.
      this.game.orderMove(units, p.x, p.z, queue);
    }
  }

  startPlace(type, ghost) {
    this.cancelPlace();
    this.placeType = type; this.placeGhost = ghost;
    this.ui.hint(`Placing ${type} — left-click to place, ESC cancels`);
  }
  cancelPlace() {
    this.placeType = null;
    if (this.placeGhost) { this.ui.scene.remove(this.placeGhost); this.placeGhost = null; }
    this.ui.hint('');
  }

  updateCamera(dt) {
    const sp = this.cam.dist * 0.9 * dt;
    let mx = 0, mz = 0;
    if (this.keys['arrowup']) mz -= 1;
    if (this.keys['arrowdown']) mz += 1;
    if (this.keys['arrowleft']) mx -= 1;
    if (this.keys['arrowright']) mx += 1;
    mx += this.edge.x; mz += this.edge.y;
    const yaw = this.cam.yaw;
    this.cam.x += (mx * Math.cos(yaw) - mz * Math.sin(yaw)) * sp;
    this.cam.z += (mx * Math.sin(yaw) + mz * Math.cos(yaw)) * sp;
    this.cam.x = Math.max(-55, Math.min(55, this.cam.x));
    this.cam.z = Math.max(-55, Math.min(55, this.cam.z));
    const { x, z, dist, pitch } = this.cam;
    const gy = groundHeight(x, z);
    this.camera.position.set(
      x + Math.cos(yaw) * Math.cos(pitch) * dist,
      gy + Math.sin(pitch) * dist,
      z + Math.sin(yaw) * Math.cos(pitch) * dist);
    this.camera.lookAt(x, gy, z);
  }
}
