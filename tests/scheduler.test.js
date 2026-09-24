// Majburiy test senariylari (TZ 20-bo‘lim): 1–8 — generator va cheklovlar
import { describe, it, expect } from 'vitest';
import { generateSchedule } from '../src/scheduler/scheduler.js';
import { checkAll } from '../src/scheduler/conflicts.js';
import { evaluatePlacement } from '../src/state/actions.js';
import { feasibility } from '../src/scheduler/feasibility.js';
import { buildContext } from '../src/scheduler/model.js';
import { createDemoData } from '../src/data/demoData.js';
import { scenario, teacher, group, room, subject, workload, zhangScenario, R, S, DAYS6 } from './helpers.js';
import { fullAvailability } from '../src/data/defaults.js';

const hard = (d) => checkAll(d, { soft: false }).filter((c) => c.severity === 'critical');
const run = (d, o = {}) => generateSchedule(d, { mode: 'fast', timeBudgetMs: 300, seed: 1, ...o });

describe('1. 4 kunlik o‘qituvchi (Zhang Wei)', () => {
  const avail = { monday: R(1, 3), tuesday: R(2, 5), wednesday: [], thursday: R(1, 4), friday: R(2, 5), saturday: [] };
  it('4 dars Du/Se/Pa/Ju ga, har kuni 1 tadan; Ch va Sh da hech qachon yo‘q', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = run(zhangScenario(avail), { seed });
      const days = r.lessons.map((l) => l.day).sort();
      expect(r.lessons).toHaveLength(4);
      expect(days).toEqual(['friday', 'monday', 'thursday', 'tuesday']);
      expect(days).not.toContain('wednesday');
      expect(days).not.toContain('saturday');
      expect(r.unscheduled).toHaveLength(0);
    }
  });
  it('12 ta darsda ham ish kunlari 4 tadan oshmaydi va hard konflikt yo‘q', () => {
    const d = zhangScenario(avail, { lessons: 12, weekly: 12 });
    d.workloads[0].distribution = 'custom';
    d.workloads[0].customDistribution = [3, 3, 3, 3];
    const r = run(d);
    d.schedule.lessons = r.lessons;
    expect(new Set(r.lessons.map((l) => l.day)).size).toBeLessThanOrEqual(4);
    expect(r.lessons.every((l) => l.day !== 'wednesday' && l.day !== 'saturday')).toBe(true);
    expect(hard(d)).toHaveLength(0);
    expect(r.lessons.length).toBe(12);
  });
});

describe('2. Aniq 4 slot', () => {
  const avail = { monday: S(1), tuesday: S(2), wednesday: [], thursday: S(4), friday: S(5), saturday: [] };
  it('generator aynan shu 4 slotdan foydalanadi', () => {
    const r = run(zhangScenario(avail));
    const got = r.lessons.map((l) => l.day + ':' + l.slotId).sort();
    expect(got).toEqual(['friday:slot_5', 'monday:slot_1', 'thursday:slot_4', 'tuesday:slot_2']);
  });
  it('slotni qulflangan dars egallasa — sabab bilan Joylashtirilmagan (LOCKED_BLOCKS)', () => {
    const d = zhangScenario(avail);
    d.teachers.push(teacher({ id: 't_x', name: 'Aziz Karimov' }));
    d.subjects.push(subject({ id: 's_h', name: 'Tarix' }));
    d.workloads.push(workload({ id: 'w_h', subjectId: 's_h', teacherId: 't_x', target: { groupIds: ['g_101'] }, lessonsPerWeek: 1 }));
    d.rooms.push(room({ id: 'r_2', number: '206' }));
    d.schedule.lessons = [{ id: 'L1', workloadId: 'w_h', day: 'monday', slotId: 'slot_1', roomId: 'r_2', weekParity: 'all', locked: true, source: 'manual' }];
    const r = run(d);
    expect(r.lessons.find((l) => l.id === 'L1')).toMatchObject({ day: 'monday', slotId: 'slot_1' });
    const u = r.unscheduled.find((x) => x.workloadId === 'w_ch');
    expect(u.missing).toBe(1);
    expect(u.code).toBe('LOCKED_BLOCKS');
    expect(u.detail).toMatch(/mavjud slotidan/);
  });
  it('qulflanmagan to‘sib turgan dars boshqa joyga suriladi (ejection) va 4 dars joylashadi', () => {
    const d = zhangScenario(avail);
    d.teachers.push(teacher({ id: 't_x', name: 'Aziz Karimov' }));
    d.subjects.push(subject({ id: 's_h', name: 'Tarix' }));
    d.workloads.push(workload({ id: 'w_h', subjectId: 's_h', teacherId: 't_x', target: { groupIds: ['g_101'] }, lessonsPerWeek: 1 }));
    d.schedule.lessons = [{ id: 'L1', workloadId: 'w_h', day: 'monday', slotId: 'slot_1', roomId: 'r_205', weekParity: 'all', locked: false, source: 'generator' }];
    const r = run(d, { keep: 'onlyUnscheduled' });
    expect(r.lessons.filter((l) => l.workloadId === 'w_ch')).toHaveLength(4);
    const moved = r.lessons.find((l) => l.id === 'L1');
    expect(moved.day + moved.slotId).not.toBe('mondayslot_1');
    d.schedule.lessons = r.lessons;
    expect(hard(d)).toHaveLength(0);
  });
});

