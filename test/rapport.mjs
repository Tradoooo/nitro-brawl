// Génère test/rapport.html : captures + stats du jeu qui se joue tout seul (autopilote).
// Usage : node test/rapport.mjs
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const STAGES = [
  { f: 60, label: 'Compte à rebours' },
  { f: 480, label: 'Départ (8 s)' },
  { f: 1500, label: 'Mi-manche (25 s)' },
  { f: 2700, label: 'Fin de manche (45 s)' }
];
const FLAGS = ['--headless=new', '--no-sandbox', '--disable-gpu', '--use-gl=angle',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files',
  '--hide-scrollbars', '--user-data-dir=/tmp/nbrap-' + process.pid, '--window-size=960,600'];

function run(frames, shot) {
  const url = `file://${ROOT}/dist/index.offline.html?selftest=${frames}&autopilot=1&freeze=1&map=0`;
  const args = [...FLAGS, `--virtual-time-budget=${frames * 14 + 8000}`,
    `--screenshot=${resolve(ROOT, 'test', shot)}`, '--dump-dom', url];
  try {
    return execFileSync('google-chrome', args, { encoding: 'utf8', maxBuffer: 64e6, timeout: 300000, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { return e.stdout || ''; }
}

const rows = [];
const force = process.argv.includes('--force');
for (const st of STAGES) {
  const shot = `rapport_${st.f}.png`;
  const jsonFile = resolve(ROOT, 'test', `rapport_${st.f}.json`);
  if (!force && existsSync(resolve(ROOT, 'test', shot)) && existsSync(jsonFile)) {
    rows.push({ ...st, shot, r: JSON.parse(readFileSync(jsonFile, 'utf8')) });
    console.log(st.label, '-> (cache)');
    continue;
  }
  const dom = run(st.f, shot);
  const m = dom.match(/<pre id="selftest">([\s\S]*?)<\/pre>/);
  let r = null;
  if (m) { try { r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')); } catch (e) { /* ignore */ } }
  rows.push({ ...st, shot, r });
  if (r) writeFileSync(jsonFile, JSON.stringify(r));
  console.log(st.label, '->', r ? `ok=${r.ok} kills=${r.deaths} tirs=${r.shots} tris=${r.tris}` : 'ECHEC');
}

const last = rows[rows.length - 1].r;
const imgs = rows.map((x) => `<figure><img src="${x.shot}" alt="${x.label}"><figcaption>${x.label}</figcaption></figure>`).join('');
const stats = last ? `<table>
<tr><th>Frames simulées</th><td>${last.frames}</td></tr>
<tr><th>Erreurs JS</th><td>${(last.errors || []).length === 0 ? 'aucune ✔' : last.errors.join(' | ')}</td></tr>
<tr><th>Karts actifs</th><td>${last.moved}/8</td></tr>
<tr><th>Éliminations</th><td>${last.deaths}</td></tr>
<tr><th>Tirs</th><td>${last.shots}</td></tr>
<tr><th>Power-ups ramassés</th><td>${last.pickups}</td></tr>
<tr><th>Triangles / draw calls</th><td>${last.tris} / ${last.calls}</td></tr>
<tr><th>Particules</th><td>${last.particles}</td></tr></table>` : '<p>selftest absent</p>';
const karts = last ? '<table><tr><th>Kart</th><th>État</th><th>Kills</th><th>Vitesse</th><th>Position</th></tr>' +
  last.karts.map((k, i) => `<tr><td>${i === 0 ? 'TOI (autopilote)' : 'bot ' + i}</td><td>${k.alive ? 'vivant' : 'éliminé'}</td><td>${k.kills}</td><td>${Math.round(k.sp * 3.6)} km/h</td><td>${k.x}, ${k.z}</td></tr>`).join('') + '</table>' : '';

writeFileSync(resolve(ROOT, 'test/rapport.html'), `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>NITRO BRAWL — rapport de test</title><style>
body{background:#0b0e1a;color:#eaf0ff;font-family:system-ui,sans-serif;margin:0;padding:28px}
h1{font-size:30px}h2{margin-top:34px;color:#2ee6ff}
figure{margin:0 0 18px}img{width:100%;border-radius:12px;border:1px solid #234}
figcaption{opacity:.7;font-size:13px;margin-top:6px}
table{border-collapse:collapse;margin:10px 0}td,th{border:1px solid #234;padding:6px 12px;font-size:14px;text-align:left}
a{color:#ffd23e}</style></head><body>
<h1>NITRO BRAWL — rapport de test automatique</h1>
<p>Généré le ${new Date().toLocaleString('fr-FR')} · le jeu se joue tout seul (autopilote), Chrome headless + WebGL logiciel.</p>
<h2>Captures</h2>${imgs}
<h2>Stats de la manche complète</h2>${stats}
<h2>Karts en fin de manche</h2>${karts}
<h2>Liens</h2>
<p><a href="http://127.0.0.1:8745/index.offline.html?autopilot=1">Regarder l'autopilote en direct</a> ·
<a href="http://127.0.0.1:8745/index.offline.html">Jouer (Firefox recommandé sur ce poste)</a></p>
</body></html>`);
console.log('test/rapport.html écrit');
