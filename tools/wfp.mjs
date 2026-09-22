/**
 * Build a Filmora project.
 *
 * A .wfp is a zip of JSON, and the timeline lives in timeline.wesproj. Rather
 * than write that schema from a description, this takes a project Filmora
 * itself saved, keeps every structural field byte for byte, and swaps in our
 * resources and clip lists. Anything Filmora 15 needs and nobody documented is
 * therefore still present and still correct.
 *
 * Time base is 1e7 units per second. Video clips carry type 1 on a trackType 1
 * track; audio clips carry type 2 on trackType 2. Stills take a large inPoint
 * and run for outPoint - inPoint, which is how Filmora represents a frozen
 * source; that is copied from the template rather than invented.
 *
 * Captions are images on their own video track, not text clips, because
 * Filmora reverses Hebrew in its text tool. See tools/caption_png.mjs.
 *
 *   node tools/wfp.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { TIMELINE as CLIPS, CUES } from './edl.mjs';

const VIDEO_DIR = resolve(process.env.VIDEO_DIR || './video');
const TEMPLATE = process.env.WFP_TEMPLATE
  || 'C:/Users/eliha/Videos/Benefits Wallet video/filmora_project/Benefits Wallet 30s - draft.wfp';
const PROJECT_NAME = 'fly brain - draft';
const OUT_DIR = join(VIDEO_DIR, 'filmora_project');
const OUT = join(OUT_DIR, PROJECT_NAME + '.wfp');

/** Filmora counts in ten-millionths of a second. */
const T = 1e7;
/** Stills sit at a large source offset in the template; keep that convention. */
const STILL_BASE = 36000000000;

/* ------------------------------------------------------------------- zip --- */

/** Minimal store-only zip writer; Filmora's own archives use method=store. */
function zipStore(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const crcTable = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  const crc32 = (buf) => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };

  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(10, 4);
    local.writeUInt16LE(0x0800, 6);       // UTF-8 names
    local.writeUInt16LE(0, 8);            // store
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, data);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(0x031e, 4);
    cen.writeUInt16LE(10, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(0, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const cenBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cenBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cenBuf, end]);
}

/** Read the template zip with the system unzip via python, which is present. */
function readTemplate() {
  const py = `
import zipfile, json, sys, base64
z = zipfile.ZipFile(r"${TEMPLATE}")
out = {}
for n in z.namelist():
    out[n] = base64.b64encode(z.read(n)).decode()
print(json.dumps(out))
`;
  const raw = execFileSync('python', ['-c', py], { maxBuffer: 1 << 28 }).toString();
  const obj = JSON.parse(raw);
  const files = {};
  for (const [k, v] of Object.entries(obj)) files[k] = Buffer.from(v, 'base64');
  return files;
}

/* ------------------------------------------------------------------ main --- */

const uuid = (() => {
  let n = 0;
  return () => {
    n++;
    const h = (x, w) => x.toString(16).padStart(w, '0');
    return `${h(0xf1a00000 + n, 8)}-${h(n % 0xffff, 4)}-4${h(n % 0xfff, 3)}`
      + `-8${h((n * 7) % 0xfff, 3)}-${h(n * 1234567, 12).slice(-12)}`;
  };
})();

const fileUrl = (p) => 'file:/' + resolve(p).replace(/\\/g, '/');

