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
import { zipStore } from './zipstore.mjs';

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
  // A resource is shaped by its media type: streamType 5 with a video stream
  // for a still, 2 for video, 3 with an audio stream for sound. Cloning one
  // shape for all of them declares a PNG to be a video and a WAV to have no
  // audio, and Filmora rejects the project outright. Pull one of each from a
  // project that contains all three.
  const resByKind = (() => {
    const src = process.env.WFP_AUDIO_TEMPLATE
      || 'C:/Users/eliha/Videos/Benefits Wallet video/filmora_project/Benefits Wallet - draft v7.wfp';
    const py = `
import zipfile, json
z = zipfile.ZipFile(r"${src}")
n = [x for x in z.namelist() if x.endswith("timeline.wesproj")][0]
d = json.loads(z.read(n).decode("utf-8"))
out = {}
for r in d["resources"]:
    ext = r.get("filename","").split(".")[-1].lower()
    kind = "video" if ext in ("mp4","mov") else "audio" if ext in ("mp3","m4a","wav") else "image"
    out.setdefault(kind, r)
print(json.dumps(out))
`;
    try {
      return JSON.parse(execFileSync('python', ['-c', py], { maxBuffer: 1 << 26 }).toString());
    } catch { return {}; }
  })();
  const kindOfPath = (p) => (/\.(mp4|mov)$/i.test(p) ? 'video'
    : /\.(wav|mp3|m4a)$/i.test(p) ? 'audio' : 'image');

  const resources = [];
  const addResource = (path, lengthUnits) => {
    const kind = kindOfPath(path);
    const tpl = resByKind[kind] || resByKind.video || tl.resources[0];
    const r = JSON.parse(JSON.stringify(tpl));
    r.sourceUuid = uuid();
    r.filename = fileUrl(path);
    r.mediaLength = kind === 'image' ? 0 : lengthUnits;
    if (r.vidStreamInfo) {
      for (const v of r.vidStreamInfo) {
        v.width = 1080; v.height = 1920; v.xRatio = 1080; v.yRatio = 1920;
        v.frameRate = { den: 1, num: 30 };
        v.streamLength = kind === 'image' ? 0 : lengthUnits;
      }
    }
    if (r.audStreamInfo) {
      for (const a of r.audStreamInfo) a.streamLength = lengthUnits;
    }
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
  //
  // Keep the template's trackInfos exactly as Filmora wrote them - count,
  // order, uuids, bus references, userData - and only fill the clip lists.
  // Building tracks from scratch produced a project Filmora refused to open,
  // while a template with one file swapped opened fine, so the structure here
  // is load bearing in ways that are not visible in the JSON.
  const videoTracks = t.trackInfos.filter((x) => x.trackType === 1);
  const audioTracks = t.trackInfos.filter((x) => x.trackType === 2);
  if (videoTracks.length < 2 || audioTracks.length < 1) {
    throw new Error('template needs at least two video tracks and one audio track');
  }
  for (const tr of t.trackInfos) tr.clipList = [];
  videoTracks[0].clipList = videoClips;   // the fifteen clips
  videoTracks[1].clipList = capClips;     // captions above them
  audioTracks[0].clipList = sfxClips;     // effects; the rest stay empty for
                                          // the song and the voiceover

  // --- the media bin -------------------------------------------------------
  //
  // timeline.wesproj and medias_info.json are two parallel views of the same
  // files, keyed by different id spaces, and Filmora refuses a project where
  // the bin describes media the timeline does not use. Rebuild the bin from
  // the same source list rather than leaving the template's.
  const binTpl = JSON.parse(
    files['ProjectFolder/Medias/medias_info.json'].toString('utf8'));
  const oldItems = Object.entries(binTpl.media_items);
  const tlItemId = oldItems.find(([, v]) => v.media_type === 1048576)?.[0];
  const imgItem = oldItems.find(([, v]) => v.media_type === 16)?.[1];
  const vidItem = oldItems.find(([, v]) => v.media_type === 2)?.[1];
  const mediaJsonFor = (id) => {
    const k = `ProjectFolder/Medias/${id}/media.json`;
    return files[k] ? JSON.parse(files[k].toString('utf8')) : null;
  };
  const imgMediaTpl = mediaJsonFor(oldItems.find(([, v]) => v.media_type === 16)?.[0]);
  const vidMediaTpl = mediaJsonFor(oldItems.find(([, v]) => v.media_type === 2)?.[0]);

  let guidN = 0;
  const guid = () => {
    guidN++;
    const h = (x, w) => x.toString(16).toUpperCase().padStart(w, '0');
    return `{${h(0xA0000000 + guidN, 8)}-${h(guidN, 4)}-4${h(guidN % 0xfff, 3)}`
      + `-8${h((guidN * 13) % 0xfff, 3)}-${h(guidN * 7654321, 12).slice(-12)}}`;
  };

  // drop every per-media folder the template brought, then write ours
  for (const k of Object.keys(files)) {
    if (/^ProjectFolder\/Medias\/\{[^/]+\}\/media\.json$/.test(k)) delete files[k];
  }

  const mediaItems = {};
  const now = Math.floor(Date.now() / 1000);
  for (const r of resources) {
    const path = r.filename.replace(/^file:\//, '');
    const kind = kindOfPath(path);
    const id = guid();
    const base = kind === 'image' ? imgItem : vidItem;
    if (!base) continue;
    const item = JSON.parse(JSON.stringify(base));
    item.id = id;
    item.download_url = path;
    item.name = path.split('/').pop().replace(/\.[^.]+$/, '');
    item.import_time = now;
    item.media_type = kind === 'image' ? 16 : 2;
    item.media_length = kind === 'image' ? 50000000 : (r.mediaLength || 50000000);
    delete item.src_md5;
    mediaItems[id] = item;

    const mTpl = kind === 'image' ? imgMediaTpl : vidMediaTpl;
    if (mTpl) {
      const m = JSON.parse(JSON.stringify(mTpl));
      m.file_name = path;
      if (m.sourceInfo?.basicInfo) {
        m.sourceInfo.basicInfo.mediaLength = kind === 'image' ? 0 : (r.mediaLength || 0);
      }
      for (const vs of m.sourceInfo?.vidStreamInfos || []) {
        vs.streamLength = kind === 'image' ? 0 : (r.mediaLength || 0);
        vs.width = 1080; vs.height = 1920; vs.xRatio = 1080; vs.yRatio = 1920;
        vs.frameRate = { den: 1, num: 30 };
      }
      files[`ProjectFolder/Medias/${id}/media.json`] =
        Buffer.from(JSON.stringify(m), 'utf8');
    }
  }

  // the timeline is itself a bin item; keep its id so its folder still matches
  const tlItem = JSON.parse(JSON.stringify(binTpl.media_items[tlItemId]));
  tlItem.duration = total;
  tlItem.create_time = now;
  tlItem.name = PROJECT_NAME;
  mediaItems[tlItemId] = tlItem;

  binTpl.media_items = mediaItems;
  binTpl.media_structure = {
    visible: 'true',
    SerializeDataOnlyProjectUsered: 'false',
    media_item: tlItemId,
  };
  files['ProjectFolder/Medias/medias_info.json'] =
    Buffer.from(JSON.stringify(binTpl), 'utf8');

  // extra.json is UI bookkeeping for clips that no longer exist; start clean
  const extraKey = Object.keys(files).find((k) => k.endsWith('/extra.json'));
  if (extraKey) {
    files[extraKey] = Buffer.from(JSON.stringify({
      fontNameInfo: [], usedBizFont: [], usedTemplateResInfo: {},
      mediaClipsMapInfo: {}, allMarkersInfo: { beatDetectInfo: {} },
      pendingMarkersInfo: {}, highlightInfo: {}, TextSentence: { TextSentence: [] },
    }), 'utf8');
  }

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
