/**
 * How much does the central complex actually contribute?
 *
 * Sweeps the PFL3 goal drive from off to full and measures closed-loop
 * acquisition. Answers two things at once: the right gain to ship, and whether
 * the CX lesion control is telling the truth.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FlyBrain, parseCircuit } from '../src/lif.js';
import { FlyController } from '../src/controller.js';
import { STATIONS } from '../src/game/orders.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = readFileSync(join(root, 'public/data/circuit.bin'));
const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
const meta = JSON.parse(readFileSync(join(root, 'public/data/circuit.json'), 'utf8'));

const brain = new FlyBrain(parseCircuit(buf));
const ctl = new FlyController(meta, brain);
const TICK = 1000 / 60;
const TIMEOUT = 6000;
const TARGETS = STATIONS.filter((s) => s.id !== 'kitchen').map((s) => s.az);
const STARTS = [0, -70, 70];

function trial(goalAz, startAz, goalStrength) {
  brain.reset();
  ctl.decoder.dwell = 0;
  ctl.decoder.grabCooldown = 0;
  let handAz = startAz, t = 0;
  while (t < TIMEOUT) {
    const out = ctl.tick(TICK, { handAz, goalAz, salience: 1, arousal: 1, pests: [], goalStrength });
    handAz += out.turnDegPerSec * (TICK / 1000);
    if (handAz > 90) handAz = 90; else if (handAz < -90) handAz = -90;
    t += TICK;
    if (out.grab) return { ok: true, ms: t, err: Math.abs(goalAz - handAz) };
  }
  return { ok: false, ms: t, err: Math.abs(goalAz - handAz) };
}

function measure(goalStrength) {
  const res = [];
  for (const g of TARGETS) {
    for (const s of STARTS) {
      if (Math.abs(g - s) < 4) continue;
      res.push(trial(g, s, goalStrength));
    }
  }
  const acc = res.filter((r) => r.ok && r.err <= 15);
  const meanMs = acc.length ? acc.reduce((a, b) => a + b.ms, 0) / acc.length : 0;
  return {
    goalStrength,
    onTarget: acc.length + '/' + res.length,
    frac: acc.length / res.length,
    meanErr: res.reduce((a, b) => a + b.err, 0) / res.length,
    meanMs,
  };
}

console.log('PFL3 goal drive sweep (closed loop)\n');
console.log(['drive'.padStart(6), 'on target'.padStart(11), 'mean |err|'.padStart(11), 'mean ms'.padStart(9)].join(''));
const rows = [];
for (const s of [0, 0.25, 0.5, 0.75, 1.0, 1.5]) {
  const r = measure(s);
  rows.push(r);
  console.log([
    r.goalStrength.toFixed(2).padStart(6),
    r.onTarget.padStart(11),
    r.meanErr.toFixed(1).padStart(11),
    r.meanMs.toFixed(0).padStart(9),
  ].join(''));
}
const best = rows.reduce((a, b) => (b.frac > a.frac || (b.frac === a.frac && b.meanErr < a.meanErr) ? b : a));
console.log('\nbest PFL3 goal drive: ' + best.goalStrength);
const off = rows[0];
console.log('with CX off: ' + off.onTarget + ' at ' + off.meanErr.toFixed(1) + ' deg');
console.log('difference:  ' + ((best.frac - off.frac) * 100).toFixed(0) + ' percentage points');
