import { store, selfTest, requestPersistence } from './storage.js';
import { parseRoster, previewLines } from './roster.js';

const app = document.getElementById('app');

const state = {
  screen: 'setup',
  setup: { home: 'San Augustine Wolves', opponent: '' },
  hasRoster: false,
  rosterCount: 0,
  roster: [],
  importPreview: null,
  importError: null,
  lineupDraft: null,
  starters: { qb: null, k: null },
  kicking: null,
};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function refreshRoster() {
  const roster = await store.all('roster');
  roster.sort((a, b) => {
    const na = a.wornNumber ?? a.numbers[0];
    const nb = b.wornNumber ?? b.numbers[0];
    if (na !== nb) return na - nb;
    return a.displayName.localeCompare(b.displayName);
  });
  state.roster = roster;
  state.hasRoster = roster.length > 0;
  state.rosterCount = roster.length;
}

async function loadSetup() {
  const saved = await store.meta('setup');
  if (saved) state.setup = { ...state.setup, ...saved };
  await refreshRoster();
}

async function saveSetup() {
  await store.meta('setup', state.setup);
}

function renderSetup() {
  const { home, opponent } = state.setup;
  const ready = opponent.trim() && state.hasRoster;
  const activeCount = state.roster.filter(p => p.active !== false).length;

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
          <div class="muted small">
            ${state.hasRoster
              ? `${state.rosterCount} players · ${activeCount} active`
              : 'No roster yet'}
          </div>
        </div>
        <div class="roster-actions">
          ${state.hasRoster ? `<button id="viewRosterBtn" class="btn-secondary">View</button>` : ''}
          <button id="importBtn" class="btn-secondary">${state.hasRoster ? 'Replace' : 'Import'}</button>
        </div>
      </div>

      <button id="startBtn" class="btn-primary" ${ready ? '' : 'disabled'}>Start Game</button>
      <p class="muted small" id="setupHint">${hint}</p>
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
  const viewBtn = document.getElementById('viewRosterBtn');
  if (viewBtn) viewBtn.addEventListener('click', () => {
    state.screen = 'rosterPreview';
    render();
  });
  document.getElementById('startBtn').addEventListener('click', () => {
    state.lineupDraft = null;
    state.screen = 'lineup';
    render();
  });
}

function renderRosterPreview() {
  const active = state.roster.filter(p => p.active !== false).length;
  const items = state.roster.map(p => {
    const suited = p.active !== false;
    const worn = p.wornNumber ?? p.numbers[0];
    const numStr = p.numbers.length > 1
      ? `<span title="originally ${p.numbers.map(n => '#' + n).join('/')}">#${worn}</span>`
      : `#${p.numbers[0]}`;
    const tags = p.captain ? `<span class="badge">C</span>` : '';
    return `<div class="player-row ${suited ? '' : 'inactive-player'}">
      <span class="num">${numStr}</span>
      <span class="pname">${esc(p.displayName)} ${tags}</span>
      <span class="meta">${esc(p.positions.join(', '))}${p.class ? ' · ' + esc(p.class) : ''}${suited ? '' : ' · <em>not dressed</em>'}</span>
    </div>`;
  }).join('');

  app.innerHTML = `
    <div class="screen">
      <h1>Roster</h1>
      <p class="muted">${state.roster.length} players · ${active} active</p>
      <div class="player-list">${items}</div>
      <button id="backBtn" class="btn-secondary">Back</button>
    </div>
  `;

  document.getElementById('backBtn').addEventListener('click', () => {
    state.screen = 'setup';
    render();
  });
}

function buildLineupDraft() {
  return state.roster.map(p => ({
    id: p.id,
    active: p.active !== false,
    wornNumber: p.wornNumber ?? p.numbers[0],
  }));
}

