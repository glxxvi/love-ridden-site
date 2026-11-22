// prose.js — turns derived plays into play-by-play text.

import * as F from './field.js';
import { FOULS } from './config.js';

const plural = n => (Math.abs(n) === 1 ? '' : 's');
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

export const who = r => {
  if (!r) return 'Unknown player';
  const hasNum = r.num != null && r.num !== '' && !Number.isNaN(Number(r.num));
  const hasName = !!r.name;
  if (hasNum && hasName) return `#${r.num} ${r.name}`;
  if (hasNum) return `#${r.num}`;
  if (hasName) return r.name;
  return 'Unknown player';
};
export const whoList = rs => (rs && rs.length ? rs.map(who).join(', ') : 'Unknown player');

const gainPhrase = (g, noun) =>
  g > 0 ? `${g} yard ${noun}` : g === 0 ? `${noun} for no gain` : `${noun} for a loss of ${-g} yard${plural(g)}`;

export function situation(cx) {
  const { offense, pos, down, ltg } = cx.st;
  return `${F.spotText(offense, pos, cx.names)}. ${F.downAndDistance(offense, down, pos, ltg)}.`;
}

export const scoreLine = cx => `${cx.names.US} ${cx.st.score.US}, ${cx.names.OPP} ${cx.st.score.OPP}.`;

export function playText(cx, f) {
  const { kind, gain, off } = f;
  const def = F.other(off);
  let team = off;
  let body;
  switch (kind) {
    case 'run':
      body = f.carrier ? `${who(f.carrier)} ${gainPhrase(gain, 'rush')}` : cap(gainPhrase(gain, 'rush'));
      break;
    case 'pass':
      if (f.completed) body = `${who(f.passer)} ${gainPhrase(gain, 'pass')} to ${who(f.receiver)}`;
      else {
        body = `${who(f.passer)} pass incomplete${f.receiver ? ` to ${who(f.receiver)}` : ''}`;
        if (f.pbu) body += `, broken up by ${who(f.pbu)}`;
      }
      if (f.hurry) body += ` (hurried by ${who(f.hurry)})`;
      break;
    case 'sack':
      body = `${who(f.passer)} sacked by ${whoList(f.sackers)} for a loss of ${-gain} yard${plural(gain)}`;
      break;
    case 'tackle':
      team = def;
      body = `${whoList(f.tacklers)} tackle${gain < 0 ? ` for a ${-gain} yard loss` : gain > 0 ? ` after a ${gain} yard gain` : ''}`;
      break;
    case 'kneel': body = `${who(f.carrier)} kneel down`; break;
    case 'spike': body = `${who(f.passer)} spike, ball spiked to stop the clock`; break;
    default: body = kind;
  }
  let extra = '';
  if (cx.prose && cx.prose.showTacklers && kind !== 'tackle' && kind !== 'sack' && f.tacklers && f.tacklers.length) {
    extra += ` (tackled by ${whoList(f.tacklers)})`;
  }
  if (f.fumble) {
    extra += ` FUMBLE by ${who(f.fumble.by)}${f.fumble.forcedBy ? `, forced by ${who(f.fumble.forcedBy)}` : ''}${f.fumble.recoveredBy ? `, recovered by ${who(f.fumble.recoveredBy)}` : ''}.`;
    return `${cx.names[team]} - ${body}, ${situation(cx).replace(/\.$/, '')}.${extra}`;
  }
  return `${cx.names[team]} - ${body}${extra}, ${situation(cx)}`;
}

