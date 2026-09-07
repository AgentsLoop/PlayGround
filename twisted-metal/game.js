/* RUSTCARNAGE — original top-down arena vehicular combat tribute.
   No external assets. All art procedural on canvas. */
'use strict';
const TAU = Math.PI*2;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const dist2=(ax,ay,bx,by)=>{const dx=ax-bx,dy=ay-by;return dx*dx+dy*dy;};
const angDiff=(a,b)=>{let d=(b-a)%TAU;if(d>Math.PI)d-=TAU;if(d<-Math.PI)d+=TAU;return d;};
const $=id=>document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Data (original) ---------- */
const VEHICLES = {
  chuckles:{name:'CHUCKLES', desc:'Ice-cream truck · balanced · Carnival special', color:'#f2b632', dark:'#7a4a12', top:'#fff3d6',
    hp:120, speed:265, accel:420, turn:3.1, special:'carnival', specialName:'CARNIVAL ×10', mgDmg:6},
  vandal:{name:'VANDAL', desc:'Muscle sedan · fast · Scatter special', color:'#d8362a', dark:'#5f130d', top:'#2b2f36',
    hp:95, speed:315, accel:520, turn:3.6, special:'scatter', specialName:'SCATTER FAN', mgDmg:5},
  bastion:{name:'BASTION', desc:'Monster rig · tank · Slam + mines', color:'#3fa34d', dark:'#173d20', top:'#c9cfd6',
    hp:165, speed:225, accel:360, turn:2.6, special:'slam', specialName:'SLAM', mgDmg:7},
};
const ARENAS = {
  rustyard:{name:'RUSTYARD', desc:'Junkyard crush · dense wrecks', w:2200,h:1600},
  dustbowl:{name:'DUSTBOWL', desc:'Desert ring · open + fast', w:2500,h:1800},
};
const WEAPONS = {
  mg:{name:'MG', ammo:Infinity},
  homing:{name:'HOMING', ammo:4, dmg:16, speed:430, turn:4.2, color:'#7df9ff'},
  power:{name:'POWER', ammo:6, dmg:22, speed:640, turn:0, color:'#ffb300'},
  fire:{name:'FIRE', ammo:4, dmg:9, burn:4, speed:520, turn:0, color:'#ff5a1f'},
  napalm:{name:'NAPALM', ammo:2, dmg:6, pool:7, speed:380, turn:0, color:'#b6ff00'},
  mine:{name:'MINE', ammo:3, dmg:30, speed:0, turn:0, color:'#ff2e88'},
};
const KILLS_TO_WIN=6, MATCH_TIME=300, PLAYER_LIVES=2, REPAIR_USES=2;

/* ---------- Canvas ---------- */
const cv=$('game'), ctx=cv.getContext('2d',{alpha:false});
const mm=$('minimap'), mmc=mm.getContext('2d');
let W=0,H=0,DPR=1;
function resize(){DPR=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;
  cv.width=W*DPR;cv.height=H*DPR;ctx.setTransform(DPR,0,0,DPR,0,0);}
addEventListener('resize',resize);resize();
cv.addEventListener('webglcontextlost',e=>{e.preventDefault();showErr('Graphics context lost — press ↻ to restart safely.');});
cv.addEventListener('contextlost',e=>{e.preventDefault();showErr('Graphics context lost — press ↻ to restart safely.');});

/* ---------- Audio (procedural, no assets) ---------- */
let AC=null, muted=false;
function audio(){if(!AC){try{AC=new (window.AudioContext||window.webkitAudioContext)();}catch(e){}}if(AC&&AC.state==='suspended')AC.resume();}
function beep(f,d,type='square',g=.12,slide=0){if(muted||!AC)return;try{
  const o=AC.createOscillator(),v=AC.createGain();o.type=type;o.frequency.value=f;
  if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(20,f+slide),AC.currentTime+d);
  v.gain.value=g;v.gain.exponentialRampToValueAtTime(.001,AC.currentTime+d);
  o.connect(v).connect(AC.destination);o.start();o.stop(AC.currentTime+d);}catch(e){}}
const sfx={
  mg(){beep(700+Math.random()*200,.06,'square',.05,-300);},
  boom(){beep(90,.5,'sawtooth',.22,-60);beep(45,.7,'sine',.2,-20);},
  hit(){beep(220,.12,'sawtooth',.12,-120);},
  pickup(){beep(520,.09,'square',.1);setTimeout(()=>beep(780,.1,'square',.1),70);},
  repair(){beep(440,.12,'sine',.12,220);},
  special(){beep(180,.4,'sawtooth',.16,400);},
  deny(){beep(140,.15,'square',.1);},
  win(){[523,659,784,1046].forEach((f,i)=>setTimeout(()=>beep(f,.18,'square',.12),i*120));},
  lose(){[400,300,220,150].forEach((f,i)=>setTimeout(()=>beep(f,.2,'sawtooth',.12),i*140));},
};

/* ---------- State ---------- */
const G={state:'title', sel:{veh:'chuckles',arena:'rustyard'}, time:0, matchT:MATCH_TIME,
  kills:0, deaths:0, shake:0, slowmo:0, paused:false, over:null, best:+(localStorage.getItem('rustcarnage_best')||0)||null,
  cam:{x:0,y:0}, player:null, bots:[], projs:[], parts:[], pools:[], pickups:[], repairs:[], obstacles:[], barrels:[],
  msg:0};
if(G.best) $('best').textContent = G.best+' kills — fastest win';

/* ---------- Input ---------- */
const keys={};
addEventListener('keydown',e=>{
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();
  keys[e.key.toLowerCase()]=true;audio();
  if(e.key==='p'||e.key==='P'||e.key==='Escape')togglePause();
  if(e.key==='m'||e.key==='M')toggleMute();
  if(e.key==='h'||e.key==='H')toggleHelp();
  if(e.key==='r'||e.key==='R'){if(G.state==='playing'||G.state==='over')restart();}
  if(e.key==='q'||e.key==='Q')cycleWeapon();
  if((e.key==='Enter')&&G.state==='title')toSelect();
});
addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
addEventListener('visibilitychange',()=>{if(document.hidden&&G.state==='playing'&&!G.paused)togglePause(true);});
// touch stick
const stick={active:false,id:null,dx:0,dy:0};
const stickEl=$('stick'),nub=$('nub');
function stickPos(t){const r=stickEl.getBoundingClientRect();let dx=t.clientX-(r.left+r.width/2),dy=t.clientY-(r.top+r.height/2);
  const m=Math.hypot(dx,dy)||1,max=r.width/2-10;if(m>max){dx*=max/m;dy*=max/m;}
  nub.style.transform=`translate(${dx}px,${dy}px)`;stick.dx=dx/max;stick.dy=dy/max;}
stickEl.addEventListener('touchstart',e=>{e.preventDefault();audio();const t=e.changedTouches[0];stick.active=true;stick.id=t.identifier;stickPos(t);},{passive:false});
addEventListener('touchmove',e=>{if(!stick.active)return;for(const t of e.changedTouches)if(t.identifier===stick.id)stickPos(t);},{passive:false});
addEventListener('touchend',e=>{for(const t of e.changedTouches)if(t.identifier===stick.id){stick.active=false;stick.dx=stick.dy=0;nub.style.transform='';}});
const touchHeld={mg:false,wpn:false,spc:false,turbo:false};
[['tMg','mg'],['tWpn','wpn'],['tSpc','spc'],['tTurbo','turbo']].forEach(([id,k])=>{
  const b=$(id);const on=e=>{e.preventDefault();audio();touchHeld[k]=true;};const off=e=>{e.preventDefault();touchHeld[k]=false;};
  b.addEventListener('touchstart',on,{passive:false});b.addEventListener('touchend',off);b.addEventListener('touchcancel',off);
  b.addEventListener('mousedown',on);b.addEventListener('mouseup',off);b.addEventListener('mouseleave',off);
});
if('ontouchstart'in window)$('touch').classList.remove('hidden');

