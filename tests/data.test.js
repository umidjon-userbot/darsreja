// Senariylar 13–19: import, undo/redo, refresh, Excel import, maslahatchi, tor joylar, .ics
import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '../src/state/store.js';
import { parseImport } from '../src/services/importService.js';
import { buildExport } from '../src/services/exportService.js';
import { analyze, applyImport, parseSlots, autoMap } from '../src/services/bulkImport.js';
import { adviseWorkload, applySuggestion } from '../src/analysis/advisor.js';
import { analyzeBottlenecks } from '../src/analysis/bottlenecks.js';
import { buildIcs } from '../src/services/icsService.js';
import { generateSchedule } from '../src/scheduler/scheduler.js';
import { checkAll } from '../src/scheduler/conflicts.js';
import { applyTemporary } from '../src/substitution/substitutionService.js';
import { createDemoData } from '../src/data/demoData.js';
import { buildDemo } from '../src/services/demoService.js';
import { defaultTimeslots, fullAvailability } from '../src/data/defaults.js';
import { clone } from '../src/utils/id.js';
import { scenario, teacher, group, room, subject, workload, zhangScenario, S, R, DAYS6 } from './helpers.js';

describe('13–15. Store: atomiklik, Undo/Redo, refresh', () => {
  beforeEach(() => { store.init(); store.clearEverything(); store.init(); });

  it('13. buzilgan JSON import → mavjud ma\'lumot o‘zgarmaydi', () => {
    store.replaceAll(createDemoData(), 'demo');
    const before = JSON.stringify(store.get());
    expect(parseImport('{"groups": [1, 2').ok).toBe(false);
    expect(parseImport('{"foo": 1}').ok).toBe(false);
    expect(parseImport('[]').ok).toBe(false);
    expect(() => store.update('xato', (d) => { d.groups = []; throw new Error('boom'); })).toThrow('boom');
    expect(JSON.stringify(store.get())).toBe(before);
    // to‘g‘ri eksport → import aylanishi
    const r = parseImport(JSON.stringify(buildExport(store.get())));
    expect(r.ok).toBe(true);
    expect(r.summary.groups).toBe(5);
  });

  it('14. Undo/Redo: 50 ta amal orqaga va oldinga', () => {
    store.replaceAll(createDemoData(), 'demo');
    const start = JSON.stringify(store.get().groups);
    for (let i = 0; i < 50; i++) store.update('amal ' + i, (d) => { d.groups[0].studentCount = 100 + i; });
    expect(store.get().groups[0].studentCount).toBe(149);
    for (let i = 0; i < 50; i++) expect(store.undo()).toBe('amal ' + (49 - i));
    expect(JSON.stringify(store.get().groups)).toBe(start);
    for (let i = 0; i < 50; i++) store.redo();
    expect(store.get().groups[0].studentCount).toBe(149);
  });

  it('15. "Refresh" — qayta yuklanganda ma\'lumot, tema va almashtirishlar saqlanadi', () => {
    const demo = buildDemo({ today: '2026-10-05', timeBudgetMs: 200 });
    store.replaceAll(demo, 'demo');
    store.update('tema', (d) => { d.settings.theme = 'dark'; });
    const snap = JSON.stringify({ ...store.get(), meta: null });
    store.init(); // sahifa yangilanishi
    expect(JSON.stringify({ ...store.get(), meta: null })).toBe(snap);
    expect(store.get().settings.theme).toBe('dark');
    expect(store.get().substitutions.length).toBe(1);
  });
});

