// Senariylar 9–12, 20: almashtirish, o‘tkazish, o‘chirish, soat hisobi
import { describe, it, expect } from 'vitest';
import { rankTemporaryCandidates } from '../src/substitution/candidates.js';
import { applyTemporary, planTemporary, suggestForAbsence } from '../src/substitution/substitutionService.js';
import { applyPermanentTransfer, revertTransfer } from '../src/substitution/transferService.js';
import { occurrencesOn, teacherAt } from '../src/substitution/calendarResolver.js';
import { teacherDeletionImpact } from '../src/services/cascade.js';
import { computeHours } from '../src/analysis/hours.js';
import { checkAll } from '../src/scheduler/conflicts.js';
import { clone } from '../src/utils/id.js';
import { scenario, teacher, group, room, subject, workload, R, DAYS6 } from './helpers.js';
import { fullAvailability } from '../src/data/defaults.js';

function base() {
  const L = (id, wl, day, slot, roomId = 'r1') => ({ id, workloadId: wl, day, slotId: slot, roomId, weekParity: 'all', locked: false, source: 'manual' });
  return scenario({
    teachers: [
      teacher({ id: 't_zhang', name: 'Zhang Wei', subjectIds: ['s_ch'], maxClassesPerDay: 4, maxWeeklyClasses: 16 }),
      teacher({ id: 't_lina', name: 'Li Na', subjectIds: ['s_ch', 's_hi'], maxClassesPerDay: 4, maxWeeklyClasses: 18 }),
      teacher({ id: 't_kar', name: 'Aziz Karimov', subjectIds: ['s_hi'] }),
    ],
    groups: [group({ id: 'g101', name: '101-Xitoy', studentCount: 30 }), group({ id: 'g102', name: '102-Xitoy', studentCount: 28 })],
    rooms: [room({ id: 'r1', number: '205', capacity: 35 }), room({ id: 'r2', number: '206', capacity: 35 })],
    subjects: [subject({ id: 's_ch', name: 'Xitoy tili' }), subject({ id: 's_hi', name: 'Xitoy yozuvi' })],
    workloads: [
      workload({ id: 'w_ch', subjectId: 's_ch', teacherId: 't_zhang', target: { groupIds: ['g101'] }, lessonsPerWeek: 4 }),
      workload({ id: 'w_li', subjectId: 's_hi', teacherId: 't_lina', target: { groupIds: ['g102'] }, lessonsPerWeek: 1 }),
    ],
    lessons: [L('Z1', 'w_ch', 'monday', 'slot_2'), L('Z2', 'w_ch', 'tuesday', 'slot_2'), L('Z3', 'w_ch', 'thursday', 'slot_2'), L('Z4', 'w_ch', 'friday', 'slot_2')],
    calendar: { startDate: '2026-09-01', endDate: '2027-01-15', firstWeekParity: 'odd', holidays: [{ date: '2026-10-01', name: 'O‘qituvchilar kuni' }] },
  });
}

describe('9. Vaqtincha almashtirish', () => {
  it('Zhang Wei 5–16 oktyabr kasal → Li Na birinchi nomzod; muddatdan keyin Zhang avtomatik qaytadi', () => {
    const d = base();
    const { candidates, occs } = rankTemporaryCandidates(d, { wlIds: ['w_ch'], originalTeacherId: 't_zhang', startDate: '2026-10-05', endDate: '2026-10-16' });
    expect(occs).toHaveLength(8);
    expect(candidates[0].teacher.name).toBe('Li Na');
    expect(candidates[0].fits).toHaveLength(8);
    expect(candidates.some((c) => c.teacher.id === 't_kar')).toBe(false); // malakasiz — standart ko‘rinmaydi
    const templateBefore = JSON.stringify(d.schedule.lessons);
    applyTemporary(d, { workloadIds: ['w_ch'], originalTeacherId: 't_zhang', substituteTeacherId: 't_lina', startDate: '2026-10-05', endDate: '2026-10-16', reason: 'sick' });
    expect(JSON.stringify(d.schedule.lessons)).toBe(templateBefore); // shablon o‘zgarmagan
    const tue = occurrencesOn(d, '2026-10-06').items.find((o) => o.lesson.id === 'Z2');
    expect(tue.teacherId).toBe('t_lina');
    expect(tue.originalTeacherId).toBe('t_zhang');
    const after = occurrencesOn(d, '2026-10-19').items.find((o) => o.lesson.id === 'Z1');
    expect(after.teacherId).toBe('t_zhang');
    expect(after.status).toBe('normal');
    expect(checkAll(d, { soft: false }).filter((c) => c.severity === 'critical')).toHaveLength(0);
  });
});

