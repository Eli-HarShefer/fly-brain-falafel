/**
 * Falafel stand game state.
 *
 * Mechanics follow the 2002 original: four trays plus a pita pile, an order
 * board showing how much of each item the customer wants, a queue of customers
 * whose patience runs down, a kitchen for restocking, and pest flies that spoil
 * a tray if they are not swatted. All art and code here are original.
 *
 * This module is pure state - no canvas, no neurons. The controller reads
 * `goalAz` from it and feeds grabs and swats back in.
 *
 * Station azimuths are spaced ~28 degrees apart because the circuit resolves
 * target position to about +-12 degrees (tools/calibrate.mjs), so neighbouring
 * stations stay unambiguous.
 */

import { makeDealer } from './mks.js';

export const STATIONS = [
  { id: 'kitchen', az: -85, label: 'מטבח', kind: 'kitchen' },
  { id: 'pita', az: -58, label: 'פיתה', kind: 'pita' },
  { id: 'hummus', az: -29, label: 'חומוס', kind: 'tray' },
  { id: 'balls', az: 0, label: 'פלאפל', kind: 'tray' },
  { id: 'salad', az: 29, label: 'סלט', kind: 'tray' },
  { id: 'chips', az: 58, label: 'צ׳יפס', kind: 'tray' },
];

export const TRAY_IDS = ['hummus', 'balls', 'salad', 'chips'];
export const TRAY_MAX = 8;

const STATION_BY_ID = Object.fromEntries(STATIONS.map((s) => [s.id, s]));
export const stationAz = (id) => STATION_BY_ID[id].az;

/**
 * Patience, in seconds, before a customer boils over. Shrinks as it speeds up.
 *
 * The ramp runs long enough that an intact fly holds out for several minutes
 * and then genuinely starts losing. An earlier setting topped out at 150 s and
 * the fly simply never lost, which made the whole fail state unreachable.
 */
const BASE_PATIENCE = 34;
const MIN_PATIENCE = 11;
const RAMP_SECONDS = 260;
const TAPE_EVERY = 100;