function main() {
  const files = readTemplate();
  const tlName = Object.keys(files).find((n) => n.endsWith('timeline.wesproj'));
  if (!tlName) throw new Error('template has no timeline.wesproj');
  const tl = JSON.parse(files[tlName].toString('utf8'));
  const info = JSON.parse(files['ProjectFolder/project_info.json'].toString('utf8'));
  const t = tl.timelineInfos[0];

  // templates for each clip kind, taken from the project Filmora wrote
  const vTrack = t.trackInfos.find((x) => x.trackType === 1 && x.clipList.length);
  if (!vTrack) throw new Error('template has no video clip to copy');
  const clipTpl = vTrack.clipList.find((c) => /\.(mp4|mov)$/i.test(c.filename || ''))
    || vTrack.clipList[0];
  const imgTpl = vTrack.clipList.find((c) => /\.png$/i.test(c.filename || ''))
    || t.trackInfos.flatMap((x) => x.clipList || [])
      .find((c) => /\.png$/i.test(c.filename || ''));
  const resTpl = tl.resources[0];

  const resources = [];
  const addResource = (path, lengthUnits) => {
    const r = JSON.parse(JSON.stringify(resTpl));
    r.sourceUuid = uuid();
    r.filename = fileUrl(path);
    r.mediaLength = lengthUnits;
    return (resources.push(r), r);
  };

  const mkClip = (tpl, res, tlBegin, durUnits, still) => {
    const c = JSON.parse(JSON.stringify(tpl));
    c.sourceUuid = res.sourceUuid;
    c.filename = res.filename;
    c.thisUId = uuid();
    c.tlBegin = tlBegin;
    c.tlEnd = tlBegin + durUnits;
    c.inPoint = still ? STILL_BASE : 0;
    c.outPoint = (still ? STILL_BASE : 0) + durUnits;
    if (c.speed) {
      const secs = durUnits / T;
      c.speed.offset = still ? STILL_BASE / T : 0;
      c.speed.offsetEnd = c.speed.offset + secs;
    }
    return c;
  };

  // --- video track: the fifteen clips ---
  const videoClips = [];
  let cursor = 0;
  for (const [name, secs] of CLIPS) {
    const p = join(VIDEO_DIR, 'clips', name + '.mp4');
    if (!existsSync(p)) throw new Error('missing clip: ' + p);
    const dur = Math.round(secs * T);
    videoClips.push(mkClip(clipTpl, addResource(p, dur), cursor, dur, false));
    cursor += dur;
  }
  const total = cursor;

  // --- caption track: one image per subtitle line ---
  const capDir = join(VIDEO_DIR, 'captions', 'png');
  const srt = readFileSync(join(VIDEO_DIR, 'captions', 'captions_full.srt'), 'utf8');
  const cues = [];
  for (const block of srt.replace(/\r/g, '').trim().split(/\n\n+/)) {
    const L = block.split('\n');
    const m = L[1] && L[1].match(/(\d+):(\d+):(\d+),(\d+)\s*-->\s*(\d+):(\d+):(\d+),(\d+)/);
    if (!m) continue;
    const s = (h, mi, se, ms) => (+h * 3600 + +mi * 60 + +se + +ms / 1000);
    cues.push({ n: +L[0], start: s(m[1], m[2], m[3], m[4]), end: s(m[5], m[6], m[7], m[8]) });
  }
  const capClips = [];
  for (const c of cues) {
    const p = join(capDir, 'cap_' + String(c.n).padStart(3, '0') + '.png');
    if (!existsSync(p)) continue;
    const begin = Math.round(c.start * T);
    const dur = Math.max(Math.round((c.end - c.start) * T), Math.round(0.3 * T));
    capClips.push(mkClip(imgTpl, addResource(p, 0), begin, dur, true));
  }

  // --- sound effects ---
  const audioTpl = findAudioTemplate();
  const sfxClips = [];
  if (audioTpl) {
    for (const q of CUES) {
      const p = join(VIDEO_DIR, 'sfx', q.file + '.wav');
      if (!existsSync(p)) continue;
      const begin = Math.max(0, Math.round(q.at * T));
      const dur = Math.round(wavSeconds(p) * T);
      const a = mkClip(audioTpl, addResource(p, dur), begin, dur, false);
      a.type = 2;
      sfxClips.push(a);
    }
  }

  /** Length straight out of the WAV header; no probe process needed. */
  function wavSeconds(p) {
    const b = readFileSync(p);
    const rate = b.readUInt32LE(24);
    const byteRate = b.readUInt32LE(28);
    for (let i = 12; i < b.length - 8;) {
      const id = b.toString('ascii', i, i + 4);
      const size = b.readUInt32LE(i + 4);
      if (id === 'data') return size / byteRate;
      i += 8 + size + (size & 1);
    }
    return 1;
  }

  function findAudioTemplate() {
    const p = process.env.WFP_AUDIO_TEMPLATE
      || 'C:/Users/eliha/Videos/Benefits Wallet video/filmora_project/Benefits Wallet - draft v7.wfp';
    if (!existsSync(p)) return null;
    const py = `
import zipfile, json
z = zipfile.ZipFile(r"${p}")
n = [x for x in z.namelist() if x.endswith("timeline.wesproj")][0]
d = json.loads(z.read(n).decode("utf-8"))
for tr in d["timelineInfos"][0]["trackInfos"]:
    for c in tr.get("clipList", []):
        if c.get("type") == 2:
            print(json.dumps(c)); raise SystemExit
`;
    try {
      return JSON.parse(execFileSync('python', ['-c', py], { maxBuffer: 1 << 26 }).toString());
    } catch { return null; }
  }

  // --- assemble the tracks ---
  const blank = (trackType, tag) => {
    const base = t.trackInfos.find((x) => x.trackType === trackType) || t.trackInfos[0];
    const tr = JSON.parse(JSON.stringify(base));
    tr.clipList = [];
    tr.uuid = uuid();
    if (tag !== undefined) tr.trackTag = tag;
    return tr;
  };

  const tracks = [];
  const aVoice = blank(2, null); tracks.push(aVoice);          // narration, empty
  const aMusic = blank(2, null); tracks.push(aMusic);          // TikTok song, empty
  const aSfx = blank(2, 1); aSfx.clipList = sfxClips; tracks.push(aSfx);
  const vMain = blank(1, 2); vMain.clipList = videoClips; tracks.push(vMain);
  const aSpare = blank(2, 3); tracks.push(aSpare);
  const vCap = blank(1, 4); vCap.clipList = capClips; tracks.push(vCap);

  t.trackInfos = tracks;
  tl.resources = resources;

  info.project_file_name = PROJECT_NAME;
  info.project_timeline_duration = total;
  info.project_timeline_framerate = [30, 1];
  info.project_timeline_resolution = [1080, 1920];
  info.project_date_modify = Math.floor(Date.now() / 1000);
  info.proj_zip_save_path = resolve(OUT).replace(/\\/g, '/');
  t.frameRate = { den: 1, num: 30 };
  t.resolutionWidth = 1080;
  t.resolutionHeight = 1920;

  files[tlName] = Buffer.from(JSON.stringify(tl), 'utf8');
  files['ProjectFolder/project_info.json'] = Buffer.from(JSON.stringify(info, null, 4), 'utf8');

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, zipStore(Object.entries(files)));

  console.log(`  video   ${videoClips.length} clips`);
  console.log(`  caption ${capClips.length} images`);
  console.log(`  sfx     ${sfxClips.length} cues`);
  console.log(`  length  ${(total / T).toFixed(0)}s`);
  console.log('\n-> ' + OUT);
}

main();
