// 🔥 Tor joylar tahlili: bosim koeffitsienti va kun × para heatmap
import { store } from '../state/store.js';
import { analyzeBottlenecks } from '../analysis/bottlenecks.js';
import { progressBar } from '../components/charts.js';
import { emptyState } from '../components/emptyState.js';
import { DAYS_SHORT } from '../i18n/uz.js';
import { esc } from '../utils/dom.js';
import { go } from '../router.js';

const KIND = { teacher: '🧑‍🏫 O‘qituvchi', group: '👥 Guruh', roomType: '🚪 Xona turi', workload: '🧮 Yuklama' };

export function render(root) {
  const data = store.get();
  const { entries, heatmap } = analyzeBottlenecks(data);
  const top = entries.slice(0, 10);
  const maxRatio = Math.max(1, ...heatmap.cells.flat().map((x) => (x.rooms ? x.claim / x.rooms : x.claim)));
  root.innerHTML = `
    <div class="page-head"><div><h1>🔥 Tor joylar</h1><p><b>Bosim koeffitsienti</b> = talab qilingan darslar / real mavjud slotlar (hard cheklovlardan keyin). &gt; 0,9 — 🟠 xavfli, &gt; 1 — 🔴 imkonsiz.</p></div></div>
    ${top.length ? `<div class="card mb"><h2>Top 10 tor joylar</h2>
      <div class="table-wrap"><table class="t responsive"><thead><tr><th>#</th><th>Resurs</th><th>Turi</th><th>Talab / Imkoniyat</th><th>Bosim</th></tr></thead><tbody>
      ${top.map((e, i) => { const p = isFinite(e.pressure) ? e.pressure : 9.99; return `<tr class="clickable" data-k="${e.kind}" data-id="${esc(e.id)}"><td data-label="#">${i + 1}</td><td data-label="Resurs"><b>${e.level === 'critical' ? '🔴' : e.level === 'warn' ? '🟠' : '🟢'} ${esc(e.name)}</b></td><td data-label="Turi">${KIND[e.kind]}</td>
        <td data-label="Talab/Imkoniyat">${e.demand} / ${e.cap} <small class="muted">(${esc(e.note)})</small></td>
        <td data-label="Bosim" style="min-width:140px"><b>${isFinite(e.pressure) ? Math.round(e.pressure * 100) + '%' : '∞'}</b>${progressBar(p * 100)}</td></tr>`; }).join('')}
      </tbody></table></div></div>` : `<div class="card mb">${emptyState({ icon: '📭', title: 'Tahlil uchun ma\'lumot yo‘q', text: 'O‘quv yuklamalarini kiriting.' })}</div>`}
    <div class="card"><h2>Heatmap: kun × para</h2>
      <p class="muted">Har bir katakda: <b>da'vogar darslar</b> (o‘qituvchi, guruh va mos xona shu vaqtda mavjud bo‘lgan yuklamalar darslari soni) / <b>bo‘sh xonalar</b>. Qizilroq — raqobat kuchliroq. Pastda — hozir jadvalda nechta dars bor.</p>
      <div style="overflow-x:auto"><table class="heat"><thead><tr><th></th>${heatmap.slots.map((s) => `<th>${esc(s.name)}<br><span style="font-weight:400">${esc(s.start)}</span></th>`).join('')}</tr></thead><tbody>
      ${heatmap.cells.map((row, i) => `<tr><th>${DAYS_SHORT[heatmap.days[i]]}</th>${row.map((x) => {
        const ratio = x.rooms ? x.claim / x.rooms : x.claim ? maxRatio : 0;
        const a = Math.min(1, ratio / maxRatio);
        const bg = x.rooms === 0 ? 'var(--surface-3)' : `rgba(220, 38, 38, ${0.08 + a * 0.6})`;
        return `<td style="background:${bg};color:${a > 0.6 ? '#fff' : 'var(--text)'}" title="Da'vogar: ${x.claim}, bo‘sh xonalar: ${x.rooms}, jadvalda: ${x.used}">${x.claim}/${x.rooms}<br><small style="font-weight:500">📌 ${x.used}</small></td>`;
      }).join('')}</tr>`).join('')}
      </tbody></table></div></div>`;
  root.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-k]');
    if (!tr) return;
    const k = tr.dataset.k, id = tr.dataset.id;
    if (k === 'teacher') go('teachers', { q: data.teachers.find((t) => t.id === id)?.name });
    if (k === 'group') go('groups', { q: data.groups.find((g) => g.id === id)?.name });
    if (k === 'roomType') go('rooms', { f_type: id === 'regular' ? '' : id });
    if (k === 'workload') go('workloads');
  });
}
