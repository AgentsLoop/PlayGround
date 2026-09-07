/* TWISTED METAL: Rust Arena — fan homage. Original code, no Sony assets.
   2.5D logic (x,z plane) + Three.js renderer with automatic 2D canvas fallback.
   Controls: W/S throttle, A/D steer, Space handbrake, Shift turbo, J/click MG, K missile, 1-4 weapons, E special, P/Esc pause, M mute, C camera. */
import * as THREE from 'three';
const $=id=>document.getElementById(id);
const canvas=$('game-canvas'), mm=$('minimap'), mctx=mm.getContext('2d');
const errBox=$('err');
window.addEventListener('error',e=>{errBox.classList.remove('hidden');errBox.textContent='Error: '+(e.message||'unknown')+' — press R to restart battle.';});
const Q=new URLSearchParams(location.search);
const ARENA=92; // half-size
const VEHICLES=[
 {id:'sweet',name:'SWEET TOOTH',color:0xff5a2a,accent:0xffffff,armor:1.25,speed:0.95,special:'Napalm Cone',desc:'Ice-cream truck of doom',hp:130},
 {id:'warthog',name:'WARTHOG',color:0x3f7a3f,accent:0x222222,armor:1.45,speed:0.85,special:'Ram Shield',desc:'Tanky bruiser',hp:150},
 {id:'axel',name:'AXEL',color:0xcc2222,accent:0x111111,armor:0.9,speed:1.15,special:'Shock Rings',desc:'Fast & fragile',hp:95},
 {id:'yellow',name:'YELLOW JACKET',color:0xffd23f,accent:0x222288,armor:1.0,speed:1.05,special:'Seeker Swarm',desc:'Balanced taxi terror',hp:110},
];
const WEAPONS=[{id:'mg',name:'MACHINE GUN',inf:true},{id:'homing',name:'HOMING MISSILE'},{id:'napalm',name:'NAPALM'},{id:'shield',name:'SHIELD'}];
const G={state:'title',paused:false,muted:false,shake:true,reduced:false,sel:0,time:180,kills:0,over:false,countT:0,slowmo:1,
 player:null,bots:[],bullets:[],pickups:[],barrels:[],parts:[],rings:[],decals:[],turret:null,camMode:0,shakeT:0,shakeMag:0,flashT:0,
 use3D:true,three:null,fps:60,frames:0,fpsT:0,stats:{shots:0,hits:0,damage:0},startT:0,lastDmgDir:0,overheat:0,turbo:100};
const keys={};
addEventListener('keydown',e=>{const k=e.key.toLowerCase();keys[k]=true;
 if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k===' '?' ':k))e.preventDefault();
 if(k==='p'||k==='escape')togglePause();
 if(k==='m')toggleMute();
 if(k==='c'&&G.state==='play'){G.camMode=(G.camMode+1)%2;announce(G.camMode?'FAR CAM':'CHASE CAM');}
 if(k==='r'&&(G.state==='play'||G.over))startBattle();
 if(G.state==='play'&&!G.paused){if(k==='1')selWeapon(0);if(k==='2')selWeapon(1);if(k==='3')selWeapon(2);if(k==='4')selWeapon(3);if(k==='e')fireSpecial(G.player);if(k==='k')fireWeapon(G.player);}
});
addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
function announce(t,ms=1600){const a=$('announce');a.textContent=t;a.style.opacity=1;clearTimeout(a._t);a._t=setTimeout(()=>a.style.opacity=0,ms);}
function feed(t){const d=document.createElement('div');d.textContent=t;$('killfeed').prepend(d);while($('killfeed').children.length>5)$('killfeed').lastChild.remove();}
// ---------- audio (synth, no assets) ----------
let AC=null;
function beep(f,d,type='square',v=.15){if(G.muted)return;try{AC=AC||new (window.AudioContext||window.webkitAudioContext)();const o=AC.createOscillator(),g=AC.createGain();o.type=type;o.frequency.value=f;g.gain.value=v;o.connect(g);g.connect(AC.destination);o.start();g.gain.exponentialRampToValueAtTime(.001,AC.currentTime+d);o.stop(AC.currentTime+d);}catch{}}
function noise(d=.3,v=.25){if(G.muted)return;try{AC=AC||new (window.AudioContext||window.webkitAudioContext)();const b=AC.createBuffer(1,AC.sampleRate*d,AC.sampleRate),ch=b.getChannelData(0);for(let i=0;i<ch.length;i++)ch[i]=(Math.random()*2-1)*(1-i/ch.length);const s=AC.createBufferSource(),g=AC.createGain();s.buffer=b;g.gain.value=v;s.connect(g);g.connect(AC.destination);s.start();}catch{}}
function toggleMute(){G.muted=!G.muted;announce(G.muted?'MUTED':'SOUND ON');}
// ---------- entities ----------
function mkCar(veh,x,z,ang,isPlayer,name){return{veh,name:name||veh.name,x,z,ang,speed:0,hp:veh.hp,maxhp:veh.hp,alive:true,isPlayer:!!isPlayer,
 ammo:{homing:3,napalm:2,shield:1},windex:0,shieldT:0,turbo:100,fireCd:0,aiCd:1+Math.random()*2,aiT:Math.random()*2,wt:0,target:null,heat:0,mesh:null,wheels:[],ramT:0};}
function selWeapon(i){const p=G.player;if(!p||!p.alive)return;const ids=['mg','homing','napalm','shield'];
 if(i>0&&p.ammo[ids[i]]<=0&&ids[i]!=='mg'){beep(140,.1);return;}p.windex=i;beep(600,.06);renderWeapons();}
function renderWeapons(){const p=G.player;if(!p)return;const ids=['mg','homing','napalm','shield'];const el=$('weapon-list');el.innerHTML='';
 ids.forEach((id,i)=>{const n=id==='mg'?'∞':p.ammo[id];const d=document.createElement('div');d.className='w'+(i===p.windex?' cur':'')+((n<=0&&id!=='mg')?' empty':'');
  d.textContent=`${i+1}. ${WEAPONS[i].name} ×${n}`;el.appendChild(d);});}
// ---------- level setup ----------
function scatter(n,minD){const pts=[];let guard=0;while(pts.length<n&&guard++<800){const x=(Math.random()*2-1)*(ARENA-14),z=(Math.random()*2-1)*(ARENA-14);
 let ok=true;for(const p of pts){if(Math.hypot(p.x-x,p.z-z)<minD){ok=false;break;}}if(ok)pts.push({x,z});}return pts;}
