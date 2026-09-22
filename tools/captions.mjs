/**
 * One subtitle file for the whole edit, chunked for reading rather than for
 * the page.
 *
 * The per-clip .srt files each hold a single line covering ten or twelve
 * seconds, which is right for a caption burnt under one shot and wrong for a
 * phone: nobody reads a 30-word block. This splits the narration into pieces of
 * a few words, gives each piece a slice of its clip proportional to its length,
 * and writes absolute timecodes across the whole 2:46 - which is what CapCut's
 * subtitle import expects.
 *
 * The text is the narration as written, so the captions and the voice say the
 * same words. If a line changes in the script, change it here.
 *
 *   node tools/captions.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const VIDEO_DIR = process.env.VIDEO_DIR || './video';
const OUT = join(VIDEO_DIR, 'captions');

/** Longest a single caption may run, in words, before it is split. */
const MAX_WORDS = 8;
/** Below this a caption is a fragment, not a line; it gets merged into its
 *  neighbour rather than flashing on its own. */
const MIN_WORDS = 3;
/** Nothing should sit on screen for less than this; it reads as a flicker. */
const MIN_SEC = 1.0;

/**
 * Words that must not be the last thing on a caption.
 *
 * Hebrew hangs a lot of weight on short function words, and a line that ends on
 * one leaves the reader mid-thought: "ופה התשובה למה הוא" and then a cut. They
 * get pushed to the front of the next caption instead.
 */
const DANGLING = new Set([
  'של', 'את', 'אל', 'עם', 'על', 'כי', 'אם', 'מה', 'למה', 'מי', 'זה', 'זו',
  'הוא', 'היא', 'הם', 'הן', 'לא', 'גם', 'רק', 'כל', 'בין', 'או', 'אבל',
  'כמה', 'איזה', 'איפה', 'כשהוא', 'שהוא', 'שזה',
]);

/** [clip length in seconds, narration] in timeline order. */
const SCRIPT = [
  [12, 'זה זבוב שמשחק מלך הפלאפל. ליד, המוח שלו רץ באמת, '
    + 'ולמטה מה שהוא רואה מהעיניים שלו. הכל באותו רגע.'],
  [12, 'וככה מיפו אותו. חתכו מוח של זבוב לאלפי פרוסות, '
    + 'כל אחת דקה פי אלף משערה, וצילמו כל אחת מהן במיקרוסקופ אלקטרונים. '
    + 'יצאו מזה עשרים ואחד מיליון תמונות.'],
  [10, 'כל עיגול קטן בתמונה הזאת הוא חתך של סיב עצבי אחד. '
    + 'גוגל בנתה רשת נוירונים שעוקבת אחרי כל סיב לבד, דרך כל הפרוסות.'],
  [10, 'ואחריה מאתיים שמונים ושבעה חוקרים ומתנדבים עברו על הכל ביד, '
    + 'שלושים ושלוש שנות אדם. מתוך המפה שיצאה לקחתי מעגל אחד.'],
  [10, 'ואז נתתי לו דוכן פלאפל. אף אחד לא לימד אותו לשחק, '
    + 'ואף אחד לא תכנת אותו לזוז.'],
  [11, 'אותו רגע בדיוק, פעמיים. למעלה מה שאנחנו רואים, למטה מה שהוא רואה. '
    + 'בשבילו אין דוכן ואין מגש, יש כתם כהה.'],
  [10, 'ופה התשובה למה הוא זז לאן שהוא זז. המוח שלו לא יודע מה זה חומוס. '
    + 'הוא מקבל מספר אחד: כמה מעלות המטרה ימינה או שמאלה.'],
  [12, 'וכל השאר זה החיווט. שני נוירונים מושכים את אותה פקודת סיבוב לכיוונים הפוכים. '
    + 'אחד דוחף כשהמטרה בצד, השני בולם כשהיא במרכז, '
    + 'וההפרש ביניהם הוא הפנייה.'],
  [12, 'והכי מוזר, שני המעגלים האלה לא נבנו בשביל פלאפל. '
    + 'אחד מהם זה מה שזכר מפעיל כשהוא רודף אחרי נקבה, '
    + 'והשני נבנה כדי לברוח ממכה. פה הוא זה שסוטר לזבוב.'],
  [17, 'בניתי אתר שאפשר לראות בו את כל התהליך בזמן אמת. '
    + 'המוח מסתובב, הנוירונים נדלקים כשהם יורים, '
    + 'ורואים איך הפקודה יוצאת החוצה. '
    + 'אפשר גם לכבות נוירונים ולראות מה נשבר. הקישור בתיאור.'],
  [11, 'וזה עוד לא כלום. מוח של עכבר הוא חמש מאות ושלושה מוחות של זבוב, '
    + 'ורק אחד מהם, הצהוב, באמת הושלם. '
    + 'מוח אנושי הוא שש מאות אלף כאלה.'],
  [13, 'כשיש תרשים מלא של מוח, אפשר לראות איפה בדיוק מחלה שוברת מעגל, '
    + 'במקום לטפל בדיכאון או בפרקינסון בלי לדעת איזה חיבור השתבש.'],
  [8, 'בפעם הראשונה בהיסטוריה יש בידיים שלנו תרשים חשמלי מלא של מוח שלם. '
    + 'הוא של זבוב, והוא משחק מלך הפלאפל.'],
];

