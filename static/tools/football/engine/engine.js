// engine.js — the whole game model. Pure functions, no DOM, no storage.
// See the full spec in the earlier conversation; this file implements it.

import { RULES, TITLE, BIG_PLAY_RULES, BIG_TYPES, FOULS } from './config.js';
import * as F from './field.js';
import { StatBook, finalize } from './stats.js';
import * as P from './prose.js';

export * as field from './field.js';

// ---------- ref helpers ----------
export const us = (num, id) => ({ team: 'US', num, id });
export const opp = (num, name) => ({ team: 'OPP', num, name });
export const clk = (q, mmss) => {
  const [m, s] = String(mmss || '0:00').split(':').map(Number);
  return { q, seconds: (m || 0) * 60 + (s || 0), text: mmss };
};

function resolveRef(ref, roster) {
  if (!ref) return null;
  const num = ref.num != null && ref.num !== '' ? Number(ref.num) : null;

  if (ref.team === 'US') {
    if (ref.id) {
      const p = roster.find(r => r._side === 'US' && r.id === ref.id);
      if (p) return { key: `US:${p.id}`, team: 'US', num: Number(p.wornNumber), name: p.displayName, id: p.id };
    }
    if (num != null) {
      const p = roster.find(r => r._side === 'US' && Number(r.wornNumber) === num);
      if (p) return { key: `US:${p.id}`, team: 'US', num: Number(p.wornNumber), name: p.displayName, id: p.id };
      return { key: `US:#${num}`, team: 'US', num, name: ref.name || '', id: null };
    }
    if (ref.id) {
      return { key: `US:${ref.id}`, team: 'US', num: null, name: ref.name || ref.id, id: ref.id };
    }
    return null;
  }

  if (ref.team === 'OPP') {
    if (num != null) {
      const p = roster.find(r => r._side === 'OPP' && Number(r.wornNumber) === num);
      const name = ref.name || (p ? p.displayName : '');
      return { key: `OPP:#${num}`, team: 'OPP', num, name, id: null };
    }
    if (ref.name) return { key: `OPP:${ref.name}`, team: 'OPP', num: null, name: ref.name, id: null };
    return null;
  }
  return null;
}
const resolveAll = (refs, roster) => (refs || []).map(r => resolveRef(r, roster)).filter(Boolean);

function assertSpot(p, label = 'spot') {
  if (p == null) return;
  if (typeof p !== 'number' || Number.isNaN(p) || p < 0 || p > 100) {
    throw new Error(`${label} ${p} out of bounds (must be a number 0–100; convert side-relative input with F.pos())`);
  }
}

// ---------- state ----------
function newState(setup) {
  const offense = setup.initialPossession || null;
  const pos = setup.initialSpot ?? 50;
  const down = setup.initialDown ?? 1;
  const dist = setup.initialDistance ?? 10;
  let ltg = pos + 10;
  if (offense) {
    ltg = F.lineToGain(offense, pos, down === 1 ? RULES.firstDownYards : dist);
  }
  return {
    offense,
    pos,
    down,
    ltg,
    score: setup.initialScore || { US: 0, OPP: 0 },
    quarter: setup.startQuarter || 1,
    clock: setup.initialClock || null,
    awaitingPossession: null,
    awaitingTry: null,
    lastSpot: pos,
  };
}

function setFirstDown(st, team, pos) {
  st.down = 1;
  st.ltg = F.lineToGain(team, pos, RULES.firstDownYards);
}
function advanceDown(st) {
  st.down += 1;
  if (st.down > 4) st.awaitingPossession = { reason: 'downs' };
}

// ---------- big play detection ----------
function detectBig(f) {
  const hits = [];
  for (const rule of BIG_PLAY_RULES) {
    if (rule.test(f)) {
      const label = typeof rule.label === 'function' ? rule.label(f) : rule.label;
      if (label) hits.push(label);
    }
  }
  return hits;
}

