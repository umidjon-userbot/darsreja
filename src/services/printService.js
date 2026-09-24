// Chop etish / PDF (A4 landscape). Brauzerning Print → Save as PDF orqali.
import { store } from '../state/store.js';
import { openModal } from '../components/modal.js';
import { buildContext, wlTargetName, wlGroupIds, wlDuration, wlLabel } from '../scheduler/model.js';
import { occurrencesOn } from '../substitution/calendarResolver.js';
import { DAYS, PARITY_SHORT, ABSENCE_REASONS } from '../i18n/uz.js';
import { esc } from '../utils/dom.js';
import { todayStr, fmtHuman, mondayOf, addDays, dateRange, dayKeyOf } from '../utils/date.js';

function header(data, title) {
  const s = data.settings;
  return `<div class="pr-head">${s.logo ? `<img src="${esc(s.logo)}" alt="">` : ''}<div><h1>${esc(s.instituteName || '')}</h1><div>${esc(title)}</div></div>
    <div class="meta">${esc(data.calendar.academicYear)} o‘quv yili, ${data.calendar.semester}-semestr<br>Chop etildi: ${fmtHuman(todayStr())}</div></div>`;
}

function grid(data, ctx, lessons, showCols) {
  const cells = new Map();
  for (const l of lessons) {
    const wl = ctx.workloads.get(l.workloadId);
    if (!wl) continue;
    const si = ctx.slotIdx.get(l.slotId);
    for (let k = 0; k < wlDuration(wl); k++) {
      const s = ctx.slots[si + k];
      if (!s) continue;
      const key = l.day + '|' + s.id;
      if (!cells.has(key)) cells.set(key, []);
      const parts = [];
      if (showCols.group) parts.push(esc(wlTargetName(ctx, wl)));
      if (showCols.teacher) parts.push(esc(ctx.teachers.get(wl.teacherId)?.name || ''));
      if (showCols.room) parts.push(esc(ctx.rooms.get(l.roomId)?.number || '') + '-xona');
      cells.get(key).push(`<div class="pr-l"><b>${esc(ctx.subjects.get(wl.subjectId)?.name || '')}</b>${l.weekParity !== 'all' ? ` (${PARITY_SHORT[l.weekParity]})` : ''}${k ? ' (davomi)' : ''}<br>${parts.join(' · ')}</div>`);
    }
  }
  return `<table class="pr"><thead><tr><th style="width:62px">Vaqt</th>${ctx.workDays.map((d) => `<th>${DAYS[d]}</th>`).join('')}</tr></thead><tbody>
    ${ctx.slots.map((s) => `<tr><td class="tm">${esc(s.name)}<br>${s.start}–${s.end}</td>${ctx.workDays.map((d) => `<td>${(cells.get(d + '|' + s.id) || []).join('')}</td>`).join('')}</tr>`).join('')}
  </tbody></table>`;
}

export function printHtml(html) {
  const root = document.getElementById('print-root');
  root.innerHTML = html;
  const done = () => { root.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 50);
}

