import { store } from '../state/store.js';
import { renderCrudPage, readForm, showErrors } from '../components/crud.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { availabilityMatrix } from '../components/availabilityMatrix.js';
import { toast, ok as toastOk } from '../components/toast.js';
import { validateGroup } from '../validation/validators.js';
import { ctx as getCtx, occ as getOcc } from '../state/selectors.js';
import { wlGroupIds, wlLabel } from '../scheduler/model.js';
import { uid, nowIso } from '../utils/id.js';
import { esc, highlight } from '../utils/dom.js';
import { go } from '../router.js';

export function render(root, route) {
  const c = getCtx();
  const o = getOcc();
  const lessonsOf = (g) => {
    let n = 0;
    for (const d of c.workDays) n += o.groupDayLoad(g.id, d);
    return n;
  };
  renderCrudPage(root, route, {
    title: 'Guruhlar', icon: '👥', addLabel: 'Guruh qo‘shish', emptyIcon: '👥',
    subtitle: 'Talabalar soni auditoriya tanlashda hisobga olinadi. Smena guruhning o‘qish vaqtlarini belgilaydi.',
    emptyTitle: 'Hali guruh yo‘q', emptyText: 'Masalan: 101-Xitoy, 102-Xitoy, 201-Xitoy, 301-Ingliz.',
    emptyExtra: ' <a class="btn" href="#/files?tab=bulk">📥 Excel\'dan import</a>',
    items: () => store.get().groups,
    searchText: (g) => [g.name, g.direction, g.faculty, g.course].join(' '),
    filters: [
      { key: 'course', label: 'Kurs', options: () => [...new Set(store.get().groups.map((g) => g.course))].filter(Boolean).sort().map((x) => [x, x + '-kurs']), test: (g, v) => String(g.course) === v },
      { key: 'faculty', label: 'Fakultet', options: () => [...new Set(store.get().groups.map((g) => g.faculty))].filter(Boolean).sort().map((x) => [x, x]), test: (g, v) => g.faculty === v },
      { key: 'active', label: 'Holat', options: () => [['1', 'Faol'], ['0', 'Nofaol']], test: (g, v) => (g.active !== false) === (v === '1') },
    ],
    columns: [
      { key: 'name', label: 'Guruh', render: (g, q) => `<b>${highlight(g.name, q)}</b>${g.subgroups?.length ? ` <span class="badge" title="Kichik guruhlar">${g.subgroups.length} kichik guruh</span>` : ''}` },
      { key: 'course', label: 'Kurs', num: true, sort: (g) => Number(g.course) || 0 },
      { key: 'direction', label: 'Yo‘nalish' },
      { key: 'faculty', label: 'Fakultet' },
      { key: 'studentCount', label: 'Talabalar', num: true, sort: (g) => Number(g.studentCount) },
      { key: 'shift', label: 'Smena', render: (g) => (g.shift ? g.shift + '-smena' : '—') },
      { key: 'load', label: 'Haftalik dars', num: true, sort: lessonsOf, render: (g) => `${lessonsOf(g)}` },
      { key: 'active', label: 'Holat', render: (g) => (g.active === false ? '<span class="badge">⏸ Nofaol</span>' : '<span class="badge ok">Faol</span>'), sort: (g) => (g.active === false ? 1 : 0) },
    ],
    extraActions: (g) => `<button class="btn xs" data-x="view" title="Jadvalini ko‘rish" aria-label="Jadvalini ko‘rish">🗓️</button>`,
    onExtra: (a, g) => { if (a === 'view') go('schedule', { view: 'group', group: g.id }); },
    onAdd: () => openGroupForm(null),
    onEdit: (g) => openGroupForm(g),
    onToggle: (g) => store.update(g.active === false ? 'Guruh faollashtirildi' : 'Guruh nofaol qilindi', (d) => { const x = d.groups.find((y) => y.id === g.id); x.active = x.active === false; x.updatedAt = nowIso(); }),
    onDelete: (g) => deleteGroup(g),
  });
}

