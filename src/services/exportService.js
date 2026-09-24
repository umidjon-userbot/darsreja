// JSON eksport / backup
import { download } from '../utils/dom.js';
import { SCHEMA_VERSION } from '../data/defaults.js';
import { todayStr } from '../utils/date.js';

export function buildExport(data) {
  return {
    app: 'Smart Schedule Builder',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    groups: data.groups, teachers: data.teachers, subjects: data.subjects, workloads: data.workloads,
    rooms: data.rooms, timeslots: data.timeslots, calendar: data.calendar, schedule: data.schedule,
    substitutions: data.substitutions, transfers: data.transfers, settings: data.settings, lessonLog: data.lessonLog,
    conflictLog: data.conflictLog, meta: { ...data.meta, schemaVersion: SCHEMA_VERSION },
  };
}

export function exportJson(data, prefix = 'smart-schedule-export') {
  download(`${prefix}-${todayStr()}.json`, JSON.stringify(buildExport(data), null, 2), 'application/json');
}

export function backup(data) {
  exportJson(data, 'smart-schedule-backup');
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('app:backup'));
}
