// Signal Sprites: Neon Relay — compact canvas game.
// Pure helpers are exported for node tests; DOM boot only runs in browser.

export const GAME = {
  W: 960,
  H: 600,
  TIME_LIMIT: 60,
  NEED_SHARDS: 3,
  PLAYER_R: 12,
  SHARD_R: 12,
  PLAYER_SPEED: 300,
};

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function circleRectHit(cx, cy, r, rect) {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

export function circleHit(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy < (ar + br) * (ar + br);
}

// Push a circle out of a rect along the smallest-penetration axis.
// Assumes overlap; mutates `p` ({x,y}) and returns the push {x,y} applied.
export function resolveLockedGate(p, r, gate) {
  const leftPen = p.x + r - gate.x;
  const rightPen = gate.x + gate.w - (p.x - r);
  const topPen = p.y + r - gate.y;
  const bottomPen = gate.y + gate.h - (p.y - r);
  const min = Math.min(leftPen, rightPen, topPen, bottomPen);
  let px = 0;
  let py = 0;
  if (min === leftPen) px = -leftPen;
  else if (min === rightPen) px = rightPen;
  else if (min === topPen) py = -topPen;
  else py = bottomPen;
  p.x += px;
  p.y += py;
  return { x: px, y: py };
}

export function makeLevel() {
  return {
    player: { x: 70, y: GAME.H / 2, vx: 0, vy: 0 },
    shards: [
      { x: 300, y: 150, taken: false, phase: 0 },
      { x: 480, y: 430, taken: false, phase: 2 },
      { x: 660, y: 170, taken: false, phase: 4 },
    ],
    // Moving firewall bars (oscillate along an axis)
    walls: [
      { x: 210, y: 60, w: 18, h: 150, axis: "y", range: 120, speed: 1.6, t: 0, baseX: 210, baseY: 60 },
      { x: 400, y: 300, w: 18, h: 170, axis: "y", range: 90, speed: 2.1, t: 1.5, baseX: 400, baseY: 300 },
      { x: 560, y: 80, w: 150, h: 18, axis: "x", range: 120, speed: 1.4, t: 3, baseX: 560, baseY: 80 },
      { x: 560, y: 480, w: 170, h: 18, axis: "x", range: 100, speed: 2.4, t: 0.8, baseX: 560, baseY: 480 },
      { x: 770, y: 200, w: 18, h: 180, axis: "y", range: 80, speed: 2.8, t: 2.2, baseX: 770, baseY: 200 },
    ],
    gate: { x: GAME.W - 70, y: GAME.H / 2 - 60, w: 30, h: 120 },
  };
}

export function updateWalls(walls, dt, time) {
  for (const w of walls) {
    w.t += dt * w.speed;
    const off = Math.sin(w.t + time * 0) * w.range;
    if (w.axis === "y") {
      w.y = w.baseY + off;
    } else {
      w.x = w.baseX + off;
    }
  }
}

// ---- Browser game ----
if (typeof document !== "undefined") {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayText = document.getElementById("overlay-text");
  const overlayBtn = document.getElementById("overlay-btn");
  const restartBtn = document.getElementById("restart-btn");
  const hudShards = document.getElementById("hud-shards");
  const hudTime = document.getElementById("hud-time");
  const hudStatus = document.getElementById("hud-status");
  const toast = document.getElementById("toast");

  let state = "menu"; // menu | playing | won | lost
  let level = makeLevel();
  let shardsGot = 0;
  let timeLeft = GAME.TIME_LIMIT;
  let elapsed = 0;
  let invuln = 0;
  let flash = 0;
  let trail = [];
  let toastTimer = 0;
  let shake = 0;
  let floaters = [];
  let hudPulse = 0;

  const keys = new Set();
  const pointer = { active: false, x: 0, y: 0 };

  function showToast(msg, kind = "") {
    toast.textContent = msg;
    toast.className = `toast show ${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1600);
  }

  function setOverlay(title, html, btn, visible) {
    overlayTitle.textContent = title;
    overlayText.innerHTML = html;
    overlayBtn.textContent = btn;
    overlay.classList.toggle("hidden", !visible);
  }

  function reset() {
    level = makeLevel();
    shardsGot = 0;
    timeLeft = GAME.TIME_LIMIT;
    elapsed = 0;
    invuln = 0;
    flash = 0;
    trail = [];
    shake = 0;
    floaters = [];
    hudPulse = 0;
    hudTime.classList.remove("hit-pulse");
    hudStatus.textContent = "Running";
    hudStatus.className = "hud-item";
  }

  function start() {
    reset();
    state = "playing";
    setOverlay("", "", "", false);
    showToast("Collect 3 shards, then hit the gate!", "good");
  }

  function endGame(won, reason) {
    state = won ? "won" : "lost";
    if (won) {
      hudStatus.textContent = "Relayed!";
      hudStatus.className = "hud-item ok";
      setOverlay(
        "Relay Complete!",
        `<p>All <b>3 shards</b> delivered in <b>${(GAME.TIME_LIMIT - timeLeft).toFixed(1)}s</b>. The neon grid hums back to life.<br/>Press <b>R</b> or hit restart to run again.</p>`,
        "Play Again",
        true
      );
      showToast("SUCCESS — signal relayed!", "good");
    } else {
      hudStatus.textContent = "Failed";
      hudStatus.className = "hud-item bad";
      setOverlay(reason === "time" ? "Signal Lost — Timeout" : "Signal Lost", reason === "time"
        ? `<p>Timer expired with <b>${shardsGot}/3 shards</b>. Try a tighter route!</p>`
        : `<p>Firewall hit! (placeholder — hits cost time, 3s + brief shield)</p>`, "Restart Run", true);
    }
  }

  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * GAME.W,
      y: ((e.clientY - r.top) / r.height) * GAME.H,
    };
  }

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
    keys.add(k);
    if ((k === "enter" || k === " ") && state !== "playing") start();
    if (k === "r") start();
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    const p = canvasPos(e);
    pointer.active = true;
    pointer.x = p.x;
    pointer.y = p.y;
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!pointer.active) return;
    const p = canvasPos(e);
    pointer.x = p.x;
    pointer.y = p.y;
  });
  canvas.addEventListener("pointerup", () => (pointer.active = false));
  canvas.addEventListener("pointercancel", () => (pointer.active = false));
  overlayBtn.addEventListener("click", start);
  restartBtn.addEventListener("click", start);

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (state === "playing") update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    elapsed += dt;
    timeLeft -= dt;
    if (invuln > 0) invuln -= dt;
    if (flash > 0) flash -= dt;
    if (shake > 0) shake -= dt;
    if (hudPulse > 0) {
      hudPulse -= dt;
      if (hudPulse <= 0) hudTime.classList.remove("hit-pulse");
    }
    for (const f of floaters) {
      f.ttl -= dt;
      f.y -= 34 * dt;
    }
    floaters = floaters.filter((f) => f.ttl > 0);

    if (timeLeft <= 0) {
      timeLeft = 0;
      endGame(false, "time");
      return;
    }

    updateWalls(level.walls, dt, elapsed);

    // Movement: keyboard vector + pointer seek
    let mx = 0;
    let my = 0;
    if (keys.has("a") || keys.has("arrowleft")) mx -= 1;
    if (keys.has("d") || keys.has("arrowright")) mx += 1;
    if (keys.has("w") || keys.has("arrowup")) my -= 1;
    if (keys.has("s") || keys.has("arrowdown")) my += 1;
    const p = level.player;
    if (mx !== 0 || my !== 0) {
      const n = Math.hypot(mx, my);
      p.x += (mx / n) * GAME.PLAYER_SPEED * dt;
      p.y += (my / n) * GAME.PLAYER_SPEED * dt;
    } else if (pointer.active) {
      const dx = pointer.x - p.x;
      const dy = pointer.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 4) {
        const sp = Math.min(GAME.PLAYER_SPEED, d * 6);
        p.x += (dx / d) * sp * dt;
        p.y += (dy / d) * sp * dt;
      }
    }
    p.x = Math.max(GAME.PLAYER_R, Math.min(GAME.W - GAME.PLAYER_R, p.x));
    p.y = Math.max(GAME.PLAYER_R, Math.min(GAME.H - GAME.PLAYER_R, p.y));

    trail.push({ x: p.x, y: p.y, a: 1 });
    if (trail.length > 26) trail.shift();
    for (const t of trail) t.a -= dt * 2;

    // Shard pickup
    for (const s of level.shards) {
      if (!s.taken && circleHit(p.x, p.y, GAME.PLAYER_R, s.x, s.y, GAME.SHARD_R)) {
        s.taken = true;
        shardsGot++;
        showToast(`Shard ${shardsGot}/3 secured!`, "good");
        if (shardsGot === GAME.NEED_SHARDS) showToast("Gate open — reach the green relay!", "good");
      }
    }

    // Firewall collision
    if (invuln <= 0) {
      for (const w of level.walls) {
        if (circleRectHit(p.x, p.y, GAME.PLAYER_R - 2, w)) {
          timeLeft = Math.max(0.5, timeLeft - 3);
          invuln = 1.2;
          flash = 0.35;
          shake = 0.3;
          floaters.push({ x: p.x, y: p.y - 20, ttl: 1.0 });
          hudPulse = 0.6;
          hudTime.classList.add("hit-pulse");
          showToast("HIT! Firewall burn −3s", "bad");
          break;
        }
      }
    }

    // Gate
    const g = level.gate;
    const gateOpen = shardsGot >= GAME.NEED_SHARDS;
    if (circleRectHit(p.x, p.y, GAME.PLAYER_R, g)) {
      if (gateOpen) {
        endGame(true);
      } else {
        resolveLockedGate(p, GAME.PLAYER_R, g);
        p.x = Math.max(GAME.PLAYER_R, Math.min(GAME.W - GAME.PLAYER_R, p.x));
        p.y = Math.max(GAME.PLAYER_R, Math.min(GAME.H - GAME.PLAYER_R, p.y));
        if (invuln <= 0) {
          showToast(`Gate locked — need ${GAME.NEED_SHARDS - shardsGot} more shard(s)`, "bad");
          invuln = 0.8;
        }
      }
    }

    hudShards.textContent = `◆ Shards ${shardsGot}/3`;
    hudTime.textContent = `⏱ ${timeLeft.toFixed(1)}s`;
    hudTime.classList.toggle("warn", timeLeft < 10);
  }

  function render() {
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);

    // bg + grid
    ctx.fillStyle = "#05070f";
    ctx.fillRect(-10, -10, GAME.W + 20, GAME.H + 20);
    ctx.strokeStyle = "rgba(51,246,255,0.09)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= GAME.W; x += 40) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, GAME.H);
    }
    for (let y = 0; y <= GAME.H; y += 40) {
      ctx.moveTo(0, y);
      ctx.lineTo(GAME.W, y);
    }
    ctx.stroke();

    // gate
    const gateOpen = shardsGot >= GAME.NEED_SHARDS;
    const g = level.gate;
    ctx.shadowBlur = 18;
    ctx.shadowColor = gateOpen ? "#3dff8a" : "#556";
    ctx.fillStyle = gateOpen ? "rgba(61,255,138,0.25)" : "rgba(120,130,150,0.15)";
    ctx.strokeStyle = gateOpen ? "#3dff8a" : "#66708a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(g.x, g.y, g.w, g.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = gateOpen ? "#3dff8a" : "#8b95ad";
    ctx.font = "12px monospace";
    ctx.fillText(gateOpen ? "OPEN" : "LOCK", g.x - 4, g.y - 8);

    // shards
    for (const s of level.shards) {
      if (s.taken) continue;
      const bob = Math.sin(elapsed * 3 + s.phase) * 4;
      ctx.save();
      ctx.translate(s.x, s.y + bob);
      ctx.rotate(Math.PI / 4);
      ctx.shadowBlur = 16;
      ctx.shadowColor = "#33f6ff";
      ctx.fillStyle = "#0b2b33";
      ctx.strokeStyle = "#33f6ff";
      ctx.lineWidth = 2;
      const r = 10;
      ctx.fillRect(-r / 1.4, -r / 1.4, r * 1.45, r * 1.45);
      ctx.strokeRect(-r / 1.4, -r / 1.4, r * 1.45, r * 1.45);
      ctx.restore();
    }

    // firewall bars
    for (const w of level.walls) {
      ctx.shadowBlur = 14;
      ctx.shadowColor = "#ff3d5e";
      ctx.fillStyle = "rgba(255,61,94,0.35)";
      ctx.strokeStyle = "#ff3d5e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(w.x, w.y, w.w, w.h, 6);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      // hazard stripes
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (w.w < w.h) {
        for (let y = w.y + 8; y < w.y + w.h; y += 16) {
          ctx.moveTo(w.x + 3, y);
          ctx.lineTo(w.x + w.w - 3, y + 8);
        }
      } else {
        for (let x = w.x + 8; x < w.x + w.w; x += 16) {
          ctx.moveTo(x, w.y + 3);
          ctx.lineTo(x + 8, w.y + w.h - 3);
        }
      }
      ctx.stroke();
    }

    // trail
    for (const t of trail) {
      if (t.a <= 0) continue;
      ctx.globalAlpha = Math.max(0, t.a) * 0.5;
      ctx.fillStyle = "#33f6ff";
      ctx.beginPath();
      ctx.arc(t.x, t.y, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // player (glowing cursor)
    const p = level.player;
    const blink = invuln > 0 && Math.floor(elapsed * 12) % 2 === 0;
    ctx.globalAlpha = blink ? 0.35 : 1;
    ctx.shadowBlur = 22;
    ctx.shadowColor = "#7df9ff";
    const grad = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 22);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.35, "#33f6ff");
    grad.addColorStop(1, "rgba(51,246,255,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
    // cursor ring (arrow hint)
    ctx.strokeStyle = "#ff3df0";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, GAME.PLAYER_R + 3, elapsed * 2, elapsed * 2 + Math.PI * 1.4);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // floating damage text at point of impact (critic fix: penalty reads where eyes are)
    for (const f of floaters) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.ttl));
      ctx.font = "bold 16px monospace";
      ctx.textAlign = "center";
      ctx.shadowBlur = 12;
      ctx.shadowColor = "#ff3d5e";
      ctx.fillStyle = "#ff6b85";
      ctx.fillText("-3s", f.x, f.y);
      ctx.shadowBlur = 0;
      ctx.textAlign = "start";
    }
    ctx.globalAlpha = 1;

    // hit flash
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,61,94,${flash * 0.9})`;
      ctx.fillRect(0, 0, GAME.W, GAME.H);
    }

    // low-time vignette
    if (timeLeft < 10 && state === "playing") {
      ctx.strokeStyle = `rgba(255,61,94,${0.4 + 0.3 * Math.sin(elapsed * 6)})`;
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, GAME.W - 6, GAME.H - 6);
    }

    ctx.restore();
  }

  hudShards.textContent = "◆ Shards 0/3";
  setOverlay(
    "Signal Sprites: Neon Relay",
    `<p>Pilot the glowing cursor. Collect <b>3 signal shards ◆</b>, dodge the red <b>firewall bars</b>, then reach the green <b>relay gate</b> before the timer hits zero.</p><p class="controls-hint">Move: <b>WASD / Arrows</b> · or <b>hold mouse / touch</b> to steer toward pointer · <b>Enter/Space</b> to start</p>`,
    "Start Run",
    true
  );
  requestAnimationFrame(loop);
}
