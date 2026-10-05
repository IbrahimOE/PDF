// Firebase-Konfiguration
// ----------------------
// Werte aus der Firebase-Konsole einfügen: Projekteinstellungen → Allgemein →
// „Meine Apps“ → Web-App → SDK-Einrichtung und -Konfiguration → „Konfiguration“.
//
// Bleiben die Felder leer, holt sich die App die Konfiguration automatisch von
// Firebase Hosting (/__/firebase/init.json). Gelingt auch das nicht (z. B. lokal
// ohne Konfiguration), startet die App im lokalen Demo-Modus.
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};
