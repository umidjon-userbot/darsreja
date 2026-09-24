// Soft constraint penalty tizimi (S1–S14). Og‘irliklar Sozlamalardan olinadi.
import { dayName, slotName, wlStudents, wlLabel } from './model.js';

const r1 = (x) => Math.round(x * 10) / 10;

function note(items, code, penalty, msg, ref) {
  if (items && penalty > 0) items.push({ code, penalty: r1(penalty), msg, ...ref });
}

function dayIdxs(recs) {
  const s = new Set();
  for (const r of recs) for (const i of r.idxs) s.add(i);
  return [...s].sort((a, b) => a - b);
}

export function teacherPenalty(ctx, occ, tid, items) {
  const t = ctx.teachers.get(tid);
  const m = occ.tDay.get(tid);
  if (!t || !m) return 0;
  const W = ctx.weights;
  let p = 0;
  const ref = { teacherId: tid };
  const days = [];
  let recCount = 0;
  for (const [d, set] of m) if (set.size) { days.push(d); recCount += set.size; }
  if (!recCount) return 0;

  // S1: minimal ish kunlari (darslar sonidan ko‘p kun talab qilinmaydi)
  const target = Math.min(Number(t.minWorkingDays) || 0, recCount);
  if (days.length < target) {
    const v = (target - days.length) * W.S1;
    p += v;
    note(items, 'S1', v, `${t.name}: ${days.length} kun ishlaydi, minimum ${target} kun.`, ref);
  }
  const minD = Number(t.minClassesPerDay) || 0;
  const maxCons = Number(t.maxConsecutive) || ctx.maxConsecutiveDefault;
  for (const d of days) {
    const recs = [...m.get(d)];
    const idxs = dayIdxs(recs);
    // S2
    if (idxs.length < minD) {
      const v = (minD - idxs.length) * W.S2;
      p += v;
      note(items, 'S2', v, `${t.name}: ${dayName(d)} kuni ${idxs.length} ta dars, minimum ${minD}.`, { ...ref, day: d });
    }
    // S6: bo‘shliqlar
    const gaps = idxs.length ? idxs[idxs.length - 1] - idxs[0] + 1 - idxs.length : 0;
    if (gaps > 0) {
      const v = gaps * W.S6;
      p += v;
      note(items, 'S6', v, `${t.name}: ${dayName(d)} kuni ${gaps} ta bo‘sh "oyna".`, { ...ref, day: d });
    }
    // S8: ketma-ketlik
    let run = 1;
    for (let i = 1; i <= idxs.length; i++) {
      if (i < idxs.length && idxs[i] === idxs[i - 1] + 1) run++;
      else {
        if (run > maxCons) {
          const v = (run - maxCons) * W.S8;
          p += v;
          note(items, 'S8', v, `${t.name}: ${dayName(d)} kuni ketma-ket ${run} ta dars (max ${maxCons}).`, { ...ref, day: d });
        }
        run = 1;
      }
    }
    // S12: ketma-ket paralarda turli bino
    const bAt = new Map();
    for (const r of recs) {
      const b = ctx.rooms.get(r.roomId)?.building || '';
      for (const i of r.idxs) bAt.set(i, { b, id: r.id });
    }
    for (const i of idxs) {
      const a = bAt.get(i), c = bAt.get(i + 1);
      if (a && c && a.id !== c.id && a.b !== c.b) {
        p += W.S12;
        note(items, 'S12', W.S12, `${t.name}: ${dayName(d)} kuni ${a.b || '?'} → ${c.b || '?'} binoga o‘tish.`, { ...ref, day: d });
      }
    }
  }
  return p;
}