export function openGroupForm(g) {
  const data = store.get();
  const c = getCtx();
  const isNew = !g;
  const shifts = data.settings.shifts || {};
  const base = g ? JSON.parse(JSON.stringify(g)) : { id: uid('grp'), name: '', course: 1, direction: '', faculty: '', studentCount: 25, shift: 1, availability: null, maxLessonsPerDay: 4, subgroups: [], active: true };
  if (!base.availability || !Object.keys(base.availability).length) base.availability = shiftAvail(c, shifts, base.shift);
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-grid">
      <label class="field">Guruh nomi *<input name="name" value="${esc(base.name)}" placeholder="101-Xitoy"></label>
      <label class="field">Kurs<input name="course" type="number" min="1" max="8" value="${esc(base.course)}"></label>
      <label class="field">Talabalar soni *<input name="studentCount" type="number" min="1" value="${esc(base.studentCount)}"></label>
      <label class="field">Yo‘nalish<input name="direction" value="${esc(base.direction || '')}"></label>
      <label class="field">Fakultet<input name="faculty" value="${esc(base.faculty || '')}"></label>
      <label class="field">Kunlik maks. dars<input name="maxLessonsPerDay" type="number" min="1" value="${esc(base.maxLessonsPerDay ?? 4)}"></label>
      <label class="field">Smena<select name="shift"><option value="">— yo‘q (qo‘lda) —</option>${Object.keys(shifts).map((k) => `<option value="${k}" ${String(base.shift) === k ? 'selected' : ''}>${k}-smena</option>`).join('')}</select><span class="hint">Tanlanganda o‘quv vaqtlari avtomatik to‘ldiriladi.</span></label>
      <label class="check"><input type="checkbox" name="active" ${base.active !== false ? 'checked' : ''}> Faol</label>
    </div>
    <fieldset class="mt"><legend>Kichik guruhlar (til laboratoriyasi uchun bo‘linish)</legend>
      <div data-subs></div>
      <button type="button" class="btn sm" data-addsub>＋ Kichik guruh</button>
      <div data-err-for="subgroups"></div>
    </fieldset>
    <fieldset><legend>O‘quv vaqtlari (availability)</legend><div data-av></div><div data-err-for="availability"></div></fieldset>`;
  let subs = [...(base.subgroups || [])];
  const drawSubs = () => {
    body.querySelector('[data-subs]').innerHTML = subs.length ? subs.map((s, i) => `<div class="row" style="margin-bottom:6px"><input data-sn="${i}" value="${esc(s.name)}" placeholder="Nomi" style="flex:2" aria-label="Kichik guruh nomi"><input data-sc="${i}" type="number" min="1" value="${esc(s.studentCount)}" style="flex:1" aria-label="Talabalar soni"><button type="button" class="btn xs danger-ghost" data-delsub="${i}" aria-label="O‘chirish">✕</button></div>`).join('') : '<p class="muted">Kichik guruh yo‘q.</p>';
  };
  drawSubs();
  body.addEventListener('input', (e) => {
    if (e.target.dataset.sn !== undefined) subs[+e.target.dataset.sn].name = e.target.value;
    if (e.target.dataset.sc !== undefined) subs[+e.target.dataset.sc].studentCount = Number(e.target.value);
  });
  body.addEventListener('click', (e) => {
    if (e.target.closest('[data-addsub]')) {
      const name = body.querySelector('[name=name]').value || 'Guruh';
      const total = Number(body.querySelector('[name=studentCount]').value) || 0;
      subs.push({ id: uid('sub'), name: `${name} (${subs.length + 1})`, studentCount: Math.floor(total / (subs.length + 1)) || 1 });
      drawSubs();
    }
    const d = e.target.closest('[data-delsub]');
    if (d) { subs.splice(+d.dataset.delsub, 1); drawSubs(); }
  });
  let avm = availabilityMatrix({ days: c.workDays, slots: c.slots, value: base.availability });
  body.querySelector('[data-av]').appendChild(avm.el);
  body.querySelector('[name=shift]').addEventListener('change', (e) => {
    if (!e.target.value) return;
    const nv = shiftAvail(c, shifts, e.target.value);
    avm = availabilityMatrix({ days: c.workDays, slots: c.slots, value: nv });
    const holder = body.querySelector('[data-av]');
    holder.innerHTML = '';
    holder.appendChild(avm.el);
  });
  openModal({
    title: isNew ? 'Yangi guruh' : 'Guruhni tahrirlash: ' + g.name, body, size: 'lg',
    actions: [{ label: 'Bekor qilish' }, { label: 'Saqlash', kind: 'primary', onClick: () => {
      const f = readForm(body);
      const obj = { ...base, name: f.name.trim(), course: f.course, direction: f.direction.trim(), faculty: f.faculty.trim(), studentCount: f.studentCount, maxLessonsPerDay: f.maxLessonsPerDay === '' ? 4 : f.maxLessonsPerDay, shift: f.shift ? Number(f.shift) : null, active: f.active, subgroups: subs, availability: avm.getValue(), updatedAt: nowIso() };
      const errs = validateGroup(obj, store.get());
      if (!showErrors(body, errs)) return false;
      store.update(isNew ? `Guruh qo‘shildi: ${obj.name}` : `Guruh tahrirlandi: ${obj.name}`, (d) => {
        if (isNew) d.groups.push({ ...obj, createdAt: nowIso() });
        else Object.assign(d.groups.find((x) => x.id === obj.id), obj);
      });
      toastOk(isNew ? 'Guruh qo‘shildi.' : 'Saqlandi.');
    } }],
  });
}

function shiftAvail(c, shifts, shift) {
  const slots = shifts?.[shift] || c.slots.map((s) => s.id);
  const a = {};
  for (const d of c.workDays) a[d] = [...slots];
  return a;
}

async function deleteGroup(g) {
  const data = store.get();
  const c = getCtx();
  const wls = data.workloads.filter((w) => wlGroupIds(w).includes(g.id));
  const sole = wls.filter((w) => wlGroupIds(w).length === 1);
  const stream = wls.filter((w) => wlGroupIds(w).length > 1);
  const lessonIds = new Set(data.schedule.lessons.filter((l) => sole.some((w) => w.id === l.workloadId)).map((l) => l.id));
  const details = wls.length ? `<div class="alert warn">⚠️<div><b>Bog‘liq ma'lumotlar:</b><ul>
      ${sole.length ? `<li>${sole.length} ta o‘quv yuklamasi va ${lessonIds.size} ta dars o‘chiriladi: ${sole.slice(0, 5).map((w) => esc(wlLabel(c, w))).join('; ')}${sole.length > 5 ? '…' : ''}</li>` : ''}
      ${stream.length ? `<li>${stream.length} ta potokdan bu guruh chiqariladi (darslar boshqa guruhlar uchun qoladi).</li>` : ''}
    </ul></div></div>` : '';
  if (!(await confirmDialog({ title: 'Guruhni o‘chirish', message: `"${g.name}" guruhi o‘chirilsinmi?`, details, confirmLabel: 'O‘chirish', danger: true }))) return;
  store.update(`Guruh o‘chirildi: ${g.name}`, (d) => {
    d.groups = d.groups.filter((x) => x.id !== g.id);
    const soleIds = new Set(sole.map((w) => w.id));
    d.workloads = d.workloads.filter((w) => !soleIds.has(w.id));
    for (const w of d.workloads) {
      if (wlGroupIds(w).includes(g.id)) {
        w.target.groupIds = w.target.groupIds.filter((x) => x !== g.id);
        if (w.target.groupIds.length === 1 && w.target.type === 'stream') w.target.type = 'group';
      }
    }
    d.schedule.lessons = d.schedule.lessons.filter((l) => !soleIds.has(l.workloadId));
  });
  toast('Guruh o‘chirildi.', { action: { label: 'Bekor qilish', onClick: () => store.undo() } });
}
