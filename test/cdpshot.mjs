// Capture fiable via CDP : attend window.__READY puis Page.captureScreenshot.
// Usage : node test/cdpshot.mjs <sortie.png> "<params>" [largeur hauteur] [attente_ms]
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createConnection } from 'node:net';
import { createHash, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import http from 'node:http';

const ROOT = resolve(import.meta.dirname, '..');
const [out, params, W = '1000', H = '640', WAIT = '45000'] = process.argv.slice(2);
const PORT = 9300 + (process.pid % 80);
const D = '/tmp/nbcdp-' + process.pid;
mkdirSync(D, { recursive: true });
writeFileSync(D + '/index.html', execFileSync('cat', [ROOT + '/dist/index.offline.html'], { encoding: 'utf8', maxBuffer: 128e6 }));
const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--allow-file-access-from-files', '--hide-scrollbars',
  '--user-data-dir=' + D + '/prof', `--window-size=${W},${H}`, `--remote-debugging-port=${PORT}`,
  `file://${D}/index.html?${params}`
], { stdio: 'ignore' });

function getJson(path) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, (r) => {
      let b = ''; r.on('data', (c) => b += c); r.on('end', () => res(JSON.parse(b)));
    }).on('error', rej);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class WS {
  constructor(url) { this.url = url; this.buf = Buffer.alloc(0); this.handlers = []; }
  connect() {
    return new Promise((res, rej) => {
      const m = this.url.match(/ws:\/\/([^:/]+):(\d+)(\/.*)/);
      const key = randomBytes(16).toString('base64');
      this.sock = createConnection({ host: m[1], port: +m[2] }, () => {
        this.sock.write(`GET ${m[3]} HTTP/1.1\r\nHost: ${m[1]}:${m[2]}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
      });
      this.sock.on('data', (d) => { this.buf = Buffer.concat([this.buf, d]); this.pump(res); });
      this.sock.on('error', rej);
    });
  }
  pump(res) {
    if (!this.up) {
      const i = this.buf.indexOf('\r\n\r\n');
      if (i < 0) return;
      this.up = true; this.buf = this.buf.subarray(i + 4); res();
    }
    while (this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1];
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      if (this.buf.length < off + len) return;
      const payload = this.buf.subarray(off, off + len);
      this.buf = this.buf.subarray(off + len);
      if ((b0 & 0x0f) === 1) this.handlers.forEach((h) => h(JSON.parse(payload.toString())));
    }
  }
  on(fn) { this.handlers.push(fn); }
  send(obj) {
    const p = Buffer.from(JSON.stringify(obj));
    const mask = randomBytes(4);
    let head;
    if (p.length < 126) head = Buffer.from([0x81, 0x80 | p.length]);
    else if (p.length < 65536) { head = Buffer.from([0x81, 0x80 | 126, 0, 0]); head.writeUInt16BE(p.length, 2); }
    else { head = Buffer.from([0x81, 0x80 | 127, 0, 0, 0, 0, 0, 0, 0, 0]); head.writeBigUInt64BE(BigInt(p.length), 2); }
    const masked = Buffer.alloc(p.length);
    for (let i = 0; i < p.length; i++) masked[i] = p[i] ^ mask[i % 4];
    this.sock.write(Buffer.concat([head, mask, masked]));
  }
}

(async () => {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(500);
    try { target = (await getJson('/json')).find((t) => t.type === 'page' && t.webSocketDebuggerUrl); } catch (e) { /* pas encore */ }
  }
  if (!target) { console.error('pas de cible CDP'); chrome.kill(); process.exit(2); }
  const ws = new WS(target.webSocketDebuggerUrl);
  await ws.connect();
  let id = 1;
  const pending = new Map();
  ws.on((msg) => { if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } });
  const cmd = (method, p = {}) => new Promise((res) => { const i = id++; pending.set(i, res); ws.send({ id: i, method, params: p }); });
  await cmd('Page.enable');
  await cmd('Runtime.enable');
  let ready = false;
  const t0 = Date.now();
  while (!ready && Date.now() - t0 < +WAIT) {
    const r = await cmd('Runtime.evaluate', { expression: 'window.__READY===true', returnByValue: true });
    ready = !!(r.result && r.result.result && r.result.result.value);
    if (!ready) await sleep(400);
  }
  if (!ready) console.error('ATTENTION: __READY jamais vrai (capture de l etat courant)');
  await sleep(600);
  const shot = await cmd('Page.captureScreenshot', { format: 'png' });
  if (shot.result && shot.result.data) {
    const dest = resolve(ROOT, 'test/qa', out);
    mkdirSync(resolve(ROOT, 'test/qa'), { recursive: true });
    writeFileSync(dest, Buffer.from(shot.result.data, 'base64'));
    console.log('écrit', dest);
  } else console.error('pas de screenshot');
  chrome.kill();
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); chrome.kill(); process.exit(2); });
