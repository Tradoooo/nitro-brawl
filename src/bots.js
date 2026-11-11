// NITRO BRAWL — IA des bots : machine à états, anticipation, esquive, personnalités
(function (NB) {
  'use strict';
  var M = NB.M;
  var B = {};
  B.NAMES = ['Volt', 'Rico', 'Nova', 'Blitz', 'Tango', 'Ziggy', 'Koda', 'Rex', 'Sly', 'Fang'];
  var PERSONAS = ['agressif', 'opportuniste', 'chasseur', 'saboteur'];

  B.tune = function (d) {
    if (d === 'rookie') return { aim: 0.3, react: 0.5, aggression: 0.4, topSpeedMul: 0.88, mistakeRate: 0.3 };
    if (d === 'legend') return { aim: 0.95, react: 0.12, aggression: 0.85, topSpeedMul: 1.03, mistakeRate: 0.04 };
    return { aim: 0.7, react: 0.25, aggression: 0.7, topSpeedMul: 0.97, mistakeRate: 0.12 };
  };

  B.attach = function (kart, arena, difficulty) {
    kart.ai = {
      state: 'seek', targetId: -1, think: 0, reactT: 0, stuckT: 0, reverseT: 0,
      persona: M.pick(PERSONAS), tune: B.tune(difficulty), arena: arena,
      aimErr: 0, errT: 0, wpTarget: null, fireHold: 0, useHold: 0, evadeDir: 1,
      jitter: [0, 0], jitterT: 0, detour: null, detourT: 0, unstickDir: 1
    };
  };

  B.update = function (kart, dt) {
    var ai = kart.ai;
    if (!ai || !kart.alive) return null;
    var g = NB.game;
    ai.think -= dt;
    ai.errT -= dt;
    if (ai.errT <= 0) {
      ai.errT = M.randRange(0.6, 1.6);
      ai.aimErr = (Math.random() < ai.tune.mistakeRate ? M.randRange(-0.35, 0.35) : M.randRange(-0.06, 0.06));
    }
    if (ai.think <= 0) { ai.think = M.randRange(0.15, 0.3); decide(kart, ai, g); }
    var threat = findThreat(g, kart);
    if (threat) { ai.state = 'evade'; ai.evadeDir = (M.randRange(-1, 1) > 0 ? 1 : -1); }
    var goal = goalFor(kart, ai, g, threat);
    return drive(kart, ai, g, goal, threat, dt);
  };

  function decide(kart, ai, g) {
    var near = g.karts[nearestEnemy(g, kart)];
    var nearD = near ? M.dist(kart.pos, near.pos) : 1e9;
    if (kart.weapon && nearD < 30) { ai.state = 'attack'; ai.targetId = near.id; return; }
    if (!kart.weapon) { ai.state = 'seek'; ai.wpTarget = pickPickup(kart, ai); return; }
    if (ai.persona === 'saboteur' && (kart.weapon === 'mine' || kart.weapon === 'oil')) { ai.state = 'trap'; return; }
    ai.state = ai.tune.aggression > 0.6 || ai.persona === 'agressif' ? 'hunt' : 'seek';
    if (ai.state === 'seek') ai.wpTarget = pickPickup(kart, ai);
    else ai.targetId = nearestEnemy(g, kart);
  }

  function pickPickup(kart, ai) {
    var list = NB.pickups.list, best = null, bs = 1e9;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (p.taken) continue;
      var d = Math.sqrt(M.dist2([kart.pos[0], 0, kart.pos[2]], [p.pos[0], 0, p.pos[2]]));
      var score = d + Math.random() * 6 + (p.pos[1] > 1 ? 7 : 0);
      if (score < bs) { bs = score; best = p.pos; }
    }
    return best;
  }

  function nearestEnemy(g, kart) {
    var best = -1, bd = 1e9;
    for (var i = 0; i < g.karts.length; i++) {
      var k = g.karts[i];
      if (k === kart || !k.alive) continue;
      var d = M.dist2(kart.pos, k.pos);
      if (d < bd) { bd = d; best = k.id; }
    }
    return best;
  }

  function enemyInCone(g, kart, cone, range) {
    var f = [-Math.sin(kart.yaw), 0, -Math.cos(kart.yaw)];
    for (var i = 0; i < g.karts.length; i++) {
      var k = g.karts[i];
      if (k === kart || !k.alive) continue;
      var d = M.sub(k.pos, kart.pos);
      var len = M.len(d);
      if (len > range || len < 0.01) continue;
      if (M.dot(M.scale(d, 1 / len), f) > 1 - cone * 0.5) return k.id;
    }
    return -1;
  }

  function findThreat(g, kart) {
    var ps = g.projectiles || [];
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (p.owner === kart.id) continue;
      var toMe = M.sub(kart.pos, p.pos);
      var d = M.len(toMe);
      if (d > 10 || d < 0.01) continue;
      var vn = M.dot(M.norm(p.vel), M.scale(toMe, 1 / d));
      if (vn > 0.75) return p;
    }
    return null;
  }

  function goalFor(kart, ai, g, threat) {
    if (threat) {
      var side = [-Math.cos(kart.yaw) * ai.evadeDir, 0, Math.sin(kart.yaw) * ai.evadeDir];
      return M.add(kart.pos, M.scale(side, 10));
    }
    if (ai.detourT > 0 && ai.detour) return ai.detour;
    if (ai.state === 'seek' && ai.wpTarget) {
      return [ai.wpTarget[0] + ai.jitter[0], ai.wpTarget[1], ai.wpTarget[2] + ai.jitter[1]];
    }
    if (ai.state === 'trap') {
      var e = g.karts[nearestEnemy(g, kart)];
      return e ? e.pos : kart.pos;
    }
    var t = g.karts[ai.targetId];
    if (ai.state === 'hunt' && t && t.alive) return leadTarget(kart, t, ai);
    var en = g.karts[nearestEnemy(g, kart)];
    return en ? en.pos : (ai.arena.randomPoint ? ai.arena.randomPoint() : kart.pos);
  }

  function leadTarget(kart, t, ai) {
    var d = M.dist(kart.pos, t.pos);
    var spd = (kart.weapon === 'homing' ? 34 : kart.weapon === 'grenade' ? 18 : 44) || 40;
    var lead = (d / spd) * ai.tune.aim;
    return M.add(t.pos, M.scale(t.vel, lead));
  }

  function drive(kart, ai, g, goal, threat, dt) {
    var inp = { throttle: 0, brake: 0, steer: 0, drift: false, fire: false, use: false };
    var gx = goal[0], gz = goal.length === 2 ? goal[1] : goal[2];
    var toGoal = [gx - kart.pos[0], 0, gz - kart.pos[2]];
    var dist = M.len(toGoal);
    var want = Math.atan2(-toGoal[0], -toGoal[2]);
    var err = M.lerpAngle(kart.yaw, want, 1) - kart.yaw;
    err = ((err + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    err += ai.aimErr * 0.35;
    inp.steer = M.clamp(err * 1.7 - kart.yawVel * 0.18, -1, 1);
    var sharp = Math.abs(err) > 1.0;
    inp.throttle = sharp && kart.speed > 16 ? 0.3 : 1;
    if (dist < 4) inp.throttle = Math.min(inp.throttle, 0.35 + dist / 6);
    inp.brake = Math.abs(err) > 1.25 && kart.speed > 17 ? 0.6 : 0;
    inp.drift = Math.abs(err) > 0.85 && kart.speed > 13 && dist > 6;
    avoidWalls(kart, ai, inp);
    avoidKarts(kart, g, inp);
    stuckCheck(kart, ai, inp, dt);
    ai.jitterT -= dt;
    if (ai.jitterT <= 0) {
      ai.jitterT = M.randRange(1.2, 2.4);
      ai.jitter = [M.randRange(-1.6, 1.6), M.randRange(-1.6, 1.6)];
    }
    ai.detourT = Math.max(0, ai.detourT - dt);
    weaponsLogic(kart, ai, g, inp, threat);
    return inp;
  }

  function avoidWalls(kart, ai, inp) {
    var arena = ai.arena;
    if (!arena || !arena.raycast) return;
    var o = [kart.pos[0], kart.pos[1] + 0.5, kart.pos[2]];
    var f = [-Math.sin(kart.yaw), 0, -Math.cos(kart.yaw)];
    var front = arena.raycast(o, f, 5);
    if (!front.hit) return;
    var ly = kart.yaw + 0.7, ry = kart.yaw - 0.7;
    var dl = arena.raycast(o, [-Math.sin(ly), 0, -Math.cos(ly)], 8).hit ? 0 : 1;
    var dr = arena.raycast(o, [-Math.sin(ry), 0, -Math.cos(ry)], 8).hit ? 0 : 1;
    var goLeft = dl >= dr;
    inp.steer = M.clamp(inp.steer + (goLeft ? 0.95 : -0.95), -1, 1);
    inp.throttle = Math.min(inp.throttle, 0.55);
    inp.drift = false;
    if (front.dist < 2.4 && Math.abs(kart.speed) < 6 && ai.detourT <= 0) {
      ai.detour = sideWaypoint(ai, kart, goLeft);
      ai.detourT = 1.6;
    }
  }

  function avoidKarts(kart, g, inp) {
    var f = [-Math.sin(kart.yaw), 0, -Math.cos(kart.yaw)];
    for (var i = 0; i < g.karts.length; i++) {
      var o = g.karts[i];
      if (o === kart || !o.alive) continue;
      var d = M.sub(o.pos, kart.pos);
      var len = M.len(d);
      if (len > 3.8 || len < 0.01) continue;
      var dn = M.scale(d, 1 / len);
      if (M.dot(dn, f) < 0.4) continue;
      var side = -dn[0] * f[2] + dn[2] * f[0];
      inp.steer = M.clamp(inp.steer + (side > 0 ? -0.85 : 0.85), -1, 1);
      inp.throttle = Math.min(inp.throttle, 0.5);
      inp.drift = false;
    }
  }

  function stuckCheck(kart, ai, inp, dt) {
    if (Math.abs(kart.speed) < 2 && kart.alive) ai.stuckT += dt; else ai.stuckT = 0;
    if (ai.stuckT > 0.8) {
      ai.reverseT = 0.7;
      ai.stuckT = 0;
      ai.unstickDir *= -1;
      ai.detour = sideWaypoint(ai, kart, ai.unstickDir > 0);
      ai.detourT = 2;
      kart.yaw += ai.unstickDir * 0.7;
    }
    if (ai.reverseT > 0) {
      ai.reverseT -= dt;
      inp.throttle = 0; inp.brake = 1;
      inp.steer = ai.unstickDir;
      inp.drift = false;
    }
  }

  function sideWaypoint(ai, kart, goLeft) {
    var pts = ai.arena.pathPoints;
    if (!pts || !pts.length) return null;
    var f = [-Math.sin(kart.yaw), 0, -Math.cos(kart.yaw)];
    var side = goLeft ? [-f[2], 0, f[0]] : [f[2], 0, -f[0]];
    var best = null, bs = -1;
    for (var i = 0; i < pts.length; i++) {
      var d = M.sub(pts[i], kart.pos);
      var len = M.len(d);
      if (len < 3 || len > 14) continue;
      var score = M.dot(M.scale(d, 1 / len), side) * 2 - len / 14;
      if (score > bs) { bs = score; best = pts[i]; }
    }
    return best;
  }

  function weaponsLogic(kart, ai, g, inp, threat) {
    var t = ai.tune;
    if (threat && kart.weapon === 'shield') { inp.use = true; return; }
    if (kart.weapon === 'boost' && Math.abs(inp.steer) < 0.25 && kart.speed > 8) { inp.use = true; return; }
    if (kart.weapon === 'ram') {
      var e = g.karts[nearestEnemy(g, kart)];
      if (e && M.dist(kart.pos, e.pos) < 14) inp.use = true;
      return;
    }
    if (!kart.weapon || NB.weapons.cooldown(kart)) return;
    if (kart.weapon === 'mine' || kart.weapon === 'oil') {
      var near = g.karts[nearestEnemy(g, kart)];
      if (near && M.dist(kart.pos, near.pos) < 12) inp.fire = true;
      else if (ai.state === 'trap' && Math.random() < 0.02) inp.fire = true;
      return;
    }
    var target = g.karts[enemyInCone(g, kart, 0.8, 48)];
    if (!target) return;
    var los = ai.arena.lineOfSight ? ai.arena.lineOfSight(kart.pos, target.pos) : true;
    if (!los) return;
    if (Math.random() < t.aggression * 0.4 + 0.6) inp.fire = true;
  }

  NB.bots = B;
})(window.NB = window.NB || {});
