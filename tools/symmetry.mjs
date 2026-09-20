/** Check left/right balance of the pursuit pathway in the extracted circuit. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCircuit } from '../src/lif.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = readFileSync(join(root, 'public/data/circuit.bin'));
const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
const meta = JSON.parse(readFileSync(join(root, 'public/data/circuit.json'), 'utf8'));
const c = parseCircuit(buf);
const g = meta.groups;

const setOf = (name) => new Set(g[name] || []);
function pathway(fromName, toName) {
  const from = g[fromName] || [], to = setOf(toName);
  let syn = 0, edges = 0;
  for (const a of from) {
    for (let k = c.indptr[a]; k < c.indptr[a + 1]; k++) {
      if (to.has(c.indices[k])) { syn += Math.abs(c.weights[k]) / meta.mvPerSyn; edges++; }
    }
  }
  return { syn: Math.round(syn), edges };
}

const pairs = [
  ['LC10a_L', 'AOTU019_L'], ['LC10a_R', 'AOTU019_R'],
  ['LC10a_L', 'AOTU019_R'], ['LC10a_R', 'AOTU019_L'],
  ['LC10a_L', 'AOTU025_L'], ['LC10a_R', 'AOTU025_R'],
  ['AOTU019_L', 'DNa02_L'], ['AOTU019_R', 'DNa02_R'],
  ['AOTU025_L', 'DNa02_L'], ['AOTU025_R', 'DNa02_R'],
  ['AOTU019_L', 'DNa03_L'], ['AOTU019_R', 'DNa03_R'],
  ['DNa03_L', 'DNa02_L'], ['DNa03_R', 'DNa02_R'],
  ['LPLC2_L', 'DNp01_L'], ['LPLC2_R', 'DNp01_R'],
  ['LPLC2_L', 'DNp01_R'], ['LPLC2_R', 'DNp01_L'],
  ['PFL3_L', 'DNa02_L'], ['PFL3_R', 'DNa02_R'],
  ['PFL3_L', 'DNa02_R'], ['PFL3_R', 'DNa02_L'],
];
console.log(['pre'.padEnd(12),'post'.padEnd(12),'syn'.padStart(7),'edges'.padStart(6)].join(' '));
for (const [a, b] of pairs) {
  const r = pathway(a, b);
  console.log([a.padEnd(12),b.padEnd(12),String(r.syn).padStart(7),String(r.edges).padStart(6)].join(' '));
}

// total input each steering neuron receives, by sign
console.log('\ntotal input onto each steering neuron:');
for (const name of ['AOTU019_L', 'AOTU019_R', 'AOTU025_L', 'AOTU025_R',
  'DNa02_L', 'DNa02_R', 'DNa03_L', 'DNa03_R', 'DNp01_L', 'DNp01_R']) {
  const tgt = setOf(name);
  let exc = 0, inh = 0;
  for (let a = 0; a < c.nNeurons; a++) {
    for (let k = c.indptr[a]; k < c.indptr[a + 1]; k++) {
      if (tgt.has(c.indices[k])) {
        const w = c.weights[k];
        if (w > 0) exc += w; else inh += w;
      }
    }
  }
  console.log('  ' + name.padEnd(10) + ' exc ' + exc.toFixed(0).padStart(6) + '  inh ' + inh.toFixed(0).padStart(7) + '  net ' + (exc+inh).toFixed(0).padStart(6));//

}
