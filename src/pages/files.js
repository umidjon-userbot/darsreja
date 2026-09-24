// 💾 Import / Export / Backup
import { store } from '../state/store.js';
import { unscheduledList } from '../state/selectors.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { toast, ok as toastOk, err as toastErr } from '../components/toast.js';
import { exportJson, backup } from '../services/exportService.js';
import { parseImport } from '../services/importService.js';
import { scheduleCsv, unscheduledCsv, substitutionsCsv, downloadCsv } from '../services/csvService.js';
import { ENTITIES, readWorkbook, sheetRows, autoMap, analyze, applyImport, downloadTemplate, exportAllXlsx } from '../services/bulkImport.js';
import { buildIcs, safeFileName } from '../services/icsService.js';
import { openPrintDialog } from '../services/printService.js';
import { storageUsage } from '../services/storage.js';
import { esc, pickFile, readFile, download } from '../utils/dom.js';
import { todayStr } from '../utils/date.js';
import { setParams } from '../router.js';
import JSZip from 'jszip';
import { previewResponse, responseDiffHtml, acceptResponse, openFormLinkDialog } from './teacherForm.js';
import { buildPublicZip, qrSheetHtml, QR_CSS, buildPublicSite } from '../services/publicSite.js';
import { printHtml } from '../services/printService.js';

export function render(root, route) {
  const tab = route.params.tab || 'export';
  const data = store.get();
  const used = storageUsage();
  root.innerHTML = `
    <div class="page-head"><div><h1>💾 Import / Export</h1><p>Ma'lumotlar faqat shu brauzerda saqlanadi (${(used / 1024).toFixed(0)} KB / ~5 MB). Muntazam backup oling.</p></div></div>
    <div class="tabs" role="tablist">${[['export', '⬇️ Eksport'], ['json', '📦 JSON import'], ['bulk', '📥 Excel/CSV import'], ['responses', '📝 O‘qituvchi javoblari'], ['public', '🌐 Ommaviy sahifalar va QR'], ['backup', '🛟 Backup']].map(([k, n]) => `<button role="tab" class="${tab === k ? 'active' : ''}" data-tab="${k}">${n}</button>`).join('')}</div>
    <div data-body></div>`;
  root.querySelector('.tabs').addEventListener('click', (e) => { const t = e.target.closest('[data-tab]')?.dataset.tab; if (t) setParams({ tab: t }, false); });
  const body = root.querySelector('[data-body]');
  if (tab === 'export') exportTab(body, data);
  if (tab === 'json') jsonTab(body);
  if (tab === 'bulk') bulkTab(body, route);
  if (tab === 'backup') backupTab(body, data, used);
  if (tab === 'responses') responsesTab(body);
  if (tab === 'public') publicTab(body, data);
}

