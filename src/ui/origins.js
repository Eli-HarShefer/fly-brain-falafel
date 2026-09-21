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
function chase(ctx, x1, y1, x2, y2, color, s = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8 * s;
  ctx.setLineDash([5 * s, 5 * s]);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.setLineDash([]);
  const a = Math.atan2(y2 - y1, x2 - x1);
  const head = 9 * s;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - Math.cos(a - 0.4) * head, y2 - Math.sin(a - 0.4) * head);
  ctx.lineTo(x2 - Math.cos(a + 0.4) * head, y2 - Math.sin(a + 0.4) * head);
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

/* ------------------------------------------------------- portrait version --- */

/**
 * The same two illustrations, stacked instead of side by side.
 *
 * On the page they sit in a wide strip and read left-to-right. In a 9:16 frame
 * there is no width to spare and plenty of height, so the filming stage stacks
 * them: nature on top, the falafel stand underneath, same wiring both times.
 * Drawn in CSS pixels at whatever size the frame is, with type sized for a
 * phone rather than for a panel.
 */

function band(ctx, w, y0, hh, side, sideColor, caption) {
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.font = '800 44px Heebo, sans-serif';
  ctx.fillStyle = sideColor;
  ctx.fillText(side, w - 30, y0 + 60);

  ctx.textAlign = 'center';
  ctx.font = '700 38px Heebo, sans-serif';
  ctx.fillStyle = 'rgba(247,242,234,0.9)';
  ctx.fillText(caption, w / 2, y0 + hh - 30);
}

function divider(ctx, w, y) {
  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 10]);
  ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(w - 40, y); ctx.stroke();
  ctx.setLineDash([]);
}

