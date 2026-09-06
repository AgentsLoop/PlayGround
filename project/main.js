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
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd9a06b);
scene.fog = new THREE.Fog(0xd9a06b, 40, 210);

const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.05, 500);
const yawObj = new THREE.Object3D(); yawObj.position.set(0,1.7,8);
const pitchObj = new THREE.Object3D(); pitchObj.add(camera); yawObj.add(pitchObj); scene.add(yawObj);
// warm fill so the viewmodel never goes pitch black (kept dim for contrast)
const gunFill = new THREE.PointLight(0xffd9b0, 4.5, 4, 1.8);
gunFill.position.set(0.2, 0.1, -0.4); camera.add(gunFill);
// cool rim from the east so shadow sides keep detail
const rimFill = new THREE.DirectionalLight(0x7a90c0, 0.5);
rimFill.position.set(40, 24, -30); scene.add(rimFill);
// permanent cinematic vignette + grain overlay (procedural, no post chain)
{
  const grade=document.createElement('div');
  grade.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:5;background:radial-gradient(ellipse at center,transparent 52%,rgba(5,8,14,0.42) 100%);';
  document.body.appendChild(grade);
}

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
  g.fillStyle='#33353b'; g.fillRect(0,0,s,s);
  // large-scale tonal blotches (macro variation, kills tiling)
  for(let i=0;i<26;i++){ const r=30+Math.random()*90;
    const gr=g.createRadialGradient(Math.random()*s,Math.random()*s,4,Math.random()*s,Math.random()*s,r);
    const dark=Math.random()>0.5;
    gr.addColorStop(0,dark?'rgba(12,13,16,0.22)':'rgba(120,125,135,0.12)'); gr.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=gr; g.fillRect(0,0,s,s); }
  grain(g,s,9000,20,70,3);
  g.strokeStyle='rgba(0,0,0,0.35)'; g.lineWidth=1.5;
  for(let i=0;i<9;i++){ g.beginPath(); let x=Math.random()*s,y=Math.random()*s; g.moveTo(x,y);
    for(let k=0;k<5;k++){ x+=(Math.random()-0.5)*70; y+=(Math.random()-0.5)*70; g.lineTo(x,y);} g.stroke(); }
  // worn tire lanes instead of a solid yellow bar
  g.fillStyle='rgba(15,15,18,0.20)'; g.fillRect(0,s*0.30,s,s*0.10); g.fillRect(0,s*0.62,s,s*0.10);
  g.fillStyle='rgba(200,190,170,0.10)';
  for(let i=0;i<60;i++) g.fillRect(Math.random()*s,Math.random()*s,2+Math.random()*14,1+Math.random()*3);
},12,12);
const concreteTex = makeTex(256,(g,s)=>{
  g.fillStyle='#9d9c95'; g.fillRect(0,0,s,s);
  for(let i=0;i<12;i++){ const r=20+Math.random()*60;
    const gr=g.createRadialGradient(Math.random()*s,Math.random()*s,2,Math.random()*s,Math.random()*s,r);
    gr.addColorStop(0,'rgba(60,58,52,0.14)'); gr.addColorStop(1,'rgba(0,0,0,0)'); g.fillStyle=gr; g.fillRect(0,0,s,s); }
  grain(g,s,3800,120,195,3);
  // formwork seams + weathering streaks
  g.strokeStyle='rgba(0,0,0,0.22)'; g.lineWidth=2;
  g.beginPath(); g.moveTo(0,s*0.5); g.lineTo(s,s*0.5); g.stroke();
  g.fillStyle='rgba(40,38,34,0.18)'; g.fillRect(0,s-30,s,30);
  g.fillStyle='rgba(255,255,255,0.06)'; g.fillRect(0,0,s,10);
  g.fillStyle='rgba(60,55,45,0.5)';
  for(let i=0;i<8;i++){ const x=Math.random()*s; g.fillRect(x,Math.random()*s*0.4,2,20+Math.random()*50); }
},1,1);
const camoTex = makeTex(256,(g,s)=>{
  g.fillStyle='#5b5f46'; g.fillRect(0,0,s,s);
  const cols=['#4a4e38','#6b6f52','#3a3d2e','#7a7a68','#2f3327'];
  for(let i=0;i<90;i++){ g.fillStyle=cols[(Math.random()*cols.length)|0];
    g.beginPath(); g.ellipse(Math.random()*s,Math.random()*s,6+Math.random()*22,4+Math.random()*12,Math.random()*3,0,7); g.fill(); }
  grain(g,s,1500,40,110,2);
},1,1);
const woodTex = makeTex(256,(g,s)=>{
  g.fillStyle='#7d562e'; g.fillRect(0,0,s,s);
  for(let y=0;y<s;y+=16){ g.fillStyle=`rgba(50,28,8,${0.18+Math.random()*0.22})`; g.fillRect(0,y,s,2);
    g.fillStyle='rgba(255,220,150,0.06)'; g.fillRect(0,y+2,s,14); }
  // long grain streaks
  g.strokeStyle='rgba(45,25,8,0.35)'; g.lineWidth=1;
  for(let i=0;i<40;i++){ g.beginPath(); const y=Math.random()*s; g.moveTo(0,y);
    g.bezierCurveTo(s*0.3,y+6*(Math.random()-0.5),s*0.6,y+6*(Math.random()-0.5),s,y); g.stroke(); }
  grain(g,s,1200,70,140,4);
  g.strokeStyle='#3d2610'; g.lineWidth=10; g.strokeRect(5,5,s-10,s-10);
},1,1);
const metalTex = makeTex(256,(g,s)=>{
  g.fillStyle='#b9b9b9'; g.fillRect(0,0,s,s);
  for(let x=0;x<s;x+=32){ g.fillStyle='rgba(0,0,0,0.32)'; g.fillRect(x,0,7,s);
    g.fillStyle='rgba(255,255,255,0.22)'; g.fillRect(x+7,0,3,s);
    g.fillStyle='rgba(0,0,0,0.12)'; g.fillRect(x+10,0,2,s); }
  grain(g,s,1800,140,220,2);
  // vertical rain-rust streaks from top edge
  for(let i=0;i<26;i++){ const x=Math.random()*s; const h=20+Math.random()*70;
    const gr=g.createLinearGradient(0,0,0,h); gr.addColorStop(0,'rgba(110,55,18,0.45)'); gr.addColorStop(1,'rgba(110,55,18,0)');
    g.fillStyle=gr; g.fillRect(x,0,3+Math.random()*5,h); }
  g.fillStyle='rgba(70,35,12,0.5)';
  for(let i=0;i<14;i++) g.fillRect(Math.random()*s,s-40+Math.random()*40,4+Math.random()*8,2+Math.random()*4);
},2,1);

