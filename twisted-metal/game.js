'use strict';
/* TWISTED ARENA — top-down vehicular combat inspired by Twisted Metal.
   Mechanics preserved from references: infinite MG side-arms with overheat,
   scattered pickup arsenals, per-vehicle recharging specials, ram damage,
   repair zones, multi-arena progression, score + lives + game-over/win flow. */
(function(){
const W=960,H=600;
const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
const overlay=document.getElementById('overlay');
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const dist2=(ax,ay,bx,by)=>{const dx=ax-bx,dy=ay-by;return Math.sqrt(dx*dx+dy*dy);};
const angDiff=(a,b)=>{let d=(a-b)%(Math.PI*2);if(d>Math.PI)d-=Math.PI*2;if(d<-Math.PI)d+=Math.PI*2;return d;};
const rand=(a,b)=>a+Math.random()*(b-a);
function circleRect(cx,cy,r,rc){const nx=clamp(cx,rc.x,rc.x+rc.w),ny=clamp(cy,rc.y,rc.y+rc.h);const dx=cx-nx,dy=cy-ny;return dx*dx+dy*dy<r*r;}

/* ---------- audio (procedural, no assets) ---------- */
const AudioSys={ctx:null,master:null,muted:false,engOsc:null,engGain:null,
 init(){if(this.ctx)return;try{this.ctx=new (window.AudioContext||window.webkitAudioContext)();this.master=this.ctx.createGain();this.master.gain.value=0.35;this.master.connect(this.ctx.destination);}catch(e){}},
 resume(){if(this.ctx&&this.ctx.state==='suspended')this.ctx.resume();},
 toggleMute(){this.muted=!this.muted;if(this.master)this.master.gain.value=this.muted?0:0.35;return this.muted;},
 blip(f,d,type,g){if(!this.ctx||this.muted)return;const t=this.ctx.currentTime,o=this.ctx.createOscillator(),v=this.ctx.createGain();o.type=type||'square';o.frequency.value=f;v.gain.setValueAtTime(g||0.15,t);v.gain.exponentialRampToValueAtTime(0.001,t+d);o.connect(v);v.connect(this.master);o.start(t);o.stop(t+d);},
 noise(d,g,lp){if(!this.ctx||this.muted)return;const t=this.ctx.currentTime,len=Math.floor(this.ctx.sampleRate*d),buf=this.ctx.createBuffer(1,len,this.ctx.sampleRate),ch=buf.getChannelData(0);for(let i=0;i<len;i++)ch[i]=(Math.random()*2-1)*(1-i/len);const s=this.ctx.createBufferSource();s.buffer=buf;const f=this.ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=lp||800;const v=this.ctx.createGain();v.gain.value=g||0.4;s.connect(f);f.connect(v);v.connect(this.master);s.start(t);},
 shoot(){this.blip(700+Math.random()*200,0.07,'square',0.08);},
 boom(){this.noise(0.5,0.5,500);this.blip(60,0.4,'sine',0.4);},
 hit(){this.blip(220,0.08,'sawtooth',0.12);},
 pickup(){this.blip(520,0.08,'square',0.12);setTimeout(()=>this.blip(780,0.1,'square',0.12),80);},
 overheat(){this.blip(180,0.3,'sawtooth',0.15);},
 ui(){this.blip(440,0.06,'square',0.1);},
 special(){this.noise(0.3,0.3,2000);this.blip(150,0.3,'sawtooth',0.2);},
 engine(on,speed){if(!this.ctx||this.muted)return;if(on&&!this.engOsc){this.engOsc=this.ctx.createOscillator();this.engGain=this.ctx.createGain();this.engOsc.type='sawtooth';this.engGain.gain.value=0.03;this.engOsc.connect(this.engGain);this.engGain.connect(this.master);this.engOsc.start();}
  if(this.engOsc){if(!on){try{this.engOsc.stop();}catch(e){}this.engOsc=null;this.engGain=null;}else this.engOsc.frequency.value=50+speed*0.35;}}
};

/* ---------- input ---------- */
const keys={};
const mouse={x:W/2,y:H/2,down:false,rdown:false};
addEventListener('keydown',e=>{keys[e.code]=true;AudioSys.init();AudioSys.resume();
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
 if(e.code==='KeyM')Game.toggleMute();
 if(e.code==='KeyP'||e.code==='Escape')Game.togglePause();
 if(e.code==='Enter')Game.confirm();});
addEventListener('keyup',e=>{keys[e.code]=false;});
canvas.addEventListener('mousemove',e=>{const r=canvas.getBoundingClientRect();mouse.x=(e.clientX-r.left)*W/r.width;mouse.y=(e.clientY-r.top)*H/r.height;});
canvas.addEventListener('mousedown',e=>{AudioSys.init();AudioSys.resume();if(e.button===0)mouse.down=true;if(e.button===2)mouse.rdown=true;});
addEventListener('mouseup',e=>{if(e.button===0)mouse.down=false;if(e.button===2)mouse.rdown=false;});
canvas.addEventListener('contextmenu',e=>e.preventDefault());

/* ---------- data ---------- */
const VEHICLES=[
 {id:'fang',name:'SWEET FANG',desc:'Ice-cream brawler. Balanced. Special: NAPALM CONE — flame gout ahead.',color:'#f33a2c',accent:'#ffffff',hp:120,accel:340,turn:2.9,maxsp:300,grip:5.2,special:'napalm',cd:9},
 {id:'hog',name:'WARHOG',desc:'Siege hauler. Slow, huge HP. Special: PATRIOT VOLLEY — 3x homing.',color:'#4a7c3a',accent:'#d8d83a',hp:170,accel:250,turn:2.3,maxsp:240,grip:6.0,special:'patriots',cd:12},
 {id:'rat',name:'ROAD RAT',desc:'Glass-cannon coupe. Fast, fragile. Special: RAT ROCKET — huge homer.',color:'#3a6cf3',accent:'#ffb02e',hp:90,accel:430,turn:3.4,maxsp:360,grip:4.4,special:'ratrocket',cd:10}
];
const LEVELS=[
 {name:'JUNKYARD DOG',par:75,foes:2,skill:0.55,padN:7,barrels:4,floor:'#1a1d24',line:'#262b36',
  walls:[{x:300,y:200,w:120,h:40},{x:660,y:380,w:120,h:40},{x:430,y:430,w:220,h:36},{x:120,y:120,w:36,h:220}]},
 {name:'DOWNTOWN ROOFTOPS',par:90,foes:3,skill:0.75,padN:9,barrels:6,floor:'#161a22',line:'#232936',
  walls:[{x:200,y:150,w:180,h:36},{x:620,y:150,w:180,h:36},{x:200,y:414,w:180,h:36},{x:620,y:414,w:180,h:36},{x:462,y:220,w:36,h:160}]},
 {name:'CALYPSO FOUNDRY',par:110,foes:4,skill:0.95,padN:11,barrels:8,floor:'#1c1518',line:'#2e2226',
  walls:[{x:150,y:150,w:36,h:300},{x:774,y:150,w:36,h:300},{x:330,y:180,w:300,h:36},{x:330,y:384,w:300,h:36},{x:452,y:250,w:56,h:100}]}
];
const ARENA={x:40,y:40,w:880,h:520};
const WEAPON_DEFS={
 mg:{dmg:6,speed:620,life:0.7,cd:0.11,heat:0.09},
 homing:{dmg:22,speed:430,life:2.4,turn:3.2,ammo:4},
 fire:{dmg:10,speed:480,life:1.6,dot:14,ammo:3},
 mine:{dmg:45,ammo:3},
 patriot:{dmg:18,speed:460,life:2.6,turn:3.6},
 ratrocket:{dmg:55,speed:400,life:3.0,turn:2.6}
};

/* ---------- entities ---------- */
let PID=1;
function makeVehicle(def,x,y,angle,isPlayer,skill){
 return {id:PID++,def,x,y,vx:0,vy:0,angle,speed:0,isPlayer:!!isPlayer,skill:skill||0.6,
  hp:def.hp,maxhp:def.hp,alive:true,heat:0,heatLock:false,fireCd:0,specCd:0,invuln:0,
  ammo:{homing:0,fire:0,mine:0},selWeapon:'homing',turbo:0,turboN:1,mgCd:0,ai:{t:0,wt:0,wx:x,wy:y,fireT:1},ramCd:0,flash:0,scorePop:0};
}
function makeShot(o){return Object.assign({id:PID++,dead:false,age:0,mineArm:0,homing:false,turn:0,dmg:0,vx:0,vy:0,r:4,from:-1,kind:'mg',dot:0,aoe:0},o);}
function makePad(x,y,kind){return {x,y,kind,active:true,t:0,
 label:kind==='repair'?'REPAIR':kind==='turbo'?'TURBO':kind.toUpperCase()};}
function makeParticle(x,y,vx,vy,life,size,color,grav){return {x,y,vx,vy,life,maxlife:life,size,color,grav:grav||0,dead:false};}
function makeText(x,y,str,color){return {x,y,str,color:color||'#ffb02e',life:1.2,dead:false};}

/* ---------- game ---------- */
const Game={
 screen:'title',level:0,score:0,kills:0,runTime:0,levelTime:0,scoreAtLevelStart:0,lives:3,
 player:null,foes:[],shots:[],pads:[],barrels:[],parts:[],texts:[],feed:[],
 cam:{x:W/2,y:H/2,shake:0},selVeh:0,msg:'',msgT:0,countdown:0,high:0,muted:false,pausedFrom:null,respawnT:0,clearT:0,
 init(){try{this.high=parseInt(localStorage.getItem('tm-high')||'0',10)||0;}catch(e){this.high=0;}this.showTitle();},
 /* ----- flow ----- */
 showTitle(){this.screen='title';AudioSys.engine(false);overlay.innerHTML=
  `<div class="panel"><h1>TWISTED ARENA</h1><p>Vehicular combat. Last car standing takes the wish.</p>
   <div class="keys"><b>WASD / Arrows</b><span>drive &amp; steer</span><b>SPACE</b><span>handbrake</span>
   <b>J / Left-click</b><span>machine guns (infinite, watch heat)</span><b>K / Right-click</b><span>fire pickup weapon</span>
   <b>1–3</b><span>select pickup weapon</span><b>L / E</b><span>vehicle special (recharges)</span>
   <b>SHIFT</b><span>turbo</span><b>P / ESC</b><span>pause</span><b>M</b><span>mute</span></div>
   <div class="btnrow"><button id="bGo">ENTER THE ARENA</button></div>
   <p>High score: <b style="color:#ffb02e">${this.high}</b></p></div>`;
  document.getElementById('bGo').onclick=()=>{AudioSys.init();AudioSys.resume();AudioSys.ui();this.showSelect();};},
 showSelect(){this.screen='select';const cards=VEHICLES.map((v,i)=>
  `<div class="card${i===this.selVeh?' sel':''}" data-i="${i}"><h3 style="color:${v.color}">${v.name}</h3><small>${v.desc}<br>HP ${v.hp} · TOP ${v.maxsp}</small></div>`).join('');
  overlay.innerHTML=`<div class="panel"><h2>CHOOSE YOUR RIDE</h2><div class="cards">${cards}</div>
  <div class="btnrow"><button id="bBack" class="ghost">BACK</button><button id="bStart">START ENGINE</button></div></div>`;
  document.querySelectorAll('.card').forEach(c=>c.onclick=()=>{this.selVeh=+c.dataset.i;AudioSys.ui();this.showSelect();});
  document.getElementById('bBack').onclick=()=>this.showTitle();
  document.getElementById('bStart').onclick=()=>{AudioSys.ui();this.startRun();};},
 startRun(){this.level=0;this.score=0;this.kills=0;this.runTime=0;this.lives=3;this.startLevel();},
 startLevel(){const L=LEVELS[this.level];this.scoreAtLevelStart=this.score;this.levelTime=0;
  this.shots=[];this.parts=[];this.texts=[];this.barrels=[];this.pads=[];this.respawnT=0;this.clearT=0;
  const sp=this.spawns(L.foes+1);
  this.player=makeVehicle(VEHICLES[this.selVeh],sp[0].x,sp[0].y,rand(0,6.28),true);
  this.player.invuln=2;
  this.foes=[];const ids=[0,1,2].filter(i=>i!==this.selVeh);
  for(let i=0;i<L.foes;i++){const d=VEHICLES[ids[i%ids.length]];
   const f=makeVehicle(d,sp[i+1].x,sp[i+1].y,rand(0,6.28),false,L.skill);
   f.ammo.homing=99;f.ammo.fire=99;f.ammo.mine=2;this.foes.push(f);}
  // pickup pads: weapons + repair zones + turbo
  const kinds=['homing','homing','fire','fire','mine','repair','turbo'];
  for(let i=0;i<L.padN;i++){const p=this.freeSpot(L);this.pads.push(makePad(p.x,p.y,kinds[i%kinds.length]));}
  for(let i=0;i<L.barrels;i++){const p=this.freeSpot(L);this.barrels.push({x:p.x,y:p.y,hp:10,flash:0});}
  this.cam.x=this.player.x;this.cam.y=this.player.y;
  this.screen='countdown';this.countdown=3.2;this.msg='';overlay.innerHTML='';},
 spawns(n){const pts=[{x:150,y:150},{x:810,y:450},{x:810,y:150},{x:150,y:450},{x:480,y:300}];return pts.slice(0,n);},
 freeSpot(L){for(let t=0;t<60;t++){const x=rand(ARENA.x+60,ARENA.x+ARENA.w-60),y=rand(ARENA.y+60,ARENA.y+ARENA.h-60);
  let ok=true;for(const w of L.walls){if(circleRect(x,y,50,w)){ok=false;break;}}if(ok)return {x,y};}return {x:480,y:300};},
 confirm(){if(this.screen==='title'){AudioSys.init();this.showSelect();}},
 toggleMute(){AudioSys.init();this.muted=AudioSys.toggleMute();this.addFeed(this.muted?'SOUND OFF':'SOUND ON');},
 togglePause(){if(this.screen==='play'){this.screen='pause';AudioSys.engine(false);
   overlay.innerHTML=`<div class="panel"><h2>PAUSED</h2><p>Level ${this.level+1}: ${LEVELS[this.level].name} · Score ${this.score}</p>
   <div class="btnrow"><button id="bRes">RESUME</button><button id="bRetry" class="ghost">RESTART LEVEL</button><button id="bQuit" class="ghost">QUIT TO TITLE</button></div></div>`;
   document.getElementById('bRes').onclick=()=>this.togglePause();
   document.getElementById('bRetry').onclick=()=>{this.score=this.scoreAtLevelStart;this.lives=3;this.startLevel();};
   document.getElementById('bQuit').onclick=()=>this.showTitle();}
  else if(this.screen==='pause'){this.screen='play';overlay.innerHTML='';}},
 levelClear(){const L=LEVELS[this.level];const bonus=Math.max(0,Math.round((L.par-this.levelTime)*15));
  this.score+=bonus;this.screen='clear';
  overlay.innerHTML=`<div class="panel"><h2>ARENA CLEARED</h2><div class="big">+${bonus}</div>
  <p>Time bonus · ${this.levelTime.toFixed(1)}s vs par ${L.par}s</p><p class="score">Score: ${this.score} · Kills: ${this.kills}</p>
  <div class="btnrow">${this.level<LEVELS.length-1?'<button id="bNext">NEXT ARENA →</button>':'<button id="bWin">CLAIM THE WISH →</button>'}</div></div>`;
  const nx=()=>{AudioSys.ui();if(this.level<LEVELS.length-1){this.level++;this.startLevel();}else this.victory();};
  const b=document.getElementById('bNext')||document.getElementById('bWin');b.onclick=nx;},
 victory(){this.screen='win';AudioSys.engine(false);const rec=this.score>this.high;this.saveHigh();
  overlay.innerHTML=`<div class="panel"><h1 style="color:#ffb02e">👑 CHAMPION 👑</h1>
  <p>Calypso grants your wish. The arena is silent.</p><p class="score">Final score: ${this.score} · Kills: ${this.kills} · Time: ${this.runTime.toFixed(1)}s</p>
  <p>High score: <b style="color:#ffb02e">${this.high}</b>${rec?' — NEW RECORD!':''}</p>
  <div class="btnrow"><button id="bAgain">PLAY AGAIN</button><button id="bT" class="ghost">TITLE</button></div></div>`;
  document.getElementById('bAgain').onclick=()=>this.startRun();
  document.getElementById('bT').onclick=()=>this.showTitle();},
 gameOver(){this.screen='over';AudioSys.engine(false);this.saveHigh();
  overlay.innerHTML=`<div class="panel"><h1>GAME OVER</h1><p>Wrecked in ${LEVELS[this.level].name}. Calypso laughs.</p>
  <p class="score">Score: ${this.score} · Kills: ${this.kills} · Reached arena ${this.level+1}/3</p>
  <p>High score: <b style="color:#ffb02e">${this.high}</b></p>
  <div class="btnrow"><button id="bRetry">RETRY ARENA</button><button id="bT" class="ghost">TITLE</button></div></div>`;
  document.getElementById('bRetry').onclick=()=>{this.score=this.scoreAtLevelStart;this.lives=3;this.startLevel();};
  document.getElementById('bT').onclick=()=>this.showTitle();},
 saveHigh(){if(this.score>this.high){this.high=this.score;try{localStorage.setItem('tm-high',String(this.high));}catch(e){}}},
 addFeed(s){this.feed.unshift(s);if(this.feed.length>5)this.feed.pop();},
 addScore(n,x,y){this.score+=n;if(x!==undefined)this.texts.push(makeText(x,y,'+'+n));},
 /* ----- combat helpers ----- */
 allVehicles(){return [this.player].concat(this.foes).filter(v=>v&&v.alive);},
 nearestFoe(v){let best=null,bd=1e9;for(const o of this.allVehicles()){if(o===v)continue;const d=dist2(v.x,v.y,o.x,o.y);if(d<bd){bd=d;best=o;}}return {t:best,d:bd};},
 fireMG(v){const D=WEAPON_DEFS.mg;if(v.fireCd>0||v.heatLock)return;v.fireCd=D.cd;v.heat+=D.heat;
  if(v.heat>=1){v.heat=1;v.heatLock=true;if(v.isPlayer){AudioSys.overheat();this.addFeed('MG OVERHEATED!');} }
  const n=v.def.id==='hog'?2:1;
  for(let i=0;i<n;i++){const a=v.angle+rand(-0.06,0.06)+(n===2?(i?0.05:-0.05):0);
   this.shots.push(makeShot({x:v.x+Math.cos(a)*26,y:v.y+Math.sin(a)*26,vx:Math.cos(a)*D.speed+ v.vx*0.4,vy:Math.sin(a)*D.speed+v.vy*0.4,
    life:D.life,dmg:D.dmg*(v.isPlayer?1:0.75),from:v.id,kind:'mg',r:3}));}
  v.vx-=Math.cos(v.angle)*8;v.vy-=Math.sin(v.angle)*8;
  if(v.isPlayer||dist2(v.x,v.y,this.player.x,this.player.y)<500)AudioSys.shoot();
  this.spawnMuzzle(v);},
 spawnMuzzle(v){for(let i=0;i<3;i++)this.parts.push(makeParticle(v.x+Math.cos(v.angle)*30,v.y+Math.sin(v.angle)*30,rand(-60,60),rand(-60,60),0.15,3,'#ffd94a'));},
 firePickup(v){const w=v.selWeapon;if((v.ammo[w]||0)<=0){if(v.isPlayer){this.addFeed('NO '+(w||'').toUpperCase()+' — GRAB A PAD');AudioSys.hit();}return;}
  const nf=this.nearestFoe(v);
  if(w==='mine'){v.ammo.mine--;this.shots.push(makeShot({x:v.x-Math.cos(v.angle)*24,y:v.y-Math.sin(v.angle)*24,vx:0,vy:0,life:25,dmg:WEAPON_DEFS.mine.dmg,from:v.id,kind:'mine',r:9,mineArm:0.6}));AudioSys.shoot();return;}
  v.ammo[w]--;const D=WEAPON_DEFS[w];
  const baseA=w==='fire'?v.angle+rand(-0.04,0.04):v.angle;
  const tgt=(w==='homing'&&nf.t&&nf.d<620)?nf.t:null;
  this.shots.push(makeShot({x:v.x+Math.cos(v.angle)*26,y:v.y+Math.sin(v.angle)*26,
   vx:Math.cos(baseA)*D.speed,vy:Math.sin(baseA)*D.speed,life:D.life,dmg:D.dmg*(v.isPlayer?1:0.8),
   from:v.id,kind:w,r:w==='homing'?5:6,homing:!!tgt||w==='homing',turn:D.turn||0,target:tgt,dot:D.dot||0}));
  AudioSys.special();},
 fireSpecial(v){if(v.specCd>0)return;const s=v.def.special;v.specCd=v.def.cd;AudioSys.special();
  if(s==='napalm'){for(let i=0;i<26;i++){const a=v.angle+rand(-0.35,0.35),sp=rand(120,420);
    this.parts.push(makeParticle(v.x+Math.cos(v.angle)*30,v.y+Math.sin(v.angle)*30,Math.cos(a)*sp,Math.sin(a)*sp,rand(0.4,0.9),rand(4,9),i%3?'#ff7b1c':'#ffd94a'));}
   this.shots.push(makeShot({x:v.x+Math.cos(v.angle)*60,y:v.y+Math.sin(v.angle)*60,vx:0,vy:0,life:1.6,dmg:8,from:v.id,kind:'napalm',r:70,aoe:70,dot:30}));
   this.cam.shake=Math.max(this.cam.shake,6);}
  else if(s==='patriots'){for(let k=0;k<3;k++){const nf=this.nearestFoe(v);
    this.shots.push(makeShot({x:v.x+rand(-14,14),y:v.y+rand(-14,14),vx:Math.cos(v.angle+k*0.15-0.15)*380,vy:Math.sin(v.angle+k*0.15-0.15)*380,
     life:WEAPON_DEFS.patriot.life,dmg:WEAPON_DEFS.patriot.dmg*(v.isPlayer?1:0.8),from:v.id,kind:'homing',r:5,homing:true,turn:3.6,target:nf.t,delay:k*0.12}));}
   this.cam.shake=Math.max(this.cam.shake,4);}
  else if(s==='ratrocket'){const nf=this.nearestFoe(v);
   this.shots.push(makeShot({x:v.x+Math.cos(v.angle)*26,y:v.y+Math.sin(v.angle)*26,vx:Math.cos(v.angle)*420,vy:Math.sin(v.angle)*420,
    life:WEAPON_DEFS.ratrocket.life,dmg:WEAPON_DEFS.ratrocket.dmg*(v.isPlayer?1:0.85),from:v.id,kind:'ratrocket',r:9,homing:true,turn:2.6,target:nf.t}));
   this.cam.shake=Math.max(this.cam.shake,5);}
  if(v.isPlayer)this.addFeed(v.def.name+' SPECIAL!');},
 explode(x,y,r,dmg,from,hurtAll){AudioSys.boom();this.cam.shake=Math.max(this.cam.shake,clamp(r*0.12,3,12));
  for(let i=0;i<Math.min(30,r);i++){const a=rand(0,6.28),sp=rand(40,320);
   this.parts.push(makeParticle(x,y,Math.cos(a)*sp,Math.sin(a)*sp,rand(0.3,0.9),rand(2,7),['#ffd94a','#ff7b1c','#ff3a2c','#555'][i%4]));}
  for(let i=0;i<10;i++){const a=rand(0,6.28);this.parts.push(makeParticle(x,y,Math.cos(a)*rand(20,80),Math.sin(a)*rand(20,80)-30,rand(0.8,1.6),rand(6,12),'rgba(80,80,90,0.7)'));}
  for(const v of this.allVehicles()){if(v.id===from&&!hurtAll)continue;
   const d=dist2(x,y,v.x,v.y);if(d<r+v.r||!v.r){const f=1-d/(r+30);if(f>0)this.damage(v,Math.round(dmg*f),from);}}
  for(const b of this.barrels){if(b.hp>0&&dist2(x,y,b.x,b.y)<r+14){b.hp=0;this.barrelBoom(b,from);}}},
 barrelBoom(b,from){this.explode(b.x,b.y,95,50,from,true);this.texts.push(makeText(b.x,b.y-14,'BARREL!', '#ffb02e'));},
 damage(v,n,fromId){if(!v.alive||v.invuln>0||n<=0)return;v.hp-=n;v.flash=0.12;
  const from=[this.player].concat(this.foes).find(o=>o&&o.id===fromId);
  if(v.isPlayer){this.cam.shake=Math.max(this.cam.shake,3);AudioSys.hit();}
  else if(from&&from.isPlayer){this.addScore(Math.ceil(n/4),v.x+rand(-10,10),v.y-24);}
  for(let i=0;i<4;i++)this.parts.push(makeParticle(v.x+rand(-12,12),v.y+rand(-12,12),rand(-120,120),rand(-120,120),0.3,3,'#ffdf5a'));
  if(v.hp<=0)this.kill(v,from);},
 kill(v,by){v.hp=0;v.alive=false;this.explode(v.x,v.y,80,0,v.id,true);
  if(v.isPlayer){this.lives--;this.addFeed('YOU WERE WRECKED! Lives: '+this.lives);
   this.respawnT=this.lives<=0?1.0:1.4;}
  else{this.kills++;this.addScore(100,v.x,v.y-30);this.addFeed((by&&by.isPlayer?'YOU':(by?by.def.name:'ARENA'))+' → '+v.def.name+' +100');
   if(v.isPlayer===false&&Math.random()<0.5)this.pads.push(makePad(clamp(v.x,ARENA.x+40,ARENA.x+ARENA.w-40),clamp(v.y,ARENA.y+40,ARENA.y+ARENA.h-40),['homing','fire','mine'][Math.floor(Math.random()*3)]));
   if(this.foes.every(f=>!f.alive))this.clearT=1.2;}},
 respawn(){if(this.lives<=0||this.screen!=='play')return;const p=this.player;
  p.hp=p.maxhp;p.alive=true;p.x=150;p.y=150;p.vx=0;p.vy=0;p.heat=0;p.heatLock=false;p.invuln=2.5;p.specCd=0;
  this.addFeed('BACK IN THE FIGHT!');},
 /* ----- update ----- */
 update(dt){this.runTime+=dt;
  if(this.screen==='countdown'){this.countdown-=dt;
   if(this.countdown<=0){this.screen='play';overlay.innerHTML='';this.addFeed(LEVELS[this.level].name+' — WRECK THEM ALL!');}
   return;}
  if(this.screen!=='play')return;
  this.levelTime+=dt;
  // death / clear sequencing (timer-based so pause can't desync it)
  if(this.player&&!this.player.alive&&this.respawnT>0){this.respawnT-=dt;
   if(this.respawnT<=0){if(this.lives<=0){this.gameOver();return;}else this.respawn();}}
  if(this.clearT>0){this.clearT-=dt;if(this.clearT<=0){this.clearT=0;this.levelClear();return;}}
  const L=LEVELS[this.level];
  this.updateVehicle(this.player,dt,true,L);
  for(const f of this.foes)if(f.alive)this.updateVehicle(f,dt,false,L);
  this.updateShots(dt,L);this.updatePads(dt);this.updateFx(dt);
  // ram collisions
  const vs=this.allVehicles();
  for(let i=0;i<vs.length;i++)for(let j=i+1;j<vs.length;j++)this.collideVehicles(vs[i],vs[j]);
  // camera
  const p=this.player;
  const tx=p?clamp(p.x+p.vx*0.35,0,ARENA.x+ARENA.w):480,ty=p?clamp(p.y+p.vy*0.35,0,ARENA.y+ARENA.h):300;
  this.cam.x+=(tx-this.cam.x)*Math.min(1,dt*5);this.cam.y+=(ty-this.cam.y)*Math.min(1,dt*5);
  this.cam.shake=Math.max(0,this.cam.shake-dt*22);
  AudioSys.engine(p&&p.alive,Math.abs(p?p.speed:0));
  if(this.msgT>0)this.msgT-=dt;},
 updateVehicle(v,dt,isPlayer,L){if(!v.alive)return;
  v.fireCd-=dt;v.specCd-=dt;v.invuln-=dt;v.ramCd-=dt;v.flash-=dt;
  if(v.heatLock){v.heat-=dt*0.25;if(v.heat<=0.35){v.heat=0.35;v.heatLock=false;}}
  else v.heat=Math.max(0,v.heat-dt*0.45);
  let th=0,steer=0,hb=false;
  if(isPlayer){th=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0);
   steer=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0);
   hb=!!keys.Space;
   if(keys.KeyJ||mouse.down)this.fireMG(v);
   if(keys.KeyK||mouse.rdown){if(!v.pkCd||v.pkCd<=0){this.firePickup(v);v.pkCd=0.3;}}
   v.pkCd=(v.pkCd||0)-dt;
   if(keys.KeyL||keys.KeyE)this.fireSpecial(v);
   if(keys.Digit1)v.selWeapon='homing';if(keys.Digit2)v.selWeapon='fire';if(keys.Digit3)v.selWeapon='mine';
   const wantTurbo=(keys.ShiftLeft||keys.ShiftRight)&&v.turboN>0;
   v.turbo=wantTurbo?Math.max(0,(v.turbo||0)+dt):0;
   if(wantTurbo&&v.turboN>0){v.turboN-=dt*0.35;if(v.turboN<=0){v.turboN=0;v.turbo=0;}
    if(Math.random()<0.5)this.parts.push(makeParticle(v.x-Math.cos(v.angle)*22,v.y-Math.sin(v.angle)*22,rand(-40,40),rand(-40,40),0.3,4,'#5ac8ff'));}
   else v.turbo=0;
  }else{const c=this.aiControl(v,L);th=c.th;steer=c.steer;hb=false;}
  const boost=v.turbo>0?1.7:1;
  const maxsp=v.def.maxsp*(v.isPlayer?1:v.skill*0.35+0.75)*boost;
  if(th>0)v.speed+=v.def.accel*th*dt*boost;else if(th<0)v.speed+=v.def.accel*th*dt*0.7;
  else v.speed-=Math.sign(v.speed)*Math.min(Math.abs(v.speed),v.def.accel*0.8*dt);
  v.speed=clamp(v.speed,-maxsp*0.45,maxsp);
  if(hb)v.speed*=Math.max(0,1-dt*3);
  // steering: positive steer (D/right) rotates clockwise on screen (y-down).
  // Real-car feel: steering direction flips when reversing.
  const sf=clamp(Math.abs(v.speed)/120,0,1);
  v.angle+=steer*(hb?3.4:v.def.turn)*sf*dt*(v.speed<0?-1:1);
  // arcade: velocity follows heading with grip
  const hx=Math.cos(v.angle)*v.speed,hy=Math.sin(v.angle)*v.speed;
  const g=clamp(v.def.grip*dt*(hb?0.4:1),0,1);
  v.vx+=(hx-v.vx)*g;v.vy+=(hy-v.vy)*g;
  v.x+=v.vx*dt;v.y+=v.vy*dt;
  v.r=20;
  // arena bounds
  if(v.x<ARENA.x+18){v.x=ARENA.x+18;this.wallHit(v);}if(v.x>ARENA.x+ARENA.w-18){v.x=ARENA.x+ARENA.w-18;this.wallHit(v);}
  if(v.y<ARENA.y+18){v.y=ARENA.y+18;this.wallHit(v);}if(v.y>ARENA.y+ARENA.h-18){v.y=ARENA.y+ARENA.h-18;this.wallHit(v);}
  // obstacles
  for(const w of L.walls){if(circleRect(v.x,v.y,18,w)){this.pushOut(v,w);this.wallHit(v);}}
  // pads
  for(const pd of this.pads){if(!pd.active)continue;
   if(dist2(v.x,v.y,pd.x,pd.y)<30){
    if(pd.kind==='repair'){if(v.hp<v.maxhp){v.hp=Math.min(v.maxhp,v.hp+30*dt);if(v.isPlayer&&Math.random()<0.1)AudioSys.pickup();}}
    else if(v.isPlayer||v.skill>0.4){this.collectPad(v,pd);}}}
  // dust
  if(Math.abs(v.speed)>200&&Math.random()<0.3)this.parts.push(makeParticle(v.x-Math.cos(v.angle)*20,v.y-Math.sin(v.angle)*20,rand(-20,20),rand(-20,20),0.5,4,'rgba(120,120,130,0.4)'));},
 aiControl(v,L){const ai=v.ai;ai.t-=1/60;ai.fireT-=1/60;
  const nf=this.nearestFoe(v);
  // pick a waypoint: enemy if ammo/hp ok else nearest active pad
  let tx=nf.t?nf.t.x:v.x,ty=nf.t?nf.t.y:v.y;
  const needPad=(v.hp<v.maxhp*0.45)||((v.ammo.homing||0)<=0&&(v.ammo.fire||0)<=0);
  if(needPad){let bd=1e9,bp=null;for(const p of this.pads){if(!p.active)continue;const d=dist2(v.x,v.y,p.x,p.y);if(d<bd){bd=d;bp=p;}}if(bp){tx=bp.x;ty=bp.y;}}
  // wall whiskers
  let steerDir=0;const px=v.x+Math.cos(v.angle)*70,py=v.y+Math.sin(v.angle)*70;
  let blocked=px<ARENA.x+20||px>ARENA.x+ARENA.w-20||py<ARENA.y+20||py>ARENA.y+ARENA.h-20;
  for(const w of L.walls)if(circleRect(px,py,26,w)){blocked=true;break;}
  const want= Math.atan2(ty-v.y,tx-v.x);
  let d=angDiff(want,v.angle);
  if(ai.avoidLeft===undefined)ai.avoidLeft=false;
  if(blocked){if(ai.t<=0){ai.avoidLeft=!ai.avoidLeft;ai.t=0.8;}}
  const th=nf.d>90?1:(nf.d<50?-0.5:0.3);
  // screen coords are y-down: heading angle grows clockwise, so a positive
  // angle error (target clockwise of nose) needs positive steer (right).
  const prop=clamp(d*1.6,-1,1);
  // fire control
  if(nf.t&&nf.d<520&&Math.abs(angDiff(Math.atan2(nf.t.y-v.y,nf.t.x-v.x),v.angle))<0.25&&ai.fireT<=0){
   const r=Math.random();
   if(r<0.55)this.fireMG(v);
   else if(r<0.75&&(v.ammo.homing>0||v.ammo.fire>0)){v.selWeapon=v.ammo.homing>0?'homing':'fire';this.firePickup(v);}
   else if(r<0.85&&v.specCd<=0)this.fireSpecial(v);
   else if(r<0.9&&v.ammo.mine>0){v.selWeapon='mine';this.firePickup(v);}
   ai.fireT=rand(0.5,1.6)/v.skill;}
  return {th,steer:blocked?(ai.avoidLeft?1:-1):prop};},
 wallHit(v){const sp=Math.hypot(v.vx,v.vy);if(sp>320){this.damage(v,Math.round((sp-300)/40),-999);
   for(let i=0;i<6;i++)this.parts.push(makeParticle(v.x,v.y,rand(-150,150),rand(-150,150),0.4,3,'#ffb02e'));
   if(v.isPlayer)this.cam.shake=Math.max(this.cam.shake,4);}
  v.vx*=-0.35;v.vy*=-0.35;v.speed*=0.5;},
 pushOut(v,w){const nx=clamp(v.x,w.x,w.x+w.w),ny=clamp(v.y,w.y,w.y+w.h);
  let dx=v.x-nx,dy=v.y-ny;if(dx===0&&dy===0){dx=v.x-(w.x+w.w/2);dy=v.y-(w.y+w.h/2);}
  const d=Math.hypot(dx,dy)||1;v.x=nx+dx/d*19;v.y=ny+dy/d*19;},
 collectPad(v,pd){pd.active=false;pd.t=12;AudioSys.pickup();
  if(pd.kind==='turbo'){v.turboN=1;this.addFeed(v.isPlayer?'TURBO READY — hold SHIFT':'foe grabs turbo');}
  else{v.ammo[pd.kind]=(v.ammo[pd.kind]||0)+WEAPON_DEFS[pd.kind].ammo;v.selWeapon=pd.kind;
   if(v.isPlayer){this.addScore(10,v.x,v.y-30);this.addFeed(pd.label+' +'+WEAPON_DEFS[pd.kind].ammo);}}},
 updatePads(dt){for(const p of this.pads){if(!p.active){p.t-=dt;if(p.t<=0)p.active=true;}}},
 collideVehicles(a,b){if(!a.alive||!b.alive)return;const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
  if(d>40||d===0)return;const nx=dx/d,ny=dy/d,ov=(40-d)/2;a.x-=nx*ov;a.y-=ny*ov;b.x+=nx*ov;b.y+=ny*ov;
  const rel=Math.abs(a.speed)+Math.abs(b.speed);
  if(rel>180&&a.ramCd<=0&&b.ramCd<=0){a.ramCd=b.ramCd=0.5;
   const dmg=Math.round((rel-150)/22);
   // faster car deals more, takes less
   const af=Math.abs(a.speed)>=Math.abs(b.speed)?1.25:0.7;
   const bf=Math.abs(b.speed)>Math.abs(a.speed)?1.25:0.7;
   this.damage(a,Math.max(1,Math.round(dmg*bf)),b.id);this.damage(b,Math.max(1,Math.round(dmg*af)),a.id);
   this.cam.shake=Math.max(this.cam.shake,3);AudioSys.hit();
   for(let i=0;i<8;i++)this.parts.push(makeParticle((a.x+b.x)/2,(a.y+b.y)/2,rand(-200,200),rand(-200,200),0.4,4,'#ffd94a'));}
  // positional push apart velocity exchange
  const aix=a.vx*nx+a.vy*ny,bix=b.vx*nx+b.vy*ny;
  a.vx+=(bix-aix)*nx*0.5;a.vy+=(bix-aix)*ny*0.5;b.vx+=(aix-bix)*nx*0.5;b.vy+=(aix-bix)*ny*0.5;},
 updateShots(dt,L){for(const s of this.shots){if(s.dead)continue;s.age+=dt;
   if(s.delay&&s.delay>0){s.delay-=dt;continue;}
   if(s.kind==='mine'){s.mineArm-=dt;
    if(s.mineArm<=0){const nf=this.foes.concat([this.player]).filter(v=>v&&v.alive&&v.id!==s.from);
     for(const v of nf)if(dist2(s.x,s.y,v.x,v.y)<52){s.dead=true;this.explode(s.x,s.y,80,s.dmg,s.from,true);break;}}
    if(s.age>s.life)s.dead=true;continue;}
   if(s.kind==='napalm'){ // static flame zone DoT
    if(Math.random()<0.6)this.parts.push(makeParticle(s.x+rand(-50,50),s.y+rand(-50,50),rand(-20,20),rand(-60,-10),rand(0.3,0.7),rand(4,8),['#ffd94a','#ff7b1c','#ff3a2c'][Math.floor(Math.random()*3)]));
    for(const v of this.allVehicles()){if(v.id===s.from||!v.alive)continue;
     if(dist2(s.x,s.y,v.x,v.y)<s.aoe)this.damage(v,Math.round(s.dot*dt*2),s.from);}
    if(s.age>s.life)s.dead=true;continue;}
   if(s.homing&&s.target&&s.target.alive){const want=Math.atan2(s.target.y-s.y,s.target.x-s.x);
    const cur=Math.atan2(s.vy,s.vx);const d=angDiff(want,cur);
    const na=cur+clamp(d,-s.turn*dt,s.turn*dt);const sp=Math.hypot(s.vx,s.vy);
    s.vx=Math.cos(na)*sp;s.vy=Math.sin(na)*sp;}
   s.x+=s.vx*dt;s.y+=s.vy*dt;
   if(s.kind==='fire'&&Math.random()<0.5)this.parts.push(makeParticle(s.x,s.y,rand(-30,30),rand(-30,30),0.3,4,'#ff7b1c'));
   if(s.kind==='ratrocket')this.parts.push(makeParticle(s.x,s.y,rand(-30,30),rand(-30,30),0.4,5,'#ffb02e'));
   // walls / bounds
   let hitWall=s.x<ARENA.x||s.x>ARENA.x+ARENA.w||s.y<ARENA.y||s.y>ARENA.y+ARENA.h;
   for(const w of L.walls)if(circleRect(s.x,s.y,s.r,w)){hitWall=true;break;}
   if(hitWall){if(s.kind==='mg'||s.kind==='fire'){s.dead=true;for(let i=0;i<3;i++)this.parts.push(makeParticle(s.x,s.y,rand(-80,80),rand(-80,80),0.25,2,'#ffd94a'));}
    else{s.dead=true;this.explode(s.x,s.y,s.kind==='ratrocket'?95:70,s.dmg,s.from,true);}continue;}
   // barrels
   for(const b of this.barrels){if(b.hp>0&&dist2(s.x,s.y,b.x,b.y)<s.r+12){s.dead=true;b.hp-=s.dmg;
     if(b.hp<=0)this.barrelBoom(b,s.from);else{this.explode(s.x,s.y,40,s.dmg,s.from,true);}break;}}
   if(s.dead)continue;
   // vehicles
   for(const v of this.allVehicles()){if(v.id===s.from||!v.alive)continue;
    if(dist2(s.x,s.y,v.x,v.y)<s.r+18){s.dead=true;
     if(s.kind==='mg'){this.damage(v,s.dmg,s.from);}
     else{this.explode(s.x,s.y,s.kind==='ratrocket'?95:(s.dot?80:70),s.kind==='fire'?s.dmg+14:s.dmg,s.from,true);
      if(s.dot){v.dotT=2;v.dotFrom=s.from;}}
     break;}}
   if(s.age>s.life){if(s.kind!=='mg'){s.dead=true;this.explode(s.x,s.y,50,Math.round(s.dmg*0.4),s.from,true);}else s.dead=true;}}
  this.shots=this.shots.filter(s=>!s.dead);
  // DoT ticks
  for(const v of this.allVehicles()){if(v.dotT>0){v.dotT-=dt;if(Math.random()<dt*8)this.damage(v,2,v.dotFrom||-999);}}},
 updateFx(dt){for(const p of this.parts){p.life-=dt;if(p.life<=0){p.dead=true;continue;}p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=(p.grav||0)*dt;p.vx*=0.98;p.vy*=0.98;}
  this.parts=this.parts.filter(p=>!p.dead);if(this.parts.length>450)this.parts.splice(0,this.parts.length-450);
  for(const t of this.texts){t.life-=dt;t.y-=30*dt;if(t.life<=0)t.dead=true;}
  this.texts=this.texts.filter(t=>!t.dead);},
 /* ----- render ----- */
 render(){const L=LEVELS[this.level]||LEVELS[0];
  ctx.save();ctx.clearRect(0,0,W,H);
  let sx=0,sy=0;if(this.cam.shake>0){sx=rand(-1,1)*this.cam.shake;sy=rand(-1,1)*this.cam.shake;}
  const ox=W/2-this.cam.x+sx,oy=H/2-this.cam.y+sy;
  // floor
  ctx.fillStyle='#0e1015';ctx.fillRect(0,0,W,H);
  ctx.fillStyle=L.floor;ctx.fillRect(ARENA.x+ox,ARENA.y+oy,ARENA.w,ARENA.h);
  ctx.strokeStyle=L.line;ctx.lineWidth=1;
  for(let gx=ARENA.x;gx<ARENA.x+ARENA.w;gx+=44){ctx.beginPath();ctx.moveTo(gx+ox,ARENA.y+oy);ctx.lineTo(gx+ox,ARENA.y+ARENA.h+oy);ctx.stroke();}
  for(let gy=ARENA.y;gy<ARENA.y+ARENA.h;gy+=44){ctx.beginPath();ctx.moveTo(ARENA.x+ox,gy+oy);ctx.lineTo(ARENA.x+ARENA.w+ox,gy+oy);ctx.stroke();}
  // arena border
  ctx.strokeStyle='#f33a2c';ctx.lineWidth=4;ctx.strokeRect(ARENA.x+ox,ARENA.y+oy,ARENA.w,ARENA.h);
  // oil stains
  ctx.fillStyle='rgba(0,0,0,0.25)';
  // walls
  for(const w of L.walls){ctx.fillStyle='#3a4155';ctx.fillRect(w.x+ox,w.y+oy,w.w,w.h);
   ctx.strokeStyle='#565f78';ctx.lineWidth=2;ctx.strokeRect(w.x+ox,w.y+oy,w.w,w.h);
   ctx.fillStyle='rgba(255,176,46,0.5)';ctx.fillRect(w.x+ox,w.y+oy,w.w,4);}
  // pads
  for(const p of this.pads)this.drawPad(p,ox,oy);
  // barrels
  for(const b of this.barrels){if(b.hp<=0)continue;
   ctx.fillStyle='#a33327';ctx.beginPath();ctx.arc(b.x+ox,b.y+oy,11,0,7);ctx.fill();
   ctx.fillStyle='#ff7b1c';ctx.fillRect(b.x+ox-5,b.y+oy-3,10,6);
   ctx.fillStyle='#fff';ctx.font='9px sans-serif';ctx.textAlign='center';ctx.fillText('!',b.x+ox,b.y+oy+3);}
  // mines
  for(const s of this.shots){if(s.kind!=='mine'||s.dead)continue;if(s.delay&&s.delay>0)continue;
   ctx.fillStyle=s.mineArm>0?'#666':'#ff3a2c';ctx.beginPath();ctx.arc(s.x+ox,s.y+oy,8,0,7);ctx.fill();
   ctx.fillStyle='#fff';ctx.fillRect(s.x+ox-1,s.y+oy-1,2,2);}
  // napalm zones
  for(const s of this.shots){if(s.kind!=='napalm'||s.dead)continue;if(s.delay&&s.delay>0)continue;
   const g=ctx.createRadialGradient(s.x+ox,s.y+oy,5,s.x+ox,s.y+oy,s.aoe);
   g.addColorStop(0,'rgba(255,120,20,0.5)');g.addColorStop(1,'rgba(255,60,20,0)');
   ctx.fillStyle=g;ctx.beginPath();ctx.arc(s.x+ox,s.y+oy,s.aoe,0,7);ctx.fill();}
  // vehicles
  for(const f of this.foes)if(f.alive||f.deathT)this.drawVehicle(f,ox,oy,false);
  if(this.player&&(this.player.alive))this.drawVehicle(this.player,ox,oy,true);
  // projectiles
  for(const s of this.shots){if(s.dead||s.kind==='mine'||s.kind==='napalm')continue;if(s.delay&&s.delay>0)continue;
   if(s.kind==='mg'){ctx.strokeStyle='#ffe97b';ctx.lineWidth=2;ctx.beginPath();
    ctx.moveTo(s.x+ox,s.y+oy);ctx.lineTo(s.x-s.vx*0.02+ox,s.y-s.vy*0.02+oy);ctx.stroke();}
   else{ctx.fillStyle=s.kind==='fire'?'#ff7b1c':s.kind==='ratrocket'?'#ffb02e':'#5ac8ff';
    ctx.beginPath();ctx.arc(s.x+ox,s.y+oy,s.r,0,7);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.7)';ctx.beginPath();ctx.arc(s.x+ox,s.y+oy,s.r*0.4,0,7);ctx.fill();}}
  // particles
  for(const p of this.parts){ctx.globalAlpha=clamp(p.life/p.maxlife,0,1);ctx.fillStyle=p.color;
   ctx.fillRect(p.x+ox-p.size/2,p.y+oy-p.size/2,p.size,p.size);}
  ctx.globalAlpha=1;
  // floating texts
  ctx.textAlign='center';
  for(const t of this.texts){ctx.globalAlpha=clamp(t.life,0,1);ctx.fillStyle=t.color;
   ctx.font='bold 14px sans-serif';ctx.fillText(t.str,t.x+ox,t.y+oy);}
  ctx.globalAlpha=1;
  ctx.restore();
  if(this.screen==='play'||this.screen==='pause'||this.screen==='countdown')this.drawHUD(L);
  if(this.screen==='countdown'){ctx.fillStyle='rgba(0,0,0,0.45)';ctx.fillRect(0,0,W,H);
   ctx.fillStyle='#ffb02e';ctx.font='bold 72px sans-serif';ctx.textAlign='center';
   ctx.fillText(this.countdown>0.6?String(Math.ceil(this.countdown-0.2)):'WRECK!',W/2,H/2);
   ctx.font='bold 22px sans-serif';ctx.fillStyle='#fff';ctx.fillText(LEVELS[this.level].name+' — ARENA '+(this.level+1)+'/3',W/2,H/2+50);}},
 drawPad(p,ox,oy){if(!p.active){ctx.strokeStyle='rgba(120,130,150,0.3)';ctx.strokeRect(p.x+ox-16,p.y+oy-16,32,32);return;}
  const cols={homing:'#5ac8ff',fire:'#ff7b1c',mine:'#c77bff',repair:'#3aff7b',turbo:'#ffe97b'};
  ctx.fillStyle='rgba(10,12,18,0.9)';ctx.fillRect(p.x+ox-16,p.y+oy-16,32,32);
  ctx.strokeStyle=cols[p.kind]||'#fff';ctx.lineWidth=2;ctx.strokeRect(p.x+ox-16,p.y+oy-16,32,32);
  ctx.fillStyle=cols[p.kind]||'#fff';ctx.font='bold 9px sans-serif';ctx.textAlign='center';
  const glyph={homing:'▲▲',fire:'☰',mine:'●',repair:'✚',turbo:'≫'}[p.kind]||'?';
  ctx.fillText(glyph,p.x+ox,p.y+oy+1);ctx.font='8px sans-serif';ctx.fillText(p.label,p.x+ox,p.y+oy+13);},
 drawVehicle(v,ox,oy,isP){if(!v.alive)return;
  if(v.invuln>0&&Math.floor(performance.now()/120)%2===0)return; // blink
  ctx.save();ctx.translate(v.x+ox,v.y+oy);ctx.rotate(v.angle);
  // shadow
  ctx.fillStyle='rgba(0,0,0,0.4)';ctx.beginPath();ctx.ellipse(2,3,24,14,0,0,7);ctx.fill();
  // wheels
  ctx.fillStyle='#0a0a0a';
  ctx.fillRect(-12,-15,10,6);ctx.fillRect(2,-15,10,6);ctx.fillRect(-12,9,10,6);ctx.fillRect(2,9,10,6);
  // hull
  ctx.fillStyle=v.flash>0?'#ffffff':v.def.color;
  ctx.strokeStyle=isP?'#ffb02e':'#111';ctx.lineWidth=isP?3:2;
  const long=v.def.id==='hog'?27:24,wide=v.def.id==='hog'?17:14;
  ctx.beginPath();
  if(ctx.roundRect)ctx.roundRect(-long,-wide,long*2,wide*2,5);else ctx.rect(-long,-wide,long*2,wide*2);
  ctx.fill();ctx.stroke();
  // cabin + nose gun
  ctx.fillStyle=v.def.accent;ctx.fillRect(-6,-7,12,14);
  ctx.fillStyle='#222';ctx.fillRect(8,-3,14,6);
  ctx.fillStyle='#0e1015';ctx.fillRect(-2,-5,8,10);
  // type garnish
  if(v.def.id==='fang'){ctx.fillStyle='#fff';ctx.fillRect(-long,-wide,6,wide*2);ctx.fillStyle='#f33a2c';ctx.font='7px sans-serif';ctx.textAlign='center';ctx.fillText('ICE',-long+3,3);}
  if(v.def.id==='hog'){ctx.fillStyle=v.def.accent;ctx.fillRect(-4,-wide,8,4);ctx.fillRect(-4,wide-4,8,4);}
  if(v.def.id==='rat'){ctx.fillStyle=v.def.accent;ctx.beginPath();ctx.moveTo(long-2,0);ctx.lineTo(long-12,-6);ctx.lineTo(long-12,6);ctx.fill();}
  if(v.turbo>0){ctx.fillStyle='rgba(90,200,255,0.8)';ctx.beginPath();ctx.moveTo(-long,0);ctx.lineTo(-long-14,-6);ctx.lineTo(-long-14,6);ctx.fill();}
  ctx.restore();
  // hp bar + name
  const w=44;ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(v.x+ox-w/2,v.y+oy-32,w,6);
  ctx.fillStyle=v.hp/v.maxhp>0.5?'#3aff7b':v.hp/v.maxhp>0.25?'#ffb02e':'#ff3a2c';
  ctx.fillRect(v.x+ox-w/2,v.y+oy-32,w*clamp(v.hp/v.maxhp,0,1),6);
  ctx.fillStyle=isP?'#ffb02e':'#ff8a7a';ctx.font='bold 10px sans-serif';ctx.textAlign='center';
  ctx.fillText(isP?'YOU · '+v.def.name:v.def.name,v.x+ox,v.y+oy-36);
  if(v.specCd<=0&&isP){ctx.fillStyle='#5ac8ff';ctx.font='9px sans-serif';ctx.fillText('SPECIAL READY',v.x+ox,v.y+oy+30);}},
 drawHUD(L){const p=this.player;if(!p)return;
  // top bar
  ctx.fillStyle='rgba(5,6,10,0.75)';ctx.fillRect(0,0,W,54);
  ctx.textAlign='left';ctx.fillStyle='#f33a2c';ctx.font='bold 16px sans-serif';
  ctx.fillText('ARENA '+(this.level+1)+'/3 · '+L.name,12,22);
  ctx.fillStyle='#fff';ctx.font='bold 15px sans-serif';
  ctx.fillText('SCORE '+this.score+'   KILLS '+this.kills+'/'+(this.kills+this.foes.filter(f=>f.alive).length)+'   LIVES '+'●'.repeat(Math.max(0,this.lives))+'○'.repeat(Math.max(0,3-this.lives)),12,42);
  ctx.textAlign='right';ctx.fillStyle='#ffb02e';ctx.font='bold 15px sans-serif';
  ctx.fillText('HI '+this.high+'   '+this.levelTime.toFixed(1)+'s',W-12,22);
  ctx.fillStyle='#9aa1b5';ctx.font='12px sans-serif';
  ctx.fillText('[P]ause [M]ute('+(this.muted?'off':'on')+')',W-12,42);ctx.textAlign='left';
  // bottom-left: hull + heat
  ctx.fillStyle='rgba(5,6,10,0.75)';ctx.fillRect(0,H-64,330,64);
  ctx.fillStyle='#c9cedb';ctx.font='bold 12px sans-serif';ctx.fillText('HULL',12,H-44);
  ctx.fillStyle='#222';ctx.fillRect(60,H-56,180,14);
  ctx.fillStyle=p.hp/p.maxhp>0.5?'#3aff7b':p.hp/p.maxhp>0.25?'#ffb02e':'#ff3a2c';
  ctx.fillRect(60,H-56,180*clamp(p.hp/p.maxhp,0,1),14);
  ctx.fillStyle='#fff';ctx.font='11px sans-serif';ctx.fillText(Math.max(0,Math.ceil(p.hp))+'',244,H-45);
  ctx.fillStyle='#c9cedb';ctx.font='bold 12px sans-serif';ctx.fillText('MG HEAT',12,H-24);
  ctx.fillStyle='#222';ctx.fillRect(60,H-36,180,12);
  ctx.fillStyle=p.heatLock?'#ff3a2c':'#5ac8ff';ctx.fillRect(60,H-36,180*clamp(p.heat,0,1),12);
  if(p.heatLock){ctx.fillStyle='#ff3a2c';ctx.font='bold 11px sans-serif';ctx.fillText('OVERHEAT!',244,H-26);}
  // bottom-center: weapons + special
  ctx.fillStyle='rgba(5,6,10,0.75)';ctx.fillRect(340,H-64,300,64);
  const ws=['homing','fire','mine'];
  ws.forEach((w,i)=>{const x=352+i*86;const sel=p.selWeapon===w;
   ctx.strokeStyle=sel?'#ffb02e':'#4a5268';ctx.lineWidth=sel?3:1;ctx.strokeRect(x,H-56,78,40);
   ctx.fillStyle=sel?'#ffb02e':'#9aa1b5';ctx.font='bold 11px sans-serif';
   ctx.fillText((i+1)+'.'+w.toUpperCase()+' '+(p.ammo[w]||0),x+4,H-38);
   ctx.fillStyle='#555f75';ctx.font='10px sans-serif';ctx.fillText(w==='mine'?'drop':'fire',x+4,H-24);});
  // special
  const ready=p.specCd<=0;
  ctx.strokeStyle=ready?'#5ac8ff':'#4a5268';ctx.lineWidth=ready?3:1;ctx.strokeRect(340+3*86+8,H-56,86,40);
  ctx.fillStyle=ready?'#5ac8ff':'#777';ctx.font='bold 11px sans-serif';
  ctx.fillText(ready?'L.SPECIAL!':'L.'+Math.ceil(p.specCd)+'s',340+3*86+12,H-32);
  if(p.turboN>0){ctx.fillStyle='#5ac8ff';ctx.font='10px sans-serif';ctx.fillText('TURBO SHIFT '+(p.turboN*100|0)+'%',352,H-12);}else{ctx.fillStyle='#555';ctx.font='10px sans-serif';ctx.fillText('TURBO EMPTY — grab ≫',352,H-12);}
  // minimap
  const mw=150,mh=92,mx=W-mw-10,my=H-mh-10,sx=mw/(ARENA.w+80),sy=mh/(ARENA.h+80);
  ctx.fillStyle='rgba(5,6,10,0.8)';ctx.fillRect(mx,my,mw,mh);
  ctx.strokeStyle='#4a5268';ctx.strokeRect(mx,my,mw,mh);
  const dot=(x,y,c,r)=>{ctx.fillStyle=c;ctx.beginPath();ctx.arc(mx+(x-ARENA.x+40)*sx,my+(y-ARENA.y+40)*sy,r||2,0,7);ctx.fill();};
  for(const pd of this.pads)if(pd.active)dot(pd.x,pd.y,pd.kind==='repair'?'#3aff7b':'#ffb02e',1.5);
  for(const f of this.foes)if(f.alive)dot(f.x,f.y,'#ff3a2c',2.5);
  if(p.alive)dot(p.x,p.y,'#fff',3);
  // killfeed
  ctx.font='12px sans-serif';this.feed.forEach((f,i)=>{ctx.fillStyle=i===0?'#ffb02e':'#9aa1b5';ctx.fillText(f,12,70+i*16);});
  // damage vignette + low hp
  if(p.flash>0||p.hp<p.maxhp*0.3){const a=p.hp<p.maxhp*0.3?0.35+0.15*Math.sin(performance.now()/150):0.25;
   const g=ctx.createRadialGradient(W/2,H/2,H/3,W/2,H/2,H);
   g.addColorStop(0,'rgba(255,0,0,0)');g.addColorStop(1,'rgba(255,30,20,'+a+')');
   ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
   if(p.hp<p.maxhp*0.3&&p.alive){ctx.fillStyle='#ff3a2c';ctx.font='bold 16px sans-serif';ctx.textAlign='center';ctx.fillText('⚠ HULL CRITICAL — FIND REPAIR ✚',W/2,80);ctx.textAlign='left';}}
 },
 loop(t){requestAnimationFrame(e=>this.loop(e));let dt=(t-(this._lt||t))/1000;this._lt=t;
  this._fps=Math.round(1/Math.max(dt,1e-4));
  dt=Math.min(dt,0.033);if(this.screen==='play'||this.screen==='countdown')this.update(dt);
  else this.updateFx(dt);
  this.render();}
};
window.Game=Game;
// test hooks (used by automated browser verification; harmless in play)
window.__tm={state(){return {screen:Game.screen,level:Game.level,score:Game.score,lives:Game.lives,
 playerHp:Game.player?Math.round(Game.player.hp):null,playerAlive:Game.player?Game.player.alive:null,
 enemiesLeft:Game.foes.filter(f=>f.alive).length,enemies:Game.foes.map(f=>Math.round(f.hp)),
 shots:Game.shots.length,hi:Game.high,
  foePos:Game.foes.map(f=>[Math.round(f.x),Math.round(f.y),f.alive]),
  foeShots:Game.player?Game.shots.filter(s=>s.from!==Game.player.id).length:0,
  fps:Game._fps||0};},
 start(i){Game.selVeh=i||0;Game.startRun();},
 killEnemies(){for(const f of Game.foes)if(f.alive)Game.damage(f,99999,Game.player?Game.player.id:-1);},
 hurtPlayer(n){if(Game.player)Game.damage(Game.player,n||9999,-999);},
 select(i){Game.selVeh=i;}};
Game.init();
Game.loop(0);
})();
