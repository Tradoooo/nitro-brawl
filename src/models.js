// NITRO BRAWL — registre de modèles CC0 (Kenney Racing Kit) : chargement, teinte, roues séparées.
// Repli procédural automatique si le fetch échoue (build offline / hors-ligne).
(function (NB) {
  'use strict';
  var M = NB.M;
  var MD = {};
  MD.base = 'https://baptistefaisy.github.io/nitro-brawl/assets/kenney/';
  MD.ready = false;
  MD.cars = [];
  MD.props = {};
  var DARK_MATS = { carTire: 1, glass: 1, grey: 1, dark: 1, road: 1, _defaultMat: 1 };

  function gpu(verts) {
    if (!NB.gl || !NB.gl.gl || !NB.gl.gl()) return null;
    return NB.gl.createMesh(verts);
  }

  function recenter(parts) {
    var min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
    var p = [0, 0, 0];
    parts.forEach(function (pt) {
      for (var i = 0; i < pt.verts.length; i += 9) {
        M.xformPoint(p, pt.mat, [pt.verts[i], pt.verts[i + 1], pt.verts[i + 2]]);
        for (var k = 0; k < 3; k++) {
          if (p[k] < min[k]) min[k] = p[k];
          if (p[k] > max[k]) max[k] = p[k];
        }
      }
    });
    var cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2, oy = min[1];
    var shift = M.create();
    M.fromTranslation(shift, [-cx, -oy, -cz]);
    parts.forEach(function (pt) {
      var m = M.create();
      M.multiply(m, shift, pt.mat);
      pt.mat = m;
    });
    return { size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
  }

  function buildCar(name, parsed) {
    var body = [], dark = [], wheels = [];
    parsed.parts.forEach(function (pt) {
      var isWheel = pt.name.toLowerCase().indexOf('wheel') === 0;
      var isDark = DARK_MATS[pt.matName] || isWheel;
      if (!isDark) {
        for (var i = 6; i < pt.verts.length; i += 9) { pt.verts[i] = 1; pt.verts[i + 1] = 1; pt.verts[i + 2] = 1; }
      }
      var rec = { mesh: gpu(pt.verts), mat: pt.mat, name: pt.name, front: pt.name.indexOf('Front') > 0 };
      if (!rec.mesh) return;
      if (isWheel) wheels.push(rec);
      else if (isDark) dark.push(rec);
      else body.push(rec);
    });
    if (!body.length && !dark.length) return;
    var all = body.concat(dark, wheels);
    var info = recenter(all);
    var scale = 1.9 / Math.max(0.001, info.size[2]);
    MD.cars.push({ name: name, body: body, dark: dark, wheels: wheels, scale: scale });
  }

  function buildProp(name, parsed) {
    var parts = [];
    parsed.parts.forEach(function (pt) {
      var mesh = gpu(pt.verts);
      if (mesh) parts.push({ mesh: mesh, mat: pt.mat, name: pt.name, matName: pt.matName });
    });
    if (!parts.length) return;
    var info = recenter(parts);
    MD.props[name] = { parts: parts, size: info.size };
  }

  MD.loadAll = function (done) {
    var cars = ['raceCarGreen', 'raceCarRed', 'raceCarOrange', 'raceCarWhite'];
    var props = ['barrierRed', 'flagCheckers', 'lightPostModern', 'grandStandRound', 'treeSmall', 'pylon', 'roadBump'];
    var list = cars.concat(props);
    var pending = list.length;
    if (typeof fetch === 'undefined') { if (done) done(); return; }
    list.forEach(function (name) {
      NB.gltf.load(MD.base + name + '.glb', function (err, parsed) {
        pending--;
        if (!err && parsed) {
          if (cars.indexOf(name) >= 0) buildCar(name, parsed);
          else buildProp(name, parsed);
        }
        if (pending === 0) {
          MD.ready = MD.cars.length > 0;
          NB.util.dbg('models ready', MD.ready, MD.cars.length, Object.keys(MD.props).length);
          MD.apply();
          if (done) done();
        }
      });
    });
    setTimeout(function () {
      if (pending > 0) { pending = 0; MD.ready = MD.cars.length > 0; if (done) done(); }
    }, 6000);
  };

  // affecte un modèle à chaque kart et reconstruit l'arène (props)
  MD.apply = function () {
    if (!MD.ready || !NB.game) return;
    var ks = NB.game.karts || [];
    for (var i = 0; i < ks.length; i++) {
      ks[i].model = MD.cars[i % MD.cars.length];
    }
    if (NB.game.map && NB.arena) NB.game.arena = NB.arena.build(NB.game.map);
  };

  // fusionne une liste d'objets {prop,pos,yaw,scale} en UN seul mesh statique
  MD.bakeProps = function (items) {
    var total = 0, i, j, k;
    for (i = 0; i < items.length; i++) {
      var pr = items[i].prop;
      if (!pr) continue;
      for (j = 0; j < pr.parts.length; j++) total += pr.parts[j].mesh.data.length;
    }
    if (!total) return null;
    var out = new Float32Array(total);
    var off = 0, base = M.create(), m = M.create(), p = [0, 0, 0];
    for (i = 0; i < items.length; i++) {
      var it = items[i], prop = it.prop;
      if (!prop) continue;
      M.compose(base, it.pos, it.yaw || 0, [it.scale || 1, it.scale || 1, it.scale || 1]);
      for (j = 0; j < prop.parts.length; j++) {
        var part = prop.parts[j];
        M.multiply(m, base, part.mat);
        var v = part.mesh.data;
        for (k = 0; k < v.length; k += 9) {
          M.xformPoint(p, m, [v[k], v[k + 1], v[k + 2]]);
          out[off++] = p[0]; out[off++] = p[1]; out[off++] = p[2];
          out[off++] = v[k + 3]; out[off++] = v[k + 4]; out[off++] = v[k + 5];
          out[off++] = v[k + 6]; out[off++] = v[k + 7]; out[off++] = v[k + 8];
        }
      }
    }
    return gpu(out);
  };

  // dessine un modèle (parts) avec une matrice de base ; wheels optionnelles
  MD.drawParts = function (parts, base, tint) {
    var m = M.create();
    for (var i = 0; i < parts.length; i++) {
      M.multiply(m, base, parts[i].mat);
      if (tint) NB.gl.drawTinted(parts[i].mesh, m, tint);
      else NB.gl.draw(parts[i].mesh, m);
    }
  };

  MD.drawCar = function (car, pos, yaw, scale, tint, wheelSpin, steer) {
    var base = M.create();
    M.compose(base, pos, yaw + Math.PI, [scale, scale, scale]);
    MD.drawParts(car.body, base, tint);
    MD.drawParts(car.dark, base, null);
    var wm = M.create(), spin = M.create(), st = M.create();
    for (var i = 0; i < car.wheels.length; i++) {
      var w = car.wheels[i];
      M.fromRotationX(spin, wheelSpin || 0);
      if (w.front && steer) { M.fromRotationY(st, steer * 0.4); M.multiply(spin, st, spin); }
      M.multiply(wm, base, w.mat);
      M.multiply(wm, wm, spin);
      NB.gl.draw(w.mesh, wm);
    }
  };

  NB.models = MD;
})(window.NB = window.NB || {});
