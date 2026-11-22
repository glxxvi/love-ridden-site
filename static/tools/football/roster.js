function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function extractTag(s, tag) {
  const re = new RegExp(`\\[${tag}\\]`, 'i');
  const found = re.test(s);
  return [s.replace(re, '').replace(/\s+/g, ' ').trim(), found];
}

function extractNickname(s) {
  const m = s.match(/[“"]([^”"]+)[”"]/);
  if (!m) return { name: s.trim(), nickname: null };
  const nickname = m[1].trim();
  const name = s.replace(m[0], '').replace(/\s+/g, ' ').trim();
  return { name, nickname };
}

function makeDisplayName(name, nickname) {
  if (!nickname) return name;
  const parts = name.split(/\s+/);
  if (parts.length === 1) return nickname;
  return [nickname, ...parts.slice(1)].join(' ');
}

function slug(s) {
  return s.toLowerCase()
    .replace(/[“”"'’‘]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeHeight(s) {
  if (!s) return null;
  const t = s.replace(/[‘’`]/g, "'").trim();
  return t || null;
}

function parsePlayerRow(row) {
  if (!row || row.length === 0) return null;
  const numRaw = (row[0] || '').trim();
  if (!numRaw.startsWith('#')) return null;
  const numbers = numRaw.split('/').map(n => n.replace(/^#/, '').trim()).filter(Boolean);
  if (numbers.length === 0) return null;

  const playerRaw = (row[1] || '').trim();
  if (!playerRaw) return null;

  const [noCaptain, captain] = extractTag(playerRaw, 'C');
  const { name, nickname } = extractNickname(noCaptain);
  if (!name) return null;

  const classRaw = (row[3] || '').trim();
  const [classBase, transfer] = extractTag(classRaw, 'T');

  const positions = (row[2] || '')
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);

  return {
    id: slug(name + (nickname ? ' ' + nickname : '')),
    numbers,
    name,
    nickname: nickname || null,
    displayName: makeDisplayName(name, nickname),
    positions,
    class: classBase || '',
    transfer,
    captain,
    height: normalizeHeight(row[4] || ''),
    weight: (row[5] || '').trim() || null,
    notes: (row[6] || '').trim() || '',
  };
}

export function parseRoster(text) {
  text = text.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  const rows = parseCSV(text);

  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i][0] || '').trim().toLowerCase() === 'number') { headerIdx = i; break; }
  }
  if (headerIdx === -1) {
    throw new Error('Could not find header row. Expected a row starting with "Number".');
  }

  const players = [];
  const warnings = [];
  const seenIds = new Set();
  const numberOwners = new Map();

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const numRaw = (row[0] || '').trim();
    if (!numRaw) continue;
    if (!numRaw.startsWith('#')) break;

    const p = parsePlayerRow(row);
    if (!p) { warnings.push(`Row ${i + 1}: could not parse player "${row[1] || ''}"`); continue; }
    if (seenIds.has(p.id)) { warnings.push(`Row ${i + 1}: duplicate name "${p.name}" — skipped.`); continue; }
    seenIds.add(p.id);

    for (const n of p.numbers) {
      if (numberOwners.has(n) && numberOwners.get(n) !== p.id) {
        warnings.push(`Number #${n} shared by ${numberOwners.get(n)} and ${p.id} — worn-number prompt will trigger.`);
      } else {
        numberOwners.set(n, p.id);
      }
    }
    players.push(p);
  }

  if (players.length === 0) throw new Error('No players found in roster.');
  return { players, warnings };
}

export function previewLines(player) {
  const numStr = player.numbers.length > 1
    ? player.numbers.map(n => `#${n}`).join(' / ')
    : `#${player.numbers[0]}`;
  return {
    numStr,
    tag: player.captain ? 'C' : null,
    multi: player.numbers.length > 1,
  };
}