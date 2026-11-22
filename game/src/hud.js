// hud.js — HUD, minimap, menus, weapon wheel, garage and shop screens.
// All DOM lives in index.html; this module wires and updates it.
import { clamp, fmtCash } from './util.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    cash: $('hud-cash'), respect: $('hud-respect'), district: $('hud-district'),
    objective: $('hud-objective'), health: $('hud-health-fill'), healthNum: $('hud-health-num'),
    ammo: $('hud-ammo'), weapon: $('hud-weapon'), stars: $('hud-stars'),
    speed: $('hud-speed'), time: $('hud-time'), radio: $('hud-radio'),
    minimap: $('minimap'), toast: $('toast'), wheel: $('weapon-wheel'),
    menu: $('menu-start'), pause: $('menu-pause'), busted: $('menu-busted'),
    briefing: $('menu-briefing'), garage: $('menu-garage'), shop: $('menu-shop'),
    results: $('menu-results'),
  };
  const ctx = els.minimap ? els.minimap.getContext('2d') : null;
  let toastTimer = null;
  let last = {};

  function setText(el, v) {
    if (el && last[el.id] !== v) { el.textContent = v; last[el.id] = v; }
  }
  function stars(n) {
    return '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));
  }
  return {
    say(text) {
      if (!els.toast) return;
      els.toast.textContent = text;
      els.toast.style.opacity = '1';
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { els.toast.style.opacity = '0'; }, 4200);
    },
    show(id) { if (els[id]) els[id].style.display = 'flex'; },
    hide(id) { if (els[id]) els[id].style.display = 'none'; },
    hideAllMenus() {
      for (const k of ['menu', 'pause', 'busted', 'briefing', 'garage', 'shop', 'results']) this.hide(k);
    },
    setBriefing(title, text) {
      const t = $('briefing-title'), b = $('briefing-text');
      if (t) t.textContent = title;
      if (b) b.textContent = text;
    },
    setResults(title, text) {
      const t = $('results-title'), b = $('results-text');
      if (t) t.textContent = title;
      if (b) b.textContent = text;
    },
    setBusted(title, text) {
      const t = $('busted-title'), b = $('busted-text');
      if (t) t.textContent = title;
      if (b) b.textContent = text;
    },
    setGarage(G) {
      const body = $('garage-body');
      if (!body || !G.player.car) return;
      const car = G.player.car;
      const up = car.upgrade;
      const cost = (lvl) => 500 * (lvl + 1);
      body.innerHTML = '';
      const rows = [
        ['Engine', up.engine, 'Top speed +25% per level', () => { if (G.cash >= cost(up.engine)) { G.cash -= cost(up.engine); up.engine++; } }],
        ['Armor', up.armor, 'Takes less damage per level', () => { if (G.cash >= cost(up.armor)) { G.cash -= cost(up.armor); up.armor++; } }],
        ['Nitro', up.nitro, 'Bigger nitro tank per level', () => { if (G.cash >= cost(up.nitro)) { G.cash -= cost(up.nitro); up.nitro++; } }],
      ];
      for (const [name, lvl, desc, buy] of rows) {
        const div = document.createElement('div');
        div.className = 'shop-row';
        div.innerHTML = '<b>' + name + ' Lv ' + lvl + '</b> — ' + desc + ' — <span>' + fmtCash(cost(lvl)) + '</span> ';
        const btn = document.createElement('button');
        btn.textContent = lvl >= 3 ? 'MAX' : 'BUY';
        btn.disabled = lvl >= 3 || G.cash < cost(lvl);
        btn.onclick = () => { buy(); this.setGarage(G); };
        div.appendChild(btn);
        body.appendChild(div);
      }
      const nitro = document.createElement('div');
      nitro.className = 'shop-row';
      nitro.innerHTML = 'Nitro refill — <span>$50</span> ';
      const nb = document.createElement('button');
      nb.textContent = 'REFILL';
      nb.disabled = G.cash < 50 || car.nitro >= 100;
      nb.onclick = () => { G.cash -= 50; car.nitro = 100; this.setGarage(G); };
      nitro.appendChild(nb);
      body.appendChild(nitro);
    },
    setShop(G) {
      const body = $('shop-body');
      if (!body) return;
      body.innerHTML = '';
      const w = G.weapons;
      const rows = [
        ['Pistol ammo +60', 150, () => { w.weapons[1].reserve += 60; }],
        ['SMG ammo +120', 250, () => { w.weapons[2].reserve += 120; }],
        ['Shotgun shells +18', 200, () => { w.weapons[3].reserve += 18; }],
        ['Body armor (full health)', 300, () => { G.player.health = 100; }],
      ];
      for (const [name, price, buy] of rows) {
        const div = document.createElement('div');
        div.className = 'shop-row';
        div.innerHTML = '<b>' + name + '</b> — <span>' + fmtCash(price) + '</span> ';
        const btn = document.createElement('button');
        btn.textContent = 'BUY';
        btn.disabled = G.cash < price;
        btn.onclick = () => { G.cash -= price; buy(); this.setShop(G); };
        div.appendChild(btn);
        body.appendChild(div);
      }
    },
    setWheel(G) {
      if (!els.wheel) return;
      const w = G.weapons;
      els.wheel.innerHTML = '';
      w.weapons.forEach((wpn, i) => {
        const d = document.createElement('div');
        d.className = 'wheel-item' + (i === w.current ? ' active' : '');
        d.innerHTML = '<b>' + (i + 1) + '</b> ' + wpn.name + '<br><span>' + (wpn.inMag === Infinity ? '∞' : wpn.inMag + ' / ' + (wpn.reserve === Infinity ? '∞' : wpn.reserve)) + '</span>';
        els.wheel.appendChild(d);
      });
    },
    drawMinimap(G) {
      if (!ctx) return;
      const S = 180, scale = S / 1260;
      const toMap = (x, z) => [(x + 630) * scale, (z + 630) * scale];
      ctx.fillStyle = 'rgba(8,12,20,0.85)';
      ctx.fillRect(0, 0, S, S);
      // districts
      const cols = { port: '#3a2f22', marina: '#1c2f45', downtown: '#2c2438', oldtown: '#33261a', causeway: '#22382c' };
      for (const k in G.city.districts) {
        const d = G.city.districts[k];
        ctx.fillStyle = cols[k] || '#222';
        ctx.fillRect((d.minX + 630) * scale, (d.minZ + 630) * scale, (d.maxX - d.minX) * scale, (d.maxZ - d.minZ) * scale);
      }
      // roads
      ctx.strokeStyle = '#565e6e'; ctx.lineWidth = 2;
      for (let gx = -600; gx <= 600; gx += 120) {
        const [x1] = toMap(gx, -630); const [, y1] = toMap(-630, gx);
        ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, S); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(S, y1); ctx.stroke();
      }
      // water
      ctx.fillStyle = '#0e2f4a';
      ctx.fillRect(0, 0, S, 8);
      ctx.fillRect(S - 8, 0, 8, S);
      // shops / markers
      const mark = (x, z, color, r) => {
        const [mx, my] = toMap(x, z);
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(mx, my, r || 3, 0, Math.PI * 2); ctx.fill();
      };
      mark(G.city.markers.garage.x, G.city.markers.garage.z, '#ff9d2e', 3);
      mark(G.city.markers.ammo.x, G.city.markers.ammo.z, '#c8ff7a', 3);
      mark(G.city.markers.safehouse.x, G.city.markers.safehouse.z, '#7ad4ff', 3);
      // mission marker
      if (G.missions.marker.visible) {
        const [mx, my] = toMap(G.missions.marker.position.x, G.missions.marker.position.z);
        ctx.fillStyle = '#ffd23c';
        ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffd23c'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(mx, my, 8 + Math.sin(G.time * 4) * 2, 0, Math.PI * 2); ctx.stroke();
      }
      // traffic
      ctx.fillStyle = '#dddddd';
      for (const t of G.vehicles.traffic) {
        const [tx, ty] = toMap(t.x, t.z);
        ctx.fillRect(tx - 1, ty - 1, 2, 2);
      }
      // police
      ctx.fillStyle = '#ff3b30';
      for (const u of G.police.units) {
        if (!u.active) continue;
        const [ux, uy] = toMap(u.x, u.z);
        ctx.beginPath(); ctx.arc(ux, uy, 3, 0, Math.PI * 2); ctx.fill();
      }
      if (G.police.heli.mesh.visible) {
        const [hx, hy] = toMap(G.police.heli.x, G.police.heli.z);
        ctx.fillStyle = '#ff3b30';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText('H', hx - 3, hy + 3);
      }
      // player arrow
      const [px, py] = toMap(G.player.x, G.player.z);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.atan2(Math.sin(G.player.angle), Math.cos(G.player.angle)) + Math.PI);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill();
      ctx.restore();
    },
    update(G) {
      const p = G.player;
      setText(els.cash, fmtCash(G.cash));
      setText(els.respect, 'Respect ' + Math.floor(G.respect));
      setText(els.district, G.city.districtAt(p.x, p.z).toUpperCase());
      setText(els.objective, G.missions.objectiveText());
      setText(els.healthNum, Math.ceil(p.health) + '');
      if (els.health) els.health.style.width = clamp(p.health, 0, 100) + '%';
      const w = G.weapons.cur();
      setText(els.weapon, w.name);
      setText(els.ammo, w.inMag === Infinity ? '∞' : w.inMag + ' / ' + (w.reserve === Infinity ? '∞' : w.reserve));
      setText(els.stars, stars(G.police.wanted));
      if (els.stars) els.stars.style.color = G.police.wanted > 0 ? '#ff5040' : '#ffd23c';
      setText(els.speed, p.car ? Math.abs(Math.round(p.car.speed * 2.2)) + ' km/h' : '');
      const hour = Math.floor((G.dayTime * 24) % 24);
      const mins = Math.floor(((G.dayTime * 24) % 1) * 60);
      setText(els.time, String(hour).padStart(2, '0') + ':' + String(mins).padStart(2, '0'));
      setText(els.radio, G.audio && G.audio.radioOn ? G.audio.stations[G.audio.station].name : 'Radio off — R to tune');
      this.drawMinimap(G);
    },
  };
}
