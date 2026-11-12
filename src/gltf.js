// NITRO BRAWL — mini-chargeur GLB (sans dépendance) : géométrie + couleurs de matériaux,
// hiérarchie de nœuds aplatie en parts {mesh, mat, name}. Textures ignorées (CC0 Kenney : couleurs planes).
(function (NB) {
  'use strict';
  var M = NB.M;
  var L = {};

  function readAccessor(g, bin, idx) {
    var a = g.accessors[idx], bv = g.bufferViews[a.bufferView];
    var off = (bv.byteOffset || 0) + (a.byteOffset || 0);
    var n = a.count;
    var comp = { x: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type] || 1;
    var out = new Float32Array(n * comp);
    var i, j;
    if (a.componentType === 5126) {
      var f = new Float32Array(bin, off, n * comp);
      out.set(f);
    } else if (a.componentType === 5123) {
      var u = new Uint16Array(bin, off, n * comp);
      for (i = 0; i < u.length; i++) out[i] = u[i];
    } else if (a.componentType === 5125) {
      var u32 = new Uint32Array(bin, off, n * comp);
      for (i = 0; i < u32.length; i++) out[i] = u32[i];
    } else if (a.componentType === 5121) {
      var u8 = new Uint8Array(bin, off, n * comp);
      for (i = 0; i < u8.length; i++) out[i] = u8[i] / 255;
    }
    return { data: out, comp: comp, count: n };
  }

  function nodeMatrix(n) {
    var m = M.create();
    if (n.matrix) { m.set(n.matrix); return m; }
    var t = n.translation || [0, 0, 0];
    var r = n.rotation || [0, 0, 0, 1];
    var s = n.scale || [1, 1, 1];
    var x = r[0], y = r[1], z = r[2], w = r[3];
    var x2 = x + x, y2 = y + y, z2 = z + z;
    var xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
    var wx = w * x2, wy = w * y2, wz = w * z2;
    m[0] = (1 - (yy + zz)) * s[0]; m[1] = (xy + wz) * s[0]; m[2] = (xz - wy) * s[0];
    m[4] = (xy - wz) * s[1]; m[5] = (1 - (xx + zz)) * s[1]; m[6] = (yz + wx) * s[1];
    m[8] = (xz + wy) * s[2]; m[9] = (yz - wx) * s[2]; m[10] = (1 - (xx + yy)) * s[2];
    m[12] = t[0]; m[13] = t[1]; m[14] = t[2];
    return m;
  }

  function matColor(g, matIdx, fallback) {
    if (matIdx == null || !g.materials || !g.materials[matIdx]) return fallback;
    var m = g.materials[matIdx];
    var pbr = m.pbrMetallicRoughness || {};
    var c = pbr.baseColorFactor || fallback;
    return { color: [c[0], c[1], c[2]], name: m.name || '' };
  }

  function flatNormal(p0, p1, p2) {
    var e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    var e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    return M.norm(M.cross(e1, e2));
  }

  // renvoie { parts: [ {name, color, verts:Float32Array(pos3 normal3 color3), mat:Float32Array16} ] }
  L.parse = function (buf) {
    var dv = new DataView(buf);
    var magic = dv.getUint32(0, true), len = dv.getUint32(8, true);
    if (magic !== 0x46546c67) return null;
    var off = 12, json = null, bin = null;
    while (off < len) {
      var clen = dv.getUint32(off, true), ctype = dv.getUint32(off + 4, true);
      if (ctype === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, clen)));
      else bin = buf.slice(off + 8, off + 8 + clen);
      off += 8 + clen;
    }
    if (!json) return null;
    var parts = [];
    var nodes = json.nodes || [];
    function walk(ni, parent) {
      var n = nodes[ni];
      var local = nodeMatrix(n);
      var world = M.create();
      M.multiply(world, parent, local);
      if (n.mesh != null) {
        var mesh = json.meshes[n.mesh];
        for (var pi = 0; pi < mesh.primitives.length; pi++) {
          var pr = mesh.primitives[pi];
          var pos = readAccessor(json, bin, pr.attributes.POSITION);
          var nrm = pr.attributes.NORMAL != null ? readAccessor(json, bin, pr.attributes.NORMAL) : null;
          var idx = pr.indices != null ? readAccessor(json, bin, pr.indices) : null;
          var mc = matColor(json, pr.material, [0.8, 0.8, 0.8]);
          var triCount = idx ? idx.count / 3 : pos.count / 3;
          var verts = new Float32Array(triCount * 3 * 9);
          var vi = 0;
          for (var t = 0; t < triCount; t++) {
            var i0 = idx ? idx.data[t * 3] : t * 3;
            var i1 = idx ? idx.data[t * 3 + 1] : t * 3 + 1;
            var i2 = idx ? idx.data[t * 3 + 2] : t * 3 + 2;
            var p0 = [pos.data[i0 * 3], pos.data[i0 * 3 + 1], pos.data[i0 * 3 + 2]];
            var p1 = [pos.data[i1 * 3], pos.data[i1 * 3 + 1], pos.data[i1 * 3 + 2]];
            var p2 = [pos.data[i2 * 3], pos.data[i2 * 3 + 1], p2z(pos, i2)];
            var fn = nrm ? null : flatNormal(p0, p1, p2);
            var ids = [i0, i1, i2], ps = [p0, p1, p2];
            for (var k = 0; k < 3; k++) {
              var nn = nrm ? [nrm.data[ids[k] * 3], nrm.data[ids[k] * 3 + 1], nrm.data[ids[k] * 3 + 2]] : fn;
              verts[vi++] = ps[k][0]; verts[vi++] = ps[k][1]; verts[vi++] = ps[k][2];
              verts[vi++] = nn[0]; verts[vi++] = nn[1]; verts[vi++] = nn[2];
              verts[vi++] = mc.color[0]; verts[vi++] = mc.color[1]; verts[vi++] = mc.color[2];
            }
          }
          parts.push({ name: n.name || ('part' + ni), matName: mc.name, verts: verts, mat: world });
        }
      }
      (n.children || []).forEach(function (c) { walk(c, world); });
    }
    function p2z(pos, i) { return pos.data[i * 3 + 2]; }
    var roots = json.scenes ? (json.scenes[json.scene || 0].nodes || []) : nodes.map(function (_, i) { return i; });
    roots.forEach(function (r) { walk(r, M.create()); });
    return { parts: parts };
  };

  L.load = function (url, cb) {
    fetch(url).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.arrayBuffer();
    }).then(function (buf) {
      cb(null, L.parse(buf));
    }).catch(function (e) { cb(e, null); });
  };

  NB.gltf = L;
})(window.NB = window.NB || {});
