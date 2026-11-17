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

// Stockage : fichier sur le disque dans l'appli, localStorage si ouvert dans un navigateur.
const storage = window.store || {
  load: async () => { try { return JSON.parse(localStorage.getItem('taches')); } catch { return null; } },
  save: async (d) => { try { localStorage.setItem('taches', JSON.stringify(d)); } catch {} },
};

let state = { version: 1, tasks: [] };
let selectedCat = 'prioritaire';
let showDone = false;
let undoSnapshot = null;
let toastTimer = null;
let dragId = null;

// Écran tactile sans souris (téléphone, tablette).
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

function save() {
  storage.save(state);
}

function snapshot() {
  return JSON.parse(JSON.stringify(state.tasks));
}

// ---------- Actions ----------

function addTask(title, cat) {
  title = title.trim();
  if (!title) return false;
  state.tasks.push({ id: uid(), title, cat, done: false, createdAt: Date.now(), doneAt: null });
  save();
  render();
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
  save();
  render();
  showToast('Bravo, tâche terminée !', before);
}

function restoreTask(id) {
  const t = findTask(id);
  if (!t) return;
  t.done = false;
  t.doneAt = null;
  // On la remet en bas de sa catégorie.
  state.tasks = state.tasks.filter((x) => x.id !== id);
  state.tasks.push(t);
  save();
  render();
}

function deleteTask(id) {
  const before = snapshot();
  state.tasks = state.tasks.filter((t) => t.id !== id);
  save();
  render();
  showToast('Tâche supprimée', before);
}

function clearDone() {
  const n = state.tasks.filter((t) => t.done).length;
  if (!n) return;
  const before = snapshot();
  state.tasks = state.tasks.filter((t) => !t.done);
  save();
  render();
  showToast(n === 1 ? '1 tâche effacée' : `${n} tâches effacées`, before);
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
  save();
  render();
  focusTask(id);
}

function renameTask(id, title) {
  const t = findTask(id);
  title = title.trim();
  if (t && title && title !== t.title) {
    t.title = title;
    save();
  }
  render();
}

function moveTask(id, cat, beforeId) {
  const t = findTask(id);
  if (!t || id === beforeId) return;
  t.cat = cat;
  state.tasks = state.tasks.filter((x) => x.id !== id);
  const idx = beforeId ? state.tasks.findIndex((x) => x.id === beforeId) : -1;
  if (idx === -1) state.tasks.push(t);
  else state.tasks.splice(idx, 0, t);
  save();
  render();
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

function taskRow(t, { done = false } = {}) {
  const catIdx = CAT_IDS.indexOf(t.cat);
  const li = el('li', {
    class: `task t-${t.cat}`,
    'data-id': t.id,
    draggable: done ? false : 'true',
  });

  li.append(el('button', {
    type: 'button',
    class: 'check',
    'aria-label': done ? `Remettre « ${t.title} » à faire` : `Marquer « ${t.title} » comme terminée`,
    html: ICONS.check,
    onclick: () => (done ? restoreTask(t.id) : completeTask(t.id)),
  }));

  const title = el('span', { class: 'title' }, t.title);
  if (!done) {
    if (IS_TOUCH) {
      // Sur téléphone : un appui sur le texte suffit pour le modifier.
      title.addEventListener('click', () => startEdit(li, t));
    } else {
      title.title = 'Double-clic pour modifier, glisser pour déplacer';
      title.addEventListener('dblclick', () => startEdit(li, t));
    }
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

  if (!done) {
    li.addEventListener('dragstart', (e) => {
      dragId = t.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', t.id);
      requestAnimationFrame(() => li.classList.add('dragging'));
    });
    li.addEventListener('dragend', () => {
      dragId = null;
      document.querySelectorAll('.dragging, .drop-before, .drop-target')
        .forEach((n) => n.classList.remove('dragging', 'drop-before', 'drop-target'));
    });
  }
  return li;
}

function startEdit(li, t) {
  const title = li.querySelector('.title');
  const input = el('input', { class: 'edit', type: 'text', maxlength: '200', 'aria-label': 'Modifier la tâche' });
  input.value = t.title;
  let finished = false;
  const finish = (commit) => {
    if (finished) return;
    finished = true;
    if (commit) renameTask(t.id, input.value);
    else render();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
  li.draggable = false;
  title.replaceWith(input);
  input.focus();
  input.select();
}

function setupDrop(section, catId) {
  section.addEventListener('dragover', (e) => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.drop-target').forEach((n) => n !== section && n.classList.remove('drop-target'));
    section.classList.add('drop-target');
    document.querySelectorAll('.drop-before').forEach((n) => n.classList.remove('drop-before'));
    const target = rowUnder(section, e.clientY);
    if (target) target.classList.add('drop-before');
  });
  section.addEventListener('dragleave', (e) => {
    if (!section.contains(e.relatedTarget)) {
      section.classList.remove('drop-target');
      section.querySelectorAll('.drop-before').forEach((n) => n.classList.remove('drop-before'));
    }
  });
  section.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!dragId) return;
    const target = rowUnder(section, e.clientY);
    moveTask(dragId, catId, target ? target.dataset.id : null);
  });
}

// La ligne devant laquelle on dépose : la première dont le milieu est sous le curseur.
function rowUnder(section, y) {
  for (const row of section.querySelectorAll('.task:not(.dragging)')) {
    const r = row.getBoundingClientRect();
    if (y < r.top + r.height / 2) return row;
  }
  return null;
}

function render() {
  const board = $('#board');
  board.innerHTML = '';
  const open = state.tasks.filter((t) => !t.done);

  for (const c of CATS) {
    const tasks = open.filter((t) => t.cat === c.id);
    const section = el('section', { class: `cat cat-${c.id}`, 'aria-labelledby': `h-${c.id}` });
    const h2 = el('h2', { id: `h-${c.id}` });
    if (c.id === 'immediate') h2.insertAdjacentHTML('beforeend', ICONS.bolt);
    h2.append(c.label);
    section.append(el('div', { class: 'cat-head' },
      h2,
      el('span', { class: 'cat-hint' }, c.hint),
      el('span', { class: `count${tasks.length ? ' has' : ''}`, 'aria-label': `${tasks.length} tâche(s)` }, String(tasks.length)),
    ));
    const ul = el('ul', { class: 'list' });
    if (tasks.length) tasks.forEach((t) => ul.append(taskRow(t)));
    else ul.append(el('li', { class: 'empty' }, c.id === 'immediate' ? 'Rien d’urgent. Respire.' : 'Rien ici.'));
    section.append(ul);
    setupDrop(section, c.id);
    board.append(section);
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
}

function focusTask(id) {
  const btn = document.querySelector(`.task[data-id="${CSS.escape(id)}"] .check`);
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
  $('#toast').hidden = true;
  undoSnapshot = null;
}

function undo() {
  if (!undoSnapshot) return;
  state.tasks = undoSnapshot;
  save();
  render();
  hideToast();
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

  state = normalize(await storage.load());
  renderPicker();
  render();

  $('#addForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#newTask');
    if (addTask(input.value, selectedCat)) input.value = '';
    input.focus();
  });
  $('#doneToggle').addEventListener('click', () => { showDone = !showDone; render(); });
  $('#clearDone').addEventListener('click', clearDone);
  $('#toastUndo').addEventListener('click', undo);

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
