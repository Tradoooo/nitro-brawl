// NITRO BRAWL — armes : projectiles, pièges, explosions, dégâts de zone
(function (NB) {
  'use strict';
  var M = NB.M;
  var W = {};
  W.SPECS = {
    rocket: { speed: 44, life: 3, r: 0.35, blast: 3.6, color: [1, 0.45, 0.2] },
    homing: { speed: 34, life: 5, r: 0.35, blast: 3.4, color: [0.75, 0.4, 1], turn: 1.7 },
    grenade: { speed: 18, life: 1.8, r: 0.3, blast: 4.0, color: [0.5, 0.9, 0.4], lob: 9 },
    mine: { life: 20, r: 0.4, blast: 3.5, color: [0.9, 0.75, 0.15], trigger: 1.7 },
    oil: { life: 8, r: 2.2, color: [0.15, 0.3, 0.12] },
    shield: { dur: 5 }, boost: { dur: 2.2 }, ram: { dur: 3 }
  };
  var meshCache = {};
  var MAT = null;

  function mat() { if (!MAT) MAT = M.create(); return MAT; }

  function meshFor(kind) {
    if (meshCache[kind]) return meshCache[kind];
    if (!NB.gl || !NB.gl.gl || !NB.gl.gl()) return null;
    var spec = W.SPECS[kind] && W.SPECS[kind].color ? kind : 'rocket';
    meshCache[kind] = NB.gl.createMesh(NB.mesh.projectile(spec, W.SPECS[spec].color));
    return meshCache[kind];
  }

  W.init = function () {
    var g = NB.game;
    g.projectiles = [];
    g.hazards = [];
  };

  W.cooldown = function (k) { return (k.coolT || 0) > 0; };

  W.fire = function (k) {
    if (!k.weapon || !k.alive) return false;
    var kind = k.weapon;
    if (kind === 'shield' || kind === 'boost' || kind === 'ram') return W.activate(k);
    var sp = W.SPECS[kind];
    k.weapon = null; k.weaponAmmo = 0;
    k.coolT = 0.35;
    k.shots = (k.shots || 0) + 1;
    var f = [-Math.sin(k.yaw), 0, -Math.cos(k.yaw)];
    var origin = [k.pos[0] + f[0] * 1.2, k.pos[1] + 0.55, k.pos[2] + f[2] * 1.2];
    var g = NB.game;
    if (kind === 'mine') {
      g.hazards.push({
        kind: 'mine', pos: [k.pos[0] - f[0] * 1.4, k.pos[1], k.pos[2] - f[2] * 1.4],
        life: sp.life, age: 0, owner: k.id, spin: 0
      });
    } else if (kind === 'oil') {
      g.hazards.push({
        kind: 'oil', pos: [k.pos[0] - f[0] * 1.6, 0.04, k.pos[2] - f[2] * 1.6],
        life: sp.life, age: 0, owner: k.id, r: sp.r
      });
    } else {
      var vel = M.scale(f, sp.speed);
      if (kind === 'grenade') vel = [vel[0] * 0.6, sp.lob + k.speed * 0.25, vel[2] * 0.6];
      g.projectiles.push({
        kind: kind, pos: origin, vel: vel, life: sp.life, owner: k.id,
        targetId: kind === 'homing' ? acquireTarget(k) : -1, spin: 0, age: 0
      });
    }
    g.events.push({ t: 'shot', kartId: k.id, weapon: kind, pos: origin.slice() });
    return true;
  };

  W.activate = function (k) {
    if (!k.weapon || !k.alive) return false;
    var kind = k.weapon, sp = W.SPECS[kind];
    if (kind === 'shield') k.shieldT = sp.dur;
    else if (kind === 'boost') k.boostT = sp.dur;
    else if (kind === 'ram') k.ramT = sp.dur;
    else return false;
    k.weapon = null; k.weaponAmmo = 0;
    NB.game.events.push({ t: 'pickup', kartId: k.id, kind: kind });
    return true;
  };

  function acquireTarget(k) {
    var g = NB.game, best = -1, bestScore = -1;
    var f = [-Math.sin(k.yaw), 0, -Math.cos(k.yaw)];
    for (var i = 0; i < g.karts.length; i++) {
      var o = g.karts[i];
      if (o === k || !o.alive) continue;
      var d = M.sub(o.pos, k.pos);
      var len = M.len(d);
      if (len > 45 || len < 0.01) continue;
      var dot = M.dot(M.scale(d, 1 / len), f);
      if (dot < 0.5) continue;
      var score = dot * 2 - len / 45;
      if (score > bestScore) { bestScore = score; best = o.id; }
    }
    return best;
  }

  W.update = function (dt) {
    var g = NB.game;
    var i;
    for (i = 0; i < g.karts.length; i++) {
      if (g.karts[i].coolT) g.karts[i].coolT = Math.max(0, g.karts[i].coolT - dt);
    }
    stepProjectiles(g, dt);
    stepHazards(g, dt);
  };

  function stepProjectiles(g, dt) {
    var out = [];
    for (var i = 0; i < g.projectiles.length; i++) {
      var p = g.projectiles[i];
      p.age += dt; p.life -= dt; p.spin += dt * 8;
      if (p.kind === 'homing') steerHoming(g, p, dt);
      if (p.kind === 'grenade') p.vel[1] += NB.GRAVITY * dt;
      var sp = W.SPECS[p.kind];
      var step = M.scale(p.vel, dt);
      var hit = collideProjectile(g, p, step, sp);
      if (!hit) p.pos = M.add(p.pos, step);
      if (p.kind !== 'grenade' && NB.fx && NB.fx.trail) {
        NB.fx.trail(p.pos, sp.color, p.kind === 'homing' ? 0.5 : 0.35);
      }
      if (hit || p.life <= 0 || p.pos[1] < -6) {
        if (p.kind !== 'homing' || hit) W.explode(p.pos, sp.blast, 1, p.owner, sp.color);
        if (p.kind === 'homing' && p.life <= 0) W.explode(p.pos, sp.blast, 1, p.owner, sp.color);
        continue;
      }
      out.push(p);
    }
    g.projectiles = out;
  }

  function steerHoming(g, p, dt) {
    var t = g.karts[p.targetId];
    if (!t || !t.alive) { p.targetId = -1; return; }
    var want = M.norm(M.sub(t.pos, p.pos));
    var cur = M.norm(p.vel);
    var sp = M.len(p.vel);
    var mix = M.norm(M.add(cur, M.scale(M.sub(want, cur), M.clamp01(W.SPECS.homing.turn * dt * 3))));
    p.vel = M.scale(mix, sp);
  }

  function collideProjectile(g, p, step, sp) {
    var arena = g.arena;
    var dir = M.norm(step);
    var len = M.len(step) + sp.r;
    if (arena) {
      var r = arena.raycast(p.pos, dir, len);
      if (r.hit) { p.pos = r.point; return true; }
    }
    var next = M.add(p.pos, step);
    for (var i = 0; i < g.karts.length; i++) {
      var k = g.karts[i];
      if (!k.alive || k.id === p.owner) continue;
      if (M.dist(next, k.pos) < k.radius + sp.r + 0.3) { p.pos = next; return true; }
    }
    if (next[1] <= (arena ? arena.groundHeight(next[0], next[2]) : 0) + sp.r * 0.5) {
      if (p.kind === 'grenade') {
        p.pos[1] = (arena ? arena.groundHeight(next[0], next[2]) : 0) + sp.r;
        p.vel[1] = Math.abs(p.vel[1]) * 0.45;
        p.vel[0] *= 0.7; p.vel[2] *= 0.7;
        if (Math.abs(p.vel[1]) < 1.5) p.vel[1] = 0;
        return false;
      }
      p.pos = next;
      return true;
    }
    return false;
  }

  function stepHazards(g, dt) {
    var out = [];
    for (var i = 0; i < g.hazards.length; i++) {
      var h = g.hazards[i];
      h.age += dt; h.life -= dt;
      if (h.kind === 'mine') {
        if (h.age > 0.6) h.spin += dt * 6;
        if (h.age > 0.6) {
          for (var j = 0; j < g.karts.length; j++) {
            var k = g.karts[j];
            if (!k.alive) continue;
            if (M.dist2([k.pos[0], 0, k.pos[2]], [h.pos[0], 0, h.pos[2]]) < W.SPECS.mine.trigger * W.SPECS.mine.trigger) {
              W.explode(h.pos, W.SPECS.mine.blast, 1, h.owner, W.SPECS.mine.color);
              h.life = -1;
              break;
            }
          }
        }
      } else if (h.kind === 'oil') {
        for (var q = 0; q < g.karts.length; q++) {
          var kk = g.karts[q];
          if (!kk.alive || kk.id === h.owner) continue;
          if (M.dist2([kk.pos[0], 0, kk.pos[2]], [h.pos[0], 0, h.pos[2]]) < h.r * h.r) kk.oilT = 1.6;
        }
      }
      if (h.life > 0) out.push(h);
    }
    g.hazards = out;
  }

  W.explode = function (pos, radius, power, byId, color) {
    var g = NB.game;
    g.events.push({ t: 'boom', pos: pos.slice(), r: radius, power: power, color: color || [1, 0.6, 0.2] });
    for (var i = 0; i < g.karts.length; i++) {
      var k = g.karts[i];
      if (!k.alive) continue;
      var d = M.dist(k.pos, pos);
      if (d < radius + k.radius) {
        var fall = 1 - M.clamp01(d / (radius + k.radius)) * 0.4;
        NB.kart.damage(k, byId, 'boom', power * fall);
        var push = M.norm(M.sub(k.pos, pos));
        k.vel = M.add(k.vel, M.scale(push, 9 * fall));
        k.vel[1] += 4 * fall;
        k.onGround = false;
      }
    }
    if (NB.fx) NB.fx.shake(M.clamp01(1.4 - M.dist(g.player ? g.player.pos : pos, pos) / 30) * 0.5);
  };

  W.resolveRam = function (dt) { /* géré par kart.collideKarts */ };

  W.draw = function () {
    if (!NB.gl || !NB.gl.gl || !NB.gl.gl()) return;
    var g = NB.game, m = mat(), i;
    for (i = 0; i < g.projectiles.length; i++) {
      var p = g.projectiles[i];
      var mesh = meshFor(p.kind);
      if (!mesh) continue;
      var sp = W.SPECS[p.kind];
      var len = M.len(p.vel) || 1;
      var yaw = Math.atan2(-p.vel[0], -p.vel[2]);
      var pitch = -Math.asin(M.clamp(p.vel[1] / len, -1, 1));
      M.composeFull(m, p.pos, [pitch, yaw, p.spin * 0.2], [1, 1, 1]);
      NB.gl.draw(mesh, m);
      NB.gl.sprite(p.pos[0], p.pos[1], p.pos[2], 0.9, sp.color, 0.5, true);
    }
    for (i = 0; i < g.hazards.length; i++) {
      var h = g.hazards[i];
      if (h.kind === 'mine') {
        var mm = meshFor('mine');
        if (!mm) continue;
        var blink = h.age > 0.6 && Math.floor(h.age * 6) % 2 === 0;
        M.composeFull(m, [h.pos[0], h.pos[1] + 0.25, h.pos[2]], [0, h.spin, 0], [1, 1, 1]);
        NB.gl.drawTinted(mm, m, blink ? [2.4, 0.6, 0.4] : [1, 1, 1]);
      } else {
        oilSlick(h);
      }
    }
  };

  function oilSlick(h) {
    var a = M.clamp01(h.life / 1.2);
    var r = h.r;
    var y = 0.05;
    var g = (NB.fx && NB.fx.ground) || [0.55, 0.5, 0.4];
    var outer = [g[0] * 0.72, g[1] * 0.76, g[2] * 0.66];
    var inner = [g[0] * 0.34, g[1] * 0.40, g[2] * 0.30];
    var ro = r, ri = r * 0.62;
    NB.gl.batchQuad(
      [h.pos[0] - ro, y, h.pos[2] - ro], [h.pos[0] + ro, y, h.pos[2] - ro],
      [h.pos[0] + ro, y, h.pos[2] + ro], [h.pos[0] - ro, y, h.pos[2] + ro], outer);
    NB.gl.batchQuad(
      [h.pos[0] - ri, y + 0.01, h.pos[2] - ri], [h.pos[0] + ri, y + 0.01, h.pos[2] - ri],
      [h.pos[0] + ri, y + 0.01, h.pos[2] + ri], [h.pos[0] - ri, y + 0.01, h.pos[2] + ri], inner);
    NB.gl.sprite(h.pos[0], y + 0.08, h.pos[2], r * 1.5, [0.25, 0.7, 0.25], 0.1 * a, true);
  }

  NB.weapons = W;
})(window.NB = window.NB || {});
