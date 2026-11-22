import { store, selfTest, requestPersistence } from './storage.js';
import { parseRoster, previewLines } from './roster.js';

const app = document.getElementById('app');

const state = {
  screen: 'setup',
  setup: { home: 'San Augustine Wolves', opponent: '' },
  hasRoster: false,
  rosterCount: 0,
  importPreview: null,
  importError: null,
};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function refreshRosterState() {
  const roster = await store.all('roster');
  state.hasRoster = roster.length > 0;
  state.rosterCount = roster.length;
}

async function loadSetup() {
  const saved = await store.meta('setup');
  if (saved) state.setup = { ...state.setup, ...saved };
  await refreshRosterState();
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
    state.setup.home = e.target.value; saveSetup();
  });
  document.getElementById('opponent').addEventListener('input', e => {
    state.setup.opponent = e.target.value; saveSetup();
    const btn = document.getElementById('startBtn');
    if (btn) btn.disabled = !(e.target.value.trim() && state.hasRoster);
    const hintEl = document.getElementById('setupHint');
    if (hintEl) hintEl.textContent = e.target.value.trim() ? '' : 'Enter an opponent to continue.';
  });
  document.getElementById('importBtn').addEventListener('click', () => {
    state.screen = 'roster';
    state.importPreview = null;
    state.importError = null;
    render();
  });
  document.getElementById('startBtn').addEventListener('click', () => {
    alert('Next: kicking team selection.');
  });
}

function renderRoster() {
  const pv = state.importPreview;
  const err = state.importError;

  let previewHtml = '';
  if (pv) {
    const items = pv.players.map(p => {
      const info = previewLines(p);
      const tags = [];
      if (info.tag) tags.push(`<span class="badge">C</span>`);
      if (p.transfer) tags.push(`<span class="badge muted-badge">T</span>`);
      if (info.multi) tags.push(`<span class="badge warn-badge">multi</span>`);
      const posStr = p.positions.join(', ');
      return `<div class="player-row">
        <span class="num">${info.numStr}</span>
        <span class="pname">${esc(p.displayName)} ${tags.join('')}</span>
        <span class="meta">${esc(posStr)}${p.class ? ' · ' + esc(p.class) : ''}</span>
      </div>`;
    }).join('');
    const warnHtml = pv.warnings.length
      ? `<details class="warn-box"><summary>${pv.warnings.length} warning${pv.warnings.length === 1 ? '' : 's'}</summary><ul>${pv.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></details>`
      : '';
    previewHtml = `
      <p class="ok">Parsed ${pv.players.length} player${pv.players.length === 1 ? '' : 's'}.</p>
      ${warnHtml}
      <div class="player-list">${items}</div>
      <div class="row-buttons">
        <button id="cancelBtn" class="btn-secondary">Cancel</button>
        <button id="confirmBtn" class="btn-primary">Confirm Import</button>
      </div>
    `;
  } else {
    previewHtml = `
      <p class="muted">Paste the roster CSV below, or choose a file.</p>
      ${err ? `<p class="bad">${esc(err)}</p>` : ''}
      <input id="fileInput" type="file" accept=".csv,text/csv" class="file-input">
      <textarea id="pasteArea" class="textarea" placeholder="Number,Player,Position,Class,Height,Weight,Notes&#10;#1,Player Name,QB,Senior,6'0,180,"></textarea>
      <div class="row-buttons">
        <button id="backBtn" class="btn-secondary">Cancel</button>
        <button id="previewBtn" class="btn-primary">Preview</button>
      </div>
    `;
  }

  app.innerHTML = `
    <div class="screen">
      <h1>Import Roster</h1>
      ${previewHtml}
    </div>
  `;

  if (pv) {
    document.getElementById('cancelBtn').addEventListener('click', () => {
      state.importPreview = null;
      render();
    });
    document.getElementById('confirmBtn').addEventListener('click', async () => {
      await store.clear('roster');
      await store.putMany('roster', state.importPreview.players);
      await refreshRosterState();
      state.importPreview = null;
      state.screen = 'setup';
      render();
    });
    return;
  }

  document.getElementById('backBtn').addEventListener('click', () => {
    state.importError = null;
    state.screen = 'setup';
    render();
  });

  const fileInput = document.getElementById('fileInput');
  const pasteArea = document.getElementById('pasteArea');

  fileInput.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    pasteArea.value = text;
    e.target.value = '';
  });

  document.getElementById('previewBtn').addEventListener('click', () => {
    const text = pasteArea.value.trim();
    if (!text) { state.importError = 'Nothing to import.'; render(); return; }
    try {
      const result = parseRoster(text);
      state.importPreview = result;
      state.importError = null;
      render();
    } catch (e) {
      state.importError = e.message;
      render();
    }
  });
}

function render() {
  if (state.screen === 'setup') renderSetup();
  else if (state.screen === 'roster') renderRoster();
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