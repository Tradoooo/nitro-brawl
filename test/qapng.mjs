// Capture fiable : le jeu exporte son propre PNG (readPixels), extrait du DOM.
// Usage : node test/qapng.mjs <sortie.png> "<params>" [largeur hauteur]
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
const ROOT = resolve(import.meta.dirname, '..');
const [out, params, w = '1000', h = '640'] = process.argv.slice(2);
const D = '/tmp/nbqapng-' + process.pid;
mkdirSync(D, { recursive: true });
writeFileSync(D + '/index.html', readFileSync(ROOT + '/dist/index.offline.html', 'utf8'));
const ud = '/tmp/nbqapng-ud-' + process.pid;
mkdirSync(ud, { recursive: true });
const dom = execFileSync('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--allow-file-access-from-files', '--hide-scrollbars',
  '--user-data-dir=' + ud, `--window-size=${w},${h}`, '--virtual-time-budget=9000', '--dump-dom',
  `file://${D}/index.html?${params}&png=1`
], { encoding: 'utf8', maxBuffer: 256e6, timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'] });
const m = dom.match(/<pre id="qapng">data:image\/png;base64,([A-Za-z0-9+/=]+)<\/pre>/);
if (!m) { console.error('PAS DE PNG DANS LE DOM'); process.exit(2); }
const dest = resolve(ROOT, 'test/qa', out);
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, Buffer.from(m[1], 'base64'));
console.log('écrit', dest);
