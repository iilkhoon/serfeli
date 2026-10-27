# Qəpik əməliyyat qeydləri

## İlk giriş

Sayt ilkin olaraq sahibə məxsus şəxsi yayımda saxlanır. `/admin` ünvanında hesaba daxil olub aktivləşdirmə düyməsini basın. İlk sahib identifikatoru D1 bazasında bir dəfə saxlanır; sonrakı istifadəçi bu yolla admin ola bilməz. İctimai yayımı açmazdan əvvəl bu addım tamamlanmalıdır. Yeni admin rol sistemi bu buraxılışda yoxdur.

## Hazır imkanlar

Məhsul və mağaza CRUD, qiymət təklifi redaktəsi, stok/deaktivləşdirmə, dəqiq variant, çatdırılma, taksit yekunu, reklam etiketi; JSON/CSV/XML idxalı (100 təklif limiti); İrşad HTML adapteri və Product JSON-LD oxuyucusu; real mənbəyə keçid sayğacı; rəy moderasiyası və mağaza müraciətləri; əməliyyat jurnalı; hesab üzrə seçilmişlər və saytdaxili qiymət xəbərdarlığı.

Mənbə oxuma yalnız təsdiqlənmiş mağaza domenlərinə HTTPS sorğusu göndərir. Sorğu yönləndirmələrində domen yoxlanır, vaxt və ölçü limitləri var. Anti-bot səhifəsi uğurlu qiymət nəticəsi kimi saxlanmır. İrşad səhifəsində gizli alternativ variantlar yox, yalnız aktiv məhsul hissəsi oxunur. SKU/ad dəyişərsə yenilənmə manual yoxlamaya saxlanır.

Real təklif olduqda həmin məhsulun nümunə təklifləri müqayisədən kənarlaşdırılır. Çatdırılma məlum deyilsə sıfır/pulsuz kimi təqdim edilmir. Taksit məlumatı yoxdursa aylıq məbləğ hesablanmır. Yoxlanması 24 saatdan köhnə olan təklif işarələnir.

## Məlumatın əhatəsi

27 oktyabr 2026 tarixində ilkin mənbə yoxlaması: 5 real məhsul, 6 real təklif, 2 cavab verən mağaza. Qalan kataloq nümunədir. Real qiymətlərdə uzunmüddətli tarixçə yaradılmayıb; başlanğıc müşahidəsi və sonrakı idxallar saxlanılır. İlkin faktlar `verified-products.json` faylındadır.

Technomania.az mağaza, loqo və domen səviyyəsində əlavə edilib. Məhsul səhifələri yoxlanışda HTTP 403 qaytarıb. Bu mağazanın avtomatik qiymət inteqrasiyası hazır hesab edilmir. JSON/CSV/XML və manual məhsul qiyməti daxil etmək mövcuddur. Mənbə nəticəsi `technomania-products.json` faylındadır.

## Hazırda qoşulmayan xidmətlər

Arxa planda daimi qiymət skanı, e-poçt/SMS/Telegram/push çatdırılması, mağaza billing sistemi və native mobil tətbiq qoşulmayıb. Bildiriş hədəfləri bazada saxlanır və sayt açıldıqda qiymətlə müqayisə edilir. “İndi yenilə” düyməsi real mənbələri manual yoxlayır; scheduler deyil.

## Lokal işə salma

`npm run dev`; tip yoxlaması `npx tsc --noEmit`; build üçün Sites-in `build-site.mjs` helper-i. D1 migration faylları `drizzle/` qovluğundadır. Production və lokal məlumat bazası ayrıdır. `scripts/verify-api.mjs` yalnız localhost üçün test məlumatı yaradır və əsas CRUD qeydlərini silir. `scripts/verify-live.mjs` yalnız lokal bazaya yoxlanmış ilkin real kataloqu əlavə edir və bir mənbə sorğusunu sınayır.

API: GET `catalog`, `session`, `personal`; POST `personal`, `reviews`, `applications`, `click`; admin üçün `bootstrap`, GET `admin/data`, POST `admin/save`, `admin/delete`, `admin/import`, `admin/scan`, `admin/moderate`. Bütün yollar `/api/v1/` prefiksindədir. Yazma əməliyyatları hesab tələb edir; admin əməliyyatları əlavə olaraq sahib identifikatorunu serverdə yoxlayır.
