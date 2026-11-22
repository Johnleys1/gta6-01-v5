// shots.js — stages deterministic scenes for the 4 screenshots.
// The game reads ?shot=cover|street|race|garage; each pose shows several
// systems at once, and the page sets window.__shotReady when posed.
export function getShotParam() {
  try {
    const q = new URLSearchParams(window.location.search);
    return q.get('shot') || null;
  } catch (e) { return null; }
}

export function applyShot(G, shot) {
  const THREE = G.THREE;
  if (shot === 'cover') {
    // Night chase at wanted 4: HALO-1 overhead, roadblock + spike strip ahead,
    // a burning wreck beside the road, HUD + minimap + objective visible.
    G.dayTime = 0.94;
    const car = G.player.car || G.vehicles.nearestCar(0, 0, 9999);
    G.player.car = car; G.player.onFoot = false; G.player.mesh.visible = false;
    car.x = 0; car.z = 60; car.angle = Math.PI; car.speed = 18;
    car.mesh.position.set(0, 0, 60); car.mesh.rotation.y = Math.PI;
    G.player.x = 0; G.player.z = 60; G.player.angle = Math.PI;
    G.police.wanted = 4; G.police.heat = 80;
    G.police.blockT = 99;
    const wreck = G.vehicles.spawnCar(8, 20, 0.4, 0xd23c2e, 'Wreck', false);
    wreck.hp = 20;
    G.vehicles.damageCar(wreck, 5, G);
    // HALO-1 starts ahead of the player so its searchlight reads in frame.
    G.police.heli.x = 15; G.police.heli.z = -30; G.police.heli.y = 40;
    G.missions.start(6, G);
    G.missions.chaseCar = wreck;
    G.hud.say('APD roadblock ahead — spike strip on the road!');
  } else if (shot === 'street') {
    // Dusk in the old town, on foot, weapon wheel open, crew beside the player.
    G.dayTime = 0.72;
    G.player.reset(-40, 420, Math.PI * 0.75);
    G.weapons.select(2, G);
    G.weapons.wheelOpen = true;
    G.hud.setWheel(G);
    const wheel = document.getElementById('weapon-wheel');
    if (wheel) wheel.style.display = 'flex';
    G.missions.start(1, G);
    G.hud.say('Old town at dusk — Jax is waiting by the corner.');
  } else if (shot === 'race') {
    // Street race on the tidal causeway at dusk: three cars, marina behind.
    G.dayTime = 0.74;
    const car = G.player.car || G.vehicles.nearestCar(480, -100, 9999);
    G.player.car = car; G.player.onFoot = false; G.player.mesh.visible = false;
    car.x = 480; car.z = -380; car.angle = 0; car.speed = 22;
    car.mesh.position.set(480, 0, -380); car.mesh.rotation.y = 0;
    G.player.x = 480; G.player.z = -380; G.player.angle = 0;
    // Rivals start just ahead of the player, same heading, so all three cars
    // read in frame: the player drives south (+z) toward the first checkpoint.
    // 30 units ahead keeps them clear of the camera at screenshot time.
    const r1 = G.vehicles.spawnCar(474, -350, 0, 0x2e6db0, 'Rival', false);
    const r2 = G.vehicles.spawnCar(486, -350, 0, 0xe8c832, 'Rival', false);
    r1.speed = 20; r2.speed = 20;
    G.missions.startSide('race', G);
    G.hud.say('Causeway Sprint — six checkpoints, beat the clock.');
  } else if (shot === 'garage') {
    // Garage upgrade screen with a tuned car.
    G.dayTime = 0.8;
    const car = G.player.car || G.vehicles.nearestCar(60, 252, 9999);
    G.player.car = car; G.player.onFoot = false; G.player.mesh.visible = false;
    car.x = 60; car.z = 240; car.angle = Math.PI; car.speed = 0;
    car.mesh.position.set(60, 0, 240); car.mesh.rotation.y = Math.PI;
    car.upgrade = { engine: 2, armor: 1, nitro: 2 };
    G.player.x = 60; G.player.z = 240; G.player.angle = Math.PI;
    // 3/4 view of the tuned car beside the garage panel.
    G.shotCamAngle = Math.PI + 0.7;
    G.cash = 12450;
    G.mode = 'garage';
    G.hud.setGarage(G);
    G.hud.show('garage');
    G.hud.say('Garage — engine, armor and nitro upgrades.');
  }
  G.shotMode = shot;
  G.shotFrames = 0;
}