export function buildPrint(data, { type, ids = [], from, to }) {
  const ctx = buildContext(data);
  const L = data.schedule.lessons;
  const pages = [];
  if (type === 'general') {
    pages.push(header(data, 'Umumiy dars jadvali') + grid(data, ctx, L, { group: true, teacher: true, room: true }));
  } else if (type === 'group') {
    for (const g of data.groups.filter((x) => !ids.length || ids.includes(x.id))) {
      pages.push(header(data, `Guruh: ${g.name} (${g.studentCount} talaba)`) + grid(data, ctx, L.filter((l) => { const wl = ctx.workloads.get(l.workloadId); return wl && wlGroupIds(wl).includes(g.id); }), { teacher: true, room: true, group: false }));
    }
  } else if (type === 'teacher') {
    for (const t of data.teachers.filter((x) => !ids.length || ids.includes(x.id))) {
      const ls = L.filter((l) => ctx.workloads.get(l.workloadId)?.teacherId === t.id);
      pages.push(header(data, `O‘qituvchi: ${t.name} · ${ls.length} dars/hafta`) + grid(data, ctx, ls, { group: true, room: true }));
    }
  } else if (type === 'room') {
    for (const r of data.rooms.filter((x) => !ids.length || ids.includes(x.id))) {
      pages.push(header(data, `Auditoriya: ${r.number} (${r.capacity} o‘rin)`) + grid(data, ctx, L.filter((l) => l.roomId === r.id), { group: true, teacher: true }));
    }
  } else if (type === 'substitutions') {
    const rows = [];
    for (const date of dateRange(from, to)) {
      const res = occurrencesOn(data, date, ctx);
      for (const o of res.items) {
        if (o.status === 'normal') continue;
        rows.push(`<tr><td>${fmtHuman(date)}<br>${DAYS[dayKeyOf(date)]}</td><td>${esc(ctx.slots[ctx.slotIdx.get(o.slotId)]?.name || '')}</td><td>${esc(wlTargetName(ctx, o.wl))}</td><td>${esc(ctx.subjects.get(o.wl.subjectId)?.name || '')}</td><td>${esc(ctx.rooms.get(o.roomId)?.number || '')}</td><td>${esc(ctx.teachers.get(o.originalTeacherId)?.name || '')}</td><td>${o.status === 'cancelled' ? '<b>BEKOR</b>' : esc(ctx.teachers.get(o.teacherId)?.name || '')}${o.status === 'moved' ? ' (ko‘chirilgan)' : ''}</td><td>${esc(ABSENCE_REASONS[o.substitution?.reason] || '')}</td></tr>`);
      }
    }
    pages.push(header(data, `Almashtirishlar varaqasi: ${fmtHuman(from)} – ${fmtHuman(to)}`) + (rows.length ? `<table class="pr"><thead><tr><th>Sana</th><th>Para</th><th>Guruh</th><th>Fan</th><th>Xona</th><th>Asl o‘qituvchi</th><th>Almashtiruvchi</th><th>Sabab</th></tr></thead><tbody>${rows.join('')}</tbody></table>` : '<p>Bu davrda almashtirishlar yo‘q.</p>'));
  }
  return pages.map((p) => `<div class="pr-page">${p}<div class="pr-foot">Smart Schedule Builder</div></div>`).join('');
}

export function openPrintDialog({ view = 'all', id = '' } = {}) {
  const data = store.get();
  const type0 = view === 'substitutions' ? 'substitutions' : view === 'all' ? 'general' : view;
  const wk = mondayOf(todayStr());
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-grid">
      <label class="field span-all">Nimani chop etish<select data-type>
        <option value="general" ${type0 === 'general' ? 'selected' : ''}>Umumiy jadval</option>
        <option value="group" ${type0 === 'group' ? 'selected' : ''}>Guruh bo‘yicha (har biri alohida sahifa)</option>
        <option value="teacher" ${type0 === 'teacher' ? 'selected' : ''}>O‘qituvchi bo‘yicha</option>
        <option value="room" ${type0 === 'room' ? 'selected' : ''}>Auditoriya bo‘yicha</option>
        <option value="substitutions" ${type0 === 'substitutions' ? 'selected' : ''}>Almashtirishlar varaqasi</option></select></label>
      <div class="span-all" data-sel></div>
    </div>
    <p class="muted mt">A4 landscape. PDF uchun: Print oynasida "Save as PDF" ni tanlang.</p>`;
  const drawSel = () => {
    const t = body.querySelector('[data-type]').value;
    const el = body.querySelector('[data-sel]');
    if (t === 'substitutions') { el.innerHTML = `<div class="form-grid"><label class="field">Dan<input type="date" data-from value="${wk}"></label><label class="field">Gacha<input type="date" data-to value="${addDays(wk, 6)}"></label></div>`; return; }
    const list = t === 'group' ? data.groups.map((g) => [g.id, g.name]) : t === 'teacher' ? data.teachers.map((x) => [x.id, x.name]) : t === 'room' ? data.rooms.map((r) => [r.id, r.number]) : [];
    el.innerHTML = list.length ? `<p class="muted">Tanlanmasa — hammasi.</p><div class="multi">${list.map(([v, n]) => `<label><input type="checkbox" value="${v}" ${v === id ? 'checked' : ''}> ${esc(n)}</label>`).join('')}</div>` : '';
  };
  drawSel();
  body.querySelector('[data-type]').addEventListener('change', drawSel);
  openModal({
    title: 'Chop etish / PDF', body,
    actions: [{ label: 'Bekor qilish' }, { label: '🖨️ Chop etish', kind: 'primary', onClick: () => {
      const type = body.querySelector('[data-type]').value;
      const ids = [...body.querySelectorAll('[data-sel] input[type=checkbox]:checked')].map((x) => x.value);
      const from = body.querySelector('[data-from]')?.value, to = body.querySelector('[data-to]')?.value;
      printHtml(buildPrint(store.get(), { type, ids, from, to }));
    } }],
  });
}

export function printTable(title, head, rows) {
  const data = store.get();
  printHtml(`<div class="pr-page">${header(data, title)}<table class="pr"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
}

export { wlLabel };
