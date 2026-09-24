// 2-to‘plam: versiyalar, tajriba rejimi, backup eslatmasi, tadbirlar, tanlov fanlari,
// o‘qituvchi formasi, ommaviy sahifalar, imtihon sessiyasi, tarjima
import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '../src/state/store.js';
import { publishVersion, versionForDate, diffLessons, changeSheets, draftDiff } from '../src/analysis/versions.js';
import { occurrencesOn } from '../src/substitution/calendarResolver.js';
import { computeHours } from '../src/analysis/hours.js';
import { generateSchedule } from '../src/scheduler/scheduler.js';
import { checkAll } from '../src/scheduler/conflicts.js';
import { allConflicts } from '../src/services/conflictService.js';
import { rankTemporaryCandidates } from '../src/substitution/candidates.js';
import { Occupancy } from '../src/scheduler/constraintChecker.js';
import { buildContext } from '../src/scheduler/model.js';
import { formLink, b64urlDecode, encodeResponse, decodeResponse, responseDiff, applyResponse } from '../src/services/formCodec.js';
import { buildPublicSite, qrSvg, slug } from '../src/services/publicSite.js';
import { examsFromWorkloads, scheduleExams, checkExams, sessionDates } from '../src/exams/examScheduler.js';
import { buildIcs } from '../src/services/icsService.js';
import { t, setLang } from '../src/i18n/index.js';
import { createDemoData } from '../src/data/demoData.js';
import { buildDemo } from '../src/services/demoService.js';
import { clone } from '../src/utils/id.js';
import { scenario, teacher, group, room, subject, workload, S, R, DAYS6 } from './helpers.js';
import { fullAvailability } from '../src/data/defaults.js';

const hard = (d) => checkAll(d, { soft: false }).filter((c) => c.severity === 'critical');
const L = (id, wl, day, slot, roomId = 'r1') => ({ id, workloadId: wl, day, slotId: slot, roomId, weekParity: 'all', locked: false, source: 'manual' });

function small() {
  return scenario({
    teachers: [teacher({ id: 't1', name: 'Zhang Wei', subjectIds: ['s1'] }), teacher({ id: 't2', name: 'Li Na', subjectIds: ['s1'] })],
    groups: [group({ id: 'g1', name: '101-Xitoy', studentCount: 30 })],
    rooms: [room({ id: 'r1', number: '205' }), room({ id: 'r2', number: '206' })],
    subjects: [subject({ id: 's1', name: 'Xitoy tili' })],
    workloads: [workload({ id: 'w1', subjectId: 's1', teacherId: 't1', target: { groupIds: ['g1'] }, lessonsPerWeek: 2 })],
    lessons: [L('A', 'w1', 'monday', 'slot_2'), L('B', 'w1', 'thursday', 'slot_2')],
    calendar: { startDate: '2026-09-01', endDate: '2027-01-15', holidays: [] },
  });
}

