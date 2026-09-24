// ============================================================================
// Smart Schedule Builder — avtomatik jadval generatori
//
// 1. Validatsiya va imkoniyat tahlili (feasibility pre-check)
// 2. Domen: har bir dars uchun statik hard constraintlardan o‘tgan (kun, slot, xona)
// 3. Joylashtirish: Most Constrained First (MRV) + eng kam penalty (greedy)
//    + cheklangan backtracking (ejection chain: to‘sib turgan darsni boshqa joyga surish)
// 4. Optimallashtirish: simulated annealing (faqat hard constraintni saqlaydigan harakatlar)
// 5. Natija: darslar, joylashtirilmaganlar (sabab bilan), penalty taqsimoti, izohlar
//
// Generator hard constraintlarni HECH QACHON buzmaydi. Locked darslarga tegmaydi.
// ============================================================================
import { buildContext, wlLabel as wlLabelSafe, wlRequired, wlDuration, wlRoomType, teacherAvailCount, roomAvailCount, wlGroupIds } from './model.js';
import { Occupancy, isValid, blockersOf } from './constraintChecker.js';
import { buildDomain } from './slotGenerator.js';
import { feasibility } from './feasibility.js';
import { diagnoseWorkload } from './diagnose.js';
import { scoreAll, entityPenalty, entitiesOf, mergeEnts, lessonPenalty, breakdownOf, qualityPercent } from './scoring.js';
import { explainRec } from './explainer.js';
import { optimize } from './optimizer.js';
import { makeRng, clone } from '../utils/id.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export const MODE_CONFIG = {
  fast: { ejectDepth: 1, ejectBudget: 300, candLimit: 40 },
  optimal: { ejectDepth: 2, ejectBudget: 3000, candLimit: 80 },
  max: { ejectDepth: 3, ejectBudget: 12000, candLimit: 160 },
};

let lessonSeq = 0;
function newLessonId(rng) {
  lessonSeq++;
  return 'les_' + Date.now().toString(36).slice(-5) + lessonSeq.toString(36) + Math.floor(rng() * 1e6).toString(36);
}

/**
 * @param data   to‘liq ma'lumotlar (groups, teachers, …, schedule)
 * @param options {
 *   mode: 'fast'|'optimal'|'max',
 *   keep: 'replace'|'keepLocked'|'onlyUnscheduled',
 *   scope: { groupIds?, teacherIds?, roomIds?, workloadIds? },
 *   seed, timeBudgetMs
 * }
 * @param onProgress (stage, pct, text)
 */
