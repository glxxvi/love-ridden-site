import { store, selfTest, requestPersistence } from './storage.js';

const app = document.getElementById('app');

const state = {
  screen: 'setup',
  setup: {
    home: 'San Augustine Wolves',
    opponent: '',
  },
  hasRoster: false,
  rosterCount: 0,
};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function loadSetup() {
  const saved = await store.meta('setup');
  if (saved) state.setup = { ...state.setup, ...saved };
  const roster = await store.all('roster');
  state.hasRoster = roster.length > 0;
  state.rosterCount = roster.length;
}

async function saveSetup() {
  await store.meta('setup', state.setup);
}

function renderSetup() {
  const { home, opponent } = state.setup;
  const ready = opponent.trim() && state.hasRoster;

  let hint = '';
  if (!opponent.trim()) hint = 'Enter an opponent to continue.';
  else if (!state.hasRoster) hint = 'Import a roster to continue.';

  app.innerHTML = `
    <div class="screen">
      <h1>SA Wolves Scorer</h1>
      <p class="muted">Set up the game.</p>

      <label class="field">
        <span>Home Team</span>
        <input id="home" type="text" value="${esc(home)}" autocomplete="off">
      </label>

      <label class="field">
        <span>Opponent</span>
        <input id="opponent" type="text" value="${esc(opponent)}" placeholder="e.g. Tom Bean" autocomplete="off">
      </label>

      <div class="roster-row">
        <div>
          <strong>Roster</strong>
          <div class="muted small">${state.hasRoster ? `${state.rosterCount} players imported` : 'No roster yet'}</div>
        </div>
        <button id="importBtn" class="btn-secondary">${state.hasRoster ? 'Replace' : 'Import'}</button>
      </div>

      <button id="startBtn" class="btn-primary" ${ready ? '' : 'disabled'}>Start Game</button>
      ${hint ? `<p class="muted small">${hint}</p>` : ''}
    </div>
  `;

  document.getElementById('home').addEventListener('input', e => {
    state.setup.home = e.target.value;
    saveSetup();
  });

  document.getElementById('opponent').addEventListener('input', e => {
    state.setup.opponent = e.target.value;
    saveSetup();
    const btn = document.getElementById('startBtn');
    if (btn) btn.disabled = !(e.target.value.trim() && state.hasRoster);
    const hintEl = document.querySelector('.screen > .muted.small:last-child');
    if (hintEl) hintEl.textContent = e.target.value.trim() ? '' : 'Enter an opponent to continue.';
  });

  document.getElementById('importBtn').addEventListener('click', () => {
    state.screen = 'roster';
    render();
  });

  document.getElementById('startBtn').addEventListener('click', () => {
    // Next step will be the kicking-team screen.
    alert('Next: kicking team selection.');
  });
}

function renderRosterStub() {
  app.innerHTML = `
    <div class="screen">
      <button id="backBtn" class="btn-link">← Back</button>
      <h1>Import Roster</h1>
      <p class="muted">Roster import is the next step. Coming shortly.</p>
    </div>
  `;
  document.getElementById('backBtn').addEventListener('click', () => {
    state.screen = 'setup';
    render();
  });
}

function render() {
  if (state.screen === 'setup') renderSetup();
  else if (state.screen === 'roster') renderRosterStub();
}

async function boot() {
  try {
    await selfTest();
    await requestPersistence();
    await store.init();
    await loadSetup();
    render();
  } catch (e) {
    app.innerHTML = `<p class="bad">Boot failed: ${e.message}</p>`;
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
}

boot();