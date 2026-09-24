// Modal oynalar, tasdiqlash dialogi
import { esc } from '../utils/dom.js';

const stack = [];

export function openModal({ title, body, actions = [], size = '', onClose, closeOnBackdrop = true }) {
  const layer = document.createElement('div');
  layer.className = 'modal-layer';
  layer.innerHTML = `
    <div class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="mh-${stack.length}">
      <div class="modal-head"><h2 id="mh-${stack.length}">${esc(title)}</h2>
        <button class="btn ghost icon" data-x aria-label="Yopish">✕</button></div>
      <div class="modal-body"></div>
      <div class="modal-foot"></div>
    </div>`;
  const bodyEl = layer.querySelector('.modal-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body) bodyEl.appendChild(body);
  const foot = layer.querySelector('.modal-foot');
  const prevFocus = document.activeElement;
  let closed = false;
  const api = {
    el: layer.querySelector('.modal'),
    body: bodyEl,
    close(result) {
      if (closed) return;
      closed = true;
      layer.remove();
      const i = stack.indexOf(api);
      if (i >= 0) stack.splice(i, 1);
      document.removeEventListener('keydown', onKey, true);
      onClose?.(result);
      prevFocus?.focus?.();
    },
    setActions(list) {
      foot.innerHTML = '';
      foot.style.display = list.length ? '' : 'none';
      for (const a of list) {
        const b = document.createElement('button');
        b.className = 'btn ' + (a.kind || '');
        b.textContent = a.label;
        if (a.disabled) b.disabled = true;
        if (a.id) b.dataset.id = a.id;
        b.addEventListener('click', async () => {
          if (!a.onClick) return api.close();
          b.disabled = true;
          try {
            const r = await a.onClick(api);
            if (r !== false) api.close(r);
          } finally {
            b.disabled = false;
          }
        });
        foot.appendChild(b);
      }
    },
    setTitle(t) { layer.querySelector('.modal-head h2').textContent = t; },
  };
  api.setActions(actions);
  layer.querySelector('[data-x]').addEventListener('click', () => api.close());
  layer.addEventListener('mousedown', (e) => { if (closeOnBackdrop && e.target === layer) api.close(); });
  function onKey(e) {
    if (stack[stack.length - 1] !== api) return;
    if (e.key === 'Escape') { e.stopPropagation(); api.close(); }
    if (e.key === 'Tab') {
      const f = [...layer.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  }
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(layer);
  stack.push(api);
  setTimeout(() => {
    const first = bodyEl.querySelector('input:not([type=hidden]), select, textarea') || foot.querySelector('.btn.primary') || layer.querySelector('[data-x]');
    first?.focus();
  }, 20);
  return api;
}

export function confirmDialog({ title = 'Tasdiqlang', message = '', confirmLabel = 'Tasdiqlash', danger = false, requireText = null, details = '' }) {
  return new Promise((resolve) => {
    const body = document.createElement('div');
    body.innerHTML = `<p>${esc(message)}</p>${details}${requireText ? `<label class="field">Tasdiqlash uchun <b>${esc(requireText)}</b> deb yozing<input type="text" data-req autocomplete="off"></label>` : ''}`;
    const m = openModal({
      title, body,
      onClose: (r) => resolve(!!r),
      actions: [
        { label: 'Bekor qilish' },
        { label: confirmLabel, kind: danger ? 'danger' : 'primary', id: 'ok', onClick: () => {
          if (requireText && body.querySelector('[data-req]').value.trim() !== requireText) {
            body.querySelector('[data-req]').classList.add('invalid');
            return false;
          }
          return true;
        } },
      ],
    });
    if (requireText) setTimeout(() => body.querySelector('[data-req]')?.focus(), 30);
    else setTimeout(() => m.el.querySelector('[data-id=ok]')?.focus(), 30);
  });
}

export function infoDialog(title, html) {
  return openModal({ title, body: html, actions: [{ label: 'Yopish', kind: 'primary' }] });
}
