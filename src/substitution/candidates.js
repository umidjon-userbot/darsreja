// Almashtiruvchi nomzodlarni topish va reytinglash
import { buildContext, wlDuration, isAvail, groupAvail, wlUnits, unitsOverlap } from '../scheduler/model.js';
import { Occupancy, checkPlacement } from '../scheduler/constraintChecker.js';
import { candidateRooms } from '../scheduler/slotGenerator.js';
import { occurrencesOn, absenceOn, spanSlots, teacherAt, eventsOn } from './calendarResolver.js';
import { dateRange, fmtHuman } from '../utils/date.js';
import { DAYS, ABSENCE_REASONS } from '../i18n/uz.js';

export function makeDayCache(data, ctx) {
  const cache = new Map();
  return (date) => {
    if (!cache.has(date)) cache.set(date, occurrencesOn(data, date, ctx));
    return cache.get(date);
  };
}

// O‘qituvchining sana oralig‘idagi, hali almashtirilmagan darslari
export function teacherOccurrences(data, { wlIds, teacherId, startDate, endDate }, ctx = buildContext(data), dayOf = makeDayCache(data, ctx)) {
  const out = [];
  for (const date of dateRange(startDate, endDate)) {
    for (const o of dayOf(date).items) {
      if (o.originalTeacherId !== teacherId) continue;
      if (wlIds && !wlIds.includes(o.wl.id)) continue;
      if (o.substitution) continue;
      out.push(o);
    }
  }
  return out;
}

const overlap = (a, b) => a.some((x) => b.includes(x));

// T o‘qituvchi o.date kuni slots vaqtida dars bera oladimi?
export function teacherFreeAt(data, ctx, T, o, slots, dayOf, assigned = [], opts = {}) {
  const day = o.day;
  for (const s of slots) if (!isAvail(T.availability, day, s)) return { ok: false, reason: `${DAYS[day]}, ${ctx.slots[ctx.slotIdx.get(s)]?.name} — mavjud emas` };
  for (const s of slots) {
    const wb = ctx.weeklyBlocks?.get(`t|${T.id}|${day}|${s}`);
    if (wb) return { ok: false, reason: `${fmtHuman(o.date)} — tadbirda (${wb})` };
  }
  const ev = eventsOn(data, o.date, day).find((e) => (e.teacherIds || []).includes(T.id) && (e.slotIds || []).some((x) => slots.includes(x)));
  if (ev) return { ok: false, reason: `${fmtHuman(o.date)} — tadbirda (${ev.title})` };
  const ab = absenceOn(T, o.date);
  if (ab) return { ok: false, reason: `${fmtHuman(o.date)} — yo‘q (${ABSENCE_REASONS[ab.reason] || 'yo‘qlik'})` };
  const busy = dayOf(o.date).items.filter((x) => x.teacherId === T.id && x.status !== 'cancelled' && x.lesson.id !== o.lesson.id);
  const extra = assigned.filter((x) => x.date === o.date);
  for (const x of [...busy, ...extra]) {
    if (overlap(x.slotIds, slots)) {
      return { ok: false, reason: `${fmtHuman(o.date)}, ${ctx.slots[ctx.slotIdx.get(slots[0])]?.name} — band (${ctx.subjects.get(x.wl.subjectId)?.name || 'dars'})` };
    }
  }
  if (!opts.allowOverLimit) {
    const load = [...busy, ...extra].reduce((a, x) => a + x.slotIds.length, 0);
    if (load + slots.length > (Number(T.maxClassesPerDay) || 99)) return { ok: false, reason: `${fmtHuman(o.date)} — kunlik limit (${T.maxClassesPerDay})` };
  }
  return { ok: true };
}

export function evaluateTemporary(data, ctx, T, occs, dayOf, opts = {}) {
  const assigned = [];
  const fits = [], misses = [];
  for (const o of occs) {
    const r = teacherFreeAt(data, ctx, T, o, o.slotIds, dayOf, assigned, opts);
    if (r.ok) {
      fits.push(o);
      assigned.push({ ...o, teacherId: T.id });
    } else misses.push({ o, reason: r.reason });
  }
  return { fits, misses, assigned };
}

