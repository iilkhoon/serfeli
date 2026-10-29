"use client";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Search,
  Bell,
  Pause,
  Play,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Scale,
  Wallet,
  Plus,
  Minus,
  Check,
  MoveUpRight,
} from "lucide-react";
import { categories, validOffers, money, type Product } from "../lib/catalog";
import { rankProductsByStoreCount, type CatalogSlice } from "../lib/catalog-query";
import { CategoryIcon, StoreLogo } from "./ui";
const tones = ["#eee6f4", "#f9e7db", "#e4efeb", "#f8edcd", "#e7ebf5", "#f4e4ec"];
const number = (n: number) => n.toLocaleString("az-AZ");
export default function Home({
  catalog: c,
  city,
  cards,
  onAlert,
  onInfo,
}: {
  catalog: CatalogSlice;
  city: string;
  cards: (products: Product[]) => ReactNode;
  onAlert: (p: Product) => void;
  onInfo: (topic: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0),
    [paused, setPaused] = useState(false),
    [hovered, setHovered] = useState(false),
    [focused, setFocused] = useState(false),
    [category, setCategory] = useState("telefon");
  const availableCategories = categories.filter((cat) => (c.categoryStats[cat.id]?.count || 0) > 0);
  const ranked = rankProductsByStoreCount(
    c,
    c.products.filter((p) => p.active && validOffers(c, p.id, city).length > 0),
    city,
  );
  const heroes = ranked.slice(0, 3);
  const selected = heroes[index % Math.max(heroes.length, 1)];
  const selectedOffers = selected ? validOffers(c, selected.id, city) : [];
  const selectedStore = c.stores.find((s) => s.id === selectedOffers[0]?.storeId);
  // Number of stores selling a product now; the product found in the most stores leads.
  const storeCount = (id: string) => validOffers(c, id, city).length;
  const pick = (id: string) => ranked.filter((p) => p.category === id).slice(0, 4);
  const tabCategories = availableCategories.filter((cat) => pick(cat.id).length).slice(0, 8);
  const activeCategory = tabCategories.find((cat) => cat.id === category) || tabCategories[0];
  const items = activeCategory ? pick(activeCategory.id) : [];
  const comparison = ranked.find((p) => storeCount(p.id) > 1);
  const comparisonOffers = comparison ? validOffers(c, comparison.id, city).slice(0, 3) : [];
  const difference =
    comparisonOffers.length > 1
      ? Math.max(...comparisonOffers.map((o) => o.price)) -
        Math.min(...comparisonOffers.map((o) => o.price))
      : 0;
  // Only stores whose prices are connected, largest catalogs first.
  const stores = c.stores
    .filter(
      (s) =>
        s.active &&
        c.storeStats[s.id]?.real &&
        (c.storeStats[s.id]?.count || 0) > 0 &&
        !s.id.startsWith("tap-"),
    )
    .sort((a, b) => (c.storeStats[b.id]?.count || 0) - (c.storeStats[a.id]?.count || 0))
    .slice(0, 8);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const nodes = el.querySelectorAll<HTMLElement>(".q-reveal");
    if (
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.classList.add("is-seen");
            observer.unobserve(entry.target);
          }
      },
      { threshold: 0.08, rootMargin: "0px 0px 30px 0px" },
    );
    for (const node of nodes) {
      if (node.getBoundingClientRect().top < window.innerHeight) node.classList.add("is-seen");
      observer.observe(node);
    }
    el.classList.add("q-motion-ready");
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (paused || hovered || focused || heroes.length < 2) return;
    const timer = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      )
        setIndex((i) => (i + 1) % heroes.length);
    }, 6500);
    return () => clearInterval(timer);
  }, [paused, hovered, focused, heroes.length]);
  const choose = (i: number) => {
    setIndex((i + heroes.length) % heroes.length);
    setPaused(true);
  };
  return (
    <div ref={root} className="q-home" data-motion-paused={paused || undefined}>
      <div className="q-radar">
        <span>
          <i />
          QIYMƏT RADARI
        </span>
        <p>Az xərclə. Seçimin çox olsun.</p>
        <a href="/magazalar">
          Mənbələri kəşf et <ArrowUpRight size={15} />
        </a>
      </div>
      <section className="q-hero q-reveal" aria-labelledby="home-title">
        <div className="q-hero-copy">
          <span className="q-kicker">
            <img src="/favicon.svg" width="23" height="23" alt="" />
            Azərbaycan üçün ağıllı alış-veriş
          </span>
          <h1 id="home-title">
            Qiyməti bil.
            <br />
            <span>Fərqi özün seç.</span>
          </h1>
          <p>
            Telefonlardan ev texnikasına — axtardığını tap, mağazaların qiymətlərinə yanaşı bax.
          </p>
          <form
            action="/axtaris"
            method="get"
            className="q-hero-search"
            role="search"
            aria-label="Ana səhifə axtarışı"
          >
            <Search size={22} />
            <input
              name="q"
              required
              placeholder="Nə almaq istəyirsən?"
              aria-label="Nə almaq istəyirsən?"
            />
            <button type="submit" aria-label="Məhsulu axtar">
              <ArrowRight size={23} />
            </button>
          </form>
          <div className="q-popular">
            <span>İndi kəşf et:</span>
            {["iPhone", "Samsung", "Dyson", "PlayStation"].map((q) => (
              <a href={"/axtaris?q=" + encodeURIComponent(q)} key={q}>
                {q}
                <ArrowUpRight size={12} />
              </a>
            ))}
          </div>
          <div className="q-hero-note">
            <ShieldCheck size={18} />
            <span>Qərar səndən. Qiymət müqayisəsi bizdən.</span>
          </div>
          <div className="q-hero-decoration" aria-hidden="true">
            q
          </div>
        </div>
        <aside
          className="q-spotlight"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocusCapture={() => setFocused(true)}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
          }}
          aria-label="Məhsul kəşfi"
        >
          <div className="q-spotlight-top">
            <span>
              <i />
              BAXMAĞA DƏYƏR
            </span>
            <button
              aria-label={paused ? "Məhsul keçidlərini başlat" : "Məhsul keçidlərini dayandır"}
              aria-pressed={paused}
              onClick={() => setPaused(!paused)}
            >
              {paused ? <Play size={16} /> : <Pause size={16} />}
            </button>
          </div>
          {selected ? (
            <div key={selected.id} className="q-spotlight-item">
              <a href={"/mehsul/" + selected.id} className="q-spotlight-image">
                <span className="q-ring q-ring-one" />
                <span className="q-ring q-ring-two" />
                <img
                  src={selected.image}
                  alt={selected.name}
                  width="260"
                  height="240"
                  fetchPriority="high"
                />
              </a>
              <div className="q-spotlight-copy">
                <span className="q-product-brand">{selected.brand}</span>
                <a href={"/mehsul/" + selected.id}>
                  <h2>{selected.name}</h2>
                </a>
                <p>{selected.variant}</p>
                <div className="q-spotlight-price">
                  <span>Ən aşağı nağd qiymət</span>
                  <strong>{money(Math.min(...selectedOffers.map((o) => o.price)))}</strong>
                </div>
                <div className="q-spotlight-bottom">
                  <span>
                    {selectedOffers.length} mağazada · {selectedStore?.name}
                  </span>
                  <a
                    href={"/mehsul/" + selected.id}
                    aria-label={selected.name + " qiymətlərinə bax"}
                  >
                    <ArrowUpRight size={24} />
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div className="q-spotlight-empty">
              <Scale size={48} />
              <h2>Seçimini müqayisə ilə et.</h2>
              <a href="/kataloq">
                Kataloqa keç <ArrowRight size={18} />
              </a>
            </div>
          )}
          {heroes.length > 1 && (
            <div className="q-slider-controls">
              <div className="q-slider-dots">
                {heroes.map((p, i) => (
                  <button
                    aria-label={p.name + " göstər"}
                    aria-current={i === index % heroes.length ? "true" : undefined}
                    className={i === index % heroes.length ? "selected" : ""}
                    onClick={() => choose(i)}
                    key={p.id}
                  />
                ))}
              </div>
              <span>
                {String((index % heroes.length) + 1).padStart(2, "0")} /{" "}
                {String(heroes.length).padStart(2, "0")}
              </span>
              <button aria-label="Əvvəlki məhsul" onClick={() => choose(index - 1)}>
                <ChevronLeft size={18} />
              </button>
              <button aria-label="Növbəti məhsul" onClick={() => choose(index + 1)}>
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </aside>
      </section>
      <section className="q-facts q-reveal" aria-label="Platforma məlumatları">
        <div>
          <b>{number(c.totals?.products || 0)}</b>
          <p>məhsul və variant</p>
        </div>
        <div>
          <b>{number(c.stores.filter((s) => s.active).length)}</b>
          <p>mağaza və profil</p>
        </div>
        <div>
          <Wallet size={24} />
          <strong>Nağd + taksit</strong>
          <p>Yekunu yanaşı gör</p>
        </div>
        <div>
          <ShieldCheck size={24} />
          <strong>Mənbəsi bəlli</strong>
          <p>Yoxlanma vaxtı ilə</p>
        </div>
      </section>
      {ranked.length > 0 && (
        <section className="q-discovery q-reveal" aria-labelledby="home-popular-title">
          <div className="q-section-title">
            <div>
              <span className="q-kicker">DAHA ÇOX MAĞAZA, DAHA AYDIN MÜQAYİSƏ</span>
              <h2 id="home-popular-title">Ən çox mağazada satılanlar</h2>
            </div>
            <a href="/kataloq">
              Hamısına bax <ArrowRight size={18} />
            </a>
          </div>
          {cards(ranked.slice(0, 8))}
        </section>
      )}
      <section className="q-categories q-reveal" id="kateqoriyalar">
        <div className="q-section-title">
          <div>
            <span className="q-kicker">HƏR EHTİYACA BİR SEÇİM</span>
            <h2>Bu gün nə axtarırsan?</h2>
          </div>
          <a href="/kataloq">
            Bütün məhsullar <ArrowUpRight size={18} />
          </a>
        </div>
        <div className="q-category-grid">
          {availableCategories.map((cat, i) => {
            const stat = c.categoryStats[cat.id];
            return (
              <a
                key={cat.id}
                href={"/kateqoriya/" + cat.id}
                className="q-category"
                style={
                  {
                    "--category-tone": tones[i % tones.length],
                    "--tile-order": i % 6,
                  } as CSSProperties
                }
              >
                <span className="q-category-icon">
                  <CategoryIcon name={cat.icon} size={30} />
                </span>
                <div>
                  <h3>{cat.name}</h3>
                  <p>{number(stat.count)} məhsul</p>
                </div>
                <ArrowUpRight size={17} />
              </a>
            );
          })}
        </div>
      </section>
      {items.length > 0 && (
        <section className="q-discovery q-reveal">
          <div className="q-section-title">
            <div>
              <span className="q-kicker">SEÇİMİNİ DARALT, QİYMƏTİ YOXLA</span>
              <h2>Axtardığın buradadır.</h2>
            </div>
            <a href={"/kateqoriya/" + activeCategory.id}>
              Hamısına bax <ArrowRight size={18} />
            </a>
          </div>
          <div className="q-category-tabs" role="tablist" aria-label="Məhsul kateqoriyaları">
            {tabCategories.map((cat) => (
              <button
                role="tab"
                id={"home-tab-" + cat.id}
                aria-controls="home-picks"
                aria-selected={cat.id === activeCategory.id}
                key={cat.id}
                onClick={() => setCategory(cat.id)}
              >
                <CategoryIcon name={cat.icon} size={18} />
                {cat.name}
              </button>
            ))}
          </div>
          <div
            id="home-picks"
            role="tabpanel"
            aria-labelledby={"home-tab-" + activeCategory.id}
            key={activeCategory.id}
            className="q-products-enter"
          >
            {cards(items)}
          </div>
          <div className="q-source-note">
            <Check size={16} />
            <span>Qiymət və stok hər təklifdə ayrıca göstərilir. Son şərtləri mağazada yoxla.</span>
            <button onClick={() => onInfo("Məlumatın mənbəyi")}>Ətraflı</button>
          </div>
        </section>
      )}
      {comparison && difference > 0 && (
        <section className="q-comparison q-reveal">
          <div className="q-comparison-intro">
            <span className="q-kicker">BİR MODEL. FƏRQLİ ETİKETLƏR.</span>
            <h2>
              Eyni məhsula
              <br />
              niyə artıq ödəyəsən?
            </h2>
            <p>
              {comparison.name} · {comparison.variant}
            </p>
            <strong>
              {money(difference)}
              <span>nağd qiymət fərqi</span>
            </strong>
            <a className="dark-button" href={"/mehsul/" + comparison.id}>
              Bütün şərtləri müqayisə et <ArrowUpRight size={18} />
            </a>
          </div>
          <div className="q-comparison-offers">
            {comparisonOffers.map((offer, i) => {
              const store = c.stores.find((s) => s.id === offer.storeId)!;
              return (
                <a
                  className={"q-comparison-row " + (i === 0 ? "q-best" : "")}
                  key={offer.id}
                  href={"/mehsul/" + comparison.id}
                >
                  <span>
                    <StoreLogo store={store} />
                    <small>{i === 0 ? "Ən aşağı nağd" : "Mağazanın nağd qiyməti"}</small>
                  </span>
                  <strong>{money(offer.price)}</strong>
                  <ArrowUpRight size={18} />
                </a>
              );
            })}
            <p>Yaddaş və rəng eynidir. Çatdırılma, taksit və zəmanət şərtlərini ayrıca yoxla.</p>
          </div>
        </section>
      )}
      <section className="q-merchants q-reveal">
        <div className="q-section-title">
          <div>
            <span className="q-kicker">TANIDIĞIN MAĞAZALAR, BİR AXTARIŞDA</span>
            <h2>
              Ünvan çoxdur.
              <br className="q-mobile-break" /> Seçim bir yerdədir.
            </h2>
          </div>
          <a href="/magazalar">
            Bütün mağazalar <ArrowUpRight size={18} />
          </a>
        </div>
        <div className="q-store-grid">
          {stores.map((s) => (
            <a href={"/magazalar/" + s.id} key={s.id}>
              <StoreLogo store={s} />
              <span>
                {number(c.storeStats[s.id]?.count || 0)} məhsul <ArrowUpRight size={15} />
              </span>
            </a>
          ))}
        </div>
        <p className="q-small-note">
          Mağaza profili qiymət bağlantısının aktiv olduğunu bildirmir. Təklifdə mənbə və yoxlanma
          vaxtına bax.
        </p>
      </section>
      <div className="q-home-feed">
        {["ev", "noutbuk", "audio", "saat"].map((id, i) => {
          const cat = availableCategories.find((x) => x.id === id),
            list = pick(id);
          if (!cat || !list.length) return null;
          return (
            <section className="feed-section q-reveal" key={id}>
              <div className="q-section-title">
                <div>
                  <span className="q-kicker">
                    {
                      [
                        "EVİNƏ YENİ BİR RAHATLIQ",
                        "İŞİNƏ VƏ FİKRİNƏ UYĞUN",
                        "GÜNÜN SƏSİNİ DƏYİŞ",
                        "VAXTI ÖZÜNƏ AYIR",
                      ][i]
                    }
                  </span>
                  <h2>{cat.name}</h2>
                </div>
                <a href={"/kateqoriya/" + id}>
                  {number(c.categoryStats[id].count)} məhsula bax <ArrowRight size={18} />
                </a>
              </div>
              {cards(list)}
            </section>
          );
        })}
      </div>
      <section className="q-alert-banner q-reveal">
        <span className="q-alert-symbol" aria-hidden="true">
          <Bell size={46} />
          <span>₼</span>
        </span>
        <div>
          <span className="q-kicker">QIYMƏTİ TƏQİB ET</span>
          <h2>Tələsmə. Hədəf qiymətini seç.</h2>
          <p>Məhsulu izlə, hədəfə çatanda saytdaxili bildirişdə gör.</p>
        </div>
        <button
          className="dark-button"
          onClick={() => {
            if (selected) onAlert(selected);
          }}
          disabled={!selected}
        >
          Qiymət bildirişi qur <ArrowUpRight size={18} />
        </button>
      </section>
      <section className="q-how q-reveal">
        <div className="q-section-title">
          <div>
            <span className="q-kicker">QƏNAƏTƏ GEDƏN QISA YOL</span>
            <h2>Üç addım, daha aydın qərar.</h2>
          </div>
        </div>
        <div className="q-how-grid">
          {[
            [
              "01",
              "Tap",
              "Modeli və variantı seç. Yaddaş, rəng və məhsul vəziyyətini dəqiqləşdir.",
              "/kataloq",
            ],
            [
              "02",
              "Müqayisə et",
              "Nağd qiyməti, taksit yekununu və çatdırılmanı birlikdə qiymətləndir.",
              "/muqayise",
            ],
            [
              "03",
              "Mağazada tamamla",
              "Seçdiyin mağazaya keç, cari qiyməti və stoku təsdiqləyərək alışını et.",
              "/magazalar",
            ],
          ].map(([n, title, text, href]) => (
            <a href={href} key={n}>
              <span>{n}</span>
              <MoveUpRight size={22} />
              <h3>{title}</h3>
              <p>{text}</p>
            </a>
          ))}
        </div>
      </section>
      <section className="q-faq q-reveal">
        <div>
          <span className="q-kicker">ALIŞDAN ƏVVƏL</span>
          <h2>
            Kiçik suallar.
            <br />
            Aydın cavablar.
          </h2>
          <p>Azərbaycanda qiymət müqayisəsi və alış-veriş barədə.</p>
          <a href="/rehber">
            Alış-veriş bələdçisi <ArrowUpRight size={18} />
          </a>
        </div>
        <div className="q-faq-items">
          {[
            [
              "Qəpik məhsul satır?",
              "Qəpik mağazaların qiymət və məhsul məlumatlarını bir yerdə göstərir. Alış seçdiyin mağazanın öz saytında tamamlanır.",
            ],
            [
              "Qiymətlər nə vaxt yenilənir?",
              "Technomania rəsmi feed-i ziyarət zamanı keşlə yoxlanır. Digər mənbələrin qiymətində son yoxlanma vaxtı göstərilir. Qiymət və stok alışdan əvvəl mağazada təsdiqlənməlidir.",
            ],
            [
              "Ən ucuz qiymət həmişə ən sərfəlidir?",
              "Çatdırılma, taksit yekunu, zəmanət və variantı da yoxla. Çatdırılma məlumatı məlum deyilsə ayrıca qeyd olunur; avtomatik pulsuz sayılmır.",
            ],
            [
              "Tap.az elanları necə göstərilir?",
              "Yalnız mənbədə mağaza nişanı və profili təsdiqlənmiş elanlar ayrıca işarələnir. Məhsulun yeni və ya işlənmiş vəziyyəti ümumi mağaza təklifləri ilə qarışdırılmır.",
            ],
          ].map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question}
                <span>
                  <Plus size={18} className="q-plus" />
                  <Minus size={18} className="q-minus" />
                </span>
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
