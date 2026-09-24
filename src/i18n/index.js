// Tarjima infratuzilmasi: t('nav.dashboard'). Til Sozlamalardan olinadi, topilmasa — o‘zbekcha.
// Yangi til qo‘shish: shu fayldagi DICT ga yangi obyekt qo‘shing (kalitlar uz bilan bir xil).
import { DAYS, DAYS_SHORT } from './uz.js';

const uz = {
  'nav.dashboard': 'Boshqaruv paneli', 'nav.schedule': 'Dars jadvali', 'nav.generator': 'Avtomatik tuzish', 'nav.versions': 'Versiyalar',
  'nav.groups': 'Guruhlar', 'nav.teachers': 'O‘qituvchilar', 'nav.subjects': 'Fanlar', 'nav.workloads': 'O‘quv yuklamasi', 'nav.rooms': 'Auditoriyalar',
  'nav.timeslots': 'Vaqtlar', 'nav.calendar': 'Semestr kalendari', 'nav.substitutions': 'Almashtirishlar', 'nav.transfers': 'O‘tkazishlar tarixi',
  'nav.events': 'Tadbirlar', 'nav.conflicts': 'Konfliktlar', 'nav.unscheduled': 'Joylashtirilmagan', 'nav.statistics': 'Statistika',
  'nav.advisor': 'Maslahatchi', 'nav.bottlenecks': 'Tor joylar', 'nav.hours': 'Soat hisobi', 'nav.exams': 'Imtihonlar', 'nav.files': 'Import / Export', 'nav.settings': 'Sozlamalar',
  'sec.data': 'Ma\'lumotlar', 'sec.staff': 'Kadrlar', 'sec.control': 'Nazorat', 'sec.analysis': 'Tahlil', 'sec.session': 'Sessiya', 'sec.files': 'Fayllar',
  'top.search': 'Qidirish: o‘qituvchi, guruh, xona, fan…', 'top.undo': 'Bekor qilish', 'top.redo': 'Qaytarish', 'top.theme': 'Tema', 'top.sandbox': 'Tajriba rejimi', 'top.install': 'O‘rnatish',
  'top.saved': '✓ Saqlangan', 'top.unsaved': 'Saqlanmagan o‘zgarishlar', 'top.save': 'Saqlash', 'top.quota': '⚠️ Xotira to‘ldi!', 'top.notsaved': '⚠️ Saqlanmadi',
  'sandbox.banner': 'Tajriba rejimi: o‘zgarishlar vaqtinchalik. Natija yoqsa — qo‘llang, aks holda asl holatga qaytaring.', 'sandbox.apply': 'Qo‘llash', 'sandbox.discard': 'Asl holatga qaytish',
  'backup.banner': 'Backup olinmaganiga {days} bo‘ldi ({changes} ta o‘zgarish). Ma\'lumot faqat shu brauzerda turibdi.', 'backup.never': 'Hali birorta ham backup olinmagan ({changes} ta o‘zgarish). Ma\'lumot faqat shu brauzerda turibdi — nusxa yuklab oling.',
  'backup.make': 'Backup yaratish', 'backup.later': 'Keyinroq',
  'common.save': 'Saqlash', 'common.cancel': 'Bekor qilish', 'common.edit': 'Tahrirlash', 'common.delete': 'O‘chirish', 'common.add': 'Qo‘shish', 'common.close': 'Yopish',
  'common.confirm': 'Tasdiqlash', 'common.search': 'Qidirish…', 'common.active': 'Faol', 'common.inactive': 'Nofaol',
};

