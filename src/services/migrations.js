// Sxema versiyalari va migratsiya. v1 (fan = guruh + o‘qituvchi) → v3 (Fan + O‘quv yuklamasi)
import { SCHEMA_VERSION, emptyData, defaultSettings, defaultCalendar, DEFAULT_WEIGHTS, defaultTimeslots, defaultExams } from '../data/defaults.js';
import { uid, nowIso } from '../utils/id.js';

export function migrate(input) {
  if (!input || typeof input !== 'object') throw new Error('Ma\'lumot formati noto‘g‘ri.');
  const base = emptyData();
  const d = { ...base, ...input };
  d.meta = { ...base.meta, ...(input.meta || {}) };
  const from = Number(d.meta.schemaVersion || input.schemaVersion || 1);
  for (const k of ['groups', 'teachers', 'subjects', 'workloads', 'rooms', 'substitutions', 'transfers', 'versions', 'events']) {
    if (!Array.isArray(d[k])) d[k] = [];
  }
  if (!Array.isArray(d.timeslots) || !d.timeslots.length) d.timeslots = defaultTimeslots();
  if (Array.isArray(d.schedule)) d.schedule = { lessons: d.schedule, lastRun: null };
  if (!d.schedule || typeof d.schedule !== 'object') d.schedule = { lessons: [], lastRun: null };
  if (!Array.isArray(d.schedule.lessons)) d.schedule.lessons = [];
  d.calendar = { ...defaultCalendar(), ...(d.calendar || {}) };
  d.settings = { ...defaultSettings(), ...(d.settings || {}) };
  d.settings.weights = { ...DEFAULT_WEIGHTS, ...(d.settings.weights || {}) };
  d.settings.substitution = { ...defaultSettings().substitution, ...(d.settings.substitution || {}) };
  if (!d.conflictLog || typeof d.conflictLog !== 'object') d.conflictLog = { resolved: [], lastKeys: [] };
  if (!d.lessonLog || typeof d.lessonLog !== 'object') d.lessonLog = {};
  d.exams = { ...defaultExams(), ...(d.exams || {}) };
  d.exams.session = { ...defaultExams().session, ...(d.exams.session || {}) };

  // v1: fanlarda guruh/o‘qituvchi/soat bo‘lgan → yuklamaga ajratamiz
  if (from < 2) {
    const catalog = new Map();
    for (const s of d.subjects) {
      if (s.groupId || s.teacherId || s.weeklyLessons) {
        const key = (s.name || '') + '|' + (s.roomType || 'regular');
        let cat = catalog.get(key);
        if (!cat) {
          cat = { id: uid('sub'), name: s.name, code: s.code || '', icon: s.icon || '📘', roomType: s.roomType || 'regular', required: s.required !== false, active: true, createdAt: nowIso(), updatedAt: nowIso() };
          catalog.set(key, cat);
        }
        d.workloads.push({
          id: s.id, subjectId: cat.id, teacherId: s.teacherId,
          target: { type: 'group', groupIds: s.groupId ? [s.groupId] : [], subgroupId: null },
          lessonsPerWeek: Number(s.weeklyLessons) || 0, biweeklyLessons: 0, durationSlots: Number(s.durationSlots || s.duration) || 1,
          distribution: 'spread', customDistribution: null, roomType: null, fixedRoomId: null,
          preference: { days: [], slots: [], priority: 'medium' }, active: s.active !== false, createdAt: nowIso(), updatedAt: nowIso(),
        });
      }
    }
    if (catalog.size) d.subjects = [...catalog.values()];
    // v1 darslari: subjectId → workloadId
    for (const l of d.schedule.lessons) if (!l.workloadId && l.subjectId) l.workloadId = l.subjectId;
  }
  // Maydonlarni to‘ldirish
  for (const g of d.groups) { g.subgroups = g.subgroups || []; if (g.active === undefined) g.active = true; }
  for (const t of d.teachers) { t.absences = t.absences || []; t.subjectIds = t.subjectIds || []; t.availability = t.availability || {}; if (t.active === undefined) t.active = true; }
  for (const r of d.rooms) { r.availability = r.availability || {}; if (r.active === undefined) r.active = true; }
  for (const l of d.schedule.lessons) { l.weekParity = l.weekParity || 'all'; l.source = l.source || 'manual'; }
  d.meta.schemaVersion = SCHEMA_VERSION;
  d.meta.initialized = true;
  return d;
}

// Import qilinadigan JSON'ning asosiy tekshiruvi
export function validateImport(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return ['Fayl JSON obyekt emas.'];
  const has = ['groups', 'teachers', 'subjects', 'rooms'].some((k) => Array.isArray(obj[k]));
  if (!has) errors.push('Faylda guruhlar, o‘qituvchilar, fanlar yoki auditoriyalar topilmadi — bu Smart Schedule Builder fayli emas.');
  for (const k of ['groups', 'teachers', 'subjects', 'workloads', 'rooms', 'timeslots']) {
    if (obj[k] !== undefined && !Array.isArray(obj[k])) errors.push(`"${k}" massiv bo‘lishi kerak.`);
    for (const [i, x] of (Array.isArray(obj[k]) ? obj[k] : []).entries()) {
      if (!x || typeof x !== 'object' || !x.id) { errors.push(`"${k}" ichidagi ${i + 1}-element ID'siz.`); break; }
    }
  }
  const v = Number(obj.schemaVersion || obj.meta?.schemaVersion || 1);
  if (v > SCHEMA_VERSION) errors.push(`Fayl yangiroq versiyada (${v}). Ilovani yangilang.`);
  return errors;
}