export function groupPenalty(ctx, occ, gid, items) {
  const g = ctx.groups.get(gid);
  const m = occ.gDay.get(gid);
  if (!g || !m) return 0;
  const W = ctx.weights;
  let p = 0;
  const ref = { groupId: gid };
  const loads = [];
  let any = false;
  for (const d of ctx.workDays) {
    const set = m.get(d);
    const load = set?.size ? occ.groupDayLoad(gid, d) : 0;
    if (load) any = true;
    loads.push(load);
    if (!set?.size) continue;
    const idxs = dayIdxs(set);
    const gaps = idxs.length ? idxs[idxs.length - 1] - idxs[0] + 1 - idxs.length : 0;
    if (gaps > 0) {
      const v = gaps * W.S7;
      p += v;
      note(items, 'S7', v, `${g.name}: ${dayName(d)} kuni ${gaps} ta bo‘sh para.`, { ...ref, day: d });
    }
  }
  if (any) {
    // S11: faqat guruh o‘qiy oladigan kunlar bo‘yicha
    const vals = loads.filter((_, i) => dayHasAvail(ctx, g, ctx.workDays[i]));
    if (vals.length > 1) {
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
      const v = r1(sd * W.S11);
      if (v >= 1) {
        p += v;
        note(items, 'S11', v, `${g.name}: kunlik yuk notekis (σ = ${r1(sd)}).`, ref);
      }
    }
  }
  return p;
}

function dayHasAvail(ctx, g, d) {
  if (g.availability && Object.keys(g.availability).length) return (g.availability[d] || []).length > 0;
  return true;
}

export function workloadPenalty(ctx, occ, wlId, items) {
  const wl = ctx.workloads.get(wlId);
  const recs = occ.wlRecs.get(wlId);
  if (!wl || !recs || !recs.size) return 0;
  const W = ctx.weights;
  const byDay = new Map();
  for (const r of recs) byDay.set(r.day, (byDay.get(r.day) || 0) + 1);
  const counts = [...byDay.values()];
  let p = 0;
  const ref = { workloadId: wlId };
  const dist = wl.distribution || 'spread';
  if (dist === 'spread') {
    const extra = counts.reduce((a, c) => a + Math.max(0, c - 1), 0);
    if (extra) {
      p += extra * W.S9;
      note(items, 'S9', extra * W.S9, `${wlLabel(ctx, wl)}: bir kunda ${extra + 1 > 2 ? 'bir necha' : '2'} marta.`, ref);
    }
  } else if (dist === 'pairs') {
    const dev = counts.reduce((a, c) => a + Math.abs(c - 2), 0);
    if (dev) {
      p += dev * W.S10;
      note(items, 'S10', dev * W.S10, `${wlLabel(ctx, wl)}: "2 kun × 2 dars" taqsimotidan chetlanish.`, ref);
    }
  }
  // S15: tanlov bloki variantlari bir xil vaqtlarda bo‘lishi kerak
  const block = wl.target?.type === 'elective' ? wl.target.electiveBlock : null;
  const members = block ? ctx.blocks?.get(block) || [] : [];
  if (members.length > 1) {
    const cellsOf = (id) => new Set([...(occ.wlRecs.get(id) || [])].map((r) => r.day + '|' + r.idxs[0]));
    const mine = cellsOf(wl.id);
    let miss = 0;
    for (const other of members) {
      if (other === wl.id) continue;
      const theirs = cellsOf(other);
      if (!theirs.size) continue;
      for (const c of mine) if (!theirs.has(c)) miss++;
    }
    if (miss) {
      p += miss * W.S15;
      note(items, 'S15', miss * W.S15, `${wlLabel(ctx, wl)}: tanlov bloki "${block}" variantlari bilan ${miss} ta vaqt mos emas.`, ref);
    }
  }
  if (dist === 'custom' && Array.isArray(wl.customDistribution) && wl.customDistribution.length) {
    const want = [...wl.customDistribution].map(Number).sort((a, b) => b - a);
    const have = [...counts].sort((a, b) => b - a);
    let dev = 0;
    for (let i = 0; i < Math.max(want.length, have.length); i++) dev += Math.abs((want[i] || 0) - (have[i] || 0));
    if (dev) {
      p += dev * W.S10;
      note(items, 'S10', dev * W.S10, `${wlLabel(ctx, wl)}: maxsus taqsimotdan chetlanish.`, ref);
    }
  }
  return p;
}

