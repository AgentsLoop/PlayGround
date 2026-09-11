(() => {
"use strict";
/* Neon Orchard Courier — single-file canvas game, no dependencies. */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const ovTitle = document.getElementById("ov-title");
const ovSub = document.getElementById("ov-sub");
const ovBody = document.getElementById("ov-body");
const ovBtn = document.getElementById("ov-btn");
const toastBox = document.getElementById("toast");
const elTime = document.getElementById("hud-time");
const elParcels = document.getElementById("hud-parcels");
const elCarry = document.getElementById("hud-carry");
const elHearts = document.getElementById("hud-hearts");
const elScore = document.getElementById("hud-score");
const elFps = document.getElementById("fps");
const btnMute = document.getElementById("btn-mute");
const btnPause = document.getElementById("btn-pause");
const btnRestart = document.getElementById("btn-restart");

const TOTAL_PARCELS = 3;
const ROUND_TIME = 90;
const MAX_HP = 3;
const FIREFLY_COUNT = 6;

let W = 800, H = 500, DPR = 1;
function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = Math.max(320, r.width); H = Math.max(320, r.height);
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  layoutStatic();
}
window.addEventListener("resize", resize);

// ---------- audio (tiny synth, no assets) ----------
let audioCtx = null, muted = false;
function beep(freq, dur = 0.12, type = "sine", vol = 0.16, slide = 0) {
  if (muted) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, audioCtx.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), audioCtx.currentTime + dur);
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch (_) { /* audio unavailable — game still works */ }
}
const sfx = {
  pickup: () => { beep(660, .1, "square", .1); setTimeout(() => beep(990, .12, "square", .1), 70); },
  deliver: () => { beep(523, .1, "triangle", .16); setTimeout(() => beep(659, .1, "triangle", .16), 90); setTimeout(() => beep(784, .18, "triangle", .16), 180); },
  hit: () => beep(160, .25, "sawtooth", .18, -90),
  win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, .2, "triangle", .16), i * 130)),
  lose: () => [400, 300, 220, 150].forEach((f, i) => setTimeout(() => beep(f, .22, "sawtooth", .12), i * 150)),
  tick: () => beep(880, .05, "square", .05),
};

// ---------- state ----------
let state = "title"; // title | playing | paused | won | lost
let drone, parcels, fireflies, trees, motes, trail, pad;
let delivered = 0, collected = 0, carrying = false, hp = MAX_HP, score = 0;
let timeLeft = ROUND_TIME, elapsed = 0, invuln = 0, flash = 0, lastTickSecond = -1, carryWarnCd = 0;

function rand(a, b) { return a + Math.random() * (b - a); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function layoutStatic() {
  // drop pad scales with viewport; entities re-clamped on resize
  pad = pad || {};
  pad.w = clamp(W * 0.16, 110, 170); pad.h = 54;
  pad.x = W / 2 - pad.w / 2; pad.y = H - pad.h - 14;
  if (drone) { drone.x = clamp(drone.x, 20, W - 20); drone.y = clamp(drone.y, 20, H - 20); }
  if (parcels) for (const p of parcels) { p.x = clamp(p.x, 24, W - 24); p.y = clamp(p.y, 24, Math.max(30, H - 130)); }
  if (fireflies) for (const f of fireflies) { f.x = clamp(f.x, 10, W - 10); f.y = clamp(f.y, 10, Math.max(20, H - 100)); }
  if (!drone) buildOrchard();
  else if (trees && trees.length) for (const tr of trees) { tr.x = clamp(tr.x, 10, W - 10); tr.y = clamp(tr.y, 10, Math.max(20, H - 100)); }
}

function buildOrchard() {
  trees = [];
  const cols = Math.max(4, Math.round(W / 150)), rows = Math.max(3, Math.round(H / 150));
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    // keep the pad lane + spawn area breathable
    const x = (i + 0.5) / cols * W + rand(-18, 18);
    const y = (j + 0.5) / rows * (H - 120) + 30 + rand(-12, 12);
    if (Math.hypot(x - W / 2, y - (H - 60)) < 110) continue;
    trees.push({ x, y, r: rand(16, 30), ph: rand(0, Math.PI * 2), hue: Math.random() < 0.7 ? "green" : "teal" });
  }
  motes = Array.from({ length: 40 }, () => ({ x: rand(0, W), y: rand(0, H), s: rand(0.4, 1.6), v: rand(4, 14), ph: rand(0, 6) }));
}

