/**
 * Leaky integrate-and-fire engine for the extracted FlyWire circuit.
 *
 * Parameters follow Shiu et al. 2024 (Nature): rest -52 mV, threshold -45 mV,
 * tau_mem 20 ms, tau_syn 5 ms, refractory 2.2 ms, synaptic delay 1.8 ms,
 * 0.275 mV per synapse.
 *
 * Two deviations from that paper, both deliberate:
 *
 *  - dt is 0.2 ms rather than 0.1 ms. That is still 25x finer than tau_syn and
 *    9 steps per synaptic delay, so the dynamics are unchanged, and it halves
 *    the cost of running in a browser tab.
 *
 *  - A global SYN_GAIN scales every weight. Raw connectome weights put the
 *    network deep into saturation: LPLC2 alone delivers 822 synapses x 0.275 mV
 *    = 226 mV onto the Giant Fiber, which pins it at its refractory ceiling.
 *    Connectome LIF models all need this calibration; the gain is a single
 *    number applied uniformly, so every relative weight the connectome
 *    specifies is preserved exactly.
 *
 * Propagation is event-driven and the integrator walks an active set, so cost
 * scales with how many neurons are actually doing something rather than with
 * the 4798 neurons or 117k edges.
 *
 * No DOM or worker APIs here, so the same code runs in a Web Worker and in Node.
 */

export const V_REST = -52;
export const V_THRESH = -45;
export const V_RESET = -52;
export const TAU_MEM = 20;
export const TAU_SYN = 5;
export const REFRACTORY = 2.2;
export const DT = 0.2;
export const DELAY_MS = 1.8;

/** Charge delivered by one external (Poisson) input event, in mV. */
export const EXT_KICK = 9.0;
/** Uniform scale on all connectome weights. See note above. */
export const SYN_GAIN = 0.11;

const DELAY_STEPS = Math.round(DELAY_MS / DT); // 9
const RING = 16;                                // power of two > DELAY_STEPS
/**
 * How close to rest a neuron has to be before it leaves the active set.
 *
 * The threshold gap is 7 mV, so 0.03 mV is 0.4% of the distance a neuron has to
 * travel to matter - far below anything that changes behaviour, and it retires
 * quiescent neurons several time constants sooner. That keeps the active set
 * small when the game gets busy and arousal drives more of the network.
 */
const SETTLE_V = 0.03;
const SETTLE_G = 0.03;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function parseCircuit(buffer) {
  const dv = new DataView(buffer);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'FLYC') throw new Error('circuit.bin: bad magic ' + magic);
  const nNeurons = dv.getUint32(8, true);
  const nEdges = dv.getUint32(12, true);
  let off = 16;
  const indptr = new Int32Array(buffer, off, nNeurons + 1); off += 4 * (nNeurons + 1);
  const indices = new Int32Array(buffer, off, nEdges); off += 4 * nEdges;
  const weights = new Float32Array(buffer, off, nEdges); off += 4 * nEdges;
  const pos = new Float32Array(buffer, off, nNeurons * 3);
  return { nNeurons, nEdges, indptr, indices, weights, pos };
}

