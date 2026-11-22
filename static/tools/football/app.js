import { store, selfTest, requestPersistence } from './storage.js';
import { parseRoster, previewLines } from './roster.js';
import { saveGame, newGameId } from './game-state.js';

const app = document.getElementById('app');

window.__handleLogoError = function(img) {
  const span = document.createElement('span');
  span.className = 'faceoff-initials';
  span.style.background = img.dataset.bg || 'var(--bg-3)';
  span.style.color = img.dataset.fg || 'var(--fg-muted)';
  span.textContent = img.dataset.abbr || '?';
  img.replaceWith(span);
};

const THEMES = [
  {
    id: 'san-augustine',
    name: 'San Augustine Wolves',
    city: 'San Augustine',
    stadium: 'Wolf Stadium',
    shortName: 'SA',
    primary: 'rgb(243, 8, 8)',
    primaryRgb: '243, 8, 8',
    primaryFg: '#ffffff',
    secondary: '#000000',
    logo: 'https://i.ibb.co/21LsbcKk/San-Augustine.png',
    wordmark: 'https://i.ibb.co/NRDRvyF/San-Augustine-Word-Mark.png',
    dark: { bg: '#0a0a0b', bg2: '#171718', bg3: '#232325', border: '#2f2f32' },
    light: { bg: '#f7f6f5', bg2: '#ffffff', bg3: '#f1efee', border: '#e2dedb' },
    matches: ['san augustine', 'san augustine wolves', 'sa', 'sa wolves', 'wolves', 'sa wolfpack', 'san augustine wolf pack'],
  },
  {
    id: 'joaquin',
    name: 'Joaquin Rams',
    city: 'Joaquin',
    stadium: 'Ram Stadium',
    shortName: 'RAMS',
    primary: 'rgb(0, 79, 158)',
    primaryRgb: '0, 79, 158',
    primaryFg: '#ffffff',
    secondary: '#000000',
    logo: 'https://i.ibb.co/hR1RSMnY/Joaquin.png',
    wordmark: 'https://i.ibb.co/v4B0g82C/IMG-1350.png',
    dark: { bg: '#08090d', bg2: '#10141b', bg3: '#191f29', border: '#232b38' },
    light: { bg: '#f5f7fa', bg2: '#ffffff', bg3: '#eef1f6', border: '#d4dae3' },
    matches: ['joaquin', 'joe quinn', 'joaquin rams', 'rams'],
  },
];

const DEFAULT_THEME = {
  id: 'default',
  name: 'Home Team',
  city: null,
  stadium: null,
  shortName: 'HOME',
  primary: '#3ddc97',
  primaryRgb: '61, 220, 151',
  primaryFg: '#052418',
  secondary: '#000000',
  logo: null,
  wordmark: null,
  dark: { bg: '#0a0a0b', bg2: '#151516', bg3: '#1f1f21', border: '#2a2a2d' },
  light: { bg: '#f5f6f8', bg2: '#ffffff', bg3: '#eef0f4', border: '#d8dce4' },
  matches: [],
};

