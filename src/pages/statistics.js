import { store } from '../state/store.js';
import { ctx as getCtx, occ as getOcc } from '../state/selectors.js';
import { barList, columnChart, progressBar } from '../components/charts.js';
import { roomAvailCount } from '../scheduler/model.js';
import { scoreAll, breakdownOf } from '../scheduler/scoring.js';
import { computeHours } from '../analysis/hours.js';
import { toCsv, downloadCsv } from '../services/csvService.js';
import { DAYS_SHORT, SOFT_CODES } from '../i18n/uz.js';
import { esc } from '../utils/dom.js';
import { todayStr, addDays, fmtHuman } from '../utils/date.js';

export function render(root) {
  const data = store.get();
  const c = getCtx();
  const o = getOcc();
  const teachers = data.teachers.map((t) => {
    const u = o.teacherWeekUnits(t.id);
    const m = Number(t.maxWeeklyClasses) || 1;
    const days = o.teacherDays(t.id).length;
    let gaps = 0;
    for (const d of c.workDays) {
      const idx = [...o.teacherDayRecs(t.id, d)].flatMap((r) => r.idxs).sort((a, b) => a - b);
      if (idx.length) gaps += idx[idx.length - 1] - idx[0] + 1 - new Set(idx).size;
    }
    return { t, u, m, days, gaps };
  }).sort((a, b) => b.u / b.m - a.u / a.m);
  const rooms = data.rooms.map((r) => {
    const used = data.schedule.lessons.filter((l) => l.roomId === r.id).reduce((a, l) => a + (Number(c.workloads.get(l.workloadId)?.durationSlots) || 1), 0);
    const cap = roomAvailCount(c, r);
    return { name: `${r.number}-xona (${r.capacity})`, value: used, pct: cap ? (used / cap) * 100 : 0, label: `${used}/${cap} · ${cap ? Math.round((used / cap) * 100) : 0}%` };
  }).sort((a, b) => b.pct - a.pct);
  const items = [];
  const pen = scoreAll(c, o, items);
  const bd = breakdownOf(items);
  const perDay = c.workDays.map((d) => ({ name: DAYS_SHORT[d], value: data.schedule.lessons.filter((l) => l.day === d).length }));
  const today = todayStr();
  const from = data.calendar.startDate, to = today < data.calendar.endDate ? today : data.calendar.endDate;
  const hrs = from <= to ? computeHours(data, { startDate: from, endDate: to }) : null;
  const subsRows = hrs ? hrs.teachers.filter((t) => t.forOthers || t.byOthers) : [];

  root.innerHTML = `
    <div class="page-head"><div><h1>📊 Statistika</h1><p>Haftalik shablon bo‘yicha. Soat hisobi uchun — <a href="#/hours">Soat hisobi</a>.</p></div></div>
    <div class="grid cols-2">
      <div class="card"><h2>O‘qituvchi yuklamasi</h2>
        <div class="table-wrap"><table class="t responsive"><thead><tr><th>O‘qituvchi</th><th>Darslar</th><th class="num">Kunlar</th><th class="num">Bo‘shliq</th></tr></thead><tbody>
        ${teachers.map((x) => `<tr><td data-label="O‘qituvchi"><span class="dot" style="background:${esc(x.t.color || '#888')}"></span> ${esc(x.t.name)}</td><td data-label="Darslar" style="min-width:160px">${x.u} / ${x.m} dars — <b>${Math.round((x.u / x.m) * 100)}%</b>${progressBar((x.u / x.m) * 100)}</td><td class="num" data-label="Kunlar">${x.days} <small class="muted">(${x.t.minWorkingDays}–${x.t.maxWorkingDays})</small></td><td class="num" data-label="Bo‘shliq">${x.gaps}</td></tr>`).join('')}
        </tbody></table></div></div>
      <div class="card"><h2>Auditoriyalar bandligi</h2>${barList(rooms, { fmt: (x) => x.label })}</div>
      <div class="card"><h2>Kunlar bo‘yicha darslar</h2>${columnChart(perDay)}</div>
      <div class="card"><h2>Guruh yuklamasi</h2>
        <div class="table-wrap"><table class="t"><thead><tr><th>Guruh</th>${c.workDays.map((d) => `<th class="num">${DAYS_SHORT[d]}</th>`).join('')}<th class="num">Jami</th></tr></thead><tbody>
        ${data.groups.map((g) => { const loads = c.workDays.map((d) => o.groupDayLoad(g.id, d)); return `<tr><td>${esc(g.name)}</td>${loads.map((l) => `<td class="num">${l || '·'}</td>`).join('')}<td class="num"><b>${loads.reduce((a, b) => a + b, 0)}</b></td></tr>`; }).join('')}
        </tbody></table></div></div>
      <div class="card"><h2>Soft penalty taqsimoti</h2><p>Jami penalty: <b>${pen}</b></p>
        ${Object.keys(bd).length ? barList(Object.entries(bd).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ name: `${k} · ${SOFT_CODES[k]}`, value: v, pct: (v / Math.max(...Object.values(bd))) * 100, label: String(v) })), { fmt: (x) => x.label }) : '<p class="muted">Soft buzilishlar yo‘q.</p>'}</div>
      <div class="card"><div class="card-head"><h2>Almashtirish hisoboti</h2><button class="btn xs" data-csv ${subsRows.length ? '' : 'disabled'}>⬇️ CSV</button></div>
        <p class="muted">Semestr boshidan bugungacha (${fmtHuman(from)} – ${fmtHuman(to)}), akademik soatlarda.</p>
        ${subsRows.length ? `<table class="t"><thead><tr><th>O‘qituvchi</th><th class="num">Boshqalar o‘rniga</th><th class="num">Uning o‘rniga</th></tr></thead><tbody>${subsRows.map((t) => `<tr><td>${esc(t.name)}</td><td class="num">${t.forOthers}</td><td class="num">${t.byOthers}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Bu davrda almashtirishlar bo‘lmagan.</p>'}</div>
    </div>`;
  root.querySelector('[data-csv]')?.addEventListener('click', () => {
    downloadCsv(`almashtirishlar-${from}-${to}.csv`, toCsv([['O‘qituvchi', 'Boshqalar o‘rniga (soat)', 'Uning o‘rniga (soat)'], ...subsRows.map((t) => [t.name, t.forOthers, t.byOthers])]));
  });
  void addDays;
}
