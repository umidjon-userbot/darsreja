// ⏱️ Soat hisobi va dars jurnali
import { store } from '../state/store.js';
import { ctx as getCtx } from '../state/selectors.js';
import { computeHours } from '../analysis/hours.js';
import { occurrencesOn, lessonLogKey } from '../substitution/calendarResolver.js';
import { toCsv, downloadCsv } from '../services/csvService.js';
import { exportRowsXlsx } from '../services/bulkImport.js';
import { printTable } from '../services/printService.js';
import { wlTargetName, slotLabel } from '../scheduler/model.js';
import { esc } from '../utils/dom.js';
import { todayStr, addDays, fmtHuman, isValidDate } from '../utils/date.js';
import { setParams } from '../router.js';
import { err as toastErr } from '../components/toast.js';

export function render(root, route) {
  const data = store.get();
  const c = getCtx();
  const cal = data.calendar;
  const today = todayStr();
  const p = route.params;
  let from = isValidDate(p.from) ? p.from : cal.startDate;
  let to = isValidDate(p.to) ? p.to : (today < cal.endDate ? today : cal.endDate);
  const tab = p.tab || 'teachers';
  const jdate = isValidDate(p.jdate) ? p.jdate : today;
  const h = from <= to ? computeHours(data, { startDate: from, endDate: to }) : { teachers: [], workloads: [], factor: 1 };
  const ym = today.slice(0, 7);
  const monthStart = ym + '-01';
  const prevMonthEnd = addDays(monthStart, -1);
  const prevMonthStart = prevMonthEnd.slice(0, 7) + '-01';
  const jr = occurrencesOn(data, jdate, c);
  const log = data.lessonLog || {};
  const headT = ['O‘qituvchi', 'Rejada', 'O‘tildi', 'Boshqalar o‘rniga', 'Uning o‘rniga', 'Bekor', 'O‘tilmadi', 'Qoplanishi kerak'];
  const rowsT = h.teachers.map((t) => [t.name, t.planned, t.conducted, t.forOthers, t.byOthers, t.cancelled, t.missed, t.makeupPending]);
  const headW = ['Guruh · Fan', 'O‘qituvchi', 'Rejada', 'O‘tildi', 'Bekor', 'Qoplanishi kerak'];
  const rowsW = h.workloads.map((w) => [w.name, w.teacher, w.planned, w.conducted, w.cancelled, w.makeupPending]);
  const head = tab === 'teachers' ? headT : headW;
  const rows = tab === 'teachers' ? rowsT : rowsW;

  root.innerHTML = `
    <div class="page-head"><div><h1>⏱️ Soat hisobi</h1><p>Rejadagi soat = haftalik shablon × haftalar (toq/juft hisobga olingan) − bayramlar. Almashtirishda soat almashtiruvchiga yoziladi. 1 para = ${h.factor} akademik soat (Sozlamalarda).</p></div>
      <div class="btn-row"><button class="btn" data-x="csv">⬇️ CSV</button><button class="btn" data-x="xlsx">⬇️ Excel</button><button class="btn" data-x="print">🖨️ Chop etish</button></div></div>
    <div class="toolbar">
      <label class="row">Davr: <input type="date" data-from value="${from}" aria-label="Boshlanish"> — <input type="date" data-to value="${to}" aria-label="Tugash"></label>
      <button class="btn sm" data-r="sem">Semestr boshidan bugungacha</button>
      <button class="btn sm" data-r="month">Shu oy</button>
      <button class="btn sm" data-r="prev">O‘tgan oy</button>
      <button class="btn sm" data-r="all">Butun semestr (reja)</button>
    </div>
    <div class="tabs"><button class="${tab === 'teachers' ? 'active' : ''}" data-tab="teachers">O‘qituvchilar bo‘yicha</button><button class="${tab === 'workloads' ? 'active' : ''}" data-tab="workloads">Guruh va fan bo‘yicha</button></div>
    <div class="table-wrap mb"><table class="t responsive"><thead><tr>${head.map((x, i) => `<th class="${i >= (tab === 'teachers' ? 1 : 2) ? 'num' : ''}">${x}</th>`).join('')}</tr></thead><tbody>
      ${rows.length ? rows.map((r) => `<tr>${r.map((v, i) => `<td data-label="${head[i]}" class="${typeof v === 'number' ? 'num' : ''}">${typeof v === 'number' ? (v ? `<b>${v}</b>` : '<span class="muted">0</span>') : esc(v)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${head.length}" class="muted">Bu davrda darslar yo‘q.</td></tr>`}
    </tbody></table></div>
    <div class="card"><div class="card-head"><h2>📓 Dars jurnali</h2>
      <div class="row"><button class="btn sm" data-j="-1" aria-label="Oldingi kun">←</button><input type="date" data-jdate value="${jdate}" aria-label="Sana"><button class="btn sm" data-j="1" aria-label="Keyingi kun">→</button></div></div>
      <p class="muted">Belgilanmagan o‘tgan darslar ${data.settings.unmarkedPastIsDone !== false ? '"O‘tildi"' : '"O‘tilmagan"'} hisoblanadi (Sozlamalarda o‘zgartiriladi).</p>
      ${jr.holiday ? `<p>🎉 ${esc(jr.holiday.name)} — dars yo‘q.</p>` : jr.items.length ? `<div class="table-wrap"><table class="t responsive"><thead><tr><th>Vaqt</th><th>Dars</th><th>O‘qituvchi</th><th>Holat</th></tr></thead><tbody>
        ${jr.items.map((o) => { const k = lessonLogKey(jdate, o.lesson.id); const st = log[k]?.status; const cancelled = o.status === 'cancelled';
          return `<tr><td data-label="Vaqt">${esc(slotLabel(c, o.slotId))}</td><td data-label="Dars">${esc(c.subjects.get(o.wl.subjectId)?.name || '')} · ${esc(wlTargetName(c, o.wl))}</td><td data-label="O‘qituvchi">${o.teacherId !== o.originalTeacherId ? '🔁 ' : ''}${esc(c.teachers.get(o.teacherId)?.name || '')}</td>
          <td data-label="Holat">${cancelled ? `❌ Bekor (almashtirish) ${st === 'madeup' ? '· 🔁 Qoplandi' : `<button class="btn xs" data-log="${esc(k)}" data-s="madeup">🔁 Qoplandi</button>`}` : `<div class="seg">${[['done', '✅ O‘tildi'], ['missed', '❌ O‘tilmadi'], ['madeup', '🔁 Qoplandi']].map(([s, n]) => `<button class="${st === s ? 'active' : ''}" data-log="${esc(k)}" data-s="${s}">${n}</button>`).join('')}</div>`}</td></tr>`; }).join('')}
      </tbody></table></div>` : '<p class="muted">Bu kunda darslar yo‘q.</p>'}
    </div>`;

  const setRange = (a, b) => setParams({ from: a, to: b }, false);
  root.querySelector('[data-from]').addEventListener('change', (e) => setRange(e.target.value, to));
  root.querySelector('[data-to]').addEventListener('change', (e) => setRange(from, e.target.value));
  root.querySelector('[data-jdate]').addEventListener('change', (e) => setParams({ jdate: e.target.value }, false));
  root.addEventListener('click', (e) => {
    const r = e.target.closest('[data-r]')?.dataset.r;
    if (r === 'sem') setRange(cal.startDate, today < cal.endDate ? today : cal.endDate);
    if (r === 'month') setRange(monthStart, today);
    if (r === 'prev') setRange(prevMonthStart, prevMonthEnd);
    if (r === 'all') setRange(cal.startDate, cal.endDate);
    const t = e.target.closest('[data-tab]')?.dataset.tab;
    if (t) setParams({ tab: t }, false);
    const j = e.target.closest('[data-j]')?.dataset.j;
    if (j) setParams({ jdate: addDays(jdate, Number(j)) }, false);
    const lg = e.target.closest('[data-log]');
    if (lg) {
      const k = lg.dataset.log, s = lg.dataset.s;
      store.update('Dars jurnali yangilandi', (d) => {
        d.lessonLog = d.lessonLog || {};
        if (d.lessonLog[k]?.status === s) delete d.lessonLog[k];
        else d.lessonLog[k] = { status: s, at: new Date().toISOString(), ...(s === 'madeup' ? { makeupDate: todayStr() } : {}) };
      }, { history: true });
    }
    const x = e.target.closest('[data-x]')?.dataset.x;
    if (x) {
      if (!rows.length) return toastErr('Eksport uchun ma\'lumot yo‘q.');
      const name = `soat-hisobi-${tab}-${from}-${to}`;
      if (x === 'csv') downloadCsv(name + '.csv', toCsv([head, ...rows]));
      if (x === 'xlsx') exportRowsXlsx(name + '.xlsx', 'Soat hisobi', [head, ...rows]);
      if (x === 'print') printTable(`Soat hisobi (${fmtHuman(from)} – ${fmtHuman(to)})`, head, rows);
    }
  });
}
