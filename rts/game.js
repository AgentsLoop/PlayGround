/* STARFALL COMMAND — original browser RTS. Vanilla JS + Canvas. No dependencies. */
'use strict';
/* ============================== utils ============================== */
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const dist=(ax,ay,bx,by)=>Math.hypot(ax-bx,ay-by);
const $=id=>document.getElementById(id);
const fmtT=s=>{s=Math.floor(s);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');};
let __uid=1; const nid=()=>__uid++;

/* ============================== audio ============================== */
const AudioSys={ctx:null,muted:false,
  ensure(){ if(!this.ctx){ try{this.ctx=new (window.AudioContext||window.webkitAudioContext)();}catch(e){} } if(this.ctx&&this.ctx.state==='suspended')this.ctx.resume(); },
  blip(f,d,type,g){ if(this.muted||!this.ctx)return; try{
    const o=this.ctx.createOscillator(),ga=this.ctx.createGain();
    o.type=type||'square';o.frequency.value=f||440;ga.gain.value=g||0.04;
    o.connect(ga);ga.connect(this.ctx.destination);o.start();
    ga.gain.exponentialRampToValueAtTime(0.0001,this.ctx.currentTime+(d||0.08));o.stop(this.ctx.currentTime+(d||0.08));
  }catch(e){} },
  click(){this.blip(660,0.05);}, err(){this.blip(140,0.18,'sawtooth',0.06);},
  build(){this.blip(330,0.1,'triangle',0.05);}, boom(){this.blip(90,0.25,'sawtooth',0.07);},
  alert(){this.blip(880,0.12,'square',0.05); setTimeout(()=>this.blip(880,0.12,'square',0.05),160);}
};

/* ============================== config ============================== */
const TILE=32, WORLD=2048;
const UNITS={
  worker:{name:'Collector', hp:45, speed:150, sight:260, dmg:3, range:24, cd:1.0, cost:{a:50}, supply:1, build:10, icon:'⚙'},
  lancer:{name:'Lancer', hp:95, speed:165, sight:320, dmg:8, range:150, cd:0.8, cost:{a:100}, supply:1, build:18, icon:'✛'},
  bulwark:{name:'Bulwark', hp:240, speed:120, sight:300, dmg:16, range:120, cd:1.1, cost:{a:125,p:50}, supply:2, build:25, icon:'⬢'},
};
const BUILDINGS={
  hq:{name:'Command Core', hp:1600, sight:340, cost:{a:400}, supplyCap:15, build:60, r:52, icon:'⌂'},
  depot:{name:'Supply Pylon', hp:350, sight:220, cost:{a:100}, supplyCap:8, build:18, r:26, icon:'⚡'},
  gate:{name:'War Gate', hp:650, sight:260, cost:{a:150}, supplyCap:0, build:35, r:44, icon:'♜'},
  extractor:{name:'Extractor', hp:450, sight:220, cost:{a:75}, supplyCap:0, build:20, r:34, icon:'◈', onVent:true},
  turret:{name:'Sentinel Turret', hp:450, sight:420, cost:{a:150,p:50}, supplyCap:0, build:25, r:26, icon:'◎', dmg:12, range:230, cd:0.9},
};
const FACTIONS={
  vanguard:{name:'Vanguard Accord', lancerDmg:1.1, speedMul:1.0, workerCost:50, hqCost:400, color:'#3fa9ff'},
  nomad:{name:'Nomad Pact', lancerDmg:1.0, speedMul:1.08, workerCost:42, hqCost:340, color:'#3fffd2'},
};
const SCENARIOS={
  standard:{name:'Broken Alliance', workers:18, firstWave:300, waveGap:150, waveSize:7, turrets:1, aggro:1.0},
  rush:{name:'Crimson Tide', workers:14, firstWave:150, waveGap:95, waveSize:5, turrets:0, aggro:1.35},
  siege:{name:'Iron Bastion', workers:22, firstWave:420, waveGap:200, waveSize:11, turrets:3, aggro:0.9},
};
const BUILD_MENU=[
  {k:'depot', key:'B', label:'Pylon', sub:'+8 supply · 100'},
  {k:'gate', key:'G', label:'Gate', sub:'army · 150'},
  {k:'extractor', key:'E', label:'Extractor', sub:'gas · 75'},
  {k:'turret', key:'T', label:'Sentinel', sub:'defense · 150+50'},
  {k:'hq', key:'C', label:'Core', sub:'expand · 400'},
];

/* ============================== state ============================== */
const G={
  phase:'loading', paused:false, over:false, win:false,
  faction:'vanguard', scenario:'standard',
  time:0, entities:[], effects:[], pings:[],
  selected:new Set(), groups:{}, lastGroupPress:{},
  res:[{a:0,p:0,cap:0,used:0},{a:0,p:0,cap:0,used:0}],
  stats:[{minedA:0,minedP:0,kills:0,lost:0,built:0},{minedA:0,minedP:0,kills:0,lost:0,built:0}],
  incomeHist:[[],[]],
  cam:{x:WORLD/2,y:WORLD/2,z:1},
  hover:null, placeMode:null, attackMode:false, rallyMode:false,
  drag:null, dclickT:0, dclickId:null,
  lastAlert:null, ai:null, coachIdx:-1, coachDone:false,
  rocks:[], bases:[], fogT:0,
};
const FW=32, FH=32, CELL=WORLD/FW;
let visP=new Uint8Array(FW*FH), expP=new Uint8Array(FW*FH);
const cellOf=(x,y)=>clamp(Math.floor(x/CELL),0,FW-1)+clamp(Math.floor(y/CELL),0,FH-1)*FW;

/* ============================== toasts / alerts ============================== */
function toast(msg, cls){
  const box=$('toasts'); const d=document.createElement('div');
  d.className='toast'+(cls?' '+cls:''); d.textContent=msg; box.appendChild(d);
  while(box.children.length>4)box.removeChild(box.firstChild);
  setTimeout(()=>{d.style.opacity='0';d.style.transition='opacity .4s';setTimeout(()=>d.remove(),400);},2600);
}
function deny(msg){ toast(msg,'err'); AudioSys.err(); }
function ping(x,y,color){ G.pings.push({x,y,t:0,color:color||'#ff5d5d'}); }
function raiseAlert(x,y,text){
  G.lastAlert={x,y,t:G.time};
  const b=$('alert-banner'); b.textContent=text||'⚠ BASE UNDER ATTACK'; b.classList.remove('hidden');
  clearTimeout(raiseAlert._t); raiseAlert._t=setTimeout(()=>b.classList.add('hidden'),2500);
  ping(x,y); AudioSys.alert();
}

/* ============================== map & setup ============================== */
function crystalField(cx,cy,n,amt){
  for(let i=0;i<n;i++){
    const a=(i/n)*Math.PI*2, r=90+((i*37)%60);
    G.entities.push({id:nid(),owner:-1,kind:'crystal',x:clamp(cx+Math.cos(a)*r,60,WORLD-60),y:clamp(cy+Math.sin(a)*r,60,WORLD-60),r:14,hp:1,maxHp:1,amount:amt||1500});
  }
}
function gasVents(cx,cy,amt){
  G.entities.push({id:nid(),owner:-1,kind:'vent',x:cx-130,y:cy+110,r:16,hp:1,maxHp:1,amount:amt||2250});
  G.entities.push({id:nid(),owner:-1,kind:'vent',x:cx+130,y:cy+110,r:16,hp:1,maxHp:1,amount:amt||2250});
}
function addBaseSpec(cx,cy){ G.bases.push({x:cx,y:cy}); }
function genRocks(){
  G.rocks.length=0;
  const avoid=[...G.bases.map(b=>({x:b.x,y:b.y,r:330})),{x:1024,y:1024,r:260}];
  let placed=0, guard=0;
  while(placed<14&&guard++<300){
    const w=80+Math.random()*200,h=80+Math.random()*200;
    const x=100+Math.random()*(WORLD-200-w),y=100+Math.random()*(WORLD-200-h);
    const cx=x+w/2,cy=y+h/2;
    if(avoid.some(a=>dist(cx,cy,a.x,a.y)<a.r))continue;
    if(G.rocks.some(r=>cx<r.x+r.w+60&&cx+w+60>r.x&&cy<r.y+r.h+60&&cy+h+60>r.y))continue;
    G.rocks.push({x,y,w,h}); placed++;
  }
}
function mkBuilding(owner,kind,x,y,done){
  const b=BUILDINGS[kind];
  const e={id:nid(),owner,kind,x,y,r:b.r,hp:done?b.hp:Math.floor(b.hp*0.15),maxHp:b.hp,
    progress:done?1:0.05,queue:[],qT:0,rally:null,cool:0,sight:b.sight,building:true,
    state:'idle',tx:x,ty:y,targetId:null,carry:null,harvestT:0,hold:false};
  G.entities.push(e); return e;
}
function mkUnit(owner,kind,x,y){
  const u=UNITS[kind];
  const fac=owner===0?FACTIONS[G.faction]:FACTIONS.vanguard;
  const e={id:nid(),owner,kind,x:x+(Math.random()-0.5)*30,y:y+(Math.random()-0.5)*30,r:12,
    hp:u.hp,maxHp:u.hp,sight:u.sight,speed:u.speed*(owner===0?fac.speedMul:1),
    dmg:kind==='lancer'&&owner===0?Math.round(u.dmg*fac.lancerDmg):u.dmg,
    range:u.range,cd:u.cd,cool:Math.random()*0.3,
    state:'idle',tx:x,ty:y,targetId:null,carry:null,harvestT:0,hold:false,building:false,progress:1};
  G.entities.push(e); return e;
}
function newMatch(faction,scenario){
  __uid=1;
  Object.assign(G,{phase:'game',paused:false,over:false,win:false,time:0,effects:[],pings:[],
    selected:new Set(),groups:{},lastGroupPress:{},placeMode:null,attackMode:false,rallyMode:false,
    drag:null,lastAlert:null,coachIdx:localStorage.getItem('starfall-coach')?99:-1,
    coachDone:!!localStorage.getItem('starfall-coach')});
  G.faction=faction; G.scenario=scenario;
  G.entities=[]; G.rocks=[]; G.bases=[];
  visP=new Uint8Array(FW*FH); expP=new Uint8Array(FW*FH);
  G.res=[{a:400,p:100,cap:0,used:0},{a:400,p:100,cap:0,used:0}];
  G.stats=[{minedA:0,minedP:0,kills:0,lost:0,built:0},{minedA:0,minedP:0,kills:0,lost:0,built:0}];
  G.incomeHist=[[],[]];
  // base sites
  addBaseSpec(360,1688); addBaseSpec(1688,360); addBaseSpec(360,360); addBaseSpec(1688,1688); addBaseSpec(1024,1024);
  genRocks();
  // resources: main bases 8 crystals + 2 vents; side expansions 6+1 vent... ensure 2 vents via extra
  const layout=[[360,1688],[1688,360],[360,360],[1688,1688],[1024,1024]];
  layout.forEach(([x,y],i)=>{
    crystalField(x,y-140,i<2?8:6,1500);
    if(i<2){gasVents(x,y);}else{G.entities.push({id:nid(),owner:-1,kind:'vent',x:x+130,y:y+110,r:16,hp:1,maxHp:1,amount:2250});}
  });
  // HQs + starting workers
  const phq=mkBuilding(0,'hq',360,1688,true);
  const ehq=mkBuilding(1,'hq',1688,360,true);
  for(let i=0;i<6;i++){const w=mkUnit(0,'worker',360+(i-3)*36,1688+80); orderGather(w,nearestResource(w.x,w.y,'crystal',0));}
  for(let i=0;i<6;i++){const w=mkUnit(1,'worker',1688+(i-3)*36,360+80); orderGather(w,nearestResource(w.x,w.y,'crystal',1));}
  recalcSupply();
  G.cam={x:360,y:1688,z:1};
  G.ai={t:0, waveN:0, buildT:2, cheat:scenario==='rush'?1.15:1.0};
  $('end-overlay').classList.add('hidden'); $('pause-overlay').classList.add('hidden');
  showScreen('screen-game'); resizeCanvas(); refreshCmd();
  toast(SCENARIOS[scenario].name+' — destroy the Crimson Hive','warn');
  updateCoach();
}
function nearestResource(x,y,kind,owner){
  let best=null,bd=1e9;
  for(const e of G.entities){
    if(e.owner!==-1)continue;
    if(kind==='crystal'&&e.kind!=='crystal')continue;
    if(kind==='gas'&&(e.kind!=='vent'&&e.kind!=='extractor'))continue;
    if(e.amount!==undefined&&e.amount<=0)continue;
    if(e.kind==='vent'&&!extractorOn(e))continue;
    const d=dist(x,y,e.x,e.y); if(d<bd){bd=d;best=e;}
  }
  return best;
}
function extractorOn(vent){
  return G.entities.find(e=>e.building&&(e.kind==='extractor')&&e.progress>=1&&dist(e.x,e.y,vent.x,vent.y)<50);
}
function extractorFor(owner,x,y){
  let best=null,bd=1e9;
  for(const e of G.entities){ if(e.building&&e.owner===owner&&e.kind==='extractor'&&e.progress>=1){const d=dist(x,y,e.x,e.y); if(d<bd){bd=d;best=e;}}}
  return best;
}

/* ============================== supply / economy ============================== */
function recalcSupply(){
  for(let o=0;o<2;o++){
    let cap=0,used=0;
    for(const e of G.entities){
      if(e.owner!==o)continue;
      if(e.building){ if(e.progress>=1){cap+=BUILDINGS[e.kind].supplyCap||0;} }
      else { used+=UNITS[e.kind].supply||0; if(e._queueSupply)used+=0; }
    }
    // queued units reserve supply
    for(const e of G.entities){ if(e.building&&e.owner===o){ for(const q of e.queue) used+=UNITS[q.kind].supply||0; } }
    G.res[o].cap=Math.min(cap,200); G.res[o].used=used;
  }
}
function costOf(kind,isB){
  if(isB){const c=BUILDINGS[kind].cost; if(kind==='hq'&&G.faction&&arguments[2]===0){} return {...c};}
  const c={...UNITS[kind].cost};
  return c;
}
function afford(o,c){ return G.res[o].a>=(c.a||0)&&G.res[o].p>=(c.p||0); }
function pay(o,c){ G.res[o].a-=(c.a||0); G.res[o].p-=(c.p||0); }
function refund(o,c){ G.res[o].a+=(c.a||0); G.res[o].p+=(c.p||0); }

/* ============================== orders ============================== */
function ent(id){ return G.entities.find(e=>e.id===id); }
function selList(){ return [...G.selected].map(ent).filter(Boolean); }
function orderMove(u,x,y,queue){
  if(u.building)return;
  if(!queue){u.state='move';u.targetId=null;u.ventId=null;}
  u.tx=clamp(x,20,WORLD-20); u.ty=clamp(y,20,WORLD-20);
  if(u.state!=='gather-ret'||!queue)u.state='move';
  u.hold=false;
}
function orderGather(u,res){
  if(!res||u.building||u.kind!=='worker')return;
  if(res.kind==='crystal'){u.state='gather';u.targetId=res.id;u.ventId=null;}
  else{ // vent or extractor -> gas
    let vent=res.kind==='vent'?res:null, ext=res.kind==='extractor'?res:extractorOn(res);
    if(!ext&&vent)ext=extractorOn(vent);
    if(!ext){deny('Build an Extractor on the vent first');return;}
    if(ext.owner!==u.owner){deny('That Extractor is not yours');return;}
    u.state='togas';u.targetId=ext.id;u.ventId=null;
  }
  u.tx=res.x;u.ty=res.y;u.harvestT=0;u.hold=false;
}
function orderAttackMove(list,x,y){
  for(const u of list){ if(u.building||u.owner!==0)continue;
    u.state='attackmove';u.tx=clamp(x,20,WORLD-20);u.ty=clamp(y,20,WORLD-20);u.targetId=null;u.hold=false;
  }
}
function orderAttackTarget(list,target){
  for(const u of list){ if(u.building||u.owner!==0)continue;
    u.state='attack';u.targetId=target.id;u.hold=false;
  }
}
function orderStop(list){ for(const u of list){ if(u.building)continue; u.state='idle';u.targetId=null; } }
function orderHold(list){ for(const u of list){ if(u.building)continue; u.state='hold';u.targetId=null;u.hold=true; } }

/* ---- construction ---- */
function tryStartPlacement(kind){
  const ws=selList().filter(u=>!u.building&&u.owner===0&&u.kind==='worker');
  if(!ws.length){deny('Select a Collector first');return;}
  const c=buildCost(kind);
  if(!afford(0,c)){deny(`Insufficient ${G.res[0].a<(c.a||0)?'alloy':'plasma'} — need ${c.a||0}⬢ ${(c.p||0)?('+ '+c.p+'⬣'):''}`);return;}
  G.placeMode={kind,x:G.cam.x,y:G.cam.y,valid:false};
  G.attackMode=false;G.rallyMode=false;
  toast(BUILDINGS[kind].name+': click a site · right-click/Esc cancels');
}
function buildCost(kind){
  const c={...BUILDINGS[kind].cost};
  if(kind==='hq')c.a=(G.faction==='nomad'?FACTIONS.nomad.hqCost:400);
  return c;
}
function placementValid(kind,x,y){
  if(x<60||y<60||x>WORLD-60||y>WORLD-60)return false;
  const r=BUILDINGS[kind].r;
  for(const rk of G.rocks){ if(x+r>rk.x&&x-r<rk.x+rk.w&&y+r>rk.y&&y-r<rk.y+rk.h)return false; }
  if(kind==='extractor'){
    const v=G.entities.find(e=>e.owner===-1&&e.kind==='vent'&&dist(x,y,e.x,e.y)<55);
    if(!v)return false;
    if(G.entities.some(e=>e.building&&e.kind==='extractor'&&dist(e.x,e.y,v.x,v.y)<50))return false;
    for(const e of G.entities){
      if(e.building&&e.kind!=='extractor'){ if(dist(x,y,e.x,e.y)<r+(e.r||30)+8)return false; }
    }
    return true;
  }
  for(const e of G.entities){
    if(e.owner===-1&&(e.kind==='crystal'||e.kind==='vent')){
      if(e.kind==='crystal'&&e.amount<=0)continue; // depleted fields don't block
      if(dist(x,y,e.x,e.y)<r+e.r+6)return false;
    }
    if(e.building){ if(dist(x,y,e.x,e.y)<r+e.r+8)return false; }
  }
  return true;
}
function commitPlacement(x,y){
  const pm=G.placeMode; if(!pm)return;
  const kind=pm.kind, c=buildCost(kind);
  let px=x,py=y;
  if(kind==='extractor'){
    const v=G.entities.find(e=>e.owner===-1&&e.kind==='vent'&&dist(x,y,e.x,e.y)<70);
    if(!v){deny('Extractor must be placed on a green plasma vent');return;}
    if(extractorOn(v)){deny('That vent already has an Extractor');return;}
    px=v.x;py=v.y;
  }
  if(!placementValid(kind,px,py)){deny('Cannot deploy there — blocked');return;}
  if(!afford(0,c)){deny('Insufficient resources');G.placeMode=null;return;}
  pay(0,c); recalcSupply(); AudioSys.build();
  const ws=selList().filter(u=>!u.building&&u.owner===0&&u.kind==='worker');
  const w=ws.reduce((a,b)=>!a||dist(a.x,a.y,px,py)<dist(b.x,b.y,px,py)?(a||b):b,null)||ws[0];
  const b=mkBuilding(0,kind,px,py,false);
  G.stats[0].built++;
  if(w){w.state='build';w.targetId=b.id;w.tx=px;w.ty=py;}
  G.placeMode=null;
}

/* ---- production ---- */
function trainCost(kind){
  const c={...UNITS[kind].cost};
  if(kind==='worker'&&G.faction==='nomad')c.a=FACTIONS.nomad.workerCost;
  return c;
}
function tryTrain(b,kind){
  if(b.queue.length>=5){deny('Production queue is full (5)');return;}
  const c=trainCost(kind);
  if((UNITS[kind].supply||0)+G.res[b.owner].used>G.res[b.owner].cap){
    deny('SUPPLY BLOCKED — raise a Supply Pylon'); const el=$('res-supply'); el.classList.add('blocked');
    setTimeout(()=>el.classList.remove('blocked'),1500); return;
  }
  if(!afford(b.owner,c)){deny(`Insufficient ${G.res[b.owner].a<(c.a||0)?'alloy':'plasma'} for ${UNITS[kind].name}`);return;}
  pay(b.owner,c); recalcSupply();
  b.queue.push({kind,t:0,total:UNITS[kind].build*(b.owner===1?0.9:1)});
  AudioSys.click();
}

/* ============================== combat helpers ============================== */
function isCombat(e){ return !e.building||e.kind==='turret'; }
function alive(e){ return e&&e.hp>0; }
function enemiesOf(o){ return G.entities.filter(e=>e.owner>=0&&e.owner!==o&&e.hp>0&&(e.building||true)&&e.kind!=='crystal'); }
function acquire(u){
  // attack-move / idle combat acquire
  const range=u.building?BUILDINGS[u.kind].range:u.range;
  const aggro=u.state==='attackmove'?u.sight:(range+(u.state==='hold'?60:50));
  let best=null,bd=1e9;
  for(const e of G.entities){
    if(e.owner<0||e.owner===u.owner||e.hp<=0)continue;
    if(e.kind==='vent'||e.kind==='crystal')continue;
    const d=dist(u.x,u.y,e.x,e.y);
    const isB=e.building;
    const dd=d-(isB?e.r:0);
    if(dd<aggro&&d<bd){ if(fogVisible(u.owner,e.x,e.y)||u.owner===1){bd=d;best=e;} }
  }
  return best;
}
function fogVisible(owner,x,y){
  if(owner===1)return true; // AI omniscience (mild cheat, standard for simple RTS AI)
  return !!visP[cellOf(x,y)];
}
function fireAt(u,t){
  const dmg=u.building?BUILDINGS[u.kind].dmg:u.dmg;
  t.hp-=dmg;
  G.effects.push({k:'shot',x1:u.x,y1:u.y,x2:t.x,y2:t.y,t:0,color:u.owner===0?'#6fe3ff':'#ff7d7d'});
  if(t.hp<=0)killEnt(t,u.owner);
  else if(t.owner===0&&!t.building||(t.building&&t.owner===0)){
    if(Math.random()<0.25&&(!G.lastAlert||G.time-G.lastAlert.t>6))raiseAlert(t.x,t.y,t.building?'⚠ STRUCTURE UNDER ATTACK':'⚠ UNIT UNDER ATTACK');
  }
}
function killEnt(t,byOwner){
  t.hp=0;
  G.effects.push({k:'boom',x:t.x,y:t.y,t:0,color:t.owner===0?'#6fb7ff':'#ff8a5d'});
  AudioSys.boom();
  if(t.owner===0){G.stats[0].lost++;}
  if(t.owner===1){G.stats[0].kills++;G.stats[1].lost++;}
  G.selected.delete(t.id);
  if(t.building&&t.progress<1&&t.owner===0){ /* partial refund */ refund(0,{a:Math.floor((BUILDINGS[t.kind].cost.a||0)*0.5)}); }
}

/* ============================== simulation ============================== */
function nearestDropoff(o,x,y){
  let best=null,bd=1e9;
  for(const e of G.entities){ if(e.building&&e.owner===o&&e.kind==='hq'&&e.progress>=1){const d=dist(x,y,e.x,e.y); if(d<bd){bd=d;best=e;}}}
  return best;
}
function updateUnit(u,dt){
  if(u.building){ // turret combat + construction handled elsewhere
    u.cool-=dt;
    if(u.kind==='turret'&&u.progress>=1&&u.cool<=0){
      const t=u.targetId?ent(u.targetId):acquire(u);
      if(t&&alive(t)&&dist(u.x,u.y,t.x,t.y)<BUILDINGS.turret.range+t.r){fireAt(u,t);u.cool=BUILDINGS.turret.cd;u.targetId=t.id;}
      else u.targetId=null;
    }
    return;
  }
  u.cool-=dt;
  const st=u.state;
  if(st==='build'){
    const b=ent(u.targetId);
    if(!b){u.state='idle';return;}
    const d=dist(u.x,u.y,b.x,b.y);
    if(d>b.r+26){moveToward(u,b.x,b.y,dt);}
    else{
      b.progress+=dt/BUILDINGS[b.kind].build;
      if(b.progress>=1){b.progress=1;b.hp=b.maxHp;recalcSupply();toast(BUILDINGS[b.kind].name+' online');AudioSys.build();u.state='idle';u.targetId=null;
        // auto-assign gas workers? no
      }
    }
    return;
  }
  if(st==='gather'||st==='togas'||st==='harvest'||st==='gather-ret'){
    updateGather(u,dt); return;
  }
  // combat-capable movement states
  let focus=u.targetId?ent(u.targetId):null;
  if(focus&&(!alive(focus)||focus.hp<=0)){u.targetId=null;focus=null;}
  if(st==='attack'&&focus){
    const rng=u.range+(focus.building?focus.r:0);
    const d=dist(u.x,u.y,focus.x,focus.y);
    if(d<=rng){ if(u.cool<=0){fireAt(u,focus);u.cool=u.cd;} }
    else moveToward(u,focus.x,focus.y,dt);
    return;
  }
  if(st==='attackmove'||st==='move'||st==='idle'||st==='hold'){
    if(st!=='move'){
      const t=acquire(u);
      if(t){
        const rng=u.range+(t.building?t.r:0);
        const d=dist(u.x,u.y,t.x,t.y);
        if(st==='hold'&&d>rng+60){/*hold*/}
        else if(d<=rng){ if(u.cool<=0){fireAt(u,t);u.cool=u.cd;} if(st==='attackmove'&&d>rng*0.8){/*stand*/} return; }
        else if(st==='attackmove'){ moveToward(u,t.x,t.y,dt); return; }
        else if(st==='idle'&&d<=rng+30){ if(u.cool<=0){fireAt(u,t);u.cool=u.cd;} return; }
      }
    }
    if(st==='attackmove'||st==='move'){
      if(dist(u.x,u.y,u.tx,u.ty)>8)moveToward(u,u.tx,u.ty,dt);
      else if(st!=='hold')u.state=st==='attackmove'?'attackmove':'idle';
    }
    return;
  }
}
function updateGather(u,dt){
  const target=ent(u.targetId);
  const dropoff=nearestDropoff(u.owner,u.x,u.y);
  const carryAmt=u.carry?u.carry.amt:0;
  if(u.carry&&carryAmt>0){
    if(!dropoff){u.state='idle';return;}
    if(dist(u.x,u.y,dropoff.x,dropoff.y)>dropoff.r+20){moveToward(u,dropoff.x,dropoff.y,dt);u.state='gather-ret';}
    else{
      if(u.carry.type==='a'){G.res[u.owner].a+=carryAmt;G.stats[u.owner].minedA+=carryAmt;pushIncome(u.owner,'a',carryAmt);}
      else{G.res[u.owner].p+=carryAmt;G.stats[u.owner].minedP+=carryAmt;pushIncome(u.owner,'p',carryAmt);}
      u.carry=null;
      // resume
      if(u.state==='gather-ret'&&u._lastNode){const n=ent(u._lastNode); if(n&&n.amount>0){u.targetId=n.id;u.state=n.kind==='crystal'?'gather':'togas';return;}}
      const nb=nearestResource(u.x,u.y,u._lastGas?'gas':'crystal',u.owner)||nearestResource(u.x,u.y,'crystal',u.owner);
      if(nb)orderGather(u,nb); else u.state='idle';
    }
    return;
  }
  if(!target||target.amount!==undefined&&target.amount<=0){ 
    const nb=nearestResource(u.x,u.y,u.state==='togas'?'gas':'crystal',u.owner);
    if(nb){orderGather(u,nb);} else u.state='idle'; return;
  }
  if(target.kind==='crystal'){
    u._lastNode=target.id;u._lastGas=false;
    if(dist(u.x,u.y,target.x,target.y)>target.r+18){moveToward(u,target.x,target.y,dt);}
    else{u.harvestT+=dt; if(u.harvestT>=1.5){u.harvestT=0;const take=Math.min(5,target.amount);target.amount-=take;u.carry={type:'a',amt:take}; if(target.amount<=0)toast('Crystal field depleted');}}
  }else{ // extractor gas
    if(target.hp<=0||target.progress<1){u.state='idle';return;}
    u._lastNode=null;u._lastGas=true;
    const ventUnder=G.entities.find(e=>e.owner===-1&&e.kind==='vent'&&dist(e.x,e.y,target.x,target.y)<55);
    u._gasTarget=target.id;
    if(dist(u.x,u.y,target.x,target.y)>target.r+16){moveToward(u,target.x,target.y,dt);}
    else{u.harvestT+=dt; if(u.harvestT>=1.2){u.harvestT=0;const take=4;
      if(ventUnder&&ventUnder.amount>0)ventUnder.amount=Math.max(0,ventUnder.amount-take);
      u.carry={type:'p',amt:take};}}
  }
}
function pushIncome(o,t,amt){
  const h=G.incomeHist[o]; h.push({t:G.time,amt,type:t});
  while(h.length&&G.time-h[0].t>60)h.shift();
}
function incomePerMin(o,t){
  return G.incomeHist[o].filter(e=>e.type===t).reduce((s,e)=>s+e.amt,0);
}
function moveToward(u,x,y,dt){
  const d=dist(u.x,u.y,x,y); if(d<1)return;
  let vx=(x-u.x)/d,vy=(y-u.y)/d;
  // separation
  for(const o of G.entities){
    if(o===u||o.building||o.owner<0)continue;
    const dd=dist(u.x,u.y,o.x,o.y);
    if(dd>0&&dd<26){vx+=(u.x-o.x)/dd*0.7;vy+=(u.y-o.y)/dd*0.7;}
  }
  const n=Math.hypot(vx,vy)||1;
  let nx=u.x+vx/n*u.speed*dt, ny=u.y+vy/n*u.speed*dt;
  // rocks push-out
  for(const r of G.rocks){
    if(nx>r.x-10&&nx<r.x+r.w+10&&ny>r.y-10&&ny<r.y+r.h+10){
      const dl=nx-(r.x-10),dr=(r.x+r.w+10)-nx,dt2=ny-(r.y-10),db=(r.y+r.h+10)-ny;
      const m=Math.min(dl,dr,dt2,db);
      if(m===dl)nx=r.x-10;else if(m===dr)nx=r.x+r.w+10;else if(m===dt2)ny=r.y-10;else ny=r.y+r.h+10;
    }
  }
  u.x=clamp(nx,16,WORLD-16);u.y=clamp(ny,16,WORLD-16);
  u.face=Math.atan2(vy,vx);
}
function updateProduction(dt){
  for(const b of G.entities){
    if(!b.building||b.progress<1||!b.queue.length)continue;
    const q=b.queue[0];
    const need=UNITS[q.kind].supply||0;
    if(G.res[b.owner].used> G.res[b.owner].cap){ /* stalled: no progress while supply blocked */ continue; }
    q.t+=dt;
    if(q.t>=q.total){
      b.queue.shift();
      const a=spawnAngle(b);
      const u=mkUnit(b.owner,q.kind,b.x+Math.cos(a)*(b.r+26),b.y+Math.sin(a)*(b.r+26));
      recalcSupply();
      const rp=b.rally;
      if(rp){
        if(rp.gather&&u.kind==='worker'){const n=nearestResource(rp.x,rp.y,rp.gas?'gas':'crystal',b.owner); if(n)orderGather(u,n); else orderMove(u,rp.x,rp.y);}
        else if(rp.attack)orderAttackMove([u],rp.x,rp.y);
        else orderMove(u,rp.x,rp.y);
      } else if(u.kind==='worker'&&b.owner!=null){
        const n=nearestResource(u.x,u.y,'crystal',b.owner); if(n&&b.owner===1||n&&b.owner===0&&autoRallyGather(b))orderGather(u,n);
      }
      if(b.owner===0){AudioSys.blip(520,0.07,'triangle',0.04);}
    }
  }
}
function autoRallyGather(){return true;}
function spawnAngle(b){ b._sp=(b._sp||0)+1.3; return b._sp; }

/* ============================== fog ============================== */
function updateFog(){
  visP.fill(0);
  for(const e of G.entities){
    if(e.owner!==0||e.hp<=0)continue;
    const s=e.sight||200, r=Math.ceil(s/CELL);
    const cx=Math.floor(e.x/CELL),cy=Math.floor(e.y/CELL);
    for(let j=-r;j<=r;j++)for(let i=-r;i<=r;i++){
      const x=cx+i,y=cy+j;
      if(x<0||y<0||x>=FW||y>=FH)continue;
      if(i*i+j*j<=r*r){const idx=x+y*FW;visP[idx]=1;expP[idx]=1;}
    }
  }
}

/* ============================== AI ============================== */
function aiWorkers(o){ return G.entities.filter(e=>!e.building&&e.owner===o&&e.kind==='worker').length; }
function aiArmy(o){ return G.entities.filter(e=>!e.building&&e.owner===o&&e.kind!=='worker'); }
function aiIdleWorker(o){
  const ws=G.entities.filter(e=>!e.building&&e.owner===o&&e.kind==='worker'&&(e.state==='idle'));
  return ws[0]||null;
}
function aiBuildNear(o,kind,anchor){
  const w=aiIdleWorker(o)||G.entities.find(e=>!e.building&&e.owner===o&&e.kind==='worker');
  if(!w)return false;
  const c={...BUILDINGS[kind].cost};
  if(!afford(o,c))return false;
  for(let ring=0;ring<12;ring++){
    const a=ring*0.9, d=120+ring*28;
    const x=anchor.x+Math.cos(a)*d, y=anchor.y+Math.sin(a)*d;
    let px=x,py=y;
    if(kind==='extractor'){
      const v=G.entities.find(e=>e.owner===-1&&e.kind==='vent'&&!extractorOn(e)&&dist(e.x,e.y,anchor.x,anchor.y)<600);
      if(!v)return false; px=v.x;py=v.y;
    }
    if(!placementValid(kind,px,py))continue;
    pay(o,c);
    const b=mkBuilding(o,kind,px,py,false);
    w.state='build';w.targetId=b.id;w.tx=px;w.ty=py;
    recalcSupply(); return true;
  }
  return false;
}
function updateAI(dt){
  const sc=SCENARIOS[G.scenario], o=1;
  const ai=G.ai; ai.t+=dt;
  const hq=G.entities.find(e=>e.building&&e.owner===1&&e.kind==='hq'&&e.progress>=1);
  if(!hq)return;
  // economy
  if(aiWorkers(1)<sc.workers&&hq.queue.length<3&&afford(1,{a:50})){pay(1,{a:50});hq.queue.push({kind:'worker',t:0,total:UNITS.worker.build*0.9});recalcSupply();}
  if(G.res[1].cap-G.res[1].used<4&&afford(1,{a:100})){aiBuildNear(1,'depot',hq);}
  // tech
  const gates=G.entities.filter(e=>e.building&&e.owner===1&&e.kind==='gate').length;
  const exts=G.entities.filter(e=>e.building&&e.owner===1&&e.kind==='extractor').length;
  if(ai.t>20&&exts<2&&afford(1,{a:75})){aiBuildNear(1,'extractor',hq);}
  if(ai.t>40&&gates<1&&afford(1,{a:150})){aiBuildNear(1,'gate',hq);}
  if(ai.t>120&&gates<3&&afford(1,{a:150})){aiBuildNear(1,'gate',hq);}
  const turN=G.entities.filter(e=>e.building&&e.owner===1&&e.kind==='turret').length;
  if(turN<sc.turrets&&ai.t>60&&afford(1,{a:150,p:50})){aiBuildNear(1,'turret',hq);}
  // gas workers
  // army production
  const gateB=G.entities.find(e=>e.building&&e.owner===1&&e.kind==='gate'&&e.progress>=1&&e.queue.length<4);
  if(gateB&&ai.t>60){
    const want=(aiArmy(1).filter(u=>u.kind==='bulwark').length<aiArmy(1).length*0.35&&G.res[1].p>100)?'bulwark':'lancer';
    const c={...UNITS[want].cost};
    if(afford(1,c)&&G.res[1].used+(UNITS[want].supply||0)<=G.res[1].cap){pay(1,c);gateB.queue.push({kind:want,t:0,total:UNITS[want].build*0.9});recalcSupply();}
  }
  // assign idle workers to minerals
  for(const w of G.entities.filter(e=>!e.building&&e.owner===1&&e.kind==='worker'&&e.state==='idle')){
    const n=nearestResource(w.x,w.y,exts>0&&Math.random()<0.25?'gas':'crystal',1);
    if(n)orderGather(w,n);
  }
  // waves (gap-timed; oversized armies may push at most every 30s)
  const army=aiArmy(1);
  const gapOk=ai.t-ai.lastWave>sc.waveGap;
  const bigPush=army.length>=sc.waveSize*1.6&&ai.t-ai.lastWave>30;
  if(ai.t>sc.firstWave&&(gapOk||bigPush)){
    if(army.length>=sc.waveSize){
      ai.lastWave=ai.t; ai.waveN++;
      const phq=G.entities.find(e=>e.building&&e.owner===0&&e.kind==='hq');
      const tx=phq?phq.x:360,ty=phq?phq.y:1688;
      for(const u of army){u.state='attackmove';u.tx=tx+(Math.random()-0.5)*160;u.ty=ty+(Math.random()-0.5)*160;u.targetId=null;}
      if(fogVisible(0,tx,ty))raiseAlert(tx,ty,'⚠ HIVE ATTACK INBOUND');
      else {ping(tx,ty);toast('Enemy wave '+ai.waveN+' inbound — check minimap','warn');}
    } else ai.lastWave=ai.t- sc.waveGap + 20;
  }
  if(ai.lastWave===undefined)ai.lastWave=ai.t;
}

/* ============================== win/lose ============================== */
function sideAlive(o){
  // Match loop ends when all structures fall (workers without a base are spent).
  return G.entities.some(e=>e.owner===o&&e.hp>0&&e.building&&['hq','gate','turret','depot','extractor'].includes(e.kind));
}
function checkEnd(){
  if(G.over)return;
  const p=sideAlive(0), e=sideAlive(1);
  if(!e){endMatch(true);}
  else if(!p){endMatch(false);}
}
function endMatch(win){
  G.over=true;G.win=win;
  $('end-title').textContent=win?'★ VICTORY — Hive Silenced':'✖ DEFEAT — Core Lost';
  $('end-title').style.color=win?'#51ff9e':'#ff5d5d';
  const k0=G.stats[0];
  $('end-sub').textContent=win?'The Crimson Hive Core lies in ruin. The sector is yours.':'Your Command Core has fallen. The Hive consumes another world.';
  $('end-stats').innerHTML=
    `<div>Match time</div><div><b>${fmtT(G.time)}</b></div>`+
    `<div>Enemies destroyed</div><div><b>${k0.kills}</b></div>`+
    `<div>Units lost</div><div><b>${k0.lost}</b></div>`+
    `<div>Alloy mined</div><div><b>${Math.round(k0.minedA)}</b></div>`+
    `<div>Plasma mined</div><div><b>${Math.round(k0.minedP)}</b></div>`+
    `<div>Structures raised</div><div><b>${k0.built}</b></div>`;
  $('end-overlay').classList.remove('hidden');
  localStorage.removeItem('starfall-save');
  AudioSys.blip(win?880:220,0.4,win?'triangle':'sawtooth',0.06);
}

/* ============================== input: coords ============================== */
const cv=$('game-canvas'), ctx=cv.getContext('2d');
const mm=$('minimap'), mmc=mm.getContext('2d');
function resizeCanvas(){
  const r=$('stage').getBoundingClientRect();
  const dpr=Math.min(window.devicePixelRatio||1,2);
  cv.width=Math.max(300,r.width*dpr);cv.height=Math.max(200,r.height*dpr);
}
window.addEventListener('resize',resizeCanvas);
const scr2world=(sx,sy)=>{const r=cv.getBoundingClientRect();return {x:G.cam.x+((sx-r.left)-r.width/2)/G.cam.z, y:G.cam.y+((sy-r.top)-r.height/2)/G.cam.z};};
const world2scr=(x,y)=>{const r=cv.getBoundingClientRect();return {x:(x-G.cam.x)*G.cam.z+r.width/2, y:(y-G.cam.y)*G.cam.z+r.height/2};};

/* selection */
function pickAt(x,y){
  // prefer units over buildings; only visible/selectable player... allow selecting own only (+neutral? no)
  let best=null,bd=1e9;
  for(const e of G.entities){
    if(e.owner===-1||e.owner!==0||e.hp<=0)continue;
    const rr=(e.building?e.r:18);
    const d=dist(x,y,e.x,e.y)-rr;
    if(d<0&&-d<bd+rr){bd=-d;best=e;}
  }
  if(best&&!best.building)return best;
  // buildings second pass
  for(const e of G.entities){
    if(e.owner===-1||e.owner!==0||e.hp<=0||!e.building)continue;
    if(dist(x,y,e.x,e.y)<e.r+6)return e;
  }
  return best;
}
function enemyAt(x,y){
  for(const e of G.entities){
    if(e.owner!==1||e.hp<=0)continue;
    if(!fogVisible(0,e.x,e.y))continue;
    const rr=e.building?e.r:16;
    if(dist(x,y,e.x,e.y)<rr+8)return e;
  }
  return null;
}
cv.addEventListener('contextmenu',e=>e.preventDefault());
cv.addEventListener('mousedown',e=>{
  AudioSys.ensure();
  if(G.phase!=='game'||G.paused||G.over)return;
  const w=scr2world(e.clientX,e.clientY);
  if(e.button===1){G.midDrag={x:e.clientX,y:e.clientY,cx:G.cam.x,cy:G.cam.y};e.preventDefault();return;}
  if(e.button===2){ // order
    if(G.placeMode){G.placeMode=null;return;}
    if(G.attackMode){G.attackMode=false;return;}
    const list=selList().filter(u=>!u.building&&u.owner===0);
    const bsel=selList().find(b=>b.building&&b.owner===0&&b.progress>=1&&(b.kind==='hq'||b.kind==='gate'));
    // Rally only when no mobile units are selected; otherwise right-click orders the units (SC2-like).
    if(bsel&&!list.length){
      const rCr=G.entities.find(e=>e.owner===-1&&e.kind==='crystal'&&e.amount>0&&dist(w.x,w.y,e.x,e.y)<30);
      const rGas=G.entities.find(e=>((e.owner===-1&&e.kind==='vent'&&extractorOn(e))||(e.building&&e.kind==='extractor'&&e.owner===0))&&dist(w.x,w.y,e.x,e.y)<44);
      if(rCr)bsel.rally={x:rCr.x,y:rCr.y,gather:true,gas:false};
      else if(rGas)bsel.rally={x:rGas.x,y:rGas.y,gather:true,gas:true};
      else bsel.rally={x:w.x,y:w.y};
      toast(rCr?'Rally: gather alloy':rGas?'Rally: gather plasma':'Rally point set'); return;
    }
    if(!list.length)return;
    const foe=enemyAt(w.x,w.y);
    if(foe){orderAttackTarget(list,foe);AudioSys.click();return;}
    const cr=G.entities.find(e=>e.owner===-1&&e.kind==='crystal'&&e.amount>0&&dist(w.x,w.y,e.x,e.y)<26);
    const gasT=G.entities.find(e=>((e.owner===-1&&e.kind==='vent')||(e.building&&e.kind==='extractor'&&e.owner===0))&&dist(w.x,w.y,e.x,e.y)<40);
    const workers=list.filter(u=>u.kind==='worker');
    if(gasT&&workers.length&&(e.shiftKey?true:true)){ // workers to gas, others move
      for(const u of workers)orderGather(u,gasT);
      const rest=list.filter(u=>u.kind!=='worker');
      if(rest.length)for(const u of rest)orderMove(u,w.x,w.y,e.shiftKey);
    } else if(cr&&workers.length&&list.length===workers.length){
      for(const u of workers)orderGather(u,cr);
    } else for(const u of list)orderMove(u,w.x,w.y,e.shiftKey);
    ping(w.x,w.y,'#3fd2ff');
    return;
  }
  // left button
  if(G.placeMode){commitPlacement(w.x,w.y);return;}
  if(G.attackMode){
    const list=selList().filter(u=>!u.building&&u.owner===0);
    const foe=enemyAt(w.x,w.y);
    if(foe)orderAttackTarget(list,foe); else orderAttackMove(list,w.x,w.y);
    G.attackMode=false;return;
  }
  if(G.rallyMode){
    const b=selList().find(b=>b.building&&b.owner===0);
    if(b)b.rally={x:w.x,y:w.y};
    G.rallyMode=false;return;
  }
  // begin drag-select
  G.drag={x0:e.clientX,y0:e.clientY,x1:e.clientX,y1:e.clientY,moved:false};
});
cv.addEventListener('mousemove',e=>{
  if(G.midDrag){const dx=(e.clientX-G.midDrag.x)/G.cam.z,dy=(e.clientY-G.midDrag.y)/G.cam.z;
    G.cam.x=clamp(G.midDrag.cx-dx,0,WORLD);G.cam.y=clamp(G.midDrag.cy-dy,0,WORLD);return;}
  if(G.drag){G.drag.x1=e.clientX;G.drag.y1=e.clientY;
    if(Math.hypot(G.drag.x1-G.drag.x0,G.drag.y1-G.drag.y0)>6)G.drag.moved=true;}
  const w=scr2world(e.clientX,e.clientY);
  if(G.placeMode){G.placeMode.x=w.x;G.placeMode.y=w.y;G.placeMode.valid=placementValid(G.placeMode.kind,w.x,w.y);}
});
window.addEventListener('mouseup',e=>{
  G.midDrag=null;
  if(!G.drag||e.button!==0)return;
  const d=G.drag;G.drag=null;
  if(G.phase!=='game'||G.paused||G.over)return;
  const now=performance.now();
  if(!d.moved){
    const w=scr2world(e.clientX,e.clientY);
    const hit=pickAt(w.x,w.y);
    if(hit){
      // double-click: select same type on screen
      if(G.dclickId===hit.id&&now-G.dclickT<400){
        const r=cv.getBoundingClientRect();
        G.selected.clear();
        for(const u of G.entities){
          if(u.owner!==0||u.kind!==hit.kind||u.hp<=0)continue;
          const s=world2scr(u.x,u.y);
          if(s.x>0&&s.y>0&&s.x<r.width&&s.y<r.height)G.selected.add(u.id);
        }
      } else if(e.shiftKey){G.selected.has(hit.id)?G.selected.delete(hit.id):G.selected.add(hit.id);}
      else{G.selected.clear();G.selected.add(hit.id);}
      G.dclickT=now;G.dclickId=hit.id;AudioSys.click();
    } else if(!e.shiftKey){G.selected.clear();}
    refreshCmd();return;
  }
  // box select
  const a=scr2world(d.x0,d.y0),b=scr2world(d.x1,d.y1);
  const x0=Math.min(a.x,b.x),x1=Math.max(a.x,b.x),y0=Math.min(a.y,b.y),y1=Math.max(a.y,b.y);
  const inBox=G.entities.filter(u=>u.owner===0&&u.hp<=0?false:u.owner===0&&u.x>x0&&u.x<x1&&u.y>y0&&u.y<y1);
  if(!e.shiftKey)G.selected.clear();
  const units=inBox.filter(u=>!u.building);
  const pick=units.length?units:inBox;
  for(const u of pick)G.selected.add(u.id);
  refreshCmd();
});
cv.addEventListener('wheel',e=>{
  if(G.phase!=='game')return;
  e.preventDefault();
  const old=G.cam.z;
  G.cam.z=clamp(G.cam.z*(e.deltaY>0?0.9:1.1),0.45,2.2);
  const w=scr2world(e.clientX,e.clientY);
  G.cam.x=clamp(w.x-(w.x-G.cam.x)*(old/G.cam.z),0,WORLD);
  G.cam.y=clamp(w.y-(w.y-G.cam.y)*(old/G.cam.z),0,WORLD);
},{passive:false});

/* keyboard */
const keys={};
const mouseEdge={x:-1,y:-1};
window.addEventListener('mousemove',e=>{mouseEdge.x=e.clientX;mouseEdge.y=e.clientY;});
window.addEventListener('keydown',e=>{
  if(G.phase!=='game')return;
  const k=e.key;
  keys[k.toLowerCase()]=true;
  if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k.toLowerCase()))e.preventDefault();
  if(k==='Escape'){
    if(G.placeMode){G.placeMode=null;return;}
    if(!$('pause-overlay').classList.contains('hidden')){resumeGame();return;}
    if(!$('end-overlay').classList.contains('hidden'))return;
    pauseGame();return;
  }
  if(G.paused||G.over)return;
  const lk=k.toLowerCase();
  if(lk==='a'){G.attackMode=true;G.placeMode=null;toast('Attack: left-click target or ground');}
  if(lk==='s')orderStop(selList());
  if(lk==='h')orderHold(selList());
  if(lk===' '&&G.lastAlert){G.cam.x=G.lastAlert.x;G.cam.y=G.lastAlert.y;}
  if(k==='Backspace'){cycleBase();}
  if(k==='F1'){e.preventDefault();selectIdleWorker();}
  if(lk==='p'){G.paused?resumeGame():pauseGame();}
  // build / train hotkeys
  const sel=selList();
  const hasWorker=sel.some(u=>!u.building&&u.owner===0&&u.kind==='worker');
  if(hasWorker){
    if(lk==='b')tryStartPlacement('depot');
    if(lk==='g')tryStartPlacement('gate');
    if(lk==='e')tryStartPlacement('extractor');
    if(lk==='t')tryStartPlacement('turret');
    if(lk==='c')tryStartPlacement('hq');
  }
  for(const b of sel){
    if(!b.building||b.owner!==0||b.progress<1)continue;
    if(b.kind==='hq'&&lk==='w')tryTrain(b,'worker');
    if(b.kind==='gate'&&lk==='l')tryTrain(b,'lancer');
    if(b.kind==='gate'&&lk==='u')tryTrain(b,'bulwark');
  }
  // control groups
  if((e.ctrlKey||e.metaKey)&&/^[0-9]$/.test(k)){
    e.preventDefault();G.groups[k]=[...G.selected];toast('Group '+k+' assigned ('+G.groups[k].length+')');
  } else if(/^[0-9]$/.test(k)&&!e.ctrlKey&&!e.metaKey&&G.groups[k]){
    const now=performance.now();
    G.selected.clear();for(const id of G.groups[k])if(ent(id))G.selected.add(id);
    if(G.lastGroupPress[k]&&now-G.lastGroupPress[k]<450){const f=ent(G.groups[k][0]);if(f){G.cam.x=f.x;G.cam.y=f.y;}}
    G.lastGroupPress[k]=now;refreshCmd();
  }
});
window.addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false;});
function cycleBase(){
  const hs=G.entities.filter(e=>e.building&&e.owner===0&&e.kind==='hq');
  if(!hs.length)return;
  G._bi=((G._bi||0)+1)%hs.length;
  G.cam.x=hs[G._bi].x;G.cam.y=hs[G._bi].y;
  G.selected.clear();G.selected.add(hs[G._bi].id);refreshCmd();
}
function selectIdleWorker(){
  const w=G.entities.find(e=>!e.building&&e.owner===0&&e.kind==='worker'&&(e.state==='idle'));
  if(w){G.selected.clear();G.selected.add(w.id);G.cam.x=w.x;G.cam.y=w.y;refreshCmd();}
  else toast('No idle Collectors');
}

