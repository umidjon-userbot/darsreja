// Talabalar uchun ommaviy (faqat o‘qish) sahifalar va QR kodli varaqalar.
// Natija — ZIP: index.html, g/<guruh>.html, r/<xona>.html, t/<o‘qituvchi>.html, qr.html.
// ZIP ichidagini GitHub Pages'ga (masalan, /jadval papkaga) yuklang — har bir sahifa mustaqil ishlaydi.
import qrcode from 'qrcode-generator';
import JSZip from 'jszip';
import { buildContext, wlTargetName, wlGroupIds, wlDuration } from '../scheduler/model.js';
import { publishedLessons } from '../analysis/versions.js';
import { DAYS } from '../i18n/uz.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TR = { 'ʻ': '', '‘': '', '’': '', "'": '', 'ş': 's', 'ç': 'c', 'ğ': 'g' };

export function slug(s) {
  return String(s).toLowerCase().replace(/[ʻ‘’'şçğ]/g, (c) => TR[c] ?? '').replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '') || 'x';
}

export function qrSvg(text, cell = 4) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: cell, margin: 2, scalable: true });
}

const CSS = `
:root{--bg:#f6f7fb;--fg:#161a26;--mut:#6b7285;--card:#fff;--line:#e3e6ee;--acc:#4f46e5;--soft:#eef0ff;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#10131a;--fg:#eceef4;--mut:#9aa1b3;--card:#181c25;--line:#2b303d;--acc:#8b93ff;--soft:#23264a;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:16px}
.wrap{max-width:1100px;margin:0 auto}h1{font-size:22px;margin:0 0 2px}p{margin:0 0 10px}.mut{color:var(--mut);font-size:13px}
.days{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:14px}
.day{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px}.day.today{border-color:var(--acc);box-shadow:0 0 0 2px var(--soft)}
.day h2{font-size:15px;margin:0 0 8px;display:flex;justify-content:space-between}.day h2 small{color:var(--acc);font-weight:600}
.l{padding:7px 0;border-top:1px solid var(--line);display:grid;grid-template-columns:52px 1fr;gap:8px}.l:first-of-type{border-top:0}
.t{font-variant-numeric:tabular-nums;font-weight:700;font-size:13px}.t span{display:block;font-weight:400;color:var(--mut)}
.s{font-weight:650}.m{color:var(--mut);font-size:13px}.par{font-size:11px;background:var(--soft);color:var(--acc);border-radius:4px;padding:0 5px;margin-left:4px}
.l.off{opacity:.45}.empty{color:var(--mut);font-size:13px}
ul.idx{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}
ul.idx a{display:block;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px;color:var(--fg);text-decoration:none;font-weight:600}
ul.idx a:hover{border-color:var(--acc)}a{color:var(--acc)}
@media print{body{background:#fff;padding:0}.day{break-inside:avoid}}
`;

function pageShell(data, title, inner, script = '') {
  return `<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head>
<body><div class="wrap">${inner}<p class="mut" style="margin-top:18px">${esc(data.settings.instituteName)} · ${esc(data.calendar.academicYear)}, ${data.calendar.semester}-semestr · Yangilangan: ${new Date().toLocaleDateString('uz-UZ')} · Smart Schedule Builder</p></div>${script}</body></html>`;
}

// Bugungi kun va toq/juft haftani brauzerda aniqlovchi kichik skript
function todayScript(cal) {
  return `<script>(function(){var s=${JSON.stringify(cal.startDate)},f=${JSON.stringify(cal.firstWeekParity || 'odd')};
var k=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date().getDay()];
var el=document.querySelector('[data-day="'+k+'"]');if(el){el.classList.add('today');var h=el.querySelector('h2 small');if(h)h.textContent='Bugun';}
var d0=new Date(s+'T00:00:00');d0.setDate(d0.getDate()-((d0.getDay()+6)%7));var n=new Date();n.setHours(0,0,0,0);var w=Math.floor((n-d0)/6048e5);
var p=(w%2===0)?f:(f==='odd'?'even':'odd');var b=document.getElementById('par');if(b)b.textContent=p==='odd'?'Bu hafta: toq (surat)':'Bu hafta: juft (maxraj)';
document.querySelectorAll('[data-par]').forEach(function(x){if(x.getAttribute('data-par')!==p)x.classList.add('off');});})();</script>`;
}

function weekHtml(data, ctx, lessons, lineFn) {
  return `<div class="days">${ctx.workDays.map((d) => {
    const ls = lessons.filter((l) => l.day === d).sort((a, b) => ctx.slotIdx.get(a.slotId) - ctx.slotIdx.get(b.slotId));
    return `<section class="day" data-day="${d}"><h2>${DAYS[d]}<small></small></h2>${ls.length ? ls.map((l) => {
      const wl = ctx.workloads.get(l.workloadId);
      const s0 = ctx.slots[ctx.slotIdx.get(l.slotId)];
      const s1 = ctx.slots[ctx.slotIdx.get(l.slotId) + wlDuration(wl) - 1] || s0;
      return `<div class="l" ${l.weekParity && l.weekParity !== 'all' ? `data-par="${l.weekParity}"` : ''}><div class="t">${esc(s0?.start)}<span>${esc(s1?.end)}</span></div><div><div class="s">${esc(ctx.subjects.get(wl.subjectId)?.name || '')}${l.weekParity === 'odd' ? '<span class="par">toq</span>' : l.weekParity === 'even' ? '<span class="par">juft</span>' : ''}</div><div class="m">${lineFn(l, wl)}</div></div></div>`;
    }).join('') : '<p class="empty">Dars yo‘q</p>'}</section>`;
  }).join('')}</div>`;
}

