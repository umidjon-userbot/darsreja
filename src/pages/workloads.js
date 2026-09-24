import { store } from '../state/store.js';
import { renderCrudPage, readForm, showErrors } from '../components/crud.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { toast, ok as toastOk } from '../components/toast.js';
import { openTransferWizard } from '../components/transferWizard.js';
import { validateWorkload } from '../validation/validators.js';
import { ctx as getCtx, occ as getOcc } from '../state/selectors.js';
import { wlTargetName, wlRequired, wlStudents, roomTypeName } from '../scheduler/model.js';
import { DAYS, DISTRIBUTION, PRIORITY } from '../i18n/uz.js';
import { uid, nowIso } from '../utils/id.js';
import { esc, highlight } from '../utils/dom.js';
import { go, setParams } from '../router.js';

export function render(root, route) {
  const c = getCtx();
  const o = getOcc();
  const placed = (w) => { const p = o.wlPlaced(w.id); return p.all + p.bi; };
  const req = (w) => { const r = wlRequired(w); return r.all + r.bi; };
  renderCrudPage(root, route, {
    title: 'O‘quv yuklamasi', icon: '🧮', addLabel: 'Yuklama qo‘shish', emptyIcon: '🧮',
    subtitle: 'Fan + Guruh(lar) + O‘qituvchi + haftalik soat. Generatorning asosiy kirishi. Potok — bir nechta guruh bitta darsda.',
    emptyTitle: 'Hali yuklama yo‘q', emptyText: 'Avval guruh, o‘qituvchi va fanlarni kiriting.',
    items: () => store.get().workloads,
    searchText: (w) => [c.subjects.get(w.subjectId)?.name, wlTargetName(c, w), c.teachers.get(w.teacherId)?.name].join(' '),
    filters: [
      { key: 'teacher', label: 'O‘qituvchi', options: () => store.get().teachers.map((t) => [t.id, t.name]), test: (w, v) => w.teacherId === v },
      { key: 'group', label: 'Guruh', options: () => store.get().groups.map((g) => [g.id, g.name]), test: (w, v) => (w.target?.groupIds || []).includes(v) },
      { key: 'subject', label: 'Fan', options: () => store.get().subjects.map((s) => [s.id, s.name]), test: (w, v) => w.subjectId === v },
      { key: 'status', label: 'Holat', options: () => [['full', 'To‘liq joylashgan'], ['part', 'Yetishmaydi']], test: (w, v) => (v === 'full' ? placed(w) >= req(w) : placed(w) < req(w)) },
    ],
    columns: [
      { key: 'subject', label: 'Fan', sort: (w) => c.subjects.get(w.subjectId)?.name, render: (w, q) => `${esc(c.subjects.get(w.subjectId)?.icon || '')} <b>${highlight(c.subjects.get(w.subjectId)?.name || '?', q)}</b>` },
      { key: 'target', label: 'Guruh(lar)', sort: (w) => wlTargetName(c, w), render: (w, q) => `${highlight(wlTargetName(c, w), q)} ${w.target?.type === 'stream' ? '<span class="badge info">Potok</span>' : w.target?.type === 'subgroup' ? '<span class="badge">Kichik guruh</span>' : w.target?.type === 'elective' ? `<span class="badge primary">Tanlov · ${w.studentCount || '?'} talaba</span>` : ''}` },
      { key: 'teacher', label: 'O‘qituvchi', sort: (w) => c.teachers.get(w.teacherId)?.name, render: (w, q) => highlight(c.teachers.get(w.teacherId)?.name || '— yo‘q —', q) },
      { key: 'lessons', label: 'Haftalik', num: true, sort: req, render: (w) => `${w.lessonsPerWeek}${Number(w.biweeklyLessons) ? ` + ${w.biweeklyLessons} <span class="muted" title="2 haftada 1 (toq/juft)">T/J</span>` : ''}${Number(w.durationSlots) > 1 ? ` <span class="badge">${w.durationSlots} slot</span>` : ''}` },
      { key: 'placed', label: 'Joylashtirildi', num: true, sort: (w) => placed(w) - req(w), render: (w) => { const p = placed(w), r = req(w); return p >= r ? `<span class="badge ok">✅ ${p}/${r}</span>` : `<span class="badge warn">⚠️ ${p}/${r}</span>`; } },
      { key: 'room', label: 'Xona turi', sort: (w) => w.roomType || c.subjects.get(w.subjectId)?.roomType, render: (w) => esc(roomTypeName(c, w.roomType || c.subjects.get(w.subjectId)?.roomType || 'regular')) },
    ],
    extraActions: () => `<button class="btn xs" data-x="sub" title="O‘qituvchini almashtirish" aria-label="O‘qituvchini almashtirish">👥</button><button class="btn xs" data-x="view" title="Jadvalda ko‘rish" aria-label="Jadvalda ko‘rish">🗓️</button>`,
    onExtra: (a, w) => {
      if (a === 'sub') openTransferWizard({ workloadIds: [w.id] });
      if (a === 'view') go('schedule', { subject: w.subjectId, group: w.target?.groupIds?.[0] });
    },
    onAdd: () => openWorkloadForm(null),
    onEdit: (w) => openWorkloadForm(w),
    onToggle: (w) => store.update('Yuklama holati o‘zgardi', (d) => { const x = d.workloads.find((y) => y.id === w.id); x.active = x.active === false; }),
    onDelete: async (w) => {
      const n = store.get().schedule.lessons.filter((l) => l.workloadId === w.id).length;
      if (!(await confirmDialog({ title: 'Yuklamani o‘chirish', message: `Bu yuklama${n ? ` va uning ${n} ta darsi` : ''} o‘chirilsinmi?`, confirmLabel: 'O‘chirish', danger: true }))) return;
      store.update('Yuklama o‘chirildi', (d) => { d.workloads = d.workloads.filter((x) => x.id !== w.id); d.schedule.lessons = d.schedule.lessons.filter((l) => l.workloadId !== w.id); });
      toast('O‘chirildi.', { action: { label: 'Bekor qilish', onClick: () => store.undo() } });
    },
  });
  if (route.params.add !== undefined) {
    setParams({ add: '' });
    openWorkloadForm(null, { subjectId: route.params.add });
  }
}

