// Markaziy holat (state): yagona haqiqat manbai, avtomatik saqlash, Undo/Redo (50 ta amal)
import { loadRaw, saveData, readJSON, writeJSON, HISTORY_KEY, SNAPSHOTS_KEY, SANDBOX_KEY, KEYS, removeAll } from '../services/storage.js';
import { migrate } from '../services/migrations.js';
import { emptyData } from '../data/defaults.js';
import { nowIso } from '../utils/id.js';
import { reconcileSubstitutions } from '../substitution/substitutionService.js';

const MAX_HISTORY = 50;
const HISTORY_BYTES = 1_500_000;

let data = null;
let undoStack = [];
let redoStack = [];
const listeners = new Set();
let dirty = false;
let lastSaveError = null;
let rev = 0;

function emit(info = {}) {
  rev++;
  for (const fn of listeners) {
    try { fn(data, info); } catch (e) { console.error(e); }
  }
}

function persist() {
  data.meta.lastSaved = nowIso();
  const r = saveData(data);
  lastSaveError = r.ok ? null : r;
  if (r.ok) dirty = false;
  persistHistory();
  return r;
}

function persistHistory() {
  // Hajm cheklovi: eng eskilarini tashlab, sig‘adiganini saqlaymiz
  let u = undoStack.slice(-MAX_HISTORY);
  let size = u.reduce((a, x) => a + x.state.length, 0);
  while (u.length && size > HISTORY_BYTES) { size -= u[0].state.length; u = u.slice(1); }
  const r = writeJSON(HISTORY_KEY, { undo: u, redo: redoStack.slice(-10) });
  if (!r.ok) writeJSON(HISTORY_KEY, { undo: u.slice(-5), redo: [] });
}

