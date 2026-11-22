// vehicles.js — car models, arcade driving, traffic AI, carjacking, nitro.
import { mulberry32, rand, pick, clamp, wrapAngle, angleLerp, dist2 } from './util.js';

const CAR_COLORS = [0xd23c2e, 0x2e6db0, 0xe8c832, 0x2e9e5b, 0xe8e8e8, 0x222222, 0x7d3c98, 0xff7a2a];
const CAR_NAMES = ['Comet', 'Vortex', 'Sunrise', 'Falcon', 'Bison', 'Stallion', 'Reaper', 'Duchess'];

export function makeCarMesh(THREE, color, isPolice) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.1, metalness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.65, 4.4), paint);
  body.position.y = 0.65; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.2), glass);
  cabin.position.set(0, 1.25, -0.2); cabin.castShadow = true; g.add(cabin);
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.3, 0.3), dark);
  bumperF.position.set(0, 0.45, 2.25); g.add(bumperF);
  const bumperB = bumperF.clone(); bumperB.position.z = -2.25; g.add(bumperB);
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffdf80, emissiveIntensity: 1.2 });
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.1), lightMat);
  hl.position.set(-0.6, 0.75, 2.22); g.add(hl);
  const hr = hl.clone(); hr.position.x = 0.6; g.add(hr);
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xaa1111, emissive: 0x880000, emissiveIntensity: 1 });
  const tl = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.1), tailMat);
  tl.position.set(-0.6, 0.75, -2.22); g.add(tl);
  const tr = tl.clone(); tr.position.x = 0.6; g.add(tr);
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.95 });
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.38, wz);
    g.add(w); wheels.push(w);
  }
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }));
    bar.position.set(0, 1.62, -0.2); g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.42),
      new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 3 }));
    red.position.set(-0.3, 1.66, -0.2); g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x2244ff, emissive: 0x2244ff, emissiveIntensity: 3 }));
    blue.position.set(0.3, 1.66, -0.2); g.add(blue);
    g.userData.lightRed = red; g.userData.lightBlue = blue;
  }
  g.userData.wheels = wheels;
  return g;
}

