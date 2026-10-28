# Qəpik dizayn sistemi

İstiqamət: isti fon, aydın qiymətlər, iri başlıqlar və məhsul fotoqrafiyası. Brend işarəsi bütün ölçülərdə `public/favicon.svg` faylıdır; başlıq və altlıq eyni işarədən istifadə edir.

## Rənglər

| Token | Rəng | İstifadə |
|---|---|---|
| paper | #FAF8F5 | Səhifə fonu |
| ink | #352640 | Əsas mətn və başlıqlar |
| accent | #73518C | Düymələr, aktiv seçimlər |
| peach | #FFC49D | Loqo və məhdud vurğu |
| lilac | #EEE6F4 | Ana səhifənin əsas paneli |
| muted | #75667D | Köməkçi mətn |

İsti şaftalı tonu və yumşaq bənövşəyi platformaya tanınan alış-veriş xarakteri verir. Bu, dizayn niyyətidir; universal psixoloji təsir iddiası deyil. Mağazaların orijinal loqo rəngləri saxlanır.

## Tipoqrafiya və düzüm

Onest interfeys və Azərbaycan dili mətni, Bricolage Grotesque başlıqlar və qiymətlər üçündür. Əsas mətn 15 px, məhsul başlığı masaüstündə 14 px, telefonda 13 px-dir. Kart başlıqları iki sətirdə eyni hündürlükdə, qiymət və hərəkətlər eyni səviyyədə yerləşir. Qiymətlər Azərbaycan formatındadır: 1 799,99 ₼.

## Ana səhifə

İki hissəli əsas panel, həqiqi məhsullarla idarə olunan karusel, tam kataloqdan hesablanan kateqoriya sayları, kateqoriya seçimləri, təsdiqlənmiş eyni variant üzrə çoxmağazalı müqayisə, mağazalar, məhsul lentləri və sual-cavab bölməsi. Mağaza profili sayı canlı qiyməti olan mağaza sayı kimi təqdim edilmir.

## Hərəkət

Məhsul karuseli 6,5 saniyədən bir dəyişir; fokus, hover və gizli pəncərədə dayanır. İstifadəçi keçidləri dayandıra və əl ilə seçə bilər. Bölmələr ekrana daxil olduqda yumşaq görünür; kartlar və düymələr toxunuşa reaksiya verir. `prefers-reduced-motion` animasiyaları və avtomatik keçidləri dayandırır. Serverdə yaradılmış məzmun JavaScript olmadan da görünür.

## Mobil davranış

760 px altında ayrıca kompozisiya, iki sütun məhsul və kateqoriya kartları, sürüşən seçimlər və alt naviqasiya. Əsas paneldə mətn və məhsul şəkli ayrı sahələrdədir. Dialoqlar telefonda aşağı panelə çevrilir; fokus və Escape dəstəyi saxlanır. Safe-area nəzərə alınır. 320 və 390 px ölçülərdə səhifənin üfüqi daşması yoxlanılır.

## Fayllar

`app/design.css`, `app/pages.css`, `app/responsive.css`, `app/commerce.css` mövcud ümumi üslublardır. Son yüklənən `app/home.css` cari brend, tipoqrafiya və ana səhifə komponentlərini tənzimləyir. `app/home.tsx` ana səhifədir; `lib/catalog-query.ts` tam kataloqdan yığcam səhifə məlumatı və saylar hazırlayır. `app/ui.tsx` ümumi komponentlər və mağaza loqolarıdır.

## Mobil tətbiqə hazırlıq

Ayrı məhsul, mağaza və təklif ID-ləri, `/api/v1` marşrutları, hesabdan asılı məlumat və web manifest mövcuddur. Native iOS/Android tətbiqi, offline rejim və mobil push bu buraxılışa daxil deyil.