function startBattle(){G.over=false;G.sudden=false;G.suddenT=0;G.time=180;G.kills=0;G.bullets=[];G.parts=[];G.rings=[];G.pickups=[];G.barrels=[];G.stats={shots:0,hits:0,damage:0};G.overheat=0;G.turbo=100;G.slowmo=1;G.startT=performance.now();
 $('killfeed').innerHTML='';$('over-stats').innerHTML='';
 const v=VEHICLES[G.sel];
 const spawns=scatter(6,34);
 G.player=mkCar(v,spawns[0].x,spawns[0].z,Math.random()*6.28,true,'YOU ('+v.name+')');
 const names=['STONE CRUSHER','MR. GRIM','MINION','SLAMM','BLOODHAWK'];
 G.bots=[];for(let i=0;i<5;i++){const vv=VEHICLES[(G.sel+1+i)%VEHICLES.length];G.bots.push(mkCar(vv,spawns[i+1].x,spawns[i+1].z,Math.random()*6.28,false,names[i]+'·'+vv.name));}
 for(const s of scatter(10,16))G.pickups.push({x:s.x,z:s.z,kind:['homing','napalm','repair','turbo','shield'][Math.floor(Math.random()*5)],bob:Math.random()*6,mesh:null});
 for(const s of scatter(8,18))G.barrels.push({x:s.x,z:s.z,hp:20,mesh:null});
 // center turret hazard + block obstacles
 G.turret={x:0,z:0,ang:0,cd:2,hp:80,mesh:null};
 G.blocks=scatter(7,22).map(s=>({...s,w:8+Math.random()*8,d:8+Math.random()*8}));
 setState('countdown');G.countT=3.6;syncMeshes();renderWeapons();
 $('vehicle-name').textContent=v.name;$('alive-count').textContent='6';$('kill-count').textContent='0';
 announce('READY…');beep(220,.3);}
function setState(s){G.state=s;G.paused=false;
 for(const id of ['screen-title','screen-select','screen-countdown','screen-pause','screen-over'])$(id).classList.add('hidden');
 $('hud').classList.toggle('hidden',!(s==='play'||s==='countdown'));
 if(s==='title'){$('screen-title').classList.remove('hidden');showBest();setTimeout(()=>$('btn-start').focus(),50);}
 if(s==='select'){$('screen-select').classList.remove('hidden');buildCards();setTimeout(()=>$('btn-fight').focus(),50);}
 if(s==='countdown')$('screen-countdown').classList.remove('hidden');
 if(s==='pause'){$('screen-pause').classList.remove('hidden');setTimeout(()=>$('btn-resume').focus(),50);}
 if(s==='over'){$('screen-over').classList.remove('hidden');setTimeout(()=>$('btn-again').focus(),50);}
 $('touch').classList.toggle('hidden',!(('ontouchstart'in window)&&s==='play'));}
function shake(t,m){if(!G.shake||G.reduced)return;G.shakeT=Math.max(G.shakeT,t);G.shakeMag=Math.max(G.shakeMag,m);}
function togglePause(){
 if(G.state==='play'&&!G.paused){setState('pause');G.state='pause';G.paused=true;
  $('screen-pause').classList.remove('hidden');$('hud').classList.remove('hidden');beep(330,.12);}
 else if(G.state==='pause'&&G.paused){setState('play');G.state='play';G.paused=false;beep(440,.12);}}
// ---------- vehicle select ----------
function buildCards(){const c=$('cards');c.innerHTML='';VEHICLES.forEach((v,i)=>{const d=document.createElement('div');d.className='card'+(i===G.sel?' sel':'');d.tabIndex=0;
 d.setAttribute('role','button');d.setAttribute('aria-label',v.name+' '+v.desc);
 d.innerHTML=`<div class="swatch" style="background:linear-gradient(135deg,#${v.color.toString(16).padStart(6,'0')},#111)"></div><h3>${v.name}</h3><div class="stat">${v.desc}<br>Special: ${v.special}<div class="bars"><i style="width:${v.armor/1.5*100}%"></i><i style="width:${v.speed/1.2*100}%"></i><i style="width:${v.hp/150*100}%"></i></div>ARMOR / SPEED / HULL</div>`;
 const pick=()=>{G.sel=i;buildCards();beep(500,.07);};d.onclick=pick;d.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){pick();}};c.appendChild(d);});}
// ---------- firing ----------
function fireWeapon(c){if(!c||!c.alive||G.paused)return;const ids=['mg','homing','napalm','shield'];
 if(c.fireCd>0)return;const w=ids[c.windex];
 if(w==='mg'){if(c.heat>1){beep(120,.15);return;}c.heat=Math.min(1.2,c.heat+.09);c.fireCd=.13;
  G.bullets.push({x:c.x+Math.cos(c.ang)*3.4,z:c.z-Math.sin(c.ang)*3.4,vx:Math.cos(c.ang)*95,vy:-Math.sin(c.ang)*95,life:1.1,dmg:6,from:c,homing:0,kind:'mg'});
  muzzle(c);if(c.isPlayer){G.stats.shots++;}beep(180+Math.random()*60,.07,'square',.08);}
 else{if(c.ammo[w]<=0){if(c.isPlayer){announce('EMPTY — grab a pickup!');beep(140,.15);}c.windex=0;renderWeapons();return;}
  c.ammo[w]--;c.fireCd=.7;
  if(w==='homing'){const tgt=nearestEnemy(c);for(let k=-1;k<=1;k+=2){G.bullets.push({x:c.x,z:c.z,vx:Math.cos(c.ang+k*.15)*60,vy:-Math.sin(c.ang+k*.15)*60,life:3.2,dmg:26,from:c,homing:1,tgt,kind:'homing'});}beep(300,.25,'sawtooth',.15);}
  if(w==='napalm'){for(let k=0;k<5;k++){const a=c.ang+(Math.random()-.5)*.7;G.bullets.push({x:c.x,z:c.z,vx:Math.cos(a)*55,vy:-Math.sin(a)*55,life:1.6,dmg:14,from:c,homing:0,kind:'napalm'});}noise(.25,.3);}
  if(w==='shield'){c.shieldT=6;announce(c.isPlayer?'SHIELD UP!':c.name+' SHIELDED');beep(700,.3,'sine',.15);}
  if(c.isPlayer){G.stats.shots++;renderWeapons();}}}