// ============ LIGHTS + SKY (late-afternoon cinematic) ============
scene.add(new THREE.HemisphereLight(0xffd9b8, 0x4a5260, 0.75));
const sun = new THREE.DirectionalLight(0xffc07a, 2.2);
sun.position.set(-38, 30, 24); sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-60; sun.shadow.camera.right=60; sun.shadow.camera.top=60; sun.shadow.camera.bottom=-60;
sun.shadow.camera.near=5; sun.shadow.camera.far=150;
sun.shadow.bias=-0.0004; sun.shadow.normalBias=0.02;
scene.add(sun);
{ // gradient sky dome with sun disc + warm band + procedural clouds
  const skyMat = new THREE.ShaderMaterial({ side:THREE.BackSide, depthWrite:false, fog:false,
    uniforms:{ top:{value:new THREE.Color(0x27436e)}, mid:{value:new THREE.Color(0xd98a5a)}, bot:{value:new THREE.Color(0xf2c184)},
      sunDir:{value:new THREE.Vector3(-0.68,0.34,0.42).normalize()} },
    vertexShader:'varying vec3 vP; varying vec3 vW; void main(){ vP=position; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
    fragmentShader:`varying vec3 vP; varying vec3 vW; uniform vec3 top,mid,bot; uniform vec3 sunDir;
      float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float vnoise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
      void main(){ vec3 d=normalize(vW);
        float h=d.y;
        vec3 c = h>0.10 ? mix(mid,top,smoothstep(0.10,0.62,h)) : mix(bot,mid,smoothstep(-0.06,0.10,h));
        // warm horizon glow around sun azimuth
        float sunAmt=max(dot(d,sunDir),0.0);
        c += vec3(1.0,0.45,0.15)*pow(sunAmt,6.0)*0.55*(1.0-smoothstep(0.0,0.5,abs(h-0.08)));
        // sun disc + halo
        c += vec3(1.0,0.85,0.6)*smoothstep(0.9993,0.9997,sunAmt)*4.0;
        c += vec3(1.0,0.6,0.3)*pow(sunAmt,90.0)*0.9;
        // thin procedural clouds, pink-lit
        if(h>0.03){ vec2 uv=d.xz/(d.y+0.25)*1.4;
          float cl=vnoise(uv*2.2)*0.6+vnoise(uv*5.1)*0.3+vnoise(uv*11.0)*0.1;
          float band=smoothstep(0.55,0.78,cl)*smoothstep(0.03,0.2,h)*(1.0-smoothstep(0.35,0.7,h));
          c=mix(c,vec3(1.0,0.72,0.55),band*0.5);
          c+=vec3(1.0,0.5,0.3)*band*pow(sunAmt,3.0)*0.6; }
        // dither against banding
        c += (hash(d.xy*541.0)-0.5)*0.012;
        gl_FragColor=vec4(c,1.0); }`});
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(420,32,18), skyMat));
}
// distant hills ring — dusk silhouettes sunk into fog
{
  const m=new THREE.MeshBasicMaterial({color:0x4a3f52, fog:true});
  const m2=new THREE.MeshBasicMaterial({color:0x5c4a4a, fog:true});
  for(let i=0;i<16;i++){ const a=i/16*Math.PI*2+0.2; const h=new THREE.Mesh(new THREE.ConeGeometry(24+Math.random()*20,10+Math.random()*10,6),i%2?m:m2);
    h.position.set(Math.cos(a)*195,-2.5,Math.sin(a)*195); h.rotation.y=Math.random()*3; scene.add(h); }
}