function exportTab(body, data) {
  body.innerHTML = `<div class="grid cols-2">
    <div class="card"><h2>📦 JSON (hammasi)</h2><p class="muted">Guruhlar, o‘qituvchilar, fanlar, yuklamalar, xonalar, vaqtlar, kalendar, jadval, almashtirishlar, sozlamalar — bitta faylda.</p><button class="btn primary" data-x="json">⬇️ JSON eksport</button></div>
    <div class="card"><h2>📊 CSV (Excel uchun)</h2><div class="btn-row">
      <button class="btn" data-csv="general">Umumiy jadval</button><button class="btn" data-csv="group">Guruh jadvali</button><button class="btn" data-csv="teacher">O‘qituvchi jadvali</button><button class="btn" data-csv="room">Auditoriya jadvali</button>
      <button class="btn" data-csv="unscheduled">Joylashtirilmaganlar</button><button class="btn" data-csv="subst">Almashtirishlar</button></div></div>
    <div class="card"><h2>📗 Excel (shablon formatida)</h2><p class="muted">Guruhlar, o‘qituvchilar, fanlar, xonalar, yuklama — alohida varaqlarda. Excel'da tahrirlab, qayta import qilish mumkin.</p><button class="btn" data-x="xlsx">⬇️ Excel eksport</button></div>
    <div class="card"><h2>📅 Kalendar (.ics)</h2><p class="muted">Google Calendar, Apple Calendar, Outlook yoki telefonga. Toq/juft haftalar, bayramlar va almashtirishlar hisobga olinadi. Vaqt zonasi: Asia/Tashkent.</p>
      <div class="form-grid"><label class="field">Kim uchun<select data-ics-type><option value="teacher">O‘qituvchi</option><option value="group">Guruh</option><option value="room">Auditoriya</option></select></label>
      <label class="field">Tanlang<select data-ics-id></select></label></div>
      <div class="btn-row mt"><button class="btn" data-x="ics">⬇️ .ics yuklab olish</button><button class="btn" data-x="icszip">🗜️ Barcha o‘qituvchilar (ZIP)</button></div></div>
    <div class="card"><h2>🖨️ Chop etish / PDF</h2><p class="muted">A4 landscape: umumiy, guruh, o‘qituvchi, auditoriya bo‘yicha va almashtirishlar varaqasi.</p><button class="btn" data-x="print">🖨️ Chop etish</button></div>
  </div>`;
  const fillIcs = () => {
    const t = body.querySelector('[data-ics-type]').value;
    const list = t === 'teacher' ? data.teachers.map((x) => [x.id, x.name]) : t === 'group' ? data.groups.map((x) => [x.id, x.name]) : data.rooms.map((x) => [x.id, x.number + '-xona']);
    body.querySelector('[data-ics-id]').innerHTML = list.map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join('');
  };
  fillIcs();
  body.querySelector('[data-ics-type]').addEventListener('change', fillIcs);
  body.addEventListener('click', async (e) => {
    const x = e.target.closest('[data-x]')?.dataset.x;
    const d = store.get();
    if (x === 'json') { exportJson(d); toastOk('JSON yuklab olindi.'); }
    if (x === 'xlsx') { exportAllXlsx(d, `smart-schedule-${todayStr()}.xlsx`); toastOk('Excel yuklab olindi.'); }
    if (x === 'print') openPrintDialog({});
    if (x === 'ics') {
      const type = body.querySelector('[data-ics-type]').value, id = body.querySelector('[data-ics-id]').value;
      if (!id) return toastErr('Tanlang.');
      const r = buildIcs(d, { type, id });
      download(`${safeFileName(r.name)}.ics`, r.ics, 'text/calendar;charset=utf-8');
      toastOk(`${r.count} ta takrorlanuvchi dars eksport qilindi.`);
    }
    if (x === 'icszip') {
      const zip = new JSZip();
      for (const t of d.teachers) { const r = buildIcs(d, { type: 'teacher', id: t.id }); zip.file(`${safeFileName(t.name)}.ics`, r.ics); }
      const blob = await zip.generateAsync({ type: 'blob' });
      download(`oqituvchilar-ics-${todayStr()}.zip`, blob);
      toastOk('ZIP yuklab olindi.');
    }
    const csv = e.target.closest('[data-csv]')?.dataset.csv;
    if (csv) {
      if (csv === 'unscheduled') downloadCsv(`joylashtirilmagan-${todayStr()}.csv`, unscheduledCsv(d, unscheduledList()));
      else if (csv === 'subst') downloadCsv(`almashtirishlar-${todayStr()}.csv`, substitutionsCsv(d));
      else downloadCsv(`jadval-${csv}-${todayStr()}.csv`, scheduleCsv(d, csv));
      toastOk('CSV yuklab olindi.');
    }
  });
}

function jsonTab(body) {
  body.innerHTML = `<div class="card"><h2>JSON import</h2>
    <p>Smart Schedule Builder'dan eksport qilingan yoki backup fayl. Import <b>atomik</b>: xato bo‘lsa mavjud ma'lumot o‘zgarmaydi. Importdan oldin avtomatik backup taklif qilinadi.</p>
    <button class="btn primary" data-pick>📂 JSON fayl tanlash</button><div data-res class="mt"></div></div>`;
  body.querySelector('[data-pick]').addEventListener('click', async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    const text = await readFile(f);
    const r = parseImport(text);
    const res = body.querySelector('[data-res]');
    if (!r.ok) { res.innerHTML = `<div class="alert err" role="alert">🔴<div><b>Import qilinmadi — mavjud ma'lumot o‘zgarmadi.</b><ul>${r.errors.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>`; return; }
    const s = r.summary;
    res.innerHTML = `<div class="alert ok">✅<div><b>${esc(f.name)}</b>: ${s.groups} guruh, ${s.teachers} o‘qituvchi, ${s.subjects} fan, ${s.workloads} yuklama, ${s.rooms} xona, ${s.timeslots} slot, ${s.lessons} dars, ${s.substitutions} almashtirish.</div></div>
      ${r.warnings.length ? `<div class="alert warn">⚠️<div><ul>${r.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div></div>` : ''}
      <label class="check"><input type="checkbox" data-bk checked> Importdan oldin joriy ma'lumotdan backup yuklab olish</label>
      <div class="btn-row mt"><button class="btn danger" data-apply>Mavjud ma'lumotlarni almashtirish</button></div>`;
    res.querySelector('[data-apply]').addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Ma\'lumotlarni almashtirish', message: 'Mavjud barcha ma\'lumotlar import qilinayotgan fayl bilan almashtirilsinmi? (Undo bilan qaytarish mumkin)', confirmLabel: 'Almashtirish', danger: true }))) return;
      if (res.querySelector('[data-bk]').checked) backup(store.get());
      try { store.replaceAll(r.data, 'JSON import'); toastOk('Import qilindi.'); }
      catch (e) { toastErr('Import xatosi — ma\'lumot o‘zgarmadi: ' + e.message); }
    });
  });
}

