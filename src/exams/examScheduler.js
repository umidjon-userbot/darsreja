// 📝 Imtihon sessiyasi jadvali.
// Qoidalar:
//  HARD: guruhda bir kunda bittadan ortiq imtihon yo‘q; xona bir vaqtda bitta imtihonga; imtihon oluvchi
//        bir vaqtda bitta imtihonda va yo‘qlikda emas; xona(lar) sig‘imi yetadi; bayram va dam olish kunlari yo‘q.
//  Yumshatiladigan: guruh imtihonlari orasida kamida N kun (avval to‘liq, keyin 1 kunga yumshatiladi);
//        imtihon oluvchining haftalik mavjud vaqti (avval hisobga olinadi, keyin yumshatiladi).
//  Nazoratchilar (proktorlar): imtihon oluvchidan boshqa, o‘sha vaqtda bo‘sh o‘qituvchilar — teng taqsimlanadi.
import { buildContext, wlGroupIds, wlStudents, roomTypeOk, isAvail, wlLabel } from '../scheduler/model.js';
import { absenceOn, holidayOn, eventsOn } from '../substitution/calendarResolver.js';
import { dateRange, dayKeyOf, diffDays } from '../utils/date.js';
import { uid } from '../utils/id.js';

export function sessionDates(data) {
  const s = data.exams?.session || {};
  const out = [];
  for (const d of dateRange(s.startDate, s.endDate)) {
    if (!(s.days || []).includes(dayKeyOf(d))) continue;
    if (holidayOn(data.calendar || {}, d)) continue;
    out.push(d);
  }
  return out;
}

export function examsFromWorkloads(data) {
  const ctx = buildContext(data);
  const items = [];
  const seen = new Set();
  for (const w of data.workloads) {
    if (w.active === false) continue;
    const subj = ctx.subjects.get(w.subjectId);
    if (!subj || subj.required === false) continue;
    if (w.target?.type === 'subgroup') continue; // kichik guruhlar — butun guruh imtihoni bilan
    const groups = wlGroupIds(w);
    const key = w.subjectId + '|' + [...groups].sort().join(',') + (w.target?.type === 'elective' ? '|' + w.id : '');
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: uid('exam'), subjectId: w.subjectId, groupIds: groups, examinerId: w.teacherId,
      durationSlots: data.exams?.session?.durationSlots || 2, roomType: 'regular',
      studentCount: w.target?.type === 'elective' ? Number(w.studentCount) || 0 : null, workloadId: w.id,
    });
  }
  return items;
}

export function examStudents(ctx, ex) {
  if (ex.studentCount) return Number(ex.studentCount);
  return ex.groupIds.reduce((a, g) => a + (Number(ctx.groups.get(g)?.studentCount) || 0), 0);
}

export function examLabel(ctx, ex) {
  return `${ctx.subjects.get(ex.subjectId)?.name || '?'} · ${ex.groupIds.map((g) => ctx.groups.get(g)?.name || '?').join(', ')}`;
}

function span(ctx, slotId, dur) {
  const i = ctx.slotIdx.get(slotId);
  if (i === undefined) return null;
  const out = [];
  for (let k = 0; k < dur; k++) {
    const s = ctx.slots[i + k];
    if (!s) return null;
    if (k < dur - 1 && s.joinableWithNext === false) return null;
    out.push(s.id);
  }
  return out;
}

const overlap = (a, b) => a.some((x) => b.includes(x));

class ExamState {
  constructor() { this.entries = []; }
  add(e) { this.entries.push(e); }
  remove(e) { this.entries = this.entries.filter((x) => x !== e); }
  on(date) { return this.entries.filter((x) => x.date === date); }
  groupDates(g) { return this.entries.filter((x) => x.groupIds.includes(g)).map((x) => x.date); }
}