/**
 * Split on sentence ends first, because a caption that breaks mid-clause reads
 * worse than one that is a word too long; only then fall back to word count.
 */
function chunk(text) {
  const out = [];
  for (const sentence of text.split(/(?<=[.!?:])\s+/).filter(Boolean)) {
    const words = sentence.trim().split(/\s+/);
    if (words.length <= MAX_WORDS) { out.push(words.join(' ')); continue; }
    // split at a comma if one sits near the middle, otherwise every MAX_WORDS
    const parts = sentence.split(/(?<=,)\s+/).filter(Boolean);
    for (const part of parts) {
      const w = part.trim().split(/\s+/);
      if (w.length <= MAX_WORDS) { out.push(w.join(' ')); continue; }
      // balance the pieces instead of taking MAX_WORDS greedily: twelve words
      // split 6/6 reads far better than 7/5, which strands a fragment
      const n = Math.ceil(w.length / MAX_WORDS);
      const size = Math.ceil(w.length / n);
      for (let i = 0; i < w.length; i += size) {
        out.push(w.slice(i, i + size).join(' '));
      }
    }
  }
  return tidy(out);
}

/**
 * Second pass over the pieces: merge the fragments, and move a dangling word
 * forward. Done after splitting rather than during, because whether a piece is
 * too small only becomes clear once its neighbours exist.
 */
function tidy(pieces) {
  const out = pieces.slice();

  // a trailing function word belongs with what follows it
  for (let i = 0; i < out.length - 1; i++) {
    const w = out[i].split(/\s+/);
    while (w.length > 1 && DANGLING.has(w[w.length - 1].replace(/[.,:!?]$/, ''))) {
      out[i + 1] = w.pop() + ' ' + out[i + 1];
    }
    out[i] = w.join(' ');
  }

  // then fold anything still too small into the shorter neighbour
  for (let i = 0; i < out.length; i++) {
    if (out.length === 1) break;
    if (out[i].split(/\s+/).length >= MIN_WORDS) continue;
    const prev = i > 0 ? out[i - 1].split(/\s+/).length : Infinity;
    const next = i < out.length - 1 ? out[i + 1].split(/\s+/).length : Infinity;
    if (next <= prev) out.splice(i, 2, out[i] + ' ' + out[i + 1]);
    else out.splice(i - 1, 2, out[i - 1] + ' ' + out[i]);
    i = -1;   // sizes shifted; start again
  }
  return out;
}

function stamp(sec) {
  const h = String(Math.floor(sec / 3600)).padStart(2, '0');
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const s = String(Math.floor(sec % 60)).padStart(2, '0');
  const ms = String(Math.round((sec % 1) * 1000)).padStart(3, '0');
  return `${h}:${m}:${s},${ms}`;
}

mkdirSync(OUT, { recursive: true });

const lines = [];
let n = 0, t = 0, total = 0;
for (const [len, text] of SCRIPT) {
  const pieces = chunk(text);
  // time each piece by its share of the clip's characters, so a long line gets
  // long enough to read and a short one does not linger
  const weights = pieces.map((p) => p.length);
  const sum = weights.reduce((a, b) => a + b, 0);
  let cur = t;
  pieces.forEach((p, i) => {
    let d = (weights[i] / sum) * len;
    if (d < MIN_SEC) d = MIN_SEC;
    // never run past the clip
    const end = Math.min(cur + d, t + len - 0.05);
    if (end - cur < 0.3) return;
    lines.push(`${++n}\n${stamp(cur)} --> ${stamp(end)}\n${p}\n`);
    cur = end + 0.03;
  });
  t += len;
  total += pieces.length;
}

writeFileSync(join(OUT, 'captions_full.srt'), lines.join('\n'), 'utf8');
console.log(`  captions_full.srt  ${n} captions across ${t}s`);
console.log('\n-> ' + OUT);
