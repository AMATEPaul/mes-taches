// Tests PC (souris) de Mes Tâches, avec SortableJS.
const { app, BrowserWindow, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'suite-out');
fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, 'pc.log');
fs.writeFileSync(LOG, '');
const log = (...s) => fs.appendFileSync(LOG, s.join(' ') + '\n');
nativeTheme.themeSource = 'light';
setTimeout(() => { log('GLOBAL TIMEOUT'); app.exit(2); }, 120000);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

app.whenReady().then(async () => {
  const errors = [];
  try {
    const win = new BrowserWindow({ width: 600, height: 1000, show: false, webPreferences: { partition: 'pc-' + Date.now(), offscreen: true } });
    win.webContents.setFrameRate(60);
    win.webContents.on('console-message', (e) => { if (e.level === 'error') errors.push(e.message); });
    win.loadFile('C:\\Perso\\IA\\APP_Taches\\src\\index.html');
    await wait(1200);
    const js = (s) => win.webContents.executeJavaScript(s);
    await js(`localStorage.setItem('taches', JSON.stringify({version:1,tasks:[
      {id:'a',title:'A immédiate',cat:'immediate',done:false},
      {id:'b',title:'B prioritaire',cat:'prioritaire',done:false},
      {id:'c',title:'C important',cat:'important',done:false}]}))`);
    win.reload(); await wait(1200);
    const dbg = win.webContents.debugger; dbg.attach('1.3');
    const mouse = (type, x, y, extra = {}) => dbg.sendCommand('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'mouse', ...extra });
    const rect = (sel) => js(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top }; })()`);
    const state = () => js(`JSON.parse(localStorage.getItem('taches')).tasks`);
    const catOf = async (id) => { const t = (await state()).find((x) => x.id === id); return t ? (t.done ? 'done' : t.cat) : null; };

    check('PC : le champ « Ajouter » a le focus au démarrage', (await js('document.activeElement.id')) === 'newTask');
    check('PC : raccourcis clavier affichés, astuce tactile cachée', await js(`getComputedStyle(document.querySelector('.shortcuts.keys')).display !== 'none' && getComputedStyle(document.querySelector('.touch-hint')).display === 'none'`));

    // Glisser C (important) vers Ça va (catégorie vide) à la souris
    const c = await rect('[data-id="c"] .title');
    const cava = await rect('.cat-cava');
    await mouse('mousePressed', c.x, c.y);
    for (let i = 1; i <= 20; i++) { await mouse('mouseMoved', c.x, c.y + (cava.y - c.y) * i / 20); await wait(16); }
    await wait(100);
    check('PC : la catégorie survolée s’allume', (await js(`[...document.querySelectorAll('.drop-target')].map(n => n.dataset.cat).join()`)) === 'cava');
    await mouse('mouseReleased', cava.x, cava.y); await wait(400);
    check('PC : glisser à la souris Important → Ça va', (await catOf('c')) === 'cava');

    // Simple clic sur le texte : ne doit PAS ouvrir la modification
    const b = await rect('[data-id="b"] .title');
    await mouse('mousePressed', b.x, b.y); await mouse('mouseReleased', b.x, b.y); await wait(300);
    check('PC : simple clic ne modifie pas', !(await js(`document.querySelector('#board .edit') && 1`)));
    // Double-clic : ouvre la modification
    await mouse('mousePressed', b.x, b.y, { clickCount: 1 }); await mouse('mouseReleased', b.x, b.y, { clickCount: 1 });
    await mouse('mousePressed', b.x, b.y, { clickCount: 2 }); await mouse('mouseReleased', b.x, b.y, { clickCount: 2 }); await wait(300);
    check('PC : double-clic ouvre la modification', !!(await js(`document.querySelector('#board .edit') && 1`)));
    await js(`document.querySelector('#board .edit').blur()`); await wait(200);

    // Boutons à la souris
    const up = await rect('[data-id="b"] .up');
    await mouse('mouseMoved', up.x, up.y); await wait(150);
    await mouse('mousePressed', up.x, up.y); await mouse('mouseReleased', up.x, up.y); await wait(300);
    check('PC : bouton ▲ cliquable', (await catOf('b')) === 'immediate');
    const chk = await rect('[data-id="a"] .check');
    await mouse('mousePressed', chk.x, chk.y); await mouse('mouseReleased', chk.x, chk.y); await wait(300);
    check('PC : bouton « terminer » cliquable', (await catOf('a')) === 'done');

    // Petit mouvement de 2 px en cliquant : pas de glisser
    const b2 = await rect('[data-id="b"] .title');
    await mouse('mousePressed', b2.x, b2.y); await mouse('mouseMoved', b2.x + 2, b2.y); await mouse('mouseReleased', b2.x + 2, b2.y); await wait(300);
    check('PC : un clic qui tremble de 2 px ne déplace rien', (await catOf('b')) === 'immediate' && !(await js(`document.body.classList.contains('is-dragging')`)));
    fs.writeFileSync(path.join(OUT, 'pc.png'), (await win.webContents.capturePage()).toPNG());
  } catch (e) { fail++; log('CRASH', e.stack); }
  check('PC : aucune erreur dans la console', errors.length === 0, errors.join(' / '));
  log(`\nRÉSULTAT PC : ${pass} OK, ${fail} échec(s)`);
  app.exit(0);
});
