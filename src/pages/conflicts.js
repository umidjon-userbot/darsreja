// Konfliktlar: 🔴 Kritik · 🟠 Ogohlantirish · 🟢 Hal qilingan
import { store } from '../state/store.js';
import { conflicts, ctx as getCtx } from '../state/selectors.js';
import { bestRoomFor, updateLesson } from '../state/actions.js';
import { openTransferWizard } from '../components/transferWizard.js';
import { reconcileSubstitutions } from '../substitution/substitutionService.js';
import { toast, ok as toastOk, err as toastErr } from '../components/toast.js';
import { emptyState } from '../components/emptyState.js';
import { HARD_CODES, SOFT_CODES, DAYS } from '../i18n/uz.js';
import { esc } from '../utils/dom.js';
import { go, setParams } from '../router.js';
import { fmtHuman } from '../utils/date.js';

export function render(root, route) {
  const p = route.params;
  const tab = p.tab || 'critical';
  const data = store.get();
  const c = getCtx();
  const all = conflicts();
  const f = { teacher: p.teacher || '', group: p.group || '', room: p.room || '', subject: p.subject || '', day: p.day || '', code: p.code || '' };
  const crit = all.filter((x) => x.severity === 'critical');
  const warn = all.filter((x) => x.severity === 'warning');
  const resolved = data.conflictLog?.resolved || [];
  const base = tab === 'critical' ? crit : tab === 'warning' ? warn : [];
  const list = base.filter((x) => (!f.teacher || x.teacherIds.includes(f.teacher)) && (!f.group || x.groupIds.includes(f.group)) && (!f.room || x.roomIds.includes(f.room)) && (!f.subject || x.subjectIds.includes(f.subject)) && (!f.day || x.day === f.day) && (!f.code || x.code === f.code));
  const codes = [...new Set(base.map((x) => x.code))].sort();
  const sel = (k, items, label) => `<select data-f="${k}" aria-label="${label}"><option value="">${label}: barchasi</option>${items.map(([v, n]) => `<option value="${v}" ${f[k] === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;

  root.innerHTML = `
    <div class="page-head"><div><h1>🚨 Konfliktlar</h1><p>Hard konfliktlar generator tomonidan hech qachon yaratilmaydi — ular qo‘lda kiritish, import yoki ma'lumot o‘zgarishidan paydo bo‘ladi.</p></div></div>
    <div class="tabs" role="tablist">
      <button role="tab" class="${tab === 'critical' ? 'active' : ''}" data-tab="critical">🔴 Kritik (${crit.length})</button>
      <button role="tab" class="${tab === 'warning' ? 'active' : ''}" data-tab="warning">🟠 Ogohlantirish (${warn.length})</button>
      <button role="tab" class="${tab === 'resolved' ? 'active' : ''}" data-tab="resolved">🟢 Hal qilingan (${resolved.length})</button>
    </div>
    ${tab !== 'resolved' ? `<div class="toolbar">
      ${sel('teacher', data.teachers.map((t) => [t.id, t.name]), 'O‘qituvchi')}
      ${sel('group', data.groups.map((g) => [g.id, g.name]), 'Guruh')}
      ${sel('room', data.rooms.map((r) => [r.id, r.number]), 'Xona')}
      ${sel('subject', data.subjects.map((s) => [s.id, s.name]), 'Fan')}
      ${sel('day', c.workDays.map((d) => [d, DAYS[d]]), 'Kun')}
      ${sel('code', codes.map((k) => [k, `${k} · ${HARD_CODES[k] || SOFT_CODES[k] || ''}`]), 'Turi')}
      <span class="muted">${list.length} ta</span></div>` : ''}
    <div data-list></div>`;
  const el = root.querySelector('[data-list]');
  if (tab === 'resolved') {
    el.innerHTML = resolved.length ? `<div class="table-wrap"><table class="t responsive"><thead><tr><th>Holat</th><th>Konflikt</th><th>Hal qilingan</th></tr></thead><tbody>${resolved.map((r) => `<tr><td data-label="Holat">🟢 Hal qilindi</td><td data-label="Konflikt"><b>${esc(r.title || r.code)}</b><br>${esc(r.msg)}</td><td data-label="Vaqt">${new Date(r.resolvedAt).toLocaleString('uz-UZ')}</td></tr>`).join('')}</tbody></table></div>` : `<div class="card">${emptyState({ icon: '🟢', title: 'Hali hal qilingan konfliktlar yo‘q' })}</div>`;
  } else if (!list.length) {
    el.innerHTML = `<div class="card">${emptyState({ icon: tab === 'critical' ? '✅' : '🎉', title: tab === 'critical' ? 'Kritik konfliktlar yo‘q' : 'Ogohlantirishlar yo‘q', text: tab === 'critical' ? 'Jadval barcha hard cheklovlarni bajaradi.' : '' })}</div>`;
  } else {
    el.innerHTML = `<div class="table-wrap"><table class="t responsive"><thead><tr><th>Daraja</th><th>Turi</th><th>Tavsif</th><th>Qachon</th><th class="num">Amallar</th></tr></thead><tbody>
      ${list.slice(0, 400).map((x, i) => `<tr data-i="${i}" class="clickable">
        <td data-label="Daraja">${x.severity === 'critical' ? '🔴 Kritik' : '🟠 Ogohlantirish'}</td>
        <td data-label="Turi"><span class="mono">${esc(x.code)}</span> ${esc(x.title || '')}</td>
        <td data-label="Tavsif">${esc(x.msg)}</td>
        <td data-label="Qachon">${x.date ? fmtHuman(x.date) + ' ' : ''}${x.day ? DAYS[x.day] : '—'}${x.slotId ? ', ' + esc(c.slots[c.slotIdx.get(x.slotId)]?.name || '') : ''}</td>
        <td class="actions">${fixButtons(x)}${x.day && x.slotId ? `<button class="btn xs" data-show="${i}">📍 Jadvalda</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>${list.length > 400 ? `<p class="muted">Birinchi 400 tasi ko‘rsatildi.</p>` : ''}`;
  }

  root.querySelectorAll('[data-f]').forEach((s) => s.addEventListener('change', () => setParams({ [s.dataset.f]: s.value }, false)));
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]')?.dataset.tab;
    if (t) return setParams({ tab: t }, false);
    const fix = e.target.closest('[data-fix]');
    if (fix) {
      e.stopPropagation();
      return doFix(fix.dataset.fix, list[+fix.dataset.idx]);
    }
    const show = e.target.closest('[data-show]') || e.target.closest('tr[data-i]');
    if (show) {
      const x = list[+(show.dataset.show ?? show.dataset.i)];
      if (!x || !x.day || !x.slotId) return;
      const params = { hl: x.day + '|' + x.slotId };
      if (x.date) { params.mode = 'date'; params.week = x.date; }
      if (x.teacherIds.length === 1 && ['H1', 'H10', 'H11', 'H12', 'H18'].includes(x.code)) Object.assign(params, { view: 'teacher', teacher: x.teacherIds[0] });
      else if (x.code === 'H3') Object.assign(params, { view: 'room', room: x.roomIds[0] });
      else if (x.groupIds.length) Object.assign(params, { view: 'group', group: x.groupIds[0] });
      go('schedule', params);
    }
  });
  function fixButtons(x) {
    const i = list.indexOf(x);
    const b = [];
    const unlocked = x.lessonIds.filter((id) => !data.schedule.lessons.find((l) => l.id === id)?.locked);
    if (['H3', 'H6', 'H8', 'H9'].includes(x.code) && unlocked.length) b.push(`<button class="btn xs" data-fix="room" data-idx="${i}">🚪 Boshqa bo‘sh xona</button>`);
    if (x.severity === 'critical' && x.code !== 'H18' && x.lessonIds.length && unlocked.length) b.push(`<button class="btn xs" data-fix="unsched" data-idx="${i}">🧩 Joylashtirilmaganga</button>`);
    if (x.code === 'H18' && x.date) b.push(`<button class="btn xs" data-fix="subst" data-idx="${i}">👥 Almashtiruvchi</button> <button class="btn xs" data-fix="recalc" data-idx="${i}">🔄 Qayta hisoblash</button>`);
    if (x.code === 'UNDER') b.push(`<button class="btn xs" data-fix="advisor" data-idx="${i}">💡 Maslahat</button>`);
    return b.join(' ');
  }
  function doFix(kind, x) {
    if (!x) return;
    const d = store.get();
    const lessons = x.lessonIds.map((id) => d.schedule.lessons.find((l) => l.id === id)).filter((l) => l && !l.locked);
    if (kind === 'room') {
      for (const l of lessons) {
        const r = bestRoomFor(d, l, [l.id]);
        if (r) {
          try { updateLesson(l.id, { roomId: r }); toastOk(`Xona ${c.rooms.get(r)?.number}-ga almashtirildi.`); return; } catch { /* keyingisi */ }
        }
      }
      toastErr('Bu vaqtda mos bo‘sh xona topilmadi.');
    }
    if (kind === 'unsched') {
      const l = lessons[lessons.length - 1];
      if (!l) return;
      store.update('Dars joylashtirilmaganga o‘tkazildi', (dd) => { dd.schedule.lessons = dd.schedule.lessons.filter((y) => y.id !== l.id); });
      toast('Dars joylashtirilmaganlarga o‘tkazildi.', { action: { label: 'Bekor qilish', onClick: () => store.undo() } });
    }
    if (kind === 'subst') {
      const l = d.schedule.lessons.find((y) => y.id === x.lessonIds[0]);
      if (l) openTransferWizard({ workloadIds: [l.workloadId], mode: 'temporary', startDate: x.date, endDate: x.date });
    }
    if (kind === 'advisor') go('advisor');
    if (kind === 'recalc') {
      let n = 0;
      store.update('Almashtirishlar qayta hisoblandi', (dd) => { n = reconcileSubstitutions(dd); }, { reconcile: false });
      toastOk(`${n} ta almashtirish joriy jadvalga moslandi.`);
    }
  }
}
