# Qəpik əməliyyat qeydləri

## İlk giriş

Sayt ilkin olaraq sahibə məxsus şəxsi yayımda saxlanır. Serverdə sahib hesabını yaradın (`ssh -t root@<server> "cd /srv/qepik && sudo -u qepik env DATABASE_PATH=/var/lib/qepik/qepik.db node scripts/set-password.mjs <OWNER_EMAIL>"`, parol gizli yazılır), `/giris` ünvanında həmin e-poçt və parolla daxil olun, sonra `/admin` ünvanında aktivləşdirmə düyməsini basın. Sahib identifikatoru bazada bir dəfə saxlanır. Admin yalnız `OWNER_EMAIL` hesabına açıqdır; başqa hesab 403 alır, `OWNER_EMAIL` təyin olunmayıbsa production-da admin heç kimə açılmır. Yeni admin rol sistemi bu buraxılışda yoxdur.

## Hazır imkanlar

Məhsul və mağaza CRUD, qiymət təklifi redaktəsi, stok/deaktivləşdirmə, dəqiq variant, çatdırılma, taksit yekunu, reklam etiketi; JSON/CSV/XML idxalı (100 təklif limiti); İrşad HTML adapteri və Product JSON-LD oxuyucusu; real mənbəyə keçid sayğacı; rəy moderasiyası və mağaza müraciətləri; əməliyyat jurnalı; hesab üzrə seçilmişlər və saytdaxili qiymət xəbərdarlığı.

Mənbə oxuma yalnız təsdiqlənmiş mağaza domenlərinə HTTPS sorğusu göndərir. Sorğu yönləndirmələrində domen yoxlanır, vaxt və ölçü limitləri var. Anti-bot səhifəsi uğurlu qiymət nəticəsi kimi saxlanmır. İrşad səhifəsində gizli alternativ variantlar yox, yalnız aktiv məhsul hissəsi oxunur. SKU/ad dəyişərsə yenilənmə manual yoxlamaya saxlanır.

Real təklif olduqda həmin məhsulun nümunə təklifləri müqayisədən kənarlaşdırılır. Çatdırılma məlum deyilsə sıfır/pulsuz kimi təqdim edilmir. Taksit məlumatı yoxdursa aylıq məbləğ hesablanmır. Yoxlanması 24 saatdan köhnə olan təklif işarələnir.

## Məlumatın əhatəsi

27 oktyabr 2026 tarixində ilkin mənbə yoxlaması: 5 real məhsul, 6 real təklif, 2 cavab verən mağaza. Qalan kataloq nümunədir. Real qiymətlərdə uzunmüddətli tarixçə yaradılmayıb; başlanğıc müşahidəsi və sonrakı idxallar saxlanılır. İlkin faktlar `verified-products.json` faylındadır.

Technomania.az mağaza, loqo və domen səviyyəsində əlavə edilib. Məhsul səhifələri yoxlanışda HTTP 403 qaytarıb. Bu mağazanın avtomatik qiymət inteqrasiyası hazır hesab edilmir. JSON/CSV/XML və manual məhsul qiyməti daxil etmək mövcuddur. Mənbə nəticəsi `technomania-products.json` faylındadır.

## Hazırda qoşulmayan xidmətlər

Arxa planda daimi qiymət skanı (cron yalnız sitemap idxal işlərini irəlilədir), e-poçt/SMS/Telegram/push çatdırılması, mağaza billing sistemi və native mobil tətbiq qoşulmayıb. Bildiriş hədəfləri bazada saxlanır və sayt açıldıqda qiymətlə müqayisə edilir. “İndi yenilə” düyməsi real mənbələri manual yoxlayır; scheduler deyil.

## Lokal işə salma

