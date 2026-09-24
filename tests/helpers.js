import { emptyData, fullAvailability } from '../src/data/defaults.js';

export const S = (...n) => n.map((i) => `slot_${i}`);
export const R = (a, b) => S(...Array.from({ length: b - a + 1 }, (_, i) => a + i));
export const DAYS6 = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function teacher(o) {
  return { phone: '', color: '#888', subjectIds: [], building: 'A', minWorkingDays: 1, maxWorkingDays: 6, minClassesPerDay: 0, maxClassesPerDay: 6, maxWeeklyClasses: 36, maxConsecutive: 6, preferredDays: [], preferredSlots: [], absences: [], active: true, availability: fullAvailability(R(1, 6), DAYS6), ...o };
}
export function group(o) {
  return { course: 1, direction: '', faculty: '', studentCount: 25, shift: null, availability: fullAvailability(R(1, 6), DAYS6), maxLessonsPerDay: 6, subgroups: [], active: true, ...o };
}
export function room(o) {
  return { building: 'A', floor: 1, capacity: 40, type: 'regular', equipment: [], availability: fullAvailability(R(1, 6), DAYS6), active: true, ...o };
}
export function subject(o) {
  return { code: '', icon: '📘', roomType: 'regular', required: true, active: true, ...o };
}
export function workload(o) {
  return { biweeklyLessons: 0, durationSlots: 1, distribution: 'spread', customDistribution: null, roomType: null, fixedRoomId: null, preference: { days: [], slots: [], priority: 'medium' }, active: true, ...o, target: { type: 'group', subgroupId: null, ...(o.target || {}) } };
}

export function scenario({ teachers = [], groups = [], rooms = [], subjects = [], workloads = [], lessons = [], calendar = null, settings = {} } = {}) {
  const d = emptyData();
  d.teachers = teachers;
  d.groups = groups;
  d.rooms = rooms;
  d.subjects = subjects;
  d.workloads = workloads;
  d.schedule.lessons = lessons;
  if (calendar) d.calendar = { ...d.calendar, ...calendar };
  Object.assign(d.settings, settings);
  d.meta.initialized = true;
  return d;
}

// Asosiy Zhang Wei senariysi (TZ 52-bo‘lim)
export function zhangScenario(avail, { weekly = 12, lessons = 4 } = {}) {
  return scenario({
    teachers: [teacher({ id: 't_zhang', name: 'Zhang Wei', subjectIds: ['s_ch'], minWorkingDays: 4, maxWorkingDays: 4, minClassesPerDay: 1, maxClassesPerDay: 4, maxWeeklyClasses: weekly, availability: avail })],
    groups: [group({ id: 'g_101', name: '101-Xitoy', studentCount: 30 })],
    rooms: [room({ id: 'r_205', number: '205', capacity: 35 })],
    subjects: [subject({ id: 's_ch', name: 'Xitoy tili' })],
    workloads: [workload({ id: 'w_ch', subjectId: 's_ch', teacherId: 't_zhang', target: { groupIds: ['g_101'] }, lessonsPerWeek: lessons })],
  });
}
