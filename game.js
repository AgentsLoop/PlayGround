// RUSTBELT ARENA — last-car-standing vehicular combat. Three.js + arcade physics + synth audio.
let THREE;
try { THREE = await import('three'); }
catch(e){ try { THREE = await import('three-fallback'); } catch(e2){
  document.getElementById('loadmsg').textContent = 'Failed to load 3D engine (network needed for CDN). Check connection and reload.';
  throw e2;
}}
const $ = id => document.getElementById(id);
const clamp=(v,a,b)=>v<a?a:v>b?b:v, rand=(a,b)=>a+Math.random()*(b-a);
const TAU=Math.PI*2;
function angDiff(a,b){let d=(a-b)%TAU;if(d>Math.PI)d-=TAU;if(d<-Math.PI)d+=TAU;return d;}

// ---------- audio ----------
const AudioSys={ctx:null,muted:false,engineOsc:null,engineGain:null,
 init(){ if(this.ctx) return; try{ this.ctx=new (window.AudioContext||window.webkitAudioContext)();
  this.engineOsc=this.ctx.createOscillator(); this.engineGain=this.ctx.createGain();
  this.engineOsc.type='sawtooth'; this.engineOsc.frequency.value=40;
  this.engineGain.gain.value=0.0; this.engineOsc.connect(this.engineGain).connect(this.ctx.destination);
  this.engineOsc.start(); }catch(e){} },
 resume(){ this.init(); this.ctx&&this.ctx.state==='suspended'&&this.ctx.resume(); },
 engine(sp){ if(!this.ctx||this.muted) return; const f=35+Math.abs(sp)*3.2;
  this.engineOsc.frequency.setTargetAtTime(f,this.ctx.currentTime,.05);
  this.engineGain.gain.setTargetAtTime(.028+Math.min(.05,Math.abs(sp)*.0012),this.ctx.currentTime,.1); },
 blip(f=660,d=.08,type='square',g=.12){ if(!this.ctx||this.muted)return; const t=this.ctx.currentTime;
  const o=this.ctx.createOscillator(),gn=this.ctx.createGain(); o.type=type;o.frequency.value=f;
  gn.gain.setValueAtTime(g,t); gn.gain.exponentialRampToValueAtTime(.001,t+d);
  o.connect(gn).connect(this.ctx.destination); o.start(t);o.stop(t+d); },
 noise(d=.4,freq=800,g=.3){ if(!this.ctx||this.muted)return; const t=this.ctx.currentTime;
  const n=this.ctx.sampleRate*d, buf=this.ctx.createBuffer(1,n,this.ctx.sampleRate), ch=buf.getChannelData(0);
  for(let i=0;i<n;i++)ch[i]=(Math.random()*2-1)*(1-i/n);
  const s=this.ctx.createBufferSource();s.buffer=buf;
  const f=this.ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=freq;
  const gn=this.ctx.createGain();gn.gain.value=g; s.connect(f).connect(gn).connect(this.ctx.destination);s.start(t); },
 mg(){this.noise(.07,3200,.10);}, boom(){this.noise(.7,420,.5);this.blip(55,.5,'sine',.4);},
 hit(){this.blip(200,.06,'square',.14);}, pickup(){this.blip(880,.09);setTimeout(()=>this.blip(1320,.12),70);},
 special(){this.blip(140,.4,'sawtooth',.25);this.noise(.5,900,.3);}, count(n){this.blip(n===0?880:440,.15);}
};

// ---------- config ----------
const VEHICLES={
 vulture:{name:'VULTURE',hull:100,accel:26,top:34,turn:2.4,special:'NAPALM CONE',color:0xffb300,accent:0xff5722},
 maw:{name:'MAW',hull:150,accel:19,top:27,turn:1.9,special:'GHOST RAM',color:0xf5f0e6,accent:0xff2d2d},
 wasp:{name:'WASP',hull:70,accel:34,top:42,turn:3.1,special:'HORNET SWARM',color:0x39f5c8,accent:0x3a86ff},
};
const ARENA_HALF=105, MATCH_TIME=180;
let playerChoice='vulture';

// ---------- three setup ----------
const canvas=$('scene');
let renderer;
try{ renderer=new THREE.WebGLRenderer({canvas,antialias:true}); }
catch(e){ document.getElementById('loadmsg').innerHTML='3D unavailable (WebGL blocked). <button onclick="location.reload()">RETRY</button>'; throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x1a1210);
scene.fog=new THREE.Fog(0x1a1210,90,320);
const camera=new THREE.PerspectiveCamera(68,innerWidth/innerHeight,.1,600);
const hemi=new THREE.HemisphereLight(0xffd9a0,0x201510,.75); scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffb36b,1.6); sun.position.set(60,90,30);
sun.castShadow=true; sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-140;sun.shadow.camera.right=140;sun.shadow.camera.top=140;sun.shadow.camera.bottom=-140;
scene.add(sun);
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
addEventListener('resize',resize); resize();

// ground
{
 const g=new THREE.CircleGeometry(ARENA_HALF+26,48);
 const m=new THREE.MeshStandardMaterial({color:0x3a2f26,roughness:1});
 const ground=new THREE.Mesh(g,m); ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);
 const grid=new THREE.GridHelper(ARENA_HALF*2+40,28,0x5a4a38,0x2c251e);
 grid.position.y=.02; scene.add(grid);
 // outer walls: hazard ring
 const wallMat=new THREE.MeshStandardMaterial({color:0x77331a,roughness:.8});
 const stripe=new THREE.MeshStandardMaterial({color:0xffb300,roughness:.7,emissive:0x442200});
 for(let i=0;i<40;i++){const a=i/40*TAU,x=Math.cos(a)*(ARENA_HALF+4),z=Math.sin(a)*(ARENA_HALF+4);
  const w=new THREE.Mesh(new THREE.BoxGeometry(12,5,2),i%2?stripe:wallMat);
  w.position.set(x,2.5,z); w.lookAt(0,2.5,0); w.castShadow=true; scene.add(w);}
 // distant mesas + smoke stacks (skyline)
 for(let i=0;i<14;i++){const a=i/14*TAU+rand(-.1,.1),r=rand(170,260);
  const h=rand(20,60),mesa=new THREE.Mesh(new THREE.CylinderGeometry(rand(14,30),rand(20,38),h,7),
   new THREE.MeshStandardMaterial({color:0x241a14,roughness:1}));
  mesa.position.set(Math.cos(a)*r,h/2-2,Math.sin(a)*r); scene.add(mesa);}
 const sky=new THREE.Mesh(new THREE.SphereGeometry(480,16,12),
  new THREE.MeshBasicMaterial({color:0x2b1410,side:THREE.BackSide,fog:false})); scene.add(sky);
}

