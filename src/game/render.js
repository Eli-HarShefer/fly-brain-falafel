/**
 * Draws the falafel stand.
 *
 * The stand is laid out on an arc centred below the canvas, so the hand sweeping
 * between stations reads as the fly *turning* rather than sliding sideways -
 * which is what the steering circuit is actually computing.
 */
import {
  C, circle, rr, drawTray, drawFly, drawCustomer, drawStress, drawPest,
  drawPita, FOOD, drawNameplate, drawGrumble, drawThought,
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

const WALL_H = 330;

/** Pre-render the tiled back wall to an offscreen canvas. Static, so once is enough. */
function buildWall() {
  const c = document.createElement('canvas');
  c.width = VW; c.height = WALL_H;
  const x = c.getContext('2d');
  const TW = 54, TH = 40;
  for (let ty = 0; ty < WALL_H; ty += TH) {
    const offset = (ty / TH) % 2 ? TW / 2 : 0;
    for (let tx = -TW; tx < VW + TW; tx += TW) {
      // warm glazed tiles, brighter near the lamp
      const dx = (tx + offset + TW / 2 - VW / 2) / VW;
      const glow = Math.max(0, 1 - Math.abs(dx) * 2.1) * Math.max(0, 1 - ty / WALL_H);
      x.fillStyle = 'rgba(' + Math.round(58 + glow * 66) + ',' +
        Math.round(42 + glow * 40) + ',' + Math.round(32 + glow * 22) + ',0.55)';
      x.beginPath();
      x.roundRect(tx + offset + 1, ty + 1, TW - 2, TH - 2, 3);
      x.fill();
    }
  }
  return c;
}

export class StandRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.snap = 0;
    this.spray = 0;
    this.sprayAz = 0;
    this.tilt = 0;
    this.wall = buildWall();
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
    if (!this.clean) this.customers(ctx, game, t);
    if (!this.clean) this.orderBoard(ctx, game);
    this.counter(ctx);
    this.gaze(ctx, game, handAz, neural, t);
    this.stations(ctx, game, handAz, t);
    this.steam(ctx, game, t);
    if (!this.clean) this.plate(ctx, game, t);
    this.pests(ctx, game, t);
    this.fly(ctx, game, handAz, neural, t);
    if (!this.clean) this.effects(ctx, game, t);
    if (!this.clean && game.tapeFlash > 0) this.tape(ctx, game, t);
  }

  bg(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, '#2b1e15');
    g.addColorStop(0.5, '#1c1410');
    g.addColorStop(1, '#0d0806');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);

    // tiled back wall, drawn once and blitted: ~370 rounded rects per frame was
    // costing 10 ms, and the tiles never change
    ctx.drawImage(this.wall, 0, 0);

    // heat lamp cone
    const lamp = ctx.createRadialGradient(VW / 2, 40, 20, VW / 2, 310, 540);
    lamp.addColorStop(0, 'rgba(255,190,110,0.34)');
    lamp.addColorStop(0.45, 'rgba(255,152,74,0.10)');
    lamp.addColorStop(1, 'rgba(255,152,74,0)');
    ctx.fillStyle = lamp;
    ctx.fillRect(0, 0, VW, VH);

    // lamp housing
    ctx.fillStyle = '#31251b';
    ctx.beginPath();
    ctx.moveTo(VW / 2 - 60, 0); ctx.lineTo(VW / 2 + 60, 0);
    ctx.lineTo(VW / 2 + 34, 26); ctx.lineTo(VW / 2 - 34, 26);
    ctx.closePath(); ctx.fill();
    const flicker = 0.78 + Math.sin(t * 3) * 0.05 + Math.sin(t * 17.3) * 0.02;
    ctx.fillStyle = 'rgba(255,196,120,' + flicker.toFixed(3) + ')';
    rr(ctx, VW / 2 - 32, 22, 64, 6, 3); ctx.fill();
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.shadowColor = 'rgba(255,183,101,0.9)';
    ctx.shadowBlur = 22;
    rr(ctx, VW / 2 - 32, 22, 64, 6, 3); ctx.fill();
    ctx.restore();

    // hanging sign
    ctx.strokeStyle = 'rgba(120,96,70,0.8)';
    ctx.lineWidth = 2;
    for (const sx of [VW / 2 - 122, VW / 2 + 122]) {
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, 16); ctx.stroke();
    }
    ctx.fillStyle = '#3d2c1e';
    rr(ctx, VW / 2 - 140, 14, 280, 40, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,183,101,0.45)';
    ctx.lineWidth = 1.6;
    rr(ctx, VW / 2 - 140, 14, 280, 40, 7); ctx.stroke();
    // marquee bulbs inside the top edge of the sign
    for (let i = 0; i < 7; i++) {
      const bx = VW / 2 - 120 + i * 40;
      const on = 0.5 + Math.sin(t * 3 + i * 0.9) * 0.42;
      ctx.fillStyle = 'rgba(255,214,150,' + on.toFixed(3) + ')';
      circle(ctx, bx, 22, 2.6);
      ctx.fill();
    }
    ctx.textAlign = 'center';
    ctx.direction = 'rtl';
    ctx.font = '800 21px Heebo, sans-serif';
    ctx.fillStyle = 'rgba(255,205,135,0.96)';
    ctx.fillText('פלאפל הזבוב', VW / 2, 45);
  }

  /** Steam off the hot trays. Cheap, and it makes the food read as food. */
  steam(ctx, game, t) {
    for (const id of ['balls', 'chips']) {
      if (game.spoiled[id] || game.trays[id] <= 0) continue;
      const p = azToPos(STATIONS.find((s) => s.id === id).az);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.35 + i * 0.33) % 1;
        const sy = p.y - 20 - ph * 54;
        const sx = p.x + Math.sin(t * 1.6 + i * 2.1) * 11 * ph;
        ctx.globalAlpha = (1 - ph) * 0.16;
        ctx.fillStyle = '#ffd9a8';
        ctx.beginPath();
        ctx.ellipse(sx, sy, 9 + ph * 13, 6 + ph * 10, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
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

  /**
   * Where the fly is headed. Deliberately loud: without a clear marker it is
   * impossible to tell whether the fly is doing the right thing, which is the
   * whole thing you are meant to be watching.
   */
  gaze(ctx, game, handAz, neural, t) {
    const g = game.goal();
    if (!g || game.over) return;
    const from = azToPos(handAz);
    const to = azToPos(g.az);
    const drive = neural ? Math.min(1, neural.lcDrive / 60) : 0.4;
    const pulse = 0.5 + Math.sin(t * 5) * 0.5;

    // sight line from the fly to its target, brightness = how hard LC10a fires
    ctx.save();
    ctx.setLineDash([5, 7]);
    ctx.lineDashOffset = -t * 40;
    ctx.strokeStyle = 'rgba(122,214,235,' + (0.22 + drive * 0.5).toFixed(3) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y - 40);
    ctx.lineTo(to.x, to.y - 14);
    ctx.stroke();
    ctx.restore();

    // target ring
    ctx.strokeStyle = 'rgba(245,204,114,' + (0.45 + pulse * 0.45).toFixed(3) + ')';
    ctx.lineWidth = 3;
    circle(ctx, to.x, to.y, 40 + pulse * 5);
    ctx.stroke();

    // a big bouncing arrow, so the target is unmissable
    const ay = to.y - 74 - pulse * 7;
    ctx.fillStyle = 'rgba(245,204,114,0.96)';
    ctx.beginPath();
    ctx.moveTo(to.x, ay + 22);
    ctx.lineTo(to.x - 13, ay);
    ctx.lineTo(to.x - 5.5, ay);
    ctx.lineTo(to.x - 5.5, ay - 15);
    ctx.lineTo(to.x + 5.5, ay - 15);
    ctx.lineTo(to.x + 5.5, ay);
    ctx.lineTo(to.x + 13, ay);
    ctx.closePath();
    ctx.fill();
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

  /**
   * The objective bar: what the fly is doing right now, and how far through the
   * order it is. This is the single most important thing on the canvas, so it
   * gets the width and the contrast.
   */
  plate(ctx, game, t) {
    const y = 566, w = 700, x = VW / 2;
    rr(ctx, x - w / 2, y - 34, w, 66, 14);
    ctx.fillStyle = 'rgba(10,8,6,0.92)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,183,101,0.3)'; ctx.lineWidth = 1.4; ctx.stroke();

    const c = game.current;
    const g = game.goal();
    ctx.direction = 'rtl';

    // ---- right side: the current instruction --------------------------------
    const rx = x + w / 2 - 20;
    ctx.textAlign = 'right';
    ctx.font = '500 11px Heebo, sans-serif';
    ctx.fillStyle = C.inkDim;
    ctx.fillText('הזבוב עכשיו', rx, y - 14);

    let verb = 'מחכה';
    if (g) {
      if (g.reason === 'pita') verb = 'לוקח פיתה';
      else if (g.reason === 'fill') verb = 'ממלא ' + LABEL[g.id];
      else if (g.reason === 'restock') verb = 'מחזיר ' + LABEL[g.id];
      else if (String(g.reason).startsWith('empty')) verb = 'רץ למטבח';
      else if (g.reason === 'done') verb = 'מגיש';
    }
    ctx.font = '800 21px Heebo, sans-serif';
    ctx.fillStyle = C.lamp;
    ctx.fillText(verb, rx, y + 12);
    if (g && LABEL[g.id] && FOOD[g.id]) {
      FOOD[g.id](ctx, rx - ctx.measureText(verb).width - 22, y + 4, 0.78);
    }

    // ---- left side: the dish so far -----------------------------------------
    const lx = x - w / 2 + 22;
    ctx.textAlign = 'left';
    ctx.font = '500 11px Heebo, sans-serif';
    ctx.fillStyle = C.inkDim;
    ctx.fillText('המנה ביד', lx, y - 14);

    if (!game.plate.pita) {
      ctx.font = '600 14px Heebo, sans-serif';
      ctx.fillStyle = 'rgba(179,165,149,0.8)';
      ctx.fillText('ריק', lx, y + 12);
    } else {
      drawPita(ctx, lx + 20, y + 12, 0.8, true);
      let i = 0;
      for (const k of TRAY_IDS) {
        for (let n = 0; n < game.plate[k]; n++) {
          FOOD[k](ctx, lx + 48 + i * 19, y + 4, 0.58);
          i++;
        }
      }
    }

    // ---- middle: progress pips per ingredient --------------------------------
    if (c) {
      let px = x - 110;
      ctx.textAlign = 'center';
      for (const k of TRAY_IDS) {
        const need = c.order[k];
        if (!need) continue;
        const have = game.plate[k];
        FOOD[k](ctx, px, y - 10, 0.62);
        for (let i = 0; i < need; i++) {
          const done = i < have;
          circle(ctx, px - (need - 1) * 5 + i * 10, y + 13, 3.8);
          ctx.fillStyle = done ? C.ok : 'rgba(255,255,255,0.18)';
          ctx.fill();
        }
        px += Math.max(34, need * 12 + 20);
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

  fly(ctx, game, handAz, neural, t) {
    const p = azToPos(handAz);
    // bank into the turn by the size of the steering command
    const steer = neural ? Math.max(-1, Math.min(1, neural.steerHz / 170)) : 0;
    this.tilt += (steer - this.tilt) * 0.18;

    // whatever it is holding right now
    let carrying = null;
    if (game.carrying) carrying = game.carrying;
    else if (game.plate.pita) carrying = 'pita';

    drawFly(ctx, p.x, p.y - 42, {
      tilt: this.tilt,
      wing: t,
      snap: this.snap,
      onTarget: neural ? neural.onTarget : false,
      carrying,
      stress: game.current ? game.current.stress : 0,
      lunge: this.spray,
    });

    // what the fly is thinking about all this
    if (game.flyLine && game.flyLineT > 0) {
      const a = Math.min(1, game.flyLineT / 0.5);
      ctx.save();
      ctx.globalAlpha = a;
      // keep the bubble inside the canvas even at the edges of the sweep
      const bx = Math.max(120, Math.min(VW - 120, p.x));
      drawThought(ctx, bx, p.y - 96, game.flyLine);
      ctx.restore();
    }
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