/* ---------- Helpers ---------- */
function toast(t,ms=1600){const el=$('toast');el.textContent=t;el.style.opacity=1;clearTimeout(el._t);el._t=setTimeout(()=>el.style.opacity=0,ms);}
function showErr(t){const el=$('err');el.textContent=t;el.classList.remove('hidden');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.add('hidden'),6000);}
function feed(t){const k=$('killfeed');const d=document.createElement('div');d.textContent=t;k.prepend(d);while(k.children.length>5)k.lastChild.remove();}
function fmtT(s){s=Math.max(0,Math.ceil(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
const R=(a,b)=>a+Math.random()*(b-a);

/* ---------- Arena build ---------- */
function buildArena(){
  const A=ARENAS[G.sel.arena];G.obstacles=[];G.barrels=[];G.pickups=[];G.repairs=[];G.pools=[];
  const rnd=(a,b)=>a+Math.random()*(b-a);
  const addObs=(x,y,w,h,rot=0,kind='wreck')=>G.obstacles.push({x,y,w,h,rot,kind,hp:40});
  if(G.sel.arena==='rustyard'){
    // perimeter walls implicit; dense junk rows with lanes
    for(let i=0;i<26;i++){addObs(rnd(200,A.w-200),rnd(200,A.h-200),rnd(60,130),rnd(34,60),rnd(0,3),'wreck');}
    for(let i=0;i<8;i++){addObs(rnd(200,A.w-200),rnd(200,A.h-200),90,40,rnd(0,3),'container');}
    for(let i=0;i<10;i++)G.barrels.push({x:rnd(150,A.w-150),y:rnd(150,A.h-150),hp:10,r:14,boom:false});
    G.repairs.push({x:A.w*0.12,y:A.h*0.5,uses:REPAIR_USES*2,r:34},{x:A.w*0.88,y:A.h*0.5,uses:REPAIR_USES*2,r:34});
  }else{
    // open desert: center ring + scattered rocks/tires
    const cx=A.w/2,cy=A.h/2;
    for(let i=0;i<10;i++){const a=i/10*TAU;addObs(cx+Math.cos(a)*320,cy+Math.sin(a)*320,110,36,a,'rock');}
    for(let i=0;i<12;i++){addObs(rnd(200,A.w-200),rnd(200,A.h-200),rnd(40,90),rnd(30,50),rnd(0,3),Math.random()<.5?'rock':'tire');}
    for(let i=0;i<6;i++)G.barrels.push({x:rnd(200,A.w-200),y:rnd(200,A.h-200),hp:10,r:14,boom:false});
    G.repairs.push({x:cx,y:A.h*0.12,uses:REPAIR_USES*2,r:34},{x:cx,y:A.h*0.88,uses:REPAIR_USES*2,r:34});
  }
  // pickup spawners
  const spots=[];for(let i=0;i<10;i++)spots.push({x:200+ (A.w-400)* (i%5)/4, y:200+(A.h-400)*Math.floor(i/5)/1 + (i%2)*120});
  const kinds=['homing','power','fire','napalm','mine','homing','power','fire','mine','power'];
  spots.forEach((s,i)=>G.pickups.push({x:s.x+rnd(-40,40),y:s.y+rnd(-30,30),kind:kinds[i%kinds.length],taken:0,respawn:0,bob:Math.random()*TAU}));
}

/* ---------- Entities ---------- */
let eid=1;
function makeCar(isPlayer,x,y,vehKey,name){
  const V=VEHICLES[vehKey];
  return {id:eid++,isPlayer,name:name||V.name,veh:vehKey,V,x,y,a:Math.random()*TAU,vx:0,vy:0,
    hp:V.hp,maxhp:V.hp,alive:true,respawn:0,invuln:isPlayer?0:0,lives:isPlayer?PLAYER_LIVES:Infinity,
    mgHeat:0,mgCd:0,turbo:100,weapons:{homing:2,power:4,fire:0,napalm:0,mine:0},order:['homing','power','fire','napalm','mine'],
    wi:0,specialCd:0,burn:0,burnT:0,kills:0,ai:isPlayer?null:{t:0,mode:'hunt',tx:x,ty:y,fireT:R(.5,1.5),wt:R(0,2)},
    smoke:0,flash:0,hitT:0};
}
function spawnPositions(){const A=ARENAS[G.sel.arena];const cx=A.w/2,cy=A.h/2,R=Math.min(A.w,A.h)*0.36;
  return Array.from({length:6},(_,i)=>({x:cx+Math.cos(i/6*TAU)*R,y:cy+Math.sin(i/6*TAU)*R}));}
function startMatch(){
  buildArena();
  const pos=spawnPositions();
  G.player=makeCar(true,pos[0].x,pos[0].y,G.sel.veh,'YOU·'+VEHICLES[G.sel.veh].name);
  G.player.invuln=2;
  const names=['MORG','HEX','JUNKER','VEX','RUSTO'];
  const vkeys=Object.keys(VEHICLES);
  G.bots=names.map((n,i)=>{const c=makeCar(false,pos[i+1].x,pos[i+1].y,vkeys[(i+ (vkeys.indexOf(G.sel.veh)+1))%3],n);
    c.weapons={homing:2,power:3,fire:1,napalm:1,mine:1};return c;});
  G.projs=[];G.parts=[];G.kills=0;G.deaths=0;G.matchT=MATCH_TIME;G.time=0;G.shake=0;G.over=null;
  G.cam.x=G.player.x;G.cam.y=G.player.y;
  $('killfeed').innerHTML='';
}

/* ---------- Combat ---------- */
function allCars(){return [G.player,...G.bots].filter(c=>c);}
function curWeapon(c){return c.order[c.wi];}
function cycleWeapon(){if(G.state!=='playing'||G.paused)return;const c=G.player;
  for(let i=0;i<c.order.length;i++){c.wi=(c.wi+1)%c.order.length;if((c.weapons[curWeapon(c)]||0)>0||curWeapon(c)==='mg')break;}
  beep(600,.05,'square',.06);}
function fireMG(c){
  if(c.mgCd>0||c.mgHeat>=100||!c.alive)return;
  c.mgCd=.13;c.mgHeat=Math.min(100,c.mgHeat+7);
  const nx=c.x+Math.cos(c.a)*30,ny=c.y+Math.sin(c.a)*30;
  G.projs.push({x:nx,y:ny,a:c.a+(Math.random()-.5)*.07,v:620,life:.7,dmg:c.V.mgDmg,from:c,kind:'mg',trail:0});
  muzzle(nx,ny,c.a);if(c.isPlayer||nearPlayer(c,700))sfx.mg();
}
function fireWeapon(c){
  const k=curWeapon(c);if(k==='mg'){fireMG(c);return;}
  if((c.weapons[k]||0)<=0){if(c.isPlayer){sfx.deny();toast('EMPTY — Q to cycle · drive over pickups');autoCycle(c);}return;}
  const nx=c.x+Math.cos(c.a)*34,ny=c.y+Math.sin(c.a)*34;
  if(k==='mine'){G.projs.push({x:c.x-Math.cos(c.a)*30,y:c.y-Math.sin(c.a)*30,a:0,v:0,life:25,dmg:WEAPONS.mine.dmg,from:c,kind:'mine',arm:.8});}
  else if(k==='napalm'){G.projs.push({x:nx,y:ny,a:c.a,v:WEAPONS.napalm.speed,life:.9,dmg:WEAPONS.napalm.dmg,from:c,kind:'napalm'});}
  else{G.projs.push({x:nx,y:ny,a:c.a,v:WEAPONS[k].speed,life:2.2,dmg:WEAPONS[k].dmg,from:c,kind:k,burn:k==='fire'?WEAPONS.fire.burn:0});}
  c.weapons[k]--;if(c.weapons[k]<=0)autoCycle(c);
  muzzle(nx,ny,c.a);if(c.isPlayer||nearPlayer(c,700))beep(300,.15,'sawtooth',.15,200);
}
function autoCycle(c){for(let i=0;i<c.order.length;i++){if((c.weapons[c.order[i]]||0)>0){c.wi=i;return;}}}
function fireSpecial(c){
  if(c.specialCd>0||!c.alive)return;
  const s=c.V.special;
  if(s==='carnival'){c.specialCd=22;sfx.special();for(let i=0;i<10;i++)setTimeout(()=>{if(!c.alive||G.state!=='playing')return;
    const t=nearestFoe(c,900);const a=t?Math.atan2(t.y-c.y,t.x-c.x)+(Math.random()-.5)*.3:c.a+(Math.random()-.5)*.5;
    G.projs.push({x:c.x,y:c.y,a,v:460,life:2.4,dmg:12,from:c,kind:'homing',turn:5});},i*90);
    toast(c.isPlayer?'CARNIVAL! ×10 seekers':'MORG-ish cackle…');}
  else if(s==='scatter'){c.specialCd=16;sfx.special();
    for(let i=-2;i<=2;i++)G.projs.push({x:c.x,y:c.y,a:c.a+i*.18,v:600,life:.8,dmg:14,from:c,kind:'power'});
    ring(c.x,c.y,'#ffd166');}
  else if(s==='slam'){c.specialCd=14;sfx.special();
    G.shake=Math.min(14,G.shake+(c.isPlayer?8:4));
    ring(c.x,c.y,'#90ff70');
    for(const f of allCars()){if(f!==c&&f.alive&&dist2(f.x,f.y,c.x,c.y)<170*170)damage(f,26,c,'SLAM');}
    for(let i=0;i<2;i++)G.projs.push({x:c.x-Math.cos(c.a)*34,y:c.y-Math.sin(c.a)*34,a:0,v:0,life:25,dmg:30,from:c,kind:'mine',arm:.5});
  }
}
function damage(c,amt,from,how){
  if(!c.alive||c.invuln>0||G.state!=='playing')return;
  c.hp-=amt;c.flash=.15;c.hitT=.3;
  spark(c.x,c.y,'#ffd166',4);
  if(c.isPlayer){$('vignette').style.opacity=.9;setTimeout(()=>$('vignette').style.opacity=0,180);
    if(Math.random()<.4)sfx.hit();}
  if(c.hp<=0)kill(c,from,how);
}
function kill(c,from,how){
  c.alive=false;c.hp=0;c.respawn=3;explode(c.x,c.y,1.2);sfx.boom();
  G.shake=Math.min(18,G.shake+ (c.isPlayer?12:6));
  const kn=from&&from!==c?` by ${from.name}`:'';
  feed(`${c.name} wrecked${kn}${how?' · '+how:''}`);
  if(c.isPlayer){G.deaths++;c.lives--;flash('#fff');
    if(c.lives<0){gameOver(false,'HULL DEPLETED — the yard takes another driver.');}}
  else{if(from&&from.isPlayer){G.kills++;from.kills++;sfx.pickup();toast(`KILL ${G.kills}/${KILLS_TO_WIN} — ${c.name} down!`);
    if(G.kills>=KILLS_TO_WIN){gameOver(true,'CHAMPION OF THE RUST — Calypso owes you a wish.');}}}
}
function explode(x,y,s=1){
  for(let i=0;i<22*s;i++)G.parts.push({x,y,vx:(Math.random()-.5)*420*s,vy:(Math.random()-.5)*420*s,life:.5+Math.random()*.6,t:0,kind:'fire',s:2+Math.random()*5*s});
  for(let i=0;i<14*s;i++)G.parts.push({x,y,vx:(Math.random()-.5)*220*s,vy:(Math.random()-.5)*220*s,life:1+Math.random(),t:0,kind:'smoke',s:6+Math.random()*10*s});
  for(let i=0;i<10;i++)G.parts.push({x,y,vx:(Math.random()-.5)*600,vy:(Math.random()-.5)*600,life:.4,t:0,kind:'spark',s:2});
  if(!reducedMotion)G.shake=Math.min(20,G.shake+4*s);
}
function muzzle(x,y,a){G.parts.push({x,y,vx:Math.cos(a)*120,vy:Math.sin(a)*120,life:.12,t:0,kind:'muzzle',s:10,a});}
function spark(x,y,col,n){for(let i=0;i<n;i++)G.parts.push({x,y,vx:(Math.random()-.5)*300,vy:(Math.random()-.5)*300,life:.35,t:0,kind:'spark',s:2});}
function ring(x,y,col){for(let i=0;i<26;i++){const a=i/26*TAU;G.parts.push({x,y,vx:Math.cos(a)*320,vy:Math.sin(a)*320,life:.4,t:0,kind:'spark',s:3});}}
function flash(col){const f=$('flash');f.style.background=col;f.style.opacity=.5;setTimeout(()=>f.style.opacity=0,120);}
function nearPlayer(c,r){return G.player&&G.player.alive&&dist2(c.x,c.y,G.player.x,G.player.y)<r*r;}
function nearestFoe(c,r){let best=null,bd=r*r;for(const f of allCars()){if(f===c||!f.alive)continue;const d=dist2(c.x,c.y,f.x,f.y);if(d<bd){bd=d;best=f;}}return best;}

/* ---------- Update ---------- */
function collideWorld(c){
  const A=ARENAS[G.sel.arena];
  const r=22;
  if(c.x<r){c.x=r;c.vx=Math.abs(c.vx)*.4;}if(c.x>A.w-r){c.x=A.w-r;c.vx=-Math.abs(c.vx)*.4;}
  if(c.y<r){c.y=r;c.vy=Math.abs(c.vy)*.4;}if(c.y>A.h-r){c.y=A.h-r;c.vy=-Math.abs(c.vy)*.4;}
  // obstacles (circle approx)
  for(const o of G.obstacles){
    const dx=c.x-o.x,dy=c.y-o.y,rr=(Math.max(o.w,o.h)/2)*.7+r;
    const d2=dx*dx+dy*dy;
    if(d2<rr*rr&&d2>0.01){const d=Math.sqrt(d2),nx=dx/d,ny=dy/d;
      c.x=o.x+nx*rr;c.y=o.y+ny*rr;
      const dot=c.vx*nx+c.vy*ny;
      if(dot<0){c.vx-=1.6*dot*nx;c.vy-=1.6*dot*ny;
        const sp=Math.hypot(c.vx,c.vy);
        if(sp>260&&c.hitT<=0){damage(c,4,null,'RAM');c.hitT=.5;}}
    }
  }
}
function updateCar(c,dt,input){
  if(!c.alive){c.respawn-=dt;
    if(c.respawn<=0){
      if(c.isPlayer&&c.lives<0)return;
      const A=ARENAS[G.sel.arena];
      // bots always reinforce until the quota is met (short-timer in step() covers all-dead case)
      c.x=150+Math.random()*(A.w-300);c.y=150+Math.random()*(A.h-300);
      c.hp=c.maxhp;c.alive=true;c.invuln=2;c.vx=c.vy=0;c.burn=0;c.mgHeat=0;
      ring(c.x,c.y,'#7df9ff');
    }return;}
  if(c.invuln>0)c.invuln-=dt;if(c.hitT>0)c.hitT-=dt;if(c.flash>0)c.flash-=dt;
  if(c.mgCd>0)c.mgCd-=dt;if(c.specialCd>0)c.specialCd-=dt;
  c.mgHeat=Math.max(0,c.mgHeat-dt*26);
  c.turbo=Math.min(100,c.turbo+dt*14);
  if(c.burn>0){c.burn-=dt;c.burnT-=dt;if(c.burnT<=0){c.burnT=.5;damage(c,WEAPONS.fire.burn*.5,null,'BURN');spark(c.x,c.y,'#ff5a1f',2);}}
  // steering arcade: throttle forward/back + turn scaled by speed
  const th=input.th, st=input.st;
  const boosting=input.turbo&&c.turbo>1&&th>0;
  if(boosting)c.turbo-=dt*38;
  const maxSp=c.V.speed*(boosting?1.5:1);
  const curSp=Math.hypot(c.vx,c.vy);
  c.a+=st*c.V.turn*dt*(th<0?-1:1)*clamp(curSp/120,.4,1);
  const ax=Math.cos(c.a)*c.V.accel*th*(boosting?1.6:1),ay=Math.sin(c.a)*c.V.accel*th*(boosting?1.6:1);
  c.vx+=ax*dt;c.vy+=ay*dt;
  // drag + cap
  c.vx*= (1-1.4*dt);c.vy*=(1-1.4*dt);
  const sp=Math.hypot(c.vx,c.vy);if(sp>maxSp){c.vx*=maxSp/sp;c.vy*=maxSp/sp;}
  c.x+=c.vx*dt;c.y+=c.vy*dt;
  collideWorld(c);
  // ram damage
  for(const o of allCars()){if(o===c||!o.alive)continue;
    const d2=dist2(c.x,c.y,o.x,o.y);
    if(d2<40*40){const rel=Math.hypot(c.vx-o.vx,c.vy-o.vy);
      if(rel>300&&o.hitT<=0){damage(o,Math.min(18,rel*.03),c,'RAM');o.vx+=(o.x-c.x)*2;o.vy+=(o.y-c.y)*2;}
      // push apart
      const d=Math.sqrt(d2)||1,nx=(o.x-c.x)/d,ny=(o.y-c.y)/d;
      o.x+=nx*20*dt*10*.1;c.x-=nx*20*dt*10*.1;}
  }
  if(input.mg)fireMG(c);
  if(input.wpn){input.wpn=false;fireWeapon(c);}
  if(input.spc){input.spc=false;fireSpecial(c);}
  // pickups + repair
  for(const p of G.pickups){if(p.taken>0)continue;
    if(dist2(c.x,c.y,p.x,p.y)<34*34){
      p.taken=14;p.respawn=14;
      if(p.kind in c.weapons){c.weapons[p.kind]+=WEAPONS[p.kind].ammo;c.wi=c.order.indexOf(p.kind);}
      else{c.weapons[p.kind]=WEAPONS[p.kind].ammo;}
      if(c.isPlayer){sfx.pickup();toast(`${WEAPONS[p.kind].name} +${WEAPONS[p.kind].ammo}`);feed(`YOU grabbed ${WEAPONS[p.kind].name}`);}
      else if(nearPlayer(c,500))feed(`${c.name} grabbed ${WEAPONS[p.kind].name}`);
    }}
  for(const r of G.repairs){if(r.uses<=0)continue;
    if(dist2(c.x,c.y,r.x,r.y)<(r.r+20)*(r.r+20)){
      if(c.hp<c.maxhp*.999){c.hp=Math.min(c.maxhp,c.hp+55*dt);
        if(c.isPlayer&&Math.random()<.1)sfx.repair();
        if(c.hp>=c.maxhp-.5&&!r._done){r._done=true;}
      } else if(!c._repairTick||G.time-c._repairTick>2){/* full */}
      // consume a use only on leaving? consume on first touch per 8s window
      if(!r._t||G.time-r._t>8){if(c.hp<c.maxhp){r._t=G.time;r.uses--;if(c.isPlayer)toast(`REPAIRED · ${r.uses} charges left`);}}
    }}
}
function updateAI(c,dt){
  const ai=c.ai;ai.t-=dt;ai.fireT-=dt;
  if(ai.t<=0){ai.t=.4+Math.random()*.5;
    const foe=nearestFoe(c,1200);
    const lowHp=c.hp<c.maxhp*.32;
    // find repair
    let rep=null,bd=1e12;for(const r of G.repairs){if(r.uses<=0)continue;const d=dist2(c.x,c.y,r.x,r.y);if(d<bd){bd=d;rep=r;}}
    // find pickup if out of ammo
    const hasAmmo=Object.values(c.weapons).some(v=>v>0);
    let pk=null,pd=1e12;if(!hasAmmo){for(const p of G.pickups){if(p.taken>0)continue;const d=dist2(c.x,c.y,p.x,p.y);if(d<pd){pd=d;pk=p;}}}
    if(lowHp&&rep){ai.mode='repair';ai.tx=rep.x;ai.ty=rep.y;}
    else if(pk){ai.mode='pickup';ai.tx=pk.x;ai.ty=pk.y;}
    else if(foe){ai.mode=Math.random()<.3?'strafe':'hunt';ai.foe=foe;ai.tx=foe.x;ai.ty=foe.y;ai.dir=Math.random()<.5?1:-1;}
    else{ai.mode='roam';ai.tx=c.x+(Math.random()-.5)*600;ai.ty=c.y+(Math.random()-.5)*600;}
  }
  let tx=ai.tx,ty=ai.ty;
  if((ai.mode==='hunt'||ai.mode==='strafe')&&ai.foe&&ai.foe.alive){tx=ai.foe.x;ty=ai.foe.y;
    if(ai.mode==='strafe'){const a=Math.atan2(c.y-ty,c.x-tx)+Math.PI/2*ai.dir;tx=c.x+Math.cos(a)*200;ty=c.y+Math.sin(a)*200;}}
  const want=Math.atan2(ty-c.y,tx-c.x);
  const d=angDiff(c.a,want);
  const input={th:1,st:clamp(d*2,-1,1),mg:false,wpn:false,spc:false,turbo:Math.abs(d)<.3&&dist2(c.x,c.y,tx,ty)>300*300};
  // separation
  for(const o of allCars()){if(o===c||!o.alive)continue;const dd=dist2(c.x,c.y,o.x,o.y);if(dd<90*90){input.th=.6;}}
  // wall lookahead: if about to hit, turn
  const nx=c.x+Math.cos(c.a)*90,ny=c.y+Math.sin(c.a)*90;
  const A=ARENAS[G.sel.arena];
  if(nx<60||nx>A.w-60||ny<60||ny>A.h-60)input.st=1;
  // fire control
  const foe=ai.foe&&ai.foe.alive?ai.foe:nearestFoe(c,700);
  if(foe){const fa=Math.atan2(foe.y-c.y,foe.x-c.x);const off=Math.abs(angDiff(c.a,fa));
    const dd=Math.hypot(foe.x-c.x,foe.y-c.y);
    if(off<.25&&dd<620)input.mg=ai.fireT>0?false:true;
    if(off<.2&&ai.fireT<=0&&dd<560){
      const hasAmmo=Object.values(c.weapons).some(v=>v>0);
      if(hasAmmo&&Math.random()<.5){input.wpn=true;ai.fireT=1.2+Math.random()*1.6;}
      else if(Math.random()<.3){input.mg=true;}
      if(c.specialCd<=0&&dd<320&&Math.random()<.4)input.spc=true;
      if(!hasAmmo)ai.fireT=.4;
    }
    if(input.mg&&Math.random()<.02)ai.fireT=.6; // bursts
  }
  updateCar(c,dt,input);
}
function updateProjs(dt){
  const A=ARENAS[G.sel.arena];
  for(let i=G.projs.length-1;i>=0;i--){const p=G.projs[i];
    p.life-=dt;
    if(p.kind==='mine'){p.arm-=dt;
      if(p.arm<=0){p.pulse=(p.pulse||0)+dt;}
      // trigger
      let hit=null;for(const c of allCars()){if(!c.alive)continue;if(c===p.from&&p.arm>-.5)continue;
        if(dist2(c.x,c.y,p.x,p.y)<30*30){hit=c;break;}}
      if(hit){explode(p.x,p.y,.9);damage(hit,p.dmg,p.from,'MINE');G.projs.splice(i,1);continue;}
      if(p.life<=0){G.projs.splice(i,1);continue;}continue;}
    if(p.kind==='homing'&&p.turn){const t=nearestFoe(p.from,800);
      if(t){const want=Math.atan2(t.y-p.y,t.x-p.x);p.a+=clamp(angDiff(p.a,want),-p.turn*dt,p.turn*dt);}}
    p.x+=Math.cos(p.a)*p.v*dt;p.y+=Math.sin(p.a)*p.v*dt;
    if(p.x<10||p.y<10||p.x>A.w-10||p.y>A.h-10){spark(p.x,p.y,'#fff',3);G.projs.splice(i,1);continue;}
    // obstacle hit
    let blocked=false;
    for(const o of G.obstacles){if(Math.abs(p.x-o.x)<o.w/2&&Math.abs(p.y-o.y)<o.h/2){blocked=true;o.hp-=p.dmg;break;}}
    if(blocked){explode(p.x,p.y,.5);G.projs.splice(i,1);continue;}
    // car hit
    let hit=null;for(const c of allCars()){if(!c.alive||c===p.from)continue;
      if(dist2(c.x,c.y,p.x,p.y)<26*26){hit=c;break;}}
    if(hit){
      if(p.kind==='napalm'){G.pools.push({x:p.x,y:p.y,r:60,t:WEAPONS.napalm.pool,from:p.from});explode(p.x,p.y,.6);}
      else explode(p.x,p.y,.55);
      damage(hit,p.dmg,p.from,p.kind.toUpperCase());
      if(p.burn){hit.burn=3;hit.burnT=0;}
      if(p.from.isPlayer)sfx.hit();
      G.projs.splice(i,1);continue;}
    if(p.life<=0){
      if(p.kind==='napalm')G.pools.push({x:p.x,y:p.y,r:60,t:WEAPONS.napalm.pool,from:p.from});
      else spark(p.x,p.y,'#888',2);
      G.projs.splice(i,1);continue;}
  }
  // fire pools
  for(let i=G.pools.length-1;i>=0;i--){const pl=G.pools[i];pl.t-=dt;
    if(Math.random()<.4)G.parts.push({x:pl.x+(Math.random()-.5)*pl.r,y:pl.y+(Math.random()-.5)*pl.r,vx:0,vy:-40,life:.5,t:0,kind:'fire',s:4});
    for(const c of allCars()){if(!c.alive)continue;if(dist2(c.x,c.y,pl.x,pl.y)<pl.r*pl.r){c._poolT=(c._poolT||0)+dt;
      if(c._poolT>.4){c._poolT=0;damage(c,6,pl.from,'NAPALM');}}}
    if(pl.t<=0)G.pools.splice(i,1);}
  // barrels
  for(const b of G.barrels){if(b.boom)continue;
    for(const p of G.projs){if(dist2(b.x,b.y,p.x,p.y)<24*24){b.hp-=p.dmg;p.life=0;}}
    for(const c of allCars()){if(!c.alive)continue;const sp=Math.hypot(c.vx,c.vy);
      if(dist2(b.x,b.y,c.x,c.y)<30*30&&sp>320){b.hp-=20;}}
    if(b.hp<=0){b.boom=true;explode(b.x,b.y,1.4);sfx.boom();
      for(const c of allCars()){if(dist2(b.x,b.y,c.x,c.y)<130*130)damage(c,34,null,'BARREL');}}}
  // pickups respawn
  for(const p of G.pickups){p.bob+=dt*3;if(p.taken>0){p.taken-=dt;}}
  // particles
  for(let i=G.parts.length-1;i>=0;i--){const q=G.parts[i];q.t+=dt;
    if(q.t>=q.life){G.parts.splice(i,1);continue;}
    q.x+=(q.vx||0)*dt;q.y+=(q.vy||0)*dt;
    if(q.kind==='smoke'){q.vx*=(1-.5*dt);q.vy*=(1-.5*dt);}}
  if(G.parts.length>600)G.parts.splice(0,G.parts.length-600);
  if(G.projs.length>120)G.projs.splice(0,G.projs.length-120);
}

/* ---------- Render ---------- */
let ground=null,groundKey='';
function getGround(){
  const key=G.sel.arena+W+H;
  if(ground&&groundKey===key)return ground;
  ground=document.createElement('canvas');ground.width=Math.max(2,W);ground.height=Math.max(2,H);
  const g=ground.getContext('2d');
  const rust=G.sel.arena==='rustyard';
  g.fillStyle=rust?'#1a140f':'#1c150c';g.fillRect(0,0,W,H);
  // noise speckle
  for(let i=0;i<W*H/900;i++){g.fillStyle=`rgba(${140+Math.random()*60|0},${90+Math.random()*40|0},${50+Math.random()*30|0},${Math.random()*.08})`;
    g.fillRect(Math.random()*W,Math.random()*H,2,2);}
  // cracks/grid
  g.strokeStyle=rust?'rgba(0,0,0,.35)':'rgba(120,80,30,.15)';g.lineWidth=1;
  for(let x=0;x<W;x+=64){g.beginPath();g.moveTo(x,0);g.lineTo(x,H);g.stroke();}
  for(let y=0;y<H;y+=64){g.beginPath();g.moveTo(0,y);g.lineTo(W,y);g.stroke();}
  groundKey=key;return ground;
}
function drawVehicle(c, sx, sy){
  if(sx===undefined){sx=c.x-G.cam.x+W/2;sy=c.y-G.cam.y+H/2;}
  ctx.save();ctx.translate(sx,sy);ctx.rotate(c.a);
  if(c.invuln>0&&Math.floor(G.time*8)%2===0)ctx.globalAlpha=.4;
  const V=c.V;
  // shadow
  ctx.fillStyle='rgba(0,0,0,.45)';ctx.beginPath();ctx.ellipse(2,3,26,15,0,0,TAU);ctx.fill();
  // body by archetype
  if(c.veh==='chuckles'){ // boxy van
    ctx.fillStyle=V.dark;ctx.fillRect(-26,-15,52,30);
    ctx.fillStyle=V.color;ctx.fillRect(-26,-15,52,30);
    ctx.fillStyle=V.top;ctx.fillRect(-8,-13,22,26); // roof sign
    ctx.fillStyle='#e0281e';ctx.font='bold 9px Arial';ctx.fillText('ICE',-4,-4);ctx.fillText('KILL',-6,6);
    ctx.fillStyle='#222';ctx.fillRect(18,-13,6,5);ctx.fillRect(18,8,6,5); // headlights
  }else if(c.veh==='vandal'){
    ctx.fillStyle=V.dark;ctx.beginPath();ctx.moveTo(-26,-12);ctx.lineTo(-8,-15);ctx.lineTo(16,-12);ctx.lineTo(26,-6);ctx.lineTo(26,6);ctx.lineTo(16,12);ctx.lineTo(-8,15);ctx.lineTo(-26,12);ctx.closePath();ctx.fill();
    ctx.fillStyle=V.color;ctx.beginPath();ctx.moveTo(-24,-10);ctx.lineTo(-8,-13);ctx.lineTo(15,-10);ctx.lineTo(24,-5);ctx.lineTo(24,5);ctx.lineTo(15,10);ctx.lineTo(-8,13);ctx.lineTo(-24,10);ctx.closePath();ctx.fill();
    ctx.fillStyle=V.top;ctx.fillRect(-6,-7,14,14);
    ctx.fillStyle='#ffb300';ctx.fillRect(-2,-7,3,14); // stripe
  }else{ // bastion monster rig
    ctx.fillStyle='#111';ctx.beginPath();ctx.arc(-12,-14,11,0,TAU);ctx.arc(12,-14,11,0,TAU);ctx.arc(-12,14,11,0,TAU);ctx.arc(12,14,11,0,TAU);ctx.fill();
    ctx.fillStyle=V.dark;ctx.fillRect(-24,-13,48,26);
    ctx.fillStyle=V.color;ctx.fillRect(-24,-13,48,10);
    ctx.fillStyle=V.top;ctx.fillRect(-4,-9,16,18);
  }
  // wheels
  ctx.fillStyle='#0a0a0a';
  ctx.fillRect(-16,-19,10,5);ctx.fillRect(6,-19,10,5);ctx.fillRect(-16,14,10,5);ctx.fillRect(6,14,10,5);
  // MG barrel
  ctx.strokeStyle='#111';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(10,0);ctx.lineTo(30,0);ctx.stroke();
  // burn / damage smoke
  if(c.hp<c.maxhp*.4||c.burn>0){ctx.fillStyle=`rgba(255,${90+Math.random()*60|0},20,${.5+Math.random()*.4})`;
    ctx.beginPath();ctx.arc(-6+(Math.random()-.5)*8,(Math.random()-.5)*10,5+Math.random()*4,0,TAU);ctx.fill();}
  if(c.flash>0){ctx.globalAlpha=.6;ctx.fillStyle='#fff';ctx.fillRect(-26,-15,52,30);ctx.globalAlpha=1;}
  ctx.restore();
  // name + hp bar (screen space)
  const sx2=sx, sy2=sy-34;
  if(sx2>-80&&sx2<W+80&&sy2>-40&&sy2<H+40){
    ctx.fillStyle=c.isPlayer?'#46e07a':'#ff6a5e';ctx.font='bold 11px Arial';ctx.textAlign='center';
    ctx.fillText(c.isPlayer?'YOU':c.name,sx2,sy2-10);
    ctx.fillStyle='rgba(0,0,0,.6)';ctx.fillRect(sx2-22,sy2-8,44,6);
    ctx.fillStyle=c.hp/c.maxhp>.5?'#46e07a':c.hp/c.maxhp>.25?'#ffb300':'#e0281e';
    ctx.fillRect(sx2-22,sy2-8,44*clamp(c.hp/c.maxhp,0,1),6);
  }
}
function render(){
  ctx.fillStyle='#0c0a08';ctx.fillRect(0,0,W,H);
  // camera
  const p=G.player;
  if(p){G.cam.x=lerp(G.cam.x,p.x,.12);G.cam.y=lerp(G.cam.y,p.y,.12);}
  const A=ARENAS[G.sel.arena];
  G.cam.x=clamp(G.cam.x,W/2-100,A.w-W/2+100);G.cam.y=clamp(G.cam.y,H/2-100,A.h-H/2+100);
  if(A.w<W)G.cam.x=A.w/2;if(A.h<H)G.cam.y=A.h/2;
  let sx=0,sy=0;
  if(!reducedMotion&&G.shake>0){sx=(Math.random()-.5)*G.shake;sy=(Math.random()-.5)*G.shake;G.shake*=.88;if(G.shake<.3)G.shake=0;}
  ctx.save();ctx.translate(sx,sy);
  const ox=W/2-G.cam.x, oy=H/2-G.cam.y;
  // ground: parallax speck via pattern offset
  ctx.drawImage(getGround(),0,0,W,H);
  // arena floor tint rect (world)
  ctx.fillStyle=G.sel.arena==='rustyard'?'#221914':'#2a2114';
  ctx.fillRect(A.w*0+ox,0+oy,A.w,A.h);
  // tire tracks / ground detail (deterministic pseudo)
  ctx.strokeStyle='rgba(0,0,0,.25)';
  for(let i=0;i<40;i++){const x=((i*367)%A.w)+ox,y=((i*571)%A.h)+oy;
    ctx.beginPath();ctx.arc(x,y,20+(i%5)*8,0,TAU);ctx.stroke();}
  // walls
  ctx.strokeStyle='#ffb300';ctx.lineWidth=6;ctx.setLineDash([24,14]);
  ctx.strokeRect(ox,oy,A.w,A.h);ctx.setLineDash([]);
  ctx.fillStyle='rgba(255,179,0,.08)';ctx.fillRect(ox,oy,A.w,10);ctx.fillRect(ox,oy+A.h-10,A.w,10);
  // repair pads
  for(const r of G.repairs){const x=r.x+ox,y=r.y+oy;
    ctx.fillStyle=r.uses>0?'rgba(70,224,122,.18)':'rgba(120,120,120,.1)';
    ctx.beginPath();ctx.arc(x,y,r.r,0,TAU);ctx.fill();
    ctx.strokeStyle=r.uses>0?'#46e07a':'#555';ctx.lineWidth=3;ctx.stroke();
    ctx.fillStyle=r.uses>0?'#46e07a':'#888';ctx.font='bold 22px Arial';ctx.textAlign='center';ctx.fillText('+',x,y+8);
    ctx.font='bold 11px Arial';ctx.fillText(r.uses>0?r.uses+'x':'EMPTY',x,y+r.r+14);}
  // obstacles
  for(const o of G.obstacles){const x=o.x+ox,y=o.y+oy;
    ctx.save();ctx.translate(x,y);ctx.rotate(o.rot||0);
    if(o.kind==='wreck'){ctx.fillStyle='#4d443c';ctx.fillRect(-o.w/2,-o.h/2,o.w,o.h);
      ctx.fillStyle='#6e6257';ctx.fillRect(-o.w/2+4,-o.h/2+4,o.w-8,o.h-8);
      ctx.fillStyle='rgba(200,60,30,.5)';ctx.fillRect(-o.w/2+6,-4,o.w-12,8);}
    else if(o.kind==='container'){ctx.fillStyle=o.hp>0?'#7a2d1a':'#3a2018';ctx.fillRect(-o.w/2,-o.h/2,o.w,o.h);
      ctx.strokeStyle='#ffb300';ctx.lineWidth=2;ctx.strokeRect(-o.w/2,-o.h/2,o.w,o.h);}
    else if(o.kind==='rock'){ctx.fillStyle='#5c4a33';ctx.beginPath();ctx.ellipse(0,0,o.w/2,o.h/2,0,0,TAU);ctx.fill();
      ctx.fillStyle='#77644a';ctx.beginPath();ctx.ellipse(-6,-4,o.w/4,o.h/4,0,0,TAU);ctx.fill();}
    else{ctx.fillStyle='#222';ctx.beginPath();ctx.arc(0,0,o.h/2,0,TAU);ctx.fill();ctx.fillStyle='#444';ctx.beginPath();ctx.arc(0,0,o.h/4,0,TAU);ctx.fill();}
    ctx.restore();}
  // barrels
  for(const b of G.barrels){if(b.boom)continue;const x=b.x+ox,y=b.y+oy;
    ctx.fillStyle='#c22a12';ctx.beginPath();ctx.arc(x,y,b.r,0,TAU);ctx.fill();
    ctx.fillStyle='#ffb300';ctx.font='bold 12px Arial';ctx.textAlign='center';ctx.fillText('!',x,y+4);}
  // pickups
  for(const pk of G.pickups){if(pk.taken>0)continue;const x=pk.x+ox,y=pk.y+oy+Math.sin(pk.bob)*3;
    const col=WEAPONS[pk.kind].color;
    ctx.fillStyle='rgba(0,0,0,.5)';ctx.beginPath();ctx.arc(x,y+8,12,0,TAU);ctx.fill();
    ctx.fillStyle=col;ctx.save();ctx.translate(x,y);ctx.rotate(Math.PI/4);ctx.fillRect(-9,-9,18,18);ctx.restore();
    ctx.fillStyle='#000';ctx.font='bold 9px Arial';ctx.textAlign='center';
    ctx.fillText(pk.kind==='homing'?'HL':pk.kind==='power'?'PW':pk.kind==='fire'?'FR':pk.kind==='napalm'?'NP':'MN',x,y+3);
    ctx.strokeStyle=col;ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,14+Math.sin(pk.bob)*2,0,TAU);ctx.stroke();}
  // napalm pools
  for(const pl of G.pools){const x=pl.x+ox,y=pl.y+oy;
    ctx.fillStyle=`rgba(255,${100+Math.random()*80|0},0,.35)`;ctx.beginPath();ctx.arc(x,y,pl.r,0,TAU);ctx.fill();}
  // projectiles
  for(const pr of G.projs){const x=pr.x+ox,y=pr.y+oy;
    if(pr.kind==='mine'){ctx.fillStyle='#ff2e88';ctx.beginPath();ctx.arc(x,y,8+(pr.pulse?Math.sin(pr.pulse*6)*2:0),0,TAU);ctx.fill();
      ctx.fillStyle='#fff';ctx.fillRect(x-2,y-2,4,4);continue;}
    if(pr.kind==='mg'){ctx.fillStyle='#ffe9a0';ctx.fillRect(x-3,y-1,6,2);continue;}
    ctx.save();ctx.translate(x,y);ctx.rotate(pr.a);
    ctx.fillStyle=WEAPONS[pr.kind]?WEAPONS[pr.kind].color:'#fff';
    ctx.fillRect(-8,-3,16,6);ctx.fillStyle='#fff';ctx.fillRect(2,-2,5,4);ctx.restore();}
  // cars (bots then player)
  for(const c of G.bots)if(c.alive||c.respawn>0)drawWorldCar(c,ox,oy);
  if(G.player&&(G.player.alive))drawWorldCar(G.player,ox,oy);
  // particles
  for(const q of G.parts){const x=q.x+ox,y=q.y+oy;const k=1-q.t/q.life;
    if(q.kind==='fire'){ctx.fillStyle=`rgba(255,${120+Math.random()*100|0},20,${k})`;ctx.beginPath();ctx.arc(x,y,q.s*k+1,0,TAU);ctx.fill();}
    else if(q.kind==='smoke'){ctx.fillStyle=`rgba(60,55,50,${k*.6})`;ctx.beginPath();ctx.arc(x,y,q.s*(1.4-k*.4),0,TAU);ctx.fill();}
    else if(q.kind==='muzzle'){ctx.fillStyle=`rgba(255,220,120,${k})`;ctx.beginPath();ctx.arc(x,y,q.s*k,0,TAU);ctx.fill();}
    else{ctx.fillStyle=`rgba(255,230,150,${k})`;ctx.fillRect(x-1,y-1,3,3);}}
  ctx.restore();
  drawMinimap();
}
function drawWorldCar(c,ox,oy){
  // cull in world space, draw in screen space
  if(c.x+60< G.cam.x-W/2||c.x-60>G.cam.x+W/2||c.y+60<G.cam.y-H/2||c.y-60>G.cam.y+H/2)return;
  drawVehicle(c, c.x+ox, c.y+oy);
}
function drawMinimap(){
  const A=ARENAS[G.sel.arena];
  mmc.clearRect(0,0,148,148);mmc.fillStyle='rgba(0,0,0,.6)';mmc.fillRect(0,0,148,148);
  const s=Math.min(148/A.w,148/A.h),ox=(148-A.w*s)/2,oy=(148-A.h*s)/2;
  mmc.strokeStyle='#ffb300';mmc.strokeRect(ox,oy,A.w*s,A.h*s);
  for(const r of G.repairs){if(r.uses<=0)continue;mmc.fillStyle='#46e07a';mmc.fillRect(ox+r.x*s-2,oy+r.y*s-2,4,4);}
  for(const p of G.pickups){if(p.taken>0)continue;mmc.fillStyle=WEAPONS[p.kind].color;mmc.fillRect(ox+p.x*s-1.5,oy+p.y*s-1.5,3,3);}
  for(const c of G.bots){if(!c.alive)continue;mmc.fillStyle='#ff5a5a';mmc.beginPath();mmc.arc(ox+c.x*s,oy+c.y*s,3,0,TAU);mmc.fill();}
  if(G.player&&G.player.alive){mmc.fillStyle='#46e07a';mmc.beginPath();mmc.arc(ox+G.player.x*s,oy+G.player.y*s,4,0,TAU);mmc.fill();
    mmc.strokeStyle='#fff';mmc.beginPath();mmc.moveTo(ox+G.player.x*s,oy+G.player.y*s);
    mmc.lineTo(ox+(G.player.x+Math.cos(G.player.a)*120)*s,oy+(G.player.y+Math.sin(G.player.a)*120)*s);mmc.stroke();}
}

/* ---------- HUD ---------- */
function updateHUD(){
  const c=G.player;if(!c)return;
  $('hpFill').style.width=clamp(c.hp/c.maxhp*100,0,100)+'%';
  $('hpFill').style.background=c.hp/c.maxhp>.5?'linear-gradient(90deg,#2ecc71,#a9ff6a)':c.hp/c.maxhp>.25?'linear-gradient(90deg,#ffb300,#ff7a1a)':'linear-gradient(90deg,#e0281e,#ff5a5a)';
  $('lives').textContent='●'.repeat(Math.max(0,c.lives+1))+' · '+Math.max(0,c.lives)+' spare';
  $('vehicleName').textContent=c.V.name+' · '+c.V.specialName+(c.specialCd>0?` (${Math.ceil(c.specialCd)}s)`:' READY (F)');
  $('turboFill').style.width=c.turbo+'%';
  $('heatFill').style.width=c.mgHeat+'%';
  const w=curWeapon(c);
  $('weaponName').textContent=(w==='mg'?'MG':WEAPONS[w].name)+(w!=='mg'&&c.weapons[w]<=0?' — EMPTY':'');
  $('weaponAmmo').textContent=w==='mg'?'∞':'×'+(c.weapons[w]||0);
  $('objective').textContent=`KILLS ${G.kills}/${KILLS_TO_WIN}`;
  $('timer').textContent=fmtT(G.matchT);
  $('enemies').textContent=`FOES ${G.bots.filter(b=>b.alive).length} · DEATHS ${G.deaths}`;
}

/* ---------- Flow ---------- */
function show(id){['screen-title','screen-select','screen-over','screen-help','screen-pause'].forEach(s=>$(s).classList.add('hidden'));if(id)$(id).classList.remove('hidden');}
function toSelect(){G.state='select';show('screen-select');buildRoster();}
function toTitle(){G.state='title';show('screen-title');$('hud').classList.add('hidden');}
function startGame(){audio();startMatch();G.state='playing';G.paused=false;$('btnPause').textContent='⏸';show(null);$('hud').classList.remove('hidden');
  toast(`${ARENAS[G.sel.arena].name} — wreck ${KILLS_TO_WIN} foes!`);feed('Match start — good hunting.');}
function restart(){if(G.state==='title')return;startGame();}
function gameOver(win,msg){
  if(G.state==='over')return;G.state='over';G.over={win,msg};
  $('overTitle').textContent=win?'★ CHAMPION ★':'WRECKED';
  $('overTitle').style.color=win?'#46e07a':'#ff6a5e';
  const t=MATCH_TIME-G.matchT;
  $('overStats').textContent=`${msg} Kills ${G.kills}/${KILLS_TO_WIN} · Deaths ${G.deaths} · Survived ${fmtT(t)} · ${ARENAS[G.sel.arena].name} · ${G.player.V.name}`;
  show('screen-over');$('hud').classList.add('hidden');
  if(win){sfx.win();const score=Math.max(0,Math.round(G.kills*1000-t*2-G.deaths*300+G.matchT));
    if(!G.best||score>G.best){G.best=score;localStorage.setItem('rustcarnage_best',score);$('best').textContent=score+' pts — new record!';}}
  else sfx.lose();
}
function togglePause(force){
  if(G.state!=='playing')return;
  G.paused=typeof force==='boolean'?force:!G.paused;
  $('btnPause').textContent=G.paused?'▶':'⏸';
  if(G.paused){show('screen-pause');$('btnResume').focus();}
  else{show(null);}
  toast(G.paused?'PAUSED — P to resume':'ROLLING!');
}
function toggleMute(){muted=!muted;$('btnMute').textContent=muted?'🔇':'🔊';if(!muted)audio();}
let helpFrom=null, helpPaused=false;
function toggleHelp(){const h=$('screen-help').classList.contains('hidden');
  if(h){helpFrom=G.state;helpPaused=G.paused;if(G.state==='playing'&&!G.paused){G.paused=true;$('btnPause').textContent='▶';}show('screen-help');$('btnCloseHelp').focus();}
  else{if(G.state==='playing'){if(helpPaused||G.paused){show('screen-pause');}else{show(null);}}
    else{show('screen-'+(G.state==='select'?'select':G.state==='title'));}
    if(G.state==='playing'&&!G.paused&&!helpPaused){show(null);}}}
function buildRoster(){
  const r=$('roster');r.innerHTML='';
  Object.entries(VEHICLES).forEach(([k,V])=>{
    const b=document.createElement('button');b.className='pick';b.setAttribute('role','radio');
    b.setAttribute('aria-checked',G.sel.veh===k?'true':'false');
    b.setAttribute('aria-label',V.name+' '+V.desc);
    b.innerHTML=`<canvas width="150" height="54"></canvas><b>${V.name}</b><small>${V.desc}<br>HP ${V.hp} · SPD ${V.speed}</small>`;
    b.onclick=()=>{G.sel.veh=k;audio();beep(600,.06,'square',.08);buildRoster();};
    r.appendChild(b);
    const g=b.querySelector('canvas').getContext('2d');
    g.fillStyle='#0c0a08';g.fillRect(0,0,150,54);g.save();g.translate(75,27);
    g.fillStyle=V.dark;g.fillRect(-34,-13,68,26);g.fillStyle=V.color;g.fillRect(-34,-13,68,26);
    g.fillStyle=V.top;g.fillRect(-10,-9,20,18);g.fillStyle='#0a0a0a';
    g.fillRect(-24,-17,12,4);g.fillRect(12,-17,12,4);g.fillRect(-24,13,12,4);g.fillRect(12,13,12,4);g.restore();
  });
  const a=$('arenas');a.innerHTML='';
  Object.entries(ARENAS).forEach(([k,A])=>{
    const b=document.createElement('button');b.className='pick';b.setAttribute('role','radio');
    b.setAttribute('aria-checked',G.sel.arena===k?'true':'false');
    b.setAttribute('aria-label',A.name+' '+A.desc);
    b.innerHTML=`<b>${A.name}</b><small>${A.desc}<br>${A.w}×${A.h}m</small>`;
    b.onclick=()=>{G.sel.arena=k;audio();beep(600,.06,'square',.08);buildRoster();};
    a.appendChild(b);
  });
}
/* wire buttons */
$('btnStart').onclick=()=>{audio();toSelect();};
$('btnHow').onclick=()=>{audio();helpFrom='title';show('screen-help');};
$('btnFight').onclick=()=>{startGame();};
$('btnBack').onclick=()=>toTitle();
$('btnAgain').onclick=()=>restart();
$('btnMenu').onclick=()=>{toSelect();};
$('btnCloseHelp').onclick=()=>{if(G.state==='playing'){if(G.paused){show('screen-pause');$('btnResume').focus();}else show(null);}
  else if(G.state==='select')show('screen-select');else show('screen-title');};
$('btnPause').onclick=()=>{audio();togglePause();};
$('btnResume').onclick=()=>{audio();togglePause(false);};
$('btnPauseRestart').onclick=()=>{audio();restart();};
$('btnPauseHelp').onclick=()=>{audio();toggleHelp();};
$('btnMute').onclick=()=>toggleMute();
$('btnHelp').onclick=()=>toggleHelp();
$('btnReset').onclick=()=>{audio();restart();};

/* ---------- Main loop ---------- */
let last=performance.now(),acc=0;const STEP=1/60;
let mgHeld=false,wpnQueued=false,spcQueued=false;
addEventListener('mousedown',e=>{if(e.target.closest('button')||e.target.closest('.screen'))return;audio();if(e.button===0)mgHeld=true;});
addEventListener('mouseup',()=>mgHeld=false);
addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'&&G.state==='playing')mgHeld=true;
  if(e.key.toLowerCase()==='e'||e.key.toLowerCase()==='j')wpnQueued=true;
  if(e.key.toLowerCase()==='f'||e.key.toLowerCase()==='k')spcQueued=true;});