`npm run dev`; tip yoxlaması `npx tsc --noEmit`; build üçün `npm run build`, build-in lokal sınağı üçün `npm start`. Giriş və server keçidi üçün README-dəki “Giriş və yayım” bölməsinə bax. Migration faylları `drizzle/` qovluğundadır (`npm run db:migrate` tətbiq edir). Lokal baza `data/qepik.db`, production bazası serverdə `/var/lib/qepik/qepik.db` faylıdır. `scripts/verify-api.mjs` yalnız localhost üçün test məlumatı yaradır və əsas CRUD qeydlərini silir. `scripts/verify-live.mjs` yalnız lokal bazaya yoxlanmış ilkin real kataloqu əlavə edir və bir mənbə sorğusunu sınayır.

API: GET `catalog`, `session`, `personal`; POST `personal`, `reviews`, `applications`, `click`; admin üçün `bootstrap`, GET `admin/data`, `admin/catalog`, `admin/jobs`, `admin/matches`, POST `admin/save`, `admin/delete`, `admin/import`, `admin/scan`, `admin/moderate`, `admin/matches`, `admin/jobs/start|tick|control`, `admin/feed-preview`, `admin/feed-sync`, `admin/catalog/materialize`. Bütün yollar `/api/v1/` prefiksindədir. Yazma əməliyyatları hesab tələb edir (401); admin əməliyyatları əlavə olaraq sahib identifikatorunu serverdə yoxlayır (403). Başqa saytdan gələn yazma (Origin/Sec-Fetch-Site) 403 alır. Gövdə Content-Length olmadan da 500 KB-da kəsilir (413), səhv JSON 400-dür. `click` IP üzrə dəqiqədə 60, `personal` istifadəçi üzrə dəqiqədə 60, `reviews`/`applications` 10 dəqiqədə 5 sorğu ilə məhdudlaşır (429, server prosesi daxilində). Gözlənilən xətalar uyğun statusla (400/404/409), daxili xətalar (baza və s.) ümumi mesajla 500 qaytarır; mənbə 401/403/429 cavabı admin skanında 502-dir. Yardımçılar `lib/api/http.ts`-dədir, `scripts/verify-api-http.mjs` serversiz yoxlayır.

## 27 oktyabr — rəsmi feed və mağaza genişləndirilməsi

İstifadəçinin təqdim etdiyi rəsmi Technomania JSON feed-i HTTP 200 ilə yoxlanıb və inteqrasiya edilib: https://technomania.az/api/catalog/feed?format=json . Əvvəlki HTML 403 qeydi bu rəsmi feed bağlantısına aid deyil. İlkin feed 235 məhsuldan 423 rəng variantı verir; 3 variant stokdadır. `lib/technomania.ts` rəngləri ayırır, stok, şəkil və 6/12/18 aylıq taksit yekunlarını saxlayır. Eyni qara/128 GB iPhone 16 ayrıca təsdiqlənmiş qayda ilə mövcud modelə uyğunlaşdırılıb. Digər qeyri-müəyyən modellər birləşdirilmir.

Admin → Məlumat mənbələri → Technomania feed-i bölməsində önizləmə və serverdə yeniləmə var. Tam olmayan/xətalı cavab bazadakı əvvəlki kataloqu əvəz etmir; mənbədən çıxan təkliflər stokdan çıxarılır. 31 əlavə yoxlanmış mağaza və loqosu ilə ümumi mağaza sayı 38-dir. Yeni mağazalar qiymət mənbəyi qoşulmamış kataloq qeydi statusundadır. Mənbələr `local-merchants.json` faylında saxlanır. Köhnə nümunə məhsullar ictimai kataloqdan deaktiv edilib.

## Son SEO və vitrin yeniləməsi

Ana səhifədə 7 məhsul bölməsi və əlavə 24 mənbədə yoxlanmış stok məhsulu var. Mağaza sayı38, ictimai aktiv məhsul/variant sayı451-dir. Bütün qiymət mənbələri qoşulmuş kimi təqdim edilmir. Tam Technomania snapshot-u server moduluna keçirilib; böyük feed brauzerin JavaScript paketinə daxil edilmir.

