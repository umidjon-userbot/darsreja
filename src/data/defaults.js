import { ROOM_TYPES_DEFAULT } from '../i18n/uz.js';

export const SCHEMA_VERSION = 4;

export const DEFAULT_WEIGHTS = {
  S1: 300, S2: 100, S3: 10, S4: 10,
  S5_low: 5, S5_medium: 20, S5_high: 60,
  S6: 5, S7: 8, S8: 15, S9: 20, S10: 15, S11: 3, S12: 25, S13: 3, S14: 2, S15: 80,
};

export const DEFAULT_MODES = { fast: 2000, optimal: 10000, max: 30000 };

export function defaultTimeslots() {
  const t = [
    ['08:30', '09:50'], ['10:00', '11:20'], ['11:30', '12:50'],
    ['13:30', '14:50'], ['15:00', '16:20'], ['16:30', '17:50'],
  ];
  return t.map(([start, end], i) => ({
    id: `slot_${i + 1}`, name: `${i + 1}-para`, start, end, order: i + 1,
    joinableWithNext: i !== 2 && i !== 5,
  }));
}

export function defaultSettings() {
  return {
    instituteName: 'Mening o‘quv muassasam',
    logo: null,
    workDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
    defaultDurationSlots: 1,
    roomTypes: ROOM_TYPES_DEFAULT.map((x) => ({ ...x })),
    theme: 'system',
    language: 'uz',
    autoSave: true,
    weights: { ...DEFAULT_WEIGHTS },
    modes: { ...DEFAULT_MODES },
    maxConsecutive: 3,
    shifts: { 1: ['slot_1', 'slot_2', 'slot_3', 'slot_4'], 2: ['slot_3', 'slot_4', 'slot_5', 'slot_6'] },
    substitution: { allowOverLimit: false, showUnqualified: false },
    academicHoursPerSlot: 2,
    unmarkedPastIsDone: true,
    backupReminderDays: 7,
    publicBaseUrl: '',
  };
}

export function defaultCalendar() {
  return {
    academicYear: '2026/2027', semester: 1,
    startDate: '2026-09-01', endDate: '2027-01-15',
    firstWeekParity: 'odd',
    holidays: [
      { date: '2026-10-01', name: 'O‘qituvchi va murabbiylar kuni' },
      { date: '2026-12-08', name: 'Konstitutsiya kuni' },
    ],
  };
}

export function emptyData() {
  return {
    meta: { schemaVersion: SCHEMA_VERSION, lastSaved: null, initialized: false },
    groups: [], teachers: [], subjects: [], workloads: [], rooms: [],
    timeslots: defaultTimeslots(),
    calendar: defaultCalendar(),
    schedule: { lessons: [], lastRun: null },
    substitutions: [], transfers: [], conflictLog: { resolved: [], lastKeys: [] },
    versions: [], events: [], exams: defaultExams(),
    settings: defaultSettings(),
    lessonLog: {},
  };
}

export function defaultExams() {
  return {
    session: { startDate: '2027-01-04', endDate: '2027-01-23', days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'], slotIds: ['slot_1', 'slot_4'], durationSlots: 2, minGapDays: 2, proctorsPerRoom: 1 },
    items: [], schedule: [], unscheduled: [], lastRun: null,
  };
}

export function fullAvailability(slotIds, days) {
  const a = {};
  for (const d of days) a[d] = [...slotIds];
  return a;
}
