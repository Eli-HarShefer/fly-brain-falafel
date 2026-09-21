/**
 * The fly's own point of view.
 *
 * A Drosophila eye is not a camera. It has roughly 750 ommatidia, each one a
 * separate lens pointing in its own direction, spaced about 5 degrees apart.
 * That is around a hundred times coarser than a human fovea. It also runs far
 * faster: flies resolve flicker up to roughly 200 Hz where we give up near 60,
 * so a hand moving at you looks slow to them.
 *
 * This panel renders the stand as that eye actually samples it: one hexagon per
 * ommatidium, each filled with whatever lies in its direction. It is the reason
 * the fly behaves the way it does. At 5 degrees per sample there is no detail to
 * work with - a tray is a few dark hexes - so the only thing worth computing is
 * *where* the blob is, which is exactly what LC10a reports and all the steering
 * downstream acts on.
 *
 * Geometry is taken from the live game, so this is a real projection of the
 * scene, not an illustration of one.
 */

const D_PHI = 5;            // inter-ommatidial angle, degrees
const AZ_SPAN = 88;         // how much of the frontal field to draw
const EL_SPAN = 26;

const FOOD_RGB = {
  hummus: [242, 220, 176],
  balls: [147, 124, 64],
  salad: [121, 192, 100],
  chips: [238, 180, 82],
  pita: [233, 201, 155],
  kitchen: [150, 130, 105],
};

export class EyeView {
  constructor(canvas, stations) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.stations = stations;