SEO: səhifəyə aid title/description, canonical, OpenGraph/Twitter şəkli, Product/AggregateOffer və BreadcrumbList JSON-LD, sitemap.xml, robots.txt, həqiqi404, şəxsi səhifələrdə noindex. Məhsul və kateqoriya naviqasiyası crawl edilən href linkləridir. `scripts/verify-seo.mjs` lokal yoxlamadan keçib; ilkin sitemap505 URL verir. Sayt sahibə məxsus şəxsi yayımdadır; axtarış indekslənməsi üçün sonradan ictimai giriş və seçilən domen üzrə Search Console sazlanmalıdır.

Dizaynın son istiqaməti `app/commerce.css` faylındadır: qrafit, ağ və kobalt mavi; Archivo başlıq şrifti; sıx alış-veriş vitrini. Əvvəlki pastel təqdimat üslubu dəyişdirilib.


## 28 oktyabr — ziyarət zamanı canlı feed
SSR, sitemap və ictimai kataloq API-si Technomania rəsmi feed-ini oxuyur. Proses daxilində 5 dəqiqəlik keş və paralel sorğuların birləşdirilməsi var. Xətada son uğurlu məlumat saxlanır, 1 dəqiqədən sonra yenidən yoxlanır və köhnə status göstərilir. Bu, fon scheduler-i deyil. Bazaya tarixçə yazılması admin feed sinxronizasiyası ilə ayrıca aparılır. Feed-dən çıxan variantlar deaktiv edilir; yoxa çıxan təklif stokda kimi saxlanmır. İrşad/Baku təklifləri bu bağlantı ilə yenilənmir.
`node scripts/verify-live-catalog.mjs` cari feed-dəki hər variantı API ilə tutuşdurur, bütün unikal şəkil URL-lərinin HTTP və content-type cavabını yoxlayır; nəticə `docs/live-catalog-audit.json` faylındadır.


## 28 oktyabr — geniş yerli kataloq və mərhələli toplayıcı
Techbar 8,220, Casio 1,413, Eurolux 907, SeeHome 1,368 və Allstar 988 məhsul açıq Store API-nin bütün səhifələrindən alınıb. Mənbə cəmi 12,897 sətir qaytarıb; adı olmayan bir Techbar sətri karantinə alınıb. Allstar qiymət açıqlamır: məhsullar qiymətsiz göstərilir, sıfır qiymət təklifi yaradılmır. WooCommerce valyuta vahidi (`currency_minor_unit`, o cümlədən Eurolux 0) nəzərə alınır; variant seçimi tələb olunan məhsul üçün dəqiq qiymət uydurulmur.
Soliton sitemap-dəki 56 namizəddən 35 səhifə qiymət/şəkil/stok metadatası verib; 21 köhnə link 404-ə yönləndirilib və idxala daxil edilməyib. Saytın bütün cari inventarının sitemap-də olduğuna dair iddia edilmir.
Tap.az ilk elektronika siyahısındakı 22 elan üçün detal səhifəsi yoxlanıb. Yalnız `hasLabel=true`, `label=RETAILER`, `APPROVED` statusu və həqiqi `/shops/` profili olan 11 mağaza daxildir. Fərdi elanlar daxil edilmir. Yeni/işlənmiş vəziyyəti ayrıca saxlanır, avtomatik məhsul birləşməsi edilmir. Elanın aktivliyi stok kimi təqdim olunmur (`stockKnown=false`). Telefon, istifadəçi hesabı və koordinatlar snapshot-a daxil edilmir. Tap.az tam inventar idxalı deyil.
`scripts/polite-http.mjs` domen üzrə növbə, minimum 1 saniyə fasilə, disk keşi, ETag/Last-Modified, 304, Retry-After, 403/401 dayanması və 5xx üçün məhdud təkrar verir. Skriptlər qaldığı səhifələrə keşlə qayıdır; Bu skriptlər üçün fon scheduler-i yoxdur. 5 yeni API kataloqu dərc olunmuş yoxlama snapshot-larıdır; Technomania ziyarət zamanı 5 dəqiqəlik keşlə ayrıca yenilənir.
`scripts/discover-sitemaps.mjs` verilən sitemap-ləri domen sərhədi, XML ölçü limiti və entity rəddi ilə oxuyur. MG üçün istifadəçinin verdiyi `/sitemap.xml` 404-dür; rəsmi robots.txt-də göstərilən `/media/sitemap/sitemap_az.xml` istifadə olunur. Baku/MG/Ali & Nino üzrə tapılmış linklərin hamısı qiymət və stokla idxal edilmiş sayılmır. Bytelecom verilən sitemap indeksində məhsul sitemap-i göstərmir.


