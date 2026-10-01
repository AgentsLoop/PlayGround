import * as THREE from 'three';
import { UNITS, BUILDINGS, MAP_SIZE } from './config.js';
import { sfx } from './audio.js';

const $ = id => document.getElementById(id);

export class UI {
  constructor(game, scene, input) {
    this.game = game; this.scene = scene; this.input = input;
    this.sel = [];
    this.playing = false;
    this.buildMenu = false;
    this.cmdDirty = true;
    this.selKey = '';
    this.mm = $('minimap').getContext('2d');
    this.pings = [];
    this.rallyMarks = new Map(); // buildingId -> marker group
    this.mmT = 0;
    this.bindStatic();
  }

  bindStatic() {
    $('btnStart').onclick = () => { $('menu').classList.add('hidden'); this.playing = true; sfx.ready(); };
    $('btnAgain').onclick = () => location.reload();
    $('btnRestart').onclick = () => location.reload();
    $('btnHelp').onclick = () => $('help').classList.remove('hidden');
    $('btnCloseHelp').onclick = () => $('help').classList.add('hidden');
    $('btnMute').onclick = e => { e.target.textContent = sfx.toggleMute() ? '🔇' : '🔊'; };
    $('btnPause').onclick = () => this.togglePause();
    $('btnSpeed').onclick = e => {
      this.game.speed = this.game.speed === 1 ? 2 : this.game.speed === 2 ? 4 : 1;
      e.target.textContent = this.game.speed + '×';
    };
    $('idleBox').onclick = () => {
      const idle = this.game.units.find(u => u.owner === 'player' && u.alive && u.type === 'drudge' && u.order.t === 'idle' && u.cargo === 0);
      if (idle) { this.setSel([idle]); this.input.cam.x = idle.x; this.input.cam.z = idle.z; }
    };
    // minimap: left = jump camera, right = order
    const mm = $('minimap');
    const toWorld = e => {
      const r = mm.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
      return { x: (fx - 0.5) * MAP_SIZE, z: (fy - 0.5) * (MAP_SIZE * mm.height / mm.width) };
    };
    mm.addEventListener('mousedown', e => {
      const w = toWorld(e);
      if (e.button === 2) {
        const units = this.sel.filter(s => s.kind === 'unit' && s.alive);
        if (units.length) this.game.orderMove(units, w.x, w.z, false);
      } else { this.input.cam.x = w.x; this.input.cam.z = w.z; }
      e.preventDefault();
    });
    mm.addEventListener('contextmenu', e => e.preventDefault());
  }

  isPlayer() { return true; }
  announce(msg) {
    const d = document.createElement('div');
    d.textContent = msg;
    $('announce').appendChild(d);
    setTimeout(() => d.remove(), 4200);
    while ($('announce').children.length > 3) $('announce').firstChild.remove();
  }
  error(msg) {
    $('errbar').textContent = msg;
    clearTimeout(this._errT);
    this._errT = setTimeout(() => $('errbar').textContent = '', 2200);
  }
  hint(msg) { $('hint').textContent = msg || 'Left-drag: select  •  Right-click: order  •  A attack-move  •  B build  •  arrows/edge: camera'; }

  setSel(list, unitsOnly = false) {
    for (const s of this.sel) if (s.selRing) s.selRing.visible = false;
    this.sel = [...new Set(list.filter(e => e && e.alive))];
    // single-type focus for large groups like SC2: keep all, portraits show all
    for (const s of this.sel) if (s.selRing) { s.selRing.visible = true; s.selRing.material.color.set(s.owner === 'player' ? 0x35e0d2 : 0xff5a4e); }
    this.cmdDirty = true;
  }
  clearSel() { this.setSel([]); }
  toggleSel(ent) {
    if (this.sel.includes(ent)) this.setSel(this.sel.filter(s => s !== ent));
    else this.setSel([...this.sel, ent]);
  }
  forget(ent) { this.sel = this.sel.filter(s => s !== ent); this.cmdDirty = true; }

  togglePause() {
    this.game.paused = !this.game.paused;
    $('btnPause').textContent = this.game.paused ? '▶' : '❚❚';
    this.announce(this.game.paused ? 'Paused.' : 'Resumed.');
  }
  toggleBuildMenu() {
    const hasWorker = this.sel.some(s => s.kind === 'unit' && s.type === 'drudge' && s.owner === 'player');
    if (!hasWorker) { this.error('Select a Drudge worker first'); sfx.error(); return; }
    this.buildMenu = !this.buildMenu; this.cmdDirty = true;
  }

