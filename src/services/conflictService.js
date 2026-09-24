// Barcha konfliktlar: jadval (checkAll) + almashtirish/yo‘qlik bo‘yicha sana konfliktlari (H18)
import { checkAll } from '../scheduler/conflicts.js';
import { buildContext, slotName } from '../scheduler/model.js';
import { occurrencesOn, absenceOn, substitutionStatus } from '../substitution/calendarResolver.js';
import { dateRange, fmtHuman, todayStr, addDays, dayKeyOf } from '../utils/date.js';
import { HARD_CODES } from '../i18n/uz.js';

let cacheKey = null;
let cacheVal = null;

// rev — store revision raqami (har o‘zgarishda oshadi) — kesh kaliti
export function allConflicts(data, rev = null) {
  const key = rev == null ? null : rev + '|' + new Date().toDateString();
  if (key !== null && cacheKey === key && cacheVal) return cacheVal;
  const ctx = buildContext(data);
  const list = checkAll(data, { ctx });
  list.push(...dateConflicts(data, ctx));
  cacheKey = key;
  cacheVal = list;
  return list;
}

export function invalidateConflicts() {
  cacheKey = null;
}

function dateConflicts(data, ctx) {
  const out = [];
  const dates = new Set();
  const today = todayStr();
  const horizonStart = addDays(today, -7);
  const horizonEnd = addDays(today, 120);
  for (const s of data.substitutions || []) {
    if (s.cancelled || substitutionStatus(s, today) === 'finished') continue;
    for (const d of dateRange(s.startDate > horizonStart ? s.startDate : horizonStart, s.endDate < horizonEnd ? s.endDate : horizonEnd)) dates.add(d);
  }
  for (const e of data.events || []) {
    if (e.cancelAffected) continue;
    if (e.repeat === 'weekly') {
      for (const d of dateRange(horizonStart > (e.startDate || horizonStart) ? horizonStart : e.startDate, addDays(today, 28))) if (dayKeyOf(d) === e.day && (!e.endDate || d <= e.endDate)) dates.add(d);
    } else if (e.date >= horizonStart && e.date <= horizonEnd) dates.add(e.date);
  }
  for (const t of data.teachers || []) {
    for (const a of t.absences || []) {
      if (a.endDate < horizonStart) continue;
      for (const d of dateRange(a.startDate > horizonStart ? a.startDate : horizonStart, a.endDate < horizonEnd ? a.endDate : horizonEnd)) dates.add(d);
    }
  }
  for (const date of [...dates].sort().slice(0, 200)) {
    const res = occurrencesOn(data, date, ctx);
    const byT = new Map();
    for (const o of res.items) {
      if (o.status === 'cancelled') continue;
      if (!byT.has(o.teacherId)) byT.set(o.teacherId, []);
      byT.get(o.teacherId).push(o);
      const T = ctx.teachers.get(o.teacherId);
      const ab = absenceOn(T, date);
      if (ab) {
        const isSub = !!o.substitution;
        out.push(base(ctx, o, {
          key: `H18|absent|${date}|${o.lesson.id}`,
          severity: isSub ? 'critical' : 'warning',
          msg: isSub
            ? `${T.name} ${fmtHuman(date)} kuni yo‘q, lekin almashtiruvchi sifatida tayinlangan (${slotName(ctx, o.slotId)}).`
            : `${T.name} ${fmtHuman(date)} kuni yo‘q, lekin ${slotName(ctx, o.slotId)}dagi darsiga almashtiruvchi tayinlanmagan.`,
        }));
      }
      if (o.eventConflict) {
        out.push(base(ctx, o, { key: `H19|${o.eventConflict.id}|${date}|${o.lesson.id}`, code: 'H19', msg: `${fmtHuman(date)}, ${slotName(ctx, o.slotId)}: "${o.eventConflict.title}" tadbiri ${ctx.subjects.get(o.wl.subjectId)?.name || 'dars'} darsi bilan to‘qnashadi. Darsni bekor qiling yoki tadbirda "ta'sirlangan darslarni bekor qilish"ni yoqing.` }));
      }
      if (o.substitution && T && o.slotIds.some((s) => !(T.availability?.[o.day] || []).includes(s))) {
        out.push(base(ctx, o, { key: `H18|avail|${date}|${o.lesson.id}`, msg: `${T.name} ${fmtHuman(date)}, ${slotName(ctx, o.slotId)}da mavjud emas (almashtirish).` }));
      }
    }
    for (const [tid, items] of byT) {
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i], b = items[j];
          if (!a.slotIds.some((s) => b.slotIds.includes(s))) continue;
          if (!a.substitution && !b.substitution) continue; // shablon konflikti alohida ko‘rsatiladi
          const T = ctx.teachers.get(tid);
          out.push(base(ctx, a, { key: `H18|busy|${date}|${[a.lesson.id, b.lesson.id].sort().join('~')}`, msg: `${T?.name || '?'} ${fmtHuman(date)}, ${slotName(ctx, a.slotId)}da ikki darsda (almashtirish tufayli).`, extraLessons: [b.lesson.id] }));
        }
      }
    }
  }
  return out;
}

function base(ctx, o, x) {
  return {
    key: x.key, severity: x.severity || 'critical', code: x.code || 'H18', title: HARD_CODES[x.code || 'H18'], msg: x.msg,
    lessonIds: [o.lesson.id, ...(x.extraLessons || [])], day: o.day, slotId: o.slotId, date: o.date,
    teacherIds: [o.teacherId, o.originalTeacherId].filter(Boolean), groupIds: o.wl.target?.groupIds || [],
    roomIds: [o.roomId], subjectIds: [o.wl.subjectId],
  };
}

// "Hal qilingan" konfliktlar tarixini yangilash
export function updateConflictLog(data, list) {
  const log = data.conflictLog || { resolved: [], lastKeys: [], lastInfo: {} };
  const now = new Set(list.filter((c) => c.severity === 'critical').map((c) => c.key));
  const info = log.lastInfo || {};
  const resolved = [...(log.resolved || [])];
  for (const k of log.lastKeys || []) {
    if (!now.has(k) && info[k]) resolved.unshift({ key: k, ...info[k], resolvedAt: new Date().toISOString() });
  }
  const newInfo = {};
  for (const c of list) if (c.severity === 'critical') newInfo[c.key] = { title: c.title, msg: c.msg, code: c.code };
  return { resolved: resolved.slice(0, 100), lastKeys: [...now], lastInfo: newInfo };
}
