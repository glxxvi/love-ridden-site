// drive.js — walking-skeleton Drive screen.
// In-memory event log only (persistence lands in increment 2). Rush-only entry.

import { replay, us, opp, field as F } from './engine/engine.js';
import { testSetup } from './engine/test-teams.js';

const setup = testSetup();

// Bootstrap: opening kickoff → US on own 25, 1st & 10.
let events = [];
if (events.length === 0) {
  events.push({
    id: 'ev0',
    type: 'possession',
    reason: 'kickoff',
    offense: 'US',
    kickingTeam: 'OPP',
    kicker: opp(3),
    returner: us(1),
    spot: F.pos('US', 25),
  });
}

const headerEl = document.getElementById('header');
const logEl = document.getElementById('log');
const rushBtn = document.getElementById('btn-rush');
const undoBtn = document.getElementById('btn-undo');
const dlg = document.getElementById('rush-dialog');
const form = document.getElementById('rush-form');
const rushNum = document.getElementById('rush-num');
const rushYard = document.getElementById('rush-yard');
const rushError = document.getElementById('rush-error');
const rushCancel = document.getElementById('rush-cancel');

function nextId() {
  return 'ev' + (events.length + 1);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function render() {
  try {
    const g = replay(setup, events);
    renderHeader(g);
    renderLog(g);
    undoBtn.disabled = events.length <= 1;
  } catch (err) {
    headerEl.innerHTML = '';
    logEl.innerHTML =
      `<article class="entry">
        <div class="entry-title" style="color:#ff7a7a">ERROR</div>
        <div class="entry-text">${escapeHtml(err.message || String(err))}</div>
      </article>`;
    console.error(err);
  }
}

function renderHeader(g) {
  const s = g.st;
  let situation;
  if (s.awaitingTry) situation = 'Try needed';
  else if (s.awaitingPossession) situation = 'Possession update needed';
  else situation = F.downAndDistance(s.offense, s.down, s.pos, s.ltg);

  const spot = s.offense ? F.spotText(s.offense, s.pos, g.names) : '';
  const clock = s.clock ? s.clock.text : '';

  headerEl.innerHTML = `
    <div class="teams">
      <span>${escapeHtml(g.names.US)}</span>
      <span>${escapeHtml(g.names.OPP)}</span>
    </div>
    <div class="scores">
      <span>${s.score.US}</span>
      <span class="dash">–</span>
      <span>${s.score.OPP}</span>
    </div>
    <div class="meta">
      <span>Q${s.quarter}</span>
      ${clock ? `<span>${escapeHtml(clock)}</span>` : ''}
    </div>
    <div class="situation">${escapeHtml(situation)}</div>
    ${spot ? `<div class="spot">${escapeHtml(spot)}</div>` : ''}
  `;
}

function renderLog(g) {
  logEl.innerHTML = g.entries
    .slice()
    .reverse()
    .map(e => `
      <article class="entry">
        <div class="entry-title">${escapeHtml(e.title || e.type)}</div>
        <div class="entry-text">${escapeHtml(e.text || '')}</div>
      </article>
    `)
    .join('');
}

rushBtn.addEventListener('click', () => {
  form.reset();
  rushNum.value = '';
  rushYard.value = '';
  rushError.textContent = '';
  dlg.showModal();
});

rushCancel.addEventListener('click', () => dlg.close());

form.addEventListener('submit', e => {
  e.preventDefault();
  rushError.textContent = '';

  const numStr = rushNum.value.trim();
  const yardStr = rushYard.value.trim();
  const num = Number(numStr);
  const yard = Number(yardStr);

  if (!/^\d+$/.test(numStr) || num < 0 || num > 99) {
    rushError.textContent = 'Rusher number must be 0–99.';
    return;
  }
  if (!/^\d+$/.test(yardStr) || yard < 0 || yard > 50) {
    rushError.textContent = 'Yard line must be 0–50 (50 is midfield).';
    return;
  }
  const side = form.querySelector('input[name="side"]:checked').value;
  const spot = F.pos(side, yard);

  events.push({
    id: nextId(),
    type: 'play',
    kind: 'run',
    carrier: us(num),
    spot,
  });

  dlg.close();
  render();
});

undoBtn.addEventListener('click', () => {
  if (events.length <= 1) return;
  events.pop();
  render();
});

render();