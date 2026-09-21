/**
 * What the fly sees, and how that becomes a choice.
 *
 * This is the missing link between the stand and the brain. The stand shows the
 * world, the 3D view shows neurons firing, but neither shows the step in
 * between: the world arriving inside the fly's head as a pattern of activity
 * across its visual field.
 *
 * Nothing here is illustrative. The curve is the real LC10a population, plotted
 * at each cell's own retinotopic position: left-eye cells at negative azimuth,
 * right-eye at positive, eccentricity from the cell's AOTU019-vs-AOTU025 drive
 * ratio (see extract_circuit.py). When the fly turns, the bump moves, because
 * different cells are firing. That bump *is* the fly's answer to "where is it".
 *
 * The lower strip answers "which one": the left/right balance that AOTU and
 * DNa02 compute from that bump, and the turn it produces.
 */

import { FIELD_DEG } from '../encode.js';

const HALF = 95;             // degrees of field drawn either side of straight ahead
const BINS = 96;

const EYE_L = [134, 217, 236];
const EYE_R = [122, 190, 245];
const LOOM = [178, 138, 232];
const GOAL = [245, 204, 114];

const ICON_LABEL = {
  kitchen: 'מטבח', pita: 'פיתה', hummus: 'חומוס',
  balls: 'פלאפל', salad: 'סלט', chips: 'צ׳יפס',
};

export class VisionView {
  constructor(canvas, meta, foodArt, stations) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.meta = meta;
    this.food = foodArt;
    this.stations = stations;