/* minimap */
function mm2world(e){const r=mm.getBoundingClientRect();
  return {x:(e.clientX-r.left)/r.width*WORLD,y:(e.clientY-r.top)/r.height*WORLD};}
let mmDown=false;
mm.addEventListener('mousedown',e=>{mmDown=true;AudioSys.ensure();mmAct(e);});
window.addEventListener('mouseup',()=>mmDown=false);
mm.addEventListener('mousemove',e=>{if(mmDown)mmAct(e);});
mm.addEventListener('contextmenu',e=>e.preventDefault());
function mmAct(e){
  const w=mm2world(e);
  if(e.button===2||e.shiftKey){
    const list=selList().filter(u=>!u.building&&u.owner===0);
    if(G.attackMode){orderAttackMove(list,w.x,w.y);G.attackMode=false;}
    else for(const u of list)orderMove(u,w.x,w.y,false);
  } else {
    if(G.attackMode){const list=selList().filter(u=>!u.building&&u.owner===0);orderAttackMove(list,w.x,w.y);G.attackMode=false;}
    else{G.cam.x=clamp(w.x,0,WORLD);G.cam.y=clamp(w.y,0,WORLD);}
  }
}

/* ============================== command card ============================== */
function refreshCmd(){
  const box=$('cmd-buttons');box.innerHTML='';
  const sel=selList();
  $('cmd-label').textContent='COMMANDS'+(G.placeMode?' — PLACING (right-click cancels)':G.attackMode?' — ATTACK (click target)':'');
  const add=(label,sub,key,fn,dis,title)=>{
    const b=document.createElement('button');b.className='cmd';
    b.innerHTML=`<span class="key">${key||''}</span><b>${label}</b><small>${sub||''}</small>`;
    if(title)b.title=title;
    if(dis)b.disabled=true; else b.onclick=()=>{AudioSys.ensure();fn();};
    box.appendChild(b);
  };
  if(!sel.length){add('No selection','drag-select army','',()=>{},true);return;}
  const b=sel.find(e=>e.building&&e.owner===0);
  const units=sel.filter(e=>!e.building&&e.owner===0);
  if(sel.length===1&&b){
    if(b.progress<1){add('Cancel','refund 50%','',()=>{refund(0,{a:Math.floor((BUILDINGS[b.kind].cost.a||0)*0.5)});b.hp=0;G.selected.delete(b.id);recalcSupply();refreshCmd();});return;}
    if(b.kind==='hq'){
      const c=trainCost('worker');
      add('Train Collector',`${c.a}⬢ · W`,'W',()=>tryTrain(b,'worker'));
      add('Rally → gather','right-click mineral','Y',()=>{G.rallyMode=true;toast('Rally: left-click map, or right-click with Core selected');});
      add('Cycle bases','⌫','',()=>cycleBase());
    } else if(b.kind==='gate'){
      add('Train Lancer','100⬢ · L','L',()=>tryTrain(b,'lancer'));
      add('Train Bulwark','125⬢ 50⬣ · U','U',()=>tryTrain(b,'bulwark'));
      add('Rally','right-click map','Y',()=>{G.rallyMode=true;});
    } else if(b.kind==='extractor'){add('Gas active','workers: right-click me','',()=>{},true);}
    else{add('No actions','—','',()=>{},true);}
    return;
  }
  if(units.length){
    const hasW=units.some(u=>u.kind==='worker');
    const hasArmy=units.some(u=>u.kind!=='worker');
    if(hasW){
      add('Build Pylon','B · 100⬢','B',()=>tryStartPlacement('depot'));
      add('Build Gate','G · 150⬢','G',()=>tryStartPlacement('gate'));
      add('Build Extractor','E · 75⬢','E',()=>tryStartPlacement('extractor'));
      add('Build Sentinel','T · 150+50','T',()=>tryStartPlacement('turret'));
      add('Build Core','C · 400⬢','C',()=>tryStartPlacement('hq'));
    }
    if(hasArmy){
      add('Attack','A + click','A',()=>{G.attackMode=true;});
      add('Stop','S','S',()=>orderStop(units.filter(u=>u.kind!=='worker')));
      add('Hold','H','H',()=>orderHold(units.filter(u=>u.kind!=='worker')));
    }
    return;
  }
  add('No actions','—','',()=>{},true);
}
function updateSelPanel(){
  const sel=selList();
  const portraits=$('sel-portraits');portraits.innerHTML='';
  if(!sel.length){$('sel-title').textContent='No selection';$('sel-stats').textContent='Drag-select units · click buildings · right-click to order.';$('queue-wrap').innerHTML='';return;}
  const U=sel.filter(e=>!e.building),B=sel.filter(e=>e.building);
  if(sel.length===1){
    const e=sel[0];
    const nm=e.building?BUILDINGS[e.kind].name:UNITS[e.kind].name;
    $('sel-title').textContent=nm+(e.owner!==0?' (enemy)':'');
    let s=`HP ${Math.ceil(e.hp)}/${e.maxHp}`;
    if(!e.building){s+=` · DMG ${e.dmg} · RNG ${e.range} · SPD ${Math.round(e.speed)}`;if(e.carry)s+=` · carrying ${e.carry.amt} ${e.carry.type==='a'?'alloy':'plasma'}`;s+=`\nstate: ${e.state}`;}
    else{s+=e.progress<1?`\nconstructing ${Math.floor(e.progress*100)}%`:`\nqueue ${e.queue.length}/5`;if(e.kind==='turret')s+=` · DMG 12 · RNG 230`;}
    $('sel-stats').textContent=s;
  } else {
    $('sel-title').textContent=sel.length+' selected';
    for(const e of sel.slice(0,24)){
      const d=document.createElement('div');d.className='portrait';
      d.textContent=e.building?BUILDINGS[e.kind].icon:UNITS[e.kind].icon;
      d.title=(e.building?BUILDINGS[e.kind].name:UNITS[e.kind].name)+' · '+Math.ceil(e.hp)+'hp';
      d.onclick=()=>{G.selected.clear();G.selected.add(e.id);refreshCmd();};
      portraits.appendChild(d);
    }
    const hp=sel.reduce((s,e)=>s+e.hp,0),mx=sel.reduce((s,e)=>s+e.maxHp,0);
    $('sel-stats').textContent=`Combined HP ${Math.ceil(hp)}/${mx} · ${U.length} units · ${B.length} structures`;
  }
  const q=$('queue-wrap');q.innerHTML='';
  for(const e of sel){
    if(!e.building||!e.queue.length)continue;
    e.queue.forEach((qi,i)=>{
      const d=document.createElement('div');d.className='qitem';
      const pct=i===0?Math.floor(qi.t/qi.total*100):0;
      d.innerHTML=`${UNITS[qi.kind].name} ${i===0?pct+'%':('#'+(i+1))}<div class="qbar"><i style="width:${pct}%"></i></div>`;
      d.title='Click to cancel';
      d.onclick=()=>{refund(e.owner,trainCost(qi.kind));e.queue.splice(i,1);recalcSupply();};
      q.appendChild(d);
    });
  }
}

