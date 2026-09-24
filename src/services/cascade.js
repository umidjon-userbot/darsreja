// O‘chirish (kaskad) qoidalari uchun ta'sir tahlili
import { wlGroupIds } from '../scheduler/model.js';

export function teacherDeletionImpact(data, teacherId) {
  const workloads = data.workloads.filter((w) => w.teacherId === teacherId);
  const ids = new Set(workloads.map((w) => w.id));
  const lessons = data.schedule.lessons.filter((l) => ids.has(l.workloadId));
  return { blocked: lessons.length > 0, workloads, lessons };
}

export function groupDeletionImpact(data, groupId) {
  const wls = data.workloads.filter((w) => wlGroupIds(w).includes(groupId));
  const sole = wls.filter((w) => wlGroupIds(w).length === 1);
  const stream = wls.filter((w) => wlGroupIds(w).length > 1);
  const soleIds = new Set(sole.map((w) => w.id));
  const lessons = data.schedule.lessons.filter((l) => soleIds.has(l.workloadId));
  return { sole, stream, lessons };
}
