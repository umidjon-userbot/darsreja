// CSV eksport (UTF-8 BOM — Excel o‘zbek harflarini to‘g‘ri ko‘rsatishi uchun)
import { download } from '../utils/dom.js';
import { buildContext, wlTargetName, wlGroupIds, wlLabel } from '../scheduler/model.js';
import { DAYS, PARITY } from '../i18n/uz.js';
import { fmtHuman } from '../utils/date.js';

export function toCsv(rows, sep = ';') {
  return rows.map((r) => r.map((v) => {
    const s = String(v ?? '');
    return /[";\n\r,]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(sep)).join('\r\n');
}

export function downloadCsv(name, csv) {
  download(name, '﻿' + csv, 'text/csv;charset=utf-8');
}

function lessonRow(ctx, l) {
  const wl = ctx.workloads.get(l.workloadId);
  const s = ctx.slots[ctx.slotIdx.get(l.slotId)];
  return {
    day: DAYS[l.day] || l.day, dayIdx: ctx.workDays.indexOf(l.day), slotIdx: ctx.slotIdx.get(l.slotId) ?? 99,
    time: s ? `${s.start}–${s.end}` : '', para: s?.name || '',
    subject: ctx.subjects.get(wl?.subjectId)?.name || '', group: wl ? wlTargetName(ctx, wl) : '',
    teacher: ctx.teachers.get(wl?.teacherId)?.name || '', room: ctx.rooms.get(l.roomId)?.number || '',
    parity: PARITY[l.weekParity || 'all'], locked: l.locked ? 'Ha' : '', groupIds: wl ? wlGroupIds(wl) : [], teacherId: wl?.teacherId, roomId: l.roomId,
  };
}

// type: 'general' | 'group' | 'teacher' | 'room'
export function scheduleCsv(data, type = 'general') {
  const ctx = buildContext(data);
  const rows = data.schedule.lessons.map((l) => lessonRow(ctx, l)).sort((a, b) => a.dayIdx - b.dayIdx || a.slotIdx - b.slotIdx);
  const head = ['Kun', 'Para', 'Vaqt', 'Fan', 'Guruh', 'O‘qituvchi', 'Auditoriya', 'Hafta', 'Qulflangan'];
  const line = (r) => [r.day, r.para, r.time, r.subject, r.group, r.teacher, r.room, r.parity, r.locked];
  if (type === 'general') return toCsv([head, ...rows.map(line)]);
  const out = [];
  const groups = type === 'group' ? data.groups.map((g) => [g.id, g.name, (r) => r.groupIds.includes(g.id)])
    : type === 'teacher' ? data.teachers.map((t) => [t.id, t.name, (r) => r.teacherId === t.id])
      : data.rooms.map((x) => [x.id, x.number + '-xona', (r) => r.roomId === x.id]);
  const label = { group: 'Guruh', teacher: 'O‘qituvchi', room: 'Auditoriya' }[type];
  out.push([label, ...head]);
  for (const [, name, fn] of groups) for (const r of rows.filter(fn)) out.push([name, ...line(r)]);
  return toCsv(out);
}

export function unscheduledCsv(data, list) {
  const ctx = buildContext(data);
  return toCsv([['Fan · Guruh', 'O‘qituvchi', 'Talab', 'Joylashdi', 'Qoldi'], ...list.map((u) => [wlLabel(ctx, u.wl), ctx.teachers.get(u.wl.teacherId)?.name || '', u.required, u.placed, u.missing])]);
}

export function substitutionsCsv(data) {
  const ctx = buildContext(data);
  const rows = [['Sana', 'Kun', 'Para', 'Fan · Guruh', 'Asl o‘qituvchi', 'Almashtiruvchi', 'Harakat', 'Sabab']];
  for (const s of data.substitutions || []) {
    if (s.cancelled) continue;
    for (const o of s.occurrences || []) {
      const l = data.schedule.lessons.find((x) => x.id === o.lessonId);
      const wl = l && ctx.workloads.get(l.workloadId);
      rows.push([fmtHuman(o.date), DAYS[l?.day] || '', ctx.slots[ctx.slotIdx.get(o.newSlotId || l?.slotId)]?.name || '', wl ? wlLabel(ctx, wl) : '', ctx.teachers.get(s.originalTeacherId)?.name || '', ctx.teachers.get(s.substituteTeacherId)?.name || '', o.action === 'substitute' ? 'Almashtirildi' : o.action === 'move' ? 'Ko‘chirildi' : 'Bekor', s.reason]);
    }
  }
  return toCsv(rows);
}