## İdxal növbəsi
Mənbələr: Baku Electronics, MG Store-un robots.txt-də verdiyi Azərbaycan sitemap-i, Soliton, Bytelecom və Ali & Nino. İş `crawlJob`, min URL-lik hissələr `crawlChunk`, domen kilidi `crawlLock` qeydlərində saxlanır. İş nömrəsi və mövqeyi qalıcıdır. Məhsul/təklif/tarixçə və URL mövqeyi eyni baza tranzaksiyasında yazılır. Çoxhissəli sitemap yazısı yarıda qalsa, həmin hissələrin sabit açarları təkrar yazılaraq bərpa edilir.
Domen kilidi və iş lease-i paralel sorğuları saxlayır. 401/403/429 və bot yoxlaması (Cloudflare “Just a moment”, `cf-mitigated: challenge`) işi bloklayır; bloklanmış mənbə avtomatik təkrarlanmır, admin qərar verir. 5xx və şəbəkə xətası artan fasilə ilə (Retry-After verilibsə ondan az olmayaraq) maksimum beş dəfə yoxlanır. Məhsul/xəta sayları ayrı saxlanır. Keçmiş düzgün məlumat giriş xətasında silinmir. Xarici domenə yönləndirmə və XML entity qəbul edilmir. Robots wildcard/query və Allow qaydaları prioritetlə yoxlanır; bu, MG-də `/*?dir*` qaydasının səhvən bütün səhifələri bağlamasının qarşısını alır.
Panelə qayıdıb davam etmək işləyir. Panel bağlı ikən server prosesindəki cron (`lib/cron.ts` → `lib/crawl-jobs.ts` `tickDueCrawlJobs`, `CRON_ENABLED=1`) aktiv işləri hər dəqiqə irəlilədir; lease və domen kilidi paneldən gələn sorğularla toqquşmanın qarşısını alır. Production-da cron-un işə düşdüyü `journalctl -u qepik` loqunda “Cron idxal işə düşdü” və iş olanda “Cron idxal:” sətirləri ilə yoxlanır. Sitemap-in bitməsi mənbənin bütün inventarının orada olduğuna zəmanət deyil. Bytelecom sitemap-də kateqoriya linkləri üçün görünən məhsullar və açıq səhifələmə linkləri əlavə oxunur. Məhsulun adı/qiyməti/şəkli stokla birlikdə yoxlananda saxlanır; naməlum stok ayrıca qeyd edilir.
Lokal sınaqda Baku sitemap indeksinin 8 sənədindən 32,223 məhsul URL-i baza hissələrinə yazılıb və ilk məhsul 39.99 AZN ilə idxal edilib. Bu, production-da 32,223 qiymətin artıq yükləndiyi demək deyil. Soliton üzrə dayandırma/davam, paralel start və tick sınaqları keçib; dəqiq mənbə linki ilə mövcud məhsulun təkrar yaradılmadığı yoxlanıb.

