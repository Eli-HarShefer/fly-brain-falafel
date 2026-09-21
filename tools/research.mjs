/**
 * Portrait clips built from licensed research footage.
 *
 * The HHMI film and the Google Research blog images are all rights reserved, so
 * nothing from either is here. What is here is Supplementary Video 1 of the
 * FlyWire paper, which is part of an open-access article under CC BY 4.0 and
 * may be reused, including commercially, as long as it is credited. The credit
 * is typeset into the frame by the shoot stage, so it survives a repost.
 *
 * How it composites: the stage is screenshotted with an empty rectangle where
 * the footage goes, and ffmpeg lays the scaled video into that rectangle. The
 * screenshot is the base layer, so no alpha channel is needed anywhere and the
 * Hebrew is typeset by a browser rather than by ffmpeg's text renderer, which
 * does not shape RTL.
 *
 *   node tools/research.mjs            # all reels
 *   node tools/research.mjs 04         # just this one
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CHROME = process.env.CHROME_BIN
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FFMPEG = process.env.FFMPEG_BIN || 'ffmpeg';
const VIDEO_DIR = process.env.VIDEO_DIR || './video';
const OUT = VIDEO_DIR + '/clips';
const SCREENS = VIDEO_DIR + '/screens';
/** Where the downloaded supplementary videos live; see public/research/CREDITS.md. */
const SRC = VIDEO_DIR + '/research';
const URL = process.env.CAP_URL || 'http://localhost:4173/';
const PORT = 9337;
const W = 1080, H = 1920, FPS = 30;

/**
 * Each reel: a scene for the typography, and the slice of the source video that
 * goes in the hole. Timestamps picked off a contact sheet of the source.
 */
const REELS = [
  {
    id: '01', scene: 'quad', seconds: 12,
    // the live 3D panel is captured first by tools/capture.mjs; this pass only
    // fills the three holes, so the base is that clip rather than a still plate
    base: 'clip',
    slots: [
      { src: 'suppvideo6.mp4', start: 2 },     // the whole brain turning
      { src: 'suppvideo6.mp4', start: 38 },    // visual projection neurons
      { src: 'suppvideo6.mp4', start: 70 },    // descending neurons
    ],
    caption: 'שלושה חלונות מהמחקר עצמו, ואחד מהמודל שאני הרצתי עליו. '
      + 'מאה שלושים ותשעה אלף נוירונים.',
  },
];

/* ------------------------------------------------------------------ CDP --- */

let msgId = 0;
const pending = new Map();
let ws;

