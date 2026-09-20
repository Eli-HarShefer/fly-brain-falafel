/**
 * How the model works, shown rather than asserted.
 *
 * Every neuron in this simulation obeys four rules. This panel plots one real
 * neuron's membrane potential at full 0.2 ms resolution while the game runs, so
 * the rules are visible as they happen:
 *
 *   1. charge arrives from other neurons and pushes the voltage up
 *   2. the voltage leaks back toward rest (-52 mV) on a 20 ms time constant
 *   3. crossing the threshold (-45 mV) emits a spike
 *   4. the voltage resets and the neuron is deaf for 2.2 ms
 *
 * A spike then travels along the real synapses 1.8 ms later, carrying a weight
 * of (synapse count x neurotransmitter sign). That is the entire model. There
 * is no learning anywhere in it.
 */

const V_REST = -52;
const V_THRESH = -45;
// wide enough to show inhibition: DNa02 gets pushed to about -63 mV when
// AOTU019 is driving it, and clipping that off would hide half the story
const V_LO = -66;
const V_HI = -42;

export class ModelView {
  constructor(canvas, meta) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.meta = meta;
    this.trace = [];
    this.maxPoints = 900;
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(320, Math.round(r.width * this.dpr));
    this.h = Math.max(120, Math.round((r.height || 170) * this.dpr));
    this.canvas.width = this.w;
    this.canvas.height = this.h;
  }

  vToY(v) {
    const t = (v - V_LO) / (V_HI - V_LO);
    return this.h - 22 * this.dpr - t * (this.h - 46 * this.dpr);
  }

  /** Pull the newest samples out of the engine's probe buffer. */
  ingest(brain) {
    const n = brain.probeCount;
    for (let i = 0; i < n; i += 2) this.trace.push(brain.probeBuf[i]);
    if (this.trace.length > this.maxPoints) {
      this.trace.splice(0, this.trace.length - this.maxPoints);
    }
  }

  draw(brain, probeIndex) {
    const ctx = this.ctx;
    const d = this.dpr;
    this.ingest(brain);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0a0808';
    ctx.fillRect(0, 0, this.w, this.h);

    const left = 46 * d;
    const right = this.w - 8 * d;

    // reference levels
    const level = (v, label, rgb, dash) => {
      const y = this.vToY(v);
      ctx.strokeStyle = 'rgba(' + rgb + ',0.5)';
      ctx.lineWidth = 1 * d;
      ctx.setLineDash(dash ? [4 * d, 4 * d] : []);
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = 'right';
      ctx.direction = 'ltr';
      ctx.font = (8.5 * d).toFixed(0) + 'px JetBrains Mono, monospace';
      ctx.fillStyle = 'rgba(' + rgb + ',0.9)';
      ctx.fillText(label, left - 5 * d, y + 3 * d);
    };
    level(V_THRESH, '-45', '240,130,104', true);
    level(V_REST, '-52', '143,214,166', true);

    // anything below rest is active inhibition holding the neuron down
    const yRest = this.vToY(V_REST);
    const yFloor = this.vToY(V_LO);
    ctx.fillStyle = 'rgba(240,130,104,0.05)';
    ctx.fillRect(left, yRest, right - left, yFloor - yRest);
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.font = '500 ' + (8.5 * d).toFixed(0) + 'px Heebo, sans-serif';
    ctx.fillStyle = 'rgba(240,130,104,0.5)';
    ctx.fillText('עיכוב', right - 4 * d, yFloor - 4 * d);

    // the trace
    const pts = this.trace;
    if (pts.length > 1) {
      const span = right - left;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const x = left + (i / (this.maxPoints - 1)) * span;
        const y = this.vToY(Math.max(V_LO, Math.min(V_HI, pts[i])));
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(245,204,114,0.95)';
      ctx.lineWidth = 1.5 * d;
      ctx.lineJoin = 'round';
      ctx.stroke();

      // mark the resets: a drop to rest straight after touching threshold
      for (let i = 1; i < pts.length; i++) {
        if (pts[i - 1] >= V_THRESH - 0.35 && pts[i] <= V_REST + 0.2) {
          const x = left + (i / (this.maxPoints - 1)) * span;
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 1 * d;
          ctx.beginPath();
          ctx.moveTo(x, this.vToY(V_THRESH) - 7 * d);
          ctx.lineTo(x, this.vToY(V_THRESH) - 1 * d);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.beginPath();
          ctx.arc(x, this.vToY(V_THRESH) - 10 * d, 2.2 * d, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // header
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.font = '600 ' + (10 * d).toFixed(0) + 'px Heebo, sans-serif';
    ctx.fillStyle = 'rgba(179,165,149,0.8)';
    const type = probeIndex >= 0 ? this.meta.types[probeIndex] : '—';
    const side = probeIndex >= 0 ? this.meta.sides[probeIndex] : '';
    ctx.fillText('מתח הממברנה של נוירון אחד · ' + type + (side ? ' (' + side + ')' : ''),
      this.w - 8 * d, 14 * d);
    ctx.textAlign = 'left';
    ctx.direction = 'ltr';
    ctx.font = (8.5 * d).toFixed(0) + 'px JetBrains Mono, monospace';
    ctx.fillStyle = 'rgba(179,165,149,0.5)';
    ctx.fillText('mV', 8 * d, 14 * d);
    ctx.textAlign = 'center';
    ctx.direction = 'rtl';
    ctx.font = '500 ' + (9 * d).toFixed(0) + 'px Heebo, sans-serif';
    ctx.fillStyle = 'rgba(179,165,149,0.45)';
    ctx.fillText('נצבר → חוצה סף → יורה → מתאפס', this.w / 2, this.h - 6 * d);
  }
}