function bulkTab(body, route) {
  const entity = route.params.entity || 'groups';
  body.innerHTML = `
    <div class="card mb"><h2>1. Shablonni yuklab oling</h2>
      <p class="muted">Har bir shablonda o‘zbekcha ustun nomlari, namuna qatorlar va "Ko‘rsatma" varag‘i bor. Tavsiya etilgan tartib: Fanlar → Guruhlar → Auditoriyalar → O‘qituvchilar → O‘quv yuklamasi.</p>
      <div class="table-wrap"><table class="t"><tbody>${Object.entries(ENTITIES).map(([k, d]) => `<tr><td><b>${d.title}</b><br><small class="muted">${esc(d.help)}</small></td><td class="actions"><button class="btn xs" data-tpl="${k}|xlsx">⬇️ .xlsx</button> <button class="btn xs" data-tpl="${k}|csv">⬇️ .csv</button></td></tr>`).join('')}</tbody></table></div></div>
    <div class="card"><h2>2. Faylni import qiling</h2>
      <div class="form-grid"><label class="field">Nima import qilinadi<select data-entity>${Object.entries(ENTITIES).map(([k, d]) => `<option value="${k}" ${k === entity ? 'selected' : ''}>${d.title}</option>`).join('')}</select></label></div>
      <div class="btn-row mt"><button class="btn primary" data-pick>📂 Fayl tanlash (.xlsx, .xls, .csv)</button></div>
      <div data-res class="mt"></div></div>`;
  body.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tpl]')?.dataset.tpl;
    if (t) { const [k, f] = t.split('|'); downloadTemplate(k, f); }
  });
  body.querySelector('[data-entity]').addEventListener('change', (e) => setParams({ entity: e.target.value }));
  body.querySelector('[data-pick]').addEventListener('click', async () => {
    const ent = body.querySelector('[data-entity]').value;
    const f = await pickFile('.xlsx,.xls,.csv,text/csv');
    if (!f) return;
    let wb;
    try { wb = readWorkbook(await readFile(f, 'buffer'), { csv: /\.csv$/i.test(f.name) }); }
    catch (err) { return toastErr('Faylni o‘qib bo‘lmadi: ' + err.message); }
    const sheetName = wb.SheetNames.find((n) => n === ENTITIES[ent].sheet) || wb.SheetNames[0];
    const { header, rows } = sheetRows(wb, sheetName);
    if (!rows.length) return toastErr('Faylda ma\'lumot qatorlari yo‘q.');
    openBulkPreview(ent, f.name, header, rows);
  });
}

