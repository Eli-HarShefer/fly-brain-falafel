/**
 * Filming stage.
 *
 * One scene at a time, portrait, blown up, with the clutter off. It runs the
 * real components against the real connectome - nothing here is a mock-up - but
 * it shows a single idea per frame instead of a dashboard.
 *
 * Two things matter for the footage:
 *
 *  - Time is driven, not observed. window.S.tick(dtMs) advances the world by
 *    exactly dtMs, so the capture can feed 8 ms per frame while recording at
 *    30 fps and get genuine quarter-speed motion with every frame freshly
 *    computed. The fly at full speed serves a dish every two seconds, which
 *    reads as frantic; slowed down you can actually follow what it is doing.
 *
 *  - No numbers unless the scene is about a number. Stat bars, Hz readouts,
 *    order boards and nameplates are off by default.
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
import { SCENES as ORIGIN_SCENES } from './ui/origins.js';
import { FOOD } from './game/art.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

/** width, height of the visual for each scene. Max is about 984 x 1060. */
const SCENES = {
  brain: {
    title: 'זה מוח אמיתי של זבוב',
    sub: 'כל נקודה היא נוירון, במקום שהוא באמת יושב בו',
    size: [984, 700], kind: 'brain',
    setup: (c) => {
      c.view.setCloudVisible(true);
      c.view.setEdgesVisible(false);
      c.view.controls.autoRotate = true;
      c.view.controls.autoRotateSpeed = 0.75;
      // the brain is twice as wide as it is tall; fill the frame with it
      c.view.camera.position.set(0.02, 0.24, 2.05).add(c.view.center);
      c.view.controls.update();
    },
  },
  slicing: {
    title: 'ככה מיפו אותו',
    sub: 'פרסו את המוח לאלפי פרוסות וצילמו כל אחת',
    note: 'כל נקודה שנדלקת היא נוירון שנמצא בפרוסה הזו',
    size: [984, 700], kind: 'brain',
    setup: (c) => {
      c.view.setCloudVisible(true);
      c.view.setEdgesVisible(false);
      c.view.controls.autoRotate = false;
      c.view.camera.position.set(1.95, 0.34, 1.62).add(c.view.center);
      c.view.controls.update();
      c.scan = c.view.scanRange();
    },
    frame: (c, f) => {
      const t = Math.min(1, (f / 420) * 1.05);
      c.view.setScan(c.scan.lo + (c.scan.hi - c.scan.lo) * t);
    },
  },
  circuit: {
    title: 'לקחתי ממנו מעגל אחד',
    sub: 'את זה שאחראי לראות משהו ולזוז אליו',
    size: [984, 700], kind: 'brain',
    setup: (c) => {
      c.view.setCloudVisible(false);
      c.view.setEdgesVisible(true);
      c.view.controls.autoRotate = true;
      c.view.controls.autoRotateSpeed = 0.7;
      c.view.camera.position.set(0.02, 0.22, 1.72).add(c.view.center);
      c.view.controls.update();
    },
  },
  eye: {
    title: 'ככה הוא <em>רואה</em>',
    sub: 'לא מצלמה — 750 עדשות קטנות, כל אחת לכיוון אחר',
    note: 'מגש שלם הוא <b>כמה משושים כהים</b>. זה הכל מה שיש לו.',
    size: [984, 640], kind: 'eye',
  },
  stand: {
    title: 'נתתי לו דוכן פלאפל',
    sub: 'אף אחד לא לימד אותו לשחק',
    size: [984, 700], kind: 'stand',
  },
  lock: {
    title: 'הוא נועל, ומסתובב',
    sub: 'עד שהמגש בדיוק באמצע',
    size: [984, 700], kind: 'stand',
  },
  pathway: {
    title: 'זה כל מה שקורה בפנים',
    sub: 'גלאי אחד, שני ממסרים, ופקודת סיבוב',
    note: 'אחד נדלק כשהמטרה <b>באמצע</b>, השני כשהיא <b>בצד</b>',
    size: [984, 620], kind: 'pathway',
  },
  vision: {
    title: 'איפה הוא חושב שזה נמצא',
    sub: 'הגבעה זזה כשהוא מסתובב',
    size: [984, 640], kind: 'vision',
  },
  courtship: {
    title: 'המעגל הזה לא נבנה בשביל פלאפל',
    sub: 'זה המעגל שזכר מפעיל כשהוא רודף אחרי נקבה',
    size: [984, 470], kind: 'origin', origin: 'courtship',
  },
  escape: {
    title: 'וזה מעגל הבריחה',
    sub: 'שנבנה כדי לברוח ממכת זבובים',
    size: [984, 470], kind: 'origin', origin: 'escape',
  },
  scramble: {
    title: 'ערבבתי לו את החיווט',
    sub: 'אותם נוירונים, אותו מספר חיבורים',
    note: 'רק מחוברים <b>לא נכון</b>',
    size: [984, 700], kind: 'stand',
    frame: (c, f) => {
      if (f === 150) document.dispatchEvent(new CustomEvent('shoot:scramble'));
    },
  },
};

