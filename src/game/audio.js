// Tiny procedural WebAudio SFX — original bleeps, no assets.
let ctx = null, muted = false;
function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function tone(freq, dur, type = 'square', vol = 0.05, slide = 0) {
  if (muted) return;
  try {
    const c = ac(), o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), c.currentTime + dur);
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g).connect(c.destination);
    o.start(); o.stop(c.currentTime + dur);
  } catch { /* audio unavailable */ }
}
export const sfx = {
  select: () => tone(660, 0.07, 'square', 0.03),
  move: () => tone(440, 0.09, 'square', 0.035, 120),
  attack: () => tone(220, 0.12, 'sawtooth', 0.04, -80),
  shoot: () => tone(880 + Math.random() * 200, 0.05, 'square', 0.016),
  boom: () => tone(90, 0.35, 'sawtooth', 0.07, -50),
  error: () => tone(160, 0.18, 'square', 0.05),
  build: () => tone(330, 0.15, 'triangle', 0.05, 110),
  ready: () => { tone(523, 0.12, 'square', 0.05); setTimeout(() => tone(784, 0.18, 'square', 0.05), 110); },
  harvest: () => tone(1200, 0.04, 'square', 0.012),
  win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'square', 0.06), i * 160)),
  lose: () => [400, 320, 240, 150].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sawtooth', 0.06), i * 180)),
  toggleMute() { muted = !muted; return muted; },
};