describe('Versiyalar: e\'lon qilish va sanadan kuchga kirish', () => {
  it('o‘tgan haftalar tarixi yangi versiyadan keyin o‘zgarmaydi', () => {
    const d = small();
    publishVersion(d, { name: 'v1', effectiveFrom: '2026-09-01' });
    const before = computeHours(d, { startDate: '2026-09-01', endDate: '2026-10-11', today: '2026-12-01' });
    // semestr o‘rtasida: dushanba darsi seshanbaga ko‘chdi va v2 12-oktyabrdan kuchga kiradi
    d.schedule.lessons[0].day = 'tuesday';
    expect(draftDiff(d)).toHaveLength(1);
    publishVersion(d, { name: 'v2', effectiveFrom: '2026-10-12' });
    expect(versionForDate(d, '2026-10-05').name).toBe('v1');
    expect(versionForDate(d, '2026-10-13').name).toBe('v2');
    expect(occurrencesOn(d, '2026-10-05').items).toHaveLength(1); // dushanba — eski versiya
    expect(occurrencesOn(d, '2026-10-12').items).toHaveLength(0); // dushanba — yangi versiyada dars yo‘q
    expect(occurrencesOn(d, '2026-10-13').items).toHaveLength(1); // seshanba
    const after = computeHours(d, { startDate: '2026-09-01', endDate: '2026-10-11', today: '2026-12-01' });
    expect(after.teachers).toEqual(before.teachers);
    // qoralamani o‘zgartirish e'lon qilingan versiyaga ta'sir qilmaydi
    d.schedule.lessons = [];
    expect(occurrencesOn(d, '2026-10-13').items).toHaveLength(1);
  });
  it('o‘zgarishlar ro‘yxati: qayta generatsiyada ID o‘zgarsa ham ko‘chish sifatida taniladi', () => {
    const d = small();
    const A = d.schedule.lessons;
    const B = [{ ...A[0], id: 'X1', day: 'friday' }, { ...A[1], id: 'X2' }];
    const ch = diffLessons(A, B);
    expect(ch).toHaveLength(1);
    expect(ch[0]).toMatchObject({ type: 'moved', before: { day: 'monday' }, after: { day: 'friday' } });
    const sheets = changeSheets(d, ch, 'teacher');
    expect(sheets[0].name).toBe('Zhang Wei');
    expect(sheets[0].rows[0].text).toMatch(/Dushanba, 2-para, 205-xona → Juma, 2-para, 205-xona/);
  });
  it('.ics versiyalar bo‘yicha bo‘linadi', () => {
    const d = small();
    publishVersion(d, { name: 'v1', effectiveFrom: '2026-09-01' });
    d.schedule.lessons[0].day = 'tuesday';
    publishVersion(d, { name: 'v2', effectiveFrom: '2026-10-12' });
    const ics = buildIcs(d, { type: 'teacher', id: 't1' }).ics;
    expect(ics).toMatch(/UNTIL=20261011T185959Z/);
    expect(ics).toMatch(/UNTIL=20270115T185959Z/);
  });
});

describe('Tajriba rejimi va backup eslatmasi', () => {
  beforeEach(() => { store.init(); store.clearEverything(); store.init(); });
  it('tajriba bekor qilinsa hammasi asl holatga qaytadi', () => {
    store.replaceAll(createDemoData(), 'demo');
    const orig = JSON.stringify(store.get().teachers);
    store.startSandbox();
    expect(store.inSandbox).toBe(true);
    store.update('sinov', (d) => { d.teachers[0].availability.wednesday = S(1, 2, 3); d.groups = []; });
    store.discardSandbox();
    expect(store.inSandbox).toBe(false);
    expect(JSON.stringify(store.get().teachers)).toBe(orig);
    expect(store.get().groups).toHaveLength(5);
    store.startSandbox();
    store.update('sinov2', (d) => { d.groups[0].studentCount = 99; });
    store.applySandbox();
    expect(store.inSandbox).toBe(false);
    expect(store.get().groups[0].studentCount).toBe(99);
  });
  it('backup eslatmasi o‘zgarishlardan keyin chiqadi va backupdan keyin yo‘qoladi', () => {
    store.replaceAll(createDemoData(), 'demo');
    for (let i = 0; i < 20; i++) store.update('x', (d) => { d.groups[0].studentCount = 31 + i; });
    expect(store.backupDue()).toMatchObject({ age: null });
    store.markBackup();
    expect(store.backupDue()).toBe(null);
    store.update('y', (d) => { d.settings.backupReminderDays = 0; });
    expect(store.backupDue()).toBe(null);
  });
});

