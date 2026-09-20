/**
 * Azimuth calibration sweep.
 *
 * Places a target at a range of angles, runs the real circuit, and measures what
 * the descending neurons do. The steering readout and its gain come out of this
 * measurement rather than being guessed, because the wiring crosses the midline
 * in places (PFL3 and AOTU019 both project contralaterally onto DNa02) and the
 * sign of the resulting command is not something to assume.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FlyBrain, parseCircuit, DT } from '../src/lif.js';
import { Encoder } from '../src/encode.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = readFileSync(join(root, 'public/data/circuit.bin'));
const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
const meta = JSON.parse(readFileSync(join(root, 'public/data/circuit.json'), 'utf8'));

const brain = new FlyBrain(parseCircuit(buf));
const enc = new Encoder(meta, brain);
const g = meta.groups;
const R = (name) => brain.groupRate(g[name]);

const SETTLE_MS = 120, MEASURE_MS = 260;
const settle = Math.round(SETTLE_MS / DT), measure = Math.round(MEASURE_MS / DT);

const angles = [];
for (let a = -45; a <= 45; a += 5) angles.push(a);

const rows = [];
console.log('target azimuth sweep (negative = target to the left of the hand)\n');
console.log(['az'.padStart(5), 'LC_L'.padStart(7), 'LC_R'.padStart(7),
  'A19_L'.padStart(7), 'A19_R'.padStart(7), 'A25_L'.padStart(7), 'A25_R'.padStart(7),
  'DNa02_L'.padStart(8), 'DNa02_R'.padStart(8), 'DNa03_L'.padStart(8), 'DNa03_R'.padStart(8),
].join(''));

for (const az of angles) {
  brain.reset();
  enc.begin();
  enc.setScene([{ deg: az }], 1);
  enc.setHeading(0);
  brain.step(settle);
  brain.step(measure);
  const r = {
    az,
    lcL: R('LC10a_L'), lcR: R('LC10a_R'),
    a19L: R('AOTU019_L'), a19R: R('AOTU019_R'),
    a25L: R('AOTU025_L'), a25R: R('AOTU025_R'),
    d2L: R('DNa02_L'), d2R: R('DNa02_R'),
    d3L: R('DNa03_L'), d3R: R('DNa03_R'),
  };
  rows.push(r);
  console.log([
    String(az).padStart(5),
    r.lcL.toFixed(1).padStart(7), r.lcR.toFixed(1).padStart(7),
    r.a19L.toFixed(1).padStart(7), r.a19R.toFixed(1).padStart(7),
    r.a25L.toFixed(1).padStart(7), r.a25R.toFixed(1).padStart(7),
    r.d2L.toFixed(1).padStart(8), r.d2R.toFixed(1).padStart(8),
    r.d3L.toFixed(1).padStart(8), r.d3R.toFixed(1).padStart(8),
  ].join(''));
}

function corr(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return { r: sxy / Math.sqrt(sxx * syy || 1), slope: sxy / (sxx || 1), mx, my };
}

const az = rows.map((r) => r.az);
const candidates = {
  'DNa02_R - DNa02_L': rows.map((r) => r.d2R - r.d2L),
  'DNa03_R - DNa03_L': rows.map((r) => r.d3R - r.d3L),
  'A19_R - A19_L': rows.map((r) => r.a19R - r.a19L),
  'A25_R - A25_L': rows.map((r) => r.a25R - r.a25L),
  'combined (a02 + 0.5*a03)': rows.map((r) => (r.d2R - r.d2L) + 0.5 * (r.d3R - r.d3L)),
};

console.log('\nreadout candidates vs target azimuth:');
console.log(['readout'.padEnd(26), 'r'.padStart(7), 'slope'.padStart(9), 'offset'.padStart(9)].join(''));
let best = null;
for (const [name, ys] of Object.entries(candidates)) {
  const c = corr(az, ys);
  const offset = c.my - c.slope * c.mx;
  console.log([name.padEnd(26), c.r.toFixed(3).padStart(7),
    c.slope.toFixed(4).padStart(9), offset.toFixed(2).padStart(9)].join(''));
  if (!best || Math.abs(c.r) > Math.abs(best.c.r)) best = { name, c, offset };
}

console.log('\nbest readout: ' + best.name);
console.log('  r = ' + best.c.r.toFixed(3));
console.log('  Hz per degree = ' + best.c.slope.toFixed(4));
console.log('  zero offset   = ' + best.offset.toFixed(3) + ' Hz');
console.log('  => STEER_GAIN (deg per Hz) = ' + (1 / best.c.slope).toFixed(3));
console.log('  => STEER_BIAS (Hz)         = ' + best.offset.toFixed(3));

// The left and right arms of the circuit are not equally responsive: the
// extracted subcircuit gives AOTU025_L more net drive than AOTU025_R, so a
// target at -40 deg produces a bigger DNa02 response than one at +40. Measure
// that imbalance and emit a per-side scale so the hand turns symmetrically.
let sumL = 0, sumR = 0;
for (const r of rows) {
  if (r.az <= -20) sumL += r.d2L;
  if (r.az >= 20) sumR += r.d2R;
}
const balR = sumL / (sumR || 1);
const balanced = rows.map((r) => r.d2R * balR - r.d2L);
const cb = corr(az, balanced);
console.log('\nbalanced readout  DNa02_R * BAL_R - DNa02_L');
console.log('  left sum ' + sumL.toFixed(1) + '   right sum ' + sumR.toFixed(1));
console.log('  BAL_R = ' + balR.toFixed(4));
console.log('  r = ' + cb.r.toFixed(3) + '   Hz per degree = ' + cb.slope.toFixed(4));

// on-target detector: AOTU019 peaks when the target is centred
console.log('\nAOTU019 max vs azimuth (the on-target signal):');
for (const r of rows) {
  console.log('  az ' + String(r.az).padStart(4) + '  max(A19) ' +
    Math.max(r.a19L, r.a19R).toFixed(1).padStart(6) +
    '   |steer| ' + Math.abs(r.d2R * balR - r.d2L).toFixed(1).padStart(7));
}

console.log('\n--- constants for decode.js ---');
console.log('export const BAL_R = ' + balR.toFixed(4) + ';');
console.log('export const STEER_HZ_PER_DEG = ' + cb.slope.toFixed(4) + ';');

// looming / escape threshold
console.log('\nlooming sweep (DNp01 vs expansion rate):');
for (const loom of [0, 0.2, 0.4, 0.6, 0.8, 1.0]) {
  brain.reset();
  enc.begin();
  enc.setLooming([{ sideDeg: 30, loom }]);
  brain.step(settle);
  brain.step(measure);
  console.log('  loom ' + loom.toFixed(1) +
    '  DNp01_L ' + R('DNp01_L').toFixed(1).padStart(6) +
    '  DNp01_R ' + R('DNp01_R').toFixed(1).padStart(6));
}
