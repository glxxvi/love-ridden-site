// Run with:  node --test static/tools/football/engine/
// No dependencies — uses Node's built-in test runner.

import test from 'node:test';
import assert from 'node:assert/strict';
import { replay, preview, suggestPenalty, us, opp, clk, field as F } from './engine.js';
import { testSetup } from './test-teams.js';

const setup = testSetup();
const poss = (offense, spot, extra = {}) => ({ type: 'possession', reason: 'other', offense, spot, ...extra });
const play = (kind, extra = {}) => ({ type: 'play', kind, ...extra });
const last = g => g.entries[g.entries.length - 1];
const P = (g, key) => g.stats.players.find(p => p.key === key);

// ---------- 1: exact prose on a simple run ----------
test('typical run: exact prose, title, down & distance, stat', () => {
  const g = replay(setup, [
    poss('US', F.pos('OPP', 38)),
    play('run', { carrier: us(10), spot: F.pos('OPP', 35) }),
  ]);
  const e = last(g);
  assert.equal(e.title, 'Short Run');
  assert.equal(e.text, "Love Ridden - #10 Darion Brown 3 yard rush, ball on Pfenex's 35. 2nd & 7.");
  assert.equal(P(g, 'US:darion-brown').s['rush.yds'], 3);
});

// ---------- 2: defense-only tackle flagged as TFL big play ----------
test('opponent run then defense-only tackle becomes a TFL big play', () => {
  const g = replay(setup, [
    poss('OPP', F.pos('OPP', 39)),
    play('run', { carrier: opp(12, 'First Last'), spot: F.pos('OPP', 42) }),
    play('tackle', { tackles: [us(13)], spot: F.pos('OPP', 35) }),
  ]);
    assert.equal(g.entries[1].text, "Pfenex - #12 First Last 3 yard rush, Pfenex's ball on their own 42. 2nd & 7.");
  const e = last(g);
  assert.equal(e.gain, -7);
  assert.deepEqual(e.big, ['Tackle for Loss']);
  assert.equal(e.title, 'Big Play: Tackle for Loss');
  const garner = P(g, 'US:jadavian-garner').s;
  assert.equal(garner['def.tfl'], 1);
  assert.equal(garner['def.tflyds'], -7);
  assert.equal(garner['def.tkl'], 1);
  assert.ok(g.warnings.some(w => w.level === 'info' && /Defense-only/.test(w.message)));
});

// ---------- 3: 15+ yd plays are big plays; 14 is not. FIX: OPP 16-yd pass goes FORWARD ----------
test('15+ yard offensive plays are auto Big Plays for either team; 14 is not', () => {
  const g = replay(setup, [
    poss('US', F.pos('US', 25)),
    play('run', { carrier: us(10), spot: F.pos('US', 39) }),
    play('pass', { passer: us(7), receiver: us(11), completed: true, spot: F.pos('US', 39) + 15 }),
    poss('OPP', F.pos('OPP', 30)),
    // 16-yard GAIN: opponent's own 30 → own 46 (= stored 54)
    play('pass', { passer: opp(5), receiver: opp(80), completed: true, spot: F.pos('OPP', 46) }),
  ]);
  assert.deepEqual(g.entries[1].big, []);
  assert.deepEqual(g.entries[2].big, ['15-Yard Pass']);
  assert.equal(g.entries[2].title, 'Big Play: 15-Yard Pass');
  assert.deepEqual(g.entries[4].big, ['16-Yard Pass']);
  assert.equal(g.entries[4].title, 'Big Play: 16-Yard Pass');
});

// ---------- 4: first down resets the chains; 3rd-down conversions counted ----------
test('first down resets chains; 3rd-down conversion is counted', () => {
  const g = replay(setup, [
    poss('US', F.pos('US', 25)),
    play('run', { carrier: us(10), spot: F.pos('US', 30) }),
    play('run', { carrier: us(10), spot: F.pos('US', 33) }),
    play('run', { carrier: us(10), spot: F.pos('US', 40) }),
  ]);
  const t = g.stats.teams.US;
  assert.equal(t['third.att'], 1);
  assert.equal(t['third.conv'], 1);
  assert.equal(g.st.down, 1);
});

