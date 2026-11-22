const DB_NAME = 'safb';
const DB_VERSION = 1;
const SCHEMA_VERSION = 1;

let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { keyPath: 'entry_num' });
      if (!db.objectStoreNames.contains('roster')) db.createObjectStore('roster', { keyPath: 'number' });
      if (!db.objectStoreNames.contains('overrides')) db.createObjectStore('overrides', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const store = {
  async get(s, k) { return tx(s, 'readonly', st => st.get(k)); },
  async put(s, v, k) { return tx(s, 'readwrite', st => k === undefined ? st.put(v) : st.put(v, k)); },
  async del(s, k) { return tx(s, 'readwrite', st => st.delete(k)); },
  async all(s) { return tx(s, 'readonly', st => st.getAll()); },
  async clear(s) { return tx(s, 'readwrite', st => st.clear()); },
  async meta(k, v) { return v === undefined ? this.get('meta', k) : this.put('meta', v, k); },
  async init() {
    await open();
    const existing = await this.meta('schema_version');
    if (existing === undefined) await this.meta('schema_version', SCHEMA_VERSION);
    return { db: DB_NAME, schema: existing ?? SCHEMA_VERSION };
  },
};

export async function selfTest() {
  await store.init();
  await store.put('events', { entry_num: -1, t: Date.now() });
  const back = await store.get('events', -1);
  await store.del('events', -1);
  if (!back || back.entry_num !== -1) throw new Error('round-trip failed');
  return true;
}

export async function requestPersistence() {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}