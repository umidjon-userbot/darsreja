// Vaqtincha almashtirishlar: ro‘yxat, muddatni uzaytirish, erta tugatish, bekor qilish, qoplash
import { store } from '../state/store.js';
import { ctx as getCtx } from '../state/selectors.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { toast, ok as toastOk, err as toastErr } from '../components/toast.js';
import { emptyState } from '../components/emptyState.js';
import { openTransferWizard, openAbsenceDialog } from '../components/transferWizard.js';
import { changeRange, finishEarly, cancelSubstitution } from '../substitution/substitutionService.js';
import { substitutionStatus, lessonLogKey, absenceOn, occurrencesOn } from '../substitution/calendarResolver.js';
import { openPrintDialog } from '../services/printService.js';
import { wlLabel, slotName } from '../scheduler/model.js';
import { ABSENCE_REASONS, SUBST_STATUS, DAYS } from '../i18n/uz.js';
import { esc } from '../utils/dom.js';
import { fmtHuman, todayStr, isValidDate, dayKeyOf } from '../utils/date.js';
import { setParams } from '../router.js';

const badge = { planned: 'info', active: 'ok', finished: '', cancelled: 'err' };

export function render(root, route) {
  const data = store.get();
  const c = getCtx();
  const today = todayStr();
  const filter = route.params.status || '';
  const subs = [...(data.substitutions || [])].sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  const list = subs.filter((s) => !filter || substitutionStatus(s, today) === filter);
  const absentToday = data.teachers.filter((t) => absenceOn(t, today));
  const todayOcc = occurrencesOn(data, today, c);
  // Qoplanishi kerak bo‘lgan darslar
  const makeups = [];
  for (const s of subs) {
    if (s.cancelled) continue;
    for (const o of s.occurrences || []) {
      if (o.action !== 'cancel' || !o.makeupRequired) continue;
      const l = data.schedule.lessons.find((x) => x.id === o.lessonId);
      const log = data.lessonLog?.[lessonLogKey(o.date, o.lessonId)];
      makeups.push({ s, o, l, done: log?.status === 'madeup', log });
    }
  }
  const pending = makeups.filter((x) => !x.done);

  root.innerHTML = `
    <div class="page-head"><div><h1>🔁 Almashtirishlar</h1><p>Vaqtincha almashtirish haftalik shablonni o‘zgartirmaydi va muddat tugagach avtomatik asl holatga qaytadi.</p></div>
      <div class="btn-row">
        <button class="btn" data-a="print">🖨️ Almashtirishlar varaqasi</button>
        <button class="btn" data-a="absence">🤒 Yo‘qlik qo‘shish</button>
        <button class="btn primary" data-a="new">＋ Almashtirish yaratish</button>
      </div></div>
    <div class="grid cols-2 mb">
      <div class="card"><h2>Bugun yo‘q o‘qituvchilar <small class="muted">${fmtHuman(today)}</small></h2>
        ${absentToday.length ? `<ul class="list-plain">${absentToday.map((t) => {
          const ab = absenceOn(t, today);
          const items = todayOcc.items.filter((o) => o.originalTeacherId === t.id);
          return `<li><b>${esc(t.name)}</b> — ${ABSENCE_REASONS[ab.reason] || ''} (${fmtHuman(ab.startDate)}–${fmtHuman(ab.endDate)})
            ${items.length ? `<ul>${items.map((o) => `<li>${esc(slotName(c, o.slotId))} · ${esc(wlLabel(c, o.wl))} → ${o.status === 'cancelled' ? '❌ bekor' : o.teacherId !== t.id ? `🔁 <b>${esc(c.teachers.get(o.teacherId)?.name)}</b>` : '<span style="color:var(--danger)">🔴 almashtiruvchi yo‘q</span>'}</li>`).join('')}</ul>` : '<br><small class="muted">Bugun darsi yo‘q.</small>'}</li>`;
        }).join('')}</ul>` : '<p class="muted">Bugun hamma o‘qituvchi joyida.</p>'}
      </div>
      <div class="card"><h2>Qoplanishi kerak bo‘lgan darslar ${pending.length ? `<span class="badge warn">${pending.length}</span>` : ''}</h2>
        ${makeups.length ? `<ul class="list-plain">${makeups.slice(0, 30).map((x) => `<li class="row between"><span>${x.done ? '✅' : '⏳'} ${fmtHuman(x.o.date)} · ${x.l ? esc(slotName(c, x.l.slotId)) + ' · ' + esc(wlLabel(c, c.workloads.get(x.l.workloadId))) : 'dars o‘chirilgan'}${x.done && x.log?.makeupDate ? ` <small class="muted">(qoplandi: ${fmtHuman(x.log.makeupDate)})</small>` : ''}</span>
          ${x.l ? `<button class="btn xs" data-mk="${esc(lessonLogKey(x.o.date, x.o.lessonId))}" data-done="${x.done ? 1 : 0}">${x.done ? 'Qaytarish' : 'Qoplandi'}</button>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Bekor qilingan darslar yo‘q.</p>'}
      </div>
    </div>
    <div class="toolbar"><div class="seg">${[['', 'Hammasi'], ['active', 'Faol'], ['planned', 'Rejalashtirilgan'], ['finished', 'Tugagan'], ['cancelled', 'Bekor']].map(([k, n]) => `<button class="${filter === k ? 'active' : ''}" data-st="${k}">${n}</button>`).join('')}</div></div>
    ${list.length ? list.map((s) => {
      const status = substitutionStatus(s, today);
      const cnt = (a) => (s.occurrences || []).filter((o) => o.action === a).length;
      return `<div class="card" data-sub="${s.id}">
        <div class="card-head"><div><h3>${esc(c.teachers.get(s.originalTeacherId)?.name || '?')} → 🔁 ${esc(c.teachers.get(s.substituteTeacherId)?.name || '?')}</h3>
          <small class="muted">${fmtHuman(s.startDate)} – ${fmtHuman(s.endDate)} · ${ABSENCE_REASONS[s.reason] || s.reason}${s.note ? ' · ' + esc(s.note) : ''}</small></div>
          <span class="badge ${badge[status]}">${SUBST_STATUS[status]}</span></div>
        <p>${s.workloadIds.map((id) => esc(c.workloads.get(id) ? wlLabel(c, c.workloads.get(id)) : '(o‘chirilgan yuklama)')).join('; ')}</p>
        <div class="row"><span class="badge ok">🔁 ${cnt('substitute')} almashtirildi</span><span class="badge warn">↔️ ${cnt('move')} ko‘chirildi</span><span class="badge err">❌ ${cnt('cancel')} bekor</span></div>
        <details class="more mt"><summary>Darslar ro‘yxati</summary>
          <div class="table-wrap mt"><table class="t"><thead><tr><th>Sana</th><th>Dars</th><th>Harakat</th></tr></thead><tbody>
          ${(s.occurrences || []).map((o) => { const l = data.schedule.lessons.find((x) => x.id === o.lessonId); return `<tr><td>${fmtHuman(o.date)} <small>${DAYS[dayKeyOf(o.date)]}</small></td><td>${l ? esc(slotName(c, l.slotId)) + ' · ' + esc(wlLabel(c, c.workloads.get(l.workloadId))) : '—'}</td><td>${o.action === 'substitute' ? '🔁 Almashtiriladi' : o.action === 'move' ? `↔️ ${esc(slotName(c, o.newSlotId))}, ${esc(c.rooms.get(o.newRoomId)?.number || '')}-xona` : '❌ Bekor (qoplash)'}</td></tr>`; }).join('') || '<tr><td colspan="3" class="muted">Darslar yo‘q</td></tr>'}
          </tbody></table></div></details>
        ${status !== 'cancelled' && status !== 'finished' ? `<div class="btn-row mt"><button class="btn sm" data-ext="${s.id}">📅 Muddatni o‘zgartirish</button>${status === 'active' ? `<button class="btn sm" data-fin="${s.id}">⏹ Erta tugatish</button>` : ''}<button class="btn sm danger-ghost" data-can="${s.id}">✕ Bekor qilish</button></div>` : ''}
      </div>`;
    }).join('') : `<div class="card">${emptyState({ icon: '🔁', title: 'Almashtirishlar yo‘q', text: 'O‘qituvchi kasal bo‘lsa yoki safarga ketsa — almashtirish yarating yoki yo‘qlik qo‘shing, tizim almashtiruvchini o‘zi taklif qiladi.', actionHtml: '<button class="btn primary" data-a="new">＋ Almashtirish yaratish</button>' })}</div>`}`;

  root.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'new' || a === 'absence') pickTeacher(a);
    if (a === 'print') openPrintDialog({ view: 'substitutions' });
    const stF = e.target.closest('[data-st]');
    if (stF) setParams({ status: stF.dataset.st }, false);
    const mk = e.target.closest('[data-mk]');
    if (mk) {
      const done = mk.dataset.done === '1';
      store.update(done ? 'Qoplash bekor qilindi' : 'Dars qoplandi', (d) => {
        d.lessonLog = d.lessonLog || {};
        if (done) delete d.lessonLog[mk.dataset.mk];
        else d.lessonLog[mk.dataset.mk] = { status: 'madeup', makeupDate: todayStr() };
      });
    }
    const ext = e.target.closest('[data-ext]')?.dataset.ext;
    if (ext) extendDialog(ext);
    const fin = e.target.closest('[data-fin]')?.dataset.fin;
    if (fin && (await confirmDialog({ title: 'Erta tugatish', message: 'Almashtirish bugundan boshlab tugatilsinmi? Asl o‘qituvchi bugundan qaytadi.', confirmLabel: 'Tugatish' }))) {
      store.update('Almashtirish erta tugatildi', (d) => finishEarly(d, fin, todayStr()));
      toast('Tugatildi.', { action: { label: 'Bekor qilish', onClick: () => store.undo() } });
    }
    const can = e.target.closest('[data-can]')?.dataset.can;
    if (can && (await confirmDialog({ title: 'Almashtirishni bekor qilish', message: 'Almashtirish butunlay bekor qilinsinmi? Darslar asl o‘qituvchiga qaytadi.', confirmLabel: 'Bekor qilish', danger: true }))) {
      store.update('Almashtirish bekor qilindi', (d) => cancelSubstitution(d, can));
      toast('Bekor qilindi.', { action: { label: 'Qaytarish', onClick: () => store.undo() } });
    }
  });
}

export function pickTeacher(kind) {
  const data = store.get();
  const body = document.createElement('div');
  body.innerHTML = `<label class="field">O‘qituvchi<select data-t>${data.teachers.filter((t) => t.active !== false).map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label>`;
  openModal({
    title: kind === 'absence' ? 'Kimga yo‘qlik qo‘shamiz?' : 'Kimning yuklamasini o‘tkazamiz?', body,
    actions: [{ label: 'Bekor qilish' }, { label: 'Davom etish →', kind: 'primary', onClick: () => {
      const tid = body.querySelector('[data-t]').value;
      if (!tid) return false;
      setTimeout(() => {
        if (kind === 'absence') openAbsenceDialog(tid);
        else {
          const wls = data.workloads.filter((w) => w.teacherId === tid);
          if (!wls.length) return toastErr('Bu o‘qituvchida yuklama yo‘q.');
          openTransferWizard({ workloadIds: wls.map((w) => w.id), fromTeacherId: tid, mode: kind === 'permanent' ? 'permanent' : 'temporary' });
        }
      }, 30);
    } }],
  });
}

function extendDialog(id) {
  const s = store.get().substitutions.find((x) => x.id === id);
  const body = document.createElement('div');
  body.innerHTML = `<div class="form-grid"><label class="field">Boshlanish<input type="date" data-s value="${s.startDate}"></label><label class="field">Tugash<input type="date" data-e value="${s.endDate}"></label></div><p class="muted mt">Darslar ro‘yxati yangi muddat bo‘yicha qayta hisoblanadi.</p>`;
  openModal({
    title: 'Muddatni o‘zgartirish', body,
    actions: [{ label: 'Bekor qilish' }, { label: 'Saqlash', kind: 'primary', onClick: () => {
      const a = body.querySelector('[data-s]').value, b = body.querySelector('[data-e]').value;
      if (!isValidDate(a) || !isValidDate(b) || a > b) { toastErr('Sana oralig‘i noto‘g‘ri.'); return false; }
      try { store.update('Almashtirish muddati o‘zgardi', (d) => changeRange(d, id, a, b)); toastOk('Muddat yangilandi.'); }
      catch (e) { toastErr(e.message); return false; }
    } }],
  });
}