function spawnParcels() {
  parcels = [];
  const spots = [
    { x: W * 0.14, y: H * 0.2 }, { x: W * 0.86, y: H * 0.2 },
    { x: W * 0.12, y: H * 0.55 }, { x: W * 0.88, y: H * 0.55 },
    { x: W * 0.5, y: H * 0.16 }, { x: W * 0.3, y: H * 0.42 },
  ].filter(p => Math.hypot(p.x - W / 2, p.y - (H - 60)) > 120);
  for (let i = 0; i < TOTAL_PARCELS; i++) {
    const s = spots.splice(Math.floor(Math.random() * spots.length), 1)[0] || { x: rand(60, W - 60), y: rand(60, H - 160) };
    parcels.push({ x: s.x + rand(-20, 20), y: s.y + rand(-14, 14), taken: false, ph: rand(0, 6) });
  }
}

function spawnFireflies() {
  fireflies = [];
  const sx = W / 2, sy = H - 140; // drone spawn — keep fair
  let guard = 0;
  while (fireflies.length < FIREFLY_COUNT && guard++ < 300) {
    const x = rand(50, W - 50), y = rand(50, Math.max(60, H - 190));
    if (Math.hypot(x - sx, y - sy) < 160) continue;
    if (Math.hypot(x - W / 2, y - (H - 60)) < 120) continue; // pad lane
    if (parcels.some(p => Math.hypot(x - p.x, y - p.y) < 90)) continue;
    fireflies.push({
      x, y,
      vx: rand(-1, 1), vy: rand(-1, 1),
      sp: rand(60, 110), ph: rand(0, Math.PI * 2), r: rand(8, 11),
    });
  }
}

function reset() {
  buildOrchard(); spawnParcels(); spawnFireflies();
  drone = { x: W / 2, y: H - 140, vx: 0, vy: 0, r: 14, angle: -Math.PI / 2 };
  trail = [];
  delivered = 0; collected = 0; carrying = false;
  hp = MAX_HP; score = 0; timeLeft = ROUND_TIME; elapsed = 0;
  invuln = 0; flash = 0; lastTickSecond = -1; carryWarnCd = 0;
  layoutStatic();
  updateHUD();
}

function toast(msg) {
  const d = document.createElement("div");
  d.className = "toastmsg"; d.textContent = msg;
  toastBox.appendChild(d);
  while (toastBox.children.length > 3) toastBox.firstChild.remove();
  setTimeout(() => d.remove(), 1900);
}

// ---------- screens ----------
function showScreen(kind, title, sub, html, btn) {
  ovTitle.textContent = title;
  ovTitle.className = kind === "win" ? "win" : kind === "lose" ? "lose" : "";
  ovSub.textContent = sub;
  ovBody.innerHTML = html;
  ovBtn.textContent = btn;
  overlay.classList.add("show");
}
function hideScreen() { overlay.classList.remove("show"); }
function titleScreen() {
  state = "title";
  showScreen("", "NEON ORCHARD COURIER",
    "Guide the courier drone through the glowing orchard.",
    `<div>Collect <b>3 parcels</b> 📦, ferry each to the <b>drop pad</b> 🛬.<br>Finish before the <b>90s</b> timer — dodge the <b>fireflies</b> ✨ (3 hits = crash).</div>`,
    "▶ Start delivery run");
}

