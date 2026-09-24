// Yengil CSS chart'lar (tashqi kutubxonasiz)
import { esc } from '../utils/dom.js';

export function progressBar(pct, extra = '') {
  const p = Math.max(0, Math.min(100, pct));
  const cls = pct > 100 ? 'err' : pct >= 90 ? 'warn' : pct >= 40 ? '' : 'ok';
  return `<div class="progress ${cls} ${extra}" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${p}%"></span></div>`;
}

export function barList(items, { max = null, fmt = (x) => x.label } = {}) {
  if (!items.length) return '<p class="muted">Ma\'lumot yo‘q.</p>';
  return `<div class="bar-list">${items.map((it) => {
    const pct = it.pct ?? (max ? (it.value / max) * 100 : 0);
    return `<div class="item" ${it.href ? `data-href="${esc(it.href)}"` : ''}><span class="nm" title="${esc(it.name)}">${it.dot ? `<span class="dot" style="background:${esc(it.dot)}"></span> ` : ''}${esc(it.name)}</span>${progressBar(pct)}<span class="vv">${esc(fmt(it))}</span></div>`;
  }).join('')}</div>`;
}

// Oddiy vertikal SVG ustunli diagramma
export function columnChart(items, { height = 140, color = 'var(--primary)' } = {}) {
  if (!items.length) return '';
  const max = Math.max(1, ...items.map((i) => i.value));
  const w = 100 / items.length;
  return `<svg viewBox="0 0 100 ${height / 2}" preserveAspectRatio="none" style="width:100%;height:${height}px" role="img" aria-label="Diagramma">
    ${items.map((it, i) => {
      const h = (it.value / max) * (height / 2 - 8);
      return `<rect x="${i * w + w * 0.18}" y="${height / 2 - h}" width="${w * 0.64}" height="${h}" rx="1" fill="${it.color || color}"><title>${esc(it.name)}: ${it.value}</title></rect>`;
    }).join('')}
  </svg><div style="display:grid;grid-template-columns:repeat(${items.length},1fr);font-size:11px;color:var(--text-3);text-align:center">${items.map((i) => `<span>${esc(i.name)}<br><b style="color:var(--text)">${i.value}</b></span>`).join('')}</div>`;
}