Ali & Nino adapteri əsas `data-main-form` formasının məhsul ID-sini page-config ilə, məhsul ünvanını canonical məhsul yolu ilə və valyutanı AZN konfiqurasiyası ilə tutuşdurur. Qiymət analitika üçün yuvarlaqlaşdırılmış rəqəmdən deyil, variantın dəqiq `price` sahəsindən götürülür. Rəng/variant ID-si, variant şəkli və stok ayrıca saxlanır. Çoxvariantlı səhifə sabit variant ID-ləri ilə hissələrə bölünür; URL mövqeyi yalnız bütün hissələr yazılandan sonra artır. Yarıda qalan hissələr təkrarlananda eyni ID-lərə yazılır. ISBN prefiksi 978/979 olduqda kitab kateqoriyası seçilir; kitab aksessuarları avtomatik kitab sayılmır.
Lokal Ali & Nino sınağında 48,449 məhsul URL-i 49 növbə hissəsində saxlanıb, ilk məhsul 39.87 AZN və mənbədəki stok ilə idxal edilib. Bu rəqəm də production qiymətlərinin sayını ifadə etmir. Timeout/şəbəkə xətasında URL mövqeyi artırılmır. In-memory SQLite testi 403/429 və bot yoxlamasında dayanmanı, 5xx gözləməsini, baza yazı xətasından sonra atomik təkrarı və icra zamanı pause-un saxlanmasını yoxlayır.

İş və domen kilidləri token ilə qorunur: vaxtı bitmiş köhnə icra daha yeni işi, qiyməti və ya domen kilidini dəyişə bilməz. Bu davranış SQLite sınağında ayrıca yoxlanır. Sitemap-in bağlayıcı XML elementi yoxdursa yarımçıq sənəd tamamlanmış sayılmır.

## Kataloqun brauzerə ötürülməsi

Vitrin bütün kataloqu (~13 400 məhsul, ~13.6 MB) yükləmir. `GET /api/v1/catalog?path=/kataloq&limit=24&brand=&store=&min=&max=&sort=&real=1&city=&ids=&favorites=` serverdə (`lib/catalog-query.ts` → `catalogSlice`) süzür, sıralayır və yalnız görünən səhifəni (adətən 17–90 KB) qaytarır; `matchedTotal`, `brands` və mağaza sayları (`storeStats`) cavabla gəlir. SSR eyni funksiyanı işlədir. Tam birləşmiş kataloq yalnız admin üçün `GET /api/v1/admin/catalog` ünvanındadır. `lib/public-data.ts` birləşmiş kataloqu server prosesində 60 saniyə saxlayır; API vasitəsilə edilən hər uğurlu yazı keşi dərhal təmizləyir.

## Kataloqun səhifələnməsi

Vitrin hər sorğuda 24 məhsul göstərir. İlk/son, əvvəlki/növbəti və səhifə nömrəsinə birbaşa keçid mövcuddur. Filtr və şəhər dəyişəndə ilk səhifəyə qayıdır. API: `/api/v1/catalog?path=/kataloq&limit=24&offset=960`. Cavabın `pageOffset`, `matchedTotal` və `matched` sahələri göstərilən aralığı müəyyən edir. Mənfi offset sıfıra, kataloqdan böyük offset son səhifəyə sıxılır. Məhsulların ümumi sayına 960 məhdudiyyəti tətbiq edilmir; `limit` bir cavabın ölçüsünü məhdudlaşdırır. Səhifə nömrəsi bu versiyada brauzer URL-ində saxlanmır.

## Fon idxalının yoxlanması

Cron konfiqurasiyası (`vite.config.ts`) və `scheduled` handler-i mövcuddur. Canlı trigger-in işləməsi konfiqurasiyadan çıxarılmır: hər həqiqi `tickDueCrawlJobs` icrası `crawlRuntime:scheduled` qeydini başlanma/bitmə vaxtı, iş və addım sayı, xətalar ilə saxlayır. `GET /api/v1/admin/jobs` bu qeydi yalnız adminə qaytarır. Panel 15 saniyədən bir oxuyur; qeyd yoxdursa təsdiqlənməmiş, 5 dəqiqədən köhnədirsə yeni siqnal gəlməmiş kimi göstərir. Bu, trigger-in hostinq tərəfindən qurulduğuna dair zəmanət deyil.

Bir işin gözlənilməz xətası digər mağazaların həmin icrada işlənməsini dayandırmır. Vaxtı gəlməmiş və dayandırılmış işlər şəbəkəyə çıxmır. İcra nəticəsinin yazısı `runId` ilə qorunur; gec bitən əvvəlki icra yeni icranın qeydini əvəz edə bilmir. `scripts/verify-crawl-recovery.mjs` bunları in-memory SQLite ilə yoxlayır; production cron-un işlədiyini ayrıca müşahidə etmək lazımdır.