// ============ GROUND ============
const ground = new THREE.Mesh(new THREE.PlaneGeometry(150,150),
  new THREE.MeshStandardMaterial({map:asphaltTex,roughness:0.94,metalness:0.03,bumpMap:asphaltTex,bumpScale:0.6}));
ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);
// fake contact-AO blob texture (grounds every prop without SSAO)
const aoTex=(()=>{ const c=document.createElement('canvas'); c.width=c.height=128; const g=c.getContext('2d');
  const gr=g.createRadialGradient(64,64,8,64,64,62); gr.addColorStop(0,'rgba(0,0,0,0.5)'); gr.addColorStop(0.7,'rgba(0,0,0,0.22)'); gr.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=gr; g.fillRect(0,0,128,128); const t=new THREE.CanvasTexture(c); return t; })();
function addAO(x,z,sx,sz,op=0.55){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(sx,sz),
    new THREE.MeshBasicMaterial({map:aoTex,transparent:true,opacity:op,depthWrite:false}));
  m.rotation.x=-Math.PI/2; m.position.set(x,0.015,z); m.renderOrder=1; m.userData.fx=true; scene.add(m);
}
{ // center emblem ring
  const ring=new THREE.Mesh(new THREE.RingGeometry(4.4,5,48),
    new THREE.MeshBasicMaterial({color:0xd8b25e,transparent:true,opacity:0.18,side:THREE.DoubleSide}));
  ring.rotation.x=-Math.PI/2; ring.position.y=0.02; ring.userData.fx=true; scene.add(ring);
}

