// Lance le vrai main.js de l'appli PC, mais avec un dossier de données de test.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const DATA = path.join(__dirname, 'main-test-data');
const LOG = path.join(__dirname, 'suite-out', 'main.log');
fs.rmSync(DATA, { recursive: true, force: true });
fs.mkdirSync(DATA, { recursive: true });
fs.writeFileSync(LOG, '');
const log = (...s) => fs.appendFileSync(LOG, s.join(' ') + '\n');
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.setPath('userData', DATA);
setTimeout(() => { log('TIMEOUT'); app.exit(2); }, 60000);
require('C:\\Perso\\IA\\APP_Taches\\main.js');

app.whenReady().then(async () => {
  try {
    await wait(1500);
    let win = BrowserWindow.getAllWindows()[0];
    const js = (s) => win.webContents.executeJavaScript(s);
    const file = path.join(DATA, 'taches.json');
    check('Premier lancement : appli vide, pas d’alerte', (await js(`document.querySelectorAll('#board .task').length`)) === 0 && (await js(`document.querySelector('#banner').hidden`)));
    await js(`document.querySelector('#newTask').value = 'Tâche PC'; document.querySelector('.add-btn').click(); 1`);
    await wait(400);
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    check('Ajout enregistré dans taches.json', saved.tasks.length === 1 && saved.tasks[0].title === 'Tâche PC');
    win.webContents.reload(); await wait(1200);
    check('Relance : la tâche est relue depuis le fichier', (await js(`document.querySelectorAll('#board .task').length`)) === 1);

    // Fichier abîmé : copie de secours puis démarrage
    fs.writeFileSync(file, '{ ceci n’est pas du JSON');
    win.webContents.reload(); await wait(1200);
    const backups = fs.readdirSync(DATA).filter((n) => n.includes('illisible'));
    check('Fichier abîmé : une copie de secours est faite', backups.length === 1, backups.join());
    check('Fichier abîmé : la copie contient bien l’ancien contenu', fs.readFileSync(path.join(DATA, backups[0]), 'utf8').startsWith('{ ceci'));

    // Lecture impossible (dossier à la place du fichier) : alerte, ajout bloqué, rien n'est écrasé
    fs.rmSync(file, { force: true });
    fs.mkdirSync(file); // readFileSync sur un dossier → EISDIR (≠ ENOENT)
    win.webContents.reload(); await wait(1200);
    check('Lecture impossible : bandeau d’alerte affiché', !(await js(`document.querySelector('#banner').hidden`)), await js(`document.querySelector('#banner').textContent`));
    check('Lecture impossible : ajout désactivé', await js(`document.querySelector('#newTask').disabled && document.querySelector('.add-btn').disabled`));
    check('Lecture impossible : rien n’a été écrasé', fs.statSync(file).isDirectory());
  } catch (e) { fail++; log('CRASH', e.stack); }
  log(`\nRÉSULTAT PC (main.js) : ${pass} OK, ${fail} échec(s)`);
  app.exit(0);
});
