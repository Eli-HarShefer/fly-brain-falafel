/**
 * Bootstrap and main loop.
 *
 * The simulation runs on the main thread rather than in a Web Worker. The plan
 * called for a worker, but the engine measures ~2.1 ms per frame against a
 * 16.67 ms budget (tools/bench.mjs, ~7.7x real time), and the 3D view needs the
 * spike buffer every single frame - posting it across a worker boundary 60
 * times a second would cost more than the simulation itself. A full game with
 * all rendering measures ~4 ms per frame.
 */
import { FlyBrain, parseCircuit } from './lif.js';
import { FlyController } from './controller.js';
import { FalafelGame } from './game/orders.js';
import { StandRenderer } from './game/render.js';
import { BrainView, parseCloud, ROLE_COLORS, ROLE_LABELS } from './brain3d.js';
import { SpikeRaster, TracePanel } from './ui/panels.js';
import { buildControls } from './ui/controls.js';
import { PathwayView } from './ui/pathway.js';

const $ = (id) => document.getElementById(id);
const bootStatus = $('boot-status');
const setStatus = (s) => { bootStatus.textContent = s; };

async function loadBinary(url, label) {
  setStatus(label);
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ': ' + res.status);
  return res.arrayBuffer();
}

async function main() {
  const [circuitBuf, metaRes, cloudBuf] = await Promise.all([
    loadBinary('/data/circuit.bin', 'מוריד את המעגל…'),
    fetch('/data/circuit.json').then((r) => r.json()),
    loadBinary('/data/cloud.bin', 'מוריד 139,255 נוירונים…'),
  ]);

  setStatus('בונה את הרשת…');
  const circuit = parseCircuit(circuitBuf);
  const meta = metaRes;
  const cloud = parseCloud(cloudBuf);

  const brain = new FlyBrain(circuit);
  const controller = new FlyController(meta, brain);
  const game = new FalafelGame(Date.now() & 0xffffff);

  setStatus('מדליק את התצוגה…');
  const stand = new StandRenderer($('game'));
  const view = new BrainView($('brain'), circuit, meta, cloud);
  const raster = new SpikeRaster($('raster'), meta);
  const traces = new TracePanel($('traces'));
  const pathway = new PathwayView($('pathway'), circuit, meta);

  $('stat-neurons').textContent = meta.nNeurons.toLocaleString('he-IL');
  $('raster-note').textContent = meta.nEdges.toLocaleString('he-IL') + ' סינפסות';
  $('traces').closest('.tel').querySelector('.tel__note').innerHTML = TracePanel.legendHTML();

  // brain legend
  $('brain-legend').innerHTML = Object.entries(ROLE_LABELS).map(([k, label]) => {
    const hex = '#' + ROLE_COLORS[k].toString(16).padStart(6, '0');
    return '<span><i style="background:' + hex + '"></i>' + label + '</span>';
  }).join('');

  let handAz = 0;
  let paused = false;
  let spikeWindow = 0;
  let spikeTimer = 0;
  let lesionActive = false;
  let lastServed = -1;

  buildControls($('controls'), {
    brain, meta,
    onSpeed: (v) => { controller.simSpeed = v; $('stat-speed').textContent = v.toFixed(2).replace(/0$/, '') + '×'; },
    onEdges: (v) => view.setEdgesVisible(v),
    onCloud: (v) => view.setCloudVisible(v),
    onLesion: () => {
      lesionActive = document.querySelectorAll('#controls .ctl[aria-pressed="true"][data-id]').length > 0;
    },
  });

  // --- neuron inspector -----------------------------------------------------
  const ROLE_HE = {
    lc10a: 'גלאי מטרה', lplc2: 'גלאי לומינג', aotu: 'ממסר היגוי',
    cx: 'קומפלקס מרכזי', dn: 'נוירון יורד', vis: 'ראייה', other: 'שכן במעגל',
  };
  const SIDE_HE = { left: 'שמאל', right: 'ימין', center: 'מרכז' };
  // what the cell is actually for in a living fly
  const PURPOSE = {
    LC10a: 'מרדף מטרה · חיזור',
    LPLC2: 'גלאי התקרבות · בריחה',
    LC18: 'ראייה · אובייקטים',
    AOTU019: 'מרכז השדה · עצור סיבוב',
    AOTU025: 'פריפריה · הנע סיבוב',
    DNa02: 'פקודת פנייה לגוף',
    DNa03: 'פקודת פנייה לגוף',
    DNa04: 'נוירון יורד',
    DNp01: 'Giant Fiber · קפיצת בריחה',
    DNp09: 'נוירון יורד',
    EPG: 'מצפן · כיוון הראש',
    Delta7: 'טבעת המצפן',
    PFL3: 'כיוון מול מטרה → פנייה',
    PFL2: 'כיוון מול מטרה',
    ER4d: 'עיכוב טבעת המצפן',
  };
  const tip = $('neuron-tip');
  const brainCanvas = $('brain');
  let pinned = -1;
  let dragging = false, downAt = null;

  function showTip(i, clientX, clientY) {
    const d = view.describe(i);
    if (!d) { tip.hidden = true; return; }
    const box = brainCanvas.getBoundingClientRect();
    tip.style.left = (clientX - box.left) + 'px';
    tip.style.top = (clientY - box.top) + 'px';
    const purpose = PURPOSE[d.type];
    tip.innerHTML =
      '<b>' + d.type + '</b>' +
      (purpose ? '<div class="tip__purpose">' + purpose + '</div>' : '') +
      '<div class="tip__row"><span>' + (ROLE_HE[d.role] || d.role) + '</span>' +
      '<em>' + (SIDE_HE[d.side] || d.side) + '</em></div>' +
      '<div class="tip__row"><span>קצב</span><em>' + d.rate.toFixed(0) + ' Hz</em></div>' +
      '<div class="tip__row"><span>נכנסות / יוצאות</span><em>' + d.inDeg + ' / ' + d.outDeg + '</em></div>' +
      (d.nt ? '<div class="tip__row"><span>מוליך</span><em>' + d.nt + '</em></div>' : '') +
      '<div class="tip__pin">' + (pinned === i ? 'לחץ שוב כדי לשחרר' : 'לחץ כדי לנעוץ') + '</div>';
    tip.hidden = false;
  }

  brainCanvas.addEventListener('pointerdown', (e) => { dragging = false; downAt = { x: e.clientX, y: e.clientY }; });
  brainCanvas.addEventListener('pointermove', (e) => {
    if (downAt && (Math.abs(e.clientX - downAt.x) > 3 || Math.abs(e.clientY - downAt.y) > 3)) dragging = true;
    const box = brainCanvas.getBoundingClientRect();
    const nx = ((e.clientX - box.left) / box.width) * 2 - 1;
    const ny = -((e.clientY - box.top) / box.height) * 2 + 1;
    const hit = view.pick(nx, ny);
    view.setHovered(hit);
    if (hit >= 0) showTip(hit, e.clientX, e.clientY);
    else if (pinned < 0) tip.hidden = true;
    else showTip(pinned, e.clientX, e.clientY);
  });
  brainCanvas.addEventListener('pointerup', (e) => {
    downAt = null;
    if (dragging) { dragging = false; return; }
    const box = brainCanvas.getBoundingClientRect();
    const nx = ((e.clientX - box.left) / box.width) * 2 - 1;
    const ny = -((e.clientY - box.top) / box.height) * 2 + 1;
    const hit = view.pick(nx, ny);
    pinned = hit >= 0 && hit !== pinned ? hit : -1;
    view.setSelected(pinned);
  });
  brainCanvas.addEventListener('pointerleave', () => {
    view.setHovered(-1);
    if (pinned < 0) tip.hidden = true;
  });

  // --- first-run explainer --------------------------------------------------
  const intro = $('intro');
  const SEEN = 'fly-falafel:intro-seen';
  let seen = false;
  try { seen = localStorage.getItem(SEEN) === '1'; } catch { /* private mode */ }
  const openIntro = () => { intro.hidden = false; $('intro-close').focus(); };
  const closeIntro = () => {
    intro.hidden = true;
    try { localStorage.setItem(SEEN, '1'); } catch { /* ignore */ }
  };
  if (!seen) openIntro();
  $('intro-close').addEventListener('click', closeIntro);
  $('btn-help').addEventListener('click', openIntro);
  intro.addEventListener('click', (e) => { if (e.target === intro) closeIntro(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !intro.hidden) closeIntro();
  });

  const restart = () => {
    game.reset();
    brain.reset();
    handAz = 0;
    $('gameover').hidden = true;
  };
  $('btn-restart').addEventListener('click', restart);
  $('btn-again').addEventListener('click', restart);
  $('btn-pause').addEventListener('click', (e) => {
    paused = !paused;
    e.currentTarget.setAttribute('aria-pressed', String(paused));
    e.currentTarget.textContent = paused ? 'המשך' : 'השהה';
  });

  const ro = new ResizeObserver(() => {
    stand.resize(); view.resize(); raster.resize(); traces.resize(); pathway.resize();
  });
  ro.observe($('game').parentElement);
  ro.observe($('brain').parentElement);
  ro.observe($('raster'));
  ro.observe($('traces'));
  ro.observe($('pathway'));

  // handy for poking at the running system from the console
  window.__fly = { brain, controller, game, view, stand, pathway, meta,
    get handAz() { return handAz; }, get paused() { return paused; } };

  $('boot').dataset.done = '1';

  let last = performance.now();
  let tSec = 0;

  /**
   * One step of the world. Split out from the rAF driver so it can also be
   * pumped manually - rAF is parked whenever the tab is hidden, and a headless
   * or offscreen check still needs to advance the sim.
   */
  function tick(dtMs) {
    if (dtMs > 100) dtMs = 100;        // tab was backgrounded
    const dt = dtMs / 1000;
    tSec += dt;

    if (!paused && !game.over) {
      game.update(dt);

      const goal = game.goal();
      const out = controller.tick(dtMs, {
        handAz,
        goalAz: goal.az,
        salience: 1,
        arousal: game.arousal(),
        pests: game.loomingInputs(),
      });

      handAz += out.turnDegPerSec * dt;
      if (handAz > 95) handAz = 95; else if (handAz < -95) handAz = -95;

      if (out.grab) {
        const r = game.grab(handAz);
        if (r) stand.pulseGrab();
      }
      if (out.swat) {
        // the Giant Fiber says "escape now" on one side; spray the nearest live
        // pest on that side, since LPLC2 -> DNp01 is strictly ipsilateral
        const side = out.swat;   // -1 left, +1 right
        const live = game.pests.filter((p) => !p.dead);
        const onSide = live.filter((p) => (side > 0 ? p.az >= 0 : p.az < 0));
        const pick = (onSide.length ? onSide : live)[0];
        const az = pick ? pick.az : handAz;
        if (game.swat(az)) stand.pulseSwat(az);
      }

      view.pushSpikes(brain.spikeBuf, brain.spikeCount);
      raster.push(brain.spikeBuf, brain.spikeCount, false);
      traces.push(out.rates);

      spikeWindow += brain.spikeCount;
      spikeTimer += dt;
      if (spikeTimer >= 0.4) {
        $('stat-spikes').textContent = Math.round(spikeWindow / spikeTimer).toLocaleString('he-IL');
        spikeWindow = 0; spikeTimer = 0;
      }

      const neural = {
        onTarget: out.onTarget,
        lcDrive: (brain.groupRate(meta.groups.LC10a_L) + brain.groupRate(meta.groups.LC10a_R)) / 2,
        steerHz: out.steerHz,
      };
      stand.draw(game, handAz, tSec, dt, neural);
      pathway.draw(brain, out, dt);

      $('stat-score').textContent = game.score.toLocaleString('he-IL');
      $('stat-served').textContent = game.served.toLocaleString('he-IL');
      if (game.served !== lastServed) {
        lastServed = game.served;
        $('live').textContent = 'הוגשו ' + game.served + ' מנות, ניקוד ' + game.score;
      }

      if (game.over) {
        $('gameover-sub').textContent = game.overReason +
          (lesionActive ? ' · עם נגע פעיל' : '');
        $('gameover').hidden = false;
        $('live').textContent = 'המשחק נגמר. ' + game.overReason;
      }
    } else {
      raster.push(null, 0, true);
      stand.draw(game, handAz, tSec, dt, controller.lastOut || null);
      pathway.draw(brain, controller.lastOut || null, dt);
    }

    raster.overlay();
    view.render(dt, brain.rate);
  }

  window.__fly.tick = tick;

  function frame(now) {
    requestAnimationFrame(frame);
    const dtMs = now - last;
    last = now;
    tick(dtMs);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error(err);
  setStatus('שגיאה: ' + err.message);
});