// obstacles / props
const solids=[]; // {x,z,r,mesh,hp?,barrel?,crate?}
function addSolid(x,z,r,mesh,opts={}){mesh.position.x=x;mesh.position.z=z;scene.add(mesh);solids.push({x,z,r,mesh,...opts});}
function clearArenaSolids(){ for(const s of solids)scene.remove(s.mesh); solids.length=0; }
function buildArena(){
 clearArenaSolids();
 const contCols=[0x7a2d12,0x2d5a7a,0x6a7a2d,0x5a2d7a];
 const spots=[[-60,-60],[60,-60],[-60,60],[60,60],[0,-70],[0,70],[-70,0],[70,0],[-30,-20],[30,25],[-25,45],[35,-45]];
 spots.forEach(([x,z],i)=>{
  const c=new THREE.Mesh(new THREE.BoxGeometry(10,4,4.4),
   new THREE.MeshStandardMaterial({color:contCols[i%4],roughness:.85}));
  c.position.y=2;c.rotation.y=(i*0.7)%Math.PI;c.castShadow=c.receiveShadow=true; addSolid(x,z,6,c,{hp:40,crate:false});
 });
 // pillars
 for(let i=0;i<6;i++){const a=i/6*TAU+.4;
  const p=new THREE.Mesh(new THREE.CylinderGeometry(2.5,3,14,8),
   new THREE.MeshStandardMaterial({color:0x4a4f58,roughness:.9}));
  p.position.y=7; addSolid(Math.cos(a)*55,Math.sin(a)*55,4,p,{hp:60});}
 window.__barrelSpots=[[-15,-55],[15,55],[-55,15],[55,-15],[-20,10],[20,-10],[0,0],[-80,-20],[80,20],[-40,75]];
 spawnBarrels();
}
buildArena(); // initial static geometry (ramps below are visual + boost pads)
 // ramps (visual boost pads: driving over grants turbo + hop flash)
 const rampMat=new THREE.MeshStandardMaterial({color:0x8a6a1f,roughness:.7,emissive:0x332200});
 window.__ramps=[];
 [[-45,0,.5],[45,0,-.5],[0,-45,0],[0,45,Math.PI]].forEach(([x,z,ry])=>{
  const r=new THREE.Mesh(new THREE.BoxGeometry(16,1.2,8),rampMat);
  r.position.set(x,.6,z); r.rotation.y=ry; r.rotation.z=.12; r.castShadow=true; scene.add(r);
  window.__ramps.push({x,z});
 });
function spawnBarrels(){ for(const [x,z] of window.__barrelSpots){
 if(solids.some(s=>s.barrel&&Math.hypot(s.x-x,s.z-z)<2))continue;
 const m=new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.2,2.6,10),
  new THREE.MeshStandardMaterial({color:0xcc2200,roughness:.6,emissive:0x550000}));
 m.position.y=1.3; m.castShadow=true; addSolid(x+rand(-2,2),z+rand(-2,2),2,m,{hp:15,barrel:true});
}}

// ---------- car meshes ----------
function buildCarMesh(cfg,isPlayer){
 const g=new THREE.Group();
 const bodyMat=new THREE.MeshStandardMaterial({color:cfg.color,roughness:.5,metalness:.35});
 const accMat=new THREE.MeshStandardMaterial({color:cfg.accent,roughness:.5,emissive:cfg.accent,emissiveIntensity:.25});
 const body=new THREE.Mesh(new THREE.BoxGeometry(2.6,1,4.6),bodyMat); body.position.y=1; body.castShadow=true; g.add(body);
 const cab=new THREE.Mesh(new THREE.BoxGeometry(2.1,.9,2),new THREE.MeshStandardMaterial({color:0x14161c,roughness:.3,metalness:.5}));
 cab.position.set(0,1.9,-.3); cab.castShadow=true; g.add(cab);
 const nose=new THREE.Mesh(new THREE.BoxGeometry(2.7,.5,1),accMat); nose.position.set(0,.9,2.6); g.add(nose);
 // clown-head style ornament for MAW, spoiler for WASP, plow for VULTURE
 if(cfg===VEHICLES.maw){const h=new THREE.Mesh(new THREE.SphereGeometry(.9,12,10),
   new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xff2222,emissiveIntensity:.35}));h.position.set(0,2.9,.6);g.add(h);}
 if(cfg===VEHICLES.wasp){const s=new THREE.Mesh(new THREE.BoxGeometry(2.8,.18,1),accMat);s.position.set(0,1.9,-2.3);g.add(s);}
 if(cfg===VEHICLES.vulture){const p=new THREE.Mesh(new THREE.BoxGeometry(2.9,.7,.4),accMat);p.position.set(0,.7,2.9);g.add(p);}
 const wg=new THREE.CylinderGeometry(.55,.55,.5,12), wm=new THREE.MeshStandardMaterial({color:0x0c0d10,roughness:.9});
 const wheels=[];
 [[-1.35,1.5],[1.35,1.5],[-1.35,-1.5],[1.35,-1.5]].forEach(([x,z])=>{
  const w=new THREE.Mesh(wg,wm); w.rotation.z=Math.PI/2; w.position.set(x,.55,z); w.castShadow=true; g.add(w); wheels.push(w);});
 // gun barrels
 const gun=new THREE.Mesh(new THREE.BoxGeometry(.18,.18,1.6),new THREE.MeshStandardMaterial({color:0x111111}));
 gun.position.set(.8,1.5,2.8); g.add(gun);
 const gun2=gun.clone(); gun2.position.x=-.8; g.add(gun2);
 // name tag ring for player readability
 if(isPlayer){const ring=new THREE.Mesh(new THREE.TorusGeometry(3.4,.12,8,32),
   new THREE.MeshBasicMaterial({color:0x39f5c8})); ring.rotation.x=Math.PI/2; ring.position.y=.15; g.add(ring);}
 // headlight
 const hl=new THREE.PointLight(cfg.accent,.6,18); hl.position.set(0,2,3); g.add(hl);
 g.userData.wheels=wheels;
 return g;
}

