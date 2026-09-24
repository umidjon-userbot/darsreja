// ⭐ Fanni boshqa o‘qituvchiga o‘tkazish ustasi (doimiy yoki vaqtincha) va yo‘qlik dialogi
import { openModal } from './modal.js';
import { toast, ok as toastOk, err as toastErr } from './toast.js';
import { store } from '../state/store.js';
import { ctx as getCtx } from '../state/selectors.js';
import { rankTemporaryCandidates, rankPermanentCandidates } from '../substitution/candidates.js';
import { planTemporary, applyTemporary, suggestForAbsence, occKey } from '../substitution/substitutionService.js';
import { applyPermanentTransfer } from '../substitution/transferService.js';
import { checkAll } from '../scheduler/conflicts.js';
import { buildContext, wlLabel, slotName, dayName, wlGroupIds } from '../scheduler/model.js';
import { Occupancy } from '../scheduler/constraintChecker.js';
import { ABSENCE_REASONS, DAYS } from '../i18n/uz.js';
import { esc } from '../utils/dom.js';
import { todayStr, addDays, fmtHuman, isValidDate } from '../utils/date.js';
import { clone, uid } from '../utils/id.js';
import { go } from '../router.js';

const STEPS = ['Nimani', 'Turi', 'Kimga', 'Mos kelmaganlar', 'Oldindan ko‘rish'];