function renderLineup() {
  if (!state.lineupDraft) state.lineupDraft = buildLineupDraft();
  const draft = state.lineupDraft;

  const rows = state.roster.map((p, i) => {
    const d = draft[i];
    const isMulti = p.numbers.length > 1;
    const tags = p.captain ? `<span class="badge">C</span>` : '';

    let numberControl;
    if (isMulti) {
      const opts = p.numbers.map(n =>
        `<option value="${n}" ${n === d.wornNumber ? 'selected' : ''}>#${n}</option>`
      ).join('');
      numberControl = `<select class="worn-select" data-idx="${i}">${opts}</select>`;
    } else {
      numberControl = `<span class="num-fixed">#${p.numbers[0]}</span>`;
    }

    return `<div class="lineup-row ${d.active ? '' : 'inactive'}">
      <input type="checkbox" class="lineup-check" data-idx="${i}" ${d.active ? 'checked' : ''}>
      <div class="lineup-details">
        <div class="lineup-name">${esc(p.displayName)} ${tags}</div>
        <div class="lineup-meta">${esc(p.positions.join(', '))}${p.class ? ' · ' + esc(p.class) : ''}</div>
      </div>
      <div class="lineup-number">${numberControl}</div>
    </div>`;
  }).join('');

  const activeCount = draft.filter(d => d.active).length;

  app.innerHTML = `
    <div class="screen">
      <h1>Lineup</h1>
      <p class="muted" id="lineupCount">${activeCount} of ${state.roster.length} active. Uncheck anyone not dressed.</p>
      <div class="player-list">${rows}</div>
      <div class="row-buttons">
        <button id="cancelBtn" class="btn-secondary">Cancel</button>
        <button id="continueBtn" class="btn-primary">Continue</button>
      </div>
    </div>
  `;

  document.querySelectorAll('.lineup-check').forEach(cb => {
    cb.addEventListener('change', e => {
      const idx = parseInt(e.target.dataset.idx, 10);
      draft[idx].active = e.target.checked;
      e.target.closest('.lineup-row').classList.toggle('inactive', !e.target.checked);
      const n = draft.filter(x => x.active).length;
      document.getElementById('lineupCount').textContent =
        `${n} of ${state.roster.length} active. Uncheck anyone not dressed.`;
    });
  });

  document.querySelectorAll('.worn-select').forEach(sel => {
    sel.addEventListener('change', e => {
      const idx = parseInt(e.target.dataset.idx, 10);
      draft[idx].wornNumber = parseInt(e.target.value, 10);
    });
  });

  document.getElementById('cancelBtn').addEventListener('click', () => {
    state.lineupDraft = null;
    state.screen = 'setup';
    render();
  });

  document.getElementById('continueBtn').addEventListener('click', async () => {
    const updated = state.roster.map((p, i) => ({
      ...p,
      active: draft[i].active,
      wornNumber: draft[i].wornNumber,
    }));
    await store.putMany('roster', updated);
    await refreshRoster();
    state.lineupDraft = null;
    state.starters = { qb: null, k: null };
    state.screen = 'starters';
    render();
  });
}

function buildGroupedPlayerOptions(players, tiers, selectedId) {
  const assigned = new Set();
  const sorted = [...players].sort((a, b) => {
    const na = a.wornNumber ?? a.numbers[0];
    const nb = b.wornNumber ?? b.numbers[0];
    if (na !== nb) return na - nb;
    return a.displayName.localeCompare(b.displayName);
  });

  let html = '';
  for (const tier of tiers) {
    const matches = tier.match
      ? sorted.filter(p => !assigned.has(p.id) && p.positions.some(pos => tier.match.test(pos.trim())))
      : sorted.filter(p => !assigned.has(p.id));
    matches.forEach(p => assigned.add(p.id));
    if (matches.length === 0) continue;
    html += `<optgroup label="${tier.label}">`;
    html += matches.map(p => {
      const worn = p.wornNumber ?? p.numbers[0];
      const sel = p.id === selectedId ? ' selected' : '';
      return `<option value="${p.id}"${sel}>#${worn} ${esc(p.displayName)}</option>`;
    }).join('');
    html += `</optgroup>`;
  }
  return html;
}

