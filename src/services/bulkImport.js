// Excel/CSV'dan ommaviy import va Excel eksport (SheetJS loyiha ichida bundle qilingan — CDN yo‘q)
import * as XLSX from 'xlsx';
import { uid, nowIso, closestName } from '../utils/id.js';
import { download } from '../utils/dom.js';
import { timeToMin } from '../utils/date.js';
import { buildContext, wlTargetName } from '../scheduler/model.js';
import { DAYS_SHORT } from '../i18n/uz.js';

const DAY_COLS = [['monday', 'Du'], ['tuesday', 'Se'], ['wednesday', 'Ch'], ['thursday', 'Pa'], ['friday', 'Ju'], ['saturday', 'Sh'], ['sunday', 'Ya']];
const norm = (s) => String(s ?? '').toLowerCase().replace(/[‘’'`ʻʼ.\-_*()\s]/g, '').replace(/o‘/g, 'o');

export const ENTITIES = {
  groups: {
    title: 'Guruhlar', sheet: 'Guruhlar',
    cols: [
      { key: 'name', label: 'Guruh nomi', req: true, alias: ['nomi', 'guruh', 'name', 'group'] },
      { key: 'course', label: 'Kurs', alias: ['course'] },
      { key: 'direction', label: 'Yo‘nalish', alias: ['yonalish', 'direction'] },
      { key: 'faculty', label: 'Fakultet', alias: ['faculty'] },
      { key: 'studentCount', label: 'Talabalar soni', req: true, alias: ['talabalar', 'soni', 'students'] },
      { key: 'shift', label: 'Smena', alias: ['shift'] },
      { key: 'maxLessonsPerDay', label: 'Kunlik maks. dars', alias: ['kunlikmaks', 'maxperday'] },
      { key: 'subgroups', label: 'Kichik guruhlar', alias: ['kichikguruh', 'subgroups'] },
    ],
    samples: [['101-Xitoy', 1, 'Xitoy filologiyasi', 'Sharq tillari', 30, 1, 4, '15,15'], ['202-Ingliz', 2, 'Ingliz filologiyasi', 'G‘arb tillari', 24, 2, 4, '']],
    help: 'Smena: 1 yoki 2 (Sozlamalardagi smena slotlari qo‘llanadi). Kichik guruhlar: talabalar soni vergul bilan, masalan 15,15.',
  },
  teachers: {
    title: 'O‘qituvchilar', sheet: 'O‘qituvchilar',
    cols: [
      { key: 'name', label: 'F.I.Sh.', req: true, alias: ['fish', 'ism', 'name', 'oqituvchi', 'teacher'] },
      { key: 'phone', label: 'Telefon', alias: ['phone', 'tel'] },
      { key: 'subjects', label: 'Fanlar', alias: ['fan', 'subjects'] },
      { key: 'building', label: 'Bino', alias: ['building'] },
      { key: 'minWorkingDays', label: 'Min. ish kuni', alias: ['minishkuni', 'mindays'] },
      { key: 'maxWorkingDays', label: 'Maks. ish kuni', alias: ['maksishkuni', 'maxdays'] },
      { key: 'minClassesPerDay', label: 'Kunlik min. dars', alias: ['kunlikmin'] },
      { key: 'maxClassesPerDay', label: 'Kunlik maks. dars', alias: ['kunlikmaks'] },
      { key: 'maxWeeklyClasses', label: 'Haftalik maks. dars', alias: ['haftalikmaks', 'weekly'] },
      ...DAY_COLS.slice(0, 6).map(([d, s]) => ({ key: 'av_' + d, label: s, alias: [d, DAYS_SHORT[d]] })),
    ],
    samples: [['Zhang Wei', '+998901234567', 'Xitoy tili, Xitoy tili (og‘zaki)', 'A', 4, 4, 1, 4, 16, '1-3', '2-5', '', '1,2,3', '2-5', ''], ['Li Na', '', 'Xitoy tili', 'A', 3, 5, 1, 4, 18, '1-5', '1-4', '1-5', '3-6', '1-4', '1-3']],
    help: 'Du…Sh ustunlari — mavjud paralar: "1,2,3", "1-3" yoki vaqt "08:30-12:50". Bo‘sh — o‘sha kuni ishlamaydi. Fanlar — vergul bilan (fan nomlari).',
  },
  subjects: {
    title: 'Fanlar', sheet: 'Fanlar',
    cols: [
      { key: 'name', label: 'Fan nomi', req: true, alias: ['fan', 'nomi', 'name', 'subject'] },
      { key: 'code', label: 'Kod', alias: ['code'] },
      { key: 'icon', label: 'Belgi', alias: ['icon', 'emoji'] },
      { key: 'roomType', label: 'Xona turi', alias: ['xona', 'roomtype'] },
      { key: 'required', label: 'Majburiy', alias: ['required'] },
    ],
    samples: [['Xitoy tili', 'XT-101', '🇨🇳', 'Oddiy', 'Ha'], ['Xitoy tili (og‘zaki)', 'XT-102', '🗣️', 'Til laboratoriyasi', 'Ha']],
    help: 'Xona turi: Oddiy, Kompyuter, Til laboratoriyasi, Ma\'ruza zali (yoki Sozlamalarda qo‘shilgan tur nomi).',
  },
  rooms: {
    title: 'Auditoriyalar', sheet: 'Auditoriyalar',
    cols: [
      { key: 'number', label: 'Xona raqami', req: true, alias: ['xona', 'raqam', 'number', 'room'] },
      { key: 'building', label: 'Bino', alias: ['building'] },
      { key: 'floor', label: 'Qavat', alias: ['floor'] },
      { key: 'capacity', label: 'Sig‘im', req: true, alias: ['sigim', 'capacity', 'orin'] },
      { key: 'type', label: 'Turi', alias: ['tur', 'type'] },
      { key: 'equipment', label: 'Jihozlar', alias: ['equipment'] },
      ...DAY_COLS.slice(0, 6).map(([d, s]) => ({ key: 'av_' + d, label: s, alias: [d] })),
    ],
    samples: [['205', 'A', 2, 35, 'Oddiy', 'projector', '1-5', '1-3', '', '1-6', '1-6', '1-6'], ['110', 'A', 1, 30, 'Til laboratoriyasi', 'headphones', '1-3', '1-3', '', '1-3', '1-3', '']],
    help: 'Du…Sh ustunlari — xona ishlaydigan paralar. Barcha ustunlar bo‘sh bo‘lsa — hamma vaqt ochiq deb olinadi.',
  },
  workloads: {
    title: 'O‘quv yuklamasi', sheet: 'Yuklama',
    cols: [
      { key: 'subject', label: 'Fan', req: true, alias: ['subject', 'fannomi'] },
      { key: 'groups', label: 'Guruh', req: true, alias: ['guruhlar', 'group', 'groups'] },
      { key: 'teacher', label: 'O‘qituvchi', req: true, alias: ['teacher', 'fish'] },
      { key: 'lessonsPerWeek', label: 'Haftalik darslar', req: true, alias: ['haftalik', 'soni', 'lessons'] },
      { key: 'biweeklyLessons', label: '2 haftada 1', alias: ['toqjuft', 'biweekly'] },
      { key: 'durationSlots', label: 'Davomiylik (slot)', alias: ['davomiylik', 'duration'] },
      { key: 'distribution', label: 'Taqsimot', alias: ['distribution'] },
      { key: 'roomType', label: 'Xona turi', alias: ['xonaturi', 'roomtype'] },
    ],
    samples: [['Xitoy tili', '101-Xitoy', 'Zhang Wei', 4, 0, 1, 'Har kuni', ''], ['O‘zbekiston tarixi', '101-Xitoy, 102-Xitoy', 'Aziz Karimov', 2, 0, 1, '', 'Ma\'ruza zali'], ['Xitoy tili (og‘zaki)', '101-Xitoy (1)', 'Li Na', 2, 0, 1, '', '']],
    help: 'Guruh — nomi. Potok uchun vergul bilan: "101-Xitoy, 102-Xitoy". Kichik guruh — uning nomi: "101-Xitoy (1)". Taqsimot: "Har kuni" yoki "2x2".',
  },
  availability: {
    title: 'Availability', sheet: 'Availability',
    cols: [
      { key: 'kind', label: 'Turi', req: true, alias: ['kind', 'obyekt'] },
      { key: 'name', label: 'Nomi', req: true, alias: ['name', 'fish', 'raqam'] },
      ...DAY_COLS.slice(0, 6).map(([d, s]) => ({ key: 'av_' + d, label: s, alias: [d] })),
    ],
    samples: [['O‘qituvchi', 'Zhang Wei', '1-3', '2-5', '', '1-3', '2-5', ''], ['Auditoriya', '205', '1-5', '1-3', '', '1-6', '1-6', '1-6'], ['Guruh', '202-Ingliz', '3-6', '3-6', '3-6', '3-6', '3-6', '']],
    help: 'Mavjud o‘qituvchi, auditoriya yoki guruhning availability\'sini yangilaydi. Turi: O‘qituvchi / Auditoriya / Guruh.',
  },
};

// --- Fayl o‘qish -------------------------------------------------------------
// CSV uchun raw: true — "1-3" kabi qiymatlar sanaga aylantirilmaydi
export function readWorkbook(buffer, { csv = false } = {}) {
  return XLSX.read(buffer, { type: 'array', raw: csv });
}

export function sheetRows(wb, sheetName) {
  const ws = wb.Sheets[sheetName || wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, blankrows: false });
  const header = (aoa[0] || []).map((h) => String(h).trim());
  const rows = aoa.slice(1).filter((r) => r.some((v) => String(v).trim() !== ''));
  return { header, rows };
}

export function autoMap(entity, header) {
  const def = ENTITIES[entity];
  const map = {};
  for (const col of def.cols) {
    const cands = [col.label, ...(col.alias || [])].map(norm);
    const i = header.findIndex((h) => cands.includes(norm(h)));
    const j = i >= 0 ? i : header.findIndex((h) => { const n = norm(h); return n && cands.some((c) => c.length > 2 && (n.startsWith(c) || c.startsWith(n))); });
    if (j >= 0 && !Object.values(map).includes(j)) map[col.key] = j;
  }
  return map;
}

// "1,2,3" | "1-3" | "08:30-12:50" → slot ID'lar
export function parseSlots(value, slots) {
  const s = String(value ?? '').trim();
  if (!s) return [];
  const out = new Set();
  for (const part of s.split(/[,;]+/).map((x) => x.trim()).filter(Boolean)) {
    const tm = part.match(/^(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})$/);
    if (tm) {
      const a = timeToMin(tm[1]), b = timeToMin(tm[2]);
      for (const x of slots) if (timeToMin(x.start) >= a && timeToMin(x.end) <= b) out.add(x.id);
      continue;
    }
    // Excel "1-3" ni sanaga aylantirib yuborgan bo‘lsa ("1/3/01", "3-Jan") — qaytarib tiklaymiz
    const dm = part.match(/^(\d{1,2})\/(\d{1,2})\/\d{2,4}$/);
    if (dm) {
      for (let i = +dm[1]; i <= +dm[2]; i++) if (slots[i - 1]) out.add(slots[i - 1].id);
      continue;
    }
    const rg = part.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (rg) {
      for (let i = +rg[1]; i <= +rg[2]; i++) if (slots[i - 1]) out.add(slots[i - 1].id);
      continue;
    }
    const n = parseInt(part, 10);
    if (!isNaN(n) && slots[n - 1]) out.add(slots[n - 1].id);
    else throw new Error(`"${part}" — para raqami yoki vaqt oralig‘i emas`);
  }
  return slots.filter((x) => out.has(x.id)).map((x) => x.id);
}

