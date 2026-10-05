// PDF Atelier für Windows: ein schlankes Programmfenster (Electron), das die Web-App lädt.
// Vorteil: Jede Aktualisierung der Website ist sofort auch in der Windows-App verfügbar.
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('node:path');
const { appUrl } = require('./config.json');

const APP_URL = process.env.PDF_ATELIER_URL || appUrl;
const APP_ORIGIN = new URL(APP_URL).origin;

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;

function isAppUrl(url) {
  try {
    return new URL(url).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 380,
    minHeight: 560,
    title: 'PDF Atelier',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    backgroundColor: '#f6f5ff',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => win.show());

  // Externe Links im normalen Browser öffnen, in der App nur die eigene Seite anzeigen
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url) && !url.startsWith('file:')) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  // Ohne Internet beim allerersten Start: freundliche Hinweisseite mit „Erneut versuchen“
  win.webContents.on('did-fail-load', (_event, code, _desc, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) {
      win.loadFile(path.join(__dirname, 'offline.html'), { query: { url: APP_URL } });
    }
  });

  // F5 / Strg+R = neu laden, F11 = Vollbild, Strg+Plus/Minus = Zoom
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = input.key.toLowerCase();
    if (key === 'f5' || (input.control && key === 'r')) {
      win.webContents.reload();
      event.preventDefault();
    } else if (key === 'f11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    } else if (input.control && (key === '+' || key === '=')) {
      win.webContents.setZoomLevel(win.webContents.getZoomLevel() + 0.5);
      event.preventDefault();
    } else if (input.control && key === '-') {
      win.webContents.setZoomLevel(win.webContents.getZoomLevel() - 0.5);
      event.preventDefault();
    } else if (input.control && key === '0') {
      win.webContents.setZoomLevel(0);
      event.preventDefault();
    }
  });

  // Sicherung: Ist unter APP_URL wirklich unsere App erreichbar (und keine fremde Seite)?
  win.webContents.on('did-finish-load', async () => {
    const url = win.webContents.getURL();
    if (!isAppUrl(url)) return;
    const ours = await win.webContents
      .executeJavaScript("!!document.querySelector('meta[name=\"pdf-atelier-app\"]')")
      .catch(() => true);
    if (!ours) win.loadFile(path.join(__dirname, 'wrong-url.html'), { query: { url: APP_URL } });
  });

  win.loadURL(APP_URL);
}

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
