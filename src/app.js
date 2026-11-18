'use strict';

// Les 4 niveaux, du plus urgent au moins urgent.
const CATS = [
  { id: 'immediate',   label: 'Immédiate',   hint: 'À faire tout de suite' },
  { id: 'prioritaire', label: 'Prioritaire', hint: "Aujourd'hui" },
  { id: 'important',   label: 'Important',   hint: 'Cette semaine' },
  { id: 'cava',        label: 'Ça va',       hint: 'Quand j’ai le temps' },
];
const CAT_IDS = CATS.map((c) => c.id);

const ICONS = {
  check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  up: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 10l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  down: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trash: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bolt: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z" fill="currentColor"/></svg>',
};

// Stockage : fichier sur le disque dans l'appli PC, localStorage dans le navigateur.
// Si les données sont illisibles, on en garde une copie au lieu de les écraser.
const storage = window.store || {
  load: async () => {
    let raw = null;
    try { raw = localStorage.getItem('taches'); } catch { return null; }
    if (raw == null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      try { localStorage.setItem('taches-illisible-' + Date.now(), raw); } catch {}
      return null;
    }
  },
  save: async (d) => { try { localStorage.setItem('taches', JSON.stringify(d)); return true; } catch { return false; } },
};

// Bandeau d'alerte permanent (problème de lecture ou d'enregistrement).
const banners = new Map();
function showBanner(key, text) {
  banners.set(key, text);
  const b = document.getElementById('banner');
  b.textContent = [...banners.values()].join(' ');
  b.hidden = false;
}
function hideBanner(key) {
  if (!banners.delete(key)) return;
  const b = document.getElementById('banner');
  b.textContent = [...banners.values()].join(' ');
  b.hidden = banners.size === 0;
}

let state = { version: 1, tasks: [] };
let selectedCat = 'prioritaire';
let showDone = false;
let undoSnapshot = null;
let toastTimer = null;
let sortables = [];
let isDragging = false;
let holding = false; // tâche prise par l'appui long (avant même le premier mouvement)
let pendingRender = false; // un redessin demandé pendant un glisser, fait juste après
let dragBefore = null;
let rendering = false;
let suppressClickUntil = 0;
let lastPointerType = 'mouse';
let loadFailed = false;

// Écran tactile sans souris (téléphone, tablette) : sert seulement à ne pas ouvrir le clavier au démarrage
// et à afficher l'astuce. Le choix « appui = modifier » se fait geste par geste (voir lastPointerType).
const IS_TOUCH = window.matchMedia('(hover: none)').matches;

const $ = (sel) => document.querySelector(sel);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) node.append(c);
  return node;
}

function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random().toString(16).slice(2);
}

function snapshot() {
  return JSON.parse(JSON.stringify(state.tasks));
}

// Enregistre, redessine, et gère le message « Annuler ».
// Toute modification sans message ferme l'ancien message : « Annuler » ne peut donc jamais
// effacer une modification faite après coup.
function saveState() {
  // Si la lecture au démarrage a échoué, on n'écrase surtout pas le fichier existant.
  if (loadFailed) return;
  Promise.resolve()
    .then(() => storage.save(state))
    .then((ok) => { if (ok === false) throw new Error('save'); hideBanner('save'); })
    .catch(() => showBanner('save', 'Impossible d’enregistrer tes tâches pour l’instant. Garde l’appli ouverte et réessaie dans un moment.'));
}

function commit({ toast = null, before = null } = {}) {
  saveState();
  render();
  if (toast) showToast(toast, before);
  else hideToast();
}

// ---------- Actions ----------

function addTask(title, cat) {
  title = title.trim();
  if (!title) return false;
  state.tasks.push({ id: uid(), title, cat, done: false, createdAt: Date.now(), doneAt: null });
  commit();
  return true;
}

function findTask(id) {
  return state.tasks.find((t) => t.id === id);
}

function completeTask(id) {
  const t = findTask(id);
  if (!t) return;
  const before = snapshot();
  t.done = true;
  t.doneAt = Date.now();
  commit({ toast: 'Bravo, tâche terminée !', before });
}

