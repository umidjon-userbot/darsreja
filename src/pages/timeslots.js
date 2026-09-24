import { store } from '../state/store.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { toast, ok as toastOk } from '../components/toast.js';
import { readForm, showErrors } from '../components/crud.js';
import { validateSlot } from '../validation/validators.js';
import { defaultTimeslots } from '../data/defaults.js';
import { uid } from '../utils/id.js';
import { esc } from '../utils/dom.js';
import { timeToMin } from '../utils/date.js';
import { emptyState } from '../components/emptyState.js';

export function render(root) {
  const data = store.get();
  const slots = [...data.timeslots].sort((a, b) => a.order - b.order);
  const used = (s) => data.schedule.lessons.filter((l) => l.slotId === s.id).length;
  root.innerHTML = `
    <div class="page-head"><div><h1>🕒 Vaqtlar (paralar)</h1><p>Slotlar boshlanish vaqti bo‘yicha avtomatik tartiblanadi. "Keyin katta tanaffus" — 2 slotli dars bu chegarani kesib o‘tmaydi.</p></div>
      <div class="btn-row"><button class="btn" data-a="reset">↺ Standart vaqtlar</button><button class="btn primary" data-a="add">＋ Slot qo‘shish</button></div></div>
    ${slots.length ? `<div class="table-wrap"><table class="t responsive"><thead><tr><th>#</th><th>Nomi</th><th>Boshlanish</th><th>Tugash</th><th>Davomiylik</th><th>Keyin katta tanaffus</th><th class="num">Darslar</th><th class="num">Amallar</th></tr></thead><tbody>
      ${slots.map((s, i) => `<tr data-id="${s.id}"><td data-label="#">${i + 1}</td><td data-label="Nomi"><b>${esc(s.name)}</b></td><td data-label="Boshlanish">${esc(s.start)}</td><td data-label="Tugash">${esc(s.end)}</td>
        <td data-label="Davomiylik">${timeToMin(s.end) - timeToMin(s.start)} daqiqa</td>
        <td data-label="Tanaffus">${s.joinableWithNext === false ? '☕ Ha' : '—'}</td><td class="num" data-label="Darslar">${used(s)}</td>
        <td class="actions"><button class="btn xs" data-e="${s.id}" aria-label="Tahrirlash">✏️</button><button class="btn xs danger-ghost" data-d="${s.id}" aria-label="O‘chirish">🗑️</button></td></tr>`).join('')}
    </tbody></table></div>` : `<div class="card">${emptyState({ icon: '🕒', title: 'Vaqt slotlari yo‘q', actionHtml: '<button class="btn primary" data-a="reset">Standart vaqtlarni qo‘shish</button>' })}</div>`}`;

  root.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'add') openSlotForm(null);
    if (a === 'reset') {
      if (data.schedule.lessons.length && !(await confirmDialog({ title: 'Standart vaqtlar', message: 'Standart 6 ta para tiklanadi. Mavjud slot ID\'lari saqlanadi (slot_1…slot_6), boshqa slotlardagi darslar joylashtirilmaganga o‘tadi.', confirmLabel: 'Tiklash' }))) return;
      store.update('Standart vaqtlar tiklandi', (d) => {
        d.timeslots = defaultTimeslots();
        const ids = new Set(d.timeslots.map((s) => s.id));
        d.schedule.lessons = d.schedule.lessons.filter((l) => ids.has(l.slotId));
      });
    }
    const eid = e.target.closest('[data-e]')?.dataset.e;
    if (eid) openSlotForm(data.timeslots.find((s) => s.id === eid));
    const did = e.target.closest('[data-d]')?.dataset.d;
    if (did) deleteSlot(data.timeslots.find((s) => s.id === did));
  });
}

function openSlotForm(s) {
  const isNew = !s;
  const all = store.get().timeslots;
  const base = s ? { ...s } : { id: uid('slot'), name: `${all.length + 1}-para`, start: '18:00', end: '19:20', joinableWithNext: true };
  const body = document.createElement('div');
  body.innerHTML = `<div class="form-grid">
    <label class="field">Nomi *<input name="name" value="${esc(base.name)}"></label>
    <label class="field">Boshlanish *<input name="start" type="time" value="${esc(base.start)}"></label>
    <label class="field">Tugash *<input name="end" type="time" value="${esc(base.end)}"></label>
    <label class="check span-all"><input type="checkbox" name="brk" ${base.joinableWithNext === false ? 'checked' : ''}> Bu paradan keyin katta tanaffus (masalan tushlik)</label></div>`;
  openModal({
    title: isNew ? 'Yangi vaqt sloti' : 'Slotni tahrirlash', body,
    actions: [{ label: 'Bekor qilish' }, { label: 'Saqlash', kind: 'primary', onClick: () => {
      const f = readForm(body);
      const obj = { ...base, name: f.name.trim(), start: f.start, end: f.end, joinableWithNext: !f.brk };
      if (!showErrors(body, validateSlot(obj, all))) return false;
      store.update(isNew ? 'Vaqt sloti qo‘shildi' : 'Vaqt sloti tahrirlandi', (d) => {
        if (isNew) d.timeslots.push(obj);
        else Object.assign(d.timeslots.find((x) => x.id === obj.id), obj);
        d.timeslots.sort((a, b) => timeToMin(a.start) - timeToMin(b.start)).forEach((x, i) => { x.order = i + 1; });
      });
      toastOk('Saqlandi.');
    } }],
  });
}

async function deleteSlot(s) {
  const data = store.get();
  const n = data.schedule.lessons.filter((l) => l.slotId === s.id).length;
  if (!(await confirmDialog({ title: 'Slotni o‘chirish', message: `"${s.name}" o‘chirilsinmi?${n ? ` Undagi ${n} ta dars joylashtirilmaganlarga o‘tadi.` : ''} Barcha availability'lardan ham olib tashlanadi.`, confirmLabel: 'O‘chirish', danger: true }))) return;
  store.update(`Vaqt sloti o‘chirildi: ${s.name}`, (d) => {
    d.timeslots = d.timeslots.filter((x) => x.id !== s.id);
    d.timeslots.forEach((x, i) => { x.order = i + 1; });
    d.schedule.lessons = d.schedule.lessons.filter((l) => l.slotId !== s.id);
    const strip = (av) => { if (av) for (const k of Object.keys(av)) av[k] = (av[k] || []).filter((x) => x !== s.id); };
    for (const t of d.teachers) { strip(t.availability); t.preferredSlots = (t.preferredSlots || []).filter((x) => x !== s.id); }
    for (const r of d.rooms) strip(r.availability);
    for (const g of d.groups) strip(g.availability);
    for (const w of d.workloads) if (w.preference) w.preference.slots = (w.preference.slots || []).filter((x) => x !== s.id);
    for (const k of Object.keys(d.settings.shifts || {})) d.settings.shifts[k] = d.settings.shifts[k].filter((x) => x !== s.id);
  });
  toast('O‘chirildi.', { action: { label: 'Bekor qilish', onClick: () => store.undo() } });
}
