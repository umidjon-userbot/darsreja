// Ma'lumotlardan tezkor kontekst (Map'lar, slot tartibi) yaratish.
// DOM'ga bog‘liq emas — Web Worker va testlarda ham ishlaydi.
import { DAYS } from '../i18n/uz.js';
import { DEFAULT_WEIGHTS } from '../data/defaults.js';

export function buildContext(data) {
  const byId = (arr) => new Map((arr || []).map((x) => [x.id, x]));
  const slots = [...(data.timeslots || [])].sort((a, b) => a.order - b.order);
  const slotIdx = new Map(slots.map((s, i) => [s.id, i]));
  const settings = data.settings || {};
  const ctx = {
    data,
    settings,
    weights: { ...DEFAULT_WEIGHTS, ...(settings.weights || {}) },
    teachers: byId(data.teachers),
    groups: byId(data.groups),
    rooms: byId(data.rooms),
    subjects: byId(data.subjects),
    workloads: byId(data.workloads),
    slots,
    slotIdx,
    workDays: settings.workDays || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
    lastSlotIdx: slots.length - 1,
    maxConsecutiveDefault: settings.maxConsecutive || 3,
  };
  ctx.subgroupOwner = new Map();
  for (const g of data.groups || []) for (const s of g.subgroups || []) ctx.subgroupOwner.set(s.id, g.id);
  // Haftalik takrorlanuvchi tadbirlar shablonda resursni band qiladi (generator ularni chetlab o‘tadi)
  ctx.weeklyBlocks = new Map();
  for (const e of data.events || []) {
    if (e.repeat !== 'weekly') continue;
    for (const s of e.slotIds || []) {
      for (const t of e.teacherIds || []) ctx.weeklyBlocks.set(`t|${t}|${e.day}|${s}`, e.title);
      for (const g of e.groupIds || []) ctx.weeklyBlocks.set(`g|${g}|${e.day}|${s}`, e.title);
      for (const r of e.roomIds || []) ctx.weeklyBlocks.set(`r|${r}|${e.day}|${s}`, e.title);
    }
  }
  // Tanlov fanlari bloklari: blok nomi → yuklamalar
  ctx.blocks = new Map();
  for (const w of data.workloads || []) {
    if (w.target?.type !== 'elective' || !w.target.electiveBlock || w.active === false) continue;
    if (!ctx.blocks.has(w.target.electiveBlock)) ctx.blocks.set(w.target.electiveBlock, []);
    ctx.blocks.get(w.target.electiveBlock).push(w.id);
  }
  return ctx;
}

export const dayName = (d) => DAYS[d] || d;

export function slotName(ctx, slotId) {
  const s = ctx.slots[ctx.slotIdx.get(slotId)];
  return s ? s.name : slotId;
}

export function slotLabel(ctx, slotId) {
  const s = ctx.slots[ctx.slotIdx.get(slotId)];
  return s ? `${s.name} (${s.start})` : slotId;
}

// Workload qaysi guruh "birliklarini" band qiladi: {g, sub}
export function wlUnits(wl) {
  const t = wl.target || {};
  if (t.type === 'subgroup') return [{ g: t.groupIds?.[0], sub: t.subgroupId }];
  // Tanlov fani: guruh talabalari blokdagi parallel variantlarga bo‘linadi
  if (t.type === 'elective') return (t.groupIds || []).map((g) => ({ g, sub: null, block: t.electiveBlock || wl.id }));
  return (t.groupIds || []).map((g) => ({ g, sub: null }));
}

export function wlGroupIds(wl) {
  return [...new Set((wl.target?.groupIds || []).filter(Boolean))];
}

export function wlStudents(ctx, wl) {
  const t = wl.target || {};
  if (t.type === 'elective') return Number(wl.studentCount) || 0;
  if (t.type === 'subgroup') {
    const g = ctx.groups.get(t.groupIds?.[0]);
    const s = g?.subgroups?.find((x) => x.id === t.subgroupId);
    return s ? Number(s.studentCount) || 0 : 0;
  }
  return (t.groupIds || []).reduce((sum, id) => sum + (Number(ctx.groups.get(id)?.studentCount) || 0), 0);
}