// ---------- stat credit ----------
function creditRun(book, f) {
  const c = f.carrier, off = f.off;
  book.team(off, 'plays'); book.team(off, 'rush.att'); book.team(off, 'rush.yds', f.gain);
  if (c) { book.add(c, 'rush.att'); book.add(c, 'rush.yds', f.gain); book.max(c, 'rush.long', f.gain); }
}
function creditPass(book, f) {
  const off = f.off;
  book.team(off, 'plays');
  book.team(off, 'pass.att');
  if (f.completed) { book.team(off, 'pass.cmp'); book.team(off, 'pass.yds', f.gain); }
  if (f.passer) { book.add(f.passer, 'pass.att'); if (f.completed) { book.add(f.passer, 'pass.cmp'); book.add(f.passer, 'pass.yds', f.gain); book.max(f.passer, 'pass.long', f.gain); } }
  if (f.receiver) { book.add(f.receiver, 'rec.tgt'); if (f.completed) { book.add(f.receiver, 'rec.rec'); book.add(f.receiver, 'rec.yds', f.gain); book.max(f.receiver, 'rec.long', f.gain); } }
}
function creditSack(book, f) {
  const off = f.off, def = F.other(off), loss = -f.gain;
  book.team(off, 'plays'); book.team(off, 'pass.att'); book.team(off, 'sack.n'); book.team(off, 'sack.yds', loss);
  if (f.passer) { book.add(f.passer, 'pass.att'); book.add(f.passer, 'pass.sacked'); book.add(f.passer, 'pass.sackyds', loss); }
  const n = f.sackers.length || 1;
  for (const s of f.sackers) {
    book.add(s, 'def.sack', 1 / n); book.add(s, 'def.sackyds', loss / n);
    if (RULES.sackCountsAsTackle) { if (n === 1) book.add(s, 'def.tkl'); else book.add(s, 'def.ast'); }
  }
}
function creditTackle(book, f) {
  const off = f.off, def = F.other(off), gain = f.gain;
  book.team(def, 'plays');
  const n = f.tacklers.length || 1;
  for (const t of f.tacklers) {
    book.add(t, 'def.tkl', 1);
    if (gain < 0) {
      const share = RULES.shareTfl && n > 1 ? 0.5 : 1;
      book.add(t, 'def.tfl', share);
      book.add(t, 'def.tflyds', gain * share);
    }
  }
}
function creditFumble(book, f) {
  if (!f.fumble) return;
  const { by, forcedBy, recoveredBy } = f.fumble;
  if (by) book.add(by, 'fum.n');
  if (forcedBy) book.add(forcedBy, 'def.ff');
  if (recoveredBy) {
    book.add(recoveredBy, 'def.fr');
    if (recoveredBy.team !== by?.team) { /* lost by offense */ if (by) book.add(by, 'fum.lost'); }
  }
}

