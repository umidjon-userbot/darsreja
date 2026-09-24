// Generatsiyadan OLDIN matematik imkonsizlikni aniqlash (feasibility pre-check)
import { wlRequired, wlDuration, wlRoomType, wlUnits, groupAvail, roomTypeName, wlLabel, teacherMaxDays } from './model.js';

export function teacherCapacity(ctx, t) {
  const perDay = ctx.workDays.map((d) => Math.min((t.availability?.[d] || []).filter((s) => ctx.slotIdx.has(s)).length, Number(t.maxClassesPerDay) || 99));
  const avail = ctx.workDays.reduce((a, d) => a + (t.availability?.[d] || []).filter((s) => ctx.slotIdx.has(s)).length, 0);
  const topDays = [...perDay].sort((a, b) => b - a).slice(0, teacherMaxDays(t)).reduce((a, b) => a + b, 0);
  const weekly = Number(t.maxWeeklyClasses) || 999;
  const cap = Math.min(avail, topDays, weekly);
  let limiter = 'mavjud slotlar';
  if (cap === weekly && weekly < avail) limiter = 'haftalik limit';
  else if (cap === topDays && topDays < avail) limiter = 'kunlik va ish kunlari limiti';
  return { cap, avail, weekly, topDays, limiter };
}

export function wlDemandUnits(wl) {
  const r = wlRequired(wl);
  return (r.all + r.bi) * wlDuration(wl);
}

export function feasibility(ctx, scopeWlIds) {
  const issues = [];
  const active = [...ctx.workloads.values()].filter((w) => w.active !== false);
  const inScope = (w) => !scopeWlIds || scopeWlIds.has(w.id);

  // O‘qituvchilar
  const tDemand = new Map();
  for (const w of active) tDemand.set(w.teacherId, (tDemand.get(w.teacherId) || 0) + wlDemandUnits(w));
  for (const [tid, dem] of tDemand) {
    const t = ctx.teachers.get(tid);
    if (!t) continue;
    if (!active.some((w) => w.teacherId === tid && inScope(w))) continue;
    const c = teacherCapacity(ctx, t);
    if (dem > c.cap) {
      issues.push({ level: 'error', kind: 'teacher', id: tid, demand: dem, cap: c.cap,
        msg: `${t.name} — talab ${dem} dars, lekin maksimal ${c.cap} (${c.limiter}).` });
    } else if (dem > c.cap * 0.9 && dem > 2) {
      issues.push({ level: 'warn', kind: 'teacher', id: tid, demand: dem, cap: c.cap,
        msg: `${t.name} — talab ${dem} / imkoniyat ${c.cap}: juda tig‘iz.` });
    }
  }

  // Guruhlar
  for (const g of ctx.groups.values()) {
    if (g.active === false) continue;
    let whole = 0;
    const subs = new Map();
    let touched = false;
    for (const w of active) {
      for (const u of wlUnits(w)) {
        if (u.g !== g.id) continue;
        if (inScope(w)) touched = true;
        if (u.sub) subs.set(u.sub, (subs.get(u.sub) || 0) + wlDemandUnits(w));
        else whole += wlDemandUnits(w);
      }
    }
    if (!touched) continue;
    const dem = whole + Math.max(0, ...subs.values());
    let cap = 0;
    for (const d of ctx.workDays) {
      const n = ctx.slots.filter((s) => groupAvail(ctx, g, d, s.id)).length;
      cap += Math.min(n, Number(g.maxLessonsPerDay) || 99);
    }
    if (dem > cap) issues.push({ level: 'error', kind: 'group', id: g.id, demand: dem, cap, msg: `${g.name} — talab ${dem} dars, lekin guruhda faqat ${cap} ta o‘quv sloti bor.` });
  }

  // Xona turlari
  const typeDemand = new Map();
  for (const w of active) {
    const rt = w.fixedRoomId ? 'room:' + w.fixedRoomId : wlRoomType(ctx, w);
    if (rt === 'regular') continue;
    typeDemand.set(rt, (typeDemand.get(rt) || 0) + wlDemandUnits(w));
  }
  for (const [rt, dem] of typeDemand) {
    const rooms = [...ctx.rooms.values()].filter((r) => r.active !== false && (rt.startsWith('room:') ? r.id === rt.slice(5) : r.type === rt));
    const cap = rooms.reduce((a, r) => a + ctx.workDays.reduce((b, d) => b + (r.availability?.[d] || []).filter((s) => ctx.slotIdx.has(s)).length, 0), 0);
    const name = rt.startsWith('room:') ? (ctx.rooms.get(rt.slice(5))?.number || '?') + '-xona' : roomTypeName(ctx, rt);
    if (!rooms.length) issues.push({ level: 'error', kind: 'roomType', id: rt, demand: dem, cap: 0, msg: `"${name}" turidagi faol xona yo‘q, lekin ${dem} dars talab qiladi.` });
    else if (dem > cap) issues.push({ level: 'error', kind: 'roomType', id: rt, demand: dem, cap, msg: `${name} — talab ${dem} slot, mavjud ${cap} slot.` });
  }

  // Yuklamalar
  for (const w of active) {
    if (!inScope(w)) continue;
    if (!ctx.teachers.get(w.teacherId)) issues.push({ level: 'error', kind: 'workload', id: w.id, msg: `${wlLabel(ctx, w)} — o‘qituvchi biriktirilmagan.` });
  }
  return issues;
}
