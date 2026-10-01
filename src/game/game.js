import * as THREE from 'three';
import { UNITS, BUILDINGS, START, MAP_SIZE } from './config.js';
import { Unit, Building } from './entities.js';
import { groundHeight, makeNodeMesh, scatterNodes } from './world.js';
import { sfx } from './audio.js';

const clampB = v => Math.max(-MAP_SIZE / 2 + 1, Math.min(MAP_SIZE / 2 - 1, v));

export class Game {
  constructor(scene, ui) {
    this.scene = scene; this.ui = ui;
    this.units = []; this.buildings = []; this.nodes = [];
    this.shots = []; this.parts = [];
    this.res = {
      player: { flux: START.flux, alloy: START.alloy },
      enemy: { flux: START.flux, alloy: START.alloy },
    };
    this.time = 0; this.speed = 1; this.paused = false; this.over = null;
    this.actions = 0; this.apmTimes = [];
    this.stats = { kills: 0, harvested: 0, built: 0, trained: 0 };
    this.lastAlert = null;
    this.aiT = 0; this.wave = 0;
    this.shotPool = [];
  }

  // ---- setup ----------------------------------------------------------------
  init() {
    for (const n of scatterNodes()) {
      const mesh = makeNodeMesh(n.kind);
      mesh.position.set(n.x, groundHeight(n.x, n.z), n.z);
      this.scene.add(mesh);
      this.nodes.push({ ...n, mesh, depleted: false });
    }
    const mkBase = (owner, bx, bz) => {
      const core = this.addBuilding('core', owner, bx, bz, true);
      for (let i = 0; i < 5; i++)
        this.addUnit('drudge', owner, bx + (i - 2) * 2.2, bz + 6.5, true);
      return core;
    };
    this.playerCore = mkBase('player', START.playerBase.x, START.playerBase.z);
    this.enemyCore = mkBase('enemy', START.enemyBase.x, START.enemyBase.z);
    // AI head start so it pressures: a foundry + pylon pre-placed as finished
    this.addBuilding('foundry', 'enemy', START.enemyBase.x - 8, START.enemyBase.z - 2, true);
    this.addBuilding('pylon', 'enemy', START.enemyBase.x + 7, START.enemyBase.z + 3, true);
    this.ui.announce('Destroy the enemy Command Core — good luck, Commander.');
  }

  addUnit(type, owner, x, z, instant = false) {
    const u = new Unit(type, owner, clampB(x), clampB(z));
    this.scene.add(u.mesh);
    this.units.push(u);
    return u;
  }
  addBuilding(type, owner, x, z, instant = false) {
    const b = new Building(type, owner, clampB(x), clampB(z));
    if (instant) { b.done = true; b.progress = 1; b.hp = b.maxHp; }
    this.scene.add(b.mesh);
    this.buildings.push(b);
    return b;
  }

  resOf(o) { return this.res[o]; }
  supply(o) {
    let used = 0, cap = 0;
    for (const u of this.units) if (u.owner === o && u.alive) used += u.supply;
    for (const b of this.buildings) if (b.owner === o && b.alive && b.done) cap += BUILDINGS[b.type].supply || 0;
    return { used, cap };
  }

  action() { this.actions++; this.apmTimes.push(this.time); }

