import { store } from '../state/store.js';
import { renderCrudPage, readForm, showErrors } from '../components/crud.js';
import { openModal } from '../components/modal.js';
import { availabilityMatrix } from '../components/availabilityMatrix.js';
import { toast, ok as toastOk } from '../components/toast.js';
import { progressBar } from '../components/charts.js';
import { validateRoom } from '../validation/validators.js';
import { ctx as getCtx, roomTypeLabel } from '../state/selectors.js';
import { roomAvailCount, buildContext } from '../scheduler/model.js';
import { Occupancy, checkPlacement } from '../scheduler/constraintChecker.js';
import { candidateRooms } from '../scheduler/slotGenerator.js';
import { uid, nowIso } from '../utils/id.js';
import { esc, highlight } from '../utils/dom.js';
import { go } from '../router.js';

export function render(root, route) {
  const c = getCtx();
  const used = (r) => store.get().schedule.lessons.filter((l) => l.roomId === r.id).reduce((a, l) => a + (Number(c.workloads.get(l.workloadId)?.durationSlots) || 1), 0);
  const util = (r) => { const cap = roomAvailCount(c, r); return cap ? (used(r) / cap) * 100 : 0; };
  renderCrudPage(root, route, {
    title: 'Auditoriyalar', icon: '🚪', addLabel: 'Auditoriya qo‘shish', emptyIcon: '🚪',
    subtitle: 'Sig‘im, turi va ishlash vaqtlari generator uchun qat\'iy cheklov.',
    emptyTitle: 'Hali auditoriya yo‘q',
    emptyExtra: ' <a class="btn" href="#/files?tab=bulk">📥 Excel\'dan import</a>',
    defaultSort: 'number',
    items: () => store.get().rooms,
    searchText: (r) => [r.number, r.building, roomTypeLabel(r.type), (r.equipment || []).join(' ')].join(' '),
    filters: [
      { key: 'type', label: 'Turi', options: () => store.get().settings.roomTypes.map((t) => [t.id, t.name]), test: (r, v) => r.type === v },
      { key: 'building', label: 'Bino', options: () => [...new Set(store.get().rooms.map((r) => r.building))].filter(Boolean).sort().map((b) => [b, b + ' bino']), test: (r, v) => r.building === v },
    ],
    columns: [
      { key: 'number', label: 'Xona', render: (r, q) => `<b>${highlight(r.number, q)}</b>` },
      { key: 'building', label: 'Bino / qavat', render: (r) => `${esc(r.building || '—')} / ${esc(r.floor ?? '—')}` },
      { key: 'capacity', label: 'Sig‘im', num: true, sort: (r) => Number(r.capacity) },
      { key: 'type', label: 'Turi', render: (r) => (r.type !== 'regular' ? `<span class="badge info">${esc(roomTypeLabel(r.type))}</span>` : esc(roomTypeLabel(r.type))) },
      { key: 'equipment', label: 'Jihozlar', render: (r) => esc((r.equipment || []).join(', ')) },
      { key: 'util', label: 'Bandlik', sort: util, render: (r) => `<div style="min-width:110px">${used(r)} / ${roomAvailCount(c, r)} (${Math.round(util(r))}%)${progressBar(util(r))}</div>` },
    ],
    extraActions: () => `<button class="btn xs" data-x="view" title="Jadvali" aria-label="Jadvali">🗓️</button>`,
    onExtra: (a, r) => { if (a === 'view') go('schedule', { view: 'room', room: r.id }); },
    onAdd: () => openRoomForm(null),
    onEdit: (r) => openRoomForm(r),
    onToggle: (r) => store.update('Xona holati o‘zgardi', (d) => { const x = d.rooms.find((y) => y.id === r.id); x.active = x.active === false; }),
    onDelete: (r) => deleteRoom(r),
  });
}

