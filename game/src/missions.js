// missions.js — 10 staged story missions, crew recruitment + abilities,
// and side activities (street races, taxi fares, timed deliveries).
import { clamp, dist2, fmtCash } from './util.js';

const MISSIONS = [
  { id: 1, title: 'First Wheels', district: 'marina', briefing: 'You just docked in Port Aurelia with nothing but a name: Rook. Steal a car and bring it to the marina crew.', reward: { cash: 300, respect: 10, standing: 'marina' }, steps: [{ type: 'car' }, { type: 'goto', x: -140, z: -300, r: 14, text: 'Drive to the marina crew' }] },
  { id: 2, title: 'Crew Call', district: 'oldtown', briefing: 'Dante wants a getaway driver. Pick up Jax in the old town — he drives like the devil owes him money.', reward: { cash: 400, respect: 12, standing: 'oldtown' }, steps: [{ type: 'goto', x: 120, z: 420, r: 12, text: 'Pick up Jax in the old town' }] },
  { id: 3, title: 'Harbor Run', district: 'port', briefing: 'A package for the docks. The APD is watching the port road — get it there in 90 seconds, no questions.', reward: { cash: 600, respect: 15, standing: 'port' }, steps: [{ type: 'goto', x: -480, z: 0, r: 14, text: 'Deliver the package to the docks', time: 90 }] },
  { id: 4, title: 'Eyes Up', district: 'downtown', briefing: 'Nova the hacker will join if you can reach her downtown without the APD pinning you down. Stay moving for 30 seconds.', reward: { cash: 500, respect: 14, standing: 'downtown' }, steps: [{ type: 'goto', x: 0, z: 0, r: 18, text: 'Reach the downtown drop' }, { type: 'survive', time: 30, text: 'Stay free for 30 seconds — Nova is watching' }] },
  { id: 5, title: 'Causeway Sprint', district: 'causeway', briefing: 'The causeway at dusk. Six checkpoints, one straight shot of pride. Beat the clock.', reward: { cash: 800, respect: 18, standing: 'causeway' }, steps: [{ type: 'race', points: [[480, -300], [560, -200], [560, 100], [480, 300], [380, 100], [420, -200]], time: 110, text: 'Race the causeway checkpoints' }] },
  { id: 6, title: 'Lookout', district: 'marina', briefing: 'Sable sees everything from the marina rooftops. Tail Kroll’s courier along the boardwalk for 30 seconds — do not let him spot you.', reward: { cash: 650, respect: 16, standing: 'marina' }, steps: [{ type: 'follow', time: 30, text: 'Tail the courier — stay close, stay quiet' }] },
  { id: 7, title: 'Dockside Heat', district: 'port', briefing: 'Kroll’s courier car is running product through the port. Wreck it. The APD will come — let them.', reward: { cash: 1000, respect: 22, standing: 'port' }, steps: [{ type: 'chase', text: 'Wreck the courier car' }] },
  { id: 8, title: 'Night Shift', district: 'downtown', briefing: 'The whole APD is awake tonight. Survive wanted level 3 for 60 seconds and they will learn your name.', reward: { cash: 900, respect: 20, standing: 'downtown' }, steps: [{ type: 'survive', time: 60, wanted: 3, text: 'Survive wanted 3 for 60 seconds' }] },
  { id: 9, title: 'The Long Con', district: 'oldtown', briefing: 'Three drops, three districts, one night. Old town, marina, downtown — 150 seconds. No mistakes.', reward: { cash: 1400, respect: 26, standing: 'oldtown' }, steps: [{ type: 'goto', x: 180, z: 480, r: 12, text: 'Drop 1 of 3: old town', time: 150 }, { type: 'goto', x: -200, z: -420, r: 12, text: 'Drop 2 of 3: marina' }, { type: 'goto', x: 120, z: -120, r: 12, text: 'Drop 3 of 3: downtown' }] },
  { id: 10, title: 'King of the Docks', district: 'port', briefing: 'This is it. Wreck four of Kroll’s dock cars, then walk into his warehouse and end it.', reward: { cash: 2500, respect: 40, standing: 'port' }, steps: [{ type: 'takedown', count: 4, text: 'Wreck 4 of Kroll’s dock cars' }, { type: 'goto', x: -520, z: -180, r: 14, text: 'Walk into Kroll’s warehouse' }] },
];

