/**
 * Lesion and display controls.
 *
 * The lesions are the point: each one predicts a specific outcome, and watching
 * the prediction come true is the evidence that the wiring is doing the work
 * rather than decorating it. tools/closedloop.mjs measures the same thing
 * headlessly.
 *
 * The effects are graded, and the labels say which. tools/survival.mjs plays
 * whole games to their end: intact lasts 443 s, scrambled and DNa02-silenced
 * die at 33 s, and LPLC2-silenced still plays but loses 35% of its survival to
 * spoiled trays. Silencing the central complex costs nothing measurable at all
 * on this task - tools/cxsweep.mjs shows the pursuit pathway solves it alone.
 *
 * That last one is kept and labelled as the negative result it is. A panel of
 * lesions that only ever confirms importance is not a set of controls.
 */

export const LESIONS = [
  {
    id: 'scramble',
    label: 'ערבוב חיווט',
    desc: 'אותה כמות קשרים, יעדים אקראיים',
    apply: (brain) => brain.setScrambled(true),
    clear: (brain) => brain.setScrambled(false),
  },
  {
    id: 'dna02',
    label: 'השתקת DNa02',
    desc: 'ההיגוי נשבר, התפיסה נשארת',
    groups: ['DNa02_L', 'DNa02_R'],
  },
  {
    id: 'aotu019',
    label: 'השתקת AOTU019',
    desc: 'מכוון יפה אבל לא תופס',
    groups: ['AOTU019_L', 'AOTU019_R'],
  },
  {
    id: 'lplc2',
    label: 'השתקת LPLC2',
    desc: 'לא סוטר — מגשים מתקלקלים, שורד 35% פחות',
    groups: ['LPLC2_L', 'LPLC2_R'],
  },
  {
    id: 'cx',
    label: 'השתקת הקומפלקס המרכזי',
    desc: 'לא פוגע — מעגל המרדף מספיק',
    groups: ['EPG', 'Delta7', 'PFL3_L', 'PFL3_R', 'PFL2_L', 'PFL2_R', 'ER4d_L', 'ER4d_R'],
  },
];

function toggle({ id, label, desc }, onChange) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ctl';
  b.setAttribute('aria-pressed', 'false');
  b.dataset.id = id;
  b.innerHTML =
    '<span class="ctl__box" aria-hidden="true"></span>' +
    '<span class="ctl__text"><span>' + label + '</span>' +
    '<span class="ctl__desc">' + desc + '</span></span>';
  b.addEventListener('click', () => {
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(on));
    onChange(on);
  });
  return b;
}

export function buildControls(root, { brain, meta, onSpeed, onEdges, onCloud, onBody, onLesion }) {
  root.innerHTML = '';

  for (const l of LESIONS) {
    root.appendChild(toggle(l, (on) => {
      if (l.apply) {
        on ? l.apply(brain) : l.clear(brain);
      } else {
        for (const g of l.groups) {
          const list = meta.groups[g];
          if (list) brain.silenceGroup(list, on);
        }
      }
      onLesion(l, on);
    }));
  }

  const speed = document.createElement('div');
  speed.className = 'ctl-range';
  speed.innerHTML =
    '<label for="rng-speed">מהירות מוח<output id="out-speed">1.0×</output></label>' +
    '<input id="rng-speed" type="range" min="0.25" max="3" step="0.05" value="1" />';
  const rng = speed.querySelector('input');
  const out = speed.querySelector('output');
  rng.addEventListener('input', () => {
    const v = parseFloat(rng.value);
    out.textContent = v.toFixed(2).replace(/0$/, '') + '×';
    onSpeed(v);
  });
  root.appendChild(speed);

  const view = document.createElement('div');
  view.className = 'ctl-range';
  view.innerHTML = '<label>תצוגת מוח</label>';
  root.appendChild(view);

  const mkView = (label, initial, cb) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ctl';
    b.setAttribute('aria-pressed', String(initial));
    b.innerHTML =
      '<span class="ctl__box" aria-hidden="true"></span>' +
      '<span class="ctl__text"><span>' + label + '</span></span>';
    b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      cb(on);
    });
    return b;
  };
  root.appendChild(mkView('גוף הזבוב', true, onBody));
  root.appendChild(mkView('ענן 139K נוירונים', true, onCloud));
  root.appendChild(mkView('קשתות המעגל', true, onEdges));

  return {
    reset() {
      for (const b of root.querySelectorAll('.ctl[aria-pressed="true"]')) {
        if (b.dataset.id) b.click();
      }
    },
  };
}
