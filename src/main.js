import '@fontsource-variable/inter';
import './styles/main.css';
import { initBackend } from './services/backend.js';
import { state } from './state.js';
import * as actions from './actions.js';
import { getLang, setLang } from './i18n/index.js';
import { renderAuth, authFlags } from './ui/auth.js';
import { renderApp } from './ui/app.js';
import { startTutorial } from './ui/tutorial.js';
import { initInstall, onLaunchFiles } from './ui/install.js';

const root = document.getElementById('app');
let current = null;
let currentUid;

function hideSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  splash.classList.add('hide');
  setTimeout(() => splash.remove(), 500);
}

function teardown() {
  current?.destroy?.();
  current = null;
  document.querySelectorAll('.modal-backdrop, .tutorial').forEach((el) => el.remove());
  document.body.classList.remove('no-scroll', 'tutorial-open', 'sheet-open');
}

function enterAuth() {
  teardown();
  actions.resetLibrary();
  state.user = null;
  state.profile = null;
  current = { destroy: renderAuth(root) };
}

async function enterApp(user, backend) {
  teardown();
  state.user = user;
  const profile = (await backend.getProfile(user.uid)) || {};
  state.profile = profile;

  // Sprache: auf dem Anmeldebildschirm gewählt → speichern, sonst gespeicherte Sprache übernehmen
  if (authFlags.langPicked || !profile.lang) {
    backend.saveProfile(user.uid, { lang: getLang(), email: user.email });
  } else if (profile.lang !== getLang()) {
    setLang(profile.lang);
  }
  authFlags.langPicked = false;

  const tutorialKey = `pa_tut_${user.uid}`;
  const runTutorial = () =>
    startTutorial({
      onDone: () => {
        try {
          localStorage.setItem(tutorialKey, '1');
        } catch {}
        backend.saveProfile(user.uid, { tutorialDone: true });
      },
    });

  current = renderApp(root, {
    onLogout: () => backend.logout(),
    onTutorial: runTutorial,
    onLangPicked: (lang) => backend.saveProfile(user.uid, { lang }),
  });
  await actions.loadLibrary();
  onLaunchFiles((files) => actions.importFiles(files));

  let seen = profile.tutorialDone === true;
  try {
    seen = seen || localStorage.getItem(tutorialKey) === '1';
  } catch {}
  if (authFlags.justRegistered || !seen) {
    authFlags.justRegistered = false;
    setTimeout(runTutorial, 600);
  }
}

async function boot() {
  initInstall();
  const backend = await initBackend();
  state.backendMode = backend.mode;
  backend.onAuthChange(async (user) => {
    const uid = user?.uid ?? null;
    if (uid === currentUid) return;
    currentUid = uid;
    try {
      if (user) await enterApp(user, backend);
      else enterAuth();
    } finally {
      hideSplash();
    }
  });
}

boot().catch((e) => {
  console.error(e);
  hideSplash();
  root.textContent = 'PDF Atelier konnte nicht gestartet werden. Bitte Seite neu laden.';
});