// ============ MAP PROPS ============
const colliders=[]; // {x,z,r}
const concMat=new THREE.MeshStandardMaterial({map:concreteTex,roughness:0.9,bumpMap:concreteTex,bumpScale:0.4});
const concDark=new THREE.MeshStandardMaterial({map:concreteTex,color:0x84878c,roughness:0.93,bumpMap:concreteTex,bumpScale:0.4});
const woodMat=new THREE.MeshStandardMaterial({map:woodTex,roughness:0.75,bumpMap:woodTex,bumpScale:0.3});
const roofMat=new THREE.MeshStandardMaterial({color:0x23262b,roughness:0.85,metalness:0.15});
const trimMat=new THREE.MeshStandardMaterial({color:0x1e2126,roughness:0.8});
function addBox(x,z,w,h,d,mat,ry=0,collide=true){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
  m.position.set(x,h/2,z); m.rotation.y=ry; m.castShadow=m.receiveShadow=true; scene.add(m);
  if(collide) colliders.push({x,z,r:Math.max(w,d)/2});
  return m;
}
// perimeter walls (concrete, 4m)
for(let i=-3;i<=3;i++){ addBox(i*11,-34,10,4,1.2,concMat); addBox(i*11,34,10,4,1.2,concMat); addBox(-34,i*11,1.2,4,10,concMat); addBox(34,i*11,1.2,4,10,concMat); }
// warehouses with roofs + framed dim windows + base trim
function warehouse(x,z,w,h,d){
  addBox(x,z,w,h,d,concMat);
  const base=new THREE.Mesh(new THREE.BoxGeometry(w+0.15,0.5,d+0.15),trimMat);
  base.position.set(x,0.25,z); scene.add(base);
  const roof=new THREE.Mesh(new THREE.BoxGeometry(w+0.9,0.3,d+0.9),roofMat);
  roof.position.set(x,h+0.15,z); roof.castShadow=true; scene.add(roof);
  const edge=new THREE.Mesh(new THREE.BoxGeometry(w+0.9,0.12,d+0.9),trimMat);
  edge.position.set(x,h-0.05,z); scene.add(edge);
  const winMat=new THREE.MeshStandardMaterial({color:0x2a2f36,emissive:0xffb45e,emissiveIntensity:0.85,roughness:0.3,metalness:0.4});
  const frameMat=trimMat;
  for(let i=-1;i<=1;i++){ const fr=new THREE.Mesh(new THREE.BoxGeometry(1.6,1.1,0.08),frameMat);
    fr.position.set(x+i*(w/4),h*0.62,z+d/2+0.01); scene.add(fr);
    const win=new THREE.Mesh(new THREE.PlaneGeometry(1.35,0.85),winMat);
    win.position.set(x+i*(w/4),h*0.62,z+d/2+0.06); scene.add(win); }
  addAO(x,z,w+2,d+2,0.5);
}
warehouse(-24,-12,16,5.5,9);
warehouse(24,-8,15,5,8);
// HQ block north
addBox(0,-26,14,7,6,concDark);
// shipping containers (tinted metal + corner posts)
const contColors=[0x8f3a24,0x24507e,0x2f6b3a,0x9a6420,0x46525e];
function container(x,z,ry,color,stack=false){
  const mat=new THREE.MeshStandardMaterial({map:metalTex,color,roughness:0.5,metalness:0.55,bumpMap:metalTex,bumpScale:0.35});
  const m=new THREE.Mesh(new THREE.BoxGeometry(6,2.6,2.4),mat);
  m.position.set(x,(stack?2.6:0)+1.3,z); m.rotation.y=ry; m.castShadow=m.receiveShadow=true; scene.add(m);
  // corner castings
  const post=new THREE.MeshStandardMaterial({color:0x1c1e22,roughness:0.7,metalness:0.4});
  for(const sx of [-2.9,2.9]) for(const sz of [-1.1,1.1]){
    const p=new THREE.Mesh(new THREE.BoxGeometry(0.18,2.6,0.18),post);
    p.position.set(sx,(stack?2.6:0)+1.3,sz); m.add(p); }
  colliders.push({x,z,r:3.1});
  if(!stack) addAO(x,z,7,3.6,0.5);
}
container(6,4,0,contColors[1]); container(6,4,0,contColors[2],true);
container(-10,2,Math.PI/2,contColors[3]);
container(0,-8,Math.PI/2,contColors[0]);
container(-24,12,0,contColors[4]);
container(22,18,Math.PI/2,contColors[0]);
// wooden crates (no cartoon edges — bevel strip + AO instead)
function addCrate(x,z,s=1.6,ry=0,stackY=0){
  const m=new THREE.Mesh(new THREE.BoxGeometry(s,s,s),woodMat);
  m.position.set(x,s/2+stackY,z); m.rotation.y=ry; m.castShadow=m.receiveShadow=true; scene.add(m);
  const frame=new THREE.Mesh(new THREE.BoxGeometry(s+0.04,s*0.16,s+0.04),trimMat);
  frame.position.set(x,s/2+stackY,z); frame.rotation.y=ry; scene.add(frame);
  if(stackY===0){ colliders.push({x,z,r:s*0.75}); addAO(x,z,s+1.2,s+1.2,0.55); }
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
  const b=new THREE.Mesh(new THREE.CylinderGeometry(0.55,0.55,1.4,16),
    new THREE.MeshStandardMaterial({map:metalTex,color,roughness:0.5,metalness:0.5,bumpMap:metalTex,bumpScale:0.3}));
  b.position.set(x,0.7,z); b.castShadow=b.receiveShadow=true; scene.add(b); colliders.push({x,z,r:0.7});
  const rib=new THREE.Mesh(new THREE.TorusGeometry(0.555,0.03,8,20),trimMat);
  rib.rotation.x=Math.PI/2; rib.position.set(x,0.85,z); scene.add(rib);
  addAO(x,z,1.8,1.8,0.6);
}
addBarrel(-5,6,0xb03a2e); addBarrel(-4,6.4,0x2e5db0); addBarrel(10,-4,0xb03a2e); addBarrel(5,10,0x2e5db0);
// light poles (2 real lights, rest emissive cones)
for(const [x,z] of [[-20,-20],[20,-20],[-20,20],[20,20],[0,12]]){
  const p=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.18,7,8), new THREE.MeshStandardMaterial({color:0x1d2329,roughness:0.55,metalness:0.6}));
  p.position.set(x,3.5,z); p.castShadow=true; scene.add(p);
  const arm=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.12,1.1), p.material);
  arm.position.set(x,6.85,z-0.5); scene.add(arm);
  const bulb=new THREE.Mesh(new THREE.SphereGeometry(0.2,10,10), new THREE.MeshBasicMaterial({color:0xffd9a0}));
  bulb.position.set(x,6.72,z-0.95); scene.add(bulb);
  const cone=new THREE.Mesh(new THREE.ConeGeometry(1.9,2.6,16,1,true),
    new THREE.MeshBasicMaterial({color:0xffc98a,transparent:true,opacity:0.10,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
  cone.position.set(x,5.4,z-0.95); scene.add(cone);
  addAO(x,z,1.2,1.2,0.5);
}
for(const [x,z] of [[-20,-20],[20,20]]){
  const l=new THREE.PointLight(0xffd9a0,30,30,1.8); l.position.set(x,6.6,z); scene.add(l);
}

// ============ GUN VIEWMODEL (tactical rifle, no neon) ============
const gun=new THREE.Group();
let magMesh;
{
  const metal=new THREE.MeshStandardMaterial({color:0x3a4048,roughness:0.42,metalness:0.8});
  const poly=new THREE.MeshStandardMaterial({color:0x3a3d33,roughness:0.8,metalness:0.08});
  const grip=new THREE.MeshStandardMaterial({color:0x26281f,roughness:0.9});
  const trit=new THREE.MeshStandardMaterial({color:0x111111,emissive:0x39ff6a,emissiveIntensity:1.2});
  const add=(geo,mat,x,y,z)=>{ const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); gun.add(m); return m; };
  add(new THREE.BoxGeometry(0.075,0.10,0.52),metal,0,0.01,-0.02);            // receiver
  add(new THREE.BoxGeometry(0.06,0.045,0.30),metal,0,0.045,-0.30);           // top rail
  for(let i=0;i<7;i++) add(new THREE.BoxGeometry(0.062,0.012,0.02),grip,0,0.068,-0.19-i*0.035); // rail ribs
  const barrel=add(new THREE.CylinderGeometry(0.02,0.02,0.34,12),metal,0,0.028,-0.50); barrel.rotation.x=Math.PI/2;
  add(new THREE.CylinderGeometry(0.028,0.028,0.09,12),grip,0,0.028,-0.62).rotation.x=Math.PI/2; // suppressor
  add(new THREE.BoxGeometry(0.068,0.06,0.22),poly,0,-0.035,-0.36);           // handguard
  add(new THREE.BoxGeometry(0.055,0.05,0.10),poly,0,-0.075,-0.30);           // foregrip
  magMesh=add(new THREE.BoxGeometry(0.06,0.15,0.09),poly,0,-0.115,-0.06); magMesh.rotation.x=0.22;
  add(new THREE.BoxGeometry(0.065,0.10,0.20),grip,0,-0.03,0.30);             // stock
  add(new THREE.BoxGeometry(0.06,0.12,0.05),grip,0,-0.10,0.16);              // pistol grip
  // peep rear + post front (aligned for ADS)
  add(new THREE.BoxGeometry(0.008,0.035,0.008),metal,-0.022,0.085,0.02);
  add(new THREE.BoxGeometry(0.008,0.035,0.008),metal,0.022,0.085,0.02);
  add(new THREE.BoxGeometry(0.052,0.008,0.008),metal,0,0.10,0.02);
  add(new THREE.BoxGeometry(0.008,0.04,0.008),metal,0,0.075,-0.16);
  add(new THREE.BoxGeometry(0.004,0.012,0.004),trit,0,0.095,-0.16);          // tritium dot
  // gloved hands
  const glove=new THREE.MeshStandardMaterial({color:0x35301f,roughness:0.95});
  add(new THREE.BoxGeometry(0.07,0.07,0.11),glove,0.01,-0.095,-0.30);
  add(new THREE.BoxGeometry(0.075,0.08,0.10),glove,0.005,-0.10,0.13);
  gun.scale.setScalar(0.62);
}
const HIP_POS=new THREE.Vector3(0.24,-0.21,-0.55), ADS_POS=new THREE.Vector3(0,-0.152,-0.34);
gun.position.copy(HIP_POS);
camera.add(gun);
// NOTE: do NOT scene.add(camera) — it would reparent the camera out of
// pitchObj and freeze the view. It stays under scene→yawObj→pitchObj.
const muzzle=new THREE.PointLight(0xffc266,0,11,1.7); muzzle.position.set(0.24,-0.17,-0.95); camera.add(muzzle);
// dual-quad billboard flash (star core + cross spike), procedural sprite
const flashTex=(()=>{ const c=document.createElement('canvas'); c.width=c.height=128; const g=c.getContext('2d');
  const gr=g.createRadialGradient(64,64,2,64,64,62); gr.addColorStop(0,'rgba(255,255,240,1)'); gr.addColorStop(0.25,'rgba(255,210,130,0.95)'); gr.addColorStop(0.6,'rgba(255,140,50,0.45)'); gr.addColorStop(1,'rgba(255,120,30,0)');
  g.fillStyle=gr; g.fillRect(0,0,128,128);
  g.fillStyle='rgba(255,240,200,0.9)'; g.fillRect(8,60,112,8); g.fillRect(60,8,8,112); return new THREE.CanvasTexture(c); })();
const flash=new THREE.Sprite(new THREE.SpriteMaterial({map:flashTex,color:0xffd9a0,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false}));
flash.scale.set(0.42,0.42,1);
flash.position.set(0.24,-0.15,-0.95); camera.add(flash);
let gunKick=0, bobT=0, adsK=0, adsHeld=false, recoilP=0;

// ============ ENEMIES ============
const enemies=[], enemyMeshes=[];
const bodyMat=new THREE.MeshStandardMaterial({map:camoTex,roughness:0.85,metalness:0.05});
const vestMat=new THREE.MeshStandardMaterial({color:0x3b362c,roughness:0.9});
const skinMat=new THREE.MeshStandardMaterial({color:0x9a7a5e,roughness:0.75});
const helmMat=new THREE.MeshStandardMaterial({color:0x44483a,roughness:0.8,metalness:0.1});
const camWorld=new THREE.Vector3();
function makeEnemy(hp){
  const g=new THREE.Group();
  const bMat=bodyMat.clone(), vMat=vestMat.clone();
  const torso=new THREE.Mesh(new THREE.BoxGeometry(0.60,0.72,0.34),bMat); torso.position.y=1.24; torso.castShadow=true; g.add(torso);
  const vest=new THREE.Mesh(new THREE.BoxGeometry(0.64,0.42,0.40),vMat); vest.position.y=1.30; g.add(vest);
  const pouch=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.16,0.06),helmMat); pouch.position.set(0,1.18,0.21); g.add(pouch);
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.20,14,12),skinMat); head.position.y=1.83; head.castShadow=true; g.add(head);
  const helm=new THREE.Mesh(new THREE.SphereGeometry(0.225,14,10,0,Math.PI*2,0,1.45),helmMat); helm.position.y=1.87; g.add(helm);
  const gog=new THREE.Mesh(new THREE.BoxGeometry(0.28,0.09,0.06), new THREE.MeshStandardMaterial({color:0x101418,roughness:0.25,metalness:0.6})); gog.position.set(0,1.84,0.17); g.add(gog);
  const gunM=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.09,0.66),new THREE.MeshStandardMaterial({color:0x14171b,roughness:0.5,metalness:0.6})); gunM.position.set(0.28,1.28,0.28); g.add(gunM);
  const legL=new THREE.Mesh(new THREE.BoxGeometry(0.19,0.84,0.21),new THREE.MeshStandardMaterial({map:camoTex,roughness:0.9})); legL.position.set(-0.15,0.42,0); legL.castShadow=true; g.add(legL);
  const legR=legL.clone(); legR.position.x=0.15; g.add(legR);
  const armL=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.58,0.14),bodyMat); armL.position.set(-0.38,1.28,0.2); armL.rotation.x=-1.1; g.add(armL);
  const armR=armL.clone(); armR.position.x=0.38; g.add(armR);
  g.userData={legL,legR,walkT:Math.random()*9,flash:0,mats:[bMat,vMat]};
  g.scale.setScalar(1.1);
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
const tracerMatBase=new THREE.MeshBasicMaterial({color:0xffe2a0,transparent:true,opacity:0.9,blending:THREE.AdditiveBlending,depthWrite:false});
function tracer(from,to,color=0xffe9a8){
  // stretched glowing bolt: thin box oriented from->to (reads at all angles, unlike 1px Line)
  const len=from.distanceTo(to);
  const drawLen=Math.min(len,7);
  const geo=new THREE.BoxGeometry(0.02,0.02,drawLen);
  const mat=tracerMatBase.clone(); mat.color.set(color);
  const m=new THREE.Mesh(geo,mat);
  const dir=to.clone().sub(from).normalize();
  m.position.copy(from).addScaledVector(dir,drawLen/2);
  m.lookAt(to);
  m.userData.fx=true;
  scene.add(m); tracers.push({line:m,life:0.08,max:0.08});
}
const MAXS=300; const sparkGeo=new THREE.BufferGeometry();
const sPos=new Float32Array(MAXS*3); const sVel=[];
for(let i=0;i<MAXS;i++){ sPos[i*3+1]=-99; sVel.push(new THREE.Vector3()); }
sparkGeo.setAttribute('position',new THREE.BufferAttribute(sPos,3));
const sparkTex=(()=>{ const c=document.createElement('canvas'); c.width=c.height=64; const g=c.getContext('2d');
  const gr=g.createRadialGradient(32,32,1,32,32,30); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(0.3,'rgba(255,210,140,1)'); gr.addColorStop(1,'rgba(255,140,50,0)');
  g.fillStyle=gr; g.fillRect(0,0,64,64); return new THREE.CanvasTexture(c); })();
