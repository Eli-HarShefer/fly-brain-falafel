/**
 * Deterministic clip capture for the video.
 *
 * Screen recorders produce variable frame rates, which stutter in editors. This
 * does not record the screen at all: it drives the app's own tick(dtMs) one
 * frame at a time, grabs a screenshot after each, and hands ffmpeg an exact
 * 30 fps sequence. Every clip is reproducible frame for frame.
 *
 * Runs its own headless Chrome on a throwaway profile - never the user's.
 *
 *   node tools/capture.mjs            # all clips
 *   node tools/capture.mjs 03 07      # just these
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, readdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// machine-specific; override with env vars rather than editing this file
const CHROME = process.env.CHROME_BIN
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FFMPEG = process.env.FFMPEG_BIN || 'ffmpeg';
const VIDEO_DIR = process.env.VIDEO_DIR || './video';
const OUT = VIDEO_DIR + '/clips';
const SCREENS = VIDEO_DIR + '/screens';
const URL = process.env.CAP_URL || 'http://localhost:4173/';
const PORT = 9333;
const W = 1080, H = 1920;   // portrait, for phone
const FPS = 30;
/**
 * How much world-time each captured frame advances.
 *
 * Not 1000/30. The fly at real speed serves a dish every couple of seconds and
 * reads as frantic; feeding it a third of a frame's worth of time per frame
 * gives genuine slow motion at a full 30 fps, with every frame freshly
 * computed rather than duplicated.
 */
const TIME_SCALE = 0.34;
const DT = (1000 / FPS) * TIME_SCALE;

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

async function connect(wsUrl) {
  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) rej(new Error(m.method + ': ' + m.error.message));
      else res(m.result);
    }
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evaluate(expr, session, awaitPromise = true) {
  const r = await send('Runtime.evaluate', {
    expression: expr, awaitPromise, returnByValue: true,
  }, session);
  if (r.exceptionDetails) {
    throw new Error('page error: ' + (r.exceptionDetails.exception?.description
      || r.exceptionDetails.text));
  }
  return r.result?.value;
}

/* ---------------------------------------------------------------- clips --- */

/**
 * Each clip: how to set the page up, then how many frames to roll.
 * `setup` runs once and may scroll, move the camera, or seed game state.
 * `perFrame` runs before each capture, for anything that needs to change.
 */
const CLIPS = [
  // warm hard: the opener has to be mid-action on its very first frame, which
  // is also the thumbnail. A cold start shows an empty stand and a quiet brain.
  { id: '01', scene: 'live',         seconds: 12, warm: 900,
    caption: 'זבוב משחק מלך הפלאפל. ליד, המוח שלו רץ באמת. למטה, מה שהוא רואה.' },
  { id: '02', scene: 'slicing',      seconds: 12, timeScale: 1,
    caption: 'חתכו מוח לאלפי פרוסות וצילמו כל אחת. יצאו מזה 21 מיליון תמונות.' },
  { id: '03', scene: 'slice',        seconds: 10, timeScale: 1, warm: 0,
    caption: 'כל עיגול קטן פה הוא סיב עצבי אחד. גוגל בנתה רשת שעקבה אחרי כל אחד מהם.' },
  // 04 is the live panel of the research four-up; research.mjs fills the rest
  { id: '04', scene: 'quad',         seconds: 10, timeScale: 1, warm: 400,
    caption: '287 חוקרים ומתנדבים עברו על הכל ביד, 33 שנות אדם. ומשם לקחתי מעגל אחד.' },
  { id: '05', scene: 'stand',        seconds: 10,
    caption: 'ואז נתתי לו דוכן פלאפל. אף אחד לא לימד אותו לשחק.' },
  { id: '06', scene: 'both',         seconds: 11,
    caption: 'אותו רגע בדיוק, פעם מהצד שלנו ופעם מהצד שלו.' },
  { id: '07', scene: 'vision',       seconds: 10,
    caption: 'המוח שלו מקבל מספר אחד: כמה מעלות המטרה ימינה או שמאלה. זו כל האינפורמציה.' },
  { id: '08', scene: 'pathway',      seconds: 12,
    caption: 'שני נוירונים מושכים את אותה פקודת סיבוב לכיוונים הפוכים. ההפרש ביניהם הוא הפנייה.' },
  { id: '09', scene: 'instincts',    seconds: 12, timeScale: 1,
    caption: 'שני המעגלים האלה לא נבנו לפלאפל. אחד רודף אחרי נקבה, השני בורח ממכה.' },
  { id: '10', site: true,            seconds: 17,
    caption: 'בניתי אתר שאפשר לראות בו את כל התהליך בזמן אמת, מהמוח ועד המנה.' },
  { id: '11', scene: 'scale',        seconds: 11, timeScale: 1,
    caption: 'מוח של עכבר הוא חמש מאות מוחות של זבוב. מוח אנושי הוא שש מאות אלף.' },
  { id: '12', scene: 'future',       seconds: 13,
    caption: 'תרשים חשמלי מלא של מוח פותח דברים שלא היו אפשריים קודם.' },
  { id: '13', scene: 'punch',        seconds: 8,
    caption: 'בפעם הראשונה בהיסטוריה יש בידיים שלנו תרשים מלא של מוח שלם. הוא של זבוב.' },
];

/* ----------------------------------------------------------------- main --- */