const state = {
  screen: 'setup',
  setup: { home: 'San Augustine Wolves', opponent: '' },
  teamTheme: DEFAULT_THEME,
  opponentTheme: DEFAULT_THEME,
  themeMode: 'dark',
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

function detectTheme(name) {
  if (!name) return DEFAULT_THEME;
  const norm = name.trim().toLowerCase().replace(/\s+/g, ' ');
  for (const t of THEMES) {
    if (t.matches.includes(norm)) return t;
  }
  return DEFAULT_THEME;
}

function filterThemes(query) {
  const q = (query || '').trim().toLowerCase();
  if (q.length === 0) return [];
  return THEMES.filter(t => {
    if (t.name.toLowerCase().includes(q)) return true;
    if (t.city && t.city.toLowerCase().includes(q)) return true;
    return t.matches.some(m => m.includes(q));
  });
}

function initialsFor(name) {
  if (!name) return '?';
  const words = name.trim().split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function faceoffAbbr(theme, name) {
  if (theme && theme.id !== 'default' && theme.shortName) return theme.shortName;
  return initialsFor(name);
}


function updateFavicon(theme) {
  if (!theme || !theme.logo) return;
  document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach(link => {
    link.href = theme.logo;
    if (link.rel === 'icon') link.type = 'image/png';
  });
}

function applyThemeVars(theme, mode) {
  const root = document.documentElement;
  const palette = mode === 'light' ? theme.light : theme.dark;
  root.style.setProperty('--team-primary', theme.primary);
  root.style.setProperty('--team-primary-rgb', theme.primaryRgb);
  root.style.setProperty('--team-primary-fg', theme.primaryFg);
  root.style.setProperty('--team-secondary', theme.secondary);
  root.style.setProperty('--bg', palette.bg);
  root.style.setProperty('--bg-2', palette.bg2);
  root.style.setProperty('--bg-3', palette.bg3);
  root.style.setProperty('--border', palette.border);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', palette.bg);
}

function headerTitle(theme) {
  return theme.city ? `Live Scoring - ${theme.city}` : 'Live Scoring';
}

async function setThemeMode(mode) {
  state.themeMode = mode;
  document.documentElement.dataset.theme = mode;
  applyThemeVars(state.teamTheme, mode);
  await store.meta('themeMode', mode);
}

async function toggleThemeMode() {
  await setThemeMode(state.themeMode === 'dark' ? 'light' : 'dark');
  render();
}

function renderHeader() {
  const theme = state.teamTheme;
  const logoHtml = theme.logo
    ? `<img src="${theme.logo}" class="app-logo" alt="" onerror="this.remove()">`
    : '';
  const icon = state.themeMode === 'dark' ? '☀' : '☾';
  const label = state.themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  return `
    <header class="app-header">
      ${logoHtml}
      <span class="app-team">${esc(headerTitle(theme))}</span>
      <button class="theme-toggle" data-action="toggle-theme" aria-label="${label}" title="${label}">${icon}</button>
    </header>
  `;
}

function faceoffLogoHtml(theme, abbr, isKnown) {
  const bg = isKnown ? theme.primary : 'var(--bg-3)';
  const fg = isKnown ? theme.primaryFg : 'var(--fg-muted)';

  if (isKnown && theme.logo) {
    return `<img src="${theme.logo}" alt=""
      data-abbr="${esc(abbr)}" data-bg="${bg}" data-fg="${fg}"
      onerror="window.__handleLogoError(this)">`;
  }
  return `<span class="faceoff-initials" style="background:${bg};color:${fg}">${esc(abbr)}</span>`;
}

function faceoffInner() {
  const userTheme = state.teamTheme;
  const oppTheme = state.opponentTheme;
  const userIsKnown = userTheme && userTheme.id !== 'default';
  const oppIsKnown = oppTheme && oppTheme.id !== 'default';

  const userName = (state.setup.home || '').trim() || 'User Team';
  const oppName = (state.setup.opponent || '').trim() || 'Opponent';

  const userAbbr = faceoffAbbr(userTheme, userName);
  const oppAbbr = faceoffAbbr(oppTheme, oppName);

  const userLogoHtml = faceoffLogoHtml(userTheme, userAbbr, userIsKnown);
  const oppLogoHtml = faceoffLogoHtml(oppTheme, oppAbbr, oppIsKnown);

  const userNameClass = state.setup.home.trim() ? 'faceoff-name' : 'faceoff-name muted-name';
  const oppNameClass = state.setup.opponent.trim() ? 'faceoff-name' : 'faceoff-name muted-name';

  return `
    <div class="faceoff-team">
      <div class="faceoff-logo">${userLogoHtml}</div>
      <div class="${userNameClass}">${esc(userName)}</div>
    </div>
    <div class="faceoff-vs">VS</div>
    <div class="faceoff-team">
      <div class="faceoff-logo">${oppLogoHtml}</div>
      <div class="${oppNameClass}">${esc(oppName)}</div>
    </div>
  `;
}

function updateFaceoff() {
  const el = document.getElementById('faceoff');
  if (el) el.innerHTML = faceoffInner();
}

function updateHeaderInPlace(newTheme) {
  const logoEl = app.querySelector('.app-logo');
  if (newTheme.logo) {
    if (logoEl) {
      logoEl.src = newTheme.logo;
      logoEl.style.display = '';
    } else {
      const teamEl = app.querySelector('.app-team');
      if (teamEl) teamEl.insertAdjacentHTML('beforebegin', `<img src="${newTheme.logo}" class="app-logo" alt="" onerror="this.remove()">`);
    }
  } else if (logoEl) {
    logoEl.remove();
  }
  const teamEl = app.querySelector('.app-team');
  if (teamEl) teamEl.textContent = headerTitle(newTheme);
}

function attachTeamPicker(inputId) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(inputId + '-dropdown');
  if (!input || !dropdown) return;

  const closeDropdown = () => {
    dropdown.classList.remove('visible');
    dropdown.innerHTML = '';
  };

  const showDropdown = () => {
    const matches = filterThemes(input.value);
    if (matches.length === 0) { closeDropdown(); return; }
    dropdown.innerHTML = matches.map(t => {
      const logoHtml = t.logo
        ? `<img src="${t.logo}" class="team-item-logo" alt="" onerror="this.style.display='none'">`
        : `<span class="team-item-logo-fallback" style="background:${t.primary};color:${t.primaryFg}">${esc(t.shortName.slice(0,3))}</span>`;
      const secondary = [t.city ? `${t.city}, TX` : null, t.stadium].filter(Boolean).join(' · ');
      return `<div class="team-item" data-theme-id="${t.id}">
        ${logoHtml}
        <div class="team-item-info">
          <div class="team-item-name">${esc(t.name)}</div>
          <div class="team-item-alias">${esc(secondary)}</div>
        </div>
      </div>`;
    }).join('');
    dropdown.classList.add('visible');

    dropdown.querySelectorAll('.team-item').forEach(item => {
      item.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const theme = THEMES.find(t => t.id === item.dataset.themeId);
        if (!theme) return;
        input.value = theme.name;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        closeDropdown();
        input.blur();
      });
    });
  };

  input.addEventListener('input', showDropdown);
  input.addEventListener('focus', showDropdown);
  input.addEventListener('blur', () => setTimeout(closeDropdown, 140));
}