export function rankTemporaryCandidates(data, { wlIds, originalTeacherId, startDate, endDate, includeUnqualified = false, allowOverLimit = false }) {
  const ctx = buildContext(data);
  const dayOf = makeDayCache(data, ctx);
  const occs = teacherOccurrences(data, { wlIds, teacherId: originalTeacherId, startDate, endDate }, ctx, dayOf);
  const needed = new Set(wlIds.map((id) => ctx.workloads.get(id)?.subjectId).filter(Boolean));
  const occ = new Occupancy(ctx, data.schedule?.lessons || []);
  const orig = ctx.teachers.get(originalTeacherId);
  const candidates = [];
  for (const T of ctx.teachers.values()) {
    if (T.active === false || T.id === originalTeacherId) continue;
    const qualified = [...needed].every((s) => (T.subjectIds || []).includes(s));
    if (!qualified && !includeUnqualified) continue;
    const ev = evaluateTemporary(data, ctx, T, occs, dayOf, { allowOverLimit });
    const loadUnits = occ.teacherWeekUnits(T.id);
    const maxW = Number(T.maxWeeklyClasses) || 0;
    const pref = ev.fits.filter((o) => T.preferredSlots?.includes(o.slotId)).length;
    const sameBuilding = orig && orig.building && orig.building === T.building ? 1 : 0;
    const loadPct = maxW ? loadUnits / maxW : 0;
    const score = ev.fits.length * 1000 + (qualified ? 500 : 0) - loadPct * 100 + pref * 5 + sameBuilding * 10;
    candidates.push({ teacher: T, qualified, fits: ev.fits, misses: ev.misses, total: occs.length, loadUnits, maxWeekly: maxW, loadPct, pref, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  return { occs, candidates, ctx, dayOf };
}

// Doimiy o‘tkazish simulyatsiyasi: yangi o‘qituvchi mavjud slotlarda dars bera oladimi?
export function simulateTransfer(data, wlIds, toTeacherId) {
  const ids = new Set(wlIds);
  const d2 = { ...data, workloads: data.workloads.map((w) => (ids.has(w.id) ? { ...w, teacherId: toTeacherId } : w)) };
  const ctx = buildContext(d2);
  const lessons = data.schedule?.lessons || [];
  const occ = new Occupancy(ctx, lessons.filter((l) => !ids.has(l.workloadId)));
  const fit = [], miss = [];
  for (const l of lessons.filter((x) => ids.has(x.workloadId))) {
    const wl = ctx.workloads.get(l.workloadId);
    const v = checkPlacement(ctx, occ, { wl, day: l.day, slotId: l.slotId, roomId: l.roomId, parity: l.weekParity || 'all' });
    if (!v.length) { occ.add(l); fit.push(l); }
    else miss.push({ lesson: l, reason: v[0].msg });
  }
  const T = ctx.teachers.get(toTeacherId);
  return { fit, miss, newLoad: occ.teacherWeekUnits(toTeacherId), maxWeekly: Number(T?.maxWeeklyClasses) || 0 };
}

export function rankPermanentCandidates(data, { wlIds, fromTeacherId, includeUnqualified = false }) {
  const ctx = buildContext(data);
  const needed = new Set(wlIds.map((id) => ctx.workloads.get(id)?.subjectId).filter(Boolean));
  const occ = new Occupancy(ctx, data.schedule?.lessons || []);
  const out = [];
  for (const T of ctx.teachers.values()) {
    if (T.active === false || T.id === fromTeacherId) continue;
    const qualified = [...needed].every((s) => (T.subjectIds || []).includes(s));
    if (!qualified && !includeUnqualified) continue;
    const sim = simulateTransfer(data, wlIds, T.id);
    const loadUnits = occ.teacherWeekUnits(T.id);
    const maxW = Number(T.maxWeeklyClasses) || 0;
    const score = sim.fit.length * 1000 + (qualified ? 500 : 0) - (maxW ? (loadUnits / maxW) * 100 : 0);
    out.push({ teacher: T, qualified, fits: sim.fit, misses: sim.miss, total: sim.fit.length + sim.miss.length, loadUnits, newLoad: sim.newLoad, maxWeekly: maxW, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

// Almashtiruvchi band bo‘lgan dars uchun o‘sha kunning boshqa bo‘sh slotini topish
export function findMoveSlot(data, ctx, T, o, dayOf, assigned = []) {
  const wl = o.wl;
  const groups = [...new Set(wlUnits(wl).map((u) => u.g))].map((g) => ctx.groups.get(g)).filter(Boolean);
  const dayItems = dayOf(o.date).items.filter((x) => x.lesson.id !== o.lesson.id && x.status !== 'cancelled');
  const all = [...dayItems, ...assigned.filter((x) => x.date === o.date)];
  const rooms = candidateRooms(ctx, wl);
  for (const s of ctx.slots) {
    const span = spanSlots(ctx, s.id, wl);
    if (span.length < wlDuration(wl)) continue;
    if (span.slice(0, -1).some((id) => ctx.slots[ctx.slotIdx.get(id)].joinableWithNext === false)) continue;
    if (s.id === o.slotId) continue;
    if (!teacherFreeAt(data, ctx, T, o, span, dayOf, assigned).ok) continue;
    if (groups.some((g) => span.some((id) => !groupAvail(ctx, g, o.day, id)))) continue;
    const units = wlUnits(wl);
    if (all.some((x) => overlap(x.slotIds, span) && units.some((u) => wlUnits(x.wl).some((v) => unitsOverlap(u, v))))) continue;
    const room = rooms.find((r) => span.every((id) => isAvail(r.availability, o.day, id)) && !all.some((x) => x.roomId === r.id && overlap(x.slotIds, span)));
    if (room) return { slotId: s.id, roomId: room.id, slotIds: span };
  }
  return null;
}

export { teacherAt };