export function scoreText(cx, f) {
  const { team } = f;
  let body;
  switch (f.type) {
    case 'td_rush':         body = `${who(f.carrier)} ${f.yards} yard rush`; break;
    case 'td_pass':         body = `${who(f.passer)} ${f.yards} yard pass to ${who(f.receiver)}`; break;
    case 'td_kick_return':  body = `${who(f.returner)} ${f.yards} yard kickoff return`; break;
    case 'td_punt_return':  body = `${who(f.returner)} ${f.yards} yard punt return`; break;
    case 'td_int_return':   body = `${who(f.interceptor || f.returner)} ${f.yards} yard interception return`; break;
    case 'td_fumble_return':body = `${who(f.returner)} ${f.yards} yard fumble return`; break;
    case 'td_blocked_return':body = `${who(f.returner)} ${f.yards} yard blocked kick return`; break;
    case 'fg':              body = `${who(f.kicker)} ${f.distance} yard field goal`; break;
    case 'safety':          body = `Safety, ${cx.names[team]} scores 2`; break;
    default:                body = f.type;
  }
  return `${cx.names[team]} - ${body}. ${scoreLine(cx)}`;
}

export function tryText(cx, f) {
  const { team } = f;
  let body;
  switch (f.tryType) {
    case 'kick': body = `${who(f.kicker)} extra point ${f.good ? 'good' : 'failed'}`; break;
    case 'run':  body = `${who(f.carrier)} ${f.good ? 'rush good for 2' : 'rush failed'}`; break;
    case 'pass': body = `${who(f.passer)} pass ${f.good ? 'good for 2' : 'failed'}${f.receiver ? ` to ${who(f.receiver)}` : ''}`; break;
    default:     body = 'try';
  }
  return `${cx.names[team]} - ${body}. ${scoreLine(cx)}`;
}

export function possessionText(cx, f) {
  const team = f.offense;
  const kicking = F.other(team);
  switch (f.reason) {
    case 'kickoff':
    case 'onside':
      if (f.touchback) return `${cx.names[kicking]} kickoff touchback, ${cx.names[team]}'s ball on their own 20. 1st & 10.`;
      return `${cx.names[kicking]} - ${who(f.kicker)} kickoff to ${who(f.returner)}, ${situation(cx)}`;
    case 'free_kick':
      return `${cx.names[kicking]} - free kick to ${who(f.returner)}, ${situation(cx)}`;
    case 'punt':
      return `${cx.names[team]} - ${who(f.kicker)} punt${f.touchback ? ' touchback' : ''}, ${situation(cx)}`;
    case 'interception':
      return `${cx.names[team]} - ${who(f.interceptor || f.passer)} interception${f.passer && f.interceptor ? ` (thrown by ${who(f.passer)})` : ''}, ${situation(cx)}`;
    case 'fumble':
      return `${cx.names[team]} - fumble recovery by ${who(f.recoveredBy)}, ${situation(cx)}`;
    case 'downs':
      return `${cx.names[team]} takes over on downs, ${situation(cx)}`;
    case 'missed_fg':
      return `${cx.names[kicking]} - ${who(f.kicker)} ${f.distance || ''} yard field goal missed, ${situation(cx)}`;
    case 'blocked_fg':
      return `${cx.names[team]} - field goal blocked${f.blockedBy ? ` by ${who(f.blockedBy)}` : ''}, ${situation(cx)}`;
    case 'blocked_punt':
      return `${cx.names[team]} - punt blocked${f.blockedBy ? ` by ${who(f.blockedBy)}` : ''}, ${situation(cx)}`;
    default:
      return `${cx.names[team]} possession change, ${situation(cx)}`;
  }
}

export function penaltyText(cx, f) {
  const off = f.team === 'BOTH' ? 'both teams' : cx.names[f.team] || f.team;
  const label = (f.foul && FOULS[f.foul] && FOULS[f.foul].label) || 'Penalty';
  const yds = (f.from != null && f.to != null) ? Math.abs(f.to - f.from) : 0;
  const kind = f.offsetting ? 'offsetting' : f.accepted === false ? 'declined' : 'accepted';
  let body = `PENALTY - ${off} ${label}`;
  if (!f.offsetting && f.accepted !== false) body += `, ${yds} yard${plural(yds)}`;
  body += `, ${kind}`;
  return `${body}. ${situation(cx)}`;
}

export function bigPlayText(cx, b) {
  return `Big Play: ${b.label}${b.player ? ` by ${who(b.player)}` : ''}${b.note ? ` - ${b.note}` : ''}.`;
}