function openBulkPreview(entity, fileName, header, rows) {
  const def = ENTITIES[entity];
  const st = { map: autoMap(entity, header), mode: 'update', onlyValid: false, autoCreate: false };
  const body = document.createElement('div');
  const m = openModal({ title: `Import: ${def.title} — ${fileName}`, body, size: 'xl', actions: [] });
  const draw = () => {
    const res = analyze(store.get(), entity, header, rows, st.map, { autoCreate: st.autoCreate });
    const cnt = { new: 0, update: 0, error: 0 };
    for (const it of res.items) cnt[it.status]++;
    const missingReq = def.cols.filter((c) => c.req && st.map[c.key] === undefined);
    const miss = [...res.missing.subjects.values(), ...res.missing.teachers.values(), ...res.missing.groups.values()];
    body.innerHTML = `
      <details ${missingReq.length ? 'open' : ''} class="more"><summary>Ustunlarni moslashtirish ${missingReq.length ? `<span class="badge err">${missingReq.length} ta majburiy ustun topilmadi</span>` : '<span class="badge ok">avtomatik moslashtirildi</span>'}</summary>
        <div class="form-grid mt">${def.cols.map((c) => `<label class="field">${esc(c.label)}${c.req ? ' *' : ''}<select data-map="${c.key}"><option value="">— yo‘q —</option>${header.map((h, i) => `<option value="${i}" ${st.map[c.key] === i ? 'selected' : ''}>${esc(h || `(${i + 1}-ustun)`)}</option>`).join('')}</select></label>`).join('')}</div></details>
      <div class="row mt"><span class="badge ok">✅ yangi: ${cnt.new}</span><span class="badge info">🔄 yangilanadi: ${cnt.update}</span><span class="badge err">❌ xato: ${cnt.error}</span></div>
      <div class="form-grid mt">
        <label class="field">Rejim<select data-mode><option value="add" ${st.mode === 'add' ? 'selected' : ''}>Qo‘shish (mavjudlarga tegmaslik)</option><option value="update" ${st.mode === 'update' ? 'selected' : ''}>Nom bo‘yicha yangilash</option><option value="replace" ${st.mode === 'replace' ? 'selected' : ''}>Almashtirish (fayldagilar qoladi)</option></select></label>
        ${['teachers', 'workloads'].includes(entity) ? `<label class="check"><input type="checkbox" data-auto ${st.autoCreate ? 'checked' : ''}> Topilmagan bog‘liq obyektlarni avtomatik yaratish</label>` : ''}
        <label class="check"><input type="checkbox" data-only ${st.onlyValid ? 'checked' : ''}> Faqat to‘g‘ri qatorlarni import qilish</label>
      </div>
      ${miss.length && st.autoCreate ? `<div class="alert info">ℹ️<div>Avtomatik yaratiladi: ${miss.map(esc).join(', ')}</div></div>` : ''}
      <div class="table-wrap mt" style="max-height:48vh;overflow:auto"><table class="t"><thead><tr><th>Qator</th><th>Holat</th><th>Nomi</th><th>Xatolar</th></tr></thead><tbody>
        ${res.items.map((it) => `<tr><td>${it.n}</td><td>${it.status === 'new' ? '✅ yangi' : it.status === 'update' ? '🔄 yangilanadi' : '❌ xato'}</td><td>${esc(it.key)}</td><td>${it.errors.map((x) => `<div style="color:var(--danger)">${it.n}-qator: ${esc(x)}</div>`).join('')}</td></tr>`).join('')}
      </tbody></table></div>`;
    const blocked = missingReq.length || (cnt.error && !st.onlyValid) || !(cnt.new + cnt.update);
    m.setActions([
      { label: 'Bekor qilish' },
      { label: `Import qilish (${st.onlyValid ? cnt.new + cnt.update : res.items.length})`, kind: 'primary', disabled: !!blocked, onClick: async () => {
        if (st.mode === 'replace' && !(await confirmDialog({ title: 'Almashtirish rejimi', message: `Faylda yo‘q bo‘lgan barcha ${def.title.toLowerCase()} o‘chiriladi. Davom etasizmi?`, confirmLabel: 'Davom etish', danger: true }))) return false;
        try {
          let r;
          store.update(`Excel import: ${def.title}`, (d) => { r = applyImport(d, entity, analyze(d, entity, header, rows, st.map, { autoCreate: st.autoCreate }), { mode: st.mode, onlyValid: st.onlyValid }); });
          toast(`✅ Import: ${r.added} yangi, ${r.updated} yangilandi${r.skipped ? `, ${r.skipped} o‘tkazib yuborildi` : ''}${r.created ? `, ${r.created} bog‘liq obyekt yaratildi` : ''}.`, { type: 'ok', action: { label: 'Bekor qilish', onClick: () => store.undo() } });
        } catch (e) { toastErr(e.message); return false; }
      } },
    ]);
  };
  body.addEventListener('change', (e) => {
    const k = e.target.dataset.map;
    if (k !== undefined) { if (e.target.value === '') delete st.map[k]; else st.map[k] = Number(e.target.value); }
    if (e.target.dataset.mode !== undefined) st.mode = e.target.value;
    if (e.target.dataset.auto !== undefined) st.autoCreate = e.target.checked;
    if (e.target.dataset.only !== undefined) st.onlyValid = e.target.checked;
    draw();
  });
  draw();
}

