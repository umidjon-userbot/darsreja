// Doimiy (to‘liq) o‘tkazish: yuklama boshqa o‘qituvchiga beriladi
import { simulateTransfer } from './candidates.js';
import { generateSchedule } from '../scheduler/scheduler.js';
import { uid, nowIso, clone } from '../utils/id.js';
import { todayStr } from '../utils/date.js';

/**
 * @param p { workloadIds, toTeacherId, effectiveDate, reason, strategy: 'auto'|'unschedule', groupIds? }
 * @returns transfer yozuvlari
 */
export function applyPermanentTransfer(data, p) {
  const records = [];
  if (!p.toTeacherId) throw new Error('Yangi o‘qituvchi tanlanmagan.');
  for (const wlId0 of p.workloadIds) {
    let wl = data.workloads.find((w) => w.id === wlId0);
    if (!wl) continue;
    if (wl.teacherId === p.toTeacherId) continue;
    const from = wl.teacherId;
    let wlId = wlId0;
    let split = null;
    // Qisman o‘tkazish (potokdagi ayrim guruhlar)
    const gids = wl.target?.groupIds || [];
    if (p.groupIds?.length && wl.target?.type === 'stream' && p.groupIds.length < gids.length) {
      const sel = gids.filter((g) => p.groupIds.includes(g));
      const rest = gids.filter((g) => !p.groupIds.includes(g));
      const nw = clone(wl);
      nw.id = uid('wl');
      nw.teacherId = p.toTeacherId;
      nw.target = { type: sel.length > 1 ? 'stream' : 'group', groupIds: sel, subgroupId: null };
      nw.createdAt = nw.updatedAt = nowIso();
      wl.target = { ...wl.target, type: rest.length > 1 ? 'stream' : 'group', groupIds: rest };
      wl.updatedAt = nowIso();
      data.workloads.push(nw);
      split = wl.id;
      wlId = nw.id;
      wl = nw;
    }
    let misfit = new Set();
    if (!split) {
      const sim = simulateTransfer(data, [wlId], p.toTeacherId);
      misfit = new Set(sim.miss.map((m) => m.lesson.id));
      wl.teacherId = p.toTeacherId;
      wl.updatedAt = nowIso();
      data.schedule.lessons = data.schedule.lessons.filter((l) => !misfit.has(l.id));
    }
    const before = new Set(data.schedule.lessons.filter((l) => l.workloadId === wlId).map((l) => l.id));
    let moved = [];
    const needPlacement = split || misfit.size;
    if (needPlacement && p.strategy !== 'unschedule') {
      const r = generateSchedule(data, { mode: 'fast', keep: 'onlyUnscheduled', scope: { workloadIds: [wlId] }, timeBudgetMs: 400 });
      data.schedule.lessons = r.lessons;
      moved = r.lessons.filter((l) => l.workloadId === wlId && !before.has(l.id)).map((l) => l.id);
    }
    const expected = split ? (Number(wl.lessonsPerWeek) || 0) + (Number(wl.biweeklyLessons) || 0) : misfit.size;
    const rec = {
      id: uid('trf'), workloadId: wlId, splitFrom: split,
      fromTeacherId: from, toTeacherId: p.toTeacherId,
      effectiveDate: p.effectiveDate || todayStr(), reason: p.reason || '',
      movedLessons: moved, unscheduledCount: Math.max(0, expected - moved.length),
      createdAt: nowIso(),
    };
    data.transfers = data.transfers || [];
    data.transfers.push(rec);
    records.push(rec);
  }
  return records;
}

// Qaytarish: teskari o‘tkazish (tarix saqlanadi)
export function revertTransfer(data, trfId) {
  const tr = data.transfers.find((t) => t.id === trfId);
  if (!tr || tr.reverted) throw new Error('O‘tkazish topilmadi yoki allaqachon qaytarilgan.');
  if (tr.splitFrom) {
    const orig = data.workloads.find((w) => w.id === tr.splitFrom);
    const part = data.workloads.find((w) => w.id === tr.workloadId);
    if (orig && part) {
      orig.target = { ...orig.target, type: 'stream', groupIds: [...new Set([...orig.target.groupIds, ...part.target.groupIds])] };
      data.workloads = data.workloads.filter((w) => w.id !== part.id);
      data.schedule.lessons = data.schedule.lessons.filter((l) => l.workloadId !== part.id);
    }
    tr.reverted = true;
    return [];
  }
  const recs = applyPermanentTransfer(data, { workloadIds: [tr.workloadId], toTeacherId: tr.fromTeacherId, effectiveDate: todayStr(), reason: 'Qaytarildi', strategy: 'auto' });
  tr.reverted = true;
  for (const r of recs) r.revertOf = tr.id;
  return recs;
}
