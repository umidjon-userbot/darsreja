// JSON import: tekshirish → oldindan ko‘rish → atomik almashtirish (xato bo‘lsa hech narsa o‘zgarmaydi)
import { migrate, validateImport } from './migrations.js';

export function parseImport(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: ['Fayl JSON formatida emas yoki buzilgan: ' + e.message] };
  }
  const errors = validateImport(obj);
  if (errors.length) return { ok: false, errors };
  let data;
  try {
    data = migrate(JSON.parse(JSON.stringify(obj)));
  } catch (e) {
    return { ok: false, errors: ['Migratsiya xatosi: ' + e.message] };
  }
  // Ichki bog‘liqliklarni tekshirish
  const warnings = [];
  const ids = (arr) => new Set(arr.map((x) => x.id));
  const wl = ids(data.workloads), rooms = ids(data.rooms), slots = ids(data.timeslots);
  const orphan = data.schedule.lessons.filter((l) => !wl.has(l.workloadId) || !rooms.has(l.roomId) || !slots.has(l.slotId)).length;
  if (orphan) warnings.push(`${orphan} ta dars mavjud bo‘lmagan yuklama/xona/slotga bog‘langan — konflikt sifatida ko‘rinadi.`);
  const fromV = Number(obj.schemaVersion || obj.meta?.schemaVersion || 1);
  if (fromV < data.meta.schemaVersion) warnings.push(`Fayl eski versiyada (${fromV}) — avtomatik yangilandi (${data.meta.schemaVersion}).`);
  return {
    ok: true, data, warnings,
    summary: { groups: data.groups.length, teachers: data.teachers.length, subjects: data.subjects.length, workloads: data.workloads.length, rooms: data.rooms.length, timeslots: data.timeslots.length, lessons: data.schedule.lessons.length, substitutions: data.substitutions.length },
  };
}
