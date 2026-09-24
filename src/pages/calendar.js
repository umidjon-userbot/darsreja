import { store } from '../state/store.js';
import { readForm, showErrors } from '../components/crud.js';
import { ok as toastOk, err as toastErr } from '../components/toast.js';
import { validateCalendar } from '../validation/validators.js';
import { weekParity, weekIndex } from '../substitution/calendarResolver.js';
import { todayStr, fmtHuman, isValidDate, diffDays } from '../utils/date.js';
import { esc } from '../utils/dom.js';
import { PARITY } from '../i18n/uz.js';

export function render(root) {
  const cal = store.get().calendar;
  const today = todayStr();
  const inSem = today >= cal.startDate && today <= cal.endDate;
  const weeks = Math.ceil((diffDays(cal.startDate, cal.endDate) + 1) / 7);
  root.innerHTML = `
    <div class="page-head"><div><h1>📆 Semestr kalendari</h1><p>Asosiy jadval — haftalik shablon. Aniq sanadagi holat = shablon + toq/juft hafta + bayramlar + almashtirishlar.</p></div></div>
    <div class="stats mb">
      <div class="stat"><span class="l">Bugun</span><span class="v" style="font-size:18px">${fmtHuman(today)}</span></div>
      <div class="stat"><span class="l">Joriy hafta</span><span class="v" style="font-size:18px">${inSem ? `${weekIndex(cal, today) + 1}-hafta · ${PARITY[weekParity(cal, today)]}` : 'Semestrdan tashqari'}</span></div>
      <div class="stat"><span class="l">Semestr davomiyligi</span><span class="v" style="font-size:18px">${weeks} hafta</span></div>
      <div class="stat"><span class="l">Bayramlar</span><span class="v" style="font-size:18px">${(cal.holidays || []).length} kun</span></div>
    </div>
    <div class="grid cols-2">
      <form class="card" data-cal>
        <h2>Semestr</h2>
        <div class="form-grid">
          <label class="field">O‘quv yili<input name="academicYear" value="${esc(cal.academicYear)}" placeholder="2026/2027"></label>
          <label class="field">Semestr<select name="semester"><option value="1" ${cal.semester == 1 ? 'selected' : ''}>1-semestr</option><option value="2" ${cal.semester == 2 ? 'selected' : ''}>2-semestr</option></select></label>
          <label class="field">Boshlanish<input name="startDate" type="date" value="${esc(cal.startDate)}"></label>
          <label class="field">Tugash<input name="endDate" type="date" value="${esc(cal.endDate)}"></label>
          <label class="field span-2">Birinchi hafta<select name="firstWeekParity"><option value="odd" ${cal.firstWeekParity === 'odd' ? 'selected' : ''}>Toq (surat)</option><option value="even" ${cal.firstWeekParity === 'even' ? 'selected' : ''}>Juft (maxraj)</option></select></label>
        </div>
        <div class="btn-row mt"><button class="btn primary" type="submit">Saqlash</button></div>
      </form>
      <div class="card">
        <h2>Bayram va dam olish kunlari</h2>
        <form class="row" data-hol>
          <input name="date" type="date" aria-label="Sana" style="width:auto">
          <input name="name" placeholder="Nomi (masalan, Navro‘z)" aria-label="Bayram nomi" style="flex:1;min-width:140px">
          <button class="btn" type="submit">＋ Qo‘shish</button>
        </form>
        <ul class="list-plain mt">${(cal.holidays || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map((h) => `<li class="row between"><span><b>${fmtHuman(h.date)}</b> — ${esc(h.name)}${h.date < cal.startDate || h.date > cal.endDate ? ' <span class="badge">semestrdan tashqari</span>' : ''}</span><button class="btn xs danger-ghost" data-del="${h.date}" aria-label="O‘chirish">✕</button></li>`).join('') || '<li class="muted">Bayramlar yo‘q.</li>'}</ul>
      </div>
    </div>`;
  root.querySelector('[data-cal]').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = readForm(e.target);
    const obj = { ...cal, academicYear: f.academicYear.trim(), semester: Number(f.semester), startDate: f.startDate, endDate: f.endDate, firstWeekParity: f.firstWeekParity };
    if (!showErrors(e.target, validateCalendar(obj))) return;
    store.update('Semestr kalendari saqlandi', (d) => { d.calendar = obj; });
    toastOk('Saqlandi.');
  });
  root.querySelector('[data-hol]').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = readForm(e.target);
    if (!isValidDate(f.date)) return toastErr('Sanani tanlang.');
    if ((cal.holidays || []).some((h) => h.date === f.date)) return toastErr('Bu sana allaqachon qo‘shilgan.');
    store.update('Bayram qo‘shildi', (d) => { d.calendar.holidays = [...(d.calendar.holidays || []), { date: f.date, name: f.name.trim() || 'Dam olish kuni' }]; });
  });
  root.addEventListener('click', (e) => {
    const d0 = e.target.closest('[data-del]')?.dataset.del;
    if (d0) store.update('Bayram o‘chirildi', (d) => { d.calendar.holidays = d.calendar.holidays.filter((h) => h.date !== d0); });
  });
}
