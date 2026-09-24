// O‘zbek (lotin) interfeysi uchun lug‘atlar. Boshqa til qo‘shish uchun shu tuzilmani nusxalang.
export const DAYS = {
  monday: 'Dushanba', tuesday: 'Seshanba', wednesday: 'Chorshanba', thursday: 'Payshanba',
  friday: 'Juma', saturday: 'Shanba', sunday: 'Yakshanba',
};
export const DAYS_SHORT = {
  monday: 'Du', tuesday: 'Se', wednesday: 'Ch', thursday: 'Pa', friday: 'Ju', saturday: 'Sh', sunday: 'Ya',
};
export const DAYS_LOC = {
  monday: 'Dushanbada', tuesday: 'Seshanbada', wednesday: 'Chorshanbada', thursday: 'Payshanbada',
  friday: 'Jumada', saturday: 'Shanbada', sunday: 'Yakshanbada',
};

export const ROOM_TYPES_DEFAULT = [
  { id: 'regular', name: 'Oddiy' },
  { id: 'computer', name: 'Kompyuter' },
  { id: 'language_lab', name: 'Til laboratoriyasi' },
  { id: 'lecture_hall', name: 'Ma\'ruza zali' },
];

export const PARITY = { all: 'Har hafta', odd: 'Toq hafta', even: 'Juft hafta' };
export const PARITY_SHORT = { all: '', odd: 'T', even: 'J' };

export const DISTRIBUTION = {
  spread: 'Har kuni 1 tadan',
  pairs: '2 kun × 2 dars',
  custom: 'Maxsus',
};

export const PRIORITY = { low: 'Past', medium: 'O‘rta', high: 'Yuqori' };

export const ABSENCE_REASONS = {
  sick: 'Kasallik', vacation: 'Ta\'til', trip: 'Xizmat safari', training: 'Malaka oshirish', other: 'Boshqa',
};

export const SUBST_STATUS = {
  planned: 'Rejalashtirilgan', active: 'Faol', finished: 'Tugagan', cancelled: 'Bekor qilingan',
};

export const UNSCHEDULED_REASONS = {
  TEACHER_NO_SLOTS: 'O‘qituvchida bo‘sh slot qolmadi',
  TEACHER_WEEKLY_LIMIT: 'O‘qituvchining haftalik limiti to‘ldi',
  TEACHER_DAILY_LIMIT: 'O‘qituvchining kunlik limitlari to‘ldi',
  TEACHER_DAYS_LIMIT: 'O‘qituvchining ish kunlari limiti to‘ldi',
  NO_ROOM_TYPE: 'Mos turdagi xona yo‘q',
  NO_ROOM_CAPACITY: 'Yetarli sig‘imli xona yo‘q',
  NO_COMMON_SLOT: 'O‘qituvchi, guruh va xona bo‘sh vaqti bir-biriga mos kelmadi',
  GROUP_FULL: 'Guruh kunlik limitda yoki band',
  LOCKED_BLOCKS: 'Qulflangan darslar slotlarni egallagan',
  TEACHER_NO_AVAILABILITY: 'O‘qituvchi va guruhning umumiy mavjud vaqti yo‘q',
  INACTIVE: 'Nofaol obyekt (o‘qituvchi, guruh yoki fan)',
  NO_TEACHER: 'O‘qituvchi biriktirilmagan',
  PLACEABLE: 'Hozir bo‘sh joy bor — qo‘lda joylashtirish mumkin',
};

export const HARD_CODES = {
  H1: 'O‘qituvchi bir vaqtda ikki darsda',
  H2: 'Guruh bir vaqtda ikki darsda',
  H3: 'Auditoriya bir vaqtda ikki darsda',
  H4: 'O‘qituvchi mavjud bo‘lmagan vaqt',
  H5: 'O‘qituvchi ishlamaydigan kun',
  H6: 'Auditoriya mavjud bo‘lmagan vaqt',
  H7: 'Guruh smenasi / mavjud vaqtidan tashqarida',
  H8: 'Auditoriya sig‘imi yetmaydi',
  H9: 'Auditoriya turi mos emas',
  H10: 'O‘qituvchi kunlik limiti oshdi',
  H11: 'O‘qituvchi haftalik limiti oshdi',
  H12: 'O‘qituvchi ish kunlari limiti oshdi',
  H13: 'Guruh kunlik limiti oshdi',
  H14: 'Fan haftalik darslari talabdan oshdi',
  H15: '2 slotli dars noto‘g‘ri joylashgan',
  H16: 'Nofaol obyekt ishlatilgan',
  H17: 'Qulflangan dars',
  H18: 'Almashtiruvchi band yoki yo‘q',
  H19: 'Tadbir bilan to‘qnashuv',
  ORPHAN: 'Bog‘liq obyekti o‘chirilgan dars',
  UNDER: 'Fan haftalik darslari yetishmaydi',
};

export const SOFT_CODES = {
  S1: 'Minimal ish kunlari bajarilmadi',
  S2: 'Kunlik minimal dars bajarilmadi',
  S3: 'O‘qituvchi afzal kunidan tashqari',
  S4: 'O‘qituvchi afzal vaqtidan tashqari',
  S5: 'Dars afzalligi buzildi',
  S6: 'O‘qituvchida bo‘shliq ("oyna")',
  S7: 'Guruhda bo‘shliq',
  S8: 'Ketma-ket darslar juda ko‘p',
  S9: 'Bir fan bir kunda takrorlandi',
  S10: 'Taqsimotdan chetlanish',
  S11: 'Guruhda kunlik yuk notekis',
  S12: 'Ketma-ket paralarda turli bino',
  S13: 'Kechki slot ishlatildi',
  S14: 'Xona nomaqbul (juda katta yoki maxsus xona oddiy darsga)',
  S15: 'Tanlov bloki variantlari bir vaqtda emas',
};

export const T = {
  save: 'Saqlash', cancel: 'Bekor qilish', edit: 'Tahrirlash', del: 'O‘chirish', add: 'Qo‘shish',
  close: 'Yopish', confirm: 'Tasdiqlash', search: 'Qidirish…', yes: 'Ha', no: 'Yo‘q',
  active: 'Faol', inactive: 'Nofaol', available: 'Mavjud', unavailable: 'Mavjud emas',
  unscheduled: 'Joylashtirilmagan', conflict: 'Konflikt', nothing: 'Hech narsa topilmadi',
};
