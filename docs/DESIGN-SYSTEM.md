# Qəpik dizayn sistemi

Qəpik qiymət müqayisəsi üçündür. İnterfeys ilk növbədə məhsulu, həqiqi qiyməti və məlumatın mənbəyini aydın göstərir. Süni təcililik və mənbədə təsdiqlənməmiş endirim faizi dizaynın tərkibi deyil. Mağazaların öz loqoları və rəngləri dəyişdirilmir; Qəpik-in başlıq, altlıq və admin işarəsi `/favicon.svg` faylıdır.

## Rənglər və istifadə

Vahid semantik tokenlər son yüklənən `app/theme.css` faylında müəyyən edilir (`app/production.css` eyni dəyərləri ehtiyat kimi saxlayır). Üslub təmiz müqayisə saytıdır: ağ səthlər, bir göy vurğu rəngi, yaşıl qiymət. Digər CSS fayllarındakı köhnə bənövşəyi/şaftalı rənglər neytral boz-göy çalarlara çevrilib.

| Token | Rəng | Məqsəd |
|---|---|---|
| `--paper` | #F5F7FA | Səhifə fonu |
| `--surface` | #FFFFFF | Kartlar, formalar, başlıq |
| `--ink` | #111827 | Əsas mətn və başlıq |
| `--muted` | #5B6474 | Variant, köməkçi mətn |
| `--line` | #E3E7EE | Kart və bölmə sərhədləri |
| `--control-line` | #7C8494 | Form sahələrinin sərhədi (ağ fonda 3:1-dən yuxarı) |
| `--primary` | #1F5EFF | Brend, əsas düymələr, linklər, fokus halqası |
| `--primary-hover` | #1546C7 | Düymə hover vəziyyəti |
| `--primary-soft` | #EAF0FF | Yüngül vurğu, ikon fonu, informasiya panelləri |
| `--action` | `--primary` | Axtarış və mağazaya keçid düymələri (ağ mətnlə) |
| `--price` / `--success` | #0A7A3E | Cari ən aşağı qiymət, qənaət, təsdiqlənmiş stok |
| `--success-soft` | #E7F6EE | Qənaət nişanının fonu |
| `--danger` | #9B2D3A | Xəta və stokda olmayan təklif |

Qırmızı dekorativ vurğu kimi istifadə edilmir. Mağaza loqolarının öz rəngləri dəyişdirilmir.

## Kontrast yoxlaması