function fireSpecial(c){if(!c||!c.alive||G.paused||c.fireCd>0.2)return;const id=c.veh.id;c.fireCd=1.2;
 if(id==='sweet'){for(let k=0;k<9;k++){const a=c.ang+(k/8-.5)*.9;G.bullets.push({x:c.x,z:c.z,vx:Math.cos(a)*70,vy:-Math.sin(a)*70,life:1.4,dmg:16,from:c,homing:0,kind:'napalm'});}announce(c.isPlayer?'NAPALM CONE!':'SWEET TOOTH SPECIAL!');noise(.4,.35);}
 else if(id==='warthog'){c.shieldT=5;c.ramT=4;announce(c.isPlayer?'RAM SHIELD!':'WARTHOG RAMMING!');beep(150,.4,'sawtooth',.25);}
 else if(id==='axel'){G.rings.push({x:c.x,z:c.z,r:2,t:0,dmg:40,from:c});announce(c.isPlayer?'SHOCK RINGS!':'AXEL SPECIAL!');noise(.4,.35);}
 else{const tgt=nearestEnemy(c);for(let k=0;k<4;k++)setTimeout(()=>{if(!c.alive)return;G.bullets.push({x:c.x,z:c.z,vx:Math.cos(c.ang)*70,vy:-Math.sin(c.ang)*70,life:3,dmg:18,from:c,homing:1,tgt,kind:'homing'});beep(400,.15,'sawtooth',.12);},k*180);announce(c.isPlayer?'SEEKER SWARM!':'SWARM INBOUND!');}
 shake(.3,.5);}
function nearestEnemy(c){let best=null,bd=1e9;for(const o of [G.player,...G.bots]){if(o===c||!o.alive)continue;const d=Math.hypot(o.x-c.x,o.z-c.z);if(d<bd){bd=d;best=o;}}return best;}
function muzzle(c){spawnParts(c.x+Math.cos(c.ang)*3.6,c.z-Math.sin(c.ang)*3.6,4,0xffcc44,60);}
function explode(x,z,big,from){const n=big?26:12;spawnParts(x,z,n,0xff6a00,120);spawnParts(x,z,Math.floor(n/2),0x333333,60);
 G.rings.push({x,z,r:1,t:0,dmg:0,from});noise(big?.6:.25,big?.4:.2);shake(big?.6:.25,big?1:.4);
 if(!G.reduced){$('dmg-flash').style.opacity=.25;setTimeout(()=>$('dmg-flash').style.opacity=0,120);}}
function spawnParts(x,z,n,col,sp){for(let i=0;i<n;i++){const a=Math.random()*6.28,s=sp*(.3+Math.random());G.parts.push({x,z,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.5+Math.random()*.7,t:0,col});}if(G.parts.length>600)G.parts.splice(0,G.parts.length-600);}
/* shake() defined near setState (reduced-motion aware) */
function damage(o,dmg,from,dirx,dirz){if(!o.alive||G.over)return;if(o.shieldT>0){dmg*=.25;spawnParts(o.x,o.z,3,0x35c4ff,50);}
 if(o.ramT>0&&from&&from!==o){damage(from,10,o,0,0);}o.hp-=dmg;
 if(o.isPlayer){G.stats.damage+=dmg;G.lastDmgDir=Math.atan2(dirz||0,dirx||0);G.lastDmgT=performance.now();if(!G.reduced){$('dmg-flash').style.opacity=Math.min(.8,.25+dmg/60);setTimeout(()=>$('dmg-flash').style.opacity=0,140);}beep(90,.15,'sawtooth',.2);}
 if(from&&from.isPlayer&&o!==from){G.stats.hits++;hitmark();}
 if(o.hp<=0){o.hp=0;o.alive=false;explode(o.x,o.z,true,from);
  const kn=from?from.name:'ARENA';
  feed(`${kn} 💥 ${o.name}`);
  if(from&&from.isPlayer&&!o.isPlayer){G.kills++;$('kill-count').textContent=G.kills;beep(880,.3,'square',.2);announce('+1 KILL — '+G.kills,1200);}
  if(o.isPlayer){gameOver(false);}
  else if(G.bots.every(b=>!b.alive))gameOver(true);
  $('alive-count').textContent=[G.player,...G.bots].filter(c=>c.alive).length;}}
function hitmark(){const h=$('hitmarker');h.classList.remove('hidden');clearTimeout(h._t);h._t=setTimeout(()=>h.classList.add('hidden'),120);}
function gameOver(win){if(G.over)return;G.over=true;if(!G.reduced){G.slowmo=.25;setTimeout(()=>G.slowmo=1,900);}
 const t=((performance.now()-G.startT)/1000)|0;const best=JSON.parse(localStorage.getItem('tm_best')||'null');
 const score=G.kills*1000+Math.max(0,180-Math.floor(G.time))*10+(win?5000:0);
 if(!best||score>best.score)localStorage.setItem('tm_best',JSON.stringify({score,kills:G.kills,win,date:new Date().toISOString().slice(0,10)}));
 setTimeout(()=>{setState('over');G.state='over';
  $('over-kicker').textContent=win?'CALYPSO APPLAUDS':'WRECKED';
  $('over-title').textContent=win?'YOU WIN!':'YOU DIED';
  $('over-title').style.color=win?'#39ff5a':'#ff2a1a';
  $('over-sub').textContent=win?`Last driver alive in ${fmtT(180-G.time)} — "${G.player.veh.name} takes the prize… for now."`:`Destroyed. ${G.bots.filter(b=>b.alive).length} rivals still rolling.`;
  const acc=G.stats.shots?Math.round(G.stats.hits/G.stats.shots*100):0;
  $('over-stats').innerHTML=`KILLS ${G.kills} · TIME ${fmtT(t)} · ACC ${acc}% · DMG TAKEN ${Math.round(G.stats.damage)} · SCORE ${score}`;
  noise(.8,.4);},1100);}
function fmtT(s){s=Math.max(0,Math.round(s));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;}
function showBest(){try{const b=JSON.parse(localStorage.getItem('tm_best')||'null');$('best-line').textContent=b?`${b.score} pts · ${b.kills} kills · ${b.date}`:'no contests yet — make Calypso proud';}catch{$('best-line').textContent='—';}}
// ---------- update ----------
let last=performance.now();
function loop(t){requestAnimationFrame(loop);let dt=Math.min(.05,(t-last)/1000);last=t;dt*=G.slowmo;
 G.frames++;if(t-G.fpsT>500){G.fps=Math.round(G.frames*1000/(t-G.fpsT));G.frames=0;G.fpsT=t;$('fps').textContent=G.fps+' fps · '+(G.use3D?'3D':'2D fallback');}
 if(G.state==='countdown'){G.countT-=dt;const c=Math.ceil(G.countT-0.6);$('count').textContent=G.countT<0.6?'GO!':String(Math.max(1,c));if(G.countT<=0){setState('play');G.state='play';announce('DESTROY THEM ALL!',2000);beep(880,.4);}}
 if(G.state==='play'&&!G.paused&&!G.over){update(dt);}
 render(dt,t/1000);}
