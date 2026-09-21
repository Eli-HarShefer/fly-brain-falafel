/**
 * Illustrations for the three circuits, each showing the same wiring doing its
 * natural job on one side and its falafel-stand job on the other.
 *
 * Drawn with the game's own art so the fly in the diagram is the fly on the
 * stand, not a different drawing of one. Static: rendered once per resize.
 */

import { drawFly, drawPest, FOOD, circle, rr } from '../game/art.js';

const INK = 'rgba(179,165,149,0.75)';

function label(ctx, x, y, text, color) {
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.font = '600 11px Heebo, sans-serif';
  ctx.fillStyle = color || INK;
  ctx.fillText(text, x, y);
}

/** The divider between "in nature" and "here". */
function arrow(ctx, x, y, h) {
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(x, y - h / 2); ctx.lineTo(x, y + h / 2); ctx.stroke();
  ctx.setLineDash([]);
}

/** Dashed pursuit line with an arrowhead, the shared visual idiom here. */
function chase(ctx, x1, y1, x2, y2, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.setLineDash([5, 5]);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.setLineDash([]);
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - Math.cos(a - 0.4) * 9, y2 - Math.sin(a - 0.4) * 9);
  ctx.lineTo(x2 - Math.cos(a + 0.4) * 9, y2 - Math.sin(a + 0.4) * 9);
  ctx.closePath(); ctx.fill();
}

const FLY = (ctx, x, y, s, opts = {}) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  drawFly(ctx, 0, 0, { tilt: 0, wing: 0.4, snap: 0, onTarget: false, stress: 0, lunge: 0, ...opts });
  ctx.restore();
};

export const SCENES = {
  /** Courtship: a male locks onto a female and will not let go. */
  courtship(ctx, w, h) {
    const mid = w / 2;
    arrow(ctx, mid, h / 2, h - 34);

    // nature: one fly chasing another
    label(ctx, mid + mid / 2, 16, 'בטבע', 'rgba(134,217,236,0.85)');
    FLY(ctx, mid + mid / 2 + 44, h / 2 + 14, 0.62);
    FLY(ctx, mid + mid / 2 - 34, h / 2 - 6, 0.52);
    chase(ctx, mid + mid / 2 + 22, h / 2 + 4, mid + mid / 2 - 16, h / 2 - 4, 'rgba(134,217,236,0.7)');
    label(ctx, mid + mid / 2, h - 10, 'רודף אחרי נקבה');

    // here: the same lock, onto a tray
    label(ctx, mid / 2, 16, 'אצלנו', 'rgba(245,204,114,0.9)');
    FLY(ctx, mid / 2 + 46, h / 2 + 14, 0.62);
    ctx.save();
    ctx.translate(mid / 2 - 36, h / 2 - 4);
    rr(ctx, -26, -13, 52, 26, 5);
    ctx.fillStyle = '#4a4e53'; ctx.fill();
    FOOD.hummus(ctx, 0, 0, 0.62);
    ctx.restore();
    chase(ctx, mid / 2 + 24, h / 2 + 4, mid / 2 - 10, h / 2 - 4, 'rgba(245,204,114,0.75)');
    label(ctx, mid / 2, h - 10, 'רודף אחרי מגש');
  },

  /** Escape: rapid looming triggers the fastest exit the fly has. */
  escape(ctx, w, h) {
    const mid = w / 2;
    arrow(ctx, mid, h / 2, h - 34);

    // nature: something big closing in fast
    label(ctx, mid + mid / 2, 16, 'בטבע', 'rgba(178,138,232,0.85)');
    const nx = mid + mid / 2;
    ctx.save();
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = 'rgba(224,85,63,' + (0.65 - i * 0.18) + ')';
      ctx.lineWidth = 2;
      circle(ctx, nx + 26, h / 2 - 6, 16 + i * 11);
      ctx.stroke();
    }
    ctx.restore();
    FLY(ctx, nx - 32, h / 2 + 16, 0.58, { lunge: 0.5 });
    chase(ctx, nx + 4, h / 2 + 2, nx - 20, h / 2 + 12, 'rgba(178,138,232,0.75)');
    label(ctx, mid + mid / 2, h - 10, 'צל מתקרב — לברוח');

    // here: the same trigger, aimed outward
    label(ctx, mid / 2, 16, 'אצלנו', 'rgba(245,204,114,0.9)');
    const gx = mid / 2;
    FLY(ctx, gx + 34, h / 2 + 14, 0.62, { lunge: 0.45 });
    drawPest(ctx, gx - 34, h / 2 - 8, 0.9, 1.2, false);
    chase(ctx, gx + 10, h / 2 + 2, gx - 18, h / 2 - 4, 'rgba(178,138,232,0.8)');
    label(ctx, mid / 2, h - 10, 'סוטר לזבוב');
  },

  /** Compass: present, running, and not needed for this job. */
  compass(ctx, w, h) {
    const mid = w / 2;
    arrow(ctx, mid, h / 2, h - 34);

    label(ctx, mid + mid / 2, 16, 'בטבע', 'rgba(143,214,166,0.85)');
    const nx = mid + mid / 2;
    ctx.strokeStyle = 'rgba(143,214,166,0.45)';
    ctx.lineWidth = 1.4;
    circle(ctx, nx - 30, h / 2 - 2, 20); ctx.stroke();
    ctx.strokeStyle = 'rgba(143,214,166,0.9)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(nx - 30, h / 2 - 2);
    ctx.lineTo(nx - 30 + 15, h / 2 - 14);
    ctx.stroke();
    FLY(ctx, nx + 30, h / 2 + 12, 0.58);
    chase(ctx, nx + 12, h / 2, nx - 8, h / 2 - 8, 'rgba(143,214,166,0.6)');
    label(ctx, mid + mid / 2, h - 10, 'עף ישר, חוזר לאוכל');

    label(ctx, mid / 2, 16, 'אצלנו', 'rgba(179,165,149,0.7)');
    ctx.save();
    ctx.globalAlpha = 0.32;
    FLY(ctx, mid / 2, h / 2 + 12, 0.6);
    ctx.restore();
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.font = '600 12px Heebo, sans-serif';
    ctx.fillStyle = 'rgba(179,165,149,0.8)';
    ctx.fillText('רץ, אבל לא צריך אותו', mid / 2, h - 10);
  },
};

export function paintOrigins(root) {
  for (const canvas of root.querySelectorAll('canvas[data-scene]')) {
    const scene = SCENES[canvas.dataset.scene];
    if (!scene) continue;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    const w = Math.max(240, Math.round(r.width));
    const h = 150;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    scene(ctx, w, h);
  }
}
