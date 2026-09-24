// Dars jadvali: grid, filterlar, ko‘rinishlar, drag & drop, swap, qo‘lda qo‘shish, sana rejimi
import { store } from '../state/store.js';
import { ctx as getCtx, lessonVM, conflictLessonIds, dateConflictKeys } from '../state/selectors.js';
import { moveLesson, swapLessons, previewMove, ConstraintError } from '../state/actions.js';
import { openLessonForm, openLessonMenu } from '../components/lessonDialogs.js';
import { openTransferWizard } from '../components/transferWizard.js';
import { lessonCardHtml } from '../components/lessonCard.js';
import { emptyState } from '../components/emptyState.js';
import { toast, ok as toastOk, err as toastErr } from '../components/toast.js';
import { openPrintDialog } from '../services/printService.js';
import { Occupancy } from '../scheduler/constraintChecker.js';
import { buildContext, wlGroupIds, wlDuration } from '../scheduler/model.js';
import { occurrencesOn } from '../substitution/calendarResolver.js';
import { DAYS, DAYS_SHORT, PARITY } from '../i18n/uz.js';
import { esc } from '../utils/dom.js';
import { go, setParams, rerender } from '../router.js';
import { draftDiff, versionForDate } from '../analysis/versions.js';
import { openPublishDialog } from './versions.js';
import { todayStr, mondayOf, addDays, fmtHuman, dayKeyOf } from '../utils/date.js';

let ui = { swapFrom: null, pickFor: null, mobileDay: null };

