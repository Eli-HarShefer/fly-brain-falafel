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
import { TIMELINE, AT as at, CUES } from './edl.mjs';

const FFMPEG = process.env.FFMPEG_BIN || 'ffmpeg';
const VIDEO_DIR = process.env.VIDEO_DIR || './video';
const CLIPS = VIDEO_DIR + '/clips';
const SFX = VIDEO_DIR + '/sfx';
const OUT = VIDEO_DIR + '/PREVIEW.mp4';

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
  for (const { file } of CUES) {
    const f = join(SFX, file + '.wav');
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
  for (const { file } of CUES) args.push('-i', join(SFX, file + '.wav'));

  const parts = CUES.map(({ at: when, gain }, i) => {
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
