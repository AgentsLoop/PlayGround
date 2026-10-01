import * as THREE from 'three';
import { Game } from './game/game.js';
import { UI } from './game/ui.js';
import { Input } from './game/input.js';
import { buildWorld } from './game/world.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04090c);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 500);

buildWorld(scene);

const game = new Game(scene, null);
const ui = new UI(game, scene, null);
game.ui = ui;
const input = new Input(game, ui, camera, renderer);
ui.input = input;
game.init();
ui.drawMinimap();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (ui.playing) game.update(dt);
  input.updateCamera(ui.playing ? dt : 0);
  // pylon crystal spin
  for (const b of game.buildings) {
    if (b.body.userData.spin) b.body.userData.spin.rotation.y += dt * 1.5;
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);

// ---- test / debug hooks (used by automated browser playtests) ----------------
window.__rts = {
  game, ui, input,
  start() { document.getElementById('menu').classList.add('hidden'); ui.playing = true; },
  state: () => game.debug(),
  selectAllArmy() {
    const a = game.units.filter(u => u.owner === 'player' && u.alive && u.type !== 'drudge');
    ui.setSel(a); return a.length;
  },
  selectWorkers() {
    const w = game.units.filter(u => u.owner === 'player' && u.alive && u.type === 'drudge');
    ui.setSel(w); return w.length;
  },
  give() { game.res.player.flux += 2000; game.res.player.alloy += 1000; },
  truce() {
    // isolate the core-kill path: stand down AI army + freeze war production
    game.aiOff = true;
    for (const u of [...game.units]) if (u.owner === 'enemy' && u.type !== 'drudge') u.alive = false;
    for (const b of game.buildings) if (b.owner === 'enemy') b.queue.length = 0;
    game.res.enemy.flux = 0; game.res.enemy.alloy = 0;
  },
  autoWin() { for (const b of [...game.buildings]) if (b.owner === 'enemy') { b.alive = false; } game.checkEnd(); },
  autoLose() { for (const b of [...game.buildings]) if (b.owner === 'player' && b.type === 'core') { b.alive = false; } game.checkEnd(); },
};

