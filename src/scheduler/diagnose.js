// Joylashtirilmagan dars uchun aniq sabab (kod + batafsil izoh)
import { checkPlacement } from './constraintChecker.js';
import { candidateRooms, commonSlots } from './slotGenerator.js';
import { wlRoomType, wlStudents, roomTypeName, teacherAvailCount, wlDuration } from './model.js';

export function diagnoseWorkload(ctx, occ, wl, domain, parity = 'all') {
  const t = ctx.teachers.get(wl.teacherId);
  if (!t) return { code: 'NO_TEACHER', detail: 'Yuklamaga o‘qituvchi biriktirilmagan.' };
  const g = (wl.target?.groupIds || []).map((id) => ctx.groups.get(id));
  if (t.active === false || wl.active === false || g.some((x) => !x || x.active === false) || ctx.subjects.get(wl.subjectId)?.active === false) {
    return { code: 'INACTIVE', detail: 'O‘qituvchi, guruh, fan yoki yuklama nofaol.' };
  }
  const rt = wlRoomType(ctx, wl);
  const need = wlStudents(ctx, wl);
  const allRooms = [...ctx.rooms.values()].filter((r) => r.active !== false);
  const typed = rt === 'regular' ? allRooms : allRooms.filter((r) => r.type === rt);
  if (!typed.length) return { code: 'NO_ROOM_TYPE', detail: `"${roomTypeName(ctx, rt)}" turidagi faol xona yo‘q.` };
  if (!candidateRooms(ctx, wl).length) {
    const mx = Math.max(...typed.map((r) => Number(r.capacity) || 0));
    return { code: 'NO_ROOM_CAPACITY', detail: `${need} talaba uchun xona kerak, "${roomTypeName(ctx, rt)}" turidagi eng katta xona — ${mx} o‘rin.` };
  }
  const common = commonSlots(ctx, wl);
  if (!common.length) return { code: 'TEACHER_NO_AVAILABILITY', detail: `${t.name} va guruhning mavjud vaqtlari umuman kesishmaydi.` };
  if (!domain || !domain.length) {
    const rooms = candidateRooms(ctx, wl);
    const withRoom = common.filter((c) => rooms.some((r) => (r.availability?.[c.day] || []).includes(c.slotId))).length;
    const rn = rooms.map((r) => r.number).join(', ');
    if (!withRoom) {
      return { code: 'NO_COMMON_SLOT', detail: `O‘qituvchi va guruh ${common.length} ta vaqtda bo‘sh, lekin mos xonalar (${rn} — ${roomTypeName(ctx, rt)}) aynan shu vaqtlarda ishlamaydi.` };
    }
    return { code: 'NO_COMMON_SLOT', detail: `O‘qituvchi va guruh ${common.length} ta vaqtda mos, ulardan ${withRoom} tasida xona bor, lekin ${wlDuration(wl)} slotli dars tanaffus chegarasini kesib o‘tadi yoki kun ish kuni emas.` };
  }
  const dur = wlDuration(wl);
  const wk = occ.teacherWeekUnits(t.id);
  if (wk + dur > (Number(t.maxWeeklyClasses) || 999)) {
    return { code: 'TEACHER_WEEKLY_LIMIT', detail: `${t.name}: haftalik limit ${t.maxWeeklyClasses}, allaqachon ${wk} ta dars joylashgan.` };
  }
  const cnt = { H1: 0, H2: 0, H3: 0, H10: 0, H12: 0, H13: 0, other: 0 };
  let locked = 0, valid = 0;
  const cells = new Set();
  const cellsBy = { H1: new Set(), H2: new Set(), H3: new Set(), H10: new Set(), H12: new Set(), H13: new Set() };
  let own = 0;
  for (const c of domain.filter((x) => x.parity === parity || parity !== 'all')) {
    const key = c.day + '|' + c.slotId;
    const v = checkPlacement(ctx, occ, { wl, ...c }, { skipStatic: true, skipCount: true });
    if (!v.length) { cells.add(key); valid++; continue; }
    // Shu yuklamaning o‘z darslari egallagan vaqtlar — "ishlatilgan", sabab emas
    const bl = v.flatMap((x) => x.blockers || []);
    if (bl.length && v.every((x) => x.blockers?.length) && bl.every((id) => occ.recs.get(id)?.wl.id === wl.id)) { own++; continue; }
    cells.add(key);
    let lk = false;
    for (const x of v) {
      if (cnt[x.code] !== undefined) { cnt[x.code]++; cellsBy[x.code].add(key); } else cnt.other++;
      if (x.blockers?.some((id) => occ.recs.get(id)?.lesson.locked)) lk = true;
    }
    if (lk) locked++;
  }
  const total = cells.size;
  const tAvail = teacherAvailCount(ctx, t);
  if (valid) return { code: 'PLACEABLE', detail: 'Hozir bo‘sh joy mavjud — qo‘lda joylashtirish yoki qayta tuzish mumkin.' };
  const parts = [];
  if (cellsBy.H1.size) parts.push(`${cellsBy.H1.size} tasida o‘qituvchi band`);
  if (cellsBy.H2.size) parts.push(`${cellsBy.H2.size} tasida guruh boshqa darsda`);
  if (cellsBy.H3.size) parts.push(`${cellsBy.H3.size} tasida mos xona band`);
  if (cellsBy.H10.size) parts.push(`${cellsBy.H10.size} tasida kunlik limit to‘lgan`);
  if (cellsBy.H12.size) parts.push(`${cellsBy.H12.size} tasida ish kunlari limiti`);
  if (cellsBy.H13.size) parts.push(`${cellsBy.H13.size} tasida guruh kunlik limiti`);
  const detail = `O‘qituvchining ${tAvail} ta mavjud slotidan ${wk} tasi band. Mumkin bo‘lgan ${total} ta vaqtdan: ${parts.join(', ') || 'boshqa sabablar'}.`;
  const nDomain = domain.length - own;
  if (!total) return { code: 'TEACHER_NO_SLOTS', detail: `Barcha mumkin vaqtlar (${own} ta) shu fanning o‘z darslari bilan band — ko‘proq mavjud vaqt kerak.` };
  if (locked && locked >= nDomain) return { code: 'LOCKED_BLOCKS', detail: detail + ' Qolgan barcha variantlar qulflangan darslar bilan band.' };
  if (cellsBy.H12.size === total) return { code: 'TEACHER_DAYS_LIMIT', detail };
  if (cellsBy.H10.size === total) return { code: 'TEACHER_DAILY_LIMIT', detail };
  if (cellsBy.H1.size >= total * 0.6) return { code: 'TEACHER_NO_SLOTS', detail };
  if (cellsBy.H2.size + cellsBy.H13.size >= total * 0.6) return { code: 'GROUP_FULL', detail };
  return { code: 'NO_COMMON_SLOT', detail };
}
