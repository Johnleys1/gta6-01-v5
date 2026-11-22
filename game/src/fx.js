// fx.js — particles, muzzle flashes, tracers, fires and explosions.
// One shared Points pool; no textures, no external assets.
import { mulberry32 } from './util.js';

export function createFx(THREE, scene) {
  const MAX = 700;
  const pos = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3);
  const parts = [];
  for (let i = 0; i < MAX; i++) {
    parts.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, x: 0, y: -999, z: 0, r: 1, g: 1, b: 1, grav: 0 });
    pos[i * 3 + 1] = -999;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 0.85, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  const lights = [];
  for (let i = 0; i < 3; i++) {
    const L = new THREE.PointLight(0xff8822, 0, 40, 1.5);
    scene.add(L);
    lights.push({ light: L, t: 0 });
  }
  const fires = []; // {x,z,obj}
  const rng = mulberry32(777);
  let cursor = 0;

  function spawn(x, y, z, vx, vy, vz, life, r, g, b, grav) {
    const p = parts[cursor];
    cursor = (cursor + 1) % MAX;
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = life; p.max = life; p.r = r; p.g = g; p.b = b; p.grav = grav || 0;
  }
  function flash(x, y, z, color, intensity) {
    let best = lights[0];
    for (const l of lights) if (l.t <= best.t) best = l;
    best.light.position.set(x, y + 2, z);
    best.light.color.setHex(color);
    best.light.intensity = intensity;
    best.t = 0.5;
  }
  function burst(x, y, z, n, speed, life, r, g, b, up) {
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, e = (rng() - 0.3) * Math.PI;
      const s = speed * (0.4 + rng() * 0.8);
      spawn(x, y, z, Math.cos(a) * Math.cos(e) * s, (up || 0.5) * s * (0.5 + rng()), Math.sin(a) * Math.cos(e) * s, life * (0.6 + rng() * 0.8), r, g, b, 6);
    }
  }
  return {
    explodeAt(x, z, radius) {
      burst(x, 1, z, 60, 14, 1.1, 1, 0.55, 0.1);
      burst(x, 1, z, 30, 8, 1.8, 0.9, 0.15, 0.05);
      burst(x, 1, z, 24, 18, 0.7, 1, 0.85, 0.4);
      flash(x, 1, z, 0xff7722, 400);
    },
    muzzle(x, y, z, dirX, dirZ) {
      burst(x, y, z, 5, 6, 0.16, 1, 0.8, 0.3);
      flash(x, y, z, 0xffcc66, 60);
    },
    impact(x, y, z) {
      burst(x, y, z, 8, 5, 0.4, 1, 0.8, 0.4);
      burst(x, y, z, 5, 3, 0.6, 0.7, 0.7, 0.7);
    },
    startFire(car) {
      fires.push({ car, t: 0 });
    },
    startWreckSmoke(x, z) {
      fires.push({ x, z, smoke: true, t: 0 });
    },
    burnTick(car, dt) {
      const x = car.x, z = car.z;
      for (let i = 0; i < 3; i++) {
        spawn(x + (rng() - 0.5) * 2, 0.8 + rng(), z + (rng() - 0.5) * 2,
          (rng() - 0.5) * 1.5, 3 + rng() * 3, (rng() - 0.5) * 1.5,
          0.7 + rng() * 0.5, 1, 0.35 + rng() * 0.3, 0.05, -2);
      }
      if (Math.random() < 0.3) flash(x, 1, z, 0xff5511, 30);
    },
    tracer(from, to, scene) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(from.x, from.y, from.z),
        new THREE.Vector3(to.x, to.y, to.z),
      ]);
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
      scene.add(line);
      setTimeout(() => scene.remove(line), 70);
    },
    update(dt) {
      for (let i = 0; i < MAX; i++) {
        const p = parts[i];
        if (p.life > 0) {
          p.life -= dt;
          p.vy -= p.grav * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.3; }
          const f = Math.max(0, p.life / p.max);
          pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
          col[i * 3] = p.r * f; col[i * 3 + 1] = p.g * f; col[i * 3 + 2] = p.b * f;
        } else {
          pos[i * 3 + 1] = -999;
          col[i * 3] = 0; col[i * 3 + 1] = 0; col[i * 3 + 2] = 0;
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      for (const l of lights) {
        if (l.t > 0) { l.t -= dt; l.light.intensity *= Math.max(0, 1 - dt * 6); }
        else l.light.intensity = 0;
      }
      for (let i = fires.length - 1; i >= 0; i--) {
        const f = fires[i];
        f.t += dt;
        const fx = f.car ? f.car.x : f.x, fz = f.car ? f.car.z : f.z;
        if (f.car && f.car.exploded) { fires.splice(i, 1); continue; }
        if (f.smoke) {
          spawn(fx + (rng() - 0.5) * 2, 1 + rng() * 2, fz + (rng() - 0.5) * 2, 0, 2.5, 0, 2.2, 0.25, 0.25, 0.25, -1);
          if (f.t > 25) fires.splice(i, 1);
        }
      }
    },
  };
}
