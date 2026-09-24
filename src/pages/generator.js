// Avtomatik jadval yaratish sahifasi
import { store } from '../state/store.js';
import { ctx as getCtx, counts } from '../state/selectors.js';
import { runGenerator } from '../services/schedulerRunner.js';
import { feasibility } from '../scheduler/feasibility.js';
import { confirmDialog } from '../components/modal.js';
import { toast, ok as toastOk, err as toastErr } from '../components/toast.js';
import { wlLabel } from '../scheduler/model.js';
import { SOFT_CODES, UNSCHEDULED_REASONS } from '../i18n/uz.js';
import { esc } from '../utils/dom.js';
import { go } from '../router.js';

const STAGES = [
  ['validate', 'Ma\'lumotlar tekshirilmoqda'],
  ['feasibility', 'Imkoniyat tahlili'],
  ['domain', 'Mumkin slotlar hisoblanmoqda'],
  ['placing', 'Darslar joylashtirilmoqda'],
  ['optimizing', 'Optimallashtirilmoqda'],
  ['checking', 'Konfliktlar tekshirilmoqda'],
  ['done', 'Tayyor'],
];

let running = null;
let form = { mode: 'optimal', keep: 'keepLocked', allGroups: true, allTeachers: true, allRooms: true, groupIds: [], teacherIds: [], roomIds: [], seed: '' };