// ---------- entities ----------
const cars=[], projectiles=[], mines=[], pickups=[], particles=[];
function makeCar(name,cfg,x,z,heading,isPlayer){
 const mesh=buildCarMesh(cfg,isPlayer); scene.add(mesh);
 const c={name,cfg,mesh,x,z,heading,speed:0,hp:cfg.hull,maxhp:cfg.hull,alive:true,
  isPlayer,missiles:3,mines:1,turbo:100,heat:0,mgUp:0,special:50,fireCd:0,misCd:0,
  ai:{t:0,mode:'hunt',target:null,wander:rand(0,TAU)},kills:0,invuln:0,burn:0,wheelSpin:0,lastDmgBy:null,lastDmgT:0};
 mesh.position.set(x,0,z); cars.push(c); return c;
}
function spawnPickups(){
 const kinds=['repair','missiles','mines','turbo','mgup'];
 const spots=[[-90,-90],[90,90],[-90,90],[90,-90],[0,-90],[0,90],[-90,0],[90,0],[-40,-40],[40,40]];
 for(const [i,[x,z]] of spots.entries()){
  const kind=kinds[i%kinds.length];
  const col={repair:0x39f55a,missiles:0xffb300,mines:0x3a86ff,turbo:0x39f5c8,mgup:0xff2d2d}[kind];
  const m=new THREE.Mesh(new THREE.OctahedronGeometry(1.1),
   new THREE.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:.7}));
  m.position.set(x+rand(-4,4),1.2,z+rand(-4,4)); scene.add(m);
  pickups.push({kind,mesh:m,x:m.position.x,z:m.position.z,taken:false,respawn:0});
 }
}
function spawnParticles(pos,color,n=14,spd=12,life=.7,size=.5){
 for(let i=0;i<n;i++){
  const m=new THREE.Mesh(new THREE.BoxGeometry(size,size,size),
   new THREE.MeshBasicMaterial({color,transparent:true}));
  m.position.copy(pos); scene.add(m);
  particles.push({mesh:m,vx:rand(-spd,spd),vy:rand(2,spd),vz:rand(-spd,spd),life:rand(.3,life),age:0,grav:22});
 }
}
function explosion(x,z,big=false){
 AudioSys.boom(); shake(Math.min(1,big?1:.5));
 const p=new THREE.Vector3(x,1.5,z);
 spawnParticles(p,0xffb300,big?30:16,big?20:12,big?1:.7,.6);
 spawnParticles(p,0xff2d2d,big?20:10,10,.6,.45);
 spawnParticles(p,0x222222,big?16:8,8,1.2,.8);
 const flash=new THREE.PointLight(0xff7722,big?60:30,40); flash.position.set(x,4,z); scene.add(flash);
 setTimeout(()=>scene.remove(flash),180);
}
let camShake=0; function shake(v){camShake=Math.min(1.2,camShake+v);}

// damage
function damage(car,amt,by){
 if(!car.alive||car.invuln>0)return;
 if(car.isPlayer) { $('vignette').style.opacity=.9; setTimeout(()=>$('vignette').style.opacity=0,220); }
 car.hp-=amt; car.lastDmgBy=by||null; car.lastDmgT=performance.now();
 AudioSys.hit(); hitmark(car.isPlayer?false:true);
 spawnParticles(new THREE.Vector3(car.x,1.5,car.z),0xffaa00,6,8,.4,.35);
 if(car.hp<=0){ kill(car,by); }
}
function hitmark(show){ if(!show)return; const h=$('hitmarker'); h.classList.remove('show'); void h.offsetWidth; h.classList.add('show'); }
function kill(car,by){
 car.alive=false; car.hp=0; explosion(car.x,car.z,true);
 car.mesh.visible=false;
 feed(`${by?by.name:'☠ ARENA'} ⟹ 💥 ${car.name}`);
 if(by&&by!==car){by.kills++; if(by.isPlayer){$('kills').textContent='KILLS '+by.kills; toast(`${car.name} DESTROYED!`);}}
 checkEnd();
}
function feed(t){const d=document.createElement('div');d.className='feed';d.textContent=t;
 const f=$('killfeed');f.prepend(d);while(f.children.length>5)f.lastChild.remove();
 setTimeout(()=>d.remove(),6000);}
let toastT=null;
function toast(t){const el=$('toast');el.textContent=t;clearTimeout(toastT);toastT=setTimeout(()=>el.textContent='',1600);}

// ---------- input ----------
const keys={};
addEventListener('keydown',e=>{keys[e.code]=true;
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
 if(e.code==='KeyM')toggleMute(); if(e.code==='KeyP'||e.code==='Escape')togglePause();
 if(e.code==='KeyR'&&state==='over')restart();
 if(e.code==='KeyQ'||e.code==='KeyF')fireSpecial(player);
 if(e.code==='KeyL'||e.code==='KeyE')dropMine(player);
});
addEventListener('keyup',e=>keys[e.code]=false);
addEventListener('mousedown',e=>{AudioSys.resume(); if(state!=='play')return;
 if(e.button===0)mbDown[0]=true; if(e.button===2)mbDown[2]=true;});
addEventListener('mouseup',e=>{if(e.button===0)mbDown[0]=false;if(e.button===2)mbDown[2]=false;});
addEventListener('contextmenu',e=>e.preventDefault());
const mbDown={0:false,2:false};
const touch={gas:false,brake:false,left:false,right:false,mg:false,mis:false,turbo:false};
document.querySelectorAll('#touch button').forEach(b=>{
 const k=b.dataset.t;
 const on=e=>{e.preventDefault();AudioSys.resume();
  if(k==='gas')touch.gas=true;if(k==='brake')touch.brake=true;
  if(k==='left')touch.left=true;if(k==='right')touch.right=true;
  if(k==='mg')touch.mg=true;if(k==='mis')fireMissile(player);if(k==='spec')fireSpecial(player);
  if(k==='turbo')touch.turbo=true;if(k==='mine')dropMine(player);if(k==='pause')togglePause();};
 const off=e=>{e.preventDefault();
  if(k==='gas')touch.gas=false;if(k==='brake')touch.brake=false;
  if(k==='left')touch.left=false;if(k==='right')touch.right=false;if(k==='mg')touch.mg=false;if(k==='turbo')touch.turbo=false;};
 b.addEventListener('pointerdown',on);b.addEventListener('pointerup',off);b.addEventListener('pointerleave',off);
});
function toggleMute(){AudioSys.muted=!AudioSys.muted;$('muteBtn').textContent=AudioSys.muted?'🔇':'🔊';}
$('muteBtn').onclick=()=>{AudioSys.resume();toggleMute();};