    // lay out the ommatidial lattice: offset rows, hexagonal packing
    this.omma = [];
    const rows = Math.floor((EL_SPAN * 2) / (D_PHI * 0.87));
    for (let r = 0; r <= rows; r++) {
      const el = EL_SPAN - r * D_PHI * 0.87;
      const stagger = (r % 2) ? D_PHI / 2 : 0;
      for (let az = -AZ_SPAN + stagger; az <= AZ_SPAN; az += D_PHI) {
        this.omma.push({ az, el, r, v: 0, g: 0, b: 0, target: 0 });
      }
    }
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(360, Math.round(r.width * this.dpr));
    this.h = Math.max(140, Math.round((r.height || 230) * this.dpr));
    this.canvas.width = this.w;
    this.canvas.height = this.h;
  }

  /**
   * What lies in a given direction. The stand is modelled the way the fly would
   * encounter it: trays on a counter just below eye level, the queue above and
   * behind them, pests wherever they currently are.
   */
  sample(az, el, game, handAz, goalId) {
    // pests first: they are the thing the escape circuit cares about
    for (const p of game.pests) {
      if (p.dead) continue;
      const rel = p.az - handAz;
      const size = 4 + (p.landed > 0 ? 7 : p.approach * 9);
      const pel = p.landed > 0 ? -4 : 26 - p.approach * 30;
      if (Math.abs(az - rel) < size && Math.abs(el - pel) < size * 0.8) {
        return { rgb: [26, 20, 16], pest: true };
      }
    }
    // trays and the pita pile, sitting on the counter
    for (const st of this.stations) {
      const rel = st.az - handAz;
      const half = 9;
      if (Math.abs(az - rel) < half && el > -17 && el < -1) {
        const base = FOOD_RGB[st.id] || [140, 125, 110];
        const dim = game.spoiled[st.id] ? 0.42 : 1;
        const empty = (game.trays[st.id] !== undefined && game.trays[st.id] <= 0) ? 0.5 : 1;
        return {
          rgb: base.map((c) => c * dim * empty),
          target: st.id === goalId,
        };
      }
    }
    // counter surface below
    if (el < -17) return { rgb: [72, 52, 36] };
    // the queue, above and beyond the counter
    if (el > 8 && Math.abs(az) < 62) {
      const n = Math.min(4, game.customers.length);
      for (let i = 0; i < n; i++) {
        const cAz = -34 + i * 23;
        if (Math.abs(az - cAz) < 8 && el < 24) {
          const s = game.customers[i].stress;
          return { rgb: [70 + s * 120, 58 + s * 20, 52] };
        }
      }
    }
    // lit back wall, falling off toward the edges
    const warm = Math.max(0, 1 - Math.abs(az) / 110) * Math.max(0, 1 - Math.abs(el) / 40);
    return { rgb: [30 + warm * 34, 22 + warm * 22, 17 + warm * 12] };
  }

  draw(game, handAz, out, dt) {
    const ctx = this.ctx;
    const d = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#070605';
    ctx.fillRect(0, 0, this.w, this.h);

    const goal = game.goal();
    const goalId = goal ? goal.id : null;

    const padX = 10 * d, padTop = 26 * d, padBot = 26 * d;
    const sx = (this.w - padX * 2) / (AZ_SPAN * 2);
    const sy = (this.h - padTop - padBot) / (EL_SPAN * 2);
    const rad = Math.min(sx * D_PHI, sy * D_PHI * 0.87) * 0.56;

    // Batch by quantised colour. 426 separate beginPath/fill calls cost about
    // 2.4 ms a frame; bucketing to ~40 tones and filling one Path2D per bucket
    // does the same drawing in a fraction of that.
    const buckets = new Map();
    const outline = [];
    const pestRing = [];
    for (const o of this.omma) {
      const s = this.sample(o.az, o.el, game, handAz, goalId);
      // ommatidia integrate over time; ease toward the new value
      o.v += (s.rgb[0] - o.v) * 0.35;
      o.g += (s.rgb[1] - o.g) * 0.35;
      o.b += (s.rgb[2] - o.b) * 0.35;
      o.target += ((s.target ? 1 : 0) - o.target) * 0.25;

      const x = padX + (o.az + AZ_SPAN) * sx;
      const y = padTop + (EL_SPAN - o.el) * sy;

      const key = ((o.v & 0xf8) << 16) | ((o.g & 0xf8) << 8) | (o.b & 0xf8);
      let p = buckets.get(key);
      if (!p) { p = new Path2D(); buckets.set(key, p); }
      this.hexInto(p, x, y, rad);

      if (o.target > 0.12) outline.push(x, y, o.target);
      if (s.pest) pestRing.push(x, y);
    }
    for (const [key, path] of buckets) {
      ctx.fillStyle = 'rgb(' + ((key >> 16) & 0xff) + ',' +
        ((key >> 8) & 0xff) + ',' + (key & 0xff) + ')';
      ctx.fill(path);
    }
    ctx.lineWidth = 1.1 * d;
    for (let i = 0; i < outline.length; i += 3) {
      ctx.strokeStyle = 'rgba(245,204,114,' + (outline[i + 2] * 0.85).toFixed(3) + ')';
      this.hexPath(ctx, outline[i], outline[i + 1], rad);
      ctx.stroke();
    }
    if (pestRing.length) {
      ctx.strokeStyle = 'rgba(178,138,232,0.8)';
      for (let i = 0; i < pestRing.length; i += 2) {
        this.hexPath(ctx, pestRing[i], pestRing[i + 1], rad);
        ctx.stroke();
      }
    }

    // heading marker
    const midX = padX + AZ_SPAN * sx;
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.setLineDash([3 * d, 4 * d]);
    ctx.lineWidth = 1 * d;
    ctx.beginPath();
    ctx.moveTo(midX, padTop - 6 * d);
    ctx.lineTo(midX, this.h - padBot + 6 * d);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.font = '500 ' + (9 * d).toFixed(0) + 'px Heebo, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('ישר קדימה', midX, 14 * d);

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(179,165,149,0.55)';
    ctx.fillText('~' + this.omma.length + ' אומטידיות · ' + D_PHI + '° בין אחת לשנייה',
      this.w - 8 * d, this.h - 8 * d);

    ctx.textAlign = 'left';
    if (out && out.onTarget) {
      ctx.fillStyle = 'rgba(119,201,142,0.95)';
      ctx.fillText('המטרה במרכז השדה', 8 * d, this.h - 8 * d);
    } else if (goal) {
      const rel = goal.az - handAz;
      ctx.fillStyle = 'rgba(245,204,114,0.9)';
      ctx.fillText(Math.abs(rel).toFixed(0) + '° ' + (rel > 0 ? 'ימינה' : 'שמאלה'),
        8 * d, this.h - 8 * d);
    }
  }

  hexPath(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  /** Append one hexagon to a batched Path2D. */
  hexInto(path, x, y, r) {
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) path.moveTo(px, py); else path.lineTo(px, py);
    }
    path.closePath();
  }
}