export function generateSchedule(data, options = {}, onProgress = () => {}) {
  const t0 = now();
  const mode = options.mode || 'optimal';
  const cfg = MODE_CONFIG[mode] || MODE_CONFIG.optimal;
  const keep = options.keep || 'keepLocked';
  const seed = options.seed ?? Math.floor(Math.random() * 1e9);
  const rng = makeRng(seed);
  const budgetMs = options.timeBudgetMs ?? (data.settings?.modes?.[mode] || { fast: 2000, optimal: 10000, max: 30000 }[mode]);
  const scope = options.scope || {};

  onProgress('validate', 3, 'Ma\'lumotlar tekshirilmoqda…');
  const ctx = buildContext(data);

  // Qamrov
  const inScope = new Set();
  for (const wl of ctx.workloads.values()) {
    if (wl.active === false) continue;
    if (scope.workloadIds?.length && !scope.workloadIds.includes(wl.id)) continue;
    if (scope.groupIds?.length && !wlGroupIds(wl).some((g) => scope.groupIds.includes(g))) continue;
    if (scope.teacherIds?.length && !scope.teacherIds.includes(wl.teacherId)) continue;
    inScope.add(wl.id);
  }
  const roomFilter = scope.roomIds?.length ? new Set(scope.roomIds) : null;

  // Saqlanadigan darslar
  const kept = [];
  const movableExisting = [];
  for (const l0 of data.schedule?.lessons || []) {
    const wl = ctx.workloads.get(l0.workloadId);
    if (!wl) continue; // yetim dars — tashlab yuboriladi
    const l = clone(l0);
    if (!inScope.has(wl.id) || l.locked) kept.push(l);
    else if (keep === 'keepLocked' && l.source === 'manual') kept.push(l);
    else if (keep === 'onlyUnscheduled') movableExisting.push(l);
    // replace: generator darslari qayta tuziladi
  }
  const occ = new Occupancy(ctx, kept);
  for (const l of movableExisting) occ.add(l);

  onProgress('feasibility', 8, 'Imkoniyat tahlili…');
  const feas = feasibility(ctx, inScope);

  onProgress('domain', 14, 'Mumkin slotlar hisoblanmoqda…');
  const domains = new Map();
  const getDomain = (wl, kind) => {
    const k = wl.id + '|' + kind;
    if (!domains.has(k)) {
      const dom = buildDomain(ctx, wl, kind, { roomFilter });
      // statik "narx" bo‘yicha saralash (afzal vaqtlar oldinda)
      for (const c of dom) c.sc = staticCost(ctx, wl, c);
      dom.sort((a, b) => a.sc - b.sc);
      domains.set(k, dom);
    }
    return domains.get(k);
  };

  // Vazifalar (tasks)
  const tasks = [];
  const recTask = new Map();
  for (const l of movableExisting) {
    const rec = occ.recs.get(l.id);
    if (!rec) continue;
    const task = { id: 'x' + l.id, wl: rec.wl, kind: rec.parity === 'all' ? 'all' : 'bi', rec, existing: true };
    task.domain = getDomain(rec.wl, task.kind);
    tasks.push(task);
    recTask.set(rec.id, task);
  }
  const newTasks = [];
  for (const wid of inScope) {
    const wl = ctx.workloads.get(wid);
    const req = wlRequired(wl);
    const placed = occ.wlPlaced(wid);
    for (const [kind, n] of [['all', req.all - placed.all], ['bi', req.bi - placed.bi]]) {
      for (let i = 0; i < n; i++) {
        const task = { id: wid + '|' + kind + '|' + i, wl, kind, rec: null, existing: false };
        task.domain = getDomain(wl, kind);
        task.prio = priorityKey(ctx, wl, task.domain);
        tasks.push(task);
        newTasks.push(task);
      }
    }
  }

  // Domeni bo‘sh yuklamalar — oldindan ma'lum imkonsizlik
  const seenEmpty = new Set();
  for (const t of newTasks) {
    if (t.domain.length || seenEmpty.has(t.wl.id)) continue;
    seenEmpty.add(t.wl.id);
    const d = diagnoseWorkload(ctx, occ, t.wl, t.domain, t.kind === 'all' ? 'all' : 'bi');
    feas.push({ level: 'error', kind: 'workload', id: t.wl.id, msg: `${wlLabelSafe(ctx, t.wl)} — joylashtirish uchun birorta ham mumkin vaqt yo‘q. ${d.detail}` });
  }

  // --- Joylashtirish -------------------------------------------------------
  onProgress('placing', 20, 'Darslar joylashtirilmoqda…');
  const state = { ejectLeft: cfg.ejectBudget, rng, ctx, occ, recTask };
  const failed = [];
  const pending = new Set(newTasks);
  const dirtyAll = () => { for (const t of pending) t.dirty = true; };
  dirtyAll();
  const total = newTasks.length || 1;
  let done = 0;
  while (pending.size) {
    // MRV: eng kam variantli vazifa
    let best = null;
    for (const t of pending) {
      if (t.dirty) {
        t.valid = countValid(ctx, occ, t, cfg.candLimit * 4);
        t.dirty = false;
      }
      if (!best || cmpTask(t, best) < 0) best = t;
    }
    pending.delete(best);
    let ok = false;
    if (best.valid > 0) ok = placeBest(state, best, cfg.candLimit);
    if (!ok) ok = tryEject(state, best, cfg.ejectDepth);
    if (!ok) failed.push(best);
    // ta'sirlangan vazifalarni belgilash
    const tId = best.wl.teacherId;
    const gIds = new Set(wlGroupIds(best.wl));
    for (const t of pending) {
      if (t.wl.teacherId === tId || wlGroupIds(t.wl).some((g) => gIds.has(g)) || t.wl.id === best.wl.id) t.dirty = true;
      else if (ok && best.rec && t.domain.length < 60) t.dirty = true; // xona to‘qnashuvi ta'siri (kichik domenlar)
    }
    done++;
    if (done % 10 === 0) onProgress('placing', 20 + Math.round((done / total) * 30), `Darslar joylashtirilmoqda… ${done}/${total}`);
    if (ok && state.ejected) { dirtyAll(); state.ejected = false; }
  }

  const baseItems = [];
  const basePenalty = scoreAll(ctx, occ, baseItems);

  // --- Optimallashtirish ---------------------------------------------------
  const elapsed = now() - t0;
  const saBudget = Math.max(0, budgetMs - elapsed);
  onProgress('optimizing', 55, 'Optimallashtirilmoqda…');
  const movable = tasks.filter((t) => t.rec && !t.existing);
  const optStats = optimize({
    ctx, occ, movable, failed, rng, budgetMs: saBudget,
    placeTask: (t) => placeBest(state, t, cfg.candLimit),
    onProgress: (pct) => onProgress('optimizing', 55 + Math.round(pct * 35), 'Optimallashtirilmoqda…'),
  });

  // --- Yakuniy tekshiruv va izohlar ----------------------------------------
  onProgress('checking', 92, 'Konfliktlar tekshirilmoqda…');
  const items = [];
  const finalPenalty = scoreAll(ctx, occ, items);
  for (const t of tasks) {
    if (!t.rec) continue;
    t.rec.lesson.explanation = explainRec(ctx, occ, t.rec, t.domain);
  }

  // Joylashtirilmaganlar (yuklama bo‘yicha guruhlangan)
  const unsched = new Map();
  for (const t of failed) {
    if (t.rec) continue;
    const k = t.wl.id + '|' + t.kind;
    if (!unsched.has(k)) unsched.set(k, { task: t, missing: 0 });
    unsched.get(k).missing++;
  }
  const unscheduled = [];
  for (const { task, missing } of unsched.values()) {
    const wl = task.wl;
    const req = wlRequired(wl);
    const placed = occ.wlPlaced(wl.id);
    const d = diagnoseWorkload(ctx, occ, wl, task.domain, task.kind === 'all' ? 'all' : 'bi');
    unscheduled.push({
      workloadId: wl.id, kind: task.kind,
      required: task.kind === 'all' ? req.all : req.bi,
      placed: task.kind === 'all' ? placed.all : placed.bi,
      missing, code: d.code, detail: d.detail,
    });
  }

  const lessons = [...occ.recs.values()].map((r) => r.lesson);
  const required = [...inScope].reduce((a, id) => { const r = wlRequired(ctx.workloads.get(id)); return a + r.all + r.bi; }, 0);
  const placedInScope = lessons.filter((l) => inScope.has(l.workloadId)).length;
  const stats = {
    mode, seed, keep,
    required, placed: placedInScope,
    newlyPlaced: newTasks.filter((t) => t.rec).length,
    unscheduledCount: unscheduled.reduce((a, u) => a + u.missing, 0),
    coverage: required ? Math.round((placedInScope / required) * 1000) / 10 : 100,
    basePenalty, penalty: finalPenalty,
    quality: qualityPercent(finalPenalty, basePenalty, lessons.length),
    breakdown: breakdownOf(items),
    softWarnings: items.length,
    elapsedMs: Math.round(now() - t0),
    iterations: optStats.iterations,
    accepted: optStats.accepted,
    ejectionsUsed: cfg.ejectBudget - state.ejectLeft,
  };
  onProgress('done', 100, 'Tayyor.');
  return { lessons, unscheduled, feasibility: feas, stats };
}

