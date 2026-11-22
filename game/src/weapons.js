// weapons.js — weapon wheel, shooting, ammo, pickups, pedestrians.
// Four weapons: fist, pistol, SMG, shotgun. Raycast hits, wanted heat.
import { mulberry32, rand, pick, clamp, dist2 } from './util.js';

export const WEAPON_DEFS = [
  { key: 'fist', name: 'Fists', damage: 25, range: 2.6, rate: 0.45, auto: false, ammo: Infinity, mag: Infinity },
  { key: 'pistol', name: 'P9 Pistol', damage: 34, range: 55, rate: 0.32, auto: false, ammo: 120, mag: 12 },
  { key: 'smg', name: 'VK-9 SMG', damage: 20, range: 45, rate: 0.09, auto: true, ammo: 240, mag: 30 },
  { key: 'shotgun', name: 'Street Sweeper', damage: 26, range: 26, rate: 0.85, auto: false, ammo: 40, mag: 6, pellets: 6 },
];

export function createWeapons(THREE, scene, city) {
  const rng = mulberry32(31337);
  const peds = [];
  const pickups = [];
  let raycaster = null;

  // pedestrians
  const pedColors = [0xe8b04b, 0x4b7de8, 0xe84b6d, 0x6de84b, 0xb04be8, 0xe8e8e8, 0x8a5a2a];
  for (let i = 0; i < 22; i++) {
    const g = new THREE.Group();
    const shirt = new THREE.MeshStandardMaterial({ color: pick(rng, pedColors), roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc98d64, roughness: 0.85 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.85, 8), shirt);
    body.position.y = 1.0; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
    head.position.y = 1.68; g.add(head);
    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.75, 6), new THREE.MeshStandardMaterial({ color: 0x2a2a33, roughness: 0.9 }));
    legL.position.set(-0.15, 0.38, 0); g.add(legL);
    const legR = legL.clone(); legR.position.x = 0.15; g.add(legR);
    let x = -580 + rng() * 1160, z = -580 + rng() * 1160;
    g.position.set(x, 0, z);
    scene.add(g);
    peds.push({
      mesh: g, x, z, angle: rng() * Math.PI * 2, speed: rand(rng, 1.2, 2.4),
      hp: 60, alive: true, flee: 0, phase: rng() * 6,
      target: null,
    });
  }
  // ammo + health pickups
  function spawnPickup(x, z, kind) {
    const color = kind === 'ammo' ? 0xffd23c : 0x3cff6e;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.3 }));
    m.position.set(x, 0.9, z);
    scene.add(m);
    pickups.push({ mesh: m, x, z, kind, taken: false, spin: rng() * 6 });
  }
  for (let i = 0; i < 10; i++) spawnPickup(-560 + rng() * 1120, -560 + rng() * 1120, 'ammo');
  for (let i = 0; i < 6; i++) spawnPickup(-560 + rng() * 1120, -560 + rng() * 1120, 'health');

  return {
    peds, pickups,
    weapons: WEAPON_DEFS.map((d) => ({ ...d, reserve: d.ammo === Infinity ? Infinity : d.ammo, inMag: d.mag })),
    current: 0,
    cooldown: 0,
    wheelOpen: false,
    select(i, G) {
      if (i < 0 || i >= this.weapons.length) return;
      const w = this.weapons[i];
      if (w.key !== 'fist' && w.reserve <= 0 && w.inMag <= 0) {
        if (G) G.say('No ammo for the ' + w.name + ' — find a yellow pickup');
        return;
      }
      this.current = i;
      if (G) G.say(w.name + ' ready');
    },
    cur() { return this.weapons[this.current]; },
    updateAim(player) {
      // aim direction follows the player facing; nothing to do per-frame
    },
    fire(G) {
      const w = this.cur();
      if (this.cooldown > 0) return;
      if (w.key !== 'fist' && w.inMag <= 0) {
        if (w.reserve > 0) {
          const take = Math.min(w.mag, w.reserve);
          w.inMag = take; w.reserve -= take;
          if (G) G.say('Reloaded ' + w.name);
        } else {
          if (G) G.say('Out of ammo — find a yellow pickup');
          this.cooldown = 0.4;
          return;
        }
      }
      this.cooldown = w.rate;
      if (w.key !== 'fist') w.inMag--;
      const p = G.player;
      const ox = p.x, oz = p.z;
      const oy = p.car ? 1.3 : 1.5;
      const dirX = Math.sin(p.angle), dirZ = Math.cos(p.angle);
      if (G.audio) G.audio.gunshot();
      if (G.fx) G.fx.muzzle(ox + dirX * 1.2, oy, oz + dirZ * 1.2, dirX, dirZ);
      if (w.key === 'fist') {
        // melee arc
        for (const ped of peds) {
          if (!ped.alive) continue;
          const d = Math.sqrt(dist2(ox, oz, ped.x, ped.z));
          if (d < w.range) this.hitPed(ped, w.damage, dirX, dirZ, G);
        }
        for (const u of G.police.units) {
          if (u.active && Math.sqrt(dist2(ox, oz, u.x, u.z)) < w.range) {
            u.speed = 0;
          }
        }
        return;
      }
      // raycast against peds, police cars, traffic and buildings
      if (!raycaster) raycaster = new THREE.Raycaster();
      const origin = new THREE.Vector3(ox, oy, oz);
      const pellets = w.pellets || 1;
      for (let k = 0; k < pellets; k++) {
        const spread = (Math.random() - 0.5) * (w.pellets ? 0.14 : 0.03);
        const dx = dirX + Math.cos(p.angle) * spread;
        const dz = dirZ - Math.sin(p.angle) * spread;
        const dir = new THREE.Vector3(dx, 0, dz).normalize();
        raycaster.set(origin, dir);
        raycaster.far = w.range;
        const targets = [];
        for (const ped of peds) if (ped.alive) targets.push(ped.mesh);
        for (const u of G.police.units) if (u.active) targets.push(u.mesh);
        for (const c of G.vehicles.cars) if (!c.exploded) targets.push(c.mesh);
        for (const t of G.vehicles.traffic) targets.push(t.mesh);
        const hits = raycaster.intersectObjects(targets, true);
        let end = new THREE.Vector3(ox + dir.x * w.range, oy, oz + dir.z * w.range);
        if (hits.length) {
          const h = hits[0];
          end = h.point.clone();
          let obj = h.object;
          while (obj && !obj.userData.pedRef && !obj.userData.carRef && obj.parent) obj = obj.parent;
          if (G.fx) G.fx.impact(h.point.x, h.point.y, h.point.z);
          // find which ped / car was hit by proximity
          for (const ped of peds) {
            if (ped.alive && dist2(h.point.x, h.point.z, ped.x, ped.z) < 4) {
              this.hitPed(ped, w.damage, dir.x, dir.z, G);
              break;
            }
          }
          for (const c of G.vehicles.cars) {
            if (!c.exploded && dist2(h.point.x, h.point.z, c.x, c.z) < 9) {
              G.vehicles.damageCar(c, w.damage, G);
              break;
            }
          }
          for (const u of G.police.units) {
            if (u.active && dist2(h.point.x, h.point.z, u.x, u.z) < 9) {
              G.police.addWanted(0, G);
              break;
            }
          }
        }
        if (G.fx) G.fx.tracer({ x: ox + dirX, y: oy, z: oz + dirZ }, { x: end.x, y: end.y, z: end.z }, scene);
      }
      G.police.addWanted(0.4, G);
    },
    hitPed(ped, dmg, dx, dz, G) {
      ped.hp -= dmg;
      ped.flee = 6;
      ped.x += dx * 1.5; ped.z += dz * 1.5;
      ped.mesh.position.set(ped.x, 0, ped.z);
      if (ped.hp <= 0 && ped.alive) {
        ped.alive = false;
        ped.mesh.visible = false;
        if (G) G.police.addWanted(1, G);
      }
    },
    update(dt, G) {
      this.cooldown = Math.max(0, this.cooldown - dt);
      const p = G.player;
      // pedestrians wander / flee
      for (const ped of peds) {
        if (!ped.alive) continue;
        const dP = Math.sqrt(dist2(ped.x, ped.z, p.x, p.z));
        if (ped.flee > 0) {
          ped.flee -= dt;
          const a = Math.atan2(ped.x - p.x, ped.z - p.z);
          ped.angle = a;
          ped.x += Math.sin(a) * 5 * dt;
          ped.z += Math.cos(a) * 5 * dt;
        } else {
          if (!ped.target || dist2(ped.x, ped.z, ped.target.x, ped.target.z) < 4) {
            ped.target = { x: clamp(ped.x + (Math.random() - 0.5) * 160, -600, 600), z: clamp(ped.z + (Math.random() - 0.5) * 160, -600, 600) };
          }
          const a = Math.atan2(ped.target.x - ped.x, ped.target.z - ped.z);
          ped.angle = a;
          ped.x += Math.sin(a) * ped.speed * dt;
          ped.z += Math.cos(a) * ped.speed * dt;
          if (dP < 6 && G.police.wanted === 0 && Math.random() < 0.002) {
            // ped panics when player runs at them with a weapon out
          }
        }
        ped.phase += dt * 6;
        ped.mesh.position.set(ped.x, Math.abs(Math.sin(ped.phase)) * 0.08, ped.z);
        ped.mesh.rotation.y = ped.angle;
      }
      // pickups
      for (const pk of pickups) {
        if (pk.taken) continue;
        pk.spin += dt * 2;
        pk.mesh.rotation.y = pk.spin;
        pk.mesh.position.y = 0.9 + Math.sin(pk.spin) * 0.15;
        const d = Math.sqrt(dist2(p.x, p.z, pk.x, pk.z));
        if (d < 2.2) {
          pk.taken = true;
          pk.mesh.visible = false;
          if (pk.kind === 'ammo') {
            for (const w of this.weapons) if (w.reserve !== Infinity) w.reserve += w.key === 'shotgun' ? 12 : 60;
            if (G) G.say('Ammo picked up');
          } else {
            p.health = Math.min(100, p.health + 50);
            if (G) G.say('Health restored');
          }
          if (G.audio) G.audio.pickup();
        }
      }
    },
  };
}
