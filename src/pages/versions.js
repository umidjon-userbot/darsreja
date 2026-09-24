// 📢 Jadval versiyalari: e'lon qilish, sanadan kuchga kirish, taqqoslash, o‘zgarishlar ro‘yxati
import { store } from '../state/store.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { toast, ok as toastOk, err as toastErr } from '../components/toast.js';
import { emptyState } from '../components/emptyState.js';
import { sortedVersions, latestVersion, versionForDate, draftDiff, diffLessons, publishVersion, changeSheets, describeChanges, normLesson } from '../analysis/versions.js';
import { reconcileSubstitutions } from '../substitution/substitutionService.js';
import { printHtml } from '../services/printService.js';
import { esc } from '../utils/dom.js';
import { todayStr, fmtHuman, isValidDate } from '../utils/date.js';
import { setParams } from '../router.js';

export function render(root, route) {
  const data = store.get();
  const today = todayStr();
  const versions = sortedVersions(data);
  const current = versionForDate(data, today);
  const latest = latestVersion(data);
  const diff = draftDiff(data);
  const p = route.params;
  const srcOpts = [['draft', 'Qoralama (ishchi jadval)'], ...versions.map((v) => [v.id, `${v.name} — ${fmtHuman(v.effectiveFrom)} dan`])].reverse();
  const A = p.a || (latest ? (versions.length > 1 && !diff?.length ? versions[versions.length - 2].id : latest.id) : 'draft');
  const B = p.b || (diff?.length || !latest ? 'draft' : latest.id);
  const kind = p.kind || 'teacher';
  const lessonsOf = (id) => (id === 'draft' ? data.schedule.lessons : versions.find((v) => v.id === id)?.lessons || []);
  const changes = diffLessons(lessonsOf(A), lessonsOf(B));
  const sheets = kind === 'all' ? [{ id: 'all', name: 'Barcha o‘zgarishlar', rows: describeChanges(data, changes) }] : changeSheets(data, changes, kind);

  root.innerHTML = `
    <div class="page-head"><div><h1>📢 Jadval versiyalari</h1>
      <p>Ishchi jadval (qoralama) tahrir qilinadi; talabalar va o‘qituvchilar uchun kuchda bo‘lgani — e'lon qilingan versiya. Yangi versiya ko‘rsatilgan sanadan kuchga kiradi, o‘tgan haftalar tarixi (soat hisobi, almashtirishlar) o‘zgarmaydi.</p></div>
      <div class="btn-row"><button class="btn primary" data-a="publish" ${data.schedule.lessons.length ? '' : 'disabled'}>📢 E'lon qilish</button></div></div>
    <div class="stats mb">
      <div class="stat"><span class="l">Hozir kuchda</span><span class="v" style="font-size:18px">${current ? esc(current.name) : 'Qoralama (e\'lon qilinmagan)'}</span></div>
      <div class="stat ${diff?.length ? 'warn' : 'ok'}"><span class="l">E'lon qilinmagan o‘zgarishlar</span><span class="v">${diff ? diff.length : '—'}</span></div>
      <div class="stat"><span class="l">Versiyalar</span><span class="v">${versions.length}</span></div>
    </div>
    ${!versions.length ? `<div class="alert info">ℹ️<div>Hali birorta versiya e'lon qilinmagan — sana bo‘yicha ko‘rinishlar ishchi jadvaldan olinadi. Jadval tayyor bo‘lgach, <b>E'lon qilish</b>ni bosing: shundan keyin semestr o‘rtasida qayta tuzsangiz ham o‘tgan haftalar tarixi saqlanadi.</div></div>` : ''}
    ${versions.length ? `<div class="table-wrap mb"><table class="t responsive"><thead><tr><th>Versiya</th><th>Kuchga kiradi</th><th>E'lon qilingan</th><th class="num">Darslar</th><th>Izoh</th><th class="num">Amallar</th></tr></thead><tbody>
      ${[...versions].reverse().map((v) => `<tr><td data-label="Versiya"><b>${esc(v.name)}</b> ${current?.id === v.id ? '<span class="badge ok">kuchda</span>' : v.effectiveFrom > today ? '<span class="badge info">rejalashtirilgan</span>' : '<span class="badge">arxiv</span>'}</td>
        <td data-label="Kuchga kiradi">${fmtHuman(v.effectiveFrom)}</td><td data-label="E'lon qilingan">${new Date(v.publishedAt).toLocaleString('uz-UZ')}</td>
        <td class="num" data-label="Darslar">${v.lessons.length}</td><td data-label="Izoh">${esc(v.note || '')}</td>
        <td class="actions"><button class="btn xs" data-load="${v.id}" title="Bu versiyani ishchi jadvalga yuklash">↺ Qoralamaga</button> <button class="btn xs danger-ghost" data-del="${v.id}" aria-label="O‘chirish">🗑️</button></td></tr>`).join('')}
    </tbody></table></div>` : ''}
    <div class="card">
      <div class="card-head"><h2>O‘zgarishlar ro‘yxati</h2>
        <div class="btn-row"><button class="btn sm" data-a="copyall" ${sheets.length ? '' : 'disabled'}>📋 Hammasini nusxalash</button><button class="btn sm" data-a="print" ${sheets.length ? '' : 'disabled'}>🖨️ Chop etish</button></div></div>
      <div class="toolbar">
        <label class="row">Oldin: <select data-p="a">${srcOpts.map(([v, n]) => `<option value="${v}" ${v === A ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <label class="row">Keyin: <select data-p="b">${srcOpts.map(([v, n]) => `<option value="${v}" ${v === B ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <div class="seg">${[['teacher', 'O‘qituvchilar'], ['group', 'Guruhlar'], ['all', 'Hammasi']].map(([k, n]) => `<button class="${kind === k ? 'active' : ''}" data-kind="${k}">${n}</button>`).join('')}</div>
        <span class="muted">${changes.length} ta o‘zgarish</span>
      </div>
      ${sheets.length ? `<div class="grid cols-2">${sheets.map((s, i) => `<div class="card" style="padding:12px"><div class="row between"><b>${esc(s.name)}</b><button class="btn xs" data-copy="${i}">📋 Nusxalash</button></div>
        <ul class="list-plain">${s.rows.map((r) => `<li>${esc(r.text)}${kind === 'group' ? ` <small class="muted">(${esc(r.teacher)})</small>` : ''}</li>`).join('')}</ul></div>`).join('')}</div>`
        : emptyState({ icon: '✅', title: A === B ? 'Bir xil manba tanlangan' : 'O‘zgarish yo‘q', text: 'Tanlangan ikki jadval bir xil.' })}
    </div>`;

  const sheetText = (s) => {
    const src = (id) => (id === 'draft' ? 'qoralama' : versions.find((v) => v.id === id)?.name || '');
    return `${data.settings.instituteName}\nJadvaldagi o‘zgarishlar (${src(A)} → ${src(B)})\n${s.name}:\n${s.rows.map((r) => '• ' + r.text).join('\n')}`;
  };
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toastOk('Nusxalandi — Telegram yoki xabarga joylashtiring.'); }
    catch { openModal({ title: 'Nusxalash', body: `<textarea style="min-height:260px" readonly>${esc(text)}</textarea><p class="muted">Matnni belgilab nusxalang.</p>`, actions: [{ label: 'Yopish' }] }); }
  };
  root.querySelectorAll('[data-p]').forEach((s) => s.addEventListener('change', () => setParams({ [s.dataset.p]: s.value }, false)));
  root.addEventListener('click', async (e) => {
    const k = e.target.closest('[data-kind]')?.dataset.kind;
    if (k) setParams({ kind: k }, false);
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'publish') openPublishDialog();
    if (a === 'copyall') copy(sheets.map(sheetText).join('\n\n'));
    if (a === 'print') printHtml(`<div class="pr-page"><div class="pr-head"><div><h1>${esc(data.settings.instituteName)}</h1><div>Jadvaldagi o‘zgarishlar</div></div><div class="meta">${fmtHuman(today)}</div></div>${sheets.map((s) => `<h3 style="margin:8px 0 2px">${esc(s.name)}</h3><ul style="margin:0 0 6px;padding-left:16px">${s.rows.map((r) => `<li>${esc(r.text)}</li>`).join('')}</ul>`).join('')}</div>`);
    const c = e.target.closest('[data-copy]')?.dataset.copy;
    if (c !== undefined) copy(sheetText(sheets[+c]));
    const ld = e.target.closest('[data-load]')?.dataset.load;
    if (ld) {
      const v = versions.find((x) => x.id === ld);
      if (!(await confirmDialog({ title: 'Qoralamaga yuklash', message: `Ishchi jadval "${v.name}" versiyasi bilan almashtirilsinmi? (Undo bilan qaytarish mumkin)`, confirmLabel: 'Yuklash' }))) return;
      store.update(`Qoralamaga yuklandi: ${v.name}`, (d) => { d.schedule.lessons = v.lessons.map((l) => ({ ...normLesson(l), source: 'manual', explanation: null })); });
      toastOk('Qoralamaga yuklandi.');
    }
    const del = e.target.closest('[data-del]')?.dataset.del;
    if (del) {
      const v = versions.find((x) => x.id === del);
      if (!(await confirmDialog({ title: 'Versiyani o‘chirish', message: `"${v.name}" o‘chirilsinmi? Uning sanalaridagi tarix oldingi versiya bo‘yicha ko‘rsatiladi.`, confirmLabel: 'O‘chirish', danger: true }))) return;
      store.update(`Versiya o‘chirildi: ${v.name}`, (d) => { d.versions = d.versions.filter((x) => x.id !== del); reconcileSubstitutions(d); });
      toast('O‘chirildi.', { action: { label: 'Bekor qilish', onClick: () => store.undo() } });
    }
  });
}

