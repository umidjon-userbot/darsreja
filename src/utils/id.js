// Noyob ID generatori: prefix_xxxxxx
export function uid(prefix = 'id') {
  const rnd = Math.random().toString(36).slice(2, 8);
  const t = Date.now().toString(36).slice(-4);
  return `${prefix}_${t}${rnd}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function clone(o) {
  return o === undefined ? undefined : JSON.parse(JSON.stringify(o));
}

// Seedli tasodifiy sonlar generatori (mulberry32) — bir xil seed = bir xil natija
export function makeRng(seed) {
  let a = (typeof seed === 'number' ? seed : hashStr(String(seed ?? Date.now()))) >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.int = (n) => Math.floor(rng() * n);
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  return rng;
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Levenshtein masofasi — "Siz buni nazarda tutdingizmi?" uchun
export function levenshtein(a, b) {
  a = String(a).toLowerCase();
  b = String(b).toLowerCase();
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export function closestName(name, candidates, maxDist = 3) {
  let best = null, bestD = Infinity;
  for (const c of candidates) {
    const d = levenshtein(name, c);
    if (d < bestD) { bestD = d; best = c; }
  }
  return bestD <= Math.max(1, Math.min(maxDist, Math.floor(String(name).length / 3))) ? best : null;
}