function slotsToText(ids, slots) {
  const nums = ids.map((id) => slots.findIndex((s) => s.id === id) + 1).filter((n) => n > 0).sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < nums.length; i++) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    parts.push(j > i ? `${nums[i]}-${nums[j]}` : `${nums[i]}`);
    i = j;
  }
  return parts.join(',');
}

const yes = (v) => /^(ha|yes|1|true|majburiy|x|✓)$/i.test(String(v).trim());
const toNum = (v, d) => { const n = Number(String(v).replace(',', '.')); return String(v).trim() === '' || isNaN(n) ? d : n; };

function findByName(list, name, field = 'name') {
  const n = String(name).trim().toLowerCase();
  return list.find((x) => String(x[field]).trim().toLowerCase() === n);
}

function roomTypeId(data, v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const t = data.settings.roomTypes.find((x) => x.id === s || norm(x.name) === norm(s));
  return t ? t.id : undefined;
}

/**
 * Qatorlarni tahlil qilish.
 * @returns { items: [{ n, status: 'new'|'update'|'error', errors: [], value, key }], refs: { subjects:Set, teachers:Set, groups:Set } }
 */
export function analyze(data, entity, header, rows, map, opts = {}) {
  const ctx = buildContext(data);
  const slots = ctx.slots;
  const days = ctx.workDays;
  const get = (r, k) => (map[k] === undefined || map[k] === null || map[k] === '' ? '' : String(r[map[k]] ?? '').trim());
  const items = [];
  const missing = { subjects: new Map(), teachers: new Map(), groups: new Map() };
  const seen = new Set();
  const avOf = (r, errs, fallbackAll) => {
    const av = {};
    let any = false;
    for (const [d] of DAY_COLS) {
      if (!days.includes(d)) continue;
      try { av[d] = parseSlots(get(r, 'av_' + d), slots); } catch (e) { errs.push(`${d}: ${e.message}`); av[d] = []; }
      if (av[d].length) any = true;
    }
    if (!any && fallbackAll) for (const d of days) av[d] = slots.map((s) => s.id);
    return { av, any };
  };
  const suggest = (list, name, field = 'name') => {
    const c = closestName(name, list.map((x) => x[field]));
    return c ? ` Siz "${c}"ni nazarda tutdingizmi?` : '';
  };

  rows.forEach((r, idx) => {
    const n = idx + 2; // Excel qator raqami (sarlavha — 1)
    const errors = [];
    for (const col of ENTITIES[entity].cols) if (col.req && !get(r, col.key)) errors.push(`"${col.label}" kiritilmagan`);
    let value = null, key = '', existing = null;
    if (entity === 'groups') {
      key = get(r, 'name');
      existing = findByName(data.groups, key);
      const sc = toNum(get(r, 'studentCount'), NaN);
      if (get(r, 'studentCount') && !(sc > 0)) errors.push('Talabalar soni musbat son bo‘lishi kerak');
      const shift = get(r, 'shift') ? toNum(get(r, 'shift'), null) : null;
      const shiftSlots = data.settings.shifts?.[shift] || slots.map((s) => s.id);
      const subs = get(r, 'subgroups') ? get(r, 'subgroups').split(/[,;]+/).map((x, i) => ({ id: uid('sub'), name: `${key} (${i + 1})`, studentCount: toNum(x, 0) })) : [];
      if (subs.reduce((a, s) => a + s.studentCount, 0) > sc) errors.push('Kichik guruhlar yig‘indisi guruh sonidan katta');
      value = { name: key, course: toNum(get(r, 'course'), 1), direction: get(r, 'direction'), faculty: get(r, 'faculty'), studentCount: sc, shift, maxLessonsPerDay: toNum(get(r, 'maxLessonsPerDay'), 4), subgroups: subs, availability: Object.fromEntries(days.map((d) => [d, [...shiftSlots]])) };
    }
    if (entity === 'teachers') {
      key = get(r, 'name');
      existing = findByName(data.teachers, key);
      const { av, any } = avOf(r, errors, false);
      if (!any && !existing) errors.push('Kamida bitta kun uchun paralarni kiriting (Du…Sh)');
      const subjectIds = [];
      for (const sn of get(r, 'subjects').split(/[,;]+/).map((x) => x.trim()).filter(Boolean)) {
        const s = findByName(data.subjects, sn);
        if (s) subjectIds.push(s.id);
        else if (opts.autoCreate) { missing.subjects.set(sn.toLowerCase(), sn); subjectIds.push('?' + sn); }
        else errors.push(`"${sn}" nomli fan topilmadi.${suggest(data.subjects, sn)}`);
      }
      const nums = ['minWorkingDays', 'maxWorkingDays', 'minClassesPerDay', 'maxClassesPerDay', 'maxWeeklyClasses'];
      const defs = { minWorkingDays: 1, maxWorkingDays: 5, minClassesPerDay: 1, maxClassesPerDay: 4, maxWeeklyClasses: 16 };
      value = { name: key, phone: get(r, 'phone'), building: get(r, 'building'), subjectIds, ...(any || !existing ? { availability: av } : {}) };
      for (const k of nums) value[k] = toNum(get(r, k), existing ? existing[k] : defs[k]);
      if (value.minWorkingDays > value.maxWorkingDays) errors.push('Min. ish kuni maksimaldan katta');
      if (value.minClassesPerDay > value.maxClassesPerDay) errors.push('Kunlik min. maksimaldan katta');
    }
    if (entity === 'subjects') {
      key = get(r, 'name');
      existing = findByName(data.subjects, key);
      const rt = roomTypeId(data, get(r, 'roomType'));
      if (rt === undefined) errors.push(`"${get(r, 'roomType')}" xona turi noma'lum`);
      value = { name: key, code: get(r, 'code'), icon: get(r, 'icon') || '📘', roomType: rt || 'regular', required: get(r, 'required') ? yes(get(r, 'required')) : true };
    }
    if (entity === 'rooms') {
      key = get(r, 'number');
      existing = data.rooms.find((x) => String(x.number).toLowerCase() === key.toLowerCase() && (x.building || '') === get(r, 'building'));
      const cap = toNum(get(r, 'capacity'), NaN);
      if (get(r, 'capacity') && !(cap > 0)) errors.push('Sig‘im musbat son bo‘lishi kerak');
      const rt = roomTypeId(data, get(r, 'type'));
      if (rt === undefined) errors.push(`"${get(r, 'type')}" xona turi noma'lum`);
      const { av } = avOf(r, errors, true);
      value = { number: key, building: get(r, 'building'), floor: toNum(get(r, 'floor'), ''), capacity: cap, type: rt || 'regular', equipment: get(r, 'equipment').split(/[,;]+/).map((x) => x.trim()).filter(Boolean), availability: av };
    }
    if (entity === 'workloads') {
      const sn = get(r, 'subject'), tn = get(r, 'teacher'), gs = get(r, 'groups');
      key = `${sn} · ${gs} · ${tn}`;
      let subj = findByName(data.subjects, sn);
      if (!subj && sn) { if (opts.autoCreate) missing.subjects.set(sn.toLowerCase(), sn); else errors.push(`"${sn}" nomli fan topilmadi.${suggest(data.subjects, sn)}`); }
      const t = findByName(data.teachers, tn);
      if (!t && tn) { if (opts.autoCreate) missing.teachers.set(tn.toLowerCase(), tn); else errors.push(`"${tn}" nomli o‘qituvchi topilmadi.${suggest(data.teachers, tn)}`); }
      const target = { type: 'group', groupIds: [], subgroupId: null };
      const names = gs.split(/[,;]+/).map((x) => x.trim()).filter(Boolean);
      for (const gname of names) {
        const g = findByName(data.groups, gname);
        if (g) { target.groupIds.push(g.id); continue; }
        const owner = data.groups.find((x) => (x.subgroups || []).some((s) => s.name.toLowerCase() === gname.toLowerCase()));
        if (owner && names.length === 1) {
          target.type = 'subgroup';
          target.groupIds = [owner.id];
          target.subgroupId = owner.subgroups.find((s) => s.name.toLowerCase() === gname.toLowerCase()).id;
          continue;
        }
        if (opts.autoCreate) { missing.groups.set(gname.toLowerCase(), gname); target.groupIds.push('?' + gname); }
        else errors.push(`"${gname}" nomli guruh topilmadi.${suggest(data.groups, gname)}`);
      }
      if (target.type !== 'subgroup' && target.groupIds.length > 1) target.type = 'stream';
      const lp = toNum(get(r, 'lessonsPerWeek'), NaN);
      if (get(r, 'lessonsPerWeek') && !(lp >= 0 && Number.isInteger(lp))) errors.push('Haftalik darslar butun son bo‘lishi kerak');
      const rt = roomTypeId(data, get(r, 'roomType'));
      if (rt === undefined) errors.push(`"${get(r, 'roomType')}" xona turi noma'lum`);
      const dist = /2\s*[x×]\s*2|pairs|juft/i.test(get(r, 'distribution')) ? 'pairs' : 'spread';
      value = { subjectId: subj?.id || (sn ? '?' + sn : ''), teacherId: t?.id || (tn ? '?' + tn : ''), target, lessonsPerWeek: lp, biweeklyLessons: toNum(get(r, 'biweeklyLessons'), 0), durationSlots: Math.max(1, Math.min(3, toNum(get(r, 'durationSlots'), 1))), distribution: dist, roomType: rt || null };
      existing = data.workloads.find((w) => w.subjectId === subj?.id && w.teacherId === t?.id && JSON.stringify([...w.target.groupIds].sort()) === JSON.stringify([...target.groupIds].sort()) && (w.target.subgroupId || null) === target.subgroupId);
    }
    if (entity === 'availability') {
      const kind = norm(get(r, 'kind'));
      const nm = get(r, 'name');
      key = `${get(r, 'kind')}: ${nm}`;
      const list = kind.startsWith('oq') || kind.startsWith('teach') ? ['teachers', data.teachers, 'name'] : kind.startsWith('aud') || kind.startsWith('xona') || kind.startsWith('room') ? ['rooms', data.rooms, 'number'] : kind.startsWith('guruh') || kind.startsWith('group') ? ['groups', data.groups, 'name'] : null;
      if (!list) errors.push('Turi: O‘qituvchi, Auditoriya yoki Guruh bo‘lishi kerak');
      else {
        existing = findByName(list[1], nm, list[2]);
        if (!existing) errors.push(`"${nm}" topilmadi.${suggest(list[1], nm, list[2])}`);
        const { av } = avOf(r, errors, false);
        value = { target: list[0], availability: av };
      }
    }
    const dk = entity + '|' + key.toLowerCase();
    if (key && seen.has(dk) && entity !== 'availability') errors.push('Faylda takroriy qator');
    seen.add(dk);
    items.push({ n, status: errors.length ? 'error' : existing ? 'update' : 'new', errors, value, key, existingId: existing?.id || null });
  });
  return { items, missing };
}

