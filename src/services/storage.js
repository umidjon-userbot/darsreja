// localStorage bilan ishlash. Barcha o‘qish/yozish try/catch ichida.
export const KEYS = {
  meta: 'smartSchedule_meta',
  groups: 'smartSchedule_groups',
  teachers: 'smartSchedule_teachers',
  subjects: 'smartSchedule_subjects',
  workloads: 'smartSchedule_workloads',
  rooms: 'smartSchedule_rooms',
  timeslots: 'smartSchedule_timeslots',
  calendar: 'smartSchedule_calendar',
  schedule: 'smartSchedule_schedule',
  substitutions: 'smartSchedule_substitutions',
  transfers: 'smartSchedule_transfers',
  conflictLog: 'smartSchedule_conflictLog',
  settings: 'smartSchedule_settings',
  lessonLog: 'smartSchedule_lessonLog',
  versions: 'smartSchedule_versions',
  events: 'smartSchedule_events',
  exams: 'smartSchedule_exams',
};
export const HISTORY_KEY = 'smartSchedule_history';
export const SNAPSHOTS_KEY = 'smartSchedule_snapshots';
export const UI_KEY = 'smartSchedule_ui';
export const SANDBOX_KEY = 'smartSchedule_sandbox';

let memoryFallback = null; // localStorage ishlamasa (private rejim) — xotirada
function ls() {
  try {
    const s = window.localStorage;
    const k = '__ss_test__';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    if (!memoryFallback) {
      const m = new Map();
      memoryFallback = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i], get length() { return m.size; } };
    }
    return memoryFallback;
  }
}

export function storageAvailable() {
  try {
    const s = window.localStorage;
    s.setItem('__t', '1');
    s.removeItem('__t');
    return true;
  } catch {
    return false;
  }
}

export function readJSON(key, fallback = null) {
  try {
    const v = ls().getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    ls().setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (e) {
    const quota = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
    return { ok: false, quota, error: e };
  }
}

export function loadRaw() {
  const meta = readJSON(KEYS.meta);
  if (!meta) return null;
  const d = {};
  for (const [k, key] of Object.entries(KEYS)) d[k] = readJSON(key);
  return d;
}

export function saveData(data) {
  for (const [k, key] of Object.entries(KEYS)) {
    const r = writeJSON(key, data[k]);
    if (!r.ok) return r;
  }
  return { ok: true };
}

export function removeAll() {
  try {
    const s = ls();
    for (const key of [...Object.values(KEYS), HISTORY_KEY, SNAPSHOTS_KEY, SANDBOX_KEY]) s.removeItem(key);
  } catch { /* ignore */ }
}

export function storageUsage() {
  let bytes = 0;
  try {
    const s = ls();
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith('smartSchedule_')) bytes += (k.length + (s.getItem(k) || '').length) * 2;
    }
  } catch { /* ignore */ }
  return bytes;
}