addEventListener('keyup',e=>{if(e.key===' ')mgHeld=false;});
function playerInput(){
  let th=0,st=0;
  if(keys['w']||keys['arrowup'])th+=1;if(keys['s']||keys['arrowdown'])th-=0.6;
  if(keys['a']||keys['arrowleft'])st-=1;if(keys['d']||keys['arrowright'])st+=1;
  if(stick.active){th+=-stick.dy*1.2;st+=stick.dx*1.4;th=clamp(th,-1,1);st=clamp(st,-1,1);}
  return {th:clamp(th,-1,1),st:clamp(st,-1,1),
    mg:mgHeld||keys[' ']||touchHeld.mg,
    wpn:wpnQueued||touchHeld.wpn,spc:spcQueued||touchHeld.spc,
    turbo:keys['shift']||touchHeld.turbo};
}
function frame(now){
  requestAnimationFrame(frame);
  let dt=(now-last)/1000;last=now;
  if(dt>.25)dt=.25;
  try{
    if(G.state==='playing'&&!G.paused){
      acc+=dt;let n=0;
      while(acc>=STEP&&n<4){step(STEP);acc-=STEP;n++;}
      if(n===4)acc=0;
    }
    if(G.state==='playing'||G.state==='over')render();
    else { // idle menu backdrop: slow pan over rustyard
      if(!G.player){G.sel.arena=G.sel.arena;buildArenaOnce();}
      renderMenuBG(dt);
    }
    if(G.state==='playing')updateHUD();
  }catch(err){showErr('Error: '+err.message+' — press ↻ to restart safely.');console.error(err);}
}
let menuBuilt=false;
function buildArenaOnce(){if(menuBuilt)return;menuBuilt=true;buildArena();
  G.player=makeCar(true,1100,800,'chuckles','YOU');G.bots=[];
  for(let i=0;i<5;i++)G.bots.push(makeCar(false,400+i*300,400+(i%2)*500,['vandal','bastion','chuckles'][i%3],'BOT'+i));}
