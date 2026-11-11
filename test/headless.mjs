// Test headless Chrome : lance dist/index.html en selftest, capture le JSON + screenshot.
// Usage : node test/headless.mjs [--frames=240] [--shot=test/shot.png] [--url=...] [--size=1280,800] [--keep]
import { execFileSync } from 'node:child_process';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const CHROME = process.env.CHROME || 'google-chrome';
const args = process.argv.slice(2);
const opt = (name, def) => {
  const hit = args.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : def;
};
const flag = (name) => args.includes('--' + name);

const frames = opt('frames', '240');
const size = opt('size', '1280,800');
const shot = opt('shot', '');
const projectRoot = resolve(import.meta.dirname, '..');
const url = opt('url', 'file://' + resolve(projectRoot, 'dist/index.offline.html'));
const qs = url.includes('?') ? '&' : '?';
const target = `${url}${qs}selftest=${frames}${flag('keep') ? '' : ''}`;

const baseFlags = [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--allow-file-access-from-files', '--hide-scrollbars',
  `--window-size=${size}`, '--mute-audio'
];

function run(extraFlags, outUrl) {
  const cmd = [
    ...baseFlags, ...extraFlags,
    `--virtual-time-budget=${opt('budget', '25000')}`,
    '--dump-dom', outUrl
  ];
  try {
    return execFileSync(CHROME, cmd, {
      encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 180000, stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (e) {
    return (e.stdout || '') + '\n[chrome error] ' + (e.stderr || e.message).toString().slice(0, 800);
  }
}

const dom = run([], target);

const m = dom.match(/<pre id="selftest">([\s\S]*?)<\/pre>/);
let report = null;
if (m) {
  try { report = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')); }
  catch (e) { report = { parseError: String(e), raw: m[1].slice(0, 600) }; }
}
const titleMatch = dom.match(/<title>([\s\S]*?)<\/title>/);

if (shot) {
  mkdirSync(dirname(resolve(shot)), { recursive: true });
  run([`--screenshot=${resolve(shot)}`], target);
}

console.log('URL      :', target);
console.log('TITLE    :', titleMatch ? titleMatch[1].slice(0, 300) : '(none)');
if (report) {
  const { karts, ...rest } = report;
  console.log('REPORT   :', JSON.stringify(rest, null, 1));
  if (karts) console.log('KARTS    :', karts.map((k) => `#${k.id} ${k.alive ? 'vivant' : 'MORT'} sp=${k.sp} kills=${k.kills} (${k.x},${k.z})`).join('\n           '));
  mkdirSync(resolve(projectRoot, 'test'), { recursive: true });
  writeFileSync(resolve(projectRoot, 'test/last-report.json'), JSON.stringify(report, null, 1));
  const bad = !report.ok || (report.errors || []).length || (report.moved || 0) < 6 || (report.tris || 0) < 50;
  console.log(bad ? '\nVERDICT  : KO' : '\nVERDICT  : OK');
  process.exit(bad ? 1 : 0);
} else {
  console.log('REPORT   : ABSENT — le selftest n\'a pas tourné');
  console.log('DOM head :', dom.slice(0, 1200));
  process.exit(2);
}