export function createMissions(THREE, scene, city) {
  // glowing marker: cylinder + beam
  const markerMat = new THREE.MeshStandardMaterial({ color: 0xffd23c, emissive: 0xffb300, emissiveIntensity: 1.6, transparent: true, opacity: 0.85 });
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.22, depthWrite: false });
  const marker = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.5, 24), markerMat);
  ring.position.y = 0.3; marker.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 60, 12, 1, true), beamMat);
  beam.position.y = 30; marker.add(beam);
  marker.visible = false;
  scene.add(marker);
  const targetCar = { mesh: null };

  const S = {
    list: MISSIONS,
    current: 0, // index into MISSIONS; -1 = all done
    step: 0,
    active: false,
    timer: 0,
    stepT: 0,
    followT: 0,
    takedown: 0,
    raceIdx: 0,
    chaseCar: null,
    crew: { driver: false, hacker: false, lookout: false },
    crewCooldown: { driver: 0, hacker: 0 },
    hackerBlind: 0,
    side: null, // {type, ...} active side activity
    marker,
    objectiveText() {
      if (this.side) return this.side.text;
      if (!this.active || this.current < 0) return 'Free roam — press M for the next job';
      const m = MISSIONS[this.current];
      const st = m.steps[this.step];
      return st.text || m.title;
    },
    start(i, G) {
      if (i < 0 || i >= MISSIONS.length) return;
      this.current = i; this.step = 0; this.active = true;
      this.timer = 0; this.stepT = 0; this.takedown = 0; this.raceIdx = 0; this.chaseCar = null;
      const m = MISSIONS[i];
      if (G) G.say('Mission: ' + m.title + ' — ' + m.briefing);
      if (G && G.audio) G.audio.blip(523, 0.2, 'triangle', 0.2);
      this.placeMarker(G);
    },
    placeMarker(G) {
      if (!this.active || this.current < 0) { marker.visible = false; return; }
      const st = MISSIONS[this.current].steps[this.step];
      if (st.type === 'goto' || st.type === 'deliver') {
        marker.position.set(st.x, 0, st.z);
        marker.visible = true;
      } else if (st.type === 'race') {
        const p = st.points[this.raceIdx];
        marker.position.set(p[0], 0, p[1]);
        marker.visible = true;
      } else if (st.type === 'follow' || st.type === 'chase') {
        marker.visible = false;
        this.ensureChaseCar(G, st.type);
      } else {
        marker.visible = false;
      }
    },
    ensureChaseCar(G, type) {
      if (this.chaseCar && !this.chaseCar.exploded) return;
      const p = G.player;
      const x = p.x + 40, z = p.z + 40;
      const car = G.vehicles.spawnCar(x, z, 0, 0x111111, 'Kroll Courier', false);
      car.hp = type === 'chase' ? 120 : 9999;
      this.chaseCar = car;
      if (type === 'follow') {
        // courier drives a slow loop along the marina
        car.followLoop = true;
      }
    },
    nextStep(G) {
      const m = MISSIONS[this.current];
      this.step++;
      this.stepT = 0;
      if (this.step >= m.steps.length) return this.complete(G);
      this.placeMarker(G);
    },
    complete(G) {
      const m = MISSIONS[this.current];
      G.cash += m.reward.cash;
      G.respect = Math.min(100, G.respect + m.reward.respect);
      G.standing[m.reward.standing] = Math.min(100, (G.standing[m.reward.standing] || 0) + 15);
      G.say('Mission complete: ' + m.title + ' — +' + fmtCash(m.reward.cash) + ', +' + m.reward.respect + ' respect');
      if (G.audio) G.audio.missionOk();
      if (m.id === 2) { this.crew.driver = true; G.say('Jax joined your crew — press C to call his car'); }
      if (m.id === 4) { this.crew.hacker = true; G.say('Nova joined your crew — press H to blind the APD'); }
      if (m.id === 6) { this.crew.lookout = true; G.say('Sable joined your crew — targets are marked on your minimap'); }
      this.active = false;
      marker.visible = false;
      this.current++;
      if (this.current >= MISSIONS.length) {
        this.current = -1;
        G.say('All 10 missions complete. Port Aurelia is yours, Rook.');
        return;
      }
      G.say('Next job ready — press M to start: ' + MISSIONS[this.current].title);
    },
    fail(G, why) {
      if (G.audio) G.audio.missionFail();
      G.say('Mission failed: ' + why + ' — press M to retry');
      this.active = false;
      marker.visible = false;
      this.chaseCar = null;
    },
    startSide(type, G) {
      if (this.active || this.side) return;
      if (type === 'race') {
        this.side = { type: 'race', points: [[480, -300], [560, -200], [560, 100], [480, 300], [380, 100], [420, -200]], idx: 0, time: 100, text: 'Street race — hit every checkpoint' };
        marker.position.set(480, 0, -300); marker.visible = true;
        G.say('Street race! Hit every checkpoint before the clock runs out.');
      } else if (type === 'taxi') {
        this.side = { type: 'taxi', x: 120 + Math.random() * 200 - 100, z: 120 + Math.random() * 200 - 100, time: 75, text: 'Taxi fare — drop the passenger off' };
        marker.position.set(this.side.x, 0, this.side.z); marker.visible = true;
        G.say('Taxi fare — get the passenger there in 75 seconds.');
      }
    },
    update(dt, G) {
      this.crewCooldown.driver = Math.max(0, this.crewCooldown.driver - dt);
      this.crewCooldown.hacker = Math.max(0, this.crewCooldown.hacker - dt);
      if (this.hackerBlind > 0) this.hackerBlind -= dt;
      marker.rotation.y += dt;
      marker.position.y = Math.sin(G.time * 2) * 0.4;
      const p = G.player;
      // side activity
      if (this.side) {
        const s = this.side;
        s.time -= dt;
        if (s.time <= 0) { G.say('Too slow — the fare is gone'); this.side = null; marker.visible = false; return; }
        if (s.type === 'race') {
          const pt = s.points[s.idx];
          if (dist2(p.x, p.z, pt[0], pt[1]) < 144) {
            s.idx++;
            if (s.idx >= s.points.length) {
              G.cash += 700; G.respect = Math.min(100, G.respect + 8);
              G.say('Race won! +' + fmtCash(700));
              if (G.audio) G.audio.missionOk();
              this.side = null; marker.visible = false; return;
            }
            const n = s.points[s.idx];
            marker.position.set(n[0], 0, n[1]);
          }
        } else if (s.type === 'taxi') {
          if (dist2(p.x, p.z, s.x, s.z) < 100) {
            G.cash += 250; G.respect = Math.min(100, G.respect + 3);
            G.say('Fare delivered. +' + fmtCash(250));
            this.side = null; marker.visible = false; return;
          }
        }
        return;
      }
      if (!this.active || this.current < 0) return;
      const m = MISSIONS[this.current];
      const st = m.steps[this.step];
      this.stepT += dt;
      if (st.time) {
        this.timer += dt;
        if (this.timer > st.time) { this.fail(G, 'Out of time'); return; }
      }
      switch (st.type) {
        case 'car':
          if (p.car) this.nextStep(G);
          break;
        case 'goto': {
          if (dist2(p.x, p.z, st.x, st.z) < st.r * st.r) this.nextStep(G);
          break;
        }
        case 'survive': {
          if (st.wanted && G.police.wanted < st.wanted) {
            G.police.addWanted(st.wanted - G.police.wanted, G);
          }
          if (this.stepT > st.time) this.nextStep(G);
          break;
        }
        case 'race': {
          const pt = st.points[this.raceIdx];
          if (dist2(p.x, p.z, pt[0], pt[1]) < 144) {
            this.raceIdx++;
            if (this.raceIdx >= st.points.length) { this.nextStep(G); break; }
            const n = st.points[this.raceIdx];
            marker.position.set(n[0], 0, n[1]);
          }
          break;
        }
        case 'follow': {
          if (this.chaseCar) {
            const c = this.chaseCar;
            // courier cruises along the marina
            c.angle += Math.sin(G.time * 0.3) * 0.2 * dt;
            c.x += Math.sin(c.angle) * 8 * dt;
            c.z += Math.cos(c.angle) * 8 * dt;
            c.mesh.position.set(c.x, 0, c.z);
            c.mesh.rotation.y = c.angle;
            const d = Math.sqrt(dist2(p.x, p.z, c.x, c.z));
            if (d < 40) this.followT += dt;
            else this.followT = Math.max(0, this.followT - dt * 2);
            if (d > 90) { this.fail(G, 'You lost the courier'); return; }
            if (this.followT > st.time) this.nextStep(G);
          }
          break;
        }
        case 'chase': {
          if (this.chaseCar) {
            const c = this.chaseCar;
            // courier flees from the player
            const a = Math.atan2(c.x - p.x, c.z - p.z);
            c.angle = a;
            c.x += Math.sin(a) * 13 * dt;
            c.z += Math.cos(a) * 13 * dt;
            c.x = clamp(c.x, -600, 600); c.z = clamp(c.z, -600, 600);
            c.mesh.position.set(c.x, 0, c.z);
            c.mesh.rotation.y = c.angle;
            if (c.exploded) this.nextStep(G);
          }
          break;
        }
        case 'takedown': {
          // count exploded dock cars near the port
          let n = 0;
          for (const c of G.vehicles.cars) {
            if (c.exploded && c.x < -250 && Math.abs(c.z) < 300) n++;
          }
          this.takedown = Math.max(this.takedown, n);
          if (this.takedown >= st.count) this.nextStep(G);
          break;
        }
      }
    },
  };
  return S;
}
