// Tor joylar tahlili: qaysi resurs jadvalni eng ko‘p cheklayapti (bosim koeffitsienti)
import { buildContext, wlUnits, wlRoomType, groupAvail, isAvail, roomTypeName, wlStudents, wlTargetName } from '../scheduler/model.js';
import { teacherCapacity, wlDemandUnits } from '../scheduler/feasibility.js';
import { candidateRooms, buildDomain } from '../scheduler/slotGenerator.js';

const level = (p) => (p > 1 ? 'critical' : p > 0.9 ? 'warn' : 'ok');

export function analyzeBottlenecks(data) {
  const ctx = buildContext(data);
  const active = [...ctx.workloads.values()].filter((w) => w.active !== false && ctx.teachers.get(w.teacherId)?.active !== false);
  const entries = [];

  // O‘qituvchilar
  for (const t of ctx.teachers.values()) {
    if (t.active === false) continue;
    const dem = active.filter((w) => w.teacherId === t.id).reduce((a, w) => a + wlDemandUnits(w), 0);
    if (!dem) continue;
    const c = teacherCapacity(ctx, t);
    entries.push({ kind: 'teacher', id: t.id, name: t.name, demand: dem, cap: c.cap, note: c.limiter, pressure: c.cap ? dem / c.cap : Infinity });
  }
  // Guruhlar
  for (const g of ctx.groups.values()) {
    if (g.active === false) continue;
    let whole = 0;
    const subs = new Map();
    for (const w of active) for (const u of wlUnits(w)) {
      if (u.g !== g.id) continue;
      if (u.sub) subs.set(u.sub, (subs.get(u.sub) || 0) + wlDemandUnits(w));
      else whole += wlDemandUnits(w);
    }
    const dem = whole + Math.max(0, ...subs.values());
    if (!dem) continue;
    let cap = 0;
    for (const d of ctx.workDays) cap += Math.min(ctx.slots.filter((s) => groupAvail(ctx, g, d, s.id)).length, Number(g.maxLessonsPerDay) || 99);
    entries.push({ kind: 'group', id: g.id, name: g.name, demand: dem, cap, note: 'guruh o‘quv slotlari', pressure: cap ? dem / cap : Infinity });
  }
  // Xona turlari
  const types = new Set(['regular', ...(ctx.settings.roomTypes || []).map((t) => t.id)]);
  const allRooms = [...ctx.rooms.values()].filter((r) => r.active !== false);
  const slotsOf = (r) => ctx.workDays.reduce((a, d) => a + (r.availability?.[d] || []).filter((s) => ctx.slotIdx.has(s)).length, 0);
  for (const rt of types) {
    const dem = active.filter((w) => wlRoomType(ctx, w) === rt && !w.fixedRoomId).reduce((a, w) => a + wlDemandUnits(w), 0);
    const rooms = rt === 'regular' ? allRooms : allRooms.filter((r) => r.type === rt);
    const cap = rooms.reduce((a, r) => a + slotsOf(r), 0);
    if (!dem) continue;
    const totalDem = rt === 'regular' ? active.reduce((a, w) => a + wlDemandUnits(w), 0) : dem;
    entries.push({ kind: 'roomType', id: rt, name: roomTypeName(ctx, rt) + (rt === 'regular' ? ' (barcha xonalar)' : ' xonalari'), demand: totalDem, cap, note: `${rooms.length} ta xona`, pressure: cap ? totalDem / cap : Infinity });
  }
  // Yuklamalar: barcha hard cheklovlardan keyingi REAL mumkin vaqtlar (o‘qituvchi ∩ guruh ∩ mos xona)
  for (const w of active) {
    const need = wlStudents(ctx, w);
    const rooms = candidateRooms(ctx, w);
    const name = `${ctx.subjects.get(w.subjectId)?.name || '?'} · ${wlTargetName(ctx, w)}`;
    const dem = (Number(w.lessonsPerWeek) || 0) + (Number(w.biweeklyLessons) || 0);
    if (!rooms.length) { entries.push({ kind: 'workload', id: w.id, name: `${name} (${need} kishi)`, demand: dem, cap: 0, note: 'mos xona yo‘q', pressure: Infinity }); continue; }
    const cells = new Set(buildDomain(ctx, w, 'all').map((c) => c.day + '|' + c.slotId)).size;
    const p = cells ? dem / cells : Infinity;
    if (p >= 0.5) entries.push({ kind: 'workload', id: w.id, name, demand: dem, cap: cells, note: cells ? 'real mumkin vaqtlar' : 'o‘qituvchi, guruh va xona vaqtlari kesishmaydi', pressure: p });
  }
  for (const e of entries) e.level = level(e.pressure);
  entries.sort((a, b) => b.pressure - a.pressure);

  // Heatmap: har bir (kun, para) uchun nechta dars "da'vogar" va nechta xona bo‘sh
  const cells = [];
  const lessons = data.schedule?.lessons || [];
  for (const d of ctx.workDays) {
    const row = [];
    for (const s of ctx.slots) {
      let claim = 0;
      for (const w of active) {
        const t = ctx.teachers.get(w.teacherId);
        if (!t || !isAvail(t.availability, d, s.id)) continue;
        const gs = (w.target?.groupIds || []).map((id) => ctx.groups.get(id)).filter(Boolean);
        if (gs.some((g) => !groupAvail(ctx, g, d, s.id))) continue;
        if (!candidateRooms(ctx, w).some((r) => isAvail(r.availability, d, s.id))) continue;
        claim += (Number(w.lessonsPerWeek) || 0) + (Number(w.biweeklyLessons) || 0);
      }
      const rooms = allRooms.filter((r) => isAvail(r.availability, d, s.id)).length;
      const used = lessons.filter((l) => l.day === d && l.slotId === s.id).length;
      row.push({ day: d, slotId: s.id, claim, rooms, used });
    }
    cells.push(row);
  }
  return { entries, heatmap: { days: ctx.workDays, slots: ctx.slots, cells }, ctx };
}

export function globalAdvice(data) {
  const { entries } = analyzeBottlenecks(data);
  const out = [];
  for (const e of entries) {
    if (e.level !== 'critical') continue;
    if (e.kind === 'roomType') out.push(`${e.name}: talab ${e.demand} slot, mavjud ${e.cap} — yana bitta shunday xona kerak yoki mavjudlarini qo‘shimcha kun/paralarda ochish kerak.`);
    else if (e.kind === 'teacher') out.push(`${e.name}: talab ${e.demand} dars, imkoniyat ${e.cap} (${e.note}) — yuklamaning bir qismini boshqa o‘qituvchiga o‘tkazing yoki limit/availability'ni kengaytiring.`);
    else if (e.kind === 'group') out.push(`${e.name}: talab ${e.demand} dars, guruhda ${e.cap} ta slot — smena yoki kunlik limitni kengaytiring.`);
    else if (e.kind === 'workload') out.push(e.cap === 0 && e.note === 'mos xona yo‘q' ? `${e.name}: sig‘imi yetarli mos xona yo‘q — kattaroq xona qo‘shing yoki guruhni bo‘ling.` : `${e.name}: ${e.demand} dars kerak, lekin faqat ${e.cap} ta mumkin vaqt bor (${e.note}).`);
  }
  return out;
}
