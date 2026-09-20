/**
 * Original vector art for the falafel stand, drawn straight to canvas 2D.
 *
 * Everything is built from solid geometric primitives with two-tone shading and
 * a single highlight. No sketch filters, no outline wobble - the stand should
 * read as a confident flat illustration lit by a heat lamp, not a doodle.
 */

export const C = {
  lamp: '#ffb765',
  counter: '#3a2b20',
  counterTop: '#503a2a',
  counterEdge: '#241a13',
  wall: '#1b1410',
  wallLit: '#2c211a',
  steel: '#6d7278',
  steelDark: '#4a4e53',
  steelLite: '#9aa0a6',

  pita: '#e9c99b',
  pitaDark: '#c9a674',
  pitaSeam: '#a8855a',

  hummus: '#f2dcb0',
  hummusDark: '#d9bd85',
  oil: '#c9a227',

  ball: '#937c40',
  ballLite: '#b09a55',
  ballDark: '#6b5a2b',

  saladG: '#79c064',
  saladR: '#d9584a',
  saladP: '#bcd98a',

  chips: '#eeb452',
  chipsDark: '#c98f34',

  pest: '#17120f',
  pestWing: 'rgba(210,226,235,0.5)',

  ink: '#f7f2ea',
  inkDim: '#b3a595',
  ok: '#77c98e',
  warn: '#e8b45c',
  danger: '#e0553f',
};

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