function restoreTask(id) {
  const t = findTask(id);
  if (!t) return;
  t.done = false;
  t.doneAt = null;
  // On la remet en bas de sa catégorie.
  state.tasks = state.tasks.filter((x) => x.id !== id);
  state.tasks.push(t);
  commit();
}

function deleteTask(id) {
  const before = snapshot();
  state.tasks = state.tasks.filter((t) => t.id !== id);
  commit({ toast: 'Tâche supprimée', before });
}

function clearDone() {
  const n = state.tasks.filter((t) => t.done).length;
  if (!n) return;
  const before = snapshot();
  state.tasks = state.tasks.filter((t) => !t.done);
  commit({ toast: n === 1 ? '1 tâche effacée' : `${n} tâches effacées`, before });
}

function shiftCat(id, delta) {
  const t = findTask(id);
  if (!t) return;
  const i = CAT_IDS.indexOf(t.cat) + delta;
  if (i < 0 || i >= CAT_IDS.length) return;
  t.cat = CAT_IDS[i];
  // Elle arrive en bas de la nouvelle catégorie.
  state.tasks = state.tasks.filter((x) => x.id !== id);
  state.tasks.push(t);
  commit();
  focusTask(id);
}

// ---------- Glisser-déposer (SortableJS) ----------
// Téléphone : appui long (350 ms) puis on glisse. Souris : on glisse directement.
// forceFallback : SortableJS dessine lui-même la tâche qui suit le doigt et n'utilise jamais
// le glisser natif du navigateur (celui qui faisait lâcher la tâche au bout d'une seconde).

