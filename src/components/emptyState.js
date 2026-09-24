import { esc } from '../utils/dom.js';
export function emptyState({ icon = '📭', title, text = '', actionHtml = '' }) {
  return `<div class="empty"><div class="ico" aria-hidden="true">${icon}</div><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${actionHtml ? `<div class="btn-row" style="justify-content:center">${actionHtml}</div>` : ''}</div>`;
}
