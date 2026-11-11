// NITRO BRAWL — moteur de rendu WebGL (opaque éclairé + fog, sprites billboards, ciel)
(function (NB) {
  'use strict';
  var gl = null, canvas = null;
  var progOpaque = null, progSprite = null, progSky = null;
  var U = {};   // uniform locations par programme
  var viewMat = NB.M.create(), projMat = NB.M.create(), vpMat = NB.M.create(), modelMat = NB.M.create();
  var G = {};

  var VERT_OPAQUE = [
    'attribute vec3 aPos; attribute vec3 aNormal; attribute vec3 aColor;',
    'uniform mat4 uProj, uView, uModel;',
    'varying vec3 vColor; varying vec3 vNormal; varying float vFog;',
    'uniform vec3 uFogColor; uniform float uFogNear, uFogFar;',
    'void main() {',
    '  vec4 wp = uModel * vec4(aPos, 1.0);',
    '  vec4 vp = uView * wp;',
    '  gl_Position = uProj * vp;',
    '  vColor = aColor;',
    '  vNormal = normalize(mat3(uModel[0].xyz, uModel[1].xyz, uModel[2].xyz) * aNormal);',
    '  vFog = clamp((-vp.z - uFogNear) / max(1.0, uFogFar - uFogNear), 0.0, 1.0);',
    '}'
  ].join('\n');

  var FRAG_OPAQUE = [
    'precision highp float;',
    'varying vec3 vColor; varying vec3 vNormal; varying float vFog;',
    'uniform vec3 uLightDir, uFogColor, uTint; uniform float uAmbient;',
    'void main() {',
    '  vec3 n = normalize(vNormal);',
    '  float d = max(dot(n, normalize(uLightDir)), 0.0);',
    '  vec3 lin = pow(vColor * uTint, vec3(2.2));',
    '  vec3 lit = lin * (uAmbient + d * (1.0 - uAmbient));',
    '  vec3 fogLin = pow(uFogColor, vec3(2.2));',
    '  vec3 c = pow(mix(lit, fogLin, vFog), vec3(0.4545));',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'
  ].join('\n');

  var VERT_SPRITE = [
    'attribute vec3 aPos; attribute vec4 aColor; attribute vec2 aUV;',
    'uniform mat4 uProj, uView;',
    'varying vec4 vColor; varying vec2 vUV;',
    'void main() {',
    '  gl_Position = uProj * uView * vec4(aPos, 1.0);',
    '  vColor = aColor; vUV = aUV;',
    '}'
  ].join('\n');

  var FRAG_SPRITE = [
    'precision highp float;',
    'varying vec4 vColor; varying vec2 vUV;',
    'void main() {',
    '  float r = length(vUV);',
    '  float a = smoothstep(1.0, 0.15, r) * vColor.a;',
    '  if (a < 0.004) discard;',
    '  gl_FragColor = vec4(vColor.rgb, a);',
    '}'
  ].join('\n');

  var VERT_SKY = 'attribute vec2 aP; varying vec2 vP; void main(){ vP=aP; gl_Position=vec4(aP,0.999,1.0); }';
  var FRAG_SKY = [
    'precision highp float;',
    'varying vec2 vP;',
    'uniform vec3 uTop, uBottom, uSun; uniform float uTime;',
    'void main() {',
    '  float t = clamp(vP.y * 0.5 + 0.5, 0.0, 1.0);',
    '  vec3 lin = mix(pow(uBottom, vec3(2.2)), pow(uTop, vec3(2.2)), pow(t, 0.85));',
    '  float d = distance(vP, uSun.xy);',
    '  lin += uSun.z * (0.55 * exp(-d * 3.2) + 0.10 * exp(-d * 9.0));',
    '  vec3 c = pow(lin, vec3(0.4545));',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      NB.util.dbg('shader', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function program(vs, fs, attribs, uniforms) {
    var p = gl.createProgram();
    var v = compile(gl.VERTEX_SHADER, vs), f = compile(gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      NB.util.dbg('link', gl.getProgramInfoLog(p));
      return null;
    }
    var rec = { prog: p, a: {}, u: {} };
    for (var i = 0; i < attribs.length; i++) rec.a[attribs[i]] = gl.getAttribLocation(p, attribs[i]);
    for (var j = 0; j < uniforms.length; j++) rec.u[uniforms[j]] = gl.getUniformLocation(p, uniforms[j]);
    return rec;
  }

  var STRIDE_OPAQUE = 9 * 4;   // pos3 normal3 color3
  var STRIDE_SPRITE = 9 * 4;   // pos3 color4 uv2
  var MAX_BATCH_VERTS = 24000;
  var MAX_SPRITE_VERTS = 7200;
  var batchBuf = new Float32Array(MAX_BATCH_VERTS * 9);
  var batchN = 0;
  var batchVBO = null;
  var spriteBuf = new Float32Array(MAX_SPRITE_VERTS * 9);
  var spriteN = 0;
  var spriteVBO = null;
  var spriteBuf2 = new Float32Array(MAX_SPRITE_VERTS * 9);
  var spriteN2 = 0;
  var spriteVBO2 = null;
  var skyVBO = null;
  var IDENTITY = NB.M.create();
  var camRight = [1, 0, 0], camUp = [0, 1, 0];

  G.init = function (cv) {
    canvas = cv;
    var opts = { antialias: true, alpha: false, depth: true, powerPreference: 'high-performance' };
    gl = cv.getContext('webgl', opts) || cv.getContext('experimental-webgl', opts);
    if (!gl) return false;
    progOpaque = program(VERT_OPAQUE, FRAG_OPAQUE,
      ['aPos', 'aNormal', 'aColor'],
      ['uProj', 'uView', 'uModel', 'uTint', 'uLightDir', 'uAmbient', 'uFogColor', 'uFogNear', 'uFogFar']);
    progSprite = program(VERT_SPRITE, FRAG_SPRITE, ['aPos', 'aColor', 'aUV'], ['uProj', 'uView']);
    progSky = program(VERT_SKY, FRAG_SKY, ['aP'], ['uTop', 'uBottom', 'uSun', 'uTime']);
    if (!progOpaque || !progSprite || !progSky) return false;
    batchVBO = gl.createBuffer(); spriteVBO = gl.createBuffer(); skyVBO = gl.createBuffer();
    spriteVBO2 = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, skyVBO);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.clearDepth(1);
    G.time = 0;
    G.stats = { calls: 0, tris: 0, sprites: 0 };
    return true;
  };

  G.resize = function (w, h, dpr) {
    dpr = dpr || 1;
    var W = Math.max(1, Math.floor(w * dpr)), H = Math.max(1, Math.floor(h * dpr));
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W; canvas.height = H;
    }
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    G.width = w; G.height = h; G.dpr = dpr;
    if (gl) gl.viewport(0, 0, W, H);
  };

  G.createMesh = function (f32) {
    var vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, f32, gl.STATIC_DRAW);
    return { vbo: vbo, count: f32.length / 9, data: f32 };
  };

  G.deleteMesh = function (m) { if (m && m.vbo) gl.deleteBuffer(m.vbo); };

  G.begin = function (cam) {
    G.camera = cam;
    G.time += 1 / 60;
    var aspect = cam.aspect || (G.width / Math.max(1, G.height));
    NB.M.perspective(projMat, cam.fov || 1.05, aspect, cam.near || 0.3, cam.far || 400);
    var tgt = cam.target, pos = cam.pos;
    if (cam.shake > 0.0001) {
      var s = cam.shake;
      pos = [pos[0] + NB.M.randRange(-s, s), pos[1] + NB.M.randRange(-s, s), pos[2] + NB.M.randRange(-s, s)];
      tgt = [tgt[0] + NB.M.randRange(-s, s) * 0.5, tgt[1] + NB.M.randRange(-s, s) * 0.5, tgt[2] + NB.M.randRange(-s, s) * 0.5];
    }
    NB.M.lookAt(viewMat, pos, tgt, cam.up || [0, 1, 0]);
    NB.M.multiply(vpMat, projMat, viewMat);
    G.viewProj = vpMat;
    // base caméra pour les billboards
    camRight = [viewMat[0], viewMat[4], viewMat[8]];
    camUp = [viewMat[1], viewMat[5], viewMat[9]];

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    G.stats.calls = 0; G.stats.tris = 0; G.stats.sprites = 0;
    drawSky(cam, pos, tgt);
    gl.useProgram(progOpaque.prog);
    gl.uniformMatrix4fv(progOpaque.u.uProj, false, projMat);
    gl.uniformMatrix4fv(progOpaque.u.uView, false, viewMat);
    gl.uniform3fv(progOpaque.u.uFogColor, cam.fogColor || [0.6, 0.7, 0.9]);
    gl.uniform1f(progOpaque.u.uFogNear, cam.fogNear == null ? 60 : cam.fogNear);
    gl.uniform1f(progOpaque.u.uFogFar, cam.fogFar == null ? 220 : cam.fogFar);
    gl.uniform3fv(progOpaque.u.uLightDir, cam.sunDir || [0.5, 0.9, 0.35]);
    gl.uniform1f(progOpaque.u.uAmbient, cam.ambient == null ? 0.55 : cam.ambient);
    gl.uniform3f(progOpaque.u.uTint, 1, 1, 1);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
  };

  function drawSky(cam, pos, tgt) {
    gl.useProgram(progSky.prog);
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
    gl.bindBuffer(gl.ARRAY_BUFFER, skyVBO);
    gl.enableVertexAttribArray(progSky.a.aP);
    gl.vertexAttribPointer(progSky.a.aP, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3fv(progSky.u.uTop, cam.skyTop || [0.25, 0.45, 0.85]);
    gl.uniform3fv(progSky.u.uBottom, cam.skyBottom || [0.85, 0.85, 0.95]);
    var sun = projectToNdc(cam, pos, tgt, cam.sunDir || [0.5, 0.9, 0.35]);
    gl.uniform3f(progSky.u.uSun, sun[0], sun[1], sun[2]);
    gl.uniform1f(progSky.u.uTime, G.time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(progSky.a.aP);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
  }

  // projette une direction (depuis la caméra) en NDC ; z = visibilité (0 ou 1)
  function projectToNdc(cam, pos, tgt, dir) {
    var far = [pos[0] + dir[0] * 100, pos[1] + dir[1] * 100, pos[2] + dir[2] * 100];
    var o = [0, 0, 0];
    NB.M.xformPoint(o, viewMat, far);
    var p = [0, 0, 0];
    NB.M.xformPoint(p, projMat, o);
    if (o[2] > -0.5 || p[3] <= 0.0001) return [9, 9, 0];
    return [p[0] / p[3], p[1] / p[3], 1];
  }

  function bindOpaqueAttribs(vbo) {
    var a = progOpaque.a;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(a.aPos);
    gl.vertexAttribPointer(a.aPos, 3, gl.FLOAT, false, STRIDE_OPAQUE, 0);
    gl.enableVertexAttribArray(a.aNormal);
    gl.vertexAttribPointer(a.aNormal, 3, gl.FLOAT, false, STRIDE_OPAQUE, 12);
    gl.enableVertexAttribArray(a.aColor);
    gl.vertexAttribPointer(a.aColor, 3, gl.FLOAT, false, STRIDE_OPAQUE, 24);
  }

  function drawWith(vbo, count) {
    gl.drawArrays(gl.TRIANGLES, 0, count);
    G.stats.calls++;
    G.stats.tris += count / 3;
  }

  G.draw = function (mesh, mat) {
    if (!mesh || !mesh.count) return;
    gl.useProgram(progOpaque.prog);
    gl.uniform3f(progOpaque.u.uTint, 1, 1, 1);
    gl.uniformMatrix4fv(progOpaque.u.uModel, false, mat || IDENTITY);
    bindOpaqueAttribs(mesh.vbo);
    drawWith(mesh.vbo, mesh.count);
  };

  G.drawTinted = function (mesh, mat, tint) {
    if (!mesh || !mesh.count) return;
    gl.useProgram(progOpaque.prog);
    gl.uniform3f(progOpaque.u.uTint, tint[0], tint[1], tint[2]);
    gl.uniformMatrix4fv(progOpaque.u.uModel, false, mat || IDENTITY);
    bindOpaqueAttribs(mesh.vbo);
    drawWith(mesh.vbo, mesh.count);
  };

  G.beginBatch = function () { batchN = 0; };

  G.batchVert = function (x, y, z, nx, ny, nz, r, g, b) {
    if (batchN + 9 > batchBuf.length) { G.flushBatch(); batchN = 0; }
    var i = batchN;
    batchBuf[i] = x; batchBuf[i + 1] = y; batchBuf[i + 2] = z;
    batchBuf[i + 3] = nx; batchBuf[i + 4] = ny; batchBuf[i + 5] = nz;
    batchBuf[i + 6] = r; batchBuf[i + 7] = g; batchBuf[i + 8] = b;
    batchN += 9;
  };

  G.batchTri = function (p0, p1, p2, n, c) {
    G.batchVert(p0[0], p0[1], p0[2], n[0], n[1], n[2], c[0], c[1], c[2]);
    G.batchVert(p1[0], p1[1], p1[2], n[0], n[1], n[2], c[0], c[1], c[2]);
    G.batchVert(p2[0], p2[1], p2[2], n[0], n[1], n[2], c[0], c[1], c[2]);
  };

  G.batchQuad = function (p0, p1, p2, p3, c) {
    var e1 = NB.M.sub(p1, p0), e2 = NB.M.sub(p3, p0);
    var n = NB.M.norm(NB.M.cross(e1, e2));
    G.batchTri(p0, p1, p2, n, c);
    G.batchTri(p0, p2, p3, n, c);
  };

  G.flushBatch = function () {
    if (batchN === 0) return;
    var n = batchN / 9;
    gl.useProgram(progOpaque.prog);
    gl.uniform3f(progOpaque.u.uTint, 1, 1, 1);
    gl.uniformMatrix4fv(progOpaque.u.uModel, false, IDENTITY);
    gl.bindBuffer(gl.ARRAY_BUFFER, batchVBO);
    gl.bufferData(gl.ARRAY_BUFFER, batchBuf.subarray(0, batchN), gl.DYNAMIC_DRAW);
    bindOpaqueAttribs(batchVBO);
    drawWith(batchVBO, n);
    batchN = 0;
  };

  G.beginSprites = function () { spriteN = 0; };

  G.sprite = function (x, y, z, size, color, alpha, additive, rot) {
    var isAdd = additive === undefined ? true : !!additive;
    var buf = isAdd ? spriteBuf : spriteBuf2;
    var at = isAdd ? spriteN : spriteN2;
    if (at + 54 > buf.length) { G.flushSprites(); buf = isAdd ? spriteBuf : spriteBuf2; at = isAdd ? spriteN : spriteN2; }
    var h = size * 0.5;
    var rx = camRight[0] * h, ry = camRight[1] * h, rz = camRight[2] * h;
    var ux = camUp[0] * h, uy = camUp[1] * h, uz = camUp[2] * h;
    if (rot) {
      var cr = Math.cos(rot), sr = Math.sin(rot);
      var nrx = rx * cr + ux * sr, nry = ry * cr + uy * sr, nrz = rz * cr + uz * sr;
      var nux = -rx * sr + ux * cr, nuy = -ry * sr + uy * cr, nuz = -rz * sr + uz * cr;
      rx = nrx; ry = nry; rz = nrz; ux = nux; uy = nuy; uz = nuz;
    }
    var i = at;
    i = spriteVert(buf, i, x - rx - ux, y - ry - uy, z - rz - uz, color, alpha, -1, -1);
    i = spriteVert(buf, i, x + rx - ux, y + ry - uy, z + rz - uz, color, alpha, 1, -1);
    i = spriteVert(buf, i, x + rx + ux, y + ry + uy, z + rz + uz, color, alpha, 1, 1);
    i = spriteVert(buf, i, x - rx - ux, y - ry - uy, z - rz - uz, color, alpha, -1, -1);
    i = spriteVert(buf, i, x + rx + ux, y + ry + uy, z + rz + uz, color, alpha, 1, 1);
    spriteVert(buf, i, x - rx + ux, y - ry + uy, z - rz + uz, color, alpha, -1, 1);
    if (isAdd) spriteN = i + 9; else spriteN2 = i + 9;
  };

  function spriteVert(buf, i, x, y, z, c, a, u, v) {
    buf[i] = x; buf[i + 1] = y; buf[i + 2] = z;
    buf[i + 3] = c[0]; buf[i + 4] = c[1]; buf[i + 5] = c[2]; buf[i + 6] = a;
    buf[i + 7] = u; buf[i + 8] = v;
    return i + 9;
  }

  function flushSpriteSet(buf, count, vbo, additive) {
    if (count === 0) return 0;
    var n = count / 9;
    gl.useProgram(progSprite.prog);
    gl.uniformMatrix4fv(progSprite.u.uProj, false, projMat);
    gl.uniformMatrix4fv(progSprite.u.uView, false, viewMat);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, buf.subarray(0, count), gl.DYNAMIC_DRAW);
    var a = progSprite.a;
    gl.enableVertexAttribArray(a.aPos);
    gl.vertexAttribPointer(a.aPos, 3, gl.FLOAT, false, STRIDE_SPRITE, 0);
    gl.enableVertexAttribArray(a.aColor);
    gl.vertexAttribPointer(a.aColor, 4, gl.FLOAT, false, STRIDE_SPRITE, 12);
    gl.enableVertexAttribArray(a.aUV);
    gl.vertexAttribPointer(a.aUV, 2, gl.FLOAT, false, STRIDE_SPRITE, 28);
    gl.drawArrays(gl.TRIANGLES, 0, n);
    G.stats.sprites += n / 6;
    gl.disableVertexAttribArray(a.aPos);
    gl.disableVertexAttribArray(a.aColor);
    gl.disableVertexAttribArray(a.aUV);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    return 0;
  }

  G.flushSprites = function () {
    spriteN = flushSpriteSet(spriteBuf, spriteN, spriteVBO, true);
    spriteN2 = flushSpriteSet(spriteBuf2, spriteN2, spriteVBO2, false);
  };

  G.end = function () {
    G.flushBatch();
    G.flushSprites();
  };

  G.project = function (out2, worldPos) {
    var o = [0, 0, 0];
    NB.M.xformPoint(o, viewMat, worldPos);
    var p = [0, 0, 0];
    NB.M.xformPoint(p, projMat, o);
    if (o[2] > -0.1 || p[3] <= 0.0001) { out2[0] = -9999; out2[1] = -9999; return false; }
    out2[0] = (p[0] / p[3] * 0.5 + 0.5) * G.width;
    out2[1] = (1 - (p[1] / p[3] * 0.5 + 0.5)) * G.height;
    return true;
  };

  G.gl = function () { return gl; };
  NB.gl = G;
})(window.NB = window.NB || {});
