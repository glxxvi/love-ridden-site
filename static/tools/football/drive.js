// drive.js — Drive screen. Reads setup from the handoff written by index.html.

import { replay, us, opp, field as F } from './engine/engine.js';
import { testSetup } from './engine/test-teams.js';
import { loadGame } from './game-state.js';

// --- Boot: load game from handoff, or allow ?dev=1 for isolated testing ---
const stored = loadGame();
const isDev = new URLSearchParams(location.search).has('dev');

if (!stored && !isDev) {
  // No handoff and not in dev mode — show a helpful screen instead of fake teams.
  document.body.style.visibility = 'visible';
  document.body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;padding:24px;text-align:center;font-family:'Geist Mono',ui-monospace,monospace;color:#e8e8ea;background:#0a0a0b">
      <h1 style="font-size:20px;margin:0 0 12px;font-weight:600">No game loaded</h1>
      <p style="color:#7e7e83;margin:0 0 24px;font-size:14px;line-height:1.5;max-width:320px">
        Start a game from the setup page, or append <code style="background:#1c1c1f;padding:2px 6px;border-radius:4px;font-size:12px">?dev=1</code> to this URL to test with dev teams.
      </p>
      <a href="./index.html" style="background:#3ddc97;color:#052418;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-family:inherit">Go to Setup</a>
    </div>
  `;
  // Controlled early exit — stops the rest of the module from running.
  throw new Error('No game loaded — redirected to setup');
}

const devMode = !stored;

const game = stored || (() => {
  const t = testSetup();
  return {
    gameId: 'dev',
    teams: {
      US:  { ...t.teams.US,  abbr: 'SA',  primary: '#3d5a80', secondary: '#e0fbfc', logo: null },
      OPP: { ...t.teams.OPP, abbr: 'JOQ', primary: '#c8102e', secondary: '#ffffff', logo: null },
    },
    roster: t.roster,
    oppRoster: t.oppRoster,
    openingKick: t.openingKick,
    startQuarter: t.startQuarter,
  };
})();

// Tab title reflects the actual teams loaded.
document.title = `${game.teams.US.short || game.teams.US.name} vs ${game.teams.OPP.short || game.teams.OPP.name} — Scorer`;

// Setup object the engine consumes — colors/abbr/logo are ignored by replay().
const setup = {
  teams: game.teams,
  roster: game.roster,
  oppRoster: game.oppRoster,
  openingKick: game.openingKick,
  startQuarter: game.startQuarter,
};

// Apply team colors as CSS variables so the whole page re-themes to the school.
if (game.teams.US?.primary) {
  document.documentElement.style.setProperty('--team-primary', game.teams.US.primary);
  document.documentElement.style.setProperty('--team-primary-fg', game.teams.US.secondary || '#052418');
  document.documentElement.style.setProperty('--us-logo', game.teams.US.primary);
}
if (game.teams.OPP?.primary) {
  document.documentElement.style.setProperty('--opp-logo', game.teams.OPP.primary);
}
document.body.style.visibility = 'visible';

// Swap logo initials on the scoreboard to match the teams.
document.querySelector('.team.us .logo').textContent = game.teams.US.abbr || initialsOf(game.teams.US.short);
document.querySelector('.team.opp .logo').textContent = game.teams.OPP.abbr || initialsOf(game.teams.OPP.short);

function initialsOf(name) {
  if (!name) return '?';
  return name.split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase();
}

// Dev badge.
const devBadge = document.getElementById('dev-badge');
if (devMode && devBadge) devBadge.hidden = false;

// Bootstrap: opening kickoff based on the handoff's openingKick.
// If US receives, US takes over on own 25. If OPP receives, OPP does.
const receivingTeam = game.openingKick === 'US' ? 'OPP' : 'US';
const kickingTeam = receivingTeam === 'US' ? 'OPP' : 'US';

const events = [{
  id: 'ev0',
  type: 'possession',
  reason: 'kickoff',
  offense: receivingTeam,
  kickingTeam,
  kicker: kickingTeam === 'OPP' ? opp(3) : us(3),
  returner: receivingTeam === 'US' ? us(1) : opp(1),
  spot: F.pos(receivingTeam, 25),
}];

// --- DOM ---
const $ = id => document.getElementById(id);
const scoreUS = $('score-us'), scoreOpp = $('score-opp'), meta = $('meta');
const possUS = $('poss-us'), possOpp = $('poss-opp');
const situationEl = $('situation'), lastPlayEl = $('last-play');
const ballGroup = $('ball-group');
const padHeader = $('pad-header'), padDisplay = $('pad-display');
const padNumber = $('pad-number'), padYard = $('pad-yard');
const sideToggle = $('side-toggle'), yardGrid = $('yard-grid');
const undoBtn = $('btn-undo'), historyBtn = $('btn-history');
const playTypeChips = document.querySelectorAll('.chip');
const logDialog = $('log-dialog'), logList = $('log-list'), logClose = $('log-close');
const placeholderDialog = $('placeholder-dialog');
const placeholderTitle = $('placeholder-title'), placeholderClose = $('placeholder-close');
const toast = $('toast');

// --- State ---
let mode = 'idle';       // 'idle' | 'number' | 'yard'
let activeKind = null;   // 'run' | 'pass' | ...
let numBuffer = '';
let sideChoice = 'US';
let selectedYard = null;

// --- Helpers ---
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 1800);
}

function nextId() {
  return 'ev' + (events.length + 1);
}

// --- Render ---
function render() {
  try {
    const g = replay(setup, events);
    renderScoreboard(g);
    renderField(g);
    renderSituation(g);
    renderLastPlay(g);
    renderLog(g);
    undoBtn.disabled = events.length <= 1;
  } catch (err) {
    console.error(err);
    situationEl.textContent = 'ERROR';
    situationEl.style.color = '#ff6b6b';
    lastPlayEl.textContent = err.message || String(err);
  }
}

function renderScoreboard(g) {
  const s = g.st;
  scoreUS.textContent = s.score.US;
  scoreOpp.textContent = s.score.OPP;
  const clock = s.clock ? s.clock.text : '12:00';
  meta.textContent = `Q${s.quarter} · ${clock}`;
  possUS.classList.toggle('active', s.offense === 'US');
  possOpp.classList.toggle('active', s.offense === 'OPP');
}

function renderField(g) {
  const pos = g.st.pos;
  // viewBox: x=100 is US goal line, x=1100 is OPP goal line. 10px per yard.
  const x = 100 + pos * 10;
  ballGroup.setAttribute('transform', `translate(${x}, 320)`);
}

function renderSituation(g) {
  const s = g.st;
  if (s.awaitingTry) {
    situationEl.textContent = `PAT needed — ${g.names[s.awaitingTry.team]}`;
  } else if (s.awaitingPossession) {
    situationEl.textContent = 'Possession update needed';
  } else {
    const dist = F.downAndDistance(s.offense, s.down, s.pos, s.ltg);
    const spot = F.spotText(s.offense, s.pos, g.names);
    situationEl.textContent = `${dist} · ${spot}`;
  }
  situationEl.style.color = 'var(--team-primary)';
}

function renderLastPlay(g) {
  if (g.entries.length === 0) {
    lastPlayEl.textContent = '—';
    return;
  }
  lastPlayEl.textContent = g.entries[g.entries.length - 1].text || '';
}

function renderLog(g) {
  logList.innerHTML = g.entries
    .slice()
    .reverse()
    .map(e => `
      <article class="log-entry">
        <div class="log-title">${escapeHtml(e.title || e.type)}</div>
        <div class="log-text">${escapeHtml(e.text || '')}</div>
      </article>
    `)
    .join('');
}

// --- Play type ---
playTypeChips.forEach(chip => {
  chip.addEventListener('click', () => {
    const kind = chip.dataset.kind;
    if (kind !== 'run') {
      showToast(`${chip.textContent} — coming next increment`);
      return;
    }
    playTypeChips.forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeKind = 'run';
    numBuffer = '';
    mode = 'number';
    renderPad();
  });
});

// --- Pad render ---
function renderPad() {
  if (mode === 'number') {
    padHeader.textContent = activeKind === 'run' ? 'Rusher #' : 'Player #';
    padDisplay.textContent = numBuffer || '—';
    padDisplay.classList.toggle('empty', !numBuffer);
    padNumber.style.display = 'grid';
    padYard.style.display = 'none';
  } else if (mode === 'yard') {
    padHeader.textContent = `Ball ended on (${sideChoice === 'US' ? 'Own' : 'Opp'})`;
    padDisplay.textContent = selectedYard !== null ? `${sideChoice === 'US' ? 'Own' : 'Opp'} ${selectedYard}` : '—';
    padDisplay.classList.toggle('empty', selectedYard === null);
    padNumber.style.display = 'none';
    padYard.style.display = 'flex';
    // Update side toggle
    sideToggle.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', b.dataset.side === sideChoice);
    });
  } else {
    padHeader.textContent = 'Select a play type';
    padDisplay.textContent = '—';
    padDisplay.classList.add('empty');
    padNumber.style.display = 'none';
    padYard.style.display = 'none';
  }
}

// --- Number pad ---
padNumber.addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const key = btn.dataset.key;
  if (key === 'back') {
    numBuffer = numBuffer.slice(0, -1);
  } else if (key === 'ok') {
    if (!numBuffer) return;
    // Advance to yard
    sideChoice = 'US';   // default; will be overridden if ball is past midfield
    const preview = replay(setup, events);
    if (preview.st.pos > 50) sideChoice = 'OPP';
    selectedYard = null;
    mode = 'yard';
  } else if (/^\d$/.test(key)) {
    if (numBuffer.length < 2) numBuffer += key;
  }
  renderPad();
});

// --- Side toggle ---
sideToggle.addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  sideChoice = btn.dataset.side;
  selectedYard = null;
  renderPad();
});

// --- Yard grid ---
function buildYardGrid() {
  yardGrid.innerHTML = '';
  for (let n = 0; n <= 50; n++) {
    const b = document.createElement('button');
    b.textContent = n === 50 ? '50' : String(n);
    if (n === 50) b.classList.add('mid');
    b.dataset.yard = n;
    yardGrid.appendChild(b);
  }
}
buildYardGrid();

yardGrid.addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const yard = Number(btn.dataset.yard);
  submitPlay(yard);
});

// --- Submit ---
function submitPlay(yard) {
  const spot = F.pos(sideChoice, yard);
  events.push({
    id: nextId(),
    type: 'play',
    kind: 'run',
    carrier: us(Number(numBuffer)),
    spot,
  });

  // Reset input state
  mode = 'idle';
  activeKind = null;
  numBuffer = '';
  selectedYard = null;
  playTypeChips.forEach(c => c.classList.remove('active'));
  renderPad();
  render();
  showToast('Play logged');
}

// --- Undo ---
undoBtn.addEventListener('click', () => {
  if (events.length <= 1) return;
  events.pop();
  render();
});

// --- History ---
lastPlayEl.addEventListener('click', () => logDialog.showModal());
historyBtn.addEventListener('click', () => logDialog.showModal());
logClose.addEventListener('click', () => logDialog.close());

// --- Placeholder FABs ---
function showPlaceholder(title) {
  placeholderTitle.textContent = title;
  placeholderDialog.showModal();
}
placeholderClose.addEventListener('click', () => placeholderDialog.close());

$('fab-penalty').addEventListener('click', () => showPlaceholder('Penalty — coming soon'));
$('fab-bigplay').addEventListener('click', () => showPlaceholder('Big Play — coming soon'));
$('fab-score').addEventListener('click', () => showPlaceholder('Score Update — coming soon'));
$('fab-possession').addEventListener('click', () => showPlaceholder('Possession Update — coming soon'));

// --- Boot ---
renderPad();
render();