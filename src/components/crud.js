// Umumiy CRUD sahifa: qidiruv, filter, saralash, faol/nofaol, tahrirlash, o‘chirish, bo‘sh holat
import { esc, highlight, debounce } from '../utils/dom.js';
import { emptyState } from './emptyState.js';
import { setParams } from '../router.js';

export function renderCrudPage(root, route, cfg) {
  const p = route.params;
  const st = { q: p.q || '', sort: p.sort || cfg.defaultSort || cfg.columns[0].key, dir: p.dir || 'asc', f: {} };
  for (const f of cfg.filters || []) st.f[f.key] = p['f_' + f.key] || '';

  root.innerHTML = `
    <div class="page-head">
      <div><h1>${cfg.icon || ''} ${esc(cfg.title)}</h1>${cfg.subtitle ? `<p>${cfg.subtitle}</p>` : ''}</div>
      <div class="btn-row">${cfg.headerActions || ''}<button class="btn primary" data-crud="add">＋ ${esc(cfg.addLabel || 'Qo‘shish')}</button></div>
    </div>
    ${cfg.topHtml ? cfg.topHtml() : ''}
    <div class="toolbar">
      <input type="search" data-q placeholder="Qidirish…" value="${esc(st.q)}" aria-label="${esc(cfg.title)} bo‘yicha qidirish">
      ${(cfg.filters || []).map((f) => `<select data-filter="${f.key}" aria-label="${esc(f.label)}"><option value="">${esc(f.label)}: barchasi</option>${f.options().map(([v, l]) => `<option value="${esc(v)}" ${String(v) === st.f[f.key] ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`).join('')}
      <span class="muted" data-count></span>
    </div>
    <div data-table></div>`;

  const tableEl = root.querySelector('[data-table]');
  const draw = () => {
    const all = cfg.items();
    let list = all.filter((it) => {
      if (st.q && !cfg.searchText(it).toLowerCase().includes(st.q.toLowerCase())) return false;
      for (const f of cfg.filters || []) if (st.f[f.key] && !f.test(it, st.f[f.key])) return false;
      return true;
    });
    const col = cfg.columns.find((c) => c.key === st.sort) || cfg.columns[0];
    const sv = col.sort || ((it) => it[col.key]);
    list.sort((a, b) => {
      const x = sv(a), y = sv(b);
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'uz', { numeric: true });
      return st.dir === 'asc' ? r : -r;
    });
    root.querySelector('[data-count]').textContent = `${list.length} / ${all.length}`;
    if (!all.length) {
      tableEl.innerHTML = `<div class="card">${emptyState({ icon: cfg.emptyIcon || '📭', title: cfg.emptyTitle || 'Hali hech narsa yo‘q', text: cfg.emptyText || '', actionHtml: `<button class="btn primary" data-crud="add">＋ ${esc(cfg.addLabel || 'Qo‘shish')}</button>${cfg.emptyExtra || ''}` })}</div>`;
      return;
    }
    if (!list.length) {
      tableEl.innerHTML = `<div class="card">${emptyState({ icon: '🔍', title: 'Hech narsa topilmadi', text: 'Qidiruv yoki filtrni o‘zgartiring.' })}</div>`;
      return;
    }
    tableEl.innerHTML = `<div class="table-wrap"><table class="t responsive"><thead><tr>
      ${cfg.columns.map((c) => `<th class="sortable ${c.num ? 'num' : ''}" data-sort="${c.key}" aria-sort="${st.sort === c.key ? (st.dir === 'asc' ? 'ascending' : 'descending') : 'none'}" tabindex="0">${esc(c.label)}${st.sort === c.key ? (st.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`).join('')}
      <th class="num">Amallar</th></tr></thead><tbody>
      ${list.map((it) => `<tr class="${it.active === false ? 'inactive' : ''}" data-id="${esc(it.id)}">
        ${cfg.columns.map((c) => `<td data-label="${esc(c.label)}" class="${c.num ? 'num' : ''}">${c.render ? c.render(it, st.q) : highlight(String(it[c.key] ?? ''), st.q)}</td>`).join('')}
        <td class="actions">
          ${cfg.extraActions ? cfg.extraActions(it) : ''}
          ${cfg.noToggle ? '' : `<button class="btn xs" data-crud="toggle" title="${it.active === false ? 'Faollashtirish' : 'Nofaol qilish'}" aria-label="${it.active === false ? 'Faollashtirish' : 'Nofaol qilish'}">${it.active === false ? '▶️' : '⏸️'}</button>`}
          <button class="btn xs" data-crud="edit" aria-label="Tahrirlash">✏️</button>
          <button class="btn xs danger-ghost" data-crud="del" aria-label="O‘chirish">🗑️</button>
        </td></tr>`).join('')}
      </tbody></table></div>`;
  };
  draw();

  const qInp = root.querySelector('[data-q]');
  qInp.addEventListener('input', debounce(() => { st.q = qInp.value; setParams({ q: st.q }); draw(); }, 150));
  root.querySelectorAll('[data-filter]').forEach((s) => s.addEventListener('change', () => { st.f[s.dataset.filter] = s.value; setParams({ ['f_' + s.dataset.filter]: s.value }); draw(); }));
  const sortBy = (k) => {
    if (st.sort === k) st.dir = st.dir === 'asc' ? 'desc' : 'asc';
    else { st.sort = k; st.dir = 'asc'; }
    setParams({ sort: st.sort, dir: st.dir });
    draw();
  };
  root.addEventListener('keydown', (e) => { const th = e.target.closest('[data-sort]'); if (th && e.key === 'Enter') sortBy(th.dataset.sort); });
  root.addEventListener('click', async (e) => {
    const th = e.target.closest('[data-sort]');
    if (th) return sortBy(th.dataset.sort);
    const btn = e.target.closest('[data-crud], [data-x]');
    if (!btn) return;
    const id = btn.closest('[data-id]')?.dataset.id;
    const item = id ? cfg.items().find((x) => x.id === id) : null;
    if (btn.dataset.crud === 'add') return cfg.onAdd();
    if (btn.dataset.x) return cfg.onExtra?.(btn.dataset.x, item, btn);
    if (!item) return;
    if (btn.dataset.crud === 'edit') cfg.onEdit(item);
    if (btn.dataset.crud === 'del') cfg.onDelete(item);
    if (btn.dataset.crud === 'toggle') cfg.onToggle(item);
  });
  root.querySelector('.page-head').addEventListener('click', (e) => {
    const b = e.target.closest('[data-head]');
    if (b) cfg.onHeader?.(b.dataset.head);
  });
}

// Forma yordamchilari
export function readForm(el) {
  const o = {};
  for (const inp of el.querySelectorAll('[name]')) {
    if (inp.type === 'checkbox') {
      if (inp.dataset.multi !== undefined) {
        o[inp.name] = o[inp.name] || [];
        if (inp.checked) o[inp.name].push(inp.value);
      } else o[inp.name] = inp.checked;
    } else if (inp.type === 'radio') {
      if (inp.checked) o[inp.name] = inp.value;
    } else if (inp.type === 'number') o[inp.name] = inp.value === '' ? '' : Number(inp.value);
    else o[inp.name] = inp.value;
  }
  return o;
}

export function showErrors(el, errors) {
  el.querySelectorAll('.err').forEach((x) => x.remove());
  el.querySelectorAll('.invalid').forEach((x) => x.classList.remove('invalid'));
  let first = null;
  for (const [name, msg] of Object.entries(errors)) {
    const inp = el.querySelector(`[name="${name}"]`);
    const holder = inp?.closest('label.field') || el.querySelector(`[data-err-for="${name}"]`) || el;
    if (inp) inp.classList.add('invalid');
    const s = document.createElement('span');
    s.className = 'err';
    s.setAttribute('role', 'alert');
    s.textContent = msg;
    holder.appendChild(s);
    if (!first) first = inp || holder;
  }
  first?.focus?.();
  return !Object.keys(errors).length;
}
