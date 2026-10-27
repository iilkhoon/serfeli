# Qəpik — həyata keçirmə və istismara hazırlıq planı

Tarix: 27 oktyabr 2026. Bu sənəd görüləcək işləri və qəbul meyarlarını müəyyən edir; gələcək modulun mövcud sistemdə artıq işlədiyini təsdiqləmir. Hazır funksiyalar üçün tətbiqin faktiki yoxlama nəticələri əsasdır.

## Cari quruluşun nəzərdə tutulan sərhədi

İlk versiyanın istiqaməti React/Vinext interfeysi, Cloudflare Worker serveri, D1 bazası və versiyalı API-dir. Kataloq əvvəlcə açıq işarələnmiş nümunə məlumatla işləyə bilər. Admin məhsul və mağaza məlumatlarını idarə edir; idxal və açıq JSON-LD mənbə oxuyucusu real məlumat əlavə etməyə imkan yaradır. İnteqrasiyanın olması bütün mağazaların bütün qiymətlərinin artıq toplandığı demək deyil.

Sayt ilkin olaraq yalnız sahibə açıq yayımlanmalıdır. Admin kimliyi serverdə təsdiqlənməli, seçilmişlər və xəbərdarlıqlar cari istifadəçiyə bağlanmalıdır. Sayt ictimai edilməzdən əvvəl admin rolu və ilkin sahib təyinatı tamamlanmalıdır. İlk daxil olan hər anonim şəxsin admin ola bildiyi ictimai axın qəbul edilmir.

## P0 — bu versiyanın yoxlanmalı əsas axınları

| Sahə | Qəbul meyarı |
| --- | --- |
| Axtarış | Azərbaycan hərfləri ilə sorğu işləyir; nəticə sayı və boş vəziyyət düzgündür |
| Filtrlər | Kateqoriya, brend və büdcə birlikdə tətbiq edilir; sıfırlama işləyir |
| Məhsul | Təkliflər eyni model/variantla əlaqəlidir, mənbə statusu görünür |
| Sıralama | Qiymət üzrə sıralama rəqəmsaldır; sponsorluq orqanik ən ucuz nişanını dəyişmir |
| Təklif | Nümunə/real statusu, mənbə, stok və yoxlanma vaxtı saxlanır |
| Seçilmişlər | Saxlama və silmə serverdə qalır; başqa istifadəçinin qeydləri görünmür |
| Xəbərdarlıq | Hədəf qiymət doğrulanır; tətbiqdaxili vəziyyət hesablanır; xarici e-poçt göndərilib kimi göstərilmir |
| Admin | İcazəsiz yazı rədd edilir; dəyişiklik saxlanır və kataloqda görünür |
| İdxal | Səhv sətir açıq xəta verir; naməlum məhsula təsadüfi uyğunlaşdırma olmur |
| Mənbə oxuma | Domen və yönləndirmə yoxlanır; AZN və qiymət yoxlanır; JS/CAPTCHA maneəsində aydın nəticə qaytarılır |
| Moderasiya | Təsdiqlənməmiş rəy ictimai reytinqə daxil edilmir |
| Mobil veb | 360–390 px ekranda əsas axın üfüqi səhifə daşması olmadan tamamlanır |
| Əlçatanlıq | Klaviatura fokusları, etiketli formalar, oxunaqlı kontrast və dialoqdan çıxış var |

## P1 — real mənbələrin sistemli qoşulması

1. Kontakt, İrşad, Baku Electronics və digər seçilmiş domenlərin açıq məhsul səhifələrini ayrıca sınaqdan keçirmək. Hər mənbə üçün hansı sahələrin həqiqətən əldə olunduğunu yazmaq. Dəstəklənməyən səhifəni “inteqrasiya aktivdir” kimi göstərməmək.
2. Strukturlaşdırılmış qiyməti olmayan mağazaya ayrıca adapter hazırlamaq. CSS selektorunun səhifə dəyişikliyində qırılması üçün nümunə HTML testləri saxlamaq. CAPTCHA və giriş məhdudiyyətini keçməmək.
3. Mənbənin istifadə şərtlərini, robots qaydasını və hüquqi yanaşmanı təsdiqləmək; mümkün olduqda feed və ya tərəfdaşlıq kanalı almaq. Məhsul fotoları üçün ayrıca hüquq mənbəyi müəyyən etmək.
4. GTIN/EAN/MPN və variant atributlarını normallaşdırmaq. Avtomatik birləşdirmədə etibarlılıq göstəricisi və admin təsdiqi tətbiq etmək.
5. Müşahidə vaxtı, alınma vaxtı, son uğur, son xəta, dəyişmiş sahələr və mənbə versiyasını saxlamaq. Təkrar işə salmada dublikat təklif yaratmamaq.
6. JSON/CSV-dən əlavə etibarlı XML/Google Merchant feed adapteri hazırlamaq. XML parserində xarici entity açmamaq; böyük faylları hissələrə bölmək.

