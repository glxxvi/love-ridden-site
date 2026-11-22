// field.js — field geometry and down/distance helpers. Pure functions, no DOM.
//
// Every ball position is ONE number: `pos` = yards from the USER team's goal line (0..100).
//   pos 35  → the user team's own 35        pos 65 → the opponent's 35
//   pos 50  → midfield
// Teams are 'US' (the user's team) and 'OPP' (the opponent).
// 'US' attacks toward 100, 'OPP' attacks toward 0, so every yardage calculation
// is the same arithmetic with a sign flip (dir()).

export const other = t => (t === 'US' ? 'OPP' : 'US');
export const dir = t => (t === 'US' ? 1 : -1);
export const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/** Yard-line entry → pos. `side` is whose side of the field the number is on. */
export function pos(side, yd) {
  if (yd === 50) return 50;
  if (side === 'US') return yd;
  if (side === 'OPP') return 100 - yd;
  throw new Error(`pos(): side must be 'US' or 'OPP' (got ${side})`);
}

/** Inverse of pos(): { side: 'US' | 'OPP' | null, yd } */
export function yardLine(p) {
  if (p === 50) return { side: null, yd: 50 };
  return p < 50 ? { side: 'US', yd: p } : { side: 'OPP', yd: 100 - p };
}

/** Yards gained by `team` moving the ball from `from` to `to` (negative = loss). */
export const gainFor = (team, from, to) => (to - from) * dir(team);

/** Yards `team` still needs to reach the end zone it is attacking. */
export const yardsToGoal = (team, p) => (team === 'US' ? 100 - p : p);

/** Yards between `p` and `team`'s OWN goal line. */
export const yardsFromOwnGoal = (team, p) => (team === 'US' ? p : 100 - p);

/** pos of the goal line `team` is attacking. */
export const goalPos = team => (team === 'US' ? 100 : 0);

/** Absolute position of the line to gain, `dist` yards ahead of `p` (capped at the goal line). */
export const lineToGain = (team, p, dist = 10) => clamp(p + dir(team) * dist);

export const isGoalToGo = (team, ltg) => (team === 'US' ? ltg >= 100 : ltg <= 0);

export const distance = (team, p, ltg) =>
  isGoalToGo(team, ltg) ? yardsToGoal(team, p) : Math.max(0, (ltg - p) * dir(team));

export const ordinal = n => ['', '1st', '2nd', '3rd', '4th'][n] ?? `${n}th`;

/** "2nd & 7", "1st & Goal", or "Turnover on downs" once a 4th down has failed. */
export function downAndDistance(team, down, p, ltg) {
  if (down > 4) return 'Turnover on downs';
  return `${ordinal(down)} & ${isGoalToGo(team, ltg) ? 'Goal' : distance(team, p, ltg)}`;
}

/**
 * Where the ball is, worded from the offense's point of view:
 *   user team ball:  "ball on Opponent's 35" / "ball on own 30"
 *   opponent ball:   "Opponent's ball on their own 42" / "Opponent's ball on San Augustine's 20"
 * `names` = { US: 'San Augustine', OPP: 'Opponent' }
 */
export function spotText(offense, p, names) {
  if (p === 50) return offense === 'US' ? 'ball on the 50' : `${names.OPP}'s ball on the 50`;
  const { side, yd } = yardLine(p);
  const onOwnSide = side === offense;
  if (offense === 'US') return `ball on ${onOwnSide ? 'own' : `${names.OPP}'s`} ${yd}`;
  return `${names.OPP}'s ball on ${onOwnSide ? 'their own' : `${names.US}'s`} ${yd}`;
}