export function wlRoomType(ctx, wl) {
  return wl.roomType || ctx.subjects.get(wl.subjectId)?.roomType || 'regular';
}

export function isElective(wl) {
  return wl?.target?.type === 'elective';
}

export function wlDuration(wl) {
  return Math.max(1, Math.min(3, Number(wl.durationSlots) || 1));
}

export function wlTargetName(ctx, wl) {
  const t = wl.target || {};
  if (t.type === 'elective') return `Tanlov "${t.electiveBlock || '?'}" (${(t.groupIds || []).map((id) => ctx.groups.get(id)?.name || '?').join(', ')})`;
  if (t.type === 'subgroup') {
    const g = ctx.groups.get(t.groupIds?.[0]);
    const s = g?.subgroups?.find((x) => x.id === t.subgroupId);
    return s ? s.name : (g ? g.name + ' (kichik guruh)' : '—');
  }
  const names = (t.groupIds || []).map((id) => ctx.groups.get(id)?.name || '?');
  return names.join(', ') || '—';
}

export function wlLabel(ctx, wl) {
  const s = ctx.subjects.get(wl.subjectId);
  return `${s?.name || '?'} · ${wlTargetName(ctx, wl)}`;
}

export function unitsOverlap(a, b) {
  // a, b: {g, sub, block}. Butun guruh har qanday kichik guruh bilan to‘qnashadi.
  // Bitta tanlov blokining variantlari bir vaqtda o‘tadi — o‘zaro to‘qnashmaydi.
  if (a.g !== b.g) return false;
  if (a.block && a.block === b.block) return false;
  if (!a.sub || !b.sub) return true;
  return a.sub === b.sub;
}

export function parityOverlap(a, b) {
  return a === 'all' || b === 'all' || a === b;
}

// Darsning egallagan slotlari (2 slotli darslar uchun ketma-ket)
export function lessonSlotIds(ctx, lesson, wl) {
  const start = ctx.slotIdx.get(lesson.slotId);
  if (start === undefined) return [];
  const dur = wl ? wlDuration(wl) : 1;
  const out = [];
  for (let i = 0; i < dur; i++) {
    const s = ctx.slots[start + i];
    if (s) out.push(s.id);
  }
  return out;
}

export function roomTypeName(ctx, typeId) {
  return ctx.settings.roomTypes?.find((t) => t.id === typeId)?.name || typeId;
}

export function roomTypeOk(requiredType, room) {
  if (!requiredType || requiredType === 'regular') return true;
  return room.type === requiredType;
}

export function isAvail(av, day, slotId) {
  const arr = av?.[day];
  return Array.isArray(arr) && arr.includes(slotId);
}

// Guruh availability: agar belgilanmagan bo‘lsa — smena bo‘yicha, u ham bo‘lmasa — hamma slot
export function groupAvail(ctx, group, day, slotId) {
  if (!ctx.workDays.includes(day)) return false;
  if (group.availability && Object.keys(group.availability).length) return isAvail(group.availability, day, slotId);
  const shiftSlots = ctx.settings.shifts?.[group.shift];
  if (shiftSlots) return shiftSlots.includes(slotId);
  return true;
}

export function teacherAvailCount(ctx, t) {
  let n = 0;
  for (const d of ctx.workDays) n += (t.availability?.[d] || []).filter((s) => ctx.slotIdx.has(s)).length;
  return n;
}

export function roomAvailCount(ctx, r) {
  let n = 0;
  for (const d of ctx.workDays) n += (r.availability?.[d] || []).filter((s) => ctx.slotIdx.has(s)).length;
  return n;
}

export function wlRequired(wl) {
  return { all: Math.max(0, Number(wl.lessonsPerWeek) || 0), bi: Math.max(0, Number(wl.biweeklyLessons) || 0) };
}

export function teacherMaxDays(t) {
  return Number(t.maxWorkingDays) || 7;
}
