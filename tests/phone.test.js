// Batterie de tests "format téléphone" pour Mes Tâches.
// Lance : electron.exe suite.js [--dark]   (SRC_DIR pour tester un autre dossier)
const { app, BrowserWindow, nativeTheme, clipboard } = require('electron');
const http = require('http');
const path = require('path');
const fs = require('fs');

const SRC = process.env.SRC_DIR || 'C:\\Perso\\IA\\APP_Taches\\src';
const OUT = path.join(__dirname, 'suite-out');
fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, 'suite-' + (process.env.UA || 'android') + (process.argv.includes('--dark') ? '-dark' : '') + '.log');
fs.writeFileSync(LOG, '');
const log = (...s) => fs.appendFileSync(LOG, s.join(' ') + '\n');
const DARK = process.argv.includes('--dark');
nativeTheme.themeSource = DARK ? 'dark' : 'light';
setTimeout(() => { log('GLOBAL TIMEOUT'); app.exit(2); }, 240000);

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/mes-taches\/?/, '/');
  if (p === '/' || p === '') p = '/index.html';
  fs.readFile(path.join(SRC, p), (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  if (ok) pass++; else fail++;
  log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? '  — ' + detail : ''}`);
}

app.whenReady().then(async () => {
  let win;
  const errors = [];
  try {
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${server.address().port}/mes-taches/`;
    win = new BrowserWindow({
      width: 390, height: 844, show: false,
      webPreferences: { partition: 'suite-' + Date.now(), offscreen: true, backgroundThrottling: false },
    });
    win.webContents.setFrameRate(60);
    win.webContents.on('console-message', (e) => { if (e.level === 'error' || e.level === 'warning') errors.push(e.message); });
    win.webContents.on('render-process-gone', (_e, d) => log('RENDERER GONE', JSON.stringify(d)));

    win.loadURL(url).catch(() => {});
    await wait(1500);
    const dbg = win.webContents.debugger;
    dbg.attach('1.3');
    const cdp = (m, p) => dbg.sendCommand(m, p);
    const js = (s) => win.webContents.executeJavaScript(s);
    const shot = async (name) => fs.writeFileSync(path.join(OUT, name + '-' + (process.env.UA || 'android') + (DARK ? '-dark' : '') + '.png'), (await win.webContents.capturePage()).toPNG());

    await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await cdp('Emulation.setUserAgentOverride', { userAgent: process.env.UA === 'ipad' ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15' : process.env.UA === 'iphone' ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' : 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' });

    const seed = (tasks) => js(`localStorage.setItem('taches', JSON.stringify({version:1,tasks:${JSON.stringify(tasks)}}))`);
    const load = async () => { win.loadURL(url).catch(() => {}); await wait(1300); };
    const state = () => js(`JSON.parse(localStorage.getItem('taches') || '{"tasks":[]}').tasks`);
    const catOf = async (title) => { const t = (await state()).find((x) => x.title === title); return t ? (t.done ? 'done' : t.cat) : null; };
    const orderIn = async (cat) => (await state()).filter((t) => !t.done && t.cat === cat).map((t) => t.title);
    const rect = (sel) => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, bottom: r.bottom, left: r.left, right: r.right }; })()`);
    const taskSel = (title) => js(`(() => { const li = [...document.querySelectorAll('#board .task')].find((l) => l.querySelector('.title') && l.querySelector('.title').textContent === ${JSON.stringify(title)}); return li ? '[data-id="' + li.dataset.id + '"]' : null; })()`);
    const touch = (type, x, y) => cdp('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    async function tap(sel) {
      await js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return; const r = e.getBoundingClientRect(); if (r.top < 70 || r.bottom > innerHeight - 110) e.scrollIntoView({ block: 'center' }); })()`); await wait(120);
      const r = await rect(sel);
      if (!r) throw new Error('tap: introuvable ' + sel);
      await touch('touchStart', r.x, r.y); await wait(60); await touch('touchEnd', r.x, r.y); await wait(250);
    }
    async function typeText(text) { await cdp('Input.insertText', { text }); await wait(50); }
    async function key(k, code, keyCode) {
      await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: keyCode, text: k === 'Enter' ? '\r' : undefined });
      await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: keyCode });
      await wait(150);
    }
    // Appui long puis trajet du doigt : points = [{x,y,hold?}], pas de 16 ms
    async function dragPath(start, points, { pressMs = 600 } = {}) {
      await touch('touchStart', start.x, start.y);
      await wait(pressMs);
      let cur = { ...start };
      for (const p of points) {
        const dist = Math.hypot(p.x - cur.x, p.y - cur.y);
        const n = Math.max(1, Math.round(dist / 12));
        for (let i = 1; i <= n; i++) {
          await touch('touchMove', cur.x + (p.x - cur.x) * i / n, cur.y + (p.y - cur.y) * i / n);
          await wait(16);
        }
        cur = { x: p.x, y: p.y };
        if (p.hold) {
          // doigt immobile mais "vivant" : un touchMove sur place de temps en temps, comme un vrai doigt
          const end = Date.now() + p.hold;
          while (Date.now() < end) { await wait(100); }
        }
      }
      await touch('touchEnd', cur.x, cur.y);
      await wait(450);
      return cur;
    }

    const base = [
      { id: 'a', title: 'Appeler le médecin', cat: 'immediate', done: false },
      { id: 'b', title: 'Rendre le TP', cat: 'prioritaire', done: false },
      { id: 'c', title: 'Faire les courses', cat: 'prioritaire', done: false },
      { id: 'd', title: 'Réviser le partiel', cat: 'important', done: false },
      { id: 'e', title: 'Ranger la chambre', cat: 'cava', done: false },
    ];

    // ---------- 1. Lancement ----------
    await load(); await seed(base); await load();
    check('Démarrage : 5 tâches affichées', (await js(`document.querySelectorAll('#board .task').length`)) === 5);
    check('Démarrage : le clavier ne s’ouvre pas tout seul', (await js(`document.activeElement.id`)) !== 'newTask');
    check('Démarrage : astuce tactile visible', (await js(`getComputedStyle(document.querySelector('.touch-hint')).display`)) !== 'none');
    check('Démarrage : raccourcis clavier cachés', (await js(`getComputedStyle(document.querySelector('.shortcuts.keys')).display`)) === 'none');
    check('Démarrage : pas de défilement horizontal', (await js(`document.documentElement.scrollWidth <= innerWidth`)));
    check('Démarrage : compteur « 5 tâches à faire »', (await js(`document.querySelector('#remaining').textContent`)).includes('5'));
    check('Aucun appel à vibrate dans le code', !(await js(`fetch('app.js').then(r => r.text()).then(t => /vibrate/.test(t))`)));
    await shot('01-demarrage');

    // ---------- 2. Ajouter ----------
    await tap('.pick-immediate');
    check('Choix de la catégorie Immédiate', (await js(`document.querySelector('.pick-immediate').getAttribute('aria-checked')`)) === 'true');
    await tap('#newTask'); await typeText('Sortir le linge'); await tap('.add-btn');
    check('Ajout par bouton Ajouter → Immédiate', (await catOf('Sortir le linge')) === 'immediate');
    check('Champ vidé après ajout', (await js(`document.querySelector('#newTask').value`)) === '');
    await tap('.pick-cava'); await tap('#newTask'); await typeText('Arroser les plantes'); await key('Enter', 'Enter', 13);
    check('Ajout par touche Entrée → Ça va', (await catOf('Arroser les plantes')) === 'cava');
    await tap('#newTask'); await typeText('   '); await tap('.add-btn');
    check('Une tâche vide n’est pas ajoutée', (await state()).length === 7);
    await js(`document.activeElement.blur()`);

    // ---------- 3. Terminer / Annuler / Terminées ----------
    await tap(`${await taskSel('Rendre le TP')} .check`);
    check('Cocher → la tâche part dans Terminées', (await catOf('Rendre le TP')) === 'done');
    check('Toast « Bravo » affiché', (await js(`!document.querySelector('#toast').hidden && document.querySelector('#toastText').textContent`)) !== false);
    await tap('#toastUndo');
    check('Annuler → la tâche revient', (await catOf('Rendre le TP')) === 'prioritaire');
    await tap(`${await taskSel('Rendre le TP')} .check`);
    log('  DEBUG après 2e coche :', await catOf('Rendre le TP'), JSON.stringify(await rect('#doneToggle')), 'toast', JSON.stringify(await rect('#toast')), 'scrollY', await js('scrollY'), 'elementAtToggle', await js(`(() => { const r = document.querySelector('#doneToggle').getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e ? (e.id || e.className) : 'rien'; })()`));
    await tap('#doneToggle');
    log('  DEBUG après tap toggle :', await js(`document.querySelector('#doneToggle').getAttribute('aria-expanded')`));
    check('Section Terminées dépliée', (await js(`!document.querySelector('#doneList').hidden && document.querySelectorAll('#doneList .task').length`)) === 1);
    await tap('#doneList .task .check');
    check('Remettre à faire depuis Terminées', (await catOf('Rendre le TP')) === 'prioritaire');
    await tap(`${await taskSel('Rendre le TP')} .check`);
    await tap('#clearDone');
    check('Tout effacer les terminées', (await catOf('Rendre le TP')) === null);
    await tap('#toastUndo');
    check('Annuler l’effacement', (await catOf('Rendre le TP')) === 'done');
    await wait(5600); // le toast disparaît tout seul
    check('Le toast disparaît après 5 s', await js(`document.querySelector('#toast').hidden`));

    // ---------- 4. Supprimer ----------
    await tap(`${await taskSel('Arroser les plantes')} .danger`);
    check('Corbeille → tâche supprimée', (await catOf('Arroser les plantes')) === null);
    await tap('#toastUndo');
    check('Annuler la suppression', (await catOf('Arroser les plantes')) === 'cava');

    // ---------- 5. Flèches ----------
    await tap(`${await taskSel('Réviser le partiel')} .up`);
    check('Flèche ▲ : Important → Prioritaire', (await catOf('Réviser le partiel')) === 'prioritaire');
    await tap(`${await taskSel('Réviser le partiel')} .down`);
    check('Flèche ▼ : Prioritaire → Important', (await catOf('Réviser le partiel')) === 'important');
    check('Pas de ▲ en Immédiate', await js(`[...document.querySelectorAll('.cat-immediate .task .up')].every(b => b.disabled)`));

    // ---------- 6. Modifier par appui court ----------
    await tap(`${await taskSel('Faire les courses')} .title`);
    check('Appui court → champ de modification', !!(await js(`document.querySelector('#board .edit') && 1`)));
    check('Champ en 16 px (pas de zoom iPhone)', (await js(`getComputedStyle(document.querySelector('#board .edit')).fontSize`)) === '16px');
    await js(`document.querySelector('#board .edit').select()`);
    await typeText('Faire les courses (lait, pain)'); await key('Enter', 'Enter', 13);
    check('Modification enregistrée', (await catOf('Faire les courses (lait, pain)')) === 'prioritaire');

    // ---------- 7. Glisser au doigt ----------
    await load();
    const ranger = await rect(`${await taskSel('Ranger la chambre')} .title`);
    const imm = await rect('.cat-immediate');
    await dragPath(ranger, [{ x: imm.x, y: imm.top + 20 }]);
    check('Glisser Ça va → Immédiate (en haut de la liste)', (await catOf('Ranger la chambre')) === 'immediate', (await orderIn('immediate')).join(' | '));
    check('Pas de modification ouverte après un glisser', !(await js(`document.querySelector('#board .edit') && 1`)));
    await wait(5500);

    // 7b. Doigt immobile 2,5 s pendant le glisser, puis on bouge et on lâche
    {
      const partiel = await rect(`${await taskSel('Réviser le partiel')} .title`);
      const holding = () => js(`!!document.querySelector('.drag-fallback') + ' / chosen=' + !!document.querySelector('.drag-chosen') + ' / scrollY=' + Math.round(scrollY)`);
      await touch('touchStart', partiel.x, partiel.y);
      await wait(500);
      log('  7b après appui long :', await holding());
      await touch('touchMove', partiel.x, partiel.y + 2); await wait(16);
      await touch('touchMove', partiel.x, partiel.y + 4); await wait(16);
      log('  7b après petit mouvement :', await holding());
      await wait(2500);
      log('  7b après 2,5 s immobile :', await holding());
      const cava = await rect('.cat-cava');
      log('  7b cible Ça va :', JSON.stringify(cava));
      const ty = cava.top + 15; // dans la carte, hors de la zone de défilement auto du bas
      for (let y = partiel.y + 4; y < ty; y += 12) { await touch('touchMove', partiel.x, y); await wait(16); }
      await touch('touchMove', cava.x, ty); await wait(150);
      log('  7b au-dessus de la cible :', await holding(), 'survol=', await js(`[...document.querySelectorAll('.drop-target')].map(n => n.dataset.cat).join()`));
      const cava2 = await rect('.cat-cava');
      log('  7b Ça va maintenant :', JSON.stringify(cava2));
      await touch('touchEnd', cava.x, ty); await wait(450);
      check('Doigt immobile 2,5 s puis glisser → Ça va', (await catOf('Réviser le partiel')) === 'cava', 'catégorie = ' + (await catOf('Réviser le partiel')));
      await shot('07b-apres-immobile');
    }
    // 7c. Immobile 2,5 s sur la cible avant de lâcher
    {
      await js(`document.querySelector('${await taskSel('Réviser le partiel')}').scrollIntoView({ block: 'center' })`); await wait(200);
      const p2 = await rect(`${await taskSel('Réviser le partiel')} .title`);
      const imp = await rect('.cat-important');
      const info = () => js(`(() => { const ph = document.querySelector('#board .drag-placeholder'); return 'tenue=' + !!document.querySelector('.drag-fallback') + ' survol=' + [...document.querySelectorAll('.drop-target')].map(n => n.dataset.cat).join() + ' emplacement=' + (ph ? ph.parentElement.dataset.cat : '-') + ' scrollY=' + Math.round(scrollY); })()`);
      log('  7c départ', JSON.stringify(p2), 'cible Important', JSON.stringify(imp));
      await touch('touchStart', p2.x, p2.y); await wait(500);
      log('  7c après appui long :', await info(), 'choisie=' + await js(`!!document.querySelector('.drag-chosen')`));
      for (let y = p2.y; y > imp.y; y -= 12) { await touch('touchMove', p2.x, y); await wait(16); }
      await touch('touchMove', imp.x, imp.y); await wait(100);
      log('  7c arrivé sur Important :', await info());
      await wait(2500);
      log('  7c après 2,5 s immobile :', await info());
      await shot('07c-pendant-le-glisser');
      await touch('touchEnd', imp.x, imp.y); await wait(450);
      check('Immobile 2,5 s au-dessus de la cible puis lâcher → Important (catégorie vide)', (await catOf('Réviser le partiel')) === 'important', 'catégorie = ' + (await catOf('Réviser le partiel')));
    }
    // 7d. Réordonner dans la même catégorie : "Faire les courses" au-dessus de "Rendre le TP"? (TP est terminé) → on ajoute 2 tâches
    await seed([
      { id: 'p1', title: 'P1', cat: 'prioritaire', done: false },
      { id: 'p2', title: 'P2', cat: 'prioritaire', done: false },
      { id: 'p3', title: 'P3', cat: 'prioritaire', done: false },
    ]);
    await load();
    const r3 = await rect(`${await taskSel('P3')} .title`);
    const r1 = await rect(`${await taskSel('P1')}`);
    await dragPath(r3, [{ x: r3.x, y: r1.top + 4 }]);
    check('Réordonner : P3 remonté en premier', (await orderIn('prioritaire')).join(',') === 'P3,P1,P2', (await orderIn('prioritaire')).join(','));

    // 7e. Lâcher hors des catégories (en haut, sur le formulaire) → rien ne change
    const r2 = await rect(`${await taskSel('P2')} .title`);
    const form = await rect('#addForm');
    await dragPath(r2, [{ x: form.x, y: form.top + 10 }]);
    await wait(300);
    check('Lâcher sur le formulaire : la tâche reste dans sa catégorie', (await catOf('P2')) === 'prioritaire');

    // 7f. Défilement auto : longue liste, on part du bas et on remonte jusqu'à Immédiate
    const many = [{ id: 'i0', title: 'Urgent 0', cat: 'immediate', done: false }];
    for (let i = 1; i <= 14; i++) many.push({ id: 'z' + i, title: 'Tâche ' + i, cat: 'cava', done: false });
    await seed(many); await load();
    const immAtTop = await rect('.cat-immediate'); // position d'Immédiate quand la page est tout en haut
    await js(`window.scrollTo(0, document.documentElement.scrollHeight)`); await wait(300);
    const startScroll = await js('scrollY');
    const last = await rect(`${await taskSel('Tâche 14')} .title`);
    // on monte au bord haut, on attend que la page défile, puis on vise Immédiate et on lâche
    await touch('touchStart', last.x, last.y); await wait(600);
    for (let y = last.y; y > 30; y -= 12) { await touch('touchMove', last.x, y); await wait(16); }
    await touch('touchMove', last.x, 30);
    await wait(3000);
    const scrolledTo = await js('scrollY');
    check('Défilement auto vers le haut pendant le glisser', scrolledTo < 5, `scrollY ${startScroll} → ${scrolledTo}`);
    for (let y = 30; y < immAtTop.y; y += 12) { await touch('touchMove', immAtTop.x, y); await wait(16); }
    await touch('touchMove', immAtTop.x, immAtTop.y); await wait(100);
    await shot('07f-defilement-auto');
    await touch('touchEnd', immAtTop.x, immAtTop.y); await wait(450);
    let s = await state();
    const where = s.find((t) => t.title === 'Tâche 14').cat;
    check('Défilement auto : la tâche finit en Immédiate', where === 'immediate', 'catégorie = ' + where);

    // ---------- 7g. Cas limites trouvés par la relecture ----------
    {
      await seed([
        { id: 'k1', title: 'K1', cat: 'immediate', done: false },
        { id: 'k2', title: 'K2', cat: 'prioritaire', done: false },
        { id: 'k3', title: 'K3', cat: 'important', done: false },
        { id: 'k4', title: 'K4', cat: 'cava', done: false },
      ]);
      await load();
      const stuck = () => js(`document.body.classList.contains('is-dragging') || !!document.querySelector('.drag-fallback')`);

      // Geste interrompu par le système (touchcancel) en plein glisser : on annule
      let r = await rect('[data-id="k3"] .title');
      const immR = await rect('.cat-immediate');
      await touch('touchStart', r.x, r.y); await wait(500);
      for (let y = r.y; y > immR.y; y -= 12) { await touch('touchMove', r.x, y); await wait(16); }
      await wait(100);
      await cdp('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await wait(500);
      check('Geste interrompu par le système → la tâche reste dans sa catégorie', (await catOf('K3')) === 'important', 'catégorie = ' + (await catOf('K3')));
      check('Geste interrompu → l’appli n’est pas bloquée', !(await stuck()));

      // Deuxième doigt qui touche puis se lève pendant le glisser : la tâche reste tenue
      r = await rect('[data-id="k3"] .title');
      const cavaR = await rect('.cat-cava');
      await touch('touchStart', r.x, r.y); await wait(500);
      for (let y = r.y; y < cavaR.top + 15; y += 12) { await touch('touchMove', r.x, y); await wait(16); }
      const p1 = { x: r.x, y: cavaR.top + 15, id: 1 };
      await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p1] }); await wait(50);
      await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p1, { x: 300, y: 120, id: 2 }] }); await wait(80);
      await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: 300, y: 120, id: 2 }] }); await wait(200); // lève le 2e doigt seulement
      check('Deuxième doigt levé → la tâche est toujours tenue', await js(`!!document.querySelector('.drag-fallback')`));
      await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [p1] }); await wait(500);
      check('… puis lâchée par le premier doigt → Ça va', (await catOf('K3')) === 'cava', 'catégorie = ' + (await catOf('K3')));

      // Appui long relâché sans bouger : pas de modification ouverte, rien ne bouge
      r = await rect('[data-id="k2"] .title');
      await touch('touchStart', r.x, r.y); await wait(600);
      await touch('touchEnd', r.x, r.y); await wait(500);
      check('Appui long sans bouger → pas de clavier / modification', !(await js(`document.querySelector('#board .edit') && 1`)));
      check('Appui long sans bouger → la tâche ne bouge pas', (await catOf('K2')) === 'prioritaire' && !(await stuck()));

      // Glisser puis reposer au même endroit, puis appui juste après : il doit marcher
      r = await rect('[data-id="k1"] .title');
      await touch('touchStart', r.x, r.y); await wait(500);
      await touch('touchMove', r.x, r.y + 8); await wait(30);
      await touch('touchMove', r.x, r.y + 2); await wait(30);
      await touch('touchEnd', r.x, r.y + 2); await wait(500);
      await tap('[data-id="k4"] .check');
      check('Appui juste après un glisser → il est bien pris en compte', (await catOf('K4')) === 'done', 'K4 = ' + (await catOf('K4')));
      await tap('#toastUndo');
    }
    // ---------- 8. Défilement normal ----------
    await seed(many); await load(); s = await state();
    await js(`window.scrollTo(0, 0)`); await wait(200);
    const t5 = await rect(`${await taskSel('Tâche 5')} .title`);
    const before = s.map((t) => t.cat).join();
    await touch('touchStart', t5.x, t5.y);
    for (let i = 1; i <= 15; i++) { await touch('touchMove', t5.x, t5.y - i * 20); await wait(16); }
    await touch('touchEnd', t5.x, t5.y - 300); await wait(600);
    check('Glissement rapide = la page défile', (await js(`scrollY`)) > 50, 'scrollY=' + (await js('scrollY')));
    check('Glissement rapide = aucune tâche déplacée', (await state()).map((t) => t.cat).join() === before);

    // ---------- 9. Enregistrement + hors connexion ----------
    await load();
    check('Les tâches sont toujours là après rechargement', (await state()).length === 15 && (await js(`document.querySelectorAll('#board .task').length`)) === 15);
    check('Service worker installé', await js(`navigator.serviceWorker.getRegistration().then(r => !!(r && r.active))`));
    await cdp('Network.enable');
    await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    server.close();
    await load();
    check('Hors connexion : l’appli s’ouvre quand même', (await js(`document.querySelectorAll('#board .task').length`)) === 15);
    await shot('09-hors-connexion');
    // ---------- 10. Sauvegarde / restauration (copier-coller) ----------
    {
      const avant = await state();
      await clipboard.writeText('');
      await tap('#backupOpen');
      check('Sauvegarde : la fenêtre s’ouvre', await js(`document.querySelector('#backupDialog').open`));
      await tap('#backupCopy'); await wait(300);
      let copie = await clipboard.readText();
      if (!copie) copie = await js(`document.querySelector('#backupText').value`); // plan B (zone de texte)
      check('Sauvegarde : le texte copié commence par MesTaches1:', copie.startsWith('MesTaches1:'), (await js(`document.querySelector('#backupMsg').textContent`)));
      await tap('#backupClose');
      check('Sauvegarde : la fenêtre se ferme', !(await js(`document.querySelector('#backupDialog').open`)));

      // Téléphone « neuf » (comme l'APK au premier lancement)
      await js(`localStorage.clear()`); await load();
      check('Appli vide avant restauration', (await js(`document.querySelectorAll('#board .task').length`)) === 0);
      await tap('#backupOpen');
      await tap('#backupText'); await typeText('ceci nest pas une sauvegarde'); await tap('#backupRestore');
      check('Texte invalide : message d’erreur, rien n’est ajouté', (await js(`document.querySelector('#backupMsg').classList.contains('error')`)) && (await state()).length === 0);
      await js(`document.querySelector('#backupText').value = ''`);
      await tap('#backupText'); await typeText(copie); await tap('#backupRestore'); await wait(300);
      const apres = await state();
      check('Restauration : toutes les tâches reviennent', apres.length === avant.length && avant.every((t) => apres.some((u) => u.id === t.id && u.cat === t.cat && u.title === t.title && !!u.done === !!t.done)), `${avant.length} → ${apres.length}`);
      check('Restauration : la fenêtre se ferme et un message s’affiche', !(await js(`document.querySelector('#backupDialog').open`)) && (await js(`document.querySelector('#toastText').textContent`)).includes('restaurée'));
      await tap('#backupOpen'); await tap('#backupText'); await typeText(copie); await tap('#backupRestore');
      check('Restaurer deux fois n’ajoute pas de doublons', (await state()).length === avant.length && (await js(`document.querySelector('#backupMsg').textContent`)).includes('déjà'));
      await shot('10-sauvegarde');
      await tap('#backupClose');
    }  } catch (e) {
    fail++;
    log('CRASH', e.stack);
  }
  const errs = errors.filter((m) => !/vibrate/.test(m) && !/ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(m));
  check('Aucune erreur dans la console', errs.length === 0, errs.join(' / '));
  log(`\nRÉSULTAT : ${pass} OK, ${fail} échec(s)`);
  try { server.close(); } catch {}
  app.exit(0);
});













