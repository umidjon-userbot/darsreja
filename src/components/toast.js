// Toast xabarlar (ixtiyoriy "Bekor qilish" tugmasi bilan)
import { esc } from '../utils/dom.js';

let root = null;
export function toast(msg, { type = '', action = null, timeout = 4200 } = {}) {
  if (!root) {
    root = document.createElement('div');
    root.className = 'toasts';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    document.body.appendChild(root);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { action.onClick(); el.remove(); };
    el.appendChild(b);
  }
  root.appendChild(el);
  setTimeout(() => el.remove(), action ? Math.max(timeout, 6500) : timeout);
}
export const ok = (m, o) => toast(m, { type: 'ok', ...o });
export const err = (m, o) => toast(m, { type: 'err', timeout: 6500, ...o });