export function render(root, route) {
  const data = store.get();
  const c = getCtx();
  const modes = data.settings.modes || { fast: 2000, optimal: 10000, max: 30000 };
  if (route.params.preset === 'unscheduled') form.keep = 'onlyUnscheduled';
  const feas = feasibility(c, null);
  const errs = feas.filter((x) => x.level === 'error');
  const warns = feas.filter((x) => x.level === 'warn');
  const last = data.schedule.lastRun;
  const hasData = data.workloads.length && data.rooms.length && data.teachers.length;

  root.innerHTML = `
    <div class="page-head"><div><h1>⚙️ Avtomatik jadval yaratish</h1><p>${esc(data.calendar.academicYear)} o‘quv yili, ${data.calendar.semester}-semestr · ${data.workloads.filter((w) => w.active !== false).length} ta faol yuklama</p></div></div>
    ${!hasData ? `<div class="alert warn">⚠️<div>Generatsiya uchun kamida bitta o‘qituvchi, auditoriya va o‘quv yuklamasi kerak. <a href="#/workloads">Yuklama qo‘shish</a></div></div>` : ''}
    <div class="grid cols-2">
      <form class="card" data-form>
        <h2>Sozlamalar</h2>
        <fieldset><legend>Qamrov</legend>
          ${scopeBlock('Groups', 'Barcha guruhlar', data.groups.map((g) => [g.id, g.name]), form.allGroups, form.groupIds)}
          ${scopeBlock('Teachers', 'Barcha o‘qituvchilar', data.teachers.map((t) => [t.id, t.name]), form.allTeachers, form.teacherIds)}
          ${scopeBlock('Rooms', 'Barcha auditoriyalar', data.rooms.map((r) => [r.id, r.number]), form.allRooms, form.roomIds)}
        </fieldset>
        <fieldset><legend>Optimallashtirish</legend>
          ${[['fast', 'Tez'], ['optimal', 'Optimal'], ['max', 'Maksimal optimal']].map(([k, n]) => `<label class="check" style="display:flex;margin:4px 0"><input type="radio" name="mode" value="${k}" ${form.mode === k ? 'checked' : ''}> ${n} <span class="muted">(~${Math.round(modes[k] / 1000)} soniya)</span></label>`).join('')}
        </fieldset>
        <fieldset><legend>Mavjud jadval</legend>
          <label class="check" style="display:flex;margin:4px 0"><input type="radio" name="keep" value="keepLocked" ${form.keep === 'keepLocked' ? 'checked' : ''}> Qulflangan va qo‘lda qo‘yilganlarni saqlab, qolganini qayta tuzish</label>
          <label class="check" style="display:flex;margin:4px 0"><input type="radio" name="keep" value="onlyUnscheduled" ${form.keep === 'onlyUnscheduled' ? 'checked' : ''}> Faqat joylashtirilmaganlarni joylashtirish</label>
          <label class="check" style="display:flex;margin:4px 0"><input type="radio" name="keep" value="replace" ${form.keep === 'replace' ? 'checked' : ''}> Almashtirish (faqat qulflanganlar qoladi)</label>
        </fieldset>
        <label class="field" style="max-width:260px">Seed (ixtiyoriy)<input name="seed" value="${esc(form.seed)}" placeholder="masalan 42"><span class="hint">Bir xil seed — bir xil natija</span></label>
        <div class="btn-row mt">
          <button type="submit" class="btn primary lg" ${running || !hasData ? 'disabled' : ''}>▶ JADVALNI YARATISH</button>
          ${running ? '<button type="button" class="btn danger" data-cancel>■ Bekor qilish</button>' : ''}
        </div>
      </form>
      <div>
        <div class="card" data-progress>${progressHtml(last ? { stage: 'done', pct: 100, text: `Oxirgi generatsiya: ${new Date(last.at).toLocaleString('uz-UZ')}` } : null)}</div>
        <div class="card">
          <h2>Imkoniyat tahlili</h2>
          ${errs.length ? `<div class="alert err" role="alert">🔴<div><b>To‘liq jadval tuzish imkonsiz. Sabablar:</b><ul>${errs.map((x) => `<li>${esc(x.msg)}</li>`).join('')}</ul><small>Baribir davom etishingiz mumkin — qolganlari "Joylashtirilmagan"ga tushadi.</small></div></div>` : '<div class="alert ok">✅<div>Matematik imkonsizlik aniqlanmadi.</div></div>'}
          ${warns.length ? `<div class="alert warn">🟠<div><b>Tig‘iz resurslar:</b><ul>${warns.map((x) => `<li>${esc(x.msg)}</li>`).join('')}</ul></div></div>` : ''}
          <a href="#/bottlenecks" class="btn sm">🔥 Tor joylar tahlili</a>
        </div>
      </div>
    </div>
    <div data-result>${last ? resultHtml(last, c) : ''}</div>`;

  const f = root.querySelector('[data-form]');
  f.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'mode') form.mode = t.value;
    if (t.name === 'keep') form.keep = t.value;
    if (t.dataset.all) { form['all' + t.dataset.all] = t.checked; root.querySelector(`[data-list="${t.dataset.all}"]`).style.display = t.checked ? 'none' : ''; }
    if (t.dataset.item) {
      const key = t.dataset.item.charAt(0).toLowerCase() + t.dataset.item.slice(1, -1) + 'Ids';
      form[key] = [...root.querySelectorAll(`[data-item="${t.dataset.item}"]:checked`)].map((x) => x.value);
    }
  });
  f.addEventListener('input', (e) => { if (e.target.name === 'seed') form.seed = e.target.value; });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (running) return;
    const d = store.get();
    if (form.keep === 'replace' && d.schedule.lessons.some((l) => !l.locked)) {
      if (!(await confirmDialog({ title: 'Jadvalni almashtirish', message: `Mavjud ${d.schedule.lessons.filter((l) => !l.locked).length} ta qulflanmagan dars (qo‘lda qo‘yilganlar ham) qayta tuziladi. Oldingi versiya "snapshot" sifatida saqlanadi.`, confirmLabel: 'Almashtirish', danger: true }))) return;
    }
    start(root);
  });
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-cancel]')) { running?.cancel(); }
    const a = e.target.closest('[data-go]')?.dataset.go;
    if (a) go(a);
    const snap = e.target.closest('[data-snap]');
    if (snap) {
      if (store.restoreSnapshot(Number(snap.dataset.snap))) toastOk('Oldingi jadval tiklandi.');
    }
  });
  if (running) root.querySelector('[data-progress]').innerHTML = progressHtml(running.last);
  if (route.params.autostart === '1' && !running && hasData) start(root);
}