export function render(root, route) {
  const p = route.params;
  const data = store.get();
  const c = getCtx();
  const view = p.view || 'all';
  const mode = p.mode || 'template';
  const week = p.week || mondayOf(todayStr());
  const f = { group: p.group || '', teacher: p.teacher || '', subject: p.subject || '', room: p.room || '', day: p.day || '', parity: p.parity || '' };
  if (view === 'group' && !f.group) f.group = data.groups[0]?.id || '';
  if (view === 'teacher' && !f.teacher) f.teacher = data.teachers[0]?.id || '';
  if (view === 'room' && !f.room) f.room = data.rooms[0]?.id || '';
  const isMobile = window.matchMedia('(max-width: 760px)').matches;
  let days = c.workDays.filter((d) => !f.day || d === f.day);
  if (isMobile && !f.day) {
    if (!ui.mobileDay || !days.includes(ui.mobileDay)) ui.mobileDay = days.includes(dayKeyOf(todayStr())) ? dayKeyOf(todayStr()) : days[0];
    days = [ui.mobileDay];
  }
  const sel = (name, list, val, label) => `<select data-f="${name}" aria-label="${label}"><option value="">${label}: barchasi</option>${list.map(([id, n]) => `<option value="${id}" ${id === val ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  const sortN = (arr, k = 'name') => [...arr].sort((a, b) => String(a[k]).localeCompare(String(b[k])));

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Dars jadvali</h1><p>${mode === 'template' ? 'Haftalik shablon (ishchi qoralama)' : `Hafta: ${fmtHuman(week)} – ${fmtHuman(addDays(week, 6))} · kuchdagi versiya: ${esc(versionForDate(data, week)?.name || 'qoralama')}`} · ${data.schedule.lessons.length} ta dars
        ${(() => { const df = draftDiff(data); return df === null ? ' · <a href="#/versions">📢 hali e\'lon qilinmagan</a>' : df.length ? ` · <a href="#/versions" class="badge warn">📢 ${df.length} ta o‘zgarish e'lon qilinmagan</a>` : ' · <span class="badge ok">e\'lon qilingan</span>'; })()}</p></div>
      <div class="btn-row">
        <button class="btn primary" data-act="add">＋ Dars qo‘shish</button>
        <button class="btn" data-act="print">🖨️ Chop etish</button>
        <button class="btn" data-act="gen">⚙️ Avtomatik tuzish</button>
        <button class="btn" data-act="publish">📢 E'lon qilish</button>
      </div>
    </div>
    <div class="toolbar">
      <div class="seg" role="tablist" aria-label="Ko‘rinish">
        ${[['all', 'Umumiy'], ['group', 'Guruh'], ['teacher', 'O‘qituvchi'], ['room', 'Auditoriya']].map(([k, n]) => `<button role="tab" aria-selected="${view === k}" class="${view === k ? 'active' : ''}" data-view="${k}">${n}</button>`).join('')}
      </div>
      <div class="seg" aria-label="Rejim">
        <button class="${mode === 'template' ? 'active' : ''}" data-mode="template">Shablon</button>
        <button class="${mode === 'date' ? 'active' : ''}" data-mode="date">Sana bo‘yicha</button>
      </div>
      ${mode === 'date' ? `<div class="btn-row"><button class="btn sm" data-week="-7" aria-label="Oldingi hafta">←</button><button class="btn sm" data-week="now">Bu hafta</button><button class="btn sm" data-week="7" aria-label="Keyingi hafta">→</button></div>` : ''}
    </div>
    <div class="toolbar">
      ${sel('group', sortN(data.groups).map((g) => [g.id, g.name]), f.group, 'Guruh')}
      ${sel('teacher', sortN(data.teachers).map((t) => [t.id, t.name]), f.teacher, 'O‘qituvchi')}
      ${sel('subject', sortN(data.subjects).map((s) => [s.id, s.name]), f.subject, 'Fan')}
      ${sel('room', sortN(data.rooms, 'number').map((r) => [r.id, r.number + '-xona']), f.room, 'Auditoriya')}
      ${sel('day', c.workDays.map((d) => [d, DAYS[d]]), f.day, 'Kun')}
      ${sel('parity', [['odd', PARITY.odd], ['even', PARITY.even]], f.parity, 'Hafta turi')}
      <button class="btn sm ghost" data-act="clear">Filtrlarni tozalash</button>
    </div>
    ${ui.swapFrom ? `<div class="alert info">🔁<div>Swap: ikkinchi darsni tanlang. <button class="btn xs" data-act="cancel-mode">Bekor qilish</button></div></div>` : ''}
    ${ui.pickFor ? `<div class="alert info">↔️<div>Ko‘chirish: yangi katakni tanlang (yashil — mumkin, qizil — mumkin emas). <button class="btn xs" data-act="cancel-mode">Bekor qilish (Esc)</button></div></div>` : ''}
    ${isMobile && !f.day ? `<div class="tabs day-tabs" role="tablist">${c.workDays.map((d) => `<button role="tab" class="${d === ui.mobileDay ? 'active' : ''}" data-mday="${d}">${DAYS_SHORT[d]}</button>`).join('')}</div>` : ''}
    <div data-grid></div>`;

  const grid = root.querySelector('[data-grid]');
  if (!c.slots.length || !c.workDays.length) {
    grid.innerHTML = emptyState({ icon: '🕒', title: 'Vaqt slotlari yoki ish kunlari yo‘q', actionHtml: '<a class="btn primary" href="#/timeslots">Vaqtlarni sozlash</a>' });
    return;
  }

  // Ko‘rsatiladigan darslar
  const conflictIds = conflictLessonIds();
  const dateKeys = dateConflictKeys();
  const match = (vm) => {
    if (f.group && !vm.groupIds.includes(f.group)) return false;
    if (f.subject && vm.wl?.subjectId !== f.subject) return false;
    if (f.room && vm.lesson.roomId !== f.room) return false;
    if (f.parity && vm.lesson.weekParity !== 'all' && vm.lesson.weekParity !== f.parity) return false;
    return true;
  };
  const cellItems = new Map(); // day|slot -> html[]
  const push = (k, html) => { if (!cellItems.has(k)) cellItems.set(k, []); cellItems.get(k).push(html); };
  const dates = {};
  const holidays = {};
  if (mode === 'template') {
    for (const l of data.schedule.lessons) {
      const vm = lessonVM(l, c);
      if (!match(vm)) continue;
      if (f.teacher && vm.wl?.teacherId !== f.teacher) continue;
      push(l.day + '|' + l.slotId, lessonCardHtml(vm, { conflict: conflictIds.has(l.id), selected: ui.swapFrom === l.id || ui.pickFor === l.id }));
      const si = c.slotIdx.get(l.slotId);
      for (let k = 1; k < vm.dur; k++) if (c.slots[si + k]) push(l.day + '|' + c.slots[si + k].id, lessonCardHtml(vm, { cont: true }));
    }
  } else {
    for (let i = 0; i < 7; i++) {
      const date = addDays(week, i);
      const dk = dayKeyOf(date);
      dates[dk] = date;
      const res = occurrencesOn(data, date, c);
      if (res.holiday) holidays[dk] = res.holiday.name;
      else if (res.outside) holidays[dk] = 'Semestrdan tashqari';
      for (const o of res.items) {
        const vm = lessonVM(o.lesson, c);
        if (!match(vm)) continue;
        const isSub = o.teacherId !== o.originalTeacherId;
        if (f.teacher && o.teacherId !== f.teacher && o.originalTeacherId !== f.teacher) continue;
        const dim = f.teacher && isSub && o.originalTeacherId === f.teacher;
        const subst = isSub ? { name: c.teachers.get(o.teacherId)?.name || '?', orig: c.teachers.get(o.originalTeacherId)?.name || '?' } : null;
        const room = c.rooms.get(o.roomId);
        const vm2 = { ...vm, room };
        push(dk + '|' + o.slotId, lessonCardHtml(vm2, { conflict: conflictIds.has(o.lesson.id) || dateKeys.has(date + '|' + o.lesson.id) || !!o.eventConflict, status: o.status, subst, dim, date, event: o.event || o.eventConflict }));
      }
      for (const ev of res.events || []) {
        if (f.teacher && !(ev.teacherIds || []).includes(f.teacher)) continue;
        if (f.group && !(ev.groupIds || []).includes(f.group)) continue;
        if (f.room && !(ev.roomIds || []).includes(f.room)) continue;
        for (const sid of ev.slotIds || []) push(dk + '|' + sid, `<div class="lcard evcard" style="--c:var(--warning)"><div class="s">🎪 ${esc(ev.title)}</div><div class="m">${esc([...(ev.roomIds || []).map((r) => c.rooms.get(r)?.number + '-xona'), ...(ev.teacherIds || []).map((t) => c.teachers.get(t)?.name), ...(ev.groupIds || []).map((g) => c.groups.get(g)?.name)].filter(Boolean).join(', '))}</div></div>`);
      }
    }
  }

  const hl = p.hl ? p.hl.split('|') : null;
  const today = todayStr();
  const cols = `grid-template-columns: 92px repeat(${days.length}, minmax(${isMobile ? 200 : 150}px, 1fr))`;
  let html = `<div class="sgrid-wrap"><div class="sgrid ${isMobile ? 'mobile-day' : ''}" style="${cols}" role="grid" aria-label="Dars jadvali">`;
  html += `<div class="hd" role="columnheader">Vaqt</div>`;
  for (const d of days) html += `<div class="hd ${dates[d] === today ? 'today' : ''}" role="columnheader">${DAYS[d]}${dates[d] ? `<small>${fmtHuman(dates[d])}${holidays[d] ? ' · ' + esc(holidays[d]) : ''}</small>` : ''}</div>`;
  const tFilterTeacher = f.teacher ? c.teachers.get(f.teacher) : null;
  const gFilter = f.group ? c.groups.get(f.group) : null;
  const rFilter = f.room ? c.rooms.get(f.room) : null;
  for (const s of c.slots) {
    const brk = s.joinableWithNext === false ? 'brk' : '';
    html += `<div class="tm ${brk}" role="rowheader"><b>${esc(s.name)}</b>${esc(s.start)}–${esc(s.end)}</div>`;
    for (const d of days) {
      const k = d + '|' + s.id;
      let off = !!holidays[d];
      if (tFilterTeacher && !(tFilterTeacher.availability?.[d] || []).includes(s.id)) off = true;
      if (rFilter && !(rFilter.availability?.[d] || []).includes(s.id)) off = true;
      if (gFilter && gFilter.availability && Object.keys(gFilter.availability).length && !(gFilter.availability[d] || []).includes(s.id)) off = true;
      const isHl = hl && hl[0] === d && hl[1] === s.id;
      html += `<div class="cell ${brk} ${off ? 'off' : ''} ${isHl ? 'hl' : ''} ${ui.pickFor ? 'pick-target' : ''}" data-cell="${k}" role="gridcell" aria-label="${DAYS[d]}, ${esc(s.name)}${off ? ', mavjud emas' : ''}">
        ${(cellItems.get(k) || []).join('')}
        ${mode === 'template' ? `<button class="btn xs add" data-add="${k}" aria-label="${DAYS[d]} ${esc(s.name)}ga dars qo‘shish" title="Dars qo‘shish">＋</button>` : ''}
      </div>`;
    }
  }
  html += '</div></div>';
  if (!data.schedule.lessons.length) {
    html = `<div class="card mb">${emptyState({ icon: '🗓️', title: 'Jadval hali bo‘sh', text: 'Avtomatik generator bilan tuzing yoki darslarni qo‘lda qo‘shing.', actionHtml: '<a class="btn primary" href="#/generator">⚙️ Avtomatik tuzish</a> <button class="btn" data-act="add">＋ Dars qo‘shish</button>' })}</div>` + html;
  }
  grid.innerHTML = html;
  if (hl) setTimeout(() => root.querySelector('.cell.hl')?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }), 50);
  if (ui.pickFor) paintPreview(root, store.get().schedule.lessons.find((l) => l.id === ui.pickFor));

  // --- Hodisalar --------------------------------------------------------
  root.querySelector('.toolbar').addEventListener('click', (e) => {
    const v = e.target.closest('[data-view]')?.dataset.view;
    if (v) {
      const np = { view: v };
      if (v === 'all') Object.assign(np, { group: '', teacher: '', room: '' });
      setParams(np, false);
    }
    const m = e.target.closest('[data-mode]')?.dataset.mode;
    if (m) setParams({ mode: m, week: m === 'date' ? week : '' }, false);
    const w = e.target.closest('[data-week]')?.dataset.week;
    if (w) setParams({ week: w === 'now' ? mondayOf(todayStr()) : addDays(week, Number(w)) }, false);
  });
  root.querySelectorAll('[data-f]').forEach((s) => s.addEventListener('change', () => setParams({ [s.dataset.f]: s.value, hl: '' }, false)));
  root.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'add') openLessonForm({});
    if (act === 'print') openPrintDialog({ view, id: f.group || f.teacher || f.room });
    if (act === 'gen') go('generator');
    if (act === 'publish') openPublishDialog();
    if (act === 'clear') go('schedule', { view, mode, week: mode === 'date' ? week : '' });
    if (act === 'cancel-mode') { ui.swapFrom = null; ui.pickFor = null; rerender(); }
    const md = e.target.closest('[data-mday]')?.dataset.mday;
    if (md) { ui.mobileDay = md; rerender(); }
    const add = e.target.closest('[data-add]')?.dataset.add;
    if (add && !ui.pickFor) { const [d, s] = add.split('|'); openLessonForm({ day: d, slotId: s, workloadId: pickWl(f) }); }
    if (ui.pickFor) {
      const cell = e.target.closest('[data-cell]');
      if (cell) {
        const [d, s] = cell.dataset.cell.split('|');
        const id = ui.pickFor;
        ui.pickFor = null;
        doMove(id, d, s);
      }
    }
  });

  // Kartochka bosilganda / klaviatura
  const onCard = (card) => {
    const id = card.dataset.lesson;
    if (mode === 'date') {
      openLessonMenu(id, { onSubstitute: (wlId, date) => openTransferWizard({ workloadIds: [wlId], mode: 'temporary', startDate: date, endDate: date }), date: card.dataset.date });
      return;
    }
    if (ui.swapFrom && ui.swapFrom !== id) {
      const a = ui.swapFrom;
      ui.swapFrom = null;
      try { swapLessons(a, id); toastOk('🔁 Darslar almashtirildi.'); }
      catch (err) { toastErr('❌ Swap bekor qilindi: ' + (err.violations?.[0]?.msg || err.message)); rerender(); }
      return;
    }
    openLessonMenu(id, {
      onSwap: (lid) => { ui.swapFrom = lid; ui.pickFor = null; rerender(); toast('Ikkinchi darsni tanlang.'); },
      onMove: (lid) => { ui.pickFor = lid; ui.swapFrom = null; rerender(); },
      onSubstitute: (wlId) => openTransferWizard({ workloadIds: [wlId] }),
    });
  };
  grid.addEventListener('keydown', (e) => {
    const card = e.target.closest('[data-lesson]');
    if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onCard(card); }
  });
  const escHandler = (e) => { if (e.key === 'Escape' && (ui.pickFor || ui.swapFrom)) { ui.pickFor = null; ui.swapFrom = null; rerender(); } };
  document.addEventListener('keydown', escHandler);

  // Drag & drop (pointer events: sichqoncha va sensor ekran)
  let drag = null;
  grid.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('[data-lesson]');
    if (!card || e.button > 0 || ui.pickFor) return;
    drag = { card, id: card.dataset.lesson, x: e.clientX, y: e.clientY, started: false, pointerId: e.pointerId };
  });
  const onMoveEv = (e) => {
    if (!drag) return;
    if (!drag.started) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      const lesson = store.get().schedule.lessons.find((l) => l.id === drag.id);
      if (mode !== 'template' || !lesson || lesson.locked) {
        if (lesson?.locked) toast('🔒 Dars qulflangan — ko‘chirish uchun avval qulfni oching.');
        drag = null;
        return;
      }
      drag.started = true;
      drag.lesson = lesson;
      drag.card.classList.add('dragging');
      drag.ghost = drag.card.cloneNode(true);
      drag.ghost.classList.add('drag-ghost');
      document.body.appendChild(drag.ghost);
      paintPreview(root, lesson);
    }
    e.preventDefault();
    drag.ghost.style.left = e.clientX + 8 + 'px';
    drag.ghost.style.top = e.clientY + 8 + 'px';
  };
  const onUp = (e) => {
    if (!drag) return;
    const d0 = drag;
    drag = null;
    if (!d0.started) { onCard(d0.card); return; }
    d0.ghost.remove();
    d0.card.classList.remove('dragging');
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el?.closest?.('[data-cell]');
    clearPreview(root);
    if (!cell) return;
    const [d, s] = cell.dataset.cell.split('|');
    doMove(d0.id, d, s);
  };
  window.addEventListener('pointermove', onMoveEv, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  return () => {
    window.removeEventListener('pointermove', onMoveEv);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    document.removeEventListener('keydown', escHandler);
  };
}

function pickWl(f) {
  const d = store.get();
  const w = d.workloads.find((x) => x.active !== false && (!f.group || wlGroupIds(x).includes(f.group)) && (!f.teacher || x.teacherId === f.teacher) && (!f.subject || x.subjectId === f.subject));
  return f.group || f.teacher || f.subject ? w?.id : null;
}

function doMove(id, day, slotId) {
  try {
    const r = moveLesson(id, day, slotId);
    if (!r) return;
    const c = buildContext(store.get());
    toast(`✅ Ko‘chirildi${r.roomChanged ? ` (xona: ${c.rooms.get(r.roomId)?.number})` : ''}${r.soft?.length ? ` · ⚠️ ${r.soft.length} ta ogohlantirish` : ''}`, { action: { label: 'Bekor qilish', onClick: () => store.undo() } });
  } catch (e) {
    toastErr('❌ Ko‘chirish bekor qilindi: ' + (e instanceof ConstraintError ? e.violations[0].msg : e.message));
    rerender();
  }
}

function paintPreview(root, lesson) {
  if (!lesson) return;
  const data = store.get();
  const c = buildContext(data);
  const occ = new Occupancy(c, data.schedule.lessons.filter((l) => l.id !== lesson.id));
  for (const cell of root.querySelectorAll('[data-cell]')) {
    const [d, s] = cell.dataset.cell.split('|');
    const r = previewMove(data, lesson, d, s, { ctx: c, occ });
    cell.classList.add(r.state === 'ok' ? 'drop-ok' : r.state === 'soft' ? 'drop-soft' : 'drop-bad');
    cell.title = r.msg;
    const ico = document.createElement('span');
    ico.className = 'drop-ico';
    ico.textContent = r.state === 'ok' ? '✅' : r.state === 'soft' ? '⚠️' : '❌';
    ico.setAttribute('aria-hidden', 'true');
    cell.appendChild(ico);
  }
}

function clearPreview(root) {
  for (const cell of root.querySelectorAll('[data-cell]')) {
    cell.classList.remove('drop-ok', 'drop-soft', 'drop-bad');
    cell.removeAttribute('title');
    cell.querySelector('.drop-ico')?.remove();
  }
}

export { wlDuration };