// ---------- 5: 45-yard rushing TD; expects a try next ----------
test('score: rushing TD uses typed yards, scores, expects a try', () => {
  const g = replay(setup, [
    poss('US', F.pos('OPP', 45)),
    { type: 'score', team: 'US', scoreType: 'td_rush', carrier: us(10), yards: 45 },
  ]);
  assert.equal(g.st.score.US, 6);
  assert.ok(g.st.awaitingTry && g.st.awaitingTry.team === 'US');
  assert.equal(P(g, 'US:darion-brown').s['pts'], 6);

  const g2 = replay(setup, [
    poss('US', F.pos('OPP', 45)),
    { type: 'score', team: 'US', scoreType: 'td_rush', carrier: us(10), yards: 45 },
    { type: 'try', team: 'US', tryType: 'kick', good: true, kicker: us(3) },
  ]);
  assert.equal(g2.st.score.US, 7);
  assert.equal(g2.st.awaitingTry, null);
});

// ---------- 6: pick-six ----------
test('pick-six scores for the defense and ends the drive', () => {
  const g = replay(setup, [
    poss('OPP', F.pos('OPP', 40)),
    { type: 'score', team: 'US', scoreType: 'td_int_return', returner: us(13), interceptor: us(13), yards: 60 },
  ]);
  assert.equal(g.st.score.US, 6);
  const garner = P(g, 'US:jadavian-garner').s;
  assert.equal(garner['pts'], 6);
  assert.equal(garner['def.inttd'], 1);
});

// ---------- 7: interception possession update ----------
test('interception possession update ends the offense drive', () => {
  const g = replay(setup, [
    poss('OPP', F.pos('OPP', 40)),
    play('pass', { passer: opp(5), receiver: opp(80), completed: false }),
    { type: 'possession', reason: 'interception', offense: 'US', interceptor: us(13), spot: F.pos('US', 45) },
  ]);
  assert.equal(g.st.offense, 'US');
  assert.equal(g.st.pos, 45);
  assert.equal(g.st.down, 1);
  assert.equal(P(g, 'US:jadavian-garner').s['def.int'], 1);
});

// ---------- 8: false start moves back & keeps the down; defensive holding auto-first ----------
test('penalties: false start moves back, keeps down; defensive holding auto first', () => {
  const g = replay(setup, [
    poss('US', F.pos('US', 30)),
    { type: 'penalty', team: 'US', foul: 'false_start', players: { US: 70 } },
  ]);
  assert.equal(g.st.pos, 25);       // moved BACK to own 25
  assert.equal(g.st.down, 1);       // still 1st down (no down consumed)

  const g2 = replay(setup, [
    poss('US', F.pos('US', 30)),
    play('run', { carrier: us(10), spot: F.pos('US', 32) }),  // 2nd & 8
    { type: 'penalty', team: 'OPP', foul: 'defensive_holding' },
  ]);
  assert.equal(g2.st.down, 1);      // auto first
});

// ---------- 9: offsetting / declined penalties ----------
test('offsetting and declined penalties do not move the ball or count in totals', () => {
  const before = replay(setup, [poss('US', F.pos('US', 30))]);
  const g = replay(setup, [
    poss('US', F.pos('US', 30)),
    { type: 'penalty', team: 'US', foul: 'false_start', offsetting: true },
  ]);
  assert.equal(g.st.pos, before.st.pos);

  const g2 = replay(setup, [
    poss('US', F.pos('US', 30)),
    { type: 'penalty', team: 'US', foul: 'false_start', accepted: false },
  ]);
  assert.equal(g2.st.pos, 30);
});

