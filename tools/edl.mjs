/**
 * The edit itself, as data: what plays when, and what is heard over it.
 *
 * Both the preview renderer and the Filmora project builder read this, so the
 * cut they produce cannot drift apart. Change a duration or move a cue here and
 * re-run either one.
 *
 * Seconds throughout. The builders convert to whatever their format counts in.
 */

/** [clip file stem, seconds] in timeline order. */
export const TIMELINE = [
  ['01_quad', 12], ['02_slicing', 12], ['03_slice', 10], ['04_effort', 13],
  ['05_quote_murthy', 7], ['06_circuit', 8], ['07_stand', 10], ['08_both', 11],
  ['09_vision', 10], ['10_pathway', 12], ['11_instincts', 12], ['12_site', 17],
  ['13_scale', 11], ['14_future', 13], ['15_punch', 8],
];

/** Start time of each clip, keyed by its two-digit number. */
export const AT = (() => {
  const at = {};
  let t = 0;
  for (const [name, len] of TIMELINE) { at[name.slice(0, 2)] = t; t += len; }
  at.end = t;
  return at;
})();

/**
 * Sound cues: {file, at, gain}.
 *
 * Transition cues land slightly before the cut they cover, because a whoosh
 * that starts on the frame of the cut reads as late - the ear wants the air to
 * be already moving when the picture changes.
 */
export const CUES = [
  { file: 'click', at: AT['01'] + 0.35, gain: 0.5 },
  { file: 'click', at: AT['01'] + 0.7, gain: 0.45 },
  { file: 'click', at: AT['01'] + 1.05, gain: 0.45 },
  { file: 'click', at: AT['01'] + 1.4, gain: 0.4 },

  { file: 'whoosh', at: AT['02'] - 0.25, gain: 0.8 },
  { file: 'swish', at: AT['03'] - 0.2, gain: 0.75 },

  { file: 'boom_tiktok', at: AT['04'] - 0.15, gain: 0.7 },
  { file: 'click', at: AT['04'] + 1.6, gain: 0.5 },
  { file: 'click', at: AT['04'] + 5.2, gain: 0.5 },
  { file: 'click', at: AT['04'] + 8.8, gain: 0.5 },

  { file: 'shutter', at: AT['05'] + 0.35, gain: 0.6 },

  { file: 'whoosh', at: AT['06'] - 0.25, gain: 0.75 },
  { file: 'swish', at: AT['07'] - 0.2, gain: 0.7 },
  { file: 'pop', at: AT['07'] + 2.4, gain: 0.5 },
  { file: 'pop', at: AT['07'] + 5.1, gain: 0.5 },
  { file: 'pop', at: AT['07'] + 7.8, gain: 0.5 },

  { file: 'whoosh', at: AT['08'] - 0.25, gain: 0.75 },

  { file: 'boom_tiktok', at: AT['09'] - 0.15, gain: 0.7 },
  { file: 'click', at: AT['09'] + 0.6, gain: 0.5 },
  // nothing into 10: it is the same argument continuing

  { file: 'shutter', at: AT['11'] - 0.15, gain: 0.7 },
  { file: 'pop', at: AT['11'] + 0.5, gain: 0.5 },
  { file: 'pop', at: AT['11'] + 1.0, gain: 0.5 },
  { file: 'pop', at: AT['11'] + 1.5, gain: 0.5 },
  { file: 'pop', at: AT['11'] + 2.0, gain: 0.5 },

  { file: 'whoosh', at: AT['12'] - 0.25, gain: 0.75 },

  { file: 'boom', at: AT['13'], gain: 0.8 },
  { file: 'pop', at: AT['13'] + 0.5, gain: 0.6 },

  { file: 'swish', at: AT['14'] - 0.2, gain: 0.7 },
  { file: 'click', at: AT['14'] + 1.2, gain: 0.5 },
  { file: 'click', at: AT['14'] + 4.8, gain: 0.5 },
  { file: 'click', at: AT['14'] + 8.4, gain: 0.5 },

  // the whole ending hangs on these two
  { file: 'riser', at: AT['15'] - 3.6, gain: 0.85 },
  { file: 'sub_drop', at: AT['15'] + 0.1, gain: 0.9 },
];
