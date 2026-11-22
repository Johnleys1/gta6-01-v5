// save.js — Port Aurelia saves persist in localStorage.
const KEY = 'port-aurelia-save-v5';

export function saveGame(G) {
  try {
    const car = G.player.car;
    const data = {
      cash: G.cash, respect: G.respect, standing: G.standing,
      mission: G.missions.current, crew: G.missions.crew,
      health: G.player.health,
      x: G.player.x, z: G.player.z,
      weapons: G.weapons.weapons.map((w) => ({ reserve: w.reserve, inMag: w.inMag })),
      carUpgrade: car ? car.upgrade : null,
      dayTime: G.dayTime,
      savedAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) { return false; }
}
export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) {}
}
