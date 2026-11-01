"use client";
import { type ReactNode } from "react";
import { ChevronRight, Search } from "lucide-react";
import { categories, validOffers, type Product } from "../lib/catalog";
import { rankProductsByStoreCount, type CatalogSlice } from "../lib/catalog-query";
import { CategoryIcon, StoreLogo } from "./ui";
import { azNumber } from "../components/format";
const popular = ["iPhone 17", "Samsung Galaxy", "AirPods", "PlayStation 5", "Robot tozsoran"];
const faq = [
  [
    "Qəpik məhsul satır?",
    "Xeyr. Qəpik mağazaların qiymətlərini bir yerdə göstərir. Alış seçdiyin mağazanın öz saytında tamamlanır.",
  ],
  [
    "Qiymətlər nə vaxt yenilənir?",
    "Mənbələr mütəmadi yoxlanır və hər təklifdə son yoxlanma vaxtı göstərilir. Qiyməti və stoku alışdan əvvəl mağazada təsdiqlə.",
  ],
  [
    "Ən ucuz qiymət həmişə ən sərfəlidir?",
    "Çatdırılma, taksit yekunu, zəmanət və variantı da yoxla. Məhsul səhifəsində bunlar hər mağaza üçün yanaşı göstərilir.",
  ],
  [
    "Mağazamı necə əlavə edim?",
    "“Mağazanı əlavə et” səhifəsindən müraciət göndər. Rəsmi məhsul feed-i olan mağazalar daha tez qoşulur.",
  ],
];
export default function Home({
  catalog: c,
  city,
  cards,
}: {
  catalog: CatalogSlice;
  city: string;
  cards: (products: Product[]) => ReactNode;
}) {
  const availableCategories = categories.filter((cat) => (c.categoryStats[cat.id]?.count || 0) > 0);
  const ranked = rankProductsByStoreCount(
    c,
    c.products.filter((p) => p.active && validOffers(c, p.id, city).length > 0),
    city,
  );
  // Same item, different shops: the widest relative price gap first.
  const gaps = ranked
    .map((p) => {
      const prices = validOffers(c, p.id, city).map((o) => o.price);
      const high = Math.max(...prices),
        low = Math.min(...prices);
      return { p, gap: prices.length > 1 && high > 0 ? (high - low) / high : 0 };
    })
    .filter((x) => x.gap >= 0.03)
    .sort((a, b) => b.gap - a.gap)
    .map((x) => x.p);
  const popularIds = new Set(ranked.slice(0, 10).map((p) => p.id));
  const deals = gaps.filter((p) => !popularIds.has(p.id)).slice(0, 5);
  // Only stores whose prices are connected, largest catalogs first.
  const stores = c.stores
    .filter(
      (s) =>
        s.active &&
        c.storeStats[s.id]?.real &&
        (c.storeStats[s.id]?.count || 0) > 0 &&
        !s.id.startsWith("tap-"),
    )
    .sort((a, b) => (c.storeStats[b.id]?.count || 0) - (c.storeStats[a.id]?.count || 0));
  const storeCount = stores.length;
  return (
    <div className="h-home">
      <section className="h-hero" aria-labelledby="home-title">
        <h1 id="home-title">Ən sərfəli qiyməti tap</h1>
        <p>
          {storeCount ? azNumber(storeCount) + " mağaza, " : ""}
          {azNumber(c.totals?.products || 0)} məhsul — qiymətləri bir yerdə müqayisə et.
        </p>
        <form
          action="/axtaris"
          method="get"
          className="h-search"
          role="search"
          aria-label="Ana səhifə axtarışı"
        >
          <Search size={20} aria-hidden="true" />
          <input
            name="q"
            required
            placeholder="Məhsul, model və ya brend axtar"
            aria-label="Məhsul, model və ya brend axtar"
          />
          <button type="submit">Axtar</button>
        </form>
        <div className="h-popular">
          <span>Populyar:</span>
          {popular.map((q) => (
            <a href={"/axtaris?q=" + encodeURIComponent(q)} key={q}>
              {q}
            </a>
          ))}
        </div>
      </section>
      {availableCategories.length > 0 && (
        <section className="h-section" aria-labelledby="home-categories" id="kateqoriyalar">
          <div className="h-head">
            <h2 id="home-categories">Kateqoriyalar</h2>
            <a href="/kataloq">
              Bütün məhsullar <ChevronRight size={16} />
            </a>
          </div>
          <div className="h-categories">
            {availableCategories.map((cat) => (
              <a key={cat.id} href={"/kateqoriya/" + cat.id}>
                <span>
                  <CategoryIcon name={cat.icon} size={26} />
                </span>
                <b>{cat.name}</b>
                <small>{azNumber(c.categoryStats[cat.id].count)} məhsul</small>
              </a>
            ))}
          </div>
        </section>
      )}
      {ranked.length > 0 && (
        <section className="h-section" aria-labelledby="home-popular">
          <div className="h-head">
            <h2 id="home-popular">Ən çox müqayisə edilənlər</h2>
            <a href="/kataloq">
              Hamısı <ChevronRight size={16} />
            </a>
          </div>
          {cards(ranked.slice(0, 10))}
        </section>
      )}
      {deals.length > 0 && (
        <section className="h-section" aria-labelledby="home-deals">
          <div className="h-head">
            <h2 id="home-deals">Mağazalar arasında böyük fərq</h2>
            <a href="/endirimler">
              Hamısı <ChevronRight size={16} />
            </a>
          </div>
          {cards(deals)}
        </section>
      )}
      {stores.length > 0 && (
        <section className="h-section" aria-labelledby="home-stores">
          <div className="h-head">
            <h2 id="home-stores">Mağazalar</h2>
            <a href="/magazalar">
              Hamısı <ChevronRight size={16} />
            </a>
          </div>
          <div className="h-stores">
            {stores.slice(0, 12).map((s) => (
              <a href={"/magazalar/" + s.id} key={s.id}>
                <StoreLogo store={s} />
                <small>{azNumber(c.storeStats[s.id]?.count || 0)} məhsul</small>
              </a>
            ))}
          </div>
        </section>
      )}
      <section className="h-section h-faq" aria-labelledby="home-faq">
        <div className="h-head">
          <h2 id="home-faq">Tez-tez verilən suallar</h2>
          <a href="/rehber">
            Alış-veriş bələdçisi <ChevronRight size={16} />
          </a>
        </div>
        <div className="h-faq-items">
          {faq.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