function backupTab(body, data, used) {
  const snaps = store.snapshots();
  body.innerHTML = `<div class="grid cols-2">
    <div class="card"><h2>🛟 Backup yaratish</h2><p>Barcha ma'lumotlar bitta JSON faylga: <span class="mono">smart-schedule-backup-${todayStr()}.json</span></p><button class="btn primary" data-b="make">⬇️ Backup yaratish</button></div>
    <div class="card"><h2>♻️ Backup tiklash</h2><p>Xato bo‘lsa mavjud ma'lumot buzilmaydi.</p><button class="btn" data-b="restore">📂 Backup fayl tanlash</button></div>
    <div class="card"><h2>Xotira</h2><p>Ishlatilgan: <b>${(used / 1024).toFixed(1)} KB</b> / ~5 MB (${Math.round((used / 5242880) * 100)}%).</p>${used > 4e6 ? '<div class="alert warn">⚠️<div>Xotira to‘lib bormoqda — backup oling va eski snapshotlarni tozalang.</div></div>' : ''}
      <p class="muted">Undo tarixi: ${store.historyList().length} ta amal.</p></div>
    <div class="card"><h2>Jadval versiyalari (generatsiyadan oldin)</h2>${snaps.length ? `<ul class="list-plain">${snaps.map((s, i) => `<li class="row between"><span>${new Date(s.at).toLocaleString('uz-UZ')} · ${s.schedule?.lessons?.length || 0} dars</span><button class="btn xs" data-snap="${i}">↺ Tiklash</button></li>`).join('')}</ul>` : '<p class="muted">Hali yo‘q.</p>'}</div>
  </div>`;
  body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-b]')?.dataset.b;
    if (b === 'make') { backup(store.get()); toastOk('Backup yuklab olindi.'); }
    if (b === 'restore') {
      const f = await pickFile('.json,application/json');
      if (!f) return;
      const r = parseImport(await readFile(f));
      if (!r.ok) return openModal({ title: 'Tiklab bo‘lmadi', body: `<div class="alert err">🔴<div><b>Mavjud ma'lumot o‘zgarmadi.</b><ul>${r.errors.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>`, actions: [{ label: 'Yopish', kind: 'primary' }] });
      if (!(await confirmDialog({ title: 'Backup tiklash', message: `${f.name}: ${r.summary.groups} guruh, ${r.summary.teachers} o‘qituvchi, ${r.summary.lessons} dars. Joriy ma'lumotlar almashtirilsinmi?`, confirmLabel: 'Tiklash', danger: true }))) return;
      store.replaceAll(r.data, 'Backup tiklandi');
      toastOk('Backup tiklandi.');
    }
    const s = e.target.closest('[data-snap]')?.dataset.snap;
    if (s !== undefined && store.restoreSnapshot(Number(s))) toastOk('Jadval versiyasi tiklandi.');
  });
}

function responsesTab(body) {
  const data = store.get();
  body.innerHTML = `<div class="grid cols-2">
    <div class="card"><h2>1. Havolalarni yuboring</h2><p class="muted">Har bir o‘qituvchi uchun shaxsiy havola: u bo‘sh vaqtlarini belgilaydi va javob kodini sizga yuboradi (Telegram yoki email orqali).</p>
      <ul class="list-plain">${data.teachers.map((t) => `<li class="row between"><span>${esc(t.name)}${t.formAt ? ` <small class="badge ok">javob: ${new Date(t.formAt).toLocaleDateString('uz-UZ')}</small>` : ''}</span><button class="btn xs" data-link="${t.id}">🔗 Havola</button></li>`).join('') || '<li class="muted">O‘qituvchilar yo‘q.</li>'}</ul></div>
    <div class="card"><h2>2. Javob kodini joylashtiring</h2>
      <label class="field">Javob kodi (SSB1.… bilan boshlanadi) yoki JSON<textarea id="rsp-code" style="min-height:120px;font-family:ui-monospace,monospace;font-size:12px" placeholder="SSB1.eyJ0aWQiOi..."></textarea></label>
      <div class="btn-row mt"><button class="btn primary" data-a="check">🔍 Tekshirish</button><button class="btn" data-a="file">📂 Fayldan</button></div>
      <div data-res class="mt"></div></div></div>`;
  const show = (text) => {
    const res = body.querySelector('[data-res]');
    let r;
    try { r = previewResponse(text); } catch (e) { res.innerHTML = `<div class="alert err" role="alert">🔴<div>${esc(e.message)}</div></div>`; return; }
    res.innerHTML = responseDiffHtml(r) + `<div class="btn-row mt"><button class="btn primary" data-a="accept">✅ Qabul qilish</button></div>`;
    res.querySelector('[data-a=accept]').addEventListener('click', () => {
      acceptResponse(r.resp);
      toastOk(`${r.teacher.name}ning vaqtlari yangilandi.`, { action: { label: 'Bekor qilish', onClick: () => store.undo() } });
    });
  };
  body.addEventListener('click', async (e) => {
    const id = e.target.closest('[data-link]')?.dataset.link;
    if (id) openFormLinkDialog(id);
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'check') show(body.querySelector('#rsp-code').value);
    if (a === 'file') { const f = await pickFile('.json,.txt,application/json,text/plain'); if (f) { const t = await readFile(f); body.querySelector('#rsp-code').value = t; show(t); } }
  });
}