function renderStarters() {
  const active = state.roster.filter(p => p.active !== false);

  const qbTiers = [
    { label: 'QB / ATH', match: /^(QB|ATH)$/i },
    { label: 'Skill Positions', match: /^(RB|HB|FB|WR|TE)$/i },
    { label: 'Others', match: null },
  ];
  const kTiers = [
    { label: 'Kickers', match: /^(K|PK)$/i },
    { label: 'Punters', match: /^P$/i },
    { label: 'Others', match: null },
  ];

  const ready = state.starters.qb && state.starters.k;

  app.innerHTML = `
    <div class="screen">
      <h1>Starters</h1>
      <p class="muted">Pick who's taking the first snap and kicking. Anyone active is selectable.</p>

      <label class="field">
        <span>Starting QB</span>
        <select id="qbSelect">
          <option value="">— Select —</option>
          ${buildGroupedPlayerOptions(active, qbTiers, state.starters.qb)}
        </select>
      </label>

      <label class="field">
        <span>Starting K</span>
        <select id="kSelect">
          <option value="">— Select —</option>
          ${buildGroupedPlayerOptions(active, kTiers, state.starters.k)}
        </select>
      </label>

      <div class="row-buttons">
        <button id="backBtn" class="btn-secondary">Back</button>
        <button id="continueBtn" class="btn-primary" ${ready ? '' : 'disabled'}>Continue</button>
      </div>
    </div>
  `;

  document.getElementById('qbSelect').addEventListener('change', e => {
    state.starters.qb = e.target.value || null;
    document.getElementById('continueBtn').disabled = !(state.starters.qb && state.starters.k);
  });
  document.getElementById('kSelect').addEventListener('change', e => {
    state.starters.k = e.target.value || null;
    document.getElementById('continueBtn').disabled = !(state.starters.qb && state.starters.k);
  });

  document.getElementById('backBtn').addEventListener('click', () => {
    state.screen = 'lineup';
    render();
  });
  document.getElementById('continueBtn').addEventListener('click', () => {
    state.kicking = { quarter: 1, kickingTeam: null };
    state.screen = 'kicking';
    render();
  });
}

function qLabel(q) {
  return q === 1 ? '1st' : q === 2 ? '2nd' : q === 3 ? '3rd' : q === 4 ? '4th' : 'OT';
}

function renderKicking() {
  if (!state.kicking) state.kicking = { quarter: 1, kickingTeam: null };
  const k = state.kicking;
  const home = state.setup.home || 'Home';
  const opp = state.setup.opponent || 'Opponent';

  app.innerHTML = `
    <div class="screen">
      <h1>Start Game</h1>
      <label class="field">
        <span>Starting Quarter</span>
        <select id="quarterSelect">
          ${[1,2,3,4,5].map(q =>
            `<option value="${q}" ${k.quarter === q ? 'selected' : ''}>${qLabel(q)}</option>`
          ).join('')}
        </select>
      </label>
      <p class="muted small">Who is kicking off?</p>
      <div class="kickoff-buttons">
        <button id="kickSA" class="btn-secondary ${k.kickingTeam === 'SA' ? 'selected' : ''}">${esc(home)}</button>
        <button id="kickOPP" class="btn-secondary ${k.kickingTeam === 'OPP' ? 'selected' : ''}">${esc(opp)}</button>
      </div>
      <div class="row-buttons">
        <button id="backBtn" class="btn-secondary">Back</button>
        <button id="startBtn" class="btn-primary" ${k.kickingTeam ? '' : 'disabled'}>Start Game</button>
      </div>
    </div>
  `;

  document.getElementById('quarterSelect').addEventListener('change', e => {
    k.quarter = parseInt(e.target.value, 10);
  });

  document.getElementById('kickSA').addEventListener('click', () => {
    k.kickingTeam = 'SA';
    render();
  });
  document.getElementById('kickOPP').addEventListener('click', () => {
    k.kickingTeam = 'OPP';
    render();
  });

  document.getElementById('backBtn').addEventListener('click', () => {
    state.screen = 'starters';
    render();
  });

  document.getElementById('startBtn').addEventListener('click', () => {
    if (!k.kickingTeam) return;
    state.screen = 'drive';
    render();
  });
}

function getPlayer(id) {
  return state.roster.find(p => p.id === id) || null;
}