/**
 * Tahlil natijasini ma'lumotga qo‘llash (store.update ichida chaqiriladi — atomik).
 * mode: 'add' (faqat yangi) | 'update' (yangi + nom bo‘yicha yangilash) | 'replace' (shu turdagi hammasini almashtirish)
 */
export function applyImport(data, entity, result, { mode = 'update', onlyValid = false } = {}) {
  const errs = result.items.filter((x) => x.status === 'error');
  if (errs.length && !onlyValid) throw new Error(`${errs.length} ta qatorda xato bor — hech narsa import qilinmadi.`);
  const ts = nowIso();
  const created = { subjects: new Map(), teachers: new Map(), groups: new Map() };
  const ctx = buildContext(data);
  const ensure = (kind, raw) => {
    if (!String(raw).startsWith('?')) return raw;
    const nm = raw.slice(1);
    const k = nm.toLowerCase();
    if (created[kind].has(k)) return created[kind].get(k);
    const existing = findByName(data[kind], nm);
    if (existing) return existing.id;
    const id = uid(kind === 'subjects' ? 'sub' : kind === 'teachers' ? 'tch' : 'grp');
    if (kind === 'subjects') data.subjects.push({ id, name: nm, code: '', icon: '📘', roomType: 'regular', required: true, active: true, createdAt: ts, updatedAt: ts });
    if (kind === 'teachers') data.teachers.push({ id, name: nm, phone: '', color: '#64748b', subjectIds: [], building: '', minWorkingDays: 1, maxWorkingDays: 5, minClassesPerDay: 1, maxClassesPerDay: 4, maxWeeklyClasses: 16, maxConsecutive: 3, availability: Object.fromEntries(ctx.workDays.map((d) => [d, ctx.slots.map((s) => s.id)])), preferredDays: [], preferredSlots: [], absences: [], active: true, createdAt: ts, updatedAt: ts });
    if (kind === 'groups') data.groups.push({ id, name: nm, course: 1, direction: '', faculty: '', studentCount: 25, shift: 1, availability: Object.fromEntries(ctx.workDays.map((d) => [d, data.settings.shifts?.[1] || ctx.slots.map((s) => s.id)])), maxLessonsPerDay: 4, subgroups: [], active: true, createdAt: ts, updatedAt: ts });
    created[kind].set(k, id);
    return id;
  };
  const coll = entity === 'availability' ? null : data[entity];
  if (mode === 'replace' && coll) {
    const keepIds = new Set();
    for (const it of result.items) if (it.status !== 'error' && it.existingId) keepIds.add(it.existingId);
    data[entity] = coll.filter((x) => keepIds.has(x.id));
    if (entity === 'workloads') data.schedule.lessons = data.schedule.lessons.filter((l) => keepIds.has(l.workloadId));
  }
  let added = 0, updated = 0, skipped = 0;
  for (const it of result.items) {
    if (it.status === 'error') { skipped++; continue; }
    const v = { ...it.value };
    if (entity === 'teachers') v.subjectIds = v.subjectIds.map((s) => ensure('subjects', s));
    if (entity === 'workloads') {
      v.subjectId = ensure('subjects', v.subjectId);
      v.teacherId = ensure('teachers', v.teacherId);
      v.target = { ...v.target, groupIds: v.target.groupIds.map((g) => ensure('groups', g)) };
    }
    if (entity === 'availability') {
      const obj = data[v.target].find((x) => x.id === it.existingId);
      if (obj) { obj.availability = { ...(obj.availability || {}), ...v.availability }; obj.updatedAt = ts; updated++; }
      continue;
    }
    const existing = it.existingId ? data[entity].find((x) => x.id === it.existingId) : null;
    if (existing) {
      if (mode === 'add') { skipped++; continue; }
      Object.assign(existing, v, { updatedAt: ts });
      updated++;
    } else {
      const prefix = { groups: 'grp', teachers: 'tch', subjects: 'sub', rooms: 'room', workloads: 'wl' }[entity];
      const base = { id: uid(prefix), active: true, createdAt: ts, updatedAt: ts };
      if (entity === 'teachers') Object.assign(base, { color: ['#e4572e', '#f59e0b', '#3b82f6', '#ec4899', '#10b981', '#8b5cf6', '#14b8a6', '#64748b'][data.teachers.length % 8], maxConsecutive: 3, preferredDays: [], preferredSlots: [], absences: [], availability: {} });
      if (entity === 'workloads') Object.assign(base, { customDistribution: null, fixedRoomId: null, preference: { days: [], slots: [], priority: 'medium' } });
      data[entity].push({ ...base, ...v });
      added++;
    }
  }
  const createdCount = Object.values(created).reduce((a, m) => a + m.size, 0);
  return { added, updated, skipped, created: createdCount };
}

