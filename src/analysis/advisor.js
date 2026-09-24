// "Nima o‘zgarsa joylashadi?" maslahatchisi — constraint relaxation.
// Har bir joylashtirilmagan dars uchun cheklovlarni bittadan yumshatib, qisman generatsiyani
// tez simulyatsiya qiladi va natijani (nechta dars joylashadi, o‘zgarish qanchalik og‘ir) reytinglaydi.
import { buildContext, wlRequired, wlGroupIds, isAvail, groupAvail, dayName, slotName, roomTypeName, wlRoomType, wlLabel, wlDuration } from '../scheduler/model.js';
import { Occupancy, isValid, blockersOf } from '../scheduler/constraintChecker.js';
import { buildDomain, candidateRooms } from '../scheduler/slotGenerator.js';
import { generateSchedule } from '../scheduler/scheduler.js';
import { clone, uid } from '../utils/id.js';
import { globalAdvice } from './bottlenecks.js';

const WEIGHT = { light: 1, medium: 2, heavy: 3 };

export function missingFor(data, wlId) {
  const ctx = buildContext(data);
  const wl = ctx.workloads.get(wlId);
  if (!wl || wl.active === false) return 0;
  const r = wlRequired(wl);
  const lessons = (data.schedule?.lessons || []).filter((l) => l.workloadId === wlId);
  return Math.max(0, r.all + r.bi - lessons.length);
}

export function unscheduledWorkloads(data) {
  return (data.workloads || []).filter((w) => w.active !== false && missingFor(data, w.id) > 0).map((w) => ({ wl: w, missing: missingFor(data, w.id) }));
}

function placedCount(lessons, wlId) {
  return lessons.filter((l) => l.workloadId === wlId).length;
}

function simulate(data, wlId, mutate, extraScope = []) {
  const d2 = clone(data);
  mutate(d2);
  const r = generateSchedule(d2, { mode: 'fast', keep: 'onlyUnscheduled', scope: { workloadIds: [wlId, ...extraScope] }, timeBudgetMs: 0, seed: 7 });
  return { placed: placedCount(r.lessons, wlId), lessons: r.lessons, data: d2 };
}

