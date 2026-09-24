// Konfliktlarni to‘liq aniqlash (H1–H18, yetim darslar, soft ogohlantirishlar)
import { buildContext, wlUnits, unitsOverlap, parityOverlap, dayName, slotName, wlLabel, wlRequired, wlGroupIds, teacherMaxDays } from './model.js';
import { Occupancy, staticCheck, describeRec } from './constraintChecker.js';
import { scoreAll } from './scoring.js';
import { HARD_CODES, SOFT_CODES } from '../i18n/uz.js';

function mk(ctx, o) {
  const lessons = (o.recs || []).filter(Boolean);
  const c = {
    key: o.key,
    severity: o.severity || 'critical',
    code: o.code,
    title: HARD_CODES[o.code] || SOFT_CODES[o.code] || o.code,
    msg: o.msg,
    lessonIds: lessons.map((r) => r.id),
    day: o.day || lessons[0]?.day || null,
    slotId: o.slotId || lessons[0]?.slotIds?.[0] || null,
    teacherIds: [...new Set([...(o.teacherIds || []), ...lessons.map((r) => r.teacherId)])],
    groupIds: [...new Set([...(o.groupIds || []), ...lessons.flatMap((r) => wlGroupIds(r.wl))])],
    roomIds: [...new Set([...(o.roomIds || []), ...lessons.map((r) => r.roomId)])],
    subjectIds: [...new Set([...(o.subjectIds || []), ...lessons.map((r) => r.wl.subjectId)])],
    date: o.date || null,
  };
  return c;
}

