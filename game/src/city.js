// city.js — builds Port Aurelia: five districts, roads, buildings, props.
// Everything is procedural boxes + canvas textures; no external assets.
import { mulberry32, rand, pick, clamp } from './util.js';

function canvasTexture(THREE, w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function windowsTexture(THREE, base, lit) {
  return canvasTexture(THREE, 128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const rng = mulberry32(7);
    for (let y = 8; y < h - 8; y += 16) {
      for (let x = 8; x < w - 8; x += 14) {
        g.fillStyle = rng() < 0.55 ? lit : '#1a2233';
        g.fillRect(x, y, 9, 10);
      }
    }
  });
}
function signTexture(THREE, text, bg, fg) {
  return canvasTexture(THREE, 256, 64, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = 'bold 34px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

export function buildCity(THREE, scene) {
  const rng = mulberry32(20261122);
  const colliders = [];
  const markers = {}; // named places: safehouse, garage, shop, ammo, marina, port, causeway
  const lamps = [];
  const group = new THREE.Group();
  scene.add(group);

  const texTower = windowsTexture(THREE, '#2c3550', '#ffd27a');
  const texTower2 = windowsTexture(THREE, '#3a2f45', '#8fe3ff');
  const texLow = windowsTexture(THREE, '#4a3b2c', '#ffca7a');
  const matRoad = new THREE.MeshStandardMaterial({ color: 0x2e323c, roughness: 0.4, metalness: 0.1 });
  const matGround = new THREE.MeshStandardMaterial({ color: 0x3d4a35, roughness: 1 });
  const matSand = new THREE.MeshStandardMaterial({ color: 0xb59a6a, roughness: 1 });
  const matWater = new THREE.MeshStandardMaterial({ color: 0x0e2f4a, roughness: 0.15, metalness: 0.4 });
  const matSidewalk = new THREE.MeshStandardMaterial({ color: 0x555a63, roughness: 0.9 });
  const matTower = new THREE.MeshStandardMaterial({ map: texTower, roughness: 0.6, metalness: 0.3, emissive: 0x332200, emissiveIntensity: 0.4 });
  const matTower2 = new THREE.MeshStandardMaterial({ map: texTower2, roughness: 0.6, metalness: 0.3, emissive: 0x002233, emissiveIntensity: 0.4 });
  const matLow = new THREE.MeshStandardMaterial({ map: texLow, roughness: 0.85, emissive: 0x221100, emissiveIntensity: 0.35 });
  const matWare = new THREE.MeshStandardMaterial({ color: 0x6b5a44, roughness: 0.9 });
  const matCrane = new THREE.MeshStandardMaterial({ color: 0xc23b22, roughness: 0.6, metalness: 0.4 });
  const matLamp = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.6 });
  const matLampGlow = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffc860, emissiveIntensity: 2 });

  function box(w, h, d, mat, x, y, z, ry) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (ry) m.rotation.y = ry;
    m.castShadow = h > 8; m.receiveShadow = true;
    group.add(m);
    return m;
  }
  function addCollider(x, z, hw, hd) {
    colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
  }
  function building(x, z, w, d, h, mat, district) {
    box(w, h, d, mat, x, h / 2, z, 0);
    addCollider(x, z, w / 2 + 0.5, d / 2 + 0.5);
    return { x, z, w, d, h, district };
  }

  // --- ground, water, beach ---
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500), matGround);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.receiveShadow = true;
  group.add(ground);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1500, 260), matWater);
  water.rotation.x = -Math.PI / 2; water.position.set(0, -0.6, -760);
  group.add(water);
  const waterE = new THREE.Mesh(new THREE.PlaneGeometry(260, 1500), matWater);
  waterE.rotation.x = -Math.PI / 2; waterE.position.set(760, -0.6, 0);
  group.add(waterE);
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(240, 700), matSand);
  beach.rotation.x = -Math.PI / 2; beach.position.set(620, 0.02, -100);
  group.add(beach);

  // --- roads: grid every 120 units, 16 wide ---
  const roadSet = new Set();
  function road(x, z, w, d) {
    const key = x + ',' + z + ',' + w + ',' + d;
    if (roadSet.has(key)) return;
    roadSet.add(key);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), matRoad);
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, z);
    m.receiveShadow = true;
    group.add(m);
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(w + 6, d + 6), matSidewalk);
    sw.rotation.x = -Math.PI / 2; sw.position.set(x, 0.01, z);
    group.add(sw);
  }
  for (let gx = -600; gx <= 600; gx += 120) {
    road(gx, 0, 16, 1240);
    road(0, gx, 1240, 16);
  }
  // causeway bridge east
  road(690, -100, 20, 700);

  // --- districts ---
  const districts = {
    port: { minX: -600, maxX: -260, minZ: -260, maxZ: 260, name: 'Port' },
    marina: { minX: -260, maxX: 260, minZ: -600, maxZ: -260, name: 'Marina' },
    downtown: { minX: -260, maxX: 260, minZ: -260, maxZ: 260, name: 'Downtown' },
    oldtown: { minX: -260, maxX: 260, minZ: 260, maxZ: 600, name: 'Old Town' },
    causeway: { minX: 260, maxX: 600, minZ: -600, maxZ: 600, name: 'Causeway' },
  };

  // downtown towers
  for (let i = 0; i < 26; i++) {
    const bx = -240 + (i % 5) * 120 + rand(rng, -25, 25);
    const bz = -240 + Math.floor(i / 5) * 110 + rand(rng, -25, 25);
    if (Math.abs(bx) < 40 && Math.abs(bz) < 40) continue;
    const h = rand(rng, 45, 150);
    building(bx, bz, rand(rng, 34, 52), rand(rng, 34, 52), h, rng() < 0.5 ? matTower : matTower2, 'downtown');
  }
  // old town low blocks
  for (let i = 0; i < 30; i++) {
    const bx = -240 + (i % 6) * 100 + rand(rng, -20, 20);
    const bz = 300 + Math.floor(i / 6) * 62 + rand(rng, -14, 14);
    building(bx, bz, rand(rng, 26, 44), rand(rng, 22, 36), rand(rng, 10, 26), matLow, 'oldtown');
  }
  // marina low + boardwalk
  for (let i = 0; i < 14; i++) {
    const bx = -220 + (i % 5) * 110 + rand(rng, -20, 20);
    const bz = -420 + Math.floor(i / 5) * 90 + rand(rng, -16, 16);
    building(bx, bz, rand(rng, 24, 40), rand(rng, 20, 30), rand(rng, 9, 22), matLow, 'marina');
  }
  // port warehouses
  for (let i = 0; i < 12; i++) {
    const bx = -520 + (i % 4) * 110;
    const bz = -180 + Math.floor(i / 4) * 130;
    building(bx, bz, rand(rng, 60, 85), rand(rng, 40, 60), rand(rng, 14, 22), matWare, 'port');
  }
  // causeway houses
  for (let i = 0; i < 12; i++) {
    const bx = 330 + (i % 3) * 110 + rand(rng, -15, 15);
    const bz = -420 + Math.floor(i / 3) * 150 + rand(rng, -20, 20);
    building(bx, bz, rand(rng, 22, 36), rand(rng, 20, 32), rand(rng, 8, 18), matLow, 'causeway');
  }

  // --- port cranes + containers ---
  const contColors = [0xb03a2e, 0x2e6db0, 0x2e9e5b, 0xc9a227, 0x7d3c98];
  for (let i = 0; i < 5; i++) {
    const cx = -560 + i * 22, cz = -300;
    box(4, 55, 4, matCrane, cx, 27, cz);
    box(46, 4, 4, matCrane, cx + 18, 52, cz);
    box(6, 12, 6, matCrane, cx + 36, 46, cz);
    addCollider(cx, cz, 3, 3);
  }
  for (let i = 0; i < 40; i++) {
    const cx = -580 + rng() * 260, cz = -240 + rng() * 420;
    const c = new THREE.MeshStandardMaterial({ color: pick(rng, contColors), roughness: 0.7, metalness: 0.3 });
    box(12, 3, 3, c, cx, 1.5 + Math.floor(rng() * 2) * 3.1, cz, rng() < 0.5 ? 0 : Math.PI / 2);
    addCollider(cx, cz, 6, 2);
  }

  // --- marina yachts ---
  for (let i = 0; i < 6; i++) {
    const yx = -200 + i * 80, yz = -640;
    const hull = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 26),
      new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 }));
    hull.position.set(yx, 0.5, yz); group.add(hull);
    box(6, 4, 10, new THREE.MeshStandardMaterial({ color: 0xdde8f0, roughness: 0.4 }), yx, 3.5, yz);
  }

  // --- lamps along roads ---
  for (let gx = -600; gx <= 600; gx += 120) {
    for (let gz = -540; gz <= 540; gz += 120) {
      const lx = gx + 12, lz = gz + 12;
      box(0.5, 7, 0.5, matLamp, lx, 3.5, lz);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), matLampGlow);
      bulb.position.set(lx, 7.2, lz); group.add(bulb);
      lamps.push(bulb);
    }
  }
  // --- neon signs ---
  function neonSign(text, bg, fg, x, y, z, ry) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(16, 4),
      new THREE.MeshBasicMaterial({ map: signTexture(THREE, text, bg, fg) }));
    m.position.set(x, y, z); m.rotation.y = ry;
    group.add(m);
  }
  neonSign('AURELIA PD', '#0a1a3a', '#8fe3ff', -8, 14, -268, 0);
  neonSign('GARAGE', '#3a0a0a', '#ffb347', 60, 10, 268, Math.PI);
  neonSign('AMMU-NATION', '#1a3a0a', '#c8ff7a', -60, 10, 268, Math.PI);
  neonSign('MARINA', '#0a2a3a', '#ffe9a8', -140, 12, -268, 0);
  neonSign('PORT AURELIA', '#2a0a3a', '#ff9ad5', 0, 18, -600, 0);
  neonSign('CAUSEWAY', '#0a3a2a', '#8fffd8', 690, 12, -420, -Math.PI / 2);

  // --- trees ---
  const matTrunk = new THREE.MeshStandardMaterial({ color: 0x5a4128, roughness: 1 });
  const matLeaf = new THREE.MeshStandardMaterial({ color: 0x2e6b34, roughness: 1 });
  for (let i = 0; i < 60; i++) {
    const tx = -580 + rng() * 1160, tz = -580 + rng() * 1160;
    if (Math.abs(tx % 120) < 14 || Math.abs(tz % 120) < 14) continue;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 4, 6), matTrunk);
    trunk.position.set(tx, 2, tz); group.add(trunk);
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(3, 7, 8), matLeaf);
    leaf.position.set(tx, 7, tz); group.add(leaf);
  }

  // --- markers ---
  markers.spawn = { x: 0, z: -300, angle: Math.PI };
  markers.safehouse = { x: 120, z: 300 };
  markers.garage = { x: 60, z: 252 };
  markers.ammo = { x: -60, z: 252 };
  markers.marina = { x: -140, z: -300 };
  markers.port = { x: -480, z: 0 };
  markers.causeway = { x: 480, z: -100 };
  markers.downtown = { x: 0, z: 0 };

  function districtAt(x, z) {
    for (const k in districts) {
      const d = districts[k];
      if (x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ) return k;
    }
    return 'downtown';
  }

  return {
    colliders, markers, districts, districtAt,
    update(dayTime) {
      const night = dayTime < 0.15 || dayTime > 0.85 ? 1 : 0;
      matLampGlow.emissiveIntensity = night ? 2.2 : 0.15;
    },
  };
}