function send(method, params = {}, sessionId) {
  const id = ++msgId;
  const payload = { id, method, params };
  if (sessionId) payload.sessionId = sessionId;
  ws.send(JSON.stringify(payload));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evaluate(expr, session) {
  const r = await send('Runtime.evaluate',
    { expression: expr, awaitPromise: true, returnByValue: true }, session);
  if (r.exceptionDetails) {
    throw new Error('page error: ' + (r.exceptionDetails.exception?.description
      || r.exceptionDetails.text));
  }
  return r.result?.value;
}

/* ----------------------------------------------------------------- main --- */

async function main() {
  const only = process.argv.slice(2);
  const reels = only.length ? REELS.filter((r) => only.includes(r.id)) : REELS;
  if (!reels.length) { console.error('no reels matched'); process.exit(1); }

  for (const r of reels) {
    if (!existsSync(join(SRC, r.src))) {
      throw new Error('missing source: ' + join(SRC, r.src)
        + '\nDownload it from the article; see public/research/CREDITS.md');
    }
  }

  mkdirSync(OUT, { recursive: true });
  mkdirSync(SCREENS, { recursive: true });
  const profile = join(tmpdir(), 'fly-research-' + Date.now());
  mkdirSync(profile, { recursive: true });

  console.log('launching headless chrome on a throwaway profile');
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile,
    '--window-size=' + W + ',' + H,
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--disable-extensions', '--no-first-run', '--no-default-browser-check',
    '--use-gl=angle', '--use-angle=d3d11', '--enable-unsafe-swiftshader',
    'about:blank',
  ], { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(500);
    try {
      const res = await fetch('http://127.0.0.1:' + PORT + '/json/version');
      if (res.ok) target = await res.json();
    } catch { /* not up yet */ }
  }
  if (!target) { chrome.kill(); throw new Error('chrome did not expose CDP'); }

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) rej(new Error(m.error.message)); else res(m.result);
    }
  });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride',
    { width: W, height: H, deviceScaleFactor: 1, mobile: false }, sessionId);

  for (const reel of reels) {
    process.stdout.write('  ' + reel.id + ' ' + reel.scene.padEnd(16));
    await send('Page.navigate',
      { url: URL + 'shoot.html?scene=' + reel.scene }, sessionId);

    let ready = false;
    for (let i = 0; i < 90 && !ready; i++) {
      await sleep(250);
      ready = await evaluate('!!(window.S && window.S.ready)', sessionId).catch(() => false);
    }
    if (!ready) throw new Error(reel.id + ': scene never booted');

    // where the footage goes, in page pixels
    const rects = await evaluate(`(() => {
      return [...document.querySelectorAll('.s-body .frame[data-slot]')]
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y),
                   w: Math.round(r.width), h: Math.round(r.height) };
        });
    })()`, sessionId);
    if (rects.length !== reel.slots.length) {
      throw new Error(reel.id + ': scene has ' + rects.length + ' holes but '
        + reel.slots.length + ' clips to put in them');
    }

    const out = join(OUT, reel.id + '_' + reel.scene + '.mp4');
    let plate = null;
    if (reel.base === 'clip') {
      // the live panel was rendered by the capture rig; work on top of it
      plate = out.replace(/\.mp4$/, '.base.mp4');
      renameSync(out, plate);
    } else {
      const shot = await send('Page.captureScreenshot',
        { format: 'png', captureBeyondViewport: false }, sessionId);
      plate = join(tmpdir(), 'fly-plate-' + reel.id + '.png');
      writeFileSync(plate, Buffer.from(shot.data, 'base64'));
    }

    await composite(plate, rects, reel, out);
    if (reel.base === 'clip') rmSync(plate, { force: true });
    writeSrt(join(OUT, reel.id + '_' + reel.scene + '.srt'), reel);
    await stillFrom(out, join(SCREENS, reel.id + '_' + reel.scene + '.png'), reel.seconds / 2);
    rmSync(plate, { force: true });
    console.log('  ' + reel.seconds + 's');
  }

  await send('Target.closeTarget', { targetId });
  ws.close();
  chrome.kill();
  await sleep(600);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* fine */ }
  console.log('\ndone ->', OUT);
}

/**
 * Lay each piece of footage into its hole.
 *
 * The source is 16:9 and the holes are not, so each piece is fitted to its
 * hole's width and centred in it; the frame's own dark background fills the
 * rest, which is why the plate is the base layer and never an overlay.
 */
function composite(plate, rects, reel, out) {
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  if (reel.base === 'clip') args.push('-i', plate);
  else args.push('-loop', '1', '-framerate', String(FPS), '-i', plate);
  for (const slot of reel.slots) {
    args.push('-ss', String(slot.start), '-t', String(reel.seconds),
      '-i', join(SRC, slot.src));
  }

  const parts = [];
  let last = '0:v';
  rects.forEach((r, i) => {
    const w = r.w % 2 ? r.w - 1 : r.w;
    parts.push(`[${i + 1}:v]scale=${w}:-2,setsar=1[s${i}]`);
    const next = i === rects.length - 1 ? 'o' : `b${i}`;
    parts.push(`[${last}][s${i}]overlay=${r.x}:${r.y}+(${r.h}-overlay_h)/2`
      + `:format=auto[${next}]`);
    last = next;
  });
  parts.push('[o]format=yuv420p[out]');

  args.push('-filter_complex', parts.join(';'), '-map', '[out]',
    '-t', String(reel.seconds),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17',
    '-r', String(FPS), '-fps_mode', 'cfr', out);

  return new Promise((res, rej) => {
    const p = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'inherit'] });
    p.on('exit', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c))));
  });
}

function stillFrom(clip, out, atSec) {
  return new Promise((res, rej) => {
    const p = spawn(FFMPEG, [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-ss', String(atSec), '-i', clip, '-frames:v', '1', out,
    ], { stdio: ['ignore', 'ignore', 'inherit'] });
    p.on('exit', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c))));
  });
}

function stamp(sec) {
  const h = String(Math.floor(sec / 3600)).padStart(2, '0');
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const s = String(Math.floor(sec % 60)).padStart(2, '0');
  const ms = String(Math.round((sec % 1) * 1000)).padStart(3, '0');
  return h + ':' + m + ':' + s + ',' + ms;
}

function writeSrt(path, reel) {
  writeFileSync(path,
    '1\n' + stamp(0) + ' --> ' + stamp(reel.seconds) + '\n' + reel.caption + '\n',
    'utf8');
}

main().catch((e) => { console.error('\nFAILED:', e.message); process.exit(1); });
