import * as THREE from 'three';
import { AudioSys } from './audio.js';
import { HUD, drawMinimap } from './hud.js';

// ============ RENDERER / SCENE ============
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9db8d6);
scene.fog = new THREE.Fog(0xc4a88f, 45, 190);

const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.05, 500);
const yawObj = new THREE.Object3D(); yawObj.position.set(0,1.7,8);
const pitchObj = new THREE.Object3D(); pitchObj.add(camera); yawObj.add(pitchObj); scene.add(yawObj);
// warm fill so the viewmodel never goes pitch black
const gunFill = new THREE.PointLight(0xffe2bb, 5, 5, 1.6);
gunFill.position.set(0.2, 0.1, -0.4); camera.add(gunFill);

addEventListener('resize', ()=>{ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); });

// ============ CANVAS TEXTURES (no external assets) ============
function makeTex(size, draw, rx=1, ry=1){
  const c=document.createElement('canvas'); c.width=c.height=size;
  draw(c.getContext('2d'), size);
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(rx,ry);
  t.anisotropy=4; t.colorSpace=THREE.SRGBColorSpace;
  return t;
}
function grain(g,s,n,a0,a1,sz=2){
  for(let i=0;i<n;i++){ const a=(a0+Math.random()*(a1-a0))|0;
    g.fillStyle=`rgba(${a},${a},${a},0.28)`; g.fillRect(Math.random()*s,Math.random()*s,1+Math.random()*sz,1+Math.random()*sz); }
}
const asphaltTex = makeTex(512,(g,s)=>{
  g.fillStyle='#2e3036'; g.fillRect(0,0,s,s); grain(g,s,11000,18,66,3);
  g.strokeStyle='rgba(0,0,0,0.4)'; g.lineWidth=2;
  for(let i=0;i<7;i++){ g.beginPath(); let x=Math.random()*s,y=Math.random()*s; g.moveTo(x,y);
    for(let k=0;k<5;k++){ x+=(Math.random()-0.5)*90; y+=(Math.random()-0.5)*90; g.lineTo(x,y);} g.stroke(); }
  g.fillStyle='rgba(190,170,90,0.5)'; g.fillRect(0,s*0.48,s,7); // faded lane paint
  g.fillStyle='rgba(0,0,0,0.3)'; for(let i=0;i<40;i++) g.fillRect(Math.random()*s,s*0.48+Math.random()*7,8,3);
},30,30);
const concreteTex = makeTex(256,(g,s)=>{
  g.fillStyle='#a3a29b'; g.fillRect(0,0,s,s); grain(g,s,4200,130,200,3);
  g.fillStyle='rgba(0,0,0,0.16)'; g.fillRect(0,s-42,s,42);
  g.fillStyle='rgba(255,255,255,0.07)'; g.fillRect(0,0,s,12);
  g.strokeStyle='rgba(0,0,0,0.3)'; g.lineWidth=3; g.strokeRect(1,1,s-2,s-2);
  g.fillStyle='rgba(50,50,50,0.8)';
  for(let i=0;i<10;i++){ g.beginPath(); g.arc(Math.random()*s,Math.random()*s,1+Math.random()*2.5,0,7); g.fill(); }
},1,1);
const woodTex = makeTex(256,(g,s)=>{
  g.fillStyle='#8a5f33'; g.fillRect(0,0,s,s);
  for(let y=0;y<s;y+=32){ g.fillStyle=`rgba(60,35,10,${0.25+Math.random()*0.2})`; g.fillRect(0,y,s,3);
    g.fillStyle='rgba(255,220,150,0.08)'; g.fillRect(0,y+3,s,29); }
  grain(g,s,1400,80,150,5);
  g.strokeStyle='#4a2f14'; g.lineWidth=14; g.strokeRect(7,7,s-14,s-14);
  g.lineWidth=9; g.beginPath(); g.moveTo(0,0); g.lineTo(s,s); g.moveTo(s,0); g.lineTo(0,s); g.stroke();
},1,1);
const metalTex = makeTex(256,(g,s)=>{
  g.fillStyle='#d2d2d2'; g.fillRect(0,0,s,s);
  for(let x=0;x<s;x+=16){ g.fillStyle='rgba(0,0,0,0.28)'; g.fillRect(x,0,5,s);
    g.fillStyle='rgba(255,255,255,0.2)'; g.fillRect(x+5,0,3,s); }
  grain(g,s,2200,150,230,2);
  g.fillStyle='rgba(120,60,20,0.5)';
  for(let i=0;i<22;i++) g.fillRect(Math.random()*s,s-56+Math.random()*56,4+Math.random()*10,2+Math.random()*5);
},2,1);