export function createVehicles(THREE, scene, city) {
  const rng = mulberry32(99173);
  const cars = []; // player-drivable + parked
  const traffic = [];
  const wrecks = [];

  function spawnCar(x, z, angle, color, name, isParked) {
    const mesh = makeCarMesh(THREE, color, false);
    mesh.position.set(x, 0, z); mesh.rotation.y = angle;
    scene.add(mesh);
    const car = {
      mesh, x, z, angle, speed: 0, color, name,
      hp: 100, burning: false, burnT: 0, exploded: false,
      parked: !!isParked, driver: null, nitro: 100,
      upgrade: { engine: 0, armor: 0, nitro: 0 },
    };
    cars.push(car);
    return car;
  }
  // parked cars along streets
  for (let i = 0; i < 26; i++) {
    const gx = -600 + Math.floor(rng() * 11) * 120;
    const gz = -600 + Math.floor(rng() * 11) * 120;
    const side = rng() < 0.5 ? 1 : -1;
    spawnCar(gx + side * 10, gz + rand(rng, -40, 40), rng() < 0.5 ? 0 : Math.PI, pick(rng, CAR_COLORS), pick(rng, CAR_NAMES), true);
  }
  // traffic cars on loops
  const trafficDefs = [];
  for (let i = 0; i < 14; i++) {
    const gx = -600 + Math.floor(rng() * 11) * 120;
    const mesh = makeCarMesh(THREE, pick(rng, CAR_COLORS), false);
    scene.add(mesh);
    const t = {
      mesh, x: gx, z: -600 + rng() * 1200, angle: rng() < 0.5 ? 0 : Math.PI,
      speed: rand(rng, 9, 15), lane: gx, vertical: rng() < 0.5, color: 0,
      target: null, stuck: 0,
    };
    traffic.push(t);
  }

  function collideCar(x, z) {
    for (const c of city.colliders) {
      if (x > c.minX - 1.4 && x < c.maxX + 1.4 && z > c.minZ - 1.4 && z < c.maxZ + 1.4) return true;
    }
    return x < -615 || x > 615 || z < -615 || z > 615;
  }

  return {
    cars, traffic, wrecks,
    spawnCar,
    nearestCar(x, z, maxD) {
      let best = null, bd = maxD * maxD;
      for (const c of cars) {
        if (c.exploded) continue;
        const d = dist2(x, z, c.x, c.z);
        if (d < bd) { bd = d; best = c; }
      }
      return best;
    },
    damageCar(car, dmg, G) {
      car.hp -= dmg;
      if (car.hp <= 35 && !car.burning) {
        car.burning = true; car.burnT = 0;
        if (G && G.fx) G.fx.startFire(car);
      }
      if (car.hp <= 0 && !car.exploded) this.explodeCar(car, G);
    },
    explodeCar(car, G) {
      car.exploded = true; car.burning = false;
      if (G && G.fx) G.fx.explodeAt(car.x, car.z, 12);
      if (G && G.audio) G.audio.explosion();
      car.mesh.visible = false;
      const wreck = { x: car.x, z: car.z, t: 0 };
      wrecks.push(wreck);
      if (G && G.fx) G.fx.startWreckSmoke(car.x, car.z);
    },
    updatePlayerCar(dt, keys, player, G) {
      const car = player.car;
      if (!car) return;
      const up = 1 + car.upgrade.engine * 0.25;
      const maxF = 34 * up, maxR = 14;
      let throttle = 0;
      if (keys['KeyW'] || keys['ArrowUp']) throttle = 1;
      if (keys['KeyS'] || keys['ArrowDown']) throttle = -1;
      const hand = keys['Space'];
      const nitro = (keys['ShiftLeft'] || keys['ShiftRight']) && car.nitro > 0;
      if (nitro) car.nitro = Math.max(0, car.nitro - dt * 35);
      else car.nitro = Math.min(100, car.nitro + dt * 4);
      const accel = 16 * up * (nitro ? 1.7 : 1);
      if (throttle > 0) car.speed = Math.min(maxF * (nitro ? 1.35 : 1), car.speed + accel * dt);
      else if (throttle < 0) {
        if (car.speed > 0.5) car.speed = Math.max(0, car.speed - 26 * dt);
        else car.speed = Math.max(-maxR, car.speed - 10 * dt);
      } else {
        car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
      }
      let steer = 0;
      if (keys['KeyA'] || keys['ArrowLeft']) steer = 1;
      if (keys['KeyD'] || keys['ArrowRight']) steer = -1;
      const steerAmt = steer * clamp(Math.abs(car.speed) / 12, 0, 1) * (car.speed >= 0 ? 1 : -1);
      car.angle += steerAmt * dt * (hand ? 2.1 : 1.35) * (1 - clamp(Math.abs(car.speed) / 60, 0, 0.45));
      if (hand) car.speed *= (1 - dt * 0.7);
      const nx = car.x + Math.sin(car.angle) * car.speed * dt;
      const nz = car.z + Math.cos(car.angle) * car.speed * dt;
      if (collideCar(nx, car.z)) { car.speed *= -0.25; this.damageCar(car, Math.abs(car.speed) * 0.4, G); }
      else car.x = nx;
      if (collideCar(car.x, nz)) { car.speed *= -0.25; this.damageCar(car, Math.abs(car.speed) * 0.4, G); }
      else car.z = nz;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.angle;
      const spin = car.speed * dt * 2.6;
      for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
      player.x = car.x; player.z = car.z; player.angle = car.angle;
      if (G && G.audio) G.audio.setEngine(clamp(Math.abs(car.speed) / 34, 0, 1), true);
    },
    updateTraffic(dt, G) {
      for (const t of traffic) {
        const dir = t.vertical ? 0 : Math.PI / 2;
        const targetAngle = t.vertical ? (t.angle > 0 ? Math.PI : 0) : (t.angle > 0 ? Math.PI / 2 : -Math.PI / 2);
        t.angle = angleLerp(t.angle, targetAngle, Math.min(1, dt * 2));
        let sp = t.speed;
        // slow for player car ahead
        if (G && G.player && G.player.car) {
          const d = dist2(t.x, t.z, G.player.car.x, G.player.car.z);
          if (d < 100) sp *= 0.35;
        }
        t.x += Math.sin(t.angle) * sp * dt;
        t.z += Math.cos(t.angle) * sp * dt;
        if (t.vertical && (t.z > 610 || t.z < -610)) { t.z = clamp(t.z, -610, 610); t.angle += Math.PI; }
        if (!t.vertical && (t.x > 610 || t.x < -610)) { t.x = clamp(t.x, -610, 610); t.angle += Math.PI; }
        t.mesh.position.set(t.x, 0, t.z);
        t.mesh.rotation.y = t.angle;
        for (const w of t.mesh.userData.wheels) w.rotation.x += sp * dt * 2.6;
      }
      // burning cars tick
      for (const c of cars) {
        if (c.burning && !c.exploded) {
          c.burnT += dt;
          if (G && G.fx) G.fx.burnTick(c, dt);
          if (c.burnT > 6) this.explodeCar(c, G);
        }
      }
    },
  };
}