function playerLine(id) {
  const p = getPlayer(id);
  if (!p) return '—';
  const worn = p.wornNumber ?? p.numbers[0];
  return `#${worn} ${p.displayName}`;
}

function renderDriveStub() {
  const k = state.kicking;
  const home = state.setup.home || 'Home';
  const opp = state.setup.opponent || 'Opponent';
  const kickingLabel = k.kickingTeam === 'SA' ? home : opp;
  const activeCount = state.roster.filter(p => p.active !== false).length;

  app.innerHTML = `
    <div class="screen">
      <h1>Drive</h1>
      <p class="muted">Game started. Play entry coming next.</p>
      <div class="roster-row">
        <div>
          <strong>${qLabel(k.quarter)} Quarter</strong>
          <div class="muted small">${esc(kickingLabel)} kicking off · ${activeCount} active players</div>
        </div>
      </div>
      <div class="roster-row">
        <div>
          <strong>Starters</strong>
          <div class="muted small">QB: ${esc(playerLine(state.starters.qb))} · K: ${esc(playerLine(state.starters.k))}</div>
        </div>
      </div>
      <button id="resetBtn" class="btn-secondary">Back to Setup (for testing)</button>
    </div>
  `;

  document.getElementById('resetBtn').addEventListener('click', () => {
    state.kicking = null;
    state.starters = { qb: null, k: null };
    state.screen = 'setup';
    render();
  });
}

function render() {
  switch (state.screen) {
    case 'setup': renderSetup(); break;
    case 'roster': renderRosterImport(); break;
    case 'rosterPreview': renderRosterPreview(); break;
    case 'lineup': renderLineup(); break;
    case 'starters': renderStarters(); break;
    case 'kicking': renderKicking(); break;
    case 'drive': renderDriveStub(); break;
  }
}

function renderRosterImport() {
  const pv = state.importPreview;
  const err = state.importError;

  let body = '';
  if (pv) {
    const items = pv.players.map(p => {
      const info = previewLines(p);
      const tags = [];
      if (info.tag) tags.push(`<span class="badge">C</span>`);
      if (p.transfer) tags.push(`<span class="badge muted-badge">T</span>`);
      if (info.multi) tags.push(`<span class="badge warn-badge">multi</span>`);
      return `<div class="player-row">
        <span class="num">${info.numStr}</span>
        <span class="pname">${esc(p.displayName)} ${tags.join('')}</span>
        <span class="meta">${esc(p.positions.join(', '))}${p.class ? ' · ' + esc(p.class) : ''}</span>
      </div>`;
    }).join('');
    const warnHtml = pv.warnings.length
      ? `<details class="warn-box"><summary>${pv.warnings.length} warning${pv.warnings.length === 1 ? '' : 's'}</summary><ul>${pv.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></details>`
      : '';
    body = `
      <p class="ok">Parsed ${pv.players.length} player${pv.players.length === 1 ? '' : 's'}.</p>
      ${warnHtml}
      <div class="player-list">${items}</div>
      <div class="row-buttons">
        <button id="cancelBtn" class="btn-secondary">Cancel</button>
        <button id="confirmBtn" class="btn-primary">Confirm Import</button>
      </div>
    `;
  } else {
    body = `
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

  app.innerHTML = `<div class="screen"><h1>Import Roster</h1>${body}</div>`;

  if (pv) {
    document.getElementById('cancelBtn').addEventListener('click', () => {
      state.importPreview = null;
      render();
    });
    document.getElementById('confirmBtn').addEventListener('click', async () => {
      const players = state.importPreview.players.map(p => ({
        ...p,
        active: true,
        wornNumber: p.numbers[0],
      }));
      await store.clear('roster');
      await store.putMany('roster', players);
      await refreshRoster();
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
    pasteArea.value = await file.text();
    e.target.value = '';
  });
  document.getElementById('previewBtn').addEventListener('click', () => {
    const text = pasteArea.value.trim();
    if (!text) { state.importError = 'Nothing to import.'; render(); return; }
    try {
      state.importPreview = parseRoster(text);
      state.importError = null;
      render();
    } catch (e) {
      state.importError = e.message;
      render();
    }
  });
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