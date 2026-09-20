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
    view.render(dt);
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
