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
  ['01_live', 12], ['02_slicing', 12], ['03_slice', 10], ['04_quad', 10],
  ['05_stand', 10], ['06_both', 11], ['07_vision', 10], ['08_pathway', 12],
  ['09_instincts', 12], ['10_site', 17], ['11_scale', 11], ['12_future', 13],
  ['13_punch', 8],
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
 * One sound, on every cut.
 *
 * A different effect per beat - clicks on numbers, pops on panels, a shutter
 * here, a boom there - reads as clutter rather than as design. A single
 * transition sound used every single time becomes the video's own punctuation:
 * you stop hearing it as an effect and start hearing it as the edit.
 *
 * So: one whoosh on every scene change, and one low drop on the final shot,
 * because a film that simply stops feels broken rather than finished. Nothing
 * else. Override the choice with SFX_WHOOSH to audition another.
 */
export const TRANSITION = process.env.SFX_WHOOSH || 'swish';

/** How far before the cut the air starts moving. */
const LEAD = 0.22;

export const CUES = [
  ...TIMELINE.slice(1).map(([name]) => ({
    file: TRANSITION,
    at: AT[name.slice(0, 2)] - LEAD,
    gain: 0.75,
  })),
  { file: 'sub_drop', at: AT['13'] + 0.05, gain: 0.85 },
];
