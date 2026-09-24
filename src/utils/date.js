// Sana yordamchilari. Sanalar "YYYY-MM-DD" satr ko‘rinishida saqlanadi (vaqt zonasi muammosiz).
export const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export function parseDate(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

export function addDays(s, n) {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmtDate(d);
}

export function todayStr() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 0=monday … 6=sunday
export function dayIndex(s) {
  return (parseDate(s).getUTCDay() + 6) % 7;
}

export function dayKeyOf(s) {
  return DAY_KEYS[dayIndex(s)];
}

export function diffDays(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

export function mondayOf(s) {
  return addDays(s, -dayIndex(s));
}

export function* dateRange(start, end) {
  if (!start || !end) return;
  let cur = start;
  let guard = 0;
  while (cur <= end && guard++ < 3700) {
    yield cur;
    cur = addDays(cur, 1);
  }
}

export function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
  const d = parseDate(s);
  return !isNaN(d) && fmtDate(d) === s;
}

export function fmtHuman(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${d}.${m}.${y}`;
}

export function timeToMin(t) {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
}
