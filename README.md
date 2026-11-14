# Qəpik — Azərbaycan qiymət müqayisəsi platforması

Azərbaycan dilində, mobil və masaüstü üçün hazırlanmış qiymət müqayisəsi tətbiqi. React 19, Vinext/Vite, Node.js server və SQLite verilənlər bazası (öz VPS-də, nginx arxasında).

## Cari əhatə

- 50 yerli mağaza/profil və loqoları; mağaza adı/domeni üzrə axtarış.
- İrşad HTML adapteri, Baku Electronics Product JSON-LD oxuyucusu və Technomania rəsmi JSON feed-i.
- Technomania: ilkin 235 məhsul, 423 rəng variantı. Feed-dəki stok qorunur; bütün variantlar stokda kimi təqdim edilmir.
- Eyni variantın qiymət, çatdırılma və 6/12/18 aylıq taksit yekunu üzrə müqayisəsi.
- Məhsul axtarışı, kateqoriyalar, filtrlər, səhifəli kataloq, variant seçimi və qiymət tarixçəsi.
- Hesaba bağlı seçilmişlər və saytdaxili hədəf qiymət bildirişi.
- Admin: bazada qaldığı yerdən davam edən sitemap idxal növbəsi, kataloq, mağaza/təklif CRUD, mənbə yoxlama, rəsmi feed önizləmə/yeniləmə, JSON/CSV/XML idxalı, rəy moderasiyası, mağaza müraciəti, real keçid analitikası, əməliyyat jurnalı, sayt parametrləri.

Mağaza kataloquna daxil olmaq qiymət inteqrasiyasının aktiv olması demək deyil. 13,404 aktiv məhsul/variantdan ibarət dərc edilmiş mənbə snapshot-u var. Techbar, Casio, Eurolux, SeeHome və Allstar açıq kataloqları, Soliton metadatası və yalnız mağaza nişanı təsdiqlənmiş Tap.az elanları da daxildir. Baku/MG/Ali & Nino/Bytelecom tam qiymət idxalı hələ bitməyib. Köhnə nümunə məhsullar ictimai kataloqda deaktiv edilib.

## Lokal iş

```text
npm run dev
npx tsc --noEmit
npm run lint
npm run format:check
node scripts/verify-api.mjs
node scripts/verify-extractors.mjs
node scripts/verify-feed.mjs
node scripts/verify-crawl-rules.mjs
node scripts/verify-crawl-jobs.mjs
node scripts/verify-crawl-recovery.mjs
node scripts/verify-alinino.mjs
```

Məlumat SQLite faylındadır: `DATABASE_PATH`, yoxdursa `data/qepik.db` (`db/sqlite.ts`, Node-un daxili `node:sqlite` modulu, Node 22.16+). `npm run dev` və `npm start` hər işə düşəndə əvvəlcə `drizzle/` daxilindəki yeni migration-ları tətbiq edir (`npm run db:migrate`), sonra ilkin kataloqu bazaya yazır (`npm run db:seed`; bir neçə saniyə, hazır kataloqda keçilir). `npm start` `npm run build` nəticəsini production serverlə `127.0.0.1:3000`-da açır (`PORT`, `HOST`).

`verify-api.mjs` yalnız localhost bazasına müvəqqəti test məlumatı yazır. `sync-directory-local.mjs` və `verify-live.mjs` lokal ilkin məlumat alətləridir; production-a avtomatik tətbiq edilmir.

## Mənbə quruluşu

- `app/platform.tsx`: alıcı interfeysi.
- `app/crawl-panel.tsx`, `lib/crawl-jobs.ts`: saxlanan idxal işi, paralel sorğu kilidi, 429 gözləməsi və 403 dayanması.
- `app/admin.tsx`, `app/feed-panel.tsx`: admin paneli və rəsmi feed idarəetməsi.
- `app/api/v1/[...path]/route.ts`: versiyalanmış API marşrutları, autentifikasiya və admin icazələri.
- `lib/api/schemas.ts`, `lib/api/records.ts`: API-nin Zod sxemləri və baza qeyd köməkçiləri.
- `db/sqlite.ts`: SQLite bağlantısı və tətbiqin istifadə etdiyi D1-üslublu API (`prepare/bind/batch`); `scripts/db-migrate.mjs`, `scripts/db-seed.mjs`.
- `lib/auth/`, `app/giris`, `app/cixis`: e-poçt və parolla giriş, sessiyalar; `scripts/set-password.mjs`.
- `app/types.ts`: brauzerin gördüyü API cavab tipləri.
- `instrumentation.ts`, `lib/cron.ts`: server prosesində hər dəqiqə idxal işlərini irəlilədən cron (`CRON_ENABLED=1`).
- `deploy/`: VPS üçün systemd servisi, nginx, gecəlik yedək və deploy skripti.
- `lib/technomania.ts`: rəsmi feed yoxlaması, rənglərin ayrılması və dəqiq məhsul uyğunlaşdırılması.
- `lib/extractor.ts`: domen məhdudiyyətli məhsul səhifəsi oxuyucuları.
- `lib/catalog.ts`, `lib/live-catalog.ts`: kataloq müqaviləsi və ilkin mənbəli məlumatlar.
- `docs/`: bazar araşdırması, mənbə sübutları, dizayn sistemi və əməliyyat sənədləri.
- `public/logos/`, `public/products/`: mağaza loqoları və ilkin məhsul şəkilləri.

