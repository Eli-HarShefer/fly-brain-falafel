/**
 * Live circuit diagram.
 *
 * The 3D view shows neurons flaring where they sit; the raster shows when. This
 * shows *why*: the actual pathway, with the real synapse counts as edge widths
 * and the real neurotransmitter signs as edge colours, lighting up as signal
 * moves through it.
 *
 * Every number here is read out of the extracted circuit at construction, so if
 * the extraction changes the diagram changes with it. Nothing is hard-coded.
 *
 * Signal flows left to right - sensory, relay, motor, action - which is the
 * convention for a circuit diagram and matches the raster's time axis, even
 * though the surrounding page is RTL.
 */

const EXC = [122, 214, 235];   // cholinergic, excitatory
const INH = [240, 130, 104];   // GABA / glutamate, inhibitory

/**
 * Nodes, in columns. `g` names a group in circuit.json; `max` is the firing
 * rate that counts as "fully lit" for that population.
 */
const NODES = [
  { id: 'lc10aL', g: 'LC10a_L', label: 'LC10a L', col: 0, row: 0, max: 60, tint: [134, 217, 236] },
  { id: 'lc10aR', g: 'LC10a_R', label: 'LC10a R', col: 0, row: 1, max: 60, tint: [134, 217, 236] },
  { id: 'lplc2L', g: 'LPLC2_L', label: 'LPLC2 L', col: 0, row: 3, max: 90, tint: [178, 138, 232] },
  { id: 'lplc2R', g: 'LPLC2_R', label: 'LPLC2 R', col: 0, row: 4, max: 90, tint: [178, 138, 232] },

  { id: 'a19L', g: 'AOTU019_L', label: 'AOTU019 L', col: 1, row: -0.35, max: 160, tint: [245, 204, 114] },
  { id: 'a25L', g: 'AOTU025_L', label: 'AOTU025 L', col: 1, row: 0.55, max: 160, tint: [245, 204, 114] },
  { id: 'a19R', g: 'AOTU019_R', label: 'AOTU019 R', col: 1, row: 1.45, max: 160, tint: [245, 204, 114] },
  { id: 'a25R', g: 'AOTU025_R', label: 'AOTU025 R', col: 1, row: 2.35, max: 160, tint: [245, 204, 114] },

  { id: 'dn02L', g: 'DNa02_L', label: 'DNa02 L', col: 2, row: 0.1, max: 160, tint: [240, 130, 104] },
  { id: 'dn02R', g: 'DNa02_R', label: 'DNa02 R', col: 2, row: 1.3, max: 160, tint: [240, 130, 104] },
  { id: 'dn01L', g: 'DNp01_L', label: 'DNp01 L', col: 2, row: 3, max: 120, tint: [178, 138, 232] },
  { id: 'dn01R', g: 'DNp01_R', label: 'DNp01 R', col: 2, row: 4, max: 120, tint: [178, 138, 232] },
];

/** Edges to draw. Widths and signs are measured from the circuit. */
const EDGES = [
  ['lc10aL', 'a19L'], ['lc10aL', 'a25L'],
  ['lc10aR', 'a19R'], ['lc10aR', 'a25R'],
  ['a19L', 'dn02R'], ['a25L', 'dn02L'],
  ['a19R', 'dn02L'], ['a25R', 'dn02R'],
  ['lplc2L', 'dn01L'], ['lplc2R', 'dn01R'],
];

const NW = 92, NH = 26;

export class PathwayView {
  constructor(canvas, circuit, meta) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.meta = meta;
    this.nodes = new Map(NODES.map((n) => [n.id, { ...n }]));

