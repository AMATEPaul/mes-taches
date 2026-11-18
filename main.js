// Processus principal : ouvre la fenêtre et enregistre les tâches sur le disque.
const { app, BrowserWindow, ipcMain, Menu, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');

const dataFile = () => path.join(app.getPath('userData'), 'taches.json');

ipcMain.handle('taches:load', () => {
  const file = dataFile();
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null; // premier lancement : pas encore de fichier
    throw err; // fichier bloqué (antivirus, OneDrive…) : on ne repart PAS de zéro
  }
  try {
    return JSON.parse(raw);
  } catch {
    // Fichier abîmé : on le garde de côté avant qu'il soit remplacé.
    // Si même la copie échoue, on refuse de repartir de zéro (l'appli affiche une alerte).
    fs.copyFileSync(file, file.replace(/\.json$/, `.illisible-${Date.now()}.json`));
    return null;
  }
});

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

ipcMain.handle('taches:save', (_event, data) => {
  const file = dataFile();
  const tmp = file + '.tmp';
  const json = JSON.stringify(data, null, 2);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, json, 'utf8');
  // Écriture atomique : pas de fichier à moitié écrit. OneDrive ou un antivirus peuvent bloquer
  // le fichier un instant (EPERM / EBUSY) : on réessaie, puis on écrit directement en dernier recours.
  for (let i = 0; i < 5; i++) {
    try {
      fs.renameSync(tmp, file);
      return true;
    } catch (err) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err;
      sleepSync(60);
    }
  }
  fs.writeFileSync(file, json, 'utf8');
  try { fs.unlinkSync(tmp); } catch {}
  return true;
});

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 560,
    height: 820,
    minWidth: 380,
    minHeight: 520,
    title: 'Mes Tâches',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#141413' : '#f7f6f3',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

// Une seule fenêtre à la fois : relancer l'appli remet la fenêtre existante devant.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  Menu.setApplicationMenu(null);
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}