describe('10. Qisman mos almashtiruvchi', () => {
  it('Li Na Payshanba 2-parada band → o‘sha kunga ko‘chirish yoki bekor qilish', () => {
    const d = base();
    d.schedule.lessons.push({ id: 'LI', workloadId: 'w_li', day: 'thursday', slotId: 'slot_2', roomId: 'r2', weekParity: 'all', locked: false, source: 'manual' });
    const p = { workloadIds: ['w_ch'], originalTeacherId: 't_zhang', substituteTeacherId: 't_lina', startDate: '2026-10-05', endDate: '2026-10-16' };
    const mv = planTemporary(d, { ...p, strategy: 'move' }).plan;
    const thu = mv.filter((x) => x.o.day === 'thursday');
    expect(thu).toHaveLength(2);
    expect(thu.every((x) => x.action === 'move' && x.newSlotId !== 'slot_2')).toBe(true);
    expect(mv.filter((x) => x.action === 'substitute')).toHaveLength(6);
    const cn = planTemporary(d, { ...p, strategy: 'cancel' }).plan.filter((x) => x.o.day === 'thursday');
    expect(cn.every((x) => x.action === 'cancel' && x.makeupRequired)).toBe(true);
    // Qo‘llangandan keyin sana konflikti yo‘q
    applyTemporary(d, { ...p, strategy: 'move' });
    expect(checkAll(d, { soft: false }).filter((c) => c.severity === 'critical')).toHaveLength(0);
    const o = occurrencesOn(d, '2026-10-08').items.find((x) => x.lesson.id === 'Z3');
    expect(o.status).toBe('moved');
    expect(o.slotId).not.toBe('slot_2');
  });
  it('yo‘qlik: barcha ta\'sirlangan darslar va eng yaxshi almashtiruvchi taklif qilinadi', () => {
    const d = base();
    const s = suggestForAbsence(d, 't_zhang', '2026-10-05', '2026-10-09');
    expect(s.occs).toHaveLength(4);
    expect(s.suggestions[0].best.teacher.id).toBe('t_lina');
  });
});