export function lessonPenalty(ctx, rec, items) {
  const W = ctx.weights;
  const t = ctx.teachers.get(rec.teacherId);
  const wl = rec.wl;
  let p = 0;
  const ref = { lessonId: rec.id };
  const when = `${dayName(rec.day)}, ${slotName(ctx, rec.slotIds[0])}`;
  if (t) {
    if (t.preferredDays?.length && !t.preferredDays.includes(rec.day)) {
      p += W.S3;
      note(items, 'S3', W.S3, `${t.name}: ${when} — afzal kun emas.`, ref);
    }
    if (t.preferredSlots?.length && rec.slotIds.some((s) => !t.preferredSlots.includes(s))) {
      p += W.S4;
      note(items, 'S4', W.S4, `${t.name}: ${when} — afzal vaqt emas.`, ref);
    }
  }
  const pr = wl.preference;
  if (pr && (pr.days?.length || pr.slots?.length)) {
    const w = W['S5_' + (pr.priority || 'medium')] || W.S5_medium;
    let miss = 0;
    if (pr.days?.length && !pr.days.includes(rec.day)) miss++;
    if (pr.slots?.length && !pr.slots.includes(rec.slotIds[0])) miss++;
    if (miss) {
      p += miss * w;
      note(items, 'S5', miss * w, `${wlLabel(ctx, wl)}: ${when} — dars afzalligi (${pr.priority || 'medium'}) buzildi.`, ref);
    }
  }
  if (rec.idxs.includes(ctx.lastSlotIdx) && ctx.slots.length > 3) {
    p += W.S13;
    note(items, 'S13', W.S13, `${wlLabel(ctx, wl)}: ${when} — kechki slot.`, ref);
  }
  const room = ctx.rooms.get(rec.roomId);
  const need = wlStudents(ctx, wl);
  if (room && need > 0 && Number(room.capacity) >= need * 2) {
    p += W.S14;
    note(items, 'S14', W.S14, `${room.number}-xona (${room.capacity}) ${need} kishilik guruh uchun juda katta.`, ref);
  }
  // Oddiy darsga maxsus xona (kompyuter, laboratoriya…) berilishi — maxsus xonalarni band qiladi
  if (room && room.type !== 'regular' && !wl.fixedRoomId && (wl.roomType || ctx.subjects.get(wl.subjectId)?.roomType || 'regular') === 'regular') {
    const v = W.S14 * 3;
    p += v;
    note(items, 'S14', v, `${room.number}-xona (${room.type}) oddiy dars uchun ishlatildi.`, ref);
  }
  return p;
}

export function scoreAll(ctx, occ, items) {
  let total = 0;
  for (const tid of occ.tDay.keys()) total += teacherPenalty(ctx, occ, tid, items);
  for (const gid of occ.gDay.keys()) total += groupPenalty(ctx, occ, gid, items);
  for (const wid of occ.wlRecs.keys()) total += workloadPenalty(ctx, occ, wid, items);
  for (const rec of occ.recs.values()) total += lessonPenalty(ctx, rec, items);
  return r1(total);
}

export function breakdownOf(items) {
  const b = {};
  for (const it of items) b[it.code] = r1((b[it.code] || 0) + it.penalty);
  return b;
}

// Bitta dars ta'sir qiladigan obyektlar penaltysi (generator delta hisobi uchun)
export function entityPenalty(ctx, occ, ents) {
  let p = 0;
  for (const t of ents.t) p += teacherPenalty(ctx, occ, t);
  for (const g of ents.g) p += groupPenalty(ctx, occ, g);
  for (const w of ents.w) p += workloadPenalty(ctx, occ, w);
  return p;
}

export function entitiesOf(wl, teacherId, ctx) {
  const w = new Set([wl.id]);
  if (ctx && wl.target?.type === 'elective') for (const id of ctx.blocks?.get(wl.target.electiveBlock) || []) w.add(id);
  return {
    t: new Set([teacherId || wl.teacherId]),
    g: new Set((wl.target?.groupIds || []).filter(Boolean)),
    w,
  };
}

export function mergeEnts(a, b) {
  return { t: new Set([...a.t, ...b.t]), g: new Set([...a.g, ...b.g]), w: new Set([...a.w, ...b.w]) };
}

// "Optimallashtirish ko‘rsatkichi" = 100 × (1 − P / P_bazaviy)
export function qualityPercent(finalPenalty, basePenalty, lessonCount) {
  const base = Math.max(basePenalty || 0, (lessonCount || 1) * 50);
  return Math.max(0, Math.min(100, Math.round(100 * (1 - finalPenalty / base))));
}
