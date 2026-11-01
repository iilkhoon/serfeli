# Qəpik dizayn sistemi

Qəpik qiymət müqayisəsi üçündür. İnterfeys ilk növbədə məhsulu, həqiqi qiyməti və məlumatın mənbəyini aydın göstərir. Süni təcililik və mənbədə təsdiqlənməmiş endirim faizi dizaynın tərkibi deyil. Mağazaların öz loqoları və rəngləri dəyişdirilmir; Qəpik-in başlıq, altlıq və admin işarəsi `/favicon.svg` faylıdır.

## Rənglər və istifadə

Qəpik-in bir şirkət rəngi var: **nar #D81B54**. Saytdakı bütün rənglər bu tondan törəyən `--nar-50` … `--nar-950` şkalasıdır və `app/theme.css` faylında müəyyən edilir. Yaşıl və qırmızı yalnız funksional siqnaldır (stok var, xəta). Əvvəlki CSS qatlarındakı açıq fon və sərhəd rəngləri `--surface`, `--surface-2`, `--line`, `--line-strong` tokenlərinə çevrilib; yeni komponentlər də bu tokenlərdən istifadə etməlidir. Tam brend qaydaları: `docs/brand/Qepik-Brendbuk.pdf`.

| Token | Rəng | Məqsəd |
|---|---|---|
| `--nar-50` / `--nar-100` | #FFF1F5 / #FFE3EB | Kateqoriya ikonu fonu, “Ən ucuz” nişanı, açılmış sual |
| `--nar-200` / `--nar-300` | #FFC7D7 / #FF9BB8 | Mətn seçimi, fokus halqası, altlıqda hover |
| `--nar-600` (`--primary`) | #D81B54 | Brend, əsas düymə, “fərq” nişanı, kredit ikonu |
| `--nar-700` / `--nar-800` | #B3134A / #8C0F3B | Hover, kredit mətni, açıq nişanın mətni |
| `--nar-950` (`--night`) | #2A0714 | Hero paneli, üst zolaq, altlıq |
| `--bg` / `--surface` / `--surface-2` | #FFF8F1 / #FFFFFF / #FBF1E7 | Səhifə fonu, kart, yüngül fon |
| `--plate` | #F7F1EA | Məhsul şəklinin lövhəsi (şəkil `multiply` ilə oturur) |
| `--ink` / `--muted` | #22111A / #6E5A63 | Əsas mətn və qiymət / köməkçi mətn |
| `--line` / `--line-strong` / `--control-line` | #EFE2D3 / #DCC9B5 / #8C7A6B | Sərhədlər, form sahəsi |
| `--success` / `--danger` | #157A47 / #B3261E | Yalnız stok və xəta |

Nisbət: təxminən 60% süd fon, 22% ağ kart, 10% nar, 8% gecə paneli. Mağaza loqolarının öz rəngləri dəyişdirilmir.

## Kontrast yoxlaması

