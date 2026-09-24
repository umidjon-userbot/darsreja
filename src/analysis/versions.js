// Jadval versiyalari: e'lon qilish, sanadan kuchga kirish, taqqoslash (diff), o‘zgarishlar ro‘yxati.
//
// Qoidalar:
//  - data.schedule.lessons — ishchi (qoralama) jadval. Tahrir va generator shu yerda ishlaydi.
//  - data.versions — e'lon qilingan versiyalar: { id, name, effectiveFrom, publishedAt, note, lessons }.
//  - Aniq sanadagi darslar (bugungi darslar, almashtirish, soat hisobi, .ics) — o‘sha sanada kuchda bo‘lgan
//    versiyadan olinadi. Versiya hali yo‘q bo‘lsa — ishchi jadvaldan.
//  - Shunday qilib, semestr o‘rtasida jadval qayta tuzilsa ham o‘tgan haftalar tarixi buzilmaydi.
import { buildContext, dayName, slotName, wlLabel, wlGroupIds } from '../scheduler/model.js';
import { uid, nowIso } from '../utils/id.js';

const KEYS = ['id', 'workloadId', 'day', 'slotId', 'roomId', 'weekParity', 'locked'];

export function normLesson(l) {
  const o = {};
  for (const k of KEYS) o[k] = l[k] ?? (k === 'weekParity' ? 'all' : k === 'locked' ? false : null);
  return o;
}

export function sortedVersions(data) {
  return [...(data.versions || [])].sort((a, b) => (a.effectiveFrom === b.effectiveFrom ? (a.publishedAt < b.publishedAt ? -1 : 1) : a.effectiveFrom < b.effectiveFrom ? -1 : 1));
}

export function latestVersion(data) {
  const v = sortedVersions(data);
  return v[v.length - 1] || null;
}

// Sanada kuchda bo‘lgan versiya (undan oldingi sanalar uchun — eng birinchisi)
export function versionForDate(data, date) {
  const v = sortedVersions(data);
  if (!v.length) return null;
  let cur = v[0];
  for (const x of v) if (x.effectiveFrom <= date) cur = x;
  return cur;
}

export function lessonsForDate(data, date) {
  const v = versionForDate(data, date);
  return v ? v.lessons : data.schedule?.lessons || [];
}

// Hozir kuchda bo‘lgan (e'lon qilingan) jadval — .ics, ommaviy sahifalar uchun
export function publishedLessons(data, date = new Date().toISOString().slice(0, 10)) {
  return lessonsForDate(data, date);
}

/**
 * Ikki dars to‘plami orasidagi farq.
 * @returns [{ type: 'added'|'removed'|'moved', wlId, before, after }]
 */
export function diffLessons(A, B) {
  const a = new Map(A.map((l) => [l.id, normLesson(l)]));
  const b = new Map(B.map((l) => [l.id, normLesson(l)]));
  const same = (x, y) => x.day === y.day && x.slotId === y.slotId && x.roomId === y.roomId && x.weekParity === y.weekParity;
  const out = [];
  const removed = [], added = [];
  for (const [id, x] of a) {
    const y = b.get(id);
    if (!y) removed.push(x);
    else if (!same(x, y) || x.workloadId !== y.workloadId) out.push({ type: 'moved', wlId: y.workloadId, before: x, after: y });
  }
  for (const [id, y] of b) if (!a.has(id)) added.push(y);
  // Qayta generatsiyada ID o‘zgaradi — bir xil yuklamaning olib tashlangan/qo‘shilgan darslarini juftlaymiz
  const unmatchedAdded = [...added];
  for (const x of removed) {
    let i = unmatchedAdded.findIndex((y) => y.workloadId === x.workloadId && same(x, y));
    if (i >= 0) { unmatchedAdded.splice(i, 1); continue; } // aslida o‘zgarmagan
    i = unmatchedAdded.findIndex((y) => y.workloadId === x.workloadId && y.weekParity === x.weekParity);
    if (i >= 0) {
      const y = unmatchedAdded.splice(i, 1)[0];
      out.push({ type: 'moved', wlId: x.workloadId, before: x, after: y });
    } else out.push({ type: 'removed', wlId: x.workloadId, before: x, after: null });
  }
  for (const y of unmatchedAdded) out.push({ type: 'added', wlId: y.workloadId, before: null, after: y });
  return out;
}

export function draftDiff(data) {
  const v = latestVersion(data);
  if (!v) return null;
  return diffLessons(v.lessons, data.schedule.lessons);
}

export function publishVersion(data, { name, effectiveFrom, note = '' }) {
  data.versions = data.versions || [];
  const v = {
    id: uid('ver'),
    name: name || `Versiya ${data.versions.length + 1}`,
    effectiveFrom, publishedAt: nowIso(), note,
    lessons: data.schedule.lessons.map(normLesson),
  };
  data.versions.push(v);
  return v;
}

// Kishi o‘qiy oladigan o‘zgarishlar ro‘yxati (o‘qituvchi yoki guruh bo‘yicha)
export function describeChanges(data, changes, filter = null) {
  const ctx = buildContext(data);
  const where = (l) => `${dayName(l.day)}, ${slotName(ctx, l.slotId)}, ${ctx.rooms.get(l.roomId)?.number || '?'}-xona${l.weekParity && l.weekParity !== 'all' ? (l.weekParity === 'odd' ? ' (toq)' : ' (juft)') : ''}`;
  const rows = [];
  for (const ch of changes) {
    const wl = ctx.workloads.get(ch.wlId);
    if (!wl) continue;
    if (filter?.teacherId && wl.teacherId !== filter.teacherId) continue;
    if (filter?.groupId && !wlGroupIds(wl).includes(filter.groupId)) continue;
    if (filter?.roomId && ch.before?.roomId !== filter.roomId && ch.after?.roomId !== filter.roomId) continue;
    const label = wlLabel(ctx, wl);
    const teacher = ctx.teachers.get(wl.teacherId)?.name || '';
    let text;
    if (ch.type === 'added') text = `➕ ${label} — yangi: ${where(ch.after)}`;
    else if (ch.type === 'removed') text = `➖ ${label} — olib tashlandi: ${where(ch.before)}`;
    else text = `↔️ ${label}: ${where(ch.before)} → ${where(ch.after)}`;
    rows.push({ ...ch, label, teacher, text, sortKey: (ch.after || ch.before).day });
  }
  const order = ctx.workDays;
  rows.sort((x, y) => order.indexOf(x.sortKey) - order.indexOf(y.sortKey));
  return rows;
}

// Har bir o‘qituvchi/guruh uchun tayyor matn (Telegram/chop etish uchun)
export function changeSheets(data, changes, kind = 'teacher') {
  const ctx = buildContext(data);
  const list = kind === 'teacher' ? [...ctx.teachers.values()] : [...ctx.groups.values()];
  const out = [];
  for (const x of list) {
    const rows = describeChanges(data, changes, kind === 'teacher' ? { teacherId: x.id } : { groupId: x.id });
    if (rows.length) out.push({ id: x.id, name: x.name, rows });
  }
  return out;
}