// ---------------------------------------------------------------------------
function staticCost(ctx, wl, c) {
  const t = ctx.teachers.get(wl.teacherId);
  let s = 0;
  if (t?.preferredDays?.length && !t.preferredDays.includes(c.day)) s += ctx.weights.S3;
  if (t?.preferredSlots?.length && !t.preferredSlots.includes(c.slotId)) s += ctx.weights.S4;
  const pr = wl.preference;
  if (pr) {
    const w = ctx.weights['S5_' + (pr.priority || 'medium')] || 20;
    if (pr.days?.length && !pr.days.includes(c.day)) s += w;
    if (pr.slots?.length && !pr.slots.includes(c.slotId)) s += w;
  }
  if (ctx.slotIdx.get(c.slotId) + wlDuration(wl) - 1 === ctx.lastSlotIdx) s += ctx.weights.S13;
  return s;
}

function priorityKey(ctx, wl, domain) {
  const t = ctx.teachers.get(wl.teacherId);
  const rt = wlRoomType(ctx, wl);
  const special = rt !== 'regular' || wl.fixedRoomId ? 1 : 0;
  const rooms = [...ctx.rooms.values()].filter((r) => r.type === rt);
  const roomAvail = special ? rooms.reduce((a, r) => a + roomAvailCount(ctx, r), 0) : 999;
  const multi = (wl.target?.type === 'stream' ? 1 : 0) + (wlDuration(wl) > 1 ? 1 : 0);
  return [
    -special,
    t ? teacherAvailCount(ctx, t) : 0,
    roomAvail,
    -multi,
    -(Number(wl.lessonsPerWeek) || 0),
    domain.length,
  ];
}