WCAG nisbi parlaqlıq düsturu ilə hesablanıb; normal mətn üçün AA həddi 4.5:1, form sərhədləri üçün 3:1-dir. Meyar: [W3C — WCAG 2.2, Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

| Mətn / fon | Kontrast |
|---|---|
| Əsas mətn / səhifə fonu | 16.53:1 |
| Köməkçi mətn / ağ | 5.97:1 |
| Köməkçi mətn / səhifə fonu | 5.56:1 |
| Göy link / ağ | 5.12:1 |
| Ağ / göy düymə | 5.12:1 |
| Yaşıl qiymət / ağ | 5.43:1 |
| Yaşıl / yüngül yaşıl nişan | 4.87:1 |
| Hero alt mətni #F2F6FF / göy | 4.73:1 |
| Form sərhədi / ağ | 3.76:1 |
| Xəta mətni / yüngül qırmızı | 6.75:1 |

## Tipoqrafiya və vizual iyerarxiya

Bir şrift ailəsi istifadə olunur: Inter (sistem şriftləri fallback). Əsas mətn 15 px, kart başlığı 14 px (telefonda 13 px, iki sətrə qədər), kart qiyməti 20 px (telefonda 17 px), bölmə başlıqları 22 px.

Məhsul kartı (`.pcard`) sadədir: şəkil; yuxarı solda yalnız mənalı nişan (qənaət ən azı 5 ₼ və 2% olanda, və ya stok yoxdur/məlum deyil); yuxarı sağda seçilmişlər və müqayisə ikon düymələri; məhsul adı; variant (eyni adlı məhsullarda istehsalçı kodu da); yaşıl ən aşağı qiymət; “N mağazada qiymət” linki. Yoxlanma vaxtı və mağaza siyahısı məhsul səhifəsində göstərilir. Rəqəmlər Azərbaycan formatındadır: 1 799,99 ₼.

Ana səhifə qısadır: axtarış (hero), kateqoriyalar, ən çox müqayisə edilənlər, mağazalar arası böyük fərq, mağazalar, suallar.

Kart şəkilləri eyni nisbətli sahədə `object-fit: contain` ilə göstərilir. Mağaza şəkli yüklənməsə `components/product-image.tsx` eyni ölçülü `.image-fallback` sahəsi (“Şəkil yoxdur”) göstərir; sınıq şəkil və alt mətni görünmür. Mağaza loqosu yüklənməsə mağazanın adı yazılır. Tarix və saylar `components/format.ts` ilə yazılır: 27.10.2026, 27.10.2026, 14:29, 13 205. `toLocaleString("az-AZ")` istifadə edilmir, çünki bəzi mühitlərdə az dili məlumatı yoxdur. Brend etiketləri `lang="en"` daşıyır ki, böyük hərflə “XİAOMİ” yazılmasın.

## Mobil və əlçatanlıq

Əsas idarəetmə düymələri və ikonlar ən azı 44 × 44 CSS px toxunma sahəsinə malikdir. Əsas formalar 14 px, köməkçi izahlar 12–13 px-dir. Kartlar telefonda iki sütunda qalır, ana səhifədəki kateqoriyalar yana sürüşür; böyük cədvəllər öz daxilində sürüşür. Dialoqlar fokus və Escape dəstəyini saxlayır. Görünən fokus halqası brend rəngindədir. Səhifənin əvvəlində “Əsas məzmuna keç” keçidi var. Məhsul səhifəsinin bölmələri `tablist` kimi işləyir, oxlarla seçilir və telefonda yana sürüşür. Telefonda təklif kartında mağaza və qiymət yuxarıda, stok (ikon + mətn), zəmanət, yoxlanma vaxtı və taksit tam endə, “Mağazaya keç” düyməsi sonda olur. Kataloq səhifələməsi `?page=N` keçidləridir. Nəticə olmayanda sıralama və filtrlər gizlənir, boş vəziyyət növbəti addımı təklif edir.

Dizayn `--space-1`–`--space-6`, `--radius-control`, `--radius-card` və `--touch-target` dəyişənləri ilə ümumi ölçü və boşluq dilini verir. Yeni komponentlər bu dəyişənlərdən istifadə etməlidir. 320/390 px və masaüstü ölçülərdə brauzer yoxlaması ayrıca aparılmalıdır; token kontrast testi onu əvəz etmir.

## Hərəkət

Daimi dekorativ halqa fırlanması, məhsulun yellənməsi, zəng və siqnal animasiyaları söndürülüb. Qısa hover keçidləri 160 ms, bölmə və məhsul görünməsi 320 ms-dir. Karuselin avtomatik keçidi yalnız görünən səhifədə, istifadəçi onu dayandırmadıqda işləyir. `prefers-reduced-motion` bütün səhifələr üzrə animasiya və keçidləri azaldır; gizli giriş animasiyası məzmunu görünməz saxlamır.

## Fayllar və mobil tətbiq

`app/production.css` son semantik dizayn qatıdır. `app/design.css`, `app/pages.css`, `app/responsive.css`, `app/commerce.css`, `app/home.css`, `app/matching.css` mövcud düzüm və komponentləri saxlayır. `app/ui.tsx` ümumi komponentlər və mağaza loqolarıdır.

Ayrı məhsul, mağaza və təklif ID-ləri, `/api/v1` marşrutları və web manifest gələcək mobil müştəri üçün əsasdır. Native iOS/Android tətbiqi, offline rejim və mobil push yalnız bu veb dizaynının olması ilə hazır sayılmır.
