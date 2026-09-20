/**
 * The closed loop: game state in, neural command out.
 *
 * This is the only place the three pieces meet. Everything inside tick() that
 * touches the brain goes through Encoder and Decoder, so the path from the
 * falafel stand to a motor command always runs through the real circuit.
 */
import { DT } from './lif.js';
import { Encoder, wrapDeg } from './encode.js';
import { Decoder } from './decode.js';

/** Degrees per second of hand movement per degree of decoded error. */
export const TURN_GAIN = 6.0;
export const MAX_TURN_DEG_S = 230;

/**
 * How hard to drive the central complex goal signal.
 *
 * tools/cxsweep.mjs measured this end to end: 0 and 0.5 both give 14/14 on
 * target at ~3 deg, 1.0 drops to 10/14 at 40 deg, 1.5 collapses to 3/14. The
 * pursuit pathway solves this task by itself and a strong PFL3 bias fights it,
 * so the CX runs at a level where it is active and visible without steering the
 * hand. See the note in README: this is a measured result, not a tuning fudge.
 */
export const CX_GOAL_DRIVE = 0.5;

export class FlyController {
  constructor(meta, brain) {
    this.brain = brain;
    this.meta = meta;
    this.encoder = new Encoder(meta, brain);
    this.decoder = new Decoder(meta, brain);
    this.simSpeed = 1;
    this.lastOut = null;
  }

  /**
   * @param {number} dtMs wall-clock milliseconds since the last tick
   * @param {object} world
   *   handAz    current hand azimuth, degrees
   *   goalAz    azimuth of the thing the fly should go to (game logic picks it)
   *   salience  0..1, how strongly the target stands out
   *   pests     [{sideDeg, loom}] looming pest flies
   *   arousal   1 = calm, >1 = customers are getting angry
   */
  tick(dtMs, world) {
    const enc = this.encoder;
    const err = wrapDeg(world.goalAz - world.handAz);

    enc.begin();
    enc.setArousal(world.arousal ?? 1);
    // the object the fly is fixating, as an angle relative to the hand
    enc.setScene([{ deg: err }], world.salience ?? 1);
    enc.setHeading(world.handAz);
    // and what it wants: supplied to the central complex, relative to heading
    enc.setGoal(err, world.goalStrength ?? CX_GOAL_DRIVE);
    if (world.pests && world.pests.length) enc.setLooming(world.pests);

    // advance the brain by the same amount of time the world advanced
    const simMs = dtMs * this.simSpeed;
    const steps = Math.max(1, Math.round(simMs / DT));
    this.brain.step(steps);

    const d = this.decoder.read(dtMs);
    let turn = d.steerDeg * TURN_GAIN;
    if (turn > MAX_TURN_DEG_S) turn = MAX_TURN_DEG_S;
    else if (turn < -MAX_TURN_DEG_S) turn = -MAX_TURN_DEG_S;

    const out = {
      turnDegPerSec: turn,
      grab: d.grab,
      swat: d.swat,
      onTarget: d.onTarget,
      steerHz: d.steerHz,
      steerDeg: d.steerDeg,
      a19: d.a19,
      err,
      rates: d.rates,
      spikeCount: this.brain.spikeCount,
    };
    this.lastOut = out;
    return out;
  }
}