function setupSortable(ul) {
  return Sortable.create(ul, {
    group: 'taches',
    draggable: '.task',
    filter: 'button, input, .empty, .cat-head',
    preventOnFilter: false,         // les boutons restent cliquables
    delay: 350,
    delayOnTouchOnly: true,         // appui long au doigt seulement
    touchStartThreshold: 5,         // le doigt bouge de plus de 5 px pendant l'appui = on défile
    forceFallback: true,
    fallbackTolerance: 3,
    fallbackOnBody: true,
    animation: 180,                 // les autres tâches glissent pour faire de la place
    easing: 'cubic-bezier(0.2, 0, 0, 1)',
    ghostClass: 'drag-placeholder', // l'emplacement où la tâche va se poser
    chosenClass: 'drag-chosen',
    dragClass: 'drag-floating',
    fallbackClass: 'drag-fallback', // la copie qui suit le doigt
    scroll: true,
    forceAutoScrollFallback: true,
    scrollSensitivity: 80,
    scrollSpeed: 14,
    bubbleScroll: true,
    emptyInsertThreshold: 24,
    revertOnSpill: true,            // lâchée en dehors des catégories : elle revient à sa place
    // Dès que l'appui long a « pris » la tâche, on empêche la page de défiler sous le doigt
    // (voir le blocage de touchmove dans init()).
    onChoose: () => {
      holding = true;
      document.body.classList.add('is-holding'); // coupe le zoom à deux doigts pendant qu'on tient la tâche
    },
    onUnchoose: () => {
      // Appui long relâché sans bouger : on n'ouvre pas la modification derrière.
      if (holding && lastPointerType !== 'mouse') suppressClickUntil = Date.now() + 400;
      holding = false;
      document.body.classList.remove('is-holding');
      if (!isDragging) flushRender();
    },
    onStart: (evt) => {
      isDragging = true;
      dragBefore = snapshot();
      document.body.classList.add('is-dragging');
      highlight(evt.from);
    },
    onMove: (evt) => {
      highlight(evt.to);
    },
    onEnd: (evt) => {
      isDragging = false;
      holding = false;
      document.body.classList.remove('is-dragging', 'is-holding');
      highlight(null);
      suppressClickUntil = Date.now() + 400;
      const before = dragBefore;
      dragBefore = null;
      const type = evt.originalEvent && evt.originalEvent.type;
      // Sur iPhone / écrans tactiles Windows, SortableJS attend un « clic » qui ne vient jamais après
      // un glisser au doigt, et avalerait le prochain appui. On lui donne ce clic tout de suite.
      if (lastPointerType !== 'mouse') {
        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
      // Geste interrompu par le système (notification, appel…) : on annule, rien ne bouge.
      if (type === 'pointercancel' || type === 'touchcancel') {
        setTimeout(() => { pendingRender = false; render(); }, 0);
        return;
      }
      // On laisse SortableJS finir son rangement avant de redessiner.
      setTimeout(() => { pendingRender = false; applyDomOrder(evt, before); }, 0);
    },
  });
}

function highlight(list) {
  const section = list ? list.closest('.cat') : null;
  document.querySelectorAll('.cat.drop-target').forEach((s) => { if (s !== section) s.classList.remove('drop-target'); });
  if (section) section.classList.add('drop-target');
}

// Après un dépôt, l'ordre affiché devient l'ordre enregistré.
function applyDomOrder(evt, before) {
  const placed = [];
  document.querySelectorAll('#board .cat').forEach((section) => {
    section.querySelectorAll(':scope > .task').forEach((row) => placed.push({ id: row.dataset.id, cat: section.dataset.cat }));
  });
  const byId = new Map(state.tasks.map((t) => [t.id, t]));
  const open = [];
  for (const p of placed) {
    const t = byId.get(p.id);
    if (t && !t.done) {
      open.push(t);
      byId.delete(p.id);
    }
  }
  // Sécurité : toute tâche à faire qui ne serait plus affichée est gardée telle quelle.
  const rest = [...byId.values()];
  const movedTask = findTask(evt.item.dataset.id);
  const oldCat = movedTask ? movedTask.cat : null;
  const newCat = evt.to && evt.to.dataset ? evt.to.dataset.cat : oldCat;

  const prevKey = state.tasks.filter((t) => !t.done).map((t) => t.id + ':' + t.cat).join();
  for (const p of placed) { const t = findTask(p.id); if (t) t.cat = p.cat; }
  state.tasks = open.concat(rest);
  const nextKey = state.tasks.filter((t) => !t.done).map((t) => t.id + ':' + t.cat).join();

  if (prevKey === nextKey) {
    render();
    return;
  }
  if (oldCat !== newCat && newCat) {
    const c = CATS.find((x) => x.id === newCat);
    commit({ toast: `Déplacée dans « ${c.label} »`, before });
  } else {
    commit();
  }
}

// ---------- Affichage ----------

function renderPicker() {
  const picker = $('#picker');
  picker.innerHTML = '';
  CATS.forEach((c, i) => {
    const checked = c.id === selectedCat;
    picker.append(el('button', {
      type: 'button',
      class: `pick pick-${c.id}`,
      role: 'radio',
      'aria-checked': String(checked),
      tabindex: checked ? '0' : '-1',
      title: `${c.label} (Ctrl+${i + 1})`,
      onclick: () => selectCat(c.id),
      onkeydown: (e) => {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!step) return;
        e.preventDefault();
        const next = CAT_IDS[(i + step + CAT_IDS.length) % CAT_IDS.length];
        selectCat(next);
        picker.querySelector(`.pick-${next}`).focus();
      },
    }, el('span', { class: 'dot' }), c.label));
  });
}

function selectCat(id) {
  selectedCat = id;
  renderPicker();
}

function taskRow(t, { done = false, tag = 'li' } = {}) {
  const catIdx = CAT_IDS.indexOf(t.cat);
  const li = el(tag, { class: `task t-${t.cat}`, 'data-id': t.id, role: tag === 'li' ? null : 'listitem' });

  li.append(el('button', {
    type: 'button',
    class: 'check',
    'aria-label': done ? `Remettre « ${t.title} » à faire` : `Marquer « ${t.title} » comme terminée`,
    html: ICONS.check,
    onclick: () => (done ? restoreTask(t.id) : completeTask(t.id)),
  }));

  const title = el('span', { class: 'title' }, t.title);
  if (!done) {
    // Au doigt : un appui suffit pour modifier. À la souris : double-clic.
    title.addEventListener('click', () => {
      if (lastPointerType !== 'mouse' && !isDragging) startEdit(li, t);
    });
    title.addEventListener('dblclick', () => startEdit(li, t));
    if (!IS_TOUCH) title.title = 'Double-clic pour modifier, glisser pour déplacer';
  }
  li.append(title);

  const actions = el('div', { class: 'actions' });
  if (!done) {
    actions.append(
      el('button', {
        type: 'button', class: 'icon-btn up', html: ICONS.up,
        'aria-label': catIdx > 0 ? `Monter en ${CATS[catIdx - 1].label}` : 'Monter',
        title: catIdx > 0 ? `Monter en « ${CATS[catIdx - 1].label} »` : '',
        disabled: catIdx === 0,
        onclick: () => shiftCat(t.id, -1),
      }),
      el('button', {
        type: 'button', class: 'icon-btn down', html: ICONS.down,
        'aria-label': catIdx < CATS.length - 1 ? `Descendre en ${CATS[catIdx + 1].label}` : 'Descendre',
        title: catIdx < CATS.length - 1 ? `Descendre en « ${CATS[catIdx + 1].label} »` : '',
        disabled: catIdx === CATS.length - 1,
        onclick: () => shiftCat(t.id, 1),
      }),
    );
  }
  actions.append(el('button', {
    type: 'button', class: 'icon-btn danger', html: ICONS.trash,
    'aria-label': `Supprimer « ${t.title} »`, title: 'Supprimer',
    onclick: () => deleteTask(t.id),
  }));
  li.append(actions);
  return li;
}