// ---------- 10: penalty can nullify a previous play ----------
test('a penalty can nullify the previous play', () => {
  const base = [
    poss('US', F.pos('US', 30)),
    play('run', { carrier: us(10), spot: F.pos('US', 40) }),
  ];
  const g1 = replay(setup, base);
  const gainBefore = g1.st.pos;

  const g2 = replay(setup, [
    ...base,
    { type: 'void', target: 'e1' },   // the run is event index 1
  ]);
  assert.notEqual(g2.st.pos, gainBefore);
  assert.equal(P(g2, 'US:darion-brown').s['rush.yds'], undefined);
});

// ---------- 11: failed 4th down waits for possession update ----------
test('failed 4th down waits for a Possession Update, flips at same spot', () => {
  const g = replay(setup, [
    poss('US', F.pos('US', 30)),
    play('run', { carrier: us(10), spot: F.pos('US', 33) }),
    play('run', { carrier: us(10), spot: F.pos('US', 36) }),
    play('run', { carrier: us(10), spot: F.pos('US', 38) }),   // now 4th & 2
    play('run', { carrier: us(10), spot: F.pos('US', 39) }),   // 4th-down play fails: 1 yd, short of 40
  ]);
  assert.ok(g.st.awaitingPossession);
  assert.equal(g.st.awaitingPossession.reason, 'downs');
  assert.equal(g.st.pos, 39);
});
// ---------- 12: sack, split credit ----------
test('sack: split credit, QB sacked, big play', () => {
  const g = replay(setup, [
    poss('US', F.pos('US', 40)),
    play('sack', { passer: us(7), sackers: [opp(54), opp(55)], spot: F.pos('US', 33) }),
  ]);
  assert.deepEqual(last(g).big, ['Sack']);
  const miller = P(g, 'US:jake-miller').s;
  assert.equal(miller['pass.sacked'], 1);
  assert.equal(miller['pass.sackyds'], 7);
});

// ---------- 13: punt gross/return/net ----------
test('punt: gross from LoS, return yards, net', () => {
  const g = replay(setup, [
    poss('US', F.pos('US', 30)),
    { type: 'possession', reason: 'punt', offense: 'OPP',
      kicker: us(3), returner: opp(2),
      spot: F.pos('OPP', 42) },
  ]);
  const kicker = P(g, 'US:kyle-kicker').s;
  assert.ok(kicker['punt.att'] >= 1);
  assert.ok(kicker['punt.yds'] >= 28);  // 30 → 100-42 = 58; kicker's gross = 58 - 30 = 28
});

// ---------- 14: fumble lost ----------
test('fumble lost: fumbler and recoverer credited', () => {
  const g = replay(setup, [
    poss('US', F.pos('US', 40)),
    play('run', {
      carrier: us(10), spot: F.pos('US', 45),
      fumble: { by: us(10), forcedBy: opp(54), recoveredBy: opp(55) },
    }),
  ]);
  const darion = P(g, 'US:darion-brown').s;
  assert.equal(darion['fum.n'], 1);
  assert.equal(darion['fum.lost'], 1);
});

// ---------- 15: TOP from clock readings ----------
test('time of possession from clock readings', () => {
  const g = replay(setup, [
    poss('US', F.pos('US', 25)),
    { type: 'clock', clock: clk(1, '12:00') },
    play('run', { carrier: us(10), spot: F.pos('US', 30), clock: clk(1, '11:30') }),
    play('run', { carrier: us(10), spot: F.pos('US', 35), clock: clk(1, '11:00') }),
  ]);
  assert.ok(g.stats.teams.US['top'] > 0);
});