  hotkey(k) {
    if (k === 'r' && this.buildMenu) return this.startBuild('core');
    if (this.buildMenu) {
      if (k === 'q') this.startBuild('pylon');
      if (k === 'w') this.startBuild('foundry');
      if (k === 'e') this.startBuild('turret');
      return;
    }
    const b = this.sel.length === 1 && this.sel[0].kind === 'building' ? this.sel[0] : null;
    if (!b || b.owner !== 'player' || !b.done) return;
    const trains = BUILDINGS[b.type].trains || [];
    const idx = { q: 0, w: 1, e: 2 }[k];
    if (idx !== undefined && trains[idx]) this.game.train(b, trains[idx]);
  }

  startBuild(type) {
    const ghost = new THREE.Mesh(
      new THREE.BoxGeometry(BUILDINGS[type].size, 1.5, BUILDINGS[type].size),
      new THREE.MeshBasicMaterial({ color: 0x35e0d2, transparent: true, opacity: 0.4, depthWrite: false }));
    this.scene.add(ghost);
    this.input.startPlace(type, ghost);
    this.buildMenu = false; this.cmdDirty = true;
  }

  drawDrag(d) {
    const el = $('dragbox');
    if (!d || !d.moved) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.style.left = Math.min(d.x0, d.x1) + 'px';
    el.style.top = Math.min(d.y0, d.y1) + 'px';
    el.style.width = Math.abs(d.x1 - d.x0) + 'px';
    el.style.height = Math.abs(d.y1 - d.y0) + 'px';
  }

