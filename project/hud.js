export const HUD = {
  el:{}, spread:6, _vt:0,
  init(){ ['menu','pause','gameover','hud','wave','score','kills','healthBar','ammo','killfeed','vignette','hitmarker','finalStats','reloadTip','waveBanner','hurtFlash'].forEach(id=>this.el[id]=document.getElementById(id)); },
  setSpread(px){ this.spread=px; document.documentElement.style.setProperty('--spread',px+'px'); },
  addSpread(px){ this.setSpread(Math.min(30,this.spread+px)); },
  update(dt){ this.setSpread(this.spread+(6-this.spread)*Math.min(1,dt*7)); },
  stats(s){ this.el.wave.textContent='WAVE '+s.wave; this.el.score.textContent='SCORE '+s.score; this.el.kills.textContent='KILLS '+s.kills; },
  health(hp,max){ this.el.healthBar.style.width=Math.max(0,100*hp/max)+'%'; this.el.healthBar.style.background=hp<30?'#ff3b3b':'linear-gradient(90deg,#37ff5e,#b6ff4d)'; },
  ammo(mag,res){ this.el.ammo.innerHTML=mag+'<span>/'+res+'</span>'; },
  reloading(b){ this.el.reloadTip.classList.toggle('hidden',!b); },
  hitmarker(kill=false){ const h=this.el.hitmarker; h.className=kill?'kill show':'show'; requestAnimationFrame(()=>requestAnimationFrame(()=>h.classList.remove('show'))); },
  damage(a=0.75){ const v=this.el.vignette; v.style.opacity=a; clearTimeout(this._vt); this._vt=setTimeout(()=>v.style.opacity=0,200);
    const f=this.el.hurtFlash; f.style.opacity=0.9; setTimeout(()=>f.style.opacity=0,120); },
  feed(txt){ const d=document.createElement('div'); d.textContent=txt; const k=this.el.killfeed; k.prepend(d); while(k.children.length>5)k.lastChild.remove(); setTimeout(()=>{d.style.opacity='0'; setTimeout(()=>d.remove(),400);},3800); },
  banner(txt){ const b=this.el.waveBanner; b.textContent=txt; b.classList.remove('hidden'); b.style.opacity=1; setTimeout(()=>{b.style.transition='opacity .8s'; b.style.opacity=0; setTimeout(()=>b.classList.add('hidden'),850);},1400); },
  show(...ids){ ['menu','pause','gameover','hud'].forEach(id=>document.getElementById(id).classList.add('hidden')); ids.forEach(id=>document.getElementById(id).classList.remove('hidden')); }
};
export function drawMinimap(player,enemies,worldSize=90){
  const c=document.getElementById('minimap'); if(!c)return; const g=c.getContext('2d'),S=c.width,k=S/worldSize;
  g.clearRect(0,0,S,S); g.fillStyle='rgba(20,30,25,.9)'; g.beginPath(); g.arc(S/2,S/2,S/2-1,0,7); g.fill();
  g.strokeStyle='rgba(125,255,94,.5)'; g.stroke();
  g.strokeStyle='rgba(255,255,255,.15)'; g.beginPath(); g.moveTo(S/2,4); g.lineTo(S/2,S-4); g.moveTo(4,S/2); g.lineTo(S-4,S/2); g.stroke();
  const dot=(wx,wz,color,s=4)=>{ const dx=(wx-player.pos.x)*k,dz=(wz-player.pos.z)*k; if(dx*dx+dz*dz>(S/2)*(S/2))return; g.fillStyle=color; g.beginPath(); g.arc(S/2+dx,S/2+dz,s/2,0,7); g.fill(); };
  enemies.filter(e=>e.alive).forEach(e=>dot(e.group.position.x,e.group.position.z,'#ff5252',5));
  g.save(); g.translate(S/2,S/2); g.rotate(-player.yaw); g.fillStyle='#7dff5e'; g.beginPath(); g.moveTo(0,-7); g.lineTo(4.5,5); g.lineTo(-4.5,5); g.closePath(); g.fill(); g.restore();
}
