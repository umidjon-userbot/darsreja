// Jadval ustidagi amallar. Har biri constraintChecker orqali tekshiriladi va Undo'ga yoziladi.
import { store } from './store.js';
import { buildContext, dayName, slotName } from '../scheduler/model.js';
import { Occupancy, checkPlacement } from '../scheduler/constraintChecker.js';
import { candidateRooms } from '../scheduler/slotGenerator.js';
import { teacherPenalty, groupPenalty, workloadPenalty, lessonPenalty } from '../scheduler/scoring.js';
import { explainRec } from '../scheduler/explainer.js';
import { uid } from '../utils/id.js';

export class ConstraintError extends Error {
  constructor(violations) {
    super(violations.map((v) => v.msg).join('\n'));
    this.violations = violations;
  }
}

function softItems(ctx, occ, wl, extraRec) {
  const items = [];
  teacherPenalty(ctx, occ, wl.teacherId, items);
  for (const g of wl.target?.groupIds || []) groupPenalty(ctx, occ, g, items);
  workloadPenalty(ctx, occ, wl.id, items);
  if (extraRec) lessonPenalty(ctx, extraRec, items);
  return items;
}

/**
 * Darsni joylashtirish mumkinmi? { hard: Violation[], soft: Item[], delta }
 * draft = { workloadId, day, slotId, roomId, weekParity }
 */
export function evaluatePlacement(data, draft, ignoreIds = []) {
  const ctx = buildContext(data);
  const ign = new Set(ignoreIds);
  const occ = new Occupancy(ctx, data.schedule.lessons.filter((l) => !ign.has(l.id)));
  const wl = ctx.workloads.get(draft.workloadId);
  if (!wl) return { hard: [{ code: 'ORPHAN', msg: 'O‘quv yuklamasi tanlanmagan.' }], soft: [], delta: 0 };
  const hard = checkPlacement(ctx, occ, { wl, day: draft.day, slotId: draft.slotId, roomId: draft.roomId, parity: draft.weekParity || 'all' });
  let soft = [], delta = 0;
  if (!hard.length) {
    const before = softItems(ctx, occ, wl);
    const rec = occ.add({ id: '__probe', ...draft, weekParity: draft.weekParity || 'all' });
    const after = softItems(ctx, occ, wl, rec);
    const bKeys = new Map(before.map((i) => [i.code + i.msg, i.penalty]));
    soft = after.filter((i) => !bKeys.has(i.code + i.msg));
    delta = after.reduce((a, i) => a + i.penalty, 0) - before.reduce((a, i) => a + i.penalty, 0);
  }
  return { hard, soft, delta };
}

// Xona ko‘rsatilmagan bo‘lsa — eng mos bo‘sh xonani topish
export function bestRoomFor(data, draft, ignoreIds = [], preferRoomId = null) {
  const ctx = buildContext(data);
  const ign = new Set(ignoreIds);
  const occ = new Occupancy(ctx, data.schedule.lessons.filter((l) => !ign.has(l.id)));
  const wl = ctx.workloads.get(draft.workloadId);
  if (!wl) return null;
  const rooms = candidateRooms(ctx, wl);
  if (preferRoomId) rooms.sort((a, b) => (a.id === preferRoomId ? -1 : b.id === preferRoomId ? 1 : 0));
  for (const r of rooms) {
    if (!checkPlacement(ctx, occ, { wl, day: draft.day, slotId: draft.slotId, roomId: r.id, parity: draft.weekParity || 'all' }, { first: true }).length) return r.id;
  }
  return null;
}

export function roomOptions(data, draft, ignoreIds = []) {
  const ctx = buildContext(data);
  const ign = new Set(ignoreIds);
  const occ = new Occupancy(ctx, data.schedule.lessons.filter((l) => !ign.has(l.id)));
  const wl = ctx.workloads.get(draft.workloadId);
  return [...ctx.rooms.values()].map((r) => {
    if (!wl || !draft.day || !draft.slotId) return { room: r, ok: true, reason: '' };
    const v = checkPlacement(ctx, occ, { wl, day: draft.day, slotId: draft.slotId, roomId: r.id, parity: draft.weekParity || 'all' }, { first: true });
    return { room: r, ok: !v.length, reason: v[0]?.msg || '' };
  }).sort((a, b) => (a.ok === b.ok ? a.room.capacity - b.room.capacity : a.ok ? -1 : 1));
}

export function addLesson(draft, { force = false } = {}) {
  const data = store.get();
  const ev = evaluatePlacement(data, draft);
  if (ev.hard.length && !force) throw new ConstraintError(ev.hard);
  const lesson = { id: uid('les'), workloadId: draft.workloadId, day: draft.day, slotId: draft.slotId, roomId: draft.roomId, weekParity: draft.weekParity || 'all', locked: !!draft.locked, source: 'manual', explanation: null };
  store.update('Dars qo‘shildi', (d) => { d.schedule.lessons.push(lesson); });
  return { lesson, soft: ev.soft };
}

export function updateLesson(id, patch) {
  const data = store.get();
  const l = data.schedule.lessons.find((x) => x.id === id);
  if (!l) throw new Error('Dars topilmadi.');
  const draft = { ...l, ...patch };
  const ev = evaluatePlacement(data, draft, [id]);
  if (ev.hard.length) throw new ConstraintError(ev.hard);
  store.update('Dars tahrirlandi', (d) => {
    const x = d.schedule.lessons.find((y) => y.id === id);
    Object.assign(x, patch, { source: x.source === 'generator' && (patch.day || patch.slotId || patch.roomId) ? 'manual' : x.source, explanation: null });
  });
  return ev;
}

