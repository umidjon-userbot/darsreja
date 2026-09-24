// YAGONA constraint manbai: generator, qo‘lda qo‘shish, drag&drop, swap,
// almashtirish va konfliktlar sahifasi — hammasi shu moduldan foydalanadi.
import {
  wlUnits, wlDuration, wlStudents, wlRoomType, lessonSlotIds, unitsOverlap, parityOverlap,
  isAvail, groupAvail, roomTypeOk, slotName, dayName, wlTargetName, roomTypeName, wlRequired, teacherMaxDays,
} from './model.js';

// ---------------------------------------------------------------------------
// Occupancy — jadvalning tezkor indeksi (kim, qachon, qayerda band)
// ---------------------------------------------------------------------------
export class Occupancy {
  constructor(ctx, lessons = []) {
    this.ctx = ctx;
    this.cells = new Map(); // "day|slotId" -> rec[]
    this.recs = new Map(); // lessonId -> rec
    this.tDay = new Map(); // teacherId -> Map(day -> Set(rec))
    this.gDay = new Map(); // groupId -> Map(day -> Set(rec))
    this.wlRecs = new Map(); // workloadId -> Set(rec)
    for (const l of lessons) this.add(l);
  }

  makeRec(lesson, teacherOverride) {
    const wl = this.ctx.workloads.get(lesson.workloadId);
    if (!wl) return null;
    const slotIds = lessonSlotIds(this.ctx, lesson, wl);
    if (!slotIds.length) return null;
    return {
      id: lesson.id, lesson, wl,
      teacherId: teacherOverride || wl.teacherId,
      roomId: lesson.roomId,
      units: wlUnits(wl),
      parity: lesson.weekParity || 'all',
      day: lesson.day,
      slotIds,
      idxs: slotIds.map((s) => this.ctx.slotIdx.get(s)),
      dur: slotIds.length,
    };
  }

  add(lesson) {
    const rec = this.makeRec(lesson);
    if (!rec) return null;
    return this.addRec(rec);
  }

  // Mavjud rec obyektini qayta qo‘shish (day/slot/room o‘zgargan bo‘lsa — yangilanadi)
  addRec(rec) {
    const l = rec.lesson;
    rec.day = l.day;
    rec.roomId = l.roomId;
    rec.parity = l.weekParity || 'all';
    rec.slotIds = lessonSlotIds(this.ctx, l, rec.wl);
    rec.idxs = rec.slotIds.map((s) => this.ctx.slotIdx.get(s));
    rec.dur = rec.slotIds.length;
    this.recs.set(rec.id, rec);
    for (const s of rec.slotIds) {
      const k = rec.day + '|' + s;
      let arr = this.cells.get(k);
      if (!arr) this.cells.set(k, (arr = []));
      arr.push(rec);
    }
    this._idx(this.tDay, rec.teacherId, rec.day, rec, true);
    for (const g of new Set(rec.units.map((u) => u.g))) this._idx(this.gDay, g, rec.day, rec, true);
    let w = this.wlRecs.get(rec.wl.id);
    if (!w) this.wlRecs.set(rec.wl.id, (w = new Set()));
    w.add(rec);
    return rec;
  }

  remove(lessonId) {
    const rec = this.recs.get(lessonId);
    if (!rec) return null;
    this.recs.delete(lessonId);
    for (const s of rec.slotIds) {
      const k = rec.day + '|' + s;
      const arr = this.cells.get(k);
      if (arr) {
        const i = arr.indexOf(rec);
        if (i >= 0) arr.splice(i, 1);
      }
    }
    this._idx(this.tDay, rec.teacherId, rec.day, rec, false);
    for (const g of new Set(rec.units.map((u) => u.g))) this._idx(this.gDay, g, rec.day, rec, false);
    this.wlRecs.get(rec.wl.id)?.delete(rec);
    return rec;
  }

  _idx(map, key, day, rec, add) {
    let m = map.get(key);
    if (!m) map.set(key, (m = new Map()));
    let s = m.get(day);
    if (!s) m.set(day, (s = new Set()));
    if (add) s.add(rec);
    else s.delete(rec);
  }

  at(day, slotId) {
    return this.cells.get(day + '|' + slotId) || [];
  }

  teacherDayRecs(tid, day) {
    return this.tDay.get(tid)?.get(day) || EMPTY;
  }