function renderMenuBG(dt){
  G.time+=dt;G.cam.x=1100+Math.cos(G.time*.1)*300;G.cam.y=800+Math.sin(G.time*.13)*200;
  render();
}
function step(dt){
  G.time+=dt;G.matchT-=dt;
  if(G.matchT<=0&&G.kills<KILLS_TO_WIN){gameOver(false,'TIME — the crowd wanted more wrecks.');return;}
  const inp=playerInput();
  if(G.player)updateCar(G.player,dt,{th:inp.th,st:inp.st,mg:!!inp.mg,wpn:!!inp.wpn,spc:!!inp.spc,turbo:!!inp.turbo});
  wpnQueued=false;spcQueued=false;touchHeld.wpn=false;touchHeld.spc=false;
  for(const b of G.bots)updateAI(b,dt);
  updateProjs(dt);
  // respawn feed: keep pressure — if bots all dead and kills < quota, force respawn timers short
  if(G.bots.every(b=>!b.alive)&&G.kills<KILLS_TO_WIN){for(const b of G.bots)b.respawn=Math.min(b.respawn,.8);}
}
buildRoster();
toTitle();
// test/automation hook: ?auto=1 starts a match immediately, ?arena= / ?veh= select
try{const q=new URLSearchParams(location.search);
if(q.has('veh')&&VEHICLES[q.get('veh')])G.sel.veh=q.get('veh');
if(q.has('arena')&&ARENAS[q.get('arena')])G.sel.arena=q.get('arena');
if(q.get('auto')==='select'){toSelect();}
else if(q.has('auto')&&q.get('auto')!=='select'){startGame();if(q.get('auto')==='combat'){for(let i=0;i<240;i++)step(1/60);G.player.x=ARENAS[G.sel.arena].w/2;G.player.y=ARENAS[G.sel.arena].h/2;
  for(const b of G.bots){b.x=G.player.x+R(-260,260);b.y=G.player.y+R(-220,220);}
  explode(G.player.x+120,G.player.y-80,1.4);fireSpecial(G.player);
  for(let i=0;i<60;i++)step(1/60);}
  if(q.get('auto')==='pause'){for(let i=0;i<120;i++)step(1/60);togglePause(true);}
  if(q.get('auto')==='over'){for(let i=0;i<120;i++)step(1/60);gameOver(false,'Test defeat — the yard takes another driver.');}
  if(q.get('auto')==='win'){for(let i=0;i<120;i++)step(1/60);G.kills=KILLS_TO_WIN;gameOver(true,'Test victory — Calypso owes you a wish.');}}}catch(e){}
requestAnimationFrame(frame);
