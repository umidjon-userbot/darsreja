import { store } from '../state/store.js';
import { renderCrudPage, readForm, showErrors } from '../components/crud.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { availabilityMatrix } from '../components/availabilityMatrix.js';
import { toast, ok as toastOk } from '../components/toast.js';
import { progressBar } from '../components/charts.js';
import { openTransferWizard, openAbsenceDialog } from '../components/transferWizard.js';
import { validateTeacher } from '../validation/validators.js';
import { teacherDeletionImpact } from '../services/cascade.js';
import { openFormLinkDialog } from './teacherForm.js';
import { ctx as getCtx, occ as getOcc } from '../state/selectors.js';
import { teacherCapacity, wlDemandUnits } from '../scheduler/feasibility.js';
import { DAYS, DAYS_SHORT, ABSENCE_REASONS } from '../i18n/uz.js';
import { uid, nowIso } from '../utils/id.js';
import { esc, highlight } from '../utils/dom.js';
import { fmtHuman } from '../utils/date.js';
import { go } from '../router.js';

const COLORS = ['#e4572e', '#f59e0b', '#3b82f6', '#ec4899', '#10b981', '#8b5cf6', '#14b8a6', '#64748b', '#ef4444', '#0ea5e9', '#84cc16', '#a855f7'];

export function render(root, route) {
  const c = getCtx();
  const o = getOcc();
  const demand = (t) => store.get().workloads.filter((w) => w.teacherId === t.id && w.active !== false).reduce((a, w) => a + wlDemandUnits(w), 0);
  renderCrudPage(root, route, {
    title: 'O‘qituvchilar', icon: '🧑‍🏫', addLabel: 'O‘qituvchi qo‘shish', emptyIcon: '🧑‍🏫',
    subtitle: 'Mavjud vaqtlar (availability), ish kunlari va limitlar generator uchun qat\'iy (hard) cheklov.',
    emptyTitle: 'Hali o‘qituvchi yo‘q',
    emptyExtra: ' <a class="btn" href="#/files?tab=bulk">📥 Excel\'dan import</a>',
    items: () => store.get().teachers,
    searchText: (t) => [t.name, t.phone, ...(t.subjectIds || []).map((s) => c.subjects.get(s)?.name)].join(' '),
    filters: [
      { key: 'subject', label: 'Fan', options: () => store.get().subjects.map((s) => [s.id, s.name]), test: (t, v) => (t.subjectIds || []).includes(v) },
      { key: 'active', label: 'Holat', options: () => [['1', 'Faol'], ['0', 'Nofaol']], test: (t, v) => (t.active !== false) === (v === '1') },
    ],
    columns: [
      { key: 'name', label: 'F.I.Sh.', render: (t, q) => `<span class="dot" style="background:${esc(t.color || '#888')}"></span> <b>${highlight(t.name, q)}</b>${(t.absences || []).some((a) => a.endDate >= new Date().toISOString().slice(0, 10)) ? ' <span class="badge warn" title="Yo‘qlik rejalashtirilgan">yo‘qlik</span>' : ''}` },
      { key: 'subjects', label: 'Fanlar', sort: (t) => (t.subjectIds || []).length, render: (t) => (t.subjectIds || []).map((s) => esc(c.subjects.get(s)?.name || '?')).join(', ') || '<span class="muted">—</span>' },
      { key: 'days', label: 'Ish kunlari', render: (t) => `${c.workDays.filter((d) => (t.availability?.[d] || []).length).map((d) => DAYS_SHORT[d]).join(' ')} <span class="muted">(${t.minWorkingDays}–${t.maxWorkingDays})</span>` },
      { key: 'load', label: 'Yuklama', sort: (t) => o.teacherWeekUnits(t.id) / (t.maxWeeklyClasses || 1), render: (t) => { const u = o.teacherWeekUnits(t.id); const m = Number(t.maxWeeklyClasses) || 1; return `<div style="min-width:120px">${u} / ${m} <span class="muted">(talab ${demand(t)})</span>${progressBar((u / m) * 100)}</div>`; } },
      { key: 'active', label: 'Holat', render: (t) => (t.active === false ? '<span class="badge">⏸ Nofaol</span>' : '<span class="badge ok">Faol</span>'), sort: (t) => (t.active === false ? 1 : 0) },
    ],
    extraActions: () => `<button class="btn xs" data-x="view" title="Jadvali" aria-label="Jadvali">🗓️</button><button class="btn xs" data-x="absence" title="Yo‘qlik qo‘shish" aria-label="Yo‘qlik qo‘shish">🤒</button><button class="btn xs" data-x="transfer" title="Darslarini o‘tkazish" aria-label="Darslarini o‘tkazish">👥</button><button class="btn xs" data-x="form" title="Bo‘sh vaqtlar formasi havolasi" aria-label="Forma havolasi">📝</button>`,
    onExtra: (a, t) => {
      if (a === 'view') go('schedule', { view: 'teacher', teacher: t.id });
      if (a === 'absence') openAbsenceDialog(t.id);
      if (a === 'transfer') openTeacherTransfer(t);
      if (a === 'form') openFormLinkDialog(t.id);
    },
    onAdd: () => openTeacherForm(null),
    onEdit: (t) => openTeacherForm(t),
    onToggle: (t) => store.update(t.active === false ? 'O‘qituvchi faollashtirildi' : 'O‘qituvchi nofaol qilindi', (d) => { const x = d.teachers.find((y) => y.id === t.id); x.active = x.active === false; }),
    onDelete: (t) => deleteTeacher(t),
  });
}

