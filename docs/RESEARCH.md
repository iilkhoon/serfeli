# Qəpik — məhsul və bazar araşdırması

Araşdırma tarixi: 27 oktyabr 2026. Coğrafiya: Azərbaycan. Bu sənəd açıq veb səhifələrinin araşdırılması və Qəpik üçün məhsul qərarlarını ayırır. Cimri-nin daxili kodu, şəxsi mağaza paneli, kommersiya müqavilələri və dəqiq sıralama alqoritmi əlçatan deyil; bunlar haqqında təsdiqlənməmiş iddia verilmir.

## 1. Cimri-dən götürülən funksional model

Cimri alış-veriş bələdçisi kimi məhsulları tapmağa, qiymət və xüsusiyyətləri müqayisə etməyə, məhsulları sıralamağa və satış mağazasına keçməyə imkan verir. Market bölməsində lokasiya, vahid qiyməti və səbət cəmi ayrıca rol oynayır. Bu, Qəpik üçün iki ayrı məlumat modeli tələb edir: texnika məhsulu üzrə təklif müqayisəsi və gələcəkdə market səbəti üzrə müqayisə. [Cimri haqqında](https://www.cimri.com/cimri-hakkinda)

Cimri-nin FAQ səhifəsində alışın mağazada tamamlandığı, platformanın müqayisə xidməti olduğu açıqlanır. Qəpik-in əsas əməliyyatı da “Mağazaya keç” olmalıdır. Səbət, ödənişin qəbul edilməsi və sifarişin icrası bu modelin ilkin şərti deyil. Məhsul axtarışdan və ya kateqoriyadan tapılmalıdır. [Cimri FAQ](https://www.cimri.com/sikca-sorulan-sorular)

Araşdırılan məhsul səhifəsi tutum və rəng variantlarını, satıcı təkliflərini, qiymət xəbərdarlığını və tarixçə qrafikini birləşdirir. Təklifin yenilənmə vaxtı, çatdırılma və “Reklam” işarəsi görünür. Tarixçədə zaman aralığı seçimi mövcuddur. Qəpik üçün nəticə: məhsul variantı dəyişdikdə müqayisə də eyni variantla məhdudlaşmalıdır; reklam qiymət üzrə birinci yer kimi təqdim olunmamalıdır. Buradan Cimri-nin daxili kommersiya alqoritmi haqqında nəticə çıxarılmır. [Araşdırılan Cimri məhsulu](https://www.cimri.com/cep-telefonlari/en-ucuz-apple-iphone-17-pro-256gb-kozmik-turuncu-fiyatlari,2508500359)

Cimri mağaza müraciətində əlaqə və şirkət məlumatları, vergi identifikasiyası, sayt və könüllü feed ünvanı toplayır; sənəd yükləmə də mövcuddur. Azərbaycan üçün bu formanın hüquqi sahələri ayrıca lokallaşdırılmalıdır. Türkiyə sənədlərinin adlarını kor-koranə köçürmək uyğun deyil. [Cimri mağaza qeydiyyatı](https://www.cimri.com/magaza-kayit)

## 2. Azərbaycan üzrə müşahidələr

Kontakt-un saytında nağd alışdan əlavə aylıq ödəniş, kampaniya, çatdırılma və qaytarma şərtləri görünür. Geniş məhsul ağacı smartfon, kompüter, ev texnikası və digər istiqamətləri əhatə edir. Qəpik modelində qiymət və xidmət şərtlərinin ayrıca saxlanmasının səbəbi budur. Bu şərtlər bütün məhsullara avtomatik aid edilmir. [Kontakt](https://kontakt.az/)

Baku Electronics hissə-hissə ödənişi, çatdırılmanı, zəmanət və ödəniş imkanlarını ayrıca izah edir. Qəpik-də mağazanın ümumi təqdimatı ilə konkret məhsul təklifinin şərtləri fərqli sahələr olmalıdır. Məsələn, ümumi çatdırılma reklamı konkret məhsul üçün təsdiqlənmiş çatdırılma haqqı sayılmamalıdır. [Baku Electronics](https://www.bakuelectronics.az/)

İrşad-ın açıq kataloqunda telefon və aksesuarlar, qulaqlıqlar, saatlar, böyük və kiçik məişət texnikası görünür. AZ/RU dil seçimi və mobil alış-veriş keçidi də var. Qəpik-in ilk məlumat modeli texnika ilə başlayıb, sonradan yeni kateqoriyalar və mobil müştəriyə genişlənməyə uyğun olmalıdır. [İrşad](https://irshad.az/)

Bu şirkətlərin adının kataloqda görünməsi tərəfdaşlıq, icazəli API çıxışı, təsdiqlənmiş satıcı statusu və ya qiymət zəmanəti demək deyil. Tərəfdaşlıq statusu yalnız ayrıca sübutla aktivləşdirilməlidir.

## 3. Məhsul xəritəsi və qəbul qaydaları

| Modul | İstifadəçinin ehtiyacı | Məlumat və qəbul qaydası |
| --- | --- | --- |
| Ana səhifə | Nəyi axtardığını tez tapmaq | Axtarış, kateqoriya keçidləri, aydın məlumat statusu; uydurulmuş istifadəçi və məhsul sayları yoxdur |
| Kataloq | Büdcəyə və xüsusiyyətə uyğun seçim | Kateqoriya, brend, qiymət intervalı, sıralama; boş nəticədə filtri sıfırlama |
| Məhsul | Eyni variantı düzgün müqayisə etmək | Model, tutum, rəng, regional kod və vəziyyət ayrılır |
| Təkliflər | Ən aşağı real yekunu tapmaq | Nağd qiymət, çatdırılma və taksit cəmi fərqli sahələrdir |
| Tarixçə | Qiymətin həqiqətən dəyişdiyini görmək | Yalnız qeydə alınmış müşahidələr; çatışmayan tarix interpolasiya ilə fakt kimi yaradılmır |
| Seçilmişlər | Sonra baxmaq üçün saxlamaq | İstifadəçiyə bağlı server yaddaşı; brauzer yaddaşı yalnız lokal rahatlıq üçündür |
| Qiymət xəbərdarlığı | Hədəf qiymətə çatanda bilmək | Hədəf, aktivlik, son qiymətləndirmə; tətbiqdaxili status və xarici bildiriş fərqlənir |
| Müqayisə | Bir neçə model arasında qərar | Eyni xüsusiyyət sətirləri, çatışmayan məlumat üçün “göstərilməyib” |
| Mağazalar | Təklifi kimin verdiyini bilmək | Mənbə domeni və şirkət adı; saxta rəy və reytinq yaradılmır |
| Mağaza müraciəti | Satıcının qoşulmaq istəyi | Müraciət saxlanır, admin təsdiqi ayrıca; avtomatik tərəfdaşlıq yoxdur |
| Admin kataloqu | Məlumatı idarə etmək | Məhsul, təklif və mağaza yaradılması/redaktəsi, server yoxlaması, jurnal |
| İdxal | Kataloqu böyütmək | JSON/CSV önbaxışı, sahə yoxlaması, dəqiq məhsula bağlama; bütün feed-i uğurlu saymaq olmaz |
| Mənbə oxuyucusu | Məhsul səhifəsindən qiyməti almaq | İcazəli domen siyahısı, JSON-LD nəticəsi, mənbə və vaxt; xəta açıq göstərilir |
| Moderasiya | Etibarsız məzmunu süzmək | Rəy və müraciət statusları; müəllif məlumatının məxfilik sərhədi |
| Analitika | Əsl istifadəni anlamaq | Faktiki keçid sayları; nümunə analitika real statistika kimi göstərilmir |

## 4. Qiymət müqayisəsi müqaviləsi

1. Orqanik sıralama seçilmiş hesab qaydasına uyğun artan yekun üzrədir. Sponsor yerləşdirməsi ayrıca işarə və blok tələb edir. Bərabər qiymətdə sabit ikinci meyar istifadə edilməlidir.
2. Nağd qiymətə kupon, bank cashback-i və şərti kampaniya avtomatik qarışdırılmır. Şərtlər ayrıca göstərilir.
3. Çatdırılma haqqı məlum deyilsə, sıfır kimi hesablanmır. “Çatdırılma məlum deyil” göstərilməlidir.
4. Taksit cəmi aylıq ödəniş × ay sayı + ilkin ödəniş + komissiya düsturuna uyğun olmalıdır. Mənbədə ayrıca yekun varsa, yuvarlaqlaşdırma fərqi saxlanır və izah edilir.
5. Müxtəlif rəng, yaddaş, regional kod, yeni/işlənmiş vəziyyət, komplektasiya və zəmanət şərti yanlış şəkildə birləşdirilməməlidir. GTIN/MPN olmadıqda avtomatik uyğunlaşdırma aşağı etibarlı sayılır və yoxlamaya çıxarılır.
6. Köhnəlmiş və stokda olmayan təklif “hazırda ən ucuz” nişanı almamalıdır. Təzəlik müddəti kateqoriya və mənbə üzrə konfiqurasiya edilməlidir.
7. Nümunə təklif real qiymətlə qarışdırılmır. Demo məlumatı üçün görünən işarə, ayrı mənbə növü və ixracda həmin status saxlanır.

Bu qaydalar Qəpik üçün məhsul tövsiyələridir; bütün bəndlərin Cimri-də eyni alqoritmlə həyata keçirildiyi iddia edilmir.

## 5. Açıq məlumat toplama və hüquqi sərhədlər

“Sayt açıqdır və şirkətin adını yazırıq, ona görə bütün kataloqu götürmək avtomatik qanunidir” nəticəsi düzgün hüquqi əsas sayılmır. Müəlliflik qanununun 7-ci maddəsində faktlar barədə informasiya xarakterli məlumatlar müəlliflik obyektlərindən ayrılır. Lakin qiymət faktı, məhsul fotosu, yaradıcı təsvir mətni və kataloqun bütövlükdə çıxarılması eyni hüquqi kateqoriya deyil. Mənbəni qeyd etmək foto və mətn hüquqlarını avtomatik vermir. [Müəlliflik hüququ haqqında qanun](https://frameworks.e-qanun.az/4/f_4167.html)

Məlumat topluları haqqında qanun toplunun quruluşu və məzmununun qorunmasını ayrıca tənzimləyir. Texniki mühafizəni keçməklə əldə etmə məsələsi də ayrıca nəzərdə tutulur. Buna görə böyük həcmdə mütəmadi çıxarma, sayt şərtləri, əmtəə nişanından istifadə və kommersiya təqdimatı yerli hüquqşünasla konkret mənbə və üsul üzrə qiymətləndirilməlidir. Bu sənəd məhkəmə mövqeyi və ya hüquqi rəy deyil. [Əqli Mülkiyyət Agentliyinin qanun mətni](https://copat.gov.az/docs/Qanunvericilik/Qanunlar/Qanun-M%C9%99lumat%20toplular%C4%B1n%C4%B1n%20h%C3%BCquqi%20qorunmas%C4%B1%20haqq%C4%B1nda.pdf?_t=1539264707)

Texniki seçim: açıq strukturlaşdırılmış qiyməti oxumaq; giriş, CAPTCHA və başqa texniki maneəni keçməmək; domen siyahısı və yönləndirmə nəzarəti; ölçü və vaxt limiti; mənbə URL-i və yoxlanma vaxtı; oxuma uğursuzdursa uğur göstərməmək. Robots qaydası ayrıca əməliyyat göstəricisidir, müəlliflik icazəsini əvəz etmir. İstehsal rejimində mənbə üzrə qaydalar, sorğu tezliyi, əlaqə ünvanı və məlumatın silinməsi müraciəti prosesini müəyyənləşdirmək lazımdır.

## 6. Mobil gələcəyinə hazırlıq

Mobil tətbiq üçün məhsul məlumatı UI komponentindən ayrılmalı və versiyalı API-dən alınmalıdır. Məhsul, təklif, tarixçə, seçilmişlər və xəbərdarlıq sabit identifikatorlarla işləməlidir. AZN məbləği üçün istehsalda ən etibarlı format tam qəpik sayıdır; tarixlər UTC saxlanmalı, istifadəçiyə yerli vaxtla göstərilməlidir. Telefon ekranında filtrlər panelə, təklif cədvəli oxunaqlı kartlara çevrilməlidir. Vebin mobilə uyğun olması ayrıca iOS/Android tətbiqinin hazır olması demək deyil.

## 7. Brend və vizual istiqamət

“Qəpik” qısa ad və qənaət metaforası kimi seçilib. Domenin və əmtəə nişanının hüquqi əlçatanlığı bu ad seçimi ilə təsdiqlənmir. Vizual niyyət isti fon, tünd mətn, yaşıl qənaət göstəricisi və sarı diqqət vurğusudur. Rənglərin emosional təsiri dizayn hipotezidir, bütün Azərbaycan istifadəçiləri üçün sübut edilmiş psixoloji qanun kimi təqdim olunmur. Fontda Azərbaycan əlifbasının Ə/ə, Ğ/ğ, İ/ı, Ö/ö, Ş/ş və Ü/ü işarələri yoxlanmalıdır. Etimadı rəngdən daha çox aydın qiymət qaydaları, mənbə və səhvsiz hesablamalar qurur.