function startEdit(li, t) {
  if (li.querySelector('.edit')) return;
  const title = li.querySelector('.title');
  const input = el('input', { class: 'edit', type: 'text', maxlength: '200', 'aria-label': 'Modifier la tâche', enterkeyhint: 'done' });
  input.value = t.title;
  let finished = false;
  // On ne redessine que la ligne modifiée (et pas toute la liste) : un clic sur un autre bouton
  // pendant la modification n'est donc pas perdu.
  const finish = (commitIt) => {
    if (finished) return;
    finished = true;
    const value = input.value.trim();
    if (commitIt && value && value !== t.title) {
      t.title = value;
      saveState();
      hideToast();
    }
    if (li.isConnected) li.replaceWith(taskRow(t, { tag: li.tagName.toLowerCase() }));
    sortables.forEach((s) => s.option('disabled', false));
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
  // Pendant la modification, on ne peut pas déplacer de tâche (sinon le texte serait perdu).
  sortables.forEach((s) => s.option('disabled', true));
  title.replaceWith(input);
  input.focus();
  input.select();
}

function flushRender() {
  if (pendingRender) { pendingRender = false; render(); }
}

function render() {
  // Jamais pendant un glisser : on détruirait la tâche tenue et l'appli resterait bloquée.
  if (holding || isDragging) { pendingRender = true; return; }
  // Garde-fou : un « blur » du champ de modification pendant le redessin ne doit pas redessiner deux fois.
  if (rendering) return;
  rendering = true;
  try {
    sortables.forEach((s) => s.destroy());
    sortables = [];
    const board = $('#board');
    board.innerHTML = '';
    const open = state.tasks.filter((t) => !t.done);

    for (const c of CATS) {
      const tasks = open.filter((t) => t.cat === c.id);
      // Toute la carte (en-tête compris) est la zone de dépôt : les tâches en sont les enfants directs.
      const section = el('section', { class: `cat cat-${c.id}`, 'data-cat': c.id, role: 'list', 'aria-labelledby': `h-${c.id}` });
      const h2 = el('h2', { id: `h-${c.id}` });
      if (c.id === 'immediate') h2.insertAdjacentHTML('beforeend', ICONS.bolt);
      h2.append(c.label);
      section.append(el('div', { class: 'cat-head', role: 'presentation' },
        h2,
        el('span', { class: 'cat-hint' }, c.hint),
        el('span', { class: `count${tasks.length ? ' has' : ''}`, 'aria-label': `${tasks.length} tâche(s)` }, String(tasks.length)),
      ));
      tasks.forEach((t) => section.append(taskRow(t, { tag: 'div' })));
      section.append(el('div', { class: 'empty', role: 'presentation' }, c.id === 'immediate' ? 'Rien d’urgent. Respire.' : 'Rien ici.'));
      board.append(section);
      if (window.Sortable) sortables.push(setupSortable(section));
    }

    // Terminées : les plus récentes en premier.
    const done = state.tasks.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    $('#doneZone').hidden = done.length === 0;
    $('#doneLabel').textContent = `Terminées (${done.length})`;
    $('#doneToggle').setAttribute('aria-expanded', String(showDone));
    const doneList = $('#doneList');
    doneList.hidden = !showDone;
    doneList.innerHTML = '';
    done.forEach((t) => doneList.append(taskRow(t, { done: true })));

    const remaining = $('#remaining');
    remaining.innerHTML = '';
    if (open.length === 0) remaining.textContent = 'Tout est fait 🎉';
    else remaining.append(el('strong', {}, String(open.length)), open.length === 1 ? ' tâche à faire' : ' tâches à faire');
  } finally {
    rendering = false;
  }
}

function focusTask(id) {
  const btn = document.querySelector(`#board .task[data-id="${CSS.escape(id)}"] .check`);
  if (btn) btn.focus();
}

// ---------- Toast + Annuler ----------

function showToast(text, before) {
  undoSnapshot = before || null;
  $('#toastText').textContent = text;
  $('#toastUndo').hidden = !undoSnapshot;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 5000);
}