function openTeacherTransfer(t) {
  const wls = store.get().workloads.filter((w) => w.teacherId === t.id);
  if (!wls.length) return toast(`${t.name}da o‘quv yuklamasi yo‘q.`);
  openTransferWizard({ workloadIds: wls.map((w) => w.id), fromTeacherId: t.id });
}

export function openTeacherForm(t) {
  const data = store.get();
  const c = getCtx();
  const isNew = !t;
  const base = t ? JSON.parse(JSON.stringify(t)) : {
    id: uid('tch'), name: '', phone: '', color: COLORS[data.teachers.length % COLORS.length], subjectIds: [], building: '',
    minWorkingDays: 3, maxWorkingDays: 5, minClassesPerDay: 1, maxClassesPerDay: 4, maxWeeklyClasses: 16, maxConsecutive: data.settings.maxConsecutive || 3,
    availability: Object.fromEntries(c.workDays.slice(0, 5).map((d) => [d, c.slots.slice(0, 4).map((s) => s.id)])),
    preferredDays: [], preferredSlots: [], absences: [], active: true,
  };
  const demand = data.workloads.filter((w) => w.teacherId === base.id && w.active !== false).reduce((a, w) => a + wlDemandUnits(w), 0);
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-grid">
      <label class="field span-2">F.I.Sh. *<input name="name" value="${esc(base.name)}" placeholder="Zhang Wei"></label>
      <label class="field">Telefon<input name="phone" type="tel" value="${esc(base.phone || '')}" placeholder="+998 90 123 45 67"></label>
      <label class="field">Rang<input name="color" type="color" value="${esc(base.color || '#4f46e5')}" style="padding:2px;height:36px"></label>
      <label class="field">Asosiy bino<input name="building" value="${esc(base.building || '')}" placeholder="A"></label>
      <label class="check"><input type="checkbox" name="active" ${base.active !== false ? 'checked' : ''}> Faol</label>
    </div>
    <fieldset class="mt"><legend>O‘ta oladigan fanlari (almashtirishda nomzod tanlash uchun)</legend>
      <div class="multi">${data.subjects.map((s) => `<label><input type="checkbox" data-multi name="subjectIds" value="${s.id}" ${base.subjectIds?.includes(s.id) ? 'checked' : ''}> ${esc(s.icon || '')} ${esc(s.name)}</label>`).join('') || '<span class="muted">Avval fanlar qo‘shing.</span>'}</div>
    </fieldset>
    <fieldset><legend>Limitlar</legend>
      <div class="form-grid">
        <label class="field">Min. ish kuni<input name="minWorkingDays" type="number" min="0" max="7" value="${base.minWorkingDays}"><span class="hint">Kuchli soft (bajarib bo‘lmasa ham jadval tuziladi)</span></label>
        <label class="field">Maks. ish kuni<input name="maxWorkingDays" type="number" min="1" max="7" value="${base.maxWorkingDays}"><span class="hint">Hard: hech qachon oshmaydi</span></label>
        <label class="field">Kunlik min. dars<input name="minClassesPerDay" type="number" min="0" value="${base.minClassesPerDay}"></label>
        <label class="field">Kunlik maks. dars<input name="maxClassesPerDay" type="number" min="1" value="${base.maxClassesPerDay}"></label>
        <label class="field">Haftalik maks. dars<input name="maxWeeklyClasses" type="number" min="1" value="${base.maxWeeklyClasses}"></label>
        <label class="field">Maks. ketma-ket<input name="maxConsecutive" type="number" min="1" value="${base.maxConsecutive || 3}"></label>
      </div>
    </fieldset>
    <fieldset><legend>Mavjud vaqtlar (availability) — bosing yoki sudrang</legend><div data-av></div><div data-err-for="availability"></div></fieldset>
    <fieldset><legend>Afzal kunlar va vaqtlar (soft)</legend>
      <div class="multi" style="margin-bottom:8px">${c.workDays.map((d) => `<label><input type="checkbox" data-multi name="preferredDays" value="${d}" ${base.preferredDays?.includes(d) ? 'checked' : ''}> ${DAYS[d]}</label>`).join('')}</div>
      <div class="multi">${c.slots.map((s) => `<label><input type="checkbox" data-multi name="preferredSlots" value="${s.id}" ${base.preferredSlots?.includes(s.id) ? 'checked' : ''}> ${esc(s.name)} ${s.start}</label>`).join('')}</div>
    </fieldset>
    ${!isNew && base.absences?.length ? `<fieldset><legend>Yo‘qliklar</legend><ul class="list-plain">${base.absences.map((a) => `<li>${fmtHuman(a.startDate)} – ${fmtHuman(a.endDate)} · ${ABSENCE_REASONS[a.reason] || a.reason} ${a.note ? '· ' + esc(a.note) : ''}</li>`).join('')}</ul></fieldset>` : ''}`;

  const statusFn = (nd, ns) => {
    const f = readForm(body);
    const tmp = { ...base, availability: avm ? avm.getValue() : base.availability, maxWeeklyClasses: f.maxWeeklyClasses, maxClassesPerDay: f.maxClassesPerDay, maxWorkingDays: f.maxWorkingDays };
    const cap = teacherCapacity(c, tmp).cap;
    if (!demand) return '<span class="muted">Yuklama hali biriktirilmagan.</span>';
    return demand <= cap ? `Yuklama: <b>${demand}</b> dars, imkoniyat ${cap}. ✅ Yetarli` : `<span style="color:var(--danger)">⚠️ Yuklama (${demand}) imkoniyatdan (${cap}) ko‘p!</span>`;
  };
  let avm = null;
  avm = availabilityMatrix({ days: c.workDays, slots: c.slots, value: base.availability, statusFn });
  body.querySelector('[data-av]').appendChild(avm.el);
  body.addEventListener('change', (e) => { if (e.target.name?.startsWith('max')) avm.refresh(); });

  openModal({
    title: isNew ? 'Yangi o‘qituvchi' : 'Tahrirlash: ' + t.name, body, size: 'lg',
    actions: [{ label: 'Bekor qilish' }, { label: 'Saqlash', kind: 'primary', onClick: () => {
      const f = readForm(body);
      const obj = { ...base, name: f.name.trim(), phone: f.phone.trim(), color: f.color, building: f.building.trim(), active: f.active,
        subjectIds: f.subjectIds || [], minWorkingDays: f.minWorkingDays, maxWorkingDays: f.maxWorkingDays, minClassesPerDay: f.minClassesPerDay,
        maxClassesPerDay: f.maxClassesPerDay, maxWeeklyClasses: f.maxWeeklyClasses, maxConsecutive: f.maxConsecutive,
        availability: avm.getValue(), preferredDays: f.preferredDays || [], preferredSlots: f.preferredSlots || [], updatedAt: nowIso() };
      const errs = validateTeacher(obj, store.get());
      if (!showErrors(body, errs)) return false;
      store.update(isNew ? `O‘qituvchi qo‘shildi: ${obj.name}` : `O‘qituvchi tahrirlandi: ${obj.name}`, (d) => {
        if (isNew) d.teachers.push({ ...obj, createdAt: nowIso() });
        else Object.assign(d.teachers.find((x) => x.id === obj.id), obj);
      });
      toastOk('Saqlandi.');
    } }],
  });
}

async function deleteTeacher(t) {
  const data = store.get();
  const { blocked, workloads: wls, lessons } = teacherDeletionImpact(data, t.id);
  if (blocked) {
    const m = openModal({
      title: 'O‘chirib bo‘lmaydi',
      body: `<div class="alert warn">⚠️<div><b>${esc(t.name)}</b>ning jadvalda ${lessons.length} ta darsi bor (${wls.length} ta yuklama). Darsi bor o‘qituvchi o‘chirilmaydi.</div></div><p>Tanlang:</p>`,
      actions: [
        { label: 'Bekor qilish' },
        { label: '⏸ Nofaol qilish', onClick: () => { store.update('O‘qituvchi nofaol qilindi', (d) => { d.teachers.find((x) => x.id === t.id).active = false; }); toast('Nofaol qilindi. Darslari konflikt sifatida ko‘rinadi — o‘tkazishni unutmang.'); } },
        { label: '👥 Darslarini boshqa o‘qituvchiga o‘tkazish', kind: 'primary', onClick: () => { setTimeout(() => openTeacherTransfer(t), 50); } },
      ],
    });
    return m;
  }
  const details = wls.length ? `<div class="alert warn">⚠️<div>${wls.length} ta joylashtirilmagan o‘quv yuklamasi ham o‘chiriladi.</div></div>` : '';
  if (!(await confirmDialog({ title: 'O‘qituvchini o‘chirish', message: `"${t.name}" o‘chirilsinmi?`, details, confirmLabel: 'O‘chirish', danger: true }))) return;
  store.update(`O‘qituvchi o‘chirildi: ${t.name}`, (d) => {
    d.teachers = d.teachers.filter((x) => x.id !== t.id);
    d.workloads = d.workloads.filter((w) => w.teacherId !== t.id);
  });
  toast('O‘chirildi.', { action: { label: 'Bekor qilish', onClick: () => store.undo() } });
}