// ---------- weapons ----------
function fireMG(car){
 if(!car.alive||car.heat>=100||car.fireCd>0)return;
 car.fireCd=car.mgUp>0?.11:.16; car.heat=Math.min(100,car.heat+(car.mgUp>0?5:7));
 if(car.isPlayer)AudioSys.mg();
 // tracer
 const dx=Math.sin(car.heading),dz=Math.cos(car.heading);
 const from=new THREE.Vector3(car.x+dx*3,1.6,car.z+dz*3);
 // find target in cone
 let best=null,bd=70;
 for(const o of cars){if(o===car||!o.alive)continue;
  const ox=o.x-car.x,oz=o.z-car.z,d=Math.hypot(ox,oz); if(d>bd||d<2)continue;
  const ang=Math.atan2(ox,oz),diff=Math.abs(angDiff(ang,car.heading));
  if(diff<.22){best=o;bd=d;}}
 spawnParticles(from,0xffe28a,2,2,.15,.18);
 if(best){ // occlusion: blocked by props/walls?
  let blocked=false;
  for(const sl of solids){ // segment-point distance from muzzle to target
   const px=best.x-car.x,pz=best.z-car.z,L2=px*px+pz*pz;
   const t=L2>0?clamp(((sl.x-car.x)*px+(sl.z-car.z)*pz)/L2,0,1):0;
   const cx=car.x+px*t,cz=car.z+pz*t;
   if(Math.hypot(sl.x-cx,sl.z-cz)<sl.r*.9){blocked=true;break;}
  }
  if(!blocked){damage(best,car.mgUp>0?9:6,car); car.special=Math.min(100,car.special+2);}
  else spawnParticles(new THREE.Vector3((car.x+best.x)/2,1.6,(car.z+best.z)/2),0x888888,3,5,.25,.25);
 }
}
function fireMissile(car){
 if(!car.alive||car.missiles<=0||car.misCd>0||state!=='play')return;
 car.missiles--;car.misCd=.8;
 const dx=Math.sin(car.heading),dz=Math.cos(car.heading);
 const mesh=new THREE.Mesh(new THREE.ConeGeometry(.35,1.4,8),
  new THREE.MeshStandardMaterial({color:0xffb300,emissive:0xff5500,emissiveIntensity:.8}));
 mesh.position.set(car.x+dx*3,1.4,car.z+dz*3); scene.add(mesh);
 // target: nearest alive enemy roughly ahead
 let tgt=null,bd=120;
 for(const o of cars){if(o===car||!o.alive)continue;const d=Math.hypot(o.x-car.x,o.z-car.z);if(d<bd){bd=d;tgt=o;}}
 projectiles.push({mesh,x:mesh.position.x,z:mesh.position.z,y:1.4,heading:car.heading,speed:52,life:4,dmg:35,owner:car,target:tgt,small:false});
 AudioSys.blip(300,.2,'sawtooth',.2);
 if(car.isPlayer)updateAmmo();
}
function dropMine(car){
 if(!car.alive||car.mines<=0||state!=='play')return;
 car.mines--;
 const m=new THREE.Mesh(new THREE.CylinderGeometry(.8,.9,.5,10),
  new THREE.MeshStandardMaterial({color:0x222831,emissive:0xff2222,emissiveIntensity:.6}));
 const bx=car.x-Math.sin(car.heading)*4,bz=car.z-Math.cos(car.heading)*4;
 m.position.set(bx,.3,bz); scene.add(m);
 mines.push({mesh:m,x:bx,z:bz,owner:car,arm:.6,life:30});
 AudioSys.blip(180,.15); if(car.isPlayer)updateAmmo();
}
function fireSpecial(car){
 if(!car.alive||!car||car.special<100||state!=='play')return;
 car.special=0; AudioSys.special();
 const n=car.name;
 if(car.cfg===VEHICLES.maw||n.includes('MAW')){ // ghost ram: burst + invuln
  car.invuln=2.2;car.turboBurst=2.0;explosion(car.x,car.z);toast(car.isPlayer?'GHOST RAM!!':'MAW RAMS!'); }
 else if(car.cfg===VEHICLES.wasp||n.includes('WASP')){
  for(let i=0;i<5;i++)setTimeout(()=>{ if(!car.alive)return;
   const mesh=new THREE.Mesh(new THREE.ConeGeometry(.25,1,6),
    new THREE.MeshStandardMaterial({color:0x39f5c8,emissive:0x39f5c8,emissiveIntensity:1}));
   mesh.position.set(car.x+rand(-2,2),1.4,car.z+rand(-2,2));scene.add(mesh);
   let tgt=null,bd=130;for(const o of cars){if(o===car||!o.alive)continue;const d=Math.hypot(o.x-car.x,o.z-car.z);if(d<bd){bd=d;tgt=o;}}
   projectiles.push({mesh,x:mesh.position.x,z:mesh.position.z,y:1.4,heading:car.heading+rand(-.5,.5),speed:66,life:3,dmg:13,owner:car,target:tgt,small:true});
  },i*140);
  toast(car.isPlayer?'HORNET SWARM!!':'SWARM INCOMING!');
 } else { // napalm cone: 3 homing fireballs
  for(let i=0;i<3;i++)setTimeout(()=>{ if(!car.alive)return;
   const mesh=new THREE.Mesh(new THREE.SphereGeometry(.5,10,8),
    new THREE.MeshStandardMaterial({color:0xff5722,emissive:0xff3300,emissiveIntensity:1.2}));
   mesh.position.set(car.x+rand(-2,2),1.6,car.z+rand(-2,2));scene.add(mesh);
   let tgt=null,bd=130;for(const o of cars){if(o===car||!o.alive)continue;const d=Math.hypot(o.x-car.x,o.z-car.z);if(d<bd){bd=d;tgt=o;}}
   projectiles.push({mesh,x:mesh.position.x,z:mesh.position.z,y:1.6,heading:car.heading+rand(-.4,.4),speed:48,life:3.5,dmg:24,owner:car,target:tgt,small:false,burn:true});
  },i*160);
  toast(car.isPlayer?'NAPALM CONE!!':'INCOMING NAPALM!');
 }
}

// ---------- match flow ----------
let state='menu',matchT=MATCH_TIME,countT=0,player=null;
document.querySelectorAll('.vcard').forEach(b=>b.onclick=()=>{
 document.querySelectorAll('.vcard').forEach(x=>x.setAttribute('aria-selected','false'));
 b.setAttribute('aria-selected','true'); playerChoice=b.dataset.v; AudioSys.resume();AudioSys.pickup();});