async function main() {
  const args = process.argv.slice(2);
  // --srt rewrites the subtitle files from the list without re-rendering a
  // frame, which is what you want after only the captions have changed
  const srtOnly = args.includes('--srt');
  const only = args.filter((a) => a !== '--srt');
  const clips = only.length ? CLIPS.filter((c) => only.includes(c.id)) : CLIPS;
  if (!clips.length) { console.error('no clips matched'); process.exit(1); }

  mkdirSync(OUT, { recursive: true });
  if (srtOnly) {
    for (const clip of clips) {
      const name = clip.id + '_' + (clip.scene || 'site');
      writeSrt(join(OUT, name + '.srt'), clip);
      console.log('  ' + name + '.srt');
    }
    return;
  }
  mkdirSync(SCREENS, { recursive: true });
  const profile = join(tmpdir(), 'fly-capture-profile-' + Date.now());
  mkdirSync(profile, { recursive: true });

  console.log('launching headless chrome on a throwaway profile');
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile,
    '--window-size=' + W + ',' + H,
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--disable-extensions',
    '--no-first-run',
    '--no-default-browser-check',
    '--use-gl=angle',
    '--use-angle=d3d11',
    '--enable-unsafe-swiftshader',
    'about:blank',
  ], { stdio: 'ignore' });

  // wait for the debugging endpoint
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(500);
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/version');
      if (r.ok) target = await r.json();
    } catch { /* not up yet */ }
  }
  if (!target) { chrome.kill(); throw new Error('chrome did not expose CDP'); }
  await connect(target.webSocketDebuggerUrl);
  console.log('connected:', target.Browser);

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride',
    { width: W, height: H, deviceScaleFactor: 1, mobile: false }, sessionId);

  for (const clip of clips) {
    process.stdout.write('  ' + clip.id + ' ' + (clip.scene || 'site').padEnd(12));
    const frameDir = join(tmpdir(), 'fly-frames-' + clip.id);
    rmSync(frameDir, { recursive: true, force: true });
    mkdirSync(frameDir, { recursive: true });

    // the site clip films the real page; every other clip films the stage
    const app = clip.site ? 'window.__fly' : 'window.S';
    await send('Page.navigate', { url: clip.site
      ? URL + '?tour=0'
      : URL + 'shoot.html?scene=' + clip.scene + (process.env.NOCAP ? '&nocap=1' : '') },
      sessionId);

    let ready = false;
    for (let i = 0; i < 120 && !ready; i++) {
      await sleep(250);
      ready = await evaluate(`!!(${app} && ${app}.tick)`, sessionId).catch(() => false);
    }
    if (!ready) throw new Error(clip.id + ': scene never booted');
    await evaluate(app + '.driven = true; true;', sessionId);

    // a still frame is a still frame; scenes that animate get eased in
    const dt = (1000 / FPS) * (clip.timeScale ?? TIME_SCALE);
    await evaluate(`for (let i = 0; i < ${clip.warm ?? 120}; i++) ${app}.tick(${dt}); true;`,
      sessionId);

    const total = Math.round(clip.seconds * FPS);
    // a constant-rate scroll, with a beat of stillness at each end so the clip
    // does not start or finish mid-move
    const HOLD = 24;
    const span = clip.site
      ? await evaluate('document.documentElement.scrollHeight - window.innerHeight',
        sessionId)
      : 0;
    for (let frame = 0; frame < total; frame++) {
      if (clip.site) {
        const k = Math.min(1, Math.max(0, (frame - HOLD) / (total - HOLD * 2)));
        await evaluate(`window.scrollTo(0, ${Math.round(k * span)}); true;`, sessionId);
      }
      await evaluate(`${app}.tick(${dt}); true;`, sessionId);
      const shot = await send('Page.captureScreenshot',
        { format: 'png', captureBeyondViewport: false }, sessionId);
      writeFileSync(join(frameDir, String(frame).padStart(5, '0') + '.png'),
        Buffer.from(shot.data, 'base64'));
    }

    const name = clip.id + '_' + (clip.scene || 'site');
    const still = readdirSync(frameDir).sort().at(Math.floor(total / 2));
    copyFileSync(join(frameDir, still), join(SCREENS, name + '.png'));

    await encode(frameDir, join(OUT, name + '.mp4'));
    writeSrt(join(OUT, name + '.srt'), clip);
    rmSync(frameDir, { recursive: true, force: true });
    console.log('  ' + total + ' frames  ' + clip.seconds + 's');
  }

  await send('Target.closeTarget', { targetId });
  ws.close();
  chrome.kill();
  // chrome holds a lock on the profile for a moment after kill; it is a temp
  // dir either way, so never fail the run over it
  await sleep(600);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* fine */ }
  console.log('\ndone ->', OUT);
}

function encode(dir, out) {
  return new Promise((res, rej) => {
    const p = spawn(FFMPEG, [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-framerate', String(FPS),
      '-i', join(dir, '%05d.png'),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '17',
      '-pix_fmt', 'yuv420p',
      '-r', String(FPS), '-fps_mode', 'cfr',
      out,
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

function writeSrt(path, clip) {
  writeFileSync(path,
    '1\n' + stamp(0) + ' --> ' + stamp(clip.seconds) + '\n' + clip.caption + '\n',
    'utf8');
}

main().catch((e) => { console.error('\nFAILED:', e.message); process.exit(1); });
