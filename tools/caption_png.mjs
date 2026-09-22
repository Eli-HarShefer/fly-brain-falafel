/**
 * Captions as transparent PNGs, one per subtitle line.
 *
 * Filmora reverses Hebrew in its own text tool - which is why the previous
 * project in this folder placed caption images rather than text clips. Same
 * approach here, except the images are generated instead of made by hand: a
 * browser lays out the RTL run correctly, and a screenshot of it is a PNG that
 * no editor can re-order.
 *
 * Full-frame 1080x1920 with a transparent background, so each one drops onto
 * the timeline at the origin with no scaling or positioning to get wrong.
 *
 *   node tools/caption_png.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CHROME = process.env.CHROME_BIN
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const VIDEO_DIR = process.env.VIDEO_DIR || './video';
const SRT = join(VIDEO_DIR, 'captions', 'captions_full.srt');
const OUT = join(VIDEO_DIR, 'captions', 'png');
const PORT = 9338;
const W = 1080, H = 1920;

/** Parse just enough SRT: index, in, out, text. */
function parseSrt(text) {
  const out = [];
  for (const block of text.replace(/\r/g, '').trim().split(/\n\n+/)) {
    const lines = block.split('\n');
    if (lines.length < 3) continue;
    const m = lines[1].match(/(\d+):(\d+):(\d+),(\d+)\s*-->\s*(\d+):(\d+):(\d+),(\d+)/);
    if (!m) continue;
    const t = (h, mi, s, ms) => +h * 3600 + +mi * 60 + +s + +ms / 1000;
    out.push({
      n: +lines[0],
      start: t(m[1], m[2], m[3], m[4]),
      end: t(m[5], m[6], m[7], m[8]),
      text: lines.slice(2).join(' ').trim(),
    });
  }
  return out;
}

/**
 * The caption band.
 *
 * Sits above the 384 px the platforms cover at the bottom, in the same Heebo
 * the rest of the video uses. The shadow is doing real work: a caption has to
 * stay readable over a bright figure from the paper as well as over black.
 */
const PAGE = (text) => `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@700;800;900&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;padding:0;width:${W}px;height:${H}px;background:transparent;overflow:hidden}
  .band{position:absolute;inset-inline:60px;bottom:430px;text-align:center}
  p{margin:0;font-family:Heebo,sans-serif;font-weight:800;font-size:62px;line-height:1.24;
    color:#fff;text-wrap:balance;
    text-shadow:0 4px 18px rgba(0,0,0,.92),0 2px 5px rgba(0,0,0,.95),0 0 2px rgba(0,0,0,.9)}
</style></head>
<body><div class="band"><p id="t"></p></div>
<script>document.getElementById('t').textContent = ${JSON.stringify(text)};</script>
</body></html>`;

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

async function main() {
  const cues = parseSrt(readFileSync(SRT, 'utf8'));
  if (!cues.length) throw new Error('no cues in ' + SRT);
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const profile = join(tmpdir(), 'fly-cap-' + Date.now());
  mkdirSync(profile, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile, '--window-size=' + W + ',' + H,
    '--hide-scrollbars', '--force-device-scale-factor=1',
    '--default-background-color=00000000',
    '--disable-extensions', '--no-first-run', '--no-default-browser-check',
    'about:blank',
  ], { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(500);
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/version');
      if (r.ok) target = await r.json();
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
  await send('Emulation.setDefaultBackgroundColorOverride',
    { color: { r: 0, g: 0, b: 0, a: 0 } }, sessionId);

  for (const cue of cues) {
    await send('Page.navigate',
      { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(PAGE(cue.text)) },
      sessionId);
    // the font has to be in before the shot, or the shape is wrong
    for (let i = 0; i < 40; i++) {
      await sleep(80);
      const ok = await send('Runtime.evaluate', {
        expression: 'document.fonts.load("800 62px Heebo","אבג").then(()=>document.fonts.check("800 62px Heebo","אבג"))',
        awaitPromise: true, returnByValue: true,
      }, sessionId).then((r) => r.result?.value).catch(() => false);
      if (ok) break;
    }
    const shot = await send('Page.captureScreenshot',
      { format: 'png', captureBeyondViewport: false }, sessionId);
    const name = 'cap_' + String(cue.n).padStart(3, '0') + '.png';
    writeFileSync(join(OUT, name), Buffer.from(shot.data, 'base64'));
  }

  await send('Target.closeTarget', { targetId });
  ws.close();
  chrome.kill();
  await sleep(600);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* fine */ }
  console.log('  ' + readdirSync(OUT).length + ' caption images');
  console.log('\n-> ' + OUT);
}

main().catch((e) => { console.error('\nFAILED:', e.message); process.exit(1); });