// Bitta imtihonni ma'lum (sana, slot) ga qo‘yish mumkinmi; mumkin bo‘lsa — xonalar
export function tryPlace(data, ctx, st, ex, date, slotId, { minGap, strictAvail }) {
  const dur = Number(ex.durationSlots) || 2;
  const slots = span(ctx, slotId, dur);
  if (!slots) return { ok: false, why: 'slot' };
  const day = dayKeyOf(date);
  const same = st.on(date);
  // guruhlar
  for (const g of ex.groupIds) {
    if (same.some((x) => x.groupIds.includes(g))) return { ok: false, why: 'group' };
    for (const d2 of st.groupDates(g)) if (Math.abs(diffDays(d2, date)) < minGap) return { ok: false, why: 'gap' };
  }
  // imtihon oluvchi
  const T = ctx.teachers.get(ex.examinerId);
  if (T) {
    if (absenceOn(T, date)) return { ok: false, why: 'examiner' };
    if (same.some((x) => overlap(x.slotIds, slots) && (x.examinerId === T.id || (x.proctorIds || []).includes(T.id)))) return { ok: false, why: 'examiner' };
    if (strictAvail && slots.some((s) => !isAvail(T.availability, day, s))) return { ok: false, why: 'examinerAvail' };
  }
  const evs = eventsOn(data, date, day).filter((e) => overlap(e.slotIds || [], slots));
  if (T && evs.some((e) => (e.teacherIds || []).includes(T.id))) return { ok: false, why: 'examiner' };
  if (evs.some((e) => (e.groupIds || []).some((g) => ex.groupIds.includes(g)))) return { ok: false, why: 'group' };
  // xonalar
  const need = examStudents(ctx, ex);
  const busyRooms = new Set(same.filter((x) => overlap(x.slotIds, slots)).flatMap((x) => x.roomIds));
  for (const e of evs) for (const r of e.roomIds || []) busyRooms.add(r);
  const rooms = [...ctx.rooms.values()].filter((r) => r.active !== false && roomTypeOk(ex.roomType || 'regular', r) && !busyRooms.has(r.id) && slots.every((s) => isAvail(r.availability, day, s)));
  if (!rooms.length) return { ok: false, why: 'room' };
  const single = rooms.filter((r) => Number(r.capacity) >= need).sort((a, b) => a.capacity - b.capacity)[0];
  let chosen = single ? [single] : null;
  if (!chosen) {
    const big = [...rooms].sort((a, b) => b.capacity - a.capacity);
    chosen = [];
    let cap = 0;
    for (const r of big) { chosen.push(r); cap += Number(r.capacity); if (cap >= need || chosen.length >= 3) break; }
    if (cap < need) return { ok: false, why: 'capacity' };
  }
  return { ok: true, slots, roomIds: chosen.map((r) => r.id) };
}

export function scheduleExams(data, { keepFixed = true } = {}) {
  const ctx = buildContext(data);
  const ses = data.exams.session;
  const dates = sessionDates(data);
  const items = data.exams.items.filter((x) => x.subjectId && x.groupIds?.length);
  const st = new ExamState();
  const out = [];
  const unscheduled = [];
  // Qo‘lda qotirilganlar
  if (keepFixed) {
    for (const s of data.exams.schedule || []) {
      const ex = items.find((x) => x.id === s.examId);
      if (ex && s.fixed) { const e = { ...s, groupIds: ex.groupIds, examinerId: ex.examinerId }; st.add(e); out.push(e); }
    }
  }
  const todo = items.filter((x) => !out.some((o) => o.examId === x.id));
  // Eng cheklanganlar birinchi: ko‘p guruhli, katta, keyin kam variantli
  todo.sort((a, b) => b.groupIds.length - a.groupIds.length || examStudents(ctx, b) - examStudents(ctx, a));
  const passes = [
    { minGap: Math.max(1, Number(ses.minGapDays) || 1), strictAvail: true },
    { minGap: Math.max(1, Number(ses.minGapDays) || 1), strictAvail: false },
    { minGap: 1, strictAvail: false },
  ];
  for (const ex of todo) {
    let placed = null;
    const why = {};
    for (const pass of passes) {
      let best = null, bestScore = -Infinity;
      for (const date of dates) {
        for (const slotId of ses.slotIds || []) {
          const r = tryPlace(data, ctx, st, ex, date, slotId, pass);
          if (!r.ok) { why[r.why] = (why[r.why] || 0) + 1; continue; }
          // Ball: guruhlarning boshqa imtihonlaridan uzoqlik (ko‘proq dam) va kunlarning teng yuklanishi
          let minDist = 30;
          for (const g of ex.groupIds) for (const d2 of st.groupDates(g)) minDist = Math.min(minDist, Math.abs(diffDays(d2, date)));
          const load = st.on(date).length;
          const score = Math.min(minDist, 7) * 10 - load * 3 - dates.indexOf(date) * 0.05 - (ses.slotIds.indexOf(slotId) * 0.5);
          if (score > bestScore) { bestScore = score; best = { date, slotId, ...r }; }
        }
      }
      if (best) { placed = { ...best, relaxed: pass !== passes[0] }; break; }
    }
    if (!placed) {
      const main = Object.entries(why).sort((a, b) => b[1] - a[1])[0]?.[0];
      const REASON = { group: 'Guruhlarda imtihonsiz kun qolmadi', gap: 'Guruh imtihonlari orasida yetarli dam kuni yo‘q', examiner: 'Imtihon oluvchi band yoki yo‘q', examinerAvail: 'Imtihon oluvchi mavjud emas', room: 'Bo‘sh mos xona yo‘q', capacity: 'Xonalar sig‘imi yetmaydi', slot: 'Imtihon vaqti (slot) noto‘g‘ri' };
      unscheduled.push({ examId: ex.id, reason: REASON[main] || (dates.length ? 'Mos vaqt topilmadi' : 'Sessiya kunlari belgilanmagan') });
      continue;
    }
    const e = { examId: ex.id, date: placed.date, slotId: placed.slotId, slotIds: placed.slots, roomIds: placed.roomIds, proctorIds: [], groupIds: ex.groupIds, examinerId: ex.examinerId, relaxed: placed.relaxed };
    st.add(e);
    out.push(e);
  }
  assignProctors(data, ctx, st, out);
  out.sort((a, b) => (a.date + a.slotId < b.date + b.slotId ? -1 : 1));
  return { schedule: out.map(({ groupIds, examinerId, ...x }) => x), unscheduled, stats: { total: items.length, placed: out.length, relaxed: out.filter((x) => x.relaxed).length, days: dates.length } };
}