function update(dt){G.time-=dt;
 if(G.time<=0){G.time=0;
  if(!G.sudden){G.sudden=true;announce('SUDDEN DEATH — CALYPSO HUNGRY!',2500);feed('☠ SUDDEN DEATH: all hulls failing');beep(110,.6,'sawtooth',.25);}
  G.suddenT=(G.suddenT||0)+dt;
  if(G.suddenT>=1){G.suddenT=0;for(const o of [G.player,...G.bots])if(o.alive)damage(o,5,{name:'CALYPSO',isPlayer:false},0,0);}}
 $('timer').textContent=fmtT(G.time);
 stepCar(G.player,dt,true);for(const b of G.bots)stepCar(b,dt,false);
 // turret
 const T=G.turret;if(T&&G.player.alive){T.cd-=dt;const tgt=nearestTo(T.x,T.z);if(tgt){T.ang=Math.atan2(-(tgt.z-T.z),tgt.x-T.x);if(T.cd<=0){T.cd=2.2;G.bullets.push({x:T.x,z:T.z,vx:Math.cos(T.ang)*55,vy:-Math.sin(T.ang)*55,life:2.5,dmg:18,from:{name:'TURRET',isPlayer:false},homing:0,kind:'mg'});beep(200,.15,'sawtooth',.12);}}}
 // bullets
 for(let i=G.bullets.length-1;i>=0;i--){const b=G.bullets[i];b.life-=dt;
  if(b.homing&&b.tgt&&b.tgt.alive){const want=Math.atan2(-(b.tgt.z-b.z),b.tgt.x-b.x),cur=Math.atan2(b.vy,b.vx);let d=want-cur;while(d>Math.PI)d-=6.283;while(d<-Math.PI)d+=6.283;
   const na=cur+d*Math.min(1,dt*4),sp=Math.min(110,Math.hypot(b.vx,b.vy)+dt*40);b.vx=Math.cos(na)*sp;b.vy=Math.sin(na)*sp;}
  if(b.kind==='napalm'&&Math.random()<.3)spawnParts(b.x,b.z,1,0xff6a00,20);
  b.x+=b.vx*dt;b.z+=b.vy*dt;
  if(Math.abs(b.x)>ARENA||Math.abs(b.z)>ARENA||b.life<=0){if(b.kind==='napalm'||b.kind==='homing')explode(b.x,b.z,false,b.from);G.bullets.splice(i,1);continue;}
  let hit=false;
  for(const o of [G.player,...G.bots]){if(o===b.from||!o.alive)continue;if(Math.hypot(o.x-b.x,o.z-b.z)<3.2){damage(o,b.dmg*(b.kind==='napalm'?1:1),b.from,b.vx,b.vy);explode(b.x,b.z,false,b.from);hit=true;break;}}
  if(hit){G.bullets.splice(i,1);continue;}
  for(const br of G.barrels){if(Math.hypot(br.x-b.x,br.z-b.z)<2.5){br.hp-=b.dmg;if(br.hp<=0)boomBarrel(br);G.bullets.splice(i,1);hit=true;break;}}
  if(hit)continue;}
 // barrels chain
 for(let i=G.barrels.length-1;i>=0;i--){const br=G.barrels[i];if(br.hp<=0){G.barrels.splice(i,1);}}
 // pickups
 const p=G.player;
 for(let i=G.pickups.length-1;i>=0;i--){const pk=G.pickups[i];pk.bob+=dt*3;
  for(const o of [G.player,...G.bots]){if(!o.alive)continue;if(Math.hypot(o.x-pk.x,o.z-pk.z)<3.4){applyPickup(o,pk.kind);G.pickups.splice(i,1);
   if(Math.random()<.5){const s=scatter(1,10)[0];G.pickups.push({x:s.x,z:s.z,kind:['homing','napalm','repair','turbo','shield'][Math.floor(Math.random()*5)],bob:0,mesh:null});syncMeshes();}break;}}}
 if(Math.random()<dt*.15&&G.pickups.length<12){const s=scatter(1,8)[0];G.pickups.push({x:s.x,z:s.z,kind:'homing',bob:0,mesh:null});syncMeshes();}
 // rings
 for(let i=G.rings.length-1;i>=0;i--){const r=G.rings[i];r.t+=dt*3;r.r+=dt*30;for(const o of [G.player,...G.bots]){if(o===r.from||!o.alive||o._ringHit===r)continue;
   if(Math.abs(Math.hypot(o.x-r.x,o.z-r.z)-r.r)<3){o._ringHit=r;damage(o,r.dmg,r.from,0,0);}}if(r.r>26)G.rings.splice(i,1);}
 // parts
 for(let i=G.parts.length-1;i>=0;i--){const q=G.parts[i];q.t+=dt;if(q.t>q.life){G.parts.splice(i,1);continue;}q.x+=q.vx*dt;q.z+=q.vy*dt;q.vx*=.96;q.vy*=.96;}
 // timers
 for(const o of [G.player,...G.bots]){if(o.shieldT>0)o.shieldT-=dt;if(o.ramT>0)o.ramT-=dt;if(o.fireCd>0)o.fireCd-=dt;}
 if(p.heat>0)p.heat=Math.max(0,p.heat-dt*.5);
 G.overheat=p.heat;
 if(G.shakeT>0){G.shakeT-=dt;if(G.shakeT<=0)G.shakeMag=0;}
 // HUD
 $('hp-fill').style.width=(100*p.hp/p.maxhp)+'%';$('hp-num').textContent=Math.ceil(p.hp);
 $('turbo-fill').style.width=p.turbo+'%';$('heat-fill').style.width=Math.min(100,p.heat*100)+'%';
 // input fire
 if(p.alive){if(keys['j']||mouseDown)fireWeapon(p);}
 p.turbo=Math.min(100,p.turbo+dt*6);
 // bot respawn pickups AI firing handled in stepCar
}
function nearestTo(x,z){let best=null,bd=1e9;for(const o of [G.player,...G.bots]){if(!o.alive)continue;const d=Math.hypot(o.x-x,o.z-z);if(d<bd){bd=d;best=o;}}return best;}
function applyPickup(o,kind){if(kind==='repair')o.hp=Math.min(o.maxhp,o.hp+40);
 if(kind==='turbo')o.turbo=100;
 if(kind==='homing')o.ammo.homing=Math.min(9,o.ammo.homing+3);
 if(kind==='napalm')o.ammo.napalm=Math.min(9,o.ammo.napalm+2);
 if(kind==='shield'){if(o.isPlayer)o.ammo.shield=Math.min(3,o.ammo.shield+1);else o.shieldT=6;}
 if(o.isPlayer){announce({repair:'+40 HULL',turbo:'TURBO FULL',homing:'+3 HOMING',napalm:'+2 NAPALM',shield:'+1 SHIELD'}[kind],1000);beep(660,.15,'sine',.15);renderWeapons();}}