function handleHomeInput(e) {
  state.setup.home = e.target.value;
  saveSetup();
  const newTheme = detectTheme(e.target.value);
  if (newTheme.id !== state.teamTheme.id) {
    state.teamTheme = newTheme;
    applyThemeVars(newTheme, state.themeMode);
    updateHeaderInPlace(newTheme);
  }
  updateFaceoff();
}

function handleOpponentInput(e) {
  state.setup.opponent = e.target.value;
  saveSetup();
  const newOpp = detectTheme(e.target.value);
  if (newOpp.id !== state.opponentTheme.id) {
    state.opponentTheme = newOpp;
  }
  updateFaceoff();
  const btn = document.getElementById('startBtn');
  if (btn) btn.disabled = !(e.target.value.trim() && state.hasRoster);
  const hintEl = document.getElementById('setupHint');
  if (hintEl) hintEl.textContent = e.target.value.trim() ? '' : 'Enter an opponent to continue.';
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
  state.teamTheme = detectTheme(state.setup.home);
  state.opponentTheme = detectTheme(state.setup.opponent);
  const savedTheme = await store.meta('themeMode');
  state.themeMode = savedTheme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = state.themeMode;
  applyThemeVars(state.teamTheme, state.themeMode);
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
    ${renderHeader()}
    <main class="app-main">
      <div class="screen">
        <h1>Game Setup</h1>

        <div class="faceoff" id="faceoff">${faceoffInner()}</div>

        <div class="field">
          <span>User Team</span>
          <div class="team-picker">
            <input id="home" type="text" value="${esc(home)}" autocomplete="off" spellcheck="false">
            <div class="team-dropdown" id="home-dropdown"></div>
          </div>
        </div>

        <div class="field">
          <span>Opponent</span>
          <div class="team-picker">
            <input id="opponent" type="text" value="${esc(opponent)}" placeholder="e.g. Tom Bean" autocomplete="off" spellcheck="false">
            <div class="team-dropdown" id="opponent-dropdown"></div>
          </div>
        </div>

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
        <p class="muted small" id="setupHint" style="text-align:center">${hint}</p>
      </div>
    </main>
  `;

  document.getElementById('home').addEventListener('input', handleHomeInput);
  document.getElementById('opponent').addEventListener('input', handleOpponentInput);
  attachTeamPicker('home');
  attachTeamPicker('opponent');

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
    ${renderHeader()}
    <main class="app-main">
      <div class="screen">
        <h1>Roster</h1>
        <p class="muted" style="text-align:center">${state.roster.length} players · ${active} active</p>
        <div class="player-list">${items}</div>
        <button id="backBtn" class="btn-secondary">Back</button>
      </div>
    </main>
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
    ${renderHeader()}
    <main class="app-main">
      <div class="screen">
        <h1>Lineup</h1>
        <p class="muted" id="lineupCount" style="text-align:center">${activeCount} of ${state.roster.length} active. Uncheck anyone not dressed.</p>
        <div class="player-list">${rows}</div>
        <div class="row-buttons">
          <button id="cancelBtn" class="btn-secondary">Cancel</button>
          <button id="continueBtn" class="btn-primary">Continue</button>
        </div>
      </div>
    </main>
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
    { label: 'Quarterbacks', match: /^(QB|ATH)$/i },
    { label: 'Skill Positions', match: /^(RB|HB|FB|WR|TE)$/i },
    { label: 'Everyone Else', match: null },
  ];
  const kTiers = [
    { label: 'Kickers', match: /^(K|PK)$/i },
    { label: 'Punters', match: /^P$/i },
    { label: 'Everyone Else', match: null },
  ];

  const ready = state.starters.qb && state.starters.k;

  app.innerHTML = `
    ${renderHeader()}
    <main class="app-main">
      <div class="screen">
        <h1>Starters</h1>
        <p class="muted" style="text-align:center">Pick who's taking the first snap and kicking.</p>

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
    </main>
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
    ${renderHeader()}
    <main class="app-main">
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
        <p class="muted small" style="text-align:center">Who is kicking off?</p>
        <div class="kickoff-buttons">
          <button id="kickSA" class="btn-secondary ${k.kickingTeam === 'SA' ? 'selected' : ''}">${esc(home)}</button>
          <button id="kickOPP" class="btn-secondary ${k.kickingTeam === 'OPP' ? 'selected' : ''}">${esc(opp)}</button>
        </div>
        <div class="row-buttons">
          <button id="backBtn" class="btn-secondary">Back</button>
          <button id="startBtn" class="btn-primary" ${k.kickingTeam ? '' : 'disabled'}>Start Game</button>
        </div>
      </div>
    </main>
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

    const usTheme = state.teamTheme;
    const oppTheme = state.opponentTheme;
    const usName = state.setup.home || 'Home';
    const oppName = state.setup.opponent || 'Opponent';

    // Snapshot the active roster with current worn numbers.
    // Filters out anyone not dressed; keeps the schema the engine expects.
    const roster = state.roster
      .filter(p => p.active !== false)
      .map(p => ({
        id: p.id,
        displayName: p.displayName,
        numbers: p.numbers,
        wornNumber: Number(p.wornNumber ?? p.numbers[0]),
        active: true,
      }));

    const game = {
      gameId: newGameId(),
      startedAt: new Date().toISOString(),
      teams: {
        US: {
          name: usName,
          short: usTheme.city || usName,
          abbr: usTheme.shortName || initialsFor(usName),
          primary: usTheme.primary,
          secondary: usTheme.primaryFg,
          logo: usTheme.logo || null,
        },
        OPP: {
          name: oppName,
          short: oppTheme.city || oppName,
          abbr: oppTheme.shortName || initialsFor(oppName),
          primary: oppTheme.primary,
          secondary: oppTheme.primaryFg,
          logo: oppTheme.logo || null,
        },
      },
      roster,
      oppRoster: null,                                  // number-only until an opponent roster is imported
      openingKick: k.kickingTeam === 'SA' ? 'US' : 'OPP', // who is kicking off
      startQuarter: k.quarter,
      starters: state.starters,                          // { qb, k } — engine doesn't need them, UI might
      themeMode: state.themeMode,
    };

        saveGame(game);
    window.location.href = './drive.html';
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
    ${renderHeader()}
    <main class="app-main">
      <div class="screen">
        <h1>Drive</h1>
        <p class="muted" style="text-align:center">Game started. Play entry coming next.</p>
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
    </main>
  `;

  document.getElementById('resetBtn').addEventListener('click', () => {
    state.kicking = null;
    state.starters = { qb: null, k: null };
    state.screen = 'setup';
    render();
  });
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
      <p class="ok" style="text-align:center">Parsed ${pv.players.length} player${pv.players.length === 1 ? '' : 's'}.</p>
      ${warnHtml}
      <div class="player-list">${items}</div>
      <div class="row-buttons">
        <button id="cancelBtn" class="btn-secondary">Cancel</button>
        <button id="confirmBtn" class="btn-primary">Confirm Import</button>
      </div>
    `;
  } else {
    body = `
      <p class="muted" style="text-align:center">Paste the roster CSV below, or choose a file.</p>
      ${err ? `<p class="bad" style="text-align:center">${esc(err)}</p>` : ''}
      <input id="fileInput" type="file" accept=".csv,text/csv" class="file-input">
      <textarea id="pasteArea" class="textarea" placeholder="Number,Player,Position,Class,Height,Weight,Notes&#10;#1,Player Name,QB,Senior,6'0,180,"></textarea>
      <div class="row-buttons">
        <button id="backBtn" class="btn-secondary">Cancel</button>
        <button id="previewBtn" class="btn-primary">Preview</button>
      </div>
    `;
  }

  app.innerHTML = `
    ${renderHeader()}
    <main class="app-main">
      <div class="screen">
        <h1>Import Roster</h1>
        ${body}
      </div>
    </main>
  `;

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

app.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="toggle-theme"]')) {
    toggleThemeMode();
  }
});

async function boot() {
  try {
    await selfTest();
    await requestPersistence();
    await store.init();
    await loadSetup();
    render();
  } catch (e) {
    app.innerHTML = `<p class="bad" style="padding:1rem">Boot failed: ${e.message}</p>`;
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
}

boot();