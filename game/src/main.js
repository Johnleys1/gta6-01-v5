// main.js — Port Aurelia boot, game loop, camera, day/night, input, modes.
import * as THREE from 'three';
import { clamp, angleLerp } from './util.js';
import { buildCity } from './city.js';
import { createPlayer } from './player.js';
import { createVehicles } from './vehicles.js';
import { createPolice } from './police.js';
import { createWeapons } from './weapons.js';
import { createFx } from './fx.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { AudioEngine } from './audio.js';
import { saveGame, loadGame, clearSave } from './save.js';
import { getShotParam, applyShot } from './shots.js';

const G = {
  THREE, time: 0, dayTime: 0.72, mode: 'menu',
  cash: 500, respect: 0,
  standing: { port: 0, marina: 0, downtown: 0, oldtown: 0, causeway: 0 },
  keys: {}, mouseDown: false, camAngle: 0, bustedTimer: 0,
  shotMode: null, shotFrames: 0, lastMission: 0,
  say(text) { this.hud.say(text); },
  busted(reason) {
    if (this.mode === 'busted') return;
    this.mode = 'busted';
    this.audio.siren(false);
    this.audio.setEngine(0, false);
    const penalty = Math.floor(this.cash * 0.1);
    this.cash -= penalty;
    this.police.reset();
    this.hud.setBusted('BUSTED', reason + '. The APD took ' + '$' + penalty + ' and dropped you at the safehouse. Press ENTER to walk free.');
    this.hud.hideAllMenus();
    this.hud.show('busted');
  },
};

function init() {
  const qp = new URLSearchParams(window.location.search);
  const lowQ = qp.get('quality') === 'low';
  const renderer = new THREE.WebGLRenderer({ antialias: !lowQ });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(lowQ ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = !lowQ;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('game').appendChild(renderer.domElement);
  G.renderer = renderer;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a2436);
  scene.fog = new THREE.Fog(0x2a2a3a, 120, 900);
  G.scene = scene;

  const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 2000);
  G.camera = camera;

  const sun = new THREE.DirectionalLight(0xffd9a0, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
  sun.shadow.camera.far = 600;
  scene.add(sun);
  G.sun = sun;
  const hemi = new THREE.HemisphereLight(0x8fb4ff, 0x3a2a1a, 0.7);
  scene.add(hemi);
  G.hemi = hemi;

  G.city = buildCity(THREE, scene);
  G.fx = createFx(THREE, scene);
  G.player = createPlayer(THREE, scene, G.city, G.city.markers.spawn);
  G.vehicles = createVehicles(THREE, scene, G.city);
  G.police = createPolice(THREE, scene, G.city);
  G.weapons = createWeapons(THREE, scene, G.city);
  G.missions = createMissions(THREE, scene, G.city);
  G.hud = createHud();
  G.audio = new AudioEngine();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  window.addEventListener('keydown', (e) => {
    G.keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
    if (e.code === 'KeyM') startNextMission();
    if (e.code === 'KeyE') interact();
    if (e.code === 'KeyF') interactPlace();
    if (e.code === 'KeyQ') toggleWheel();
    if (e.code === 'Digit1') G.weapons.select(0, G);
    if (e.code === 'Digit2') G.weapons.select(1, G);
    if (e.code === 'Digit3') G.weapons.select(2, G);
    if (e.code === 'Digit4') G.weapons.select(3, G);
    if (e.code === 'KeyR') toggleRadio();
    if (e.code === 'KeyN') { const n = G.audio.nextStation(); G.say('Radio: ' + n); }
    if (e.code === 'KeyC') callDriver();
    if (e.code === 'KeyH') callHacker();
    if (e.code === 'Escape') togglePause();
    if (e.code === 'Enter' && G.mode === 'busted') respawn();
    if (e.code === 'Enter' && G.mode === 'briefing') closeBriefing();
  });
  window.addEventListener('keyup', (e) => { G.keys[e.code] = false; });
  window.addEventListener('mousedown', (e) => {
    if (e.target.closest('button') || e.target.closest('.menu')) return;
    G.audio.ensure();
    G.mouseDown = true;
  });
  window.addEventListener('mouseup', () => { G.mouseDown = false; });
  window.addEventListener('error', (e) => {
    const d = document.getElementById('debug');
    if (d) d.textContent = 'Error: ' + e.message;
  });

  // menu buttons
  const newBtn = document.getElementById('btn-new');
  if (newBtn) newBtn.onclick = () => { clearSave(); startGame(false); };
  const contBtn = document.getElementById('btn-continue');
  const saved = loadGame();
  if (contBtn) {
    contBtn.style.display = saved ? 'inline-block' : 'none';
    contBtn.onclick = () => startGame(true);
  }
  const resumeBtn = document.getElementById('btn-resume');
  if (resumeBtn) resumeBtn.onclick = () => { G.mode = 'playing'; G.hud.hideAllMenus(); };
  const quitBtn = document.getElementById('btn-quit');
  if (quitBtn) quitBtn.onclick = () => { saveGame(G); location.reload(); };
  const briefBtn = document.getElementById('btn-briefing');
  if (briefBtn) briefBtn.onclick = () => closeBriefing();
  const garageClose = document.getElementById('btn-garage-close');
  if (garageClose) garageClose.onclick = () => { G.mode = 'playing'; G.hud.hideAllMenus(); };
  const shopClose = document.getElementById('btn-shop-close');
  if (shopClose) shopClose.onclick = () => { G.mode = 'playing'; G.hud.hideAllMenus(); };
  const resultsClose = document.getElementById('btn-results-close');
  if (resultsClose) resultsClose.onclick = () => { G.mode = 'playing'; G.hud.hideAllMenus(); };

  const shot = getShotParam();
  if (shot) {
    startGame(false);
    applyShot(G, shot);
    G.camAngle = (typeof G.shotCamAngle === 'number') ? G.shotCamAngle : G.player.angle;
    // Re-snap the camera behind the staged player/car, as startGame did
    // before the shot moved them.
    G.camera.position.set(
      G.player.x - Math.sin(G.camAngle) * 8,
      3.8,
      G.player.z - Math.cos(G.camAngle) * 8,
    );
    G.camera.lookAt(G.player.x, 1.2, G.player.z);
  }
  window.__G = G;
  window.__fps = 0;
  renderer.setAnimationLoop(loop);
}