describe('Tadbirlar', () => {
  it('haftalik tadbir vaqtiga generator dars qo‘ymaydi', () => {
    const d = small();
    d.schedule.lessons = [];
    d.teachers[0].availability = { monday: S(1, 2) };
    d.events = [{ id: 'e1', title: 'Kafedra majlisi', repeat: 'weekly', day: 'monday', slotIds: ['slot_1'], teacherIds: ['t1'] }];
    const r = generateSchedule(d, { mode: 'fast', timeBudgetMs: 100, seed: 1 });
    expect(r.lessons.every((l) => !(l.day === 'monday' && l.slotId === 'slot_1'))).toBe(true);
    expect(r.lessons).toHaveLength(1);
  });
  it('bir martalik tadbir: darsni bekor qiladi yoki konflikt ko‘rsatadi, almashtiruvchi sifatida tanlanmaydi', () => {
    const d = small();
    d.events = [{ id: 'e2', title: 'Konferensiya', repeat: 'once', date: '2026-10-05', slotIds: ['slot_2'], roomIds: ['r1'], cancelAffected: true }];
    const o = occurrencesOn(d, '2026-10-05').items[0];
    expect(o.status).toBe('cancelled');
    expect(o.event.title).toBe('Konferensiya');
    d.events[0].cancelAffected = false;
    expect(allConflicts(d).some((c) => c.code === 'H19' && c.date === '2026-10-05')).toBe(true);
    d.events = [{ id: 'e3', title: 'Seminar', repeat: 'once', date: '2026-10-05', slotIds: ['slot_2'], teacherIds: ['t2'] }];
    const r = rankTemporaryCandidates(d, { wlIds: ['w1'], originalTeacherId: 't1', startDate: '2026-10-05', endDate: '2026-10-05' });
    expect(r.candidates[0].fits).toHaveLength(0);
    expect(r.candidates[0].misses[0].reason).toMatch(/Seminar/);
  });
});

describe('Tanlov fanlari bloki', () => {
  it('variantlar bir vaqtda o‘tadi, to‘qnashmaydi, guruh yuki bir marta hisoblanadi', () => {
    const d = createDemoData();
    const r = generateSchedule(d, { mode: 'fast', timeBudgetMs: 800, seed: 11 });
    d.schedule.lessons = r.lessons;
    const cells = (id) => r.lessons.filter((l) => l.workloadId === id).map((l) => l.day + l.slotId).sort();
    expect(cells('wl_301_el_phil')).toHaveLength(2);
    expect(cells('wl_301_el_phil')).toEqual(cells('wl_301_el_econ'));
    expect(hard(d)).toHaveLength(0);
    const ctx = buildContext(d);
    const occ = new Occupancy(ctx, d.schedule.lessons);
    const el = r.lessons.find((l) => l.workloadId === 'wl_301_el_phil');
    const load = occ.groupDayLoad('grp_301', el.day);
    const plain = r.lessons.filter((l) => l.day === el.day && ctx.workloads.get(l.workloadId).target.groupIds.includes('grp_301') && !l.workloadId.startsWith('wl_301_el')).reduce((a, l) => a + (ctx.workloads.get(l.workloadId).durationSlots || 1), 0);
    expect(load).toBe(plain + r.lessons.filter((l) => l.workloadId === 'wl_301_el_phil' && l.day === el.day).length);
    // oddiy dars tanlov vaqtiga qo‘yilsa — H2
    const other = d.workloads.find((w) => w.id === 'wl_301_en');
    const clash = { id: 'Z', workloadId: other.id, day: el.day, slotId: el.slotId, roomId: 'room_102', weekParity: 'all', locked: false, source: 'manual' };
    d.schedule.lessons.push(clash);
    expect(hard(d).some((c) => c.code === 'H2')).toBe(true);
  });
});

describe('O‘qituvchi formasi (havola va javob kodi)', () => {
  it('havola → javob → import', () => {
    const d = createDemoData();
    const link = formLink(d, 'tch_zhang', 'https://x.github.io/jadval/');
    expect(link.startsWith('https://x.github.io/jadval/#/form?d=')).toBe(true);
    const p = b64urlDecode(link.split('d=')[1]);
    expect(p).toMatchObject({ tid: 'tch_zhang', name: 'Zhang Wei' });
    expect(p.slots).toHaveLength(6);
    const code = encodeResponse({ tid: p.tid, name: p.name, av: { ...p.av, wednesday: S(1, 2) }, pd: [], ps: ['slot_2'], note: 'Chorshanba ham mumkin' });
    const resp = decodeResponse('Salom, mana kodim: ' + code);
    const diff = responseDiff(d, resp);
    expect(diff.added).toEqual([{ day: 'wednesday', slotId: 'slot_1' }, { day: 'wednesday', slotId: 'slot_2' }]);
    applyResponse(d, resp);
    expect(d.teachers[0].availability.wednesday).toEqual(S(1, 2));
    expect(d.teachers[0].formNote).toBe('Chorshanba ham mumkin');
    expect(() => decodeResponse('SSB1.buzilgan')).toThrow();
  });
});

