// 📝 O‘qituvchi uchun availability formasi (alohida sahifa, admin ma'lumotlarisiz ishlaydi)
// + admin tomoni: havola yaratish va javobni import qilish
import { b64urlDecode, encodeResponse, formLink, decodeResponse, responseDiff, applyResponse } from '../services/formCodec.js';
import { availabilityMatrix } from '../components/availabilityMatrix.js';
import { openModal } from '../components/modal.js';
import { ok as toastOk, err as toastErr } from '../components/toast.js';
import { store } from '../state/store.js';
import { buildContext, wlLabel } from '../scheduler/model.js';
import { Occupancy, checkPlacement } from '../scheduler/constraintChecker.js';
import { DAYS } from '../i18n/uz.js';
import { esc, download } from '../utils/dom.js';

// --- O‘qituvchi ko‘radigan sahifa -----------------------------------------
export function renderTeacherForm(app, route) {
  let p;
  try { p = b64urlDecode(route.params.d || ''); } catch { p = null; }
  if (!p || !p.tid) {
    app.innerHTML = `<div class="content" style="max-width:640px;margin:40px auto"><div class="alert err">🔴<div><b>Havola noto‘g‘ri yoki to‘liq emas.</b> Adminstratordan havolani qayta so‘rang.</div></div></div>`;
    return;
  }
  const slots = p.slots.map((s, i) => ({ id: s.id, name: s.n, start: s.a, end: s.b, order: i + 1, joinableWithNext: true }));
  app.innerHTML = `
    <main class="content" style="max-width:900px;margin:0 auto">
      <div class="page-head"><div><h1>📝 Bo‘sh vaqtlaringizni belgilang</h1><p>${esc(p.inst || '')} · ${esc(p.sem || '')}</p></div></div>
      <div class="card">
        <h2>${esc(p.name)}</h2>
        <p class="text-2">Dars bera oladigan paralaringizni belgilang (bosing yoki sudrang). Yashil — mavjud. Keyin <b>"Javob kodini yaratish"</b>ni bosing va kodni o‘quv bo‘limiga yuboring (Telegram, email).</p>
        ${p.lim ? `<p class="muted">Joriy limitlar: haftasiga ${p.lim.minD}–${p.lim.maxD} ish kuni, ko‘pi bilan ${p.lim.maxW} dars.</p>` : ''}
        <div data-av></div>
        <fieldset class="mt"><legend>Afzal kunlar (ixtiyoriy)</legend><div class="multi">${p.days.map((d) => `<label><input type="checkbox" data-pd value="${d}" ${p.pd?.includes(d) ? 'checked' : ''}> ${DAYS[d]}</label>`).join('')}</div></fieldset>
        <fieldset><legend>Afzal paralar (ixtiyoriy)</legend><div class="multi">${slots.map((s) => `<label><input type="checkbox" data-ps value="${s.id}" ${p.ps?.includes(s.id) ? 'checked' : ''}> ${esc(s.name)} ${s.start}</label>`).join('')}</div></fieldset>
        <label class="field">Izoh (ixtiyoriy)<textarea id="tf-note" placeholder="Masalan: juma kunlari faqat tushgacha"></textarea></label>
        <div class="btn-row mt"><button class="btn primary lg" data-go>✅ Javob kodini yaratish</button></div>
        <div data-out class="mt"></div>
      </div>
      <p class="muted" style="margin-top:12px">Smart Schedule Builder · bu sahifa hech qanday ma'lumotni serverga yubormaydi.</p>
    </main>`;
  const avm = availabilityMatrix({ days: p.days, slots, value: p.av || {} });
  app.querySelector('[data-av]').appendChild(avm.el);
  app.querySelector('[data-go]').addEventListener('click', () => {
    const resp = {
      tid: p.tid, name: p.name, av: avm.getValue(),
      pd: [...app.querySelectorAll('[data-pd]:checked')].map((x) => x.value),
      ps: [...app.querySelectorAll('[data-ps]:checked')].map((x) => x.value),
      note: app.querySelector('#tf-note').value.trim(), at: new Date().toISOString(),
    };
    const total = Object.values(resp.av).reduce((a, x) => a + x.length, 0);
    if (!total) { toastErr('Kamida bitta parani belgilang.'); return; }
    const code = encodeResponse(resp);
    const out = app.querySelector('[data-out]');
    out.innerHTML = `<div class="alert ok">✅<div><b>Tayyor!</b> Quyidagi kodni to‘liq nusxalab, o‘quv bo‘limiga yuboring.</div></div>
      <textarea id="tf-code" readonly style="min-height:110px;font-family:ui-monospace,monospace;font-size:12px">${esc(code)}</textarea>
      <div class="btn-row mt"><button class="btn primary" data-copy>📋 Nusxalash</button><button class="btn" data-file>⬇️ Fayl sifatida yuklab olish</button></div>`;
    out.querySelector('[data-copy]').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(code); toastOk('Nusxalandi.'); }
      catch { const ta = out.querySelector('#tf-code'); ta.focus(); ta.select(); toastOk('Kod belgilandi — Ctrl+C bosing.'); }
    });
    out.querySelector('[data-file]').addEventListener('click', () => download(`javob-${p.name.replace(/\s+/g, '_')}.json`, JSON.stringify({ ...resp, type: 'availability-response', v: 1 }, null, 2)));
    out.scrollIntoView({ behavior: 'smooth' });
  });
}

