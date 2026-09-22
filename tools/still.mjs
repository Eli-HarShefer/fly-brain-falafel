/**
 * One frame per scene, for checking a layout without paying for a whole clip.
 *
 * Same headless Chrome and same driven tick as tools/capture.mjs, but it stops
 * after warming the scene and writes a single PNG. Use it while moving type
 * around; use capture.mjs when the layout is settled.
 *
 *   node tools/still.mjs pathway courtship
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CHROME = process.env.CHROME_BIN
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = (process.env.VIDEO_DIR || './video') + '/stills';
const URL = process.env.CAP_URL || 'http://localhost:4173/';
const PORT = 9334;
const W = 1080, H = 1920;

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

async function main() {
  const scenes = process.argv.slice(2);
  if (!scenes.length) { console.error('usage: node tools/still.mjs <scene>...'); process.exit(1); }
  mkdirSync(OUT, { recursive: true });
  const profile = join(tmpdir(), 'fly-still-profile-' + Date.now());
  mkdirSync(profile, { recursive: true });

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

  for (const scene of scenes) {
    await send('Page.navigate', { url: URL + 'shoot.html?scene=' + scene + (process.env.NOCAP ? '&nocap=1' : '') }, sessionId);
    let ready = false;
    for (let i = 0; i < 90 && !ready; i++) {
      await sleep(250);
      ready = await evaluate('!!(window.S && window.S.ready)', sessionId).catch(() => false);
    }
    if (!ready) { console.log(scene, 'never booted'); continue; }
    await evaluate('window.S.driven = true; true;', sessionId);
    await evaluate('for (let i = 0; i < 260; i++) window.S.tick(11.3); true;', sessionId);
    const shot = await send('Page.captureScreenshot',
      { format: 'png', captureBeyondViewport: false }, sessionId);
    writeFileSync(join(OUT, scene + '.png'), Buffer.from(shot.data, 'base64'));
    console.log('  ' + scene);
  }

  await send('Target.closeTarget', { targetId });
  ws.close();
  chrome.kill();
  await sleep(600);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* fine */ }
  console.log('->', OUT);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