function cmpTask(a, b) {
  if (a.valid !== b.valid) return a.valid - b.valid;
  for (let i = 0; i < a.prio.length; i++) if (a.prio[i] !== b.prio[i]) return a.prio[i] - b.prio[i];
  return 0;
}

function countValid(ctx, occ, task, cap) {
  let n = 0;
  for (const c of task.domain) {
    if (isValid(ctx, occ, { wl: task.wl, ...c }, { skipStatic: true })) {
      n++;
      if (n >= cap) break;
    }
  }
  return n;
}

function makeLesson(state, task, c) {
  return {
    id: newLessonId(state.rng), workloadId: task.wl.id,
    day: c.day, slotId: c.slotId, roomId: c.roomId, weekParity: c.parity || 'all',
    locked: false, source: 'generator', explanation: null,
  };
}

// Eng kam penalty beradigan to‘g‘ri kandidatga joylashtirish
export function placeBest(state, task, candLimit = 80) {
  const { ctx, occ, rng } = state;
  const wl = task.wl;
  const ents = entitiesOf(wl, null, ctx);
  const before = entityPenalty(ctx, occ, ents);
  let best = null, bestCost = Infinity, seen = 0;
  const probe = { id: '__probe', workloadId: wl.id, day: null, slotId: null, roomId: null, weekParity: 'all' };
  const usedCells = new Set();
  for (const c of task.domain) {
    if (!isValid(ctx, occ, { wl, ...c }, { skipStatic: true })) continue;
    // Bir xil (kun, slot) uchun faqat birinchi (eng kichik mos) xonani baholash
    const cell = c.day + '|' + c.slotId + '|' + c.parity;
    if (usedCells.has(cell)) continue;
    usedCells.add(cell);
    probe.day = c.day; probe.slotId = c.slotId; probe.roomId = c.roomId; probe.weekParity = c.parity;
    const rec = occ.add(probe);
    const cost = entityPenalty(ctx, occ, ents) - before + lessonPenalty(ctx, rec) + rng() * 0.5;
    occ.remove(probe.id);
    if (cost < bestCost) { bestCost = cost; best = c; }
    if (++seen >= candLimit * 3) break;
  }
  if (!best) return false;
  const lesson = makeLesson(state, task, best);
  task.rec = occ.add(lesson);
  state.recTask.set(lesson.id, task);
  return true;
}