// ---------- play ----------
function applyPlay(ev, st, book, roster) {
  const off = ev.offense || st.offense;
  const from = st.pos;
  assertSpot(ev.spot, 'play.spot');
  const to = ev.spot != null ? ev.spot : F.clamp(st.pos + (ev.yards || 0) * F.dir(off));
  const gain = (to - from) * F.dir(off);
  const kind = ev.kind;
  const completed = kind === 'pass' ? !!ev.completed : false;

  const f = {
    kind, gain, off, completed, scrimmage: true,
    carrier: resolveRef(ev.carrier, roster),
    passer: resolveRef(ev.passer, roster),
    receiver: resolveRef(ev.receiver, roster),
    tacklers: resolveAll(ev.tackles, roster),
    sackers: resolveAll(ev.sackers, roster),
    pbu: resolveRef(ev.pbu, roster),
    hurry: resolveRef(ev.hurry, roster),
    fumble: ev.fumble ? {
      by: resolveRef(ev.fumble.by, roster),
      forcedBy: resolveRef(ev.fumble.forcedBy, roster),
      recoveredBy: resolveRef(ev.fumble.recoveredBy, roster),
    } : null,
    spot: to,
  };

  // Credit
  if (kind === 'run' || kind === 'kneel') creditRun(book, f);
  else if (kind === 'pass') creditPass(book, f);
  else if (kind === 'sack') creditSack(book, f);
  else if (kind === 'tackle') creditTackle(book, f);
  if (f.fumble) creditFumble(book, f);

      // Advance state
  st.pos = to;
  const wasDown = st.down;
  st.down += 1;
  if (wasDown === 3) book.team(off, 'third.att');
  if (wasDown === 4) book.team(off, 'fourth.att');
  const reached = off === 'US' ? to >= st.ltg : to <= st.ltg;
  if (reached) {
    book.team(off, wasDown === 3 ? 'third.conv' : wasDown === 4 ? 'fourth.conv' : 'fd.other', 1);
    setFirstDown(st, off, to);
    book.team(off, 'fd.total', 1);
  } else if (st.down > 4) {
    st.awaitingPossession = { reason: 'downs' };
  }

  return f;
}

// ---------- score ----------
function applyScore(ev, st, book, roster) {
  const team = ev.team;
  const type = ev.scoreType || ev.type2 || 'td_rush';
  const pts = { td: RULES.points.td, fg: RULES.points.fg, safety: RULES.points.safety };
  const f = {
    team, type, yards: ev.yards || 0,
    carrier: resolveRef(ev.carrier, roster),
    passer: resolveRef(ev.passer, roster),
    receiver: resolveRef(ev.receiver, roster),
    returner: resolveRef(ev.returner, roster),
    interceptor: resolveRef(ev.interceptor, roster),
    kicker: resolveRef(ev.kicker, roster),
    distance: ev.distance || 0,
  };

  let add = 0;
  if (type.startsWith('td')) { add = 6; book.team(team, 'td'); }
  else if (type === 'fg') { add = 3; book.team(team, 'fg'); }
  else if (type === 'safety') { add = 2; book.team(F.other(team), 'safety'); book.team(team, 'safety', 1); }
  st.score[team] = (st.score[team] || 0) + add;

  // individual TD credit
  if (type === 'td_rush' && f.carrier) { book.add(f.carrier, 'rush.att'); book.add(f.carrier, 'rush.yds', f.yards); book.add(f.carrier, 'pts', 6); }
  if (type === 'td_pass' && f.passer) { book.add(f.passer, 'pass.att'); book.add(f.passer, 'pass.cmp'); book.add(f.passer, 'pass.yds', f.yards); book.add(f.passer, 'pass.td'); if (f.receiver) { book.add(f.receiver, 'rec.rec'); book.add(f.receiver, 'rec.yds', f.yards); book.add(f.receiver, 'rec.td'); book.add(f.receiver, 'pts', 6); } }
  if (type === 'td_int_return' && f.returner) { book.add(f.returner, 'def.inttd'); book.add(f.returner, 'pts', 6); }
  if (type === 'td_fumble_return' && f.returner) { book.add(f.returner, 'def.frtd'); book.add(f.returner, 'pts', 6); }
  if (type === 'td_kick_return' && f.returner) { book.add(f.returner, 'kr.td'); book.add(f.returner, 'pts', 6); }
  if (type === 'td_punt_return' && f.returner) { book.add(f.returner, 'pr.td'); book.add(f.returner, 'pts', 6); }
  if (type === 'fg' && f.kicker) { book.add(f.kicker, 'kick.fga'); book.add(f.kicker, 'kick.fgm'); book.add(f.kicker, 'pts', 3); book.max(f.kicker, 'kick.fglong', f.distance); }

  // Expect try (unless safety, which has a free kick)
  if (type === 'safety') st.awaitingPossession = { reason: 'free_kick' };
  else if (type.startsWith('td')) st.awaitingTry = { team };
  else st.awaitingPossession = { reason: 'kickoff' };
  return f;
}