describe('11. To‘liq o‘tkazish', () => {
  it('mos kelmagan darslar avtomatik qayta joylashadi, tarix yoziladi, qaytarish ishlaydi', () => {
    const d = base();
    const lina = d.teachers.find((t) => t.id === 't_lina');
    lina.availability = fullAvailability(R(1, 6), DAYS6.filter((x) => x !== 'friday')); // Jumada ishlamaydi
    const before = clone(d);
    const recs = applyPermanentTransfer(d, { workloadIds: ['w_ch'], toTeacherId: 't_lina', effectiveDate: '2026-11-01', reason: 'Ishdan ketdi', strategy: 'auto' });
    expect(d.workloads.find((w) => w.id === 'w_ch').teacherId).toBe('t_lina');
    expect(recs[0]).toMatchObject({ fromTeacherId: 't_zhang', toTeacherId: 't_lina', unscheduledCount: 0 });
    expect(recs[0].movedLessons).toHaveLength(1);
    const lessons = d.schedule.lessons.filter((l) => l.workloadId === 'w_ch');
    expect(lessons).toHaveLength(4);
    expect(lessons.some((l) => l.day === 'friday')).toBe(false);
    expect(checkAll(d, { soft: false }).filter((c) => c.severity === 'critical')).toHaveLength(0);
    // arxiv: kuchga kirishdan oldin eski o‘qituvchi
    expect(teacherAt(d, d.workloads[0], '2026-10-20')).toBe('t_zhang');
    expect(teacherAt(d, d.workloads[0], '2026-11-02')).toBe('t_lina');
    // "unschedule" strategiyasi
    const d2 = clone(before);
    d2.teachers.find((t) => t.id === 't_lina').availability = lina.availability;
    const r2 = applyPermanentTransfer(d2, { workloadIds: ['w_ch'], toTeacherId: 't_lina', strategy: 'unschedule' });
    expect(r2[0].unscheduledCount).toBe(1);
    expect(d2.schedule.lessons.filter((l) => l.workloadId === 'w_ch')).toHaveLength(3);
    // qaytarish
    revertTransfer(d, recs[0].id);
    expect(d.workloads.find((w) => w.id === 'w_ch').teacherId).toBe('t_zhang');
    expect(d.transfers.find((t) => t.id === recs[0].id).reverted).toBe(true);
  });
  it('potokdan qisman o‘tkazish yangi yuklama yaratadi', () => {
    const d = base();
    d.workloads.push(workload({ id: 'w_st', subjectId: 's_hi', teacherId: 't_kar', target: { type: 'stream', groupIds: ['g101', 'g102'] }, lessonsPerWeek: 1 }));
    applyPermanentTransfer(d, { workloadIds: ['w_st'], toTeacherId: 't_lina', groupIds: ['g102'], strategy: 'auto' });
    const orig = d.workloads.find((w) => w.id === 'w_st');
    expect(orig.target).toMatchObject({ type: 'group', groupIds: ['g101'] });
    const part = d.workloads.find((w) => w.teacherId === 't_lina' && w.target.groupIds[0] === 'g102' && w.subjectId === 's_hi' && w.id !== 'w_li');
    expect(part).toBeTruthy();
    expect(d.schedule.lessons.filter((l) => l.workloadId === part.id)).toHaveLength(1);
  });
});

describe('12. Darsi bor o‘qituvchini o‘chirish', () => {
  it('bloklanadi', () => {
    const d = base();
    expect(teacherDeletionImpact(d, 't_zhang')).toMatchObject({ blocked: true });
    expect(teacherDeletionImpact(d, 't_kar').blocked).toBe(false);
  });
});

describe('20. Soat hisobi', () => {
  it('1 bayram va 1 vaqtincha almashtirishli oy — qo‘lda hisoblangan natija bilan bir xil', () => {
    const d = base();
    d.settings.academicHoursPerSlot = 2;
    applyTemporary(d, { workloadIds: ['w_ch'], originalTeacherId: 't_zhang', substituteTeacherId: 't_lina', startDate: '2026-10-05', endDate: '2026-10-16', reason: 'sick' });
    const h = computeHours(d, { startDate: '2026-10-01', endDate: '2026-10-31', today: '2026-11-01' });
    const z = h.teachers.find((t) => t.id === 't_zhang');
    const l = h.teachers.find((t) => t.id === 't_lina');
    // Oktyabr: Du 4, Se 4, Pa 5−1 (1-okt bayram) = 4, Ju 5 → 17 dars × 2 = 34 soat; almashtirilgan 8 dars = 16 soat
    expect(z).toMatchObject({ planned: 34, conducted: 18, byOthers: 16, forOthers: 0, cancelled: 0 });
    expect(l).toMatchObject({ planned: 0, conducted: 16, forOthers: 16, byOthers: 0 });
    const w = h.workloads.find((x) => x.id === 'w_ch');
    expect(w).toMatchObject({ planned: 34, conducted: 34 });
  });
});
