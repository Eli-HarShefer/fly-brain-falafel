/**
 * The two closing frames: how big this actually is, and what it is for.
 *
 * Drawn in CSS pixels at whatever size the frame is, like the origin
 * illustrations. Nothing here is a chart with a hidden log axis - the squares
 * are true to area, which is the whole point: at the scale of a human brain,
 * the only brain we have ever mapped completely is a dot.
 *
 * Numbers:
 *   fly    139,255   the count in our own extraction, FlyWire FAFB v783
 *   mouse  ~70 million    whole brain, the target the field is working towards
 *   human  ~86 billion
 */

const INK = 'rgba(247,242,234,0.94)';
const MUTED = 'rgba(179,165,149,0.8)';
const WARN = 'rgba(245,204,114,0.98)';

const FLY_N = 139255;
const MOUSE_N = 70e6;
const HUMAN_N = 86e9;

function line(ctx, x1, y1, x2, y2, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 7]);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.setLineDash([]);
}

function text(ctx, x, y, s, px, color, weight = 700, align = 'right') {
  ctx.direction = 'rtl';
  ctx.textAlign = align;
  ctx.font = weight + ' ' + px + 'px Heebo, sans-serif';
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

/**
 * One dot is one whole fly brain.
 *
 * Nesting squares by area is true but useless: at human scale the fly is a
 * sub-pixel speck and the mouse is a smudge, so nothing reads. Counting in
 * fly-brains instead keeps it honest and makes it land - a mouse brain is 503
 * of these, and exactly one of them has ever been finished.
 */
export function drawScale(ctx, w, h) {
  const units = Math.round(MOUSE_N / FLY_N);   // 503
  const cols = 26;
  const rows = Math.ceil(units / cols);
  const cell = Math.min(w / cols, (h - 230) / rows);
  const gx = (w - cols * cell) / 2;
  const gy = 118;
  const r = cell * 0.29;
  // the finished one sits in the middle of the field, where the eye lands
  const lit = Math.floor(rows / 2) * cols + Math.floor(cols / 2);

  text(ctx, w / 2, 40, 'כל נקודה כאן היא מוח שלם של זבוב', 36, MUTED, 700, 'center');
  text(ctx, w / 2, 84, 'אחת מהן, הצהובה, כבר הושלמה', 36, WARN, 800, 'center');

  for (let i = 0; i < units; i++) {
    const cxx = gx + (i % cols + 0.5) * cell;
    const cyy = gy + (Math.floor(i / cols) + 0.5) * cell;
    ctx.beginPath();
    ctx.arc(cxx, cyy, r, 0, Math.PI * 2);
    ctx.fillStyle = i === lit ? WARN : 'rgba(122,190,245,0.38)';
    ctx.fill();
    if (i === lit) {
      ctx.beginPath();
      ctx.arc(cxx, cyy, r + 13, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(245,204,114,0.85)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  const by = gy + rows * cell + 56;
  text(ctx, w / 2, by, 'מוח של עכבר = ' + units + ' נקודות כאלה', 40, INK, 800, 'center');
  text(ctx, w / 2, by + 48, 'מוח אנושי = 617,000 נקודות כאלה',
    36, 'rgba(122,190,245,0.95)', 700, 'center');
}

/** What a full wiring diagram is actually good for. */
const USES = [
  ['לראות איפה מחלה שוברת מעגל',
   'דיכאון, פרקינסון, אפילפסיה. היום מטפלים בהם בלי לדעת איזה חיבור בדיוק השתבש.'],
  ['לבנות בינה מלאכותית על ארכיטקטורה אמיתית',
   'במקום לנחש מבנה רשת, אפשר להעתיק אחד שהאבולוציה בדקה מאתיים מיליון שנה.'],
  ['לענות סוף סוף איך מוח מייצר התנהגות',
   'לקחת פעולה אחת ולעקוב אחריה אחורה, נוירון אחרי נוירון, עד החיווט עצמו.'],
];

export function drawFuture(ctx, w, h) {
  const gap = 22, lh = 40, px = 32;
  const pad = 30;
  ctx.font = '600 ' + px + 'px Heebo, sans-serif';
  const cards = USES.map(([head, body]) => {
    const lines = wrapLines(ctx, body, w - 76);
    return { head, lines, h: 92 + lines.length * lh + pad };
  });
  const total = cards.reduce((a, c) => a + c.h, 0) + gap * (cards.length - 1);
  let y = Math.max(0, (h - total) / 2);

  cards.forEach((c, i) => {
    ctx.beginPath();
    ctx.roundRect(0, y, w, c.h, 22);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // a numbered dot so the three read as a list, not a wall
    ctx.beginPath();
    ctx.arc(w - 48, y + 50, 23, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(245,204,114,0.16)';
    ctx.fill();
    text(ctx, w - 48, y + 62, String(i + 1), 28, WARN, 800, 'center');

    text(ctx, w - 90, y + 62, c.head, 38, INK, 800);
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.font = '600 ' + px + 'px Heebo, sans-serif';
    ctx.fillStyle = MUTED;
    c.lines.forEach((ln, k) => ctx.fillText(ln, w - 32, y + 112 + k * lh));
    y += c.h + gap;
  });
}

/** Minimal RTL word wrap; the caller has already set the font. */
function wrapLines(ctx, s, maxW) {
  const out = [];
  let cur = '';
  for (const word of s.split(' ')) {
    const test = cur ? cur + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && cur) { out.push(cur); cur = word; }
    else cur = test;
  }
  if (cur) out.push(cur);
  return out;
}

/* ------------------------------------------------------ the research itself --- */

/**
 * What it actually took, in numbers that are all checkable.
 *
 *   21 million    raw ssTEM camera images of one brain, and 40 teravoxels of
 *                 tissue, from the flood-filling-network reconstruction paper
 *   Google        flood-filling networks: convolutional nets that trace each
 *                 fibre outward from a seed point, slice after slice
 *   287 / 76      researchers and labs in the FlyWire Consortium, plus public
 *                 volunteers, over 33 person-years of manual proofreading
 *   139,255       neurons and ~54.5 million synapses in the finished map
 */
const EFFORT = [
  ['21 מיליון תמונות', 'מוח אחד של זבוב, מצולם פרוסה אחרי פרוסה במיקרוסקופ אלקטרונים.'],
  ['רשת נוירונים של גוגל', 'צבעה כל סיב בנפרד לאורך אלפי הפרוסות. בלי זה אי אפשר היה לגמור את זה בכלל.'],
  ['33 שנות אדם', '287 חוקרים מ-76 מעבדות, ומתנדבים מכל העולם, תיקנו ביד את מה שהמחשב פספס.'],
];

export function drawEffort(ctx, w, h) {
  const gap = 22, lh = 40, px = 32;
  ctx.font = '600 ' + px + 'px Heebo, sans-serif';
  const cards = EFFORT.map(([head, body]) => {
    const lines = wrapLines(ctx, body, w - 76);
    return { head, lines, h: 92 + lines.length * lh + 30 };
  });
  const total = cards.reduce((a, c) => a + c.h, 0) + gap * (cards.length - 1);
  let y = Math.max(0, (h - total) / 2);

  cards.forEach((c) => {
    ctx.beginPath();
    ctx.roundRect(0, y, w, c.h, 22);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.lineWidth = 2;
    ctx.stroke();

    text(ctx, w - 32, y + 62, c.head, 42, WARN, 800);
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.font = '600 ' + px + 'px Heebo, sans-serif';
    ctx.fillStyle = MUTED;
    c.lines.forEach((ln, k) => ctx.fillText(ln, w - 32, y + 112 + k * lh));
    y += c.h + gap;
  });
}

/* -------------------------------------------------------------- quotations --- */

/**
 * A researcher's own words.
 *
 * Both lines are kept: the Hebrew because the video is in Hebrew, and the
 * English underneath because that is what the person actually said and a
 * translated quote with no original is not a quote. Source and speaker are on
 * screen, not in a description.
 */
export function drawQuote(ctx, w, h, q) {
  const he = wrapFont(ctx, q.he, w - 60, '800 52px Heebo, sans-serif');
  const en = wrapFont(ctx, q.en, w - 90, 'italic 500 30px Heebo, sans-serif');
  const block = he.length * 70 + 26 + en.length * 42 + 108;
  let y = Math.max(70, (h - block) / 2);

  // an opening mark, sized like a pull quote in print
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.font = '900 130px Heebo, sans-serif';
  ctx.fillStyle = 'rgba(245,204,114,0.22)';
  ctx.fillText('”', w - 10, y + 24);

  y += 58;
  ctx.font = '800 52px Heebo, sans-serif';
  ctx.fillStyle = INK;
  for (const line of he) { ctx.fillText(line, w - 30, y); y += 70; }

  y += 26;
  ctx.direction = 'ltr';
  ctx.textAlign = 'right';
  ctx.font = 'italic 500 30px Heebo, sans-serif';
  ctx.fillStyle = 'rgba(179,165,149,0.72)';
  for (const line of en) { ctx.fillText(line, w - 30, y); y += 42; }

  y += 46;
  ctx.beginPath();
  ctx.moveTo(w - 30, y - 22); ctx.lineTo(w - 120, y - 22);
  ctx.strokeStyle = 'rgba(245,204,114,0.5)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.direction = 'rtl';
  ctx.font = '800 36px Heebo, sans-serif';
  ctx.fillStyle = WARN;
  ctx.fillText(q.who, w - 30, y + 22);
  ctx.font = '600 28px Heebo, sans-serif';
  ctx.fillStyle = MUTED;
  ctx.fillText(q.role, w - 30, y + 64);
}

/** Wrap against a font the caller names, without disturbing the caller's state. */
function wrapFont(ctx, s, maxW, font) {
  ctx.save();
  ctx.font = font;
  const out = wrapLines(ctx, s, maxW);
  ctx.restore();
  return out;
}

export const QUOTES = {
  murthy: {
    he: 'אין שום קונקטום מלא אחר של מוח, לשום חיה בוגרת במורכבות הזאת.',
    en: '"There is no other full brain connectome for an adult animal of this complexity."',
    who: 'מאלה מרת׳י',
    role: 'מנהלת מכון מדעי המוח של פרינסטון · הודעה לעיתונות, 2024',
  },
  seung: {
    he: 'כל מוח שאנחנו באמת מבינים מלמד אותנו משהו על כל המוחות.',
    en: '"Any brain that we truly understand tells us something about all brains."',
    who: 'סבסטיאן סונג',
    role: 'פרופסור למדעי המוח, פרינסטון · הודעה לעיתונות, 2024',
  },
};
