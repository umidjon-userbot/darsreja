// 📝 Imtihon sessiyasi: sozlamalar, imtihonlar ro‘yxati, avtomatik jadval, nazoratchilar, eksport
import { store } from '../state/store.js';
import { ctx as getCtx } from '../state/selectors.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { toast, ok as toastOk, err as toastErr } from '../components/toast.js';
import { emptyState } from '../components/emptyState.js';
import { examsFromWorkloads, scheduleExams, checkExams, sessionDates, examStudents, examLabel, tryPlace } from '../exams/examScheduler.js';
import { toCsv, downloadCsv } from '../services/csvService.js';
import { printHtml } from '../services/printService.js';
import { DAYS } from '../i18n/uz.js';
import { esc } from '../utils/dom.js';
import { uid } from '../utils/id.js';
import { fmtHuman, dayKeyOf, isValidDate, todayStr } from '../utils/date.js';
import { setParams } from '../router.js';

export function render(root, route) {
  const data = store.get();
  const c = getCtx();
  const ex = data.exams;
  const ses = ex.session;
  const items = ex.items;
  const byId = new Map(items.map((x) => [x.id, x]));
  const dates = sessionDates(data);
  const issues = checkExams(data);
  const view = route.params.view || 'date';
  const slotTxt = (e) => { const a = c.slots[c.slotIdx.get(e.slotIds?.[0] || e.slotId)]; const b = c.slots[c.slotIdx.get(e.slotIds?.[e.slotIds.length - 1])]; return a ? `${a.start}–${b?.end || a.end}` : '?'; };
  const tName = (id) => esc(c.teachers.get(id)?.name || '—');
  const rows = [...ex.schedule].sort((a, b) => (a.date + a.slotId < b.date + b.slotId ? -1 : 1));

  root.innerHTML = `
    <div class="page-head"><div><h1>📝 Imtihon sessiyasi</h1><p>Guruhda bir kunda bitta imtihon, imtihonlar orasida dam kunlari, xona sig‘imi, imtihon oluvchi bandligi va nazoratchilar taqsimoti hisobga olinadi.</p></div>
      <div class="btn-row"><button class="btn" data-a="csv" ${rows.length ? '' : 'disabled'}>⬇️ CSV</button><button class="btn" data-a="print" ${rows.length ? '' : 'disabled'}>🖨️ Chop etish</button><button class="btn primary" data-a="run" ${items.length ? '' : 'disabled'}>▶ Sessiya jadvalini tuzish</button></div></div>
    <div class="grid cols-2 mb">
      <form class="card" data-ses><h2>Sessiya sozlamalari</h2>
        <div class="form-grid">
          <label class="field">Boshlanish<input type="date" id="es-start" value="${esc(ses.startDate)}"></label>
          <label class="field">Tugash<input type="date" id="es-end" value="${esc(ses.endDate)}"></label>
          <label class="field">Davomiylik (slot)<select id="es-dur">${[1, 2, 3].map((n) => `<option ${Number(ses.durationSlots) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label class="field">Guruh imtihonlari orasida (kun)<input type="number" min="1" max="7" id="es-gap" value="${ses.minGapDays}"><span class="hint">2 — imtihonlar orasida 1 kun dam</span></label>
          <label class="field">Nazoratchi (har xonaga)<input type="number" min="0" max="3" id="es-pr" value="${ses.proctorsPerRoom}"></label>
        </div>
        <div class="field mt"><span style="font-weight:550;font-size:13px">Imtihon kunlari</span><div class="multi">${['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => `<label><input type="checkbox" data-sday value="${d}" ${ses.days.includes(d) ? 'checked' : ''}> ${DAYS[d]}</label>`).join('')}</div></div>
        <div class="field mt"><span style="font-weight:550;font-size:13px">Boshlanish paralari</span><div class="multi">${c.slots.map((s) => `<label><input type="checkbox" data-sslot value="${s.id}" ${ses.slotIds.includes(s.id) ? 'checked' : ''}> ${esc(s.name)} ${s.start}</label>`).join('')}</div></div>
        <div class="btn-row mt"><button class="btn primary" type="submit">Saqlash</button><span class="muted">${dates.length} ta imtihon kuni (bayramlarsiz)</span></div>
      </form>
      <div class="card"><div class="card-head"><h2>Imtihonlar (${items.length})</h2><div class="btn-row"><button class="btn sm" data-a="fromwl">🧮 Yuklamalardan yaratish</button><button class="btn sm primary" data-a="add">＋</button></div></div>
        ${items.length ? `<div class="table-wrap" style="max-height:340px;overflow:auto"><table class="t"><thead><tr><th>Fan · guruh</th><th>Imtihon oluvchi</th><th class="num">Talaba</th><th class="num"></th></tr></thead><tbody>
          ${items.map((x) => `<tr><td>${esc(examLabel(c, x))}</td><td>${tName(x.examinerId)}</td><td class="num">${examStudents(c, x)}</td><td class="actions"><button class="btn xs" data-edit="${x.id}" aria-label="Tahrirlash">✏️</button> <button class="btn xs danger-ghost" data-del="${x.id}" aria-label="O‘chirish">🗑️</button></td></tr>`).join('')}
        </tbody></table></div>` : emptyState({ icon: '📝', title: 'Imtihonlar yo‘q', text: 'Majburiy fanlar bo‘yicha o‘quv yuklamasidan avtomatik yarating yoki qo‘lda qo‘shing.' })}
      </div>
    </div>
    ${ex.lastRun ? `<div class="stats mb"><div class="stat ok"><span class="v">${ex.lastRun.placed}</span><span class="l">imtihon joylashdi (${ex.lastRun.total} dan)</span></div>
      <div class="stat ${ex.unscheduled.length ? 'warn' : 'ok'}"><span class="v">${ex.unscheduled.length}</span><span class="l">joylashmadi</span></div>
      <div class="stat ${ex.lastRun.relaxed ? 'warn' : ''}"><span class="v">${ex.lastRun.relaxed}</span><span class="l">yumshatilgan qoida bilan (kamroq dam kuni)</span></div>
      <div class="stat ${issues.length ? 'err' : 'ok'}"><span class="v">${issues.length}</span><span class="l">muammo</span></div></div>` : ''}
    ${ex.unscheduled.length ? `<div class="alert warn">⚠️<div><b>Joylashmagan imtihonlar:</b><ul>${ex.unscheduled.map((u) => `<li>${esc(byId.get(u.examId) ? examLabel(c, byId.get(u.examId)) : '?')} — ${esc(u.reason)}</li>`).join('')}</ul>Sessiya kunlarini yoki boshlanish paralarini ko‘paytiring, dam kunlarini kamaytiring.</div></div>` : ''}
    ${issues.length ? `<div class="alert err">🔴<div><ul>${issues.map((i) => `<li>${esc(i.msg)}</li>`).join('')}</ul></div></div>` : ''}
    ${rows.length ? `<div class="card"><div class="card-head"><h2>Sessiya jadvali</h2><div class="seg"><button class="${view === 'date' ? 'active' : ''}" data-view="date">Sanalar bo‘yicha</button><button class="${view === 'group' ? 'active' : ''}" data-view="group">Guruhlar bo‘yicha</button></div></div>
      ${view === 'date' ? `<div class="table-wrap"><table class="t responsive"><thead><tr><th>Sana</th><th>Vaqt</th><th>Fan · guruh</th><th>Imtihon oluvchi</th><th>Xona</th><th>Nazoratchilar</th><th class="num"></th></tr></thead><tbody>
        ${rows.map((e) => { const x = byId.get(e.examId); if (!x) return ''; return `<tr><td data-label="Sana"><b>${fmtHuman(e.date)}</b> <small>${DAYS[dayKeyOf(e.date)]}</small></td><td data-label="Vaqt">${slotTxt(e)}</td><td data-label="Fan">${esc(examLabel(c, x))}${e.fixed ? ' 🔒' : ''}${e.relaxed ? ' <span class="badge warn" title="Dam kunlari qoidasi yumshatilgan">kam dam</span>' : ''}</td><td data-label="Oluvchi">${tName(x.examinerId)}</td><td data-label="Xona">${e.roomIds.map((r) => esc(c.rooms.get(r)?.number || '?')).join(', ')}</td><td data-label="Nazoratchi">${(e.proctorIds || []).map(tName).join(', ') || '—'}${e.proctorShortage ? ` <span class="badge err">−${e.proctorShortage}</span>` : ''}</td><td class="actions"><button class="btn xs" data-move="${e.examId}">✏️</button></td></tr>`; }).join('')}
      </tbody></table></div>`
      : `<div class="grid cols-3">${data.groups.map((g) => { const my = rows.filter((e) => byId.get(e.examId)?.groupIds.includes(g.id)); if (!my.length) return ''; return `<div class="card" style="padding:12px"><b>${esc(g.name)}</b><ul class="list-plain">${my.map((e) => `<li>${fmtHuman(e.date)} ${slotTxt(e)} — ${esc(c.subjects.get(byId.get(e.examId).subjectId)?.name || '')} <small class="muted">${e.roomIds.map((r) => c.rooms.get(r)?.number).join(', ')}</small></li>`).join('')}</ul></div>`; }).join('')}</div>`}
    </div>` : ''}`;

  root.querySelector('[data-ses]').addEventListener('submit', (e) => {
    e.preventDefault();
    const s = {
      startDate: root.querySelector('#es-start').value, endDate: root.querySelector('#es-end').value,
      durationSlots: Number(root.querySelector('#es-dur').value), minGapDays: Math.max(1, Number(root.querySelector('#es-gap').value) || 1),
      proctorsPerRoom: Math.max(0, Number(root.querySelector('#es-pr').value) || 0),
      days: [...root.querySelectorAll('[data-sday]:checked')].map((x) => x.value), slotIds: [...root.querySelectorAll('[data-sslot]:checked')].map((x) => x.value),
    };
    if (!isValidDate(s.startDate) || !isValidDate(s.endDate) || s.startDate > s.endDate) return toastErr('Sessiya sanalari noto‘g‘ri.');
    if (!s.days.length || !s.slotIds.length) return toastErr('Kamida bitta kun va bitta boshlanish parasini tanlang.');
    store.update('Sessiya sozlamalari saqlandi', (d) => { d.exams.session = { ...d.exams.session, ...s }; });
    toastOk('Saqlandi.');
  });
  root.addEventListener('click', async (e) => {
    const v = e.target.closest('[data-view]')?.dataset.view;
    if (v) setParams({ view: v }, false);
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'fromwl') {
      const gen = examsFromWorkloads(store.get());
      if (items.length && !(await confirmDialog({ title: 'Yuklamalardan yaratish', message: `${gen.length} ta imtihon yaratiladi. Mavjud ${items.length} ta imtihon va sessiya jadvali almashtirilsinmi?`, confirmLabel: 'Almashtirish', danger: true }))) return;
      store.update('Imtihonlar yuklamadan yaratildi', (d) => { d.exams.items = gen; d.exams.schedule = []; d.exams.unscheduled = []; d.exams.lastRun = null; });
      toastOk(`${gen.length} ta imtihon yaratildi.`);
    }
    if (a === 'add') openExamItem(null);
    if (a === 'run') {
      const r = scheduleExams(store.get());
      store.update(`Sessiya jadvali tuzildi (${r.stats.placed}/${r.stats.total})`, (d) => { d.exams.schedule = r.schedule; d.exams.unscheduled = r.unscheduled; d.exams.lastRun = { at: new Date().toISOString(), ...r.stats }; });
      toast(`✅ ${r.stats.placed} ta imtihon joylashdi${r.unscheduled.length ? `, ⚠️ ${r.unscheduled.length} tasi joylashmadi` : ''}.`, { type: 'ok', action: { label: 'Bekor qilish', onClick: () => store.undo() } });
    }
    if (a === 'csv') downloadCsv(`imtihonlar-${todayStr()}.csv`, toCsv([['Sana', 'Kun', 'Vaqt', 'Fan', 'Guruhlar', 'Imtihon oluvchi', 'Xona', 'Nazoratchilar'], ...rows.map((r) => { const x = byId.get(r.examId); return [fmtHuman(r.date), DAYS[dayKeyOf(r.date)], slotTxt(r), c.subjects.get(x?.subjectId)?.name || '', (x?.groupIds || []).map((g) => c.groups.get(g)?.name).join(', '), c.teachers.get(x?.examinerId)?.name || '', r.roomIds.map((id) => c.rooms.get(id)?.number).join(', '), (r.proctorIds || []).map((id) => c.teachers.get(id)?.name).join(', ')]; })]));
    if (a === 'print') printHtml(`<div class="pr-page"><div class="pr-head"><div><h1>${esc(data.settings.instituteName)}</h1><div>Imtihon sessiyasi jadvali: ${fmtHuman(ses.startDate)} – ${fmtHuman(ses.endDate)}</div></div></div><table class="pr"><thead><tr><th>Sana</th><th>Vaqt</th><th>Fan · guruh</th><th>Imtihon oluvchi</th><th>Xona</th><th>Nazoratchilar</th></tr></thead><tbody>${rows.map((r) => { const x = byId.get(r.examId); return x ? `<tr><td>${fmtHuman(r.date)} ${DAYS[dayKeyOf(r.date)]}</td><td>${slotTxt(r)}</td><td>${esc(examLabel(c, x))}</td><td>${tName(x.examinerId)}</td><td>${r.roomIds.map((id) => esc(c.rooms.get(id)?.number || '')).join(', ')}</td><td>${(r.proctorIds || []).map(tName).join(', ')}</td></tr>` : ''; }).join('')}</tbody></table></div>`);
    const ed = e.target.closest('[data-edit]')?.dataset.edit;
    if (ed) openExamItem(byId.get(ed));
    const del = e.target.closest('[data-del]')?.dataset.del;
    if (del) { store.update('Imtihon o‘chirildi', (d) => { d.exams.items = d.exams.items.filter((x) => x.id !== del); d.exams.schedule = d.exams.schedule.filter((x) => x.examId !== del); }); }
    const mv = e.target.closest('[data-move]')?.dataset.move;
    if (mv) openExamMove(mv);
  });
}

function openExamItem(item) {
  const data = store.get();
  const isNew = !item;
  const base = item ? { ...item } : { id: uid('exam'), subjectId: data.subjects[0]?.id || '', groupIds: [], examinerId: '', durationSlots: data.exams.session.durationSlots, roomType: 'regular', studentCount: null };
  const body = document.createElement('div');
  body.innerHTML = `<div class="form-grid">
    <label class="field span-2">Fan<select id="ei-s">${data.subjects.map((s) => `<option value="${s.id}" ${s.id === base.subjectId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
    <label class="field span-2">Imtihon oluvchi<select id="ei-t"><option value="">—</option>${data.teachers.map((t) => `<option value="${t.id}" ${t.id === base.examinerId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
    <label class="field">Davomiylik (slot)<input id="ei-d" type="number" min="1" max="3" value="${base.durationSlots}"></label>
    <label class="field">Talabalar soni (ixtiyoriy)<input id="ei-n" type="number" min="1" value="${base.studentCount || ''}" placeholder="guruhlar bo‘yicha"></label>
    <label class="field">Xona turi<select id="ei-r">${data.settings.roomTypes.map((t) => `<option value="${t.id}" ${t.id === base.roomType ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
  </div><fieldset class="mt"><legend>Guruhlar</legend><div class="multi">${data.groups.map((g) => `<label><input type="checkbox" data-g value="${g.id}" ${base.groupIds.includes(g.id) ? 'checked' : ''}> ${esc(g.name)}</label>`).join('')}</div></fieldset>`;
  openModal({
    title: isNew ? 'Yangi imtihon' : 'Imtihonni tahrirlash', body,
    actions: [{ label: 'Bekor qilish' }, { label: 'Saqlash', kind: 'primary', onClick: () => {
      const x = { ...base, subjectId: body.querySelector('#ei-s').value, examinerId: body.querySelector('#ei-t').value, durationSlots: Number(body.querySelector('#ei-d').value) || 2, studentCount: Number(body.querySelector('#ei-n').value) || null, roomType: body.querySelector('#ei-r').value, groupIds: [...body.querySelectorAll('[data-g]:checked')].map((i) => i.value) };
      if (!x.groupIds.length) { toastErr('Kamida bitta guruh tanlang.'); return false; }
      store.update(isNew ? 'Imtihon qo‘shildi' : 'Imtihon tahrirlandi', (d) => { if (isNew) d.exams.items.push(x); else Object.assign(d.exams.items.find((y) => y.id === x.id), x); });
    } }],
  });
}

function openExamMove(examId) {
  const data = store.get();
  const c = getCtx();
  const s = data.exams.schedule.find((x) => x.examId === examId);
  const item = data.exams.items.find((x) => x.id === examId);
  const dates = sessionDates(data);
  const body = document.createElement('div');
  body.innerHTML = `<p><b>${esc(examLabel(c, item))}</b></p><div class="form-grid">
    <label class="field">Sana<select id="em-d">${dates.map((d) => `<option value="${d}" ${d === s.date ? 'selected' : ''}>${fmtHuman(d)} ${DAYS[dayKeyOf(d)]}</option>`).join('')}</select></label>
    <label class="field">Boshlanish<select id="em-s">${c.slots.map((x) => `<option value="${x.id}" ${x.id === s.slotId ? 'selected' : ''}>${esc(x.name)} ${x.start}</option>`).join('')}</select></label></div>
    <label class="check mt"><input type="checkbox" id="em-f" ${s.fixed ? 'checked' : ''}> 🔒 Qotirish (qayta tuzishda o‘zgarmaydi)</label><div data-st class="mt"></div>`;
  const check = () => {
    const d = { ...data, exams: { ...data.exams, schedule: data.exams.schedule.filter((x) => x.examId !== examId) } };
    const st = { entries: d.exams.schedule.map((x) => ({ ...x, groupIds: d.exams.items.find((i) => i.id === x.examId)?.groupIds || [], examinerId: d.exams.items.find((i) => i.id === x.examId)?.examinerId })) };
    st.on = (date) => st.entries.filter((x) => x.date === date);
    st.groupDates = (g) => st.entries.filter((x) => x.groupIds.includes(g)).map((x) => x.date);
    const r = tryPlace(d, c, st, item, body.querySelector('#em-d').value, body.querySelector('#em-s').value, { minGap: 1, strictAvail: false });
    body.querySelector('[data-st]').innerHTML = r.ok ? `<div class="alert ok">✅<div>Mumkin. Xona: ${r.roomIds.map((id) => esc(c.rooms.get(id)?.number)).join(', ')}</div></div>` : `<div class="alert err">❌<div>Mumkin emas: ${({ group: 'guruhda shu kuni imtihon bor', examiner: 'imtihon oluvchi band yoki yo‘q', room: 'bo‘sh xona yo‘q', capacity: 'sig‘im yetmaydi', slot: 'vaqt noto‘g‘ri' })[r.why] || r.why}.</div></div>`;
    return r;
  };
  body.addEventListener('change', check);
  check();
  openModal({
    title: 'Imtihonni ko‘chirish', body,
    actions: [{ label: 'Bekor qilish' }, { label: 'Saqlash', kind: 'primary', onClick: () => {
      const r = check();
      if (!r.ok) return false;
      store.update('Imtihon ko‘chirildi', (d) => { Object.assign(d.exams.schedule.find((x) => x.examId === examId), { date: body.querySelector('#em-d').value, slotId: body.querySelector('#em-s').value, slotIds: r.slots, roomIds: r.roomIds, fixed: body.querySelector('#em-f').checked }); });
    } }],
  });
}
