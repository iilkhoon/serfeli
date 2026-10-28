# Qəpik — Azərbaycan qiymət müqayisəsi platforması

Azərbaycan dilində, mobil və masaüstü üçün hazırlanmış qiymət müqayisəsi tətbiqi. React 19, Vinext/Vite, Cloudflare Worker və D1 verilənlər bazası.

## Cari əhatə

- 50 yerli mağaza/profil və loqoları; mağaza adı/domeni üzrə axtarış.
- İrşad HTML adapteri, Baku Electronics Product JSON-LD oxuyucusu və Technomania rəsmi JSON feed-i.
- Technomania: ilkin 235 məhsul, 423 rəng variantı. Feed-dəki stok qorunur; bütün variantlar stokda kimi təqdim edilmir.
- Eyni variantın qiymət, çatdırılma və 6/12/18 aylıq taksit yekunu üzrə müqayisəsi.
- Məhsul axtarışı, kateqoriyalar, filtrlər, səhifəli kataloq, variant seçimi və qiymət tarixçəsi.
- Hesaba bağlı seçilmişlər və saytdaxili hədəf qiymət bildirişi.
- Admin: D1-də qaldığı yerdən davam edən sitemap idxal növbəsi, kataloq, mağaza/təklif CRUD, mənbə yoxlama, rəsmi feed önizləmə/yeniləmə, JSON/CSV/XML idxalı, rəy moderasiyası, mağaza müraciəti, real keçid analitikası, əməliyyat jurnalı, sayt parametrləri.

Mağaza kataloquna daxil olmaq qiymət inteqrasiyasının aktiv olması demək deyil. 13,404 aktiv məhsul/variantdan ibarət dərc edilmiş mənbə snapshot-u var. Techbar, Casio, Eurolux, SeeHome və Allstar açıq kataloqları, Soliton metadatası və yalnız mağaza nişanı təsdiqlənmiş Tap.az elanları da daxildir. Baku/MG/Ali & Nino/Bytelecom tam qiymət idxalı hələ bitməyib. Köhnə nümunə məhsullar ictimai kataloqda deaktiv edilib.

## Lokal iş

```text
npm run dev
npx tsc --noEmit
node scripts/verify-api.mjs
node scripts/verify-extractors.mjs
node scripts/verify-feed.mjs
node scripts/verify-crawl-rules.mjs
node scripts/verify-crawl-jobs.mjs
node scripts/verify-crawl-recovery.mjs
node scripts/verify-alinino.mjs
```

D1 üçün ilk build-dən sonra `drizzle/` daxilindəki SQL migration faylları lokal `.wrangler/state` bazasına tətbiq edilir. Yayımlamada Sites migration-ları özü tətbiq edir.

`verify-api.mjs` yalnız localhost bazasına müvəqqəti test məlumatı yazır. `sync-directory-local.mjs` və `verify-live.mjs` lokal ilkin məlumat alətləridir; production-a avtomatik tətbiq edilmir.

## Mənbə quruluşu

- `app/platform.tsx`: alıcı interfeysi.
- `app/crawl-panel.tsx`, `lib/crawl-jobs.ts`: saxlanan idxal işi, paralel sorğu kilidi, 429 gözləməsi və 403 dayanması.
- `app/admin.tsx`, `app/feed-panel.tsx`: admin paneli və rəsmi feed idarəetməsi.
- `app/api/v1/[...path]/route.ts`: versiyalanmış API, autentifikasiya, admin icazələri və D1 əməliyyatları.
- `lib/technomania.ts`: rəsmi feed yoxlaması, rənglərin ayrılması və dəqiq məhsul uyğunlaşdırılması.
- `lib/extractor.ts`: domen məhdudiyyətli məhsul səhifəsi oxuyucuları.
- `lib/catalog.ts`, `lib/live-catalog.ts`: kataloq müqaviləsi və ilkin mənbəli məlumatlar.
- `docs/`: bazar araşdırması, mənbə sübutları, dizayn sistemi və əməliyyat sənədləri.
- `public/logos/`, `public/products/`: mağaza loqoları və ilkin məhsul şəkilləri.

## Giriş və yayım

Sayt ilkin olaraq sahibə məxsus şəxsi yayımdadır. `/admin` səhifəsində ilk aktivləşdirmə sahib hesabını admin kimi D1-də saxlayır. Bu tamamlanmadan giriş dairəsi genişləndirilməməlidir. Sonrakı admin yazmaları serverdə həmin identifikatora görə qorunur. Seçilmişlər və bildirişlər istifadəçi identifikatoruna bağlıdır.

Fon scheduler-i, e-poçt/SMS/Telegram/push göndərişi və native iOS/Android tətbiqi hazırda qoşulmayıb. Feed admin panelindən real vaxtda yenilənir. Native tətbiq üçün `/api/v1` və dizayn tokenləri hazırdır; mobil web manifest mövcuddur.


## İdxal növbəsi
`/admin` → **Məlumat mənbələri** → **Sitemap-dən məhsul idxalı**. Mənbəni seçib işi başladın; panel hər sorğuda bir URL yoxlayır. Səhifə bağlansa mövqe D1-də qalır, lakin fon scheduler-i olmadığı üçün iş öz-özünə davam etmir. Eyni mənbə üçün yalnız bir tamamlanmamış iş yaradıla bilər. Mövcud dəqiq mənbə linki tanındıqda eyni məhsul/təklif yenilənir; qiyməti və variantı qeyri-müəyyən səhifə idxal edilmir.
`0001_striped_electro.sql` metadata siyahıları üçün indeks və SQLite JSON ifadəsi ilə mənbə üzrə unikal iş indeksi yaradır. İfadə indeksi Drizzle generatorunun vergül sitatlama məhdudiyyətinə görə migration SQL-də açıq saxlanır.
`verify-crawl-jobs.mjs` localhost-da Soliton işi üzrə bir real məhsulu yoxlayır və işi dayandırır; production bazasına toxunmur.
