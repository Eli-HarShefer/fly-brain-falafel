/**
 * Game state -> neural input.
 *
 * Injection happens at the lobula-columnar level (LC10a, LPLC2) rather than at
 * the photoreceptors. That is what the whole family of connectome game projects
 * does: it skips the ~60k optic-lobe neurons that only rebuild an image we
 * already have, and starts at the first stage whose tuning is well characterised
 * (LC10a: small moving object; LPLC2: looming).
 *
 * Everything here is a rate code fed to Poisson generators inside the LIF loop.
 */

/** Peak drive for a perfectly placed target. */
export const MAX_LC10A_HZ = 150;
export const MAX_LPLC2_HZ = 190;
export const MAX_EPG_HZ = 110;
export const MAX_GOAL_HZ = 95;

/** Half-width of an LC10a cell's receptive field, in units of the retino proxy. */
const RETINO_WIDTH = 0.42;
/** Visual half-field the stand spans, in degrees. */
export const FIELD_DEG = 32;
/** Binocular overlap: inside this, both eyes see the target. */
const BINOCULAR_DEG = 6;

const EPG_WIDTH = 0.16;   // bump width as a fraction of the ring
const GOAL_WIDTH = 0.19;
/** Degrees of goal error that saturate the PFL3 left/right imbalance. */
const PFL3_SATURATE_DEG = 40;