describe('3. Imkonsizlik', () => {
  it('talab 18, max 16 → pre-check ogohlantiradi, 2 dars TEACHER_WEEKLY_LIMIT, muzlamaydi', () => {
    const d = scenario({
      teachers: [teacher({ id: 't1', name: 'Zhang Wei', maxWeeklyClasses: 16 })],
      groups: [group({ id: 'g1', name: 'A' }), group({ id: 'g2', name: 'B' }), group({ id: 'g3', name: 'C' })],
      rooms: [room({ id: 'r1', number: '1' }), room({ id: 'r2', number: '2' })],
      subjects: [subject({ id: 's1', name: 'Xitoy tili' })],
      workloads: ['g1', 'g2', 'g3'].map((g, i) => workload({ id: 'w' + i, subjectId: 's1', teacherId: 't1', target: { groupIds: [g] }, lessonsPerWeek: 6, distribution: 'custom', customDistribution: [1, 1, 1, 1, 1, 1] })),
    });
    const f = feasibility(buildContext(d), null);
    expect(f.some((x) => x.level === 'error' && /talab 18 dars, lekin maksimal 16/.test(x.msg))).toBe(true);
    const t0 = Date.now();
    const r = run(d, { timeBudgetMs: 500 });
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(r.lessons).toHaveLength(16);
    expect(r.unscheduled.reduce((a, u) => a + u.missing, 0)).toBe(2);
    expect(r.unscheduled.every((u) => u.code === 'TEACHER_WEEKLY_LIMIT')).toBe(true);
  });
});

describe('4–5. Sig‘im va xona turi', () => {
  it('35 talabalik guruh 25 o‘rinli xonaga hech qachon tushmaydi', () => {
    const d = scenario({
      teachers: [teacher({ id: 't1', name: 'T' })], groups: [group({ id: 'g1', name: 'G', studentCount: 35 })],
      rooms: [room({ id: 'small', number: '25', capacity: 25 }), room({ id: 'big', number: '40', capacity: 40, availability: fullAvailability(S(1, 2), DAYS6) })],
      subjects: [subject({ id: 's1', name: 'Fan' })],
      workloads: [workload({ id: 'w1', subjectId: 's1', teacherId: 't1', target: { groupIds: ['g1'] }, lessonsPerWeek: 5 })],
    });
    const r = run(d);
    expect(r.lessons.length).toBe(5);
    expect(r.lessons.every((l) => l.roomId === 'big')).toBe(true);
    d.rooms = d.rooms.filter((x) => x.id === 'small');
    const r2 = run(d);
    expect(r2.lessons).toHaveLength(0);
    expect(r2.unscheduled[0].code).toBe('NO_ROOM_CAPACITY');
  });
  it('"Chinese Speaking" faqat Til laboratoriyasida', () => {
    const d = createDemoData();
    const r = run(d, { timeBudgetMs: 600 });
    const ctx = buildContext(d);
    const sp = r.lessons.filter((l) => ctx.workloads.get(l.workloadId).subjectId === 'sub_chinese_speaking');
    expect(sp.length).toBeGreaterThan(0);
    expect(sp.every((l) => ctx.rooms.get(l.roomId).type === 'language_lab')).toBe(true);
    d.schedule.lessons = r.lessons;
    expect(hard(d)).toHaveLength(0);
  });
});

