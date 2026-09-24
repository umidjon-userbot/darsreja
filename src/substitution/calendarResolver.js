// Aniq sanadagi holat = haftalik shablon + toq/juft hafta + bayramlar + o‘tkazishlar + almashtirishlar
import { diffDays, mondayOf, dayKeyOf, todayStr } from '../utils/date.js';
import { buildContext, wlDuration, wlGroupIds } from '../scheduler/model.js';
import { lessonsForDate } from '../analysis/versions.js';

export function weekIndex(cal, date) {
  return Math.floor(diffDays(mondayOf(cal.startDate), mondayOf(date)) / 7);
}

export function weekParity(cal, date) {
  const n = weekIndex(cal, date);
  const first = cal.firstWeekParity || 'odd';
  if (Math.abs(n) % 2 === 0) return first;
  return first === 'odd' ? 'even' : 'odd';
}

export function holidayOn(cal, date) {
  return (cal.holidays || []).find((h) => h.date === date) || null;
}

export function inSemester(cal, date) {
  return (!cal.startDate || date >= cal.startDate) && (!cal.endDate || date <= cal.endDate);
}

export function substitutionStatus(s, today = todayStr()) {
  if (s.cancelled) return 'cancelled';
  if (today < s.startDate) return 'planned';
  if (today > s.endDate) return 'finished';
  return 'active';
}

// O‘tkazishlar tarixini hisobga olib, sanadagi (arxiv) o‘qituvchi
export function teacherAt(data, wl, date) {
  let tid = wl.teacherId;
  const trs = (data.transfers || []).filter((t) => t.workloadId === wl.id).sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1));
  for (const tr of trs) if (date < tr.effectiveDate) tid = tr.fromTeacherId;
  return tid;
}

export function absenceOn(teacher, date) {
  return (teacher?.absences || []).find((a) => date >= a.startDate && date <= a.endDate) || null;
}

/**
 * Sanadagi barcha dars "hodisalari".
 * @returns {{ holiday, outside, parity, items: Occurrence[] }}
 * Occurrence = { date, lesson, wl, day, slotId, roomId, slotIds, teacherId, originalTeacherId, status: 'normal'|'substituted'|'moved'|'cancelled', substitution }
 */
export function occurrencesOn(data, date, ctx = buildContext(data)) {
  const cal = data.calendar || {};
  const day = dayKeyOf(date);
  const res = { date, day, holiday: holidayOn(cal, date), outside: !inSemester(cal, date), parity: weekParity(cal, date), items: [] };
  if (res.holiday || res.outside || !ctx.workDays.includes(day)) return res;
  const subs = (data.substitutions || []).filter((s) => !s.cancelled && date >= s.startDate && date <= s.endDate);
  for (const lesson of lessonsForDate(data, date)) {
    if (lesson.day !== day) continue;
    if (lesson.weekParity && lesson.weekParity !== 'all' && lesson.weekParity !== res.parity) continue;
    const wl = ctx.workloads.get(lesson.workloadId);
    if (!wl) continue;
    const base = teacherAt(data, wl, date);
    const o = {
      date, lesson, wl, day, slotId: lesson.slotId, roomId: lesson.roomId,
      teacherId: base, originalTeacherId: base, status: 'normal', substitution: null, occurrence: null,
    };
    const sub = subs.find((s) => s.workloadIds.includes(wl.id) && s.originalTeacherId === base);
    if (sub) {
      const entry = (sub.occurrences || []).find((x) => x.date === date && x.lessonId === lesson.id);
      o.substitution = sub;
      o.occurrence = entry || null;
      const action = entry?.action || 'substitute';
      if (action === 'cancel') o.status = 'cancelled';
      else {
        o.teacherId = sub.substituteTeacherId;
        o.status = action === 'move' ? 'moved' : 'substituted';
        if (action === 'move') {
          o.slotId = entry.newSlotId || o.slotId;
          o.roomId = entry.newRoomId || o.roomId;
        }
      }
    }
    o.slotIds = spanSlots(ctx, o.slotId, wl);
    res.items.push(o);
  }
  // Tadbirlar (majlis, imtihon, bayram tadbiri…): ta'sirlangan darslar bekor qilinadi yoki konflikt sifatida belgilanadi
  res.events = eventsOn(data, date, day);
  for (const ev of res.events) {
    const evSlots = new Set(ev.slotIds || []);
    for (const o of res.items) {
      if (o.status === 'cancelled' || !o.slotIds.some((x) => evSlots.has(x))) continue;
      const hit = (ev.teacherIds || []).includes(o.teacherId) || (ev.roomIds || []).includes(o.roomId) || wlGroupIds(o.wl).some((g) => (ev.groupIds || []).includes(g));
      if (!hit) continue;
      if (ev.cancelAffected) { o.status = 'cancelled'; o.event = ev; }
      else o.eventConflict = ev;
    }
  }
  res.items.sort((a, b) => (ctx.slotIdx.get(a.slotId) ?? 0) - (ctx.slotIdx.get(b.slotId) ?? 0));
  return res;
}

export function eventsOn(data, date, day = dayKeyOf(date)) {
  return (data.events || []).filter((e) => (e.repeat === 'weekly'
    ? e.day === day && (!e.startDate || date >= e.startDate) && (!e.endDate || date <= e.endDate)
    : e.date === date));
}

export function spanSlots(ctx, slotId, wl) {
  const i = ctx.slotIdx.get(slotId);
  if (i === undefined) return [];
  const out = [];
  for (let k = 0; k < wlDuration(wl); k++) if (ctx.slots[i + k]) out.push(ctx.slots[i + k].id);
  return out;
}

export function lessonLogKey(date, lessonId) {
  return date + '|' + lessonId;
}