export function openRoomForm(r) {
  const data = store.get();
  const c = getCtx();
  const isNew = !r;
  const base = r ? JSON.parse(JSON.stringify(r)) : { id: uid('room'), number: '', building: 'A', floor: 1, capacity: 30, type: 'regular', equipment: [], availability: Object.fromEntries(c.workDays.map((d) => [d, c.slots.map((s) => s.id)])), active: true };
  const body = document.createElement('div');
  body.innerHTML = `<div class="form-grid">
    <label class="field">Xona raqami *<input name="number" value="${esc(base.number)}" placeholder="205"></label>
    <label class="field">Bino<input name="building" value="${esc(base.building || '')}"></label>
    <label class="field">Qavat<input name="floor" type="number" value="${esc(base.floor ?? '')}"></label>
    <label class="field">Sig‘im *<input name="capacity" type="number" min="1" value="${esc(base.capacity)}"></label>
    <label class="field">Turi<select name="type">${data.settings.roomTypes.map((t) => `<option value="${t.id}" ${t.id === base.type ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
    <label class="field span-2">Jihozlar (vergul bilan)<input name="equipment" value="${esc((base.equipment || []).join(', '))}" placeholder="projector, headphones"></label>
    <label class="check"><input type="checkbox" name="active" ${base.active !== false ? 'checked' : ''}> Faol</label>
  </div>
  <fieldset class="mt"><legend>Ishlash vaqtlari (availability)</legend><div data-av></div><div data-err-for="availability"></div></fieldset>`;
  const avm = availabilityMatrix({ days: c.workDays, slots: c.slots, value: base.availability });
  body.querySelector('[data-av]').appendChild(avm.el);
  openModal({
    title: isNew ? 'Yangi auditoriya' : 'Tahrirlash: ' + r.number + '-xona', body, size: 'lg',
    actions: [{ label: 'Bekor qilish' }, { label: 'Saqlash', kind: 'primary', onClick: () => {
      const f = readForm(body);
      const obj = { ...base, number: String(f.number).trim(), building: f.building.trim(), floor: f.floor, capacity: f.capacity, type: f.type, equipment: f.equipment.split(',').map((x) => x.trim()).filter(Boolean), active: f.active, availability: avm.getValue(), updatedAt: nowIso() };
      if (!showErrors(body, validateRoom(obj, store.get()))) return false;
      store.update(isNew ? `Auditoriya qo‘shildi: ${obj.number}` : `Auditoriya tahrirlandi: ${obj.number}`, (d) => {
        if (isNew) d.rooms.push({ ...obj, createdAt: nowIso() });
        else Object.assign(d.rooms.find((x) => x.id === obj.id), obj);
      });
      toastOk('Saqlandi.');
    } }],
  });
}

function deleteRoom(r) {
  const data = store.get();
  const lessons = data.schedule.lessons.filter((l) => l.roomId === r.id);
  const doDelete = (mode) => {
    let moved = 0, unsched = 0;
    store.update(`Auditoriya o‘chirildi: ${r.number}`, (d) => {
      d.rooms = d.rooms.filter((x) => x.id !== r.id);
      for (const w of d.workloads) if (w.fixedRoomId === r.id) w.fixedRoomId = null;
      const ctx = buildContext(d);
      const affected = d.schedule.lessons.filter((l) => l.roomId === r.id);
      d.schedule.lessons = d.schedule.lessons.filter((l) => l.roomId !== r.id);
      if (mode === 'move') {
        const occ = new Occupancy(ctx, d.schedule.lessons);
        for (const l of affected) {
          const wl = ctx.workloads.get(l.workloadId);
          const room = wl && candidateRooms(ctx, wl).find((x) => !checkPlacement(ctx, occ, { wl, day: l.day, slotId: l.slotId, roomId: x.id, parity: l.weekParity }, { first: true }).length);
          if (room) { l.roomId = room.id; d.schedule.lessons.push(l); occ.add(l); moved++; } else unsched++;
        }
      } else unsched = affected.length;
    });
    toast(`O‘chirildi.${moved ? ` ${moved} ta dars boshqa xonaga ko‘chdi.` : ''}${unsched ? ` ${unsched} ta dars joylashtirilmaganlarga o‘tdi.` : ''}`, { action: { label: 'Bekor qilish', onClick: () => store.undo() } });
  };
  openModal({
    title: `${r.number}-xonani o‘chirish`,
    body: lessons.length ? `<div class="alert warn">⚠️<div>Bu xonada <b>${lessons.length}</b> ta dars bor. Ular bilan nima qilamiz?</div></div>` : `<p>"${esc(r.number)}" xonasi o‘chirilsinmi?</p>`,
    actions: lessons.length ? [
      { label: 'Bekor qilish' },
      { label: 'Joylashtirilmaganlarga o‘tkazish', kind: 'danger', onClick: () => doDelete('unschedule') },
      { label: 'Boshqa bo‘sh xonaga ko‘chirish', kind: 'primary', onClick: () => doDelete('move') },
    ] : [{ label: 'Bekor qilish' }, { label: 'O‘chirish', kind: 'danger', onClick: () => doDelete('unschedule') }],
  });
}