const sparks=new THREE.Points(sparkGeo,new THREE.PointsMaterial({map:sparkTex,color:0xffcf7d,size:0.14,transparent:true,opacity:0.95,blending:THREE.AdditiveBlending,depthWrite:false}));
sparks.frustumCulled=false; scene.add(sparks); let sIdx=0;
function burst(p,n=10,spd=6){ for(let i=0;i<n;i++){ const v=sVel[sIdx]; v.set((Math.random()-0.5)*spd,Math.random()*spd*0.7,(Math.random()-0.5)*spd); sPos[sIdx*3]=p.x; sPos[sIdx*3+1]=p.y; sPos[sIdx*3+2]=p.z; sIdx=(sIdx+1)%MAXS; } }
// impact decals: procedural bullet-hole (dark core + scorch ring), pooled
const decalTex=(()=>{ const c=document.createElement('canvas'); c.width=c.height=64; const g=c.getContext('2d');
  const gr=g.createRadialGradient(32,32,2,32,32,30);
  gr.addColorStop(0,'rgba(5,5,5,1)'); gr.addColorStop(0.35,'rgba(10,10,10,0.95)'); gr.addColorStop(0.55,'rgba(40,30,25,0.55)'); gr.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=gr; g.fillRect(0,0,64,64);
  g.strokeStyle='rgba(0,0,0,0.6)'; for(let i=0;i<5;i++){ g.beginPath(); g.moveTo(32,32); const a=Math.random()*7; g.lineTo(32+Math.cos(a)*30,32+Math.sin(a)*30); g.stroke(); }
  return new THREE.CanvasTexture(c); })();