// ============ LIGHTS + SKY (late-afternoon cinematic) ============
scene.add(new THREE.HemisphereLight(0xffe2c4, 0x3a4a5a, 0.5));
const sun = new THREE.DirectionalLight(0xffe0bd, 2.0);
sun.position.set(-42, 26, 20); sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-60; sun.shadow.camera.right=60; sun.shadow.camera.top=60; sun.shadow.camera.bottom=-60;
sun.shadow.camera.near=5; sun.shadow.camera.far=150;
sun.shadow.bias=-0.0004; sun.shadow.normalBias=0.02;
scene.add(sun);
{ // gradient sky dome
  const skyMat = new THREE.ShaderMaterial({ side:THREE.BackSide, depthWrite:false, fog:false,
    uniforms:{ top:{value:new THREE.Color(0x2e4a7a)}, mid:{value:new THREE.Color(0xe8935a)}, bot:{value:new THREE.Color(0xffd9a0)} },
    vertexShader:'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader:`varying vec3 vP; uniform vec3 top,mid,bot;
      void main(){ float h=normalize(vP).y;
        vec3 c = h>0.12 ? mix(mid,top,smoothstep(0.12,0.6,h)) : mix(bot,mid,smoothstep(-0.05,0.12,h));
        gl_FragColor=vec4(c,1.0); }`});
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(420,24,14), skyMat));
  // sun glow sprite
  const c=document.createElement('canvas'); c.width=c.height=128; const g2=c.getContext('2d');
  const gr=g2.createRadialGradient(64,64,2,64,64,64);
  gr.addColorStop(0,'rgba(255,240,210,1)'); gr.addColorStop(0.3,'rgba(255,200,130,0.8)'); gr.addColorStop(1,'rgba(255,160,80,0)');
  g2.fillStyle=gr; g2.fillRect(0,0,128,128);
  const spr=new THREE.Sprite(new THREE.SpriteMaterial({ map:new THREE.CanvasTexture(c), blending:THREE.AdditiveBlending, depthWrite:false, fog:false }));
  spr.scale.set(120,120,1); spr.position.set(-300,95,140); scene.add(spr);
}
// distant hills ring
{
  const m=new THREE.MeshStandardMaterial({color:0x5a5a52,roughness:1});
  for(let i=0;i<14;i++){ const a=i/14*Math.PI*2; const h=new THREE.Mesh(new THREE.ConeGeometry(20+Math.random()*16,13+Math.random()*15,5),m);
    h.position.set(Math.cos(a)*170,-1,Math.sin(a)*170); scene.add(h); }
}

// ============ GROUND ============
const ground = new THREE.Mesh(new THREE.PlaneGeometry(150,150),
  new THREE.MeshStandardMaterial({map:asphaltTex,roughness:0.95,metalness:0.02}));
ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);
{ // center emblem ring
  const ring=new THREE.Mesh(new THREE.RingGeometry(4.4,5,48),
    new THREE.MeshBasicMaterial({color:0x7dff5e,transparent:true,opacity:0.3,side:THREE.DoubleSide}));
  ring.rotation.x=-Math.PI/2; ring.position.y=0.02; scene.add(ring);
}

// ============ MAP PROPS ============
const colliders=[]; // {x,z,r}
const concMat=new THREE.MeshStandardMaterial({map:concreteTex,roughness:0.92});
const concDark=new THREE.MeshStandardMaterial({map:concreteTex,color:0x8a8d90,roughness:0.95});
const woodMat=new THREE.MeshStandardMaterial({map:woodTex,roughness:0.8});
const roofMat=new THREE.MeshStandardMaterial({color:0x2b2e33,roughness:0.9});
function addBox(x,z,w,h,d,mat,ry=0,collide=true){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
  m.position.set(x,h/2,z); m.rotation.y=ry; m.castShadow=m.receiveShadow=true; scene.add(m);
  if(collide) colliders.push({x,z,r:Math.max(w,d)/2});
  return m;
}
// perimeter walls (concrete, 4m)
for(let i=-3;i<=3;i++){ addBox(i*11,-34,10,4,1.2,concMat); addBox(i*11,34,10,4,1.2,concMat); addBox(-34,i*11,1.2,4,10,concMat); addBox(34,i*11,1.2,4,10,concMat); }
// warehouses with roofs + glowing windows
function warehouse(x,z,w,h,d){
  addBox(x,z,w,h,d,concMat);
  const roof=new THREE.Mesh(new THREE.BoxGeometry(w+0.8,0.3,d+0.8),roofMat);
  roof.position.set(x,h+0.15,z); roof.castShadow=true; scene.add(roof);
  const winMat=new THREE.MeshBasicMaterial({color:0xffd27d});
  for(let i=-1;i<=1;i++){ const win=new THREE.Mesh(new THREE.PlaneGeometry(1.4,0.9),winMat);
    win.position.set(x+i*(w/4),h*0.62,z+d/2+0.02); scene.add(win); }
}
warehouse(-24,-12,16,5.5,9);
warehouse(24,-8,15,5,8);
// HQ block north
addBox(0,-26,14,7,6,concDark);
// shipping containers (tinted metal)
const contColors=[0xb7472a,0x2a6db7,0x3a8a4a,0xc77b1e,0x5a6b7a];
function container(x,z,ry,color,stack=false){
  const mat=new THREE.MeshStandardMaterial({map:metalTex,color,roughness:0.55,metalness:0.45});
  const m=new THREE.Mesh(new THREE.BoxGeometry(6,2.6,2.4),mat);
  m.position.set(x,(stack?2.6:0)+1.3,z); m.rotation.y=ry; m.castShadow=m.receiveShadow=true; scene.add(m);
  colliders.push({x,z,r:3.1});
}
container(6,4,0,contColors[1]); container(6,4,0,contColors[2],true);
container(-10,2,Math.PI/2,contColors[3]);
container(0,-8,Math.PI/2,contColors[0]);
container(-24,12,0,contColors[4]);
container(22,18,Math.PI/2,contColors[0]);
// wooden crates
function addCrate(x,z,s=1.6,ry=0,stackY=0){
  const m=new THREE.Mesh(new THREE.BoxGeometry(s,s,s),woodMat);
  m.position.set(x,s/2+stackY,z); m.rotation.y=ry; m.castShadow=m.receiveShadow=true; scene.add(m);
  const e=new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({color:0x2e2318})); m.add(e);
  if(stackY===0) colliders.push({x,z,r:s*0.75});
}
addCrate(-6,-4,2); addCrate(-4.2,-4,1.3,0.4); addCrate(-6,-4,1.2,0.2,2);
addCrate(6,-2,2,0.2); addCrate(7.8,-2,1.2,-0.2);
addCrate(-12,0,1.8); addCrate(12,10,1.8,0.5); addCrate(0,14,2.2); addCrate(12,10,1.1,0.3,1.8);
addCrate(-18,-2,1.6,0.5); addCrate(14,-14,1.6);
// concrete barriers
const barMat=new THREE.MeshStandardMaterial({map:concreteTex,color:0xbbbbbb,roughness:0.9});
[[-3,-30],[0,-30],[3,-30],[-12,8],[-12,10.2],[14,-2],[14,0.2]].forEach(([x,z])=>addBox(x,z,2,0.9,0.55,barMat,0));
// watchtower landmark (SW courtyard)
{
  const legMat=new THREE.MeshStandardMaterial({map:woodTex,roughness:0.85});
  const bx=-14,bz=18;
  [[-1.2,-1.2],[1.2,-1.2],[-1.2,1.2],[1.2,1.2]].forEach(([ox,oz])=>{
    const l=new THREE.Mesh(new THREE.BoxGeometry(0.3,6,0.3),legMat);
    l.position.set(bx+ox,3,bz+oz); l.castShadow=true; scene.add(l);
  });
  colliders.push({x:bx,z:bz,r:1.8});
  const cab=new THREE.Mesh(new THREE.BoxGeometry(3.4,1.8,3.4),legMat);
  cab.position.set(bx,6.8,bz); cab.castShadow=true; scene.add(cab);
  const rf=new THREE.Mesh(new THREE.BoxGeometry(4,0.25,4),roofMat);
  rf.position.set(bx,7.9,bz); scene.add(rf);
}
// barrels
function addBarrel(x,z,color){
  const b=new THREE.Mesh(new THREE.CylinderGeometry(0.55,0.55,1.4,14),
    new THREE.MeshStandardMaterial({map:metalTex,color,roughness:0.55,metalness:0.4}));
  b.position.set(x,0.7,z); b.castShadow=b.receiveShadow=true; scene.add(b); colliders.push({x,z,r:0.7});
}
addBarrel(-5,6,0xb03a2e); addBarrel(-4,6.4,0x2e5db0); addBarrel(10,-4,0xb03a2e); addBarrel(5,10,0x2e5db0);
// light poles (2 real lights, rest emissive)
for(const [x,z] of [[-20,-20],[20,-20],[-20,20],[20,20],[0,12]]){
  const p=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.16,7,8), new THREE.MeshStandardMaterial({color:0x222a30,roughness:0.6,metalness:0.5}));
  p.position.set(x,3.5,z); p.castShadow=true; scene.add(p);
  const bulb=new THREE.Mesh(new THREE.SphereGeometry(0.22,10,10), new THREE.MeshBasicMaterial({color:0xffe2b0}));
  bulb.position.set(x,6.8,z); scene.add(bulb);
}
for(const [x,z] of [[-20,-20],[20,20]]){
  const l=new THREE.PointLight(0xffd9a0,30,30,1.8); l.position.set(x,6.6,z); scene.add(l);
}

// ============ GUN VIEWMODEL (scaled + lit) ============
const gun=new THREE.Group();
let magMesh;
{
  const metal=new THREE.MeshStandardMaterial({color:0x3d454e,roughness:0.35,metalness:0.7});
  const poly=new THREE.MeshStandardMaterial({color:0x39443a,roughness:0.75,metalness:0.1});
  const acc=new THREE.MeshStandardMaterial({color:0x7dff5e,roughness:0.4,emissive:0x1d4d18});
  const add=(geo,mat,x,y,z)=>{ const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); gun.add(m); return m; };
  add(new THREE.BoxGeometry(0.09,0.13,0.55),metal,0,0,0);
  const barrel=add(new THREE.CylinderGeometry(0.022,0.022,0.34,10),metal,0,0.03,-0.42); barrel.rotation.x=Math.PI/2;
  add(new THREE.BoxGeometry(0.08,0.07,0.2),poly,0,-0.03,-0.35);
  magMesh=add(new THREE.BoxGeometry(0.07,0.16,0.1),poly,0,-0.12,-0.05); magMesh.rotation.x=0.25;
  add(new THREE.BoxGeometry(0.08,0.11,0.24),poly,0,-0.02,0.36);
  add(new THREE.BoxGeometry(0.012,0.045,0.012),metal,0,0.09,-0.05);
  add(new THREE.BoxGeometry(0.05,0.02,0.1),metal,0,0.075,0.1);
  add(new THREE.BoxGeometry(0.092,0.015,0.3),acc,0,-0.045,-0.1);
  const ring=add(new THREE.TorusGeometry(0.035,0.008,8,16),acc,0,0.03,-0.58);
  gun.scale.setScalar(0.62);
}
const HIP_POS=new THREE.Vector3(0.24,-0.21,-0.55), ADS_POS=new THREE.Vector3(0,-0.168,-0.38);
gun.position.copy(HIP_POS);
camera.add(gun);
// NOTE: do NOT scene.add(camera) — it would reparent the camera out of
// pitchObj and freeze the view. It stays under scene→yawObj→pitchObj.
const muzzle=new THREE.PointLight(0xffc266,0,10,1.7); muzzle.position.set(0.24,-0.17,-0.95); camera.add(muzzle);
const flash=new THREE.Mesh(new THREE.PlaneGeometry(0.34,0.34),
  new THREE.MeshBasicMaterial({color:0xffd27d,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));
flash.position.set(0.24,-0.17,-0.95); camera.add(flash);
let gunKick=0, bobT=0, adsK=0, adsHeld=false, recoilP=0;

// ============ ENEMIES ============
const enemies=[], enemyMeshes=[];
const bodyMat=new THREE.MeshStandardMaterial({color:0x4a5258,roughness:0.65,metalness:0.2});
const vestMat=new THREE.MeshStandardMaterial({color:0x5a5240,roughness:0.85});
const skinMat=new THREE.MeshStandardMaterial({color:0xc9a184,roughness:0.7});
const camWorld=new THREE.Vector3();
function makeEnemy(hp){
  const g=new THREE.Group();
  const torso=new THREE.Mesh(new THREE.BoxGeometry(0.62,0.75,0.36),bodyMat); torso.position.y=1.25; torso.castShadow=true; g.add(torso);
  const vest=new THREE.Mesh(new THREE.BoxGeometry(0.66,0.4,0.4),vestMat); vest.position.y=1.3; g.add(vest);
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.21,14,12),skinMat); head.position.y=1.85; head.castShadow=true; g.add(head);
  const helm=new THREE.Mesh(new THREE.SphereGeometry(0.235,14,10,0,Math.PI*2,0,1.5),bodyMat); helm.position.y=1.88; g.add(helm);
  const visor=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.07,0.05), new THREE.MeshBasicMaterial({color:0xff2222})); visor.position.set(0,1.85,0.19); g.add(visor);
  const gunM=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.1,0.7),new THREE.MeshStandardMaterial({color:0x14181c})); gunM.position.set(0.3,1.3,0.3); g.add(gunM);
  const legL=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.85,0.22),bodyMat); legL.position.set(-0.16,0.43,0); legL.castShadow=true; g.add(legL);
  const legR=legL.clone(); legR.position.x=0.16; g.add(legR);
  const armL=new THREE.Mesh(new THREE.BoxGeometry(0.15,0.6,0.15),bodyMat); armL.position.set(-0.4,1.3,0.2); armL.rotation.x=-1.1; g.add(armL);
  const armR=armL.clone(); armR.position.x=0.4; g.add(armR);
  const barBg=new THREE.Mesh(new THREE.PlaneGeometry(0.7,0.08), new THREE.MeshBasicMaterial({color:0x111111,transparent:true,opacity:0.8,depthWrite:false}));
  const barFg=new THREE.Mesh(new THREE.PlaneGeometry(0.7,0.08), new THREE.MeshBasicMaterial({color:0x51ff51,depthWrite:false}));
  barBg.position.y=2.25; barFg.position.set(0,2.25,0.001); g.add(barBg,barFg);
  g.userData={legL,legR,barFg,barBg,walkT:Math.random()*9};
  g.scale.setScalar(1.12);
  return g;
}
function spawnEnemy(waveN){
  const hp=60+waveN*22;
  const g=makeEnemy(hp);
  const a=Math.random()*Math.PI*2, r=13+Math.random()*7;
  g.position.set(Math.cos(a)*r,0,Math.sin(a)*r);
  slideMove(g.position,0,0,0.5); // nudge out of any obstacle
  scene.add(g);
  const e={group:g,alive:true,hp,maxHp:hp,speed:2.1+Math.min(2.2,waveN*0.18)+Math.random()*0.8,atkCd:0,name:'HOSTILE-'+(100+enemies.length|0),dmg:8+waveN*1.5};
  enemies.push(e); enemyMeshes.push(...g.children);
  return e;
}

// ============ FX: tracers + sparks + decals + shells ============
const tracers=[];
function tracer(from,to,color=0xffe9a8){
  const geo=new THREE.BufferGeometry().setFromPoints([from,to]);
  const line=new THREE.Line(geo,new THREE.LineBasicMaterial({color,transparent:true,opacity:0.95}));
  scene.add(line); tracers.push({line,life:0.07});
}
const MAXS=300; const sparkGeo=new THREE.BufferGeometry();
const sPos=new Float32Array(MAXS*3); const sVel=[];
for(let i=0;i<MAXS;i++){ sPos[i*3+1]=-99; sVel.push(new THREE.Vector3()); }
sparkGeo.setAttribute('position',new THREE.BufferAttribute(sPos,3));
const sparks=new THREE.Points(sparkGeo,new THREE.PointsMaterial({color:0xffcf7d,size:0.09,transparent:true,opacity:0.95}));
sparks.frustumCulled=false; scene.add(sparks); let sIdx=0;
function burst(p,n=10,spd=6){ for(let i=0;i<n;i++){ const v=sVel[sIdx]; v.set((Math.random()-0.5)*spd,Math.random()*spd*0.7,(Math.random()-0.5)*spd); sPos[sIdx*3]=p.x; sPos[sIdx*3+1]=p.y; sPos[sIdx*3+2]=p.z; sIdx=(sIdx+1)%MAXS; } }
// impact decals (pooled)
const decals=[];
{
  const dGeo=new THREE.CircleGeometry(0.045,10);
  for(let i=0;i<40;i++){ const d=new THREE.Mesh(dGeo,new THREE.MeshBasicMaterial({color:0x141414,transparent:true,opacity:0.85,depthWrite:false}));
    d.visible=false; scene.add(d); decals.push(d); }
}
let decalIdx=0;
const _n=new THREE.Vector3();
function addDecal(point,faceNormal,obj){
  const d=decals[decalIdx++%decals.length];
  _n.copy(faceNormal).transformDirection(obj.matrixWorld);
  d.position.copy(point).addScaledVector(_n,0.006);
  d.lookAt(point.clone().add(_n));
  const s=0.7+Math.random()*0.8; d.scale.set(s,s,1); d.visible=true;
}
// ejected shells (pooled)
const shells=[];
{
  const shGeo=new THREE.BoxGeometry(0.014,0.014,0.028);
  const shMat=new THREE.MeshBasicMaterial({color:0xd8a830});
  for(let i=0;i<10;i++){ const m=new THREE.Mesh(shGeo,shMat); m.visible=false; scene.add(m);
    shells.push({m,v:new THREE.Vector3(),t:0}); }
}
function ejectShell(){
  const s=shells.find(x=>x.t<=0); if(!s) return;
  camera.getWorldPosition(s.m.position);
  s.m.position.y-=0.1;
  s.v.set(1+Math.random(),1.6+Math.random(),0.4).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
  s.t=0.7; s.m.visible=true;
}

// ============ PLAYER STATE ============
const player={ pos:yawObj.position, yaw:0, pitch:0, hp:100, maxHp:100, ammo:30, reserve:90, magSize:30, reloading:false, lastHurt:-9, dead:false, sprinting:false };
function resetPlayer(){ player.hp=100; player.ammo=30; player.reserve=90; player.reloading=false; player.dead=false; yawObj.position.set(0,1.7,8); player.yaw=0; player.pitch=0; recoilP=0; }
const keys={};
addEventListener('keydown',e=>{ keys[e.code]=true; if(e.code==='KeyR')reload(); });
addEventListener('keyup',e=>keys[e.code]=false);
let mouseDown=false, lastShot=0;
addEventListener('mousedown',e=>{ if(Game.state!=='playing')return; if(e.button===0)mouseDown=true; if(e.button===2)adsHeld=true; });
addEventListener('mouseup',e=>{ if(e.button===0)mouseDown=false; if(e.button===2)adsHeld=false; });
addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('mousemove',e=>{ if(Game.state!=='playing'||!Game.locked)return;
  const sens=0.0021*(1-0.45*adsK);
  player.yaw-=e.movementX*sens; player.pitch-=e.movementY*sens; player.pitch=Math.max(-1.45,Math.min(1.45,player.pitch)); });

// ============ GAME FLOW ============
const Game={ state:'menu', wave:1, score:0, kills:0, locked:false };
const WaveMgr={ alive:0,
  start(n){ Game.wave=n; HUD.stats(Game); HUD.banner('WAVE '+n); AudioSys.wave();
    const count=3+n*2; this.alive=count;
    for(let i=0;i<count;i++)setTimeout(()=>{ if(Game.state==='playing')spawnEnemy(n); }, i*900); },
  onKill(){ if(--this.alive<=0&&Game.state==='playing')setTimeout(()=>this.start(Game.wave+1),2600); } };
HUD.init(); HUD.stats(Game); HUD.health(100,100); HUD.ammo(30,90);
document.getElementById('playBtn').onclick=()=>GameSys.play();
document.getElementById('resumeBtn').onclick=()=>GameSys.play();
document.getElementById('restartBtn').onclick=()=>GameSys.restart();
const GameSys={
  play(){ AudioSys.init(); AudioSys.ctx&&AudioSys.ctx.resume(); AudioSys.ui();
    canvas.requestPointerLock(); Game.state='playing'; HUD.show('hud'); },
  pause(){ if(Game.state!=='playing')return; Game.state='paused'; mouseDown=false; adsHeld=false; HUD.show('hud','pause'); },
  gameOver(){ Game.state='gameover'; document.exitPointerLock&&document.exitPointerLock();
    document.getElementById('finalStats').textContent=`WAVE ${Game.wave} · SCORE ${Game.score} · KILLS ${Game.kills}`;
    HUD.show('gameover'); },
  restart(){ for(const e of enemies){ scene.remove(e.group); } enemies.length=0; enemyMeshes.length=0;
    Game.score=0; Game.kills=0; resetPlayer(); HUD.stats(Game); HUD.health(100,100); HUD.ammo(30,90); WaveMgr.start(1); this.play(); }
};
document.addEventListener('pointerlockchange',()=>{ Game.locked=document.pointerLockElement===canvas;
  if(!Game.locked&&Game.state==='playing')GameSys.pause(); });

// ============ SHOOT / RELOAD ============
const ray=new THREE.Raycaster();
const camDir=new THREE.Vector3();
const crossEl=document.getElementById('crosshair');
function muzzleWorld(){ return camera.localToWorld(new THREE.Vector3(0.22,-0.17,-0.95)); }
function shoot(){
  if(player.reloading||Game.state!=='playing')return;
  const t=performance.now()/1000; if(t-lastShot<0.115)return; lastShot=t;
  if(player.ammo<=0){ AudioSys.dryFire(); reload(); return; }
  player.ammo--; HUD.ammo(player.ammo,player.reserve); HUD.addSpread(5.5);
  AudioSys.shoot(); gunKick=Math.min(gunKick+0.05,0.1); recoilP+=0.011*(1-0.35*adsK);
  muzzle.intensity=26; flash.material.opacity=1; flash.rotation.z=Math.random()*3;
  flash.position.x=ADS_POS.x+(HIP_POS.x-ADS_POS.x)*(1-adsK);
  ejectShell();
  camera.getWorldDirection(camDir);
  const sp=THREE.MathUtils.lerp(0.02,0.0035,adsK)+(player.sprinting?0.012:0);
  camDir.x+=(Math.random()-0.5)*sp; camDir.y+=(Math.random()-0.5)*sp; camDir.normalize();
  ray.set(camera.getWorldPosition(new THREE.Vector3()),camDir); ray.far=120;
  const targets=[]; for(const e of enemies){ if(e.alive)targets.push(e.group); }
  const hits=ray.intersectObjects(targets.length?targets:[ground],true);
  const wallHits=ray.intersectObjects(scene.children.filter(o=>o.isMesh&&!o.isSprite&&o!==ground&&o!==flash&&!targets.includes(findRoot(o))),false);
  const from=muzzleWorld();
  const first=wallHits.length&&( !hits.length||wallHits[0].distance<hits[0].distance)?wallHits[0]:hits[0];
  if(first&&first.object){
    const isEnemy=targets.length&&targets.includes(findRoot(first.object));
    tracer(from,first.point);
    if(isEnemy){
      burst(first.point,10,7);
      const e=enemies.find(x=>x.group===findRoot(first.object));
      if(e){ const dmg=34+Math.random()*12; e.hp-=dmg; AudioSys.hit(); HUD.hitmarker(false);
        e.group.userData.barFg.scale.x=Math.max(0.001,e.hp/e.maxHp);
        e.group.position.addScaledVector(camDir,0.15);
        if(e.hp<=0)killEnemy(e); }
    } else {
      burst(first.point,7,5);
      if(first.face) addDecal(first.point,first.face.normal,first.object);
    }
  } else {
    const far=camera.getWorldPosition(new THREE.Vector3()).addScaledVector(camDir,60); far.y=Math.max(0.1,far.y); tracer(from,far);
  }
  if(player.ammo===0)reload();
}
function findRoot(o){ while(o.parent&&o.parent!==scene)o=o.parent; return o; }
function killEnemy(e){ e.alive=false; Game.kills++; Game.score+=100+Game.wave*10; HUD.stats(Game); HUD.hitmarker(true); HUD.feed('☠ '+e.name+'  +'+(100+Game.wave*10)); AudioSys.kill();
  camera.getWorldPosition(camWorld);
  burst(e.group.position.clone().add(new THREE.Vector3(0,1.4,0)),22,7);
  e.deadT=0; WaveMgr.onKill(); }
function reload(){ if(player.reloading||player.reserve<=0||player.ammo===player.magSize||Game.state!=='playing')return;
  player.reloading=true; HUD.reloading(true); AudioSys.reload();
  setTimeout(()=>{ const need=player.magSize-player.ammo, take=Math.min(need,player.reserve);
    player.ammo+=take; player.reserve-=take; player.reloading=false; HUD.ammo(player.ammo,player.reserve); HUD.reloading(false); },1400); }

// ============ ENEMY UPDATE / COLLISION ============
// Axis-separated circle collision: move X, resolve on X, then Z —
// this makes characters SLIDE around obstacles instead of sticking.
function slideMove(p, dx, dz, r=0.55){
  p.x+=dx;
  for(const c of colliders){
    const rr=c.r+r+0.01, ddx=p.x-c.x, ddz=p.z-c.z;
    if(Math.abs(ddx)<rr&&Math.abs(ddz)<rr) p.x=c.x+(ddx>=0?rr:-rr);
  }
  p.z+=dz;
  for(const c of colliders){
    const rr=c.r+r+0.01, ddx=p.x-c.x, ddz=p.z-c.z;
    if(Math.abs(ddx)<rr&&Math.abs(ddz)<rr) p.z=c.z+(ddz>=0?rr:-rr);
  }
  const R=32, d=Math.hypot(p.x,p.z);
  if(d>R){ p.x*=R/d; p.z*=R/d; }
}
let stepT=0, vy=0, grounded=true;
function updatePlayer(dt){
  player.sprinting=(keys['ShiftLeft']||keys['ShiftRight'])&&keys['KeyW']&&!adsHeld;
  const sp=player.sprinting?6.8:(adsHeld?3.1:4.6);
  const f=(keys['KeyW']?1:0)-(keys['KeyS']?1:0), s=(keys['KeyD']?1:0)-(keys['KeyA']?1:0);
  const sin=Math.sin(player.yaw),cos=Math.cos(player.yaw);
  let mx=(-sin*f+cos*s), mz=(-cos*f-sin*s);
  const ml=Math.hypot(mx,mz)||1; mx/=ml; mz/=ml; const moving=(f||s);
  const amt=moving?sp*dt:0;
  slideMove(yawObj.position, mx*amt, mz*amt, 0.55);
  if(grounded&&keys['Space']){ vy=4.6; grounded=false; AudioSys.jump(); }
  vy-=12*dt; yawObj.position.y+=vy*dt;
  if(yawObj.position.y<=1.7){ yawObj.position.y=1.7; vy=0; grounded=true; }
  // ADS blend
  adsK+=(((adsHeld&&!player.sprinting)?1:0)-adsK)*(1-Math.exp(-13*dt));
  yawObj.rotation.y=player.yaw;
  recoilP+=(0-recoilP)*(1-Math.exp(-9*dt)); // spring back like CoD
  pitchObj.rotation.x=player.pitch+recoilP;
  if(moving&&grounded){ bobT+=dt*(player.sprinting?11:8); stepT+=dt*sp; if(stepT>2.4){ stepT=0; AudioSys.step(); } }
  const bobY=Math.sin(bobT)*0.02, bobX=Math.cos(bobT*0.5)*0.011;
  gun.position.lerpVectors(HIP_POS,ADS_POS,adsK);
  gun.position.x+=bobX*(1-adsK*0.85)+(s*-0.006);
  gun.position.y+=bobY*(1-adsK*0.85)-gunKick*0.5;
  gun.rotation.x=gunKick*1.6+(player.sprinting?0.5:0)*(1-adsK);
  gun.rotation.z=(s*-0.03);
  gunKick*=Math.pow(0.0001,dt); if(gunKick<0.001)gunKick=0;
  camera.rotation.z=s*-0.012;
  const targetFov=THREE.MathUtils.lerp(player.sprinting?82:75,55,adsK);
  camera.fov+=(targetFov-camera.fov)*(1-Math.exp(-12*dt)); camera.updateProjectionMatrix();
  crossEl.style.opacity=(1-adsK).toFixed(2);
  if(performance.now()/1000-player.lastHurt>4&&player.hp<player.maxHp&&!player.dead){ player.hp=Math.min(player.maxHp,player.hp+12*dt); HUD.health(player.hp,player.maxHp); }
  if(mouseDown)shoot();
}
function updateEnemies(dt){
  const pp=yawObj.position;
  camera.getWorldPosition(camWorld);
  for(const e of enemies){
    const g=e.group;
    if(!e.alive){ e.deadT=(e.deadT||0)+dt; g.rotation.x=Math.min(Math.PI/2,e.deadT*4); g.position.y=-e.deadT*0.4;
      if(e.deadT>1.4&&!e.removed){ e.removed=true; scene.remove(g);} continue; }
    const d=g.position.clone().sub(pp); d.y=0; const dist=d.length(); d.normalize();
    g.rotation.y=Math.atan2(d.x,d.z)+Math.PI;
    g.userData.walkT+=dt*8; const w=Math.sin(g.userData.walkT)*0.35;
    g.userData.legL.rotation.x=w; g.userData.legR.rotation.x=-w;
    g.position.y=Math.abs(Math.sin(g.userData.walkT))*0.05;
    g.userData.barBg.lookAt(camWorld); g.userData.barFg.lookAt(camWorld);
    e.atkCd-=dt;
    if(dist>1.9){ slideMove(g.position, -d.x*e.speed*dt, -d.z*e.speed*dt, 0.45); }
    else if(e.atkCd<=0&&Game.state==='playing'&&!player.dead){ e.atkCd=0.9;
      player.hp-=e.dmg; player.lastHurt=performance.now()/1000; HUD.health(player.hp,player.maxHp); HUD.damage(0.85); AudioSys.hurt();
      g.position.addScaledVector(d,-0.4); slideMove(g.position,0,0,0.45);
      if(player.hp<=0){ player.hp=0; player.dead=true; GameSys.gameOver(); } }
  }
  // separation: keep enemies from stacking into a conga line
  for(let i=0;i<enemies.length;i++){ const a=enemies[i]; if(!a.alive) continue;
    for(let j=i+1;j<enemies.length;j++){ const b=enemies[j]; if(!b.alive) continue;
      const dx=b.group.position.x-a.group.position.x, dz=b.group.position.z-a.group.position.z;
      const d2=dx*dx+dz*dz;
      if(d2<1.0&&d2>1e-6){ const d=Math.sqrt(d2), push=(1.0-d)*0.5/d;
        a.group.position.x-=dx*push; a.group.position.z-=dz*push;
        b.group.position.x+=dx*push; b.group.position.z+=dz*push; }
    }
  }
}

// ============ LOOP ============
const clock=new THREE.Clock();
let started=false;
function loop(){
  requestAnimationFrame(loop);
  const dt=Math.min(0.05,clock.getDelta());
  if(Game.state==='playing'){
    updatePlayer(dt); updateEnemies(dt);
    HUD.update(dt);
    drawMinimap({pos:yawObj.position,yaw:player.yaw},enemies);
  }
  muzzle.intensity*=0.7; flash.material.opacity*=0.6;
  for(let i=tracers.length-1;i>=0;i--){ const t=tracers[i]; t.life-=dt; t.line.material.opacity=Math.max(0,t.life/0.07); if(t.life<=0){ scene.remove(t.line); t.line.geometry.dispose(); t.line.material.dispose(); tracers.splice(i,1);} }
  for(const sh of shells){ if(sh.t<=0)continue; sh.t-=dt; sh.v.y-=9*dt;
    sh.m.position.addScaledVector(sh.v,dt); sh.m.rotation.x+=12*dt;
    if(sh.t<=0||sh.m.position.y<0.02) { sh.t=0; sh.m.visible=false; } }
  const pa=sparkGeo.attributes.position;
  for(let i=0;i<MAXS;i++){ if(sPos[i*3+1]<-10)continue; sVel[i].y-=9*dt; sPos[i*3]+=sVel[i].x*dt; sPos[i*3+1]+=sVel[i].y*dt; sPos[i*3+2]+=sVel[i].z*dt; if(sPos[i*3+1]<0.02){sPos[i*3+1]=-99;} }
  pa.needsUpdate=true;
  renderer.render(scene,camera);
  if(!started){ started=true; window.__ready=true; }
}
loop();
const _play=document.getElementById('playBtn');
_play.addEventListener('click',()=>{ setTimeout(()=>{ if(Game.wave===1&&enemies.length===0)WaveMgr.start(1); },300); },{once:false});
window.__game={Game,WaveMgr,player,spawnEnemy,GameSys,scene,renderer,camera,yawObj,enemies};
