(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  // Logical game size - canvas bitmap is scaled for HiDPI / responsive container
  const W = 960, H = 600;
  let dpr = window.devicePixelRatio || 1;
  let scaleX = 1, scaleY = 1;
  function resizeCanvas(){
    dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    // CSS size -> bitmap size at device pixel ratio
    const bw = Math.max(1, Math.round(rect.width * dpr));
    const bh = Math.max(1, Math.round(rect.height * dpr));
    if(canvas.width !== bw || canvas.height !== bh){
      canvas.width = bw;
      canvas.height = bh;
    }
    scaleX = canvas.width / W;
    scaleY = canvas.height / H;
  }
  // initial sync and listeners for responsive / HiDPI
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 100));
  // handle devicePixelRatio changes (e.g., moving window between screens)
  if(window.matchMedia){
    try{
      const mql = window.matchMedia(`(resolution: ${dpr}dppx)`);
      if(mql.addEventListener) mql.addEventListener('change', resizeCanvas);
      else if(mql.addListener) mql.addListener(resizeCanvas);
    }catch(_){}
  }

  // UI refs
  const scoreEl = document.getElementById('score');
  const timerEl = document.getElementById('timer');
  const livesEl = document.getElementById('lives');
  const lightFill = document.getElementById('lightFill');
  const startScreen = document.getElementById('startScreen');
  const gameOverScreen = document.getElementById('gameOverScreen');
  const endTitle = document.getElementById('endTitle');
  const endDesc = document.getElementById('endDesc');
  const finalScore = document.getElementById('finalScore');
  const finalPollen = document.getElementById('finalPollen');
  const finalTime = document.getElementById('finalTime');
  const startBtn = document.getElementById('startBtn');
  const restartBtn = document.getElementById('restartBtn');
  const pauseHint = document.getElementById('pauseHint');

  // Game state
  let state = 'start'; // start, playing, paused, gameover
  let score = 0, lives = 3, timeLeft = 60, pollenCollected = 0;
  let lightBoostTimer = 0;
  const BASE_LIGHT = 110;
  const BOOST_LIGHT = 185;
  const BOOST_DURATION = 2.0;

  const moth = {
    x: W/2, y: H/2, vx: 0, vy: 0,
    r: 14,
    angle: 0,
    invuln: 0
  };

  let pollen = [];
  let spiders = [];
  let particles = [];
  let foliage = [];
  let drift = 0;
  let shake = 0;

  const keys = new Set();
  let pointerActive = false;
  let pointerPos = { x: W/2, y: H/2 };

  // ---- Input ----
  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    const isMove = ['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(k);
    const isSpace = k === ' ' || e.code === 'Space';
    const isSpecial = ['p','r',' '].includes(k) || e.code === 'Space' || e.key === 'Escape';
    if (isMove || isSpecial || k === ' ') e.preventDefault();
    // normalize space
    const nk = (isSpace ? ' ' : k);
    keys.add(nk);

    if (nk === ' ') {
      if (state === 'start') { e.preventDefault(); startGame(); return; }
      if (state === 'gameover') { e.preventDefault(); startGame(); return; }
      if (state === 'playing') { /* allow jump? no */ }
      if (state === 'paused') { togglePause(); return; }
    }
    if (nk === 'r') {
      if (state === 'gameover' || state === 'playing' || state === 'paused') {
        startGame();
      }
    }
    if (nk === 'p') {
      if (state === 'playing') togglePause();
      else if (state === 'paused') togglePause();
    }
    if (e.key === 'Escape' && state === 'playing') togglePause();
  });
  window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    const isSpace = k === ' ' || e.code === 'Space';
    const nk = (isSpace ? ' ' : k);
    keys.delete(nk);
    // also delete raw space variants
    if (nk === ' ') { keys.delete(' '); keys.delete('space'); }
  });
  // prevent context menu on right drag
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // Pointer / touch - precise canvas mapping
  function canvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    let cx, cy;
    if (e.touches && e.touches[0]) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
    else if (e.changedTouches && e.changedTouches[0]) { cx = e.changedTouches[0].clientX; cy = e.changedTouches[0].clientY; }
    else { cx = e.clientX; cy = e.clientY; }
    // guard rect zero
    const rw = rect.width || W;
    const rh = rect.height || H;
    return {
      x: (cx - rect.left) / rw * W,
      y: (cy - rect.top) / rh * H
    };
  }
  function onPointerDown(e){
    // only react if playing or start? allow steering in all but gameover
    if(state === 'gameover') return;
    pointerActive = true;
    pointerPos = canvasPos(e);
    try{ canvas.setPointerCapture(e.pointerId); }catch(_){}
    // If on start screen, don't steal click from button
    if(e.target === canvas) e.preventDefault();
  }
  function onPointerMove(e){
    if(!pointerActive) return;
    pointerPos = canvasPos(e);
    // prevent scrolling while dragging
    if(state==='playing') e.preventDefault();
  }
  function onPointerUp(e){
    pointerActive = false;
    try{ canvas.releasePointerCapture(e.pointerId);}catch(_){}
  }
  canvas.addEventListener('pointerdown', onPointerDown, {passive:false});
  canvas.addEventListener('pointermove', onPointerMove, {passive:false});
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', () => pointerActive = false);
  canvas.addEventListener('pointerleave', () => { /* keep active if captured */ });
  // Touch fallback for older browsers
  canvas.addEventListener('touchstart', e=>{ pointerActive=true; pointerPos=canvasPos(e); if(state==='playing') e.preventDefault(); }, {passive:false});
  canvas.addEventListener('touchmove', e=>{ if(pointerActive) { pointerPos=canvasPos(e); if(state==='playing') e.preventDefault(); }}, {passive:false});
  canvas.addEventListener('touchend', ()=> pointerActive=false, {passive:true});

  startBtn.addEventListener('click', startGame);
  restartBtn.addEventListener('click', startGame);
  // also click on canvas to start when in start/gameover
  canvas.addEventListener('click', ()=>{
    if(state==='start') startGame();
  });

  function togglePause() {
    if (state === 'playing') { state = 'paused'; pauseHint.classList.remove('hidden'); }
    else if (state === 'paused') { state = 'playing'; pauseHint.classList.add('hidden'); lastTime = performance.now(); }
  }

  function rand(a,b){ return a + Math.random()*(b-a); }

  function initFoliage(){
    foliage.length = 0;
    for(let i=0;i<30;i++){
      foliage.push({
        x: rand(0,W), y: rand(0,H),
        r: rand(16, 58),
        type: Math.floor(rand(0,3)),
        sway: rand(0, Math.PI*2),
        dark: rand(0.3,0.9)
      });
    }
  }
  function spawnPollen(n=7){
    pollen.length = 0;
    for(let i=0;i<n;i++) addPollen();
  }
  function addPollen(){
    let tries=0;
    while(tries<50){
      const x = rand(42, W-42), y = rand(72, H-42);
      const distMoth = Math.hypot(x-moth.x, y-moth.y);
      // avoid spawning too close to moth and overlapping other pollen
      let tooClose = distMoth < 110;
      for(const p of pollen){ if(Math.hypot(p.x-x,p.y-y) < 38) { tooClose=true; break; } }
      if(!tooClose){
        pollen.push({ x, y, r: 10, phase: rand(0, Math.PI*2), pulse: rand(0,6.28) });
        return;
      }
      tries++;
    }
    pollen.push({ x: rand(42,W-42), y: rand(72,H-42), r: 10, phase: rand(0,Math.PI*2), pulse:0 });
  }
  function spawnSpiders(){
    spiders.length = 0;
    const count = 4;
    for(let i=0;i<count;i++){
      // spawn away from moth
      let x,y,tries=0;
      do { x=rand(80,W-80); y=rand(80,H-80); tries++; } while(Math.hypot(x-moth.x,y-moth.y)<160 && tries<20);
      spiders.push({
        x, y,
        vx: rand(-1,1)*60, vy: rand(-1,1)*60,
        r: 16 + (i%2)*4,
        legPhase: rand(0, Math.PI*2),
        dir: rand(0, Math.PI*2)
      });
    }
  }

  function startGame(){
    score = 0; lives = 3; timeLeft = 60; pollenCollected = 0;
    lightBoostTimer = 0;
    moth.x = W/2; moth.y = H/2; moth.vx = 0; moth.vy = 0; moth.invuln = 0; moth.angle = 0;
    particles.length = 0;
    drift = 0; shake = 0;
    spawnPollen(7);
    spawnSpiders();
    initFoliage();
    state = 'playing';
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    pauseHint.classList.add('hidden');
    updateHUD();
    lastTime = performance.now();
    // ensure pointer not stuck
    pointerActive = false;
  }

  function updateHUD(){
    scoreEl.textContent = String(score);
    // precise timer display - clamp 0..60, show one decimal
    const t = Math.max(0, timeLeft);
    timerEl.textContent = t.toFixed(1);
    timerEl.classList.toggle('warn', t <= 10 && state==='playing');
    livesEl.textContent = '♥'.repeat(Math.max(0,lives)) + '♡'.repeat(3 - Math.max(0,lives));
    // smooth light bar: 38% base, 100% at full boost, interpolate
    const ratio = Math.max(0, Math.min(1, lightBoostTimer / BOOST_DURATION));
    const pct = 38 + ratio * 62; // 38..100
    lightFill.style.width = pct.toFixed(1) + '%';
    lightFill.style.opacity = ratio>0 ? '1' : '0.72';
    lightFill.style.boxShadow = ratio>0 ? '0 0 8px rgba(246,229,141,0.85)' : 'none';
  }

  function addParticles(x,y, color, n=10){
    for(let i=0;i<n;i++){
      particles.push({
        x, y,
        vx: rand(-140,140), vy: rand(-160,30),
        life: rand(0.32,0.75), maxLife: 0.75,
        r: rand(2.2,5.2), color
      });
    }
  }

  function damage(){
    if(moth.invuln > 0) return;
    lives = Math.max(0, lives-1);
    moth.invuln = 1.45;
    addParticles(moth.x, moth.y, '#ff6b81', 16);
    // directional knockback away from nearest spider
    let nx=rand(-1,1), ny=rand(-1,1);
    let nearest=null, nd=1e9;
    for(const s of spiders){ const d=Math.hypot(s.x-moth.x,s.y-moth.y); if(d<nd){ nd=d; nearest=s; } }
    if(nearest && nd<80){
      nx = (moth.x - nearest.x)/ (nd||1);
      ny = (moth.y - nearest.y)/ (nd||1);
    } else {
      const l=Math.hypot(nx,ny)||1; nx/=l; ny/=l;
    }
    moth.vx += nx*260; moth.vy += ny*260;
    if(lives <= 0){
      timeLeft = Math.max(0,timeLeft);
      endGame(false);
    }
    shake = 1.0;
    updateHUD();
  }

  function endGame(timeout){
    if(state==='gameover') return;
    state = 'gameover';
    finalScore.textContent = score;
    finalPollen.textContent = pollenCollected;
    const elapsed = (60 - Math.max(0,timeLeft));
    finalTime.textContent = elapsed.toFixed(1) + 's';
    if(lives <= 0){
      endTitle.textContent = 'Caught in the Web';
      endDesc.textContent = 'The spiders claimed the garden. Your lantern flickers out.';
    } else if (timeout){
      endTitle.textContent = 'Dawn Breaks';
      let rank = 'Novice Moth';
      if(score >= 120) rank='Luna Empress';
      else if(score >= 80) rank='Lantern Keeper';
      else if(score >= 40) rank='Pollen Dancer';
      endDesc.textContent = `Night is over — you gathered ${pollenCollected} pollen. Rank: ${rank}.`;
    } else {
      endTitle.textContent = 'Night Falls';
      endDesc.textContent = `You scored ${score} points.`;
    }
    gameOverScreen.classList.remove('hidden');
    pauseHint.classList.add('hidden');
    updateHUD();
  }

  // Physics update
  function update(dt){
    if(state !== 'playing') return;
    drift += dt;
    if(shake>0) shake = Math.max(0, shake - dt*3.2);

    // timer: high precision, clamp, end if zero
    timeLeft -= dt;
    if(timeLeft <= 0){ timeLeft = 0; updateHUD(); endGame(true); return; }
    if(lightBoostTimer > 0) lightBoostTimer = Math.max(0, lightBoostTimer - dt);
    if(moth.invuln > 0) moth.invuln = Math.max(0, moth.invuln - dt);

    // input -> velocity
    const speed = 240; // px/s
    let ax = 0, ay = 0;
    if(keys.has('arrowup') || keys.has('w')) ay -= 1;
    if(keys.has('arrowdown') || keys.has('s')) ay += 1;
    if(keys.has('arrowleft') || keys.has('a')) ax -= 1;
    if(keys.has('arrowright') || keys.has('d')) ax += 1;
    const usingKeys = (ax!==0 || ay!==0);

    // pointer steering — only if not using keys, and pointer is active
    // also allow pointer even during idle to show responsiveness
    if(pointerActive && !usingKeys && state==='playing'){
      const dx = pointerPos.x - moth.x, dy = pointerPos.y - moth.y;
      const d = Math.hypot(dx,dy);
      if(d > 5){
        const nx = dx / d, ny = dy / d;
        const s = Math.min(1, d/78); // distance-scaled intensity 0..1
        ax = nx * s; ay = ny * s;
      }
    }

    // Apply movement
    if(ax !==0 || ay !==0){
      let len = Math.hypot(ax,ay);
      // Normalize only if >1 (keyboard diagonal), preserve pointer scaling <1
      if(len > 1){ ax/=len; ay/=len; len=1; }
      const accel = 1500;
      // For pointer, scale accel by len (s) so approach slows near target
      const effAccel = usingKeys ? accel : accel * len;
      moth.vx += ax * effAccel * dt;
      moth.vy += ay * effAccel * dt;
      // angle faces movement; for pointer with small s, keep gentle
      if(len > 0.12) moth.angle = Math.atan2(ay, ax);
    }
    // friction / damping
    const friction = 7.2;
    moth.vx -= moth.vx * friction * dt;
    moth.vy -= moth.vy * friction * dt;
    // clamp max speed (slightly faster during boost)
    const spd = Math.hypot(moth.vx, moth.vy);
    const maxSpd = speed * (lightBoostTimer>0 ? 1.12 : 1);
    if(spd > maxSpd){
      moth.vx = moth.vx / spd * maxSpd;
      moth.vy = moth.vy / spd * maxSpd;
    }
    moth.x += moth.vx * dt;
    moth.y += moth.vy * dt;
    // bounds with soft wall (top pad leaves HUD readable)
    const pad = moth.r + 6;
    const topPad = 46;
    const nx = Math.max(pad, Math.min(W - pad, moth.x));
    const ny = Math.max(topPad, Math.min(H - pad, moth.y));
    const hitX = (nx !== moth.x);
    const hitY = (ny !== moth.y);
    moth.x = nx; moth.y = ny;
    if(hitX) moth.vx *= -0.35;
    if(hitY) moth.vy *= -0.35;

    // update pollen float
    for(const p of pollen){
      p.phase += dt * 2.2;
      p.pulse += dt * 3.1;
    }
    // collisions pollen - collect
    for(let i=pollen.length-1;i>=0;i--){
      const p = pollen[i];
      const yoff = Math.sin(p.phase)*5;
      const d = Math.hypot(p.x - moth.x, (p.y + yoff) - moth.y);
      if(d < moth.r + p.r + 7){
        score += 10;
        pollenCollected++;
        lightBoostTimer = BOOST_DURATION;
        addParticles(p.x, p.y + yoff, '#f6e58d', 13);
        // subtle extra light pulse
        pollen.splice(i,1);
        addPollen();
        updateHUD();
      }
    }

    // spiders wander + chase when light boosted
    const boostRatio = lightBoostTimer / BOOST_DURATION;
    const lightRadNow = BASE_LIGHT + (BOOST_LIGHT - BASE_LIGHT)* boostRatio;
    for(const s of spiders){
      s.legPhase += dt * (9 + boostRatio*4);
      // random drift
      s.dir += rand(-0.75,0.75) * dt;
      const dx = moth.x - s.x, dy = moth.y - s.y;
      const dist = Math.hypot(dx,dy) || 1;
      // chase more aggressively when boosted, but also slight base chase when very close
      let chaseStrength = 0;
      if(dist < 320 && boostRatio>0.05) chaseStrength = 0.95;
      else if(dist < 90) chaseStrength = 0.25;
      if(chaseStrength>0){
        s.vx += (dx/dist) * 96 * chaseStrength * dt;
        s.vy += (dy/dist) * 96 * chaseStrength * dt;
      } else {
        s.vx += Math.cos(s.dir) * 44 * dt;
        s.vy += Math.sin(s.dir) * 44 * dt;
      }
      // drag
      s.vx *= (1 - 0.92*dt);
      s.vy *= (1 - 0.92*dt);
      // clamp spider speed
      const sp = Math.hypot(s.vx,s.vy);
      const ms = 88 + boostRatio*18;
      if(sp > ms){ s.vx = s.vx/sp*ms; s.vy = s.vy/sp*ms; }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      // bounce walls with direction correction
      if(s.x < s.r+6 || s.x > W - s.r -6){ s.vx *= -1; s.x = Math.max(s.r+6, Math.min(W-s.r-6, s.x)); s.dir = Math.atan2(s.vy, s.vx)+ rand(-0.2,0.2); }
      if(s.y < topPad+2 || s.y > H - s.r -6){ s.vy *= -1; s.y = Math.max(topPad+2, Math.min(H-s.r-6, s.y)); s.dir = Math.atan2(s.vy, s.vx)+ rand(-0.2,0.2); }

      // collision with moth (with slight forgiveness during invuln flash the damage() will gate)
      const d2 = Math.hypot(s.x - moth.x, s.y - moth.y);
      if(d2 < s.r + moth.r - 2){
        damage();
        // push spider back a bit to avoid sticking
        if(moth.invuln>0){
          const push = 18;
          s.x -= (dx/dist)*push;
          s.y -= (dy/dist)*push;
        }
      }
    }

    // particles
    for(let i=particles.length-1;i>=0;i--){
      const pa = particles[i];
      pa.life -= dt;
      if(pa.life <=0){ particles.splice(i,1); continue; }
      pa.x += pa.vx * dt;
      pa.y += pa.vy * dt;
      pa.vy += 190 * dt; // gravity
      pa.vx *= (1 - 1.25*dt);
    }

    updateHUD();
  }

  // Rendering
  function draw(){
    // ensure bitmap matches CSS size (covers edge after layout shifts)
    // (lightweight check - resizeCanvas is cheap if size unchanged)
    // subtle shake offset
    const shx = shake>0 ? (Math.random()-0.5)* shake*7 : 0;
    const shy = shake>0 ? (Math.random()-0.5)* shake*6 : 0;
    ctx.save();
    // Map logical 960x600 to actual bitmap size for crisp HiDPI + responsive
    ctx.scale(scaleX, scaleY);
    if(shx||shy) ctx.translate(shx, shy);

    ctx.clearRect(-10,-10,W+20,H+20);

    // background gradient
    const bg = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, 900);
    bg.addColorStop(0, '#142235');
    bg.addColorStop(0.55, '#0d1825');
    bg.addColorStop(1, '#070d14');
    ctx.fillStyle = bg;
    ctx.fillRect(0,0,W,H);

    // stars / distant fireflies
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for(let i=0;i<44;i++){
      const sx = (i*137.5) % W;
      const sy = (i*73.7) % (H*0.58) + 8;
      const a = 0.14 + Math.sin(drift*0.85 + i*1.3)*0.14 + Math.cos(i*0.9)*0.05;
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      const tw = Math.sin(drift*2 + i)*1.2;
      ctx.beginPath(); ctx.arc(sx+tw, sy + Math.sin(drift*0.7 + i)*1.5, 0.95, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // foliage silhouettes (behind)
    for(const f of foliage){
      const sway = Math.sin(drift*0.62 + f.sway)*7;
      ctx.fillStyle = `rgba(0,0,0,${0.18 + f.dark*0.18})`;
      ctx.beginPath();
      ctx.ellipse(f.x + sway, f.y, f.r*1.22, f.r*0.76, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = `rgba(20, 52, 32, ${0.22})`;
      ctx.beginPath();
      ctx.ellipse(f.x+sway+4, f.y-6, f.r*0.62, f.r*0.36, 0, 0, Math.PI*2);
      ctx.fill();
      if(f.type===1){
        ctx.fillStyle = '#1e3a2a';
        ctx.beginPath(); ctx.arc(f.x+sway, f.y - f.r*0.3, 3.2, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(246,229,141,0.18)';
        ctx.beginPath(); ctx.arc(f.x+sway, f.y - f.r*0.3, 1.4,0,Math.PI*2); ctx.fill();
      }
    }

    // border
    ctx.strokeStyle = 'rgba(246,229,141,0.07)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1,1,W-2,H-2);

    // pollen
    for(const p of pollen){
      const yoff = Math.sin(p.phase)*5;
      const pulse = 0.68 + Math.sin(p.pulse)*0.32;
      const x = p.x, y = p.y + yoff;
      // outer glow
      const g = ctx.createRadialGradient(x, y, 0, x, y, 30);
      g.addColorStop(0, `rgba(246,229,141,${0.48*pulse})`);
      g.addColorStop(0.38, `rgba(249,202,36,${0.20*pulse})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI*2); ctx.fill();
      // core
      ctx.fillStyle = '#f6e58d';
      ctx.shadowColor = '#f9ca24'; ctx.shadowBlur = 11;
      ctx.beginPath(); ctx.arc(x, y, 7.2 + pulse*1.4, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0;
      // inner bright
      ctx.fillStyle = '#fff8c4';
      ctx.beginPath(); ctx.arc(x -1, y -1.4, 2.9, 0, Math.PI*2); ctx.fill();
      // stem
      ctx.strokeStyle = 'rgba(70,110,70,0.92)';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x, y + 19); ctx.stroke();
    }

    // spiders
    for(const s of spiders){
      const wob = Math.sin(s.legPhase)*2.2;
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.beginPath(); ctx.ellipse(s.x, s.y+11, s.r*1.15, s.r*0.56, 0, 0, Math.PI*2); ctx.fill();
      // legs
      ctx.strokeStyle = '#1a1210';
      ctx.lineWidth = 2.25; ctx.lineCap = 'round';
      for(let k=-1;k<=1;k+=2){
        for(let leg=0; leg<4; leg++){
          const ang = (leg/3 -0.5)*1.15 + (k===1?0.2:-0.2);
          const a = s.dir + ang * 1.58 + wob*0.14*k;
          const len = s.r*1.38;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          const mx = s.x + Math.cos(a)*len;
          const my = s.y + Math.sin(a)*len;
          const ex = mx + Math.cos(a+0.58*k)*(len*0.62);
          const ey = my + Math.sin(a+0.58*k)*(len*0.62);
          ctx.lineTo(mx, my);
          ctx.lineTo(ex, ey);
          ctx.stroke();
        }
      }
      // body
      ctx.fillStyle = '#1e1512';
      ctx.beginPath(); ctx.ellipse(s.x, s.y+4, s.r*0.72, s.r*0.56, s.dir, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#2d1e18';
      ctx.beginPath(); ctx.arc(s.x, s.y-2, s.r*0.58, 0, Math.PI*2); ctx.fill();
      // red eyes
      ctx.fillStyle = '#ff3b30';
      ctx.shadowColor = '#ff3b30'; ctx.shadowBlur = 7;
      for(let e=-1;e<=1;e+=2){
        ctx.beginPath(); ctx.arc(s.x + e*4.2, s.y -4, 1.75, 0, Math.PI*2); ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,200,60,0.88)';
      ctx.beginPath(); ctx.arc(s.x, s.y+4, 2.3, 0, Math.PI*2); ctx.fill();
    }

    // moth
    const flutter = Math.sin(drift*18) * 0.18;
    const isInvulnFlash = moth.invuln>0 && Math.floor(moth.invuln*14)%2===0;
    ctx.save();
    ctx.translate(moth.x, moth.y);
    ctx.rotate(moth.angle + flutter*0.16);
    // invuln ring
    if(moth.invuln>0 && !isInvulnFlash){
      ctx.strokeStyle = `rgba(255,107,129,${0.55*Math.min(1,moth.invuln/1.2)})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0,0, moth.r+10 + Math.sin(drift*12)*2, 0, Math.PI*2); ctx.stroke();
    }
    if(!isInvulnFlash){
      const wingSpread = 0.76 + Math.sin(drift*16.5)*0.15;
      ctx.fillStyle = 'rgba(246,229,141,0.97)';
      ctx.strokeStyle = 'rgba(60,40,20,0.92)';
      ctx.lineWidth = 1;
      for(let side=-1; side<=1; side+=2){
        ctx.save(); ctx.scale(1, side);
        ctx.beginPath();
        ctx.moveTo(2, 0);
        ctx.bezierCurveTo(10*wingSpread, -10.5, 18.5*wingSpread, -14.5, 14*wingSpread, -2);
        ctx.bezierCurveTo(8*wingSpread, 4, 2, 2, 2, 0);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(90,50,20,0.22)';
        ctx.beginPath(); ctx.ellipse(9*wingSpread, -5, 4.2, 2.6, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(246,229,141,0.97)';
        ctx.beginPath();
        ctx.moveTo(1, 1);
        ctx.bezierCurveTo(7*wingSpread, 8.2, 12.5*wingSpread, 10.2, 8*wingSpread, 3);
        ctx.bezierCurveTo(4*wingSpread, 1, 1, 1, 1, 1);
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = '#2b1d12';
      ctx.beginPath(); ctx.ellipse(0,0, 5.2, 11.2, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#f6e58d';
      ctx.beginPath(); ctx.ellipse(0,-6, 2.25, 2.25, 0, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 1.25;
      ctx.beginPath(); ctx.moveTo(-1.5,-8); ctx.quadraticCurveTo(-5.5,-13.5, -7.2,-10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1.5,-8); ctx.quadraticCurveTo(5.5,-13.5, 7.2,-10); ctx.stroke();
      ctx.fillStyle = '#f9ca24';
      ctx.shadowColor = '#f9ca24'; ctx.shadowBlur = 9;
      ctx.beginPath(); ctx.arc(0, 3.1, 3.25, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();

    // particles
    for(const pa of particles){
      const a = Math.max(0, pa.life / pa.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = pa.color;
      ctx.beginPath(); ctx.arc(pa.x, pa.y, pa.r * (0.5 + a*0.6), 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // darkness overlay with light cutout - core mechanic
    const boostRatio = Math.max(0, Math.min(1, lightBoostTimer / BOOST_DURATION));
    const easedBoost = boostRatio; // linear is more visible; could ease but linear shows expansion clearly
    const lightR = BASE_LIGHT + (BOOST_LIGHT - BASE_LIGHT)* easedBoost;
    const pulseR = lightR + Math.sin(drift*3.1)*3.2 + (boostRatio>0 ? Math.sin(drift*7)*1.4 : 0);
    ctx.save();
    ctx.fillStyle = 'rgba(5,10,15,0.90)';
    ctx.fillRect(0,0,W,H);
    ctx.globalCompositeOperation = 'destination-out';
    const grad = ctx.createRadialGradient(moth.x, moth.y, 9, moth.x, moth.y, pulseR);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.42, 'rgba(0,0,0,0.94)');
    grad.addColorStop(0.72, 'rgba(0,0,0,0.46)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(moth.x, moth.y, pulseR, 0, Math.PI*2); ctx.fill();

    // faint pollen hints in darkness
    for(const p of pollen){
      const yoff = Math.sin(p.phase)*5;
      const pg = ctx.createRadialGradient(p.x, p.y+yoff, 0, p.x, p.y+yoff, 44);
      pg.addColorStop(0, 'rgba(0,0,0,0.58)');
      pg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(p.x, p.y+yoff, 44, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();

    // light rim highlight - stronger during boost
    const rimAlpha = 0.16 + boostRatio*0.18;
    ctx.strokeStyle = `rgba(246,229,141,${rimAlpha})`;
    ctx.lineWidth = 1.6 + boostRatio*1.0;
    ctx.beginPath(); ctx.arc(moth.x, moth.y, pulseR*0.70, 0, Math.PI*2); ctx.stroke();
    if(boostRatio>0.02){
      ctx.strokeStyle = `rgba(255,200,60,${0.10 + boostRatio*0.12})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(moth.x, moth.y, pulseR*0.92, 0, Math.PI*2); ctx.stroke();
      // extra bloom
      ctx.fillStyle = `rgba(246,229,141,${0.06*boostRatio})`;
      ctx.beginPath(); ctx.arc(moth.x, moth.y, 10, 0, Math.PI*2); ctx.fill();
    }

    // vignette
    const vig = ctx.createRadialGradient(W/2,H/2, H*0.42, W/2,H/2, H*0.98);
    vig.addColorStop(0,'rgba(0,0,0,0)'); vig.addColorStop(1,'rgba(0,0,0,0.48)');
    ctx.fillStyle = vig; ctx.fillRect(0,0,W,H);

    ctx.restore();
  }

  let lastTime = performance.now();
  let animId = 0;
  function loop(now){
    const dt = Math.min(0.033, (now - lastTime)/1000);
    lastTime = now;
    if(state === 'playing'){
      update(dt);
    } else {
      // idle drift for ambience even when start/gameover/paused
      drift += dt;
      if(shake>0) shake = Math.max(0, shake - dt*3);
      // keep HUD fresh for timer blink etc
      // light boost still decays only when playing, so no update
      if(state==='paused'){
        // optionally dim? no
      } else {
        // animate pollen float even in menus? keep subtle
        for(const p of pollen){ p.phase += dt*1.0; p.pulse += dt*1.6; }
      }
    }
    draw();
    animId = requestAnimationFrame(loop);
  }

  // start idle loop immediately for start screen ambience
  initFoliage();
  spawnPollen(7);
  spawnSpiders();
  updateHUD();
  animId = requestAnimationFrame(loop);

  // handle visibilitychange for timer correctness: pause on hidden? keep running but adjust lastTime
  document.addEventListener('visibilitychange', ()=>{
    if(document.hidden){ if(state==='playing') lastTime = performance.now(); }
    else { lastTime = performance.now(); }
  });

  // expose for tests / debugging - use getters so reassignments stay in sync
  window.__lanternMoth = {
    getState: () => state,
    getScore: () => score,
    getLives: () => lives,
    getTime: () => timeLeft,
    getLightBoost: () => lightBoostTimer,
    getLightRadius: () => BASE_LIGHT + (BOOST_LIGHT-BASE_LIGHT)*Math.max(0,Math.min(1, lightBoostTimer/BOOST_DURATION)),
    BASE_LIGHT, BOOST_LIGHT, BOOST_DURATION,
    startGame,
    get moth(){ return moth; },
    get pollen(){ return pollen; },
    get spiders(){ return spiders; },
    get particles(){ return particles; },
    get foliage(){ return foliage; },
    // also direct refs for backward compat
    _moth: moth, _pollen: pollen, _spiders: spiders
  };
})();
