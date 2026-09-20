/**
 * How long does the fly last?
 *
 * Runs full games to their end, intact and lesioned, and reports survival time
 * and score. The point is to confirm two things: that an intact fly holds out
 * for a few minutes before the rising difficulty beats it (so the fail state is
 * reachable rather than decorative), and that lesioned flies die much sooner.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FlyBrain, parseCircuit } from '../src/lif.js';
import { FlyController } from '../src/controller.js';
import { FalafelGame } from '../src/game/orders.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = readFileSync(join(root, 'public/data/circuit.bin'));
const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
const meta = JSON.parse(readFileSync(join(root, 'public/data/circuit.json'), 'utf8'));

const brain = new FlyBrain(parseCircuit(buf));
const ctl = new FlyController(meta, brain);
const TICK = 1000 / 60;
const CAP_SECONDS = 600;

function playOnce(seed) {
  const game = new FalafelGame(seed);
  brain.reset();
  ctl.decoder.dwell = 0;
  ctl.decoder.grabCooldown = 0;
  ctl.decoder.swatCooldown = 0;
  let handAz = 0;
  let t = 0;
  while (!game.over && t < CAP_SECONDS) {
    game.update(TICK / 1000);
    if (game.over) break;
    const goal = game.goal();
    const out = ctl.tick(TICK, {
      handAz, goalAz: goal.az, salience: 1,
      arousal: game.arousal(), pests: game.loomingInputs(),
    });
    handAz += out.turnDegPerSec * (TICK / 1000);
    if (handAz > 95) handAz = 95; else if (handAz < -95) handAz = -95;
    if (out.grab) game.grab(handAz);
    if (out.swat) {
      const live = game.pests.filter((p) => !p.dead);
      const side = out.swat;
      const onSide = live.filter((p) => (side > 0 ? p.az >= 0 : p.az < 0));
      const pick = (onSide.length ? onSide : live)[0];
      if (pick) game.swat(pick.az);
    }
    t += TICK / 1000;
  }
  return { seconds: t, score: game.score, served: game.served, survived: t >= CAP_SECONDS };
}

function condition(label, apply) {
  brain.clearSilenced();
  brain.setScrambled(false);
  if (apply) apply();
  const runs = [1, 2, 3].map((s) => playOnce(1000 + s * 7919));
  const mean = (k) => runs.reduce((a, b) => a + b[k], 0) / runs.length;
  console.log(
    label.padEnd(22) +
    ('survived ' + mean('seconds').toFixed(0) + ' s').padEnd(18) +
    ('score ' + mean('score').toFixed(0)).padEnd(14) +
    ('served ' + mean('served').toFixed(0)).padEnd(13) +
    (runs.every((r) => r.survived) ? 'hit cap' : '')
  );
  return mean('seconds');
}

console.log('survival to game over (mean of 3 runs, cap ' + CAP_SECONDS + ' s)\n');
const intact = condition('intact connectome', null);
const scram = condition('scrambled wiring', () => brain.setScrambled(true));
const noDn = condition('DNa02 silenced', () => {
  brain.silenceGroup(meta.groups.DNa02_L, true);
  brain.silenceGroup(meta.groups.DNa02_R, true);
});
const noLp = condition('LPLC2 silenced', () => {
  brain.silenceGroup(meta.groups.LPLC2_L, true);
  brain.silenceGroup(meta.groups.LPLC2_R, true);
});
brain.clearSilenced();

console.log('');
const ok = intact > scram * 2 && intact > noDn * 2;
console.log(ok
  ? 'PASS: the intact fly outlasts the lesioned ones by more than 2x'
  : 'FAIL: lesions are not costing the fly anything');
process.exit(ok ? 0 : 1);
