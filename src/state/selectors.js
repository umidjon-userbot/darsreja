// Ko‘rinish uchun hisoblangan qiymatlar (kesh bilan)
import { store } from './store.js';
import { buildContext, wlTargetName, wlRequired, wlDuration, roomTypeName, wlGroupIds } from '../scheduler/model.js';
import { Occupancy } from '../scheduler/constraintChecker.js';
import { allConflicts } from '../services/conflictService.js';

let memo = { rev: -1 };
function cached(key, fn) {
  if (memo.rev !== store.rev) memo = { rev: store.rev };
  if (!(key in memo)) memo[key] = fn();
  return memo[key];
}

export const ctx = () => cached('ctx', () => buildContext(store.get()));
export const occ = () => cached('occ', () => new Occupancy(ctx(), store.get().schedule.lessons));
export const conflicts = () => cached('conflicts', () => allConflicts(store.get(), store.rev));
export const criticalConflicts = () => conflicts().filter((c) => c.severity === 'critical');

// Shablon konfliktlari (sanaga bog‘liq bo‘lmagan)
export function conflictLessonIds() {
  return cached('conflictLessonIds', () => new Set(criticalConflicts().filter((c) => !c.date).flatMap((c) => c.lessonIds)));
}

// Sana konfliktlari (almashtirish/yo‘qlik): "sana|darsId"
export function dateConflictKeys() {
  return cached('dateConflictKeys', () => new Set(criticalConflicts().filter((c) => c.date).flatMap((c) => c.lessonIds.map((id) => c.date + '|' + id))));
}

export function lessonVM(lesson, c = ctx()) {
  const wl = c.workloads.get(lesson.workloadId);
  const subject = wl ? c.subjects.get(wl.subjectId) : null;
  const teacher = wl ? c.teachers.get(wl.teacherId) : null;
  const room = c.rooms.get(lesson.roomId);
  return {
    lesson, wl, subject, teacher, room,
    target: wl ? wlTargetName(c, wl) : '—',
    color: teacher?.color || '#4f46e5',
    icon: subject?.icon || '📘',
    dur: wl ? wlDuration(wl) : 1,
    groupIds: wl ? wlGroupIds(wl) : [],
  };
}

export function unscheduledList() {
  return cached('unscheduled', () => {
    const d = store.get();
    const c = ctx();
    const o = occ();
    const lastRun = d.schedule.lastRun;
    const out = [];
    for (const wl of c.workloads.values()) {
      if (wl.active === false) continue;
      const req = wlRequired(wl);
      const p = o.wlPlaced(wl.id);
      const missing = Math.max(0, req.all - p.all) + Math.max(0, req.bi - p.bi);
      if (!missing) continue;
      const fromRun = lastRun?.unscheduled?.find((u) => u.workloadId === wl.id);
      out.push({ wl, required: req.all + req.bi, placed: p.all + p.bi, missing, code: fromRun?.code, detail: fromRun?.detail });
    }
    return out;
  });
}

export function counts() {
  return cached('counts', () => {
    const d = store.get();
    const required = d.workloads.filter((w) => w.active !== false).reduce((a, w) => { const r = wlRequired(w); return a + r.all + r.bi; }, 0);
    const list = conflicts();
    return {
      groups: d.groups.length, teachers: d.teachers.length, subjects: d.subjects.length, rooms: d.rooms.length,
      workloads: d.workloads.length, required, placed: d.schedule.lessons.length,
      unscheduled: unscheduledList().reduce((a, u) => a + u.missing, 0),
      critical: list.filter((x) => x.severity === 'critical').length,
      warnings: list.filter((x) => x.severity === 'warning').length,
    };
  });
}

export const roomTypeLabel = (id) => roomTypeName(ctx(), id);

export function teacherName(id) { return ctx().teachers.get(id)?.name || '—'; }
export function groupName(id) { return ctx().groups.get(id)?.name || '—'; }
export function subjectName(id) { return ctx().subjects.get(id)?.name || '—'; }
export function roomName(id) { const r = ctx().rooms.get(id); return r ? r.number : '—'; }