describe('6. Locked', () => {
  it('qayta generatsiyadan keyin qulflangan dars joyida qoladi', () => {
    const d = createDemoData();
    const r1 = run(d, { timeBudgetMs: 300 });
    d.schedule.lessons = r1.lessons;
    const target = d.schedule.lessons[5];
    target.locked = true;
    const snap = { ...target };
    for (const keep of ['replace', 'keepLocked', 'onlyUnscheduled']) {
      const r2 = run(d, { keep, seed: 99 });
      const again = r2.lessons.find((l) => l.id === snap.id);
      expect(again).toMatchObject({ day: snap.day, slotId: snap.slotId, roomId: snap.roomId, locked: true });
    }
  });
});

describe('7. Qo‘lda qo‘shish / Drag & drop to‘qnashuvi', () => {
  it('aniq sabab: "Zhang Wei bu vaqtda 102-Xitoy guruhida dars beradi"', () => {
    const d = scenario({
      teachers: [teacher({ id: 't1', name: 'Zhang Wei' })],
      groups: [group({ id: 'g1', name: '101-Xitoy' }), group({ id: 'g2', name: '102-Xitoy' })],
      rooms: [room({ id: 'r1', number: '205' }), room({ id: 'r2', number: '206' })],
      subjects: [subject({ id: 's1', name: 'Xitoy tili' })],
      workloads: [workload({ id: 'w1', subjectId: 's1', teacherId: 't1', target: { groupIds: ['g1'] }, lessonsPerWeek: 2 }), workload({ id: 'w2', subjectId: 's1', teacherId: 't1', target: { groupIds: ['g2'] }, lessonsPerWeek: 2 })],
      lessons: [{ id: 'A', workloadId: 'w2', day: 'monday', slotId: 'slot_2', roomId: 'r2', weekParity: 'all', locked: false, source: 'manual' }],
    });
    const ev = evaluatePlacement(d, { workloadId: 'w1', day: 'monday', slotId: 'slot_2', roomId: 'r1', weekParity: 'all' });
    expect(ev.hard[0].code).toBe('H1');
    expect(ev.hard[0].msg).toMatch(/Zhang Wei bu vaqtda 102-Xitoy guruhida dars beradi/);
    const ok = evaluatePlacement(d, { workloadId: 'w1', day: 'monday', slotId: 'slot_3', roomId: 'r1', weekParity: 'all' });
    expect(ok.hard).toHaveLength(0);
  });
  it('toq va juft hafta darslari bir slotda to‘qnashmaydi', () => {
    const d = scenario({
      teachers: [teacher({ id: 't1', name: 'T' })], groups: [group({ id: 'g1', name: 'G' })], rooms: [room({ id: 'r1', number: '1' })],
      subjects: [subject({ id: 's1', name: 'A' }), subject({ id: 's2', name: 'B' })],
      workloads: [workload({ id: 'w1', subjectId: 's1', teacherId: 't1', target: { groupIds: ['g1'] }, lessonsPerWeek: 0, biweeklyLessons: 1 }), workload({ id: 'w2', subjectId: 's2', teacherId: 't1', target: { groupIds: ['g1'] }, lessonsPerWeek: 0, biweeklyLessons: 1 })],
      lessons: [{ id: 'A', workloadId: 'w1', day: 'monday', slotId: 'slot_1', roomId: 'r1', weekParity: 'odd', locked: false, source: 'manual' }],
    });
    expect(evaluatePlacement(d, { workloadId: 'w2', day: 'monday', slotId: 'slot_1', roomId: 'r1', weekParity: 'even' }).hard).toHaveLength(0);
    expect(evaluatePlacement(d, { workloadId: 'w2', day: 'monday', slotId: 'slot_1', roomId: 'r1', weekParity: 'odd' }).hard.length).toBeGreaterThan(0);
  });
  it('2 slotli dars tushlik tanaffusini kesib o‘tmaydi', () => {
    const d = scenario({
      teachers: [teacher({ id: 't1', name: 'T' })], groups: [group({ id: 'g1', name: 'G' })], rooms: [room({ id: 'r1', number: '1' })],
      subjects: [subject({ id: 's1', name: 'A' })],
      workloads: [workload({ id: 'w1', subjectId: 's1', teacherId: 't1', target: { groupIds: ['g1'] }, lessonsPerWeek: 3, durationSlots: 2 })],
    });
    const ev = evaluatePlacement(d, { workloadId: 'w1', day: 'monday', slotId: 'slot_3', roomId: 'r1' });
    expect(ev.hard[0].code).toBe('H15');
    const r = run(d);
    expect(r.lessons).toHaveLength(3);
    expect(r.lessons.every((l) => !['slot_3', 'slot_6'].includes(l.slotId))).toBe(true);
  });
});

