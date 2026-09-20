/**
 * Draws the falafel stand.
 *
 * The stand is laid out on an arc centred below the canvas, so the hand sweeping
 * between stations reads as the fly *turning* rather than sliding sideways -
 * which is what the steering circuit is actually computing.
 */
import {
  C, circle, rr, drawTray, drawHand, drawCustomer, drawStress, drawPest,
  drawPita, FOOD, drawNameplate, drawGrumble,
} from './art.js';
import { STATIONS, TRAY_IDS } from './orders.js';

export const VW = 900;
export const VH = 620;

const PIVOT_X = 450;
const PIVOT_Y = 700;
const RADIUS = 330;
const ANG_PER_DEG = 0.0106;

export const azToAngle = (az) => az * ANG_PER_DEG;
export function azToPos(az) {
  const a = azToAngle(az);
  return { x: PIVOT_X + Math.sin(a) * RADIUS, y: PIVOT_Y - Math.cos(a) * RADIUS, a };
}

const LABEL = { kitchen: 'מטבח', pita: 'פיתה', hummus: 'חומוס', balls: 'פלאפל', salad: 'סלט', chips: 'צ׳יפס' };

export class StandRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.snap = 0;
    this.spray = 0;
    this.sprayAz = 0;
    this.resize();
  }

  resize() {
    const c = this.canvas;
    const r = c.getBoundingClientRect();
    const w = Math.max(320, r.width), h = Math.max(240, r.height);
    c.width = Math.round(w * this.dpr);
    c.height = Math.round(h * this.dpr);
    this.cssW = w; this.cssH = h;
  }

  pulseGrab() { this.snap = 1; }
  pulseSwat(az) { this.spray = 1; this.sprayAz = az; }

  draw(game, handAz, t, dt, neural) {
    const ctx = this.ctx;
    this.snap = Math.max(0, this.snap - dt * 4.5);
    this.spray = Math.max(0, this.spray - dt * 2.6);

    const scale = Math.min(this.canvas.width / VW, this.canvas.height / VH);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = '#100b09';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.translate((this.canvas.width - VW * scale) / 2, (this.canvas.height - VH * scale) / 2);
    ctx.scale(scale, scale);

    this.bg(ctx, t);
    this.customers(ctx, game, t);
    this.orderBoard(ctx, game);
    this.counter(ctx);
    this.gaze(ctx, game, handAz, neural);
    this.stations(ctx, game, handAz, t);
    this.plate(ctx, game);
    this.pests(ctx, game, t);
    this.hand(ctx, handAz, neural);
    this.effects(ctx, game, t);
    if (game.tapeFlash > 0) this.tape(ctx, game, t);
  }

  bg(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, '#231913');
    g.addColorStop(0.55, '#1a120e');
    g.addColorStop(1, '#0e0907');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);

    // heat lamp cone
    const lamp = ctx.createRadialGradient(VW / 2, 40, 20, VW / 2, 300, 520);
    lamp.addColorStop(0, 'rgba(255,183,101,0.30)');
    lamp.addColorStop(0.5, 'rgba(255,152,74,0.08)');
    lamp.addColorStop(1, 'rgba(255,152,74,0)');
    ctx.fillStyle = lamp;
    ctx.fillRect(0, 0, VW, VH);

    // lamp housing
    ctx.fillStyle = '#2b2119';
    ctx.beginPath();
    ctx.moveTo(VW / 2 - 60, 0); ctx.lineTo(VW / 2 + 60, 0);
    ctx.lineTo(VW / 2 + 34, 26); ctx.lineTo(VW / 2 - 34, 26);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,183,101,' + (0.75 + Math.sin(t * 3) * 0.06).toFixed(3) + ')';
    rr(ctx, VW / 2 - 32, 22, 64, 6, 3); ctx.fill();
  }

  orderBoard(ctx, game) {
    const c = game.current;
    const x = 22, y = 18, w = 208, h = 132;
    rr(ctx, x, y, w, h, 10);
    ctx.fillStyle = 'rgba(12,9,7,0.82)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,183,101,0.28)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    ctx.fillStyle = C.inkDim;
    ctx.font = '600 13px Heebo, sans-serif';
    ctx.fillText('ההזמנה', x + w - 12, y + 24);

    if (!c) return;
    ctx.font = '500 13px Heebo, sans-serif';
    let ry = y + 46;
    for (const k of TRAY_IDS) {
      const need = c.order[k];
      if (!need) continue;
      const have = game.plate[k];
      const done = have >= need;
      FOOD[k](ctx, x + w - 26, ry - 4, 0.62);
      ctx.fillStyle = done ? C.ok : C.ink;
      ctx.fillText(LABEL[k], x + w - 46, ry);
      ctx.font = '600 13px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = done ? C.ok : C.warn;
      ctx.fillText(have + '/' + need, x + 14, ry);
      ctx.textAlign = 'right';
      ctx.font = '500 13px Heebo, sans-serif';
      ry += 21;
    }
    // pita chip
    ctx.fillStyle = game.plate.pita ? C.ok : C.inkDim;
    ctx.font = '500 11px Heebo, sans-serif';
    ctx.fillText(game.plate.pita ? 'פיתה ביד ✓' : 'צריך פיתה', x + w - 12, y + h - 12);
  }

  customers(ctx, game, t) {
    const n = Math.min(4, game.customers.length);
    const startX = 322, gap = 136;
    for (let i = 0; i < n; i++) {
      const c = game.customers[i];
      const x = startX + i * gap;
      const y = 120 - (i === 0 ? 5 : 0);
      const front = i === 0;

      ctx.globalAlpha = front ? 1 : 0.55;
      drawCustomer(ctx, x, y, c.stress, c.mk, c.seed, t);
      drawStress(ctx, x, y + 46, c.stress);
      drawNameplate(ctx, x, y + 68, c.mk.name, c.mk.party, !front);
      ctx.globalAlpha = 1;

      if (front) {
        // "now serving" caret
        ctx.fillStyle = 'rgba(255,183,101,0.9)';
        ctx.beginPath();
        ctx.moveTo(x, y - 46); ctx.lineTo(x - 6, y - 56); ctx.lineTo(x + 6, y - 56);
        ctx.closePath(); ctx.fill();
        // they start grumbling once patience is half gone
        if (c.stress > 0.45) drawGrumble(ctx, x, y - 58, c.line);
      }
    }
  }

  counter(ctx) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(PIVOT_X, PIVOT_Y, RADIUS + 46, Math.PI * 1.22, Math.PI * 1.78);
    ctx.arc(PIVOT_X, PIVOT_Y, RADIUS - 52, Math.PI * 1.78, Math.PI * 1.22, true);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 340, 0, 540);
    g.addColorStop(0, C.counterTop);
    g.addColorStop(1, C.counter);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,183,101,0.22)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
  }

  /** Where the fly is looking, tinted by how hard LC10a is firing. */
  gaze(ctx, game, handAz, neural) {
    const g = game.goal();
    if (!g || game.over) return;
    const from = azToPos(handAz);
    const to = azToPos(g.az);
    const drive = neural ? Math.min(1, neural.lcDrive / 60) : 0.4;

    ctx.save();
    ctx.setLineDash([5, 6]);
    ctx.lineDashOffset = -performance.now() * 0.02;
    ctx.strokeStyle = 'rgba(122,214,235,' + (0.18 + drive * 0.45).toFixed(3) + ')';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y - 26);
    ctx.lineTo(to.x, to.y - 10);
    ctx.stroke();
    ctx.restore();

    // goal marker
    const pulse = 0.5 + Math.sin(performance.now() * 0.005) * 0.5;
    ctx.strokeStyle = 'rgba(122,214,235,' + (0.35 + pulse * 0.4).toFixed(3) + ')';
    ctx.lineWidth = 2;
    circle(ctx, to.x, to.y - 10, 26 + pulse * 4);
    ctx.stroke();
  }

  stations(ctx, game, handAz, t) {
    for (const s of STATIONS) {
      const p = azToPos(s.az);
      const near = Math.max(0, 1 - Math.abs(s.az - handAz) / 26);

      if (s.kind === 'tray') {
        drawTray(ctx, p.x, p.y, s.id, game.trays[s.id], game.spoiled[s.id], near);
      } else if (s.kind === 'pita') {
        ctx.save();
        ctx.translate(p.x, p.y);
        rr(ctx, -40, -16, 80, 34, 7);
        ctx.fillStyle = C.steelDark; ctx.fill();
        for (let i = 0; i < 3; i++) drawPita(ctx, 0, 6 - i * 7, 0.82, i === 2);
        ctx.restore();
      } else {
        this.kitchen(ctx, p.x, p.y, game, t);
      }

      ctx.textAlign = 'center';
      ctx.direction = 'rtl';
      ctx.font = '500 11px Heebo, sans-serif';
      ctx.fillStyle = near > 0.3 ? C.lamp : C.inkDim;
      ctx.fillText(LABEL[s.id], p.x, p.y + 42);

      if (s.kind === 'tray' && game.spoiled[s.id]) {
        ctx.fillStyle = C.danger;
        ctx.font = '600 10px Heebo, sans-serif';
        ctx.fillText('מקולקל', p.x, p.y - 32);
      }
    }
  }

  kitchen(ctx, x, y, game, t) {
    ctx.save();
    ctx.translate(x, y);
    // hatch
    rr(ctx, -42, -34, 84, 62, 8);
    ctx.fillStyle = '#241a13'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,183,101,0.3)'; ctx.lineWidth = 1.4; ctx.stroke();
    // worker
    const bob = Math.sin(t * 2.4) * 2;
    circle(ctx, 0, -12 + bob, 11); ctx.fillStyle = '#d9a97e'; ctx.fill();
    rr(ctx, -13, -2 + bob, 26, 24, 6); ctx.fillStyle = '#5b6e58'; ctx.fill();
    // hat
    rr(ctx, -11, -26 + bob, 22, 8, 3); ctx.fillStyle = '#eee6da'; ctx.fill();
    ctx.fillStyle = '#1b1410';
    circle(ctx, -4, -13 + bob, 1.8); ctx.fill();
    circle(ctx, 4, -13 + bob, 1.8); ctx.fill();
    if (game.carrying) {
      const f = FOOD[game.carrying];
      if (f) f(ctx, 0, 24, 0.9);
    }
    ctx.restore();
  }

  plate(ctx, game) {
    const x = VW / 2, y = 566;
    rr(ctx, x - 96, y - 26, 192, 52, 12);
    ctx.fillStyle = 'rgba(12,9,7,0.75)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,183,101,0.2)'; ctx.lineWidth = 1.2; ctx.stroke();

    if (!game.plate.pita) {
      ctx.textAlign = 'center';
      ctx.direction = 'rtl';
      ctx.font = '500 12px Heebo, sans-serif';
      ctx.fillStyle = C.inkDim;
      ctx.fillText('אין פיתה ביד', x, y + 5);
      return;
    }
    drawPita(ctx, x, y + 8, 1.05, true);
    let i = 0;
    for (const k of TRAY_IDS) {
      for (let n = 0; n < game.plate[k]; n++) {
        const ox = -58 + i * 17;
        FOOD[k](ctx, x + ox, y - 6, 0.52);
        i++;
      }
    }
  }

  pests(ctx, game, t) {
    for (const p of game.pests) {
      if (p.dead && p.fade <= 0) continue;
      const base = azToPos(p.az);
      const fly = p.landed > 0
        ? { x: base.x, y: base.y - 22 }
        : { x: base.x + Math.sin(p.wobble * 0.7) * 40 * (1 - p.approach),
            y: base.y - 210 * (1 - p.approach) - 22 };
      drawPest(ctx, fly.x, fly.y, p.approach, p.wobble, p.landed > 0, p.dead ? p.fade : 0);
    }

    if (this.spray > 0.02) {
      const p = azToPos(this.sprayAz);
      ctx.save();
      ctx.globalAlpha = this.spray;
      const gr = ctx.createRadialGradient(p.x, p.y - 30, 4, p.x, p.y - 30, 60);
      gr.addColorStop(0, 'rgba(180,235,220,0.75)');
      gr.addColorStop(1, 'rgba(180,235,220,0)');
      ctx.fillStyle = gr;
      circle(ctx, p.x, p.y - 30, 60); ctx.fill();
      ctx.restore();
    }
  }

  hand(ctx, handAz, neural) {
    const p = azToPos(handAz);
    const active = neural ? neural.onTarget : false;
    drawHand(ctx, p.x, p.y - 30, p.a, this.snap, active);
  }

  effects(ctx, game, t) {
    ctx.textAlign = 'center';
    ctx.direction = 'rtl';
    for (const e of game.events) {
      const p = azToPos(e.az);
      const rise = (1 - e.life) * 34;
      ctx.globalAlpha = Math.min(1, e.life * 1.6);
      ctx.font = '700 15px Heebo, sans-serif';
      ctx.fillStyle = e.kind === 'bad' || e.kind === 'spoil' ? C.danger
        : e.kind === 'serve' ? C.ok
        : e.kind === 'swat' ? '#9fe8d4'
        : C.lamp;
      ctx.fillText(e.text, p.x, p.y - 48 - rise);
      ctx.globalAlpha = 1;
    }
  }

  tape(ctx, game, t) {
    const a = Math.min(1, game.tapeFlash / 1.6);
    ctx.save();
    ctx.globalAlpha = a * 0.5;
    ctx.fillStyle = C.lamp;
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.direction = 'rtl';
    ctx.font = '800 30px Heebo, sans-serif';
    ctx.fillStyle = '#2a1a0e';
    ctx.fillText('קלטת! הלקוחות נרגעו', VW / 2, VH / 2);
    ctx.restore();
  }
}