const ru = {
  'nav.dashboard': 'Панель управления', 'nav.schedule': 'Расписание', 'nav.generator': 'Автосоставление', 'nav.versions': 'Версии',
  'nav.groups': 'Группы', 'nav.teachers': 'Преподаватели', 'nav.subjects': 'Предметы', 'nav.workloads': 'Учебная нагрузка', 'nav.rooms': 'Аудитории',
  'nav.timeslots': 'Время (пары)', 'nav.calendar': 'Календарь семестра', 'nav.substitutions': 'Замены', 'nav.transfers': 'История передач',
  'nav.events': 'Мероприятия', 'nav.conflicts': 'Конфликты', 'nav.unscheduled': 'Нераспределённые', 'nav.statistics': 'Статистика',
  'nav.advisor': 'Советник', 'nav.bottlenecks': 'Узкие места', 'nav.hours': 'Учёт часов', 'nav.exams': 'Экзамены', 'nav.files': 'Импорт / Экспорт', 'nav.settings': 'Настройки',
  'sec.data': 'Данные', 'sec.staff': 'Кадры', 'sec.control': 'Контроль', 'sec.analysis': 'Анализ', 'sec.session': 'Сессия', 'sec.files': 'Файлы',
  'top.search': 'Поиск: преподаватель, группа, аудитория, предмет…', 'top.undo': 'Отменить', 'top.redo': 'Повторить', 'top.theme': 'Тема', 'top.sandbox': 'Режим эксперимента', 'top.install': 'Установить',
  'top.saved': '✓ Сохранено', 'top.unsaved': 'Несохранённые изменения', 'top.save': 'Сохранить', 'top.quota': '⚠️ Память заполнена!', 'top.notsaved': '⚠️ Не сохранено',
  'sandbox.banner': 'Режим эксперимента: изменения временные. Примените результат или вернитесь к исходному состоянию.', 'sandbox.apply': 'Применить', 'sandbox.discard': 'Вернуть как было',
  'backup.banner': 'Резервная копия не создавалась {days} ({changes} изменений). Данные хранятся только в этом браузере.', 'backup.never': 'Резервная копия ещё не создавалась ({changes} изменений). Данные хранятся только в этом браузере.',
  'backup.make': 'Создать копию', 'backup.later': 'Позже',
  'common.save': 'Сохранить', 'common.cancel': 'Отмена', 'common.edit': 'Изменить', 'common.delete': 'Удалить', 'common.add': 'Добавить', 'common.close': 'Закрыть',
  'common.confirm': 'Подтвердить', 'common.search': 'Поиск…', 'common.active': 'Активен', 'common.inactive': 'Неактивен',
};

const en = {
  'nav.dashboard': 'Dashboard', 'nav.schedule': 'Timetable', 'nav.generator': 'Auto-generate', 'nav.versions': 'Versions',
  'nav.groups': 'Groups', 'nav.teachers': 'Teachers', 'nav.subjects': 'Subjects', 'nav.workloads': 'Workload', 'nav.rooms': 'Rooms',
  'nav.timeslots': 'Time slots', 'nav.calendar': 'Semester calendar', 'nav.substitutions': 'Substitutions', 'nav.transfers': 'Transfer history',
  'nav.events': 'Events', 'nav.conflicts': 'Conflicts', 'nav.unscheduled': 'Unscheduled', 'nav.statistics': 'Statistics',
  'nav.advisor': 'Advisor', 'nav.bottlenecks': 'Bottlenecks', 'nav.hours': 'Hours', 'nav.exams': 'Exams', 'nav.files': 'Import / Export', 'nav.settings': 'Settings',
  'sec.data': 'Data', 'sec.staff': 'Staff', 'sec.control': 'Control', 'sec.analysis': 'Analysis', 'sec.session': 'Exam session', 'sec.files': 'Files',
  'top.search': 'Search: teacher, group, room, subject…', 'top.undo': 'Undo', 'top.redo': 'Redo', 'top.theme': 'Theme', 'top.sandbox': 'Sandbox mode', 'top.install': 'Install',
  'top.saved': '✓ Saved', 'top.unsaved': 'Unsaved changes', 'top.save': 'Save', 'top.quota': '⚠️ Storage full!', 'top.notsaved': '⚠️ Not saved',
  'sandbox.banner': 'Sandbox mode: changes are temporary. Apply the result or return to the original state.', 'sandbox.apply': 'Apply', 'sandbox.discard': 'Restore original',
  'backup.banner': 'No backup for {days} ({changes} changes). Data lives only in this browser.', 'backup.never': 'No backup yet ({changes} changes). Data lives only in this browser.',
  'backup.make': 'Create backup', 'backup.later': 'Later',
  'common.save': 'Save', 'common.cancel': 'Cancel', 'common.edit': 'Edit', 'common.delete': 'Delete', 'common.add': 'Add', 'common.close': 'Close',
  'common.confirm': 'Confirm', 'common.search': 'Search…', 'common.active': 'Active', 'common.inactive': 'Inactive',
};

const DAYS_RU = { monday: 'Понедельник', tuesday: 'Вторник', wednesday: 'Среда', thursday: 'Четверг', friday: 'Пятница', saturday: 'Суббота', sunday: 'Воскресенье' };
const DAYS_EN = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };

export const DICT = { uz, ru, en };
export const LANGS = [['uz', 'O‘zbek (lotin)'], ['ru', 'Русский (menyu)'], ['en', 'English (menu)']];
export const DAY_NAMES = { uz: DAYS, ru: DAYS_RU, en: DAYS_EN };
export { DAYS_SHORT };

let lang = 'uz';
export function setLang(l) { lang = DICT[l] ? l : 'uz'; if (typeof document !== 'undefined') document.documentElement.lang = lang; }
export function getLang() { return lang; }

export function t(key, vars) {
  let s = DICT[lang]?.[key] ?? uz[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}
