[![make.fun](https://make.fun/badge.svg)](https://make.fun)
[![make.fun bounty](https://make.fun/bounty/gta6-01/badge.svg)](https://make.fun/bounty/gta6-01)
[![built with make.fun](https://make.fun/built-with.svg)](https://make.fun)

# PORT AURELIA — Open-World Crime

**Bounty:** [Make GTA 6 — make.fun/bounty/gta6-01](https://make.fun/bounty/gta6-01)

An original 3D open-world crime game set in Port Aurelia, a sun-soaked river-delta port city at dusk. Explore five districts on foot and by car, steal cars, outrun the Aurelia Police Department (APD) and its HALO-1 searchlight helicopter, climb the wanted ladder from 1 to 5 stars, and run 10 story missions with a crew of three — getaway driver Jax, hacker Nova, and lookout Sable — to take the docks from port boss Viktor Kroll.

## What is in the game

- **A living city:** container port with cranes, marina with yachts, neon downtown, market old town, tidal causeway and beach — traffic, pedestrians, shops, safehouses and a garage.
- **Driving:** weighty arcade car physics, carjacking, handbrake slides, nitro, garage upgrades (engine / armor / nitro) that change how cars feel.
- **Police:** APD dispatch with patrol cars, RAM/PIT pursuit units, roadblocks with spike strips, and the HALO-1 helicopter with a night searchlight. Break line of sight to cool your wanted level.
- **Combat:** weapon wheel (fists, pistol, SMG, shotgun), ammo pickups, muzzle flashes, tracers, and cars that catch fire, burn and explode.
- **Missions & crew:** 10 staged story missions, street races on the causeway, taxi fares and timed deliveries; district standing and respect unlock new jobs, weapons and districts.
- **Presentation:** dusk-to-night cycle, rain-slick neon streets, synthesized engine / siren / radio audio (3 stations), HUD with a live minimap, saves in localStorage.

## Play it

Serve `game/` with any static file server and open `game/index.html` in desktop Chrome — no network, no build step:

```sh
cd game && python3 -m http.server 8080
# open http://localhost:8080
```

Controls: WASD move/drive · mouse click shoot · E steal & exit car · Q weapon wheel (1–4) · Space handbrake · Shift nitro · M next mission · F interact (garage / shop / safehouse) · C call Jax's car · H Nova blinds the APD · R radio · Esc pause.

## Entry

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the kit's `vendor/makefun-game.ts`. Three.js is vendored as `game/vendor/three.module.min.js`.

Built with make.fun — referral: https://make.fun/r/2vn3gr8z