function boomBarrel(br){br.hp=-1;explode(br.x,br.z,true,{name:'BARREL',isPlayer:false});
 for(const o of [G.player,...G.bots]){if(!o.alive)continue;const d=Math.hypot(o.x-br.x,o.z-br.z);if(d<12)damage(o,30*(1-d/14),{name:'BARREL',isPlayer:false},o.x-br.x,o.z-br.z);}}
function stepCar(c,dt,isP){if(!c||!c.alive)return;
 const top=34*c.veh.speed+(c.ramT>0?14:0);
 let th=0,steer=0,turbo=false;
 if(isP){th=(keys['w']||keys['arrowup']?1:0)-(keys['s']||keys['arrowdown']?1:0);steer=(keys['a']||keys['arrowleft']?1:0)-(keys['d']||keys['arrowright']?1:0);
  turbo=!!keys['shift'];if(keys[' ']){c.speed*=(1-dt*4);steer*=1.8;}}
 else{aiDrive(c,dt);th=c._th;steer=c._st;turbo=c._tb;}
 const hb=keys[' ']&&isP;
 const accel=th*(hb?10:30)*(c.veh.speed);
 if(turbo&&c.turbo>0&&th>0){c.speed+=th*40*dt;c.turbo-=dt*30;if(Math.random()<.4)spawnParts(c.x,c.z,1,0x35c4ff,30);}
 else c.speed+= (accel*dt) - c.speed*1.4*dt;
 c.speed=Math.max(-14,Math.min(top+(turbo?16:0),c.speed));
 const grip=hb?1.2:2.4;
 c.ang+=steer*grip*dt*Math.sign(c.speed||1)*Math.min(1,Math.abs(c.speed)/10+.3);
 const nx=c.x+Math.cos(c.ang)*c.speed*dt,nz=c.z-Math.sin(c.ang)*c.speed*dt;
 // wall collide
 if(Math.abs(nx)>ARENA-3){c.ang=Math.PI-c.ang;c.speed*=.5;if(isP){shake(.15,.3);noise(.1,.15);}damage(c,2,{name:'WALL',isPlayer:false},0,0);}
 else c.x=nx;
 if(Math.abs(nz)>ARENA-3){c.ang=-c.ang;c.speed*=.5;if(isP){shake(.15,.3);}damage(c,2,{name:'WALL',isPlayer:false},0,0);}
 else c.z=nz;
 // blocks collide
 if(G.blocks)for(const b of G.blocks){if(Math.abs(c.x-b.x)<b.w/2+2&&Math.abs(c.z-b.z)<b.d/2+2){c.speed*=-.4;c.x-=Math.cos(c.ang)*3;c.z+=Math.sin(c.ang)*3;}}
 // barrels touch
 for(const br of G.barrels){if(Math.hypot(c.x-br.x,c.z-br.z)<3&&Math.abs(c.speed)>12)boomBarrel(br);}
 // drift marks + turbo regen
 c.wt+=dt;
}
function aiDrive(c,dt){c.aiT-=dt;
 if(c.aiT<=0||!c.target||!c.target.alive){c.aiT=2+Math.random()*2;
  const needsGun=(c.ammo.homing+c.ammo.napalm)===0;
  if(c.hp<45&&Math.random()<.6){let bp=null,bd=1e9;for(const pk of G.pickups){if(pk.kind!=='repair')continue;const d=Math.hypot(pk.x-c.x,pk.z-c.z);if(d<bd){bd=d;bp=pk;}}c.target=bp||nearestEnemy(c);}
  else if(needsGun){let bp=null,bd=1e9;for(const pk of G.pickups){if(pk.kind!=='homing'&&pk.kind!=='napalm')continue;const d=Math.hypot(pk.x-c.x,pk.z-c.z);if(d<bd){bd=d;bp=pk;}}c.target=bp||nearestEnemy(c);}
  else c.target=Math.random()<.25?(G.pickups[Math.floor(Math.random()*G.pickups.length)]||nearestEnemy(c)):nearestEnemy(c);}
 const t=c.target;let want=c.ang;
 if(t){want=Math.atan2(-(t.z-c.z),t.x-c.x);}
 let d=want-c.ang;while(d>Math.PI)d-=6.283;while(d<-Math.PI)d+=6.283;
 c._st=Math.max(-1,Math.min(1,d*2));c._th=1;c._tb=c.turbo>40&&Math.abs(d)<.3;
 // avoid walls
 if(Math.abs(c.x)>ARENA-16||Math.abs(c.z)>ARENA-16)c._st+=.8;
 c.aiCd-=dt;if(c.aiCd<=0&&t&&t.x!==undefined&&Math.abs(d)<.4){c.aiCd=1+Math.random()*2;
  const dist=Math.hypot((t.x??0)-c.x,(t.z??0)-c.z);
  if(t.hp!==undefined&&dist<70){ // enemy car
   if(Math.random()<.6){const keep=c.windex;
    if(dist<25&&c.ammo.napalm>0)c.windex=2;else c.windex=c.ammo.homing>0?1:0;
    fireWeapon(c);c.windex=keep;}
   else fireSpecial(c);}
  else if(dist<8){/* pickup reached */}
 }
 if(c.heat>0)c.heat=Math.max(0,c.heat-dt*.5);}
