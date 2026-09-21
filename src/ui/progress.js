/**
 * The fly's progress, on two timescales.
 *
 * Top: the dish in front of it right now, as a row of steps. Pita, then each
 * ingredient the order asks for, then hand it over. The step it is working on
 * glows; finished ones tick off. This is the "step by step" the fly is actually
 * doing, and it is the whole of its plan - there is nothing longer-term in
 * there.
 *
 * Bottom: the session. One bar per dish served, height being how long that dish
 * took, against the rising difficulty line.
 *
 * That second chart is the honest version of "getting better". The fly does not
 * improve - its wiring never changes and nothing in this simulation learns. The
 * bars stay about the same height while the difficulty line climbs underneath
 * them, and eventually the queue outruns a fly that is working exactly as well
 * as it did at the start. What you are watching is a fixed brain meeting a
 * rising demand.
 */

import { TRAY_IDS } from '../game/orders.js';

const STEP_LABEL = {
  pita: 'פיתה', hummus: 'חומוס', balls: 'פלאפל',
  salad: 'סלט', chips: 'צ׳יפס', serve: 'מגיש',
};

export class ProgressView {
  constructor(canvas, foodArt) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.food = foodArt;
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(340, Math.round(r.width * this.dpr));
    this.h = Math.max(150, Math.round((r.height || 210) * this.dpr));
    this.canvas.width = this.w;
    this.canvas.height = this.h;
  }

  /** The steps this dish needs, and how far along each one is. */
  steps(game) {
    const c = game.current;
    const out = [{ id: 'pita', need: 1, have: game.plate.pita ? 1 : 0 }];
    if (c) {
      for (const k of TRAY_IDS) {
        if (c.order[k] > 0) out.push({ id: k, need: c.order[k], have: game.plate[k] });
      }
    }
    out.push({ id: 'serve', need: 1, have: 0 });
    return out;
  }

  draw(game, t) {
    const ctx = this.ctx;
    const d = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0a0808';
    ctx.fillRect(0, 0, this.w, this.h);

    const splitY = this.h * 0.46;
    this.stepRow(ctx, d, game, t, splitY);
    this.session(ctx, d, game, splitY);
  }

  stepRow(ctx, d, game, t, bottom) {
    const steps = this.steps(game);
    const goal = game.goal();
    // first unfinished step is the one being worked on
    let active = steps.findIndex((s) => s.have < s.need);
    if (active < 0) active = steps.length - 1;
    if (goal && goal.id === 'kitchen') active = -2;   // detour

    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.font = '600 ' + (10 * d).toFixed(0) + 'px Heebo, sans-serif';
    ctx.fillStyle = 'rgba(179,165,149,0.7)';
    ctx.fillText('המנה שהוא מרכיב עכשיו', this.w - 10 * d, 16 * d);

    const n = steps.length;
    const pad = 14 * d;
    const gap = (this.w - pad * 2) / n;
    const y = bottom - 34 * d;

    for (let i = 0; i < n; i++) {
      const s = steps[i];
      // RTL: first step on the right
      const x = this.w - pad - gap * (i + 0.5);
      const done = s.have >= s.need;
      const isActive = i === active;

      if (i < n - 1) {
        const nx = this.w - pad - gap * (i + 1.5);
        ctx.strokeStyle = done ? 'rgba(119,201,142,0.55)' : 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 2 * d;
        ctx.beginPath();
        ctx.moveTo(x - 20 * d, y);
        ctx.lineTo(nx + 20 * d, y);
        ctx.stroke();
      }

      const r = 17 * d;
      if (isActive) {
        const pulse = 0.55 + Math.sin(t * 6) * 0.45;
        ctx.strokeStyle = 'rgba(245,204,114,' + pulse.toFixed(3) + ')';
        ctx.lineWidth = 2.4 * d;
        ctx.beginPath(); ctx.arc(x, y, r + 5 * d, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = done ? 'rgba(46,82,58,0.95)'
        : isActive ? 'rgba(58,46,26,0.95)' : 'rgba(26,24,22,0.95)';
      ctx.fill();
      ctx.strokeStyle = done ? 'rgba(119,201,142,0.85)'
        : isActive ? 'rgba(245,204,114,0.9)' : 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1.4 * d;
      ctx.stroke();

      if (s.id === 'serve') {
        ctx.font = (15 * d).toFixed(0) + 'px Heebo, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = done ? '#77c98e' : 'rgba(247,242,234,0.75)';
        ctx.fillText('✓', x, y + 5 * d);
      } else if (this.food[s.id]) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(d * 0.62, d * 0.62);
        ctx.globalAlpha = done ? 1 : 0.75;
        this.food[s.id](ctx, 0, 0, 1);
        ctx.restore();
      } else {
        // pita
        ctx.save();
        ctx.translate(x, y + 4 * d);
        ctx.scale(d * 0.52, d * 0.52);
        ctx.fillStyle = '#e9c99b';
        ctx.beginPath(); ctx.ellipse(0, 0, 20, 17, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
        ctx.restore();
      }

      ctx.textAlign = 'center';
      ctx.direction = 'rtl';
      ctx.font = '500 ' + (9.5 * d).toFixed(0) + 'px Heebo, sans-serif';
      ctx.fillStyle = isActive ? '#f5cc72' : done ? 'rgba(119,201,142,0.8)' : 'rgba(179,165,149,0.5)';
      const label = STEP_LABEL[s.id] + (s.need > 1 ? ' ' + s.have + '/' + s.need : '');
      ctx.fillText(label, x, y + r + 15 * d);
    }

    if (active === -2) {
      ctx.textAlign = 'center';
      ctx.font = '600 ' + (11 * d).toFixed(0) + 'px Heebo, sans-serif';
      ctx.fillStyle = '#e8b45c';
      ctx.fillText('נגמר מגש — רץ למטבח להביא עוד', this.w / 2, bottom - 4 * d);
    }
  }

  session(ctx, d, game, top) {
    const log = game.serveLog;
    const padX = 14 * d;
    const bot = this.h - 22 * d;
    const chartTop = top + 18 * d;
    const H = bot - chartTop;

    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.font = '600 ' + (10 * d).toFixed(0) + 'px Heebo, sans-serif';
    ctx.fillStyle = 'rgba(179,165,149,0.7)';
    ctx.fillText('כל המנות שהגיש · גובה = כמה זמן לקחה', this.w - 10 * d, top + 12 * d);

    // the rising difficulty line, drawn under the bars
    ctx.beginPath();
    const span = Math.max(60, game.t);
    for (let i = 0; i <= 40; i++) {
      const tt = (i / 40) * span;
      const diff = Math.min(1, tt / 260);
      const x = this.w - padX - (i / 40) * (this.w - padX * 2);
      ctx.lineTo(x, bot - diff * H * 0.92);
    }
    ctx.strokeStyle = 'rgba(224,85,63,0.55)';
    ctx.lineWidth = 1.6 * d;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.font = '500 ' + (9 * d).toFixed(0) + 'px Heebo, sans-serif';
    ctx.fillStyle = 'rgba(224,85,63,0.8)';
    ctx.fillText('קצב ההזמנות עולה', padX, chartTop + 9 * d);

    if (!log.length) {
      ctx.textAlign = 'center';
      ctx.direction = 'rtl';
      ctx.fillStyle = 'rgba(179,165,149,0.45)';
      ctx.font = '500 ' + (11 * d).toFixed(0) + 'px Heebo, sans-serif';
      ctx.fillText('עוד לא הגיש כלום', this.w / 2, (chartTop + bot) / 2);
      return;
    }

    // Scale to what this session actually looks like. A fixed ceiling makes
    // every bar a stub when the fly is quick, which is most of the time.
    let peak = 0;
    for (const e of log) if (e.gap > peak) peak = e.gap;
    this.gapScale = this.gapScale || 6;
    this.gapScale += (Math.max(6, peak * 1.15) - this.gapScale) * 0.05;
    const MAX_GAP = this.gapScale;
    const bw = Math.max(2 * d, Math.min(9 * d, (this.w - padX * 2) / Math.max(24, log.length)));
    for (let i = 0; i < log.length; i++) {
      const e = log[i];
      const x = this.w - padX - ((log.length - 1 - i) + 0.5) * bw - bw / 2;
      if (x < padX) break;
      const hh = Math.max(3 * d, Math.min(1, e.gap / MAX_GAP) * H * 0.85);
      // colour by how close that customer was to walking
      const s = e.stress;
      const col = s > 0.7 ? '224,85,63' : s > 0.42 ? '232,180,92' : '119,201,142';
      ctx.fillStyle = 'rgba(' + col + ',0.85)';
      ctx.fillRect(x, bot - hh, bw * 0.78, hh);
    }

    ctx.textAlign = 'right';
    ctx.font = (9 * d).toFixed(0) + 'px JetBrains Mono, monospace';
    ctx.fillStyle = 'rgba(179,165,149,0.6)';
    const mean = log.reduce((a, b) => a + b.gap, 0) / log.length;
    ctx.fillText(log.length + ' מנות · ' + mean.toFixed(1) + ' שנ׳ למנה בממוצע',
      this.w - padX, bot + 14 * d);
  }
}