function scopeBlock(key, label, items, all, sel) {
  return `<div style="margin-bottom:8px"><label class="check"><input type="checkbox" data-all="${key}" ${all ? 'checked' : ''}> ${label}</label>
    <div data-list="${key}" class="multi" style="margin-top:6px;${all ? 'display:none' : ''}">${items.map(([id, n]) => `<label><input type="checkbox" data-item="${key}" value="${id}" ${sel.includes(id) ? 'checked' : ''}> ${esc(n)}</label>`).join('')}</div></div>`;
}

function progressHtml(p) {
  if (!p) return `<h2>Jarayon</h2><p class="muted">Generator ishga tushirilmagan. U alohida oqimda (Web Worker) ishlaydi — interfeys qotmaydi.</p>`;
  const idx = STAGES.findIndex((s) => s[0] === p.stage);
  return `<h2>Jarayon</h2>
    <div class="progress" style="height:10px"><span style="width:${p.pct}%"></span></div>
    <p class="mt"><b>${esc(p.text || '')}</b> ${p.pct}%</p>
    <ul class="list-plain stage-list">${STAGES.map((s, i) => `<li class="${i < idx || p.stage === 'done' ? 'done' : i === idx ? 'cur' : ''}">${i < idx || p.stage === 'done' ? '✅' : i === idx ? '<span class="spinner"></span>' : '○'} ${s[1]}…</li>`).join('')}</ul>`;
}

function start(root) {
  const data = store.get();
  const scope = {};
  if (!form.allGroups) scope.groupIds = form.groupIds;
  if (!form.allTeachers) scope.teacherIds = form.teacherIds;
  if (!form.allRooms) scope.roomIds = form.roomIds;
  const options = { mode: form.mode, keep: form.keep, scope, seed: form.seed ? Number(form.seed) || form.seed : undefined };
  const job = runGenerator(data, options, (stage, pct, text) => {
    job.last = { stage, pct, text };
    const el = document.querySelector('[data-progress]');
    if (el) el.innerHTML = progressHtml(job.last);
  });
  running = job;
  job.last = { stage: 'validate', pct: 1, text: 'Boshlanmoqda…' };
  window.dispatchEvent(new Event('app:rerender'));
  job.promise.then((r) => {
    running = null;
    store.pushSnapshot('Generatsiyadan oldin');
    store.update(`Jadval avtomatik tuzildi (${r.stats.placed}/${r.stats.required})`, (d) => {
      d.schedule.lessons = r.lessons;
      d.schedule.lastRun = { at: new Date().toISOString(), stats: r.stats, unscheduled: r.unscheduled, feasibility: r.feasibility };
    });
    toastOk(`✅ ${r.stats.placed} ta dars joylashtirildi${r.stats.unscheduledCount ? `, ⚠️ ${r.stats.unscheduledCount} ta joylashmadi` : ''}.`, { action: { label: 'Bekor qilish', onClick: () => store.undo() } });
    setTimeout(() => document.querySelector('[data-result]')?.scrollIntoView({ behavior: 'smooth' }), 100);
  }).catch((e) => {
    running = null;
    if (e.cancelled) toast('Generatsiya bekor qilindi. Jadval o‘zgarmadi.');
    else toastErr('Generatsiya xatosi: ' + e.message);
    window.dispatchEvent(new Event('app:rerender'));
  });
}