// ---------- THREE renderer with 2D fallback ----------
let scene,camera,renderer,ground,wallGroup,carMeshes=new Map(),fxLight;
let mouseDown=false;
addEventListener('mousedown',()=>mouseDown=true);addEventListener('mouseup',()=>mouseDown=false);
function initThree(){try{
 if(Q.has('force2d'))throw new Error('forced 2d');
 scene=new THREE.Scene();scene.background=new THREE.Color(0x0a0c12);scene.fog=new THREE.Fog(0x0a0c12,120,320);
 camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.1,600);
 renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 scene.add(new THREE.HemisphereLight(0x8899ff,0x221111,.9));
 const sun=new THREE.DirectionalLight(0xffddaa,1.4);sun.position.set(60,90,30);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
 sun.shadow.camera.left=-120;sun.shadow.camera.right=120;sun.shadow.camera.top=120;sun.shadow.camera.bottom=-120;scene.add(sun);
 fxLight=new THREE.PointLight(0xff6600,0,80);scene.add(fxLight);
 // ground with grid texture
 const gc=document.createElement('canvas');gc.width=gc.height=256;const g=gc.getContext('2d');
 g.fillStyle='#1a1d24';g.fillRect(0,0,256,256);g.strokeStyle='#2c313d';for(let i=0;i<=8;i++){g.beginPath();g.moveTo(i*32,0);g.lineTo(i*32,256);g.stroke();g.beginPath();g.moveTo(0,i*32);g.lineTo(256,i*32);g.stroke();}
 g.fillStyle='#ff2a1a22';g.fillRect(0,0,256,8);g.fillRect(0,0,8,256);
 const tex=new THREE.CanvasTexture(gc);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(10,10);
 ground=new THREE.Mesh(new THREE.PlaneGeometry(ARENA*2+20,ARENA*2+20),new THREE.MeshStandardMaterial({map:tex,roughness:.9}));
 ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
 wallGroup=new THREE.Group();
 const wm=new THREE.MeshStandardMaterial({color:0x3a2020,roughness:.7,metalness:.3});
 for(let i=0;i<4;i++){const w=new THREE.Mesh(new THREE.BoxGeometry(ARENA*2+8,10,3),wm);const w2=w.clone();
  if(i===0){w.position.set(0,5,-ARENA-2);}if(i===1){w.position.set(0,5,ARENA+2);}
  if(i===2){w.rotation.y=Math.PI/2;w.position.set(-ARENA-2,5,0);}if(i===3){w.rotation.y=Math.PI/2;w.position.set(ARENA+2,5,0);}
  w.castShadow=w.receiveShadow=true;wallGroup.add(w);}
 // rust pillars
 for(let i=0;i<8;i++){const a=i/8*6.28;const pil=new THREE.Mesh(new THREE.CylinderGeometry(2,3,26,8),new THREE.MeshStandardMaterial({color:0x552211,roughness:.8}));
  pil.position.set(Math.cos(a)*(ARENA+6),13,Math.sin(a)*(ARENA+6));wallGroup.add(pil);}
 scene.add(wallGroup);
 addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
 G.use3D=true;
}catch(e){G.use3D=false;console.warn('3D unavailable, 2D fallback:',e);resize2d();}}
function resize2d(){canvas.width=innerWidth;canvas.height=innerHeight;}
addEventListener('resize',()=>{if(!G.use3D)resize2d();});
function carMesh(c){let m=carMeshes.get(c);
 if(!m){const grp=new THREE.Group();
  const body=new THREE.Mesh(new THREE.BoxGeometry(5.4,1.6,2.6),new THREE.MeshStandardMaterial({color:c.veh.color,roughness:.5,metalness:.5}));
  body.position.y=1.2;body.castShadow=true;grp.add(body);
  const cab=new THREE.Mesh(new THREE.BoxGeometry(2.4,1.2,2.2),new THREE.MeshStandardMaterial({color:0x11151c,roughness:.2,metalness:.7}));
  cab.position.set(-.4,2.4,0);cab.castShadow=true;grp.add(cab);
  if(c.veh.id==='sweet'){const box=new THREE.Mesh(new THREE.BoxGeometry(2.6,2.2,2.4),new THREE.MeshStandardMaterial({color:0xfff2cf}));box.position.set(-2.6,2.2,0);grp.add(box);
   const cone=new THREE.Mesh(new THREE.ConeGeometry(.7,1.8,8),new THREE.MeshStandardMaterial({color:0xff8833}));cone.position.set(-2.6,4.2,0);grp.add(cone);}
  const wg=new THREE.CylinderGeometry(.7,.7,.6,10);wg.rotateX(Math.PI/2);const wmat=new THREE.MeshStandardMaterial({color:0x0a0a0a,roughness:.9});
  c.wheels=[];for(const [wx,wz] of [[1.8,1.4],[1.8,-1.4],[-1.8,1.4],[-1.8,-1.4]]){const w=new THREE.Mesh(wg,wmat);w.position.set(wx,.7,wz);grp.add(w);c.wheels.push(w);}
  const hpbar=new THREE.Sprite(new THREE.SpriteMaterial({color:0x39ff5a}));hpbar.scale.set(5,.5,1);hpbar.position.y=4.6;grp.add(hpbar);grp.userData.hpbar=hpbar;
  if(c.shieldT>0||true){const sh=new THREE.Mesh(new THREE.SphereGeometry(3.6,16,12),new THREE.MeshBasicMaterial({color:0x35c4ff,transparent:true,opacity:0}));sh.position.y=1.4;grp.add(sh);grp.userData.shield=sh;}
  scene.add(grp);carMeshes.set(c,grp);m=grp;}
 m.position.set(c.x,0,c.z);m.rotation.y=c.ang;
 m.userData.hpbar.material.color.set(c.hp/c.maxhp>.5?0x39ff5a:c.hp/c.maxhp>.25?0xffb400:0xff2a1a);
 m.userData.hpbar.scale.x=5*Math.max(0,c.hp/c.maxhp);m.visible=c.alive;
 m.userData.shield.material.opacity=c.shieldT>0?.25+Math.sin(performance.now()/150)*.1:0;
 for(const w of c.wheels||[])w.rotation.z-=c.speed*.05;
 return m;}