function hideToast() {
  clearTimeout(toastTimer);
  $('#toast').hidden = true;
  undoSnapshot = null;
}

function undo() {
  if (!undoSnapshot || holding || isDragging) return;
  state.tasks = undoSnapshot;
  commit();
}

// ---------- Sauvegarde / restauration ----------
// Un simple texte à copier-coller : marche partout (navigateur, appli installée, APK).

const BACKUP_PREFIX = 'MesTaches1:';

function backupText() {
  return BACKUP_PREFIX + JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), tasks: state.tasks });
}

function parseBackup(text) {
  text = (text || '').trim();
  if (text.startsWith(BACKUP_PREFIX)) text = text.slice(BACKUP_PREFIX.length);
  let data;
  try { data = JSON.parse(text); } catch { return null; }
  if (Array.isArray(data)) data = { tasks: data };
  if (!data || !Array.isArray(data.tasks)) return null;
  return normalize({ version: 1, tasks: data.tasks }).tasks;
}

function setBackupMsg(text, isError = false) {
  const m = $('#backupMsg');
  m.textContent = text;
  m.classList.toggle('error', isError);
}

async function copyBackup() {
  const text = backupText();
  const n = state.tasks.length;
  const done = `Copié (${n} tâche${n > 1 ? 's' : ''}). Ouvre l’autre appli, puis Sauvegarde → colle → Restaurer.`;
  try {
    await navigator.clipboard.writeText(text);
    setBackupMsg(done);
    return;
  } catch {}
  // Plan B : on met le texte dans la zone et on tente la copie « à l'ancienne ».
  const area = $('#backupText');
  area.value = text;
  area.focus();
  area.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch {}
  setBackupMsg(ok ? done : 'Le texte est sélectionné ci-dessus : appuie longuement dessus puis « Copier ».');
}

function restoreBackup() {
  const incoming = parseBackup($('#backupText').value);
  if (!incoming) {
    setBackupMsg('Ce texte n’est pas une sauvegarde de Mes Tâches. Vérifie que tu as tout collé.', true);
    return;
  }
  // On ajoute ce qui manque, sans rien effacer ni remplacer.
  const known = new Set(state.tasks.map((t) => t.id));
  const added = incoming.filter((t) => !known.has(t.id));
  if (!added.length) {
    setBackupMsg('Toutes ces tâches sont déjà là : rien à ajouter.');
    return;
  }
  const before = snapshot();
  state.tasks = state.tasks.concat(added);
  $('#backupText').value = '';
  setBackupMsg('');
  $('#backupDialog').close();
  commit({ toast: added.length === 1 ? '1 tâche restaurée' : `${added.length} tâches restaurées`, before });
}

function setupBackup() {
  const dlg = $('#backupDialog');
  $('#backupOpen').addEventListener('click', () => {
    setBackupMsg('');
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  });
  $('#backupClose').addEventListener('click', () => dlg.close());
  $('#backupCopy').addEventListener('click', copyBackup);
  $('#backupRestore').addEventListener('click', restoreBackup);
  // Appui en dehors de la fenêtre : on la ferme.
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
}

// ---------- Démarrage ----------

