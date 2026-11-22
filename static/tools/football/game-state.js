// game-state.js — the handoff between index.html (setup) and drive.html (play).
// Uses localStorage for a single small JSON object. Not the event log (that's elsewhere).

const KEY = 'safb:currentGame';

export function saveGame(game) {
  if (!game || !game.gameId) throw new Error('saveGame: gameId required');
  localStorage.setItem(KEY, JSON.stringify(game));
}

export function loadGame() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.warn('game-state: could not parse stored game, ignoring', e);
    return null;
  }
}

export function clearGame() {
  localStorage.removeItem(KEY);
}

export function newGameId() {
  return 'g-' + new Date().toISOString().replace(/[:.]/g, '-');
}

// Reads a CSS custom property from :root. Index.html's theme system sets these.
// Falls back to a neutral color if index.html hasn't set them yet.
export function readThemeColor(name, fallback = '#888888') {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}