function startGame(continueSave) {
  G.audio.ensure();
  G.hud.hideAllMenus();
  // Snap the chase camera behind the player at once: lerping it down from the
  // menu orbit would swoop over the city for the first seconds of play.
  G.camAngle = G.player.angle;
  const dist = 8, height = 3.8;
  G.camera.position.set(
    G.player.x - Math.sin(G.camAngle) * dist,
    height,
    G.player.z - Math.cos(G.camAngle) * dist,
  );
  G.camera.lookAt(G.player.x, 1.4, G.player.z);
  if (continueSave) {
    const s = loadGame();
    if (s) {
      G.cash = s.cash; G.respect = s.respect; G.standing = s.standing || G.standing;
      G.missions.current = s.mission == null || s.mission < 0 ? 0 : s.mission;
      G.missions.crew = s.crew || G.missions.crew;
      G.player.health = s.health || 100;
      G.player.reset(s.x, s.z, 0);
      if (s.weapons) s.weapons.forEach((w, i) => { G.weapons.weapons[i].reserve = w.reserve; G.weapons.weapons[i].inMag = w.inMag; });
      if (typeof s.dayTime === 'number') G.dayTime = s.dayTime;
      G.say('Welcome back to Port Aurelia, Rook.');
    }
  } else {
    G.player.reset(G.city.markers.spawn.x, G.city.markers.spawn.z, Math.PI);
  }
  G.mode = 'playing';
  G.say('Port Aurelia — press M for your next job, E to steal a car.');
}

