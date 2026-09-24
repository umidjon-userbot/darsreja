// .ics (iCalendar) eksport: Google Calendar, Apple Calendar, Outlook, telefon kalendari
import { buildContext, wlTargetName, wlGroupIds } from '../scheduler/model.js';
import { weekParity, spanSlots } from '../substitution/calendarResolver.js';
import { sortedVersions } from '../analysis/versions.js';
import { dateRange, dayKeyOf, addDays } from '../utils/date.js';

const TZ = 'Asia/Tashkent';

const escText = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

function fold(line) {
  // RFC 5545: 75 oktetdan uzun qatorlar bo‘linadi
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let cur = '';
  let len = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    if (len + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; len = 0; }
    cur += ch;
    len += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const dt = (date, time) => date.replace(/-/g, '') + 'T' + time.replace(':', '') + '00';

function occurrenceDates(cal, lesson, from = cal.startDate, to = cal.endDate) {
  const out = [];
  for (const d of dateRange(from, to)) {
    if (dayKeyOf(d) !== lesson.day) continue;
    if (lesson.weekParity && lesson.weekParity !== 'all' && weekParity(cal, d) !== lesson.weekParity) continue;
    out.push(d);
  }
  return out;
}

/**
 * @param target { type: 'teacher'|'group'|'room', id }
 */
export function buildIcs(data, target) {
  const ctx = buildContext(data);
  const cal = data.calendar;
  const holidays = new Set((cal.holidays || []).map((h) => h.date));
  const subs = (data.substitutions || []).filter((s) => !s.cancelled);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const name = target.type === 'teacher' ? ctx.teachers.get(target.id)?.name : target.type === 'group' ? ctx.groups.get(target.id)?.name : (ctx.rooms.get(target.id)?.number || '') + '-xona';
  const L = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Smart Schedule Builder//UZ', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escText(name + ' — dars jadvali')}`, `X-WR-TIMEZONE:${TZ}`,
    'BEGIN:VTIMEZONE', `TZID:${TZ}`, 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0500', 'TZOFFSETTO:+0500', 'TZNAME:+05', 'END:STANDARD', 'END:VTIMEZONE',
  ];
  const belongs = (l, wl) => (target.type === 'teacher' ? wl.teacherId === target.id : target.type === 'group' ? wlGroupIds(wl).includes(target.id) : l.roomId === target.id);
  const event = (uid, date, slotIds, wl, roomId, teacherId, extra = {}) => {
    const s0 = ctx.slots[ctx.slotIdx.get(slotIds[0])];
    const s1 = ctx.slots[ctx.slotIdx.get(slotIds[slotIds.length - 1])];
    const subj = ctx.subjects.get(wl.subjectId)?.name || 'Dars';
    const ev = ['BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`, `DTSTART;TZID=${TZ}:${dt(date, s0.start)}`, `DTEND;TZID=${TZ}:${dt(date, s1.end)}`,
      `SUMMARY:${escText(`${subj} — ${wlTargetName(ctx, wl)}${extra.prefix || ''}`)}`,
      `LOCATION:${escText((ctx.rooms.get(roomId)?.number || '') + '-xona')}`,
      `DESCRIPTION:${escText(`O‘qituvchi: ${ctx.teachers.get(teacherId)?.name || ''}\nGuruh: ${wlTargetName(ctx, wl)}${extra.note ? '\n' + extra.note : ''}`)}`];
    if (extra.rrule) ev.push(extra.rrule);
    if (extra.exdates?.length) ev.push(`EXDATE;TZID=${TZ}:${extra.exdates.map((d) => dt(d, s0.start)).join(',')}`);
    ev.push('END:VEVENT');
    return ev;
  };
  let count = 0;
  // Versiyalar: har biri o‘z sana oralig‘ida (e'lon qilinmagan bo‘lsa — ishchi jadval butun semestrga)
  const vers = sortedVersions(data);
  const segments = vers.length
    ? vers.map((v, i) => ({ v, from: i === 0 ? cal.startDate : (v.effectiveFrom > cal.startDate ? v.effectiveFrom : cal.startDate), to: vers[i + 1] ? addDays(vers[i + 1].effectiveFrom, -1) : cal.endDate }))
    : [{ v: { id: '', lessons: data.schedule.lessons }, from: cal.startDate, to: cal.endDate }];
  for (const seg of segments) {
  if (seg.from > seg.to) continue;
  const vtag = seg.v.id ? '-' + seg.v.id : '';
  for (const l of seg.v.lessons) {
    const wl = ctx.workloads.get(l.workloadId);
    if (!wl || !ctx.slotIdx.has(l.slotId)) continue;
    const span = spanSlots(ctx, l.slotId, wl);
    const dates = occurrenceDates(cal, l, seg.from, seg.to);
    const own = belongs(l, wl);
    const ex = [];
    const singles = [];
    for (const d of dates) {
      if (holidays.has(d)) { ex.push(d); continue; }
      const s = subs.find((x) => x.workloadIds.includes(wl.id) && d >= x.startDate && d <= x.endDate);
      if (!s) continue;
      const o = (s.occurrences || []).find((x) => x.date === d && x.lessonId === l.id) || { action: 'substitute' };
      if (target.type === 'teacher') {
        if (own) ex.push(d); // asl o‘qituvchi bu kuni dars bermaydi
        if (s.substituteTeacherId === target.id && o.action !== 'cancel') {
          const sl = o.action === 'move' ? spanSlots(ctx, o.newSlotId, wl) : span;
          singles.push(event(`${l.id}-${d}-sub@smart-schedule-builder`, d, sl, wl, o.newRoomId || l.roomId, target.id, { prefix: ' (almashtirish)', note: `Asl o‘qituvchi: ${ctx.teachers.get(s.originalTeacherId)?.name || ''}` }));
        }
      } else if (own) {
        ex.push(d);
        if (o.action !== 'cancel') {
          const sl = o.action === 'move' ? spanSlots(ctx, o.newSlotId, wl) : span;
          const room = o.newRoomId || l.roomId;
          if (target.type !== 'room' || room === target.id) singles.push(event(`${l.id}-${d}-sub@smart-schedule-builder`, d, sl, wl, room, s.substituteTeacherId, { prefix: ' (almashtirish)' }));
        }
      }
    }
    if (!own) { for (const s of singles) L.push(...s); continue; }
    if (!dates.length) continue;
    const until = seg.to.replace(/-/g, '') + 'T185959Z'; // 23:59:59 Toshkent = 18:59:59 UTC
    const interval = l.weekParity && l.weekParity !== 'all' ? 2 : 1;
    L.push(...event(`${l.id}${vtag}@smart-schedule-builder`, dates[0], span, wl, l.roomId, wl.teacherId, { rrule: `RRULE:FREQ=WEEKLY;INTERVAL=${interval};UNTIL=${until}`, exdates: ex }));
    for (const s of singles) L.push(...s);
    count++;
  }
  }
  L.push('END:VCALENDAR');
  return { ics: L.map(fold).join('\r\n') + '\r\n', count, name };
}

export function safeFileName(s) {
  return String(s).replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_');
}

export { addDays };
