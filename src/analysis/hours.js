// Semestr bo‘yicha soat hisobi: rejada / o‘tildi / boshqalar o‘rniga / uning o‘rniga / bekor / qoplanishi kerak
import { buildContext, wlLabel } from '../scheduler/model.js';
import { occurrencesOn, lessonLogKey } from '../substitution/calendarResolver.js';
import { dateRange, todayStr } from '../utils/date.js';

const blank = () => ({ planned: 0, conducted: 0, forOthers: 0, byOthers: 0, cancelled: 0, missed: 0, makeupPending: 0 });

export function computeHours(data, { startDate, endDate, today = todayStr() } = {}) {
  const ctx = buildContext(data);
  const cal = data.calendar || {};
  const start = startDate || cal.startDate;
  const end = endDate || cal.endDate;
  const factor = Number(data.settings?.academicHoursPerSlot) || 1;
  const pastDone = data.settings?.unmarkedPastIsDone !== false;
  const log = data.lessonLog || {};
  const T = new Map(), W = new Map();
  const get = (m, k) => { if (!m.has(k)) m.set(k, blank()); return m.get(k); };
  const pending = [];

  for (const date of dateRange(start, end)) {
    const res = occurrencesOn(data, date, ctx);
    for (const o of res.items) {
      const h = o.slotIds.length * factor;
      const orig = get(T, o.originalTeacherId);
      const eff = get(T, o.teacherId);
      const w = get(W, o.wl.id);
      orig.planned += h;
      w.planned += h;
      const entry = log[lessonLogKey(date, o.lesson.id)];
      if (o.status === 'cancelled') {
        orig.cancelled += h;
        w.cancelled += h;
        if (entry?.status === 'madeup') { orig.conducted += h; w.conducted += h; }
        else if (o.occurrence?.makeupRequired !== false) { orig.makeupPending += h; w.makeupPending += h; pending.push({ o, h }); }
        continue;
      }
      let done;
      if (entry?.status === 'missed') done = false;
      else if (entry?.status === 'done' || entry?.status === 'madeup') done = true;
      else done = date < today ? pastDone : false;
      if (entry?.status === 'missed') {
        const who = get(T, o.teacherId);
        who.missed += h;
        w.missed = (w.missed || 0) + h;
        who.makeupPending += h;
        w.makeupPending += h;
        pending.push({ o, h });
        continue;
      }
      if (!done) continue;
      eff.conducted += h;
      w.conducted += h;
      if (o.teacherId !== o.originalTeacherId) {
        eff.forOthers += h;
        orig.byOthers += h;
      }
    }
  }
  const teachers = [...T.entries()].map(([id, v]) => ({ id, name: ctx.teachers.get(id)?.name || '?', ...v })).sort((a, b) => a.name.localeCompare(b.name));
  const workloads = [...W.entries()].map(([id, v]) => {
    const wl = ctx.workloads.get(id);
    return { id, name: wl ? wlLabel(ctx, wl) : '?', teacher: ctx.teachers.get(wl?.teacherId)?.name || '', ...v };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { teachers, workloads, pending, factor, start, end };
}
