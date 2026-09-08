// Synthesized audio: engine hum, weapons, explosions, pickups. No assets.
export class GameAudio {
  constructor() {
    this.ctx = null; this.muted = false; this.engineOsc = null;
    this.engineGain = null; this.engineFilter = null;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { this.ctx = null; }
    if (!this.ctx) return;
    // engine loop: sawtooth through lowpass, pitch follows speed
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(this.engineFilter).connect(this.engineGain).connect(this.ctx.destination);
    this.engineOsc.start();
  }
  setEngine(speed01, boosting) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.05, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(50 + speed01 * 130 + (boosting ? 40 : 0), t, 0.08);
  }
  toggleMute() {
    this.muted = !this.muted;
    if (this.engineGain) this.engineGain.gain.value = 0;
    return this.muted;
  }
  _burst(freq0, freq1, dur, type, vol, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, freq1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  _noise(dur, vol, lpFreq, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lpFreq;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.ctx.destination);
    src.start(t);
  }
  mg() { this._burst(900, 220, 0.09, 'square', 0.10); }
  homing() { this._burst(300, 1400, 0.35, 'sawtooth', 0.12); }
  power() { this._burst(140, 60, 0.5, 'sawtooth', 0.20); this._noise(0.4, 0.15, 900); }
  napalm() { this._noise(0.5, 0.22, 1400); this._burst(500, 90, 0.4, 'triangle', 0.14); }
  mine() { this._burst(700, 300, 0.15, 'square', 0.10); }
  special() { this._burst(180, 1800, 0.7, 'sawtooth', 0.16); this._noise(0.7, 0.18, 2500, 0.1); }
  explosion(big = 1) {
    this._noise(0.7 * big, 0.4, 500);
    this._burst(110, 28, 0.6 * big, 'sine', 0.4);
    this._burst(800, 100, 0.3, 'sawtooth', 0.12);
  }
  hit() { this._burst(1200, 500, 0.08, 'square', 0.12); }
  hurt() { this._burst(220, 70, 0.3, 'sawtooth', 0.25); this._noise(0.25, 0.2, 700); }
  pickup() { this._burst(660, 660, 0.09, 'square', 0.12); this._burst(990, 990, 0.12, 'square', 0.12, 0.09); }
  repair() { this._burst(520, 1040, 0.3, 'sine', 0.16); }
  lock() { this._burst(1500, 1500, 0.05, 'square', 0.08); }
  countBeep(final) { this._burst(final ? 880 : 440, final ? 880 : 440, final ? 0.4 : 0.15, 'square', 0.16); }
  win() { [523, 659, 784, 1046].forEach((f, i) => this._burst(f, f, 0.35, 'triangle', 0.18, i * 0.16)); }
  lose() { [400, 340, 280, 180].forEach((f, i) => this._burst(f, f * 0.9, 0.4, 'sawtooth', 0.16, i * 0.2)); }
}
