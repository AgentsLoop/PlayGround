export function initHUD() {
  const $ = id => document.getElementById(id);
  const cross = $('cross'), hitm = $('hitm'), vig = $('vignette'), dir = $('dmgdir');
  const mag = $('mag'), res = $('res'), rel = $('reload'), hp = $('hp'), hpt = $('hptxt');
  const feed = $('feed'), waveEl = $('wave'), scoreEl = $('score'), enEl = $('enemies'), ban = $('banner');
  const ct = $('cticks');
  let tickHTML = '';
  for (let d = 0; d < 360; d += 5) {
    const c = d === 0 ? 'N' : d === 90 ? 'E' : d === 180 ? 'S' : d === 270 ? 'W' : (d % 45 === 0 ? String(d) : '·');
    tickHTML += '<span style="display:inline-block;width:24px;text-align:center;' +
      (isNaN(Number(c)) ? 'color:#fff;font-size:15px' : '') + '">' + c + '</span>';
  }
  ct.innerHTML = tickHTML + tickHTML;
  let banT = null;
  const mm = $('mm'), g = mm.getContext('2d');
  const minimap = {
    draw(p, en = [], cr = [], range = 45) {
      g.clearRect(0, 0, 148, 148); g.save(); g.translate(74, 74);
      g.strokeStyle = '#2a2'; g.lineWidth = 1; g.strokeRect(-70, -70, 140, 140);
      const dot = (x, z, c, s = 3) => {
        const dx = (x - p.x) / range * 70, dz = (z - p.z) / range * 70;
        if (dx * dx + dz * dz > 68 * 68) return;
        g.fillStyle = c; g.fillRect(dx - s / 2, dz - s / 2, s, s);
      };
      cr.forEach(c => dot(c.x, c.z, '#888', 6));
      en.forEach(e => dot(e.x, e.z, '#ff2211', 4));
      g.rotate(-(p.yaw || 0));
      g.fillStyle = '#ffa02e'; g.beginPath(); g.moveTo(0, -8); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath(); g.fill();
      g.restore();
    }
  };
  return {
    setAmmo(m, r) { mag.textContent = m; res.textContent = '/ ' + r; },
    showReload(v) { rel.style.display = v ? 'block' : 'none'; },
    setSpread(px) { cross.style.setProperty('--sp', (4 + px) + 'px'); },
    setADS(v) { cross.classList.toggle('ads', v); },
    setHealth(v, max = 100) {
      const p = Math.max(0, v / max * 100);
      hp.style.width = p + '%'; hpt.textContent = Math.ceil(v) + ' HP';
      vig.classList.toggle('low', p < 35 && p > 0);
      if (p >= 35) vig.classList.remove('hurt');
    },
    setYaw(yaw) {
      const deg = ((yaw * 180 / Math.PI) % 360 + 360) % 360;
      ct.style.transform = 'translateX(' + (-deg / 360 * 24 * 72 + 160) + 'px)';
    },
    hitmarker(kill) { hitm.classList.remove('show', 'kill'); void hitm.offsetWidth; if (kill) hitm.classList.add('kill'); hitm.classList.add('show'); },
    damageFrom(a) {
      vig.classList.add('hurt'); setTimeout(() => { if (!vig.classList.contains('low')) vig.classList.remove('hurt'); }, 180);
      const d = document.createElement('div'); d.className = 'darc'; d.style.transform = 'rotate(' + a + 'rad)'; dir.appendChild(d);
      setTimeout(() => d.remove(), 1000);
    },
    killfeed(t) { const d = document.createElement('div'); d.textContent = t; feed.prepend(d); while (feed.children.length > 5) feed.lastChild.remove(); setTimeout(() => d.remove(), 5000); },
    killpop(t) {
      let el = document.getElementById('killpop');
      if (!el) { el = document.createElement('div'); el.id = 'killpop'; $('hud').appendChild(el); }
      el.textContent = t; el.style.opacity = 1;
      clearTimeout(el._t); el._t = setTimeout(() => el.style.opacity = 0, 1200);
    },
    setWave(w) { waveEl.textContent = 'WAVE ' + w; },
    setScore(s) { scoreEl.textContent = 'SCORE ' + s; },
    setEnemies(n) { enEl.textContent = 'HOSTILES ' + n; },
    banner(t, ms = 2200) { ban.textContent = t; ban.style.opacity = 1; clearTimeout(banT); banT = setTimeout(() => ban.style.opacity = 0, ms); },
    showMenu(v) { $('menu').classList.toggle('hidden', !v); },
    showPause(v) { $('pause').classList.toggle('hidden', !v); },
    showGameOver(score, wv) { $('final').textContent = 'SCORE ' + score + ' — WAVE ' + wv; $('over').classList.remove('hidden'); },
    hideOver() { $('over').classList.add('hidden'); },
    minimap
  };
}
