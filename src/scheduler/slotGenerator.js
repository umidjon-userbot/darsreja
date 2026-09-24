// Har bir o‘quv yuklamasi uchun barcha mumkin bo‘lgan (kun, slot, xona, paritet) kombinatsiyalari —
// faqat statik hard constraintlardan o‘tganlari qoladi.
import { staticCheck } from './constraintChecker.js';
import { wlRoomType, wlStudents, roomTypeOk } from './model.js';

export function candidateRooms(ctx, wl, roomFilter) {
  const rt = wlRoomType(ctx, wl);
  const need = wlStudents(ctx, wl);
  const out = [];
  for (const r of ctx.rooms.values()) {
    if (r.active === false) continue;
    if (roomFilter && !roomFilter.has(r.id)) continue;
    if (wl.fixedRoomId && r.id !== wl.fixedRoomId) continue;
    if (!wl.fixedRoomId && !roomTypeOk(rt, r)) continue;
    if ((Number(r.capacity) || 0) < need) continue;
    out.push(r);
  }
  // Kichikroq mos xona birinchi (katta xonalarni tejash)
  out.sort((a, b) => (a.type === rt ? 0 : 1) - (b.type === rt ? 0 : 1) || a.capacity - b.capacity);
  return out;
}

export function buildDomain(ctx, wl, kind = 'all', opts = {}) {
  const rooms = candidateRooms(ctx, wl, opts.roomFilter);
  const out = [];
  const parities = kind === 'all' ? ['all'] : ['odd', 'even'];
  for (const day of ctx.workDays) {
    for (const s of ctx.slots) {
      for (const r of rooms) {
        if (staticCheck(ctx, wl, day, s.id, r.id, { first: true, teacherId: opts.teacherId }).length) continue;
        for (const p of parities) out.push({ day, slotId: s.id, roomId: r.id, parity: p });
      }
    }
  }
  return out;
}

// O‘qituvchi + guruh uchun umumiy (xonasiz) slotlar soni — diagnostika uchun
export function commonSlots(ctx, wl, teacherId) {
  const t = ctx.teachers.get(teacherId || wl.teacherId);
  if (!t) return [];
  const res = [];
  const groups = (wl.target?.groupIds || []).map((g) => ctx.groups.get(g)).filter(Boolean);
  for (const day of ctx.workDays) {
    for (const s of ctx.slots) {
      if (!(t.availability?.[day] || []).includes(s.id)) continue;
      let ok = true;
      for (const g of groups) {
        const av = g.availability && Object.keys(g.availability).length
          ? (g.availability[day] || []).includes(s.id)
          : (ctx.settings.shifts?.[g.shift] ? ctx.settings.shifts[g.shift].includes(s.id) : true);
        if (!av) { ok = false; break; }
      }
      if (ok) res.push({ day, slotId: s.id });
    }
  }
  return res;
}