function assignProctors(data, ctx, st, list) {
  const per = Math.max(0, Number(data.exams.session.proctorsPerRoom) || 0);
  if (!per) return;
  const count = new Map();
  for (const e of list) for (const p of e.proctorIds || []) count.set(p, (count.get(p) || 0) + 1);
  for (const e of list) {
    if (e.fixed && e.proctorIds?.length) continue;
    const need = per * e.roomIds.length;
    const day = dayKeyOf(e.date);
    const busy = new Set(st.on(e.date).filter((x) => x !== e && overlap(x.slotIds, e.slotIds)).flatMap((x) => [x.examinerId, ...(x.proctorIds || [])]));
    const cands = [...ctx.teachers.values()].filter((t) => t.active !== false && t.id !== e.examinerId && !busy.has(t.id) && !absenceOn(t, e.date))
      .sort((a, b) => (count.get(a.id) || 0) - (count.get(b.id) || 0) || (e.slotIds.every((s) => isAvail(b.availability, day, s)) ? 1 : 0) - (e.slotIds.every((s) => isAvail(a.availability, day, s)) ? 1 : 0));
    e.proctorIds = cands.slice(0, need).map((t) => t.id);
    e.proctorShortage = Math.max(0, need - e.proctorIds.length);
    for (const p of e.proctorIds) count.set(p, (count.get(p) || 0) + 1);
  }
}

// Mavjud sessiya jadvalini tekshirish (qo‘lda o‘zgartirilgandan keyin ham)
export function checkExams(data) {
  const ctx = buildContext(data);
  const issues = [];
  const items = new Map(data.exams.items.map((x) => [x.id, x]));
  const list = (data.exams.schedule || []).map((s) => ({ ...s, ex: items.get(s.examId) })).filter((x) => x.ex);
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const need = examStudents(ctx, a.ex);
    const cap = a.roomIds.reduce((s, r) => s + (Number(ctx.rooms.get(r)?.capacity) || 0), 0);
    if (cap < need) issues.push({ examId: a.examId, msg: `${examLabel(ctx, a.ex)}: xona(lar) sig‘imi ${cap}, talabalar ${need}.` });
    const T = ctx.teachers.get(a.ex.examinerId);
    if (T && absenceOn(T, a.date)) issues.push({ examId: a.examId, msg: `${T.name} ${a.date} kuni yo‘q.` });
    if (holidayOn(data.calendar, a.date)) issues.push({ examId: a.examId, msg: `${a.date} — bayram kuni.` });
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (a.date !== b.date) continue;
      const g = a.ex.groupIds.find((x) => b.ex.groupIds.includes(x));
      if (g) issues.push({ examId: b.examId, msg: `${ctx.groups.get(g)?.name}: ${a.date} kuni ikkita imtihon (${ctx.subjects.get(a.ex.subjectId)?.name}, ${ctx.subjects.get(b.ex.subjectId)?.name}).` });
      if (!overlap(a.slotIds, b.slotIds)) continue;
      const r = a.roomIds.find((x) => b.roomIds.includes(x));
      if (r) issues.push({ examId: b.examId, msg: `${ctx.rooms.get(r)?.number}-xona ${a.date} kuni bir vaqtda ikki imtihonga berilgan.` });
      const people = [a.ex.examinerId, ...(a.proctorIds || [])];
      const clash = [b.ex.examinerId, ...(b.proctorIds || [])].find((x) => people.includes(x));
      if (clash) issues.push({ examId: b.examId, msg: `${ctx.teachers.get(clash)?.name} ${a.date} kuni bir vaqtda ikki imtihonda.` });
    }
  }
  return issues;
}

export { wlLabel, wlStudents };
