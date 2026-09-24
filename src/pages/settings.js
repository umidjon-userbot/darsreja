import { store } from '../state/store.js';
import { confirmDialog } from '../components/modal.js';
import { toast, ok as toastOk, err as toastErr } from '../components/toast.js';
import { readForm } from '../components/crud.js';
import { backup } from '../services/exportService.js';
import { buildDemo } from '../services/demoService.js';
import { DEFAULT_WEIGHTS, DEFAULT_MODES } from '../data/defaults.js';
import { DAYS, SOFT_CODES } from '../i18n/uz.js';
import { esc, pickFile, readFile } from '../utils/dom.js';
import { uid } from '../utils/id.js';
import { go } from '../router.js';
import { LANGS } from '../i18n/index.js';

const ALL_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export function render(root) {
  const d = store.get();
  const s = d.settings;
  const slots = [...d.timeslots].sort((a, b) => a.order - b.order);
  const w = { ...DEFAULT_WEIGHTS, ...s.weights };
  const usedTypes = new Set([...d.rooms.map((r) => r.type), ...d.subjects.map((x) => x.roomType), ...d.workloads.map((x) => x.roomType)].filter(Boolean));
  root.innerHTML = `
    <div class="page-head"><div><h1>🛠️ Sozlamalar</h1></div></div>
    <form data-form>
    <div class="grid cols-2">
      <div class="card"><h2>Muassasa</h2>
        <div class="form-grid">
          <label class="field span-all">Institut nomi<input name="instituteName" value="${esc(s.instituteName)}"></label>
          <div class="span-all row">${s.logo ? `<img src="${esc(s.logo)}" alt="Logo" style="height:48px;border-radius:8px;border:1px solid var(--border)">` : '<span class="muted">Logo yo‘q</span>'}
            <button type="button" class="btn sm" data-a="logo">🖼️ Logo yuklash</button>${s.logo ? '<button type="button" class="btn sm danger-ghost" data-a="nologo">O‘chirish</button>' : ''}</div>
        </div>
      </div>
      <div class="card"><h2>Ko‘rinish</h2>
        <div class="form-grid">
          <label class="field">Tema<select name="theme"><option value="system" ${s.theme === 'system' ? 'selected' : ''}>Tizimga mos</option><option value="light" ${s.theme === 'light' ? 'selected' : ''}>Yorug‘</option><option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Qorong‘i</option></select></label>
          <label class="field">Til<select name="language">${LANGS.map(([k, n]) => `<option value="${k}" ${(s.language || 'uz') === k ? 'selected' : ''}>${n}</option>`).join('')}</select><span class="hint">Rus va ingliz tillarida menyu, yuqori panel va umumiy tugmalar tarjima qilingan; sahifa matnlari o‘zbekcha.</span></label>
          <label class="check span-all"><input type="checkbox" name="autoSave" ${s.autoSave !== false ? 'checked' : ''}> Avtomatik saqlash (o‘chirilsa — "Saqlash" tugmasi chiqadi)</label>
          <label class="field">Backup eslatmasi (kun)<input type="number" min="0" max="90" name="backupReminderDays" value="${s.backupReminderDays ?? 7}"><span class="hint">0 — eslatma o‘chirilgan. Yoki 100 ta o‘zgarishdan keyin.</span></label>
          <label class="field span-all">Sayt manzili (o‘qituvchi formasi va QR uchun)<input name="publicBaseUrl" value="${esc(s.publicBaseUrl || '')}" placeholder="https://login.github.io/jadval/"></label>
        </div>
      </div>
      <div class="card"><h2>Hafta va darslar</h2>
        <div class="field"><span style="font-weight:550;font-size:13px">Ish kunlari</span><div class="multi">${ALL_DAYS.map((x) => `<label><input type="checkbox" data-multi name="workDays" value="${x}" ${s.workDays.includes(x) ? 'checked' : ''}> ${DAYS[x]}</label>`).join('')}</div></div>
        <div class="form-grid mt">
          <label class="field">Standart davomiylik<select name="defaultDurationSlots">${[1, 2, 3].map((n) => `<option value="${n}" ${s.defaultDurationSlots == n ? 'selected' : ''}>${n} slot</option>`).join('')}</select></label>
          <label class="field">Maks. ketma-ket (standart)<input type="number" min="1" name="maxConsecutive" value="${s.maxConsecutive || 3}"></label>
          <label class="field">1 para = akademik soat<input type="number" min="1" max="4" name="academicHoursPerSlot" value="${s.academicHoursPerSlot || 2}"></label>
        </div>
        <p class="mt"><a href="#/timeslots">🕒 Vaqtlarni (paralarni) sozlash →</a> · <a href="#/calendar">📆 Semestr kalendari →</a></p>
      </div>
      <div class="card"><h2>Smenalar</h2><p class="muted">Guruhga smena tanlanganda uning o‘quv vaqtlari shu slotlar bilan to‘ldiriladi.</p>
        ${[1, 2].map((k) => `<div class="field" style="margin-bottom:8px"><span style="font-weight:550;font-size:13px">${k}-smena</span><div class="multi">${slots.map((x) => `<label><input type="checkbox" data-multi name="shift${k}" value="${x.id}" ${(s.shifts?.[k] || []).includes(x.id) ? 'checked' : ''}> ${esc(x.name)}</label>`).join('')}</div></div>`).join('')}
      </div>
      <div class="card"><h2>Xona turlari</h2>
        <ul class="list-plain" data-types>${s.roomTypes.map((t) => `<li class="row"><input value="${esc(t.name)}" data-rt="${t.id}" aria-label="Tur nomi" style="flex:1"> <span class="mono muted">${t.id}</span>${usedTypes.has(t.id) || t.id === 'regular' ? '<span class="badge" title="Ishlatilmoqda">ishlatilmoqda</span>' : `<button type="button" class="btn xs danger-ghost" data-delrt="${t.id}" aria-label="O‘chirish">✕</button>`}</li>`).join('')}</ul>
        <div class="row mt"><input data-newrt placeholder="Yangi tur (masalan, Sport zali)" style="flex:1" aria-label="Yangi xona turi"><button type="button" class="btn sm" data-a="addrt">＋ Qo‘shish</button></div>
      </div>
      <div class="card"><h2>Almashtirish</h2>
        <label class="check"><input type="checkbox" name="allowOverLimit" ${s.substitution?.allowOverLimit ? 'checked' : ''}> Vaqtincha almashtirishda kunlik limitdan oshishga ruxsat (⚠️ ogohlantirish bilan)</label><br><br>
        <label class="check"><input type="checkbox" name="showUnqualified" ${s.substitution?.showUnqualified ? 'checked' : ''}> Malakasiz nomzodlarni standart ko‘rsatish</label><br><br>
        <label class="check"><input type="checkbox" name="unmarkedPastIsDone" ${s.unmarkedPastIsDone !== false ? 'checked' : ''}> Dars jurnalida belgilanmagan o‘tgan darslar "O‘tildi" hisoblansin</label>
      </div>
    </div>
    <div class="card mt"><div class="card-head"><h2>Generatsiya afzalliklari (soft penalty og‘irliklari)</h2><button type="button" class="btn sm" data-a="resetw">↺ Standart</button></div>
      <div class="form-grid">${Object.keys(DEFAULT_WEIGHTS).map((k) => { const code = k.split('_')[0]; return `<label class="field"><span><span class="mono">${k}</span> ${esc(SOFT_CODES[code] || '')}${k.includes('_') ? ` (${k.split('_')[1]})` : ''}</span><input type="number" min="0" step="1" name="w_${k}" value="${w[k]}"></label>`; }).join('')}</div>
      <h3 class="mt">Rejimlar vaqt byudjeti (soniya)</h3>
      <div class="form-grid">${Object.entries({ fast: 'Tez', optimal: 'Optimal', max: 'Maksimal' }).map(([k, n]) => `<label class="field">${n}<input type="number" min="1" max="300" name="m_${k}" value="${Math.round((s.modes?.[k] || DEFAULT_MODES[k]) / 1000)}"></label>`).join('')}</div>
    </div>
    <div class="btn-row mt"><button class="btn primary lg" type="submit">💾 Sozlamalarni saqlash</button></div>
    </form>
    <div class="card mt"><h2>Ma'lumotlar</h2>
      <div class="btn-row"><button class="btn" data-a="demo">🎓 Demo ma'lumotlarni yuklash</button><button class="btn" data-a="backup">🛟 Backup</button><button class="btn danger" data-a="clear">🗑️ Barcha ma'lumotlarni tozalash</button></div>
    </div>`;

  const form = root.querySelector('[data-form]');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = readForm(form);
    if (!(f.workDays || []).length) return toastErr('Kamida bitta ish kuni tanlang.');
    const weights = {};
    for (const k of Object.keys(DEFAULT_WEIGHTS)) { const v = Number(f['w_' + k]); weights[k] = v >= 0 ? v : DEFAULT_WEIGHTS[k]; }
    const modes = {};
    for (const k of ['fast', 'optimal', 'max']) modes[k] = Math.max(1, Math.min(300, Number(f['m_' + k]) || DEFAULT_MODES[k] / 1000)) * 1000;
    const roomTypes = s.roomTypes.map((t) => ({ ...t, name: root.querySelector(`[data-rt="${t.id}"]`)?.value.trim() || t.name }));
    store.update('Sozlamalar saqlandi', (dd) => {
      Object.assign(dd.settings, {
        instituteName: f.instituteName.trim() || 'Mening o‘quv muassasam', theme: f.theme, autoSave: f.autoSave, language: f.language || 'uz',
        backupReminderDays: Math.max(0, Number(f.backupReminderDays) || 0), publicBaseUrl: (f.publicBaseUrl || '').trim(),
        workDays: ALL_DAYS.filter((x) => f.workDays.includes(x)), defaultDurationSlots: Number(f.defaultDurationSlots), maxConsecutive: Number(f.maxConsecutive) || 3,
        academicHoursPerSlot: Number(f.academicHoursPerSlot) || 2, shifts: { 1: f.shift1 || [], 2: f.shift2 || [] }, roomTypes, weights, modes,
        substitution: { allowOverLimit: f.allowOverLimit, showUnqualified: f.showUnqualified }, unmarkedPastIsDone: f.unmarkedPastIsDone,
      });
    }, { forceSave: true });
    toastOk('Sozlamalar saqlandi.');
  });
  root.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'logo') {
      const f = await pickFile('image/*');
      if (!f) return;
      try {
        const url = await compressImage(await readFile(f, 'dataurl'));
        store.update('Logo yuklandi', (dd) => { dd.settings.logo = url; });
        toastOk('Logo saqlandi.');
      } catch (err) { toastErr('Rasmni o‘qib bo‘lmadi: ' + err.message); }
    }
    if (a === 'nologo') store.update('Logo o‘chirildi', (dd) => { dd.settings.logo = null; });
    if (a === 'addrt') {
      const name = root.querySelector('[data-newrt]').value.trim();
      if (!name) return;
      if (s.roomTypes.some((t) => t.name.toLowerCase() === name.toLowerCase())) return toastErr('Bunday tur bor.');
      store.update('Xona turi qo‘shildi', (dd) => { dd.settings.roomTypes.push({ id: uid('rt'), name }); });
    }
    const del = e.target.closest('[data-delrt]')?.dataset.delrt;
    if (del) store.update('Xona turi o‘chirildi', (dd) => { dd.settings.roomTypes = dd.settings.roomTypes.filter((t) => t.id !== del); });
    if (a === 'resetw') store.update('Og‘irliklar tiklandi', (dd) => { dd.settings.weights = { ...DEFAULT_WEIGHTS }; dd.settings.modes = { ...DEFAULT_MODES }; });
    if (a === 'backup') backup(store.get());
    if (a === 'demo') {
      if (!(await confirmDialog({ title: 'Demo ma\'lumotlar', message: 'Joriy ma\'lumotlar demo bilan almashtiriladi (Undo bilan qaytarish mumkin). Davom etasizmi?', confirmLabel: 'Yuklash' }))) return;
      store.replaceAll(buildDemo(), 'Demo ma\'lumot yuklandi');
      toastOk('Demo yuklandi.');
      go('dashboard');
    }
    if (a === 'clear') {
      if (!(await confirmDialog({ title: 'Barcha ma\'lumotlarni tozalash', message: 'Guruhlar, o‘qituvchilar, jadval, tarix — hammasi o‘chiriladi. Buni qaytarib bo‘lmaydi. Avval backup olishingizni tavsiya qilamiz.', confirmLabel: 'Davom etish', danger: true }))) return;
      const doBackup = await confirmDialog({ title: 'Backup', message: 'Tozalashdan oldin backup yuklab olinsinmi?', confirmLabel: 'Ha, backup olish' });
      if (doBackup) backup(store.get());
      if (!(await confirmDialog({ title: 'Oxirgi tasdiq', message: 'Barcha ma\'lumotlar butunlay o‘chiriladi.', confirmLabel: 'Tozalash', danger: true, requireText: 'TOZALASH' }))) return;
      store.clearEverything();
      toast('Barcha ma\'lumotlar tozalandi.');
      location.hash = '#/dashboard';
      location.reload();
    }
  });
}

function compressImage(dataUrl, max = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      let out = c.toDataURL('image/png');
      if (out.length > 200000) out = c.toDataURL('image/jpeg', 0.8);
      resolve(out);
    };
    img.onerror = () => reject(new Error('rasm formati noto‘g‘ri'));
    img.src = dataUrl;
  });
}
