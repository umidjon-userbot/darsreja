// Availability matritsasi: qatorlar = kunlar, ustunlar = slotlar. Bosib yoki sudrab belgilash.
import { DAYS } from '../i18n/uz.js';
import { esc } from '../utils/dom.js';

export function availabilityMatrix({ days, slots, value = {}, onChange, statusFn }) {
  const state = {};
  for (const d of days) state[d] = new Set((value[d] || []).filter((s) => slots.some((x) => x.id === s)));
  const el = document.createElement('div');
  el.className = 'avm';
  const breakIdx = slots.findIndex((s) => s.joinableWithNext === false);
  const morning = slots.slice(0, breakIdx >= 0 ? breakIdx + 1 : Math.ceil(slots.length / 2)).map((s) => s.id);
  const afternoon = slots.filter((s) => !morning.includes(s.id)).map((s) => s.id);

  el.innerHTML = `
    <div class="avm-tools" role="toolbar" aria-label="Tez belgilash">
      <button type="button" class="btn xs" data-q="all">Hammasi</button>
      <button type="button" class="btn xs" data-q="none">Tozalash</button>
      <button type="button" class="btn xs" data-q="am">Ertalab</button>
      <button type="button" class="btn xs" data-q="pm">Tushdan keyin</button>
      <select class="btn xs" data-copy aria-label="Kundan nusxa olish" style="width:auto;min-height:24px;padding:2px 6px">
        <option value="">Kundan nusxa…</option>${days.map((d) => `<option value="${d}">${DAYS[d]} → hamma ish kunlariga</option>`).join('')}
      </select>
    </div>
    <table><thead><tr><th></th>${slots.map((s) => `<th title="${esc(s.start)}–${esc(s.end)}">${esc(s.name)}<br><span style="font-weight:400">${esc(s.start)}</span></th>`).join('')}</tr></thead>
    <tbody>${days.map((d) => `<tr><td class="day"><label class="check"><input type="checkbox" data-day="${d}"> ${DAYS[d]}</label></td>${slots.map((s) => `<td><button type="button" class="c" data-d="${d}" data-s="${s.id}" aria-label="${DAYS[d]} ${esc(s.name)}"></button></td>`).join('')}</tr>`).join('')}</tbody></table>
    <div class="avm-status" aria-live="polite"></div>`;

  const refresh = () => {
    for (const b of el.querySelectorAll('.c')) {
      const on = state[b.dataset.d].has(b.dataset.s);
      b.classList.toggle('on', on);
      b.textContent = on ? '✓' : '';
      b.setAttribute('aria-pressed', on);
    }
    for (const cb of el.querySelectorAll('[data-day]')) {
      const n = state[cb.dataset.day].size;
      cb.checked = n > 0;
      cb.indeterminate = n > 0 && n < slots.length;
    }
    const nd = days.filter((d) => state[d].size).length;
    const ns = days.reduce((a, d) => a + state[d].size, 0);
    el.querySelector('.avm-status').innerHTML = `Mavjud: <b>${nd}</b> kun, <b>${ns}</b> slot. ${statusFn ? statusFn(nd, ns) : ''}`;
    onChange?.(getValue());
  };
  const getValue = () => {
    const o = {};
    for (const d of days) o[d] = slots.filter((s) => state[d].has(s.id)).map((s) => s.id);
    return o;
  };

  // sudrab belgilash
  let painting = null;
  el.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.c');
    if (!b) return;
    e.preventDefault();
    const on = !state[b.dataset.d].has(b.dataset.s);
    painting = on;
    on ? state[b.dataset.d].add(b.dataset.s) : state[b.dataset.d].delete(b.dataset.s);
    refresh();
  });
  el.addEventListener('pointerover', (e) => {
    if (painting === null) return;
    const b = e.target.closest('.c');
    if (!b) return;
    painting ? state[b.dataset.d].add(b.dataset.s) : state[b.dataset.d].delete(b.dataset.s);
    refresh();
  });
  const stop = () => { painting = null; };
  window.addEventListener('pointerup', stop);
  el.addEventListener('keydown', (e) => {
    const b = e.target.closest('.c');
    if (b && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      const s = state[b.dataset.d];
      s.has(b.dataset.s) ? s.delete(b.dataset.s) : s.add(b.dataset.s);
      refresh();
    }
  });
  el.addEventListener('change', (e) => {
    const cb = e.target.closest('[data-day]');
    if (cb) {
      state[cb.dataset.day] = cb.checked ? new Set(slots.map((s) => s.id)) : new Set();
      refresh();
    }
    const cp = e.target.closest('[data-copy]');
    if (cp && cp.value) {
      const src = [...state[cp.value]];
      for (const d of days) if (d !== cp.value && (state[d].size || src.length)) state[d] = new Set(src);
      cp.value = '';
      refresh();
    }
  });
  el.addEventListener('click', (e) => {
    const q = e.target.closest('[data-q]')?.dataset.q;
    if (!q) return;
    for (const d of days) {
      if (q === 'all') state[d] = new Set(slots.map((s) => s.id));
      if (q === 'none') state[d] = new Set();
      if (q === 'am') state[d] = new Set(morning);
      if (q === 'pm') state[d] = new Set(afternoon);
    }
    refresh();
  });
  // DOM'dan chiqqanda listener'ni tozalash
  const mo = new MutationObserver(() => { if (!el.isConnected) { window.removeEventListener('pointerup', stop); mo.disconnect(); } });
  setTimeout(() => el.parentNode && mo.observe(document.body, { childList: true, subtree: true }), 0);
  setTimeout(refresh, 0);
  return { el, getValue, refresh };
}