## Mağaza mənbələri və avtomatik yenilənmə

`lib/crawl-sources.ts` hər mənbə üçün `refreshHours` saxlayır. Cron (`tickDueCrawlJobs`) hər dəqiqə əvvəlcə `startDueRefreshes` çağırır: heç işləməmiş konfiqurasiya edilmiş mənbə üçün ilk iş, son işi bitmiş və müddəti keçmiş mənbə üçün yeni iş başlayır (əvvəllər ilk iş yalnız paneldən başladılırdı, ona görə heç başladılmamış mənbələr boş qalırdı). Dayandırılmış və ya bloklanmış işlərə toxunulmur; admin paneldəki “Ləğv et” yarımçıq işi bağlayır.

Köhnə təkliflər: iş normal bitəndə (idxal edilən sətir sayı uğursuzların ən azı 1/9-i olduqda) həmin mağazanın bu işdə yenidən görünməyən təklifləri `stock=false, stockKnown=false` (naməlum) edilir. Bundan əlavə cron hər icrada `crawlSources` mağazalarının `checkedAt` tarixi `max(7 gün, 3 × refreshHours)`-dan köhnə olan təkliflərini naməlum stok edir (bloklanmış/dayandırılmış mənbələr də daxil). Qiymət silinmir, stok uydurulmur.

Robots.txt: hər origin üçün 5 dəqiqə keşlənir. Sitemap da robots.txt-ə tabedir: yolu açıq olmalı, ya robots.txt-də `Sitemap:` sətri ilə elan edilməli, ya da belə oxunmuş sitemap indeksində olmalıdır. `Crawl-delay` oxunur və həm sorğu növbəsində, həm də işin növbəti addımında saxlanır. Boş `Disallow:` qrupu bağlayır (başqa botun qaydaları bizə tətbiq edilmir). robots.txt 404/410 (və digər 4xx) — hamısı açıq; 401/403/429/bot yoxlaması — mənbə bloklanır; 5xx — heç nə oxunmur, sonra təkrar.

Qiymət oxuma (`lib/extractor.ts`): `parsePrice` “1 299,99 ₼”, “1.299,99”, “1,299.99”, “1299.0000” formatlarını oxuyur, xarici valyuta işarəsi və sıfır qiyməti rədd edir. Valyuta kodu böyük/kiçik hərfdən asılı deyil (“azn”). Meta teqlərində `product:discount_price`/`product:sale_price:amount` siyahı qiymətindən aşağıdırsa alıcının ödədiyi qiymət odur. Stok yalnız tanınan schema.org/meta dəyərlərində məlumdur; qalan hər şey `stockKnown=false`.

- **Kateqoriya/siyahı rejimi** (`listing: true`, `lib/listing-sources.ts`): bir sorğu bütöv məhsul səhifəsini gətirir.
  - Baku Electronics: sitemap-dəki son səviyyəli kateqoriyalar, Next.js `__NEXT_DATA__` (18 məhsul/səhifə, endirimli qiymət, stok sayı). Kateqoriya mağazanın öz ağacından (`bakuCategory`) təyin olunur, xəritədə olmayanlar addan təxmin edilir.
  - İrşad: `/az/products/list` fraqmenti, saytın “Daha çoxuna bax” düyməsinin göndərdiyi `X-Requested-With` başlığı ilə; robots.txt-dəki `Crawl-delay: 30` saxlanılır.
  - Techbar, Casio, Eurolux, SeeHome, Allstar: WooCommerce Store API (JSON). Techbar və Eurolux robots.txt-də `per_page=` və `orderby=` qadağan etdiyi üçün standart 10 məhsullu səhifələrlə oxunur. Yazılar paketdəki snapshot ID-lərini saxlayır, ona görə bazadakı qiymət snapshot-u əvəz edir.
