/* Canyon Courier — self-contained arcade game (no dependencies). */
(() => {
  "use strict";

  const W = 480, H = 720;
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  // ---- HiDPI scaling ----
  function fitCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fitCanvas();
  window.addEventListener("resize", fitCanvas);

  // ---- DOM ----
  const $ = (id) => document.getElementById(id);
  const hud = $("hud"), scoreEl = $("score"), timeEl = $("time"), levelEl = $("level"),
    livesEl = $("lives"), comboEl = $("combo"), timePill = $("timePill"), toastEl = $("toast"),
    startScreen = $("startScreen"), overScreen = $("overScreen"),
    overTitle = $("overTitle"), overSub = $("overSub"), overEmoji = $("overEmoji"),
    finalScore = $("finalScore"), finalGates = $("finalGates"), finalPkgs = $("finalPkgs"),
    bestOver = $("bestOver"), bestStart = $("bestStart"), newBest = $("newBest"),
    fpsEl = $("fps");

  const BEST_KEY = "canyon-courier-best";
  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  bestStart.textContent = best;

  // ---- Audio (tiny synth, no assets) ----
  let audioCtx = null, muted = false;
  function beep(freq, dur = 0.08, type = "square", vol = 0.12, slide = 0) {
    if (muted) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), audioCtx.currentTime + dur);
      g.gain.setValueAtTime(vol, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + dur);
    } catch (e) { /* audio unavailable */ }
  }
  $("muteBtn").addEventListener("click", (e) => {
    muted = !muted;
    e.target.textContent = muted ? "🔇" : "🔊";
  });
  $("helpBtn").addEventListener("click", () => $("helpModal").classList.remove("hidden"));
  $("closeHelp").addEventListener("click", () => $("helpModal").classList.add("hidden"));

  // ---- Game state ----
  const RUN_TIME = 60;
  let state = "menu"; // menu | playing | over
  let score, lives, timeLeft, elapsed, gatesPassed, pkgsTaken, combo, comboTimer;
  let scrollSpeed, gateGap, gateSpacing, spawnY;
  let gates, packages, particles, floaters, shake, flashA;
  let player;
  let wallPhase = 0;
  let lastT = 0, fpsAcc = 0, fpsN = 0, fpsT = 0;

  const input = { left: false, right: false, pointerX: null, pointerActive: false };

  function reset() {
    score = 0; lives = 3; timeLeft = RUN_TIME; elapsed = 0;
    gatesPassed = 0; pkgsTaken = 0; combo = 0; comboTimer = 0;
    gates = []; packages = []; particles = []; floaters = [];
    shake = 0; flashA = 0;
    player = { x: W / 2, y: H - 130, vx: 0, r: 16, tilt: 0, invuln: 0, alive: true };
    spawnY = -40;
    // seed a few gates + packages
    for (let i = 0; i < 4; i++) spawnGate(true);
    for (let i = 0; i < 3; i++) spawnPackage(true);
  }

  function level() { return 1 + Math.floor(elapsed / 12); }
  function comboMult() { return 1 + Math.min(4, Math.floor(combo / 3)); }

  function difficulty() {
    const lv = level();
    scrollSpeed = 210 + lv * 42 + elapsed * 1.6;      // px/s, escalates
    gateGap = Math.max(108, 178 - lv * 14);            // narrows
    gateSpacing = Math.max(190, 265 - lv * 12);        // denser
  }

  function spawnGate(initial) {
    const lv = level();
    difficulty();
    const margin = 70;
    const gapX = margin + gateGap / 2 + Math.random() * (W - margin * 2 - gateGap);
    const y = initial ? spawnY - Math.random() * 200 : spawnY;
    gates.push({
      y, gapX, gapW: gateGap,
      driftAmp: Math.min(70, 14 + lv * 9),
      driftFreq: 0.6 + lv * 0.16 + Math.random() * 0.4,
      driftPhase: Math.random() * Math.PI * 2,
      passed: false, hue: 180 + Math.random() * 120,
    });
    spawnY = y - gateSpacing;
  }

  function spawnPackage(initial) {
    const y = initial ? -Math.random() * H : spawnY + gateSpacing / 2;
    packages.push({
      x: 70 + Math.random() * (W - 140),
      y, baseX: 0, r: 13,
      bob: Math.random() * Math.PI * 2,
      taken: false,
      hue: [45, 300, 140, 200][Math.floor(Math.random() * 4)],
    });
    if (!initial) { /* attached near next gate */ }
    packages[packages.length - 1].baseX = packages[packages.length - 1].x;
  }

  // ---- Canyon walls ----
  function wallEdge(side, y, t) {
    const base = 44;
    const wob = 26 * Math.sin(y * 0.012 + t * 1.4 + (side === 0 ? 0 : Math.PI))
      + 14 * Math.sin(y * 0.03 - t * 2.2 + side * 2.1)
      + Math.min(30, elapsed * 0.35) * Math.sin(y * 0.006 + t * 0.7);
    return side === 0 ? base + wob : W - base - wob;
  }

  // ---- Effects ----
  function burst(x, y, n, colors, spd = 160) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = spd * (0.3 + Math.random());
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 0.5 + Math.random() * 0.5, t: 0, r: 2 + Math.random() * 3.5, c: colors[i % colors.length] });
    }
  }
  function floatText(x, y, text, color = "#ffd23f") {
    floaters.push({ x, y, text, color, t: 0, life: 0.9 });
  }
  let toastTimer = null;
  function toast(msg, ms = 1400) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add("hidden"), ms);
  }

  function bumpCombo(x, y, label) {
    combo++; comboTimer = 3.2;
    const m = comboMult();
    comboEl.classList.remove("hidden");
    comboEl.textContent = m > 1 ? `COMBO ×${m} 🔥` : "COMBO 🔥";
    if (combo >= 3 && combo % 3 === 0) {
      toast(`🔥 Combo ×${m}!`);
      beep(880, 0.12, "square", 0.1, 440);
    }
  }

  function hitPlayer(why) {
    if (player.invuln > 0 || state !== "playing") return;
    lives--;
    combo = 0; comboTimer = 0;
    comboEl.classList.add("hidden");
    player.invuln = 1.4;
    shake = 14; flashA = 0.55;
    burst(player.x, player.y, 26, ["#ff5470", "#ffd23f", "#ffffff"], 260);
    beep(160, 0.3, "sawtooth", 0.16, -110);
    toast(why === "wall" ? "💥 Canyon wall!" : "💥 Gate pylon!", 1100);
    updateHUD();
    if (lives <= 0) {
      player.alive = false;
      burst(player.x, player.y, 60, ["#ff5470", "#ffd23f", "#ff4ecd", "#ffffff"], 340);
      endGame(false);
    }
  }

  // ---- Flow ----
  function startGame() {
    reset();
    state = "playing";
    startScreen.classList.add("hidden");
    overScreen.classList.add("hidden");
    hud.classList.remove("hidden");
    updateHUD();
    toast("📦 Deliver! Thread the gates!");
    beep(523, 0.1, "square", 0.12); setTimeout(() => beep(659, 0.1, "square", 0.12), 110); setTimeout(() => beep(784, 0.16, "square", 0.12), 220);
  }

  function endGame(timeUp) {
    state = "over";
    const isBest = score > best;
    if (isBest) { best = score; localStorage.setItem(BEST_KEY, String(best)); }
    bestStart.textContent = best;
    overEmoji.textContent = timeUp ? "🏁" : "💥";
    overTitle.textContent = timeUp ? "TIME UP!" : "COURIER DOWN!";
    overSub.textContent = timeUp ? "Route complete, courier." : "The canyon claims another glider…";
    finalScore.textContent = score;
    finalGates.textContent = gatesPassed;
    finalPkgs.textContent = pkgsTaken;
    bestOver.textContent = best;
    newBest.classList.toggle("hidden", !isBest);
    setTimeout(() => {
      overScreen.classList.remove("hidden");
      hud.classList.add("hidden");
    }, timeUp ? 200 : 900);
    if (timeUp) { beep(784, 0.15, "square", 0.12); setTimeout(() => beep(1046, 0.3, "square", 0.12), 160); }
  }

  $("startBtn").addEventListener("click", startGame);
  $("retryBtn").addEventListener("click", startGame);

  // ---- Input: keyboard + pointer/touch ----
  window.addEventListener("keydown", (e) => {
    if (["ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") input.left = true;
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") input.right = true;
    if ((e.key === " " || e.key === "Enter") && state !== "playing") startGame();
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") input.left = false;
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") input.right = false;
  });

  function pointerToX(e) {
    const r = canvas.getBoundingClientRect();
    const cx = (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX);
    return ((cx - r.left) / r.width) * W;
  }
  const stage = document.getElementById("stage");
  stage.addEventListener("pointerdown", (e) => {
    input.pointerActive = true;
    input.pointerX = pointerToX(e);
    stage.setPointerCapture && e.pointerId !== undefined && stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", (e) => {
    if (input.pointerActive) input.pointerX = pointerToX(e);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((ev) =>
    stage.addEventListener(ev, () => { input.pointerActive = false; input.pointerX = null; })
  );
  stage.addEventListener("touchstart", (e) => { input.pointerActive = true; input.pointerX = pointerToX(e); }, { passive: true });
  stage.addEventListener("touchmove", (e) => { input.pointerX = pointerToX(e); }, { passive: true });
  stage.addEventListener("touchend", () => { input.pointerActive = false; input.pointerX = null; });

  function updateHUD() {
    scoreEl.textContent = score;
    timeEl.textContent = Math.ceil(timeLeft);
    levelEl.textContent = level();
    livesEl.textContent = "❤".repeat(Math.max(0, lives)) + "🤍".repeat(Math.max(0, 3 - lives));
    timePill.classList.toggle("danger", timeLeft <= 10);
  }

  // ---- Update ----
  function update(dt) {
    elapsed += dt;
    timeLeft -= dt;
    difficulty();
    wallPhase += dt;

    if (timeLeft <= 0) { timeLeft = 0; updateHUD(); endGame(true); return; }
    if (Math.ceil(timeLeft) === 10 && !update._t10) { update._t10 = true; toast("⏱ 10 seconds!"); beep(990, 0.2, "square", 0.12); }
    if (elapsed > 0 && Math.floor(elapsed) % 12 === 0 && !update._lv) { update._lv = Math.floor(elapsed); toast(`⚡ Level ${level()} — faster!`); beep(660, 0.12, "square", 0.1, 220); }
    if (update._lv !== undefined && Math.floor(elapsed) !== update._lv) update._lv = undefined;
    if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) { combo = 0; comboEl.classList.add("hidden"); } }

    // player steering
    const ACC = 2600, MAXV = 430, FRICTION = 5.2;
    if (input.left) player.vx -= ACC * dt;
    if (input.right) player.vx += ACC * dt;
    if (input.pointerActive && input.pointerX !== null) {
      const dx = input.pointerX - player.x;
      player.vx = Math.max(-MAXV * 1.2, Math.min(MAXV * 1.2, dx * 9));
      player.x += player.vx * dt;
    } else {
      player.vx -= player.vx * Math.min(1, FRICTION * dt);
      player.x += player.vx * dt;
    }
    player.tilt += ((Math.max(-1, Math.min(1, player.vx / 320))) * 0.45 - player.tilt) * Math.min(1, 10 * dt);
    if (player.invuln > 0) player.invuln -= dt;

    // walls clamp + collide
    const wl = wallEdge(0, player.y, wallPhase) + 14;
    const wr = wallEdge(1, player.y, wallPhase) - 14;
    if (player.x - player.r < wl || player.x + player.r > wr) {
      player.x = Math.max(wl + player.r, Math.min(wr - player.r, player.x));
      hitPlayer("wall");
    }

    // gates
    for (const g of gates) {
      g.y += scrollSpeed * dt;
      g.curX = g.gapX + Math.sin(elapsed * g.driftFreq + g.driftPhase) * g.driftAmp;
      if (!g.passed && g.y >= player.y - 6 && g.y <= player.y + 40) {
        const half = g.gapW / 2;
        const inGap = player.x > g.curX - half + 6 && player.x < g.curX + half - 6;
        // side pylon collision while overlapping
        const overlapY = Math.abs(g.y - player.y) < 34;
        if (overlapY && !inGap) hitPlayer("gate");
      }
      if (!g.passed && g.y > player.y + 40) {
        g.passed = true;
        const half = g.gapW / 2;
        if (player.x > g.curX - half && player.x < g.curX + half) {
          const pts = 10 * comboMult();
          score += pts; gatesPassed++;
          bumpCombo(player.x, player.y - 40);
          floatText(player.x, player.y - 44, `+${pts}`, "#5dff8f");
          burst(player.x, player.y - 10, 10, ["#39e6ff", "#5dff8f", "#ffffff"], 170);
          beep(740, 0.09, "square", 0.1, 180);
        }
      }
    }
    // recycle gates
    while (gates.length && gates[0].y > H + 60) { gates.shift(); spawnGate(false); if (Math.random() < 0.85) spawnPackage(false); }
    if (gates.length < 4) spawnGate(false);

    // packages
    for (const p of packages) {
      p.y += scrollSpeed * dt;
      p.bob += dt * 4;
      p.x = p.baseX + Math.sin(p.bob * 0.7) * 14;
      if (!p.taken && player.alive) {
        const dx = p.x - player.x, dy = p.y - player.y;
        if (dx * dx + dy * dy < (p.r + player.r + 4) ** 2) {
          p.taken = true;
          const pts = 25 * comboMult();
          score += pts; pkgsTaken++;
          bumpCombo(p.x, p.y);
          floatText(p.x, p.y - 20, `+${pts} 📦`, "#ffd23f");
          burst(p.x, p.y, 14, ["#ffd23f", "#ff9f1c", "#ffffff"], 190);
          beep(980, 0.1, "square", 0.11, 260);
        }
      }
    }
    packages = packages.filter((p) => !p.taken && p.y < H + 40);
    while (packages.length < 3 && Math.random() < 0.05) spawnPackage(false);

    // exhaust trail
    if (player.alive && Math.random() < 0.6) {
      particles.push({ x: player.x + (Math.random() - 0.5) * 8, y: player.y + 20, vx: (Math.random() - 0.5) * 40 - player.vx * 0.15, vy: 120 + Math.random() * 80, life: 0.4, t: 0, r: 2 + Math.random() * 2.5, c: ["#39e6ff", "#ff4ecd", "#ffd23f"][Math.floor(Math.random() * 3)] });
    }

    for (const pt of particles) { pt.t += dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += 60 * dt; }
    particles = particles.filter((p) => p.t < p.life);
    for (const f of floaters) { f.t += dt; f.y -= 46 * dt; }
    floaters = floaters.filter((f) => f.t < f.life);
    if (shake > 0) shake = Math.max(0, shake - dt * 40);
    if (flashA > 0) flashA = Math.max(0, flashA - dt * 1.8);

    updateHUD();
  }

  // ---- Render ----
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw(t) {
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#2b0f54");
    sky.addColorStop(0.45, "#57208a");
    sky.addColorStop(0.75, "#b23a8f");
    sky.addColorStop(1, "#ff8c5a");
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, W + 40, H + 40);

    // sun
    const sg = ctx.createRadialGradient(W / 2, 190, 8, W / 2, 190, 120);
    sg.addColorStop(0, "#fff7c2"); sg.addColorStop(0.35, "#ffd23f"); sg.addColorStop(1, "rgba(255,210,63,0)");
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(W / 2, 190, 120, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff3ad";
    ctx.beginPath(); ctx.arc(W / 2, 190, 44, 0, Math.PI * 2); ctx.fill();

    // clouds
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (let i = 0; i < 4; i++) {
      const cy = ((i * 190 + t * 22 * (1 + i * 0.2)) % (H + 120)) - 60;
      const cx = 60 + ((i * 173) % (W - 120));
      ctx.beginPath();
      ctx.ellipse(cx, cy, 42, 13, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 26, cy + 4, 30, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // speed streaks
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const sy = ((i * 131 + t * scrollSpeed * 1.6) % (H + 80)) - 40;
      const sx = (i * 97) % W;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy + 26); ctx.stroke();
    }

    // canyon walls (layered)
    for (const layer of [{ off: 26, c1: "#5b2a86", c2: "#3a1a5e" }, { off: 0, c1: "#8a3b6e", c2: "#5e2350" }]) {
      for (const side of [0, 1]) {
        ctx.beginPath();
        ctx.moveTo(side === 0 ? -20 : W + 20, -20);
        for (let y = -20; y <= H + 20; y += 18) {
          const e = wallEdge(side, y - (state === "playing" ? 0 : t * 30), wallPhase) + (side === 0 ? -layer.off : layer.off);
          ctx.lineTo(e, y);
        }
        ctx.lineTo(side === 0 ? -20 : W + 20, H + 20);
        ctx.closePath();
        const g = ctx.createLinearGradient(side === 0 ? 0 : W, 0, W / 2, 0);
        g.addColorStop(0, layer.c2); g.addColorStop(1, layer.c1);
        ctx.fillStyle = g;
        ctx.fill();
        // rock strata lines
        ctx.strokeStyle = "rgba(255,255,255,0.10)";
        ctx.lineWidth = 2;
        for (let y = 0; y < H; y += 64) {
          const yy = ((y + t * scrollSpeed * 0.9) % (H + 64)) - 32;
          const e = wallEdge(side, yy, wallPhase) + (side === 0 ? -layer.off : layer.off);
          ctx.beginPath();
          ctx.moveTo(side === 0 ? e - 26 : e + 26, yy);
          ctx.lineTo(side === 0 ? e + 14 : e - 14, yy + 10);
          ctx.stroke();
        }
        // glowing rim
        const rimX = [];
        ctx.strokeStyle = side === 0 ? "#39e6ff" : "#ff4ecd";
        ctx.lineWidth = 3;
        ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 12;
        ctx.beginPath();
        for (let y = -20; y <= H + 20; y += 18) {
          const e = wallEdge(side, y, wallPhase);
          if (y === -20) ctx.moveTo(e, y); else ctx.lineTo(e, y);
          rimX.push(e);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    // packages
    for (const p of packages) {
      const bobY = Math.sin(p.bob) * 3;
      ctx.save();
      ctx.translate(p.x, p.y + bobY);
      ctx.shadowColor = `hsl(${p.hue} 100% 60%)`; ctx.shadowBlur = 14;
      ctx.fillStyle = `hsl(${p.hue} 90% 55%)`;
      roundRect(-13, -11, 26, 22, 5); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(-13, -3, 26, 5);
      ctx.strokeStyle = "#2b0f54"; ctx.lineWidth = 2;
      roundRect(-13, -11, 26, 22, 5); ctx.stroke();
      ctx.font = "13px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("📦", 0, 1);
      ctx.restore();
    }

    // gates (pylon pairs + glowing gap)
    for (const g of gates) {
      const cx = g.curX !== undefined ? g.curX : g.gapX;
      const half = g.gapW / 2;
      const y = g.y;
      const wl = wallEdge(0, y, wallPhase), wr = wallEdge(1, y, wallPhase);
      // beam across
      ctx.fillStyle = "rgba(57,230,255,0.16)";
      ctx.fillRect(wl, y - 8, wr - wl, 16);
      // pylons
      for (const [x0, x1] of [[wl, cx - half], [cx + half, wr]]) {
        const wpx = Math.max(0, x1 - x0);
        if (wpx <= 0) continue;
        const pg = ctx.createLinearGradient(0, y - 26, 0, y + 26);
        pg.addColorStop(0, "#ff4ecd"); pg.addColorStop(0.5, "#7c3aed"); pg.addColorStop(1, "#312e81");
        ctx.fillStyle = pg;
        roundRect(x0, y - 24, wpx, 48, 10); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        roundRect(x0 + 4, y - 20, Math.max(0, wpx - 8), 8, 4); ctx.fill();
        // lights
        for (let lx = x0 + 12; lx < x1 - 4; lx += 26) {
          ctx.fillStyle = (Math.floor(t * 4 + lx) % 2) ? "#ffd23f" : "#39e6ff";
          ctx.beginPath(); ctx.arc(lx, y, 4, 0, Math.PI * 2); ctx.fill();
        }
      }
      // gap glow posts
      for (const gx of [cx - half, cx + half]) {
        ctx.fillStyle = "#5dff8f";
        ctx.shadowColor = "#5dff8f"; ctx.shadowBlur = 16;
        roundRect(gx - 5, y - 30, 10, 60, 5); ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.fillStyle = "#d9ffe4";
      ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("▼ GATE ▼", cx, y - 32);
    }

    // particles
    for (const p of particles) {
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // player glider
    if (player && player.alive && state !== "over") {
      const blink = player.invuln > 0 && Math.floor(t * 12) % 2 === 0;
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(player.tilt);
      if (blink) ctx.globalAlpha = 0.35;
      // shadow
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath(); ctx.ellipse(4, 22, 20, 6, 0, 0, Math.PI * 2); ctx.fill();
      // wings
      const wingG = ctx.createLinearGradient(-34, 0, 34, 0);
      wingG.addColorStop(0, "#39e6ff"); wingG.addColorStop(0.5, "#a5f3fc"); wingG.addColorStop(1, "#ff4ecd");
      ctx.fillStyle = wingG;
      ctx.shadowColor = "#39e6ff"; ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(-36, -2); ctx.lineTo(-10, -8); ctx.lineTo(-6, 8); ctx.lineTo(-34, 12); ctx.closePath();
      ctx.moveTo(36, -2); ctx.lineTo(10, -8); ctx.lineTo(6, 8); ctx.lineTo(34, 12); ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      // body
      ctx.fillStyle = "#ffd23f";
      ctx.strokeStyle = "#7c2d12"; ctx.lineWidth = 2.5;
      roundRect(-9, -20, 18, 38, 9); ctx.fill(); ctx.stroke();
      // cockpit
      ctx.fillStyle = "#0ea5e9";
      ctx.beginPath(); ctx.arc(0, -6, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.beginPath(); ctx.arc(-2, -8, 2, 0, Math.PI * 2); ctx.fill();
      // tail flame
      const fl = 10 + Math.random() * 10 + Math.abs(player.vx) * 0.02;
      const fg = ctx.createLinearGradient(0, 16, 0, 16 + fl + 12);
      fg.addColorStop(0, "#fff"); fg.addColorStop(0.4, "#ffd23f"); fg.addColorStop(1, "rgba(255,78,205,0)");
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.moveTo(-6, 16); ctx.lineTo(6, 16); ctx.lineTo(0, 16 + fl + 12); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // floaters
    ctx.textAlign = "center"; ctx.font = "bold 17px 'Trebuchet MS', sans-serif";
    for (const f of floaters) {
      ctx.globalAlpha = 1 - f.t / f.life;
      ctx.fillStyle = "#000";
      ctx.fillText(f.text, f.x + 1, f.y + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    // damage flash + vignette
    if (flashA > 0) { ctx.fillStyle = `rgba(255,40,80,${flashA * 0.5})`; ctx.fillRect(-20, -20, W + 40, H + 40); }
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.72);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(5,0,20,0.5)");
    ctx.fillStyle = vg; ctx.fillRect(-20, -20, W + 40, H + 40);

    // timer arc
    if (state === "playing") {
      ctx.strokeStyle = timeLeft <= 10 ? "#ff5470" : "#5dff8f";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(W / 2, 34, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (timeLeft / RUN_TIME));
      ctx.stroke();
    }

    ctx.restore();
  }

  // ---- Main loop ----
  function frame(ts) {
    requestAnimationFrame(frame);
    const t = ts / 1000;
    let dt = Math.min(0.05, t - (lastT || t));
    lastT = t;
    if (state === "playing") update(dt);
    else wallPhase += dt * 0.6;
    draw(t || 0);
    // fps
    fpsAcc += dt; fpsN++;
    if ((fpsT += dt) > 0.5) { fpsEl.textContent = `${Math.round(fpsN / fpsAcc)} fps`; fpsAcc = 0; fpsN = 0; fpsT = 0; updateHUDMenu(); }
  }

  function updateHUDMenu() {
    if (state !== "playing") { scoreEl.textContent = score || 0; }
  }

  reset();
  state = "menu";
  requestAnimationFrame(frame);
})();
