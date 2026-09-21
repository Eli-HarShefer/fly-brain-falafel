/** Where the fly's turning speed comes from, measured end to end. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FlyBrain, parseCircuit } from '../src/lif.js';
import { FlyController, TURN_GAIN, MAX_TURN_DEG_S } from '../src/controller.js';
import { STEER_HZ_PER_DEG, BAL_R } from '../src/decode.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = readFileSync(join(root, 'public/data/circuit.bin'));
const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
const meta = JSON.parse(readFileSync(join(root, 'public/data/circuit.json'), 'utf8'));
const brain = new FlyBrain(parseCircuit(buf));
const ctl = new FlyController(meta, brain);

console.log('TURN_GAIN', TURN_GAIN, '| max', MAX_TURN_DEG_S, 'deg/s | STEER_HZ_PER_DEG',
  STEER_HZ_PER_DEG, '| BAL_R', BAL_R.toFixed(3), '\n');
console.log(['err'.padStart(5), 'DNa02_L'.padStart(9), 'DNa02_R'.padStart(9),
  'steerHz'.padStart(9), 'deg/s'.padStart(8)].join(''));
for (const err of [-70, -45, -30, -20, -10, 0, 10, 20, 30, 45, 70]) {
  brain.reset();
  let out;
  for (let i = 0; i < 40; i++) {
    out = ctl.tick(16.7, { handAz: 0, goalAz: err, salience: 1, arousal: 1, pests: [] });
  }
  console.log([String(err).padStart(5), out.rates.d2L.toFixed(1).padStart(9),
    out.rates.d2R.toFixed(1).padStart(9), out.steerHz.toFixed(1).padStart(9),
    out.turnDegPerSec.toFixed(0).padStart(8)].join(''));
}
console.log('\nsame target at -45 deg, different customer stress:');
for (const stress of [0, 0.5, 1]) {
  brain.reset();
  const arousal = 0.85 + stress * 1.15;
  let out;
  for (let i = 0; i < 40; i++) {
    out = ctl.tick(16.7, { handAz: 0, goalAz: -45, salience: 1, arousal, pests: [] });
  }
  console.log('  stress ' + stress.toFixed(1) + '  arousal ' + arousal.toFixed(2)
    + '  ->  ' + out.turnDegPerSec.toFixed(0).padStart(5) + ' deg/s');
}
