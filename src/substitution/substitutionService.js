// Vaqtincha almashtirish: yaratish, uzaytirish, erta tugatish, bekor qilish, yo‘qlik bo‘yicha taklif
import { buildContext } from '../scheduler/model.js';
import { makeDayCache, teacherOccurrences, evaluateTemporary, findMoveSlot, rankTemporaryCandidates } from './candidates.js';
import { uid, nowIso } from '../utils/id.js';
import { addDays, todayStr } from '../utils/date.js';

export const occKey = (o) => o.date + '|' + o.lesson.id;

/**
 * Almashtirish rejasini hisoblash (hali saqlamasdan) — wizard'ning "Oldindan ko‘rish" qismi uchun.
 * strategy: 'move' (bir martalik ko‘chirish, bo‘lmasa bekor) | 'cancel' (bekor + qoplash)
 * overrides: { [date|lessonId]: 'move'|'cancel' }
 */
export function planTemporary(data, p) {
  const ctx = buildContext(data);
  const dayOf = makeDayCache(data, ctx);
  const T = ctx.teachers.get(p.substituteTeacherId);
  if (!T) throw new Error('Almashtiruvchi o‘qituvchi topilmadi.');
  if (p.substituteTeacherId === p.originalTeacherId) throw new Error('Almashtiruvchi asl o‘qituvchining o‘zi bo‘lishi mumkin emas.');
  if (!p.startDate || !p.endDate || p.startDate > p.endDate) throw new Error('Sana oralig‘i noto‘g‘ri.');
  const cal = data.calendar || {};
  if ((cal.startDate && p.endDate < cal.startDate) || (cal.endDate && p.startDate > cal.endDate)) throw new Error('Sanalar semestrdan tashqarida.');
  const occs = teacherOccurrences(data, { wlIds: p.workloadIds, teacherId: p.originalTeacherId, startDate: p.startDate, endDate: p.endDate }, ctx, dayOf);
  const ev = evaluateTemporary(data, ctx, T, occs, dayOf, { allowOverLimit: !!data.settings?.substitution?.allowOverLimit });
  const assigned = [...ev.assigned];
  const plan = ev.fits.map((o) => ({ o, action: 'substitute' }));
  for (const m of ev.misses) {
    const want = p.overrides?.[occKey(m.o)] || p.strategy || 'move';
    if (want === 'move') {
      const alt = findMoveSlot(data, ctx, T, m.o, dayOf, assigned);
      if (alt) {
        plan.push({ o: m.o, action: 'move', newSlotId: alt.slotId, newRoomId: alt.roomId, reason: m.reason });
        assigned.push({ ...m.o, slotId: alt.slotId, roomId: alt.roomId, slotIds: alt.slotIds, teacherId: T.id });
        continue;
      }
    }
    plan.push({ o: m.o, action: 'cancel', makeupRequired: true, reason: m.reason, moveFailed: want === 'move' });
  }
  plan.sort((a, b) => (a.o.date + a.o.slotId < b.o.date + b.o.slotId ? -1 : 1));
  return { plan, total: occs.length, ctx };
}

export function applyTemporary(data, p, existingId) {
  const { plan } = planTemporary(data, p);
  const sub = {
    id: existingId || uid('subst'),
    workloadIds: [...p.workloadIds],
    originalTeacherId: p.originalTeacherId,
    substituteTeacherId: p.substituteTeacherId,
    startDate: p.startDate, endDate: p.endDate,
    reason: p.reason || 'other', note: p.note || '',
    strategy: p.strategy || 'move',
    occurrences: plan.map((x) => {
      const e = { date: x.o.date, lessonId: x.o.lesson.id, action: x.action };
      if (x.action === 'move') { e.newSlotId = x.newSlotId; e.newRoomId = x.newRoomId; }
      if (x.action === 'cancel') e.makeupRequired = true;
      return e;
    }),
    cancelled: false,
    createdAt: nowIso(), updatedAt: nowIso(),
  };
  data.substitutions = data.substitutions || [];
  if (existingId) {
    const i = data.substitutions.findIndex((s) => s.id === existingId);
    if (i >= 0) { sub.createdAt = data.substitutions[i].createdAt; data.substitutions[i] = sub; }
    else data.substitutions.push(sub);
  } else data.substitutions.push(sub);
  return sub;
}