/* ============================== rendering ============================== */
let grassCache=null;
function terrainColor(x,y){
  const n=Math.sin(x*0.021)*Math.cos(y*0.017)+Math.sin(x*0.008+y*0.011)*0.7;
  const base=13+n*7;
  return `rgb(${Math.floor(base+4)},${Math.floor(base+12)},${Math.floor(base+26)})`;
}
function render(){
  const r=cv.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle='#05080f';ctx.fillRect(0,0,r.width,r.height);
  const z=G.cam.z;
  const vx=G.cam.x-r.width/2/z,vy=G.cam.y-r.height/2/z;
  ctx.save();
  ctx.translate(r.width/2,r.height/2);ctx.scale(z,z);ctx.translate(-G.cam.x,-G.cam.y);
  // terrain tiles
  const t0x=Math.max(0,Math.floor(vx/TILE)*TILE),t0y=Math.max(0,Math.floor(vy/TILE)*TILE);
  const t1x=Math.min(WORLD,vx+r.width/z+TILE),t1y=Math.min(WORLD,vy+r.height/z+TILE);
  for(let y=t0y;y<t1y;y+=TILE)for(let x=t0x;x<t1x;x+=TILE){
    ctx.fillStyle=terrainColor(x,y);ctx.fillRect(x,y,TILE,TILE);
  }
  // grid
  ctx.strokeStyle='rgba(80,120,200,0.07)';ctx.lineWidth=1/z;ctx.beginPath();
  for(let y=t0y;y<t1y;y+=TILE){ctx.moveTo(t0x,y);ctx.lineTo(t1x,y);}
  for(let x=t0x;x<t1x;x+=TILE){ctx.moveTo(x,t0y);ctx.lineTo(x,t1y);}
  ctx.stroke();
  // rocks
  for(const rk of G.rocks){ctx.fillStyle='#1c2438';ctx.fillRect(rk.x,rk.y,rk.w,rk.h);
    ctx.strokeStyle='#31436e';ctx.lineWidth=2;ctx.strokeRect(rk.x,rk.y,rk.w,rk.h);}
  // resources
  for(const e of G.entities){
    if(e.owner!==-1)continue;
    if(!expP[cellOf(e.x,e.y)])continue;
    if(e.kind==='crystal'&&e.amount>0){
      ctx.fillStyle='#2b6fd6';ctx.save();ctx.translate(e.x,e.y);ctx.rotate(Math.PI/4);
      const s=10+Math.min(8,e.amount/300);ctx.fillRect(-s/2,-s/2,s,s);
      ctx.strokeStyle='#9fd4ff';ctx.lineWidth=1.5;ctx.strokeRect(-s/2,-s/2,s,s);ctx.restore();
    }else if(e.kind==='vent'){
      ctx.fillStyle='rgba(60,255,150,0.25)';ctx.beginPath();ctx.arc(e.x,e.y,20,0,7);ctx.fill();
      ctx.fillStyle='#2bd47e';ctx.beginPath();ctx.arc(e.x,e.y,9,0,7);ctx.fill();
      ctx.fillStyle='#baffd9';ctx.beginPath();ctx.arc(e.x-3,e.y-3,3,0,7);ctx.fill();
    }
  }
  const visOwn=e=>e.owner===0||fogVisible(0,e.x,e.y);
  // buildings
  for(const e of G.entities){
    if(!e.building||e.hp<=0||e.owner<0)continue;
    if(e.owner===1&&!expP[cellOf(e.x,e.y)])continue;
    if(e.owner===1&&!visOwn(e)){
      // last-known ghost for explored
      ctx.globalAlpha=0.45;
    }
    drawBuilding(e);
    ctx.globalAlpha=1;
  }
  // units
  for(const e of G.entities){
    if(e.building||e.hp<=0||e.owner<0)continue;
    if(e.owner===1&&!visOwn(e))continue;
    drawUnit(e);
  }
  // selection + hp
  for(const e of G.entities){
    if(e.hp<=0||e.owner<0)continue;
    if(e.owner===1&&!visOwn(e))continue;
    const sel=G.selected.has(e.id);
    if(sel){
      ctx.strokeStyle='#51ff9e';ctx.lineWidth=2/z+1;
      ctx.beginPath();ctx.arc(e.x,e.y,(e.building?e.r:e.r+6),0,7);ctx.stroke();
    }
    if(sel||e.hp<e.maxHp||keys['alt']){
      const w=e.building?e.r*1.6:30;
      ctx.fillStyle='#000a';ctx.fillRect(e.x-w/2,e.y-(e.building?e.r+16:e.r+14),w,5);
      const f=clamp(e.hp/e.maxHp,0,1);
      ctx.fillStyle=f>0.6?'#51ff9e':f>0.3?'#ffcf4d':'#ff5d5d';
      ctx.fillRect(e.x-w/2,e.y-(e.building?e.r+16:e.r+14),w*f,5);
    }
    if(e.building&&e.progress<1){
      ctx.fillStyle='#3fd2ff';ctx.fillRect(e.x-e.r,e.y+e.r+6,e.r*2*e.progress,4);
    }
  }
  // rally lines
  for(const e of G.entities){
    if(e.building&&e.rally&&G.selected.has(e.id)){
      ctx.strokeStyle='#3fd2ff88';ctx.setLineDash([6,4]);ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(e.rally.x,e.rally.y);ctx.stroke();ctx.setLineDash([]);
    }
  }
  // placement ghost
  if(G.placeMode){
    const {kind,x,y,valid}=G.placeMode;
    ctx.globalAlpha=0.6;ctx.fillStyle=valid?'#51ff9e':'#ff5d5d';
    ctx.beginPath();ctx.arc(x,y,BUILDINGS[kind].r,0,7);ctx.fill();ctx.globalAlpha=1;
    ctx.strokeStyle=valid?'#51ff9e':'#ff5d5d';ctx.stroke();
  }
  // effects
  G.effects=G.effects.filter(fx=>fx.t<0.4);
  for(const fx of G.effects){
    if(fx.k==='shot'){
      ctx.strokeStyle=fx.color;ctx.globalAlpha=1-fx.t*2.2;ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(fx.x1,fx.y1);ctx.lineTo(fx.x2,fx.y2);ctx.stroke();ctx.globalAlpha=1;
    }else{
      ctx.globalAlpha=1-fx.t*2.2;ctx.fillStyle=fx.color;
      ctx.beginPath();ctx.arc(fx.x,fx.y,6+fx.t*60,0,7);ctx.fill();ctx.globalAlpha=1;
    }
  }
  // fog
  for(let cy=0;cy<FH;cy++)for(let cx=0;cx<FW;cx++){
    const i=cx+cy*FW;
    if(visP[i])continue;
    ctx.fillStyle=expP[i]?'rgba(3,6,14,0.62)':'rgba(0,0,0,0.94)';
    ctx.fillRect(cx*CELL,cy*CELL,CELL+1,CELL+1);
  }
  ctx.restore();
  // drag box
  if(G.drag&&G.drag.moved){
    ctx.strokeStyle='#51ff9e';ctx.fillStyle='rgba(81,255,158,0.12)';ctx.lineWidth=1;
    const x=Math.min(G.drag.x0,G.drag.x1)-r.left,y=Math.min(G.drag.y0,G.drag.y1)-r.top;
    ctx.strokeRect(x,y,Math.abs(G.drag.x1-G.drag.x0),Math.abs(G.drag.y1-G.drag.y0));
    ctx.fillRect(x,y,Math.abs(G.drag.x1-G.drag.x0),Math.abs(G.drag.y1-G.drag.y0));
  }
  // attack cursor hint
  if(G.attackMode){ctx.fillStyle='#ff5d5d';ctx.font='12px sans-serif';ctx.fillText('ATTACK — click target',12,20);}
  if(G.placeMode){ctx.fillStyle='#51ff9e';ctx.font='12px sans-serif';ctx.fillText('PLACING '+BUILDINGS[G.placeMode.kind].name+' — '+(G.placeMode.valid?'click to deploy':'blocked here'),12,20);}
}
function drawBuilding(e){
  const col=e.owner===0?FACTIONS[G.faction].color:'#ff5d5d';
  ctx.fillStyle=e.progress<1?'#2a3350':'#141d33';
  ctx.beginPath();ctx.arc(e.x,e.y,e.r,0,7);ctx.fill();
  ctx.strokeStyle=col;ctx.lineWidth=2.5;ctx.stroke();
  ctx.fillStyle=col;ctx.font=`${Math.floor(e.r*0.9)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(BUILDINGS[e.kind].icon,e.x,e.y+1);
  if(e.kind==='hq'){ctx.fillStyle='#fff';ctx.font='10px sans-serif';ctx.fillText('CORE',e.x,e.y+e.r-8);}
}
function drawUnit(e){
  const col=e.owner===0?(e.kind==='worker'?'#ffd27d':FACTIONS[G.faction].color):(e.kind==='worker'?'#ff9d7d':'#ff5d5d');
  ctx.fillStyle=e.owner===0?'#0e1a33':'#33101a';
  ctx.beginPath();ctx.arc(e.x,e.y,e.r,0,7);ctx.fill();
  ctx.strokeStyle=col;ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle=col;ctx.font='11px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(UNITS[e.kind].icon,e.x,e.y+0.5);
  if(e.face!==undefined){ctx.strokeStyle=col;ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(e.x+Math.cos(e.face)*e.r,e.y+Math.sin(e.face)*e.r);ctx.stroke();}
  if(e.carry){ctx.fillStyle=e.carry.type==='a'?'#4db2ff':'#51ff9e';ctx.fillRect(e.x-6,e.y+e.r-2,12,3);}
}
function renderMinimap(){
  const S=mm.width,W=WORLD;
  mmc.fillStyle='#060a14';mmc.fillRect(0,0,S,S);
  const px=x=>x/W*S;
  for(const e of G.entities){
    if(e.owner===-1){
      if(!expP[cellOf(e.x,e.y)])continue;
      mmc.fillStyle=e.kind==='crystal'?'#2b6fd6':'#2bd47e';
      mmc.fillRect(px(e.x)-1,px(e.y)-1,2,2);
    }
  }
  for(const e of G.entities){
    if(e.owner<0||e.hp<=0)continue;
    if(e.owner===1&&!visP[cellOf(e.x,e.y)]&&!expP[cellOf(e.x,e.y)])continue;
    if(e.owner===1&&!visP[cellOf(e.x,e.y)])continue;
    mmc.fillStyle=e.owner===0?(e.building?'#3fa9ff':'#7cd4ff'):(e.building?'#ff5d5d':'#ff9d5d');
    const s=e.building?3:2;
    mmc.fillRect(px(e.x)-s/2,px(e.y)-s/2,s,s);
  }
  // camera rect
  const r=cv.getBoundingClientRect();
  const vw=r.width/G.cam.z/W*S,vh=r.height/G.cam.z/W*S;
  mmc.strokeStyle='#fff';mmc.lineWidth=1;
  mmc.strokeRect(px(G.cam.x)-vw/2,px(G.cam.y)-vh/2,vw,vh);
  // pings
  G.pings=G.pings.filter(p=>p.t<3);
  for(const p of G.pings){
    mmc.strokeStyle=p.color;mmc.lineWidth=2;
    const rr=4+p.t*8;mmc.globalAlpha=1-p.t/3;
    mmc.beginPath();mmc.arc(px(p.x),px(p.y),rr,0,7);mmc.stroke();mmc.globalAlpha=1;
  }
}

/* ============================== HUD ============================== */
let hudT=0;
function updateHUD(){
  $('res-alloy').textContent=Math.floor(G.res[0].a);
  $('res-plasma').textContent=Math.floor(G.res[0].p);
  $('res-supply').textContent=G.res[0].used+'/'+G.res[0].cap;
  $('res-supply').classList.toggle('blocked',G.res[0].used>=G.res[0].cap);
  const w=G.entities.filter(e=>!e.building&&e.owner===0&&e.kind==='worker').length;
  $('res-workers').textContent=w;
  $('match-timer').textContent=fmtT(G.time);
  $('inc-alloy').textContent='+'+incomePerMin(0,'a')+'/m';
  $('inc-plasma').textContent='+'+incomePerMin(0,'p')+'/m';
}

/* ============================== tutorial coach ============================== */
const COACH=[
  {t:'Welcome, Commander. Drag-select your Collectors, right-click a blue crystal to mine.',done:()=>G.stats[0].minedA>25},
  {t:'Good. Select the Command Core, press W to train more Collectors. Keep them coming.',done:()=>aiWorkers(0)>=8},
  {t:'Select a Collector, press B and place a Supply Pylon before you cap out.',done:()=>G.entities.some(e=>e.owner===0&&e.kind==='depot')},
  {t:'Now press G with a Collector to raise a War Gate — your army lifeline.',done:()=>G.entities.some(e=>e.owner===0&&e.kind==='gate')},
  {t:'Train Lancers (L) from the Gate. Select them, press A, click toward the enemy to attack-move.',done:()=>G.entities.some(e=>e.owner===0&&!e.building&&e.kind!=='worker')},
  {t:'Scout the red Hive, expand to side fields, and destroy the enemy Core. Good hunting!',done:()=>false},
];
function updateCoach(){
  if(G.coachIdx>=99||G.coachDone)return;
  if(G.coachIdx<0)G.coachIdx=0;
  const box=$('coach');
  if(G.coachIdx>=COACH.length){box.classList.add('hidden');return;}
  const step=COACH[G.coachIdx];
  if(step.done&&step.done()){
    G.coachIdx++;
    if(G.coachIdx>=COACH.length-0){/* keep last visible briefly */}
    AudioSys.blip(740,0.1,'triangle',0.05);
  }
  const cur=COACH[Math.min(G.coachIdx,COACH.length-1)];
  $('coach-text').innerHTML=`<b>◈ Tutorial ${Math.min(G.coachIdx+1,COACH.length)}/${COACH.length}:</b> ${cur.t}`;
  box.classList.remove('hidden');
}
$('coach-skip').onclick=()=>{G.coachDone=true;G.coachIdx=99;$('coach').classList.add('hidden');localStorage.setItem('starfall-coach','1');};

/* ============================== pause / screens ============================== */
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  $(id).classList.add('active');
  G.phase=id==='screen-game'?'game':(id==='screen-menu'?'menu':'loading');
  if(id==='screen-game')resizeCanvas();
}
function pauseGame(){
  if(G.over)return;G.paused=true;
  const k=G.stats[0];
  $('pause-stats').textContent=`${fmtT(G.time)} · alloy ${Math.floor(G.res[0].a)} · army ${G.entities.filter(e=>!e.building&&e.owner===0&&e.kind!=='worker').length} · kills ${k.kills}`;
  $('pause-overlay').classList.remove('hidden');
}
function resumeGame(){G.paused=false;$('pause-overlay').classList.add('hidden');}
$('btn-pause').onclick=()=>pauseGame();
$('btn-resume').onclick=()=>resumeGame();
$('btn-restart').onclick=()=>{newMatch(G.faction,G.scenario);};
$('btn-quit').onclick=()=>{saveGame();showScreen('screen-menu');refreshRecover();};
$('btn-again').onclick=()=>{newMatch(G.faction,G.scenario);};
$('btn-tomenu').onclick=()=>{showScreen('screen-menu');refreshRecover();};
$('btn-mute').onclick=e=>{AudioSys.muted=!AudioSys.muted;e.target.textContent=AudioSys.muted?'🔇':'🔊';};

/* menu */
document.querySelectorAll('[data-faction]').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('[data-faction]').forEach(x=>x.classList.remove('selected'));
  b.classList.add('selected');G.faction=b.dataset.faction;AudioSys.ensure();AudioSys.click();
});
document.querySelectorAll('[data-scenario]').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('[data-scenario]').forEach(x=>x.classList.remove('selected'));
  b.classList.add('selected');G.scenario=b.dataset.scenario;AudioSys.ensure();AudioSys.click();
});
$('btn-start').onclick=()=>{AudioSys.ensure();localStorage.removeItem('starfall-save');newMatch(G.faction,G.scenario);};
$('btn-manual').onclick=()=>$('manual').classList.remove('hidden');
$('btn-manual-close').onclick=()=>$('manual').classList.add('hidden');
$('btn-recover').onclick=()=>{if(!loadGame())toast('No valid autosave found','err');};

/* ============================== persistence ============================== */
function saveGame(){
  try{
    if(G.phase!=='game'||G.over)return;
    const data={faction:G.faction,scenario:G.scenario,time:G.time,res:G.res,stats:G.stats,
      entities:G.entities.map(e=>({...e,queue:e.queue||[]})),exp:Array.from(expP),coach:G.coachIdx};
    localStorage.setItem('starfall-save',JSON.stringify(data));
  }catch(e){}
}
function loadGame(){
  try{
    const raw=localStorage.getItem('starfall-save');if(!raw)return false;
    const d=JSON.parse(raw);if(!d.entities||!d.entities.length)return false;
    newMatch(d.faction||'vanguard',d.scenario||'standard');
    G.time=d.time||0;G.res=d.res;G.stats=d.stats;G.entities=d.entities;
    __uid=Math.max(...G.entities.map(e=>e.id))+1;
    expP=Uint8Array.from(d.exp);G.coachIdx=d.coach||99;
    recalcSupply();toast('Autosave recovered');return true;
  }catch(e){toast('Save corrupted — starting fresh','err');return false;}
}
function refreshRecover(){
  const has=!!localStorage.getItem('starfall-save');
  $('btn-recover').classList.toggle('hidden',!has);
  $('menu-hint').textContent=has?'Autosave found — resume or deploy fresh.':'';
}
setInterval(()=>{if(G.phase==='game'&&!G.over)saveGame();},15000);

/* ============================== main loop ============================== */
let lastT=performance.now(), aiAcc=0, fogAcc=0, endAcc=0, coachAcc=0;
function loop(now){
  requestAnimationFrame(loop);
  let dt=(now-lastT)/1000;lastT=now;
  dt=Math.min(dt,0.1);
  if(G.phase!=='game'||G.paused||G.over){ if(G.phase==='game'){render();renderMinimap();} return; }
  try{
    G.time+=dt;
    // camera: arrows + edge pan (WASD reserved for commands)
    const sp=520/G.cam.z*dt;
    if(keys['arrowup'])G.cam.y-=sp;
    if(keys['arrowdown'])G.cam.y+=sp;
    if(keys['arrowleft'])G.cam.x-=sp;
    if(keys['arrowright'])G.cam.x+=sp;
    if(mouseEdge.x>=0){
      const r=cv.getBoundingClientRect(),m=26,sp2=620/G.cam.z*dt;
      if(mouseEdge.x<r.left+m)G.cam.x-=sp2;
      if(mouseEdge.x>r.right-m)G.cam.x+=sp2;
      if(mouseEdge.y<r.top+m)G.cam.y-=sp2;
      if(mouseEdge.y>r.bottom-m)G.cam.y+=sp2;
    }
    G.cam.x=clamp(G.cam.x,0,WORLD);G.cam.y=clamp(G.cam.y,0,WORLD);
    for(const e of G.entities){if(e.hp>0)updateUnit(e,dt);}
    G.entities=G.entities.filter(e=>e.hp>0||e.owner===-1);
    updateProduction(dt);
    // deplete check for crystals visuals only
    aiAcc+=dt; if(aiAcc>0.5){aiAcc=0;updateAI(0.5);recalcSupply();}
    fogAcc+=dt; if(fogAcc>0.15){fogAcc=0;updateFog();}
    for(const fx of G.effects)fx.t+=dt;
    for(const p of G.pings)p.t+=dt;
    endAcc+=dt; if(endAcc>0.5){endAcc=0;checkEnd();}
    coachAcc+=dt; if(coachAcc>0.5){coachAcc=0;updateCoach();}
    hudT+=dt; if(hudT>0.25){hudT=0;updateHUD();updateSelPanel();refreshCmdSoft();}
    render();renderMinimap();
  }catch(err){
    console.error(err);
    G.paused=true;
    toast('Engine hiccup contained — game paused. Press Resume. ('+String(err.message||err).slice(0,80)+')','err');
    $('pause-overlay').classList.remove('hidden');
  }
}
let cmdSoftT=0, cmdSig='';
function refreshCmdSoft(){
  // Rebuild the command card only when the selection/mode/queue signature changes.
  const sel=selList();
  const sig=[...G.selected].sort().join(',')+'|'+(G.placeMode?G.placeMode.kind:'')+'|'+(G.attackMode?'A':'')+'|'+
    sel.map(e=>e.building?e.queue.length+':'+(e.queue[0]?Math.floor(e.queue[0].t/e.queue[0].total*10):'')+':'+e.progress:'').join(';');
  if(sig!==cmdSig){cmdSig=sig;refreshCmd();}
}

/* ============================== boot ============================== */
function boot(){
  const steps=['Booting theater AI…','Forging alloy fields…','Waking the Hive…','Calibrating optics…','Ready'];
  let i=0;
  showScreen('screen-loading');
  const iv=setInterval(()=>{
    $('load-fill').style.width=((i+1)/steps.length*100)+'%';
    $('load-text').textContent=steps[i];
    if(++i>=steps.length){
      clearInterval(iv);
      showScreen('screen-menu');refreshRecover();
    }
  },180);
  resizeCanvas();
  requestAnimationFrame(loop);
}
window.addEventListener('error',e=>{ try{toast('Recovered from error: '+String(e.message).slice(0,90),'err');}catch(_){} });

/* debug hooks for automated verification */
window.__rts={G,UNITS,BUILDINGS,
  start:(f,s)=>newMatch(f||'vanguard',s||'standard'),
  snapshot:()=>({phase:G.phase,time:Math.round(G.time),alloy:Math.round(G.res[0].a),plasma:Math.round(G.res[0].p),
    supply:G.res[0].used+'/'+G.res[0].cap,units:G.entities.filter(e=>e.owner===0&&!e.building).length,
    buildings:G.entities.filter(e=>e.owner===0&&e.building).length,
    enemy:G.entities.filter(e=>e.owner===1).length,selected:[...G.selected],over:G.over,win:G.win}),
  give:(a,p)=>{G.res[0].a+=a||0;G.res[0].p+=p||0;},
  select:(kind)=>{G.selected.clear();for(const e of G.entities)if(e.owner===0&&(!kind||e.kind===kind))G.selected.add(e.id);refreshCmd();},
  endTest:(win)=>endMatch(!!win),
  // same-code-path UI drivers for automated checks
  build:(kind,x,y)=>{const w=G.entities.find(e=>!e.building&&e.owner===0&&e.kind==='worker');
    if(w){G.selected.clear();G.selected.add(w.id);} tryStartPlacement(kind); if(G.placeMode)commitPlacement(x,y);},
  train:(kind)=>{const b=G.entities.find(e=>e.building&&e.owner===0&&e.progress>=1&&((kind==='worker'&&e.kind==='hq')||(kind!=='worker'&&e.kind==='gate')));
    if(b)tryTrain(b,kind); return !!b;},
  attackMove:(x,y)=>{orderAttackMove(G.entities.filter(e=>!e.building&&e.owner===0&&e.kind!=='worker'),x,y);},
  screenOf:(x,y)=>world2scr(x,y),
};
boot();
