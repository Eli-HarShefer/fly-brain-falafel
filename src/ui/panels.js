/**
 * Live telemetry: a spike raster and descending-neuron rate traces.
 *
 * Both draw as a sweep: a write head advances one column per frame, wraps at the
 * right edge, and clears a short band ahead of itself. Cost per frame is
 * constant however long the session runs, and it avoids blitting a canvas onto
 * itself to scroll, which browsers do not reliably honour.
 *
 * It also happens to be exactly how the rig this UI is dressed as would show it.
 *
 * Time runs left to right, the raster convention, even though the page is RTL -
 * anyone reading a raster expects it that way.
 */

const ROLE_ORDER = ['lc10a', 'lplc2', 'aotu', 'cx', 'dn'];
const ROLE_RGB = {
  lc10a: [134, 217, 236],
  lplc2: [178, 138, 232],
  aotu: [245, 204, 114],
  cx: [143, 214, 166],
  dn: [240, 130, 104],
};
const ROLE_HE = {
  lc10a: 'LC10a',
  lplc2: 'LPLC2',
  aotu: 'AOTU',
  cx: 'CX',
  dn: 'DN',
};

export class SpikeRaster {
  constructor(canvas, meta) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dpr = Math.min(2, window.devicePixelRatio || 1);

    // rows: only the identified circuit, grouped by role
    this.rowOf = new Int32Array(meta.nNeurons).fill(-1);
    this.bands = [];
    let row = 0;
    for (const role of ROLE_ORDER) {
      const members = [];
      for (let i = 0; i < meta.nNeurons; i++) if (meta.roles[i] === role) members.push(i);
      if (!members.length) continue;
      const start = row;
      // descending neurons are only 10 cells; give them real estate anyway
      const weight = role === 'dn' ? 6 : 1;
      for (const i of members) { this.rowOf[i] = row; row += weight; }
      this.bands.push({ role, start, end: row });
    }
    this.rows = Math.max(1, row);
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(200, Math.round(r.width * this.dpr));
    this.h = Math.max(80, Math.round((r.height || 150) * this.dpr));
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.ctx.fillStyle = '#0a0808';
    this.ctx.fillRect(0, 0, this.w, this.h);
    this.x = 0;
  }

  push(spikeBuf, count, quiet) {
    const ctx = this.ctx;
    const step = Math.max(1, Math.round(this.dpr));
    const x = this.x;

    // erase a band ahead of the write head so old data fades out cleanly
    ctx.fillStyle = '#0a0808';
    ctx.fillRect(x, 0, step + 10 * this.dpr, this.h);

    // faint band separators so the groups stay readable
    ctx.fillStyle = 'rgba(255,255,255,0.055)';
    for (const b of this.bands) {
      ctx.fillRect(x, (b.start / this.rows) * this.h, step, 1);
    }

    if (!quiet) {
      const seen = new Set();
      for (let k = 0; k < count; k++) {
        const i = spikeBuf[k];
        const r = this.rowOf[i];
        if (r < 0) continue;
        const y = Math.round((r / this.rows) * this.h);
        if (seen.has(y)) continue;
        seen.add(y);
        const c = ROLE_RGB[this.bandAt(r)] || [140, 140, 140];
        ctx.fillStyle = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
        ctx.fillRect(x, y, step, Math.max(1, step));
      }
    }

    // the write head itself
    ctx.fillStyle = 'rgba(255,183,101,0.5)';
    ctx.fillRect(x + step, 0, step, this.h);

    this.x += step;
    if (this.x >= this.w) this.x = 0;
  }

  bandAt(row) {
    for (const b of this.bands) if (row >= b.start && row < b.end) return b.role;
    return 'other';
  }

  /**
   * Fixed role labels. The strip is cleared first, otherwise the scroll smears
   * the previous frame's text across the panel.
   */
  overlay() {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = '#0a0808';
    ctx.fillRect(0, 0, 44 * this.dpr, this.h);
    ctx.font = (9 * this.dpr).toFixed(0) + 'px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    for (const b of this.bands) {
      const y = ((b.start + b.end) / 2 / this.rows) * this.h;
      const c = ROLE_RGB[b.role];
      ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0.85)';
      ctx.fillText(ROLE_HE[b.role], 4 * this.dpr, y + 3 * this.dpr);
    }
    ctx.restore();
  }
}

const TRACES = [
  { key: 'd2L', label: 'DNa02 L', rgb: [240, 130, 104] },
  { key: 'd2R', label: 'DNa02 R', rgb: [247, 176, 120] },
  { key: 'a19', label: 'AOTU019', rgb: [245, 204, 114] },
  { key: 'p01', label: 'DNp01 (GF)', rgb: [178, 138, 232] },
];

export class TracePanel {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.max = 160;
    this.prev = null;
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(200, Math.round(r.width * this.dpr));
    this.h = Math.max(80, Math.round((r.height || 150) * this.dpr));
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.ctx.fillStyle = '#0a0808';
    this.ctx.fillRect(0, 0, this.w, this.h);
    this.prev = null;
    this.x = 0;
  }

  push(rates) {
    const ctx = this.ctx;
    const step = Math.max(1, Math.round(this.dpr));
    const x = this.x;

    ctx.fillStyle = '#0a0808';
    ctx.fillRect(x, 0, step + 10 * this.dpr, this.h);

    // this panel IS a measurement surface, so gridlines earn their place
    ctx.fillStyle = 'rgba(255,255,255,0.055)';
    for (let i = 1; i < 4; i++) ctx.fillRect(x, (this.h / 4) * i, step + 10 * this.dpr, 1);

    const vals = {
      d2L: rates.d2L,
      d2R: rates.d2R,
      a19: Math.max(rates.a19L, rates.a19R),
      p01: Math.max(rates.p01L, rates.p01R),
    };
    const y = (v) => this.h - Math.min(1, v / this.max) * (this.h - 2) - 1;

    if (this.prev && x > 0) {
      ctx.lineWidth = Math.max(1, 1.5 * this.dpr);
      ctx.lineCap = 'round';
      for (const t of TRACES) {
        ctx.strokeStyle = 'rgba(' + t.rgb.join(',') + ',0.95)';
        ctx.beginPath();
        ctx.moveTo(x - step, y(this.prev[t.key]));
        ctx.lineTo(x, y(vals[t.key]));
        ctx.stroke();
      }
    }
    this.prev = vals;

    ctx.fillStyle = 'rgba(255,183,101,0.5)';
    ctx.fillRect(x + step, 0, step, this.h);

    this.x += step;
    if (this.x >= this.w) { this.x = 0; this.prev = null; }
  }

  /** Legend markup, rendered in HTML so it stays crisp and does not scroll. */
  static legendHTML() {
    return TRACES.map((t) =>
      '<span style="color:rgb(' + t.rgb.join(',') + ')">● ' + t.label + '</span>'
    ).join(' ');
  }
}
