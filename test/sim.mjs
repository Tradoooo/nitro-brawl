// Simulateur node sans navigateur : fait tourner physique + IA + armes et rapporte des stats.
// Usage : node test/sim.mjs [frames] [mapIndex]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FRAMES = parseInt(process.argv[2] || '3600', 10);
const MAP = parseInt(process.argv[3] || '0', 10);
const MODE = process.argv[4] || 'deathmatch';
const SRC = resolve(import.meta.dirname, '../src');
const FILES = ['math.js', 'util.js', 'mesh.js', 'maps.js', 'arena.js', 'kart.js', 'pickups.js', 'weapons.js', 'bots.js', 'fx.js'];

const win = { addEventListener() {}, NB: undefined };
globalThis.window = win;
try { Object.defineProperty(globalThis, 'navigator', { value: { maxTouchPoints: 0, getGamepads: null }, configurable: true }); } catch (e) { /* node >=21 : navigator déjà présent */ }
for (const f of FILES) {
  const code = readFileSync(resolve(SRC, f), 'utf8');
  new Function('window', code)(win);
}
const NB = win.NB;

const g = {
  phase: 'playing', mode: 'deathmatch', time: 0, clock: 999, events: [], karts: [],
  projectiles: [], hazards: [], shake: 0, difficulty: 'pro', matchTime: 999
};
NB.game = g;
const arena = NB.arena.build(NB.maps.list[MAP]);
g.arena = arena;
g.map = NB.maps.list[MAP];
for (let i = 0; i < 8; i++) {
  const sp = arena.spawns[i];
  const k = NB.kart.create({
    id: i, name: 'B' + i, color: [1, 1, 1], accent: [1, 1, 1], isPlayer: false, isBot: true,
    pos: [sp[0], sp[1]], yaw: 0, arena, difficulty: 'pro'
  });
  k.invulnT = 0;
  if ((process.argv[4] || 'deathmatch') === 'elim') k.lives = 1;
  g.karts.push(k);
  NB.bots.attach(k, arena, 'pro');
}
NB.weapons.init();
NB.pickups.init(arena);
NB.fx.init();

const dt = 1 / 60;
let shots = 0, kills = 0, pickupsTaken = 0, boosts = 0;
const speedSum = { v: 0, n: 0 };
for (let f = 0; f < FRAMES; f++) {
  g.time += dt;
  for (const k of g.karts) {
    const inp = k.alive ? (NB.bots.update(k, dt) || { throttle: 0, brake: 0, steer: 0, drift: false, fire: false, use: false }) : null;
    if (inp) {
      if (inp.fire && k.weapon && !NB.weapons.cooldown(k)) { NB.weapons.fire(k); shots++; }
      if (inp.use) { if (NB.weapons.activate(k)) boosts++; }
    }
    NB.kart.update(k, inp || { throttle: 0, brake: 0, steer: 0, drift: false, fire: false, use: false }, dt);
    speedSum.v += Math.abs(k.speed); speedSum.n++;
  }
  NB.kart.collideKarts(dt);
  NB.pickups.update(dt);
  for (const k of g.karts) if (k.alive && NB.pickups.tryPick(k)) pickupsTaken++;
  NB.weapons.update(dt);
  for (const e of g.events) {
    if (e.t === 'kill') {
      kills++;
      if (MODE === 'elim') {
        const v = g.karts[e.victimId];
        v.lives--;
        if (v.lives <= 0) { v.out = true; v.respawnIn = 1e9; }
      }
    }
    NB.fx.onEvent(e);
  }
  if (MODE === 'elim') {
    for (const k of g.karts) if (!k.alive && !k.out && k.respawnIn <= 0) {
      const sp = arena.spawns[k.id % arena.spawns.length];
      NB.kart.reset(k, sp[0], sp[1], 0);
    }
    const standing = g.karts.filter((k) => !k.out).length;
    if (standing <= 1) { console.log('FIN elim au frame', f, '-> survivant:', g.karts.filter((k) => !k.out).map((k) => k.id)); break; }
  }
  g.events.length = 0;
  NB.fx.update(dt);
}

const alive = g.karts.filter((k) => k.alive).length;
console.log(JSON.stringify({
  frames: FRAMES, map: g.map.id, shots, kills, pickupsTaken, boosts, alive,
  avgSpeed: +(speedSum.v / speedSum.n).toFixed(1),
  karts: g.karts.map((k) => ({ id: k.id, kills: k.kills, deaths: k.deaths, sp: +k.speed.toFixed(1), w: k.weapon || '-', x: +k.pos[0].toFixed(0), z: +k.pos[2].toFixed(0) })),
  projectiles: g.projectiles.length, hazards: g.hazards.length
}, null, 1));
