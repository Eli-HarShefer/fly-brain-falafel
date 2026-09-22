/**
 * Filming stage.
 *
 * One idea per frame, portrait, with big type and no dashboard. It runs the
 * real components against the real connectome - nothing here is a mock-up.
 *
 * Two things matter for the footage:
 *
 *  - Time is driven, not observed. window.S.tick(dtMs) advances the world by
 *    exactly dtMs, so the capture can feed 11 ms per frame while recording at
 *    30 fps and get genuine third-speed motion, every frame freshly computed.
 *    The fly at real speed serves a dish every two seconds, which reads as
 *    frantic; slowed down you can follow what it is doing.
 *
 *  - Order builds understanding. The stand comes before the eye, then both
 *    stacked so the two points of view line up; the retinotopic bump comes
 *    before the circuit that reads it, and the circuit scene keeps the eye and
 *    the stand along the bottom so you never lose the thread.
 *
 * ?scene=<id>   pick the scene       ?safe=1   show the safe-area guides
 */
import { FlyBrain, parseCircuit } from './lif.js';
import { FlyController } from './controller.js';
import { FalafelGame, STATIONS } from './game/orders.js';
import { StandRenderer } from './game/render.js';
import { BrainView, parseCloud } from './brain3d.js';
import { PathwayView } from './ui/pathway.js';
import { VisionView } from './ui/vision.js';
import { EyeView } from './ui/eye.js';
import { STACKED as ORIGIN_STACKED, PANELS } from './ui/origins.js';
import { drawScale, drawFuture, drawEffort, drawQuote, QUOTES } from './ui/scale.js';
import { PhotoView, loadImage } from './ui/photo.js';
import { FOOD } from './game/art.js';

/** Where the connectome files sit, relative to wherever the page is mounted. */
const DATA = import.meta.env.BASE_URL + 'data/';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

