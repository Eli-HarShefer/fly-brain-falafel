/**
 * The queue: coalition MKs of the 37th government (Likud, Shas, Otzma Yehudit,
 * Religious Zionism, New Hope), as of the September 2026 line-up.
 *
 * These are caricatures in the ordinary political-cartoon vocabulary - hair,
 * glasses, headwear, suit colour - and nothing here is meant as a real quote.
 * The grumbles are about falafel.
 *
 * Edit this list freely; everything downstream is data-driven. Drop an entry,
 * add one, change a colour, and the stand picks it up.
 */

export const MKS = [
  {
    id: 'netanyahu',
    name: 'ביבי',
    full: 'בנימין נתניהו',
    party: 'הליכוד',
    suit: '#1b2431', tie: '#2f6fb5', skin: '#dbab80',
    hair: { style: 'swept', color: '#e8e5df' },
    head: null, beard: null, glasses: null,
    lines: ['יש לי ישיבה בעוד רגע', 'זה ייקח עוד הרבה?'],
  },
  {
    id: 'bengvir',
    name: 'בן גביר',
    full: 'איתמר בן גביר',
    party: 'עוצמה יהודית',
    suit: '#222a33', tie: '#8c2f2a', skin: '#d8a578',
    hair: { style: 'short', color: '#1d1713' },
    head: 'kippah-black', beard: 'full', glasses: 'rect',
    lines: ['אני רוצה את זה עכשיו!', 'מי אחראי פה?'],
  },
  {
    id: 'smotrich',
    name: 'סמוטריץ׳',
    full: 'בצלאל סמוטריץ׳',
    party: 'הציונות הדתית',
    suit: '#2a3340', tie: '#4a6f8c', skin: '#dbab80',
    hair: { style: 'short', color: '#2b2119' },
    head: 'kippah-knit', beard: 'goatee', glasses: 'rect',
    lines: ['כמה זה עולה?', 'יש פה חריגה מהתקציב'],
  },
  {
    id: 'deri',
    name: 'דרעי',
    full: 'אריה דרעי',
    party: 'ש״ס',
    suit: '#1a1a20', tie: '#3b3b46', skin: '#d6a074',
    hair: { style: 'short', color: '#8a8378' },
    head: 'hat', beard: 'full-grey', glasses: 'rect',
    lines: ['בסבלנות, בסבלנות', 'תן לי מנה גדולה'],
  },
  {
    id: 'levin',
    name: 'לוין',
    full: 'יריב לוין',
    party: 'הליכוד',
    suit: '#242c38', tie: '#5c6b7a', skin: '#dbab80',
    hair: { style: 'side', color: '#6f6a62' },
    head: null, beard: 'moustache', glasses: 'round',
    lines: ['יש פה נוהל ברור', 'אני מבקש רפורמה בתור'],
  },
  {
    id: 'barkat',
    name: 'ברקת',
    full: 'ניר ברקת',
    party: 'הליכוד',
    suit: '#2d3542', tie: '#3f8f78', skin: '#dbab80',
    hair: { style: 'bald', color: '#9a9287' },
    head: null, beard: null, glasses: null,
    lines: ['אפשר לייעל את זה', 'זמן זה כסף'],
  },
  {
    id: 'struck',
    name: 'סטרוק',
    full: 'אורית סטרוק',
    party: 'הציונות הדתית',
    suit: '#3a2f42', tie: null, skin: '#dbab80',
    hair: { style: 'none', color: '#2b2119' },
    head: 'scarf', beard: null, glasses: 'round',
    lines: ['בלי חומוס בבקשה', 'נו, כבר חצי שעה'],
  },
  {
    id: 'golan',
    name: 'מאי גולן',
    full: 'מאי גולן',
    party: 'הליכוד',
    suit: '#42303a', tie: null, skin: '#e0b48a',
    hair: { style: 'long', color: '#c9a45e' },
    head: null, beard: null, glasses: null,
    lines: ['אני ממהרת!', 'תצלם אותי עם הפלאפל'],
  },
  {
    id: 'karhi',
    name: 'כרעי',
    full: 'שלמה כרעי',
    party: 'הליכוד',
    suit: '#26303c', tie: '#7a4a8c', skin: '#d8a578',
    hair: { style: 'short', color: '#1d1713' },
    head: 'kippah-knit', beard: 'stubble', glasses: null,
    lines: ['יש פה קליטה?', 'עוד שתי דקות ואני הולך'],
  },
  {
    id: 'zohar',
    name: 'מיקי זוהר',
    full: 'מיקי זוהר',
    party: 'הליכוד',
    suit: '#232b36', tie: '#c26b3a', skin: '#d8a578',
    hair: { style: 'short', color: '#241c16' },
    head: null, beard: 'stubble', glasses: null,
    lines: ['תכף מתחיל משחק', 'שים הרבה צ׳יפס'],
  },
  {
    id: 'saar',
    name: 'סער',
    full: 'גדעון סער',
    party: 'תקווה חדשה',
    suit: '#2b333d', tie: '#3f5c8c', skin: '#dbab80',
    hair: { style: 'side', color: '#8f8a82' },
    head: null, beard: null, glasses: 'rect',
    lines: ['אני עובר לתור השני', 'זה לא מה שסיכמנו'],
  },
  {
    id: 'eliyahu',
    name: 'אליהו',
    full: 'עמיחי אליהו',
    party: 'עוצמה יהודית',
    suit: '#2a2f26', tie: '#6b7a4a', skin: '#d8a578',
    hair: { style: 'short', color: '#3a2b1f' },
    head: 'kippah-knit', beard: 'full', glasses: null,
    lines: ['שים חריף', 'אני לא ממהר... בעצם כן'],
  },
];

/** Deal a shuffled queue so the same MK does not appear twice in a row. */
export function makeDealer(rng) {
  let bag = [];
  return function next() {
    if (!bag.length) {
      bag = MKS.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const t = bag[i]; bag[i] = bag[j]; bag[j] = t;
      }
    }
    return bag.pop();
  };
}