function wrapDeg(d) {
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export class Encoder {
  constructor(meta, brain) {
    this.meta = meta;
    this.brain = brain;
    const g = meta.groups;
    this.lcL = g.LC10a_L || [];
    this.lcR = g.LC10a_R || [];
    this.lpL = g.LPLC2_L || [];
    this.lpR = g.LPLC2_R || [];
    this.epg = g.EPG || [];
    this.pflL = g.PFL3_L || [];
    this.pflR = g.PFL3_R || [];
    this.retino = meta.retino;
    this.ring = meta.ring;
    this.arousal = 1;
  }

  /** Reset every external drive to zero. Call once per control tick. */
  begin() { this.brain.clearExternal(); }

  setArousal(a) { this.arousal = Math.max(0.6, Math.min(2.2, a)); }

  /**
   * Object-fixation drive. `items` are the objects LC10a is responding to, each
   * an angle relative to the hand: negative = left, positive = right.
   *
   * Normally the controller passes a single item - the target the fly has
   * settled on - because a fixating fly tracks one object, and LC10a is the
   * stage that carries it. Passing the whole visible scene instead is supported
   * and was tried: it makes the fly grab at whichever tray it reaches first,
   * because AOTU019 signals "an object is centred", not "the right one is". See
   * the note in README on why the goal stays a declared, non-neural input.
   *
   * The eye facing an object is driven; inside the binocular zone both are.
   * Within an eye the cells driven are those whose retinotopic proxy matches
   * that object's eccentricity, so position is carried by *which* LC10a cells
   * fire, not just how fast.
   */
  setScene(items, salience = 1) {
    if (!items || !items.length) return;
    const base = MAX_LC10A_HZ * salience * this.arousal;
    if (base <= 0) return;
    const accL = this._acc(this.lcL);
    const accR = this._acc(this.lcR);

    for (const it of items) {
      const e = wrapDeg(it.deg);
      const ecc = Math.min(1, Math.abs(e) / FIELD_DEG);
      const peak = base * (it.weight ?? 1);
      if (peak <= 1) continue;

      let wL, wR;
      if (Math.abs(e) <= BINOCULAR_DEG) { wL = 1; wR = 1; }
      else if (e < 0) { wL = 1; wR = 0.12; }
      else { wL = 0.12; wR = 1; }

      this._accRetino(accL, this.lcL, ecc, peak * wL);
      this._accRetino(accR, this.lcR, ecc, peak * wR);
    }
    this._flush(accL, this.lcL);
    this._flush(accR, this.lcR);
  }

  _acc(list) {
    if (!this._scratch) this._scratch = new Map();
    let a = this._scratch.get(list);
    if (!a) { a = new Float32Array(list.length); this._scratch.set(list, a); }
    else a.fill(0);
    return a;
  }

  /** Objects overlap in the visual field, so each cell takes its strongest. */
  _accRetino(acc, list, ecc, peak) {
    if (peak <= 0) return;
    const retino = this.retino;
    for (let k = 0; k < list.length; k++) {
      const d = (retino[list[k]] - ecc) / RETINO_WIDTH;
      const r = peak * Math.exp(-0.5 * d * d);
      if (r > acc[k]) acc[k] = r;
    }
  }

  _flush(acc, list) {
    const b = this.brain;
    for (let k = 0; k < list.length; k++) if (acc[k] > 1) b.setExternal(list[k], acc[k]);
  }

  /**
   * Looming drive. `items` is a list of {sideDeg, loom} where `loom` is the
   * normalised rate of angular expansion. Drives the eye the object is on,
   * which is how LPLC2 -> DNp01 stays lateralised.
   */
  setLooming(items) {
    if (!items || !items.length) return;
    let left = 0, right = 0;
    for (const it of items) {
      const v = Math.max(0, Math.min(1, it.loom));
      if (it.sideDeg < 0) left = Math.max(left, v);
      else right = Math.max(right, v);
    }
    const b = this.brain;
    const peak = MAX_LPLC2_HZ * this.arousal;
    if (left > 0) for (const i of this.lpL) b.setExternal(i, peak * left);
    if (right > 0) for (const i of this.lpR) b.setExternal(i, peak * right);
  }

  /**
   * Heading bump in the EPG ring attractor. Cells are ordered by their real
   * angular position around the ellipsoid body, taken from FlyWire coordinates.
   */
  setHeading(headingDeg) {
    const phase = ((wrapDeg(headingDeg) / 360) + 1) % 1;
    this._bump(this.epg, this.ring, phase, EPG_WIDTH, MAX_EPG_HZ * this.arousal);
  }

  /**
   * Goal drive onto PFL3.
   *
   * NOT NEURAL: *which* tray the fly should want is decided by the game-logic
   * layer, because reading an order board is not something any documented fly
   * circuit does. Everything downstream is: PFL3 compares that goal against the
   * EPG heading, and because PFL3 projects contralaterally onto DNa02, the
   * left/right imbalance becomes a turn.
   *
   * The two PFL3 populations sample the goal with opposite phase offsets, which
   * is how the real circuit converts a heading-versus-goal difference into
   * asymmetric descending drive (Hulse et al. 2021; Westeinde et al. 2024).
   * Driving both halves identically - which an earlier version did - produces a
   * perfectly symmetric output and no steering at all, which is why silencing
   * the central complex then cost nothing.
   *
   * @param goalErrDeg goal direction relative to the current heading
   */
  setGoal(goalErrDeg, strength = 1) {
    const e = wrapDeg(goalErrDeg);
    const bias = Math.max(-1, Math.min(1, e / PFL3_SATURATE_DEG));
    const peak = MAX_GOAL_HZ * strength * this.arousal;
    const phase = ((e / 360) + 1) % 1;
    this._bumpIndexed(this.pflL, phase, GOAL_WIDTH, peak * (0.5 - bias * 0.5));
    this._bumpIndexed(this.pflR, phase, GOAL_WIDTH, peak * (0.5 + bias * 0.5));
  }

  _bump(list, phaseArr, centre, width, peak) {
    const b = this.brain;
    for (let k = 0; k < list.length; k++) {
      const i = list[k];
      let d = phaseArr[i] - centre;
      if (d > 0.5) d -= 1; else if (d < -0.5) d += 1;
      const r = peak * Math.exp(-0.5 * (d / width) * (d / width));
      if (r > 1) b.setExternal(i, r);
    }
  }

  _bumpIndexed(list, centre, width, peak) {
    const b = this.brain;
    const n = list.length;
    for (let k = 0; k < n; k++) {
      let d = k / n - centre;
      if (d > 0.5) d -= 1; else if (d < -0.5) d += 1;
      const r = peak * Math.exp(-0.5 * (d / width) * (d / width));
      if (r > 1) b.setExternal(list[k], r);
    }
  }
}

export { wrapDeg };