// ---------- flow ----------
function startGame() {
  reset(); state = "playing"; hideScreen();
  toast("Collect a parcel 📦, then deliver it to the pad 🛬");
  beep(520, .1, "triangle", .14); setTimeout(() => beep(780, .14, "triangle", .14), 100);
}
function endGame(won, reason) {
  state = won ? "won" : "lost";
  const timeBonus = won ? Math.round(timeLeft) * 10 : 0;
  if (won) { score += timeBonus; sfx.win(); } else sfx.lose();
  updateHUD();
  showScreen(won ? "win" : "lose", won ? "DELIVERY COMPLETE ★" : "RUN FAILED",
    won ? "All three parcels delivered. The orchard glows thanks to you." : reason,
    `<div><span class="stat">📦 Delivered <b>${delivered}/3</b></span>` +
    `<span class="stat">⏱ ${won ? `Time left <b>${timeLeft.toFixed(1)}s</b> (+${timeBonus})` : `Delivered <b>${delivered}/3</b> in ${elapsed.toFixed(1)}s`}</span>` +
    `<span class="stat">★ Score <b>${score}</b></span></div>`,
    won ? "↻ Fly again" : "↻ Try again");
}
function togglePause() {
  if (state === "playing") {
    state = "paused";
    showScreen("", "PAUSED", "The drone holds position while paused.",
      `<div>Press <b>P</b> or the button to resume. <b>R</b> restarts the run.</div>`, "▶ Resume");
  } else if (state === "paused") { state = "playing"; hideScreen(); }
}

// ---------- input ----------
const keys = {};
const PREVENT = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "]);
window.addEventListener("keydown", (e) => {
  if (PREVENT.has(e.key)) e.preventDefault();
  keys[e.key.toLowerCase()] = true;
  if (e.key === "Enter" || e.key === " ") {
    if (state === "title" || state === "won" || state === "lost") startGame();
    else if (state === "paused") togglePause();
  }
  if (e.key.toLowerCase() === "p" || e.key === "Escape") togglePause();
  if (e.key.toLowerCase() === "r") startGame();
  if (e.key.toLowerCase() === "m") toggleMute();
});
window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });
function toggleMute() { muted = !muted; btnMute.textContent = muted ? "🔇" : "🔊"; }
btnMute.onclick = toggleMute;
btnPause.onclick = () => togglePause();
btnRestart.onclick = () => startGame();
ovBtn.onclick = () => {
  if (state === "paused") togglePause(); else startGame();
  try { audioCtx && audioCtx.resume(); } catch (_) {}
};

