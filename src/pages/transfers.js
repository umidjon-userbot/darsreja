// To‘liq (doimiy) o‘tkazishlar tarixi va qaytarish
import { store } from '../state/store.js';
import { ctx as getCtx } from '../state/selectors.js';
import { confirmDialog } from '../components/modal.js';
import { toast, err as toastErr } from '../components/toast.js';
import { emptyState } from '../components/emptyState.js';
import { pickTeacher } from './substitutions.js';
import { revertTransfer } from '../substitution/transferService.js';
import { wlLabel } from '../scheduler/model.js';
import { esc } from '../utils/dom.js';
import { fmtHuman } from '../utils/date.js';

export function render(root) {
  const data = store.get();
  const c = getCtx();
  const list = [...(data.transfers || [])].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const tn = (id) => esc(c.teachers.get(id)?.name || '(o‘chirilgan)');
  root.innerHTML = `
    <div class="page-head"><div><h1>📤 O‘tkazishlar tarixi</h1><p>Yuklamaning boshqa o‘qituvchiga doimiy o‘tkazilishi. Arxiv sanalarda eski o‘qituvchi ko‘rinadi.</p></div>
      <div class="btn-row"><button class="btn primary" data-new>＋ Yangi o‘tkazish</button></div></div>
    ${list.length ? `<div class="table-wrap"><table class="t responsive"><thead><tr><th>Sana</th><th>Yuklama</th><th>Kimdan → Kimga</th><th>Sabab</th><th>Natija</th><th class="num">Amallar</th></tr></thead><tbody>
      ${list.map((t) => { const wl = c.workloads.get(t.workloadId); return `<tr>
        <td data-label="Sana">${fmtHuman(t.effectiveDate)}<br><small class="muted">${new Date(t.createdAt).toLocaleString('uz-UZ')}</small></td>
        <td data-label="Yuklama">${wl ? esc(wlLabel(c, wl)) : '<span class="muted">(o‘chirilgan)</span>'}${t.splitFrom ? ' <span class="badge info">qisman (potokdan)</span>' : ''}</td>
        <td data-label="Kimdan → Kimga">${tn(t.fromTeacherId)} → <b>${tn(t.toTeacherId)}</b></td>
        <td data-label="Sabab">${esc(t.reason || '—')}${t.revertOf ? ' <span class="badge">qaytarish</span>' : ''}</td>
        <td data-label="Natija">${t.movedLessons?.length ? `<span class="badge warn">${t.movedLessons.length} qayta joylashdi</span> ` : ''}${t.unscheduledCount ? `<span class="badge err">${t.unscheduledCount} joylashmadi</span>` : '<span class="badge ok">OK</span>'}</td>
        <td class="actions">${t.reverted ? '<span class="badge">Qaytarilgan</span>' : `<button class="btn xs" data-rev="${t.id}">↩️ Qaytarish</button>`}</td></tr>`; }).join('')}
    </tbody></table></div>` : `<div class="card">${emptyState({ icon: '📤', title: 'Hali o‘tkazishlar yo‘q', text: 'O‘quv yuklamasi yoki o‘qituvchi sahifasidan "O‘qituvchini almashtirish" → "To‘liq o‘tkazish".' })}</div>`}`;
  root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-new]')) {
      if (!data.workloads.length) return toastErr('Yuklamalar yo‘q.');
      pickTeacher('permanent');
    }
    const id = e.target.closest('[data-rev]')?.dataset.rev;
    if (id && (await confirmDialog({ title: 'O‘tkazishni qaytarish', message: 'Yuklama avvalgi o‘qituvchiga qaytarilsinmi? Mos kelmagan darslar avtomatik qayta joylashtiriladi.', confirmLabel: 'Qaytarish' }))) {
      try { store.update('O‘tkazish qaytarildi', (d) => revertTransfer(d, id)); toast('Qaytarildi.', { action: { label: 'Bekor qilish', onClick: () => store.undo() } }); }
      catch (err) { toastErr(err.message); }
    }
  });
}