export function openPublishDialog() {
  const data = store.get();
  const versions = sortedVersions(data);
  const latest = latestVersion(data);
  const diff = draftDiff(data);
  const today = todayStr();
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-grid">
      <label class="field">Nomi<input id="pv-name" value="${esc(`${versions.length + 1}-versiya`)}"></label>
      <label class="field">Kuchga kirish sanasi<input id="pv-date" type="date" value="${latest && latest.effectiveFrom > today ? latest.effectiveFrom : today}"></label>
      <label class="field span-all">Izoh<input id="pv-note" placeholder="Masalan: Li Na yuklamasi qayta taqsimlandi"></label>
    </div>
    ${diff ? `<div class="alert ${diff.length ? 'info' : 'warn'} mt">ℹ️<div>Oxirgi versiyaga nisbatan <b>${diff.length}</b> ta o‘zgarish: ${diff.filter((x) => x.type === 'moved').length} ko‘chirilgan, ${diff.filter((x) => x.type === 'added').length} qo‘shilgan, ${diff.filter((x) => x.type === 'removed').length} olib tashlangan.</div></div>` : '<div class="alert info mt">ℹ️<div>Birinchi versiya: sanadan oldingi kunlar uchun ham shu jadval ishlatiladi.</div></div>'}
    <p class="muted">Faol almashtirishlar yangi versiya darslariga avtomatik moslanadi.</p>`;
  openModal({
    title: '📢 Jadvalni e\'lon qilish', body,
    actions: [{ label: 'Bekor qilish' }, { label: 'E\'lon qilish', kind: 'primary', onClick: () => {
      const name = body.querySelector('#pv-name').value.trim();
      const date = body.querySelector('#pv-date').value;
      if (!isValidDate(date)) { toastErr('Sanani tanlang.'); return false; }
      if (latest && date < latest.effectiveFrom) { toastErr(`Sana oxirgi versiya sanasidan (${fmtHuman(latest.effectiveFrom)}) oldin bo‘lishi mumkin emas.`); return false; }
      store.update(`Jadval e'lon qilindi: ${name}`, (d) => { publishVersion(d, { name, effectiveFrom: date, note: body.querySelector('#pv-note').value.trim() }); reconcileSubstitutions(d); });
      toastOk(`📢 "${name}" ${fmtHuman(date)} dan kuchga kiradi.`, { action: { label: 'O‘zgarishlar', onClick: () => { location.hash = '#/versions'; } } });
    } }],
  });
}