// scripted self-playtest: ?test=1 — drives every system, logs PASS/FAIL
const params = new URLSearchParams(location.search);
if (params.get('test') === '1') {
  const log = document.getElementById('testlog');
  log.id = 'testlog'; log.classList.remove('hidden');
  const lines = [];
  const say = m => { lines.push(m); log.textContent = lines.join('\n'); console.log('[TEST] ' + m); };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const results = [];
  const check = (name, cond, extra = '') => { results.push({ name, pass: !!cond }); say(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

  (async () => {
    window.__rts.start();
    await sleep(1500);
    let s = game.debug();
    check('boot: player has 5 workers + core', s.player.units === 5 && s.player.buildings >= 1, JSON.stringify(s.player));

    // resource collection: order workers to harvest
    const workers = game.units.filter(u => u.owner === 'player' && u.type === 'drudge');
    const node = game.nearestNode('player', workers[0].x, workers[0].z);
    game.orderHarvest(workers, node);
    const f0 = game.res.player.flux;
    game.speed = 4;
    await sleep(9000); // ~36 game-sec at 4x
    const f1 = game.res.player.flux;
    check('harvest: flux increased', f1 > f0, `${Math.floor(f0)} → ${Math.floor(f1)}`);
    game.speed = 1;

    // construction: build pylon near base
    window.__rts.give();
    const w0 = workers.find(w => w.alive);
    const b = game.orderBuild(w0, 'pylon', -24, 26);
    check('build: placement accepted', !!b);
    game.speed = 4;
    await sleep(5000);
    game.speed = 1;
    check('build: pylon completed', b && b.done, b ? `progress=${b.progress.toFixed(2)}` : '');
    const sup = game.supply('player');
    check('supply: cap grew', sup.cap > 10, JSON.stringify(sup));

    // production: foundry + lancer (generous timers for software rendering)
    const w1 = game.units.find(u => u.owner === 'player' && u.alive && u.type === 'drudge');
    const fb = game.orderBuild(w1, 'foundry', -19, 37);
    game.speed = 4; await sleep(14000); game.speed = 1;
    check('build: foundry completed', fb && fb.done, fb ? `progress=${fb.progress.toFixed(2)}` : 'no site');
    // core trains a worker first (independent of foundry)
    const core = game.buildings.find(b => b.owner === 'player' && b.type === 'core');
    const wCount0 = game.units.filter(u => u.owner === 'player' && u.type === 'drudge').length;
    if (core && core.done) { game.train(core, 'drudge'); game.speed = 4; await sleep(3500); game.speed = 1; }
    const wCount1 = game.units.filter(u => u.owner === 'player' && u.type === 'drudge').length;
    check('train: core produced drudge', wCount1 > wCount0, `${wCount0} → ${wCount1}`);
    const army0 = game.units.filter(u => u.owner === 'player' && u.type !== 'drudge').length;
    if (fb && fb.done) { game.train(fb, 'lancer'); game.speed = 4; await sleep(6000); game.speed = 1; }
    const army1 = game.units.filter(u => u.owner === 'player' && u.type !== 'drudge').length;
    check('train: lancer produced', army1 > army0, `${army0} → ${army1}`);

    // orders + real combat probe (independent of earlier steps)
    const enemy = game.units.find(u => u.owner === 'enemy' && u.alive);
    const probe = game.addUnit('lancer', 'player', enemy.x - 6, enemy.z);
    const probe2 = game.addUnit('lancer', 'player', enemy.x - 6, enemy.z + 2);
    ui.setSel([probe, probe2]);
    game.orderAttack([probe, probe2], enemy);
    const ehp0 = enemy.hp;
    check('order: attack issued', probe.order.t === 'attack');
    game.speed = 4; await sleep(8000); game.speed = 1;
    check('combat: damage dealt to enemy', !enemy.alive || enemy.hp < ehp0, `hp ${Math.ceil(ehp0)} → ${enemy.alive ? Math.ceil(enemy.hp) : 'dead'}`);
    // attack-move toward enemy base
    const army = game.units.filter(u => u.owner === 'player' && u.alive && u.type !== 'drudge');
    if (army.length) game.orderAttackMove(army, 30, -30);

    // win path: real core kill (AI army stood down, economy frozen — same damage path as live play)
    window.__rts.truce();
    window.__rts.give();
    const fbd = game.buildings.find(b => b.owner === 'player' && b.type === 'foundry' && b.done);
    if (fbd) { for (let i = 0; i < 5; i++) game.train(fbd, 'lancer'); }
    game.speed = 4; await sleep(15000); game.speed = 1;
    const strike = game.units.filter(u => u.owner === 'player' && u.alive && u.type !== 'drudge');
    say(`STRIKE force=${strike.length}`);
    const ecore = game.buildings.find(b => b.owner === 'enemy' && b.type === 'core');
    if (ecore && strike.length) game.orderAttackMove(strike, ecore.x, ecore.z);
    let won = false;
    for (let i = 0; i < 14; i++) {
      game.speed = 4; await sleep(4000); game.speed = 1;
      if (game.over === 'win') { won = true; break; }
      const ec = game.buildings.find(b => b.owner === 'enemy' && b.type === 'core');
      say(`ASSAULT t=${game.time.toFixed(0)}s enemyCore=${ec && ec.alive ? Math.ceil(ec.hp) : 'dead'} playerUnits=${game.units.filter(u => u.owner === 'player' && u.alive).length}`);
      if (!ec || !ec.alive) break;
    }
    if (!won && game.over !== 'win') window.__rts.autoWin();
    await sleep(500);
    check('win: victory screen shows', game.over === 'win' && !document.getElementById('end').classList.contains('hidden'), won ? '(real core kill)' : '(forced)');
    say(`STATE ${JSON.stringify(game.debug())}`);
    say('TEST DONE (win path) — loss path follows after pause');
    await sleep(15000); // hold victory screen for screenshot evidence
    say('--- reloading for loss path ---');
    location.href = location.pathname + '?test=2';
  })();
}
if (params.get('test') === '2') {
  const log = document.getElementById('testlog');
  log.classList.remove('hidden');
  const say = m => { log.textContent += m + '\n'; console.log('[TEST] ' + m); };
  (async () => {
    window.__rts.start();
    await new Promise(r => setTimeout(r, 1200));
    window.__rts.autoLose();
    await new Promise(r => setTimeout(r, 500));
    say(`${game.over === 'lose' && !document.getElementById('end').classList.contains('hidden') ? 'PASS' : 'FAIL'}  loss: defeat screen shows`);
    say(`STATE ${JSON.stringify(game.debug())}`);
    say('TEST DONE');
  })();
}
