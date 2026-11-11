// NITRO BRAWL — math 3D (column-major, comme WebGL)
(function (NB) {
  'use strict';
  var M = {};

  // --- matrices ---
  M.create = function () {
    var m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  };

  M.identity = function (out) {
    out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
    return out;
  };

  M.perspective = function (out, fovY, aspect, near, far) {
    var f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far);
    out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = (far + near) * nf; out[11] = -1;
    out[12] = 0; out[13] = 0; out[14] = 2 * far * near * nf; out[15] = 0;
    return out;
  };

  M.lookAt = function (out, eye, target, up) {
    var zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    var zl = Math.hypot(zx, zy, zz) || 1;
    zx /= zl; zy /= zl; zz /= zl;
    var xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    var xl = Math.hypot(xx, xy, xz) || 1;
    xx /= xl; xy /= xl; xz /= xl;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    out[15] = 1;
    return out;
  };

  M.multiply = function (out, a, b) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
      a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (var i = 0; i < 4; i++) {
      var b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
      out[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      out[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      out[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      out[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    }
    return out;
  };

  M.fromTranslation = function (out, t) {
    M.identity(out); out[12] = t[0]; out[13] = t[1]; out[14] = t[2]; return out;
  };

  M.fromScaling = function (out, s) {
    M.identity(out); out[0] = s[0]; out[5] = s[1]; out[10] = s[2]; return out;
  };

  M.fromRotationY = function (out, rad) {
    var c = Math.cos(rad), s = Math.sin(rad);
    M.identity(out);
    out[0] = c; out[2] = -s; out[8] = s; out[10] = c;
    return out;
  };

  M.fromRotationX = function (out, rad) {
    var c = Math.cos(rad), s = Math.sin(rad);
    M.identity(out);
    out[5] = c; out[6] = s; out[9] = -s; out[10] = c;
    return out;
  };

  M.fromRotationZ = function (out, rad) {
    var c = Math.cos(rad), s = Math.sin(rad);
    M.identity(out);
    out[0] = c; out[1] = s; out[4] = -s; out[5] = c;
    return out;
  };

  // T * Ry * S
  M.compose = function (out, pos, yaw, scale) {
    var c = Math.cos(yaw), s = Math.sin(yaw);
    var sx = scale[0], sy = scale[1], sz = scale[2];
    out[0] = c * sx; out[1] = 0; out[2] = -s * sx; out[3] = 0;
    out[4] = 0; out[5] = sy; out[6] = 0; out[7] = 0;
    out[8] = s * sz; out[9] = 0; out[10] = c * sz; out[11] = 0;
    out[12] = pos[0]; out[13] = pos[1]; out[14] = pos[2]; out[15] = 1;
    return out;
  };

  // T * Ry * Rx * Rz * S
  M.composeFull = function (out, pos, rot, scale) {
    var cy = Math.cos(rot[1]), sy = Math.sin(rot[1]);
    var cx = Math.cos(rot[0]), sx = Math.sin(rot[0]);
    var cz = Math.cos(rot[2]), sz = Math.sin(rot[2]);
    var s = scale[0];
    // R = Ry * Rx * Rz (column-major)
    out[0] = (cy * cz + sy * sx * sz) * s; out[1] = cx * sz * s; out[2] = (-sy * cz + cy * sx * sz) * s; out[3] = 0;
    out[4] = (-cy * sz + sy * sx * cz) * scale[1]; out[5] = cx * cz * scale[1]; out[6] = (sy * sz + cy * sx * cz) * scale[1]; out[7] = 0;
    out[8] = sy * cx * scale[2]; out[9] = -sx * scale[2]; out[10] = cy * cx * scale[2]; out[11] = 0;
    out[12] = pos[0]; out[13] = pos[1]; out[14] = pos[2]; out[15] = 1;
    return out;
  };

  M.invert = function (out, a) {
    var b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4],
      b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6],
      b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12],
      b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
    var det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1 / det;
    out[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * det;
    out[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * det;
    out[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * det;
    out[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * det;
    out[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * det;
    out[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * det;
    out[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * det;
    out[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * det;
    out[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * det;
    out[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * det;
    out[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * det;
    out[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * det;
    out[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * det;
    out[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * det;
    out[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * det;
    out[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * det;
    return out;
  };

  M.xformPoint = function (out, m, p) {
    var x = p[0], y = p[1], z = p[2];
    out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
    out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    return out;
  };

  // --- vec3 ---
  M.v3 = function (x, y, z) { return [x || 0, y || 0, z || 0]; };
  M.add = function (a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; };
  M.sub = function (a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; };
  M.scale = function (a, s) { return [a[0] * s, a[1] * s, a[2] * s]; };
  M.mul = function (a, b) { return [a[0] * b[0], a[1] * b[1], a[2] * b[2]]; };
  M.dot = function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; };
  M.cross = function (a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  };
  M.len = function (a) { return Math.hypot(a[0], a[1], a[2]); };
  M.dist2 = function (a, b) {
    var dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
    return dx * dx + dy * dy + dz * dz;
  };
  M.dist = function (a, b) { return Math.sqrt(M.dist2(a, b)); };
  M.norm = function (a) {
    var l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  M.lerp = function (a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };
  M.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
  M.clamp01 = function (v) { return v < 0 ? 0 : (v > 1 ? 1 : v); };
  M.lerpAngle = function (a, b, t) {
    var d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  };
  M.damp = function (cur, target, lambda, dt) {
    return target + (cur - target) * Math.exp(-lambda * dt);
  };
  M.dampAngle = function (cur, target, lambda, dt) {
    var d = (target - cur) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return cur + d * (1 - Math.exp(-lambda * dt));
  };
  M.approach = function (cur, target, delta) {
    if (cur < target) return Math.min(cur + delta, target);
    if (cur > target) return Math.max(cur - delta, target);
    return target;
  };
  M.randRange = function (a, b) { return a + Math.random() * (b - a); };
  M.randInt = function (n) { return Math.floor(Math.random() * n) % n; };
  M.pick = function (arr) { return arr[M.randInt(arr.length)]; };
  M.shuffle = function (arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = M.randInt(i + 1), t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };

  NB.M = M;
})(window.NB = window.NB || {});