export const store = {
  init() {
    let raw = null;
    try { raw = loadRaw(); } catch { raw = null; }
    try { data = raw ? migrate(raw) : emptyData(); }
    catch { data = emptyData(); }
    const h = readJSON(HISTORY_KEY, null);
    if (h && Array.isArray(h.undo)) { undoStack = h.undo; redoStack = h.redo || []; }
    return data;
  },
  get() { return data; },
  get isNew() { return !data?.meta?.initialized; },
  get dirty() { return dirty; },
  get rev() { return rev; },
  get saveError() { return lastSaveError; },

  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  /**
   * O‘zgarish kiritish. fn(data) ma'lumotni joyida o‘zgartiradi.
   * Xato bo‘lsa — hech narsa o‘zgarmaydi (atomik).
   */
  update(label, fn, opts = {}) {
    const before = JSON.stringify(data);
    const lessonsBefore = JSON.stringify(data.schedule?.lessons) + JSON.stringify(data.workloads);
    let result;
    try {
      result = fn(data);
      // Jadval o‘zgargan bo‘lsa — faol almashtirishlarni yangi darslarga moslash
      if (opts.reconcile !== false && data.substitutions?.length && lessonsBefore !== JSON.stringify(data.schedule?.lessons) + JSON.stringify(data.workloads)) {
        reconcileSubstitutions(data);
      }
    } catch (e) {
      data = JSON.parse(before);
      throw e;
    }
    if (opts.history !== false) {
      undoStack.push({ label, state: before, at: nowIso() });
      if (undoStack.length > MAX_HISTORY) undoStack.shift();
      redoStack = [];
      data.meta.changesSinceBackup = (data.meta.changesSinceBackup || 0) + 1;
    }
    data.meta.initialized = true;
    dirty = true;
    if (data.settings?.autoSave !== false || opts.forceSave) persist();
    emit({ label, source: opts.source });
    return result;
  },

  // Tarixga yozilmaydigan kichik o‘zgarish (masalan konfliktlar jurnali)
  patchSilently(fn) {
    fn(data);
    if (data.settings?.autoSave !== false) {
      for (const k of ['conflictLog', 'lessonLog']) writeJSON(KEYS[k], data[k]);
    }
  },

  replaceAll(newData, label = 'Ma\'lumotlar almashtirildi') {
    const migrated = migrate(newData);
    this.update(label, (d) => {
      for (const k of Object.keys(d)) delete d[k];
      Object.assign(d, migrated);
    }, { forceSave: true });
  },

  undo() {
    const x = undoStack.pop();
    if (!x) return null;
    redoStack.push({ label: x.label, state: JSON.stringify(data), at: nowIso() });
    data = JSON.parse(x.state);
    dirty = true;
    if (data.settings?.autoSave !== false) persist();
    emit({ label: 'Bekor qilindi: ' + x.label, undo: true });
    return x.label;
  },

  redo() {
    const x = redoStack.pop();
    if (!x) return null;
    undoStack.push({ label: x.label, state: JSON.stringify(data), at: nowIso() });
    data = JSON.parse(x.state);
    dirty = true;
    if (data.settings?.autoSave !== false) persist();
    emit({ label: 'Qaytarildi: ' + x.label, redo: true });
    return x.label;
  },

  canUndo() { return undoStack.length > 0; },
  canRedo() { return redoStack.length > 0; },
  undoLabel() { return undoStack[undoStack.length - 1]?.label || ''; },
  redoLabel() { return redoStack[redoStack.length - 1]?.label || ''; },
  historyList() { return undoStack.map((x) => ({ label: x.label, at: x.at })).reverse(); },

  saveNow() { return persist(); },

  // Boshqa tabdagi o‘zgarishni qabul qilish
  reloadFromStorage() {
    const raw = loadRaw();
    if (!raw) return;
    data = migrate(raw);
    dirty = false;
    emit({ label: 'Boshqa oynadan yangilandi', external: true });
  },

  clearEverything() {
    removeAll();
    data = emptyData();
    undoStack = [];
    redoStack = [];
    dirty = false;
    emit({ label: 'Tozalandi' });
  },

  // --- Backup eslatmasi ---
  markBackup() {
    data.meta.lastBackupAt = nowIso();
    data.meta.changesSinceBackup = 0;
    writeJSON(KEYS.meta, data.meta);
    emit({ label: 'Backup', silent: true });
  },
  backupDue() {
    const days = Number(data.settings?.backupReminderDays ?? 7);
    if (!days || !data.meta?.initialized) return null;
    const changes = data.meta.changesSinceBackup || 0;
    if (!changes) return null;
    const last = data.meta.lastBackupAt ? new Date(data.meta.lastBackupAt) : null;
    if (!last) return changes >= 20 ? { age: null, changes } : null; // hali backup yo‘q — 20 ta o‘zgarishdan keyin
    const age = (Date.now() - last) / 86400000;
    if (age >= days || changes >= 100) return { age: Math.floor(age), changes };
    return null;
  },

  // --- Tajriba (sandbox) rejimi: "agar … bo‘lsa?" ---
  get inSandbox() { return !!data.meta?.sandbox; },
  startSandbox() {
    if (data.meta.sandbox) return;
    const r = writeJSON(SANDBOX_KEY, JSON.parse(JSON.stringify(data)));
    if (!r.ok) throw new Error('Tajriba rejimi uchun xotira yetarli emas.');
    this.update('Tajriba rejimi boshlandi', (d) => { d.meta.sandbox = { startedAt: nowIso() }; }, { reconcile: false });
  },
  applySandbox() {
    writeJSON(SANDBOX_KEY, null);
    this.update('Tajriba natijasi qabul qilindi', (d) => { delete d.meta.sandbox; }, { reconcile: false });
  },
  discardSandbox() {
    const snap = readJSON(SANDBOX_KEY, null);
    if (!snap) { this.update('Tajriba rejimi yopildi', (d) => { delete d.meta.sandbox; }); return; }
    delete snap.meta.sandbox;
    this.update('Tajriba bekor qilindi — asl holat tiklandi', (d) => {
      for (const k of Object.keys(d)) delete d[k];
      Object.assign(d, migrate(snap));
    }, { forceSave: true, reconcile: false });
    writeJSON(SANDBOX_KEY, null);
  },

  // Generatsiyadan oldingi holatlar (oxirgi 5 ta)
  snapshots() { return readJSON(SNAPSHOTS_KEY, []) || []; },
  pushSnapshot(label) {
    const list = this.snapshots();
    list.unshift({ label, at: nowIso(), schedule: data.schedule });
    let l = list.slice(0, 5);
    while (l.length && !writeJSON(SNAPSHOTS_KEY, l).ok) l = l.slice(0, -1);
  },
  restoreSnapshot(i) {
    const s = this.snapshots()[i];
    if (!s) return false;
    this.update('Oldingi jadval versiyasi tiklandi', (d) => { d.schedule = s.schedule; });
    return true;
  },
};
