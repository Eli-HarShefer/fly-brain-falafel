/**
 * Headless performance check for the LIF engine.
 * Reports how much fly-brain time we can simulate per second of wall clock.
 * Real time needs >= 1.0x.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FlyBrain, parseCircuit, DT } from '../src/lif.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = readFileSync(join(root, 'public/data/circuit.bin'));
const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
const meta = JSON.parse(readFileSync(join(root, 'public/data/circuit.json'), 'utf8'));

const circuit = parseCircuit(buf);
const brain = new FlyBrain(circuit);
console.log(`circuit: ${circuit.nNeurons} neurons, ${circuit.nEdges} edges`);

// drive the visual inputs the way the game will
const drive = [...meta.groups.LC10a_L, ...meta.groups.LC10a_R, ...meta.groups.LPLC2_R];
for (const i of drive) brain.setExternal(i, 80);

const STEPS = 20000; // 2 s of fly time
brain.step(2000);    // warm up

const t0 = performance.now();
brain.step(STEPS);
const ms = performance.now() - t0;

const simMs = STEPS * DT;
const ratio = simMs / ms;
const perFrame = (16.67 / simMs) * ms;

console.log(`simulated ${simMs.toFixed(0)} ms of fly time in ${ms.toFixed(0)} ms wall`);
console.log(`  speed:        ${ratio.toFixed(2)}x real time`);
console.log(`  per 60fps frame: ${perFrame.toFixed(2)} ms of budget (16.67 ms available)`);
console.log(`  spikes:       ${brain.totalSpikes} (${(brain.totalSpikes / (simMs / 1000) / circuit.nNeurons).toFixed(1)} Hz mean)`);
console.log(ratio >= 1 ? '  OK: runs at real time or better' : '  SLOW: below real time');

// sanity: does drive actually reach the descending neurons?
const g = meta.groups;
console.log('\npopulation rates (Hz):');
for (const name of ['LC10a_L', 'LC10a_R', 'AOTU019_L', 'AOTU019_R', 'DNa02_L', 'DNa02_R', 'DNp01_R', 'EPG', 'PFL3_L']) {
  console.log(`  ${name.padEnd(10)} ${brain.groupRate(g[name]).toFixed(1)}`);
}
