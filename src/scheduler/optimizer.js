// Simulated annealing: soft penaltyni kamaytirish.
// Faqat hard constraintlarni saqlaydigan harakatlar qabul qilinadi. Locked darslarga tegilmaydi.
import { isValid } from './constraintChecker.js';
import { entityPenalty, entitiesOf, mergeEnts, lessonPenalty, scoreAll } from './scoring.js';
import { wlDuration } from './model.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function optimize({ ctx, occ, movable, failed, rng, budgetMs, placeTask, onProgress }) {
  const stats = { iterations: 0, accepted: 0 };
  if (budgetMs <= 30 || !movable.length) {
    retryFailed(failed, placeTask, movable);
    return stats;
  }
  const t0 = now();
  let cur = scoreAll(ctx, occ);
  let best = cur;
  let bestPos = snapshot(movable);
  const T0 = 40, T1 = 0.2;
  let T = T0;
  let lastReport = 0;
  const pos = (l) => ({ day: l.day, slotId: l.slotId, roomId: l.roomId, weekParity: l.weekParity });

  while (true) {
    stats.iterations++;
    if ((stats.iterations & 127) === 0) {
      const el = now() - t0;
      if (el >= budgetMs) break;
      const frac = el / budgetMs;
      T = T0 * Math.pow(T1 / T0, frac);
      if (frac - lastReport > 0.05) { lastReport = frac; onProgress?.(frac); }
      // Joylashmagan darslarni qayta urinish
      if ((stats.iterations & 4095) === 0 && failed.some((t) => !t.rec)) {
        if (retryFailed(failed, placeTask, movable)) {
          cur = scoreAll(ctx, occ);
          best = cur;
          bestPos = snapshot(movable);
        }
      }
    }
    const A = movable[Math.floor(rng() * movable.length)];
    if (!A.rec || A.rec.lesson.locked) continue;
    if (rng() < 0.7) {
      // --- Ko‘chirish
      const c = A.domain[Math.floor(rng() * A.domain.length)];
      const L = A.rec.lesson;
      if (!c || (c.day === L.day && c.slotId === L.slotId && c.roomId === L.roomId && c.parity === L.weekParity)) continue;
      const ents = entitiesOf(A.wl, null, ctx);
      const before = entityPenalty(ctx, occ, ents) + lessonPenalty(ctx, A.rec);
      const old = pos(L);
      occ.remove(A.rec.id);
      if (!isValid(ctx, occ, { wl: A.wl, ...c }, { skipStatic: true })) { occ.addRec(A.rec); continue; }
      Object.assign(L, { day: c.day, slotId: c.slotId, roomId: c.roomId, weekParity: c.parity });
      occ.addRec(A.rec);
      const delta = entityPenalty(ctx, occ, ents) + lessonPenalty(ctx, A.rec) - before;
      if (delta <= 0 || rng() < Math.exp(-delta / T)) {
        cur += delta;
        stats.accepted++;
      } else {
        occ.remove(A.rec.id);
        Object.assign(L, old);
        occ.addRec(A.rec);
      }
    } else {
      // --- Almashtirish (swap)
      const B = movable[Math.floor(rng() * movable.length)];
      if (B === A || !B.rec || B.rec.lesson.locked || wlDuration(A.wl) !== wlDuration(B.wl)) continue;
      const LA = A.rec.lesson, LB = B.rec.lesson;
      if (LA.day === LB.day && LA.slotId === LB.slotId) continue;
      const ents = mergeEnts(entitiesOf(A.wl, null, ctx), entitiesOf(B.wl, null, ctx));
      const before = entityPenalty(ctx, occ, ents) + lessonPenalty(ctx, A.rec) + lessonPenalty(ctx, B.rec);
      const pa = pos(LA), pb = pos(LB);
      occ.remove(A.rec.id);
      occ.remove(B.rec.id);
      const ca = { day: pb.day, slotId: pb.slotId, roomId: pb.roomId, parity: kindParity(A, pb.weekParity) };
      const cb = { day: pa.day, slotId: pa.slotId, roomId: pa.roomId, parity: kindParity(B, pa.weekParity) };
      let ok = isValid(ctx, occ, { wl: A.wl, ...ca });
      if (ok) {
        Object.assign(LA, { day: ca.day, slotId: ca.slotId, roomId: ca.roomId, weekParity: ca.parity });
        occ.addRec(A.rec);
        ok = isValid(ctx, occ, { wl: B.wl, ...cb });
        if (!ok) { occ.remove(A.rec.id); Object.assign(LA, pa); }
      }
      if (!ok) { occ.addRec(A.rec); occ.addRec(B.rec); continue; }
      Object.assign(LB, { day: cb.day, slotId: cb.slotId, roomId: cb.roomId, weekParity: cb.parity });
      occ.addRec(B.rec);
      const delta = entityPenalty(ctx, occ, ents) + lessonPenalty(ctx, A.rec) + lessonPenalty(ctx, B.rec) - before;
      if (delta <= 0 || rng() < Math.exp(-delta / T)) {
        cur += delta;
        stats.accepted++;
      } else {
        occ.remove(A.rec.id);
        occ.remove(B.rec.id);
        Object.assign(LA, pa);
        Object.assign(LB, pb);
        occ.addRec(A.rec);
        occ.addRec(B.rec);
      }
    }
    if (cur < best - 1e-9) {
      best = cur;
      bestPos = snapshot(movable);
    }
  }
  // Eng yaxshi holatni tiklash
  if (cur > best + 1e-9) restore(occ, movable, bestPos);
  retryFailed(failed, placeTask, movable);
  return stats;
}

function kindParity(task, p) {
  if (task.kind === 'all') return 'all';
  return p === 'all' ? 'odd' : p;
}

function snapshot(movable) {
  const m = new Map();
  for (const t of movable) if (t.rec) m.set(t, { day: t.rec.lesson.day, slotId: t.rec.lesson.slotId, roomId: t.rec.lesson.roomId, weekParity: t.rec.lesson.weekParity });
  return m;
}

function restore(occ, movable, snap) {
  for (const t of movable) if (t.rec && occ.recs.has(t.rec.id)) occ.remove(t.rec.id);
  for (const t of movable) {
    if (!t.rec) continue;
    const p = snap.get(t);
    if (p) Object.assign(t.rec.lesson, p);
    occ.addRec(t.rec);
  }
}

function retryFailed(failed, placeTask, movable) {
  let any = false;
  for (const t of failed) {
    if (t.rec) continue;
    if (placeTask(t)) {
      any = true;
      if (!movable.includes(t)) movable.push(t);
    }
  }
  return any;
}