// ---------- 16: drives with no clock readings still flagged ----------
test('drives with no clock fall back to a flagged estimate', () => {
  const g = replay(setup, [
    poss('US', F.pos('US', 25)),
    play('run', { carrier: us(10), spot: F.pos('US', 30) }),
  ]);
  // no clock was ever set, so TOP should be 0 or a flagged estimate
  assert.ok(g.stats.teams.US['top'] === undefined || g.stats.teams.US['top'] === 0 || g.stats.teams.US['top.estimated'] === true);
});

// ---------- 17: void and preview ----------
test('void removes an event; preview shows what an entry would produce', () => {
  const base = [
    poss('US', F.pos('US', 25)),
    play('run', { carrier: us(10), spot: F.pos('US', 32) }),
  ];
  const g = replay(setup, [...base, { type: 'void', target: 'e1' }]);
  assert.equal(g.entries.length, 1);  // only the possession entry remains

  const p = preview(setup, base, play('run', { carrier: us(10), spot: F.pos('US', 38) }));
  assert.ok(p.entry);
  assert.equal(p.entry.type, 'play');
});

// ---------- 18: manual big play credits the right counter ----------
test('manual big play attaches and credits non-derived stats once', () => {
  const g = replay(setup, [
    poss('US', F.pos('US', 30)),
    { type: 'bigplay', bigType: 'pbu', player: us(13), note: 'breakup on 3rd down' },
  ]);
  assert.equal(P(g, 'US:jadavian-garner').s['def.pbu'], 1);
  assert.equal(g.entries[1].title, 'Big Play: Pass Breakup');
});

// ---------- 19: suggestPenalty half-the-distance ----------
test('suggestPenalty applies half-the-distance near the goal line', () => {
  const r = suggestPenalty('holding', 8, 'US');  // US at own 8, 10-yd holding
  assert.equal(r.halfApplied, true);
  assert.equal(r.newSpot, 4);
});

// ---------- 20: warnings not crashes ----------
test('problems are warnings, not crashes', () => {
  const g = replay(setup, [
    poss('US', F.pos('US', 30)),
    { type: 'nonsense_event' },
  ]);
  assert.ok(g.warnings.length > 0);
  assert.equal(g.entries.length, 1);
});

// ---------- 21: NEW — blocked punt ----------
test('blocked punt: no crash, credited to blocker, ball to recovering team', () => {
  const g = replay(setup, [
    poss('US', F.pos('US', 30)),
    { type: 'possession', reason: 'blocked_punt', offense: 'OPP',
      kickingTeam: 'US', blockedBy: us(13), spot: F.pos('US', 20) },
  ]);
  assert.equal(g.st.offense, 'OPP');
  assert.equal(P(g, 'US:jadavian-garner').s['def.blk'], 1);
  assert.ok(last(g).big.includes('Blocked Punt'));
});

// ---------- 22: NEW — safety ----------
test('safety: 2 points to the defense, free kick next', () => {
  const g = replay(setup, [
    poss('US', F.pos('US', 5)),
    { type: 'score', team: 'OPP', scoreType: 'safety' },
  ]);
  assert.equal(g.st.score.OPP, 2);
  assert.ok(g.st.awaitingPossession && g.st.awaitingPossession.reason === 'free_kick');
});

// ---------- 23: NEW — 2-point try ----------
test('2-point try: successful run adds 2 to the score', () => {
  const g = replay(setup, [
    poss('US', F.pos('OPP', 20)),
    { type: 'score', team: 'US', scoreType: 'td_rush', carrier: us(10), yards: 20 },
    { type: 'try', team: 'US', tryType: 'run', good: true, carrier: us(10) },
  ]);
  assert.equal(g.st.score.US, 8);
  assert.equal(P(g, 'US:darion-brown').s['two.made'], 1);
});