## Giriş və yayım

**Giriş.** Heç bir xarici xidmət yoxdur. `/giris` e-poçt və parolla daxil olur və ya qeydiyyat açır (`lib/auth/session.ts`). Parollar scrypt ilə heşlənir (`lib/auth/password.mjs`), giriş cəhdləri IP və e-poçt üzrə məhdudlaşdırılır. Uğurlu giriş sessiya yaradır: sayt tokeni `HttpOnly; Secure` `qepik_session` kukisində saxlayır, mobil tətbiq eyni API-dən `Authorization: Bearer` tokeni alır. Bazada yalnız tokenin SHA-256 heşi saxlanır. `/cixis` sessiyanı bağlayır. E-poçt təsdiqi və parol bərpası e-poçt göndərişi olmadığı üçün yoxdur; parolu serverdə `scripts/set-password.mjs` dəyişir.

Mobil tətbiq (Expo) üçün: `POST /api/v1/auth/register` və ya `POST /api/v1/auth/login` `{"email","password","client":"app"}` → `{token, expiresAt, user}`; sonrakı sorğularda `Authorization: Bearer <token>`; çıxış `POST /api/v1/auth/logout`. Sessiya 60 gün etibarlıdır.

`npm run dev` zamanı `/giris` sabit yerli test hesabı ilə daxil edir, `/cixis` çıxarır (`scripts/vite/local-auth-plugin.ts`, yalnız localhost-dan). Bu plugin hesabı `x-qepik-user-*` başlıqları ilə ötürür; tətbiq bu başlıqları yalnız dev rejimində oxuyur (`app/auth.ts`, `import.meta.env.DEV`), production build-də bu kod yoxdur, ona görə saxta başlıq heç bir icazə vermir.

**Admin.** `/admin` yalnız `OWNER_EMAIL` hesabına açıqdır: ilk aktivləşdirmə həmin hesabı sahib kimi saxlayır, başqa hesab 403 alır. Production-da `OWNER_EMAIL` təyin olunmayıbsa admin heç kimə açılmır. Bu e-poçtla saytda qeydiyyat bağlıdır; sahib hesabı serverdə yaradılır: `sudo -u qepik node scripts/set-password.mjs <OWNER_EMAIL>`.

**Server.** Sayt öz VPS-də işləyir (Ubuntu, Node 24, nginx + Let's Encrypt). Quraşdırma və yeniləmə addımları `docs/OPERATIONS.md` → “Server”. Parametrlər `/etc/qepik/qepik.env` faylındadır (nümunə: `deploy/qepik.env.example`); kanonik domen `SITE_URL` dəyişənidir (`lib/seo.ts`).

Yazma sorğuları (`POST`) başqa saytdan gələrsə rədd edilir: `Origin` başqa mənbədirsə və ya `Sec-Fetch-Site` `same-origin`/`none` deyilsə cavab 403-dür. Sonrakı admin yazmaları serverdə həmin identifikatora görə qorunur. Seçilmişlər və bildirişlər istifadəçi identifikatoruna bağlıdır.

E-poçt/SMS/Telegram/push göndərişi və native iOS/Android tətbiqi hazırda qoşulmayıb. Feed admin panelindən real vaxtda yenilənir. Native tətbiq üçün `/api/v1` və dizayn tokenləri hazırdır; mobil web manifest mövcuddur.


## İdxal növbəsi
`/admin` → **Məlumat mənbələri** → **Sitemap-dən məhsul idxalı**. Mənbəni seçib işi başladın; panel hər sorğuda bir URL yoxlayır. Səhifə bağlansa mövqe bazada qalır və server prosesindəki cron (`lib/cron.ts`, `CRON_ENABLED=1`) işi hər dəqiqə ~45 saniyəlik büdcə ilə davam etdirir; dayandırılmış və bloklanmış işlərə toxunmur. Lokal yoxlama üçün `CRON_ENABLED=1 npm start`. Eyni mənbə üçün yalnız bir tamamlanmamış iş yaradıla bilər. Mövcud dəqiq mənbə linki tanındıqda eyni məhsul/təklif yenilənir; qiyməti və variantı qeyri-müəyyən səhifə idxal edilmir.
`0001_striped_electro.sql` metadata siyahıları üçün indeks və SQLite JSON ifadəsi ilə mənbə üzrə unikal iş indeksi yaradır. İfadə indeksi Drizzle generatorunun vergül sitatlama məhdudiyyətinə görə migration SQL-də açıq saxlanır.
`verify-crawl-jobs.mjs` localhost-da Soliton işi üzrə bir real məhsulu yoxlayır və işi dayandırır; production bazasına toxunmur.