export function openTransferWizard({ workloadIds = [], fromTeacherId = null, mode = null, startDate = null, endDate = null } = {}) {
  const data = store.get();
  const c = getCtx();
  const first = c.workloads.get(workloadIds[0]);
  const teacherId = fromTeacherId || first?.teacherId;
  if (!teacherId) return toastErr('Yuklama topilmadi.');
  const teacherWls = data.workloads.filter((w) => w.teacherId === teacherId);
  const today = todayStr();
  const st = {
    step: 0,
    wlIds: new Set(workloadIds.filter((id) => c.workloads.get(id)?.teacherId === teacherId)),
    groupIds: {},
    mode: mode || 'temporary',
    startDate: startDate || today,
    endDate: endDate || addDays(today, 6),
    effectiveDate: today,
    reason: 'sick', note: '', permReason: '',
    to: null, includeUnqualified: !!data.settings.substitution?.showUnqualified,
    strategy: 'move', permStrategy: 'auto', overrides: {},
    cands: null, plan: null, preview: null,
  };
  for (const id of st.wlIds) st.groupIds[id] = new Set(wlGroupIds(c.workloads.get(id)));
  const tName = c.teachers.get(teacherId)?.name || '?';
  const body = document.createElement('div');
  const m = openModal({ title: `O‘qituvchini almashtirish — ${tName}`, body, size: 'lg', actions: [] });

  const draw = () => {
    const steps = `<div class="wizard-steps" aria-label="Qadamlar">${STEPS.map((s, i) => `<span class="${i === st.step ? 'cur' : i < st.step ? 'done' : ''}">${i + 1}. ${s}</span>`).join('')}</div>`;
    let html = '';
    if (st.step === 0) {
      html = `<h3>Qaysi yuklama(lar)?</h3><p class="muted">${esc(tName)}ning yuklamalari. Bir nechtasini birdan tanlash mumkin.</p>
        ${teacherWls.map((w) => {
          const on = st.wlIds.has(w.id);
          const n = data.schedule.lessons.filter((l) => l.workloadId === w.id).length;
          const gids = wlGroupIds(w);
          return `<div class="cand ${on ? 'sel' : ''}"><label class="check grow"><input type="checkbox" data-wl="${w.id}" ${on ? 'checked' : ''}> <span><b>${esc(wlLabel(c, w))}</b><br><small>${n} ta dars jadvalda</small></span></label>
            ${gids.length > 1 && on ? `<div><small class="muted">Qisman (faqat doimiy o‘tkazishda):</small><div class="multi">${gids.map((g) => `<label><input type="checkbox" data-grp="${w.id}|${g}" ${st.groupIds[w.id]?.has(g) ? 'checked' : ''}> ${esc(c.groups.get(g)?.name)}</label>`).join('')}</div></div>` : ''}</div>`;
        }).join('')}`;
    }
    if (st.step === 1) {
      html = `<h3>O‘tkazish turi</h3>
        <div class="grid cols-2">
          <label class="cand ${st.mode === 'temporary' ? 'sel' : ''}"><input type="radio" name="mode" value="temporary" ${st.mode === 'temporary' ? 'checked' : ''}><div class="grow"><b>⏳ Vaqtincha almashtirish</b><br><small>Kasallik, ta'til, safar. Haftalik shablon o‘zgarmaydi, muddat tugagach avtomatik asl holatga qaytadi.</small></div></label>
          <label class="cand ${st.mode === 'permanent' ? 'sel' : ''}"><input type="radio" name="mode" value="permanent" ${st.mode === 'permanent' ? 'checked' : ''}><div class="grow"><b>📤 To‘liq (doimiy) o‘tkazish</b><br><small>O‘qituvchi ketdi yoki yuklama qayta taqsimlandi. Belgilangan sanadan boshlab yangi o‘qituvchiga.</small></div></label>
        </div>
        ${st.mode === 'temporary' ? `<div class="form-grid mt">
          <label class="field">Boshlanish<input type="date" data-k="startDate" value="${st.startDate}"></label>
          <label class="field">Tugash<input type="date" data-k="endDate" value="${st.endDate}"></label>
          <label class="field">Sabab<select data-k="reason">${Object.entries(ABSENCE_REASONS).map(([k, v]) => `<option value="${k}" ${k === st.reason ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label class="field span-all">Izoh<input data-k="note" value="${esc(st.note)}"></label></div>`
        : `<div class="form-grid mt">
          <label class="field">Kuchga kirish sanasi<input type="date" data-k="effectiveDate" value="${st.effectiveDate}"></label>
          <label class="field span-2">Sabab<input data-k="permReason" value="${esc(st.permReason)}" placeholder="Masalan: ishdan ketdi"></label></div>`}
        <div data-err></div>`;
    }
    if (st.step === 2) {
      const list = st.cands || [];
      html = `<h3>Kimga? — nomzodlar reytingi</h3>
        <label class="check mb"><input type="checkbox" data-unq ${st.includeUnqualified ? 'checked' : ''}> Malakasiz nomzodlarni ham ko‘rsatish (⚠️)</label>
        ${list.length ? list.map((x) => {
          const full = x.fits.length === x.total;
          const firstMiss = x.misses[0];
          return `<div class="cand ${st.to === x.teacher.id ? 'sel' : ''}" data-to="${x.teacher.id}" tabindex="0" role="radio" aria-checked="${st.to === x.teacher.id}">
            <span class="dot" style="background:${esc(x.teacher.color || '#888')};margin-top:5px"></span>
            <div class="grow"><b>${esc(x.teacher.name)}</b> ${x.qualified ? '' : '<span class="badge warn">⚠️ malakasiz</span>'}
              <div>${full ? `<span class="badge ok">${x.fits.length}/${x.total} dars ✅</span>` : `<span class="badge warn">${x.fits.length}/${x.total}</span> <small>${esc(firstMiss?.reason || '')}${x.misses.length > 1 ? ` (+${x.misses.length - 1})` : ''}</small>`}</div>
              <small class="muted">Joriy yuklama: ${x.loadUnits}/${x.maxWeekly || '∞'}${x.maxWeekly ? ` (${Math.round((x.loadUnits / x.maxWeekly) * 100)}%)` : ''}${x.newLoad !== undefined ? ` → ${x.newLoad}` : ''}${x.pref ? ` · afzal vaqtlar: ${x.pref}` : ''}</small></div></div>`;
        }).join('') : '<div class="alert warn">⚠️<div>Mos nomzod topilmadi. "Malakasiz nomzodlarni ham ko‘rsatish"ni yoqing yoki o‘qituvchilar profilida fanlarni belgilang.</div></div>'}`;
    }
    if (st.step === 3) {
      if (st.mode === 'temporary') {
        const misses = (st.plan?.plan || []).filter((x) => x.action !== 'substitute');
        html = `<h3>Mos kelmagan darslar</h3>
          <p class="muted">Almashtiruvchi ba'zi vaqtlarda band bo‘lsa, nima qilinadi?</p>
          <div class="seg mb"><button data-strat="move" class="${st.strategy === 'move' ? 'active' : ''}">O‘sha kunga bir martalik ko‘chirish</button><button data-strat="cancel" class="${st.strategy === 'cancel' ? 'active' : ''}">Bekor qilish + qoplash</button></div>
          ${misses.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Sana</th><th>Dars</th><th>Sabab</th><th>Harakat</th></tr></thead><tbody>
            ${misses.map((x) => `<tr><td>${fmtHuman(x.o.date)}<br><small>${DAYS[x.o.day]}, ${esc(slotName(c, x.o.slotId))}</small></td><td>${esc(wlLabel(c, x.o.wl))}</td><td><small>${esc(x.reason || '')}</small></td>
              <td><select data-ov="${occKey(x.o)}" aria-label="Harakat"><option value="move" ${x.action === 'move' || (x.moveFailed === false && st.overrides[occKey(x.o)] === 'move') ? 'selected' : ''}>Ko‘chirish</option><option value="cancel" ${x.action === 'cancel' ? 'selected' : ''}>Bekor + qoplash</option></select>
              ${x.action === 'move' ? `<br><small class="badge ok">→ ${esc(slotName(c, x.newSlotId))}, ${esc(c.rooms.get(x.newRoomId)?.number || '')}</small>` : x.moveFailed ? '<br><small class="badge warn">bo‘sh vaqt topilmadi</small>' : ''}</td></tr>`).join('')}
          </tbody></table></div>` : '<div class="alert ok">✅<div>Barcha darslar aynan o‘z vaqtida almashtiruvchi tomonidan o‘tiladi.</div></div>'}`;
      } else {
        const cand = (st.cands || []).find((x) => x.teacher.id === st.to);
        html = `<h3>Mos kelmagan darslar</h3>
          ${cand?.misses.length ? `<p>${cand.misses.length} ta dars yangi o‘qituvchi uchun mos emas:</p><ul>${cand.misses.map((x) => `<li>${esc(dayName(x.lesson.day))}, ${esc(slotName(c, x.lesson.slotId))} — ${esc(x.reason)}</li>`).join('')}</ul>` : '<div class="alert ok">✅<div>Barcha darslar o‘z vaqtida qoladi.</div></div>'}
          <div class="grid cols-2 mt">
            <label class="cand ${st.permStrategy === 'auto' ? 'sel' : ''}"><input type="radio" name="ps" value="auto" ${st.permStrategy === 'auto' ? 'checked' : ''}><div class="grow"><b>Boshqa bo‘sh slotga avtomatik ko‘chirish</b><br><small>Generator qisman rejimda, qulflangan darslarga tegmaydi.</small></div></label>
            <label class="cand ${st.permStrategy === 'unschedule' ? 'sel' : ''}"><input type="radio" name="ps" value="unschedule" ${st.permStrategy === 'unschedule' ? 'checked' : ''}><div class="grow"><b>Joylashtirilmaganlarga o‘tkazish</b><br><small>Keyin qo‘lda yoki maslahatchi bilan joylashtirasiz.</small></div></label>
          </div>`;
      }
    }
    if (st.step === 4) html = previewHtml();
    body.innerHTML = steps + html;
    const toName = c.teachers.get(st.to)?.name;
    m.setActions([
      { label: 'Bekor qilish' },
      ...(st.step > 0 ? [{ label: '← Orqaga', onClick: () => { st.step--; draw(); return false; } }] : []),
      st.step < 4
        ? { label: 'Keyingi →', kind: 'primary', disabled: (st.step === 0 && !st.wlIds.size) || (st.step === 2 && !st.to), onClick: () => { next(); return false; } }
        : { label: `✅ Tasdiqlash${toName ? ' — ' + toName : ''}`, kind: 'primary', onClick: confirm },
    ]);
  };

  const previewHtml = () => {
    const toName = c.teachers.get(st.to)?.name || '?';
    if (st.mode === 'temporary') {
      const p = st.plan?.plan || [];
      const cnt = (a) => p.filter((x) => x.action === a).length;
      return `<h3>Oldindan ko‘rish</h3>
        <p>${esc(tName)} → <b>${esc(toName)}</b>, ${fmtHuman(st.startDate)} – ${fmtHuman(st.endDate)} (${ABSENCE_REASONS[st.reason]}).</p>
        <div class="stats mb"><div class="stat ok"><span class="v">${cnt('substitute')}</span><span class="l">o‘z vaqtida almashtiriladi</span></div><div class="stat warn"><span class="v">${cnt('move')}</span><span class="l">bir martalik ko‘chiriladi</span></div><div class="stat err"><span class="v">${cnt('cancel')}</span><span class="l">bekor + qoplash</span></div></div>
        ${p.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Sana</th><th>Oldin</th><th>Keyin</th></tr></thead><tbody>${p.map((x) => `<tr><td>${fmtHuman(x.o.date)} <small>${DAYS[x.o.day]}</small></td><td>${esc(slotName(c, x.o.slotId))} · ${esc(wlLabel(c, x.o.wl))} · ${esc(tName)}</td><td>${x.action === 'substitute' ? `🔁 ${esc(toName)}` : x.action === 'move' ? `↔️ ${esc(slotName(c, x.newSlotId))}, ${esc(c.rooms.get(x.newRoomId)?.number || '')}-xona · ${esc(toName)}` : '❌ Bekor (qoplanishi kerak)'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="alert warn">⚠️<div>Bu davrda darslar topilmadi (bayram, semestrdan tashqari yoki allaqachon almashtirilgan).</div></div>'}
        <p class="muted mt">Haftalik shablon o‘zgarmaydi. ${fmtHuman(addDays(st.endDate, 1))}dan ${esc(tName)} avtomatik qaytadi.</p>`;
    }
    const pv = st.preview;
    return `<h3>Oldindan ko‘rish</h3>
      <p>${[...st.wlIds].map((id) => esc(wlLabel(c, c.workloads.get(id)))).join('; ')}: ${esc(tName)} → <b>${esc(toName)}</b>, ${fmtHuman(st.effectiveDate)} dan.</p>
      ${pv ? `<div class="stats mb">
        <div class="stat ok"><span class="v">${pv.kept}</span><span class="l">dars o‘z joyida</span></div>
        <div class="stat warn"><span class="v">${pv.moved}</span><span class="l">qayta joylashtiriladi</span></div>
        <div class="stat ${pv.unsched ? 'err' : ''}"><span class="v">${pv.unsched}</span><span class="l">joylashtirilmaydi</span></div>
        <div class="stat"><span class="v">${pv.loadBefore} → ${pv.loadAfter}</span><span class="l">${esc(toName)} yuklamasi</span></div>
        <div class="stat ${pv.newConflicts ? 'err' : 'ok'}"><span class="v">${pv.newConflicts}</span><span class="l">yangi hard konflikt</span></div></div>
        ${pv.changes.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Dars</th><th>Oldin</th><th>Keyin</th></tr></thead><tbody>${pv.changes.map((x) => `<tr><td>${esc(x.label)}</td><td>${esc(x.before)}</td><td>${esc(x.after)}</td></tr>`).join('')}</tbody></table></div>` : ''}` : ''}
      <p class="muted mt">Tarixda saqlanadi. "O‘tkazishlar tarixi"dan qaytarish mumkin. Undo ham ishlaydi.</p>`;
  };

  const computeCands = () => {
    const d = store.get();
    const ids = [...st.wlIds];
    st.cands = st.mode === 'temporary'
      ? rankTemporaryCandidates(d, { wlIds: ids, originalTeacherId: teacherId, startDate: st.startDate, endDate: st.endDate, includeUnqualified: st.includeUnqualified, allowOverLimit: !!d.settings.substitution?.allowOverLimit }).candidates
      : rankPermanentCandidates(d, { wlIds: ids, fromTeacherId: teacherId, includeUnqualified: st.includeUnqualified });
    if (st.to && !st.cands.some((x) => x.teacher.id === st.to)) st.to = null;
    if (!st.to && st.cands[0]) st.to = st.cands[0].teacher.id;
  };

  const next = () => {
    if (st.step === 1) {
      if (st.mode === 'temporary') {
        if (!isValidDate(st.startDate) || !isValidDate(st.endDate) || st.startDate > st.endDate) { toastErr('Sana oralig‘i noto‘g‘ri.'); return; }
        const cal = store.get().calendar;
        if (st.endDate < cal.startDate || st.startDate > cal.endDate) { toastErr('Sanalar semestrdan tashqarida.'); return; }
      } else if (!isValidDate(st.effectiveDate)) { toastErr('Sanani tanlang.'); return; }
      computeCands();
    }
    if (st.step === 2 && st.mode === 'temporary') {
      try { st.plan = planTemporary(store.get(), { workloadIds: [...st.wlIds], originalTeacherId: teacherId, substituteTeacherId: st.to, startDate: st.startDate, endDate: st.endDate, strategy: st.strategy, overrides: st.overrides }); }
      catch (e) { toastErr(e.message); return; }
    }
    if (st.step === 3 && st.mode === 'permanent') st.preview = simulatePermanent();
    st.step++;
    draw();
  };

  const permParams = () => {
    const ids = [...st.wlIds];
    const gsel = [];
    for (const id of ids) { const all = wlGroupIds(c.workloads.get(id)); if (st.groupIds[id] && st.groupIds[id].size < all.length) gsel.push(...st.groupIds[id]); }
    return { workloadIds: ids, toTeacherId: st.to, effectiveDate: st.effectiveDate, reason: st.permReason, strategy: st.permStrategy, groupIds: gsel.length ? gsel : null };
  };

  const simulatePermanent = () => {
    const d = clone(store.get());
    const beforeHard = new Set(checkAll(d, { soft: false }).filter((x) => x.severity === 'critical').map((x) => x.key));
    const ctx0 = buildContext(d);
    const loadBefore = new Occupancy(ctx0, d.schedule.lessons).teacherWeekUnits(st.to);
    const beforeLessons = new Map(d.schedule.lessons.map((l) => [l.id, { ...l }]));
    const recs = applyPermanentTransfer(d, permParams());
    const ctx1 = buildContext(d);
    const after = new Map(d.schedule.lessons.map((l) => [l.id, l]));
    const changes = [];
    let kept = 0, moved = 0;
    for (const id of st.wlIds) {
      for (const [lid, b] of beforeLessons) {
        if (b.workloadId !== id) continue;
        const a = after.get(lid);
        if (a && a.day === b.day && a.slotId === b.slotId) kept++;
        else if (!a) changes.push({ label: wlLabel(ctx0, ctx0.workloads.get(id)), before: `${dayName(b.day)}, ${slotName(ctx0, b.slotId)}`, after: '— (qayta joylashtiriladi)' });
      }
    }
    for (const r of recs) {
      for (const lid of r.movedLessons) {
        const a = after.get(lid);
        moved++;
        changes.push({ label: wlLabel(ctx1, ctx1.workloads.get(a.workloadId)), before: '—', after: `${dayName(a.day)}, ${slotName(ctx1, a.slotId)}, ${ctx1.rooms.get(a.roomId)?.number}-xona` });
      }
    }
    const unsched = recs.reduce((a, r) => a + r.unscheduledCount, 0);
    const newConflicts = checkAll(d, { soft: false }).filter((x) => x.severity === 'critical' && !beforeHard.has(x.key)).length;
    return { kept, moved, unsched, loadBefore, loadAfter: new Occupancy(ctx1, d.schedule.lessons).teacherWeekUnits(st.to), newConflicts, changes };
  };

  const confirm = () => {
    const toName = c.teachers.get(st.to)?.name;
    try {
      if (st.mode === 'temporary') {
        store.update(`Vaqtincha almashtirish: ${tName} → ${toName}`, (d) => {
          applyTemporary(d, { workloadIds: [...st.wlIds], originalTeacherId: teacherId, substituteTeacherId: st.to, startDate: st.startDate, endDate: st.endDate, reason: st.reason, note: st.note, strategy: st.strategy, overrides: st.overrides });
        });
        toastOk(`🔁 ${toName} ${fmtHuman(st.startDate)}–${fmtHuman(st.endDate)} davomida ${tName} o‘rniga dars beradi.`, { action: { label: 'Ko‘rish', onClick: () => go('substitutions') } });
      } else {
        let recs;
        store.update(`To‘liq o‘tkazish: ${tName} → ${toName}`, (d) => { recs = applyPermanentTransfer(d, permParams()); });
        const un = recs.reduce((a, r) => a + r.unscheduledCount, 0);
        toastOk(`📤 Yuklama ${toName}ga o‘tkazildi.${un ? ` ${un} ta dars joylashtirilmadi.` : ''}`, { action: { label: 'Bekor qilish', onClick: () => store.undo() } });
      }
    } catch (e) { toastErr(e.message); return false; }
  };

  body.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.wl) {
      if (t.checked) { st.wlIds.add(t.dataset.wl); st.groupIds[t.dataset.wl] = new Set(wlGroupIds(c.workloads.get(t.dataset.wl))); }
      else st.wlIds.delete(t.dataset.wl);
      draw();
    }
    if (t.dataset.grp) {
      const [w, g] = t.dataset.grp.split('|');
      t.checked ? st.groupIds[w].add(g) : st.groupIds[w].delete(g);
      if (!st.groupIds[w].size) { st.groupIds[w].add(g); t.checked = true; }
    }
    if (t.name === 'mode') { st.mode = t.value; draw(); }
    if (t.name === 'ps') { st.permStrategy = t.value; draw(); }
    if (t.dataset.k) st[t.dataset.k] = t.value;
    if (t.dataset.unq !== undefined) { st.includeUnqualified = t.checked; computeCands(); draw(); }
    if (t.dataset.ov) {
      st.overrides[t.dataset.ov] = t.value;
      st.plan = planTemporary(store.get(), { workloadIds: [...st.wlIds], originalTeacherId: teacherId, substituteTeacherId: st.to, startDate: st.startDate, endDate: st.endDate, strategy: st.strategy, overrides: st.overrides });
      draw();
    }
  });
  body.addEventListener('input', (e) => { if (e.target.dataset.k) st[e.target.dataset.k] = e.target.value; });
  body.addEventListener('click', (e) => {
    const to = e.target.closest('[data-to]')?.dataset.to;
    if (to) { st.to = to; draw(); }
    const s = e.target.closest('[data-strat]')?.dataset.strat;
    if (s) {
      st.strategy = s;
      st.overrides = {};
      st.plan = planTemporary(store.get(), { workloadIds: [...st.wlIds], originalTeacherId: teacherId, substituteTeacherId: st.to, startDate: st.startDate, endDate: st.endDate, strategy: st.strategy });
      draw();
    }
  });
  body.addEventListener('keydown', (e) => { const to = e.target.closest('[data-to]'); if (to && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); st.to = to.dataset.to; draw(); } });
  draw();
}

