"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  ChevronLeft,
  ChevronRight,
  Scale,
  Search,
  Store,
  TrendingDown,
} from "lucide-react";
import { categories, money, validOffers, type Product } from "../lib/catalog";
import { rankProductsByStoreCount, type CatalogSlice } from "../lib/catalog-query";
import { CategoryIcon, StoreLogo } from "./ui";
import { azNumber } from "../components/format";
import { ProductImage } from "../components/product-image";
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
const STAGE_ROWS = 4;
const STAGE_INTERVAL = 6500;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Hero signature: a fanned 3D stack of real products. The front card opens into its store
// prices as bars, the cheapest one marked; a back card comes forward when clicked.
function PriceStage({ c, city, items }: { c: CatalogSlice; city: string; items: Product[] }) {
  const [front, setFront] = useState(0);
  const [paused, setPaused] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (items.length < 2 || paused || reducedMotion()) return;
    const t = window.setInterval(() => {
      if (!document.hidden) setFront((i) => (i + 1) % items.length);
    }, STAGE_INTERVAL);
    return () => window.clearInterval(t);
  }, [items.length, paused]);
  // Pointer tilt, eased; only for a mouse, never for touch or reduced motion.
  useEffect(() => {
    const el = stage.current;
    if (!el || !window.matchMedia("(hover: hover) and (pointer: fine)").matches || reducedMotion())
      return;
    let raf = 0,
      tx = 0,
      ty = 0,
      x = 0,
      y = 0;
    const tick = () => {
      x += (tx - x) * 0.1;
      y += (ty - y) * 0.1;
      el.style.setProperty("--rx", (-y * 7).toFixed(2) + "deg");
      el.style.setProperty("--ry", (x * 9).toFixed(2) + "deg");
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.001 ? requestAnimationFrame(tick) : 0;
    };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width - 0.5;
      ty = (e.clientY - r.top) / r.height - 0.5;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const leave = () => {
      tx = ty = 0;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div
      className="stage"
      ref={stage}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="stage-deck">
        {items.map((p, i) => {
          const pos = (i - front + items.length) % items.length;
          const offers = validOffers(c, p.id, city);
          const shown = offers.slice(0, STAGE_ROWS);
          const high = Math.max(...offers.map((o) => o.price));
          const low = offers[0]?.price ?? 0;
          const isFront = pos === 0;
          return (
            <article
              key={p.id}
              className={"stage-card" + (isFront ? " is-front" : "")}
              data-pos={pos}
            >
              <div className="stage-inner" inert={!isFront}>
                <a className="stage-product" href={"/mehsul/" + p.id}>
                  <span className="stage-photo">
                    <ProductImage src={p.image} alt="" width={160} height={160} decoding="async" />
                  </span>
                  <span className="stage-name">
                    <b>{p.name}</b>
                    {p.variant && <small>{p.variant}</small>}
                  </span>
                  <ArrowUpRight className="stage-go" size={18} aria-hidden="true" />
                </a>
                <ol className="stage-rows" aria-label={p.name + " — mağaza qiymətləri"}>
                  {shown.map((o, r) => {
                    const store = c.stores.find((s) => s.id === o.storeId);
                    return (
                      <li
                        key={o.id}
                        className={r === 0 ? "is-low" : ""}
                        style={{ "--r": r } as never}
                      >
                        <span className="stage-store">
                          {store ? store.name : o.storeId}
                          {r === 0 && <em>Ən ucuz</em>}
                        </span>
                        <span className="stage-bar" aria-hidden="true">
                          <i style={{ width: (high ? (o.price / high) * 100 : 100) + "%" }} />
                        </span>
                        <span className="stage-price">{money(o.price)}</span>
                      </li>
                    );
                  })}
                </ol>
                <p className="stage-foot">
                  <span>{offers.length} mağazada eyni məhsul</span>
                  <b>
                    <TrendingDown size={16} aria-hidden="true" />
                    {money(Math.round(high - low))} qənaət
                  </b>
                </p>
              </div>
              {!isFront && (
                <button
                  className="stage-pick"
                  aria-label={p.name + " qiymətlərini göstər"}
                  onClick={() => setFront(i)}
                />
              )}
            </article>
          );
        })}
      </div>
      {items.length > 1 && (
        <div className="stage-dots">
          {items.map((p, i) => (
            <button
              key={p.id}
              aria-label={p.name + " qiymətlərini göstər"}
              aria-pressed={i === front}
              onClick={() => setFront(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// A horizontal shelf (product cards or categories) with arrow buttons on wide screens.
function Rail({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const update = () => {
    const el = ref.current?.querySelector<HTMLElement>(".pgrid, [data-rail]");
    if (!el) return;
    setEdge({
      start: el.scrollLeft < 8,
      end: el.scrollLeft + el.clientWidth > el.scrollWidth - 8,
    });
  };
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(".pgrid, [data-rail]");
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  const go = (dir: number) => {
    const el = ref.current?.querySelector<HTMLElement>(".pgrid, [data-rail]");
    el?.scrollBy({
      left: dir * el.clientWidth * 0.85,
      behavior: reducedMotion() ? "auto" : "smooth",
    });
  };
  return (
    <div className="h-rail" ref={ref}>
      {children}
      <button
        className="h-rail-arrow prev"
        onClick={() => go(-1)}
        disabled={edge.start}
        aria-label={label + " — əvvəlki məhsullar"}
      >
        <ChevronLeft size={20} />
      </button>
      <button
        className="h-rail-arrow next"
        onClick={() => go(1)}
        disabled={edge.end}
        aria-label={label + " — növbəti məhsullar"}
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
}

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
  const gapOf = new Map<string, number>();
  const gaps = ranked
    .map((p) => {
      const prices = validOffers(c, p.id, city).map((o) => o.price);
      const high = Math.max(...prices),
        low = Math.min(...prices);
      const gap = prices.length > 1 && high > 0 ? (high - low) / high : 0;
      gapOf.set(p.id, gap);
      return { p, gap };
    })
    .filter((x) => x.gap >= 0.03)
    .sort((a, b) => b.gap - a.gap)
    .map((x) => x.p);
  const popularIds = new Set(ranked.slice(0, 12).map((p) => p.id));
  const deals = gaps.filter((p) => !popularIds.has(p.id)).slice(0, 12);
  // Hero: widely compared products whose stores disagree by a visible amount.
  const stageItems = ranked
    .filter((p) => validOffers(c, p.id, city).length >= 3 && (gapOf.get(p.id) || 0) >= 0.04)
    .slice(0, 3);
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
      <section
        className={"h-hero" + (stageItems.length ? "" : " h-hero-solo")}
        aria-labelledby="home-title"
      >
        <div className="h-hero-copy">
          <h1 id="home-title">
            <span>Ucuzunu tap,</span> <span className="h-hero-pop">qəpiyinə qədər.</span>
          </h1>
          <p>
            {storeCount ? azNumber(storeCount) + " mağazanın " : "Mağazaların "}
            {azNumber(c.totals?.products || 0)} məhsulu bir yerdə. Qiyməti, çatdırılmanı və taksiti
            yan-yana gör, ən sərfəli mağazaya bir kliklə keç.
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
              placeholder="Nə axtarırsan? Məsələn, iPhone 17"
              aria-label="Məhsul, model və ya brend axtar"
            />
            <button type="submit">
              Axtar <ArrowRight size={16} aria-hidden="true" />
            </button>
          </form>
          <div className="h-popular">
            <span>Çox axtarılır</span>
            {popular.map((q) => (
              <a href={"/axtaris?q=" + encodeURIComponent(q)} key={q}>
                {q}
              </a>
            ))}
          </div>
        </div>
        {stageItems.length > 0 && <PriceStage c={c} city={city} items={stageItems} />}
      </section>
      {availableCategories.length > 0 && (
        <section className="h-section" aria-labelledby="home-categories" id="kateqoriyalar">
          <div className="h-head">
            <h2 id="home-categories">Nə alırsan?</h2>
            <a href="/kataloq">
              Bütün məhsullar <ArrowRight size={15} />
            </a>
          </div>
          <Rail label="Kateqoriyalar">
            <div className="h-categories" data-rail>
              {availableCategories.map((cat) => (
                <a key={cat.id} href={"/kateqoriya/" + cat.id}>
                  <span>
                    <CategoryIcon name={cat.icon} size={24} />
                  </span>
                  <b>{cat.name}</b>
                  <small>{azNumber(c.categoryStats[cat.id].count)} məhsul</small>
                </a>
              ))}
            </div>
          </Rail>
        </section>
      )}
      {ranked.length > 0 && (
        <section className="h-section" aria-labelledby="home-popular">
          <div className="h-head">
            <h2 id="home-popular">Hamı bunları müqayisə edir</h2>
            <a href="/kataloq">
              Hamısı <ArrowRight size={15} />
            </a>
          </div>
          <Rail label="Ən çox müqayisə edilənlər">{cards(ranked.slice(0, 12))}</Rail>
        </section>
      )}
      <section className="h-section h-bento" aria-label="Qəpik ilə daha çox qənaət">
        <a className="h-tile h-tile-deals" href="/endirimler">
          <TrendingDown size={28} aria-hidden="true" />
          <b>Qiyməti düşənlər</b>
          <span>Bu gün ucuzlaşan məhsullar bir siyahıda.</span>
          <ArrowUpRight className="h-tile-go" size={22} aria-hidden="true" />
        </a>
        <a className="h-tile h-tile-alert" href="/bildirisler">
          <Bell size={28} aria-hidden="true" />
          <b>Hədəf qiymət qur</b>
          <span>İstədiyin qiymətə düşəndə səni xəbərdar edək.</span>
          <ArrowUpRight className="h-tile-go" size={22} aria-hidden="true" />
        </a>
        <a className="h-tile h-tile-compare" href="/muqayise">
          <Scale size={28} aria-hidden="true" />
          <b>Yan-yana müqayisə</b>
          <span>4 məhsula qədər xüsusiyyət və qiymət.</span>
          <ArrowUpRight className="h-tile-go" size={22} aria-hidden="true" />
        </a>
        <a className="h-tile h-tile-stores" href="/magazalar">
          <Store size={28} aria-hidden="true" />
          <b>{storeCount ? azNumber(storeCount) + " mağaza" : "Mağazalar"}</b>
          <span>Qiymətləri qoşulan yerli mağazalar.</span>
          <ArrowUpRight className="h-tile-go" size={22} aria-hidden="true" />
        </a>
      </section>
      {deals.length > 0 && (
        <section className="h-section" aria-labelledby="home-deals">
          <div className="h-head">
            <h2 id="home-deals">Mağazalar arasında böyük fərq</h2>
            <a href="/endirimler">
              Hamısı <ArrowRight size={15} />
            </a>
          </div>
          <Rail label="Böyük fərq olan məhsullar">{cards(deals)}</Rail>
        </section>
      )}
      {stores.length > 0 && (
        <section className="h-section h-stores-band" aria-labelledby="home-stores">
          <div className="h-head">
            <h2 id="home-stores">Qiymətləri buradan gəlir</h2>
            <a href="/magazalar">
              Bütün mağazalar <ArrowRight size={15} />
            </a>
          </div>
          <div className="h-marquee">
            <div className="h-marquee-track">
              {[0, 1].map((copy) =>
                stores.slice(0, 14).map((s) => (
                  <a
                    href={"/magazalar/" + s.id}
                    key={copy + s.id}
                    aria-hidden={copy === 1}
                    tabIndex={copy === 1 ? -1 : undefined}
                  >
                    <StoreLogo store={s} />
                    <small>{azNumber(c.storeStats[s.id]?.count || 0)} məhsul</small>
                  </a>
                )),
              )}
            </div>
          </div>
        </section>
      )}
      <section className="h-section h-faq" aria-labelledby="home-faq">
        <div className="h-faq-intro">
          <h2 id="home-faq">Sual var?</h2>
          <p>Qəpik necə işləyir, qiymətlər haradan gəlir və mağazanı necə əlavə edə bilərsən.</p>
          <a href="/rehber">
            Alış-veriş bələdçisi <ArrowRight size={15} />
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