- **Məhsul səhifəsi rejimi**: iSpace (JSON-LD), Music Gallery, Soliton, Bytelecom, Compstore, Ali & Nino.
  - 31 oktyabr canlı yoxlama (robots.txt əvvəlcə, ardıcıl, ≥1.5 s fasilə; səhifələr `scripts/fixtures`-dadır):
    - Compstore: `sitemap.xml` → `sitemap-posts.xml` (AZ məhsullar `/<slug>.html`, RU `/ru/`), Product JSON-LD (məs. 12 999 AZN, InStock) düzgün oxunur. Bəzi köhnə səhifələr JSON-LD-də `price: "0"` verir — bunlar idxal edilmir. Boş qalmasının kodda görünən səbəbi ilk işin heç vaxt avtomatik başlamaması idi.
    - Music Gallery (Magento): robots.txt-də elan edilmiş `/media/sitemap/sitemap_az.xml` (25 alt sitemap). Məhsullar `/<url-key>`, çoxsəviyyəli yollar kateqoriyadır və artıq növbəyə salınmır. JSON-LD Offer qiyməti nağd/cari qiymətdir (məs. 189.99), `product:price:amount` meta və StrikethroughPrice köhnə qiymətdir. Səbəb Compstore ilə eynidir: ilk iş başlamırdı.
    - Bytelecom: sitemap-də məhsul yoxdur; `category-sitemap.xml`-dəki `/category/<slug>` ünvanları ana səhifəyə 302 yönləndirilir (hər kateqoriya eyni ana səhifə məhsullarını təkrar verirdi). İndi `/az/category/<slug>` oxunur, Livewire səhifələməsi (`gotoPage(N)` düymələri) adi GET `?page=N` linkinə çevrilir, eyni məhsul bir dəfə növbəyə düşür. Məhsul səhifəsində JSON-LD yoxdur, meta teqlərdə valyuta “azn” (kiçik hərflə) idi və köhnə kod hamısını rədd edirdi; cari qiymət `product:discount_price`-dir (məs. 2 499, köhnə 2 999).
    - Smart Electronics: robots.txt daxil hər sorğuya Cloudflare yoxlaması (HTTP 403, “Just a moment…”) qaytarır. Bu keçilmir; iş “bloklanıb” statusunda qalır. Rəsmi feed və ya icazə lazımdır.
  - 31 oktyabr əlavələri (sitemap + məhsul səhifəsi, gündəlik): Texno Home, Telehome, NANO ICT, Minor Electronics, Digital Home, UltraStore, Smarton (JSON-LD); Xiaomi Aləmi və Smeg (schema.org mikrodata, `extractMicrodataProduct`); Almalı, Okim, ERA Electronics (`lib/html-products.ts`: görünən qiymət bloku). Almalı-nın JSON-LD-si qiyməti USD-yə çevrilmiş göstərir, ona görə AZN qiyməti səhifədəki `<p class="price">`-dən oxunur. Endirimli qiymət təklif qiymətidir; üstündən xətt çəkilmiş qiymət `oldPrice` kimi ayrıca oxunur və heç vaxt təklif qiyməti olmur. Çoxdilli sitemap-lərdən yalnız Azərbaycan dilindəki səhifə götürülür. Smarton robots.txt-dəki `Crawl-delay: 30` həm iş intervalında (`intervalMs`), həm də `sourceFetch`-də saxlanılır.
  - Sitemap-i olmayan mağazalar (`listingStart` + `isCategoryPage`): Mobifon və Bestel ana səhifədən kateqoriyalara keçir, hər məhsul səhifəsini oxuyur. Bestel-in səhifələyicisi linksiz düymələrdir (“Go to page N”), server isə `?page=N`-i verir. World Telecom-un sitemap-i yalnız 2023-cü ilin satışdan çıxmış ünvanlarıdır; kateqoriyalar `?page=N` ilə məhsulsuz səhifəyə qədər oxunur.
  - Qoşulmayanlar: Elit Optimal və MyShops (Cloudflare yoxlaması), Technolife (ana səhifədən başqa hər ünvan bota HTTP 404 qaytarır) — keçilmir. Barkod (sitemap yoxdur, siyahı JavaScript ilə yüklənir), Playroom (vitrin başqa hostdakı API-dən doldurulur), Aztech (aztech.az blogdur, mağaza aztechshop.az-dadır və sitemap-i boşdur) üçün açıq məlumat yolu tapılmadı. Status `docs/local-merchants.json`-da `priceIntegration` və `sourceNote` sahələrindədir.
