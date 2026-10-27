# Qəpik dizayn sistemi

İstiqamət: qiymət araşdırması üçün redaksiya səliqəsi, məhsul şəkilləri və aydın rəqəmlər. Süni intellekt şablonlarında tez-tez görünən bənövşəyi gradient, parıltı və boş statistika istifadə edilmir.

## Rənglər və məqsəd

| Token | Rəng | İstifadə |
|---|---|---|
| paper | #FAFAF6 | İsti, neytral əsas fon |
| ink | #233A32 | Başlıq, mətn, əsas hərəkət düyməsi |
| lime | #DDEB66 | Brend işarəsi, aktiv mobil naviqasiya |
| sage | #E9EFE2 | Kateqoriya və köməkçi sahələr |
| green | #3E785A | Qiymət fərqi və yoxlanmış məlumat |
| line | #E6E8DF | Cədvəl, kart və bölmə sərhədi |

Yaşıl qənaət və rahat seçim mövzusu üçün, limon rəngi diqqəti məhdud sahədə toplamaq üçün seçilib. Bunlar dizayn niyyətidir; davranışa universal psixoloji təsir iddiası deyil.

## Tipoqrafiya

Onest — interfeys, formalar və oxunaqlı Azərbaycan dili mətni. Bricolage Grotesque — brend, başlıqlar və qiymət rəqəmləri. Əsas başlıq masaüstündə 42 px, telefonda 34 px; kart başlığı telefonda 13 px. Rəqəmlər Azərbaycan formatında: 1 799,99 ₼.

## Mobil davranış

- 760 px-dən aşağı ayrıca kompozisiya, 360 px-dən aşağı əlavə düzəliş.
- İki sütun məhsul kartı, dörd sütun kateqoriya.
- Əsas toxunma sahələri 44 px; alt naviqasiya və aktiv səhifə vurğusu.
- Filtrlər düymə ilə açılır, əlavə yer tutmur.
- Dialoqlar telefonda aşağıdan açılan panelə çevrilir. Fokus saxlanır, Escape ilə bağlanır.
- Mağaza təklifləri telefonda şaquli kartlara çevrilir. Admin bölmələri üfüqi menyudadır; yalnız məlumat cədvəli öz daxilində sürüşür.
- Safe-area nəzərə alınır, reduced-motion seçimi qorunur.

## Komponentlər və mənbələr

`app/design.css`: tokenlər və ümumi komponentlər. `app/pages.css`: səhifə düzümü. `app/responsive.css`: planşet, telefon və loqolar. `app/ui.tsx`: modal, boş vəziyyət, API köməkçisi və mağaza loqosu. `lib/merchants.ts`: mağaza işarələrinin xəritəsi. Loqoların mənbəsi `merchant-assets.json` faylında saxlanır.

## Mobil tətbiqə hazırlıq

Məhsul, mağaza və təklifin ayrı ID-ləri, `/api/v1` server marşrutları, hesabdan asılı məlumat və vahid dizayn tokenləri mövcuddur. Web manifest əlavə olunub. Native iOS/Android tətbiqi, offline rejim və mobil push bu buraxılışda yaradılmayıb.