  teacherDayUnits(tid, day) {
    let n = 0;
    for (const r of this.teacherDayRecs(tid, day)) n += r.dur;
    return n;
  }

  teacherWeekUnits(tid) {
    let n = 0;
    const m = this.tDay.get(tid);
    if (m) for (const s of m.values()) for (const r of s) n += r.dur;
    return n;
  }

  teacherDays(tid) {
    const m = this.tDay.get(tid);
    if (!m) return [];
    const out = [];
    for (const [d, s] of m) if (s.size) out.push(d);
    return out;
  }

  groupDayRecs(gid, day) {
    return this.gDay.get(gid)?.get(day) || EMPTY;
  }

  // Guruh kunlik yuki = butun guruh darslari + eng band kichik guruh darslari
  groupDayLoad(gid, day, extra) {
    let whole = 0;
    const subs = new Map();
    const seenBlock = new Set();
    const addU = (u, dur, idx) => {
      if (u.block) {
        const k = u.block + '|' + idx;
        if (seenBlock.has(k)) return; // parallel tanlov variantlari bitta dars hisoblanadi
        seenBlock.add(k);
      }
      if (!u.sub) whole += dur;
      else subs.set(u.sub, (subs.get(u.sub) || 0) + dur);
    };
    for (const r of this.groupDayRecs(gid, day)) for (const u of r.units) if (u.g === gid) addU(u, r.dur, r.idxs[0]);
    if (extra) addU({ sub: extra.sub, block: extra.block }, extra.dur, extra.idx);
    let mx = 0;
    for (const v of subs.values()) mx = Math.max(mx, v);
    return whole + mx;
  }

  wlPlaced(wlId) {
    let all = 0, bi = 0;
    for (const r of this.wlRecs.get(wlId) || EMPTY) {
      if (r.parity === 'all') all++;
      else bi++;
    }
    return { all, bi };
  }

  wlRecList(wlId) {
    return [...(this.wlRecs.get(wlId) || EMPTY)];
  }
}
const EMPTY = new Set();