function publicTab(body, data) {
  const base = data.settings.publicBaseUrl || '';
  const { index } = buildPublicSite(data, { groups: true, rooms: true, teachers: false });
  body.innerHTML = `<div class="grid cols-2">
    <div class="card"><h2>🌐 Talabalar uchun sahifalar</h2>
      <p class="muted">Har bir guruh va xona uchun alohida, telefonga moslangan, faqat o‘qish uchun sahifa. E'lon qilingan (kuchdagi) jadval ishlatiladi. Bugungi kun va toq/juft hafta avtomatik belgilanadi.</p>
      <label class="field">Sahifalar joylashadigan manzil (QR kodlar uchun)<input id="pub-base" value="${esc(base)}" placeholder="https://login.github.io/jadval/"></label>
      <div class="multi mt"><label><input type="checkbox" id="pub-g" checked> Guruhlar (${data.groups.length})</label><label><input type="checkbox" id="pub-r" checked> Xonalar (${data.rooms.length})</label><label><input type="checkbox" id="pub-t"> O‘qituvchilar (${data.teachers.length})</label></div>
      <div class="btn-row mt"><button class="btn primary" data-a="zip">🗜️ ZIP yaratish</button><button class="btn" data-a="qr">🖨️ QR varaqalarni chop etish</button></div>
      <p class="muted mt">ZIP ichida: index.html, g/…, r/…, qr.html va yo‘riqnoma. Ularni GitHub Pages'dagi papkaga yuklang (masalan, repo ichida <span class="mono">jadval/</span>).</p></div>
    <div class="card"><h2>QR ko‘rinishi</h2>${base ? `<style>${QR_CSS}.qr-grid{grid-template-columns:repeat(auto-fill,minmax(170px,1fr))}.qr-card svg{width:120px;height:120px}</style>${qrSheetHtml(data, index.rooms.slice(0, 4), base)}` : '<p class="muted">Manzilni kiriting — QR kodlar shu yerda ko‘rinadi.</p>'}</div></div>`;
  const saveBase = () => {
    const v = body.querySelector('#pub-base').value.trim();
    if (v !== (store.get().settings.publicBaseUrl || '')) store.update('Ommaviy sahifalar manzili', (d) => { d.settings.publicBaseUrl = v; }, { history: false });
    return v;
  };
  body.querySelector('#pub-base').addEventListener('change', saveBase);
  body.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    const b = body.querySelector('#pub-base').value.trim();
    const opts = { groups: body.querySelector('#pub-g').checked, rooms: body.querySelector('#pub-r').checked, teachers: body.querySelector('#pub-t').checked, base: b };
    if (a === 'zip') {
      const blob = await buildPublicZip(store.get(), opts);
      download(`jadval-sahifalar-${todayStr()}.zip`, blob);
      toastOk('ZIP tayyor.');
    }
    if (a === 'qr') {
      if (!b) return toastErr('Avval sahifalar manzilini kiriting.');
      const { index: ix } = buildPublicSite(store.get(), opts);
      printHtml(`<style>${QR_CSS}</style><div class="pr-page">${qrSheetHtml(store.get(), [...ix.rooms, ...ix.groups, ...ix.teachers], b)}</div>`);
    }
  });
}