## P2 — davamlı yenilənmə və xəbərdarlıq infrastrukturu

Hazırkı əl ilə mənbə yoxlaması avtomatik fon toplayıcısı sayılmır. Davamlı rejim üçün ayrıca scheduler/queue və icra mühiti qurulmalıdır. Bu sənəd heç bir avtomatlaşdırma tapşırığı yaratmır.

İş axını: növbədə mənbə işi → domen üzrə tezlik limiti → fetch → parse → variant uyğunluğu → doğrulama → atomik təklif/tarixçə yazısı → xəbərdarlıq qiymətləndirilməsi → nəticə jurnalı. Xəta təkrarları artan fasilə ilə olmalıdır; davamlı 403/429/5xx ayrıca xəbərdarlıq yaratmalıdır. Bir mənbənin dayanması digər mənbələri bloklamamalıdır.

Xarici bildiriş üçün e-poçt/Telegram/push provayderi, istifadəçi razılığı, çıxış/abunəni dayandırma, təkrar göndərmə nəzarəti və göndəriş jurnalı lazımdır. Göndərən domen və provayder sirrləri serverdə saxlanmalıdır. Tətbiqdaxili “hədəfə çatdı” statusu real e-poçt və ya push göndərişindən ayrılmalıdır.

## P3 — ictimai istehsal buraxılışı

İctimai girişdən əvvəl admin üçün konkret rol siyahısı, mağaza operatoru səlahiyyəti, moderasiya qaydaları, sorğu limiti və audit yoxlanmalıdır. İlk sahib təyinatı bağlanmalı, məlumat bərpası üçün D1 ehtiyat nüsxəsi və ixrac prosesi sınaqdan keçirilməlidir. Müraciət və şikayət üçün işlək əlaqə kanalı və istifadəçinin öz məlumatını silmə axını olmalıdır.

Məhsul URL-ləri sabit və indekslənən olmalıdır. Həqiqi məhsul məlumatına uyğun metadata, sitemap, canonical və strukturlaşdırılmış məlumat hazırlanmalıdır. Nümunə kataloq axtarış motorlarına real canlı qiymət kimi çıxarılmamalıdır. Analitikada öz test klikləri ilə istifadəçi göstəriciləri ayrılmalıdır.

## P4 — iOS və Android

Mobil vebdən sonra ayrıca React Native/Expo və ya uyğun native müştəri hazırlana bilər. Əvvəl versiyalı API müqaviləsi sabitləşdirilməli, mobil kimlik sessiyası və dərin keçidlər həll edilməlidir. Daha sonra push tokenləri, qiymət xəbərdarlıqları, kamerayla barkod oxuma, paylaşım vasitəsilə məhsul əlavə etmə və cihazlararası sinxronizasiya əlavə edilə bilər. Mağaza hesabları, imzalama sertifikatları və tətbiq mağazalarına təqdimat bu veb buraxılışının tərkibində hazır sayılmır.

## Əməliyyat göstəriciləri

Mənbənin son uğurlu yoxlanma vaxtı, təzə təkliflərin faizi, uğursuz parse sayı, yanlış məhsul birləşdirmələrinin sayı, çatdırılma məlumatının doluluğu və qiymət uyğunsuzluğu şikayətlərinin bağlanma müddəti əsas keyfiyyət göstəriciləridir. Kataloq ölçüsü təkbaşına keyfiyyət ölçüsü deyil. Məqsəd eyni variant üçün yoxlanıla bilən müqayisədir.

## Araşdırma mənbələri

- [Cimri funksional model](https://www.cimri.com/cimri-hakkinda)
- [Cimri mağaza müraciəti](https://www.cimri.com/magaza-kayit)
- [Kontakt](https://kontakt.az/)
- [İrşad](https://irshad.az/)
- [Baku Electronics](https://www.bakuelectronics.az/)
- [Müəlliflik qanununun konsolidə edilmiş mətni](https://frameworks.e-qanun.az/4/f_4167.html)
- [Əqli Mülkiyyət Agentliyinin qanunlar kataloqu](https://copat.gov.az/az/nav/qanunlar)