- **Qoşulmayanlar**: Kontakt (Cloudflare “Just a moment” yoxlaması) və Birmarket (robots.txt-də belə 403) botları bloklayır; bu yoxlamalar keçilmir. Bu mağazalar üçün rəsmi XML/YML feed və ya razılaşma lazımdır. Datası olmayan mağazalar saytda “Qiymətlər hələ qoşulmayıb” kimi göstərilir.

Mağazalar arası uyğunlaşdırma namizədləri `modelKey` ilə tapılır: brend (mağazanın öz adı brend yazılıbsa, addan çıxarılır), model sözləri, daxili yaddaş və rəng qrupu. RAM yalnız hər iki mənbədə göstərildikdə müqayisə olunur. Hər namizədi admin “Məhsul uyğunlaşdırma” panelində mənbə səhifələrini yoxlayıb təsdiqləyir.

Vitrin axtarışı (`lib/catalog-query.ts`) sorğunun bütün sözlərini istənilən sırada axtarır; `ı`/`i` fərqi nəzərə alınmır (“GLACIER” = “glacier”). Seçilmiş sıralamada əvvəl məhsulun özü, sonra aksesuarları, daha sonra adında əlavə sözü az olanlar gəlir.

## Server

Sayt bir Ubuntu VPS-də işləyir: Node 24 LTS, `qepik` systemd servisi (`deploy/qepik.service`, `127.0.0.1:3000`), qarşısında nginx (`deploy/nginx-qepik.conf`) və Let's Encrypt sertifikatı (certbot avtomatik yeniləyir). Firewall (ufw) yalnız 22, 80, 443 portlarını açır. Kod `/srv/qepik`-dədir (`qepik` istifadəçisi), baza `/var/lib/qepik/qepik.db`, parametrlər `/etc/qepik/qepik.env` (nümunə `deploy/qepik.env.example`: `SITE_URL`, `OWNER_EMAIL`, `CRON_ENABLED=1`, `VINEXT_TRUST_PROXY=1`). Sayt heç bir xarici xidmətə bağlı deyil: şriftlər paketlə gəlir (`@fontsource-variable/*`), giriş öz bazasındadır. Xaricə yalnız mağaza saytlarından qiymət oxuyan idxal sorğuları və brauzerin mağaza saytlarından yüklədiyi məhsul şəkilləri gedir.

- **Yeniləmə:** `sudo /srv/qepik/deploy/deploy.sh` — `main`-i çəkir, `npm ci`, `npm run build`, servisi yenidən başladır və cavabı yoxlayır. Migration-lar servis başlayanda tətbiq olunur (`ExecStartPre`).
- **Loqlar:** `journalctl -u qepik -f` (server, cron, API xətaları); nginx: `/var/log/nginx/`.
- **Yedək:** `qepik-backup.timer` hər gecə 03:30-da `deploy/backup.sh` ilə bazanın onlayn surətini `/var/backups/qepik/` qovluğuna yazır (gzip, 14 gün). Əl ilə: `sudo systemctl start qepik-backup`.
- **Bərpa:** `sudo systemctl stop qepik`, yedəyi `gunzip -c ... > /var/lib/qepik/qepik.db` ilə yerinə qoyun (`-wal`/`-shm` fayllarını silin), `chown qepik:qepik`, `sudo systemctl start qepik`.
- **Parol:** istifadəçi parolunu unudarsa: `cd /srv/qepik && sudo -u qepik env DATABASE_PATH=/var/lib/qepik/qepik.db node scripts/set-password.mjs <e-poçt>`.