  // ---- orders -----------------------------------------------------------------
  orderMove(sel, x, z, queue = false) {
    for (const u of sel) {
      if (u.kind !== 'unit' || !u.alive) continue;
      const o = { t: 'move', x: clampB(x), z: clampB(z) };
      if (queue) u.queue.push(o); else { u.order = o; u.queue.length = 0; }
      u.target = null; u.attackMove = null; u.holdPos = false; u.buildTarget = null;
    }
    this.action(); sfx.move(); this.ui.ping(x, z, 0x35e0d2);
  }
  orderAttackMove(sel, x, z, queue = false) {
    for (const u of sel) {
      if (u.kind !== 'unit' || !u.alive || u.type === 'drudge') continue;
      const o = { t: 'amove', x: clampB(x), z: clampB(z) };
      if (queue) u.queue.push(o); else { u.order = o; u.queue.length = 0; }
      u.holdPos = false; u.buildTarget = null;
    }
    this.action(); sfx.attack(); this.ui.ping(x, z, 0xff5a4e);
  }
  orderAttack(sel, target) {
    for (const u of sel) {
      if (u.kind !== 'unit' || !u.alive || u.type === 'drudge') continue;
      u.order = { t: 'attack', target }; u.queue.length = 0; u.holdPos = false;
    }
    this.action(); sfx.attack();
  }
  orderHarvest(sel, node) {
    for (const u of sel) {
      if (u.kind !== 'unit' || !u.alive || u.type !== 'drudge') continue;
      u.order = { t: 'harvest', node }; u.queue.length = 0;
      u.cargo = 0; u.cargoKind = null; u.buildTarget = null; u.holdPos = false;
    }
    this.action(); sfx.move();
  }
  orderBuild(worker, type, x, z) {
    const cost = BUILDINGS[type].cost, r = this.resOf(worker.owner);
    if (r.flux < cost.flux || r.alloy < cost.alloy) { this.ui.error('Not enough resources'); sfx.error(); return null; }
    if (!this.canPlace(type, x, z)) { this.ui.error('Cannot build there'); sfx.error(); return null; }
    r.flux -= cost.flux; r.alloy -= cost.alloy;
    const b = this.addBuilding(type, worker.owner, x, z);
    worker.order = { t: 'build', target: b }; worker.queue.length = 0;
    worker.buildTarget = b; worker.target = null;
    this.action(); sfx.build();
    if (worker.owner === 'player') this.stats.built++;
    return b;
  }
  orderStop(sel) { for (const u of sel) { if (u.kind === 'unit' && u.alive) { u.order = { t: 'idle' }; u.queue.length = 0; u.target = null; u.holdPos = false; u.attackMove = null; } } this.action(); }
  orderHold(sel) { for (const u of sel) { if (u.kind === 'unit' && u.alive) { u.order = { t: 'hold' }; u.queue.length = 0; u.holdPos = true; } } this.action(); }

  canPlace(type, x, z) {
    const s = BUILDINGS[type], R = s.size * 0.62 + 0.4;
    if (Math.abs(x) > MAP_SIZE / 2 - 3 || Math.abs(z) > MAP_SIZE / 2 - 3) return false;
    for (const b of this.buildings) {
      if (!b.alive) continue;
      if (Math.hypot(b.x - x, b.z - z) < b.r + R) return false;
    }
    for (const n of this.nodes) {
      if (n.depleted) continue;
      if (Math.hypot(n.x - x, n.z - z) < R + 1.6) return false;
    }
    return true;
  }

  train(b, type) {
    const s = UNITS[type], r = this.resOf(b.owner);
    const sup = this.supply(b.owner);
    if (b.queue.length >= 5) { this.ui.error('Queue is full'); sfx.error(); return; }
    if (r.flux < s.cost.flux || r.alloy < s.cost.alloy) { this.ui.error('Not enough resources'); sfx.error(); return; }
    if (sup.used + s.supply > sup.cap) { this.ui.error('Need more supply (build Relay Pylon)'); sfx.error(); if (b.owner === 'player') this.ui.announce('⛔ Supply blocked — build a Relay Pylon (B).'); return; }
    r.flux -= s.cost.flux; r.alloy -= s.cost.alloy;
    b.queue.push(type); this.action(); sfx.build();
  }