export function adviseWorkload(data, wlId, { limit = 6 } = {}) {
  const ctx = buildContext(data);
  const wl = ctx.workloads.get(wlId);
  if (!wl) return [];
  const missing = missingFor(data, wlId);
  if (!missing) return [];
  const base = placedCount(data.schedule.lessons, wlId);
  const t = ctx.teachers.get(wl.teacherId);
  const groups = wlGroupIds(wl).map((g) => ctx.groups.get(g)).filter(Boolean);
  const rooms = candidateRooms(ctx, wl);
  const out = [];
  const add = (s) => out.push({ id: uid('adv'), workloadId: wlId, ...s });

  // 0. Hozir ham joylashtirish mumkinmi?
  const s0 = simulate(data, wlId, () => {});
  if (s0.placed > base) add({ kind: 'direct', weight: 'light', gain: s0.placed - base, title: 'Qayta joylashtirish', detail: 'Hech narsa o‘zgartirmasdan qisman qayta tuzish yetarli.', relax: { type: 'none' } });

  const cellsTeacherClosed = [], cellsRoomClosed = [], cellsGroupClosed = [];
  for (const d of ctx.workDays) {
    for (const s of ctx.slots) {
      const tOk = t && isAvail(t.availability, d, s.id);
      const gOk = groups.every((g) => groupAvail(ctx, g, d, s.id));
      const rOk = rooms.some((r) => isAvail(r.availability, d, s.id));
      if (!tOk && gOk && rOk) cellsTeacherClosed.push({ day: d, slotId: s.id });
      if (tOk && gOk && !rOk && rooms.length) cellsRoomClosed.push({ day: d, slotId: s.id });
      if (tOk && !gOk && rOk) cellsGroupClosed.push({ day: d, slotId: s.id });
    }
  }
  const pref = (c) => (t?.preferredDays?.includes(c.day) ? 0 : 1) + (t?.preferredSlots?.includes(c.slotId) ? 0 : 1) + (ctx.slotIdx.get(c.slotId) === ctx.lastSlotIdx ? 1 : 0);

  // Bir kunning bir nechta kataklari (masalan, 4–5-paralar) — "blok" sifatida ham sinaladi
  const dayBlocks = (cells) => {
    const by = new Map();
    for (const c of cells) { if (!by.has(c.day)) by.set(c.day, []); by.get(c.day).push(c); }
    return [...by.values()].filter((b) => b.length > 1).map((b) => b.slice(0, Math.max(missing + 1, 2)));
  };
  const cellsText = (cells) => `${dayName(cells[0].day)} ${cells.map((c) => slotName(ctx, c.slotId)).join(', ')}`;
  const seenGain = new Map(); // kind -> eng yaxshi gain (bitta katakli)
  const tryCells = (kind, cellsList, mutate, mk) => {
    for (const cells of cellsList) {
      const r = simulate(data, wlId, (d2) => mutate(d2, cells));
      const gain = r.placed - base;
      if (gain <= 0) continue;
      if (cells.length > 1 && (seenGain.get(kind) || 0) >= gain) continue; // blok yakka katakdan yaxshi bo‘lsagina
      if (cells.length === 1) seenGain.set(kind, Math.max(seenGain.get(kind) || 0, gain));
      add({ ...mk(cells, gain), gain, cellsCount: cells.length });
    }
  };
  const openAv = (obj, cells) => {
    obj.availability = obj.availability || {};
    for (const c of cells) obj.availability[c.day] = [...new Set([...(obj.availability[c.day] || []), c.slotId])];
  };

  // 1. Xonani qo‘shimcha vaqtda ochish (yengil)
  if (rooms.length) {
    const room = rooms[0];
    const singles = cellsRoomClosed.sort((a, b) => pref(a) - pref(b)).slice(0, 10).map((c) => [c]);
    tryCells('roomSlot', [...singles, ...dayBlocks(cellsRoomClosed).slice(0, 3)], (d2, cells) => openAv(d2.rooms.find((x) => x.id === room.id), cells), (cells, gain) => ({
      kind: 'roomSlot', weight: 'light', title: `${room.number}-xonani ${cellsText(cells)}da ochish`,
      detail: `${roomTypeName(ctx, wlRoomType(ctx, wl))} shu vaqtda ishlasa, ${gain} ta dars joylashadi.`,
      relax: { type: 'roomSlot', roomId: room.id, cells },
    }));
  }

  // 2. To‘sib turgan darsni boshqa joyga ko‘chirish (yengil)
  const occ = new Occupancy(ctx, data.schedule.lessons);
  const dom = buildDomain(ctx, wl, 'all');
  const seenMove = new Set();
  for (const c of dom) {
    if (out.filter((x) => x.kind === 'moveBlocker').length >= 2) break;
    const bl = blockersOf(ctx, occ, { wl, ...c });
    if (bl.length !== 1 || bl[0].lesson.locked) continue;
    const b = bl[0];
    if (seenMove.has(b.id)) continue;
    occ.remove(b.id);
    let spot = null;
    if (isValid(ctx, occ, { wl, ...c }, { skipStatic: true })) {
      const probe = { id: '__adv', workloadId: wl.id, day: c.day, slotId: c.slotId, roomId: c.roomId, weekParity: 'all' };
      occ.add(probe);
      for (const bc of buildDomain(ctx, b.wl, b.parity === 'all' ? 'all' : 'bi')) {
        if (bc.day === b.day && bc.slotId === b.slotIds[0]) continue;
        if (isValid(ctx, occ, { wl: b.wl, ...bc }, { skipStatic: true })) { spot = bc; break; }
      }
      occ.remove('__adv');
    }
    occ.addRec(b);
    if (!spot) continue;
    seenMove.add(b.id);
    add({
      kind: 'moveBlocker', weight: 'light', gain: 1,
      title: `${wlLabel(ctx, b.wl)} darsini ${dayName(spot.day)} ${slotName(ctx, spot.slotId)}ga ko‘chirish`,
      detail: `Bo‘shagan ${dayName(c.day)} ${slotName(ctx, c.slotId)}ga bu dars qo‘yiladi. Yangi konflikt yo‘q.`,
      relax: { type: 'moveBlocker', lessonId: b.id, to: { day: spot.day, slotId: spot.slotId, roomId: spot.roomId, weekParity: spot.parity }, place: { day: c.day, slotId: c.slotId, roomId: c.roomId } },
    });
  }

  // 3. O‘qituvchiga slot ochish (o‘rta — kelishuv kerak)
  if (t) {
    const singles = cellsTeacherClosed.sort((a, b) => pref(a) - pref(b)).slice(0, 10).map((c) => [c]);
    tryCells('teacherSlot', [...singles, ...dayBlocks(cellsTeacherClosed).slice(0, 3)], (d2, cells) => openAv(d2.teachers.find((x) => x.id === t.id), cells), (cells, gain) => ({
      kind: 'teacherSlot', weight: 'medium', confirm: `Bu ${t.name} bilan kelishilganmi?`,
      title: `${t.name}ga ${cellsText(cells)}ni ochish`, detail: `${gain} ta dars joylashadi.`,
      relax: { type: 'teacherSlot', teacherId: t.id, cells },
    }));
    // 4. Limitlarni oshirish
    const limits = [
      ['maxWeeklyClasses', missing * wlDuration(wl), 'haftalik limitini'],
      ['maxClassesPerDay', 1, 'kunlik limitini'],
      ['maxWorkingDays', 1, 'ish kunlari sonini'],
    ];
    for (const [field, inc, label] of limits) {
      if (field === 'maxWorkingDays' && (Number(t.maxWorkingDays) || 7) >= ctx.workDays.length) continue;
      const r = simulate(data, wlId, (d2) => { const tt = d2.teachers.find((x) => x.id === t.id); tt[field] = (Number(tt[field]) || 0) + inc; });
      if (r.placed > base) add({ kind: 'teacherLimit', weight: 'medium', confirm: `Bu ${t.name} bilan kelishilganmi?`, gain: r.placed - base, title: `${t.name}ning ${label} +${inc} qilish`, detail: `${t[field]} → ${(Number(t[field]) || 0) + inc}. ${r.placed - base} ta dars joylashadi.`, relax: { type: 'teacherLimit', teacherId: t.id, field, value: (Number(t[field]) || 0) + inc } });
    }
  }

  // 5. Guruhga slot ochish
  for (const c of cellsGroupClosed.slice(0, 4)) {
    const g = groups.find((x) => !groupAvail(ctx, x, c.day, c.slotId));
    if (!g) continue;
    tryCells('groupSlot', [[c]], (d2, cells) => openAv(d2.groups.find((x) => x.id === g.id), cells), (cells, gain) => ({
      kind: 'groupSlot', weight: 'medium', title: `${g.name} guruhiga ${cellsText(cells)}ni ochish`, detail: `${gain} ta dars joylashadi.`,
      relax: { type: 'groupSlot', groupId: g.id, cells },
    }));
  }

  // 6. Boshqa malakali o‘qituvchiga o‘tkazish
  const others = [...ctx.teachers.values()].filter((x) => x.active !== false && x.id !== wl.teacherId && (x.subjectIds || []).includes(wl.subjectId));
  for (const o of others.slice(0, 4)) {
    const r = simulate(data, wlId, (d2) => {
      const w2 = d2.workloads.find((x) => x.id === wlId);
      w2.teacherId = o.id;
      d2.schedule.lessons = d2.schedule.lessons.filter((l) => l.workloadId !== wlId);
    });
    if (r.placed > base) {
      const load = new Occupancy(ctx, data.schedule.lessons).teacherWeekUnits(o.id);
      add({ kind: 'transfer', weight: 'medium', gain: r.placed - base, title: `Yuklamani ${o.name}ga o‘tkazish`, detail: `${r.placed} ta dars joylashadi (hozir ${base}). ${o.name} yuklamasi ${load + r.placed * wlDuration(wl)}/${o.maxWeeklyClasses || '∞'}.`, relax: { type: 'transfer', teacherId: o.id } });
    }
  }

  // 7. Qulflangan darsni ochish (og‘ir)
  const lockedSeen = new Set();
  for (const c of dom) {
    if (lockedSeen.size >= 2) break;
    const bl = blockersOf(ctx, occ, { wl, ...c });
    const lk = bl.filter((b) => b.lesson.locked);
    if (!lk.length || lk.length !== bl.length || bl.length > 1) continue;
    const b = lk[0];
    if (lockedSeen.has(b.id)) continue;
    lockedSeen.add(b.id);
    const r = simulate(data, wlId, (d2) => { d2.schedule.lessons.find((l) => l.id === b.id).locked = false; }, [b.wl.id]);
    if (r.placed > base) add({ kind: 'unlock', weight: 'heavy', confirm: 'Qulflangan dars ko‘chiriladi. Davom etasizmi?', gain: r.placed - base, title: `Qulflangan darsni ochish: ${wlLabel(ctx, b.wl)} (${dayName(b.day)}, ${slotName(ctx, b.slotIds[0])})`, detail: `Generator uni boshqa joyga ko‘chiradi, ${r.placed - base} ta dars joylashadi.`, relax: { type: 'unlock', lessonId: b.id, extraWl: b.wl.id } });
  }

  // 8. Xona turi talabini yumshatish (og‘ir)
  if (wlRoomType(ctx, wl) !== 'regular' && !out.length) {
    const r = simulate(data, wlId, (d2) => { d2.workloads.find((x) => x.id === wlId).roomType = 'regular'; });
    if (r.placed > base) add({ kind: 'roomType', weight: 'heavy', confirm: 'Dars maxsus xonasiz o‘tadi. Davom etasizmi?', gain: r.placed - base, title: 'Oddiy xonadan foydalanishga ruxsat berish', detail: `${r.placed - base} ta dars joylashadi, lekin maxsus jihozlar bo‘lmaydi.`, relax: { type: 'roomType' } });
  }

  out.sort((a, b) => b.gain - a.gain || WEIGHT[a.weight] - WEIGHT[b.weight] || (a.cellsCount || 1) - (b.cellsCount || 1));
  // Bir xil turdagi takroriy takliflarni kamaytirish (har turdan ko‘pi bilan 2 ta)
  const perKind = new Map();
  const res = [];
  for (const s of out) {
    const n = perKind.get(s.kind) || 0;
    if (n >= 2) continue;
    perKind.set(s.kind, n + 1);
    res.push(s);
  }
  return res.slice(0, limit);
}