// touch: drag-to-steer vector
let touchActive = false, touchVec = { x: 0, y: 0 }, touchStart = null;
canvas.addEventListener("pointerdown", (e) => { touchActive = true; touchStart = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener("pointermove", (e) => {
  if (!touchActive || !touchStart) return;
  let dx = (e.clientX - touchStart.x) / 60, dy = (e.clientY - touchStart.y) / 60;
  const m = Math.hypot(dx, dy);
  if (m > 1) {
    // floating joystick: re-anchor so long drags steer instead of saturating
    touchStart.x += (e.clientX - touchStart.x) * (1 - 1 / m);
    touchStart.y += (e.clientY - touchStart.y) * (1 - 1 / m);
    dx /= m; dy /= m;
  }
  touchVec = { x: dx, y: dy };
});
const endTouch = () => { touchActive = false; touchStart = null; touchVec = { x: 0, y: 0 }; };
canvas.addEventListener("pointerup", endTouch);
canvas.addEventListener("pointercancel", endTouch);

// ---------- update ----------
function update(dt) {
  elapsed += dt; timeLeft -= dt;
  if (timeLeft <= 5.5 && timeLeft + dt > 5.5) toast("⏱ Final seconds — deliver!");
  const sec = Math.ceil(timeLeft);
  if (timeLeft <= 5 && sec !== lastTickSecond && timeLeft > 0) { lastTickSecond = sec; sfx.tick(); }
  if (timeLeft <= 0) { timeLeft = 0; updateHUD(); endGame(false, "The timer expired before all parcels were delivered."); return; }
  if (invuln > 0) invuln -= dt;
  if (flash > 0) flash -= dt;
  if (carryWarnCd > 0) carryWarnCd -= dt;

  // --- drone thrust ---
  let ax = 0, ay = 0;
  if (keys["a"] || keys["arrowleft"]) ax -= 1;
  if (keys["d"] || keys["arrowright"]) ax += 1;
  if (keys["w"] || keys["arrowup"]) ay -= 1;
  if (keys["s"] || keys["arrowdown"]) ay += 1;
  ax += touchVec.x; ay += touchVec.y;
  const al = Math.hypot(ax, ay);
  if (al > 1) { ax /= al; ay /= al; }
  const ACC = 1500, MAXV = 330;
  drone.vx += ax * ACC * dt; drone.vy += ay * ACC * dt;
  const fr = Math.pow(0.12, dt); // smooth damping
  drone.vx *= fr; drone.vy *= fr;
  const sp = Math.hypot(drone.vx, drone.vy);
  if (sp > MAXV) { drone.vx = drone.vx / sp * MAXV; drone.vy = drone.vy / sp * MAXV; }
  drone.x = clamp(drone.x + drone.vx * dt, drone.r + 4, W - drone.r - 4);
  drone.y = clamp(drone.y + drone.vy * dt, drone.r + 4, H - drone.r - 4);
  if (sp > 30) drone.angle = Math.atan2(drone.vy, drone.vx);
  trail.push({ x: drone.x, y: drone.y, life: 1 });
  if (trail.length > 40) trail.shift();
  trail.forEach(t => t.life -= dt * 2.2);

  // --- parcels ---
  for (const p of parcels) {
    if (p.taken) continue;
    if (dist(drone, p) < drone.r + 16) {
      if (!carrying) {
        p.taken = true; carrying = true; collected++;
        score += 100; sfx.pickup();
        toast("📦 Parcel aboard — deliver it to the pad 🛬");
      } else if (carryWarnCd <= 0) {
        carryWarnCd = 1.5;
        toast("One parcel at a time — deliver it first 🛬");
      }
      updateHUD();
    }
  }

  // --- delivery ---
  const overPad = drone.x > pad.x && drone.x < pad.x + pad.w && drone.y > pad.y - 6 && drone.y < pad.y + pad.h + 10;
  if (overPad && carrying) {
    carrying = false; delivered++;
    const bonus = Math.round(timeLeft) * 2;
    score += 500 + bonus; sfx.deliver();
    toast(delivered >= TOTAL_PARCELS ? "📦 All parcels delivered!" : `✅ Delivered ${delivered}/3 (+${500 + bonus})`);
    updateHUD();
    if (delivered >= TOTAL_PARCELS) { endGame(true); return; }
  }

  // --- fireflies: wander + gentle hunt ---
  for (const f of fireflies) {
    f.ph += dt * 2;
    const wob = 0.9;
    let hx = (drone.x - f.x), hy = (drone.y - f.y);
    const hd = Math.hypot(hx, hy) || 1; hx /= hd; hy /= hd;
    const hunt = clamp(1 - hd / 300, 0, 1) * 0.55; // gentle hunt only when close
    f.vx += (Math.cos(f.ph * 1.3) * wob + hx * hunt * 1.3 - f.vx) * dt * 1.6;
    f.vy += (Math.sin(f.ph * 1.7) * wob + hy * hunt * 1.3 - f.vy) * dt * 1.6;
    const fm = Math.hypot(f.vx, f.vy) || 1;
    f.x += f.vx / fm * f.sp * dt; f.y += f.vy / fm * f.sp * dt;
    const ceil = 10, floor = H - 100;
    if (f.x < 12 || f.x > W - 12) f.vx *= -1;
    if (f.y < ceil || f.y > floor) f.vy *= -1;
    f.x = clamp(f.x, 10, W - 10); f.y = clamp(f.y, ceil, Math.max(ceil + 1, floor));

    if (state === "playing" && invuln <= 0 && dist(drone, f) < drone.r + f.r - 2) {
      hp--; invuln = 1.4; flash = 0.45; score = Math.max(0, score - 100);
      sfx.hit();
      drone.vx = (drone.x - f.x) * 6; drone.vy = (drone.y - f.y) * 6;
      if (hp <= 0) { hp = 0; updateHUD(); endGame(false, "The drone took 3 firefly hits and crashed."); return; }
      toast(hp === 1 ? "⚠ Hull critical — 1 hit left!" : `⚠ Firefly hit! Hull ${hp}/${MAX_HP}`);
      updateHUD();
    }
  }

  for (const m of motes) { m.y -= m.v * dt; m.ph += dt; if (m.y < -4) { m.y = H + 4; m.x = rand(0, W); } }
  updateHUD();
}

function updateHUD() {
  elTime.textContent = `⏱ ${Math.max(0, timeLeft).toFixed(1)}`;
  elTime.style.borderColor = timeLeft <= 10 ? "#ff5470" : "#4dffa633";
  elParcels.textContent = `📦 ${delivered}/${TOTAL_PARCELS} ✓`;
  elCarry.textContent = carrying ? "🤖 carrying 📦" : "🤖 empty";
  elHearts.textContent = "♥".repeat(hp) + "♡".repeat(Math.max(0, MAX_HP - hp));
  elScore.textContent = `★ ${score}`;
}

// ---------- render ----------
function glow(color, blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; }

function draw(t) {
  ctx.clearRect(0, 0, W, H);
  // sky gradient
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0a1230"); g.addColorStop(0.6, "#0a1428"); g.addColorStop(1, "#071018");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // moon
  ctx.save(); glow("#cfe9ff", 40);
  ctx.fillStyle = "#e8f4ff22";
  ctx.beginPath(); ctx.arc(W * 0.85, H * 0.14, 30, 0, 7); ctx.fill(); ctx.restore();

  // orchard trees
  for (const tr of trees) {
    const pulse = 0.5 + 0.5 * Math.sin(t / 700 + tr.ph);
    ctx.save();
    ctx.globalAlpha = 0.9;
    glow(tr.hue === "green" ? "#4dffa6" : "#37c6ff", 18 + pulse * 10);
    ctx.fillStyle = tr.hue === "green" ? "#123f2b" : "#123043";
    ctx.beginPath(); ctx.arc(tr.x, tr.y, tr.r, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#4dffa6";
    ctx.globalAlpha = 0.35 + pulse * 0.4;
    for (let k = 0; k < 5; k++) {
      const a = tr.ph + k * 1.256 + t / 2400;
      ctx.beginPath(); ctx.arc(tr.x + Math.cos(a) * tr.r * 0.7, tr.y + Math.sin(a) * tr.r * 0.7, 2.2, 0, 7); ctx.fill();
    }
    ctx.restore();
  }
  // ground strip
  ctx.save();
  const gg = ctx.createLinearGradient(0, H - 90, 0, H);
  gg.addColorStop(0, "#0d241833"); gg.addColorStop(1, "#0d3a2a66");
  ctx.fillStyle = gg; ctx.fillRect(0, H - 90, W, 90);
  ctx.restore();

  // motes
  ctx.save(); ctx.fillStyle = "#9fd8ff";
  for (const m of motes) { ctx.globalAlpha = 0.25 + 0.25 * Math.sin(m.ph); ctx.fillRect(m.x, m.y, m.s * 2, m.s * 2); }
  ctx.restore(); ctx.globalAlpha = 1;

  // drop pad
  const padPulse = 0.5 + 0.5 * Math.sin(t / 300);
  ctx.save();
  glow(carrying ? "#ffe66d" : "#37c6ff", 26 + padPulse * 14);
  ctx.fillStyle = carrying ? "#3d341055" : "#0f2c3f";
  roundRect(pad.x, pad.y, pad.w, pad.h, 12); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = carrying ? "#ffe66d" : "#37c6ff"; ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]); ctx.lineDashOffset = -t / 40;
  roundRect(pad.x, pad.y, pad.w, pad.h, 12); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = carrying ? "#ffe66d" : "#9fdcff";
  ctx.font = "700 13px system-ui"; ctx.textAlign = "center";
  ctx.fillText(carrying ? "▼ DROP HERE ▼" : "◇ DROP PAD ◇", pad.x + pad.w / 2, pad.y + pad.h / 2 + 5);
  // beacon
  ctx.globalAlpha = 0.25 + padPulse * 0.2;
  ctx.fillStyle = carrying ? "#ffe66d" : "#37c6ff";
  ctx.fillRect(pad.x + pad.w / 2 - 2, 0, 4, pad.y);
  ctx.restore(); ctx.globalAlpha = 1;

  // parcels
  for (const p of parcels) {
    if (p.taken) continue;
    const bob = Math.sin(t / 400 + p.ph) * 5;
    ctx.save();
    glow("#ffb347", 22);
    ctx.translate(p.x, p.y + bob);
    ctx.fillStyle = "#2a1c08";
    const s = 15;
    ctx.fillRect(-s, -s * 0.7, s * 2, s * 1.4);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#ffb347"; ctx.lineWidth = 2; ctx.strokeRect(-s, -s * 0.7, s * 2, s * 1.4);
    ctx.beginPath(); ctx.moveTo(0, -s * 0.7); ctx.lineTo(0, s * 0.7); ctx.stroke();
    ctx.fillStyle = "#ffe66d"; ctx.font = "11px system-ui"; ctx.textAlign = "center";
    ctx.fillText("📦", 0, -s - 4);
    // ping ring (smooth loop, fades out instead of popping)
    const pingT = ((t / 900 + p.ph) % 1);
    ctx.globalAlpha = 0.55 * (1 - pingT); ctx.strokeStyle = "#ffb347";
    ctx.beginPath(); ctx.arc(0, 0, 22 + pingT * 12, 0, 7); ctx.stroke();
    ctx.restore();
  }

  // fireflies
  for (const f of fireflies) {
    const tw = 0.5 + 0.5 * Math.sin(t / 160 + f.ph * 3);
    ctx.save();
    glow("#fff36d", 16 + tw * 14);
    ctx.fillStyle = `rgba(255,240,150,${0.75 + tw * 0.25})`;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.8 + tw * 0.3), 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff8c9";
    ctx.beginPath(); ctx.arc(f.x, f.y, 3, 0, 7); ctx.fill();
    ctx.strokeStyle = "#ff547033"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(f.x - f.r * 1.8, f.y - f.r); ctx.lineTo(f.x - f.r * 2.6, f.y - f.r * 1.8);
    ctx.moveTo(f.x + f.r * 1.8, f.y - f.r); ctx.lineTo(f.x + f.r * 2.6, f.y - f.r * 1.8);
    ctx.stroke();
    ctx.restore();
  }

  // trail
  for (const tr of trail) {
    if (tr.life <= 0) continue;
    ctx.save(); ctx.globalAlpha = tr.life * 0.5; glow("#4dffa6", 12);
    ctx.fillStyle = "#4dffa6";
    ctx.beginPath(); ctx.arc(tr.x, tr.y, 5 * tr.life, 0, 7); ctx.fill(); ctx.restore();
  }

  // drone
  if (drone) {
    ctx.save();
    ctx.translate(drone.x, drone.y);
    if (invuln > 0 && Math.floor(t / 90) % 2 === 0) ctx.globalAlpha = 0.45;
    // thrust flame
    const spd = Math.hypot(drone.vx, drone.vy);
    if (spd > 60) {
      glow("#37c6ff", 18);
      ctx.fillStyle = "#37c6ffaa";
      const bx = Math.cos(drone.angle + Math.PI) * 18, by = Math.sin(drone.angle + Math.PI) * 18;
      ctx.beginPath(); ctx.arc(bx, by, 5 + Math.random() * 4 + spd / 90, 0, 7); ctx.fill();
    }
    ctx.rotate(drone.angle + Math.PI / 2);
    glow("#4dffa6", 22);
    ctx.fillStyle = "#10231c";
    ctx.beginPath();
    ctx.moveTo(0, -18); ctx.lineTo(12, 10); ctx.lineTo(0, 4); ctx.lineTo(-12, 10);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#4dffa6"; ctx.lineWidth = 2; ctx.stroke();
    // rotors
    ctx.fillStyle = "#37c6ff";
    const spin = t / 60;
    for (const sx of [-14, 14]) {
      ctx.save(); ctx.translate(sx, 6); ctx.rotate(spin);
      ctx.fillRect(-8, -1.5, 16, 3); ctx.restore();
      ctx.beginPath(); ctx.arc(sx, 6, 2.5, 0, 7); ctx.fill();
    }
    // eye
    ctx.fillStyle = "#eafff3";
    ctx.beginPath(); ctx.arc(0, -4, 4.5, 0, 7); ctx.fill();
    ctx.fillStyle = "#0b2e22";
    ctx.beginPath(); ctx.arc(0, -4, 2, 0, 7); ctx.fill();
    ctx.restore();
    // carried parcel icon
    if (carrying) {
      ctx.save(); glow("#ffb347", 14);
      ctx.fillStyle = "#ffb347"; ctx.font = "16px system-ui"; ctx.textAlign = "center";
      ctx.fillText("📦", drone.x + 20, drone.y - 16);
      ctx.restore();
    }
  }

  // vignette + hit flash + low-time pulse
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  if (flash > 0) { ctx.fillStyle = `rgba(255,60,90,${flash * 0.55})`; ctx.fillRect(0, 0, W, H); }
  if (state === "playing" && timeLeft <= 10) {
    ctx.fillStyle = `rgba(255,60,90,${0.06 + 0.05 * Math.sin(t / 200)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- main loop ----------
let last = performance.now(), fpsAcc = 0, fpsN = 0, fpsT = 0;
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000 || 0.016);
  last = now;
  fpsAcc += 1 / Math.max(dt, 1e-4); fpsN++;
  if (now - fpsT > 800) { elFps.textContent = `${Math.round(fpsAcc / Math.max(1, fpsN))} fps · ${W}×${H}`; fpsAcc = 0; fpsN = 0; fpsT = now; }
  if (state === "playing") update(dt);
  draw(now);
  requestAnimationFrame(frame);
}

// ---------- boot ----------
resize();
reset(false);
titleScreen();
requestAnimationFrame((n) => { last = n; requestAnimationFrame(frame); });

// expose a tiny test API for verification
window.__courier = {
  get state() { return state; },
  get delivered() { return delivered; },
  get hp() { return hp; },
  snapshot() { return { state, delivered, collected, carrying, hp, timeLeft, score, W, H,
    parcels: parcels.length, fireflies: fireflies.length,
    drone: { x: drone.x, y: drone.y },
    pad: { x: pad.x, y: pad.y, w: pad.w, h: pad.h },
    parcelPos: parcels.map(p => ({ x: p.x, y: p.y, taken: p.taken })),
    foePos: fireflies.map(f => ({ x: f.x, y: f.y, r: f.r })),
  }; },
  start: startGame,
};
})();