// Muddatni o‘zgartirish (uzaytirish): occurrence'lar qayta hisoblanadi
export function changeRange(data, subId, startDate, endDate) {
  const s = data.substitutions.find((x) => x.id === subId);
  if (!s) throw new Error('Almashtirish topilmadi.');
  // o‘zini hisobdan chiqarish uchun vaqtincha bekor qilamiz
  s.cancelled = true;
  try {
    return applyTemporary(data, { ...s, startDate, endDate, workloadIds: s.workloadIds }, s.id);
  } catch (e) {
    s.cancelled = false;
    throw e;
  }
}

export function finishEarly(data, subId, today = todayStr()) {
  const s = data.substitutions.find((x) => x.id === subId);
  if (!s) return;
  const newEnd = addDays(today, -1);
  if (newEnd < s.startDate) s.cancelled = true;
  else {
    s.endDate = newEnd;
    s.occurrences = s.occurrences.filter((o) => o.date <= newEnd);
  }
  s.updatedAt = nowIso();
}

export function cancelSubstitution(data, subId) {
  const s = data.substitutions.find((x) => x.id === subId);
  if (s) { s.cancelled = true; s.updatedAt = nowIso(); }
}

// Yo‘qlik: ta'sirlangan darslar va har bir yuklama uchun eng yaxshi almashtiruvchi
export function suggestForAbsence(data, teacherId, startDate, endDate) {
  const ctx = buildContext(data);
  const dayOf = makeDayCache(data, ctx);
  const occs = teacherOccurrences(data, { teacherId, startDate, endDate }, ctx, dayOf);
  const byWl = new Map();
  for (const o of occs) {
    if (!byWl.has(o.wl.id)) byWl.set(o.wl.id, []);
    byWl.get(o.wl.id).push(o);
  }
  const suggestions = [];
  for (const [wlId, list] of byWl) {
    const r = rankTemporaryCandidates(data, { wlIds: [wlId], originalTeacherId: teacherId, startDate, endDate, allowOverLimit: !!data.settings?.substitution?.allowOverLimit });
    const best = r.candidates[0] || null;
    suggestions.push({ workloadId: wlId, occurrences: list, best, candidates: r.candidates.slice(0, 5) });
  }
  return { occs, suggestions };
}

/**
 * Jadval o‘zgarganda (qayta generatsiya, ko‘chirish, o‘tkazish) faol va rejalashtirilgan almashtirishlarni
 * yangi darslarga moslab qayta hisoblash. O‘tgan sanalar tarix sifatida saqlanadi.
 */
export function reconcileSubstitutions(data, today = todayStr()) {
  let n = 0;
  for (const s of data.substitutions || []) {
    if (s.cancelled || s.endDate < today) continue;
    const from = s.startDate > today ? s.startDate : today;
    const past = (s.occurrences || []).filter((o) => o.date < from);
    s.cancelled = true; // o‘zini hisobdan chiqarish
    try {
      const { plan } = planTemporary(data, { ...s, startDate: from, endDate: s.endDate, strategy: s.strategy || 'move' });
      s.occurrences = [...past, ...plan.map((x) => {
        const e = { date: x.o.date, lessonId: x.o.lesson.id, action: x.action };
        if (x.action === 'move') { e.newSlotId = x.newSlotId; e.newRoomId = x.newRoomId; }
        if (x.action === 'cancel') e.makeupRequired = true;
        return e;
      })];
      s.updatedAt = nowIso();
      n++;
    } catch { /* noto‘g‘ri almashtirish — o‘zgarishsiz qoladi */ }
    finally { s.cancelled = false; }
  }
  return n;
}
