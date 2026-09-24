// Forma validatsiyasi — tushunarli o‘zbekcha xabarlar. Natija: { maydon: xabar }
import { timeToMin, isValidDate } from '../utils/date.js';

const empty = (v) => v === undefined || v === null || String(v).trim() === '';
const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

export function validateGroup(g, data) {
  const e = {};
  if (empty(g.name)) e.name = 'Guruh nomi kiritilmagan.';
  else if (data.groups.some((x) => x.id !== g.id && x.name.trim().toLowerCase() === g.name.trim().toLowerCase())) e.name = `"${g.name}" nomli guruh allaqachon bor.`;
  const sc = num(g.studentCount);
  if (!(sc > 0)) e.studentCount = 'Talabalar soni musbat son bo‘lishi kerak.';
  else if (sc > 1000) e.studentCount = 'Talabalar soni juda katta.';
  if (g.maxLessonsPerDay !== '' && !(num(g.maxLessonsPerDay) > 0)) e.maxLessonsPerDay = 'Kunlik limit musbat son bo‘lishi kerak.';
  const subSum = (g.subgroups || []).reduce((a, s) => a + (Number(s.studentCount) || 0), 0);
  if (subSum > sc) e.subgroups = `Kichik guruhlar yig‘indisi (${subSum}) guruh sonidan (${sc}) oshmasligi kerak.`;
  if ((g.subgroups || []).some((s) => empty(s.name))) e.subgroups = 'Kichik guruh nomi kiritilmagan.';
  const av = Object.values(g.availability || {}).reduce((a, x) => a + x.length, 0);
  if (!av) e.availability = 'Guruh uchun kamida bitta o‘quv sloti belgilang.';
  return e;
}

export function validateTeacher(t, data) {
  const e = {};
  if (empty(t.name)) e.name = 'F.I.Sh. kiritilmagan.';
  else if (data.teachers.some((x) => x.id !== t.id && x.name.trim().toLowerCase() === t.name.trim().toLowerCase())) e.name = 'Bunday o‘qituvchi allaqachon bor.';
  const pairs = [['minWorkingDays', 'maxWorkingDays', 'ish kuni'], ['minClassesPerDay', 'maxClassesPerDay', 'kunlik dars']];
  for (const [a, b, l] of pairs) {
    const x = num(t[a]), y = num(t[b]);
    if (!(x >= 0)) e[a] = 'Manfiy bo‘lmagan son kiriting.';
    if (!(y > 0)) e[b] = 'Musbat son kiriting.';
    if (x > y) e[a] = `Minimal ${l} maksimaldan katta bo‘lishi mumkin emas.`;
  }
  if (num(t.maxWorkingDays) > 7) e.maxWorkingDays = 'Haftada 7 kundan ko‘p emas.';
  if (!(num(t.maxWeeklyClasses) > 0)) e.maxWeeklyClasses = 'Haftalik maksimal dars musbat son bo‘lishi kerak.';
  if (!(num(t.maxConsecutive) > 0)) e.maxConsecutive = 'Musbat son kiriting.';
  const av = Object.values(t.availability || {}).reduce((a, x) => a + x.length, 0);
  if (!av) e.availability = 'O‘qituvchi uchun kamida bitta mavjud vaqt belgilang (availability).';
  if (t.phone && !/^[+\d\s()-]{5,20}$/.test(t.phone)) e.phone = 'Telefon raqami noto‘g‘ri.';
  return e;
}

export function validateSubject(s, data) {
  const e = {};
  if (empty(s.name)) e.name = 'Fan nomi kiritilmagan.';
  else if (data.subjects.some((x) => x.id !== s.id && x.name.trim().toLowerCase() === s.name.trim().toLowerCase())) e.name = 'Bunday fan allaqachon bor.';
  if (s.code && data.subjects.some((x) => x.id !== s.id && x.code && x.code.toLowerCase() === s.code.toLowerCase())) e.code = 'Bu kod boshqa fanda ishlatilgan.';
  return e;
}

