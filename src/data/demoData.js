// Demo ma'lumotlar — generatorni real sinash uchun ataylab turli cheklovlar bilan.
import { emptyData, defaultTimeslots, fullAvailability } from './defaults.js';
import { nowIso } from '../utils/id.js';

const S = (...n) => n.map((i) => `slot_${i}`);
const range = (a, b) => S(...Array.from({ length: b - a + 1 }, (_, i) => a + i));

export function createDemoData() {
  const d = emptyData();
  const ts = nowIso();
  const stamp = (o) => ({ ...o, createdAt: ts, updatedAt: ts });
  d.timeslots = defaultTimeslots();
  const days6 = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const shift = (n) => fullAvailability(n === 1 ? range(1, 4) : range(3, 6), days6);

  d.settings.instituteName = 'Sharq tillari instituti (demo)';

  d.groups = [
    stamp({ id: 'grp_101', name: '101-Xitoy', course: 1, direction: 'Xitoy filologiyasi', faculty: 'Sharq tillari', studentCount: 30, shift: 1, availability: shift(1), maxLessonsPerDay: 4, active: true,
      subgroups: [{ id: 'sub_101a', name: '101-Xitoy (1)', studentCount: 15 }, { id: 'sub_101b', name: '101-Xitoy (2)', studentCount: 15 }] }),
    stamp({ id: 'grp_102', name: '102-Xitoy', course: 1, direction: 'Xitoy filologiyasi', faculty: 'Sharq tillari', studentCount: 28, shift: 1, availability: shift(1), maxLessonsPerDay: 4, subgroups: [], active: true }),
    stamp({ id: 'grp_201', name: '201-Xitoy', course: 2, direction: 'Xitoy filologiyasi', faculty: 'Sharq tillari', studentCount: 26, shift: 1, availability: shift(1), maxLessonsPerDay: 4, subgroups: [], active: true }),
    stamp({ id: 'grp_202', name: '202-Ingliz', course: 2, direction: 'Ingliz filologiyasi', faculty: 'G‘arb tillari', studentCount: 24, shift: 2, availability: shift(2), maxLessonsPerDay: 4, subgroups: [], active: true }),
    stamp({ id: 'grp_301', name: '301-Ingliz', course: 3, direction: 'Ingliz filologiyasi', faculty: 'G‘arb tillari', studentCount: 32, shift: 1, availability: shift(1), maxLessonsPerDay: 4, subgroups: [], active: true }),
  ];

  const T = (o) => stamp({ phone: '', building: 'A', maxConsecutive: 3, absences: [], active: true, preferredDays: [], preferredSlots: [], ...o });
  d.teachers = [
    T({ id: 'tch_zhang', name: 'Zhang Wei', color: '#e4572e', subjectIds: ['sub_chinese', 'sub_chinese_speaking'],
      minWorkingDays: 4, maxWorkingDays: 4, minClassesPerDay: 1, maxClassesPerDay: 4, maxWeeklyClasses: 16,
      availability: { monday: range(1, 3), tuesday: range(2, 5), wednesday: [], thursday: range(1, 3), friday: range(2, 5), saturday: [] },
      preferredDays: ['monday', 'tuesday', 'thursday', 'friday'], preferredSlots: S(2, 3) }),
    T({ id: 'tch_lina', name: 'Li Na', color: '#f59e0b', subjectIds: ['sub_chinese', 'sub_chinese_speaking', 'sub_hieroglyph'],
      minWorkingDays: 3, maxWorkingDays: 5, minClassesPerDay: 1, maxClassesPerDay: 4, maxWeeklyClasses: 18,
      availability: { monday: range(1, 5), tuesday: range(1, 4), wednesday: range(1, 5), thursday: range(3, 6), friday: range(1, 4), saturday: range(1, 3) },
      preferredSlots: S(1, 2) }),
    T({ id: 'tch_karimov', name: 'Aziz Karimov', color: '#3b82f6', building: 'B', subjectIds: ['sub_history', 'sub_philosophy'],
      minWorkingDays: 3, maxWorkingDays: 5, minClassesPerDay: 1, maxClassesPerDay: 3, maxWeeklyClasses: 12,
      availability: fullAvailability(range(1, 4), days6) }),
    T({ id: 'tch_saidova', name: 'Dilnoza Saidova', color: '#ec4899', subjectIds: ['sub_english', 'sub_english_speaking'],
      minWorkingDays: 3, maxWorkingDays: 4, minClassesPerDay: 1, maxClassesPerDay: 3, maxWeeklyClasses: 10,
      availability: { monday: range(4, 6), tuesday: range(4, 6), wednesday: range(4, 6), thursday: range(4, 6), friday: [], saturday: [] } }),
    T({ id: 'tch_johnson', name: 'Emily Johnson', color: '#10b981', subjectIds: ['sub_english', 'sub_english_speaking'],
      minWorkingDays: 3, maxWorkingDays: 5, minClassesPerDay: 1, maxClassesPerDay: 3, maxWeeklyClasses: 12,
      availability: fullAvailability(range(1, 4), ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']) }),
    T({ id: 'tch_rahimov', name: 'Bobur Rahimov', color: '#8b5cf6', subjectIds: ['sub_it'],
      minWorkingDays: 2, maxWorkingDays: 3, minClassesPerDay: 1, maxClassesPerDay: 4, maxWeeklyClasses: 10,
      availability: { monday: range(1, 6), wednesday: range(1, 6), friday: range(1, 6) } }),
    T({ id: 'tch_yusupova', name: 'Malika Yusupova', color: '#14b8a6', subjectIds: ['sub_uzbek'],
      minWorkingDays: 2, maxWorkingDays: 4, minClassesPerDay: 1, maxClassesPerDay: 3, maxWeeklyClasses: 10,
      availability: fullAvailability(range(1, 5), days6) }),
    T({ id: 'tch_ahmedov', name: 'Jasur Ahmedov', color: '#64748b', building: 'B', subjectIds: ['sub_economics'],
      minWorkingDays: 1, maxWorkingDays: 3, minClassesPerDay: 1, maxClassesPerDay: 4, maxWeeklyClasses: 8,
      availability: { tuesday: range(1, 6), thursday: range(1, 6), saturday: range(1, 6) } }),
  ];

  const Sub = (id, name, code, icon, roomType) => stamp({ id, name, code, icon, roomType, required: true, active: true });
  d.subjects = [
    Sub('sub_chinese', 'Xitoy tili', 'XT-101', '🇨🇳', 'regular'),
    Sub('sub_chinese_speaking', 'Xitoy tili (og‘zaki)', 'XT-102', '🗣️', 'language_lab'),
    Sub('sub_hieroglyph', 'Xitoy yozuvi', 'XT-201', '✍️', 'regular'),
    Sub('sub_english', 'Ingliz tili', 'IN-101', '🇬🇧', 'regular'),
    Sub('sub_english_speaking', 'Ingliz tili (og‘zaki)', 'IN-102', '🎧', 'language_lab'),
    Sub('sub_history', 'O‘zbekiston tarixi', 'TR-101', '📜', 'regular'),
    Sub('sub_philosophy', 'Falsafa', 'FL-201', '🤔', 'regular'),
    Sub('sub_it', 'Informatika', 'IT-101', '💻', 'computer'),
    Sub('sub_uzbek', 'O‘zbek tili', 'UZ-101', '📘', 'regular'),
    Sub('sub_economics', 'Iqtisodiyot asoslari', 'IQ-301', '📈', 'regular'),
  ];

  const W = (id, subjectId, teacherId, target, lessonsPerWeek, extra = {}) => stamp({
    id, subjectId, teacherId, target: { type: 'group', subgroupId: null, ...target }, lessonsPerWeek,
    biweeklyLessons: 0, durationSlots: 1, distribution: 'spread', customDistribution: null,
    roomType: null, fixedRoomId: null, preference: { days: [], slots: [], priority: 'medium' }, active: true, ...extra,
  });
  const g = (...ids) => ({ groupIds: ids });
  d.workloads = [
    W('wl_101_ch', 'sub_chinese', 'tch_zhang', g('grp_101'), 4, { preference: { days: ['monday', 'tuesday', 'thursday', 'friday'], slots: S(2), priority: 'medium' } }),
    W('wl_101_sp1', 'sub_chinese_speaking', 'tch_lina', { type: 'subgroup', groupIds: ['grp_101'], subgroupId: 'sub_101a' }, 2),
    W('wl_101_sp2', 'sub_chinese_speaking', 'tch_lina', { type: 'subgroup', groupIds: ['grp_101'], subgroupId: 'sub_101b' }, 2),
    W('wl_102_ch', 'sub_chinese', 'tch_zhang', g('grp_102'), 4),
    W('wl_102_hier', 'sub_hieroglyph', 'tch_lina', g('grp_102'), 1, { durationSlots: 2 }),
    W('wl_201_ch', 'sub_chinese', 'tch_lina', g('grp_201'), 4, { distribution: 'pairs' }),
    W('wl_201_hier', 'sub_hieroglyph', 'tch_lina', g('grp_201'), 1, { biweeklyLessons: 1 }),
    W('wl_201_sp', 'sub_chinese_speaking', 'tch_lina', g('grp_201'), 2),
    W('wl_hist_stream', 'sub_history', 'tch_karimov', { type: 'stream', groupIds: ['grp_101', 'grp_102'] }, 2, { roomType: 'lecture_hall' }),
    W('wl_201_phil', 'sub_philosophy', 'tch_karimov', g('grp_201'), 2),
    W('wl_301_hist', 'sub_history', 'tch_karimov', g('grp_301'), 2),
    // Tanlov bloki: 301-Ingliz talabalari ikkiga bo‘linib, bir vaqtda Falsafa yoki Iqtisodiyotni tanlaydi
    W('wl_301_el_phil', 'sub_philosophy', 'tch_karimov', { type: 'elective', groupIds: ['grp_301'], electiveBlock: 'Tanlov-1 (301)' }, 2, { studentCount: 17 }),
    W('wl_301_el_econ', 'sub_economics', 'tch_ahmedov', { type: 'elective', groupIds: ['grp_301'], electiveBlock: 'Tanlov-1 (301)' }, 2, { studentCount: 15 }),
    W('wl_301_en', 'sub_english', 'tch_johnson', g('grp_301'), 4),
    W('wl_202_en', 'sub_english', 'tch_saidova', g('grp_202'), 4),
    W('wl_202_ensp', 'sub_english_speaking', 'tch_saidova', g('grp_202'), 2),
    W('wl_101_it', 'sub_it', 'tch_rahimov', g('grp_101'), 2),
    W('wl_202_it', 'sub_it', 'tch_rahimov', g('grp_202'), 2),
    W('wl_101_uz', 'sub_uzbek', 'tch_yusupova', g('grp_101'), 2),
    W('wl_102_uz', 'sub_uzbek', 'tch_yusupova', g('grp_102'), 2),
    W('wl_202_uz', 'sub_uzbek', 'tch_yusupova', g('grp_202'), 2),
    W('wl_301_econ', 'sub_economics', 'tch_ahmedov', g('grp_301'), 1, { durationSlots: 2 }),
  ];

  const R = (o) => stamp({ floor: 1, equipment: [], active: true, ...o });
  const all6 = fullAvailability(range(1, 6), days6);
  d.rooms = [
    R({ id: 'room_205', number: '205', building: 'A', floor: 2, capacity: 35, type: 'regular', equipment: ['projector'],
      availability: { monday: range(1, 5), tuesday: range(1, 3), wednesday: [], thursday: range(1, 6), friday: range(1, 6), saturday: range(1, 6) } }),
    R({ id: 'room_206', number: '206', building: 'A', floor: 2, capacity: 30, type: 'regular', availability: all6 }),
    R({ id: 'room_301', number: '301', building: 'A', floor: 3, capacity: 30, type: 'computer', equipment: ['computers', 'projector'], availability: all6 }),
    R({ id: 'room_110', number: '110', building: 'A', floor: 1, capacity: 30, type: 'language_lab', equipment: ['headphones', 'projector'],
      availability: { monday: range(1, 3), tuesday: range(1, 3), wednesday: [], thursday: range(1, 3), friday: range(1, 3), saturday: [] } }),
    R({ id: 'room_zal', number: 'Zal-1', building: 'B', floor: 1, capacity: 80, type: 'lecture_hall', equipment: ['projector', 'microphone'], availability: all6 }),
    R({ id: 'room_102', number: '102', building: 'B', floor: 1, capacity: 35, type: 'regular', availability: all6 }),
  ];

  // Haftalik tadbir: kafedra majlisi (generator bu vaqtni chetlab o‘tadi)
  d.events = [
    { id: 'ev_kafedra', title: 'Kafedra majlisi', repeat: 'weekly', day: 'wednesday', slotIds: ['slot_4'], teacherIds: ['tch_karimov', 'tch_yusupova'], groupIds: [], roomIds: [], cancelAffected: false, note: 'Ijtimoiy fanlar kafedrasi', createdAt: ts, updatedAt: ts },
  ];
  d.meta.initialized = true;
  d.meta.demo = true;
  return d;
}