describe('Ommaviy sahifalar va QR', () => {
  it('guruh/xona sahifalari va QR SVG yaratiladi', () => {
    const d = buildDemo({ today: '2026-09-24', timeBudgetMs: 200 });
    const { files, index } = buildPublicSite(d, { groups: true, rooms: true });
    expect(Object.keys(files)).toContain('index.html');
    expect(Object.keys(files)).toContain(`g/${slug('101-Xitoy')}.html`);
    expect(index.rooms.length).toBe(6);
    expect(files[`g/${slug('101-Xitoy')}.html`]).toMatch(/Xitoy tili/);
    expect(qrSvg('https://x.github.io/jadval/r/205.html')).toMatch(/^<svg/);
  });
});

describe('Imtihon sessiyasi', () => {
  it('guruhda bir kunda bitta imtihon, dam kunlari, sig‘im, nazoratchilar', () => {
    const d = createDemoData();
    d.exams.items = examsFromWorkloads(d);
    expect(d.exams.items.length).toBeGreaterThan(10);
    const r = scheduleExams(d);
    d.exams.schedule = r.schedule;
    expect(r.unscheduled).toHaveLength(0);
    expect(checkExams(d)).toEqual([]);
    const byId = new Map(d.exams.items.map((x) => [x.id, x]));
    const ctx = buildContext(d);
    for (const g of d.groups) {
      const dates = r.schedule.filter((e) => byId.get(e.examId).groupIds.includes(g.id)).map((e) => e.date).sort();
      expect(new Set(dates).size).toBe(dates.length);
      for (let i = 1; i < dates.length; i++) expect((new Date(dates[i]) - new Date(dates[i - 1])) / 864e5).toBeGreaterThanOrEqual(r.schedule.some((e) => e.relaxed) ? 1 : 2);
    }
    for (const e of r.schedule) {
      const ex = byId.get(e.examId);
      const need = ex.studentCount || ex.groupIds.reduce((a, g) => a + ctx.groups.get(g).studentCount, 0);
      expect(e.roomIds.reduce((a, id) => a + ctx.rooms.get(id).capacity, 0)).toBeGreaterThanOrEqual(need);
      expect(e.proctorIds).not.toContain(ex.examinerId);
      expect(e.proctorIds.length).toBe(e.roomIds.length);
    }
  });
  it('kunlar yetmasa — sabab bilan joylashmaydi', () => {
    const d = createDemoData();
    d.exams.items = examsFromWorkloads(d);
    d.exams.session = { ...d.exams.session, startDate: '2027-01-04', endDate: '2027-01-05', slotIds: ['slot_1'] };
    expect(sessionDates(d)).toHaveLength(2);
    const r = scheduleExams(d);
    expect(r.unscheduled.length).toBeGreaterThan(0);
    expect(r.unscheduled[0].reason).toMatch(/kun|xona|band/);
  });
});

describe('Tarjima', () => {
  it('menyu rus va ingliz tilida, topilmasa — o‘zbekcha', () => {
    setLang('ru');
    expect(t('nav.schedule')).toBe('Расписание');
    setLang('en');
    expect(t('nav.exams')).toBe('Exams');
    expect(t('backup.banner', { days: '3 days', changes: 5 })).toMatch(/3 days \(5 changes\)/);
    setLang('uz');
    expect(t('nav.versions')).toBe('Versiyalar');
    expect(t('yoq.kalit')).toBe('yoq.kalit');
  });
});

void clone; void R; void DAYS6; void fullAvailability;