describe('16. Excel/CSV import', () => {
  const data = () => { const d = createDemoData(); d.groups = []; return d; };
  const header = ['Guruh nomi *', 'Kurs', 'Yo‘nalish', 'Fakultet', 'Talabalar soni *', 'Smena', 'Kunlik maks. dars', 'Kichik guruhlar'];
  const rows = [['401-Arab', 4, 'Arab', 'Sharq', 22, 1, 4, ''], ['402-Arab', 4, 'Arab', 'Sharq', '', 1, 4, '']];

  it('3-qatorda talabalar soni bo‘sh → "3-qator" xatosi, atomik: hech narsa yozilmaydi', () => {
    const d = data();
    const map = autoMap('groups', header);
    expect(map).toMatchObject({ name: 0, studentCount: 4, shift: 5 });
    const res = analyze(d, 'groups', header, rows, map);
    const bad = res.items.find((x) => x.status === 'error');
    expect(bad.n).toBe(3);
    expect(bad.errors[0]).toMatch(/Talabalar soni/);
    const before = JSON.stringify(d);
    expect(() => applyImport(d, 'groups', res, { mode: 'update' })).toThrow(/xato bor/);
    expect(JSON.stringify(d)).toBe(before);
    const r = applyImport(d, 'groups', res, { mode: 'update', onlyValid: true });
    expect(r).toMatchObject({ added: 1, skipped: 1 });
  });

  it('yuklama: o‘xshash nom taklifi va potok/kichik guruh tanib olinadi', () => {
    const d = createDemoData();
    const h = ['Fan', 'Guruh', 'O‘qituvchi', 'Haftalik darslar'];
    const res = analyze(d, 'workloads', h, [['Xitoy tili', '101-Xitoy', 'Zhang Wey', 2], ['Falsafa', '101-Xitoy, 102-Xitoy', 'Aziz Karimov', 2], ['Xitoy tili (og‘zaki)', '101-Xitoy (1)', 'Li Na', 1]], autoMap('workloads', h));
    expect(res.items[0].errors[0]).toMatch(/Siz "Zhang Wei"ni nazarda tutdingizmi\?/);
    expect(res.items[1].value.target.type).toBe('stream');
    expect(res.items[2].value.target).toMatchObject({ type: 'subgroup', subgroupId: 'sub_101a' });
  });

  it('availability formatlari: "1,2,3", "1-3", "08:30-12:50"', () => {
    const s = defaultTimeslots();
    expect(parseSlots('1,2,3', s)).toEqual(S(1, 2, 3));
    expect(parseSlots('2-4', s)).toEqual(S(2, 3, 4));
    expect(parseSlots('08:30-12:50', s)).toEqual(S(1, 2, 3));
    expect(parseSlots('1/3/01', s)).toEqual(S(1, 2, 3)); // Excel sanaga aylantirgan "1-3"
    expect(() => parseSlots('abc', s)).toThrow();
  });
});

describe('17. Maslahatchi', () => {
  it('qulflangan dars slotni egallagan holatda taklif beradi va "Qo‘llash"dan keyin dars joylashadi', () => {
    const d = zhangScenario({ monday: S(1), tuesday: S(2), wednesday: [], thursday: S(4), friday: S(5), saturday: [] });
    d.teachers.push(teacher({ id: 't_x', name: 'Aziz Karimov' }));
    d.subjects.push(subject({ id: 's_h', name: 'Tarix' }));
    d.workloads.push(workload({ id: 'w_h', subjectId: 's_h', teacherId: 't_x', target: { groupIds: ['g_101'] }, lessonsPerWeek: 1 }));
    d.rooms.push(room({ id: 'r_2', number: '206' }));
    d.schedule.lessons = [{ id: 'L1', workloadId: 'w_h', day: 'monday', slotId: 'slot_1', roomId: 'r_2', weekParity: 'all', locked: true, source: 'manual' }];
    d.schedule.lessons = generateSchedule(d, { mode: 'fast', timeBudgetMs: 100, seed: 1 }).lessons;
    expect(d.schedule.lessons.filter((l) => l.workloadId === 'w_ch')).toHaveLength(3);
    const sug = adviseWorkload(d, 'w_ch');
    expect(sug.length).toBeGreaterThan(0);
    const kinds = sug.map((s) => s.kind);
    expect(kinds.some((k) => ['unlock', 'teacherSlot'].includes(k))).toBe(true);
    for (const s of sug) {
      const d2 = clone(d);
      const placed = applySuggestion(d2, s);
      expect(placed).toBeGreaterThan(0);
      expect(d2.schedule.lessons.filter((l) => l.workloadId === 'w_ch')).toHaveLength(4);
      expect(checkAll(d2, { soft: false }).filter((c) => c.severity === 'critical')).toHaveLength(0);
    }
  });
  it('demo: laboratoriya yopiq vaqtlar uchun xona ochish taklifi', () => {
    const d = createDemoData();
    d.schedule.lessons = generateSchedule(d, { mode: 'fast', timeBudgetMs: 300, seed: 3 }).lessons;
    const sug = adviseWorkload(d, 'wl_202_ensp');
    expect(sug.some((s) => s.kind === 'roomSlot')).toBe(true);
    const best = sug[0];
    const d2 = clone(d);
    expect(applySuggestion(d2, best)).toBeGreaterThan(0);
  });
});

