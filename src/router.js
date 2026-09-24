// Hash routing (#/schedule?teacher=tch_1) — GitHub Pages'da refresh muammosiz
export function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  return { name: path || 'dashboard', params };
}

export function go(name, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
  const target = '#/' + name + (qs ? '?' + qs : '');
  if (location.hash === target) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = target;
}

export function setParams(params, replace = true) {
  const { name, params: cur } = parseHash();
  const merged = { ...cur, ...params };
  const qs = new URLSearchParams(Object.entries(merged).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
  const url = '#/' + name + (qs ? '?' + qs : '');
  if (replace) history.replaceState(null, '', url);
  else location.hash = url;
}

// Joriy sahifani qayta chizish (main.js tinglaydi)
export function rerender() {
  window.dispatchEvent(new Event('app:rerender'));
}
