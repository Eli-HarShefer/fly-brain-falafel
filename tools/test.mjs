/**
 * Unit tests. Run with `npm test`.
 *
 * These cover the parts where a silent error would be hard to notice: the LIF
 * integrator's timing and bookkeeping, the sign conventions in encode/decode,
 * and the game's state transitions. The bigger behavioural checks live in
 * closedloop.mjs and survival.mjs.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  FlyBrain, parseCircuit, DT, V_REST, V_THRESH, REFRACTORY, DELAY_MS,
} from '../src/lif.js';
import { Encoder, wrapDeg, FIELD_DEG } from '../src/encode.js';
import { Decoder, BAL_R } from '../src/decode.js';
import { FalafelGame, STATIONS, TRAY_MAX, stationAz } from '../src/game/orders.js';
import { MKS, makeDealer } from '../src/game/mks.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = readFileSync(join(root, 'public/data/circuit.bin'));
const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
const meta = JSON.parse(readFileSync(join(root, 'public/data/circuit.json'), 'utf8'));
const circuit = parseCircuit(buf);

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failures.push(name + ': ' + e.message); }
}
function ok(cond, msg) { if (!cond) throw new Error(msg || 'expected truthy'); }
function near(a, b, tol, msg) {
  if (Math.abs(a - b) > tol) throw new Error((msg || 'value') + ': ' + a + ' not within ' + tol + ' of ' + b);
}

const freshBrain = () => new FlyBrain(parseCircuit(
  raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)));

// ---------------------------------------------------------------- circuit ---

test('circuit parses with the expected shape', () => {
  ok(circuit.nNeurons === meta.nNeurons, 'neuron count mismatch');
  ok(circuit.nEdges === meta.nEdges, 'edge count mismatch');
  ok(circuit.indptr.length === circuit.nNeurons + 1, 'indptr length');
  ok(circuit.indptr[circuit.nNeurons] === circuit.nEdges, 'indptr tail');
  ok(circuit.pos.length === circuit.nNeurons * 3, 'positions length');
});

test('every edge target is a valid neuron index', () => {
  for (let k = 0; k < circuit.nEdges; k += 97) {
    const t = circuit.indices[k];
    ok(t >= 0 && t < circuit.nNeurons, 'target out of range at ' + k);
  }
});

test('indptr is monotonic', () => {
  for (let i = 0; i < circuit.nNeurons; i++) {
    ok(circuit.indptr[i] <= circuit.indptr[i + 1], 'indptr decreased at ' + i);
  }
});

test('group indices are in range and sides partition each type', () => {
  for (const [name, list] of Object.entries(meta.groups)) {
    for (const i of list) ok(i >= 0 && i < meta.nNeurons, name + ' index out of range');
  }
  for (const t of ['LC10a', 'LPLC2', 'DNa02', 'AOTU019']) {
    const l = meta.groups[t + '_L'].length, r = meta.groups[t + '_R'].length;
    ok(meta.groups[t].length === l + r, t + ' halves do not sum to the whole');
  }
});

// -------------------------------------------------------------------- LIF ---

test('an undriven network stays silent', () => {
  const b = freshBrain();
  b.step(2000);
  ok(b.totalSpikes === 0, 'spontaneous activity: ' + b.totalSpikes);
});

test('a driven neuron fires at roughly its drive rate', () => {
  const b = freshBrain();
  const i = meta.groups.LC10a_L[0];
  b.setExternal(i, 100);
  b.step(Math.round(4000 / DT));            // 4 s
  near(b.rate[i], 100, 35, 'rate for 100 Hz drive');
});

test('refractory period caps the firing rate', () => {
  const b = freshBrain();
  const i = meta.groups.LC10a_L[0];
  b.setExternal(i, 5000);                    // far above what it can follow
  b.step(Math.round(2000 / DT));
  const ceiling = 1000 / REFRACTORY;         // ~454 Hz
  ok(b.rate[i] <= ceiling + 20, 'rate ' + b.rate[i] + ' exceeds refractory ceiling');
  ok(b.rate[i] > 150, 'rate ' + b.rate[i] + ' implausibly low for saturating drive');
});

test('synaptic delay is honoured', () => {
  const b = freshBrain();
  // find a neuron with at least one outgoing edge
  let src = -1;
  for (let i = 0; i < circuit.nNeurons; i++) {
    if (circuit.indptr[i + 1] > circuit.indptr[i]) { src = i; break; }
  }
  ok(src >= 0, 'no neuron with outgoing edges');
  const tgt = circuit.indices[circuit.indptr[src]];
  // push the source over threshold by hand
  b.v[src] = V_THRESH + 1;
  b._activate(src);
  const before = b.g[tgt];
  b.step(Math.round((DELAY_MS - DT) / DT));  // just short of the delay
  const mid = b.g[tgt];
  b.step(2);
  const after = b.g[tgt];
  ok(mid === before, 'charge arrived early');
  ok(after !== before, 'charge never arrived');
});

test('inhibitory edges carry a negative weight and excitatory a positive one', () => {
  let neg = 0, pos = 0;
  for (let k = 0; k < circuit.nEdges; k++) {
    if (circuit.weights[k] < 0) neg++; else pos++;
  }
  ok(neg > 0 && pos > 0, 'expected a mix of signs');
  const frac = neg / circuit.nEdges;
  ok(frac > 0.15 && frac < 0.6, 'implausible inhibitory fraction ' + frac.toFixed(2));
});

test('silencing a group stops it firing', () => {
  const b = freshBrain();
  const grp = meta.groups.LC10a_L;
  for (const i of grp) b.setExternal(i, 150);
  b.silenceGroup(grp, true);
  b.step(Math.round(1000 / DT));
  near(b.groupRate(grp), 0, 0.001, 'silenced group rate');
  b.silenceGroup(grp, false);
  b.step(Math.round(1000 / DT));
  ok(b.groupRate(grp) > 10, 'group did not recover after unsilencing');
});

test('scrambling is reversible', () => {
  const b = freshBrain();
  const before = Array.from(b.indices.slice(0, 500));
  b.setScrambled(true);
  const during = Array.from(b.indices.slice(0, 500));
  b.setScrambled(false);
  const after = Array.from(b.indices.slice(0, 500));
  ok(before.join() !== during.join(), 'scramble changed nothing');
  ok(before.join() === after.join(), 'unscramble did not restore the wiring');
});

test('scrambling preserves out-degree', () => {
  const b = freshBrain();
  b.setScrambled(true);
  for (let i = 0; i < circuit.nNeurons; i += 311) {
    const deg = circuit.indptr[i + 1] - circuit.indptr[i];
    ok(deg >= 0, 'negative degree');
  }
  ok(b.indices.length === circuit.nEdges, 'edge count changed');
  b.setScrambled(false);
});

test('reset returns the network to rest', () => {
  const b = freshBrain();
  for (const i of meta.groups.LC10a_L) b.setExternal(i, 150);
  b.step(Math.round(500 / DT));
  ok(b.totalSpikes > 0, 'no activity to reset');
  b.reset();
  ok(b.timeMs === 0, 'time not reset');
  ok(b.totalSpikes === 0, 'spike count not reset');
  for (let i = 0; i < b.n; i++) {
    if (b.v[i] !== V_REST) throw new Error('membrane not at rest at ' + i);
    if (b.g[i] !== 0) throw new Error('conductance not cleared at ' + i);
  }
});

test('ring overflow is drained rather than lost', () => {
  const b = freshBrain();
  // force the overflow path directly: mark a slot and stage charge in it
  const slot = (b.ringSlot + 3) & 15;
  const tgt = 42;
  b.ring[slot * b.n + tgt] = 5.0;
  b.ringOverflow[slot] = 1;
  b.ringCount[slot] = 0;             // deliberately not recorded in the list
  b.step(16);                        // step past that slot
  near(b.ring[slot * b.n + tgt], 0, 1e-6, 'charge left stranded in the ring');
  ok(b.ringOverflow[slot] === 0, 'overflow flag not cleared');
});

test('gain scales weights linearly and preserves ratios', () => {
  const b = freshBrain();
  b.setGain(0.2);
  const a0 = b.weights[0], a1 = b.weights[1];
  b.setGain(0.4);
  near(b.weights[0], a0 * 2, Math.abs(a0) * 1e-4, 'weight did not double');
  if (a1 !== 0) near(b.weights[1] / b.weights[0], a1 / a0, 1e-4, 'ratio changed');
});

// ---------------------------------------------------------------- encoding ---

test('wrapDeg keeps angles in [-180, 180]', () => {
  near(wrapDeg(190), -170, 1e-9);
  near(wrapDeg(-190), 170, 1e-9);
  near(wrapDeg(0), 0, 1e-9);
  near(wrapDeg(540), 180, 1e-9);
});

test('a target on the left drives the left eye harder', () => {
  const b = freshBrain();
  const enc = new Encoder(meta, b);
  enc.begin();
  enc.setScene([{ deg: -30 }]);
  const sum = (list) => list.reduce((a, i) => a + b.extRate[i], 0);
  ok(sum(meta.groups.LC10a_L) > sum(meta.groups.LC10a_R) * 3, 'left eye not dominant');
});

test('a target on the right drives the right eye harder', () => {
  const b = freshBrain();
  const enc = new Encoder(meta, b);
  enc.begin();
  enc.setScene([{ deg: 30 }]);
  const sum = (list) => list.reduce((a, i) => a + b.extRate[i], 0);
  ok(sum(meta.groups.LC10a_R) > sum(meta.groups.LC10a_L) * 3, 'right eye not dominant');
});

test('a centred target drives both eyes (binocular zone)', () => {
  const b = freshBrain();
  const enc = new Encoder(meta, b);
  enc.begin();
  enc.setScene([{ deg: 0 }]);
  const sum = (list) => list.reduce((a, i) => a + b.extRate[i], 0);
  const l = sum(meta.groups.LC10a_L), r = sum(meta.groups.LC10a_R);
  ok(l > 0 && r > 0, 'binocular zone did not drive both eyes');
  near(l / r, 1, 0.6, 'binocular drive badly asymmetric');
});

test('looming drives the eye the object is on, and only above threshold', () => {
  const b = freshBrain();
  const enc = new Encoder(meta, b);
  enc.begin();
  enc.setLooming([{ sideDeg: 40, loom: 0.8 }]);
  const sum = (list) => list.reduce((a, i) => a + b.extRate[i], 0);
  ok(sum(meta.groups.LPLC2_R) > 0, 'right LPLC2 not driven');
  near(sum(meta.groups.LPLC2_L), 0, 1e-6, 'left LPLC2 should be quiet');
  enc.begin();
  enc.setLooming([{ sideDeg: 40, loom: 0 }]);
  near(sum(meta.groups.LPLC2_R), 0, 1e-6, 'zero loom should not drive');
});

test('PFL3 halves are driven asymmetrically by goal direction', () => {
  const b = freshBrain();
  const enc = new Encoder(meta, b);
  const sum = (list) => list.reduce((a, i) => a + b.extRate[i], 0);
  enc.begin(); enc.setGoal(40);
  const rRight = sum(meta.groups.PFL3_R), lRight = sum(meta.groups.PFL3_L);
  enc.begin(); enc.setGoal(-40);
  const rLeft = sum(meta.groups.PFL3_R), lLeft = sum(meta.groups.PFL3_L);
  ok(rRight > lRight, 'goal to the right did not favour PFL3_R');
  ok(lLeft > rLeft, 'goal to the left did not favour PFL3_L');
});

test('begin() clears the previous tick drive', () => {
  const b = freshBrain();
  const enc = new Encoder(meta, b);
  enc.begin();
  enc.setScene([{ deg: -30 }]);
  ok(b.extRate.some((v) => v > 0), 'nothing driven');
  enc.begin();
  ok(!b.extRate.some((v) => v > 0), 'drive not cleared');
});

// ---------------------------------------------------------------- decoding ---

test('steer sign follows the DNa02 imbalance', () => {
  const b = freshBrain();
  const dec = new Decoder(meta, b);
  // right side louder than left should read as "target is to the right"
  b.rate[meta.groups.DNa02_R[0]] = 100;
  b.rate[meta.groups.DNa02_L[0]] = 0;
  ok(dec.read(16).steerHz > 0, 'right-dominant should steer positive');
  b.rate[meta.groups.DNa02_R[0]] = 0;
  b.rate[meta.groups.DNa02_L[0]] = 100;
  ok(dec.read(16).steerHz < 0, 'left-dominant should steer negative');
});

test('BAL_R makes an equal left/right response read as centred', () => {
  const b = freshBrain();
  const dec = new Decoder(meta, b);
  // a response that is BAL_R times smaller on the right is the balanced case
  b.rate[meta.groups.DNa02_L[0]] = 100;
  b.rate[meta.groups.DNa02_R[0]] = 100 / BAL_R;
  // float32 rate storage, so this lands near zero rather than exactly on it
  near(dec.read(16).steerHz, 0, 1e-3, 'balanced case should read zero');
});

test('grab needs both on-target and dwell time', () => {
  const b = freshBrain();
  const dec = new Decoder(meta, b);
  for (const i of meta.groups.AOTU019_L) b.rate[i] = 200;   // on target
  ok(!dec.read(10).grab, 'grabbed before dwelling');
  let grabbed = false;
  for (let i = 0; i < 20; i++) if (dec.read(10).grab) grabbed = true;
  ok(grabbed, 'never grabbed despite sustained on-target');
});

test('grab does not fire when AOTU019 is quiet', () => {
  const b = freshBrain();
  const dec = new Decoder(meta, b);
  let grabbed = false;
  for (let i = 0; i < 40; i++) if (dec.read(16).grab) grabbed = true;
  ok(!grabbed, 'grabbed with no on-target signal');
});

test('swat reports the side the Giant Fiber fired on', () => {
  const b = freshBrain();
  const dec = new Decoder(meta, b);
  for (const i of meta.groups.DNp01_R) b.rate[i] = 80;
  ok(dec.read(16).swat === 1, 'right Giant Fiber should report +1');
  const d2 = new Decoder(meta, b);
  for (const i of meta.groups.DNp01_R) b.rate[i] = 0;
  for (const i of meta.groups.DNp01_L) b.rate[i] = 80;
  ok(d2.read(16).swat === -1, 'left Giant Fiber should report -1');
});

// -------------------------------------------------------------------- game ---

test('stations are far enough apart for the circuit to resolve', () => {
  const az = STATIONS.map((s) => s.az).sort((a, b) => a - b);
  for (let i = 1; i < az.length; i++) {
    ok(az[i] - az[i - 1] >= 24, 'stations ' + az[i - 1] + ' and ' + az[i] + ' too close');
  }
});

test('a fresh game wants a pita first', () => {
  const g = new FalafelGame(1);
  ok(g.goal().id === 'pita', 'first goal should be the pita');
  ok(g.customers.length === 1, 'should start with one customer');
});

test('grabbing fills the plate and depletes the tray', () => {
  const g = new FalafelGame(2);
  g.grab(stationAz('pita'));
  ok(g.plate.pita, 'pita not picked up');
  const need = Object.entries(g.current.order).find(([, n]) => n > 0)[0];
  const before = g.trays[need];
  g.grab(stationAz(need));
  ok(g.plate[need] === 1, 'ingredient not added');
  ok(g.trays[need] === before - 1, 'tray not depleted');
});

test('completing an order serves it and scores', () => {
  const g = new FalafelGame(3);
  g.grab(stationAz('pita'));
  const order = { ...g.current.order };
  for (const [k, n] of Object.entries(order)) {
    for (let i = 0; i < n; i++) g.grab(stationAz(k));
  }
  ok(g.served === 1, 'order not served');
  ok(g.score > 0, 'no score awarded');
  ok(!g.plate.pita, 'plate not cleared');
});

test('an empty tray routes the fly to the kitchen and restocks', () => {
  const g = new FalafelGame(4);
  g.grab(stationAz('pita'));
  const need = Object.entries(g.current.order).find(([, n]) => n > 0)[0];
  g.trays[need] = 0;
  const goal = g.goal();
  ok(goal.id === 'kitchen', 'did not route to the kitchen');
  ok(goal.need === need, 'kitchen goal lost track of what is needed');
  g.grab(stationAz('kitchen'));
  ok(g.carrying === need, 'did not pick up a refill');
  g.grab(stationAz(need));
  ok(g.trays[need] === TRAY_MAX, 'tray not refilled');
  ok(g.carrying === null, 'still carrying after restock');
});

test('a landed pest spoils its tray, and swatting prevents that', () => {
  const g = new FalafelGame(5);
  g.spawnPest();
  const p = g.pests[0];
  ok(g.swat(p.az), 'swat missed a pest at its own azimuth');
  ok(p.dead, 'pest not killed');
  ok(!g.spoiled[p.tray], 'tray spoiled despite the swat');

  const g2 = new FalafelGame(6);
  g2.spawnPest();
  const q = g2.pests[0];
  q.approach = 1; q.landed = 0.001;
  for (let i = 0; i < 200; i++) g2.update(1 / 60);
  ok(g2.spoiled[q.tray], 'unswatted pest never spoiled the tray');
});

test('swatting at the wrong azimuth misses', () => {
  const g = new FalafelGame(7);
  g.spawnPest();
  const p = g.pests[0];
  ok(!g.swat(p.az + 120), 'swat connected from far away');
  ok(!p.dead, 'pest died from a distant swat');
});

test('patience runs out and ends the game', () => {
  const g = new FalafelGame(8);
  g.customers[0].stress = 0.999;
  g.update(1);
  ok(g.over, 'game did not end');
  ok(g.overReason.length > 0, 'no reason given');
});

test('game over text agrees with the customer gender', () => {
  for (const mk of MKS) {
    const g = new FalafelGame(9);
    g.customers[0].mk = mk;
    g.customers[0].stress = 0.999;
    g.update(1);
    const want = mk.f ? 'איבדה' : 'איבד';
    ok(g.overReason.includes(want),
      mk.full + ' should use ' + want + ' but got: ' + g.overReason);
  }
});

test('difficulty ramps to a real ceiling', () => {
  const g = new FalafelGame(10);
  ok(g.difficulty === 0, 'difficulty should start at zero');
  g.t = 1e6;
  ok(g.difficulty === 1, 'difficulty should saturate at one');
  ok(g.patience < 20, 'patience should tighten at full difficulty');
});

test('arousal rises with customer stress', () => {
  const g = new FalafelGame(11);
  const calm = g.arousal();
  g.customers[0].stress = 1;
  ok(g.arousal() > calm, 'arousal did not rise with stress');
});

test('the MK dealer cycles the whole roster without repeats', () => {
  let s = 12345;
  const rng = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const deal = makeDealer(rng);
  const seen = new Set();
  for (let i = 0; i < MKS.length; i++) seen.add(deal().id);
  ok(seen.size === MKS.length, 'dealer repeated before exhausting the roster');
});

test('every MK entry is complete enough to draw', () => {
  for (const mk of MKS) {
    ok(mk.id && mk.name && mk.full && mk.party, 'missing identity: ' + mk.id);
    ok(mk.suit && mk.skin && mk.hair && mk.hair.style, 'missing look: ' + mk.id);
    ok(Array.isArray(mk.lines) && mk.lines.length > 0, 'no lines: ' + mk.id);
  }
});

// ------------------------------------------------------------------ report ---

console.log('');
for (const f of failures) console.log('  FAIL  ' + f);
console.log('');
console.log(passed + ' passed, ' + failures.length + ' failed');
process.exit(failures.length ? 1 : 0);