// Cheklangan backtracking (ejection chain): to‘sib turgan 1–2 ta harakatlanuvchi darsni
// boshqa joyga surish. Barcha o‘zgarishlar jurnalga yoziladi va muvaffaqiyatsiz bo‘lsa
// aynan oldingi holatga qaytariladi — shuning uchun hard constraint hech qachon buzilmaydi.
const posOf = (l) => ({ day: l.day, slotId: l.slotId, roomId: l.roomId, weekParity: l.weekParity });

function jRemove(state, rec) {
  state.occ.remove(rec.id);
  state.journal.push({ op: 'remove', rec, pos: posOf(rec.lesson) });
}

function jPlace(state, task, c) {
  const { occ } = state;
  if (task.rec) {
    const prev = posOf(task.rec.lesson);
    Object.assign(task.rec.lesson, { day: c.day, slotId: c.slotId, roomId: c.roomId, weekParity: c.parity || 'all' });
    occ.addRec(task.rec);
    state.journal.push({ op: 'place', task, rec: task.rec, prev, fresh: false });
  } else {
    const lesson = makeLesson(state, task, c);
    task.rec = occ.add(lesson);
    state.recTask.set(lesson.id, task);
    state.journal.push({ op: 'place', task, rec: task.rec, fresh: true });
  }
}

function rollback(state, mark) {
  const { occ } = state;
  while (state.journal.length > mark) {
    const j = state.journal.pop();
    if (j.op === 'remove') {
      Object.assign(j.rec.lesson, j.pos);
      occ.addRec(j.rec);
    } else {
      occ.remove(j.rec.id);
      if (j.fresh) {
        j.task.rec = null;
        state.recTask.delete(j.rec.id);
      } else Object.assign(j.rec.lesson, j.prev);
    }
  }
}

function tryEject(state, task, depth) {
  const top = !state.journal;
  if (top) state.journal = [];
  try {
    return ejectRec(state, task, depth);
  } finally {
    if (top) state.journal = null;
  }
}

function ejectRec(state, task, depth) {
  const { ctx, occ } = state;
  if (depth <= 0 || state.ejectLeft <= 0) return false;
  const wl = task.wl;
  let tried = 0;
  for (const c of task.domain) {
    if (state.ejectLeft-- <= 0) return false;
    if (++tried > 150) break;
    const blockers = blockersOf(ctx, occ, { wl, ...c });
    if (!blockers.length || blockers.length > 2) continue;
    const bTasks = blockers.map((b) => state.recTask.get(b.id));
    if (bTasks.some((bt) => !bt || bt.rec?.lesson.locked)) continue; // qulflangan/saqlanadigan darslarga tegilmaydi
    const mark = state.journal.length;
    const oldPos = blockers.map((b) => posOf(b.lesson));
    for (const b of blockers) jRemove(state, b);
    if (!isValid(ctx, occ, { wl, ...c }, { skipStatic: true })) { rollback(state, mark); continue; }
    jPlace(state, task, c);
    let ok = true;
    for (let i = 0; i < bTasks.length; i++) {
      const bt = bTasks[i];
      const alt = findSpot(state, bt, oldPos[i]);
      if (alt) { jPlace(state, bt, alt); continue; }
      if (!ejectRec(state, bt, depth - 1)) { ok = false; break; }
    }
    if (ok) { state.ejected = true; return true; }
    rollback(state, mark);
  }
  return false;
}

function findSpot(state, task, old) {
  const { ctx, occ } = state;
  for (const c of task.domain) {
    if (old && c.day === old.day && c.slotId === old.slotId && c.roomId === old.roomId) continue;
    if (isValid(ctx, occ, { wl: task.wl, ...c }, { skipStatic: true })) return c;
  }
  return null;
}

// Tashqi foydalanish uchun
export { mergeEnts };