export class FlyBrain {
  constructor(circuit, opts = {}) {
    const n = circuit.nNeurons;
    this.n = n;
    this.indptr = circuit.indptr;
    this.indices = circuit.indices;
    this.baseIndices = circuit.indices.slice();
    this.baseWeights = circuit.weights;
    this.weights = new Float32Array(circuit.weights.length);
    this.pos = circuit.pos;

    this.v = new Float32Array(n).fill(V_REST);
    this.g = new Float32Array(n);
    this.refrac = new Float32Array(n);
    this.rate = new Float32Array(n);
    this.frameSpikes = new Int32Array(n);
    this.silenced = new Uint8Array(n);
    this.extRate = new Float32Array(n);

    // delay ring, plus a per-slot list of touched targets so draining costs
    // O(arriving edges) instead of O(neurons)
    this.ring = new Float32Array(RING * n);
    this.listCap = Math.max(4096, Math.min(n * 4, 65536));
    this.ringList = new Int32Array(RING * this.listCap);
    this.ringCount = new Int32Array(RING);
    // Set when a slot's delivery list fills up. The charge still lands in the
    // ring, but its target is not recorded, so that slot has to be drained by a
    // full scan instead. Without this the charge would simply never be
    // collected - a silent loss that only shows up under a synchronised burst.
    this.ringOverflow = new Uint8Array(RING);
    this.ringSlot = 0;

    // active set
    this.isActive = new Uint8Array(n);
    this.activeList = new Int32Array(n);
    this.activeCount = 0;

    this.spikeBuf = new Uint32Array(32768);
    this.spikeCount = 0;
    this.totalSpikes = 0;

    // Optional single-neuron oscilloscope. Set `probe` to a neuron index and
    // its membrane potential is recorded every step, at full 0.2 ms
    // resolution, which is the only way to actually see integrate-and-fire
    // happen: a frame boundary is 16.7 ms and a spike lasts 2.2 ms.
    this.probe = -1;
    this.probeBuf = new Float32Array(4096);
    this.probeCount = 0;

    this.decayMem = Math.exp(-DT / TAU_MEM);
    this.decaySyn = Math.exp(-DT / TAU_SYN);
    this.tauRate = 60; // ms

    this.rng = mulberry32(0x5eed);
    this.scrambled = false;
    this.timeMs = 0;

    this.setGain(opts.gain ?? SYN_GAIN);
  }

  setGain(gain) {
    this.gain = gain;
    const w = this.weights, b = this.baseWeights;
    for (let i = 0; i < w.length; i++) w[i] = b[i] * gain;
  }

  _activate(i) {
    if (!this.isActive[i]) { this.isActive[i] = 1; this.activeList[this.activeCount++] = i; }
  }

  setExternal(idx, hz) {
    this.extRate[idx] = hz;
    if (hz > 0) this._activate(idx);
  }
  clearExternal() {
    const e = this.extRate;
    for (let i = 0; i < e.length; i++) e[i] = 0;
  }

  silenceGroup(list, on) {
    for (let i = 0; i < list.length; i++) this.silenced[list[i]] = on ? 1 : 0;
  }
  clearSilenced() { this.silenced.fill(0); }

  /**
   * Shuffle every edge target while keeping each neuron's out-degree and the
   * weight attached to each slot: same amount of wiring, same signs, same
   * strengths, wrong partners. The structural control.
   */
  setScrambled(on) {
    if (on === this.scrambled) return;
    const idx = this.indices;
    idx.set(this.baseIndices);
    if (on) {
      const rnd = mulberry32(0xc0ffee);
      for (let i = idx.length - 1; i > 0; i--) {
        const j = (rnd() * (i + 1)) | 0;
        const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
      }
    }
    this.scrambled = on;
  }

  reset() {
    this.v.fill(V_REST);
    this.g.fill(0);
    this.refrac.fill(0);
    this.rate.fill(0);
    this.frameSpikes.fill(0);
    this.ring.fill(0);
    this.ringCount.fill(0);
    this.ringOverflow.fill(0);
    this.isActive.fill(0);
    this.activeCount = 0;
    this.ringSlot = 0;
    this.timeMs = 0;
    this.totalSpikes = 0;
    // externally driven neurons are always live
    for (let i = 0; i < this.n; i++) if (this.extRate[i] > 0) this._activate(i);
  }

