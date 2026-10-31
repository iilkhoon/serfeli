# Qəpik dizayn sistemi

Qəpik qiymət müqayisəsi üçündür. İnterfeys ilk növbədə məhsulu, həqiqi qiyməti və məlumatın mənbəyini aydın göstərir. Süni təcililik və mənbədə təsdiqlənməmiş endirim faizi dizaynın tərkibi deyil. Mağazaların öz loqoları və rəngləri dəyişdirilmir; Qəpik-in başlıq, altlıq və admin işarəsi `/favicon.svg` faylıdır.

## Rənglər və istifadə

Vahid semantik tokenlər son yüklənən `app/production.css` faylında müəyyən edilir. Mövcud səhifə kompozisiyaları saxlanır; digər CSS fayllarındakı mətn rəngləri eyni tokenləri oxuyur.

| Token | Rəng | Məqsəd |
|---|---|---|
| `--paper` | #FAF8F5 | İsti, təmiz əsas fon |
| `--surface` | #FFFFFF | Məhsul kartları, formalar və məlumat səthləri |
| `--ink` | #352640 | Əsas mətn və başlıq |
| `--muted` | #5F5468 | Mağaza adları, tarix və köməkçi mətn |
| `--primary` | #73518C | Dərin bənövşəyi brend, aktiv naviqasiya, fokus halqası |
| `--primary-soft` | #EEE6F4 | Yüngül vurğu, informasiya panelləri |
| `--action` | #F5AB78 | Əsas hərəkət düymələri, axtarış, mağazaya keçid |
| `--action-soft` | #FFF0E6 | Kartdakı ikinci dərəcəli qiymət düyməsi |
| `--success` | #17633E | Həqiqi ən aşağı cari qiymət, qənaət və təsdiqlənmiş stok |
| `--success-soft` | #EAF5EE | Qiymət və stok nişanının fonu |
| `--danger` | #9B2D3A | Xəta, xəbərdarlıq və stokda olmayan məhsulun etiketi |
| `--danger-soft` | #FFF1F1 | Xəta fonu |
| `--warning` | #805413 | Yoxlama tələb edən və ya köhnə məlumat |
| `--warning-soft` | #FFF3DF | Həmin vəziyyətlərin yüngül fonu |
| `--control-line` | #8B7B95 | İdarəetmə sahələrinin görünən sərhədi |

Bənövşəyi sabit brend və sakit seçim mühiti, yaşıl qiymət və stok məlumatının tez seçilməsi, isti şaftalı isə əsas hərəkətin tapılması üçün seçilib. Bunlar dizayn niyyətləridir; rəngin bütün insanlara universal psixoloji təsiri barədə iddia deyil. Qırmızı dekorativ vurğu və ya seçilmiş məhsul nişanı kimi istifadə edilmir.

## Kontrast yoxlaması

Aşağıdakı cütlər WCAG nisbi parlaqlıq düsturu ilə hesablanıb. Normal mətn üçün AA həddi 4.5:1-dir. Bu nəticələr token cütlərini yoxlayır; bütün səhifələrdəki hər pikselin avtomatik tam AA auditi sayılmır. Mağaza loqoları üçün orijinal brend rəngləri qorunur.