function randInt(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class FalafelGame {
  constructor(seed = 20020101) {
    this.rng = mulberry32(seed);
    this.dealMK = makeDealer(this.rng);
    this.reset();
  }

  reset() {
    this.t = 0;
    this.score = 0;
    this.served = 0;
    this.over = false;
    this.overReason = '';
    this.customers = [];
    this.trays = { hummus: TRAY_MAX, balls: TRAY_MAX, salad: TRAY_MAX, chips: TRAY_MAX };
    this.spoiled = { hummus: false, balls: false, salad: false, chips: false };
    this.plate = { pita: false, hummus: 0, balls: 0, salad: 0, chips: 0 };
    this.carrying = null;          // tray id fetched from the kitchen
    this.pests = [];
    this.nextCustomer = 1.2;
    this.nextPest = 9;
    this.tapeAt = TAPE_EVERY;
    this.tapeFlash = 0;
    this.events = [];              // transient things the renderer animates
    this.lastGrab = null;
    this.spawnCustomer();
  }

  get difficulty() { return Math.min(1, this.t / RAMP_SECONDS); }

  get patience() {
    return BASE_PATIENCE - (BASE_PATIENCE - MIN_PATIENCE) * this.difficulty;
  }

  get current() { return this.customers[0] || null; }

  spawnCustomer() {
    const d = this.difficulty;
    const maxItems = 2 + Math.round(d * 3);
    const order = { hummus: 0, balls: 0, salad: 0, chips: 0 };
    let total = 0;
    const wanted = randInt(this.rng, 2, maxItems);
    const pool = TRAY_IDS.slice();
    while (total < wanted && pool.length) {
      const k = pool[randInt(this.rng, 0, pool.length - 1)];
      order[k] += 1;
      total += 1;
      if (order[k] >= 3) pool.splice(pool.indexOf(k), 1);
    }
    const mk = this.dealMK();
    this.customers.push({
      id: Math.floor(this.rng() * 1e9),
      order,
      stress: 0,
      mk,
      seed: this.rng() * 6.28,
      line: mk.lines[randInt(this.rng, 0, mk.lines.length - 1)],
    });
  }

  spawnPest() {
    const trays = TRAY_IDS.filter((k) => !this.spoiled[k]);
    if (!trays.length) return;
    const tray = trays[randInt(this.rng, 0, trays.length - 1)];
    this.pests.push({
      id: Math.floor(this.rng() * 1e9),
      tray,
      az: stationAz(tray),
      approach: 0,      // 0 = far, 1 = landed
      speed: 0.13 + this.rng() * 0.09,
      landed: 0,
      dead: false,
      fade: 0,        // seconds of death animation left
      wobble: this.rng() * 6.28,
    });
  }

  /** What the fly should be going for right now. Game logic, not neural. */
  goal() {
    const c = this.current;
    if (!c) return { az: 0, id: null, reason: 'idle' };
    if (this.carrying) return { az: stationAz(this.carrying), id: this.carrying, reason: 'restock' };
    if (!this.plate.pita) return { az: stationAz('pita'), id: 'pita', reason: 'pita' };
    for (const k of TRAY_IDS) {
      if (this.plate[k] < c.order[k]) {
        if (this.trays[k] <= 0 || this.spoiled[k]) {
          return { az: stationAz('kitchen'), id: 'kitchen', reason: 'empty:' + k, need: k };
        }
        return { az: stationAz(k), id: k, reason: 'fill' };
      }
    }
    return { az: stationAz('pita'), id: 'pita', reason: 'done' };
  }

  /** Nearest station to a hand azimuth, if within tolerance. */
  stationAt(az, tol = 15) {
    let best = null, bd = Infinity;
    for (const s of STATIONS) {
      const d = Math.abs(s.az - az);
      if (d < bd) { bd = d; best = s; }
    }
    return bd <= tol ? best : null;
  }

  /**
   * The fly committed a grab at `az`. Returns a short string describing what
   * happened so the renderer can show it.
   */
  grab(az) {
    if (this.over) return null;
    const s = this.stationAt(az);
    if (!s) return null;
    const c = this.current;
    if (!c) return null;

    const g = this.goal();

    if (s.id === 'kitchen') {
      if (g.id === 'kitchen' && g.need) {
        this.carrying = g.need;
        this.push('fetch', s.az, 'מביא ' + STATION_BY_ID[g.need].label);
        return 'fetch';
      }
      return null;
    }

    if (this.carrying && s.id === this.carrying) {
      this.trays[s.id] = TRAY_MAX;
      this.spoiled[s.id] = false;
      this.carrying = null;
      this.push('restock', s.az, 'מילוי');
      return 'restock';
    }

    if (s.id === 'pita') {
      if (this.plate.pita) return null;
      this.plate.pita = true;
      this.push('pita', s.az, 'פיתה');
      return 'pita';
    }

    // a tray
    if (!this.plate.pita) return null;
    if (this.spoiled[s.id] || this.trays[s.id] <= 0) {
      this.push('bad', s.az, 'ריק!');
      return 'empty';
    }
    if (this.plate[s.id] >= c.order[s.id]) {
      this.push('bad', s.az, 'מיותר');
      return 'excess';
    }
    this.plate[s.id] += 1;
    this.trays[s.id] -= 1;
    this.push('add', s.az, '+1');

    // complete?
    if (TRAY_IDS.every((k) => this.plate[k] >= c.order[k])) {
      this.serve();
      return 'served';
    }
    return 'add';
  }

  serve() {
    const c = this.customers.shift();
    if (!c) return;
    const items = TRAY_IDS.reduce((a, k) => a + c.order[k], 0);
    const bonus = Math.round((1 - c.stress) * 10);
    this.score += 10 + items * 4 + bonus;
    this.served += 1;
    this.plate = { pita: false, hummus: 0, balls: 0, salad: 0, chips: 0 };
    this.push('serve', stationAz('pita'), 'מנה!');
    if (this.score >= this.tapeAt) {
      this.tapeAt += TAPE_EVERY;
      this.tapeFlash = 1.6;
      for (const cu of this.customers) cu.stress = Math.max(0, cu.stress - 0.65);
      this.push('tape', 0, 'קלטת');
    }
    if (!this.customers.length) this.spawnCustomer();
  }

  /** The escape reflex fired. Kill any pest close to that azimuth. */
  swat(az, tol = 40) {
    let hit = null, bd = Infinity;
    for (const p of this.pests) {
      if (p.dead) continue;
      const d = Math.abs(p.az - az);
      if (d < bd) { bd = d; hit = p; }
    }
    if (hit && bd <= tol) {
      hit.dead = true;
      hit.fade = 0.55;
      this.score += 5;
      this.push('swat', hit.az, 'ססס!');
      return true;
    }
    return false;
  }

  push(kind, az, text) {
    this.events.push({ kind, az, text, life: 1 });
    if (this.events.length > 24) this.events.shift();
  }

  /**
   * Looming signals for the encoder: how fast each pest is expanding.
   *
   * The exponent is gentle (1.15) so the signal rises early enough for the
   * Giant Fiber to commit before the pest lands. A landed pest keeps driving
   * for a beat - it is still buzzing on the tray, and DNp01 sits under enough
   * ongoing inhibition during play that it needs a sustained push to fire.
   */
  loomingInputs() {
    const out = [];
    for (const p of this.pests) {
      if (p.dead) continue;
      let loom;
      if (p.landed > 0) {
        loom = p.landed < 2.0 ? 0.95 : 0;
      } else {
        loom = Math.pow(p.approach, 1.15);
      }
      if (loom > 0.05) out.push({ sideDeg: p.az, loom });
    }
    return out;
  }

  update(dt) {
    if (this.over) return;
    this.t += dt;

    for (const e of this.events) e.life -= dt * 1.4;
    this.events = this.events.filter((e) => e.life > 0);
    if (this.tapeFlash > 0) this.tapeFlash -= dt;

    // customers
    const p = this.patience;
    for (const c of this.customers) {
      c.stress = Math.min(1, c.stress + dt / p);
      if (c.stress >= 1) {
        this.over = true;
        const lost = c.mk.f ? 'איבדה' : 'איבד';
        const dishes = this.served === 1 ? 'מנה אחת' : this.served + ' מנות';
        this.overReason = c.mk.full + ' ' + lost + ' סבלנות אחרי ' + dishes;
        return;
      }
    }
    this.nextCustomer -= dt;
    const maxQueue = 2 + Math.round(this.difficulty * 3);
    if (this.nextCustomer <= 0 && this.customers.length < maxQueue) {
      this.spawnCustomer();
      this.nextCustomer = 7 - this.difficulty * 4.4;
    }

    // pests
    this.nextPest -= dt;
    if (this.nextPest <= 0) {
      this.spawnPest();
      this.nextPest = 11 - this.difficulty * 5.5;
    }
    for (const pest of this.pests) {
      if (pest.dead) { pest.fade -= dt; continue; }
      pest.wobble += dt * 7;
      if (pest.landed > 0) {
        pest.landed += dt;
        if (pest.landed > 2.4 && !this.spoiled[pest.tray]) {
          this.spoiled[pest.tray] = true;
          this.push('spoil', pest.az, 'התקלקל');
          pest.dead = true;
          pest.fade = 0.35;
        }
      } else {
        pest.approach += dt * pest.speed;
        if (pest.approach >= 1) { pest.approach = 1; pest.landed = 0.001; }
      }
    }
    // keep swatted pests around briefly so the spray has something to hit
    this.pests = this.pests.filter((p) => !p.dead || p.fade > 0);
    if (this.pests.length > 5) this.pests.shift();
  }

  /** Customer pressure, fed to the encoder as an arousal / octopamine signal. */
  arousal() {
    const c = this.current;
    const s = c ? c.stress : 0;
    return 0.85 + s * 1.15;
  }
}