    // pre-compute each LC10a cell's azimuth from its retinotopic proxy
    this.cells = [];
    for (const side of ['L', 'R']) {
      const sign = side === 'L' ? -1 : 1;
      for (const i of meta.groups['LC10a_' + side] || []) {
        this.cells.push({ i, side, az: sign * meta.retino[i] * FIELD_DEG });
      }
    }
    this.binL = new Float32Array(BINS);
    this.binR = new Float32Array(BINS);
    this.smoothL = new Float32Array(BINS);
    this.smoothR = new Float32Array(BINS);
    /** Multiplies every drawn size. 1 on the page, more on the filming stage. */
    this.zoom = 1;
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(360, Math.round(r.width * this.dpr));
    this.h = Math.max(150, Math.round((r.height || 210) * this.dpr));
    this.u = this.dpr * this.zoom;
    this.canvas.width = this.w;
    this.canvas.height = this.h;
  }

  azToX(az) { return this.w / 2 + (az / HALF) * (this.w / 2 - 26 * this.u); }

  draw(brain, game, handAz, out, dt) {
    const ctx = this.ctx;
    const d = this.u;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0a0808';
    ctx.fillRect(0, 0, this.w, this.h);

    const iconY = 34 * d;
    const axisY = 66 * d;
    const curveTop = 74 * d;
    const curveBot = this.h - 56 * d;

    this.bands(ctx, d, axisY, curveBot);
    this.objects(ctx, d, game, handAz, iconY);
    this.axis(ctx, d, axisY, curveBot);
    this.curves(ctx, d, brain, curveTop, curveBot);
    this.pests(ctx, d, game, handAz, curveTop, curveBot);
    this.verdict(ctx, d, out, game, handAz);
  }

  /** Left eye / right eye territory, so the split is obvious. */
  bands(ctx, d, top, bot) {
    const mid = this.w / 2;
    const g1 = ctx.createLinearGradient(0, 0, mid, 0);
    g1.addColorStop(0, 'rgba(134,217,236,0.07)');
    g1.addColorStop(1, 'rgba(134,217,236,0.015)');
    ctx.fillStyle = g1;
    ctx.fillRect(0, top, mid, bot - top);
    const g2 = ctx.createLinearGradient(this.w, 0, mid, 0);
    g2.addColorStop(0, 'rgba(122,190,245,0.07)');
    g2.addColorStop(1, 'rgba(122,190,245,0.015)');
    ctx.fillStyle = g2;
    ctx.fillRect(mid, top, mid, bot - top);

    ctx.direction = 'rtl';
    ctx.font = '600 ' + (10 * d).toFixed(0) + 'px Heebo, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(134,217,236,0.6)';
    ctx.fillText('עין שמאל', 8 * d, bot + 15 * d);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(122,190,245,0.6)';
    ctx.fillText('עין ימין', this.w - 8 * d, bot + 15 * d);
  }

  /** The stations, placed where they actually sit in the fly's field right now. */
  objects(ctx, d, game, handAz, y) {
    const goal = game.goal();
    for (const st of this.stations) {
      const rel = st.az - handAz;
      if (Math.abs(rel) > HALF) continue;
      const x = this.azToX(rel);
      const isGoal = goal && goal.id === st.id;
      const near = Math.max(0.35, 1 - Math.abs(rel) / HALF);

      if (isGoal) {
        ctx.strokeStyle = 'rgba(245,204,114,0.9)';
        ctx.lineWidth = 2 * d;
        ctx.beginPath();
        ctx.arc(x, y, 17 * d, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.save();
      ctx.globalAlpha = near;
      ctx.translate(x, y);
      ctx.scale(d * 0.78, d * 0.78);
      const f = this.food[st.id];
      if (f) f(ctx, 0, 0, 1);
      else {
        ctx.fillStyle = '#8a7a6a';
        ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();

      ctx.direction = 'rtl';
      ctx.textAlign = 'center';
      ctx.font = '500 ' + (9 * d).toFixed(0) + 'px Heebo, sans-serif';
      ctx.fillStyle = isGoal ? 'rgba(245,204,114,0.95)' : 'rgba(179,165,149,0.55)';
      ctx.fillText(ICON_LABEL[st.id] || st.id, x, y + 26 * d);
    }
  }

  axis(ctx, d, y, bot) {
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1 * d;
    ctx.beginPath();
    ctx.moveTo(0, y); ctx.lineTo(this.w, y);
    ctx.stroke();

    // straight ahead
    const mid = this.w / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.setLineDash([3 * d, 4 * d]);
    ctx.beginPath();
    ctx.moveTo(mid, y + 6 * d); ctx.lineTo(mid, bot);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.font = '500 ' + (9 * d).toFixed(0) + 'px Heebo, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('ישר קדימה', mid, y + 26 * d);

    for (const a of [-60, -30, 30, 60]) {
      const x = this.azToX(a);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(x, y - 3 * d, 1 * d, 6 * d);
      ctx.font = (8.5 * d).toFixed(0) + 'px JetBrains Mono, monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillText((a > 0 ? '+' : '') + a + '°', x, bot + 15 * d);
    }
  }

  /** The real LC10a population, binned by each cell's retinotopic position. */
  curves(ctx, d, brain, top, bot) {
    this.binL.fill(0); this.binR.fill(0);
    const countL = new Float32Array(BINS), countR = new Float32Array(BINS);
    for (const c of this.cells) {
      const b = Math.round(((c.az + HALF) / (HALF * 2)) * (BINS - 1));
      if (b < 0 || b >= BINS) continue;
      if (c.side === 'L') { this.binL[b] += brain.rate[c.i]; countL[b]++; }
      else { this.binR[b] += brain.rate[c.i]; countR[b]++; }
    }
    for (let b = 0; b < BINS; b++) {
      if (countL[b]) this.binL[b] /= countL[b];
      if (countR[b]) this.binR[b] /= countR[b];
    }
    // temporal smoothing so the shape reads instead of flickering
    for (let b = 0; b < BINS; b++) {
      this.smoothL[b] += (this.binL[b] - this.smoothL[b]) * 0.25;
      this.smoothR[b] += (this.binR[b] - this.smoothR[b]) * 0.25;
    }

    const H = bot - top;
    const MAX = 90;
    const plot = (arr, rgb, fromBin, toBin) => {
      ctx.beginPath();
      ctx.moveTo(this.azToX(-HALF + (fromBin / (BINS - 1)) * HALF * 2), bot);
      for (let b = fromBin; b <= toBin; b++) {
        const az = -HALF + (b / (BINS - 1)) * HALF * 2;
        const v = Math.min(1, arr[b] / MAX);
        ctx.lineTo(this.azToX(az), bot - v * H);
      }
      ctx.lineTo(this.azToX(-HALF + (toBin / (BINS - 1)) * HALF * 2), bot);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, top, 0, bot);
      g.addColorStop(0, 'rgba(' + rgb.join(',') + ',0.62)');
      g.addColorStop(1, 'rgba(' + rgb.join(',') + ',0.06)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(' + rgb.join(',') + ',0.95)';
      ctx.lineWidth = 1.6 * d;
      ctx.stroke();
    };
    const midBin = Math.round((BINS - 1) / 2);
    plot(this.smoothL, EYE_L, 0, midBin);
    plot(this.smoothR, EYE_R, midBin, BINS - 1);

    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.font = '600 ' + (9.5 * d).toFixed(0) + 'px Heebo, sans-serif';
    if (this.zoom === 1) {
      ctx.fillStyle = 'rgba(179,165,149,0.55)';
      ctx.fillText('פעילות LC10a לאורך שדה הראייה', this.w / 2, bot - H - 6 * d);
    }
  }

  /** Looming pests show up in the field too - that is what LPLC2 answers to. */
  pests(ctx, d, game, handAz, top, bot) {
    for (const p of game.pests) {
      if (p.dead) continue;
      const rel = p.az - handAz;
      if (Math.abs(rel) > HALF) continue;
      const x = this.azToX(rel);
      const loom = p.landed > 0 ? 0.95 : Math.pow(p.approach, 1.15);
      ctx.save();
      ctx.globalAlpha = 0.35 + loom * 0.55;
      ctx.strokeStyle = 'rgba(' + LOOM.join(',') + ',0.9)';
      ctx.lineWidth = 2 * d;
      ctx.setLineDash([4 * d, 4 * d]);
      ctx.beginPath();
      ctx.moveTo(x, top); ctx.lineTo(x, bot);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(x, top + 12 * d, (5 + loom * 11) * d, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** The decision the bump produces, stated in words. */
  verdict(ctx, d, out, game, handAz) {
    const y = this.h - 12 * d;
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.font = '700 ' + (12 * d).toFixed(0) + 'px Heebo, sans-serif';

    if (!out) return;
    const steer = out.steerHz || 0;
    let text, col;
    if (out.onTarget) { text = 'נעול על המטרה — תופס'; col = '119,201,142'; }
    else if (steer > 12) { text = 'המטרה מימין — פונה ימינה'; col = '122,190,245'; }
    else if (steer < -12) { text = 'המטרה משמאל — פונה שמאלה'; col = '134,217,236'; }
    else { text = 'מתייצב'; col = '179,165,149'; }

    ctx.fillStyle = 'rgba(' + col + ',0.95)';
    ctx.fillText(text, this.w / 2, y);
  }
}
