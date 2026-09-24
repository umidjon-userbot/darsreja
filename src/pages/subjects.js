import { store } from '../state/store.js';
import { renderCrudPage, readForm, showErrors } from '../components/crud.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { toast, ok as toastOk } from '../components/toast.js';
import { validateSubject } from '../validation/validators.js';
import { roomTypeLabel } from '../state/selectors.js';
import { uid, nowIso } from '../utils/id.js';
import { esc, highlight } from '../utils/dom.js';
import { go } from '../router.js';

export function render(root, route) {
  const data = store.get();
  const wlCount = (s) => store.get().workloads.filter((w) => w.subjectId === s.id).length;
  const weekly = (s) => store.get().workloads.filter((w) => w.subjectId === s.id && w.active !== false).reduce((a, w) => a + (Number(w.lessonsPerWeek) || 0) + (Number(w.biweeklyLessons) || 0), 0);
  renderCrudPage(root, route, {
    title: 'Fanlar', icon: '📚', addLabel: 'Fan qo‘shish', emptyIcon: '📚',
    subtitle: 'Fan — katalog (nima o‘tiladi). Kim, kimga va necha soat o‘tishi <a href="#/workloads">O‘quv yuklamasi</a>da belgilanadi.',
    emptyTitle: 'Hali fan yo‘q',
    items: () => store.get().subjects,
    searchText: (s) => [s.name, s.code].join(' '),
    filters: [
      { key: 'type', label: 'Xona turi', options: () => data.settings.roomTypes.map((t) => [t.id, t.name]), test: (s, v) => s.roomType === v },
      { key: 'req', label: 'Turi', options: () => [['1', 'Majburiy'], ['0', 'Ixtiyoriy']], test: (s, v) => (s.required !== false) === (v === '1') },
    ],
    columns: [
      { key: 'name', label: 'Fan', render: (s, q) => `${esc(s.icon || '📘')} <b>${highlight(s.name, q)}</b>` },
      { key: 'code', label: 'Kod', render: (s, q) => `<span class="mono">${highlight(s.code || '', q)}</span>` },
      { key: 'roomType', label: 'Xona turi', render: (s) => (s.roomType && s.roomType !== 'regular' ? `<span class="badge info">${esc(roomTypeLabel(s.roomType))}</span>` : esc(roomTypeLabel('regular'))) },
      { key: 'required', label: 'Majburiy', render: (s) => (s.required !== false ? 'Majburiy' : 'Ixtiyoriy') },
      { key: 'wl', label: 'Yuklamalar', num: true, sort: wlCount, render: (s) => `${wlCount(s)} <span class="muted">(${weekly(s)} dars/hafta)</span>` },
    ],
    extraActions: () => `<button class="btn xs" data-x="wl" title="Yuklama qo‘shish" aria-label="Yuklama qo‘shish">🧮</button>`,
    onExtra: (a, s) => { if (a === 'wl') go('workloads', { add: s.id }); },
    onAdd: () => openSubjectForm(null),
    onEdit: (s) => openSubjectForm(s),
    onToggle: (s) => store.update('Fan holati o‘zgardi', (d) => { const x = d.subjects.find((y) => y.id === s.id); x.active = x.active === false; }),
    onDelete: (s) => deleteSubject(s),
  });
}

export function openSubjectForm(s, onSaved) {
  const data = store.get();
  const isNew = !s;
  const base = s ? { ...s } : { id: uid('sub'), name: '', code: '', icon: '📘', roomType: 'regular', required: true, active: true };
  const body = document.createElement('div');
  body.innerHTML = `<div class="form-grid">
    <label class="field span-2">Fan nomi *<input name="name" value="${esc(base.name)}" placeholder="Xitoy tili"></label>
    <label class="field">Kod<input name="code" value="${esc(base.code || '')}" placeholder="XT-101"></label>
    <label class="field">Belgi (emoji)<input name="icon" value="${esc(base.icon || '')}" maxlength="4"></label>
    <label class="field">Talab qilinadigan xona turi<select name="roomType">${data.settings.roomTypes.map((t) => `<option value="${t.id}" ${t.id === base.roomType ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select><span class="hint">Maxsus tur tanlansa — faqat shu turdagi xona beriladi.</span></label>
    <label class="field">Turi<select name="required"><option value="1" ${base.required !== false ? 'selected' : ''}>Majburiy</option><option value="0" ${base.required === false ? 'selected' : ''}>Ixtiyoriy</option></select></label>
    <label class="check"><input type="checkbox" name="active" ${base.active !== false ? 'checked' : ''}> Faol</label>
  </div>`;
  openModal({
    title: isNew ? 'Yangi fan' : 'Fanni tahrirlash', body,
    actions: [{ label: 'Bekor qilish' }, { label: 'Saqlash', kind: 'primary', onClick: () => {
      const f = readForm(body);
      const obj = { ...base, name: f.name.trim(), code: f.code.trim(), icon: f.icon.trim() || '📘', roomType: f.roomType, required: f.required === '1', active: f.active, updatedAt: nowIso() };
      if (!showErrors(body, validateSubject(obj, store.get()))) return false;
      store.update(isNew ? `Fan qo‘shildi: ${obj.name}` : `Fan tahrirlandi: ${obj.name}`, (d) => {
        if (isNew) d.subjects.push({ ...obj, createdAt: nowIso() });
        else Object.assign(d.subjects.find((x) => x.id === obj.id), obj);
      });
      toastOk('Saqlandi.');
      onSaved?.(obj);
    } }],
  });
}

async function deleteSubject(s) {
  const data = store.get();
  const wls = data.workloads.filter((w) => w.subjectId === s.id);
  const nL = data.schedule.lessons.filter((l) => wls.some((w) => w.id === l.workloadId)).length;
  const details = wls.length ? `<div class="alert warn">⚠️<div>${wls.length} ta o‘quv yuklamasi va ${nL} ta dars ham o‘chiriladi.</div></div>` : '';
  if (!(await confirmDialog({ title: 'Fanni o‘chirish', message: `"${s.name}" fani o‘chirilsinmi?`, details, confirmLabel: 'O‘chirish', danger: true }))) return;
  const ids = new Set(wls.map((w) => w.id));
  store.update(`Fan o‘chirildi: ${s.name}`, (d) => {
    d.subjects = d.subjects.filter((x) => x.id !== s.id);
    d.workloads = d.workloads.filter((w) => !ids.has(w.id));
    d.schedule.lessons = d.schedule.lessons.filter((l) => !ids.has(l.workloadId));
    for (const t of d.teachers) t.subjectIds = (t.subjectIds || []).filter((x) => x !== s.id);
  });
  toast('O‘chirildi.', { action: { label: 'Bekor qilish', onClick: () => store.undo() } });
}