function normalize(data) {
  if (!data || !Array.isArray(data.tasks)) return { version: 1, tasks: [] };
  data.tasks = data.tasks
    .filter((t) => t && typeof t.title === 'string')
    .map((t) => ({ ...t, cat: CAT_IDS.includes(t.cat) ? t.cat : 'important', id: t.id || uid() }));
  return data;
}

async function init() {
  $('#today').textContent = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  let data = null;
  try { data = await storage.load(); } catch { data = null; loadFailed = true; }
  state = normalize(data);
  renderPicker();
  render();
  if (loadFailed) {
    // Rien n'est perdu, mais tant qu'on n'a pas pu lire, on ne laisse rien ajouter (ce serait perdu).
    showBanner('load', 'Impossible de lire tes tâches pour l’instant. Ferme puis rouvre l’appli : rien n’a été effacé.');
    $('#newTask').disabled = true;
    $('.add-btn').disabled = true;
  }

  $('#addForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#newTask');
    if (addTask(input.value, selectedCat)) input.value = '';
    input.focus();
  });
  $('#doneToggle').addEventListener('click', () => { showDone = !showDone; render(); });
  $('#clearDone').addEventListener('click', clearDone);
  $('#toastUndo').addEventListener('click', undo);
  setupBackup();

  // Doigt, stylet ou souris : retenu à chaque geste (utile pour les tablettes avec clavier/souris).
  document.addEventListener('pointerdown', (e) => { lastPointerType = e.pointerType || 'mouse'; }, true);

  // Tâche prise : la page ne doit pas défiler sous le doigt, même avant le premier vrai mouvement.
  // Sinon le navigateur prend la main (pointercancel) et la tâche retombe. SortableJS ne bloque
  // le défilement qu'une fois le glisser commencé : on couvre aussi le moment juste après l'appui long.
  document.addEventListener('touchmove', (e) => {
    if ((holding || isDragging) && e.cancelable) e.preventDefault();
  }, { passive: false });

  // Un deuxième doigt qui touche puis se lève ne doit pas lâcher la tâche tenue par le premier.
  // Après un appui au doigt, Safari (iPhone/iPad) envoie aussi un faux « mousedown » de compatibilité.
  // SortableJS le prendrait pour une souris et « prendrait » la tâche sans appui long : on le lui cache.
  // (Ça n'empêche ni le clic ni le focus : seule la propagation du mousedown est arrêtée.)
  let lastTouchTime = 0;
  for (const type of ['touchstart', 'touchend']) {
    window.addEventListener(type, () => { lastTouchTime = Date.now(); }, true);
  }
  window.addEventListener('mousedown', (e) => {
    if (Date.now() - lastTouchTime < 800) e.stopPropagation();
  }, true);

  // Un autre doigt posé pendant qu'on tient une tâche est ignoré (ni prise, ni déplacement, ni lâcher).
  // SortableJS écoute pointer* et touch* : on filtre les deux.
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
    window.addEventListener(type, (e) => {
      if ((holding || isDragging) && !e.isPrimary) e.stopPropagation();
    }, true);
  }
  window.addEventListener('touchend', (e) => {
    if ((holding || isDragging) && e.touches.length > 0) e.stopPropagation();
  }, true);

  // Pas de menu « copier / partager » de l'appui long sur les tâches (mais oui dans le champ de texte).
  document.addEventListener('contextmenu', (e) => {
    if (isDragging || (e.target.closest('#board .task') && !e.target.closest('input'))) e.preventDefault();
  });

  // Juste après un glisser, on ignore le « clic » que le navigateur envoie en lâchant.
  document.addEventListener('click', (e) => {
    if (Date.now() < suppressClickUntil && e.target.closest('#board')) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);

  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const n = Number(e.key);
    if (n >= 1 && n <= CATS.length) {
      e.preventDefault();
      selectCat(CAT_IDS[n - 1]);
    } else if (e.key.toLowerCase() === 'n') {
      e.preventDefault();
      $('#newTask').focus();
    } else if (e.key.toLowerCase() === 'z' && undoSnapshot && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      undo();
    }
  });

  // Sur téléphone, on n'ouvre pas le clavier dès le lancement.
  if (!IS_TOUCH) $('#newTask').focus();

  // Version web : fonctionne hors connexion et demande au navigateur de ne pas effacer les données.
  if (location.protocol.startsWith('http')) {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }
}

init();
