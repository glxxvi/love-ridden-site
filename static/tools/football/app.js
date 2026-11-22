import { store, selfTest, requestPersistence } from './storage.js';

const app = document.getElementById('app');

async function boot() {
  try {
    await selfTest();
    const persisted = await requestPersistence();
    const info = await store.init();
    app.innerHTML = `
      <h1>SA Wolves — Game Scorer</h1>
      <p class="ok">Storage round-trip OK</p>
      <p>DB: ${info.db} · schema v${info.schema}</p>
      <p>Persistent storage: ${persisted ? 'granted' : 'not granted'}</p>
      <p>Service worker: ${'serviceWorker' in navigator ? 'supported' : 'unsupported'}</p>
    `;
  } catch (e) {
    app.innerHTML = `<p class="bad">Boot failed: ${e.message}</p>`;
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
}

boot();