describe('18. Tor joylar', () => {
  it('til laboratoriyasi talabi mavjud slotdan ko‘p → 1-o‘rinda, aniq raqamlar bilan', () => {
    const d = scenario({
      teachers: [teacher({ id: 't1', name: 'A' }), teacher({ id: 't2', name: 'B' }), teacher({ id: 't3', name: 'C' })],
      groups: [group({ id: 'g1', name: 'G1' }), group({ id: 'g2', name: 'G2' }), group({ id: 'g3', name: 'G3' })],
      rooms: [room({ id: 'lab', number: 'Lab', type: 'language_lab', availability: { monday: S(1, 2), tuesday: S(1, 2) } }), room({ id: 'r', number: '1' })],
      subjects: [subject({ id: 'sp', name: 'Speaking', roomType: 'language_lab' })],
      workloads: ['g1', 'g2', 'g3'].map((g, i) => workload({ id: 'w' + i, subjectId: 'sp', teacherId: 't' + (i + 1), target: { groupIds: [g] }, lessonsPerWeek: 2 })),
    });
    const { entries } = analyzeBottlenecks(d);
    expect(entries[0]).toMatchObject({ kind: 'roomType', id: 'language_lab', demand: 6, cap: 4, level: 'critical' });
    expect(entries[0].pressure).toBeCloseTo(1.5);
  });
});

describe('19. .ics eksport', () => {
  it('Zhang Wei jadvali: to‘g‘ri kun/vaqt (Asia/Tashkent), bayramda dars yo‘q, semestr oxirida tugaydi', () => {
    const d = zhangScenario({ monday: R(1, 3), tuesday: R(2, 5), wednesday: [], thursday: R(1, 4), friday: R(2, 5), saturday: [] });
    d.calendar = { ...d.calendar, startDate: '2026-09-01', endDate: '2027-01-15', holidays: [{ date: '2026-10-01', name: 'Bayram' }] };
    d.schedule.lessons = [
      { id: 'A', workloadId: 'w_ch', day: 'thursday', slotId: 'slot_2', roomId: 'r_205', weekParity: 'all', locked: false, source: 'manual' },
      { id: 'B', workloadId: 'w_ch', day: 'monday', slotId: 'slot_1', roomId: 'r_205', weekParity: 'odd', locked: false, source: 'manual' },
    ];
    const { ics, count } = buildIcs(d, { type: 'teacher', id: 't_zhang' });
    expect(count).toBe(2);
    const text = ics.replace(/\r\n /g, '');
    expect(text).toMatch(/BEGIN:VTIMEZONE\r\nTZID:Asia\/Tashkent/);
    // 2026-09-03 — semestrdagi birinchi payshanba, 2-para 10:00–11:20
    expect(text).toMatch(/UID:A@smart-schedule-builder\r\nDTSTAMP:\d+T\d+Z\r\nDTSTART;TZID=Asia\/Tashkent:20260903T100000\r\nDTEND;TZID=Asia\/Tashkent:20260903T112000/);
    expect(text).toMatch(/RRULE:FREQ=WEEKLY;INTERVAL=1;UNTIL=20270115T185959Z/);
    expect(text).toMatch(/EXDATE;TZID=Asia\/Tashkent:20261001T100000/); // bayram
    // toq hafta (1-hafta 31.08 dan boshlanadi, 01.09 dan semestr): birinchi toq dushanba — 14.09; 2 haftada bir
    expect(text).toMatch(/UID:B@smart-schedule-builder[\s\S]*?DTSTART;TZID=Asia\/Tashkent:20260914T083000[\s\S]*?INTERVAL=2/);
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
  it('almashtirish: asl o‘qituvchida EXDATE, almashtiruvchida alohida hodisa', () => {
    const d = createDemoData();
    d.schedule.lessons = generateSchedule(d, { mode: 'fast', timeBudgetMs: 200, seed: 5 }).lessons;
    const zl = d.schedule.lessons.find((l) => l.workloadId === 'wl_101_ch');
    applyTemporary(d, { workloadIds: ['wl_101_ch'], originalTeacherId: 'tch_zhang', substituteTeacherId: 'tch_lina', startDate: '2026-10-05', endDate: '2026-10-09', reason: 'sick', strategy: 'cancel' });
    const occ = d.substitutions[0].occurrences.find((o) => o.lessonId === zl.id);
    const z = buildIcs(d, { type: 'teacher', id: 'tch_zhang' }).ics.replace(/\r\n /g, '');
    expect(z).toContain(occ.date.replace(/-/g, ''));
    const li = buildIcs(d, { type: 'teacher', id: 'tch_lina' }).ics;
    if (occ.action !== 'cancel') expect(li).toContain(`${zl.id}-${occ.date}-sub@`);
  });
});

void fullAvailability; void DAYS6;