// --- Admin: havola yaratish ------------------------------------------------
export function openFormLinkDialog(teacherId) {
  const data = store.get();
  const t = data.teachers.find((x) => x.id === teacherId);
  const base = data.settings.publicBaseUrl || location.href.replace(/#.*$/, '');
  const link = formLink(data, teacherId, base);
  const body = document.createElement('div');
  body.innerHTML = `<p><b>${esc(t.name)}</b> uchun shaxsiy forma havolasi. O‘qituvchi uni telefon yoki kompyuterda ochadi, vaqtlarini belgilaydi va javob kodini sizga yuboradi. Keyin <b>Import / Export → O‘qituvchi javoblari</b>da kodni joylashtirasiz.</p>
    <textarea id="fl-link" readonly style="min-height:90px;font-size:12px">${esc(link)}</textarea>
    ${location.protocol === 'file:' || !data.settings.publicBaseUrl ? '<div class="alert warn mt">⚠️<div>Havola o‘qituvchida ishlashi uchun ilova internetda (GitHub Pages) joylashgan bo‘lishi kerak. Sayt manzilini <b>Sozlamalar → Sayt manzili</b>ga kiriting.</div></div>' : ''}`;
  openModal({
    title: '📝 O‘qituvchi formasi havolasi', body,
    actions: [{ label: 'Yopish' }, { label: '📋 Nusxalash', kind: 'primary', onClick: async () => {
      try { await navigator.clipboard.writeText(link); toastOk('Havola nusxalandi.'); }
      catch { const ta = body.querySelector('#fl-link'); ta.focus(); ta.select(); toastOk('Havola belgilandi — Ctrl+C bosing.'); }
      return false;
    } }],
  });
}

// --- Admin: javobni import qilish -----------------------------------------
export function previewResponse(text) {
  const data = store.get();
  const resp = decodeResponse(text);
  const diff = responseDiff(data, resp);
  if (!diff.teacher) throw new Error(`"${resp.name}" nomli o‘qituvchi topilmadi.`);
  // Yangi availability'dan tashqarida qoladigan mavjud darslar
  const d2 = JSON.parse(JSON.stringify(data));
  applyResponse(d2, resp);
  const ctx = buildContext(d2);
  const occ = new Occupancy(ctx);
  const outside = [];
  for (const l of d2.schedule.lessons) {
    const wl = ctx.workloads.get(l.workloadId);
    if (!wl || wl.teacherId !== diff.teacher.id) continue;
    const v = checkPlacement(ctx, occ, { wl, day: l.day, slotId: l.slotId, roomId: l.roomId, parity: l.weekParity }, { skipCount: true }).filter((x) => x.code === 'H4' || x.code === 'H5');
    if (v.length) outside.push({ l, wl, msg: v[0].msg });
  }
  return { resp, ...diff, outside, ctx };
}

export function responseDiffHtml(r) {
  const ctx = r.ctx;
  const cells = ctx.workDays.map((d) => {
    const cur = new Set(r.teacher.availability?.[d] || []);
    const nw = new Set(r.resp.av?.[d] || []);
    return `<tr><td class="day">${DAYS[d]}</td>${ctx.slots.map((s) => {
      const a = cur.has(s.id), b = nw.has(s.id);
      const [bg, t] = a && b ? ['var(--success-soft)', '✓'] : b ? ['var(--info-soft)', '＋'] : a ? ['var(--danger-soft)', '−'] : ['var(--surface-2)', ''];
      return `<td><span class="c" style="background:${bg};cursor:default" title="${a && b ? 'o‘zgarmadi' : b ? 'qo‘shildi' : a ? 'olib tashlandi' : ''}">${t}</span></td>`;
    }).join('')}</tr>`;
  }).join('');
  return `<p><b>${esc(r.teacher.name)}</b> · ${r.resp.at ? new Date(r.resp.at).toLocaleString('uz-UZ') : ''}${r.resp.note ? ` · <i>"${esc(r.resp.note)}"</i>` : ''}</p>
    <div class="avm"><table><thead><tr><th></th>${ctx.slots.map((s) => `<th>${esc(s.name)}</th>`).join('')}</tr></thead><tbody>${cells}</tbody></table></div>
    <p class="muted">✓ o‘zgarmadi · <span style="color:var(--info)">＋ qo‘shildi (${r.added.length})</span> · <span style="color:var(--danger)">− olib tashlandi (${r.removed.length})</span></p>
    ${r.outside.length ? `<div class="alert warn">⚠️<div><b>${r.outside.length} ta mavjud dars yangi vaqtlardan tashqarida qoladi</b> (konflikt sifatida ko‘rinadi; generator yoki maslahatchi bilan qayta joylashtiring):<ul>${r.outside.slice(0, 8).map((o) => `<li>${esc(wlLabel(ctx, o.wl))} — ${esc(o.msg)}</li>`).join('')}</ul></div></div>` : '<div class="alert ok">✅<div>Mavjud darslarning barchasi yangi vaqtlarga sig‘adi.</div></div>'}`;
}

export function acceptResponse(resp) {
  let t;
  store.update(`O‘qituvchi javobi qabul qilindi: ${resp.name}`, (d) => { t = applyResponse(d, resp); });
  return t;
}
