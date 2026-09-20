/**
 * Closed-loop acquisition benchmark.
 *
 * Puts a target somewhere on the stand, lets the circuit steer the hand to it,
 * and measures how long that takes. Then repeats with the wiring scrambled and
 * with DNa02 silenced.
 *
 * The intact condition has to beat both controls, otherwise the connectome is
 * not doing the work and the whole thing is just a light show.
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

const TICK_MS = 1000 / 60;
const TIMEOUT_MS = 6000;
const TARGETS = STATIONS.filter((s) => s.id !== 'kitchen').map((s) => s.az);

function runTrial(goalAz, startAz) {
  brain.reset();
  ctl.decoder.dwell = 0;
  ctl.decoder.grabCooldown = 0;
  let handAz = startAz;
  let t = 0;
  while (t < TIMEOUT_MS) {
    const out = ctl.tick(TICK_MS, {
      handAz, goalAz, salience: 1, arousal: 1, pests: [],
    });
    handAz += out.turnDegPerSec * (TICK_MS / 1000);
    if (handAz > 90) handAz = 90; else if (handAz < -90) handAz = -90;
    t += TICK_MS;
    if (out.grab) return { ok: true, ms: t, err: Math.abs(goalAz - handAz), handAz };
  }
  return { ok: false, ms: t, err: Math.abs(goalAz - handAz), handAz };
}

function condition(name) {
  const res = [];
  for (const g of TARGETS) {
    for (const start of [0, -70, 70]) {
      if (Math.abs(g - start) < 4) continue;
      res.push(runTrial(g, start));
    }
  }
  const hit = res.filter((r) => r.ok);
  const acc = hit.filter((r) => r.err <= 15);
  const meanMs = hit.length ? hit.reduce((a, b) => a + b.ms, 0) / hit.length : 0;
  const meanErr = res.reduce((a, b) => a + b.err, 0) / res.length;
  console.log(
    name.padEnd(22) +
    ('acquired ' + hit.length + '/' + res.length).padEnd(18) +
    ('within 15 deg ' + acc.length + '/' + res.length).padEnd(24) +
    ('mean ' + meanMs.toFixed(0) + ' ms').padEnd(14) +
    'mean |err| ' + meanErr.toFixed(1) + ' deg'
  );
  return { name, hit: hit.length, acc: acc.length, total: res.length, meanMs, meanErr };
}

console.log('closed-loop target acquisition\n');
const intact = condition('intact connectome');

brain.setScrambled(true);
const scram = condition('scrambled wiring');
brain.setScrambled(false);

brain.silenceGroup(meta.groups.DNa02_L, true);
brain.silenceGroup(meta.groups.DNa02_R, true);
const noDn = condition('DNa02 silenced');
brain.clearSilenced();

brain.silenceGroup(meta.groups.AOTU019_L, true);
brain.silenceGroup(meta.groups.AOTU019_R, true);
const no19 = condition('AOTU019 silenced');
brain.clearSilenced();

console.log('\nverdict');
const ok = intact.acc > scram.acc && intact.acc > noDn.acc;
console.log('  intact on-target trials:    ' + intact.acc + '/' + intact.total);
console.log('  scrambled on-target trials: ' + scram.acc + '/' + scram.total);
console.log('  DNa02-silenced:             ' + noDn.acc + '/' + noDn.total);
console.log('  AOTU019-silenced:           ' + no19.acc + '/' + no19.total);
console.log(ok
  ? '  PASS: the intact connectome outperforms both controls'
  : '  FAIL: controls match the intact circuit, the wiring is not doing the work');
process.exit(ok ? 0 : 1);
