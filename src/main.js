import './styles/theme.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/schedule.css';
import './styles/print.css';

import { store } from './state/store.js';
import { counts, conflicts } from './state/selectors.js';
import { parseHash, go } from './router.js';
import { openModal } from './components/modal.js';
import { toast, err as toastErr } from './components/toast.js';
import { openSearch } from './components/search.js';
import { updateConflictLog } from './services/conflictService.js';
import { buildDemo } from './services/demoService.js';
import { storageAvailable, KEYS } from './services/storage.js';
import { esc, debounce } from './utils/dom.js';

import * as dashboard from './pages/dashboard.js';
import * as schedule from './pages/schedule.js';
import * as generator from './pages/generator.js';
import * as groups from './pages/groups.js';
import * as teachers from './pages/teachers.js';
import * as subjects from './pages/subjects.js';
import * as workloads from './pages/workloads.js';
import * as rooms from './pages/rooms.js';
import * as timeslots from './pages/timeslots.js';
import * as calendar from './pages/calendar.js';
import * as substitutions from './pages/substitutions.js';
import * as transfers from './pages/transfers.js';
import * as conflictsPage from './pages/conflicts.js';
import * as unscheduled from './pages/unscheduled.js';
import * as statistics from './pages/statistics.js';
import * as advisor from './pages/advisor.js';
import * as bottlenecks from './pages/bottlenecks.js';
import * as hours from './pages/hours.js';
import * as files from './pages/files.js';
import * as settings from './pages/settings.js';
import * as versions from './pages/versions.js';
import * as events from './pages/events.js';
import * as exams from './pages/exams.js';
import { renderTeacherForm } from './pages/teacherForm.js';
import { t, setLang } from './i18n/index.js';
import { backup } from './services/exportService.js';
import { confirmDialog } from './components/modal.js';

const PAGES = {
  dashboard, schedule, generator, groups, teachers, subjects, workloads, rooms, timeslots, calendar,
  substitutions, transfers, conflicts: conflictsPage, unscheduled, statistics, advisor, bottlenecks, hours, files, settings,
  versions, events, exams,
};

const NAV = [
  [null, [['dashboard', '🏠'], ['schedule', '🗓️'], ['generator', '⚙️'], ['versions', '📢']]],
  ['sec.data', [['groups', '👥'], ['teachers', '🧑‍🏫'], ['subjects', '📚'], ['workloads', '🧮'], ['rooms', '🚪'], ['timeslots', '🕒'], ['calendar', '📆']]],
  ['sec.staff', [['substitutions', '🔁'], ['transfers', '📤'], ['events', '🎪']]],
  ['sec.control', [['conflicts', '🚨'], ['unscheduled', '🧩'], ['statistics', '📊']]],
  ['sec.analysis', [['advisor', '💡'], ['bottlenecks', '🔥'], ['hours', '⏱️']]],
  ['sec.session', [['exams', '📝']]],
  ['sec.files', [['files', '💾']]],
  [null, [['settings', '🛠️']]],
];
let installPrompt = null;
let backupDismissed = false;

let cleanup = null;
const app = document.getElementById('app');