function startNextMission() {
  if (G.mode !== 'playing') return;
  if (G.missions.active) { G.say('Finish the current job first.'); return; }
  if (G.missions.current < 0) { G.say('All 10 missions complete. Port Aurelia is yours.'); return; }
  const m = G.missions.list[G.missions.current];
  G.hud.setBriefing(m.title, m.briefing + '  Reward: $' + m.reward.cash + ' + ' + m.reward.respect + ' respect.');
  G.hud.hideAllMenus();
  G.hud.show('briefing');
  G.mode = 'briefing';
  G.pendingMission = G.missions.current;
}
function closeBriefing() {
  G.hud.hideAllMenus();
  G.mode = 'playing';
  if (typeof G.pendingMission === 'number') {
    G.missions.start(G.pendingMission, G);
    G.pendingMission = null;
  }
}
function interact() {
  if (G.mode !== 'playing') return;
  const p = G.player;
  if (p.onFoot) {
    const car = G.vehicles.nearestCar(p.x, p.z, 4.5);
    if (car) {
      p.car = car; p.onFoot = false; p.mesh.visible = false;
      car.parked = false;
      G.audio.ensure();
      G.say('You took the ' + car.name + '. The APD noticed.');
      if (G.police.wanted === 0) G.police.addWanted(1, G);
      return;
    }
  } else if (p.car && Math.abs(p.car.speed) < 3) {
    const car = p.car;
    p.car = null; p.onFoot = true;
    p.x = car.x + Math.sin(car.angle + Math.PI / 2) * 2.5;
    p.z = car.z + Math.cos(car.angle + Math.PI / 2) * 2.5;
    p.mesh.visible = true;
    p.mesh.position.set(p.x, 0, p.z);
    G.audio.setEngine(0, false);
    G.say('On foot.');
  }
}
function interactPlace() {
  if (G.mode !== 'playing') return;
  const p = G.player;
  const near = (m, r) => Math.hypot(p.x - m.x, p.z - m.z) < r;
  if (near(G.city.markers.garage, 12) && p.car) {
    G.mode = 'garage';
    G.hud.setGarage(G);
    G.hud.hideAllMenus();
    G.hud.show('garage');
    return;
  }
  if (near(G.city.markers.ammo, 10) && p.onFoot) {
    G.mode = 'shop';
    G.hud.setShop(G);
    G.hud.hideAllMenus();
    G.hud.show('shop');
    return;
  }
  if (near(G.city.markers.safehouse, 12)) {
    saveGame(G);
    p.health = 100;
    G.say('Saved at the safehouse. Health restored.');
    if (G.audio) G.audio.missionOk();
    return;
  }
  if (near(G.city.markers.marina, 16) && !G.missions.active) {
    G.missions.startSide('race', G);
    return;
  }
  if (near(G.city.markers.downtown, 20) && !G.missions.active && !G.missions.side) {
    G.missions.startSide('taxi', G);
  }
}
function toggleWheel() {
  if (G.mode !== 'playing') return;
  G.weapons.wheelOpen = !G.weapons.wheelOpen;
  const w = document.getElementById('weapon-wheel');
  if (w) {
    w.style.display = G.weapons.wheelOpen ? 'flex' : 'none';
    if (G.weapons.wheelOpen) G.hud.setWheel(G);
  }
}
function toggleRadio() {
  if (G.mode !== 'playing') return;
  G.audio.ensure();
  const on = !G.audio.radioOn;
  G.audio.setRadio(on);
  G.say(on ? 'Radio: ' + G.audio.stations[G.audio.station].name : 'Radio off');
}
function callDriver() {
  if (G.mode !== 'playing' || !G.missions.crew.driver) return;
  if (G.missions.crewCooldown.driver > 0) { G.say('Jax is busy — ' + Math.ceil(G.missions.crewCooldown.driver) + 's'); return; }
  const p = G.player;
  const car = G.vehicles.spawnCar(p.x + 8, p.z + 8, p.angle, 0xff7a2a, 'Jax Comet', false);
  car.upgrade = { engine: 2, armor: 1, nitro: 2 };
  G.missions.crewCooldown.driver = 45;
  G.say('Jax dropped off a tuned Comet. Go!');
}
function callHacker() {
  if (G.mode !== 'playing' || !G.missions.crew.hacker) return;
  if (G.missions.crewCooldown.hacker > 0) { G.say('Nova needs ' + Math.ceil(G.missions.crewCooldown.hacker) + 's to recharge'); return; }
  G.missions.hackerBlind = 20;
  G.missions.crewCooldown.hacker = 60;
  G.police.heat = 0;
  G.say('Nova blinded the APD cameras for 20 seconds — move!');
}
function togglePause() {
  if (G.mode === 'playing') {
    G.mode = 'paused';
    G.hud.hideAllMenus();
    G.hud.show('pause');
  } else if (G.mode === 'paused') {
    G.mode = 'playing';
    G.hud.hideAllMenus();
  }
}
function respawn() {
  const s = G.city.markers.safehouse;
  G.player.reset(s.x, s.z, 0);
  G.mode = 'playing';
  G.hud.hideAllMenus();
  G.say('Back on the streets. The APD forgot your face — for now.');
}

