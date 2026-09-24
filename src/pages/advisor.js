// 💡 "Nima o‘zgarsa joylashadi?" maslahatchisi
import { store } from '../state/store.js';
import { ctx as getCtx } from '../state/selectors.js';
import { adviseWorkload, applySuggestion, unscheduledWorkloads, globalAdvice } from '../analysis/advisor.js';
import { confirmDialog } from '../components/modal.js';
import { toast, err as toastErr } from '../components/toast.js';
import { emptyState } from '../components/emptyState.js';
import { wlLabel } from '../scheduler/model.js';
import { esc } from '../utils/dom.js';

const W_LABEL = { light: ['Yengil', 'ok'], medium: ['O‘rta', 'warn'], heavy: ['Og‘ir', 'err'] };
let cache = { rev: -1, map: new Map() };

export function render(root, route) {
  const data = store.get();
  const c = getCtx();
  if (cache.rev !== store.rev) cache = { rev: store.rev, map: new Map() };
  const list = unscheduledWorkloads(data);
  const focus = route.params.wl;
  list.sort((a, b) => (a.wl.id === focus ? -1 : b.wl.id === focus ? 1 : 0));
  let global = [];
  try { global = globalAdvice(data); } catch (e) { console.error(e); }
  root.innerHTML = `
    <div class="page-head"><div><h1>💡 Maslahatchi</h1><p>Har bir joylashtirilmagan dars uchun cheklovlarni bittadan yumshatib, qisman generatsiyani simulyatsiya qiladi va aniq yechim taklif qiladi.</p></div></div>
    ${global.length ? `<div class="card mb"><h2>Umumiy maslahatlar</h2><ul>${global.map((g) => `<li>${esc(g)}</li>`).join('')}</ul></div>` : ''}
    ${list.length ? list.map(({ wl, missing }) => `<div class="card" data-wl="${wl.id}">
        <div class="card-head"><h3>💡 ${esc(wlLabel(c, wl))} · ${esc(c.teachers.get(wl.teacherId)?.name || '')}</h3><span class="badge warn">${missing} ta dars joylashmadi</span></div>
        <div data-sug><p class="row muted"><span class="spinner"></span> Variantlar simulyatsiya qilinmoqda…</p></div>
      </div>`).join('') : `<div class="card">${emptyState({ icon: '🎉', title: 'Joylashtirilmagan darslar yo‘q', text: 'Maslahatchi faqat joylashmay qolgan darslar uchun ishlaydi.' })}</div>`}`;

  // Navbat bilan hisoblash (UI qotmasligi uchun)
  let i = 0;
  let alive = true;
  const step = () => {
    if (!alive || i >= list.length) return;
    const { wl } = list[i++];
    const card = root.querySelector(`[data-wl="${wl.id}"] [data-sug]`);
    if (!card) return;
    let sugs = cache.map.get(wl.id);
    if (!sugs) {
      try { sugs = adviseWorkload(store.get(), wl.id); } catch (e) { console.error(e); sugs = []; }
      cache.map.set(wl.id, sugs);
    }
    card.innerHTML = sugs.length ? `<ol class="list-plain">${sugs.map((s, k) => `<li class="row between"><div style="flex:1;min-width:220px"><b>${k + 1}. ${esc(s.title)}</b> → <b style="color:var(--success)">${s.gain} dars joylashadi</b><br><small class="muted">${esc(s.detail)}</small></div>
        <span class="badge ${W_LABEL[s.weight][1]}" title="O‘zgarish og‘irligi">${W_LABEL[s.weight][0]}</span>
        <button class="btn sm primary" data-apply="${wl.id}|${k}">Qo‘llash</button></li>`).join('')}</ol>`
      : `<div class="alert warn">⚠️<div>Bitta cheklovni yumshatish yetarli emas. Bir nechta o‘zgarish kerak: o‘qituvchi, guruh va xona mavjudligini birgalikda ko‘rib chiqing yoki <a href="#/bottlenecks">Tor joylar</a> tahliliga qarang.</div></div>`;
    setTimeout(step, 10);
  };
  setTimeout(step, 30);

  root.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-apply]')?.dataset.apply;
    if (!a) return;
    const [wlId, k] = a.split('|');
    const s = cache.map.get(wlId)?.[+k];
    if (!s) return;
    if (s.confirm && !(await confirmDialog({ title: 'Tasdiqlang', message: `${s.title}. ${s.confirm}`, confirmLabel: 'Ha, qo‘llash' }))) return;
    try {
      let placed = 0;
      store.update(`Maslahat qo‘llandi: ${s.title}`, (d) => { placed = applySuggestion(d, s); });
      toast(placed > 0 ? `✅ ${placed} ta dars joylashdi.` : 'O‘zgarish kiritildi, lekin dars joylashmadi.', { type: placed > 0 ? 'ok' : '', action: { label: 'Bekor qilish', onClick: () => store.undo() } });
    } catch (err) { toastErr(err.message); }
  });
  return () => { alive = false; };
}