// --- Shablonlar va eksport --------------------------------------------------
export function templateWorkbook(entity) {
  const def = ENTITIES[entity];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([def.cols.map((c) => c.label + (c.req ? ' *' : '')), ...def.samples]);
  ws['!cols'] = def.cols.map((c) => ({ wch: Math.max(10, c.label.length + 4) }));
  XLSX.utils.book_append_sheet(wb, ws, def.sheet);
  const help = XLSX.utils.aoa_to_sheet([
    ['Ko‘rsatma — ' + def.title], [''], [def.help], [''], ['* — majburiy ustunlar.'],
    ['Namuna qatorlarni o‘chirib, o‘z ma\'lumotlaringizni kiriting.'],
    ['Import: Smart Schedule Builder → Import / Export → Excel/CSV import.'],
    [''], ['Ustunlar:'], ...def.cols.map((c) => [`${c.label}${c.req ? ' (majburiy)' : ''}`]),
  ]);
  help['!cols'] = [{ wch: 110 }];
  XLSX.utils.book_append_sheet(wb, help, 'Ko‘rsatma');
  return wb;
}

export function downloadTemplate(entity, format = 'xlsx') {
  const wb = templateWorkbook(entity);
  if (format === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[ENTITIES[entity].sheet], { FS: ';' });
    download(`shablon-${entity}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
  } else {
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    download(`shablon-${entity}.xlsx`, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }
}

export function exportRowsXlsx(filename, sheet, aoa) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheet.slice(0, 31));
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  download(filename, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

// Barcha ma'lumotlar shablon formatida (Excel'da tahrirlab, qayta import qilish mumkin)
export function exportAllWorkbook(data) {
  const ctx = buildContext(data);
  const slots = ctx.slots;
  const wb = XLSX.utils.book_new();
  const add = (entity, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([ENTITIES[entity].cols.map((c) => c.label + (c.req ? ' *' : '')), ...rows]), ENTITIES[entity].sheet);
  const avCols = (av) => DAY_COLS.slice(0, 6).map(([d]) => slotsToText(av?.[d] || [], slots));
  const rtName = (id) => data.settings.roomTypes.find((t) => t.id === id)?.name || id;
  add('groups', data.groups.map((g) => [g.name, g.course, g.direction, g.faculty, g.studentCount, g.shift ?? '', g.maxLessonsPerDay, (g.subgroups || []).map((s) => s.studentCount).join(',')]));
  add('teachers', data.teachers.map((t) => [t.name, t.phone, (t.subjectIds || []).map((s) => ctx.subjects.get(s)?.name).filter(Boolean).join(', '), t.building, t.minWorkingDays, t.maxWorkingDays, t.minClassesPerDay, t.maxClassesPerDay, t.maxWeeklyClasses, ...avCols(t.availability)]));
  add('subjects', data.subjects.map((s) => [s.name, s.code, s.icon, rtName(s.roomType), s.required !== false ? 'Ha' : 'Yo‘q']));
  add('rooms', data.rooms.map((r) => [r.number, r.building, r.floor, r.capacity, rtName(r.type), (r.equipment || []).join(', '), ...avCols(r.availability)]));
  add('workloads', data.workloads.map((w) => [ctx.subjects.get(w.subjectId)?.name || '', wlTargetName(ctx, w), ctx.teachers.get(w.teacherId)?.name || '', w.lessonsPerWeek, w.biweeklyLessons || 0, w.durationSlots || 1, w.distribution === 'pairs' ? '2x2' : 'Har kuni', w.roomType ? rtName(w.roomType) : '']));
  return wb;
}

export function exportAllXlsx(data, filename) {
  const out = XLSX.write(exportAllWorkbook(data), { bookType: 'xlsx', type: 'array' });
  download(filename, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

export { XLSX };
