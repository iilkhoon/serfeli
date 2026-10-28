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

## 27 oktyabr — rəsmi feed və mağaza genişləndirilməsi

İstifadəçinin təqdim etdiyi rəsmi Technomania JSON feed-i HTTP 200 ilə yoxlanıb və inteqrasiya edilib: https://technomania.az/api/catalog/feed?format=json . Əvvəlki HTML 403 qeydi bu rəsmi feed bağlantısına aid deyil. İlkin feed 235 məhsuldan 423 rəng variantı verir; 3 variant stokdadır. `lib/technomania.ts` rəngləri ayırır, stok, şəkil və 6/12/18 aylıq taksit yekunlarını saxlayır. Eyni qara/128 GB iPhone 16 ayrıca təsdiqlənmiş qayda ilə mövcud modelə uyğunlaşdırılıb. Digər qeyri-müəyyən modellər birləşdirilmir.

Admin → Məlumat mənbələri → Technomania feed-i bölməsində önizləmə və serverdə yeniləmə var. Tam olmayan/xətalı cavab bazadakı əvvəlki kataloqu əvəz etmir; mənbədən çıxan təkliflər stokdan çıxarılır. 31 əlavə yoxlanmış mağaza və loqosu ilə ümumi mağaza sayı 38-dir. Yeni mağazalar qiymət mənbəyi qoşulmamış kataloq qeydi statusundadır. Mənbələr `local-merchants.json` faylında saxlanır. Köhnə nümunə məhsullar ictimai kataloqdan deaktiv edilib.

## Son SEO və vitrin yeniləməsi

Ana səhifədə 7 məhsul bölməsi və əlavə 24 mənbədə yoxlanmış stok məhsulu var. Mağaza sayı38, ictimai aktiv məhsul/variant sayı451-dir. Bütün qiymət mənbələri qoşulmuş kimi təqdim edilmir. Tam Technomania snapshot-u server moduluna keçirilib; böyük feed brauzerin JavaScript paketinə daxil edilmir.

SEO: səhifəyə aid title/description, canonical, OpenGraph/Twitter şəkli, Product/AggregateOffer və BreadcrumbList JSON-LD, sitemap.xml, robots.txt, həqiqi404, şəxsi səhifələrdə noindex. Məhsul və kateqoriya naviqasiyası crawl edilən href linkləridir. `scripts/verify-seo.mjs` lokal yoxlamadan keçib; ilkin sitemap505 URL verir. Sayt sahibə məxsus şəxsi yayımdadır; axtarış indekslənməsi üçün sonradan ictimai giriş və seçilən domen üzrə Search Console sazlanmalıdır.

Dizaynın son istiqaməti `app/commerce.css` faylındadır: qrafit, ağ və kobalt mavi; Archivo başlıq şrifti; sıx alış-veriş vitrini. Əvvəlki pastel təqdimat üslubu dəyişdirilib.


## 28 oktyabr — ziyarət zamanı canlı feed
SSR, sitemap və ictimai kataloq API-si Technomania rəsmi feed-ini oxuyur. Proses daxilində 5 dəqiqəlik keş və paralel sorğuların birləşdirilməsi var. Xətada son uğurlu məlumat saxlanır, 1 dəqiqədən sonra yenidən yoxlanır və köhnə status göstərilir. Bu, fon scheduler-i deyil. D1-ə tarixçə yazılması admin feed sinxronizasiyası ilə ayrıca aparılır. Feed-dən çıxan variantlar deaktiv edilir; yoxa çıxan təklif stokda kimi saxlanmır. İrşad/Baku təklifləri bu bağlantı ilə yenilənmir.
`node scripts/verify-live-catalog.mjs` cari feed-dəki hər variantı API ilə tutuşdurur, bütün unikal şəkil URL-lərinin HTTP və content-type cavabını yoxlayır; nəticə `docs/live-catalog-audit.json` faylındadır.


## 28 oktyabr — geniş yerli kataloq və mərhələli toplayıcı
Techbar 8,220, Casio 1,413, Eurolux 907, SeeHome 1,368 və Allstar 988 məhsul açıq Store API-nin bütün səhifələrindən alınıb. Mənbə cəmi 12,897 sətir qaytarıb; adı olmayan bir Techbar sətri karantinə alınıb. Allstar qiymət açıqlamır: məhsullar qiymətsiz göstərilir, sıfır qiymət təklifi yaradılmır. WooCommerce valyuta vahidi (`currency_minor_unit`, o cümlədən Eurolux 0) nəzərə alınır; variant seçimi tələb olunan məhsul üçün dəqiq qiymət uydurulmur.
Soliton sitemap-dəki 56 namizəddən 35 səhifə qiymət/şəkil/stok metadatası verib; 21 köhnə link 404-ə yönləndirilib və idxala daxil edilməyib. Saytın bütün cari inventarının sitemap-də olduğuna dair iddia edilmir.
Tap.az ilk elektronika siyahısındakı 22 elan üçün detal səhifəsi yoxlanıb. Yalnız `hasLabel=true`, `label=RETAILER`, `APPROVED` statusu və həqiqi `/shops/` profili olan 11 mağaza daxildir. Fərdi elanlar daxil edilmir. Yeni/işlənmiş vəziyyəti ayrıca saxlanır, avtomatik məhsul birləşməsi edilmir. Elanın aktivliyi stok kimi təqdim olunmur (`stockKnown=false`). Telefon, istifadəçi hesabı və koordinatlar snapshot-a daxil edilmir. Tap.az tam inventar idxalı deyil.
`scripts/polite-http.mjs` domen üzrə növbə, minimum 1 saniyə fasilə, disk keşi, ETag/Last-Modified, 304, Retry-After, 403/401 dayanması və 5xx üçün məhdud təkrar verir. Skriptlər qaldığı səhifələrə keşlə qayıdır; Cloudflare fon növbəsi və scheduler hələ aktiv deyil. 5 yeni API kataloqu dərc olunmuş yoxlama snapshot-larıdır; Technomania ziyarət zamanı 5 dəqiqəlik keşlə ayrıca yenilənir.
`scripts/discover-sitemaps.mjs` verilən sitemap-ləri domen sərhədi, XML ölçü limiti və entity rəddi ilə oxuyur. MG üçün istifadəçinin verdiyi `/sitemap.xml` 404-dür; rəsmi robots.txt-də göstərilən `/media/sitemap/sitemap_az.xml` istifadə olunur. Baku/MG/Ali & Nino üzrə tapılmış linklərin hamısı qiymət və stokla idxal edilmiş sayılmır. Bytelecom verilən sitemap indeksində məhsul sitemap-i göstərmir.
