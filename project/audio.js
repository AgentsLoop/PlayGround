// Procedural WebAudio — no assets
export const AudioSys = {
  ctx:null, master:null, noiseBuf:null,
  init(){ if(this.ctx) return; const C=new (window.AudioContext||window.webkitAudioContext)();
    this.ctx=C; this.master=C.createGain(); this.master.gain.value=0.45; this.master.connect(C.destination);
    const len=C.sampleRate; const b=C.createBuffer(1,len,C.sampleRate); const d=b.getChannelData(0);
    for(let i=0;i<len;i++)d[i]=Math.random()*2-1; this.noiseBuf=b; this.wind(); },
  now(){ return this.ctx.currentTime; },
  env(g,t0,a,peak,dur){ g.gain.setValueAtTime(0.0001,t0); g.gain.linearRampToValueAtTime(peak,t0+a); g.gain.exponentialRampToValueAtTime(0.001,t0+dur); },
  noise({dur=0.2,type='lowpass',f0=4000,f1=500,peak=0.8,when=0}){ if(!this.ctx)return; const C=this.ctx,t=this.now()+when;
    const src=C.createBufferSource(); src.buffer=this.noiseBuf; src.loop=true; src.playbackRate.value=0.9+Math.random()*0.2;
    const f=C.createBiquadFilter(); f.type=type; f.frequency.setValueAtTime(f0,t); f.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);
    const g=C.createGain(); this.env(g,t,0.002,peak,dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t); src.stop(t+dur+0.05); },
  tone({type='square',f0=2000,f1=0,dur=0.06,peak=0.25,when=0}){ if(!this.ctx)return; const C=this.ctx,t=this.now()+when;
    const o=C.createOscillator(); o.type=type; o.frequency.setValueAtTime(f0,t);
    if(f1)o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);
    const g=C.createGain(); this.env(g,t,0.002,peak,dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t+dur+0.05); },
  shoot(){ this.noise({dur:0.16,f0:5200,f1:380,peak:0.9}); this.tone({type:'triangle',f0:170,f1:42,dur:0.13,peak:0.65}); },
  dryFire(){ this.tone({type:'square',f0:1100,dur:0.035,peak:0.15}); },
  reload(){ this.noise({dur:0.05,type:'bandpass',f0:2500,f1:2500,peak:0.4}); this.noise({dur:0.05,type:'bandpass',f0:1700,f1:1700,peak:0.4,when:0.2}); this.noise({dur:0.08,type:'bandpass',f0:3300,f1:3300,peak:0.5,when:0.6}); },
  hit(){ this.tone({type:'square',f0:2300,dur:0.045,peak:0.2}); },
  kill(){ this.tone({type:'square',f0:2300,dur:0.05,peak:0.22}); this.tone({type:'sawtooth',f0:320,f1:48,dur:0.28,peak:0.4,when:0.03}); this.noise({dur:0.22,f0:2100,f1:180,peak:0.32,when:0.03}); },
  hurt(){ this.tone({type:'sawtooth',f0:130,f1:65,dur:0.22,peak:0.35}); },
  step(){ this.noise({dur:0.06+Math.random()*0.04,f0:600+Math.random()*500,f1:140,peak:0.1}); },
  jump(){ this.noise({dur:0.09,f0:900,f1:300,peak:0.12}); },
  ui(){ this.tone({type:'sine',f0:620,dur:0.08,peak:0.2}); },
  wave(){ this.tone({type:'sawtooth',f0:220,f1:440,dur:0.35,peak:0.2}); this.tone({type:'sawtooth',f0:330,f1:660,dur:0.35,peak:0.15,when:0.12}); },
  wind(){ const C=this.ctx; const src=C.createBufferSource(); src.buffer=this.noiseBuf; src.loop=true;
    const f=C.createBiquadFilter(); f.type='lowpass'; f.frequency.value=380;
    const g=C.createGain(); g.gain.value=0.045;
    const lfo=C.createOscillator(); lfo.frequency.value=0.09; const lg=C.createGain(); lg.gain.value=0.028;
    lfo.connect(lg); lg.connect(g.gain); src.connect(f); f.connect(g); g.connect(this.master); src.start(); lfo.start(); }
};
