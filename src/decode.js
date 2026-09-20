/**
 * Neural output -> game action.
 *
 * Every constant here was measured by tools/calibrate.mjs driving the real
 * circuit, not chosen by hand. Re-run that script after any change to the
 * extraction or to SYN_GAIN and paste the numbers back.
 *
 * What the sweep showed, and why the readout looks like this:
 *
 *  - DNa02 is silent while the target is within ~20 deg and ramps up outside
 *    it. That deadband is a property of the wiring, not something imposed here,
 *    and it is what lets the hand settle instead of hunting around the target.
 *
 *  - AOTU019 does the opposite: it peaks (140-157 Hz) when the target is
 *    centred and falls to nothing at the edge of the field. It is the circuit's
 *    own "on target" signal, so the grab is gated on it.
 *
 *  - AOTU025 -> DNa02 is ipsilateral and excitatory while AOTU019 -> DNa02 is
 *    contralateral and inhibitory, which is what makes the pair push-pull:
 *    a peripheral target drives turning, a centred one suppresses it.
 */

/** Left/right response balance, measured from the sweep. */
export const BAL_R = 1.5007;
/** Slope of the balanced DNa02 difference against target azimuth. */
export const STEER_HZ_PER_DEG = 5.3086;
/** AOTU019 rate above which the target counts as centred. */
export const A19_ON_TARGET = 100;
/** DNa02 imbalance below which the hand is considered settled. */
export const STEER_DEADBAND_HZ = 30;
/** Giant Fiber rate that counts as a committed escape/swat. */
export const DNP01_THRESH = 20;

const GRAB_DWELL_MS = 90;
const GRAB_COOLDOWN_MS = 260;
const SWAT_COOLDOWN_MS = 380;

export class Decoder {
  constructor(meta, brain) {
    this.brain = brain;
    const g = meta.groups;
    this.d2L = g.DNa02_L || [];
    this.d2R = g.DNa02_R || [];
    this.d3L = g.DNa03_L || [];
    this.d3R = g.DNa03_R || [];
    this.a19L = g.AOTU019_L || [];
    this.a19R = g.AOTU019_R || [];
    this.a25L = g.AOTU025_L || [];
    this.a25R = g.AOTU025_R || [];
    this.p01L = g.DNp01_L || [];
    this.p01R = g.DNp01_R || [];

    this.dwell = 0;
    this.grabCooldown = 0;
    this.swatCooldown = 0;
    this.last = null;
  }

  /**
   * @param {number} dtMs wall time since the previous read
   * @returns {{steerHz:number, steerDeg:number, onTarget:boolean, grab:boolean,
   *            swat:0|-1|1, rates:object}}
   */
  read(dtMs) {
    const b = this.brain;
    const r = {
      d2L: b.groupRate(this.d2L), d2R: b.groupRate(this.d2R),
      d3L: b.groupRate(this.d3L), d3R: b.groupRate(this.d3R),
      a19L: b.groupRate(this.a19L), a19R: b.groupRate(this.a19R),
      a25L: b.groupRate(this.a25L), a25R: b.groupRate(this.a25R),
      p01L: b.groupRate(this.p01L), p01R: b.groupRate(this.p01R),
    };

    // steering: positive means the target sits to the right of the hand
    const steerHz = r.d2R * BAL_R - r.d2L;
    const steerDeg = steerHz / STEER_HZ_PER_DEG;

    const a19 = Math.max(r.a19L, r.a19R);
    const centred = a19 >= A19_ON_TARGET && Math.abs(steerHz) <= STEER_DEADBAND_HZ;

    // grab needs the on-target state to persist, so a momentary sweep past the
    // tray does not trigger one
    this.grabCooldown = Math.max(0, this.grabCooldown - dtMs);
    this.swatCooldown = Math.max(0, this.swatCooldown - dtMs);
    this.dwell = centred ? this.dwell + dtMs : 0;

    let grab = false;
    if (this.dwell >= GRAB_DWELL_MS && this.grabCooldown === 0) {
      grab = true;
      this.dwell = 0;
      this.grabCooldown = GRAB_COOLDOWN_MS;
    }

    // Giant Fiber: near-binary, so a single suprathreshold read commits
    let swat = 0;
    if (this.swatCooldown === 0) {
      if (r.p01R >= DNP01_THRESH && r.p01R >= r.p01L) { swat = 1; this.swatCooldown = SWAT_COOLDOWN_MS; }
      else if (r.p01L >= DNP01_THRESH) { swat = -1; this.swatCooldown = SWAT_COOLDOWN_MS; }
    }

    const out = { steerHz, steerDeg, onTarget: centred, a19, grab, swat, rates: r };
    this.last = out;
    return out;
  }
}
