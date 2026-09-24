// Dars qo‘shish/tahrirlash, "Nega bu slot?", dars kartochkasi menyusi
import { openModal, confirmDialog } from './modal.js';
import { toast, ok as toastOk, err as toastErr } from './toast.js';
import { store } from '../state/store.js';
import { ctx as getCtx, lessonVM, conflicts } from '../state/selectors.js';
import { evaluatePlacement, roomOptions, addLesson, updateLesson, toggleLock, deleteLesson, explainLesson, ConstraintError } from '../state/actions.js';
import { DAYS, PARITY, SOFT_CODES } from '../i18n/uz.js';
import { esc } from '../utils/dom.js';
import { wlLabel, dayName, slotLabel } from '../scheduler/model.js';

export function workloadOptions(c, selected) {
  const list = [...c.workloads.values()].filter((w) => w.active !== false || w.id === selected);
  list.sort((a, b) => wlLabel(c, a).localeCompare(wlLabel(c, b)));
  return list.map((w) => `<option value="${w.id}" ${w.id === selected ? 'selected' : ''}>${esc(wlLabel(c, w))} — ${esc(c.teachers.get(w.teacherId)?.name || '?')}</option>`).join('');
}

export function openLessonForm({ lessonId = null, day = null, slotId = null, workloadId = null } = {}) {
  const data = store.get();
  const c = getCtx();
  const existing = lessonId ? data.schedule.lessons.find((l) => l.id === lessonId) : null;
  const st = {
    workloadId: existing?.workloadId || workloadId || '',
    day: existing?.day || day || c.workDays[0],
    slotId: existing?.slotId || slotId || c.slots[0]?.id,
    roomId: existing?.roomId || '',
    weekParity: existing?.weekParity || 'all',
    locked: existing?.locked || false,
  };
  if (!c.workloads.size) {
    toastErr('Avval "O‘quv yuklamasi" bo‘limida yuklama yarating.');
    return;
  }
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-grid">
      <label class="field span-all">O‘quv yuklamasi (Fan · Guruh — O‘qituvchi)
        <select name="workloadId"><option value="">— tanlang —</option>${workloadOptions(c, st.workloadId)}</select></label>
      <label class="field">Kun<select name="day">${c.workDays.map((d) => `<option value="${d}" ${d === st.day ? 'selected' : ''}>${DAYS[d]}</option>`).join('')}</select></label>
      <label class="field">Vaqt<select name="slotId">${c.slots.map((s) => `<option value="${s.id}" ${s.id === st.slotId ? 'selected' : ''}>${esc(s.name)} (${s.start}–${s.end})</option>`).join('')}</select></label>
      <label class="field">Hafta<select name="weekParity">${Object.entries(PARITY).map(([k, v]) => `<option value="${k}" ${k === st.weekParity ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field span-all">Auditoriya<select name="roomId"></select><span class="hint">Mos va bo‘sh xonalar yuqorida. Kulranglari — sababi bilan.</span></label>
      <label class="check span-all"><input type="checkbox" name="locked" ${st.locked ? 'checked' : ''}> 🔒 Qulflash (generator o‘zgartirmaydi)</label>
    </div>
    <div data-status class="mt" aria-live="polite"></div>`;
  const $ = (n) => body.querySelector(`[name=${n}]`);
  const refresh = () => {
    st.workloadId = $('workloadId').value;
    st.day = $('day').value;
    st.slotId = $('slotId').value;
    st.weekParity = $('weekParity').value;
    const opts = roomOptions(store.get(), st, lessonId ? [lessonId] : []);
    const cur = $('roomId').value || st.roomId;
    if (!cur || !opts.find((o) => o.room.id === cur && o.ok)) {
      const first = opts.find((o) => o.ok);
      st.roomId = cur && opts.find((o) => o.room.id === cur) ? cur : first?.room.id || '';
    } else st.roomId = cur;
    $('roomId').innerHTML = opts.map((o) => `<option value="${o.room.id}" ${o.room.id === st.roomId ? 'selected' : ''} ${o.ok ? '' : 'style="color:var(--text-3)"'}>${o.ok ? '✅' : '⛔'} ${esc(o.room.number)} · ${o.room.capacity} o‘rin${o.ok ? '' : ' — ' + esc(o.reason)}</option>`).join('') || '<option value="">Xona yo‘q</option>';
    const status = body.querySelector('[data-status]');
    if (!st.workloadId) { status.innerHTML = '<div class="alert info">Yuklamani tanlang.</div>'; m.setActions(actions(false)); return; }
    const ev = evaluatePlacement(store.get(), st, lessonId ? [lessonId] : []);
    if (ev.hard.length) {
      status.innerHTML = `<div class="alert err" role="alert">❌<div><b>Saqlab bo‘lmaydi:</b><ul>${ev.hard.map((v) => `<li>${esc(v.msg)}</li>`).join('')}</ul></div></div>`;
    } else if (ev.soft.length) {
      status.innerHTML = `<div class="alert warn">⚠️<div><b>Mumkin, lekin ogohlantirishlar bor (+${Math.round(ev.delta)} penalty):</b><ul>${ev.soft.map((v) => `<li>${esc(SOFT_CODES[v.code] || v.code)}: ${esc(v.msg)}</li>`).join('')}</ul></div></div>`;
    } else status.innerHTML = '<div class="alert ok">✅<div>Barcha cheklovlar bajariladi.</div></div>';
    m.setActions(actions(!ev.hard.length));
  };
  const actions = (canSave) => [
    { label: 'Bekor qilish' },
    { label: existing ? 'Saqlash' : 'Qo‘shish', kind: 'primary', disabled: !canSave, onClick: () => {
      try {
        st.roomId = $('roomId').value;
        st.locked = $('locked').checked;
        if (existing) {
          updateLesson(existing.id, { workloadId: st.workloadId, day: st.day, slotId: st.slotId, roomId: st.roomId, weekParity: st.weekParity, locked: st.locked });
          toastOk('Dars saqlandi.');
        } else {
          addLesson(st);
          toastOk('Dars qo‘shildi.');
        }
      } catch (e) {
        toastErr(e instanceof ConstraintError ? '❌ ' + e.violations[0].msg : e.message);
        return false;
      }
    } },
  ];
  const m = openModal({ title: existing ? 'Darsni tahrirlash' : 'Dars qo‘shish', body, size: 'lg', actions: actions(false) });
  body.addEventListener('change', refresh);
  refresh();
}

export function openWhyDialog(lessonId) {
  const data = store.get();
  const r = explainLesson(data, lessonId);
  if (!r) return;
  const vm = lessonVM(r.lesson);
  const e = r.lesson.explanation;
  const live = r.live;
  const src = r.lesson.source === 'generator' && e ? 'generator' : 'manual';
  const body = `
    <p><b>${esc(vm.icon)} ${esc(vm.subject?.name || '?')}</b> · ${esc(vm.target)} · ${esc(vm.teacher?.name || '?')} · ${esc(vm.room?.number || '?')}-xona</p>
    <p>Bu dars <b>${esc(live.where)}</b> ga ${src === 'generator' ? 'generator tomonidan' : 'qo‘lda'} qo‘yilgan${src === 'generator' ? ', chunki:' : '. Joriy tekshiruv:'}</p>
    <ul class="list-plain">${live.checks.map((x) => `<li>✅ ${esc(x)}</li>`).join('')}</ul>
    ${live.breakdown.length ? `<div class="alert warn mt">⚠️<div><b>Soft ogohlantirishlar (penalty ${live.penalty}):</b><ul>${live.breakdown.map((b) => `<li>${esc(b.code)} · ${esc(b.msg)} (+${b.penalty})</li>`).join('')}</ul></div></div>` : `<p class="mt">Penalty: <b>0</b>.</p>`}
    <p class="muted">Hozir bu dars uchun yana <b>${live.alternativesCount}</b> ta to‘g‘ri muqobil (kun, para, xona) mavjud${src === 'generator' && e ? `; generatsiya paytida ${e.alternativesCount} ta variant ko‘rib chiqilgan va eng kam penaltylisi tanlangan` : ''}.</p>
    ${r.lesson.locked ? '<p>🔒 Dars qulflangan — generator uni o‘zgartirmaydi.</p>' : ''}`;
  openModal({ title: 'Nega bu slot?', body, actions: [{ label: 'Yopish', kind: 'primary' }] });
}

// Dars kartochkasi menyusi
export function openLessonMenu(lessonId, { onSwap, onMove, onSubstitute, date } = {}) {
  const data = store.get();
  const l = data.schedule.lessons.find((x) => x.id === lessonId);
  if (!l) return;
  const c = getCtx();
  const vm = lessonVM(l);
  const conf = conflicts().filter((x) => x.lessonIds.includes(l.id));
  const body = `
    <div class="row"><span class="dot" style="background:${esc(vm.color)}"></span><b style="font-size:15px">${esc(vm.icon)} ${esc(vm.subject?.name || '?')}</b>
      ${l.locked ? '<span class="badge">🔒 Qulflangan</span>' : ''}${l.weekParity !== 'all' ? `<span class="badge info">${PARITY[l.weekParity]}</span>` : ''}
      <span class="badge ${l.source === 'generator' ? 'primary' : ''}">${l.source === 'generator' ? 'Generator' : 'Qo‘lda'}</span></div>
    <table class="t mt"><tbody>
      <tr><td class="muted">Guruh</td><td>${esc(vm.target)}</td></tr>
      <tr><td class="muted">O‘qituvchi</td><td>${esc(vm.teacher?.name || '—')}</td></tr>
      <tr><td class="muted">Auditoriya</td><td>${esc(vm.room?.number || '—')} ${vm.room ? `(${vm.room.capacity} o‘rin)` : ''}</td></tr>
      <tr><td class="muted">Vaqt</td><td>${esc(dayName(l.day))}, ${esc(slotLabel(c, l.slotId))}${vm.dur > 1 ? ` · ${vm.dur} slot` : ''}</td></tr>
    </tbody></table>
    ${conf.length ? `<div class="alert ${conf.some((x) => x.severity === 'critical') ? 'err' : 'warn'} mt">${conf.some((x) => x.severity === 'critical') ? '🔴' : '🟠'}<div><ul>${conf.slice(0, 6).map((x) => `<li>${esc(x.msg)}</li>`).join('')}</ul></div></div>` : ''}
    <div class="btn-row mt">
      <button class="btn" data-a="edit">✏️ Tahrirlash</button>
      <button class="btn" data-a="lock">${l.locked ? '🔓 Qulfni ochish' : '🔒 Qulflash'}</button>
      <button class="btn" data-a="move" ${l.locked ? 'disabled' : ''}>↔️ Ko‘chirish</button>
      <button class="btn" data-a="swap" ${l.locked ? 'disabled' : ''}>🔁 Swap</button>
      <button class="btn" data-a="why">❓ Nega bu slot?</button>
      <button class="btn" data-a="sub">👥 O‘qituvchini almashtirish</button>
      <button class="btn danger-ghost" data-a="del">🗑️ O‘chirish</button>
    </div>`;
  const m = openModal({ title: 'Dars', body, actions: [] });
  m.body.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    if (a === 'edit') { m.close(); openLessonForm({ lessonId }); }
    if (a === 'lock') { const now = toggleLock(lessonId); toast(now ? '🔒 Dars qulflandi.' : '🔓 Qulf ochildi.'); m.close(); }
    if (a === 'move') { m.close(); onMove?.(lessonId); }
    if (a === 'swap') { m.close(); onSwap?.(lessonId); }
    if (a === 'why') { openWhyDialog(lessonId); }
    if (a === 'sub') { m.close(); onSubstitute?.(l.workloadId, date); }
    if (a === 'del') {
      if (await confirmDialog({ title: 'Darsni o‘chirish', message: `${vm.subject?.name} · ${vm.target} darsi o‘chirilsinmi? (Undo bilan qaytarish mumkin)`, confirmLabel: 'O‘chirish', danger: true })) {
        deleteLesson(lessonId);
        m.close();
        toast('Dars o‘chirildi.', { action: { label: 'Bekor qilish', onClick: () => store.undo() } });
      }
    }
  });
}
