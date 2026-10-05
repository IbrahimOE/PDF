// Lokaler Demo-Modus: simuliert Firebase Auth/Firestore im Browser (localStorage).
// Wird nur verwendet, solange kein Firebase-Projekt konfiguriert ist.
const USERS_KEY = 'pa_demo_users';
const SESSION_KEY = 'pa_demo_session';
const PROFILE_KEY = (uid) => `pa_demo_profile_${uid}`;

const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));

function authError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

async function hash(password, salt) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function createDemoBackend() {
  const listeners = new Set();
  const currentUser = () => {
    const uid = read(SESSION_KEY, null);
    const user = Object.values(read(USERS_KEY, {})).find((u) => u.uid === uid);
    return user ? { uid: user.uid, email: user.email, emailVerified: true } : null;
  };
  const emit = () => listeners.forEach((cb) => cb(currentUser()));

  return {
    mode: 'demo',

    onAuthChange(cb) {
      listeners.add(cb);
      queueMicrotask(() => cb(currentUser()));
      return () => listeners.delete(cb);
    },

    async register(email, password, lang) {
      await wait(400);
      email = email.trim().toLowerCase();
      if (!email) throw authError('auth/missing-email');
      if (!validEmail(email)) throw authError('auth/invalid-email');
      if (!password || password.length < 6) throw authError('auth/weak-password');
      const users = read(USERS_KEY, {});
      if (users[email]) throw authError('auth/email-already-in-use');
      const salt = crypto.randomUUID();
      const uid = `demo-${crypto.randomUUID()}`;
      users[email] = { uid, email, salt, hash: await hash(password, salt) };
      write(USERS_KEY, users);
      write(PROFILE_KEY(uid), { email, lang, tutorialDone: false, createdAt: Date.now() });
      write(SESSION_KEY, uid);
      emit();
      return currentUser();
    },

    async login(email, password) {
      await wait(400);
      email = email.trim().toLowerCase();
      if (!email) throw authError('auth/missing-email');
      if (!validEmail(email)) throw authError('auth/invalid-email');
      if (!password) throw authError('auth/missing-password');
      const user = read(USERS_KEY, {})[email];
      if (!user || user.hash !== (await hash(password, user.salt))) {
        throw authError('auth/invalid-credential');
      }
      write(SESSION_KEY, user.uid);
      emit();
      return currentUser();
    },

    async resetPassword(email) {
      await wait(400);
      if (!email) throw authError('auth/missing-email');
      if (!validEmail(email.trim())) throw authError('auth/invalid-email');
    },

    async logout() {
      localStorage.removeItem(SESSION_KEY);
      emit();
    },

    async getProfile(uid) {
      return read(PROFILE_KEY(uid), null);
    },

    async saveProfile(uid, data) {
      write(PROFILE_KEY(uid), { ...read(PROFILE_KEY(uid), {}), ...data });
    },
  };
}
