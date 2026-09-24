// O‘qituvchi availability formasi: havola va javob kodini kodlash/ochish (serversiz)
// Havola:  <sayt>/#/form?d=<base64url(JSON)>   — o‘qituvchi ismi, vaqtlar, joriy availability
// Javob:   "SSB1." + base64url(JSON)            — o‘qituvchi yuboradi, admin import qiladi

export function b64urlEncode(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(str) {
  const s = String(str).trim().replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function formPayload(data, teacherId) {
  const t = data.teachers.find((x) => x.id === teacherId);
  if (!t) throw new Error('O‘qituvchi topilmadi.');
  const slots = [...data.timeslots].sort((a, b) => a.order - b.order);
  return {
    v: 1, tid: t.id, name: t.name, inst: data.settings.instituteName,
    days: data.settings.workDays, slots: slots.map((s) => ({ id: s.id, n: s.name, a: s.start, b: s.end })),
    av: t.availability || {}, pd: t.preferredDays || [], ps: t.preferredSlots || [],
    lim: { minD: t.minWorkingDays, maxD: t.maxWorkingDays, maxW: t.maxWeeklyClasses },
    sem: `${data.calendar.academicYear}, ${data.calendar.semester}-semestr`,
  };
}

export function formLink(data, teacherId, base) {
  const root = (base || '').replace(/#.*$/, '');
  return `${root}#/form?d=${b64urlEncode(formPayload(data, teacherId))}`;
}

export function encodeResponse(resp) {
  return 'SSB1.' + b64urlEncode({ ...resp, type: 'availability-response', v: 1 });
}

export function decodeResponse(text) {
  let s = String(text || '').trim();
  if (s.startsWith('{')) {
    const o = JSON.parse(s);
    if (o.type !== 'availability-response') throw new Error('Bu o‘qituvchi javobi fayli emas.');
    return o;
  }
  const m = s.match(/SSB1\.([A-Za-z0-9_-]+)/);
  if (!m) throw new Error('Kod topilmadi. U "SSB1." bilan boshlanishi kerak.');
  const o = b64urlDecode(m[1]);
  if (o.type !== 'availability-response' || !o.tid) throw new Error('Kod buzilgan yoki noto‘g‘ri.');
  return o;
}

// Javobni admin ma'lumotiga solishtirish: qo‘shilgan / olib tashlangan kataklar
export function responseDiff(data, resp) {
  const t = data.teachers.find((x) => x.id === resp.tid) || data.teachers.find((x) => x.name.trim().toLowerCase() === String(resp.name).trim().toLowerCase());
  if (!t) return { teacher: null };
  const added = [], removed = [];
  for (const d of data.settings.workDays) {
    const a = new Set(t.availability?.[d] || []);
    const b = new Set(resp.av?.[d] || []);
    for (const s of b) if (!a.has(s)) added.push({ day: d, slotId: s });
    for (const s of a) if (!b.has(s)) removed.push({ day: d, slotId: s });
  }
  return { teacher: t, added, removed };
}

export function applyResponse(data, resp) {
  const { teacher } = responseDiff(data, resp);
  if (!teacher) throw new Error(`"${resp.name}" o‘qituvchisi topilmadi.`);
  const validSlots = new Set(data.timeslots.map((s) => s.id));
  const av = {};
  for (const d of data.settings.workDays) av[d] = (resp.av?.[d] || []).filter((s) => validSlots.has(s));
  teacher.availability = av;
  teacher.preferredDays = (resp.pd || []).filter((d) => data.settings.workDays.includes(d));
  teacher.preferredSlots = (resp.ps || []).filter((s) => validSlots.has(s));
  teacher.formNote = resp.note || '';
  teacher.formAt = resp.at || new Date().toISOString();
  teacher.updatedAt = new Date().toISOString();
  return teacher;
}
