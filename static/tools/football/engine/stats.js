// stats.js — counters only. Engine bumps flat dotted counters; finalize() adds averages.

export class StatBook {
  constructor() { this.players = new Map(); this.teams = { US: {}, OPP: {} }; }

  player(r) {
    if (!r) return null;
    let p = this.players.get(r.key);
    if (!p) { p = { key: r.key, team: r.team, num: r.num, name: r.name, id: r.id, s: {} }; this.players.set(r.key, p); }
    else if (!p.name && r.name) p.name = r.name;
    return p;
  }

    add(r, path, n = 1) {
    if (!r) return;
    const p = r.s ? r : this.player(r);
    if (!p) return;
    p.s[path] = (p.s[path] ?? 0) + n;
  }
  max(r, path, v) {
    if (!r) return;
    const p = r.s ? r : this.player(r);
    if (!p) return;
    if (p.s[path] === undefined || v > p.s[path]) p.s[path] = v;
  }
  team(t, path, n = 1) { this.teams[t][path] = (this.teams[t][path] ?? 0) + n; }
  teamMax(t, path, v) { const s = this.teams[t]; if (s[path] === undefined || v > s[path]) s[path] = v; }
}

const r1 = n => Math.round(n * 10) / 10;
const div = (a, b) => (b ? a / b : null);

export function derive(s) {
  const g = k => s[k] ?? 0;
  const d = {};
  if (g('rush.att')) d['rush.avg'] = r1(g('rush.yds') / g('rush.att'));
  if (g('pass.att')) { d['pass.pct'] = r1((100 * g('pass.cmp')) / g('pass.att')); d['pass.ypa'] = r1(g('pass.yds') / g('pass.att')); }
  if (g('rec.rec')) d['rec.avg'] = r1(g('rec.yds') / g('rec.rec'));
  if (g('punt.att')) d['punt.avg'] = r1(g('punt.yds') / g('punt.att'));
  if (g('kr.att')) d['kr.avg'] = r1(g('kr.yds') / g('kr.att'));
  if (g('pr.att')) d['pr.avg'] = r1(g('pr.yds') / g('pr.att'));
  if (g('kick.ko')) d['ko.avg'] = r1(g('kick.koyds') / g('kick.ko'));
  d['def.tkl.total'] = g('def.tkl') + g('def.ast');
  return d;
}

export function finalize(book, drives) {
  const players = [...book.players.values()]
    .map(p => ({ ...p, d: derive(p.s) }))
    .sort((a, b) => a.team.localeCompare(b.team) || (Number(a.num) || 999) - (Number(b.num) || 999));

  const teams = {};
  for (const t of ['US', 'OPP']) {
    const s = { ...book.teams[t] };
    const g = k => s[k] ?? 0;
    s['fd.total'] = g('fd.rush') + g('fd.pass') + g('fd.pen') + g('fd.other');
    s['pass.net'] = g('pass.yds') - g('sack.yds');
    s['top'] = drives.filter(d => d.team === t).reduce((n, d) => n + (d.top ?? 0), 0);
    s['top.estimated'] = drives.some(d => d.team === t && d.topEstimated);
    s['drives'] = drives.filter(d => d.team === t).length;
    const ypp = div(g('yds'), g('plays'));
    if (ypp !== null) s['ypp'] = r1(ypp);
    if (g('third.att'))  s['third.pct']  = r1((100 * g('third.conv'))  / g('third.att'));
    if (g('fourth.att')) s['fourth.pct'] = r1((100 * g('fourth.conv')) / g('fourth.att'));
    if (g('rz.att'))     s['rz.pct']     = r1((100 * g('rz.td'))       / g('rz.att'));
    s['to.total'] = g('to.int') + g('to.fum');
    teams[t] = s;
  }
  return { players, teams, drives };
}