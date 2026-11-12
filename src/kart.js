// NITRO BRAWL — physique arcade du kart : adhérence, drift, rampes, sauts, collisions
(function (NB) {
  'use strict';
  var M = NB.M;
  var K = {};
  K.maxSpeed = 26;
  K.accel = 17;
  K.turnRate = 2.7;
  K.radius = 0.85;
  K.respawnTime = 2.2;
  var GPU = null;

  function meshes() {
    if (GPU) return GPU;
    GPU = { body: null, accent: null, dark: null };
    if (NB.gl && NB.gl.gl && NB.gl.gl()) {
      var p = NB.mesh.kartParts();
      GPU.body = NB.gl.createMesh(p.body);
      GPU.accent = NB.gl.createMesh(p.accent);
      GPU.dark = NB.gl.createMesh(p.dark);
    }
    return GPU;
  }

  K.create = function (o) {
    var arena = o.arena;
    var gh = arena ? arena.groundHeight(o.pos[0], o.pos[1]) : 0;
    return {
      id: o.id, name: o.name || ('K' + o.id), color: o.color || [1, 0.2, 0.2],
      accent: o.accent || [1, 1, 1], isPlayer: !!o.isPlayer, isBot: !!o.isBot,
      pos: [o.pos[0], gh, o.pos[1]], vel: [0, 0, 0], yaw: o.yaw || 0, yawVel: 0,
      speed: 0, steer: 0, throttle: 0, brake: 0, drift: false,
      onGround: true, vy: 0, airTime: 0,
      alive: true, respawnIn: 0, lives: 3, out: false,
      kills: 0, deaths: 0, streak: 0, shots: 0, hits: 0,
      weapon: null, weaponAmmo: 0, shieldT: 0, boostT: 0, oilT: 0, invulnT: 2,
      freezeT: 0, ramT: 0, driftCharge: 0, miniBoostT: 0, wasDrift: false,
      flashT: 0, radius: K.radius, mass: 1, lastHitBy: null,
      wheelSpin: 0, tiltX: 0, tiltZ: 0, ai: null, engineRpm: 0, arena: arena,
      stuckT: 0, prevGh: gh
    };
  };

  K.reset = function (k, x, z, yaw) {
    var gh = k.arena ? k.arena.groundHeight(x, z) : 0;
    k.pos = [x, gh, z]; k.vel = [0, 0, 0]; k.yaw = yaw || 0;
    k.speed = 0; k.vy = 0; k.onGround = true; k.alive = true; k.out = false;
    k.invulnT = 1.5; k.shieldT = 0; k.boostT = 0; k.oilT = 0; k.ramT = 0;
    k.weapon = null; k.weaponAmmo = 0; k.driftCharge = 0; k.miniBoostT = 0;
    k.respawnIn = 0; k.prevGh = gh; k.flashT = 0;
  };

  K.giveWeapon = function (k, kind) {
    k.weapon = kind;
    k.weaponAmmo = (kind === 'shield' || kind === 'boost' || kind === 'ram') ? 1 : 1;
  };

  K.stats = function (k) {
    return {
      speedKmh: Math.abs(k.speed) * 3.6,
      drifting: k.drift && Math.abs(k.steer) > 0.25 && Math.abs(k.speed) > 7,
      airborne: !k.onGround
    };
  };

  function forwardOf(k) { return [-Math.sin(k.yaw), 0, -Math.cos(k.yaw)]; }

  K.update = function (k, input, dt) {
    tickTimers(k, dt);
    if (!k.alive) { k.respawnIn -= dt; return; }
    var f = forwardOf(k);
    var fs = M.dot(k.vel, f);
    var lat = M.sub(k.vel, M.scale(f, fs));
    fs = engineStep(k, input, fs, dt);
    k.yaw = yawStep(k, input, fs, dt);
    var grip = gripOf(k, input);
    var damp = Math.exp(-grip * dt);
    lat = [lat[0] * damp, 0, lat[2] * damp];
    k.vel = M.add(M.scale(f, fs), lat);
    driftChargeStep(k, input, lat, dt);
    verticalStep(k, dt);
    k.pos = M.add(k.pos, M.scale(k.vel, dt));
    wallStep(k);
    k.speed = M.dot(k.vel, forwardOf(k));
    animate(k, input, dt);
  };

  function tickTimers(k, dt) {
    k.shieldT = Math.max(0, k.shieldT - dt);
    k.boostT = Math.max(0, k.boostT - dt);
    k.oilT = Math.max(0, k.oilT - dt);
    k.invulnT = Math.max(0, k.invulnT - dt);
    k.freezeT = Math.max(0, k.freezeT - dt);
    k.ramT = Math.max(0, k.ramT - dt);
    k.flashT = Math.max(0, k.flashT - dt);
    k.miniBoostT = Math.max(0, k.miniBoostT - dt);
  }

  function topSpeed(k) {
    var v = K.maxSpeed;
    if (k.boostT > 0) v *= 1.55;
    if (k.miniBoostT > 0) v += 7;
    if (k.freezeT > 0) v *= 0.45;
    return v;
  }

  function engineStep(k, input, fs, dt) {
    var top = topSpeed(k);
    var acc = K.accel * (k.boostT > 0 || k.miniBoostT > 0 ? 1.9 : 1);
    if (input.throttle > 0) fs += acc * input.throttle * dt;
    if (input.brake > 0) {
      if (fs > 0.6) fs -= 32 * input.brake * dt;
      else fs -= 10 * input.brake * dt;
    }
    if (input.throttle <= 0 && input.brake <= 0) fs -= fs * 0.9 * dt;
    fs = M.clamp(fs, -8, top);
    k.throttle = input.throttle; k.brake = input.brake;
    k.engineRpm = M.clamp01(Math.abs(fs) / K.maxSpeed);
    return fs;
  }

  function yawStep(k, input, fs, dt) {
    var sf = M.clamp(Math.abs(fs) / K.maxSpeed, 0, 1);
    var dir = fs >= 0 ? 1 : -1;
    var rate = K.turnRate * (0.5 + 0.9 * (1 - sf * 0.5)) * (0.25 + 0.75 * M.clamp01(Math.abs(fs) / 6));
    var st = input.steer;
    if (k.oilT > 0) st *= 1.45;
    k.steer = M.damp(k.steer, st, 14, dt);
    var turn = k.steer * rate * dir;
    k.drift = input.drift && Math.abs(fs) > 6 && k.oilT <= 0;
    if (k.drift) turn *= 1.6;
    if (!k.onGround) turn *= 0.4;
    k.yawVel = turn;
    return k.yaw + turn * dt;
  }

  function gripOf(k, input) {
    if (!k.onGround) return 2;
    if (k.oilT > 0) return 2.2;
    if (k.drift && Math.abs(k.steer) > 0.2) return 3.2;
    return 11;
  }

  function driftChargeStep(k, input, lat, dt) {
    var sliding = M.len(lat);
    if (k.drift && sliding > 2) k.driftCharge = Math.min(1.8, k.driftCharge + dt * (0.7 + sliding * 0.12));
    if (k.wasDrift && !input.drift && k.driftCharge > 0.55) {
      k.miniBoostT = 0.55 + k.driftCharge * 0.35;
      var f = forwardOf(k);
      k.vel = M.add(k.vel, M.scale(f, 5 + k.driftCharge * 3));
      if (NB.fx && NB.fx.trail) {
        NB.fx.trail(k.pos, [1, 0.7, 0.2], 0.9);
        NB.fx.trail(k.pos, [1, 0.4, 0.1], 0.7);
      }
      k.driftCharge = 0;
    }
    if (!input.drift && k.driftCharge > 0 && sliding < 1) k.driftCharge = Math.max(0, k.driftCharge - dt * 2);
    k.wasDrift = input.drift;
  }

  function verticalStep(k, dt) {
    if (!k.arena) return;
    var gh = k.arena.groundHeight(k.pos[0], k.pos[2]);
    if (k.onGround) {
      var climb = (gh - k.prevGh) / Math.max(dt, 1e-4);
      k.vy = M.damp(k.vy, climb, 20, dt);
      if (gh < k.pos[1] - 0.35 && k.vy > -1) {
        k.onGround = false; k.airTime = 0;
      } else {
        k.pos[1] = gh;
        k.vy = 0;
      }
    } else {
      k.airTime += dt;
      k.vy += NB.GRAVITY * dt;
      k.pos[1] += k.vy * dt;
      if (k.pos[1] <= gh && k.vy <= 0) {
        k.pos[1] = gh; k.onGround = true;
        if (k.vy < -9 && NB.fx && NB.fx.smoke) {
          NB.fx.smoke(k.pos, [0, 1, 0], 1.4, [0.7, 0.7, 0.75], 0.5);
          NB.fx.shake(0.12);
        }
        k.vy = 0; k.airTime = 0;
      }
    }
    k.prevGh = gh;
  }

  function wallStep(k) {
    if (!k.arena) return;
    var r = k.arena.resolveFull(k.pos, k.vel, k.radius);
    if (r.hit) {
      var impact = Math.abs(k.speed);
      k.flashT = Math.max(k.flashT, 0.18);
      k.speed *= 0.75;
      if (impact > 12 && NB.fx) { NB.fx.spark(k.pos, [0, 1, 0], [1, 0.8, 0.3], 0.4); NB.fx.shake(0.1); }
    }
  }

  function animate(k, input, dt) {
    k.wheelSpin += k.speed * dt / 0.34;
    var tx = M.clamp(k.throttle * 0.5 - k.brake * 0.9, -0.5, 0.5) * 0.16;
    var tz = M.clamp(-k.steer * (0.4 + M.clamp01(Math.abs(k.speed) / K.maxSpeed) * 0.9), -1, 1) * 0.16;
    if (k.drift) tz *= 1.5;
    k.tiltX = M.damp(k.tiltX, tx, 8, dt);
    k.tiltZ = M.damp(k.tiltZ, tz, 8, dt);
    if (k.boostT > 0 && NB.fx && NB.fx.trail) {
      var f = forwardOf(k);
      NB.fx.trail([k.pos[0] - f[0] * 1.1, k.pos[1] + 0.5, k.pos[2] - f[2] * 1.1], [1, 0.55, 0.15], 0.55);
    }
    var st = K.stats(k);
    if (st.drifting && Math.abs(k.speed) > 9 && NB.fx && NB.fx.skid) {
      NB.fx.skid(k.pos, k.yaw, 0.4, 0.14);
    }
  }

  // ---------- collisions kart-kart ----------
  K.collideKarts = function (dt) {
    var g = NB.game;
    if (!g || !g.karts) return;
    var ks = g.karts;
    for (var i = 0; i < ks.length; i++) {
      for (var j = i + 1; j < ks.length; j++) {
        if (ks[i].alive && ks[j].alive) pairBump(ks[i], ks[j]);
      }
    }
  };

  function pairBump(a, b) {
    var dx = b.pos[0] - a.pos[0], dz = b.pos[2] - a.pos[2];
    var dy = Math.abs(b.pos[1] - a.pos[1]);
    var d2 = dx * dx + dz * dz;
    var rr = a.radius + b.radius;
    if (d2 > rr * rr || d2 < 1e-6 || dy > 1.4) return;
    var d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
    var push = (rr - d) * 0.8;
    a.pos[0] -= nx * push; a.pos[2] -= nz * push;
    b.pos[0] += nx * push; b.pos[2] += nz * push;
    var rel = (b.vel[0] - a.vel[0]) * nx + (b.vel[2] - a.vel[2]) * nz;
    if (rel < 0) {
      var imp = -rel * 0.6;
      a.vel[0] -= nx * imp; a.vel[2] -= nz * imp;
      b.vel[0] += nx * imp; b.vel[2] += nz * imp;
    }
    if (a.ramT > 0) ramHit(a, b);
    else if (b.ramT > 0) ramHit(b, a);
  }

  function ramHit(rammer, victim) {
    if (victim.invulnT > 0 || victim.shieldT > 0) return;
    K.damage(victim, rammer.id, 'ram', 1);
    var f = forwardOf(rammer);
    rammer.vel = M.add(rammer.vel, M.scale(f, 4));
  }

  K.damage = function (k, byId, weapon, power) {
    if (!k.alive) return false;
    if (k.invulnT > 0) return false;
    if (k.shieldT > 0) {
      k.shieldT = 0;
      NB.game.events.push({ t: 'hit', kartId: k.id, byId: byId, weapon: weapon || 'shield' });
      return false;
    }
    k.alive = false;
    k.respawnIn = K.respawnTime;
    k.deaths++;
    k.streak = 0;
    k.lastHitBy = byId;
    var g = NB.game;
    var killer = g && g.karts ? g.karts[byId] : null;
    if (killer && killer !== k) { killer.kills++; killer.streak++; killer.hits++; }
    if (g) g.events.push({ t: 'kill', killerId: byId, victimId: k.id, weapon: weapon || 'boom' });
    return true;
  };

  // ---------- rendu ----------
  var MAT = null;
  function mat() { if (!MAT) MAT = M.create(); return MAT; }

  K.drawAll = function () {
    var g = NB.game;
    if (!g || !g.karts) return;
    for (var i = 0; i < g.karts.length; i++) if (g.karts[i].alive) K.drawOne(g.karts[i]);
  };

  K.drawOne = function (k) {
    var m = meshes();
    if (!m.body) return;
    if (k.model && NB.models && NB.models.ready) {
      NB.models.drawCar(k.model, k.pos, k.yaw, k.model.scale, k.color, k.wheelSpin, k.steer);
      if (NB.fx) {
        NB.fx.shadow(k.pos[0], k.pos[2], 1.15, k.onGround ? 0.34 : 0.16);
        if (k.onGround) NB.fx.underglow(k.pos[0], k.pos[2], k.yaw, k.color);
        if (k.shieldT > 0) NB.fx.shieldBubble(k.pos, k.shieldT);
        if (k.ramT > 0) NB.fx.ramGlow(k.pos, k.yaw);
      }
      return;
    }
    var mm = mat();
    M.composeFull(mm, k.pos, [k.tiltX, k.yaw, k.tiltZ], [1, 1, 1]);
    var flash = k.flashT > 0 ? 1 + k.flashT * 6 : 1;
    var inv = k.invulnT > 0 && Math.floor(k.invulnT * 10) % 2 === 0 ? 0.45 : 1;
    var c = [k.color[0] * flash * inv, k.color[1] * flash * inv, k.color[2] * flash * inv];
    NB.gl.drawTinted(m.body, mm, c);
    NB.gl.drawTinted(m.accent, mm, [k.accent[0] * inv, k.accent[1] * inv, k.accent[2] * inv]);
    NB.gl.draw(m.dark, mm);
    if (NB.fx) {
      NB.fx.shadow(k.pos[0], k.pos[2], 1.15, k.onGround ? 0.34 : 0.16);
      if (k.onGround) NB.fx.underglow(k.pos[0], k.pos[2], k.yaw, k.color);
      if (k.shieldT > 0) NB.fx.shieldBubble(k.pos, k.shieldT);
      if (k.ramT > 0) NB.fx.ramGlow(k.pos, k.yaw);
    }
  };

  NB.kart = K;
})(window.NB = window.NB || {});
