# Smart Schedule Builder

Serversiz, **constraint-based** dars jadvali generatori. Universitet, maktab, kollej, til markazi va o‘quv markazlari uchun.
GitHub Pages'da ishlaydi: backend, server, database va API talab qilinmaydi. Barcha ma'lumotlar brauzerning `localStorage`'ida saqlanadi.

> Bu oddiy jadval chizuvchi emas: generator **hard cheklovlarni hech qachon buzmaydi**, har bir qarorini tushuntiradi ("Nega bu slot?"),
> joylashmagan darslar uchun aniq sabab va yechim beradi, o‘qituvchilarni doimiy yoki vaqtincha almashtirishni qo‘llab-quvvatlaydi.

---

## Imkoniyatlar

**Ma'lumotlar**
- Guruhlar (smena, o‘quv vaqtlari, kichik guruhlar), o‘qituvchilar (fanlar, limitlar, availability matritsasi, afzal kun/vaqtlar, yo‘qliklar), fanlar (katalog), **o‘quv yuklamasi** (Fan + Guruh(lar) + O‘qituvchi + soat), auditoriyalar (sig‘im, tur, jihoz, ishlash vaqtlari), vaqt slotlari, semestr kalendari (toq/juft hafta, bayramlar).
- Potok (bir nechta guruh bitta darsda), kichik guruhlar, 2 slotli (juft) darslar, 2 haftada 1 marta (toq/juft) darslar.
- Qidiruv, filter, saralash, faol/nofaol, validatsiya (o‘zbekcha xabarlar), kaskad o‘chirish qoidalari.

**Jadval**
- Grid: Umumiy / Guruh / O‘qituvchi / Auditoriya ko‘rinishlari, filterlar, "Shablon" va "Sana bo‘yicha" rejimlari.
- Qo‘lda qo‘shish (jonli tekshiruv, mos xonalar ro‘yxati), **Drag & Drop** (sichqoncha va sensor ekran; kataklar ✅/⚠️/❌ bilan bo‘yaladi), klaviatura orqali ko‘chirish, **Swap**, **Lock**, **Undo/Redo** (50 amal, `Ctrl+Z` / `Ctrl+Y`).
- "Nega bu slot?" — har bir dars uchun tushuntirish va muqobil variantlar soni.

