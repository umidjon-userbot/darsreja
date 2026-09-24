// 🎪 Tadbirlar: bir martalik (majlis, tadbir) va haftalik takrorlanuvchi (kafedra majlisi) band qilishlar
import { store } from '../state/store.js';
import { ctx as getCtx } from '../state/selectors.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { toast, ok as toastOk, err as toastErr } from '../components/toast.js';
import { emptyState } from '../components/emptyState.js';
import { occurrencesOn } from '../substitution/calendarResolver.js';
import { wlGroupIds, wlLabel, lessonSlotIds } from '../scheduler/model.js';
import { DAYS } from '../i18n/uz.js';
import { esc } from '../utils/dom.js';
import { uid, nowIso } from '../utils/id.js';
import { todayStr, fmtHuman, isValidDate, dayKeyOf } from '../utils/date.js';

// Tadbir ta'sir qiladigan darslar
export function affectedLessons(data, ev, ctx) {
  const hit = (teacherId, roomId, wl) => (ev.teacherIds || []).includes(teacherId) || (ev.roomIds || []).includes(roomId) || wlGroupIds(wl).some((g) => (ev.groupIds || []).includes(g));
  const slots = new Set(ev.slotIds || []);
  if (ev.repeat === 'weekly') {
    return data.schedule.lessons.filter((l) => {
      const wl = ctx.workloads.get(l.workloadId);
      return wl && l.day === ev.day && lessonSlotIds(ctx, l, wl).some((s) => slots.has(s)) && hit(wl.teacherId, l.roomId, wl);
    }).map((l) => ({ lesson: l, wl: ctx.workloads.get(l.workloadId), slotId: l.slotId }));
  }
  const tmp = { ...data, events: [] };
  return occurrencesOn(tmp, ev.date, ctx).items.filter((o) => o.status !== 'cancelled' && o.slotIds.some((s) => slots.has(s)) && hit(o.teacherId, o.roomId, o.wl));
}

export function render(root) {
  const data = store.get();
  const c = getCtx();
  const list = [...(data.events || [])].sort((a, b) => ((a.date || a.day) < (b.date || b.day) ? -1 : 1));
  const names = (ids, map, f = 'name') => (ids || []).map((id) => map.get(id)?.[f] || '?').join(', ');
  root.innerHTML = `
    <div class="page-head"><div><h1>🎪 Tadbirlar</h1><p>Xona, o‘qituvchi yoki guruhni aniq sanaga (majlis, konferensiya, ochiq dars) yoki har haftaga (kafedra majlisi) band qilish. Haftalik tadbirlarni generator chetlab o‘tadi; bir martalik tadbirlar darslarni bekor qiladi yoki konflikt sifatida ko‘rsatiladi.</p></div>
      <div class="btn-row"><button class="btn primary" data-a="add">＋ Tadbir qo‘shish</button></div></div>
    ${list.length ? `<div class="table-wrap"><table class="t responsive"><thead><tr><th>Tadbir</th><th>Qachon</th><th>Paralar</th><th>Ishtirokchilar</th><th>Darslarga ta'siri</th><th class="num">Amallar</th></tr></thead><tbody>
      ${list.map((e) => { const aff = affectedLessons(data, e, c); return `<tr data-id="${e.id}"><td data-label="Tadbir"><b>${esc(e.title)}</b>${e.note ? `<br><small class="muted">${esc(e.note)}</small>` : ''}</td>
        <td data-label="Qachon">${e.repeat === 'weekly' ? `🔁 Har ${DAYS[e.day]}` : `${fmtHuman(e.date)}, ${DAYS[dayKeyOf(e.date)]}`}</td>
        <td data-label="Paralar">${(e.slotIds || []).map((s) => esc(c.slots[c.slotIdx.get(s)]?.name || '?')).join(', ')}</td>
        <td data-label="Ishtirokchilar"><small>${[names(e.teacherIds, c.teachers), names(e.groupIds, c.groups), names(e.roomIds, c.rooms, 'number')].filter(Boolean).join(' · ') || '—'}</small></td>
        <td data-label="Ta'siri">${aff.length ? (e.cancelAffected ? `<span class="badge warn">${aff.length} dars bekor</span>` : `<span class="badge err">🔴 ${aff.length} to‘qnashuv</span>`) : '<span class="badge ok">yo‘q</span>'}</td>
        <td class="actions"><button class="btn xs" data-e="${e.id}" aria-label="Tahrirlash">✏️</button> <button class="btn xs danger-ghost" data-d="${e.id}" aria-label="O‘chirish">🗑️</button></td></tr>`; }).join('')}
    </tbody></table></div>` : `<div class="card">${emptyState({ icon: '🎪', title: 'Tadbirlar yo‘q', text: 'Masalan: "Kafedra majlisi — har chorshanba 4-para" yoki "12-noyabr, Zal-1 — ilmiy konferensiya".', actionHtml: '<button class="btn primary" data-a="add">＋ Tadbir qo‘shish</button>' })}</div>`}`;
  root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-a=add]')) openEventForm(null);
    const id = e.target.closest('[data-e]')?.dataset.e;
    if (id) openEventForm(data.events.find((x) => x.id === id));
    const d = e.target.closest('[data-d]')?.dataset.d;
    if (d && (await confirmDialog({ title: 'Tadbirni o‘chirish', message: 'Tadbir o‘chirilsinmi? Bekor qilingan darslar qayta tiklanadi.', confirmLabel: 'O‘chirish', danger: true }))) {
      store.update('Tadbir o‘chirildi', (x) => { x.events = x.events.filter((y) => y.id !== d); });
      toast('O‘chirildi.', { action: { label: 'Bekor qilish', onClick: () => store.undo() } });
    }
  });
}

