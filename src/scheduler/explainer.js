// "Nega bu slot?" — dars nima uchun aynan shu joyga qo‘yilganini tushuntirish
import { isValid } from './constraintChecker.js';
import { lessonPenalty } from './scoring.js';
import { buildDomain } from './slotGenerator.js';
import { dayName, slotLabel, wlStudents, roomTypeName, wlRoomType } from './model.js';

export function explainRec(ctx, occ, rec, domain) {
  const wl = rec.wl;
  const t = ctx.teachers.get(rec.teacherId);
  const room = ctx.rooms.get(rec.roomId);
  const need = wlStudents(ctx, wl);
  const checks = [];
  const prefSlot = t?.preferredSlots?.length && rec.slotIds.every((s) => t.preferredSlots.includes(s));
  const prefDay = t?.preferredDays?.length && t.preferredDays.includes(rec.day);
  checks.push(`O‘qituvchi mavjud${prefSlot ? ' (afzal vaqt)' : ''}${prefDay ? ', afzal kun' : ''}`);
  checks.push('Guruh bo‘sh (boshqa darsi yo‘q)');
  if (room) {
    const rt = wlRoomType(ctx, wl);
    checks.push(`${room.number}-xona bo‘sh, sig‘im ${room.capacity} ≥ ${need}${rt !== 'regular' ? `, turi mos (${roomTypeName(ctx, rt)})` : ''}`);
  }
  if (t) {
    checks.push(`Kunlik limit: ${occ.teacherDayUnits(t.id, rec.day)}/${t.maxClassesPerDay || '∞'}`);
    checks.push(`Haftalik yuklama: ${occ.teacherWeekUnits(t.id)}/${t.maxWeeklyClasses || '∞'}, ish kunlari: ${occ.teacherDays(t.id).length}/${t.maxWorkingDays || '∞'}`);
  }
  const items = [];
  const penalty = lessonPenalty(ctx, rec, items);
  // Muqobil variantlar soni (shu dars olib tashlangan holatda)
  let alternativesCount = 0;
  const dom = domain || buildDomain(ctx, wl, rec.parity === 'all' ? 'all' : 'bi');
  occ.remove(rec.id);
  try {
    for (const c of dom) {
      if (c.day === rec.day && c.slotId === rec.slotIds[0] && c.roomId === rec.roomId) continue;
      if (isValid(ctx, occ, { wl, ...c }, { skipStatic: true })) alternativesCount++;
    }
  } finally {
    occ.addRec(rec);
  }
  return {
    where: `${dayName(rec.day)}, ${slotLabel(ctx, rec.slotIds[0])}`,
    checks,
    penalty,
    breakdown: items.map((i) => ({ code: i.code, penalty: i.penalty, msg: i.msg })),
    alternativesCount,
    at: new Date().toISOString(),
  };
}