export const STACKED = {
  courtship(ctx, w, h) {
    const hh = h / 2;
    divider(ctx, w, hh);

    // in nature: a male locks onto a female and will not let go
    let cy = hh * 0.56;
    FLY(ctx, w * 0.68, cy + 16, 2.6, { wild: true });
    FLY(ctx, w * 0.34, cy - 10, 2.2, { wild: true });
    chase(ctx, w * 0.60, cy + 2, w * 0.42, cy - 4, 'rgba(134,217,236,0.85)', 3);
    band(ctx, w, 0, hh, 'בטבע', 'rgba(134,217,236,0.95)', 'הזכר ננעל על הנקבה ולא מרפה ממנה');

    // here: the same lock, onto a tray
    cy = hh + hh * 0.56;
    FLY(ctx, w * 0.68, cy + 16, 2.6);
    ctx.save();
    ctx.translate(w * 0.34, cy - 6);
    ctx.scale(2.2, 2.2);
    rr(ctx, -30, -16, 60, 32, 6);
    ctx.fillStyle = '#4a4e53'; ctx.fill();
    FOOD.hummus(ctx, 0, 0, 0.9);
    ctx.restore();
    chase(ctx, w * 0.60, cy + 2, w * 0.43, cy - 4, 'rgba(245,204,114,0.9)', 3);
    band(ctx, w, hh, hh, 'אצלנו', 'rgba(245,204,114,0.95)', 'אותה נעילה בדיוק, על מגש החומוס');
  },

  escape(ctx, w, h) {
    const hh = h / 2;
    divider(ctx, w, hh);

    // in nature: something big closing in fast
    let cy = hh * 0.56;
    ctx.save();
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = 'rgba(224,85,63,' + (0.7 - i * 0.15) + ')';
      ctx.lineWidth = 4;
      circle(ctx, w * 0.30, cy, 34 + i * 26);
      ctx.stroke();
    }
    ctx.restore();
    FLY(ctx, w * 0.70, cy + 14, 2.5, { lunge: 0.55, wild: true });
    chase(ctx, w * 0.44, cy - 2, w * 0.61, cy + 6, 'rgba(178,138,232,0.85)', 3);
    band(ctx, w, 0, hh, 'בטבע', 'rgba(178,138,232,0.95)', 'צל שגדל מהר מול העיניים, והזבוב בורח');

    // here: the same trigger, aimed outward
    cy = hh + hh * 0.56;
    FLY(ctx, w * 0.68, cy + 14, 2.6, { lunge: 0.5 });
    ctx.save();
    ctx.translate(w * 0.33, cy - 6);
    ctx.scale(2.1, 2.1);
    drawPest(ctx, 0, 0, 0.95, 1.2, false);
    ctx.restore();
    chase(ctx, w * 0.59, cy + 2, w * 0.41, cy - 4, 'rgba(178,138,232,0.9)', 3);
    band(ctx, w, hh, hh, 'אצלנו', 'rgba(245,204,114,0.95)', 'אותו רפלקס בדיוק, והזבוב סוטר');
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

/* ----------------------------------------------------- one panel at a time --- */

/**
 * The same four illustrations as quarters of a 2x2, so courtship and escape
 * share one clip instead of two with an identical layout back to back.
 */
function cell(ctx, w, h, side, sideColor, caption, body) {
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.font = '800 30px Heebo, sans-serif';
  ctx.fillStyle = sideColor;
  ctx.fillText(side, w - 20, 44);

  body(h * 0.56);

  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.font = '700 26px Heebo, sans-serif';
  ctx.fillStyle = 'rgba(247,242,234,0.88)';
  ctx.fillText(caption, w / 2, h - 22);
}

export const PANELS = {
  courtshipNature(ctx, w, h) {
    cell(ctx, w, h, 'בטבע', 'rgba(134,217,236,0.95)', 'רודף אחרי נקבה', (cy) => {
      FLY(ctx, w * 0.70, cy + 12, 1.7, { wild: true });
      FLY(ctx, w * 0.30, cy - 8, 1.45, { wild: true });
      chase(ctx, w * 0.58, cy + 2, w * 0.42, cy - 4, 'rgba(134,217,236,0.85)', 2);
    });
  },

  courtshipOurs(ctx, w, h) {
    cell(ctx, w, h, 'אצלנו', 'rgba(245,204,114,0.95)', 'רודף אחרי מגש', (cy) => {
      FLY(ctx, w * 0.70, cy + 12, 1.7);
      ctx.save();
      ctx.translate(w * 0.30, cy - 4);
      ctx.scale(1.5, 1.5);
      rr(ctx, -30, -16, 60, 32, 6);
      ctx.fillStyle = '#4a4e53'; ctx.fill();
      FOOD.hummus(ctx, 0, 0, 0.9);
      ctx.restore();
      chase(ctx, w * 0.58, cy + 2, w * 0.43, cy - 4, 'rgba(245,204,114,0.9)', 2);
    });
  },

  escapeNature(ctx, w, h) {
    cell(ctx, w, h, 'בטבע', 'rgba(178,138,232,0.95)', 'צל מתקרב, בורח', (cy) => {
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = 'rgba(224,85,63,' + (0.7 - i * 0.15) + ')';
        ctx.lineWidth = 3;
        circle(ctx, w * 0.28, cy, 20 + i * 15);
        ctx.stroke();
      }
      FLY(ctx, w * 0.72, cy + 10, 1.65, { lunge: 0.55, wild: true });
      chase(ctx, w * 0.44, cy - 2, w * 0.62, cy + 6, 'rgba(178,138,232,0.85)', 2);
    });
  },

  escapeOurs(ctx, w, h) {
    cell(ctx, w, h, 'אצלנו', 'rgba(245,204,114,0.95)', 'סוטר לזבוב', (cy) => {
      FLY(ctx, w * 0.70, cy + 10, 1.7, { lunge: 0.5 });
      ctx.save();
      ctx.translate(w * 0.30, cy - 4);
      ctx.scale(1.5, 1.5);
      drawPest(ctx, 0, 0, 0.95, 1.2, false);
      ctx.restore();
      chase(ctx, w * 0.58, cy + 2, w * 0.41, cy - 4, 'rgba(178,138,232,0.9)', 2);
    });
  },
};