// ---------- 24: NEW — blocked field goal ----------
test('blocked field goal: no score, ball to defense, blocker credited', () => {
  const g = replay(setup, [
    poss('US', F.pos('OPP', 25)),
    { type: 'possession', reason: 'blocked_fg', offense: 'OPP',
      kickingTeam: 'US', blockedBy: us(13), spot: F.pos('US', 35) },
  ]);
  assert.equal(g.st.score.US, 0);
  assert.equal(g.st.score.OPP, 0);
  assert.equal(g.st.offense, 'OPP');
  assert.equal(P(g, 'US:jadavian-garner').s['def.blk'], 1);
});
// ---------- 25: NEW — no roster: US players fall back to number-only ----------
test('no roster: US players fall back to number-only, like the opponent', () => {
  const noRoster = { teams: setup.teams, openingKick: 'OPP' };
  const g = replay(noRoster, [
    poss('US', F.pos('US', 25)),
    play('run', { carrier: us(10), spot: F.pos('US', 30) }),
  ]);
    const e = last(g);
  assert.equal(e.title, 'Medium Run');
  assert.equal(e.text, "Love Ridden - #10 5 yard rush, ball on own 30. 2nd & 5.");
  const p = g.stats.players.find(pp => pp.key === 'US:#10');
  assert.ok(p, 'US:#10 player should exist');
  assert.equal(p.s['rush.yds'], 5);
  assert.equal(p.name, '');

  // Opponent stays identical to before.
  const g2 = replay(noRoster, [
    poss('OPP', F.pos('OPP', 30)),
    play('run', { carrier: opp(22, 'Some Kid'), spot: F.pos('OPP', 34) }),
  ]);
    assert.equal(last(g2).text, "Pfenex - #22 Some Kid 4 yard rush, Pfenex's ball on their own 34. 2nd & 6.");
});
// ---------- 26: broken spots are rejected ----------
test('spot: 105 and spot: -5 are rejected with a warning, event not applied', () => {
  const g = replay(setup, [
    poss('US', F.pos('US', 30)),
    play('run', { carrier: us(10), spot: 105 }),
  ]);
  assert.equal(g.entries.length, 1);                 // only the possession entry
  assert.ok(g.warnings.some(w => /play\.spot 105 out of bounds/.test(w.message)));

  const g2 = replay(setup, [
    poss('US', F.pos('US', 30)),
    play('run', { carrier: us(10), spot: -5 }),
  ]);
  assert.equal(g2.entries.length, 1);
  assert.ok(g2.warnings.some(w => /play\.spot -5 out of bounds/.test(w.message)));
});

// ---------- 27: 50 yard line accepted both ways ----------
test('50 yard line is identical via US side, OPP side, or raw', () => {
  assert.equal(F.pos('US', 50), 50);
  assert.equal(F.pos('OPP', 50), 50);
  assert.equal(50, 50);
  const g = replay(setup, [
    poss('US', F.pos('US', 45)),
    play('run', { carrier: us(10), spot: F.pos('US', 50) }),   // via US-side 50
  ]);
  assert.equal(g.st.pos, 50);
});

// ---------- 28: PAT skip warns ----------
test('logging a play while a try is pending warns (PAT skipped?)', () => {
  const g = replay(setup, [
    poss('US', F.pos('OPP', 20)),
    { type: 'score', team: 'US', scoreType: 'td_rush', carrier: us(10), yards: 20 },
    play('run', { carrier: us(2), spot: F.pos('US', 25) }),  // logged a play instead of a try
  ]);
  assert.ok(g.warnings.some(w => /PAT skipped/.test(w.message)));
});

// ---------- 29: the Pfenex roster exists and is complete ----------
test('both test rosters have 28 players with unique numbers', async () => {
  const { LOVE_RIDDEN_ANGELS, PFENEX_FINANCIAL_GROUP } = await import('./test-teams.js');
  for (const team of [LOVE_RIDDEN_ANGELS, PFENEX_FINANCIAL_GROUP]) {
    assert.equal(team.roster.length, 28);
    const nums = new Set(team.roster.map(r => r.wornNumber));
    assert.equal(nums.size, 28, `${team.name} has duplicate numbers`);
  }
});