// Maslahatni qo‘llash (store.update ichida chaqiriladi). Qaytaradi: joylashgan darslar soni
export function applySuggestion(data, s) {
  const r = s.relax;
  const wlId = s.workloadId;
  const before = placedCount(data.schedule.lessons, wlId);
  if (r.type === 'moveBlocker') {
    const b = data.schedule.lessons.find((l) => l.id === r.lessonId);
    if (!b) throw new Error('Ko‘chiriladigan dars topilmadi.');
    Object.assign(b, r.to);
    // tekshiruv: yangi joylar haqiqatan to‘g‘rimi
    const ctx = buildContext(data);
    const occ = new Occupancy(ctx, data.schedule.lessons.filter((l) => l.id !== b.id));
    const bwl = ctx.workloads.get(b.workloadId);
    if (!isValid(ctx, occ, { wl: bwl, day: b.day, slotId: b.slotId, roomId: b.roomId, parity: b.weekParity })) throw new Error('Jadval o‘zgargan — maslahat endi mos emas. Qayta tahlil qiling.');
    occ.add(b);
    const wl = ctx.workloads.get(wlId);
    const cand = { wl, ...r.place, parity: 'all' };
    if (!isValid(ctx, occ, cand)) throw new Error('Jadval o‘zgargan — maslahat endi mos emas. Qayta tahlil qiling.');
    data.schedule.lessons.push({ id: uid('les'), workloadId: wlId, day: r.place.day, slotId: r.place.slotId, roomId: r.place.roomId, weekParity: 'all', locked: false, source: 'manual', explanation: null });
    return 1;
  }
  const extra = [];
  const openCells = (obj) => {
    if (!obj) throw new Error('Obyekt topilmadi — ma\'lumot o‘zgargan.');
    obj.availability = obj.availability || {};
    for (const c of r.cells || [{ day: r.day, slotId: r.slotId }]) obj.availability[c.day] = [...new Set([...(obj.availability[c.day] || []), c.slotId])];
  };
  if (r.type === 'roomSlot') openCells(data.rooms.find((x) => x.id === r.roomId));
  else if (r.type === 'teacherSlot') openCells(data.teachers.find((x) => x.id === r.teacherId));
  else if (r.type === 'teacherLimit') {
    data.teachers.find((x) => x.id === r.teacherId)[r.field] = r.value;
  } else if (r.type === 'groupSlot') openCells(data.groups.find((x) => x.id === r.groupId)); else if (r.type === 'transfer') {
    const w = data.workloads.find((x) => x.id === wlId);
    data.transfers = data.transfers || [];
    data.transfers.push({ id: uid('trf'), workloadId: wlId, fromTeacherId: w.teacherId, toTeacherId: r.teacherId, effectiveDate: new Date().toISOString().slice(0, 10), reason: 'Maslahatchi taklifi', movedLessons: [], unscheduledCount: 0, createdAt: new Date().toISOString() });
    w.teacherId = r.teacherId;
    data.schedule.lessons = data.schedule.lessons.filter((l) => l.workloadId !== wlId);
  } else if (r.type === 'unlock') {
    const l = data.schedule.lessons.find((x) => x.id === r.lessonId);
    if (l) l.locked = false;
    extra.push(r.extraWl);
  } else if (r.type === 'roomType') {
    data.workloads.find((x) => x.id === wlId).roomType = 'regular';
  }
  const res = generateSchedule(data, { mode: 'fast', keep: 'onlyUnscheduled', scope: { workloadIds: [wlId, ...extra] }, timeBudgetMs: 300, seed: 7 });
  data.schedule.lessons = res.lessons;
  return placedCount(res.lessons, wlId) - (r.type === 'transfer' ? 0 : before);
}

export { globalAdvice };
