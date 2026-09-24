// Demo ma'lumotlarni yuklash: demo data + avtomatik jadval + 1 ta vaqtincha almashtirish namunasi
import { createDemoData } from '../data/demoData.js';
import { generateSchedule } from '../scheduler/scheduler.js';
import { applyTemporary } from '../substitution/substitutionService.js';
import { todayStr, addDays } from '../utils/date.js';
import { uid } from '../utils/id.js';
import { publishVersion } from '../analysis/versions.js';
import { examsFromWorkloads, scheduleExams } from '../exams/examScheduler.js';

export function buildDemo({ today = todayStr(), timeBudgetMs = 1200 } = {}) {
  const d = createDemoData();
  const r = generateSchedule(d, { mode: 'fast', keep: 'replace', timeBudgetMs, seed: 2026 });
  d.schedule.lessons = r.lessons;
  d.schedule.lastRun = { at: new Date().toISOString(), stats: r.stats, unscheduled: r.unscheduled, feasibility: r.feasibility };
  // Birinchi versiya semestr boshidan e'lon qilinadi
  publishVersion(d, { name: '1-versiya', effectiveFrom: d.calendar.startDate, note: 'Demo: boshlang‘ich jadval' });
  // Zhang Wei — xizmat safari (bugundan 5 kun), darslari Li Na'ga
  const cal = d.calendar;
  let start = today;
  if (start < cal.startDate || start > cal.endDate) start = cal.startDate;
  const end = addDays(start, 6);
  const zhang = d.teachers.find((t) => t.id === 'tch_zhang');
  zhang.absences = [{ id: uid('abs'), startDate: start, endDate: end, reason: 'trip', note: 'Pekin, konferensiya' }];
  try {
    applyTemporary(d, {
      workloadIds: ['wl_101_ch', 'wl_102_ch'], originalTeacherId: 'tch_zhang', substituteTeacherId: 'tch_lina',
      startDate: start, endDate: end, reason: 'trip', note: 'Demo: xizmat safari', strategy: 'move',
    });
  } catch (e) {
    console.warn('Demo almashtirish yaratilmadi:', e.message);
  }
  // Bir martalik tadbir: Zal-1 da konferensiya (ta'sirlangan darslar bekor qilinadi)
  d.events.push({ id: 'ev_conf', title: 'Ilmiy konferensiya', repeat: 'once', date: addDays(start, 8), slotIds: ['slot_1', 'slot_2', 'slot_3'], teacherIds: [], groupIds: [], roomIds: ['room_zal'], cancelAffected: true, note: 'Zal-1 band', createdAt: new Date().toISOString() });
  // Imtihon sessiyasi
  d.exams.items = examsFromWorkloads(d);
  const ex = scheduleExams(d);
  d.exams.schedule = ex.schedule;
  d.exams.unscheduled = ex.unscheduled;
  d.exams.lastRun = { at: new Date().toISOString(), ...ex.stats };
  return d;
}