// ---------------------------------------------------------------------------
// Yo‘qlik qo‘shish: ta'sirlangan darslar + avtomatik almashtiruvchi taklifi
// ---------------------------------------------------------------------------
export function openAbsenceDialog(teacherId) {
  const c = getCtx();
  const t = c.teachers.get(teacherId);
  if (!t) return;
  const today = todayStr();
  const st = { startDate: today, endDate: addDays(today, 4), reason: 'sick', note: '', step: 0, sug: null, choice: {} };
  const body = document.createElement('div');
  const m = openModal({ title: `Yo‘qlik: ${t.name}`, body, size: 'lg', actions: [] });
  const draw = () => {
    if (st.step === 0) {
      body.innerHTML = `<div class="form-grid">
        <label class="field">Boshlanish<input type="date" data-k="startDate" value="${st.startDate}"></label>
        <label class="field">Tugash<input type="date" data-k="endDate" value="${st.endDate}"></label>
        <label class="field">Sabab<select data-k="reason">${Object.entries(ABSENCE_REASONS).map(([k, v]) => `<option value="${k}" ${k === st.reason ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="field span-all">Izoh<input data-k="note" value="${esc(st.note)}"></label></div>`;
      m.setActions([{ label: 'Bekor qilish' }, { label: 'Ta\'sirlangan darslarni ko‘rish →', kind: 'primary', onClick: () => {
        if (!isValidDate(st.startDate) || !isValidDate(st.endDate) || st.startDate > st.endDate) { toastErr('Sana oralig‘i noto‘g‘ri.'); return false; }
        st.sug = suggestForAbsence(store.get(), teacherId, st.startDate, st.endDate);
        for (const s of st.sug.suggestions) st.choice[s.workloadId] = s.best?.teacher.id || '';
        st.step = 1;
        draw();
        return false;
      } }]);
      return;
    }
    const s = st.sug;
    body.innerHTML = `<p>${fmtHuman(st.startDate)} – ${fmtHuman(st.endDate)} davomida <b>${s.occs.length}</b> ta dars ta'sirlanadi.</p>
      ${s.suggestions.length ? s.suggestions.map((x) => {
        const wl = c.workloads.get(x.workloadId);
        const chosen = x.candidates.find((k) => k.teacher.id === st.choice[x.workloadId]);
        return `<div class="card" style="padding:12px"><div class="row between"><b>${esc(wlLabel(c, wl))}</b><span class="badge">${x.occurrences.length} dars</span></div>
          <small class="muted">${x.occurrences.map((o) => `${fmtHuman(o.date)} ${esc(slotName(c, o.slotId))}`).join(' · ')}</small>
          <div class="row mt"><label class="field" style="flex:1">Almashtiruvchi<select data-ch="${x.workloadId}"><option value="">— tayinlanmasin —</option>${x.candidates.map((k) => `<option value="${k.teacher.id}" ${k.teacher.id === st.choice[x.workloadId] ? 'selected' : ''}>${esc(k.teacher.name)} — ${k.fits.length}/${k.total}${k.qualified ? '' : ' ⚠️'}</option>`).join('')}</select></label></div>
          ${!x.candidates.length ? '<div class="alert err">🔴<div>Almashtiruvchi topilmadi — darslar bekor qilinadi yoki qo‘lda hal qiling.</div></div>' : chosen && chosen.fits.length < chosen.total ? `<small class="badge warn">${chosen.total - chosen.fits.length} ta dars ko‘chiriladi yoki bekor qilinadi</small>` : ''}
        </div>`;
      }).join('') : '<div class="alert ok">✅<div>Bu davrda o‘qituvchining darslari yo‘q.</div></div>'}`;
    m.setActions([
      { label: '← Orqaga', onClick: () => { st.step = 0; draw(); return false; } },
      { label: 'Faqat yo‘qlikni saqlash', onClick: () => save(false) },
      { label: '✅ Hammasini qabul qilish', kind: 'primary', disabled: !s.suggestions.length, onClick: () => save(true) },
    ]);
  };
  const save = (withSubs) => {
    try {
      let made = 0;
      store.update(`Yo‘qlik qo‘shildi: ${t.name}`, (d) => {
        const tt = d.teachers.find((x) => x.id === teacherId);
        tt.absences = [...(tt.absences || []), { id: uid('abs'), startDate: st.startDate, endDate: st.endDate, reason: st.reason, note: st.note }];
        if (withSubs) {
          for (const [wlId, to] of Object.entries(st.choice)) {
            if (!to) continue;
            applyTemporary(d, { workloadIds: [wlId], originalTeacherId: teacherId, substituteTeacherId: to, startDate: st.startDate, endDate: st.endDate, reason: st.reason, note: st.note, strategy: 'move' });
            made++;
          }
        }
      });
      toastOk(`Yo‘qlik saqlandi${made ? `, ${made} ta almashtirish yaratildi` : ''}.`, { action: { label: 'Ko‘rish', onClick: () => go('substitutions') } });
    } catch (e) { toastErr(e.message); return false; }
  };
  body.addEventListener('input', (e) => { if (e.target.dataset.k) st[e.target.dataset.k] = e.target.value; });
  body.addEventListener('change', (e) => {
    if (e.target.dataset.k) st[e.target.dataset.k] = e.target.value;
    if (e.target.dataset.ch) { st.choice[e.target.dataset.ch] = e.target.value; draw(); }
  });
  draw();
}

export { toast };