function resultHtml(last, c) {
  const s = last.stats;
  const snaps = store.snapshots();
  const hard = counts().critical; // generator hard konflikt yaratmaydi; bular — qo‘lda kiritilgan yoki keyingi o‘zgarishlardan
  return `<div class="card mt">
    <div class="card-head"><h2>Natija</h2><small class="muted">${new Date(last.at).toLocaleString('uz-UZ')} · ${({ fast: 'Tez', optimal: 'Optimal', max: 'Maksimal' })[s.mode] || s.mode} · ${(s.elapsedMs / 1000).toFixed(1)} s · seed ${esc(s.seed)}</small></div>
    <div class="stats">
      <div class="stat ok"><span class="v">✅ ${s.placed}</span><span class="l">dars joylashtirildi (talabning ${s.coverage}%)</span></div>
      <div class="stat ${s.unscheduledCount ? 'warn' : ''}"><span class="v">⚠️ ${s.unscheduledCount}</span><span class="l">dars joylashtirilmadi</span></div>
      <div class="stat ${hard ? 'err' : 'ok'}"><span class="v">🔴 ${hard}</span><span class="l">hard konflikt jadvalda</span></div>
      <div class="stat"><span class="v">🟡 ${s.softWarnings}</span><span class="l">soft ogohlantirish</span></div>
      <div class="stat"><span class="v">📊 ${s.quality}%</span><span class="l">Optimallashtirish ko‘rsatkichi</span></div>
    </div>
    <div class="alert info mt">ℹ️<div>Bu mutlaq sifat bahosi emas. Bu ichki penalty tizimi asosida optimallashtirish qanchalik yaxshilaganini ko‘rsatadi: <span class="mono">100 × (1 − ${s.penalty} / ${Math.max(s.basePenalty, (s.placed || 1) * 50)})</span>. Qamrov (joylashtirilgan %) alohida ko‘rsatiladi. Joylashtirishdan keyingi penalty: ${s.basePenalty} → optimallashtirishdan keyin: ${s.penalty} (${s.iterations.toLocaleString()} iteratsiya).</div></div>
    <div class="grid cols-2 mt">
      <div><h3>Penalty taqsimoti</h3>
        ${Object.keys(s.breakdown || {}).length ? `<table class="t"><tbody>${Object.entries(s.breakdown).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td><span class="mono">${k}</span> ${esc(SOFT_CODES[k] || '')}</td><td class="num">${v}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Soft buzilishlar yo‘q. 🎉</p>'}
      </div>
      <div><h3>Joylashtirilmaganlar</h3>
        ${last.unscheduled?.length ? `<ul class="list-plain">${last.unscheduled.map((u) => { const wl = c.workloads.get(u.workloadId); return `<li><b>${esc(wl ? wlLabel(c, wl) : '?')}</b> — ${u.missing} ta<br><small><b>${esc(UNSCHEDULED_REASONS[u.code] || u.code)}.</b> ${esc(u.detail || '')}</small></li>`; }).join('')}</ul>
          <div class="btn-row mt"><button class="btn sm" data-go="unscheduled">🧩 Batafsil</button><button class="btn sm" data-go="advisor">💡 Maslahatchi</button></div>` : '<p class="muted">Barcha darslar joylashtirildi. 🎉</p>'}
      </div>
    </div>
    ${last.feasibility?.length ? `<details class="more mt"><summary>Imkoniyat tahlili (${last.feasibility.length})</summary><ul>${last.feasibility.map((x) => `<li>${x.level === 'error' ? '🔴' : '🟠'} ${esc(x.msg)}</li>`).join('')}</ul></details>` : ''}
    <div class="btn-row mt"><button class="btn primary" data-go="schedule">🗓️ Jadvalni ko‘rish</button><button class="btn" data-go="conflicts">🚨 Konfliktlar</button>
      ${snaps.length ? `<span class="muted">Oldingi versiyalar:</span>${snaps.map((sn, i) => `<button class="btn sm" data-snap="${i}" title="${esc(sn.label)}">↺ ${new Date(sn.at).toLocaleTimeString('uz-UZ')} (${sn.schedule?.lessons?.length || 0} dars)</button>`).join('')}` : ''}
    </div>
  </div>`;
}