  /** Advance the network by `steps` * DT milliseconds. */
  step(steps) {
    const { v, g, refrac, silenced, extRate, ring, ringList, ringCount,
      ringOverflow, indptr, indices, weights, isActive, activeList,
      frameSpikes } = this;
    const n = this.n;
    const decayMem = this.decayMem, decaySyn = this.decaySyn;
    const rng = this.rng;
    const pScale = DT / 1000;
    const listCap = this.listCap;
    const gSyn = DT / TAU_SYN;
    const spikeBuf = this.spikeBuf;
    const spikeCap = spikeBuf.length;
    let spikeCount = 0;
    let active = this.activeCount;

    const probe = this.probe;
    const probeBuf = this.probeBuf;
    let probeCount = 0;

    for (let s = 0; s < steps; s++) {
      if (probe >= 0 && probeCount < probeBuf.length) probeBuf[probeCount++] = v[probe];
      const slot = this.ringSlot;
      const base = slot * n;

      // deliver charge scheduled for this step
      if (ringOverflow[slot]) {
        // list was truncated, so sweep the whole slot to be sure
        for (let t = 0; t < n; t++) {
          const inc = ring[base + t];
          if (inc !== 0) {
            ring[base + t] = 0;
            g[t] += inc;
            if (!isActive[t]) { isActive[t] = 1; activeList[active++] = t; }
          }
        }
        ringOverflow[slot] = 0;
        ringCount[slot] = 0;
      } else {
        const cnt = ringCount[slot];
        if (cnt) {
          const lbase = slot * listCap;
          for (let k = 0; k < cnt; k++) {
            const t = ringList[lbase + k];
            const inc = ring[base + t];
            if (inc !== 0) {
              ring[base + t] = 0;
              g[t] += inc;
              if (!isActive[t]) { isActive[t] = 1; activeList[active++] = t; }
            }
          }
          ringCount[slot] = 0;
        }
      }

      const target = (slot + DELAY_STEPS) & (RING - 1);
      const tbase = target * n;
      const tlist = target * listCap;

      for (let ai = 0; ai < active;) {
        const i = activeList[ai];

        if (silenced[i]) {
          v[i] = V_REST; g[i] = 0; refrac[i] = 0;
          if (extRate[i] <= 0) { isActive[i] = 0; activeList[ai] = activeList[--active]; continue; }
          ai++; continue;
        }

        let gi = g[i];
        const er = extRate[i];
        if (er > 0 && rng() < er * pScale) gi += EXT_KICK;

        let vi = v[i];
        const r = refrac[i];
        if (r > 0) {
          refrac[i] = r - DT;
          vi = V_RESET;
        } else {
          vi = V_REST + (vi - V_REST) * decayMem + gi * gSyn;
        }
        gi *= decaySyn;

        if (vi >= V_THRESH && r <= 0) {
          vi = V_RESET;
          refrac[i] = REFRACTORY;
          frameSpikes[i]++;
          if (spikeCount < spikeCap) spikeBuf[spikeCount++] = i;
          let c = ringCount[target];
          const end = indptr[i + 1];
          for (let k = indptr[i]; k < end; k++) {
            const tgt = indices[k];
            ring[tbase + tgt] += weights[k];
            if (c < listCap) ringList[tlist + c++] = tgt;
            else ringOverflow[target] = 1;
          }
          ringCount[target] = c;
        }

        v[i] = vi;
        g[i] = gi;

        // retire neurons that have settled back to rest
        if (er <= 0 && refrac[i] <= 0 &&
            gi < SETTLE_G && gi > -SETTLE_G &&
            vi - V_REST < SETTLE_V && vi - V_REST > -SETTLE_V) {
          v[i] = V_REST; g[i] = 0;
          isActive[i] = 0;
          activeList[ai] = activeList[--active];
          continue;
        }
        ai++;
      }

      this.ringSlot = (slot + 1) & (RING - 1);
      this.timeMs += DT;
    }

    this.activeCount = active;
    this.probeCount = probeCount;
    this.spikeCount = spikeCount;
    this.totalSpikes += spikeCount;

    // refresh filtered rates once per call rather than once per step
    const frameMs = steps * DT;
    const a = Math.exp(-frameMs / this.tauRate);
    const perSec = 1000 / frameMs;
    const rate = this.rate;
    for (let i = 0; i < n; i++) {
      const c = frameSpikes[i];
      if (c) { rate[i] = rate[i] * a + c * perSec * (1 - a); frameSpikes[i] = 0; }
      else if (rate[i] > 0.001) rate[i] *= a;
      else rate[i] = 0;
    }
    return spikeCount;
  }

  /** Mean firing rate (Hz) across a group of neuron indices. */
  groupRate(list) {
    if (!list || list.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < list.length; i++) sum += this.rate[list[i]];
    return sum / list.length;
  }
}
