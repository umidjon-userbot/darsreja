// Joylashtirilmagan darslar: sabab (kod + batafsil), qo‘lda joylashtirish, qisman qayta tuzish
import { store } from '../state/store.js';
import { unscheduledList, ctx as getCtx, occ as getOcc } from '../state/selectors.js';
import { openModal } from '../components/modal.js';
import { toast, ok as toastOk, err as toastErr } from '../components/toast.js';
import { emptyState } from '../components/emptyState.js';
import { openTransferWizard } from '../components/transferWizard.js';
import { addLesson, ConstraintError } from '../state/actions.js';
import { diagnoseWorkload } from '../scheduler/diagnose.js';
import { buildDomain } from '../scheduler/slotGenerator.js';
import { isValid } from '../scheduler/constraintChecker.js';
import { generateSchedule } from '../scheduler/scheduler.js';
import { wlLabel, wlTargetName, dayName, slotLabel, wlRequired } from '../scheduler/model.js';
import { UNSCHEDULED_REASONS } from '../i18n/uz.js';
import { esc } from '../utils/dom.js';
import { go } from '../router.js';

export function render(root) {
  const c = getCtx();
  const o = getOcc();
  const list = unscheduledList();
  const rows = list.map((u) => {
    const kind = wlRequired(u.wl).all > o.wlPlaced(u.wl.id).all ? 'all' : 'bi';
    const d = diagnoseWorkload(c, o, u.wl, buildDomain(c, u.wl, kind), kind);
    return { ...u, code: d.code, detail: d.detail };
  });
  root.innerHTML = `
    <div class="page-head"><div><h1>🧩 Joylashtirilmagan darslar</h1><p>Sabablar joriy jadval bo‘yicha qayta hisoblanadi.</p></div>
      <div class="btn-row">${rows.length ? '<a class="btn" href="#/advisor">💡 Maslahatchi</a><button class="btn primary" data-all>▶ Hammasini qayta urinish</button>' : ''}</div></div>
    ${rows.length ? `<div class="table-wrap"><table class="t responsive"><thead><tr><th>Fan</th><th>Guruh</th><th>O‘qituvchi</th><th class="num">Talab</th><th class="num">Joylashdi</th><th class="num">Qoldi</th><th>Sabab</th><th class="num">Amallar</th></tr></thead><tbody>
      ${rows.map((u) => `<tr data-wl="${u.wl.id}">
        <td data-label="Fan"><b>${esc(c.subjects.get(u.wl.subjectId)?.name || '?')}</b></td>
        <td data-label="Guruh">${esc(wlTargetName(c, u.wl))}</td>
        <td data-label="O‘qituvchi">${esc(c.teachers.get(u.wl.teacherId)?.name || '—')}</td>
        <td class="num" data-label="Talab">${u.required}</td><td class="num" data-label="Joylashdi">${u.placed}</td><td class="num" data-label="Qoldi"><b>${u.missing}</b></td>
        <td data-label="Sabab" style="max-width:380px"><span class="badge warn">${esc(UNSCHEDULED_REASONS[u.code] || u.code)}</span><br><small>${esc(u.detail)}</small></td>
        <td class="actions"><button class="btn xs" data-a="manual">✋ Qo‘lda</button> <button class="btn xs" data-a="retry">🔄 Faqat shuni</button> <button class="btn xs" data-a="sub">👥 Almashtirish</button> <button class="btn xs" data-a="adv">💡</button></td></tr>`).join('')}
    </tbody></table></div>` : `<div class="card">${emptyState({ icon: '🎉', title: 'Barcha darslar joylashtirilgan', text: 'Har bir o‘quv yuklamasi haftalik talabga to‘liq mos.' })}</div>`}`;

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-all]')) retry(null);
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    const wlId = e.target.closest('[data-wl]').dataset.wl;
    if (a === 'manual') manual(wlId);
    if (a === 'retry') retry(wlId);
    if (a === 'sub') openTransferWizard({ workloadIds: [wlId] });
    if (a === 'adv') go('advisor', { wl: wlId });
  });
}

function retry(wlId) {
  const d = store.get();
  const scope = wlId ? { workloadIds: [wlId] } : {};
  const before = d.schedule.lessons.length;
  const r = generateSchedule(d, { mode: 'fast', keep: 'onlyUnscheduled', scope, timeBudgetMs: 500 });
  const gained = r.lessons.length - before;
  if (gained <= 0) return toastErr('Qo‘shimcha dars joylashtirib bo‘lmadi. Maslahatchi yoki qo‘lda joylashtirishdan foydalaning.');
  store.update(`Qayta joylashtirish: +${gained} dars`, (dd) => { dd.schedule.lessons = r.lessons; });
  toastOk(`✅ ${gained} ta dars joylashtirildi.`, { action: { label: 'Bekor qilish', onClick: () => store.undo() } });
}

function manual(wlId) {
  const c = getCtx();
  const o = getOcc();
  const wl = c.workloads.get(wlId);
  const kind = wlRequired(wl).all > o.wlPlaced(wl.id).all ? 'all' : 'bi';
  const opts = buildDomain(c, wl, kind).filter((x) => isValid(c, o, { wl, ...x }, { skipStatic: true }));
  const uniq = [];
  const seen = new Set();
  for (const x of opts) { const k = x.day + x.slotId + x.parity; if (!seen.has(k)) { seen.add(k); uniq.push(x); } }
  const body = uniq.length
    ? `<p>${esc(wlLabel(c, wl))} uchun hozir mumkin bo‘lgan vaqtlar (${uniq.length}):</p><div class="btn-row">${uniq.slice(0, 60).map((x, i) => `<button class="btn sm" data-p="${i}">${esc(dayName(x.day))}, ${esc(slotLabel(c, x.slotId))} · ${esc(c.rooms.get(x.roomId)?.number)}${x.parity !== 'all' ? (x.parity === 'odd' ? ' · T' : ' · J') : ''}</button>`).join('')}</div>`
    : `<div class="alert err">🔴<div>Hozir hech qanday bo‘sh vaqt yo‘q. <a href="#/advisor?wl=${wlId}">Maslahatchi</a> nima o‘zgartirish kerakligini ko‘rsatadi.</div></div>`;
  const m = openModal({ title: 'Qo‘lda joylashtirish', body, size: 'lg', actions: [{ label: 'Yopish' }] });
  m.body.addEventListener('click', (e) => {
    const i = e.target.closest('[data-p]')?.dataset.p;
    if (i === undefined) return;
    const x = uniq[+i];
    try { addLesson({ workloadId: wlId, day: x.day, slotId: x.slotId, roomId: x.roomId, weekParity: x.parity }); toastOk('Dars joylashtirildi.'); m.close(); }
    catch (err) { toastErr(err instanceof ConstraintError ? err.violations[0].msg : err.message); }
  });
}
