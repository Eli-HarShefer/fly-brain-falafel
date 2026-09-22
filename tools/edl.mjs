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
  ['01_live', 12], ['02_slicing', 12], ['03_slice', 10], ['04_effort', 13],
  ['05_quote_murthy', 7], ['06_quad', 10], ['07_stand', 10], ['08_both', 11],
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
export const TRANSITION = process.env.SFX_WHOOSH || 'whoosh';

/** How far before the cut the air starts moving. */
const LEAD = 0.22;

export const CUES = [
  ...TIMELINE.slice(1).map(([name]) => ({
    file: TRANSITION,
    at: AT[name.slice(0, 2)] - LEAD,
    gain: 0.75,
  })),
  { file: 'sub_drop', at: AT['15'] + 0.05, gain: 0.85 },
];