describe('8. Potok', () => {
  it('ma\'ruza ikkala guruh uchun bir vaqtda, sig‘im yig‘indi bo‘yicha', () => {
    const d = scenario({
      teachers: [teacher({ id: 't1', name: 'Karimov' }), teacher({ id: 't2', name: 'Boshqa' })],
      groups: [group({ id: 'g1', name: '101', studentCount: 30 }), group({ id: 'g2', name: '102', studentCount: 28 })],
      rooms: [room({ id: 'r1', number: '205', capacity: 35 }), room({ id: 'hall', number: 'Zal', capacity: 80, type: 'lecture_hall' })],
      subjects: [subject({ id: 's1', name: 'Tarix' }), subject({ id: 's2', name: 'Boshqa' })],
      workloads: [
        workload({ id: 'w1', subjectId: 's1', teacherId: 't1', target: { type: 'stream', groupIds: ['g1', 'g2'] }, lessonsPerWeek: 2 }),
        workload({ id: 'w2', subjectId: 's2', teacherId: 't2', target: { groupIds: ['g2'] }, lessonsPerWeek: 5 }),
      ],
    });
    const r = run(d);
    const stream = r.lessons.filter((l) => l.workloadId === 'w1');
    expect(stream).toHaveLength(2);
    expect(stream.every((l) => l.roomId === 'hall')).toBe(true); // 58 > 35
    const w2 = r.lessons.filter((l) => l.workloadId === 'w2');
    for (const s of stream) expect(w2.some((l) => l.day === s.day && l.slotId === s.slotId)).toBe(false);
    d.schedule.lessons = r.lessons;
    expect(hard(d)).toHaveLength(0);
  });
});

describe('Katta hajm: hard konfliktsiz va tez', () => {
  it('20 guruh, 30 o‘qituvchi, ~230 dars', () => {
    const groups = Array.from({ length: 20 }, (_, i) => group({ id: 'g' + i, name: 'G' + i, studentCount: 20 + (i % 10), maxLessonsPerDay: 4 }));
    const teachers = Array.from({ length: 30 }, (_, i) => teacher({ id: 't' + i, name: 'T' + i, maxWorkingDays: 5, maxClassesPerDay: 4, maxWeeklyClasses: 16, availability: fullAvailability(i % 2 ? R(1, 4) : R(2, 6), DAYS6.slice(0, 5 + (i % 2))) }));
    const rooms = Array.from({ length: 14 }, (_, i) => room({ id: 'r' + i, number: String(100 + i), capacity: 25 + (i % 3) * 10, type: i < 2 ? 'computer' : 'regular' }));
    const subjects = Array.from({ length: 12 }, (_, i) => subject({ id: 's' + i, name: 'F' + i, roomType: i === 0 ? 'computer' : 'regular' }));
    const workloads = [];
    let k = 0;
    for (const g of groups) for (let j = 0; j < 5; j++) workloads.push(workload({ id: 'w' + k, subjectId: 's' + ((k + j) % 12), teacherId: 't' + (k % 30), target: { groupIds: [g.id] }, lessonsPerWeek: j < 3 ? 3 : 2 })), k++;
    const d = scenario({ groups, teachers, rooms, subjects, workloads });
    const t0 = Date.now();
    const r = run(d, { timeBudgetMs: 1500 });
    expect(Date.now() - t0).toBeLessThan(15000);
    d.schedule.lessons = r.lessons;
    expect(hard(d)).toHaveLength(0);
    expect(r.stats.coverage).toBeGreaterThan(90);
  });
});