const SCENES = {
  brain: {
    title: 'זה מוח אמיתי של זבוב',
    sub: 'כל נקודה פה היא <em>נוירון אמיתי</em>, במקום שהוא באמת יושב בו בראש',
    note: '<em>139,255</em> נוירונים. כל אחד מהם מופה, אחד-אחד.',
    frames: [{ kind: 'brain' }],
    setup: (c) => {
      c.view.setCloudVisible(true);
      c.view.setEdgesVisible(false);
      c.view.controls.autoRotate = true;
      c.view.controls.autoRotateSpeed = 1.9;
      c.view.camera.position.set(0.02, 0.24, 2.05).add(c.view.center);
      c.view.controls.update();
    },
  },

  slicing: {
    title: 'ככה מיפו אותו',
    sub: 'חתכו את המוח ל<em>אלפי פרוסות</em>, כל אחת דקה פי אלף משערה',
    note: 'צילמו כל פרוסה ב<em>מיקרוסקופ אלקטרונים</em>, והרכיבו הכל בחזרה',
    frames: [{ kind: 'brain' }],
    setup: (c) => {
      c.view.setCloudVisible(true);
      c.view.setEdgesVisible(false);
      // A lateral view on purpose. The imaging sheet lies across the
      // anterior-posterior axis, so from the side it is edge-on and reads as a
      // blade cutting through; from the front it faces the camera and washes
      // the whole brain out. So: no full auto-rotate, only a slow sway.
      c.view.controls.autoRotate = false;
      c.view.camera.position.set(2.62, 0.28, 0.56).add(c.view.center);
      c.view.controls.update();
      c.base = c.view.camera.position.clone().sub(c.view.center);
      c.scan = c.view.scanRange();
    },
    /**
     * Three beats in twelve seconds: the blade arrives, it cuts the whole way
     * through while the brain sways and the camera creeps in, and then the
     * volume comes back together whole - which is the part of the sentence
     * people miss, that the slices were put back.
     */
    frame: (c, f) => {
      const { lo, hi } = c.scan;
      const sweep = Math.min(1, Math.max(0, (f - 24) / 244));
      if (f < 292) {
        const z = lo + (hi - lo) * sweep;
        c.view.setScan(z, 0.05);
        c.view.setScanPlane(z, Math.min(1, f / 24));
      } else {
        c.view.setScan(null);
        c.view.setScanPlane(null);
      }
      const a = Math.sin(f / 118) * 0.17;
      const dolly = 1 - Math.min(1, f / 300) * 0.13;
      const v = c.base;
      c.view.camera.position.set(
        (v.x * Math.cos(a) - v.z * Math.sin(a)) * dolly,
        v.y * dolly,
        (v.x * Math.sin(a) + v.z * Math.cos(a)) * dolly,
      ).add(c.view.center);
    },
  },

  slice: {
    title: 'זאת פרוסה אחת',
    sub: 'תמונה אמיתית מהמחקר: רקמת מוח של זבוב מתחת ל<em>מיקרוסקופ אלקטרונים</em>',
    note: 'כל עיגול קטן פה הוא חתך של סיב עצבי אחד. צריך לזהות כל אחד מהם, '
        + 'ואז לעקוב אחריו <em>בכל הפרוסות</em> עד הסוף.',
    frames: [{ kind: 'photo', src: 'research/research_em.png', zoom: 'in',
      fit: 'cover', seconds: 10, credit: 'Dorkenwald et al., Nature 2024 (CC BY 4.0)' }],
  },

  effort: {
    title: 'וזה גודל המחקר',
    sub: 'זה נמשך מ-2008, וזה לא נגמר בלי <em>גוגל</em>',
    note: 'המיפוי האוטומטי הוא של <em>גוגל ריסרץ׳</em> ביחד עם מכון ג׳נליה. '
        + 'הבדיקה הידנית היא של מאות חוקרים ומתנדבים מכל העולם.',
    frames: [{ kind: 'still', paint: drawEffort }],
  },

  allneurons: {
    title: 'וזאת התוצאה',
    sub: 'כל נוירון במוח של זבוב, משורטט אחד-אחד. <em>139,255</em> נוירונים.',
    note: 'המוח השלם הראשון שמופה אי פעם, בכל חיה שהיא. אחרי זה גוגל וג׳נליה '
        + 'סיימו גם <em>מוח של זכר</em>, 166 אלף נוירונים ו-125 מיליון חיבורים.',
    frames: [{ kind: 'photo', src: 'research/research_brain.png', zoom: 'out',
      seconds: 10, credit: 'Dorkenwald et al., Nature 2024 (CC BY 4.0)' }],
  },

  reel_brain: {
    title: 'וזה מהמחקר עצמו',
    sub: 'כל <em>139 אלף</em> הנוירונים, מסתובבים',
    note: 'זה הווידאו שצורף למאמר ב-Nature. כל חוט פה הוא נוירון אחד '
        + 'שמחשב זיהה ובן אדם אימת <em>ביד</em>.',
    credit: 'Supplementary Video 1 · Dorkenwald et al., Nature 2024 · CC BY 4.0',
    frames: [{ kind: 'slot' }],
  },

  reel_visual: {
    title: 'מפה לקחתי את הראייה',
    sub: 'הצהובים הם <em>נוירוני ההקרנה החזותית</em>, והמעגל שלי מתחיל בדיוק בהם',
    note: 'LC10a, הגלאי שמזהה משהו קטן שזז ונועל עליו, הוא אחד מהצהובים האלה.',
    credit: 'Supplementary Video 1 · Dorkenwald et al., Nature 2024 · CC BY 4.0',
    frames: [{ kind: 'slot' }],
  },

  reel_descending: {
    title: 'ופה הפקודות יוצאות',
    sub: 'הנוירונים היורדים, <em>מהמוח אל הגוף</em>',
    note: 'גרג ג׳פריס מקיימברידג׳ אמר על זה שזה <em>מביא אותנו מהעיניים לרגליים '
        + 'במכה אחת</em>. זה בדיוק מה שהמעגל שלי עושה.',
    credit: 'Supplementary Video 1 · Dorkenwald et al., Nature 2024 · CC BY 4.0',
    frames: [{ kind: 'slot' }],
  },

  quote_murthy: {
    title: '',
    sub: '',
    note: '',
    frames: [{ kind: 'still', paint: (c, w, h) => drawQuote(c, w, h, QUOTES.murthy) }],
  },

  quote_seung: {
    title: '',
    sub: '',
    note: '',
    frames: [{ kind: 'still', paint: (c, w, h) => drawQuote(c, w, h, QUOTES.seung) }],
  },

  quad: {
    title: 'מוח אמיתי של זבוב',
    sub: 'שלושה חלונות מהמחקר עצמו, ואחד מהמודל ש<em>אני</em> הרצתי עליו',
    note: 'מאה שלושים ותשעה אלף נוירונים, כל אחד במקום שהוא באמת יושב בו.',
    credit: 'Supplementary Video 1 · Dorkenwald et al., Nature 2024 · CC BY 4.0',
    layout: 'quad',
    frames: [
      { kind: 'slot', tag: 'המחקר' },
      { kind: 'slot', tag: 'הראייה' },
      { kind: 'slot', tag: 'הפקודות' },
      { kind: 'brain', tag: 'המודל שלי', tagClass: 'frame__tag--them' },
    ],
    setup: (c) => {
      c.view.setCloudVisible(true);
      c.view.setEdgesVisible(true);
      c.view.controls.autoRotate = true;
      c.view.controls.autoRotateSpeed = 2.1;
      // closer than the full-frame scenes: this panel is a quarter of the width
      c.view.camera.position.set(0.02, 0.18, 1.46).add(c.view.center);
      c.view.controls.update();
      c.panels = [...document.querySelectorAll('.s-body--quad .frame')];
      document.getElementById('stage').dataset.intro = 'out';
    },
    /**
     * The build. Panels land 8 frames apart and each eases over 11, so a
     * second in all four are up and the eye has been walked around the grid
     * instead of dropped into it. Our own model lands first, then the three
     * windows from the research.
     */
    frame: (c, f) => {
      const ease = (p) => {
        const t = Math.max(0, Math.min(1, p));
        return 1 - Math.pow(1 - t, 3);
      };
      const head = document.querySelector('.s-head');
      if (head) {
        const e = ease((f - 1) / 13);
        head.style.opacity = e;
        head.style.transform = 'translateY(' + ((1 - e) * 20).toFixed(2) + 'px)';
      }
      const order = [3, 0, 1, 2];
      order.forEach((idx, i) => {
        const panel = c.panels && c.panels[idx];
        if (!panel) return;
        const e = ease((f - (5 + i * 8)) / 11);
        panel.style.opacity = e.toFixed(3);
        panel.style.transform = 'scale(' + (0.88 + 0.12 * e).toFixed(4) + ')';
      });
    },
  },

  instincts: {
    title: 'שני המעגלים האלה לא נבנו לפלאפל',
    sub: 'שניהם קיימים בזבוב מזמן, ושניהם עושים פה <em>בדיוק אותו דבר</em>',
    note: 'למעלה: גלאי שנועל על משהו קטן שזז, ובטבע זה נקבה. '
        + 'למטה: רפלקס שבורח ממכה, ואצלנו הוא <em>סוטר</em>.',
    layout: 'quad',
    frames: [
      { kind: 'still', paint: PANELS.courtshipNature },
      { kind: 'still', paint: PANELS.courtshipOurs },
      { kind: 'still', paint: PANELS.escapeNature },
      { kind: 'still', paint: PANELS.escapeOurs },
    ],
  },

  circuit: {
    title: 'לקחתי ממנו מעגל אחד',
    sub: 'בדיוק את זה שאחראי <em>לראות משהו ולזוז אליו</em>',
    note: '<em>4,798</em> נוירונים, ו-<em>116,960</em> חיבורים ביניהם',
    frames: [{ kind: 'brain' }],
    setup: (c) => {
      c.view.setCloudVisible(false);
      c.view.setEdgesVisible(true);
      c.view.controls.autoRotate = true;
      c.view.controls.autoRotateSpeed = 1.7;
      c.view.camera.position.set(0.02, 0.22, 1.72).add(c.view.center);
      c.view.controls.update();
    },
  },

  stand: {
    title: 'נתתי לו דוכן פלאפל',
    sub: 'אף אחד לא לימד אותו לשחק, ואף אחד <em>לא תכנת</em> אותו',
    note: 'הוא עובר בין המגשים לבד. כל התנועה מגיעה <em>מהחיווט של המוח</em>.',
    frames: [{ kind: 'stand' }],
  },

  eye: {
    title: 'אבל ככה הוא רואה',
    sub: 'העין שלו היא לא מצלמה — <em>750 עדשות קטנות</em>, כל אחת לכיוון אחר',
    note: 'התמונה שלו גסה <em>פי 100</em> משלנו. מגש שלם הוא <em>כמה משושים כהים</em>.',
    frames: [{ kind: 'eye' }],
  },

  both: {
    title: 'אותו רגע, שתי עיניים',
    sub: 'למעלה מה ש<em>אנחנו</em> רואים. למטה מה ש<em>הוא</em> רואה.',
    note: 'בשבילו אין דוכן ואין מגש. יש <em>כתם כהה</em>, ויש איפה הוא נמצא.',
    frames: [
      { kind: 'stand', tag: 'מה שאנחנו רואים' },
      { kind: 'eye', tag: 'מה שהוא רואה', tagClass: 'frame__tag--them' },
    ],
  },

  vision: {
    title: 'וזה מה שנכנס לו לראש',
    sub: 'הגבעה מראה איפה המוח שלו <em>חושב</em> שהמטרה נמצאת',
    note: 'כשהוא מסתובב, <em>הגבעה זזה איתו</em>. זו כל האינפורמציה שיש לו.',
    frames: [{ kind: 'vision' }],
  },

  pathway: {
    title: 'ומפה מגיעה ההחלטה',
    sub: 'שני נוירונים מושכים את אותה פקודת סיבוב <em>לכיוונים הפוכים</em>',
    note: 'אחד נדלק כשהמטרה <em>באמצע</em> ו<em>בולם</em>. '
        + 'השני נדלק כשהיא <em>בצד</em> ו<em>דוחף</em>. ההפרש ביניהם הוא הפנייה.',
    frames: [{ kind: 'pathway' }],
    context: [
      { kind: 'eye', cap: 'מה שהוא רואה' },
      { kind: 'stand', cap: 'מה שיוצא מזה' },
    ],
  },

  courtship: {
    title: 'המעגל הזה לא נבנה לפלאפל',
    sub: 'בטבע זה מה שזכר זבוב מפעיל כשהוא <em>רודף אחרי נקבה</em>',
    note: 'יש לו גלאי שמזהה <em>משהו קטן שזז</em>, והוא ננעל עליו ולא משחרר. '
        + 'אצלנו הוא ננעל בדיוק אותו דבר, רק שהפעם זה <em>מגש חומוס</em>.',
    frames: [{ kind: 'origin', origin: 'courtship' }],
  },

  escape: {
    title: 'וזה מעגל הבריחה',
    sub: 'כשמשהו <em>גדל מהר</em> מול העיניים, כמו ציפור או כף יד',
    note: 'הוא מחובר לנוירון <em>הכי מהיר</em> במוח, שמעיף את הזבוב באוויר. '
        + 'המעגל שנבנה כדי <em>לברוח</em> ממכה הוא בדיוק זה שפה <em>סוטר</em>.',
    frames: [{ kind: 'origin', origin: 'escape' }],
  },

  scale: {
    title: 'וזה עוד לא כלום',
    sub: 'ספרנו כמה מוחות של זבוב נכנסים <em>במוח של עכבר</em>. יצא 503.',
    note: 'המוח השלם היחיד שיש לאנושות תרשים מלא שלו הוא של זבוב. '
        + 'היעד הבא, מוח של עכבר, גדול <em>פי 500</em>.',
    frames: [{ kind: 'still', paint: drawScale }],
  },

  future: {
    title: 'ולמה זה משנה',
    sub: 'תרשים חשמלי מלא של מוח פותח שלושה דברים שלא היו אפשריים קודם',
    note: 'הזבוב הזה הוא <em>הוכחת היתכנות</em>. אותה שיטה בדיוק רצה עכשיו על מוחות גדולים יותר.',
    frames: [{ kind: 'still', paint: drawFuture }],
  },

  punch: {
    title: 'בפעם הראשונה בהיסטוריה',
    sub: 'יש בידיים שלנו <em>תרשים חשמלי מלא</em> של מוח שלם',
    note: 'הוא של זבוב, והוא משחק מלך הפלאפל. <em>לעת עתה</em>.',
    frames: [{ kind: 'brain' }],
    setup: (c) => {
      c.view.setCloudVisible(true);
      c.view.setEdgesVisible(true);
      c.view.controls.autoRotate = true;
      c.view.controls.autoRotateSpeed = 1.5;
      c.view.camera.position.set(0.02, 0.26, 1.55).add(c.view.center);
      c.view.controls.update();
    },
    // pull back, so the last thing on screen is the whole brain
    frame: (c) => {
      c.view.camera.position.sub(c.view.center).multiplyScalar(1.0013)
        .add(c.view.center);
    },
  },
};