export function buildPublicSite(data, { groups = true, rooms = true, teachers = false } = {}) {
  const ctx = buildContext(data);
  const lessons = publishedLessons(data).filter((l) => ctx.workloads.get(l.workloadId));
  const files = {};
  const index = { groups: [], rooms: [], teachers: [] };
  const script = todayScript(data.calendar);
  const header = (title, sub) => `<h1>${esc(title)}</h1><p class="mut">${esc(sub)} · <b id="par"></b> · <a href="../index.html">Barcha jadvallar</a></p>`;
  if (groups) for (const g of data.groups.filter((x) => x.active !== false)) {
    const path = `g/${slug(g.name)}.html`;
    const ls = lessons.filter((l) => wlGroupIds(ctx.workloads.get(l.workloadId)).includes(g.id));
    files[path] = pageShell(data, `${g.name} — dars jadvali`, header(`${g.name} — dars jadvali`, `${g.studentCount} talaba${g.direction ? ' · ' + g.direction : ''}`) + weekHtml(data, ctx, ls, (l, wl) => `${esc(ctx.teachers.get(wl.teacherId)?.name || '')} · ${esc(ctx.rooms.get(l.roomId)?.number || '')}-xona${wl.target?.type === 'subgroup' || wl.target?.type === 'elective' ? ' · ' + esc(wlTargetName(ctx, wl)) : ''}`), script);
    index.groups.push({ name: g.name, path });
  }
  if (rooms) for (const r of data.rooms.filter((x) => x.active !== false)) {
    const path = `r/${slug(r.number)}.html`;
    const ls = lessons.filter((l) => l.roomId === r.id);
    files[path] = pageShell(data, `${r.number}-xona — jadval`, header(`${r.number}-xona`, `${r.building ? r.building + ' bino · ' : ''}${r.capacity} o‘rin`) + weekHtml(data, ctx, ls, (l, wl) => `${esc(wlTargetName(ctx, wl))} · ${esc(ctx.teachers.get(wl.teacherId)?.name || '')}`), script);
    index.rooms.push({ name: r.number + '-xona', path });
  }
  if (teachers) for (const t of data.teachers.filter((x) => x.active !== false)) {
    const path = `t/${slug(t.name)}.html`;
    const ls = lessons.filter((l) => ctx.workloads.get(l.workloadId).teacherId === t.id);
    files[path] = pageShell(data, `${t.name} — jadval`, header(t.name, `${ls.length} dars/hafta`) + weekHtml(data, ctx, ls, (l, wl) => `${esc(wlTargetName(ctx, wl))} · ${esc(ctx.rooms.get(l.roomId)?.number || '')}-xona`), script);
    index.teachers.push({ name: t.name, path });
  }
  const list = (title, arr) => (arr.length ? `<h2 style="font-size:16px;margin:16px 0 8px">${title}</h2><ul class="idx">${arr.map((x) => `<li><a href="${esc(x.path)}">${esc(x.name)}</a></li>`).join('')}</ul>` : '');
  files['index.html'] = pageShell(data, `${data.settings.instituteName} — dars jadvali`, `<h1>${esc(data.settings.instituteName)}</h1><p class="mut">Dars jadvallari · ${esc(data.calendar.academicYear)}, ${data.calendar.semester}-semestr</p>${list('Guruhlar', index.groups)}${list('Auditoriyalar', index.rooms)}${list('O‘qituvchilar', index.teachers)}`);
  return { files, index };
}

export function qrSheetHtml(data, items, base) {
  const root = String(base || '').replace(/\/?$/, '/');
  return `<div class="qr-grid">${items.map((x) => `<div class="qr-card"><div class="qr-t">${esc(x.name)}</div>${qrSvg(root + x.path, 4)}<div class="qr-u">${esc(root + x.path)}</div><div class="qr-h">Dars jadvalini ko‘rish uchun skanerlang</div></div>`).join('')}</div>`;
}

export const QR_CSS = `.qr-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10mm}.qr-card{border:1px dashed #999;border-radius:6px;padding:6mm;text-align:center;break-inside:avoid;background:#fff;color:#000}
.qr-card svg{width:45mm;height:45mm}.qr-t{font:700 20px system-ui,sans-serif;margin-bottom:4px}.qr-u{font:9px ui-monospace,monospace;word-break:break-all;color:#444}.qr-h{font:11px system-ui,sans-serif;margin-top:3px}`;

export async function buildPublicZip(data, opts) {
  const { files, index } = buildPublicSite(data, opts);
  const zip = new JSZip();
  for (const [p, html] of Object.entries(files)) zip.file(p, html);
  const all = [...index.rooms, ...index.groups, ...index.teachers];
  if (opts.base) {
    zip.file('qr.html', `<!doctype html><html lang="uz"><head><meta charset="utf-8"><title>QR varaqalar</title><style>@page{size:A4;margin:10mm}body{margin:0;font-family:system-ui,sans-serif}${QR_CSS}</style></head><body>${qrSheetHtml(data, all, opts.base)}</body></html>`);
  }
  zip.file('README.txt', `Smart Schedule Builder — ommaviy jadval sahifalari\n\n1. Shu ZIP ichidagi fayllarni GitHub Pages (yoki istalgan statik hosting)dagi papkaga yuklang.\n2. Sayt manzili: ${opts.base || '(Sozlamalarda "Ommaviy sahifalar manzili"ni kiriting)'}\n3. qr.html — xona eshiklari uchun QR varaqalar (brauzerda ochib, chop eting).\n4. Jadval o‘zgarsa — ZIP'ni qayta yarating va fayllarni almashtiring.\n`);
  return zip.generateAsync({ type: 'blob' });
}