export function checkAll(data, opts = {}) {
  const ctx = opts.ctx || buildContext(data);
  const out = [];
  const lessons = data.schedule?.lessons || [];
  const occ = new Occupancy(ctx);
  // Yetim darslar
  for (const l of lessons) {
    const wl = ctx.workloads.get(l.workloadId);
    if (!wl) {
      out.push({ key: 'ORPHAN|' + l.id, severity: 'critical', code: 'ORPHAN', title: HARD_CODES.ORPHAN, msg: 'Dars o‘chirilgan o‘quv yuklamasiga bog‘langan.', lessonIds: [l.id], day: l.day, slotId: l.slotId, teacherIds: [], groupIds: [], roomIds: [l.roomId], subjectIds: [] });
      continue;
    }
    if (!ctx.slotIdx.has(l.slotId) || !ctx.rooms.get(l.roomId)) {
      out.push({ key: 'ORPHAN|' + l.id, severity: 'critical', code: 'ORPHAN', title: HARD_CODES.ORPHAN, msg: `${wlLabel(ctx, wl)}: ${!ctx.slotIdx.has(l.slotId) ? 'vaqt sloti' : 'auditoriya'} o‘chirilgan.`, lessonIds: [l.id], day: l.day, slotId: l.slotId, teacherIds: [wl.teacherId], groupIds: wlGroupIds(wl), roomIds: [], subjectIds: [wl.subjectId] });
      if (!ctx.slotIdx.has(l.slotId)) continue;
    }
    occ.add(l);
  }
  const recs = [...occ.recs.values()];
  // Statik qoidalar
  for (const r of recs) {
    if (!ctx.rooms.get(r.roomId)) continue;
    const v = staticCheck(ctx, r.wl, r.day, r.slotIds[0], r.roomId);
    const seen = new Set();
    for (const x of v) {
      if (seen.has(x.code)) continue;
      seen.add(x.code);
      out.push(mk(ctx, { key: x.code + '|' + r.id, code: x.code, msg: `${wlLabel(ctx, r.wl)} (${dayName(r.day)}, ${slotName(ctx, r.slotIds[0])}): ${x.msg}`, recs: [r] }));
    }
  }
  // To‘qnashuvlar
  const pairSeen = new Set();
  for (const [key, arr] of occ.cells) {
    if (arr.length < 2) continue;
    const [day, slotId] = key.split('|');
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j];
        if (!parityOverlap(a.parity, b.parity)) continue;
        const pk = [a.id, b.id].sort().join('~');
        const da = describeRec(ctx, a), db = describeRec(ctx, b);
        const when = `${dayName(day)}, ${slotName(ctx, slotId)}`;
        if (a.teacherId === b.teacherId && !pairSeen.has('H1' + pk)) {
          pairSeen.add('H1' + pk);
          out.push(mk(ctx, { key: 'H1|' + pk, code: 'H1', day, slotId, msg: `${da.teacher} bir vaqtda ikki darsda: ${da.subject} (${da.target}) va ${db.subject} (${db.target}) — ${when}.`, recs: [a, b] }));
        }
        if (a.units.some((u) => b.units.some((v) => unitsOverlap(u, v))) && !pairSeen.has('H2' + pk)) {
          pairSeen.add('H2' + pk);
          out.push(mk(ctx, { key: 'H2|' + pk, code: 'H2', day, slotId, msg: `${da.target} bir vaqtda ikki darsda: ${da.subject} va ${db.subject} — ${when}.`, recs: [a, b] }));
        }
        if (a.roomId === b.roomId && !pairSeen.has('H3' + pk)) {
          pairSeen.add('H3' + pk);
          out.push(mk(ctx, { key: 'H3|' + pk, code: 'H3', day, slotId, msg: `${da.room}-xona bir vaqtda ikki darsga berilgan: ${da.subject} (${da.target}) va ${db.subject} (${db.target}) — ${when}.`, recs: [a, b] }));
        }
      }
    }
  }
  // O‘qituvchi limitlari
  for (const [tid, m] of occ.tDay) {
    const t = ctx.teachers.get(tid);
    if (!t) continue;
    const days = [];
    for (const [d, set] of m) {
      if (!set.size) continue;
      days.push(d);
      const u = occ.teacherDayUnits(tid, d);
      if (u > (Number(t.maxClassesPerDay) || 99)) out.push(mk(ctx, { key: 'H10|' + tid + '|' + d, code: 'H10', day: d, msg: `${t.name}: ${dayName(d)} kuni ${u} ta dars (limit ${t.maxClassesPerDay}).`, recs: [...set] }));
    }
    const wk = occ.teacherWeekUnits(tid);
    if (wk > (Number(t.maxWeeklyClasses) || 999)) out.push(mk(ctx, { key: 'H11|' + tid, code: 'H11', msg: `${t.name}: haftasiga ${wk} ta dars (limit ${t.maxWeeklyClasses}).`, teacherIds: [tid], day: null, slotId: null }));
    if (days.length > teacherMaxDays(t)) out.push(mk(ctx, { key: 'H12|' + tid, code: 'H12', msg: `${t.name}: ${days.length} kun ishlaydi (limit ${t.maxWorkingDays}).`, teacherIds: [tid] }));
  }
  // Guruh kunlik limiti
  for (const [gid, m] of occ.gDay) {
    const g = ctx.groups.get(gid);
    if (!g) continue;
    for (const [d, set] of m) {
      if (!set.size) continue;
      const load = occ.groupDayLoad(gid, d);
      if (load > (Number(g.maxLessonsPerDay) || 99)) out.push(mk(ctx, { key: 'H13|' + gid + '|' + d, code: 'H13', day: d, msg: `${g.name}: ${dayName(d)} kuni ${load} ta dars (limit ${g.maxLessonsPerDay}).`, groupIds: [gid], recs: [...set] }));
    }
  }
  // Yuklama soni
  for (const wl of ctx.workloads.values()) {
    if (wl.active === false) continue;
    const req = wlRequired(wl);
    const p = occ.wlPlaced(wl.id);
    const recsW = occ.wlRecList(wl.id);
    if (p.all > req.all || p.bi > req.bi) {
      out.push(mk(ctx, { key: 'H14|' + wl.id, code: 'H14', msg: `${wlLabel(ctx, wl)}: ${p.all + p.bi} ta dars, talab ${req.all + req.bi}.`, recs: recsW, subjectIds: [wl.subjectId], teacherIds: [wl.teacherId], groupIds: wlGroupIds(wl) }));
    } else if (p.all < req.all || p.bi < req.bi) {
      out.push(mk(ctx, { key: 'UNDER|' + wl.id, severity: 'warning', code: 'UNDER', msg: `${wlLabel(ctx, wl)}: ${p.all + p.bi}/${req.all + req.bi} dars joylashtirilgan.`, subjectIds: [wl.subjectId], teacherIds: [wl.teacherId], groupIds: wlGroupIds(wl) }));
    }
  }
  // Soft ogohlantirishlar
  if (opts.soft !== false) {
    const items = [];
    scoreAll(ctx, occ, items);
    for (const it of items) {
      const rec = it.lessonId ? occ.recs.get(it.lessonId) : null;
      const wl = it.workloadId ? ctx.workloads.get(it.workloadId) : rec?.wl;
      out.push({
        key: it.code + '|' + (it.lessonId || it.teacherId || it.groupId || it.workloadId) + '|' + (it.day || ''),
        severity: 'warning', code: it.code, title: SOFT_CODES[it.code], msg: it.msg + ` (+${it.penalty})`, penalty: it.penalty,
        lessonIds: rec ? [rec.id] : [], day: it.day || rec?.day || null, slotId: rec?.slotIds[0] || null,
        teacherIds: it.teacherId ? [it.teacherId] : rec ? [rec.teacherId] : wl ? [wl.teacherId] : [],
        groupIds: it.groupId ? [it.groupId] : wl ? wlGroupIds(wl) : [],
        roomIds: rec ? [rec.roomId] : [], subjectIds: wl ? [wl.subjectId] : [],
      });
    }
  }
  return out;
}

// Tezkor: faqat hard konfliktlar soni
export function hardCount(data) {
  return checkAll(data, { soft: false }).filter((c) => c.severity === 'critical').length;
}