$('startBtn').onclick=()=>{AudioSys.resume();startMatch();};
$('howBtn').onclick=()=>{const h=$('howKeys');h.hidden=!h.hidden;};
$('resumeBtn').onclick=togglePause; $('quitBtn').onclick=()=>{clearWorld();state='menu';syncScreens();
 // fresh backdrop behind menu
 buildArena(); spawnPickups();};
$('againBtn').onclick=restart; $('menuBtn').onclick=()=>{state='menu';syncScreens();};
function syncScreens(){$('menu').classList.toggle('hidden',state!=='menu');
 $('pause').classList.toggle('hidden',state!=='pause');
 $('results').classList.toggle('hidden',state!=='over');}
function togglePause(){ if(state==='play'){state='pause';
  if(AudioSys.engineGain)AudioSys.engineGain.gain.value=0; }
 else if(state==='pause'){state='play';} syncScreens(); }
document.addEventListener('visibilitychange',()=>{ if(document.hidden&&state==='play')togglePause(); });
addEventListener('blur',()=>{ if(state==='play')togglePause(); });
function clearWorld(){
 for(const c of cars)scene.remove(c.mesh); cars.length=0;
 for(const p of projectiles)scene.remove(p.mesh); projectiles.length=0;
 for(const m of mines)scene.remove(m.mesh); mines.length=0;
 for(const p of pickups)scene.remove(p.mesh); pickups.length=0;
 for(const pt of particles)scene.remove(pt.mesh); particles.length=0;
 buildArena(); // tear down + rebuild ALL destructibles so REMATCH is identical
 $('killfeed').innerHTML='';
}
function startMatch(){
 clearWorld(); spawnPickups();
 const pcfg=VEHICLES[playerChoice];
 player=makeCar('YOU · '+pcfg.name,pcfg,-70,70,Math.PI*.75,true);
 const foes=[['MAW-1',VEHICLES.maw,[70,70]],['WASP-1',VEHICLES.wasp,[70,-70]],
  ['VULTURE-2',VEHICLES.vulture,[-70,-70]],['MAW-2',VEHICLES.maw,[0,-80]],['WASP-2',VEHICLES.wasp,[0,80]]];
 for(const [n,cfg,[x,z]] of foes)makeCar(n,cfg,x+rand(-6,6),z+rand(-6,6),rand(0,TAU),false);
 matchT=MATCH_TIME; countT=3.2; state='countdown';
 $('kills').textContent='KILLS 0'; $('armorLabel').textContent='HULL ▮ '+pcfg.name;
 $('specialLabel').textContent='SPECIAL — '+pcfg.special+' [Q]';
 syncScreens(); toast('READY…'); AudioSys.count(1);
}
function restart(){startMatch();}
function checkEnd(){
 const alive=cars.filter(c=>c.alive);
 if(state!=='play'&&state!=='countdown')return;
 if(player&&!player.alive)return endMatch(false,'Your rig was torn apart.');
 if(alive.length===1&&alive[0]===player)return endMatch(true,'Last rig rolling. The Bowl is yours.');
 if(alive.filter(c=>!c.isPlayer).length===0&&player.alive)return endMatch(true,'All rivals wrecked!');
}
function endMatch(win,sub){
 state='over';
 $('rtitle').textContent=win?'CHAMPION OF THE BOWL':'WRECKED';
 $('rtitle').style.color=win?'#39f5c8':'#ff5722';
 const alive=cars.filter(c=>c.alive).length;
 $('resultsStats').innerHTML=`<b>${sub}</b><br/>Kills: <b>${player?player.kills:0}</b> · Survived: <b>${fmtT(matchT)}</b> left · Rivals left: <b>${alive}</b><br/>Rig: <b>${player?player.cfg.name:''}</b>`;
 syncScreens(); AudioSys.special();
}
function fmtT(s){s=Math.max(0,Math.ceil(s));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
function updateAmmo(){$('cMis').textContent=player.missiles;$('cMine').textContent=player.mines;}

// ---------- per-frame ----------
const clock=new THREE.Clock();
function step(dt){
 // countdown
 if(state==='countdown'){countT-=dt;
  const n=Math.ceil(countT-0.2);
  if(countT<=0.2&&state==='countdown'){state='play';toast('GO!!');AudioSys.count(0);}
  else {const label=String(Math.max(1,n));if($('toast').textContent!==label&&countT>0.2){toast(label);AudioSys.count(1);}}
 }
 if(state==='countdown'){updateCamera(dt);updateHUD(dt);}
 if(state!=='play'){updateVisuals(dt);return;}
 matchT-=dt; if(matchT<=0){
  matchT=0;
  for(const c of cars)if(c.alive){ c.hp-=14*dt; if(c.hp<=0)kill(c,null); }
  if(!state||state==='play')toast('☠ SUDDEN DEATH ☠');
  const alive=cars.filter(c=>c.alive);
  if(alive.length<=1||matchT<=0&&cars.filter(c=>c.alive&&c.hp>0).length>=1){
   const scored=[...cars].filter(c=>c.alive).sort((a,b)=>b.hp-a.hp);
   if(scored.length){ const champ=scored[0];
    if(state==='play')endMatch(champ===player,`Time! ${champ.name} holds the most hull.`);
   } else if(state==='play')endMatch(false,'Mutual annihilation.');
  }
 }
 // player drive
 drive(player,readPlayerInput(),dt);
 if((keys.KeyJ||mbDown[0]||touch.mg))fireMG(player);
 if(keys.KeyK||mbDown[2]){fireMissile(player);keys.KeyK=false;mbDown[2]=false;}
 // gamepad
 pollGamepad(dt);
 // AI
 for(const c of cars){if(c.isPlayer||!c.alive)continue;aiDrive(c,dt);}
 // physics integrate + collisions
 for(const c of cars){if(!c.alive)continue;integrate(c,dt);}
 carCollisions(dt);
 // projectiles/mines/pickups/particles
 updateProjectiles(dt);updateMines(dt);updatePickups(dt);updateParticles(dt);
 for(const c of cars){c.fireCd=Math.max(0,c.fireCd-dt);c.misCd=Math.max(0,c.misCd-dt);
  c.invuln=Math.max(0,c.invuln-dt);c.heat=Math.max(0,c.heat-dt*26);
  if(c.mgUp>0)c.mgUp-=dt; if(c.burn>0){c.burn-=dt;damage(c,6*dt,null);}
  c.special=Math.min(100,c.special+dt*(100/30));}
 updateVisuals(dt);updateHUD(dt);updateCamera(dt);
 if(player&&player.alive)AudioSys.engine(player.speed); 
}
function readPlayerInput(){
 return{throttle:(keys.KeyW||keys.ArrowUp||touch.gas?1:0)-(keys.KeyS||keys.ArrowDown||touch.brake?1:0),
  steer:(keys.KeyA||keys.ArrowLeft||touch.left?1:0)-(keys.KeyD||keys.ArrowRight||touch.right?1:0),
  brake:!!keys.Space,turbo:!!(keys.ShiftLeft||keys.ShiftRight)||touch.turbo};
}
let gpPrev={mis:false,spec:false,mine:false};
function pollGamepad(dt){
 const gps=navigator.getGamepads?navigator.getGamepads():[];
 const gp=[...gps].find(g=>g&&g.connected); if(!gp||!player||!player.alive)return;
 const ax=gp.axes[0]||0,thr=(-(gp.axes[1]||0));
 const rt=gp.buttons[7]?.pressed, a=gp.buttons[0]?.pressed, b=gp.buttons[1]?.pressed;
 drive(player,{throttle:clamp(thr*1.4,-1,1)+(rt?0.4:0),steer:-ax,brake:gp.buttons[2]?.pressed,turbo:gp.buttons[5]?.pressed},dt);
 if(rt)fireMG(player);
 if(a&&!gpPrev.spec)fireSpecial(player);
 if(b&&!gpPrev.mine)dropMine(player);
 gpPrev={mis:rt,spec:a,mine:b};
}
function drive(c,inp,dt){
 if(!c||!c.alive||dt<=0)return;
 const cfg=c.cfg;
 let acc=inp.throttle*cfg.accel;
 const boosting=(inp.turbo||c.turboBurst>0)&&c.turbo>0&&inp.throttle>0;
 if(boosting){acc*=1.9;c.turbo=Math.max(0,c.turbo-dt*30);
  if(Math.random()<.5)spawnParticles(new THREE.Vector3(c.x,1,c.z),0x39f5c8,1,3,.3,.3);}
 else c.turbo=Math.min(100,c.turbo+dt*6);
 if(c.turboBurst>0){c.turboBurst-=dt;acc+=(c.turboBurst>0?30:0);}
 if(inp.brake){c.speed*=Math.max(0,1-dt*4);}
 c.speed+=acc*dt;
 c.speed=clamp(c.speed,-cfg.top*.45,cfg.top*(boosting?1.25:1));
 c.speed*=Math.max(0,1-dt*(inp.throttle===0?.9:.25)); // drag
 const grip=clamp(Math.abs(c.speed)/8,.4,1);
 c.heading+=(inp.steer||0)*cfg.turn*dt*(c.speed>=0?1:-1)*clamp(Math.abs(c.speed)/10,.25,1);
 c._boost=boosting;
}
function integrate(c,dt){
 const dx=Math.sin(c.heading)*c.speed*dt,dz=Math.cos(c.heading)*c.speed*dt;
 c.x+=dx;c.z+=dz;
 // walls
 const r=Math.hypot(c.x,c.z);
 if(r>ARENA_HALF){const nx=c.x/r,nz=c.z/r;c.x=nx*ARENA_HALF;c.z=nz*ARENA_HALF;
  const impact=Math.abs(c.speed);
  if(impact>14){damage(c,(impact-14)*1.2,c.lastDmgBy);explosion(c.x,c.z);feed(`🧱 ${c.name} kissed the wall`);}
  c.speed*=-.35;}
 if(window.__ramps)for(const r of window.__ramps){
  if(Math.hypot(c.x-r.x,c.z-r.z)<7&&Math.abs(c.speed)>6){ c.turbo=Math.min(100,c.turbo+40*dt);
   if(Math.random()<.3)spawnParticles(new THREE.Vector3(c.x,1,c.z),0xffb300,1,4,.3,.3); } }
 // solids
 for(const s of solids){const d=Math.hypot(c.x-s.x,c.z-s.z),min=s.r+2;
  if(d<min&&d>0.01){const nx=(c.x-s.x)/d,nz=(c.z-s.z)/d;
   c.x=s.x+nx*min;c.z=s.z+nz*min;
   const impact=Math.abs(c.speed);
   if(impact>10){c.speed*=-.3;
    if(s.hp!==undefined){s.hp-=impact*.8;
     spawnParticles(new THREE.Vector3(s.x,2,s.z),0xffcc66,5,7,.4,.35);
     if(s.hp<=0)breakSolid(s,c);}
    if(impact>18){damage(c,(impact-16)*.8,null);shake(.3);}
   } else c.speed*=.92;}}
}
function breakSolid(s,by){
 scene.remove(s.mesh); solids.splice(solids.indexOf(s),1);
 if(s.barrel){explosion(s.x,s.z,true);
  for(const c of cars){if(!c.alive)continue;const d=Math.hypot(c.x-s.x,c.z-s.z);
   if(d<11)damage(c,45*(1-d/12)+10,by);} }
 else { explosion(s.x,s.z);
  // crates drop a pickup
  const kinds=['repair','missiles','turbo'];const kind=kinds[Math.floor(Math.random()*3)];
  const col={repair:0x39f55a,missiles:0xffb300,turbo:0x39f5c8}[kind];
  const m=new THREE.Mesh(new THREE.OctahedronGeometry(1.1),
   new THREE.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:.7}));
  m.position.set(s.x,1.2,s.z);scene.add(m);pickups.push({kind,mesh:m,x:s.x,z:s.z,taken:false,respawn:0});
 }
}
function carCollisions(dt){
 for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++){
  const a=cars[i],b=cars[j];if(!a.alive||!b.alive)continue;
  const dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);
  if(d<4.6&&d>.01){const nx=dx/d,nz=dz/d,ov=(4.6-d)/2;
   a.x-=nx*ov;a.z-=nz*ov;b.x+=nx*ov;b.z+=nz*ov;
   const rel=Math.abs(a.speed-b.speed);
   const dmg=rel>12?(rel-11)*(a.invuln>0||b.invuln>0?2:1.4):0;
   if(dmg>4){ // ram!
    const faster=Math.abs(a.speed)>Math.abs(b.speed)?a:b;
    const slower=faster===a?b:a;
    damage(slower,dmg,faster);
    explosion((a.x+b.x)/2,(a.z+b.z)/2);
    if(faster.isPlayer){toast('RAMMED!');faster.special=Math.min(100,faster.special+8);}
    const avg=(a.speed+b.speed)/2*.4; a.speed=avg+rand(-3,3);b.speed=avg+rand(-3,3);
   } else {const t=a.speed;a.speed=b.speed*.7;b.speed=t*.7;}
  }}
}
function aiDrive(c,dt){
 const ai=c.ai; ai.t-=dt;
 if(ai.t<=0){ai.t=rand(.8,1.6);
  // pick mode: flee to repair if weak, else hunt weakest/nearest
  if(c.hp<28&&Math.random()<.7)ai.mode='repair';
  else if(c.missiles===0&&Math.random()<.4)ai.mode='ammo';
  else ai.mode='hunt';}
 ai.wander+=dt*.4;
 c._stuckT=(Math.abs(c.speed)<3?(c._stuckT||0)+dt:0);
 let tx=0,tz=0;
 if(c._stuckT>1.2){ tx=c.x-Math.sin(c.heading)*20; tz=c.z-Math.cos(c.heading)*20;
  drive(c,{throttle:-.8,steer:1,brake:false,turbo:false},dt); c._stuckT=0; return; }
 if(ai.mode==='repair'||ai.mode==='ammo'){
  const want=ai.mode==='repair'?'repair':['missiles','mines'][Math.floor(Math.random()*2)];
  let bp=null,bd=1e9;for(const p of pickups){if(p.taken||p.kind!==want)continue;
   const d=Math.hypot(p.x-c.x,p.z-c.z);if(d<bd){bd=d;bp=p;}}
  if(bp){tx=bp.x;tz=bp.z;} else ai.mode='hunt';
 }
 if(ai.mode==='hunt'){
  let be=null,bd=1e9;for(const o of cars){if(o===c||!o.alive)continue;
   const d=Math.hypot(o.x-c.x,o.z-c.z)-(o.hp*.15);if(d<bd){bd=d;be=o;}}
  if(be){ // predictive pursuit + slight orbit so it doesn't tail-lock
   const lead=clamp(Math.hypot(be.x-c.x,be.z-c.z)/40,0,1.2);
   tx=be.x+Math.sin(be.heading)*be.speed*lead+Math.cos(ai.wander)*6;
   tz=be.z+Math.cos(be.heading)*be.speed*lead+Math.sin(ai.wander)*6;
   ai.target=be;
   // fire control
   const ang=Math.atan2(be.x-c.x,be.z-c.z),diff=Math.abs(angDiff(ang,c.heading));
   const dist=Math.hypot(be.x-c.x,be.z-c.z);
   if(diff<.25&&dist<65)fireMG(c);
   if(diff<.4&&dist<90&&dist>20&&c.missiles>0&&Math.random()<dt*.5)fireMissile(c);
   if(c.hp>40&&dist<12&&c.mines>0&&Math.random()<dt*.4)dropMine(c);
   if(c.special>=100&&dist<45)fireSpecial(c);
  }
 }
 const ang=Math.atan2(tx-c.x,tz-c.z);
 const diff=angDiff(ang,c.heading);
 // wall avoidance: if heading toward wall, bias steer
 let steer=clamp(diff*2.2,-1,1);
 const ahead=8,px=c.x+Math.sin(c.heading)*ahead*3,pz=c.z+Math.cos(c.heading)*ahead*3;
 if(Math.hypot(px,pz)>ARENA_HALF-8)steer=angDiff(Math.atan2(-c.x,-c.z),c.heading)>0?1:-1;
 for(const s of solids){const d=Math.hypot(s.x-c.x,s.z-c.z);
  if(d<s.r+10){const sa=Math.atan2(s.x-c.x,s.z-c.z),sd=angDiff(sa,c.heading);
   if(Math.abs(sd)<.6)steer+=sd>0?-1:1;}}
 const distT=Math.hypot(tx-c.x,tz-c.z);
 drive(c,{throttle:distT<6?-.5:(Math.abs(diff)>2?-0.4:1),steer:clamp(steer,-1,1),
  brake:false,turbo:distT>40&&Math.abs(diff)<.3&&c.turbo>30},dt);
}
function updateProjectiles(dt){
 for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i];
  p.life-=dt;
  if(p.target&&p.target.alive){ // homing
   const want=Math.atan2(p.target.x-p.x,p.target.z-p.z);
   p.heading+=clamp(angDiff(want,p.heading),-3*dt,3*dt);}
  p.x+=Math.sin(p.heading)*p.speed*dt;p.z+=Math.cos(p.heading)*p.speed*dt;
  p.mesh.position.set(p.x,p.y+Math.sin(performance.now()*.02)*.1,p.z);
  p.mesh.rotation.y=p.heading;
  spawnParticles(new THREE.Vector3(p.x,p.y,p.z),p.burn?0xff5722:0xffb300,1,1,.25,.22);
  let hit=null;
  if(Math.hypot(p.x,p.z)>ARENA_HALF+6||p.life<=0)hit='wall';
  for(const s of solids){if(Math.hypot(p.x-s.x,p.z-s.z)<s.r){ if(s.hp!==undefined){s.hp-=p.dmg;
    if(s.hp<=0)breakSolid(s,p.owner);} hit='solid';break;}}
  if(!hit)for(const c of cars){if(c===p.owner||!c.alive)continue;
   if(Math.hypot(p.x-c.x,p.z-c.z)<3.2){hit=c;break;}}
  if(hit){ scene.remove(p.mesh);projectiles.splice(i,1);
   explosion(p.x,p.z,p.dmg>20);
   const victims=hit==='wall'||hit==='solid'?[]:[hit];
   for(const c of cars){if(!c.alive||c===p.owner)continue;
    const d=Math.hypot(p.x-c.x,p.z-c.z);
    if(d<7&&!victims.includes(c))victims.push(c);}
   for(const v of victims){damage(v,p.dmg*(v===hit?1:.55),p.owner);
    if(p.burn)v.burn=3;
    if(p.owner)p.owner.special=Math.min(100,p.owner.special+6);}
   if(p.owner&&p.owner.isPlayer&&hit&&hit!=='wall')hitmark(true);
  }}
}
function updateMines(dt){
 for(let i=mines.length-1;i>=0;i--){const m=mines[i];m.life-=dt;m.arm-=dt;
  m.mesh.material.emissiveIntensity=.4+Math.sin(performance.now()*.01)*.3;
  if(m.life<=0){scene.remove(m.mesh);mines.splice(i,1);continue;}
  if(m.arm>0)continue;
  for(const c of cars){if(!c.alive||c===m.owner)continue;
   if(Math.hypot(m.x-c.x,m.z-c.z)<4.5){scene.remove(m.mesh);mines.splice(i,1);
    explosion(m.x,m.z,true);damage(c,48,m.owner);
    if(m.owner)m.owner.special=Math.min(100,m.owner.special+8);
    break;}}}
}
function updatePickups(dt){
 for(const p of pickups){
  if(p.taken){p.respawn-=dt;
   if(p.respawn<=0){p.taken=false;p.mesh.visible=true;} else continue;}
  p.mesh.rotation.y+=dt*2;p.mesh.position.y=1.2+Math.sin(performance.now()*.003+p.x)*.25;
  for(const c of cars){if(!c.alive)continue;
   if(Math.hypot(p.x-c.x,p.z-c.z)<3.6){
    p.taken=true;p.mesh.visible=false;p.respawn=12;AudioSys.pickup();
    spawnParticles(new THREE.Vector3(p.x,1.5,p.z),0xffffff,10,6,.5,.3);
    if(p.kind==='repair')c.hp=Math.min(c.maxhp,c.hp+45);
    if(p.kind==='missiles')c.missiles=Math.min(9,c.missiles+3);
    if(p.kind==='mines')c.mines=Math.min(5,c.mines+2);
    if(p.kind==='turbo')c.turbo=100;
    if(p.kind==='mgup')c.mgUp=30;
    if(c.isPlayer){updateAmmo();feed(`YOU grabbed ${p.kind.toUpperCase()}`);toast('+'+p.kind.toUpperCase());}
    break;}}}
}
function updateParticles(dt){
 for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.age+=dt;
  if(p.age>=p.life){scene.remove(p.mesh);particles.splice(i,1);continue;}
  p.vy-=p.grav*dt;p.mesh.position.x+=p.vx*dt;p.mesh.position.y=Math.max(.1,p.mesh.position.y+p.vy*dt);p.mesh.position.z+=p.vz*dt;
  p.mesh.material.opacity=1-p.age/p.life;}
}
const camPos=new THREE.Vector3(0,30,-40);
function updateCamera(dt){
 if(!player)return;
 const d=11+Math.abs(player.speed)*.12,h=5.4+Math.abs(player.speed)*.03;
 const tx=player.x-Math.sin(player.heading)*d,tz=player.z-Math.cos(player.heading)*d;
 camPos.x+=(tx-camPos.x)*Math.min(1,dt*4);camPos.z+=(tz-camPos.z)*Math.min(1,dt*4);camPos.y+=(h-camPos.y)*Math.min(1,dt*4);
 camShake=Math.max(0,camShake-dt*2.2);
 camera.position.set(camPos.x+rand(-1,1)*camShake,camPos.y+rand(-1,1)*camShake*.6,camPos.z+rand(-1,1)*camShake);
 camera.lookAt(player.x,2.2,player.z);
 camera.fov=68+(player._boost?10:0)+Math.abs(player.speed)*.12;camera.updateProjectionMatrix();
 // wheels + mesh
 for(const c of cars){if(!c.alive)continue;
  c.mesh.position.set(c.x,0,c.z);c.mesh.rotation.y=c.heading;
  c.wheelSpin+=c.speed*dt*2;
  for(const w of c.mesh.userData.wheels)w.rotation.x=c.wheelSpin;
  c.mesh.position.y=c._boost?rand(0,.08):0;}
}
function updateVisuals(dt){ // menus/idle: slow orbit
 if(state==='menu'||state==='over'&&!player){const t=performance.now()*.0001;
  camera.position.set(Math.cos(t)*90,42,Math.sin(t)*90);camera.lookAt(0,2,0);}
 for(const c of cars){if(!c.alive)continue;c.mesh.position.set(c.x,0,c.z);c.mesh.rotation.y=c.heading;}
 updateParticles(dt);
}
function updateHUD(dt){
 if(!player)return;
 $('hp').firstElementChild.style.width=(100*player.hp/player.maxhp)+'%';
 $('special').firstElementChild.style.width=player.special+'%';
 $('heat').firstElementChild.style.width=player.heat+'%';
 $('speed').textContent=Math.round(Math.abs(player.speed)*3.6)+' km/h';
 $('cTurbo').textContent=Math.round(player.turbo);
 $('timer').textContent=fmtT(matchT);
 $('alive').textContent=`ALIVE ${cars.filter(c=>c.alive).length}/${cars.length}`;
 $('special').firstElementChild.style.background=player.special>=100?'#39f5c8':'';
 // enemies panel
 $('enemiesPanel').innerHTML=cars.filter(c=>!c.isPlayer).map(c=>
  `<div class="erow ${c.alive?'':'dead'}"><span>${c.alive?'🔥':'💀'} ${c.name}</span><span>${c.alive?Math.ceil(c.hp)+'hp':'OUT'}</span></div>`).join('');
 drawMinimap();
}
const mm=$('minimap').getContext('2d');
function drawMinimap(){
 const S=148,C=S/2,sc=S/(ARENA_HALF*2+20);
 mm.clearRect(0,0,S,S);mm.fillStyle='rgba(10,12,16,.9)';mm.fillRect(0,0,S,S);
 mm.strokeStyle='#ffb300';mm.beginPath();mm.arc(C,C,ARENA_HALF*sc,0,TAU);mm.stroke();
 for(const s of solids){mm.fillStyle=s.barrel?'#ff2d2d':'#5a5f6b';
  mm.fillRect(C+s.x*sc-2,C+s.z*sc-2,4,4);}
 for(const p of pickups){if(p.taken)continue;mm.fillStyle='#fff';mm.fillRect(C+p.x*sc-1.5,C+p.z*sc-1.5,3,3);}
 for(const c of cars){if(!c.alive)continue;
  mm.fillStyle=c.isPlayer?'#39f5c8':'#ff5722';
  mm.beginPath();mm.arc(C+c.x*sc,C+c.z*sc,c.isPlayer?4:3,0,TAU);mm.fill();}
}

// ---------- main loop ----------
let last=performance.now();
function loop(t){
 requestAnimationFrame(loop);
 let dt=Math.min(.05,(t-last)/1000);last=t;
 try{ if(state==='play'||state==='countdown')step(dt); else updateVisuals(dt);
  renderer.render(scene,camera);
 }catch(err){ console.error(err); }
}
// idle demo cars behind menu
makeCar('MAW-1',VEHICLES.maw,70,70,0,false);makeCar('WASP-1',VEHICLES.wasp,-70,-70,2,false);
makeCar('YOU · VULTURE',VEHICLES.vulture,0,0,0,true);
player=cars[2];spawnPickups();
$('loadmsg')&&$('loading').classList.add('hidden');
syncScreens();updateAmmo();
requestAnimationFrame(loop);
