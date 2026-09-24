// Global qidiruv (Ctrl+K yoki /): o‘qituvchi, guruh, xona, fan, yuklama
import { openModal } from './modal.js';
import { store } from '../state/store.js';
import { ctx as getCtx } from '../state/selectors.js';
import { wlLabel } from '../scheduler/model.js';
import { highlight, debounce } from '../utils/dom.js';
import { go } from '../router.js';

export function searchIndex() {
  const d = store.get();
  const c = getCtx();
  const out = [];
  for (const t of d.teachers) out.push({ kind: 'O‘qituvchi', icon: '🧑‍🏫', text: t.name, sub: (t.subjectIds || []).map((s) => c.subjects.get(s)?.name).filter(Boolean).join(', '), go: ['schedule', { view: 'teacher', teacher: t.id }] });
  for (const g of d.groups) out.push({ kind: 'Guruh', icon: '👥', text: g.name, sub: `${g.studentCount} talaba · ${g.direction || ''}`, go: ['schedule', { view: 'group', group: g.id }] });
  for (const r of d.rooms) out.push({ kind: 'Auditoriya', icon: '🚪', text: r.number + '-xona', alt: r.number, sub: `${r.building || ''} bino · ${r.capacity} o‘rin`, go: ['schedule', { view: 'room', room: r.id }] });
  for (const s of d.subjects) out.push({ kind: 'Fan', icon: s.icon || '📘', text: s.name, alt: s.code, sub: s.code, go: ['schedule', { subject: s.id }] });
  for (const w of d.workloads) out.push({ kind: 'Yuklama', icon: '🧮', text: wlLabel(c, w), sub: c.teachers.get(w.teacherId)?.name || '', go: ['workloads', { q: wlLabel(c, w) }] });
  return out;
}

export function searchItems(q, index = searchIndex()) {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return index.filter((x) => [x.text, x.alt, x.sub].some((v) => v && String(v).toLowerCase().includes(s))).slice(0, 30);
}

export function openSearch() {
  if (document.querySelector('.modal-layer [data-gsearch]')) return;
  const body = document.createElement('div');
  body.innerHTML = `<input type="search" data-gsearch placeholder="Masalan: Zhang, 101-Xitoy, 205, Xitoy tili" aria-label="Global qidiruv" autocomplete="off">
    <div class="search-results" role="listbox" aria-live="polite"></div>
    <p class="muted" style="margin-top:8px;font-size:12px">↑↓ — tanlash, Enter — ochish, Esc — yopish</p>`;
  const m = openModal({ title: 'Qidiruv', body, actions: [] });
  const inp = body.querySelector('input');
  const res = body.querySelector('.search-results');
  const index = searchIndex();
  let items = [], sel = 0;
  const draw = () => {
    const q = inp.value;
    items = searchItems(q, index);
    if (!q.trim()) { res.innerHTML = '<p class="muted">Yozishni boshlang…</p>'; return; }
    if (!items.length) { res.innerHTML = '<p class="muted">Hech narsa topilmadi.</p>'; return; }
    res.innerHTML = items.map((x, i) => `<a href="#" role="option" aria-selected="${i === sel}" class="${i === sel ? 'sel' : ''}" data-i="${i}"><span aria-hidden="true">${x.icon}</span><span><b>${highlight(x.text, q)}</b><br><small>${highlight(x.sub || '', q)}</small></span><span class="kind">${x.kind}</span></a>`).join('');
  };
  const open = (i) => { const x = items[i]; if (!x) return; m.close(); go(...x.go); };
  inp.addEventListener('input', debounce(() => { sel = 0; draw(); }, 150));
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); draw(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
    if (e.key === 'Enter') { e.preventDefault(); open(sel); }
  });
  res.addEventListener('click', (e) => { const a = e.target.closest('[data-i]'); if (a) { e.preventDefault(); open(+a.dataset.i); } });
  draw();
}