// ---------------------------------------------------------------------------
// Statik tekshiruv (jadvaldagi boshqa darslarga bog‘liq bo‘lmagan qoidalar)
// ---------------------------------------------------------------------------
export function staticCheck(ctx, wl, day, slotId, roomId, opts = {}) {
  const out = [];
  const push = (code, msg) => {
    out.push({ code, msg });
    return opts.first;
  };
  const tid = opts.teacherId || wl.teacherId;
  const t = ctx.teachers.get(tid);
  const subj = ctx.subjects.get(wl.subjectId);
  const room = ctx.rooms.get(roomId);
  const start = ctx.slotIdx.get(slotId);
  const dur = wlDuration(wl);

  if (!t) { if (push('H16', 'O‘qituvchi biriktirilmagan yoki o‘chirilgan.')) return out; }
  else if (t.active === false) { if (push('H16', `${t.name} nofaol.`)) return out; }
  if (wl.active === false) { if (push('H16', 'O‘quv yuklamasi nofaol.')) return out; }
  if (!subj) { if (push('H16', 'Fan topilmadi.')) return out; }
  else if (subj.active === false) { if (push('H16', `${subj.name} fani nofaol.`)) return out; }
  if (!room) { if (push('H16', 'Auditoriya tanlanmagan yoki o‘chirilgan.')) return out; }
  else if (room.active === false) { if (push('H16', `${room.number}-xona nofaol.`)) return out; }
  if (start === undefined) { if (push('ORPHAN', 'Vaqt sloti topilmadi.')) return out; return out; }
  if (!ctx.workDays.includes(day)) { if (push('H5', `${dayName(day)} ish kuni emas.`)) return out; }

  // H15 — ko‘p slotli dars
  const slotIds = [];
  for (let i = 0; i < dur; i++) {
    const s = ctx.slots[start + i];
    if (!s) { if (push('H15', `${dur} slotli dars uchun keyingi slot yo‘q.`)) return out; break; }
    if (i < dur - 1 && s.joinableWithNext === false) {
      if (push('H15', `${s.name}dan keyin katta tanaffus bor — ${dur} slotli dars bu chegarani kesib o‘tolmaydi.`)) return out;
    }
    slotIds.push(s.id);
  }

  const groups = [...new Set(wlUnits(wl).map((u) => u.g))].map((g) => ctx.groups.get(g));
  for (const g of groups) {
    if (!g) { if (push('H16', 'Guruh topilmadi.')) return out; continue; }
    if (g.active === false) { if (push('H16', `${g.name} guruhi nofaol.`)) return out; }
  }

  for (const sid of slotIds) {
    const sn = slotName(ctx, sid);
    if (ctx.weeklyBlocks.size) {
      const tb = t && ctx.weeklyBlocks.get(`t|${t.id}|${day}|${sid}`);
      if (tb) { if (push('H19', `${t.name} ${dayName(day)}, ${sn}da tadbirda: ${tb}.`)) return out; }
      for (const g of groups) {
        const gb = g && ctx.weeklyBlocks.get(`g|${g.id}|${day}|${sid}`);
        if (gb) { if (push('H19', `${g.name} ${dayName(day)}, ${sn}da tadbirda: ${gb}.`)) return out; }
      }
      const rb = room && ctx.weeklyBlocks.get(`r|${room.id}|${day}|${sid}`);
      if (rb) { if (push('H19', `${room.number}-xona ${dayName(day)}, ${sn}da tadbir uchun band: ${rb}.`)) return out; }
    }
    if (t) {
      const dayAv = t.availability?.[day] || [];
      if (!dayAv.length) { if (push('H5', `${t.name} ${dayName(day)} kuni ishlamaydi.`)) return out; }
      else if (!dayAv.includes(sid)) { if (push('H4', `${t.name} ${dayName(day)}, ${sn}da mavjud emas.`)) return out; }
    }
    for (const g of groups) {
      if (g && !groupAvail(ctx, g, day, sid)) { if (push('H7', `${g.name} guruhi ${dayName(day)}, ${sn}da dars ololmaydi (smena/availability).`)) return out; }
    }
    if (room && !isAvail(room.availability, day, sid)) { if (push('H6', `${room.number}-xona ${dayName(day)}, ${sn}da ishlatilmaydi.`)) return out; }
  }

  if (room) {
    const need = wlStudents(ctx, wl);
    if (need > (Number(room.capacity) || 0)) { if (push('H8', `${room.number}-xona sig‘imi ${room.capacity}, talabalar ${need} ta.`)) return out; }
    const rt = wlRoomType(ctx, wl);
    if (wl.fixedRoomId && wl.fixedRoomId !== room.id) {
      const fr = ctx.rooms.get(wl.fixedRoomId);
      if (push('H9', `Bu dars faqat ${fr ? fr.number + '-xona' : 'belgilangan xona'}da o‘tiladi.`)) return out;
    } else if (!roomTypeOk(rt, room)) {
      if (push('H9', `Talab: ${roomTypeName(ctx, rt)}, ${room.number}-xona esa ${roomTypeName(ctx, room.type)}.`)) return out;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// To‘liq tekshiruv: statik + to‘qnashuvlar + limitlar
// cand = { wl, day, slotId, roomId, parity }
// Chaqiruvchi ko‘chirilayotgan darsni oldindan occupancy'dan olib tashlaydi.
// ---------------------------------------------------------------------------
export function checkPlacement(ctx, occ, cand, opts = {}) {
  const { wl, day, slotId, roomId } = cand;
  const parity = cand.parity || 'all';
  // skipStatic: kandidat oldindan statik domen orqali tekshirilgan bo‘lsa (generator tezligi uchun)
  const out = opts.skipStatic ? [] : staticCheck(ctx, wl, day, slotId, roomId, opts);
  if (opts.first && out.length) return out;
  const push = (v) => {
    out.push(v);
    return opts.first;
  };
  const tid = opts.teacherId || wl.teacherId;
  const t = ctx.teachers.get(tid);
  const start = ctx.slotIdx.get(slotId);
  if (start === undefined) return out;
  const dur = wlDuration(wl);
  const units = wlUnits(wl);
  const ignore = opts.ignore;

  // H1–H3: to‘qnashuvlar
  for (let i = 0; i < dur; i++) {
    const s = ctx.slots[start + i];
    if (!s) break;
    for (const r of occ.at(day, s.id)) {
      if (ignore && ignore.has(r.id)) continue;
      if (!parityOverlap(parity, r.parity)) continue;
      const other = describeRec(ctx, r);
      const when = `${dayName(day)}, ${s.name}`;
      if (r.teacherId === tid) {
        if (push({ code: 'H1', msg: `${t?.name || 'O‘qituvchi'} bu vaqtda ${other.target} guruhida dars beradi (${when}).`, blockers: [r.id] })) return out;
      }
      if (units.some((u) => r.units.some((v) => unitsOverlap(u, v)))) {
        if (push({ code: 'H2', msg: `${other.target} bu vaqtda ${other.subject} darsida (${other.teacher}, ${when}).`, blockers: [r.id] })) return out;
      }
      if (r.roomId === roomId) {
        if (push({ code: 'H3', msg: `${other.room}-xona bu vaqtda band: ${other.subject} · ${other.target} (${when}).`, blockers: [r.id] })) return out;
      }
    }
  }

  // Limitlar
  if (t) {
    const dayUnits = occ.teacherDayUnits(tid, day);
    const maxD = Number(t.maxClassesPerDay) || 99;
    if (dayUnits + dur > maxD) { if (push({ code: 'H10', msg: `${t.name}ning ${dayName(day)} kungi limiti to‘lgan (${dayUnits}/${maxD}).` })) return out; }
    const wk = occ.teacherWeekUnits(tid);
    const maxW = Number(t.maxWeeklyClasses) || 999;
    if (wk + dur > maxW && !opts.allowWeeklyOver) { if (push({ code: 'H11', msg: `${t.name}ning haftalik limiti to‘lgan (${wk}/${maxW}).` })) return out; }
    const days = occ.teacherDays(tid);
    const maxDays = teacherMaxDays(t);
    if (!days.includes(day) && days.length + 1 > maxDays) {
      if (push({ code: 'H12', msg: `${t.name} haftasiga ko‘pi bilan ${maxDays} kun ishlaydi (hozir: ${days.map(dayName).join(', ')}).` })) return out;
    }
  }
  for (const g of new Set(units.map((u) => u.g))) {
    const grp = ctx.groups.get(g);
    if (!grp) continue;
    const max = Number(grp.maxLessonsPerDay) || 99;
    const u = units.find((x) => x.g === g);
    const load = occ.groupDayLoad(g, day, { sub: u.sub, dur, block: u.block, idx: start });
    if (load > max) { if (push({ code: 'H13', msg: `${grp.name} guruhining ${dayName(day)} kungi limiti ${max} ta dars.` })) return out; }
  }
  if (!opts.skipCount) {
    const req = wlRequired(wl);
    const placed = occ.wlPlaced(wl.id);
    if (parity === 'all' ? placed.all + 1 > req.all : placed.bi + 1 > req.bi) {
      if (push({ code: 'H14', msg: `Bu fan uchun haftalik darslar soni to‘lgan (${parity === 'all' ? req.all : req.bi} ta${parity === 'all' ? '' : ', 2 haftada 1'}).` })) return out;
    }
  }
  return out;
}

export function isValid(ctx, occ, cand, opts = {}) {
  return checkPlacement(ctx, occ, cand, { ...opts, first: true }).length === 0;
}

export function describeRec(ctx, r) {
  const wl = r.wl;
  return {
    subject: ctx.subjects.get(wl.subjectId)?.name || '?',
    target: wlTargetName(ctx, wl),
    teacher: ctx.teachers.get(r.teacherId)?.name || '?',
    room: ctx.rooms.get(r.roomId)?.number || '?',
  };
}

// Kandidat slotni band qilgan darslar (to‘qnashuv sababchilari)
export function blockersOf(ctx, occ, cand, opts = {}) {
  const { wl, day, slotId, roomId } = cand;
  const parity = cand.parity || 'all';
  const tid = opts.teacherId || wl.teacherId;
  const start = ctx.slotIdx.get(slotId);
  const units = wlUnits(wl);
  const dur = wlDuration(wl);
  const set = new Map();
  for (let i = 0; i < dur; i++) {
    const s = ctx.slots[start + i];
    if (!s) break;
    for (const r of occ.at(day, s.id)) {
      if (!parityOverlap(parity, r.parity)) continue;
      if (r.teacherId === tid || r.roomId === roomId || units.some((u) => r.units.some((v) => unitsOverlap(u, v)))) set.set(r.id, r);
    }
  }
  return [...set.values()];
}