  ping(x, z, color) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.8, 20),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 2, z);
    this.scene.add(m);
    this.pings.push({ m, t: 0.6 });
  }

  // ---- command card ------------------------------------------------------------
  renderCmd() {
    const panel = $('cmdPanel');
    panel.innerHTML = '';
    const btn = (icon, label, hk, cost, fn, dis, title) => {
      const b = document.createElement('button');
      b.className = 'cmd';
      b.innerHTML = `<span class="big">${icon}</span><span>${label}</span>${cost ? `<span class="cost">${cost}</span>` : ''}${hk ? `<span class="hk">${hk}</span>` : ''}`;
      if (hk) b.title = `${label} (${hk})${title ? ' — ' + title : ''}`;
      else if (title) b.title = title;
      b.disabled = !!dis;
      b.onclick = e => { e.stopPropagation(); fn(); };
      panel.appendChild(b);
      return b;
    };
    const sel = this.sel.filter(s => s.alive);
    const mine = sel.filter(s => s.owner === 'player');
    if (!sel.length) {
      panel.innerHTML = '<div style="grid-column:1/4;color:var(--dim);font-size:12px;padding:8px">Select units (left-drag) or buildings (click).<br><br>Build order: Core→<b>Q</b> Drudge → <b>B</b> Pylon/Foundry → train army → <b>A</b>-click enemy.</div>';
      return;
    }
    if (this.buildMenu) {
      btn('🗼', 'Pylon', 'Q', '100f', () => this.startBuild('pylon'), false, '+8 supply');
      btn('🏭', 'Foundry', 'W', '250f', () => this.startBuild('foundry'), false, 'Trains army');
      btn('🔥', 'Turret', 'E', '200f+50a', () => this.startBuild('turret'), false, 'Defense');
      btn('🏠', 'Core', 'R', '400f', () => this.startBuild('core'), false, 'Expand');
      btn('✖', 'Cancel', 'ESC', '', () => { this.buildMenu = false; this.cmdDirty = true; });
      return;
    }
    const b = sel.length === 1 && sel[0].kind === 'building' ? sel[0] : null;
    if (b && b.owner === 'player') {
      const def = BUILDINGS[b.type];
      if (!b.done) {
        panel.innerHTML = `<div style="grid-column:1/4;color:var(--dim);font-size:12px">Constructing… ${Math.floor(b.progress * 100)}%</div>`;
        return;
      }
      for (const t of (def.trains || [])) {
        const u = UNITS[t];
        const r = this.game.res.player, sup = this.game.supply('player');
        const dis = r.flux < u.cost.flux || r.alloy < u.cost.alloy || sup.used + u.supply > sup.cap;
        btn(u.icon, u.name, t === 'drudge' ? 'Q' : t === 'lancer' ? 'Q' : 'W', `${u.cost.flux}f${u.cost.alloy ? '+' + u.cost.alloy + 'a' : ''}`,
          () => this.game.train(b, t), dis, u.desc);
      }
      if (b.queue.length) {
        const q = document.createElement('div');
        q.style.cssText = 'grid-column:1/4;font-size:11px;color:var(--dim)';
        q.textContent = 'Queue: ' + b.queue.map(t => UNITS[t].name).join(', ') + (b.prodT ? ` (${Math.floor(b.prodT * 100)}%)` : '');
        panel.appendChild(q);
      }
      const r = document.createElement('div');
      r.style.cssText = 'grid-column:1/4;font-size:11px;color:var(--teal)';
      r.textContent = b.rally ? '◆ Rally point set (right-click map to move it)' : 'Right-click map to set rally point.';
      panel.appendChild(r);
      return;
    }
    if (mine.some(s => s.kind === 'unit' && s.type === 'drudge')) {
      btn('🏗️', 'Build', 'B', '', () => this.toggleBuildMenu(), false, 'Pylon / Foundry / Turret');
    }
    const army = mine.filter(s => s.kind === 'unit' && s.type !== 'drudge');
    if (army.length || mine.length) {
      btn('⚔️', 'Attack', 'A', '', () => { this.input.attackMode = true; this.hint('ATTACK-MOVE: left-click a target location'); }, !army.length, 'Attack-move (engages en route)');
      btn('⏹️', 'Stop', 'S', '', () => this.game.orderStop(mine));
      btn('🛑', 'Hold', 'H', '', () => this.game.orderHold(mine), false, 'Hold position, engage in range');
    }
    if (!sel.some(s => s.owner === 'player')) {
      const e0 = sel[0];
      panel.innerHTML = `<div style="grid-column:1/4;font-size:12px;color:#ffb4ab">Enemy ${e0.kind === 'unit' ? UNITS[e0.type].name : BUILDINGS[e0.type].name} — HP ${Math.ceil(e0.hp)}/${e0.maxHp}<br>Right-click it with your army to attack.</div>`;
    }
  }

  renderSel() {
    const sel = this.sel.filter(s => s.alive);
    const grid = $('selGrid');
    grid.innerHTML = '';
    if (!sel.length) { $('selTitle').textContent = 'NO SELECTION'; $('selInfo').textContent = ''; return; }
    const counts = {};
    for (const s of sel) {
      const n = s.kind === 'unit' ? UNITS[s.type].name : BUILDINGS[s.type].name;
      counts[n] = (counts[n] || 0) + 1;
    }
    $('selTitle').textContent = Object.entries(counts).map(([n, c]) => `${c}× ${n.toUpperCase()}`).join('  •  ');
    const show = sel.slice(0, 24);
    for (const s of show) {
      const d = document.createElement('div');
      d.className = 'portrait sel';
      const icon = s.kind === 'unit' ? UNITS[s.type].icon : BUILDINGS[s.type].icon;
      const hp = Math.max(0, s.hp / s.maxHp * 100);
      d.innerHTML = `<div class="face">${icon}</div><div class="hpbar"><i style="width:${hp}%;background:${hp > 60 ? '#4ade80' : hp > 30 ? '#ffc857' : '#ff5a4e'}"></i></div><div>${s.kind === 'unit' ? UNITS[s.type].name : BUILDINGS[s.type].name}</div>`;
      d.onclick = () => this.setSel([s]);
      d.ondblclick = () => {
        if (s.kind === 'unit') this.setSel(this.game.units.filter(u => u.alive && u.owner === s.owner && u.type === s.type));
      };
      grid.appendChild(d);
    }
    const s0 = sel[0];
    $('selInfo').textContent = s0.kind === 'unit'
      ? `${UNITS[s0.type].desc} HP ${Math.ceil(s0.hp)}/${s0.maxHp} · order: ${s0.order.t}${s0.cargo ? ` · carrying ${s0.cargo} ${s0.cargoKind}` : ''}`
      : `${BUILDINGS[s0.type].desc} HP ${Math.ceil(s0.hp)}/${s0.maxHp}${s0.done ? '' : ` · under construction ${Math.floor(s0.progress * 100)}%`}`;
  }

  drawMinimap() {
    const g = this.mm, W = 196, H = 150;
    g.fillStyle = '#061014'; g.fillRect(0, 0, W, H);
    const sx = x => (x / MAP_SIZE + 0.5) * W;
    const sz = z => (z / MAP_SIZE + 0.5) * H;
    // nodes (small, dim — never compete with units)
    for (const n of this.game.nodes) {
      if (n.depleted) continue;
      g.fillStyle = n.kind === 'flux' ? 'rgba(65,182,255,.75)' : 'rgba(255,155,61,.75)';
      g.fillRect(sx(n.x) - 1, sz(n.z) - 1, 2, 2);
    }
    for (const b of this.game.buildings) {
      if (!b.alive) continue;
      g.fillStyle = b.owner === 'player' ? '#35e0d2' : '#ff2213';
      const s = b.type === 'core' ? 7 : 5;
      g.fillRect(sx(b.x) - s / 2, sz(b.z) - s / 2, s, s);
    }
    for (const u of this.game.units) {
      if (!u.alive) continue;
      if (u.owner === 'player') { g.fillStyle = '#aafff5'; g.fillRect(sx(u.x) - 1, sz(u.z) - 1, 3, 3); }
      else { g.fillStyle = '#ff2213'; g.fillRect(sx(u.x) - 1.5, sz(u.z) - 1.5, 4, 4); }
    }
    // camera rect
    const c = this.input.cam;
    g.strokeStyle = '#ffffff'; g.lineWidth = 1;
    const vw = 36 / MAP_SIZE * W, vh = 26 / MAP_SIZE * H;
    g.strokeRect(sx(c.x) - vw / 2, sz(c.z) - vh / 2, vw, vh);
  }

  syncRally(game) {
    const seen = new Set();
    for (const b of game.buildings) {
      if (!b.alive || b.owner !== 'player' || !b.rally) continue;
      seen.add(b.id);
      let mk = this.rallyMarks.get(b.id);
      if (!mk) {
        mk = new THREE.Group();
        const flag = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0),
          new THREE.MeshBasicMaterial({ color: 0x35e0d2 }));
        flag.position.y = 2.2; mk.add(flag);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 5),
          new THREE.MeshBasicMaterial({ color: 0x35e0d2 }));
        pole.position.y = 1.1; mk.add(pole);
        this.scene.add(mk);
        this.rallyMarks.set(b.id, mk);
      }
      mk.position.set(b.rally.x, 0.2, b.rally.z);
      mk.children[0].rotation.y += 0.05;
    }
    for (const [id, mk] of this.rallyMarks) {
      if (!seen.has(id)) { this.scene.remove(mk); this.rallyMarks.delete(id); }
    }
  }

  showEnd(win, game) {
    $('end').classList.remove('hidden');
    const t = $('endTitle');
    t.textContent = win ? '★ VICTORY ★' : 'DEFEAT';
    t.className = win ? 'win' : 'lose';
    const mm = Math.floor(game.time / 60), ss = Math.floor(game.time % 60).toString().padStart(2, '0');
    $('endSub').textContent = win ? 'Enemy Command Core destroyed. The sector is yours.' : 'Your Command Core has fallen.';
    $('endStats').innerHTML = `⏱️ Time: <b>${mm}:${ss}</b> &nbsp; ⚔️ Kills: <b>${game.stats.kills}</b> &nbsp; ⛏️ Harvested: <b>${game.stats.harvested}</b> &nbsp; 🏭 Built: <b>${game.stats.built}</b> &nbsp; 🪖 Trained: <b>${game.stats.trained}</b>`;
  }

  tick(game, dt) {
    this.syncRally(game);    $('rFlux').textContent = Math.floor(game.res.player.flux);
    $('rAlloy').textContent = Math.floor(game.res.player.alloy);
    const sup = game.supply('player');
    $('rSup').textContent = `${sup.used}/${sup.cap}`;
    $('rSup').style.color = sup.used >= sup.cap ? '#ff8a7a' : '';
    const idle = game.units.filter(u => u.owner === 'player' && u.alive && u.type === 'drudge' && u.order.t === 'idle' && u.cargo === 0).length;
    $('rIdle').textContent = idle;
    const mm = Math.floor(game.time / 60), ss = Math.floor(game.time % 60).toString().padStart(2, '0');
    $('clock').textContent = `${mm.toString().padStart(2, '0')}:${ss}`;
    // APM (last 60s)
    const cut = game.time - 60;
    while (game.apmTimes.length && game.apmTimes[0] < cut) game.apmTimes.shift();
    $('apm').textContent = `${game.apmTimes.length} APM`;
    if (this.cmdDirty) { this.cmdDirty = false; this.renderCmd(); this.renderSel(); }
    else if ((this._selT = (this._selT || 0) + dt) > 0.5) { this._selT = 0; this.renderSel(); if (this.sel.some(s => s.kind === 'building')) this.renderCmd(); }
    this.mmT += dt;
    if (this.mmT > 0.25) { this.mmT = 0; this.drawMinimap(); }
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const p = this.pings[i];
      p.t -= dt * game.speed;
      p.m.scale.addScalar(dt * 20);
      p.m.material.opacity = Math.max(0, p.t);
      if (p.t <= 0) { this.scene.remove(p.m); p.m.geometry.dispose(); p.m.material.dispose(); this.pings.splice(i, 1); }
    }
  }
}