async function main() {
  const id = params.get('scene') || 'brain';
  const scene = SCENES[id];
  if (!scene) { document.body.textContent = 'no scene: ' + id; return; }
  if (params.get('safe') === '1') $('safe').hidden = false;

  $('s-title').innerHTML = scene.title;
  $('s-sub').innerHTML = scene.sub || '';
  // ?nocap=1 drops the caption line and lifts the credit into the header: the
  // note and the narration say the same thing, so when a timed caption track
  // carries the narration the note is just a second copy sitting in its way
  const noNote = params.get('nocap') === '1';
  $('s-note').innerHTML = noNote ? '' : (scene.note || '');
  if (noNote) document.body.classList.add('no-note');
  if (scene.credit) {
    $('s-credit').textContent = scene.credit;
    if (noNote) $('s-head').appendChild($('s-credit'));
  }

  const [circuitBuf, meta, cloudBuf] = await Promise.all([
    fetch(DATA + 'circuit.bin').then((r) => r.arrayBuffer()),
    fetch(DATA + 'circuit.json').then((r) => r.json()),
    fetch(DATA + 'cloud.bin').then((r) => r.arrayBuffer()),
  ]);
  const photos = new Map();
  for (const f of scene.frames) {
    if (f.kind === 'photo') photos.set(f.src, await loadImage(DATA.replace('data/', '') + f.src));
  }

  const circuit = parseCircuit(circuitBuf);
  const brain = new FlyBrain(circuit);
  const controller = new FlyController(meta, brain);
  const game = new FalafelGame(20020101);
  const ctx = { brain, controller, game, meta, handAz: 0 };
  const draws = [];

  /** Build one live view of `kind` into `canvas`; returns its draw function. */
  function build(kind, canvas, opt = {}) {
    if (kind === 'brain') {
      ctx.view = new BrainView(canvas, circuit, meta, parseCloud(cloudBuf));
      ctx.view.resize();
      return (dt) => ctx.view.render(dt, brain.rate);
    }
    if (kind === 'stand') {
      const s = new StandRenderer(canvas);
      s.clean = true;
      s.resize();
      if (!ctx.stand) ctx.stand = s;
      return (dt, t) => s.draw(game, ctx.handAz, t, dt, controller.lastOut);
    }
    if (kind === 'eye') {
      const e = new EyeView(canvas, STATIONS);
      e.resize();
      return () => e.draw(game, ctx.handAz, controller.lastOut, 0.033);
    }
    if (kind === 'pathway') {
      const p = new PathwayView(canvas, circuit, meta);
      p.clean = true;
      p.zoom = 2.4;
      p.resize();
      return (dt) => p.draw(brain, controller.lastOut, dt);
    }
    if (kind === 'vision') {
      const v = new VisionView(canvas, meta, FOOD, STATIONS);
      v.zoom = 2.3;
      v.resize();
      return (dt) => v.draw(brain, game, ctx.handAz, controller.lastOut, dt);
    }
    if (kind === 'slot') {
      // deliberately draws nothing: tools/research.mjs overlays the licensed
      // research footage into this rectangle after the page is screenshotted
      return () => {};
    }
    if (kind === 'photo') {
      const v = new PhotoView(canvas, photos.get(opt.src), opt);
      return (dt, t) => v.draw(t);
    }
    if (kind === 'still') {
      const dpr = 2;
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      const c2 = canvas.getContext('2d');
      c2.setTransform(dpr, 0, 0, dpr, 0, 0);
      opt.paint(c2, r.width, r.height);
      return () => {};
    }
    if (kind === 'origin') {
      // a still illustration, drawn in CSS pixels at the frame's real size
      const dpr = 2;
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      const c2 = canvas.getContext('2d');
      c2.setTransform(dpr, 0, 0, dpr, 0, 0);
      ORIGIN_STACKED[opt.origin](c2, r.width, r.height);
      return () => {};
    }
    return () => {};
  }

  // main frames
  const body = $('s-body');
  if (scene.layout === 'quad') body.classList.add('s-body--quad');
  let slotNo = 0;
  for (const f of scene.frames) {
    const div = document.createElement('div');
    div.className = 'frame';
    const canvas = document.createElement('canvas');
    div.appendChild(canvas);
    // the compositor finds its holes by this index, in document order
    if (f.kind === 'slot') div.dataset.slot = String(slotNo++);
    if (f.tag) {
      const tag = document.createElement('span');
      tag.className = 'frame__tag' + (f.tagClass ? ' ' + f.tagClass : '');
      tag.textContent = f.tag;
      div.appendChild(tag);
    }
    body.appendChild(div);
    draws.push({ f, canvas, div, kind: f.kind, opt: f });
  }

  // context strip, kept small under the main visual
  if (scene.context) {
    const strip = document.createElement('div');
    strip.className = 's-ctx';
    for (const c of scene.context) {
      const item = document.createElement('div');
      item.className = 's-ctx__item';
      const fr = document.createElement('div');
      fr.className = 's-ctx__frame';
      const canvas = document.createElement('canvas');
      fr.appendChild(canvas);
      const cap = document.createElement('p');
      cap.className = 's-ctx__cap';
      cap.innerHTML = c.cap;
      item.appendChild(fr);
      item.appendChild(cap);
      strip.appendChild(item);
      draws.push({ canvas, kind: c.kind, opt: c });
    }
    document.querySelector('.s-foot').appendChild(strip);
  }

  // The canvases need their final laid-out size before the views are built,
  // and the webfont has to be in before anything paints text into a canvas.
  //
  // document.fonts.ready alone is not enough: a browser only fetches a face
  // that something in the DOM actually uses, and canvas text does not count.
  // On a scene whose title and caption are empty - a pull quote, say - nothing
  // in the DOM asks for Heebo, so the file is never fetched and every canvas
  // heading silently comes out in a fallback serif.
  //
  // The sample text matters as much as the weight. Google Fonts splits Heebo
  // into unicode-range subsets, and fonts.load() with no text tests a Latin
  // string, so it fetches the Latin face and leaves the Hebrew one alone -
  // which is the whole alphabet this video is written in.
  await Promise.all([
    ...['500', '600', '700', '800', '900'].map(
      (w) => document.fonts.load(w + ' 40px Heebo', 'אבג')),
    document.fonts.load('600 20px "JetBrains Mono"', '0123'),
  ]);
  await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  for (const d of draws) d.draw = build(d.kind, d.canvas, d.opt);

  let tSec = 0;
  let frameNo = 0;
  if (scene.setup) scene.setup(ctx);

  /** Advance the world by exactly dtMs and draw one frame. */
  function tick(dtMs) {
    const dt = dtMs / 1000;
    tSec += dt;
    if (scene.frame) scene.frame(ctx, frameNo);

    game.update(dt);
    if (!game.over) {
      const goal = game.goal();
      const out = controller.tick(dtMs, {
        handAz: ctx.handAz, goalAz: goal.az, salience: 1,
        arousal: game.arousal(), pests: game.loomingInputs(),
      });
      ctx.handAz += out.turnDegPerSec * dt;
      if (ctx.handAz > 95) ctx.handAz = 95;
      else if (ctx.handAz < -95) ctx.handAz = -95;
      if (out.grab) {
        const r = game.grab(ctx.handAz);
        if (r && ctx.stand) ctx.stand.pulseGrab();
      }
      if (out.swat) {
        const pick = game.pests.filter((p) => !p.dead)[0];
        if (pick && game.swat(pick.az) && ctx.stand) ctx.stand.pulseSwat(pick.az);
      }
    }

    for (const d of draws) d.draw(dt, tSec);
    frameNo++;
  }

  window.S = { tick, ctx, scene: id, ready: true };

  // also run live, so the page can simply be watched in a browser
  let last = performance.now();
  (function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(60, now - last); last = now;
    if (!window.S.driven) tick(dt * 0.35);
  })(last);
}

main().catch((e) => {
  document.body.innerHTML = '<pre style="color:#e0553f;padding:40px;font-size:26px">'
    + e.message + '</pre>';
});
