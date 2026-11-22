// player.js — on-foot movement, camera-relative controls, character mesh.
import { clamp, wrapAngle, angleLerp } from './util.js';

export function makePlayerMesh(THREE) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xc98d64, roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0xff5a3c, roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2a3550, roughness: 0.85 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.9, 10), shirt);
  body.position.y = 1.05; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), skin);
  head.position.y = 1.75; head.castShadow = true; g.add(head);
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.29, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairM.position.y = 1.78; g.add(hairM);
  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.8, 8), pants);
  legL.position.set(-0.16, 0.4, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.16; g.add(legR);
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.75, 8), shirt);
  armL.position.set(-0.48, 1.05, 0); armL.rotation.z = 0.15; g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.48; armR.rotation.z = -0.15; g.add(armR);
  g.userData = { legL, legR, armL, armR };
  return g;
}

export function createPlayer(THREE, scene, city, start) {
  const mesh = makePlayerMesh(THREE);
  mesh.position.set(start.x, 0, start.z);
  scene.add(mesh);
  return {
    mesh, x: start.x, z: start.z, angle: start.angle || 0,
    speed: 0, health: 100, onFoot: true, car: null,
    walkPhase: 0,
    reset(x, z, angle) {
      this.x = x; this.z = z; this.angle = angle || 0;
      this.speed = 0; this.health = 100; this.onFoot = true; this.car = null;
      this.mesh.position.set(x, 0, z);
      this.mesh.visible = true;
    },
    collide(nx, nz) {
      for (const c of city.colliders) {
        if (nx > c.minX - 0.6 && nx < c.maxX + 0.6 && nz > c.minZ - 0.6 && nz < c.maxZ + 0.6) return true;
      }
      return nx < -620 || nx > 620 || nz < -620 || nz > 620;
    },
    update(dt, keys, camAngle, weapons) {
      if (!this.onFoot) return;
      let ix = 0, iz = 0;
      if (keys['KeyW'] || keys['ArrowUp']) iz -= 1;
      if (keys['KeyS'] || keys['ArrowDown']) iz += 1;
      if (keys['KeyA'] || keys['ArrowLeft']) ix -= 1;
      if (keys['KeyD'] || keys['ArrowRight']) ix += 1;
      const run = keys['ShiftLeft'] || keys['ShiftRight'];
      const maxSp = run ? 9 : 5;
      if (ix || iz) {
        const len = Math.hypot(ix, iz); ix /= len; iz /= len;
        const sin = Math.sin(camAngle), cos = Math.cos(camAngle);
        const wx = ix * cos - iz * sin, wz = ix * sin + iz * cos;
        const target = Math.atan2(wx, wz);
        this.angle = angleLerp(this.angle, target, Math.min(1, dt * 12));
        this.speed = Math.min(maxSp, this.speed + dt * 30);
        const nx = this.x + Math.sin(this.angle) * this.speed * dt;
        const nz = this.z + Math.cos(this.angle) * this.speed * dt;
        if (!this.collide(nx, this.z)) this.x = nx;
        if (!this.collide(this.x, nz)) this.z = nz;
        this.walkPhase += dt * this.speed * 1.6;
      } else {
        this.speed = Math.max(0, this.speed - dt * 30);
      }
      this.mesh.position.set(this.x, 0, this.z);
      this.mesh.rotation.y = this.angle;
      const sw = Math.sin(this.walkPhase) * 0.5 * clamp(this.speed / 9, 0, 1);
      this.mesh.userData.legL.rotation.x = sw;
      this.mesh.userData.legR.rotation.x = -sw;
      this.mesh.userData.armL.rotation.x = -sw * 0.7;
      this.mesh.userData.armR.rotation.x = sw * 0.7;
      if (weapons) weapons.updateAim(this);
    },
  };
}