/** Warm rim light used on most edges so the stand feels lit from above. */
function rim(ctx, drawPath, color, width = 1.5) {
  drawPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

export function drawPita(ctx, x, y, s = 1, open = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  // body
  ctx.beginPath();
  ctx.ellipse(0, 0, 22, 19, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = C.pita;
  ctx.fill();
  // shaded underside
  ctx.beginPath();
  ctx.ellipse(0, 0, 22, 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = C.pitaDark;
  ctx.fill();
  if (open) {
    ctx.beginPath();
    ctx.ellipse(0, -1, 16, 3.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = C.pitaSeam;
    ctx.fill();
  }
  // highlight
  ctx.beginPath();
  ctx.ellipse(-7, -9, 7, 3.6, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fill();
  ctx.restore();
}

export function drawHummus(ctx, x, y, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  circle(ctx, 0, 0, 15);
  ctx.fillStyle = C.hummus;
  ctx.fill();
  // spiral groove
  ctx.beginPath();
  for (let a = 0; a < Math.PI * 2.6; a += 0.14) {
    const r = 3 + a * 1.55;
    const px = Math.cos(a) * r, py = Math.sin(a) * r * 0.82;
    if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = C.hummusDark;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.stroke();
  circle(ctx, 2, 1, 3);
  ctx.fillStyle = C.oil;
  ctx.fill();
  ctx.restore();
}

export function drawBall(ctx, x, y, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  circle(ctx, 0, 0, 11);
  ctx.fillStyle = C.ball;
  ctx.fill();
  // crust speckle
  ctx.fillStyle = C.ballDark;
  const pts = [[-5, -3], [3, -5], [5, 2], [-2, 5], [-6, 3], [1, 0]];
  for (const [px, py] of pts) { circle(ctx, px, py, 1.5); ctx.fill(); }
  circle(ctx, -4, -4.5, 3.4);
  ctx.fillStyle = C.ballLite;
  ctx.fill();
  ctx.restore();
}

export function drawSalad(ctx, x, y, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  const bits = [
    [-8, 2, C.saladG], [-2, -4, C.saladR], [4, 1, C.saladG],
    [9, -3, C.saladP], [0, 5, C.saladG], [-6, -5, C.saladP], [7, 6, C.saladR],
  ];
  for (const [px, py, col] of bits) {
    ctx.fillStyle = col;
    rr(ctx, px - 3.2, py - 3.2, 6.4, 6.4, 1.6);
    ctx.fill();
  }
  ctx.restore();
}

export function drawChips(ctx, x, y, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  const sticks = [[-8, 3, -0.4], [-3, -2, 0.18], [2, 2, -0.15], [7, -1, 0.45], [0, 6, 0.05]];
  for (const [px, py, rot] of sticks) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    ctx.fillStyle = C.chips;
    rr(ctx, -2.4, -8, 4.8, 16, 2);
    ctx.fill();
    ctx.fillStyle = C.chipsDark;
    rr(ctx, -2.4, 3, 4.8, 5, 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

export const FOOD = {
  hummus: drawHummus,
  balls: drawBall,
  salad: drawSalad,
  chips: drawChips,
};

/** A steel tray holding one ingredient, with a fill level and spoil state. */
export function drawTray(ctx, x, y, id, level, spoiled, glow) {
  const w = 86, h = 44;
  ctx.save();
  ctx.translate(x, y);

  if (glow > 0.01) {
    ctx.save();
    ctx.shadowColor = 'rgba(255,183,101,' + (0.85 * glow).toFixed(3) + ')';
    ctx.shadowBlur = 26 * glow;
    rr(ctx, -w / 2, -h / 2, w, h, 8);
    ctx.fillStyle = 'rgba(255,183,101,0.16)';
    ctx.fill();
    ctx.restore();
  }

  // pan
  rr(ctx, -w / 2, -h / 2, w, h, 8);
  ctx.fillStyle = C.steelDark;
  ctx.fill();
  rr(ctx, -w / 2 + 3, -h / 2 + 3, w - 6, h - 8, 6);
  ctx.fillStyle = spoiled ? '#4a3a33' : C.steel;
  ctx.fill();

  // contents scaled by fill level
  const n = Math.max(0, Math.min(4, Math.round(level / 2)));
  const draw = FOOD[id];
  if (draw && !spoiled) {
    const spots = [[-22, 2], [-7, -4], [8, 3], [23, -2]];
    for (let i = 0; i < n; i++) draw(ctx, spots[i][0], spots[i][1], 0.82);
  }
  if (spoiled) {
    ctx.fillStyle = 'rgba(120,90,70,0.55)';
    rr(ctx, -w / 2 + 3, -h / 2 + 3, w - 6, h - 8, 6);
    ctx.fill();
  }

  // rim light
  rim(ctx, () => rr(ctx, -w / 2, -h / 2, w, h, 8), 'rgba(255,183,101,0.22)', 1.2);
  ctx.restore();
}

/** Tongs. Opens on approach, snaps shut on a grab. */
export function drawHand(ctx, x, y, angle, snap, active) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const spread = 0.34 - snap * 0.3;

  ctx.strokeStyle = active ? C.steelLite : C.steel;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.quadraticCurveTo(sgn * 11, -8, sgn * Math.sin(spread) * 21, 15);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, -42);
  ctx.lineTo(0, -28);
  ctx.lineWidth = 7;
  ctx.strokeStyle = C.steelDark;
  ctx.stroke();

  if (snap > 0.02) {
    ctx.save();
    ctx.globalAlpha = snap;
    circle(ctx, 0, 14, 16 + snap * 10);
    ctx.strokeStyle = 'rgba(255,183,101,0.75)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

const INK = '#1b1410';

function hair(ctx, style, color) {
  ctx.fillStyle = color;
  switch (style) {
    case 'swept': // volume swept back off the forehead
      ctx.beginPath();
      ctx.moveTo(-15, -16);
      ctx.quadraticCurveTo(-13, -30, 2, -27);
      ctx.quadraticCurveTo(16, -25, 15, -13);
      ctx.quadraticCurveTo(9, -22, -3, -21);
      ctx.quadraticCurveTo(-11, -21, -15, -16);
      ctx.closePath(); ctx.fill();
      break;
    case 'short':
      ctx.beginPath();
      ctx.arc(0, -13, 15.2, Math.PI * 1.06, Math.PI * 1.94);
      ctx.quadraticCurveTo(0, -20, 14.6, -16);
      ctx.closePath(); ctx.fill();
      break;
    case 'side': // receding, parted
      ctx.beginPath();
      ctx.arc(0, -13, 15.2, Math.PI * 1.1, Math.PI * 1.75);
      ctx.quadraticCurveTo(-2, -18, -14, -18);
      ctx.closePath(); ctx.fill();
      break;
    case 'long':
      ctx.beginPath();
      ctx.moveTo(-15, -14);
      ctx.quadraticCurveTo(-19, -30, 0, -28);
      ctx.quadraticCurveTo(19, -30, 15, -14);
      ctx.lineTo(18, 8);
      ctx.quadraticCurveTo(12, 2, 11, -12);
      ctx.lineTo(-11, -12);
      ctx.quadraticCurveTo(-12, 2, -18, 8);
      ctx.closePath(); ctx.fill();
      break;
    case 'bald':
      ctx.beginPath();
      ctx.arc(0, -13, 15.2, Math.PI * 1.18, Math.PI * 1.45);
      ctx.lineTo(-7, -16);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -13, 15.2, Math.PI * 1.60, Math.PI * 1.86);
      ctx.lineTo(9, -16);
      ctx.closePath(); ctx.fill();
      break;
    default: break;
  }
}

function headwear(ctx, kind) {
  switch (kind) {
    case 'kippah-black':
      ctx.fillStyle = '#15120f';
      ctx.beginPath(); ctx.ellipse(1, -24, 9.5, 4.6, -0.08, 0, Math.PI * 2); ctx.fill();
      break;
    case 'kippah-knit':
      ctx.fillStyle = '#5d6b4a';
      ctx.beginPath(); ctx.ellipse(1, -24, 9.8, 4.8, -0.08, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#7d8c64'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(1, -24, 5.6, 2.6, -0.08, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'hat': // wide black brim
      ctx.fillStyle = '#12100e';
      ctx.beginPath(); ctx.ellipse(0, -22, 21, 5.4, 0, 0, Math.PI * 2); ctx.fill();
      rr(ctx, -11, -35, 22, 14, 4); ctx.fill();
      ctx.fillStyle = '#242020';
      rr(ctx, -11, -26, 22, 4, 2); ctx.fill();
      break;
    case 'scarf':
      ctx.fillStyle = '#7a5f74';
      ctx.beginPath();
      ctx.moveTo(-15, -10);
      ctx.quadraticCurveTo(-17, -30, 0, -29);
      ctx.quadraticCurveTo(17, -30, 15, -10);
      ctx.quadraticCurveTo(10, -16, 0, -16);
      ctx.quadraticCurveTo(-10, -16, -15, -10);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-15, -11);
      ctx.quadraticCurveTo(-20, 6, -12, 14);
      ctx.quadraticCurveTo(-8, 2, -9, -10);
      ctx.closePath(); ctx.fill();
      break;
    default: break;
  }
}

function beard(ctx, kind) {
  const col = kind === 'full-grey' ? '#9c968c' : '#241c16';
  ctx.fillStyle = col;
  switch (kind) {
    case 'full':
    case 'full-grey':
      ctx.beginPath();
      ctx.moveTo(-13, -11);
      ctx.quadraticCurveTo(-13, 8, 0, 9);
      ctx.quadraticCurveTo(13, 8, 13, -11);
      ctx.quadraticCurveTo(8, -4, 0, -4);
      ctx.quadraticCurveTo(-8, -4, -13, -11);
      ctx.closePath(); ctx.fill();
      break;
    case 'goatee':
      ctx.beginPath();
      ctx.moveTo(-6, -3);
      ctx.quadraticCurveTo(-6, 6, 0, 7);
      ctx.quadraticCurveTo(6, 6, 6, -3);
      ctx.quadraticCurveTo(0, 0, -6, -3);
      ctx.closePath(); ctx.fill();
      break;
    case 'moustache':
      ctx.beginPath();
      ctx.ellipse(0, -5, 7, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'stubble':
      ctx.globalAlpha = 0.32;
      ctx.beginPath();
      ctx.moveTo(-12, -9);
      ctx.quadraticCurveTo(-12, 5, 0, 6);
      ctx.quadraticCurveTo(12, 5, 12, -9);
      ctx.quadraticCurveTo(0, -2, -12, -9);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      break;
    default: break;
  }
}

function glasses(ctx, kind) {
  if (!kind) return;
  ctx.strokeStyle = '#2a2622';
  ctx.lineWidth = 1.5;
  if (kind === 'round') {
    circle(ctx, -6, -14, 5.2); ctx.stroke();
    circle(ctx, 6, -14, 5.2); ctx.stroke();
  } else {
    rr(ctx, -11.4, -18, 10.8, 8, 2); ctx.stroke();
    rr(ctx, 0.6, -18, 10.8, 8, 2); ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-0.8, -14); ctx.lineTo(0.8, -14);
  ctx.stroke();
}

/**
 * A customer. `mk` is an entry from mks.js; expression is driven by stress.
 */
export function drawCustomer(ctx, x, y, stress, mk, seed, t) {
  ctx.save();
  ctx.translate(x, y);
  const bob = Math.sin(t * 2 + seed) * 1.6;
  const jitter = stress > 0.8 ? Math.sin(t * 26 + seed) * (stress - 0.8) * 7 : 0;
  ctx.translate(jitter, bob);

  // shoulders and suit
  ctx.beginPath();
  ctx.moveTo(-21, 34);
  ctx.quadraticCurveTo(-19, 3, 0, 3);
  ctx.quadraticCurveTo(19, 3, 21, 34);
  ctx.closePath();
  ctx.fillStyle = mk.suit;
  ctx.fill();

  // shirt wedge + tie
  ctx.fillStyle = '#e9e4da';
  ctx.beginPath();
  ctx.moveTo(-6, 4); ctx.lineTo(6, 4); ctx.lineTo(0, 20);
  ctx.closePath(); ctx.fill();
  if (mk.tie) {
    ctx.fillStyle = mk.tie;
    ctx.beginPath();
    ctx.moveTo(-2.6, 6); ctx.lineTo(2.6, 6); ctx.lineTo(1.6, 22);
    ctx.lineTo(0, 25); ctx.lineTo(-1.6, 22);
    ctx.closePath(); ctx.fill();
  }

  // head
  circle(ctx, 0, -12, 15);
  ctx.fillStyle = mk.skin;
  ctx.fill();

  if (stress > 0.4) {
    ctx.globalAlpha = (stress - 0.4) / 0.6 * 0.72;
    circle(ctx, 0, -12, 15);
    ctx.fillStyle = '#d9583f';
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  beard(ctx, mk.beard);
  hair(ctx, mk.hair.style, mk.hair.color);
  headwear(ctx, mk.head);

  // eyes
  ctx.fillStyle = INK;
  const eo = stress > 0.6 ? 1.4 : 0;
  circle(ctx, -6, -14 + eo, 2.1); ctx.fill();
  circle(ctx, 6, -14 + eo, 2.1); ctx.fill();
  glasses(ctx, mk.glasses);

  // brows tilt in as patience runs out
  if (stress > 0.3) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const tilt = (stress - 0.3) * 7;
    ctx.beginPath();
    ctx.moveTo(-10, -21 - tilt * 0.25); ctx.lineTo(-2.5, -19 + tilt * 0.4);
    ctx.moveTo(10, -21 - tilt * 0.25); ctx.lineTo(2.5, -19 + tilt * 0.4);
    ctx.stroke();
  }

  // mouth, unless a full beard covers it
  if (mk.beard !== 'full' && mk.beard !== 'full-grey') {
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    if (stress < 0.45) ctx.arc(0, -6, 5.2, 0.25, Math.PI - 0.25);
    else ctx.arc(0, -1, 5.2, Math.PI + 0.3, -0.3);
    ctx.stroke();
  }

  if (stress > 0.78) {
    ctx.globalAlpha = (stress - 0.78) / 0.22;
    ctx.strokeStyle = 'rgba(232,204,194,0.85)';
    ctx.lineWidth = 2.2;
    for (const sx of [-15, 15]) {
      ctx.beginPath();
      const w = Math.sin(t * 9 + sx) * 2.6;
      ctx.moveTo(sx, -24);
      ctx.quadraticCurveTo(sx + w, -33, sx - w, -42);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/** Name plate under a customer. */
export function drawNameplate(ctx, x, y, name, party, dim) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.direction = 'rtl';
  ctx.font = '700 12px Heebo, sans-serif';
  ctx.fillStyle = dim ? 'rgba(179,165,149,0.75)' : C.ink;
  ctx.fillText(name, x, y);
  ctx.font = '400 9.5px Heebo, sans-serif';
  ctx.fillStyle = 'rgba(179,165,149,0.7)';
  ctx.fillText(party, x, y + 12);
  ctx.restore();
}

/** Speech bubble for the grumble line. */
export function drawGrumble(ctx, x, y, text) {
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.font = '500 11px Heebo, sans-serif';
  const w = Math.max(56, ctx.measureText(text).width + 20);
  rr(ctx, x - w / 2, y - 26, w, 22, 8);
  ctx.fillStyle = 'rgba(247,242,234,0.94)';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y - 5); ctx.lineTo(x, y + 2);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2a211a';
  ctx.fillText(text, x, y - 11);
  ctx.restore();
}

/** Patience meter above a customer. */
export function drawStress(ctx, x, y, stress) {
  const w = 44, h = 6;
  rr(ctx, x - w / 2, y, w, h, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fill();
  const col = stress > 0.78 ? C.danger : stress > 0.5 ? C.warn : C.ok;
  rr(ctx, x - w / 2, y, Math.max(2, w * stress), h, 3);
  ctx.fillStyle = col;
  ctx.fill();
}

/**
 * Pest fly. `approach` 0..1 drives the looming size the circuit responds to.
 * `fade` > 0 means it has been swatted: it tumbles and drops as it disappears.
 */
export function drawPest(ctx, x, y, approach, wobble, landed, fade = 0) {
  const dying = fade > 0;
  const k = dying ? Math.max(0, Math.min(1, fade / 0.55)) : 1;
  const s = (0.45 + approach * 0.95) * (dying ? 0.6 + k * 0.4 : 1);
  ctx.save();
  ctx.translate(x, dying ? y + (1 - k) * 42 : y);
  if (dying) ctx.globalAlpha = k;
  ctx.scale(s, s);
  ctx.rotate(dying ? (1 - k) * 4.2 : Math.sin(wobble) * 0.22);

  // wing blur
  ctx.fillStyle = C.pestWing;
  const flap = Math.abs(Math.sin(wobble * 3)) * 0.6 + 0.4;
  ctx.save();
  ctx.scale(1, flap);
  ctx.beginPath(); ctx.ellipse(-5, -7, 8, 4.4, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(5, -7, 8, 4.4, 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  ctx.fillStyle = C.pest;
  ctx.beginPath(); ctx.ellipse(0, 0, 6.2, 8.4, 0, 0, Math.PI * 2); ctx.fill();
  circle(ctx, 0, -8, 4.4); ctx.fill();
  ctx.fillStyle = '#c0392b';
  circle(ctx, -2, -9.5, 1.7); ctx.fill();
  circle(ctx, 2, -9.5, 1.7); ctx.fill();

  if (!landed && !dying) {
    ctx.strokeStyle = 'rgba(224,85,63,0.35)';
    ctx.lineWidth = 1.4;
    circle(ctx, 0, 0, 13 + approach * 9);
    ctx.stroke();
  }
  ctx.restore();
}

export { rr };