async function main() {
  const id = params.get('scene') || 'brain';
  const scene = SCENES[id];
  if (!scene) { document.body.textContent = 'no scene: ' + id; return; }
  if (params.get('safe') === '1') $('safe').hidden = false;

  $('s-title').innerHTML = scene.title;
  $('s-sub').textContent = scene.sub || '';
  $('s-note').innerHTML = scene.note || '';

  const [circuitBuf, meta, cloudBuf] = await Promise.all([
    fetch('/data/circuit.bin').then((r) => r.arrayBuffer()),
    fetch('/data/circuit.json').then((r) => r.json()),
    fetch('/data/cloud.bin').then((r) => r.arrayBuffer()),
  ]);
  const circuit = parseCircuit(circuitBuf);
  const brain = new FlyBrain(circuit);
  const controller = new FlyController(meta, brain);
  const game = new FalafelGame(20020101);

  const body = $('s-body');
  const [vw, vh] = scene.size;
  const frame = document.createElement('div');
  frame.className = 'frame';
  frame.style.width = vw + 'px';
  frame.style.height = vh + 'px';
  const canvas = document.createElement('canvas');
  frame.appendChild(canvas);
  body.appendChild(frame);

  const ctx = { brain, controller, game, meta };
  let render;

  if (scene.kind === 'brain') {
    ctx.view = new BrainView(canvas, circuit, meta, parseCloud(cloudBuf));
    ctx.view.resize();
    render = (dt) => ctx.view.render(dt, brain.rate);
  } else if (scene.kind === 'stand') {
    const stand = new StandRenderer(canvas);
    stand.clean = true;                       // no order board, no nameplates
    stand.resize();
    render = (dt, t) => stand.draw(game, ctx.handAz, t, dt, controller.lastOut);
    ctx.stand = stand;
  } else if (scene.kind === 'eye') {
    const eye = new EyeView(canvas, STATIONS);
    eye.resize();
    render = () => eye.draw(game, ctx.handAz, controller.lastOut, 0.033);
  } else if (scene.kind === 'pathway') {
    const pw = new PathwayView(canvas, circuit, meta);
    pw.clean = true;                          // shape and flow, no Hz readouts
    pw.resize();
    render = (dt) => pw.draw(brain, controller.lastOut, dt);
  } else if (scene.kind === 'vision') {
    const vv = new VisionView(canvas, meta, FOOD, STATIONS);
    vv.resize();
    render = (dt) => vv.draw(brain, game, ctx.handAz, controller.lastOut, dt);
  } else if (scene.kind === 'origin') {
    const dpr = 2;
    canvas.width = vw * dpr; canvas.height = vh * dpr;
    const c2 = canvas.getContext('2d');
    c2.setTransform(dpr, 0, 0, dpr, 0, 0);
    // the illustrations are drawn at ~340x150; scale them up to fill the frame
    const k = vw / 340;
    c2.scale(k, k);
    ORIGIN_SCENES[scene.origin](c2, 340, vh / k);
    render = () => {};
  }

  ctx.handAz = 0;
  let tSec = 0;
  let frameNo = 0;
  document.addEventListener('shoot:scramble', () => brain.setScrambled(true));
  if (scene.setup) scene.setup(ctx);

  /** Advance the world by exactly dtMs and draw one frame. */
  function tick(dtMs) {
    const dt = dtMs / 1000;
    tSec += dt;
    if (scene.frame) scene.frame(ctx, frameNo);
    if (scene.kind !== 'origin') {
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
        if (out.grab) { const r = game.grab(ctx.handAz); if (r && ctx.stand) ctx.stand.pulseGrab(); }
        if (out.swat) {
          const live = game.pests.filter((p) => !p.dead);
          const pick = live[0];
          if (pick && game.swat(pick.az) && ctx.stand) ctx.stand.pulseSwat(pick.az);
        }
      }
    }
    render(dt, tSec);
    frameNo++;
  }

  window.S = { tick, ctx, scene: id, ready: true };

  // also run live, so the page can just be watched in a browser
  let last = performance.now();
  (function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(60, now - last); last = now;
    if (!window.S.driven) tick(dt * 0.35);
  })(last);
}

main().catch((e) => {
  document.body.innerHTML = '<pre style="color:#e0553f;padding:40px;font-size:24px">'
    + e.message + '</pre>';
});