export function moveLesson(id, day, slotId) {
  const data = store.get();
  const l = data.schedule.lessons.find((x) => x.id === id);
  if (!l) throw new Error('Dars topilmadi.');
  if (l.locked) throw new ConstraintError([{ code: 'H17', msg: 'Dars qulflangan — avval qulfni oching.' }]);
  if (l.day === day && l.slotId === slotId) return null;
  const draft = { ...l, day, slotId };
  let ev = evaluatePlacement(data, draft, [id]);
  if (ev.hard.length) {
    const roomId = bestRoomFor(data, draft, [id], l.roomId);
    if (roomId) {
      draft.roomId = roomId;
      ev = evaluatePlacement(data, draft, [id]);
    }
  }
  if (ev.hard.length) throw new ConstraintError(ev.hard);
  store.update(`Dars ko‘chirildi: ${dayName(day)}, ${slotName(buildContext(data), slotId)}`, (d) => {
    const x = d.schedule.lessons.find((y) => y.id === id);
    Object.assign(x, { day, slotId, roomId: draft.roomId, source: 'manual', explanation: null });
  });
  return { ...ev, roomChanged: draft.roomId !== l.roomId, roomId: draft.roomId };
}

// Drag paytida katak holati: ok / soft / bad (+ sabab)
export function previewMove(data, lesson, day, slotId, ctxOcc) {
  const { ctx, occ } = ctxOcc;
  const wl = ctx.workloads.get(lesson.workloadId);
  if (!wl) return { state: 'bad', msg: 'Yuklama topilmadi' };
  let v = checkPlacement(ctx, occ, { wl, day, slotId, roomId: lesson.roomId, parity: lesson.weekParity || 'all' }, { first: false });
  if (v.length && v.every((x) => ['H3', 'H6', 'H8', 'H9'].includes(x.code))) {
    const other = candidateRooms(ctx, wl).find((r) => !checkPlacement(ctx, occ, { wl, day, slotId, roomId: r.id, parity: lesson.weekParity || 'all' }, { first: true }).length);
    if (other) return { state: 'soft', msg: `Xona ${other.number}-ga almashadi` };
  }
  if (v.length) return { state: 'bad', msg: v[0].msg };
  const t = ctx.teachers.get(wl.teacherId);
  if ((t?.preferredDays?.length && !t.preferredDays.includes(day)) || (t?.preferredSlots?.length && !t.preferredSlots.includes(slotId))) return { state: 'soft', msg: 'Afzal vaqt emas' };
  return { state: 'ok', msg: 'Mumkin' };
}

export function swapLessons(idA, idB) {
  const data = store.get();
  const A = data.schedule.lessons.find((x) => x.id === idA);
  const B = data.schedule.lessons.find((x) => x.id === idB);
  if (!A || !B) throw new Error('Dars topilmadi.');
  if (A.locked || B.locked) throw new ConstraintError([{ code: 'H17', msg: 'Qulflangan darsni almashtirib bo‘lmaydi.' }]);
  const ctx = buildContext(data);
  const occ = new Occupancy(ctx, data.schedule.lessons.filter((l) => l.id !== idA && l.id !== idB));
  const wa = ctx.workloads.get(A.workloadId), wb = ctx.workloads.get(B.workloadId);
  const pa = { day: B.day, slotId: B.slotId, roomId: B.roomId, parity: A.weekParity };
  const pb = { day: A.day, slotId: A.slotId, roomId: A.roomId, parity: B.weekParity };
  // xonalarni saqlab ko‘rish, bo‘lmasa almashtirish
  const tryPair = (ra, rb) => {
    const va = checkPlacement(ctx, occ, { wl: wa, ...pa, roomId: ra });
    if (va.length) return { err: va.map((x) => ({ ...x, msg: 'A: ' + x.msg })) };
    const rec = occ.add({ id: '__a', workloadId: A.workloadId, day: pa.day, slotId: pa.slotId, roomId: ra, weekParity: A.weekParity });
    const vb = checkPlacement(ctx, occ, { wl: wb, ...pb, roomId: rb });
    occ.remove(rec.id);
    if (vb.length) return { err: vb.map((x) => ({ ...x, msg: 'B: ' + x.msg })) };
    return { ra, rb };
  };
  let r = tryPair(A.roomId, B.roomId);
  if (r.err) { const r2 = tryPair(B.roomId, A.roomId); if (!r2.err) r = r2; }
  if (r.err) throw new ConstraintError(r.err);
  store.update('Ikki dars almashtirildi (swap)', (d) => {
    const a = d.schedule.lessons.find((x) => x.id === idA), b = d.schedule.lessons.find((x) => x.id === idB);
    const [ad, as] = [a.day, a.slotId];
    Object.assign(a, { day: b.day, slotId: b.slotId, roomId: r.ra, source: 'manual', explanation: null });
    Object.assign(b, { day: ad, slotId: as, roomId: r.rb, source: 'manual', explanation: null });
  });
}

export function toggleLock(id) {
  let now;
  store.update('Qulf holati o‘zgardi', (d) => {
    const l = d.schedule.lessons.find((x) => x.id === id);
    l.locked = !l.locked;
    now = l.locked;
  });
  return now;
}

export function deleteLesson(id) {
  store.update('Dars o‘chirildi', (d) => { d.schedule.lessons = d.schedule.lessons.filter((x) => x.id !== id); });
}

export function explainLesson(data, id) {
  const l = data.schedule.lessons.find((x) => x.id === id);
  if (!l) return null;
  const ctx = buildContext(data);
  const occ = new Occupancy(ctx, data.schedule.lessons);
  const rec = occ.recs.get(id);
  if (!rec) return null;
  const live = explainRec(ctx, occ, rec);
  return { lesson: l, stored: l.explanation, live, ctx };
}
