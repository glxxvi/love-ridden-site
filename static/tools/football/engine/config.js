// config.js — every tunable rule lives here. Edit data, not logic.
// Assumes Texas high school football (UIL, which follows NFHS rules).

export const RULES = {
  quarterSeconds: 12 * 60,
  points: { td: 6, fg: 3, safety: 2, kickTry: 1, twoPoint: 2 },
  firstDownYards: 10,
  bigPlayYards: 15,
  kickoffSpotYd: 40,
  freeKickSpotYd: 20,
  touchbackYd: 20,
  defaultSecPerPlay: 25,
  kneelCountsAsRush: true,
  shareTfl: true,
  sackCountsAsTackle: true,
};

export const TITLE = {
  run: g => (g < 0 ? 'Run for Loss' : g === 0 ? 'No Gain' : g < 5 ? 'Short Run' : g < 15 ? 'Medium Run' : 'Long Run'),
  pass: (g, completed) =>
    !completed ? 'Incomplete Pass' : g < 0 ? 'Pass for Loss' : g < 10 ? 'Short Pass' : g < 20 ? 'Medium Pass' : 'Deep Pass',
  sack: () => 'Sack',
  tackle: g => (g < 0 ? 'Tackle for Loss' : 'Tackle'),
  kneel: () => 'Kneel Down',
  spike: () => 'Spike',
};

export const BIG_PLAY_RULES = [
  { id: 'sack', label: 'Sack', test: f => f.kind === 'sack' },
  {
    id: 'tfl',
    label: 'Tackle for Loss',
    test: f => f.scrimmage && f.gain < 0 && ['run', 'tackle'].concat(f.completed ? ['pass'] : []).includes(f.kind),
  },
  {
    id: 'explosive',
    label: f => `${f.gain}-Yard ${f.kind === 'pass' ? 'Pass' : f.kind === 'run' ? 'Run' : 'Play'}`,
    test: f =>
      f.scrimmage && f.gain >= RULES.bigPlayYards && (f.kind === 'run' || f.kind === 'tackle' || (f.kind === 'pass' && f.completed)),
  },
  { id: 'interception', label: 'Interception', test: f => f.reason === 'interception' },
  { id: 'fumble', label: 'Fumble Recovery', test: f => f.reason === 'fumble' },
  { id: 'blocked_punt', label: 'Blocked Punt', test: f => f.reason === 'blocked_punt' },
  { id: 'blocked_fg', label: 'Blocked FG', test: f => f.reason === 'blocked_fg' },
];

export const BIG_TYPES = {
  sack: { label: 'Sack' },
  tfl: { label: 'Tackle for Loss' },
  interception: { label: 'Interception' },
  pbu: { label: 'Pass Breakup', credit: 'def.pbu' },
  hurry: { label: 'QB Hurry', credit: 'def.hurry' },
  ff: { label: 'Forced Fumble', credit: 'def.ff' },
  blocked_kick: { label: 'Blocked Kick', credit: 'def.blk' },
  other: { label: 'Big Play' },
};

export const FOULS = {
  false_start:            { label: 'False Start',             yards: 5,  half: true },
  encroachment:           { label: 'Encroachment',            yards: 5,  half: true },
  offside:                { label: 'Offside',                 yards: 5,  half: true },
  delay_of_game:          { label: 'Delay of Game',           yards: 5,  half: true },
  illegal_formation:      { label: 'Illegal Formation',       yards: 5,  half: true },
  illegal_motion:         { label: 'Illegal Motion',          yards: 5,  half: true },
  illegal_shift:          { label: 'Illegal Shift',           yards: 5,  half: true },
  too_many_men:           { label: 'Too Many Men',            yards: 5,  half: true },
  illegal_substitution:   { label: 'Illegal Substitution',    yards: 5,  half: true },
  holding:                { label: 'Holding',                 yards: 10, half: true },
  illegal_block:          { label: 'Illegal Block',           yards: 10, half: true },
  illegal_block_in_back:  { label: 'Block in the Back',       yards: 10, half: true },
  defensive_holding:      { label: 'Defensive Holding',       yards: 5,  half: true, autoFirst: true },
  pass_interference_def:  { label: 'Pass Interference',       yards: 15, half: true, autoFirst: true },
  pass_interference_off:  { label: 'Pass Interference',       yards: 15, half: true, lossOfDown: true },
  personal_foul:          { label: 'Personal Foul',           yards: 15, half: true },
  unsportsmanlike:        { label: 'Unsportsmanlike Conduct', yards: 15, half: true },
  face_mask:              { label: 'Face Mask',               yards: 15, half: true },
  horse_collar:           { label: 'Horse Collar',            yards: 15, half: true },
  roughing_passer:        { label: 'Roughing the Passer',     yards: 15, half: true, autoFirst: true },
  roughing_kicker:        { label: 'Roughing the Kicker',     yards: 15, half: true, autoFirst: true },
  running_into_kicker:    { label: 'Running Into the Kicker', yards: 5,  half: true },
  kick_catch_interference:{ label: 'Kick Catch Interference', yards: 15, half: true },
  clipping:               { label: 'Clipping',                yards: 15, half: true },
  targeting:              { label: 'Targeting',               yards: 15, half: true },
  intentional_grounding:  { label: 'Intentional Grounding',   yards: 5,  half: true, lossOfDown: true },
  illegal_forward_pass:   { label: 'Illegal Forward Pass',    yards: 5,  half: true, lossOfDown: true },
  ineligible_downfield:   { label: 'Ineligible Downfield',    yards: 5,  half: true },
  illegal_kicking:        { label: 'Illegal Kicking',         yards: 15, half: true },
};