// Wählt das Backend: Firebase (Auth + Firestore) oder – falls nicht konfiguriert –
// einen lokalen Demo-Modus, damit die App auch ohne Firebase-Projekt ausprobiert werden kann.
import { firebaseConfig } from '../config/firebase-config.js';

let backend = null;

async function loadHostingConfig() {
  try {
    const res = await fetch('/__/firebase/init.json', { cache: 'no-store' });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return null;
    const cfg = await res.json();
    return cfg && cfg.apiKey ? cfg : null;
  } catch {
    return null;
  }
}

export async function initBackend() {
  if (backend) return backend;
  const cfg = firebaseConfig.apiKey ? firebaseConfig : await loadHostingConfig();
  if (cfg) {
    const { createFirebaseBackend } = await import('./backend-firebase.js');
    backend = await createFirebaseBackend(cfg);
  } else {
    const { createDemoBackend } = await import('./backend-demo.js');
    backend = createDemoBackend();
  }
  return backend;
}

export function getBackend() {
  return backend;
}