function applyTry(ev, st, book, roster) {
  const team = ev.team;
  const tt = ev.tryType || 'kick';
  const good = !!ev.good;
  const f = {
    team, tryType: tt, good,
    kicker: resolveRef(ev.kicker, roster),
    carrier: resolveRef(ev.carrier, roster),
    passer: resolveRef(ev.passer, roster),
    receiver: resolveRef(ev.receiver, roster),
  };
  if (good) {
    if (tt === 'kick') { st.score[team] = (st.score[team] || 0) + 1; if (f.kicker) { book.add(f.kicker, 'kick.xpa'); book.add(f.kicker, 'kick.xpm'); book.add(f.kicker, 'pts', 1); } book.team(team, 'xpm'); }
    else { st.score[team] = (st.score[team] || 0) + 2; book.team(team, 'two.made'); if (f.carrier) book.add(f.carrier, 'two.made'); if (f.receiver) book.add(f.receiver, 'two.made'); if (f.passer) book.add(f.passer, 'two.made'); }
  } else {
    book.team(team, 'xpa');
    if (f.kicker) book.add(f.kicker, 'kick.xpa');
  }
  st.awaitingTry = null;
  st.awaitingPossession = { reason: 'kickoff' };
  return f;
}

// ---------- possession ----------
function applyPossession(ev, st, book, roster) {
  const team = ev.offense;
  const reason = ev.reason || 'other';
  const def = F.other(team);

  assertSpot(ev.spot, 'possession.spot');
  let spot = ev.spot != null ? ev.spot : st.pos;
  if (ev.touchback) spot = team === 'US' ? RULES.touchbackYd : 100 - RULES.touchbackYd;

  const f = {
    reason, offense: team, kickingTeam: ev.kickingTeam || def,
    spot, touchback: !!ev.touchback, fairCatch: !!ev.fairCatch,
    kicker: resolveRef(ev.kicker, roster),
    returner: resolveRef(ev.returner, roster),
    passer: resolveRef(ev.passer, roster),
    receiver: resolveRef(ev.receiver, roster),
    interceptor: resolveRef(ev.interceptor, roster),
    recoveredBy: resolveRef(ev.recoveredBy, roster),
    fumbledBy: resolveRef(ev.fumbledBy, roster),
    forcedBy: resolveRef(ev.forcedBy, roster),
    blockedBy: resolveRef(ev.blockedBy, roster),
    distance: ev.distance || 0,
    scrimmage: false,
  };

  // stat credit
  if (reason === 'punt' && f.kicker) {
    const from = st.pos;
    const to = spot;
    const off = st.offense;
    const grossYds = Math.abs((to - from));
    book.add(f.kicker, 'punt.att'); book.add(f.kicker, 'punt.yds', grossYds); book.max(f.kicker, 'punt.long', grossYds);
    book.team(off, 'punt.att'); book.team(off, 'punt.yds', grossYds);
    if (f.returner) { book.add(f.returner, 'pr.att'); }
  }
  if (reason === 'interception') {
    const off = st.offense;
    book.team(off, 'pass.att'); book.team(off, 'to.int');
    if (f.passer) { book.add(f.passer, 'pass.att'); book.add(f.passer, 'pass.int'); }
    if (f.interceptor) book.add(f.interceptor, 'def.int');
  }
  if (reason === 'fumble' && f.recoveredBy) {
    book.add(f.recoveredBy, 'def.fr');
    const off = st.offense;
    book.team(off, 'to.fum');
  }
  if (reason === 'blocked_punt' && f.blockedBy) book.add(f.blockedBy, 'def.blk');
  if (reason === 'blocked_fg' && f.blockedBy) book.add(f.blockedBy, 'def.blk');

  // advance state
  st.offense = team;
  st.pos = spot;
  setFirstDown(st, team, spot);
  st.awaitingPossession = null;
  st.awaitingTry = null;
  return f;
}