WCAG nisbi parlaqlıq düsturu ilə hesablanıb; normal mətn üçün AA həddi 4.5:1, form sərhədləri üçün 3:1-dir. Meyar: [W3C — WCAG 2.2, Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

| Mətn / fon | Kontrast |
|---|---|
| Əsas mətn / səhifə fonu | 17.15:1 |
| Köməkçi mətn / səhifə fonu | 6.03:1 |
| Köməkçi mətn / ağ | 6.35:1 |
| Ağ / nar düymə | 4.99:1 |
| Nar link / səhifə fonu | 4.74:1 |
| Nar-800 mətn / nar-100 nişan | 7.76:1 |
| Açıq mətn / gecə paneli | 16.82:1 |
| Köməkçi açıq mətn / gecə paneli | 11.36:1 |
| Yaşıl stok / yüngül yaşıl | 4.70:1 |
| Form sərhədi / ağ | 4.11:1 |

## Tipoqrafiya və vizual iyerarxiya

İki şrift: başlıqlar, loqo və qiymətlər üçün Unbounded (500–700), interfeys və mətn üçün Plus Jakarta Sans (400–800). Hər ikisində ə, Ə, ğ, İ və ₼ işarələri var; seçilmədən əvvəl brauzerdə yoxlanılıb (Bricolage, Rubik, Outfit kimi şriftlərdə ə yoxdur). Əsas mətn 15 px, kart başlığı 14 px, kart qiyməti 19 px (telefonda 16 px), bölmə başlıqları 24–36 px, hero başlığı 34–64 px.

Məhsul kartı (`.pcard`): isti lövhədə şəkil; yuxarı solda yalnız mənalı nişan (qənaət ən azı 5 ₼ və 2% olanda nar rəngində, stok yoxdursa tünd); yuxarı sağda seçilmişlər və müqayisə düymələri; ad; variant; ən aşağı qiymət və “ən baha” qiymət; kredit (ən kiçik aylıq ödəniş və ay sayı) və pulsuz çatdırılma, yalnız mağaza bunu bildirəndə; “N mağazada qiymət” həb düyməsi. Faktlar sətri üçün iki sətir yer saxlanılır ki, bir cərgədəki kartlarda qiymət və düymə eyni xətdə dursun. Hover-də kart 4 px qalxır və kölgə alır.

Ana səhifə: gecə panelində axtarış və 3D qiymət yığını (hero), iki cərgəli kateqoriya rəfi (eyni ağ plitələr, ad üçün sabit iki sətir), ən çox müqayisə edilənlər rəfi, dörd plitəli bento (qiyməti düşənlər, hədəf qiymət, müqayisə, mağazalar), böyük fərq rəfi, hərəkətli mağaza lenti, suallar.

Kart şəkilləri eyni nisbətli sahədə `object-fit: contain` ilə göstərilir. Mağaza şəkli yüklənməsə `components/product-image.tsx` eyni ölçülü `.image-fallback` sahəsi (“Şəkil yoxdur”) göstərir. Tarix və saylar `components/format.ts` ilə yazılır: 27.10.2026, 13 205. Brend etiketləri `lang="en"` daşıyır ki, böyük hərflə “XİAOMİ” yazılmasın. Başlıqların üstündə dekorativ etiket (eyebrow) istifadə edilmir.

## Mobil və əlçatanlıq

Əsas idarəetmə düymələri və ikonlar ən azı 44 × 44 CSS px toxunma sahəsinə malikdir. Əsas formalar 14 px, köməkçi izahlar 12–13 px-dir. Kartlar telefonda iki sütunda qalır, ana səhifədəki kateqoriyalar yana sürüşür; böyük cədvəllər öz daxilində sürüşür. Dialoqlar fokus və Escape dəstəyini saxlayır. Görünən fokus halqası brend rəngindədir. Səhifənin əvvəlində “Əsas məzmuna keç” keçidi var. Məhsul səhifəsinin bölmələri `tablist` kimi işləyir, oxlarla seçilir və telefonda yana sürüşür. Telefonda təklif kartında mağaza və qiymət yuxarıda, stok (ikon + mətn), zəmanət, yoxlanma vaxtı və taksit tam endə, “Mağazaya keç” düyməsi sonda olur. Kataloq səhifələməsi `?page=N` keçidləridir. Nəticə olmayanda sıralama və filtrlər gizlənir, boş vəziyyət növbəti addımı təklif edir.

Dizayn `--space-1`–`--space-6`, `--radius-control`, `--radius-card` və `--touch-target` dəyişənləri ilə ümumi ölçü və boşluq dilini verir. Yeni komponentlər bu dəyişənlərdən istifadə etməlidir. 320/390 px və masaüstü ölçülərdə brauzer yoxlaması ayrıca aparılmalıdır; token kontrast testi onu əvəz etmir.

## Hərəkət

İmza hərəkəti hero-dakı qiymət yığınıdır: üç real məhsul kartı 3D-də yelpik kimi düzülür, öndəki kart mağaza qiymətlərini zolaq kimi açır, zolaqlar kart önə gələndə böyüyür. Kartlar 6.5 saniyədən bir dəyişir; siçan və ya fokus üstündə olanda dayanır, arxa karta klikləmək onu önə gətirir. Siçan ilə kart dəstəsi yüngülcə əyilir (toxunuşda və azaldılmış hərəkətdə yoxdur). Hero mətni bir dəfə qalxır, bölmələr skroll ilə görünür (`animation-timeline: view()` dəstəklənəndə). Mağaza lenti 48 saniyəlik xətti dövrdür və siçan altında dayanır. Hover keçidləri 200–450 ms-dir. `prefers-reduced-motion` bu animasiyaların hamısını söndürür, mağaza lenti əl ilə sürüşdürülən siyahıya çevrilir; gizli giriş animasiyası məzmunu görünməz saxlamır.

## Fayllar və mobil tətbiq

`app/theme.css` son semantik dizayn qatıdır. `app/design.css`, `app/pages.css`, `app/responsive.css`, `app/commerce.css`, `app/home.css`, `app/matching.css` mövcud düzüm və komponentləri saxlayır. `app/ui.tsx` ümumi komponentlər və mağaza loqolarıdır.

Ayrı məhsul, mağaza və təklif ID-ləri, `/api/v1` marşrutları və web manifest gələcək mobil müştəri üçün əsasdır. Native iOS/Android tətbiqi, offline rejim və mobil push yalnız bu veb dizaynının olması ilə hazır sayılmır.