function updateDayNight(dt) {
  if (!G.shotMode) G.dayTime = (G.dayTime + dt / 600) % 1;
  const t = G.dayTime;
  // sun elevation: 0.25 sunrise, 0.5 noon, 0.75 sunset
  const sunA = (t - 0.25) * Math.PI * 2;
  const elev = Math.sin(sunA);
  const sun = G.sun;
  sun.position.set(Math.cos(sunA) * 300, Math.max(8, elev * 300), 180);
  const dayF = clamp(elev * 1.4 + 0.25, 0, 1);
  const duskF = clamp(1 - Math.abs(elev) * 3, 0, 1);
  sun.intensity = 0.25 + dayF * 2.0;
  sun.color.setHSL(0.08 + dayF * 0.04, 0.75 - dayF * 0.35, 0.55 + dayF * 0.15);
  G.hemi.intensity = 0.25 + dayF * 0.5;
  const fog = G.scene.fog;
  if (elev > 0.05) fog.color.setRGB(0.45 + duskF * 0.25, 0.32 + duskF * 0.1, 0.38);
  else fog.color.setRGB(0.06, 0.08, 0.14);
  G.scene.background.copy(fog.color);
  G.city.update(t);
}

function updateCamera(dt) {
  const p = G.player;
  const targetAngle = p.angle;
  G.camAngle = angleLerp(G.camAngle, targetAngle, Math.min(1, dt * 3.2));
  const inCar = !!p.car;
  const dist = inCar ? 11 + Math.abs(p.car.speed) * 0.14 : 7.5;
  const height = inCar ? 4.6 : 3.6;
  const bx = p.x - Math.sin(G.camAngle) * dist;
  const bz = p.z - Math.cos(G.camAngle) * dist;
  const cam = G.camera;
  cam.position.x += (bx - cam.position.x) * Math.min(1, dt * 5);
  cam.position.y += (height - cam.position.y) * Math.min(1, dt * 5);
  cam.position.z += (bz - cam.position.z) * Math.min(1, dt * 5);
  cam.lookAt(p.x + Math.sin(p.angle) * 4, inCar ? 1.6 : 1.4, p.z + Math.cos(p.angle) * 4);
}

let last = performance.now();
let fpsFrames = 0, fpsTime = 0;
function loop() {
  const now = performance.now();
  const dt = clamp((now - last) / 1000, 0.001, 0.05);
  last = now;
  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 1) { window.__fps = Math.round(fpsFrames / fpsTime); fpsFrames = 0; fpsTime = 0; }
  G.time += dt;
  if (G.mode === 'playing') {
    const p = G.player;
    if (p.car) G.vehicles.updatePlayerCar(dt, G.keys, p, G);
    else p.update(dt, G.keys, G.camAngle, G.weapons);
    if (G.mouseDown) {
      const w = G.weapons.cur();
      if (w.auto || G.weapons.cooldown <= 0) G.weapons.fire(G);
    }
    G.vehicles.updateTraffic(dt, G);
    G.police.update(dt, G);
    if (G.missions.hackerBlind > 0) {
      G.police.heat = 0;
      G.police.hiddenT += dt * 3;
    }
    G.weapons.update(dt, G);
    G.missions.update(dt, G);
    G.fx.update(dt);
    updateDayNight(dt);
    updateCamera(dt);
    if (G.missions.current !== G.lastMission) {
      G.lastMission = G.missions.current;
      if (G.missions.current > 0) saveGame(G);
    }
    if (p.health <= 0) {
      if (G.police.wanted > 0) G.busted('The APD caught you flat out');
      else {
        G.mode = 'busted';
        G.hud.setBusted('WASTED', 'You went down in Port Aurelia. Press ENTER to get back up.');
        G.hud.hideAllMenus();
        G.hud.show('busted');
      }
    }
  } else if (G.mode === 'menu') {
    // slow orbit over the city behind the start screen
    const a = G.time * 0.05;
    G.camera.position.set(Math.sin(a) * 320, 120, Math.cos(a) * 320);
    G.camera.lookAt(0, 0, 0);
    updateDayNight(dt);
  }
  // Staging a screenshot counts frames in every mode (the garage shot poses
  // with the garage menu open, which is not 'playing' mode).
  if (G.shotMode) {
    G.shotFrames++;
    if (G.shotFrames > 25 && !window.__shotReady) window.__shotReady = true;
  }
  G.hud.update(G);
  G.renderer.render(G.scene, G.camera);
}

init();