    // measure each drawn edge straight from the connectome
    const idx = new Map();
    for (const n of NODES) idx.set(n.id, new Set(meta.groups[n.g] || []));
    this.edges = [];
    let maxSyn = 1;
    for (const [from, to] of EDGES) {
      const src = meta.groups[this.nodes.get(from).g] || [];
      const dst = idx.get(to);
      let syn = 0, sign = 0;
      for (const a of src) {
        for (let k = circuit.indptr[a]; k < circuit.indptr[a + 1]; k++) {
          if (dst.has(circuit.indices[k])) {
            const w = circuit.weights[k];
            syn += Math.abs(w) / meta.mvPerSyn;
            sign = w < 0 ? -1 : 1;
          }
        }
      }
      syn = Math.round(syn);
      if (syn > maxSyn) maxSyn = syn;
      this.edges.push({ from, to, syn, sign });
    }
    this.maxSyn = maxSyn;
    this.pulses = [];
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(360, Math.round(r.width * this.dpr));
    this.h = Math.max(120, Math.round((r.height || 190) * this.dpr));
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.layout();
  }

  layout() {
    const padX = 66 * this.dpr, padY = 16 * this.dpr;
    // the output column carries a 88px gauge, so keep half of it clear of the
    // right edge rather than letting it spill
    const colX = [padX, this.w * 0.37, this.w * 0.66, this.w - 62 * this.dpr];
    const rows = 5;
    const rowH = (this.h - padY * 2) / rows;
    for (const n of this.nodes.values()) {
      n.x = colX[n.col];
      n.y = padY + (n.row + 0.5) * rowH;
      n.w = NW * this.dpr;
      n.h = NH * this.dpr;
    }
    this.colX = colX;
    this.rowH = rowH;
    this.padY = padY;
  }

  /** @param rates keyed by group name, in Hz; plus steer/grab/swat state */
  draw(brain, out, dt) {
    const ctx = this.ctx;
    const d = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0a0808';
    ctx.fillRect(0, 0, this.w, this.h);

    // current activation per node
    for (const n of this.nodes.values()) {
      const r = brain.groupRate(this.meta.groups[n.g] || []);
      n.rate = r;
      n.lit = Math.max(0, Math.min(1, r / n.max));
    }

    this.spawnPulses(dt);
    this.drawEdges(ctx, d);
    this.drawPulses(ctx, d, dt);
    for (const n of this.nodes.values()) this.drawNode(ctx, n, d);
    this.drawOutput(ctx, out, d);
    this.drawColumnLabels(ctx, d);
  }

  spawnPulses(dt) {
    for (const e of this.edges) {
      const a = this.nodes.get(e.from);
      if (a.lit < 0.12) continue;
      // spawn rate scales with how hard the source is firing
      if (Math.random() < a.lit * dt * 16) {
        this.pulses.push({ e, t: 0, speed: 1.6 + a.lit * 1.2 });
      }
    }
    if (this.pulses.length > 120) this.pulses.splice(0, this.pulses.length - 120);
  }

  edgePath(e) {
    const a = this.nodes.get(e.from), b = this.nodes.get(e.to);
    const x1 = a.x + a.w / 2, y1 = a.y;
    const x2 = b.x - b.w / 2, y2 = b.y;
    const cx = (x1 + x2) / 2;
    return { x1, y1, x2, y2, cx };
  }

  drawEdges(ctx, d) {
    for (const e of this.edges) {
      const p = this.edgePath(e);
      const col = e.sign < 0 ? INH : EXC;
      const a = this.nodes.get(e.from);
      const alpha = 0.16 + a.lit * 0.5;
      ctx.strokeStyle = 'rgba(' + col.join(',') + ',' + alpha.toFixed(3) + ')';
      ctx.lineWidth = (0.8 + (e.syn / this.maxSyn) * 3.2) * d;
      ctx.beginPath();
      ctx.moveTo(p.x1, p.y1);
      ctx.bezierCurveTo(p.cx, p.y1, p.cx, p.y2, p.x2, p.y2);
      ctx.stroke();

      // sign marker at the target end
      ctx.fillStyle = 'rgba(' + col.join(',') + ',' + (0.5 + a.lit * 0.5).toFixed(3) + ')';
      ctx.font = (9 * d).toFixed(0) + 'px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(e.sign < 0 ? '−' : '+', p.x2 - 3 * d, p.y2 - 4 * d);
    }
  }

  drawPulses(ctx, d, dt) {
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      p.t += dt * p.speed;
      if (p.t >= 1) { this.pulses.splice(i, 1); continue; }
      const g = this.edgePath(p.e);
      const t = p.t, mt = 1 - t;
      // point on the cubic bezier
      const x = mt * mt * mt * g.x1 + 3 * mt * mt * t * g.cx + 3 * mt * t * t * g.cx + t * t * t * g.x2;
      const y = mt * mt * mt * g.y1 + 3 * mt * mt * t * g.y1 + 3 * mt * t * t * g.y2 + t * t * t * g.y2;
      const col = p.e.sign < 0 ? INH : EXC;
      const fade = Math.sin(Math.PI * t);
      ctx.fillStyle = 'rgba(' + col.join(',') + ',' + (0.9 * fade).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(x, y, 2.3 * d, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawNode(ctx, n, d) {
    const x = n.x - n.w / 2, y = n.y - n.h / 2;
    ctx.beginPath();
    ctx.roundRect(x, y, n.w, n.h, 5 * d);
    ctx.fillStyle = 'rgba(22,20,19,0.96)';
    ctx.fill();

    // fill proportional to firing rate
    if (n.lit > 0.01) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, n.w, n.h, 5 * d);
      ctx.clip();
      ctx.fillStyle = 'rgba(' + n.tint.join(',') + ',' + (0.14 + n.lit * 0.42).toFixed(3) + ')';
      ctx.fillRect(x, y + n.h * (1 - n.lit), n.w, n.h * n.lit);
      ctx.restore();
    }

    ctx.beginPath();
    ctx.roundRect(x, y, n.w, n.h, 5 * d);
    ctx.strokeStyle = 'rgba(' + n.tint.join(',') + ',' + (0.3 + n.lit * 0.6).toFixed(3) + ')';
    ctx.lineWidth = 1 * d;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.direction = 'ltr';
    ctx.fillStyle = 'rgba(247,242,234,' + (0.6 + n.lit * 0.4).toFixed(3) + ')';
    ctx.font = '600 ' + (9.5 * d).toFixed(0) + 'px JetBrains Mono, monospace';
    ctx.fillText(n.label, n.x, n.y - 1 * d);
    ctx.fillStyle = 'rgba(' + n.tint.join(',') + ',0.95)';
    ctx.font = (8.5 * d).toFixed(0) + 'px JetBrains Mono, monospace';
    ctx.fillText(n.rate.toFixed(0) + ' Hz', n.x, n.y + 9 * d);
  }

  /** Steering gauge, grab lamp and swat lamp. */
  drawOutput(ctx, out, d) {
    const x = this.colX[3];
    const top = this.padY;
    ctx.textAlign = 'center';
    ctx.direction = 'rtl';

    // steering gauge: DNa02 imbalance
    const gw = 88 * d, gh = 10 * d;
    const gy = top + this.rowH * 0.7;
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath(); ctx.roundRect(x - gw / 2, gy, gw, gh, gh / 2); ctx.fill();
    const steer = out ? Math.max(-1, Math.min(1, out.steerHz / 200)) : 0;
    const cx = x + steer * (gw / 2 - 4 * d);
    ctx.fillStyle = 'rgba(240,130,104,0.9)';
    ctx.beginPath(); ctx.arc(cx, gy + gh / 2, gh * 0.62, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(x - 0.5 * d, gy - 2 * d, 1 * d, gh + 4 * d);
    ctx.fillStyle = 'rgba(179,165,149,0.9)';
    ctx.font = (9 * d).toFixed(0) + 'px Heebo, sans-serif';
    ctx.fillText('היגוי', x, gy - 6 * d);

    // lamps
    const lamp = (ly, on, label, col) => {
      ctx.beginPath();
      ctx.arc(x - 28 * d, ly, 5.5 * d, 0, Math.PI * 2);
      ctx.fillStyle = on ? 'rgba(' + col + ',1)' : 'rgba(255,255,255,0.12)';
      ctx.fill();
      if (on) {
        ctx.beginPath();
        ctx.arc(x - 28 * d, ly, 11 * d, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(' + col + ',0.5)';
        ctx.lineWidth = 1.5 * d;
        ctx.stroke();
      }
      ctx.textAlign = 'right';
      ctx.fillStyle = on ? 'rgba(247,242,234,0.95)' : 'rgba(179,165,149,0.6)';
      ctx.font = (10 * d).toFixed(0) + 'px Heebo, sans-serif';
      ctx.fillText(label, x + 34 * d, ly + 4 * d);
      ctx.textAlign = 'center';
    };
    this.grabGlow = Math.max(0, (this.grabGlow || 0) - 0.06);
    this.swatGlow = Math.max(0, (this.swatGlow || 0) - 0.04);
    if (out && out.grab) this.grabGlow = 1;
    if (out && out.swat) this.swatGlow = 1;
    lamp(top + this.rowH * 2.0, out ? out.onTarget : false, 'על המטרה', '245,204,114');
    lamp(top + this.rowH * 2.9, this.grabGlow > 0.05, 'תפיסה', '119,201,142');
    lamp(top + this.rowH * 4.0, this.swatGlow > 0.05, 'סטירה', '178,138,232');
  }

  drawColumnLabels(ctx, d) {
    const labels = ['חישה', 'ממסר', 'פלט מוטורי', 'פעולה'];
    ctx.textAlign = 'center';
    ctx.direction = 'rtl';
    ctx.fillStyle = 'rgba(179,165,149,0.5)';
    ctx.font = '500 ' + (9.5 * d).toFixed(0) + 'px Heebo, sans-serif';
    for (let i = 0; i < 4; i++) {
      ctx.fillText(labels[i], this.colX[i], this.h - 4 * d);
    }
  }
}