**Avtomatik generator** (Web Worker'da, UI qotmaydi)
- Imkoniyat tahlili → domen → Most Constrained First + cheklangan backtracking → simulated annealing → natija.
- Rejimlar: Tez / Optimal / Maksimal; qamrov (guruh/o‘qituvchi/xona); mavjud jadvalni saqlash yoki almashtirish; seed; oldingi versiyaga qaytish.

**Kadrlar** ⭐
- **Vaqtincha almashtirish** (kasallik, ta'til, safar): nomzodlar reytingi, band vaqtlar uchun bir martalik ko‘chirish yoki bekor + qoplash, oldindan ko‘rish, uzaytirish, erta tugatish. Haftalik shablon o‘zgarmaydi; muddat tugagach asl o‘qituvchi avtomatik qaytadi.
- **To‘liq o‘tkazish**: yuklama yangi o‘qituvchiga, mos kelmagan darslar avtomatik qayta joylashtiriladi, potokdan qisman o‘tkazish, tarix va qaytarish.
- **Yo‘qlik qo‘shish**: ta'sirlangan barcha darslar va har biri uchun eng yaxshi almashtiruvchi avtomatik taklif qilinadi.
- Almashtirishlar varaqasini chop etish, almashtirish hisoboti.

**Nazorat va tahlil**
- Konfliktlar (🔴 kritik / 🟠 ogohlantirish / 🟢 hal qilingan), filterlar, jadvalga o‘tish, tezkor yechimlar.
- Joylashtirilmagan darslar — aniq sabab kodlari va batafsil izoh, qo‘lda joylashtirish.
- 💡 **Maslahatchi** — "Nima o‘zgarsa joylashadi?": cheklovlarni bittadan yumshatib simulyatsiya qiladi va "Qo‘llash" tugmasi bilan kiritadi.
- 🔥 **Tor joylar** — bosim koeffitsienti va kun × para heatmap.
- ⏱️ **Soat hisobi** va dars jurnali (o‘tildi / o‘tilmadi / qoplandi), statistika.

**Versiyalar va tajriba** (v2.2)
- 📢 **Jadvalni e'lon qilish**: ishchi jadval — qoralama; e'lon qilingan versiya ko‘rsatilgan sanadan kuchga kiradi. Semestr o‘rtasida qayta tuzilsa ham o‘tgan haftalar tarixi (soat hisobi, almashtirishlar, .ics) buzilmaydi.
- **O‘zgarishlar ro‘yxati**: istalgan ikki versiya yoki qoralamani taqqoslash, har bir o‘qituvchi/guruh uchun "Seshanba 2-para → Payshanba 3-para" ko‘rinishidagi matn — Telegramga nusxalash yoki chop etish.
- 🧪 **Tajriba rejimi**: "agar … bo‘lsa?" — istalgan o‘zgarishni sinab ko‘rib, qo‘llash yoki bitta tugma bilan asl holatga qaytarish.
- 🛟 **Backup eslatmasi**: N kun (standart 7) yoki 100 ta o‘zgarishdan keyin ogohlantiradi.

**Qo‘shimcha modullar** (v2.2)
- 🎪 **Tadbirlar**: bir martalik (sana, xona/o‘qituvchi/guruh; ta'sirlangan darslar bekor qilinadi yoki konflikt ko‘rsatiladi) va haftalik (kafedra majlisi — generator chetlab o‘tadi).
- 🎓 **Tanlov fanlari bloki**: bir blokdagi variantlar bir vaqtda o‘tadi, guruh talabalari ular orasida bo‘linadi; sig‘im yozilgan talabalar soni bo‘yicha.
- 📝 **O‘qituvchi availability formasi**: har bir o‘qituvchiga shaxsiy havola → u vaqtlarini belgilab javob kodini yuboradi → admin farqlarni ko‘rib qabul qiladi. Server kerak emas.
- 🌐 **Talabalar uchun ommaviy sahifalar va QR**: har bir guruh/xona uchun mustaqil HTML sahifa (bugungi kun va toq/juft hafta avtomatik), ZIP + xona eshiklari uchun QR varaqalar.
- 📝 **Imtihon sessiyasi**: yuklamadan imtihonlar ro‘yxati, avtomatik jadval (guruhda kuniga bitta imtihon, dam kunlari, sig‘im — kerak bo‘lsa bir nechta xona, imtihon oluvchi bandligi), nazoratchilarni teng taqsimlash, qo‘lda ko‘chirish va qotirish, CSV/chop etish.
- 📲 **PWA**: GitHub Pages'dan ochilganda ilovani telefon/kompyuterga o‘rnatish va to‘liq offline ishlash.
- 🌍 **Tillar**: menyu va umumiy elementlar o‘zbek, rus va ingliz tillarida (`src/i18n/index.js`). Sahifa ichidagi matnlar hozircha o‘zbekcha.

**Fayllar**
- JSON export/import (sxema versiyasi + migratsiya, atomik), backup/tiklash.
- **Excel/CSV ommaviy import** shablonlar bilan (ustunlarni moslashtirish, qatorma-qator xatolar, "Siz buni nazarda tutdingizmi?").
- CSV (UTF-8 BOM), Excel eksport, **.ics** (Google/Apple/Outlook kalendari), Print/PDF (A4 landscape).

Interfeys o‘zbek tilida (lotin), light/dark mode, desktop/planshet/mobil, klaviatura bilan boshqarish.

---

## O‘rnatish va ishga tushirish

Talab: Node.js 18+ (20 tavsiya etiladi).

```bash
npm install        # bog‘liqliklar
npm run dev        # lokal server: http://localhost:5173
npm test           # avtomatik testlar (Vitest)
npm run build      # production build → dist/
npm run preview    # build'ni lokal ko‘rish
npm run build:single   # hammasi bitta index.html faylda → dist-single/ (offline)
```

`dist-single/index.html` — internet va serversiz, shunchaki brauzerda ochiladigan yagona fayl.

## GitHub Pages'ga joylash

1. GitHub'da yangi repozitoriy yarating va kodni `main` branch'ga push qiling:
   ```bash
   git init && git add . && git commit -m "Smart Schedule Builder"
   git branch -M main
   git remote add origin https://github.com/<login>/<repo>.git
   git push -u origin main
   ```
2. Repozitoriy → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. `.github/workflows/deploy.yml` avtomatik ishga tushadi: `npm ci` → `npm test` → `npm run build` → `dist/` deploy.
4. Bir-ikki daqiqadan so‘ng sayt `https://<login>.github.io/<repo>/` manzilida ochiladi.

Konfiguratsiya: `vite.config.js`da `base: './'` (relative paths — istalgan papkada ishlaydi), hash routing (`#/schedule`) — sahifani yangilaganda 404 bo‘lmaydi.

## Ma'lumotlar qayerda saqlanadi

Faqat shu brauzerning `localStorage`'ida (≈5 MB). Kalitlar: `smartSchedule_meta`, `_groups`, `_teachers`, `_subjects`, `_workloads`, `_rooms`, `_timeslots`, `_calendar`, `_schedule`, `_substitutions`, `_transfers`, `_conflictLog`, `_settings`, `_lessonLog`, `_versions`, `_events`, `_exams`, `_history`, `_snapshots`, `_sandbox`.

- Har o‘zgarishdan keyin avtomatik saqlanadi (Sozlamalarda o‘chirish mumkin).
- Bir nechta tab ochiq bo‘lsa — sinxronlanadi.
- Boshqa kompyuterga o‘tkazish yoki zaxira uchun: **Import / Export → Backup yaratish** (JSON). Tiklash — **Backup tiklash**. Import xato bo‘lsa mavjud ma'lumot buzilmaydi.
- Brauzer ma'lumotlari tozalansa — localStorage ham o‘chadi. Muntazam backup oling.

## Ishlash tartibi (tavsiya)

Vaqtlar → Auditoriyalar → Guruhlar → Fanlar → O‘qituvchilar (fanlar + availability) → O‘quv yuklamasi → **Avtomatik tuzish** → Konfliktlar / Joylashtirilmagan / Maslahatchi → qo‘lda sozlash (drag & drop, lock) → Chop etish / .ics.
Yoki barchasini **Excel shablonlari** orqali import qiling (`public/templates/` va ilova ichidagi "Shablonni yuklab olish").

## Algoritm (qisqacha)

Fayllar: `src/scheduler/`.

| Qadam | Modul | Tavsif |
|---|---|---|
| 1 | `feasibility.js` | Generatsiyadan oldin imkonsizlikni aniqlash: o‘qituvchi talabi vs imkoniyat (availability, kunlik × ish kunlari, haftalik limit), guruh slotlari, xona turlari, domeni bo‘sh yuklamalar. |
| 2 | `slotGenerator.js` | Har bir dars uchun statik hard cheklovlardan o‘tgan (kun, slot, xona, paritet) kombinatsiyalari. |
| 3 | `scheduler.js` | **MRV** (eng kam variantli dars birinchi) + ustuvorlik (maxsus xona, kam availability, potok/2 slot, ko‘p soatli). Qiymat — eng kam soft penalty. Domen bo‘sh qolsa — **ejection chain** (to‘sib turgan 1–2 darsni boshqa joyga surish, jurnal bilan to‘liq orqaga qaytarish). Byudjet cheklangan — cheksiz urinish yo‘q. |
| 4 | `optimizer.js` | **Simulated annealing**: ko‘chirish va swap harakatlari, faqat hard cheklovlarni saqlaydiganlari qabul qilinadi; eng yaxshi holat tiklanadi. |
| 5 | `explainer.js`, `diagnose.js` | "Nega bu slot?" izohlari va joylashmaganlar sababi (`TEACHER_WEEKLY_LIMIT`, `NO_ROOM_TYPE`, `LOCKED_BLOCKS`, …). |

`constraintChecker.js` — **yagona manba**: generator, qo‘lda qo‘shish, drag & drop, swap, almashtirish va konfliktlar sahifasi bir xil qoidalardan foydalanadi.

- **Hard (H1–H18)**: o‘qituvchi/guruh/xona bir vaqtda bitta darsda; availability; smena; sig‘im; xona turi; kunlik/haftalik/ish kunlari limitlari; guruh kunlik limiti; fan soni; 2 slotli dars tanaffusni kesmaydi; nofaol obyektlar; locked; almashtiruvchi bandligi.
- **Soft (S1–S14)** penalty og‘irliklari Sozlamalarda: minimal ish kunlari (kuchli), kunlik minimum, afzal kun/vaqt, dars afzalligi (past/o‘rta/yuqori), bo‘shliqlar, ketma-ketlik, taqsimot, notekislik, binolar orasida ko‘chish, kechki slot, nomaqbul xona.
- **Optimallashtirish ko‘rsatkichi** = `100 × (1 − P_yakuniy / max(P_joylashtirishdan_keyin, N × 50))`. Bu mutlaq sifat emas — optimallashtirish qanchalik yaxshilaganini ko‘rsatadi. Qamrov (%) alohida.

Almashtirish: `src/substitution/` (`calendarResolver.js` — sanadagi holat, `candidates.js` — nomzodlar, `substitutionService.js`, `transferService.js`). Tahlil: `src/analysis/` (`advisor.js`, `bottlenecks.js`, `hours.js`).

## Loyiha strukturasi

```
src/
  main.js, router.js
  state/        store.js (Undo/Redo, auto-save), selectors.js, actions.js
  scheduler/    scheduler.js, scheduler.worker.js, constraintChecker.js, scoring.js, optimizer.js,
                slotGenerator.js, feasibility.js, diagnose.js, explainer.js, conflicts.js, model.js
  substitution/ calendarResolver.js, candidates.js, substitutionService.js, transferService.js
  analysis/     advisor.js, bottlenecks.js, hours.js, versions.js
  exams/        examScheduler.js
  services/     storage.js, migrations.js, exportService.js, importService.js, csvService.js,
                printService.js, icsService.js, bulkImport.js, conflictService.js, schedulerRunner.js,
                demoService.js, cascade.js
  validation/   validators.js
  pages/        24 ta sahifa (versions, events, exams, teacherForm qo‘shildi)
  components/   modal, toast, crud, availabilityMatrix, lessonCard, lessonDialogs, transferWizard, search, charts, emptyState
  data/         defaults.js, demoData.js
  i18n/         uz.js
  styles/       theme.css, base.css, layout.css, schedule.css, print.css
tests/          Vitest: 20 ta majburiy senariy + qo‘shimchalar
public/templates/  CSV import shablonlari
```

## Testlar

`npm test` — texnik topshiriqdagi 20 ta qabul senariysi (4 kunlik o‘qituvchi, aniq 4 slot, imkonsizlik, sig‘im, xona turi, locked,
drag&drop to‘qnashuvi, potok, vaqtincha va qisman almashtirish, to‘liq o‘tkazish, o‘chirish, import atomikligi, Undo/Redo, refresh,
Excel import, maslahatchi, tor joylar, .ics, soat hisobi), katta hajmdagi yuklama testi va v2.2 modullari
(versiyalar, tajriba rejimi, backup eslatmasi, tadbirlar, tanlov fanlari, o‘qituvchi formasi, ommaviy sahifalar, imtihonlar, tarjima) — jami 45 ta test.

## Cheklovlar

- Ko‘p foydalanuvchili real vaqt sinxronizatsiyasi, login, Telegram/email bildirishnomalar — backend talab qiladi, shuning uchun kiritilmagan.
- Ma'lumot bitta brauzerda. Jamoa bilan ishlash uchun JSON/Excel fayl almashing.
- Rus va ingliz tillarida hozircha menyu, yuqori panel va umumiy tugmalar tarjima qilingan.
- O‘qituvchi formasi va QR sahifalar ilova internetda (GitHub Pages) joylashganda to‘liq ishlaydi.