Meyar: [W3C — WCAG 2.2, Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

| Mətn / fon | Kontrast |
|---|---|
| Əsas mətn / əsas fon | 13.18:1 |
| Köməkçi mətn / ağ | 7.11:1 |
| Köməkçi mətn / yüngül bənövşəyi | 5.84:1 |
| Bənövşəyi / ağ | 6.39:1 |
| Ağ / bənövşəyi aktiv naviqasiya | 6.39:1 |
| Yaşıl / ağ | 7.26:1 |
| Yaşıl / yüngül yaşıl | 6.50:1 |
| Tünd mətn / isti hərəkət düyməsi | 7.31:1 |
| Xəta mətni / yüngül qırmızı | 6.75:1 |

## Tipoqrafiya və vizual iyerarxiya

Yalnız iki şrift ailəsi istənilir: Onest interfeys, Bricolage Grotesque başlıq və qiymət rəqəmləri üçün. Sistem şriftləri yüklənmə vaxtı fallback-dır. Əsas mətn 15 px-dir. Məhsul başlığı masaüstündə 15 px, mobil ölçüdə 14 px; mağaza mənbələri və yoxlanma vaxtı 12 px-dir.

Kartın məzmun ardıcıllığı: brend, məhsul adı və variant; ad eyni olan ayrı məhsullarda istehsalçı kodu və paket ölçüsü (12 px, çərçivəli `.product-code`); iri qiymət; mağaza sayı və adları; mənbənin yoxlanma vaxtı; qiymətlərə keçid. Qiymət masaüstündə 29 px, telefonda ekran eninə uyğun 20–24 px-dir. Cari stokda olan real qiymət yaşıl, son bildirilən və ya naməlum qiymət neytral qalır. Ən yaxşı təklif ayrıca nişanla göstərilir; stokda olmayan təklif bu üstünlüyü almır. Rəqəmlər Azərbaycan formatındadır: 1 799,99 ₼.

Kart şəkilləri eyni nisbətli sahədə `object-fit: contain` ilə göstərilir. Mağaza şəkli yüklənməsə `components/product-image.tsx` eyni ölçülü `.image-fallback` sahəsi (“Şəkil yoxdur”) göstərir; sınıq şəkil və alt mətni görünmür. Mağaza loqosu yüklənməsə mağazanın adı yazılır. Tarix və saylar `components/format.ts` ilə yazılır: 27.10.2026, 27.10.2026, 14:29, 13 205. `toLocaleString("az-AZ")` istifadə edilmir, çünki bəzi mühitlərdə az dili məlumatı yoxdur. Brend etiketləri `lang="en"` daşıyır ki, böyük hərflə “XİAOMİ” yazılmasın. Başlıq, variant və mağaza adları üçün sətir sahələri ayrılıb, hərəkətlər kartın sonunda hizalanır. Mağaza adları iki sətirdə oxuna bilər; tam mətn keçidin/title təsvirində saxlanır.

## Mobil və əlçatanlıq

Əsas idarəetmə düymələri və ikonlar ən azı 44 × 44 CSS px toxunma sahəsinə malikdir. Əsas formalar 14 px, köməkçi izahlar 12–13 px-dir. Telefon ölçüsündə müqayisə ikonu qiymətin altına keçir ki, qiymət sıxılmasın. Kartlar iki sütunda qalır; böyük cədvəllər öz daxilində sürüşür. Dialoqlar fokus və Escape dəstəyini saxlayır. Görünən fokus halqası brend rəngindədir. Səhifənin əvvəlində “Əsas məzmuna keç” keçidi var. Məhsul səhifəsinin bölmələri `tablist` kimi işləyir, oxlarla seçilir və telefonda yana sürüşür. Telefonda təklif kartında mağaza və qiymət yuxarıda, stok (ikon + mətn), zəmanət, yoxlanma vaxtı və taksit tam endə, “Mağazaya keç” düyməsi sonda olur. Kataloq səhifələməsi `?page=N` keçidləridir. Nəticə olmayanda sıralama və filtrlər gizlənir, boş vəziyyət növbəti addımı təklif edir.

Dizayn `--space-1`–`--space-6`, `--radius-control`, `--radius-card` və `--touch-target` dəyişənləri ilə ümumi ölçü və boşluq dilini verir. Yeni komponentlər bu dəyişənlərdən istifadə etməlidir. 320/390 px və masaüstü ölçülərdə brauzer yoxlaması ayrıca aparılmalıdır; token kontrast testi onu əvəz etmir.

## Hərəkət

Daimi dekorativ halqa fırlanması, məhsulun yellənməsi, zəng və siqnal animasiyaları söndürülüb. Qısa hover keçidləri 160 ms, bölmə və məhsul görünməsi 320 ms-dir. Karuselin avtomatik keçidi yalnız görünən səhifədə, istifadəçi onu dayandırmadıqda işləyir. `prefers-reduced-motion` bütün səhifələr üzrə animasiya və keçidləri azaldır; gizli giriş animasiyası məzmunu görünməz saxlamır.

## Fayllar və mobil tətbiq

`app/production.css` son semantik dizayn qatıdır. `app/design.css`, `app/pages.css`, `app/responsive.css`, `app/commerce.css`, `app/home.css`, `app/matching.css` mövcud düzüm və komponentləri saxlayır. `app/ui.tsx` ümumi komponentlər və mağaza loqolarıdır.

Ayrı məhsul, mağaza və təklif ID-ləri, `/api/v1` marşrutları və web manifest gələcək mobil müştəri üçün əsasdır. Native iOS/Android tətbiqi, offline rejim və mobil push yalnız bu veb dizaynının olması ilə hazır sayılmır.