// ---------- penalty ----------
function applyPenalty(ev, st, book) {
  const f = { ...ev };
  if (f.offsetting) return f;
  if (f.accepted === false) { if (f.team !== 'BOTH') book.team(f.team, 'pen.declined'); return f; }

  const team = f.team;
  const foulDef = FOULS[f.foul] || { yards: 5 };
  let yds = foulDef.yards;
  let pos = st.pos;
    const offDir = F.dir(st.offense || 'US');
  const dirMult = (st.offense === team) ? -offDir : offDir;
  const newPos = F.clamp(pos + dirMult * yds);
  yds = Math.abs(newPos - pos);
  st.pos = newPos;
  if (foulDef.autoFirst) setFirstDown(st, st.offense, newPos);
  if (foulDef.lossOfDown) st.down += 1;
  book.team(team, 'pen.n'); book.team(team, 'pen.yds', yds);
  if (f.players) for (const side of ['US','OPP']) if (f.players[side] != null) book.team(side, 'pen.n');
  return { ...f, from: pos, to: newPos };
}

// ---------- main replay ----------
export function replay(setup, events) {
  const usRoster = (setup.roster || []).filter(r => r.active !== false);
  const oppRoster = setup.oppRoster || [];
  const roster = [
    ...usRoster.map(r => ({ ...r, _side: 'US' })),
    ...oppRoster.map(r => ({ ...r, _side: 'OPP' })),
  ];
  const teams = setup.teams || {};
  const names = {
    US: ((teams.US && (teams.US.short || teams.US.name)) || 'US'),
    OPP: ((teams.OPP && (teams.OPP.short || teams.OPP.name)) || 'OPP'),
  };
  const book = new StatBook();

  // Pre-register active US roster players so they appear in the box score
  // even if they never record a stat. If no roster is supplied, this loop
  // is empty and US players are created on-demand by number — exactly like
  // the opponent behavior.
    for (const r of roster) {
    if (r._side !== 'US') continue;
    book.player({ key: `US:${r.id}`, team: 'US', num: Number(r.wornNumber), name: r.displayName, id: r.id });
  }

  const st = newState(setup);
  const entries = [];
  const warnings = [];
  const drives = [];
  let currentDrive = null;
  let prevClockSec = null;

  // Pre-scan voids so a void event applies BEFORE its target is replayed.
  const voided = new Set();
  for (const ev of events) {
    if (ev.type === 'void' && ev.target) voided.add(ev.target);
  }

  function finishDrive() {
    if (!currentDrive) return;
    if (!currentDrive.hadReading) currentDrive.topEstimated = true;
    drives.push(currentDrive);
    currentDrive = null;
  }
  function startDrive(team) {
    finishDrive();
    currentDrive = { team, top: 0, topEstimated: false, hadReading: false };
  }
  function noteClock(ev) {
    if (!ev.clock) return;
    st.clock = ev.clock;
    if (currentDrive && prevClockSec != null) {
      currentDrive.top += Math.max(0, prevClockSec - ev.clock.seconds);
      currentDrive.hadReading = true;
    }
    prevClockSec = ev.clock.seconds;
  }

  const cx = { st, names, prose: { showTacklers: true } };
  const byId = new Map();

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const id = ev.id || `e${i}`;
    byId.set(id, ev);

    if (ev.type === 'void') continue;
    if (voided.has(id)) continue;

    try {
      noteClock(ev);
      if (st.awaitingTry && ev.type !== 'try' && ev.type !== 'clock' && ev.type !== 'quarter' && ev.type !== 'void') {
        warnings.push({ id, level: 'warn', message: `Logged a ${ev.type} while a try was pending — PAT skipped?` });
      }
      const entry = { id, type: ev.type, needsClock: false };

      if (ev.type === 'play') {
        const f = applyPlay(ev, st, book, roster);
        entry.gain = f.gain;
        entry.big = detectBig(f);
        entry.title = TITLE[f.kind] ? TITLE[f.kind](f.gain, f.completed) : 'Play';
        if (entry.big.length) entry.title = `Big Play: ${entry.big[0]}`;
        entry.text = P.playText(cx, f);
        entry.needsClock = st.down === 1 || entry.big.length > 0;
        if (f.kind === 'tackle') warnings.push({ id, level: 'info', message: 'Defense-only entry logged' });
      } else if (ev.type === 'score') {
        const f = applyScore(ev, st, book, roster);
        entry.big = detectBig(f);
        entry.title = (f.type || 'Score').toUpperCase();
        if (entry.big.length) entry.title = `Big Play: ${entry.big[0]}`;
        entry.text = P.scoreText(cx, f);
        entry.needsClock = true;
      } else if (ev.type === 'try') {
        const f = applyTry(ev, st, book, roster);
        entry.title = 'Try';
        entry.text = P.tryText(cx, f);
        entry.needsClock = true;
      } else if (ev.type === 'possession') {
        const f = applyPossession(ev, st, book, roster);
        startDrive(f.offense);
        entry.big = detectBig(f);
        entry.title =
          f.reason === 'kickoff' ? 'Kickoff' :
          f.reason === 'punt' ? 'Punt' :
          f.reason === 'interception' ? 'Interception' : 'Possession';
        if (entry.big.length) entry.title = `Big Play: ${entry.big[0]}`;
        entry.text = P.possessionText(cx, f);
        entry.needsClock = true;
      } else if (ev.type === 'penalty') {
        const f = applyPenalty(ev, st, book);
        entry.title = 'Penalty';
        entry.text = P.penaltyText(cx, f);
      } else if (ev.type === 'bigplay') {
        const meta = BIG_TYPES[ev.bigType] || { label: 'Big Play' };
        const player = resolveRef(ev.player, roster);
        if (meta.credit && player) book.add(player, meta.credit);
        entry.title = `Big Play: ${meta.label}`;
        entry.text = P.bigPlayText(cx, { label: meta.label, player, note: ev.note });
      } else if (ev.type === 'clock') {
        continue;
      } else if (ev.type === 'quarter') {
        st.quarter = ev.q;
        continue;
      } else if (ev.type === 'final') {
        st.awaitingPossession = null;
        st.awaitingTry = null;
        continue;
      } else {
        warnings.push({ id, level: 'warn', message: `Unknown event type: ${ev.type}` });
        continue;
      }

      entry.clock = st.clock || null;
      entries.push(entry);
    } catch (e) {
      warnings.push({ id, level: 'warn', message: `Could not apply event: ${e.message}` });
    }
  }

  finishDrive();
  const stats = finalize(book, drives);
  return { st, entries, warnings, stats, drives, names, roster };
}

// ---------- preview (compute what an event would produce) ----------
export function preview(setup, events, extraEvent) {
  const before = replay(setup, events);
  const after = replay(setup, [...events, extraEvent]);
  const entry = after.entries[after.entries.length - 1] || null;
  return { entry, before, after };
}

// ---------- suggestPenalty ----------
export function suggestPenalty(foulKey, spot, offenseTeam) {
  const foul = FOULS[foulKey] || { yards: 5, half: true };
  let yards = foul.yards;
  let newSpot;
  if (offenseTeam === 'US') newSpot = spot - yards; else newSpot = spot + yards;
  if (newSpot < 0) { newSpot = Math.floor(spot / 2); yards = spot - newSpot; }
  if (newSpot > 100) { newSpot = Math.ceil((spot + 100) / 2); yards = newSpot - spot; }
  return { foulKey, yards, newSpot, halfApplied: yards !== foul.yards, autoFirst: !!foul.autoFirst, lossOfDown: !!foul.lossOfDown };
}