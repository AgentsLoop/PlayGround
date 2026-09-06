export function initAudio() {
  let C = null, master = null, nbuf = null;
  function ac() {
    if (!C) {
      C = new (window.AudioContext || window.webkitAudioContext)();
      master = C.createGain(); master.gain.value = 0.5; master.connect(C.destination);
      nbuf = C.createBuffer(1, C.sampleRate, C.sampleRate);
      const d = nbuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const resume = () => { if (C.state === 'suspended') C.resume(); };
      addEventListener('pointerdown', resume); addEventListener('keydown', resume);
    }
    return C;
  }
  function tone(f0, f1, dur, type = 'square', vol = 0.3, when = 0) {
    try {
      const c = ac(), t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
    } catch { /* audio unavailable */ }
  }
  function noise(dur, vol = 0.4, fc = 1000, q = 1, when = 0) {
    try {
      const c = ac(), t = c.currentTime + when, s = c.createBufferSource();
      s.buffer = nbuf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = fc; f.Q.value = q;
      const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
    } catch { /* audio unavailable */ }
  }
  return {
    unlock() { try { ac(); } catch { /* noop */ } },
    shoot() { noise(0.12, 0.5, 3200); tone(900, 120, 0.1, 'sawtooth', 0.25); },
    enemyShoot(dist = 20) { const v = Math.max(0.03, 0.16 - dist * 0.004); tone(500, 90, 0.18, 'sawtooth', v); noise(0.1, v, 1200); },
    hit() { tone(1400, 1400, 0.06, 'square', 0.25); },
    kill() { tone(700, 1400, 0.15, 'square', 0.3); tone(1400, 2100, 0.12, 'square', 0.25, 0.08); },
    headshot() { tone(1800, 2400, 0.1, 'square', 0.3); },
    reload() { noise(0.06, 0.3, 2500, 1, 0); noise(0.06, 0.3, 1800, 1, 0.18); tone(300, 500, 0.08, 'square', 0.15, 0.32); },
    empty() { tone(1200, 900, 0.05, 'square', 0.2); },
    explosion() { noise(0.8, 0.8, 300); tone(120, 25, 0.7, 'sine', 0.6); },
    footstep() { noise(0.07, 0.12, 500); },
    hurt() { tone(220, 80, 0.25, 'sawtooth', 0.4); noise(0.2, 0.3, 600); },
    click() { tone(900, 900, 0.05, 'square', 0.2); },
    wave() { tone(300, 600, 0.3, 'square', 0.25); tone(450, 900, 0.3, 'square', 0.2, 0.2); }
  };
}
