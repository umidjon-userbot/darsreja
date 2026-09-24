import { store } from '../state/store.js';
import { counts, ctx as getCtx, occ as getOcc } from '../state/selectors.js';
import { barList } from '../components/charts.js';
import { openLessonForm } from '../components/lessonDialogs.js';
import { occurrencesOn, absenceOn, weekParity, substitutionStatus } from '../substitution/calendarResolver.js';
import { roomAvailCount, wlTargetName } from '../scheduler/model.js';
import { esc } from '../utils/dom.js';
import { todayStr, fmtHuman, dayKeyOf } from '../utils/date.js';
import { DAYS, PARITY, ABSENCE_REASONS } from '../i18n/uz.js';
import { go } from '../router.js';
import { draftDiff } from '../analysis/versions.js';

export function render(root) {
  const data = store.get();
  const c = getCtx();
  const o = getOcc();
  const n = counts();
  const today = todayStr();
  const res = occurrencesOn(data, today, c);
  const activeSubs = (data.substitutions || []).filter((s) => substitutionStatus(s, today) === 'active').length;
  const absent = data.teachers.filter((t) => absenceOn(t, today));
  const tLoad = data.teachers.filter((t) => t.active !== false).map((t) => {
    const u = o.teacherWeekUnits(t.id);
    const m = Number(t.maxWeeklyClasses) || 1;
    return { name: t.name, value: u, pct: (u / m) * 100, label: `${u}/${m}`, dot: t.color };
  }).sort((a, b) => b.pct - a.pct);
  const rLoad = data.rooms.filter((r) => r.active !== false).map((r) => {
    const used = data.schedule.lessons.filter((l) => l.roomId === r.id).reduce((a, l) => a + (Number(c.workloads.get(l.workloadId)?.durationSlots) || 1), 0);
    const cap = roomAvailCount(c, r) || 1;
    return { name: r.number + '-xona', value: used, pct: (used / cap) * 100, label: `${Math.round((used / cap) * 100)}%` };
  }).sort((a, b) => b.pct - a.pct);
  const gLoad = data.groups.filter((g) => g.active !== false).map((g) => {
    let u = 0;
    for (const d of c.workDays) u += o.groupDayLoad(g.id, d);
    return { name: g.name, value: u, label: `${u} dars` };
  }).sort((a, b) => b.value - a.value);
  const gMax = Math.max(1, ...gLoad.map((x) => x.value));
  const stat = (v, l, href, cls = '') => `<a class="stat ${cls}" href="${href}"><span class="v">${v}</span><span class="l">${l}</span></a>`;

  root.innerHTML = `
    <div class="page-head"><div><h1>Boshqaruv paneli</h1><p>${esc(data.settings.instituteName)} · ${esc(data.calendar.academicYear)}, ${data.calendar.semester}-semestr</p></div>
      <div class="btn-row"><button class="btn primary" data-a="gen">⚙️ Avtomatik tuzish</button><button class="btn" data-a="add">＋ Dars qo‘shish</button><button class="btn" data-a="sub">🔁 Almashtirish yaratish</button></div></div>
    <div class="stats mb">
      ${stat(n.groups, 'Jami guruhlar', '#/groups')}
      ${stat(n.teachers, 'Jami o‘qituvchilar', '#/teachers')}
      ${stat(n.subjects, 'Jami fanlar', '#/subjects')}
      ${stat(n.rooms, 'Jami auditoriyalar', '#/rooms')}
      ${stat(n.required, 'Haftalik talab qilingan darslar', '#/workloads')}
      ${stat(n.placed, 'Joylashtirilgan darslar', '#/schedule', 'ok')}
      ${stat(n.unscheduled, 'Joylashtirilmagan', '#/unscheduled', n.unscheduled ? 'warn' : 'ok')}
      ${stat(`🔴 ${n.critical}`, `Kritik konfliktlar · 🟠 ${n.warnings}`, '#/conflicts', n.critical ? 'err' : 'ok')}
      ${stat(activeSubs, 'Faol almashtirishlar', '#/substitutions', activeSubs ? 'warn' : '')}
    </div>
    ${(() => { const df = draftDiff(data); return data.schedule.lessons.length && (df === null || df.length) ? `<div class="alert warn">📢<div>${df === null ? 'Jadval hali <b>e\'lon qilinmagan</b>. E\'lon qilgandan keyin semestr o‘rtasidagi o‘zgarishlar o‘tgan haftalar tarixini buzmaydi.' : `Ishchi jadvalda <b>${df.length} ta e'lon qilinmagan o‘zgarish</b> bor — o‘qituvchilar va talabalar hali eski versiyani ko‘radi.`} <a href="#/versions">Versiyalar →</a></div></div>` : ''; })()}
    ${res.events?.length ? `<div class="alert info">🎪<div>Bugun: ${res.events.map((e) => `<b>${esc(e.title)}</b>`).join(', ')} — <a href="#/events">Tadbirlar</a></div></div>` : ''}
    ${!data.workloads.length ? `<div class="alert info">ℹ️<div><b>Boshlash tartibi:</b> 1) <a href="#/timeslots">Vaqtlar</a> → 2) <a href="#/rooms">Auditoriyalar</a> → 3) <a href="#/groups">Guruhlar</a> → 4) <a href="#/subjects">Fanlar</a> → 5) <a href="#/teachers">O‘qituvchilar</a> → 6) <a href="#/workloads">O‘quv yuklamasi</a> → 7) <a href="#/generator">Avtomatik tuzish</a>. Yoki <a href="#/files?tab=bulk">Excel'dan import</a> qiling.</div></div>` : ''}
    <div class="grid cols-2">
      <div class="card"><div class="card-head"><h2>Bugungi darslar</h2><small class="muted">${fmtHuman(today)}, ${DAYS[dayKeyOf(today)]}${res.holiday ? ' · 🎉 ' + esc(res.holiday.name) : res.outside ? ' · semestrdan tashqari' : ' · ' + PARITY[res.parity]}</small></div>
        ${res.items.length ? `<ul class="list-plain">${res.items.slice(0, 40).map((x) => {
          const t = c.teachers.get(x.teacherId);
          const sub = x.teacherId !== x.originalTeacherId;
          return `<li class="row"><span class="badge">${esc(c.slots[c.slotIdx.get(x.slotId)]?.start || '')}</span><span style="flex:1;min-width:0"><b>${esc(c.subjects.get(x.wl.subjectId)?.icon || '')} ${esc(c.subjects.get(x.wl.subjectId)?.name || '?')}</b> · ${esc(wlTargetName(c, x.wl))}<br><small>${x.status === 'cancelled' ? `❌ Bekor qilingan${x.event ? ' (' + esc(x.event.title) + ')' : ''}` : `${sub ? '🔁 ' : ''}${esc(t?.name || '?')}${sub ? ` <span class="muted">(asl: ${esc(c.teachers.get(x.originalTeacherId)?.name)})</span>` : ''} · ${esc(c.rooms.get(x.roomId)?.number || '')}-xona${x.status === 'moved' ? ' · ko‘chirilgan' : ''}`}</small></span></li>`;
        }).join('')}</ul>` : `<p class="muted">${res.holiday || res.outside || !c.workDays.includes(dayKeyOf(today)) ? 'Bugun dars yo‘q.' : 'Bugun uchun darslar topilmadi.'}</p>`}
        <a class="btn sm mt" href="#/schedule?mode=date">Hafta bo‘yicha ko‘rish →</a>
      </div>
      <div class="card"><h2>Bugun yo‘q o‘qituvchilar</h2>
        ${absent.length ? `<ul class="list-plain">${absent.map((t) => {
          const ab = absenceOn(t, today);
          const items = res.items.filter((x) => x.originalTeacherId === t.id);
          const subs = [...new Set(items.filter((x) => x.teacherId !== t.id).map((x) => c.teachers.get(x.teacherId)?.name))];
          const uncovered = items.filter((x) => x.teacherId === t.id && x.status !== 'cancelled').length;
          return `<li><b>${esc(t.name)}</b> — ${ABSENCE_REASONS[ab.reason] || ''} <small class="muted">(${fmtHuman(ab.startDate)}–${fmtHuman(ab.endDate)})</small><br>
            <small>${items.length ? `${subs.length ? `O‘rniga: 🔁 <b>${subs.map(esc).join(', ')}</b>` : ''}${uncovered ? ` <span style="color:var(--danger)">🔴 ${uncovered} ta darsga almashtiruvchi yo‘q</span>` : ''}` : 'Bugun darsi yo‘q'}</small></li>`;
        }).join('')}</ul>` : '<p class="muted">Hamma joyida. ✅</p>'}
        <a class="btn sm mt" href="#/substitutions">Almashtirishlar →</a>
      </div>
      <div class="card"><div class="card-head"><h2>O‘qituvchilar yuklamasi</h2><a href="#/statistics" class="btn xs">Batafsil</a></div>${barList(tLoad.slice(0, 10), { fmt: (x) => x.label })}</div>
      <div class="card"><div class="card-head"><h2>Auditoriyalar bandligi</h2></div>${barList(rLoad.slice(0, 10), { fmt: (x) => x.label })}</div>
      <div class="card"><div class="card-head"><h2>Guruhlar yuklamasi</h2></div>${barList(gLoad.slice(0, 10), { max: gMax, fmt: (x) => x.label })}</div>
      ${data.schedule.lastRun ? `<div class="card"><h2>Oxirgi generatsiya</h2><p>${new Date(data.schedule.lastRun.at).toLocaleString('uz-UZ')}</p>
        <p>✅ ${data.schedule.lastRun.stats.placed}/${data.schedule.lastRun.stats.required} dars · ⚠️ ${data.schedule.lastRun.stats.unscheduledCount} joylashmadi · 📊 ${data.schedule.lastRun.stats.quality}% optimallashtirish ko‘rsatkichi</p><a class="btn sm" href="#/generator">Generator →</a></div>` : ''}
    </div>`;
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'gen') go('generator');
    if (a === 'add') openLessonForm({});
    if (a === 'sub') go('substitutions');
  });
  void weekParity;
}
