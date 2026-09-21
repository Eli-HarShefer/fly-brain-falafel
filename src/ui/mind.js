/**
 * What the fly thinks is going on.
 *
 * Two columns of the same moment. On one side what a person watching sees - a
 * fly fetching hummus for Bibi. On the other, what the animal is actually
 * dealing with: a small dark blob 28 degrees to the left, an urge to turn until
 * it is centred, and a grab when it is.
 *
 * The distinction the panel exists to make: *moving toward a thing* is a real
 * fly instinct and the connectome is genuinely doing it. *Switching to the next
 * ingredient* is not. Nothing in a fly wants salad next. That decision is ours,
 * and it is marked as ours in every line.
 *
 * From inside, there is no stand, no order, no customer and no job. There is a
 * blob, then a different blob. The fly never finds out it has a job.
 *
 * Every line is generated from live state - the real error angle, the real
 * on-target signal from AOTU019, the real Giant Fiber spike.
 */

const MAX_LINES = 7;

export class MindView {
  constructor(root) {
    this.root = root;
    this.lines = [];
    this.lastGoal = null;
    this.lastPhase = null;
    this.sinceLine = 0;
  }

  push(kind, human, fly) {
    this.lines.unshift({ kind, human, fly, age: 0 });
    if (this.lines.length > MAX_LINES) this.lines.pop();
    this.render();
  }

  /**
   * @param kind 'instinct' - the circuit is doing this
   *             'imposed'  - the game decided it, not the fly
   *             'reflex'   - escape circuit fired
   */
  update(game, out, dt, handAz) {
    this.sinceLine += dt;
    if (!out) return;

    const goal = game.goal();
    const c = game.current;
    const err = out.err;
    const dir = err > 0 ? 'ימינה' : 'שמאלה';
    const deg = Math.abs(err).toFixed(0);

    // the escape reflex beats everything else
    if (out.swat) {
      this.push('reflex', 'סוטר לזבוב שנחת על האוכל',
        'משהו גדל מהר מול העין — לזוז, עכשיו');
      this.sinceLine = 0;
      return;
    }

    // a new target was chosen for it
    const goalKey = goal ? goal.id + ':' + goal.reason : null;
    if (goalKey && goalKey !== this.lastGoal) {
      this.lastGoal = goalKey;
      const who = c ? c.mk.name : 'הלקוח';
      let human;
      if (goal.reason === 'pita') human = 'לוקח פיתה בשביל ' + who;
      else if (goal.reason === 'fill') human = 'הולך להביא ' + LABEL[goal.id] + ' בשביל ' + who;
      else if (goal.reason === 'restock') human = 'מחזיר מגש מלא';
      else if (String(goal.reason).startsWith('empty')) human = 'נגמר המגש, רץ למטבח';
      else human = 'מגיש';
      this.push('imposed', human, 'כתם קטן חדש, ' + deg + '° ' + dir);
      this.lastPhase = 'seek';
      this.sinceLine = 0;
      return;
    }

    // otherwise narrate the chase itself, but do not spam
    if (this.sinceLine < 1.1) return;

    if (out.onTarget && this.lastPhase !== 'locked') {
      this.lastPhase = 'locked';
      this.push('instinct', 'הגיע למגש ותופס', 'הכתם באמצע — עכשיו לתפוס');
      this.sinceLine = 0;
    } else if (!out.onTarget && Math.abs(err) > 18 && this.lastPhase !== 'turn') {
      this.lastPhase = 'turn';
      this.push('instinct', 'מסתובב לכיוון המגש',
        'הכתם ' + dir + '. להסתובב עד שהוא באמצע');
      this.sinceLine = 0;
    } else if (!out.onTarget && Math.abs(err) <= 18 && this.lastPhase !== 'close') {
      this.lastPhase = 'close';
      this.push('instinct', 'כמעט שם', 'הכתם מתקרב למרכז');
      this.sinceLine = 0;
    }
  }

  render() {
    const kindLabel = { instinct: 'אינסטינקט', imposed: 'לא הוא', reflex: 'רפלקס' };
    this.root.innerHTML = this.lines.map((l, i) => {
      const fade = 1 - i * 0.13;
      return '<div class="mind__row mind__row--' + l.kind + '" style="opacity:' +
        fade.toFixed(2) + '">' +
        '<div class="mind__human">' + l.human + '</div>' +
        '<div class="mind__fly">' + l.fly +
        '<span class="mind__tag">' + kindLabel[l.kind] + '</span></div>' +
        '</div>';
    }).join('');
  }
}

const LABEL = {
  kitchen: 'מטבח', pita: 'פיתה', hummus: 'חומוס',
  balls: 'פלאפל', salad: 'סלט', chips: 'צ׳יפס',
};