export function openWorkloadForm(w, preset = {}) {
  const data = store.get();
  const c = getCtx();
  const isNew = !w;
  const base = w ? JSON.parse(JSON.stringify(w)) : {
    id: uid('wl'), subjectId: preset.subjectId || '', teacherId: '', target: { type: 'group', groupIds: [], subgroupId: null },
    lessonsPerWeek: 2, biweeklyLessons: 0, durationSlots: data.settings.defaultDurationSlots || 1, distribution: 'spread', customDistribution: null,
    roomType: null, fixedRoomId: null, preference: { days: [], slots: [], priority: 'medium' }, active: true,
  };
  if (!data.subjects.length || !data.groups.length || !data.teachers.length) {
    toast('Avval kamida bitta fan, guruh va o‘qituvchi qo‘shing.', { type: 'err' });
    return;
  }
  const body = document.createElement('div');
  const tOpts = (subjectId) => {
    const q = data.teachers.filter((t) => t.subjectIds?.includes(subjectId));
    const other = data.teachers.filter((t) => !t.subjectIds?.includes(subjectId));
    return `<option value="">— tanlang —</option>${q.length ? `<optgroup label="Bu fanni o‘tadi">${q.map((t) => `<option value="${t.id}" ${t.id === base.teacherId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</optgroup>` : ''}<optgroup label="Boshqalar">${other.map((t) => `<option value="${t.id}" ${t.id === base.teacherId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</optgroup>`;
  };
  body.innerHTML = `
    <div class="form-grid">
      <label class="field span-2">Fan *<select name="subjectId"><option value="">— tanlang —</option>${data.subjects.map((s) => `<option value="${s.id}" ${s.id === base.subjectId ? 'selected' : ''}>${esc(s.icon || '')} ${esc(s.name)}</option>`).join('')}</select></label>
      <label class="field span-2">O‘qituvchi *<select name="teacherId">${tOpts(base.subjectId)}</select></label>
      <label class="field">Kimga<select name="ttype">
        <option value="group" ${base.target.type === 'group' ? 'selected' : ''}>Bitta guruh</option>
        <option value="stream" ${base.target.type === 'stream' ? 'selected' : ''}>Potok (bir nechta guruh)</option>
        <option value="subgroup" ${base.target.type === 'subgroup' ? 'selected' : ''}>Kichik guruh</option>
        <option value="elective" ${base.target.type === 'elective' ? 'selected' : ''}>Tanlov fani (blok)</option></select></label>
      <div class="span-all" data-target></div>
      <label class="field">Haftalik darslar *<input name="lessonsPerWeek" type="number" min="0" value="${base.lessonsPerWeek}"></label>
      <label class="field">+ 2 haftada 1 (toq/juft)<input name="biweeklyLessons" type="number" min="0" value="${base.biweeklyLessons || 0}"></label>
      <label class="field">Davomiylik<select name="durationSlots">${[1, 2, 3].map((n) => `<option value="${n}" ${Number(base.durationSlots) === n ? 'selected' : ''}>${n} slot</option>`).join('')}</select><span class="hint">2 slot — ketma-ket, bitta xonada</span></label>
      <label class="field">Taqsimot<select name="distribution">${Object.entries(DISTRIBUTION).map(([k, v]) => `<option value="${k}" ${k === base.distribution ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field" data-custom>Maxsus taqsimot<input name="customDistribution" value="${esc((base.customDistribution || []).join(','))}" placeholder="2,1,1"></label>
      <label class="field">Xona turi (ixtiyoriy)<select name="roomType"><option value="">Fandagidek</option>${data.settings.roomTypes.map((t) => `<option value="${t.id}" ${t.id === base.roomType ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
      <label class="field">Belgilangan xona<select name="fixedRoomId"><option value="">— yo‘q —</option>${data.rooms.map((r) => `<option value="${r.id}" ${r.id === base.fixedRoomId ? 'selected' : ''}>${esc(r.number)} (${r.capacity})</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" name="active" ${base.active !== false ? 'checked' : ''}> Faol</label>
    </div>
    <fieldset class="mt"><legend>Dars afzalligi (soft)</legend>
      <div class="multi" style="margin-bottom:8px">${c.workDays.map((d) => `<label><input type="checkbox" data-multi name="prefDays" value="${d}" ${base.preference?.days?.includes(d) ? 'checked' : ''}> ${DAYS[d]}</label>`).join('')}</div>
      <div class="multi" style="margin-bottom:8px">${c.slots.map((s) => `<label><input type="checkbox" data-multi name="prefSlots" value="${s.id}" ${base.preference?.slots?.includes(s.id) ? 'checked' : ''}> ${esc(s.name)} ${s.start}</label>`).join('')}</div>
      <label class="field" style="max-width:220px">Muhimlik<select name="priority">${Object.entries(PRIORITY).map(([k, v]) => `<option value="${k}" ${k === (base.preference?.priority || 'medium') ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    </fieldset>
    <div data-warn></div>`;
  const drawTarget = () => {
    const type = body.querySelector('[name=ttype]').value;
    const sel = base.target.groupIds || [];
    const el = body.querySelector('[data-target]');
    if (type === 'elective') {
      const blocks = [...new Set(data.workloads.filter((w) => w.target?.type === 'elective').map((w) => w.target.electiveBlock).filter(Boolean))];
      el.innerHTML = `<div class="alert info">ℹ️<div><b>Tanlov bloki:</b> bir blokdagi fanlar (variantlar) <b>bir vaqtda</b> o‘tadi — har bir talaba bittasiga boradi. Har bir variant uchun alohida yuklama yarating va bir xil blok nomini yozing.</div></div>
        <div class="form-grid"><label class="field">Blok nomi *<input name="electiveBlock" list="blk-list" value="${esc(base.target.electiveBlock || '')}" placeholder="Tanlov-1 (3-kurs)"><datalist id="blk-list">${blocks.map((b) => `<option value="${esc(b)}">`).join('')}</datalist></label>
        <label class="field">Yozilgan talabalar *<input name="studentCount" type="number" min="1" value="${esc(base.studentCount || '')}"></label></div>
        <div class="field" data-err-for="groupIds"><span style="font-weight:550;font-size:13px;color:var(--text-2)">Qatnashuvchi guruhlar *</span><div class="multi">${data.groups.map((g) => `<label><input type="checkbox" data-multi name="groupIds" value="${g.id}" ${sel.includes(g.id) ? 'checked' : ''}> ${esc(g.name)}</label>`).join('')}</div></div>`;
    } else if (type === 'stream') {
      el.innerHTML = `<div class="field" data-err-for="groupIds"><span style="font-weight:550;font-size:13px;color:var(--text-2)">Guruhlar (kamida 2) *</span><div class="multi">${data.groups.map((g) => `<label><input type="checkbox" data-multi name="groupIds" value="${g.id}" ${sel.includes(g.id) ? 'checked' : ''}> ${esc(g.name)} <span class="muted">(${g.studentCount})</span></label>`).join('')}</div></div>`;
    } else {
      el.innerHTML = `<div class="form-grid"><label class="field">Guruh *<select name="groupIds"><option value="">— tanlang —</option>${data.groups.map((g) => `<option value="${g.id}" ${sel[0] === g.id ? 'selected' : ''}>${esc(g.name)} (${g.studentCount})</option>`).join('')}</select></label>
        ${type === 'subgroup' ? `<label class="field">Kichik guruh *<select name="subgroupId"></select></label>` : ''}</div>`;
      if (type === 'subgroup') {
        const fill = () => {
          const g = data.groups.find((x) => x.id === body.querySelector('select[name=groupIds]').value);
          body.querySelector('[name=subgroupId]').innerHTML = (g?.subgroups || []).map((s) => `<option value="${s.id}" ${s.id === base.target.subgroupId ? 'selected' : ''}>${esc(s.name)} (${s.studentCount})</option>`).join('') || '<option value="">Bu guruhda kichik guruh yo‘q</option>';
        };
        fill();
        body.querySelector('select[name=groupIds]').addEventListener('change', fill);
      }
    }
  };
  drawTarget();
  const toggleCustom = () => { body.querySelector('[data-custom]').style.display = body.querySelector('[name=distribution]').value === 'custom' ? '' : 'none'; };
  toggleCustom();
  body.addEventListener('change', (e) => {
    if (e.target.name === 'ttype') {
      const cur = readForm(body);
      base.target.groupIds = Array.isArray(cur.groupIds) ? cur.groupIds : cur.groupIds ? [cur.groupIds] : [];
      drawTarget();
    }
    if (e.target.name === 'subjectId') body.querySelector('[name=teacherId]').innerHTML = tOpts(e.target.value);
    if (e.target.name === 'distribution') toggleCustom();
  });
  const collect = () => {
    const f = readForm(body);
    const type = f.ttype;
    const groupIds = Array.isArray(f.groupIds) ? f.groupIds : f.groupIds ? [f.groupIds] : [];
    return {
      ...base, subjectId: f.subjectId, teacherId: f.teacherId,
      target: { type, groupIds, subgroupId: type === 'subgroup' ? f.subgroupId || null : null, ...(type === 'elective' ? { electiveBlock: String(f.electiveBlock || '').trim() } : {}) },
      studentCount: type === 'elective' ? Number(f.studentCount) || null : null,
      lessonsPerWeek: f.lessonsPerWeek === '' ? 0 : f.lessonsPerWeek, biweeklyLessons: f.biweeklyLessons === '' ? 0 : f.biweeklyLessons,
      durationSlots: Number(f.durationSlots), distribution: f.distribution,
      customDistribution: f.distribution === 'custom' ? String(f.customDistribution || '').split(/[,\s]+/).filter(Boolean).map(Number) : null,
      roomType: f.roomType || null, fixedRoomId: f.fixedRoomId || null,
      preference: { days: f.prefDays || [], slots: f.prefSlots || [], priority: f.priority }, active: f.active, updatedAt: nowIso(),
    };
  };
  openModal({
    title: isNew ? 'Yangi o‘quv yuklamasi' : 'Yuklamani tahrirlash', body, size: 'lg',
    actions: [{ label: 'Bekor qilish' }, { label: 'Saqlash', kind: 'primary', onClick: () => {
      const obj = collect();
      const errs = validateWorkload(obj, store.get());
      const warn = errs._warn;
      delete errs._warn;
      const need = wlStudents(getCtx(), obj);
      if (!Object.keys(errs).length && obj.target.groupIds.length && !store.get().rooms.some((r) => r.active !== false && Number(r.capacity) >= need)) errs.groupIds = `${need} talabaga yetadigan xona yo‘q (eng katta: ${Math.max(0, ...store.get().rooms.map((r) => r.capacity))}).`;
      if (!showErrors(body, errs)) return false;
      store.update(isNew ? 'Yuklama qo‘shildi' : 'Yuklama tahrirlandi', (d) => {
        if (isNew) d.workloads.push({ ...obj, createdAt: nowIso() });
        else {
          const x = d.workloads.find((y) => y.id === obj.id);
          const durChanged = Number(x.durationSlots) !== Number(obj.durationSlots) || JSON.stringify(x.target) !== JSON.stringify(obj.target);
          Object.assign(x, obj);
          if (durChanged) d.schedule.lessons = d.schedule.lessons.filter((l) => l.workloadId !== obj.id || l.locked);
        }
      });
      toastOk('Saqlandi.' + (warn ? ' ⚠️ ' + warn : ''));
    } }],
  });
}
