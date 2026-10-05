import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
  connectAuthEmulator,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  connectFirestoreEmulator,
} from 'firebase/firestore';

const toUser = (u) => (u ? { uid: u.uid, email: u.email, emailVerified: u.emailVerified } : null);

export async function createFirebaseBackend(config) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  let db;
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    db = initializeFirestore(app, {});
  }

  // Lokale Entwicklung mit der Firebase Emulator Suite (`firebase emulators:start`)
  if (import.meta.env.VITE_FIREBASE_EMULATORS === 'true') {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }

  const profileRef = (uid) => doc(db, 'users', uid);

  return {
    mode: 'firebase',

    onAuthChange(cb) {
      return onAuthStateChanged(auth, (u) => cb(toUser(u)));
    },

    async register(email, password, lang) {
      auth.languageCode = lang;
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(profileRef(cred.user.uid), {
        email,
        lang,
        tutorialDone: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch((e) => console.warn('Profil konnte nicht angelegt werden', e));
      sendEmailVerification(cred.user).catch(() => {});
      return toUser(cred.user);
    },

    async login(email, password, lang) {
      auth.languageCode = lang;
      const cred = await signInWithEmailAndPassword(auth, email, password);
      return toUser(cred.user);
    },

    async resetPassword(email, lang) {
      auth.languageCode = lang;
      try {
        await sendPasswordResetEmail(auth, email);
      } catch (e) {
        // Aus Datenschutzgründen nicht verraten, ob ein Konto existiert.
        if (e.code !== 'auth/user-not-found') throw e;
      }
    },

    async logout() {
      await signOut(auth);
    },

    async getProfile(uid) {
      try {
        const snap = await getDoc(profileRef(uid));
        return snap.exists() ? snap.data() : null;
      } catch (e) {
        console.warn('Profil konnte nicht geladen werden', e);
        return null;
      }
    },

    async saveProfile(uid, data) {
      try {
        await setDoc(profileRef(uid), { ...data, updatedAt: serverTimestamp() }, { merge: true });
      } catch (e) {
        console.warn('Profil konnte nicht gespeichert werden', e);
      }
    },
  };
}