function applyTheme() {
  const t = store.get().settings?.theme || 'system';
  const dark = t === 'dark' || (t === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

function layout() {
  app.innerHTML = `
    <a href="#main" class="sr-only">Asosiy kontentga o‘tish</a>
    <div class="app">
      <aside class="sidebar" aria-label="Asosiy menyu">
        <div class="brand" data-brand></div>
        <nav class="nav" data-nav></nav>
      </aside>
      <div class="backdrop" data-backdrop></div>
      <div class="main">
        <header class="topbar">
          <button class="btn icon ghost menu-btn" data-menu aria-label="Menyu">☰</button>
          <button class="btn search-btn" data-search aria-label="${t('top.search')} (Ctrl+K)">🔍 <span class="lbl">${t('top.search')}</span> <span class="kbd">Ctrl K</span></button>
          <span class="spacer"></span>
          <span class="save-state" data-save></span>
          <button class="btn sm" data-install hidden>📲 ${t('top.install')}</button>
          <button class="btn icon ghost" data-sandbox aria-label="${t('top.sandbox')}" title="${t('top.sandbox')}">🧪</button>
          <button class="btn icon ghost" data-undo aria-label="${t('top.undo')} (Ctrl+Z)" title="${t('top.undo')} (Ctrl+Z)">↶</button>
          <button class="btn icon ghost" data-redo aria-label="${t('top.redo')} (Ctrl+Y)" title="${t('top.redo')} (Ctrl+Y)">↷</button>
          <button class="btn icon ghost" data-themebtn aria-label="${t('top.theme')}" title="${t('top.theme')}">🌓</button>
        </header>
        <div data-banners></div>
        <main class="content" id="main" tabindex="-1" data-content></main>
      </div>
    </div>`;
  if (!document.getElementById('print-root')) {
    const pr = document.createElement('div');
    pr.id = 'print-root';
    pr.setAttribute('aria-hidden', 'true');
    document.body.appendChild(pr);
  }
  const shell = app.querySelector('.app');
  app.querySelector('[data-menu]').onclick = () => shell.classList.toggle('nav-open');
  app.querySelector('[data-backdrop]').onclick = () => shell.classList.remove('nav-open');
  app.querySelector('[data-search]').onclick = () => openSearch();
  app.querySelector('[data-undo]').onclick = doUndo;
  app.querySelector('[data-redo]').onclick = doRedo;
  app.querySelector('[data-themebtn]').onclick = () => {
    const cur = document.documentElement.dataset.theme;
    store.update('Tema o‘zgardi', (d) => { d.settings.theme = cur === 'dark' ? 'light' : 'dark'; }, { history: false });
  };
  app.querySelector('[data-nav]').addEventListener('click', (e) => { if (e.target.closest('a')) shell.classList.remove('nav-open'); });
  app.querySelector('[data-sandbox]').onclick = async () => {
    if (store.inSandbox) return toast('Tajriba rejimi allaqachon yoqilgan.');
    if (!(await confirmDialog({ title: '🧪 Tajriba rejimi', message: 'Istalgan o‘zgarishni sinab ko‘ring ("agar Zhang Wei chorshanba ham ishlasa?"). Oxirida natijani qo‘llaysiz yoki bitta tugma bilan hammasini asl holatga qaytarasiz.', confirmLabel: 'Boshlash' }))) return;
    try { store.startSandbox(); toast('🧪 Tajriba rejimi boshlandi.'); } catch (e) { toastErr(e.message); }
  };
  app.querySelector('[data-install]').onclick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    installPrompt = null;
    app.querySelector('[data-install]').hidden = true;
  };
  app.querySelector('[data-banners]').addEventListener('click', async (e) => {
    const a = e.target.closest('[data-b]')?.dataset.b;
    if (a === 'apply') { store.applySandbox(); toast('✅ Tajriba natijasi qabul qilindi.'); }
    if (a === 'discard' && (await confirmDialog({ title: 'Asl holatga qaytish', message: 'Tajriba davomidagi barcha o‘zgarishlar bekor qilinadi.', confirmLabel: 'Qaytarish', danger: true }))) { store.discardSandbox(); toast('↩️ Asl holat tiklandi.'); }
    if (a === 'backup') backup(store.get());
    if (a === 'later') { backupDismissed = true; renderChrome(); }
  });
}

function renderChrome() {
  const d = store.get();
  const s = d.settings;
  app.querySelector('[data-brand]').innerHTML = `<div class="logo">${s.logo ? `<img src="${esc(s.logo)}" alt="">` : '📅'}</div><div>Smart Schedule<small title="${esc(s.instituteName)}">${esc(s.instituteName || 'Builder')}</small></div>`;
  const cur = parseHash().name;
  let cnt = { critical: 0, unscheduled: 0 };
  try { cnt = counts(); } catch (e) { console.error(e); }
  app.querySelector('[data-nav]').innerHTML = NAV.map(([sec, items]) => `${sec ? `<div class="nav-sec">${t(sec)}</div>` : ''}${items.map(([k, ico]) => {
    const name = t('nav.' + k);
    let badge = '';
    if (k === 'conflicts' && cnt.critical) badge = `<span class="cnt" aria-label="${cnt.critical} ta konflikt">${cnt.critical}</span>`;
    if (k === 'unscheduled' && cnt.unscheduled) badge = `<span class="cnt w" aria-label="${cnt.unscheduled} ta">${cnt.unscheduled}</span>`;
    return `<a href="#/${k}" class="${cur === k ? 'active' : ''}" ${cur === k ? 'aria-current="page"' : ''}><span class="ico" aria-hidden="true">${ico}</span>${name}${badge}</a>`;
  }).join('')}`).join('');
  const u = app.querySelector('[data-undo]'), r = app.querySelector('[data-redo]');
  u.disabled = !store.canUndo();
  r.disabled = !store.canRedo();
  u.title = store.canUndo() ? 'Bekor qilish: ' + store.undoLabel() + ' (Ctrl+Z)' : 'Bekor qilish';
  r.title = store.canRedo() ? 'Qaytarish: ' + store.redoLabel() + ' (Ctrl+Y)' : 'Qaytarish';
  const sv = app.querySelector('[data-save]');
  if (store.saveError) { sv.className = 'save-state dirty'; sv.textContent = store.saveError.quota ? t('top.quota') : t('top.notsaved'); }
  else if (store.dirty) { sv.className = 'save-state dirty'; sv.innerHTML = `${t('top.unsaved')} <button class="btn xs" data-savenow>${t('top.save')}</button>`; sv.querySelector('[data-savenow]').onclick = () => { store.saveNow(); renderChrome(); toast('Saqlandi.'); }; }
  else { sv.className = 'save-state'; sv.textContent = d.meta.lastSaved ? t('top.saved') : ''; }
  // Bannerlar: tajriba rejimi va backup eslatmasi
  const banners = [];
  if (store.inSandbox) banners.push(`<div class="banner sandbox" role="status">🧪 <span>${t('sandbox.banner')}</span><span class="btn-row"><button class="btn sm primary" data-b="apply">✅ ${t('sandbox.apply')}</button><button class="btn sm" data-b="discard">↩️ ${t('sandbox.discard')}</button></span></div>`);
  const due = !backupDismissed && store.backupDue();
  if (due) banners.push(`<div class="banner backup" role="status">🛟 <span>${due.age === null ? t('backup.never', { changes: due.changes }) : t('backup.banner', { days: due.age + ' kun', changes: due.changes })}</span><span class="btn-row"><button class="btn sm primary" data-b="backup">⬇️ ${t('backup.make')}</button><button class="btn sm ghost" data-b="later">${t('backup.later')}</button></span></div>`);
  app.querySelector('[data-banners]').innerHTML = banners.join('');
  app.querySelector('[data-sandbox]').classList.toggle('primary', store.inSandbox);
}

function renderPage() {
  const route = parseHash();
  const page = PAGES[route.name] || PAGES.dashboard;
  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* */ } }
  cleanup = null;
  const content = app.querySelector('[data-content]');
  const y = window.scrollY;
  const sameRoute = content.dataset.route === route.name;
  content.innerHTML = '';
  content.dataset.route = route.name;
  const root = document.createElement('div');
  content.appendChild(root);
  try {
    cleanup = page.render(root, route);
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="alert err">🔴<div><b>Sahifani ko‘rsatishda xato:</b> ${esc(e.message)}</div></div>`;
  }
  if (sameRoute) window.scrollTo(0, y);
  else window.scrollTo(0, 0);
  document.title = (document.querySelector('.page-head h1')?.textContent || 'Smart Schedule Builder') + ' · Smart Schedule Builder';
}

let rafPending = false;
function scheduleRender() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    renderChrome();
    // modal ochiq bo‘lsa ham sahifa yangilanadi (modal body'ga tegilmaydi)
    renderPage();
  });
}

const logConflicts = debounce(() => {
  try {
    const d = store.get();
    const next = updateConflictLog(d, conflicts());
    store.patchSilently((x) => { x.conflictLog = next; });
  } catch (e) { console.error(e); }
}, 800);

function doUndo() {
  const l = store.undo();
  toast(l ? '↶ Bekor qilindi: ' + l : 'Bekor qiladigan amal yo‘q.');
}
function doRedo() {
  const l = store.redo();
  toast(l ? '↷ Qaytarildi: ' + l : 'Qaytaradigan amal yo‘q.');
}

function onboarding() {
  const m = openModal({
    title: 'Smart Schedule Builder’ga xush kelibsiz!',
    body: `<p>Bu ilova serversiz ishlaydi — barcha ma'lumotlar faqat shu brauzerda (localStorage) saqlanadi. Muntazam <b>JSON backup</b> olib turing.</p>
      <div class="grid cols-2 mt">
        <button class="card clickable" data-o="demo" style="text-align:left;font:inherit;color:inherit"><h3>🎓 Demo ma'lumot bilan</h3><p class="muted">5 guruh, 8 o‘qituvchi, 10 fan, 6 xona, tayyor jadval va almashtirish namunasi. Tizimni sinash uchun.</p></button>
        <button class="card clickable" data-o="empty" style="text-align:left;font:inherit;color:inherit"><h3>📄 Bo‘sh boshlash</h3><p class="muted">O‘z guruhlaringiz, o‘qituvchilaringiz va xonalaringizni kiriting yoki Excel'dan import qiling.</p></button>
      </div>
      ${storageAvailable() ? '' : '<div class="alert warn mt">⚠️<div>Brauzer xotirasi (localStorage) yopiq — ma\'lumotlar sahifa yopilganda yo‘qoladi. JSON export qiling.</div></div>'}`,
    actions: [],
    closeOnBackdrop: false,
  });
  m.body.addEventListener('click', (e) => {
    const o = e.target.closest('[data-o]')?.dataset.o;
    if (!o) return;
    if (o === 'demo') {
      m.body.innerHTML = '<p class="row"><span class="spinner"></span> Demo ma\'lumot va jadval tayyorlanmoqda…</p>';
      setTimeout(() => {
        try {
          store.replaceAll(buildDemo(), 'Demo ma\'lumot yuklandi');
          m.close();
          toast('🎓 Demo ma\'lumot yuklandi. Jadval avtomatik tuzildi.');
          go('dashboard');
        } catch (err) { console.error(err); toastErr('Demo yuklashda xato: ' + err.message); m.close(); }
      }, 30);
    } else {
      store.update('Boshlandi', (d) => { d.meta.initialized = true; });
      m.close();
      go('groups');
    }
  });
}

function init() {
  store.init();
  setLang(store.get().settings?.language || 'uz');
  applyTheme();
  // O‘qituvchi uchun alohida forma sahifasi (admin ma'lumotlarisiz ochiladi)
  if (parseHash().name === 'form') {
    renderTeacherForm(app, parseHash());
    return;
  }
  layout();
  renderChrome();
  renderPage();
  window.addEventListener('app:backup', () => { store.markBackup(); backupDismissed = false; toast('🛟 Backup yuklab olindi.'); });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; const b = app.querySelector('[data-install]'); if (b) b.hidden = false; });
  registerPwa();
  let curLang = store.get().settings?.language || 'uz';
  store.subscribe((d, info) => {
    setLang(d.settings?.language || 'uz');
    if ((d.settings?.language || 'uz') !== curLang) { curLang = d.settings.language; layout(); }
    applyTheme();
    scheduleRender();
    if (!info?.silent) logConflicts();
  });
  window.addEventListener('hashchange', () => { renderChrome(); renderPage(); app.querySelector('[data-content]')?.focus({ preventScroll: true }); });
  window.addEventListener('app:rerender', () => { renderPage(); });
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
  let lastW = window.innerWidth;
  window.addEventListener('resize', debounce(() => {
    const crossed = (lastW <= 760) !== (window.innerWidth <= 760);
    lastW = window.innerWidth;
    if (crossed && parseHash().name === 'schedule') renderPage();
  }, 200));
  window.addEventListener('storage', (e) => {
    if (e.key === KEYS.meta) { store.reloadFromStorage(); toast('Ma\'lumot boshqa oynada o‘zgardi — yangilandi.'); }
  });
  window.addEventListener('beforeunload', (e) => { if (store.dirty && store.get().settings.autoSave === false) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('keydown', (e) => {
    const inField = e.target.closest?.('input, textarea, select, [contenteditable]');
    if (document.querySelector('.modal-layer') && !(e.ctrlKey || e.metaKey)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); return; }
    if (inField) return;
    if (e.key === '/' && !document.querySelector('.modal-layer')) { e.preventDefault(); openSearch(); return; }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); doRedo(); }
  });
  if (store.isNew) onboarding();
}

// PWA: faqat https (GitHub Pages) yoki localhost'da, iframe ichida emas
function registerPwa() {
  try {
    if (!('serviceWorker' in navigator)) return;
    const okProto = location.protocol === 'https:' || location.hostname === 'localhost';
    if (!okProto || window.top !== window.self || !document.querySelector('meta[name="ssb-pwa"]')) return;
    if (!document.querySelector('link[rel=manifest]')) {
      const l = document.createElement('link');
      l.rel = 'manifest';
      l.href = './manifest.webmanifest';
      document.head.appendChild(l);
    }
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  } catch { /* PWA ixtiyoriy */ }
}

init();