  // ---- combat ------------------------------------------------------------------
  enemiesOf(owner, x, z, range) {
    let best = null, bd = range;
    for (const u of this.units) {
      if (!u.alive || u.owner === owner) continue;
      const d = Math.hypot(u.x - x, u.z - z);
      if (d < bd) { bd = d; best = u; }
    }
    for (const b of this.buildings) {
      if (!b.alive || b.owner === owner) continue;
      const d = Math.hypot(b.x - x, b.z - z) - b.r;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  fire(u, target) {
    const tx = target.x, ty = (target.y || 0) + 1.2, tz = target.z;
    this.spawnTracer(u.x, u.y + 1.4, u.z, tx, ty, tz, u.owner === 'player' ? 0x7df9ff : 0xff8a5a);
    sfx.shoot();
    this.damage(target, u.dmg, u.owner);
    u.cd = u.cooldown;
  }

  damage(target, dmg, byOwner) {
    if (!target.alive) return;
    target.hp -= dmg; target.flash = 0.12;
    if (target.hp <= 0) this.kill(target, byOwner);
    else if (target.kind === 'unit' && target.owner === 'enemy' && (!target.target || !target.target.alive)) {
      // defenders fight back when hurt
      const foe = this.enemiesOf('enemy', target.x, target.z, 12);
      if (foe && target.type !== 'drudge') { target.order = { t: 'attack', target: foe }; target.target = foe; }
    }
  }

  kill(target, byOwner) {
    target.alive = false; target.hp = 0;
    this.explode(target.x, (target.y || 0) + 1, target.z, target.kind === 'building' ? 2.6 : 1.2,
      target.owner === 'player' ? 0x35e0d2 : 0xff5a4e);
    sfx.boom();
    if (target.kind === 'building' && target.owner === 'player') {
      this.lastAlert = { x: target.x, z: target.z };
      if (target.type === 'core') this.ui.announce('⚠️ Your Command Core is under attack!');
    }
    if (target.kind === 'building' && target.owner === 'enemy' && target.type === 'core') {
      this.lastAlert = { x: target.x, z: target.z };
    }
    if (byOwner === 'player' && target.owner === 'enemy') this.stats.kills++;
    // clear references
    for (const u of this.units) if (u.target === target) u.target = null;
    for (const u of this.units) if (u.order.target === target) { u.order = { t: 'idle' }; }
  }

  spawnTracer(x1, y1, z1, x2, y2, z2, color) {
    const g = new THREE.BufferGeometry().setFromPoints(
      [new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y2, z2)]);
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1 }));
    this.scene.add(line);
    this.shots.push({ line, t: 0.14 });
  }
  explode(x, y, z, size, color) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    m.position.set(x, y, z); this.scene.add(m);
    this.parts.push({ m, t: 0.5, size });
  }

  nearestDropoff(owner, x, z) {
    let best = null, bd = 1e9;
    for (const b of this.buildings) {
      if (!b.alive || !b.done || b.owner !== owner || b.type !== 'core') continue;
      const d = Math.hypot(b.x - x, b.z - z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  nearestNode(owner, x, z, kind = null) {
    let best = null, bd = 1e9;
    for (const n of this.nodes) {
      if (n.depleted || n.amount <= 0) continue;
      if (kind && n.kind !== kind) continue;
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  // ---- per-frame ----------------------------------------------------------------
  update(dt) {
    if (this.paused || this.over) return;
    dt = Math.min(dt, 0.1) * this.speed;
    this.time += dt;
    this.updateUnits(dt);
    this.updateBuildings(dt);
    this.updateFx(dt);
    this.aiT += dt;
    if (this.aiT > 1) { this.aiT = 0; this.runAI(); }
    this.checkEnd();
    this.ui.tick(this, dt);
  }

  moveUnit(u, tx, tz, dt, arrive = 0.6) {
    const dx = tx - u.x, dz = tz - u.z, d = Math.hypot(dx, dz);
    if (d < arrive) return true;
    let vx = dx / d, vz = dz / d;
    // separation
    for (const o of this.units) {
      if (o === u || !o.alive) continue;
      const ox = u.x - o.x, oz = u.z - o.z, od = Math.hypot(ox, oz);
      const min = u.r + o.r + 0.25;
      if (od < min && od > 0.001) { vx += (ox / od) * 1.2; vz += (oz / od) * 1.2; }
    }
    // building push-out
    for (const b of this.buildings) {
      if (!b.alive) continue;
      const ox = u.x - b.x, oz = u.z - b.z, od = Math.hypot(ox, oz);
      if (od < b.r + u.r && od > 0.001) { vx += (ox / od) * 2; vz += (oz / od) * 2; }
    }
    const vl = Math.hypot(vx, vz) || 1;
    const sp = u.speed * dt;
    u.x = clampB(u.x + (vx / vl) * sp);
    u.z = clampB(u.z + (vz / vl) * sp);
    u.y = groundHeight(u.x, u.z);
    u.mesh.rotation.y = Math.atan2(vx, vz);
    return false;
  }

  nextQueued(u) { u.order = u.queue.shift() || { t: 'idle' }; }

  updateUnits(dt) {
    for (const u of this.units) {
      if (!u.alive) continue;
      u.cd = Math.max(0, u.cd - dt);
      u.flash = Math.max(0, u.flash - dt);
      u.bob += dt * 6;
      const o = u.order;
      switch (o.t) {
        case 'idle': {
          if (u.type !== 'drudge' && !u.holdPos) {
            const foe = this.enemiesOf(u.owner, u.x, u.z, u.range + 2);
            if (foe) { this.face(u, foe); if (u.cd <= 0) this.fire(u, foe); }
          }
          break;
        }
        case 'move': {
          if (this.moveUnit(u, o.x, o.z, dt)) this.nextQueued(u);
          break;
        }
        case 'amove': {
          const foe = this.enemiesOf(u.owner, u.x, u.z, u.range + 1.5);
          if (foe) { this.face(u, foe); if (Math.hypot(foe.x - u.x, foe.z - u.z) - (foe.r || 0) <= u.range) { if (u.cd <= 0) this.fire(u, foe); } else this.moveUnit(u, foe.x, foe.z, dt); }
          else if (this.moveUnit(u, o.x, o.z, dt, 1.2)) this.nextQueued(u);
          break;
        }
        case 'attack': {
          const t = o.target;
          if (!t || !t.alive) { this.nextQueued(u); break; }
          const d = Math.hypot(t.x - u.x, t.z - u.z) - (t.r || 0);
          if (d <= u.range) { this.face(u, t); if (u.cd <= 0) this.fire(u, t); }
          else this.moveUnit(u, t.x, t.z, dt);
          break;
        }
        case 'harvest': {
          this.updateHarvest(u, dt);
          break;
        }
        case 'build': {
          const b = o.target;
          if (!b || !b.alive) { u.order = { t: 'idle' }; break; }
          if (b.done) { u.order = { t: 'idle' }; u.buildTarget = null; break; }
          const d = Math.hypot(b.x - u.x, b.z - u.z) - b.r;
          if (d > 2.5) this.moveUnit(u, b.x, b.z, dt);
          else { b.progress += dt / b.buildTime; if (b.progress >= 1) { b.done = true; b.hp = b.maxHp; sfx.ready(); if (b.owner === 'player') this.ui.announce(`${BUILDINGS[b.type].name} online.`); } }
          break;
        }
        case 'hold': {
          const foe = this.enemiesOf(u.owner, u.x, u.z, u.range);
          if (foe) { this.face(u, foe); if (u.cd <= 0) this.fire(u, foe); }
          break;
        }
      }
      // walk bob + mesh sync
      u.mesh.position.set(u.x, u.y + (u.order.t === 'move' || u.order.t === 'amove' ? Math.abs(Math.sin(u.bob)) * 0.08 : 0), u.z);
      this.syncBars(u);
    }
    // sweep dead
    for (let i = this.units.length - 1; i >= 0; i--) {
      if (!this.units[i].alive) {
        const u = this.units[i];
        this.scene.remove(u.mesh);
        this.ui.forget(u);
        this.units.splice(i, 1);
      }
    }
  }

  updateHarvest(u, dt) {
    // carrying → go deliver
    if (u.cargo > 0) {
      const drop = this.nearestDropoff(u.owner, u.x, u.z);
      if (!drop) { u.order = { t: 'idle' }; return; }
      const d = Math.hypot(drop.x - u.x, drop.z - u.z) - drop.r;
      if (d > 1.6) { this.moveUnit(u, drop.x, drop.z, dt); return; }
      const r = this.resOf(u.owner);
      if (u.cargoKind === 'flux') r.flux += u.cargo; else r.alloy += u.cargo;
      if (u.owner === 'player') this.stats.harvested += u.cargo;
      if (u.owner === 'player') sfx.harvest();
      u.cargo = 0; u.cargoKind = null;
    }
    let n = u.order.node;
    if (!n || n.depleted || n.amount <= 0) {
      n = this.nearestNode(u.owner, u.x, u.z, u.cargoKind);
      if (!n) n = this.nearestNode(u.owner, u.x, u.z);
      if (!n) { u.order = { t: 'idle' }; return; }
      u.order.node = n;
    }
    const d = Math.hypot(n.x - u.x, n.z - u.z);
    if (d > 2.2) { this.moveUnit(u, n.x, n.z, dt); return; }
    u.harvestT += dt;
    this.facePos(u, n.x, n.z);
    if (u.harvestT >= 1.6) {
      u.harvestT = 0;
      const take = Math.min(UNITS.drudge.harvest, n.amount);
      n.amount -= take;
      u.cargo = take; u.cargoKind = n.kind;
      if (n.amount <= 0) { n.depleted = true; n.mesh.visible = false; }
      else { const s = 0.4 + 0.6 * (n.amount / 1500); n.mesh.scale.set(s, s, s); }
    }
  }

  updateBuildings(dt) {
    for (const b of this.buildings) {
      if (!b.alive) continue;
      b.flash = Math.max(0, b.flash - dt);
      if (!b.done) { this.syncBars(b); continue; }
      // production
      if (b.queue.length) {
        const type = b.queue[0];
        b.prodT += dt / UNITS[type].buildTime;
        if (b.prodT >= 1) {
          b.prodT = 0; b.queue.shift();
          const a = 0.6;
          const u = this.addUnit(type, b.owner, b.x + (Math.random() - 0.5) * 4, b.z + b.r + 1.5);
          if (b.rally) u.order = { t: 'move', x: b.rally.x, z: b.rally.z };
          if (b.owner === 'player') { this.stats.trained++; sfx.ready(); this.ui.announce(`${UNITS[type].name} ready.`); }
        }
      }
      // static defense (turrets + HQ cannon)
      const atk = b.type === 'turret' ? BUILDINGS.turret.atk : b.type === 'core' ? BUILDINGS.core.atk : null;
      if (atk) {
        b.cd = Math.max(0, b.cd - dt);
        const foe = this.enemiesOf(b.owner, b.x, b.z, atk.range);
        if (foe && b.cd <= 0) {
          this.spawnTracer(b.x, b.y + 3, b.z, foe.x, (foe.y || 0) + 1, foe.z, b.owner === 'player' ? 0x7df9ff : 0xff8a5a);
          sfx.shoot();
          this.damage(foe, atk.dmg, b.owner);
          b.cd = atk.cooldown;
        }
      }
      this.syncBars(b);
    }
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      if (!this.buildings[i].alive) {
        const b = this.buildings[i];
        this.scene.remove(b.mesh);
        this.ui.forget(b);
        this.buildings.splice(i, 1);
      }
    }
  }

  face(u, t) { u.mesh.rotation.y = Math.atan2(t.x - u.x, t.z - u.z); }
  facePos(u, x, z) { u.mesh.rotation.y = Math.atan2(x - u.x, z - u.z); }

  syncBars(e) {
    const f = Math.max(0, e.hp / e.maxHp);
    const show = f < 1 || (e.kind === 'building' && !e.done);
    e.bars.bg.visible = show; e.bars.fg.visible = show;
    if (show) {
      e.bars.fg.scale.x = 2.4 * f;
      e.bars.fg.position.x = -1.2 * (1 - f);
      e.bars.fg.material.color.set(f > 0.6 ? 0x4ade80 : f > 0.3 ? 0xffc857 : 0xff5a4e);
    }
    if (e.flash > 0) {
      const k = Math.min(1, e.flash / 0.12);
      e.body.traverse(m => { if (m.isMesh && m.material.emissive) { m.material.emissive.setHex(0xffffff); m.material.emissiveIntensity = k * 0.9; } });
    } else {
      e.body.traverse(m => {
        if (m.isMesh && m.material.emissive && m.material.userData.baseEmissive !== undefined
          && m.material.emissive.getHex() !== m.material.userData.baseEmissive) {
          m.material.emissive.setHex(m.material.userData.baseEmissive);
          m.material.emissiveIntensity = m.material.userData.baseEmissiveI;
        }
      });
    }
    if (e.kind === 'building' && !e.done) {
      e.bars.bg.visible = true; e.bars.fg.visible = true;
      e.bars.fg.scale.x = 2.4 * e.progress;
      e.bars.fg.position.x = -1.2 * (1 - e.progress);
      e.bars.fg.material.color.set(0x41b6ff);
    }
  }

  updateFx(dt) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.t -= dt; s.line.material.opacity = Math.max(0, s.t / 0.14);
      if (s.t <= 0) { this.scene.remove(s.line); s.line.geometry.dispose(); s.line.material.dispose(); this.shots.splice(i, 1); }
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t -= dt;
      p.m.scale.addScalar(p.size * dt * 6);
      p.m.material.opacity = Math.max(0, p.t / 0.5);
      if (p.t <= 0) { this.scene.remove(p.m); p.m.geometry.dispose(); p.m.material.dispose(); this.parts.splice(i, 1); }
    }
  }

  // ---- AI -----------------------------------------------------------------------
  aiUnits(type) { return this.units.filter(u => u.owner === 'enemy' && u.alive && u.type === type); }
  aiBuildings(type) { return this.buildings.filter(b => b.owner === 'enemy' && b.alive && b.type === type); }

  runAI() {
    if (this.over || this.aiOff) return;
    const R = this.res.enemy;
    R.flux += 8; R.alloy += 3; // modest AI trickle so it pressures even if harassed
    const workers = this.aiUnits('drudge');
    const army = this.units.filter(u => u.owner === 'enemy' && u.alive && u.type !== 'drudge');
    const sup = this.supply('enemy');

    // harvest with idle workers
    for (const w of workers) {
      if (w.order.t === 'idle' && w.cargo === 0) {
        const n = this.nearestNode('enemy', w.x, w.z);
        if (n) w.order = { t: 'harvest', node: n };
      }
      if (w.order.t === 'build' && w.order.target && w.order.target.done) w.order = { t: 'idle' };
    }

    const core = this.aiBuildings('core')[0];
    const foundries = this.aiBuildings('foundry').filter(b => b.done);
    const busyBuilders = workers.filter(w => w.order.t === 'build').length;

    const tryBuild = (type, bx, bz) => {
      const cost = BUILDINGS[type].cost;
      if (R.flux < cost.flux || R.alloy < cost.alloy) return false;
      const idle = workers.find(w => w.order.t !== 'build' && w.cargo === 0);
      if (!idle) return false;
      // find free spot near base
      for (let r = 0; r < 12; r++) {
        const x = bx + (Math.random() - 0.5) * 16, z = bz + (Math.random() - 0.5) * 16;
        if (!this.canPlace(type, x, z)) continue;
        R.flux -= cost.flux; R.alloy -= cost.alloy;
        const b = this.addBuilding(type, 'enemy', x, z);
        idle.order = { t: 'build', target: b }; idle.queue.length = 0; idle.buildTarget = b;
        return true;
      }
      return false;
    };

    const ebx = START.enemyBase?.x ?? 30, ebz = START.enemyBase?.z ?? -30;
    // supply
    if (sup.used + 4 > sup.cap && busyBuilders < 2) tryBuild('pylon', ebx, ebz);
    // workers
    if (core && core.done && workers.length < 11 && core.queue.length < 2) {
      const s = UNITS.drudge;
      if (R.flux >= s.cost.flux && sup.used + 1 <= sup.cap) { R.flux -= s.cost.flux; core.queue.push('drudge'); }
    }
    // foundry
    if (workers.length >= 6 && foundries.length + this.aiBuildings('foundry').length < 2 && busyBuilders < 2)
      tryBuild('foundry', ebx, ebz);
    // turret if rich
    if (this.time > 300 && R.flux > 500 && this.aiBuildings('turret').length < 2 && busyBuilders < 1)
      tryBuild('turret', ebx, ebz);

    // train army
    for (const f of foundries) {
      if (f.queue.length >= 2) continue;
      const want = army.length % 3 === 2 ? 'bulwark' : 'lancer';
      const s = UNITS[want];
      if (R.flux >= s.cost.flux && R.alloy >= s.cost.alloy && sup.used + s.supply <= sup.cap) {
        R.flux -= s.cost.flux; R.alloy -= s.cost.alloy; f.queue.push(want);
      }
    }

    // attack waves: first probe after ~3.5 min, escalating; send half, keep defenders
    this.wave = Math.floor(Math.max(0, this.time - 210) / 75);
    const threshold = 7 + this.wave * 2;
    if (army.length >= threshold && this.time > 210) {
      const idle = army.filter(u => u.order.t === 'idle' || u.order.t === 'move');
      const send = idle.slice(0, Math.max(3, Math.min(6 + this.wave, Math.ceil(idle.length / 2))));
      if (send.length >= 3) {
        const wg = send;
        const target = this.playerCore && this.playerCore.alive ? this.playerCore
          : this.buildings.find(b => b.owner === 'player' && b.alive);
        const px = target ? target.x : -30, pz = target ? target.z : 30;
        for (const u of wg) { u.order = { t: 'amove', x: px + (Math.random() - 0.5) * 6, z: pz + (Math.random() - 0.5) * 6 }; u.queue.length = 0; }
        this.lastAlert = { x: px, z: pz };
        if (this.ui.isPlayer('player')) this.ui.announce('⚠️ Crimson Swarm inbound — defend your base!');
      }
    }
  }

  checkEnd() {
    if (this.over) return;
    const pCore = this.buildings.some(b => b.owner === 'player' && b.alive && b.type === 'core');
    const eCore = this.buildings.some(b => b.owner === 'enemy' && b.alive && b.type === 'core');
    if (!eCore) return this.finish(true);
    if (!pCore) return this.finish(false);
  }

  finish(win) {
    this.over = win ? 'win' : 'lose';
    if (win) sfx.win(); else sfx.lose();
    this.ui.showEnd(win, this);
  }

  // test hooks
  debug() {
    return {
      time: this.time, over: this.over,
      player: { ...this.res.player, sup: this.supply('player'), units: this.units.filter(u => u.owner === 'player').length, buildings: this.buildings.filter(b => b.owner === 'player').length },
      enemy: { ...this.res.enemy, sup: this.supply('enemy'), units: this.units.filter(u => u.owner === 'enemy').length, buildings: this.buildings.filter(b => b.owner === 'enemy').length },
      stats: this.stats,
    };
  }
}
