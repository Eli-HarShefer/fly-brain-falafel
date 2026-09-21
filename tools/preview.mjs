/**
 * A watchable cut of the whole video, so the edit can be reviewed before
 * anyone rebuilds it by hand in an editor.
 *
 * It is not a CapCut project and does not pretend to be one. It is the fifteen
 * clips in order with the sound design in place, which is the part you cannot
 * judge from a folder of files: whether the rhythm holds, whether a cue lands
 * early, whether the riser into the last shot arrives when it should.
 *
 * Hard cuts throughout, which is honest rather than lazy - in this style the
 * whoosh *is* the transition as far as the ear is concerned, and the dissolves
 * and zooms in EDIT.md are applied in the editor afterwards.
 *
 * The music track is deliberately absent: the song comes from the TikTok
 * gallery, inside the app, and never touches this file.
 *
 *   node tools/preview.mjs
 */
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const FFMPEG = process.env.FFMPEG_BIN || 'ffmpeg';
const VIDEO_DIR = process.env.VIDEO_DIR || './video';
const CLIPS = VIDEO_DIR + '/clips';
const SFX = VIDEO_DIR + '/sfx';
const OUT = VIDEO_DIR + '/PREVIEW.mp4';

/** In order, with the length each one contributes to the timeline. */
const TIMELINE = [
  ['01_quad', 12], ['02_slicing', 12], ['03_slice', 10], ['04_effort', 13],
  ['05_quote_murthy', 7], ['06_circuit', 8], ['07_stand', 10], ['08_both', 11],
  ['09_vision', 10], ['10_pathway', 12], ['11_instincts', 12], ['12_site', 17],
  ['13_scale', 11], ['14_future', 13], ['15_punch', 8],
];

/** Start time of each clip, derived so the cue list below stays readable. */
const at = {};
{
  let t = 0;
  for (const [name, len] of TIMELINE) { at[name.slice(0, 2)] = t; t += len; }
  at.end = t;
}

/**
 * Every sound cue: [file, when, gain].
 *
 * Transition cues land slightly *before* the cut they cover, because a whoosh
 * that starts on the frame of the cut reads as late - the ear wants the air to
 * be already moving when the picture changes.
 */
const CUES = [
  // the opener: labels arriving
  ['click', at['01'] + 0.35, 0.5],
  ['click', at['01'] + 0.7, 0.45],
  ['click', at['01'] + 1.05, 0.45],
  ['click', at['01'] + 1.4, 0.4],

  ['whoosh', at['02'] - 0.25, 0.8],
  ['swish', at['03'] - 0.2, 0.75],

  ['boom_tiktok', at['04'] - 0.15, 0.7],
  ['click', at['04'] + 1.6, 0.5],
  ['click', at['04'] + 5.2, 0.5],
  ['click', at['04'] + 8.8, 0.5],

  ['shutter', at['05'] + 0.35, 0.6],

  ['whoosh', at['06'] - 0.25, 0.75],
  ['swish', at['07'] - 0.2, 0.7],

  // the fly grabbing a tray, three times through the clip
  ['pop', at['07'] + 2.4, 0.5],
  ['pop', at['07'] + 5.1, 0.5],
  ['pop', at['07'] + 7.8, 0.5],

  ['whoosh', at['08'] - 0.25, 0.75],
  ['boom_tiktok', at['09'] - 0.15, 0.7],
  ['click', at['09'] + 0.6, 0.5],
  // no cue into 10: it is the same argument continuing

  ['shutter', at['11'] - 0.15, 0.7],
  ['pop', at['11'] + 0.5, 0.5],
  ['pop', at['11'] + 1.0, 0.5],
  ['pop', at['11'] + 1.5, 0.5],
  ['pop', at['11'] + 2.0, 0.5],

  ['whoosh', at['12'] - 0.25, 0.75],

  ['boom', at['13'], 0.8],
  ['pop', at['13'] + 0.5, 0.6],

  ['swish', at['14'] - 0.2, 0.7],
  ['click', at['14'] + 1.2, 0.5],
  ['click', at['14'] + 4.8, 0.5],
  ['click', at['14'] + 8.4, 0.5],

  // the whole ending hangs on these two
  ['riser', at['15'] - 3.6, 0.85],
  ['sub_drop', at['15'] + 0.1, 0.9],
];

function run(args) {
  return new Promise((res, rej) => {
    const p = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'inherit'] });
    p.on('exit', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c))));
  });
}

async function main() {
  for (const [name] of TIMELINE) {
    const f = join(CLIPS, name + '.mp4');
    if (!existsSync(f)) throw new Error('missing clip: ' + f);
  }
  for (const [name] of CUES) {
    const f = join(SFX, name + '.wav');
    if (!existsSync(f)) throw new Error('missing sound: ' + f);
  }

  // 1. the picture: a plain concat, every clip is already 1080x1920 30fps CFR
  const listFile = join(tmpdir(), 'fly-preview-list.txt');
  writeFileSync(listFile,
    TIMELINE.map(([n]) => "file '" + join(CLIPS, n + '.mp4').replace(/\\/g, '/') + "'")
      .join('\n') + '\n', 'utf8');
  const silent = join(tmpdir(), 'fly-preview-video.mp4');
  console.log('cutting picture');
  await run(['-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', silent]);

  // 2. the sound: every cue delayed to its mark, summed, then laid under
  console.log('placing ' + CUES.length + ' sound cues');
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', silent];
  for (const [name] of CUES) args.push('-i', join(SFX, name + '.wav'));

  const parts = CUES.map(([, when, gain], i) => {
    const ms = Math.max(0, Math.round(when * 1000));
    return `[${i + 1}:a]adelay=${ms}|${ms},volume=${gain}[c${i}]`;
  });
  parts.push(CUES.map((_, i) => `[c${i}]`).join('')
    + `amix=inputs=${CUES.length}:normalize=0:dropout_transition=0,`
    + `alimiter=limit=0.95,apad,atrim=0:${at.end},aresample=48000[a]`);

  args.push('-filter_complex', parts.join(';'),
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart', '-shortest', OUT);
  await run(args);

  rmSync(listFile, { force: true });
  rmSync(silent, { force: true });
  console.log('\n-> ' + OUT + '  (' + at.end + 's)');
}

main().catch((e) => { console.error('\nFAILED:', e.message); process.exit(1); });