const tmpV=null;
function syncMeshes(){if(!G.use3D||!scene)return;
 // clear stale
 for(const [c,m] of [...carMeshes]){if(c!==G.player&&!G.bots.includes(c)){scene.remove(m);carMeshes.delete(c);}}
 for(const c of [G.player,...G.bots])if(c)carMesh(c);
 // blocks
 if(!scene.userData.blocks){scene.userData.blocks=new THREE.Group();scene.add(scene.userData.blocks);}
 const bg=scene.userData.blocks;while(bg.children.length)bg.remove(bg.children[0]);
 if(G.blocks)for(const b of G.blocks){const m=new THREE.Mesh(new THREE.BoxGeometry(b.w,5,b.d),new THREE.MeshStandardMaterial({color:0x2c2f36,roughness:.8}));m.position.set(b.x,2.5,b.z);m.castShadow=m.receiveShadow=true;bg.add(m);}
 // barrels
 if(!scene.userData.barrels){scene.userData.barrels=new THREE.Group();scene.add(scene.userData.barrels);}
 const rg=scene.userData.barrels;while(rg.children.length)rg.remove(rg.children[0]);
 for(const br of G.barrels){const m=new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.2,2.4,10),new THREE.MeshStandardMaterial({color:0xcc2222,roughness:.6}));m.position.set(br.x,1.2,br.z);m.castShadow=true;rg.add(m);}
 // pickups
 if(!scene.userData.pk){scene.userData.pk=new THREE.Group();scene.add(scene.userData.pk);}
 const pg=scene.userData.pk;while(pg.children.length)pg.remove(pg.children[0]);
 for(const pk of G.pickups){const col={homing:0x39ff5a,napalm:0xff6a00,repair:0xffffff,turbo:0x35c4ff,shield:0xb44dff}[pk.kind]||0xffffff;
  const m=new THREE.Mesh(new THREE.OctahedronGeometry(1.2),new THREE.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:.7}));m.position.set(pk.x,2,pk.z);m.userData.kind=pk.kind;pg.add(m);pk.mesh=m;}
 // turret
 if(G.turret&&!G.turret.mesh){const base=new THREE.Group();const b=new THREE.Mesh(new THREE.CylinderGeometry(3,4,3,10),new THREE.MeshStandardMaterial({color:0x444a55}));b.position.y=1.5;base.add(b);
  const gun=new THREE.Mesh(new THREE.BoxGeometry(6,1,1.4),new THREE.MeshStandardMaterial({color:0xff2a1a}));gun.position.y=3.6;base.add(gun);base.userData.gun=gun;
  base.position.set(0,0,0);scene.add(base);G.turret.mesh=base;}
}
// ---------- render ----------
const ctx2d=canvas.getContext('2d');
function render(dt,tt){drawMinimap();
 if(!G.use3D||!renderer){render2D(tt);return;}
 syncDynamic(dt,tt);
 const p=G.player||{x:0,z:0,ang:0};
 const back=13+G.camMode*8,up=6.5+G.camMode*3;
 const cx=p.x-Math.cos(p.ang)*back,cz=p.z+Math.sin(p.ang)*back;
 let sx=0,sz=0;if(G.shakeT>0){sx=(Math.random()-.5)*G.shakeMag*3;sz=(Math.random()-.5)*G.shakeMag*3;}
 camera.position.set(cx+sx,up,p.z!==undefined?cz+sz:0);
 camera.lookAt(p.x+sx,p.y||2,p.z+sz);
 fxLight.intensity=G.parts.length>0?Math.min(60,G.parts.length*2):0;
 if(G.parts.length){const q=G.parts[Math.floor(Math.random()*G.parts.length)];fxLight.position.set(q.x,4,q.z);}
 // bullets
 if(!scene.userData.b){scene.userData.b=new THREE.Group();scene.add(scene.userData.b);}
 const bg=scene.userData.b;while(bg.children.length)bg.remove(bg.children[0]);
 for(const b of G.bullets){const m=new THREE.Mesh(new THREE.SphereGeometry(b.kind==='mg'?.3:.6,8,6),new THREE.MeshBasicMaterial({color:b.kind==='napalm'?0xff6a00:b.kind==='homing'?0x39ff5a:0xffe28a}));m.position.set(b.x,1.6,b.z);bg.add(m);}
 // particles
 if(!scene.userData.pt){scene.userData.pt=new THREE.Group();scene.add(scene.userData.pt);}
 const pg=scene.userData.pt;while(pg.children.length)pg.remove(pg.children[0]);
 for(const q of G.parts){const m=new THREE.Mesh(new THREE.BoxGeometry(.5,.5,.5),new THREE.MeshBasicMaterial({color:q.col}));m.position.set(q.x,1+q.t*2,q.z);pg.add(m);}
 // rings + pickups spin
 if(!scene.userData.ring){scene.userData.ring=new THREE.Group();scene.add(scene.userData.ring);}
 const rg2=scene.userData.ring;while(rg2.children.length)rg2.remove(rg2.children[0]);
 for(const r of G.rings){const m=new THREE.Mesh(new THREE.TorusGeometry(r.r,.5,8,32),new THREE.MeshBasicMaterial({color:0xffaa00,transparent:true,opacity:.8}));m.rotation.x=Math.PI/2;m.position.set(r.x,1,r.z);rg2.add(m);}
 if(scene.userData.pk)for(const m of scene.userData.pk.children){m.rotation.y+=dt*2;m.position.y=2+Math.sin(tt*3+m.position.x)*.4;}
 if(G.turret&&G.turret.mesh)G.turret.mesh.userData.gun.rotation.y=G.turret.ang;
 // health bars face camera automatically (sprites)
 renderer.render(scene,camera);}