const decals=[];
{
  const dGeo=new THREE.PlaneGeometry(0.14,0.14);
  for(let i=0;i<48;i++){ const d=new THREE.Mesh(dGeo,new THREE.MeshBasicMaterial({map:decalTex,transparent:true,opacity:0.9,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));
    d.visible=false; d.renderOrder=2; d.userData.fx=true; scene.add(d); decals.push(d); }
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
    try{ const p=canvas.requestPointerLock(); if(p&&p.catch)p.catch(()=>{}); }catch(e){} Game.state='playing'; HUD.show('hud'); },
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
  muzzle.intensity=34; flash.material.opacity=1; flash.material.rotation=Math.random()*3;
  flash.position.x=ADS_POS.x+(HIP_POS.x-ADS_POS.x)*(1-adsK);
  const fs=0.36+Math.random()*0.22; flash.scale.set(fs,fs,1);
  ejectShell();
  camera.getWorldDirection(camDir);
  const sp=THREE.MathUtils.lerp(0.02,0.0035,adsK)+(player.sprinting?0.012:0);
  camDir.x+=(Math.random()-0.5)*sp; camDir.y+=(Math.random()-0.5)*sp; camDir.normalize();
  ray.set(camera.getWorldPosition(new THREE.Vector3()),camDir); ray.far=120;
  const targets=[]; for(const e of enemies){ if(e.alive)targets.push(e.group); }
  const hits=ray.intersectObjects(targets.length?targets:[ground],true);
  const wallHits=ray.intersectObjects(scene.children.filter(o=>o.isMesh&&!o.isSprite&&o!==ground&&!o.userData.fx&&!targets.includes(findRoot(o))),false);
  const from=muzzleWorld();
  const first=wallHits.length&&( !hits.length||wallHits[0].distance<hits[0].distance)?wallHits[0]:hits[0];
  if(first&&first.object){
    const isEnemy=targets.length&&targets.includes(findRoot(first.object));
    tracer(from,first.point);
    if(isEnemy){
      burst(first.point,12,7);
      const e=enemies.find(x=>x.group===findRoot(first.object));
      if(e){ const dmg=34+Math.random()*12; e.hp-=dmg; AudioSys.hit(); HUD.hitmarker(false);
        e.group.userData.flash=1;
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
    // hit flash (white pop, CoD-style) — no floating bars
    if(g.userData.flash>0){ g.userData.flash=Math.max(0,g.userData.flash-dt*6);
      for(const mt of g.userData.mats){ mt.emissive.setRGB(g.userData.flash*0.7,g.userData.flash*0.55,g.userData.flash*0.45); } }
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
  muzzle.intensity*=0.65; flash.material.opacity*=0.55;
  for(let i=tracers.length-1;i>=0;i--){ const t=tracers[i]; t.life-=dt; t.line.material.opacity=Math.max(0,t.life/t.max); if(t.life<=0){ scene.remove(t.line); t.line.geometry.dispose(); t.line.material.dispose(); tracers.splice(i,1);} }
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
