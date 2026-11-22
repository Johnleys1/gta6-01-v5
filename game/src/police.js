// police.js — APD wanted system: pursuit cars, HALO-1 helicopter with
// searchlight, roadblocks with spike strips, RAM/PIT units, busted logic.
import { mulberry32, rand, clamp, wrapAngle, angleLerp, dist2 } from './util.js';
import { makeCarMesh } from './vehicles.js';

export function createPolice(THREE, scene, city) {
  const rng = mulberry32(44551);
  const units = [];
  const heli = { mesh: null, x: 0, z: 0, y: 60, angle: 0, light: null, cone: null };
  const roadblocks = [];
  let spikeHits = 0;

  function makeHeliMesh() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a4a6e, roughness: 0.4, metalness: 0.5 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 5), bodyMat);
    body.position.y = 0; body.castShadow = true; g.add(body);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2, 0.9, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x0e1420, roughness: 0.1, metalness: 0.7 }));
    glass.position.set(0, 0.2, 1.8); g.add(glass);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 4), bodyMat);
    tail.position.set(0, 0.3, -4); g.add(tail);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 0.5), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    rotor.position.y = 1.1; g.add(rotor);
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 0.4), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    tailRotor.position.set(0.4, 0.4, -5.6); g.add(tailRotor);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 3 }));
    lamp.position.set(0, -0.9, 1.2); g.add(lamp);
    const navLight = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 4 }));
    navLight.position.set(-1.2, 0.4, -2); g.add(navLight);
    // fake volumetric searchlight beam so the cone reads at night
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(7, 55, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2cc, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.rotation.x = Math.PI;
    beam.position.set(0, -28, 1.2);
    g.add(beam);
    const spot = new THREE.SpotLight(0xfff2cc, 0, 120, 0.3, 0.5, 0.8);
    spot.position.set(0, -1, 1.2);
    g.add(spot);
    g.userData.rotor = rotor; g.userData.spot = spot; g.userData.lamp = lamp; g.userData.beam = beam;
    return g;
  }
  heli.mesh = makeHeliMesh();
  heli.mesh.visible = false;
  scene.add(heli.mesh);

  function spawnUnit() {
    const mesh = makeCarMesh(THREE, 0x1a2a4a, true);
    scene.add(mesh);
    const u = { mesh, x: 0, z: 0, angle: 0, speed: 0, state: 'chase', ram: false };
    units.push(u);
    return u;
  }
  for (let i = 0; i < 6; i++) spawnUnit();

  function placeRoadblock(px, pz, angle, G) {
    clearRoadblocks();
    const bx = px + Math.sin(angle) * 45, bz = pz + Math.cos(angle) * 45;
    const perp = angle + Math.PI / 2;
    for (let i = -1; i <= 1; i++) {
      const u = units.find((v) => !v.active);
      const mesh = makeCarMesh(THREE, 0x1a2a4a, true);
      mesh.position.set(bx + Math.sin(perp) * i * 7, 0, bz + Math.cos(perp) * i * 7);
      mesh.rotation.y = angle + Math.PI / 2;
      scene.add(mesh);
      roadblocks.push({ mesh, x: bx + Math.sin(perp) * i * 7, z: bz + Math.cos(perp) * i * 7, strip: i === 0 });
    }
    // spike strip visual
    const strip = new THREE.Mesh(new THREE.BoxGeometry(10, 0.25, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.3, metalness: 0.8 }));
    strip.position.set(bx + Math.sin(angle) * 6, 0.12, bz + Math.cos(angle) * 6);
    strip.rotation.y = angle;
    scene.add(strip);
    roadblocks.push({ mesh: strip, x: strip.position.x, z: strip.position.z, strip: true, isStrip: true });
    if (G) G.say('APD roadblock ahead — spike strip on the road!');
  }
  function clearRoadblocks() {
    for (const r of roadblocks) { scene.remove(r.mesh); }
    roadblocks.length = 0;
  }

  return {
    units, heli, roadblocks,
    wanted: 0, heat: 0, hiddenT: 0, blockT: 0, sirenOn: false,
    reset() {
      this.wanted = 0; this.heat = 0; this.hiddenT = 0;
      clearRoadblocks();
      heli.mesh.visible = false;
      for (const u of units) { u.active = false; u.mesh.visible = false; }
    },
    addWanted(n, G) {
      const before = this.wanted;
      this.wanted = clamp(this.wanted + n, 0, 5);
      this.heat = Math.min(100, this.heat + n * 25);
      if (this.wanted > before && G) {
        G.say('Wanted level ' + this.wanted + ' — APD dispatch responding');
        if (this.wanted >= 3) G.say('HALO-1 air support is overhead');
      }
    },
    update(dt, G) {
      const p = G.player;
      const px = p.x, pz = p.z;
      // heat decay when no crime recently
      this.heat = Math.max(0, this.heat - dt * 2);
      // wanted decay while hidden from police
      let seen = false;
      for (const u of units) {
        if (u.active && dist2(u.x, u.z, px, pz) < 3600) { seen = true; break; }
      }
      if (this.wanted > 0 && !seen && this.heat < 10) {
        this.hiddenT += dt;
        if (this.hiddenT > 14) {
          this.wanted = Math.max(0, this.wanted - 1);
          this.hiddenT = 0;
          if (G) G.say(this.wanted > 0 ? 'Wanted level dropping — stay hidden' : 'You lost the APD. Heat is off.');
        }
      } else this.hiddenT = 0;

      const wantCount = this.wanted === 0 ? 0 : Math.min(6, 1 + this.wanted);
      let active = 0;
      for (const u of units) if (u.active) active++;
      // spawn / despawn pursuit units
      if (active < wantCount) {
        const u = units.find((v) => !v.active);
        if (u) {
          const a = rng() * Math.PI * 2;
          u.x = px + Math.sin(a) * 90; u.z = pz + Math.cos(a) * 90;
          u.angle = Math.atan2(px - u.x, pz - u.z);
          u.speed = 10; u.active = true; u.ram = this.wanted >= 4 && rng() < 0.4;
          u.mesh.visible = true;
        }
      } else if (active > wantCount) {
        const u = units.find((v) => v.active);
        if (u) { u.active = false; u.mesh.visible = false; }
      }
      // pursuit steering
      for (const u of units) {
        if (!u.active) continue;
        const d = Math.sqrt(dist2(u.x, u.z, px, pz));
        const target = Math.atan2(px - u.x, pz - u.z);
        u.angle = angleLerp(u.angle, target, Math.min(1, dt * 2.2));
        const maxSp = (u.ram ? 30 : 24) + this.wanted * 1.5;
        u.speed = Math.min(maxSp, u.speed + dt * 12);
        // avoid buildings: steer around collider
        let nx = u.x + Math.sin(u.angle) * u.speed * dt;
        let nz = u.z + Math.cos(u.angle) * u.speed * dt;
        let blocked = false;
        for (const c of city.colliders) {
          if (nx > c.minX - 1.4 && nx < c.maxX + 1.4 && nz > c.minZ - 1.4 && nz < c.maxZ + 1.4) { blocked = true; break; }
        }
        if (blocked) { u.angle += dt * 3; u.speed *= 0.6; }
        else { u.x = nx; u.z = nz; }
        u.mesh.position.set(u.x, 0, u.z);
        u.mesh.rotation.y = u.angle;
        const spin = u.speed * dt * 2.6;
        for (const w of u.mesh.userData.wheels) w.rotation.x += spin;
        // lightbar flash
        const ph = Math.floor(G.time * 6) % 2 === 0;
        if (u.mesh.userData.lightRed) {
          u.mesh.userData.lightRed.material.emissiveIntensity = ph ? 4 : 0.4;
          u.mesh.userData.lightBlue.material.emissiveIntensity = ph ? 0.4 : 4;
        }
        // ram the player
        if (d < 4.5) {
          if (p.car) {
            G.vehicles.damageCar(p.car, dt * 14, G);
            p.car.speed *= 0.96;
          } else if (p.onFoot) {
            p.health -= dt * 22;
            if (p.health <= 0) G.busted('Caught by the APD');
          }
          if (d < 3 && p.car && p.car.speed < 4 && this.wanted >= 2) {
            // boxed in at low speed
            G.bustedTimer = (G.bustedTimer || 0) + dt;
            if (G.bustedTimer > 4) G.busted('Boxed in by the APD');
          } else G.bustedTimer = 0;
        }
      }
      // helicopter
      const wantHeli = this.wanted >= 3;
      heli.mesh.visible = wantHeli;
      if (wantHeli) {
        const ha = Math.atan2(px - heli.x, pz - heli.z);
        heli.angle = angleLerp(heli.angle, ha, Math.min(1, dt * 1.2));
        heli.x += Math.sin(heli.angle) * 16 * dt;
        heli.z += Math.cos(heli.angle) * 16 * dt;
        heli.y = 55 + Math.sin(G.time * 0.7) * 3;
        heli.mesh.position.set(heli.x, heli.y, heli.z);
        heli.mesh.rotation.y = heli.angle;
        heli.mesh.userData.rotor.rotation.y += dt * 22;
        const night = G.dayTime < 0.18 || G.dayTime > 0.82;
        heli.mesh.userData.spot.intensity = night ? 380 : 0;
        heli.mesh.userData.beam.visible = night;
        heli.mesh.userData.spot.target.position.set(px - heli.x, -heli.y, pz - heli.z);
        heli.mesh.add(heli.mesh.userData.spot.target);
      }
      // roadblocks at wanted 4-5
      this.blockT += dt;
      if (this.wanted >= 4 && this.blockT > 22) {
        this.blockT = 0;
        const pa = p.car ? p.car.angle : p.angle;
        placeRoadblock(px, pz, pa, G);
      }
      if (this.wanted < 4 && roadblocks.length) clearRoadblocks();
      // spike strip: player car crossing it pops tires
      if (p.car && roadblocks.length) {
        for (const r of roadblocks) {
          if (r.isStrip && dist2(p.car.x, p.car.z, r.x, r.z) < 30) {
            if (Math.abs(p.car.speed) > 3) {
              p.car.speed *= 0.35;
              G.vehicles.damageCar(p.car, 8, G);
              if (G) G.say('Spike strip! Tires blown — the car barely steers');
              spikeHits++;
            }
          }
        }
      }
      // siren
      const wantSiren = this.wanted > 0;
      if (wantSiren !== this.sirenOn) {
        this.sirenOn = wantSiren;
        if (G.audio) G.audio.siren(wantSiren);
      }
    },
  };
}