function syncDynamic(){if(G.player)carMesh(G.player);for(const b of G.bots)carMesh(b);}
function render2D(tt){const w=canvas.width,h=canvas.height;ctx2d.fillStyle='#14100d';ctx2d.fillRect(0,0,w,h);
 const p=G.player||{x:0,z:0,ang:0};const s=Math.min(w,h)/(ARENA*2.4);
 const X=x=>w/2+(x-p.x)*s, Z=z=>h/2+(z-p.z)*s;
 // rust-noise ground speckle (deterministic)
 ctx2d.fillStyle='#ffffff08';for(let i=0;i<90;i++){const gx=((i*53)%200)-100,gz=((i*91)%200)-100;ctx2d.fillRect(X(gx),Z(gz),2,2);}
 ctx2d.strokeStyle='#ff2a1a66';ctx2d.lineWidth=3;ctx2d.strokeRect(X(-ARENA),Z(-ARENA),ARENA*2*s,ARENA*2*s);
 ctx2d.fillStyle='#2e2a26';if(G.blocks)for(const b of G.blocks){ctx2d.fillRect(X(b.x-b.w/2),Z(b.z-b.d/2),b.w*s,b.d*s);ctx2d.strokeStyle='#00000088';ctx2d.strokeRect(X(b.x-b.w/2),Z(b.z-b.d/2),b.w*s,b.d*s);}
 // decals: scorch craters
 ctx2d.fillStyle='#00000055';for(const r of G.rings){ctx2d.beginPath();ctx2d.arc(X(r.x),Z(r.z),Math.min(20,r.r)*s*.5,0,7);ctx2d.fill();}
 for(const br of G.barrels){ctx2d.fillStyle='#cc2222';ctx2d.beginPath();ctx2d.arc(X(br.x),Z(br.z),2.2*s,0,7);ctx2d.fill();ctx2d.fillStyle='#ffdd44';ctx2d.fillRect(X(br.x)-2,Z(br.z)-5,4,3);}
 const cols={homing:'#39ff5a',napalm:'#ff6a00',repair:'#fff',turbo:'#35c4ff',shield:'#b44dff'};
 for(const pk of G.pickups){ctx2d.fillStyle=cols[pk.kind]||'#fff';ctx2d.save();ctx2d.translate(X(pk.x),Z(pk.z));ctx2d.rotate(tt*2);ctx2d.fillRect(-6,-6,12,12);ctx2d.strokeStyle='#000';ctx2d.strokeRect(-6,-6,12,12);ctx2d.restore();}
 // center turret
 ctx2d.fillStyle='#ff2a1a';ctx2d.save();ctx2d.translate(X(0),Z(0));ctx2d.rotate(G.turret?-G.turret.ang:0);ctx2d.fillRect(-8,-3,16,6);ctx2d.restore();
 ctx2d.fillStyle='#888';ctx2d.beginPath();ctx2d.arc(X(0),Z(0),5,0,7);ctx2d.fill();
 const draw=(c,col)=>{if(!c||!c.alive)return;ctx2d.save();ctx2d.translate(X(c.x),Z(c.z));ctx2d.rotate(-c.ang);
  ctx2d.fillStyle='#000000aa';ctx2d.fillRect(-12,-6,24,14);
  ctx2d.fillStyle=col;ctx2d.fillRect(-11,-6,22,12);
  ctx2d.fillStyle='#10141c';ctx2d.fillRect(-2,-5,7,10); // cabin
  ctx2d.fillStyle='#ffe9a8';ctx2d.fillRect(11,-5,3,3);ctx2d.fillRect(11,2,3,3); // headlights
  if(c.shieldT>0){ctx2d.strokeStyle='#35c4ff';ctx2d.lineWidth=2;ctx2d.beginPath();ctx2d.arc(0,0,15,0,7);ctx2d.stroke();}
  ctx2d.restore();
  // hp bar
  ctx2d.fillStyle='#000';ctx2d.fillRect(X(c.x)-12,Z(c.z)-16,24,4);
  ctx2d.fillStyle=c.hp/c.maxhp>.5?'#39ff5a':c.hp/c.maxhp>.25?'#ffb400':'#ff2a1a';
  ctx2d.fillRect(X(c.x)-12,Z(c.z)-16,24*Math.max(0,c.hp/c.maxhp),4);};
 draw(G.player,'#ff5a2a');G.bots.forEach((b,i)=>draw(b,['#7fd67f','#e8e8e8','#e07fe0','#8cc8ff','#ffaa33'][i%5]));
 ctx2d.fillStyle='#ffe28a';for(const b of G.bullets)ctx2d.fillRect(X(b.x)-2,Z(b.z)-2,4,4);
 // damage direction arc (uses G.lastDmgDir)
 if(G.lastDmgT&&performance.now()-G.lastDmgT<900&&G.player){ctx2d.strokeStyle='#ff2a1a';ctx2d.lineWidth=4;ctx2d.beginPath();
  ctx2d.arc(w/2,h/2,46,G.lastDmgDir-.5,G.lastDmgDir+.5);ctx2d.stroke();}}
function drawMinimap(){const S=160;mctx.clearRect(0,0,S,S);mctx.fillStyle='#000a';mctx.fillRect(0,0,S,S);
 const dot=(x,z,c,r=3)=>{mctx.fillStyle=c;mctx.beginPath();mctx.arc(S/2+x/ARENA*S/2,S/2+z/ARENA*S/2,r,0,7);mctx.fill();};
 mctx.strokeStyle='#ffffff33';mctx.strokeRect(2,2,S-4,S-4);
 for(const pk of G.pickups)dot(pk.x,pk.z,'#0f8');
 for(const br of G.barrels)dot(br.x,br.z,'#f33',2);
 for(const b of G.bots)if(b.alive)dot(b.x,b.z,'#fa0');
 if(G.player&&G.player.alive)dot(G.player.x,G.player.z,'#fff',4);}
// ---------- wiring ----------
$('btn-start').onclick=()=>{beep(440,.1);setState('select');};
$('btn-how').onclick=()=>$('how').classList.toggle('hidden');
$('btn-back').onclick=()=>setState('title');
$('btn-fight').onclick=()=>{beep(880,.2);startBattle();};
$('btn-resume').onclick=()=>togglePause();
$('btn-restart2').onclick=()=>startBattle();
$('btn-quit').onclick=()=>{setState('title');G.state='title';};
$('btn-again').onclick=()=>startBattle();
$('btn-title2').onclick=()=>{setState('title');G.state='title';};
$('opt-shake').onchange=e=>G.shake=e.target.checked;
$('opt-reduced').onchange=e=>G.reduced=e.target.checked;
document.querySelectorAll('#touch button').forEach(b=>{const k=b.dataset.k;const dn=e=>{e.preventDefault();touchSet(k,true);};const up=e=>{e.preventDefault();touchSet(k,false);};
 b.addEventListener('pointerdown',dn);b.addEventListener('pointerup',up);b.addEventListener('pointerleave',up);});
function touchSet(k,v){if(k==='left')keys['a']=v;if(k==='right')keys['d']=v;if(k==='up')keys['w']=v;if(k==='down')keys['s']=v;
 if(k==='fire1'){keys['j']=v;}if(k==='fire2'&&v)fireWeapon(G.player);if(k==='special'&&v)fireSpecial(G.player);if(k==='pause'&&v)togglePause();}
// boot
try{if(matchMedia('(prefers-reduced-motion: reduce)').matches){G.reduced=true;$('opt-reduced').checked=true;}}catch{}
setState('title');showBest();initThree();requestAnimationFrame(t=>{last=t;requestAnimationFrame(loop);});
// smoke hook for automated verification
window.__TM={G,startBattle,damage,togglePause,VEHICLES,
 state:()=>({state:G.state,kills:G.kills,playerHp:G.player?.hp,bots:G.bots.length,pickups:G.pickups.length,use3D:G.use3D,fps:G.fps})};