export function validateWorkload(w, data) {
  const e = {};
  if (empty(w.subjectId)) e.subjectId = 'Fan tanlanmagan.';
  if (empty(w.teacherId)) e.teacherId = 'O‘qituvchi tanlanmagan (yuklama o‘qituvchisiz bo‘lmaydi).';
  const gids = w.target?.groupIds || [];
  if (!gids.length) e.groupIds = 'Kamida bitta guruh tanlang.';
  if (w.target?.type === 'stream' && gids.length < 2) e.groupIds = 'Potok uchun kamida 2 ta guruh tanlang.';
  if (w.target?.type === 'subgroup' && !w.target.subgroupId) e.subgroupId = 'Kichik guruhni tanlang.';
  if (w.target?.type === 'elective') {
    if (!String(w.target.electiveBlock || '').trim()) e.electiveBlock = 'Blok nomini kiriting (bir blokdagi variantlar bir vaqtda o‘tadi).';
    if (!(Number(w.studentCount) > 0)) e.studentCount = 'Yozilgan talabalar sonini kiriting.';
  }
  const lp = num(w.lessonsPerWeek), bi = num(w.biweeklyLessons || 0);
  if (!(lp >= 0) || !Number.isInteger(lp)) e.lessonsPerWeek = 'Dars soni 0 yoki musbat butun son bo‘lishi kerak.';
  else if (lp > 30) e.lessonsPerWeek = 'Haftasiga 30 tadan ortiq dars — noto‘g‘ri qiymat.';
  if (!(bi >= 0) || !Number.isInteger(bi)) e.biweeklyLessons = 'Butun son kiriting.';
  if (lp + bi === 0 && !e.lessonsPerWeek) e.lessonsPerWeek = 'Haftalik yoki 2 haftalik darslar sonidan kamida bittasi 0 dan katta bo‘lsin.';
  const dur = num(w.durationSlots);
  if (!(dur >= 1 && dur <= 3)) e.durationSlots = 'Davomiylik 1–3 slot.';
  if (w.distribution === 'custom') {
    const arr = w.customDistribution || [];
    if (!arr.length || arr.some((x) => !(x > 0))) e.customDistribution = 'Masalan: 2,1,1 (kunlar bo‘yicha darslar).';
    else if (arr.reduce((a, b) => a + b, 0) !== lp) e.customDistribution = `Yig‘indi haftalik darslar soniga (${lp}) teng bo‘lishi kerak.`;
  }
  const t = data.teachers.find((x) => x.id === w.teacherId);
  if (t && w.subjectId && t.subjectIds?.length && !t.subjectIds.includes(w.subjectId)) e._warn = `${t.name} bu fanni o‘tadiganlar ro‘yxatida yo‘q (ogohlantirish).`;
  return e;
}

export function validateRoom(r, data) {
  const e = {};
  if (empty(r.number)) e.number = 'Xona raqami kiritilmagan.';
  else if (data.rooms.some((x) => x.id !== r.id && String(x.number).trim().toLowerCase() === String(r.number).trim().toLowerCase() && (x.building || '') === (r.building || ''))) e.number = 'Bu binoda bunday raqamli xona allaqachon bor.';
  if (!(num(r.capacity) > 0)) e.capacity = 'Sig‘im musbat son bo‘lishi kerak.';
  const av = Object.values(r.availability || {}).reduce((a, x) => a + x.length, 0);
  if (!av) e.availability = 'Xona uchun kamida bitta mavjud vaqt belgilang.';
  return e;
}

export function validateSlot(s, all) {
  const e = {};
  if (empty(s.name)) e.name = 'Nomi kiritilmagan.';
  if (!/^\d{2}:\d{2}$/.test(s.start || '')) e.start = 'Vaqt formati HH:MM.';
  if (!/^\d{2}:\d{2}$/.test(s.end || '')) e.end = 'Vaqt formati HH:MM.';
  if (!e.start && !e.end && timeToMin(s.start) >= timeToMin(s.end)) e.end = 'Tugash vaqti boshlanishdan keyin bo‘lishi kerak.';
  if (!e.start && !e.end) {
    const clash = all.find((x) => x.id !== s.id && timeToMin(x.start) < timeToMin(s.end) && timeToMin(s.start) < timeToMin(x.end));
    if (clash) e.start = `"${clash.name}" (${clash.start}–${clash.end}) bilan ustma-ust tushadi.`;
  }
  return e;
}

export function validateCalendar(c) {
  const e = {};
  if (!isValidDate(c.startDate)) e.startDate = 'Sana noto‘g‘ri.';
  if (!isValidDate(c.endDate)) e.endDate = 'Sana noto‘g‘ri.';
  if (!e.startDate && !e.endDate && c.startDate >= c.endDate) e.endDate = 'Tugash sanasi boshlanishdan keyin bo‘lishi kerak.';
  if (!/^\d{4}\/\d{4}$/.test(c.academicYear || '')) e.academicYear = 'Format: 2026/2027';
  return e;
}