export function openEventForm(ev, preset = {}) {
  const data = store.get();
  const c = getCtx();
  const isNew = !ev;
  const base = ev ? JSON.parse(JSON.stringify(ev)) : { id: uid('ev'), title: '', repeat: 'once', date: todayStr(), day: 'wednesday', slotIds: [], teacherIds: [], groupIds: [], roomIds: [], cancelAffected: true, note: '', ...preset };
  const multi = (name, items, sel) => `<div class="multi">${items.map(([v, n]) => `<label><input type="checkbox" data-m="${name}" value="${v}" ${sel.includes(v) ? 'checked' : ''}> ${esc(n)}</label>`).join('') || '<span class="muted">—</span>'}</div>`;
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-grid">
      <label class="field span-2">Nomi *<input id="ev-title" value="${esc(base.title)}" placeholder="Kafedra majlisi"></label>
      <label class="field">Takrorlanish<select id="ev-repeat"><option value="once" ${base.repeat === 'once' ? 'selected' : ''}>Bir martalik (sana)</option><option value="weekly" ${base.repeat === 'weekly' ? 'selected' : ''}>Har hafta</option></select></label>
      <label class="field" data-once>Sana<input id="ev-date" type="date" value="${esc(base.date || todayStr())}"></label>
      <label class="field" data-weekly>Kun<select id="ev-day">${c.workDays.map((d) => `<option value="${d}" ${d === base.day ? 'selected' : ''}>${DAYS[d]}</option>`).join('')}</select></label>
    </div>
    <fieldset class="mt"><legend>Paralar *</legend>${multi('slotIds', c.slots.map((s) => [s.id, `${s.name} ${s.start}`]), base.slotIds)}</fieldset>
    <fieldset><legend>O‘qituvchilar</legend>${multi('teacherIds', data.teachers.map((t) => [t.id, t.name]), base.teacherIds)}</fieldset>
    <fieldset><legend>Guruhlar</legend>${multi('groupIds', data.groups.map((g) => [g.id, g.name]), base.groupIds)}</fieldset>
    <fieldset><legend>Auditoriyalar</legend>${multi('roomIds', data.rooms.map((r) => [r.id, r.number]), base.roomIds)}</fieldset>
    <label class="check" data-once><input type="checkbox" id="ev-cancel" ${base.cancelAffected ? 'checked' : ''}> Ta'sirlangan darslarni bekor qilish (qoplash ro‘yxatiga tushadi)</label>
    <label class="field mt">Izoh<input id="ev-note" value="${esc(base.note || '')}"></label>
    <div data-preview class="mt"></div>`;
  const collect = () => ({
    ...base,
    title: body.querySelector('#ev-title').value.trim(),
    repeat: body.querySelector('#ev-repeat').value,
    date: body.querySelector('#ev-date').value,
    day: body.querySelector('#ev-day').value,
    cancelAffected: body.querySelector('#ev-repeat').value === 'weekly' ? false : body.querySelector('#ev-cancel').checked,
    note: body.querySelector('#ev-note').value.trim(),
    ...Object.fromEntries(['slotIds', 'teacherIds', 'groupIds', 'roomIds'].map((k) => [k, [...body.querySelectorAll(`[data-m="${k}"]:checked`)].map((x) => x.value)])),
  });
  const refresh = () => {
    const x = collect();
    body.querySelectorAll('[data-once]').forEach((el) => { el.style.display = x.repeat === 'once' ? '' : 'none'; });
    body.querySelectorAll('[data-weekly]').forEach((el) => { el.style.display = x.repeat === 'weekly' ? '' : 'none'; });
    const aff = x.slotIds.length ? affectedLessons(store.get(), x, c) : [];
    body.querySelector('[data-preview]').innerHTML = !aff.length ? '<div class="alert ok">✅<div>Darslarga ta\'sir qilmaydi.</div></div>'
      : `<div class="alert ${x.cancelAffected ? 'warn' : 'err'}">${x.cancelAffected ? '⚠️' : '🔴'}<div><b>${aff.length} ta dars ${x.repeat === 'weekly' ? 'shablonda to‘qnashadi (konflikt sifatida ko‘rinadi — darsni ko‘chiring yoki generatorni qayta ishga tushiring)' : x.cancelAffected ? 'bekor qilinadi' : 'bilan to‘qnashadi'}:</b><ul>${aff.slice(0, 8).map((o) => `<li>${esc(c.slots[c.slotIdx.get(o.slotId)]?.name || '')} · ${esc(wlLabel(c, o.wl))}</li>`).join('')}</ul></div></div>`;
  };
  body.addEventListener('change', refresh);
  refresh();
  openModal({
    title: isNew ? 'Yangi tadbir' : 'Tadbirni tahrirlash', body, size: 'lg',
    actions: [{ label: 'Bekor qilish' }, { label: 'Saqlash', kind: 'primary', onClick: () => {
      const x = collect();
      if (!x.title) { toastErr('Tadbir nomini kiriting.'); return false; }
      if (!x.slotIds.length) { toastErr('Kamida bitta para tanlang.'); return false; }
      if (x.repeat === 'once' && !isValidDate(x.date)) { toastErr('Sanani tanlang.'); return false; }
      if (!x.teacherIds.length && !x.groupIds.length && !x.roomIds.length) { toastErr('Kamida bitta o‘qituvchi, guruh yoki xonani tanlang.'); return false; }
      if (x.repeat === 'weekly') { delete x.date; } else { delete x.day; }
      x.updatedAt = nowIso();
      store.update(isNew ? `Tadbir qo‘shildi: ${x.title}` : `Tadbir tahrirlandi: ${x.title}`, (d) => {
        d.events = d.events || [];
        if (isNew) d.events.push({ ...x, createdAt: nowIso() });
        else Object.assign(d.events.find((y) => y.id === x.id), x);
      });
      toastOk('Tadbir saqlandi.');
    } }],
  });
}
