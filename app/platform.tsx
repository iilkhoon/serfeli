"use client";
import {
  useState,
  useEffect,
  useMemo,
  useRef,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  Search,
  Heart,
  Bell,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  ChevronDown,
  MapPin,
  SlidersHorizontal,
  Menu,
  X,
  Check,
  ShieldCheck,
  LayoutGrid,
  TrendingDown,
  Store as StoreIcon,
  UserRound,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Info,
  Clock,
  Send,
  Scale,
  Compass,
} from "lucide-react";
import {
  categories,
  canonicalProductId,
  seedCatalog,
  bestRecordedOffersFor,
  validOffers,
  priceOf,
  money,
  type Product,
  type Catalog,
  type Store,
  type Offer,
} from "../lib/catalog";
import { DEFAULT_CITY, PAGE_SIZE, type CatalogSlice } from "../lib/catalog-query";
import { api, errorMessage, Modal, Empty, CategoryIcon, StoreLogo } from "./ui";
import type { Act, Personal, Session } from "./types";
import Admin from "./admin";
import MerchantPage from "./merchant-page";
import { AdSlot, AdsProvider } from "../components/ad-slot";
import { ProductQuestions } from "../components/product-qa";
import {
  PremiumBadge,
  StoreContactList,
  StoreContactSummary,
  isPremium,
} from "../components/store-info";
import {
  creditOptions,
  interestFree,
  isClassified,
  locative,
  lowestMonthly,
} from "../components/offer-terms";
import type { ProductExtras } from "../lib/engagement-types";
import Home from "./home";
import { ProductImage } from "../components/product-image";
import { azDate, azDateTime, azNumber } from "../components/format";
type ModalState =
  | { type: "login" }
  | { type: "city" }
  | { type: "alert"; p: Product }
  | { type: "info"; topic: string }
  | null;
export default function Platform({
  initialPath = "/",
  initialCatalog,
  initialExtras,
}: {
  initialPath?: string;
  initialCatalog?: CatalogSlice;
  initialExtras?: ProductExtras;
}) {
  const [c, setC] = useState<CatalogSlice>(
      () =>
        initialCatalog || {
          ...seedCatalog,
          matched: [],
          matchedTotal: 0,
          pageOffset: 0,
          brands: [],
          storeStats: {},
          categoryStats: {},
        },
    ),
    [version, setVersion] = useState(0),
    [error, setError] = useState(""),
    [path, setPath] = useState(initialPath),
    [query, setQuery] = useState(""),
    [city, setCity] = useState(DEFAULT_CITY),
    [session, setSession] = useState<Session>({ user: null, admin: false, needsSetup: false }),
    [personal, setPersonal] = useState<Personal>({ favorites: [], alerts: [] }),
    [compIds, setComp] = useState<string[]>([]),
    [toast, setToast] = useState(""),
    [modal, setModal] = useState<ModalState>(null),
    [busy, setBusy] = useState(false),
    [menu, setMenu] = useState(false),
    [mobileFilters, setMobileFilters] = useState(false),
    [merchantQuery, setMerchantQuery] = useState(""),
    [pageOffset, setPageOffset] = useState(initialCatalog?.pageOffset || 0);
  const [filter, updateFilter] = useState({
    brand: "",
    store: "",
    min: "",
    max: "",
    sort: "popular",
    real: false,
  });
  const setFilter = (next: typeof filter) => {
    setPageOffset(0);
    updateFilter(next);
    // A new filter starts from the first page, so drop a stale ?page=N from the address bar.
    const url = new URL(window.location.href);
    if (url.searchParams.has("page")) {
      url.searchParams.delete("page");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
  };
  const aliases = c.productAliases;
  const comp = useMemo(
    () => [...new Set(compIds.map((id) => canonicalProductId({ productAliases: aliases }, id)))],
    [compIds, aliases],
  );
  const nav = (to: string) => {
    setPageOffset(0);
    window.location.assign(to);
    setPath(to);
    setMenu(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const loadAccount = async () => {
    try {
      const [s, p] = await Promise.all([api<Session>("session"), api<Personal>("personal")]);
      setSession(s);
      setPersonal(p);
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  // Also re-requests the visible catalog slice, e.g. after the viewer or an admin changed data.
  const refresh = async () => {
    setVersion((v) => v + 1);
    await loadAccount();
  };
  useEffect(() => {
    // The server already rendered initialPath (path + query), so only history changes need syncing.
    const pop = () => setPath(location.pathname + location.search);
    window.addEventListener("popstate", pop);
    // localStorage only exists after hydration; reading it here keeps the server and first client
    // render identical.
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      setComp(JSON.parse(localStorage.getItem("qepik-compare") || "[]"));
      setCity(localStorage.getItem("qepik-city") || "Bakı");
    } catch {}
    /* eslint-enable react-hooks/set-state-in-effect */
    loadAccount();
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const act: Act = async (fn, msg) => {
    setBusy(true);
    try {
      await fn();
      if (msg) setToast(msg);
      return true;
    } catch (e) {
      setToast(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const needUser = () => {
    if (!session.user) {
      setModal({ type: "login" });
      return false;
    }
    return true;
  };
  const favorite = (p: Product) => {
    if (!needUser()) return;
    act(async () => {
      await api("personal", {
        kind: "favorite",
        productId: p.id,
        remove: personal.favorites.some((f) => f.productId === p.id),
      });
      await refresh();
    });
  };
  const compare = (p: Product) => {
    const next = comp.includes(p.id)
      ? comp.filter((id) => id !== p.id)
      : comp.length < 4
        ? [...comp, p.id]
        : comp;
    if (next === comp) {
      setToast("Eyni vaxtda maksimum 4 məhsul müqayisə edin.");
      return;
    }
    setComp(next);
    localStorage.setItem("qepik-compare", JSON.stringify(next));
  };
  const alert = (p: Product) => {
    if (needUser()) setModal({ type: "alert", p });
  };
  const parts = path.split("?")[0].split("/").filter(Boolean),
    page = parts[0] || "home",
    selected = c.products.find((p) => p.id === parts[1]);
  const searchTerm = new URLSearchParams(path.split("?")[1] || "").get("q") || "";
  const currentCategory = page === "kateqoriya" ? parts[1] : "";
  const isCatalog = ["kataloq", "kateqoriya", "axtaris", "endirimler", "secilmisler"].includes(
    page,
  );
  const storeId = page === "magazalar" ? parts[1] : "";
  // Filtering and sorting run on the server; this only says which slice the page needs.
  const sliceQuery = useMemo(() => {
    const q = new URLSearchParams({
      path,
      city,
      limit: String(PAGE_SIZE),
      offset: String(pageOffset),
    });
    if (filter.brand) q.set("brand", filter.brand);
    if (filter.store) q.set("store", filter.store);
    if (filter.min) q.set("min", filter.min);
    if (filter.max) q.set("max", filter.max);
    if (filter.sort !== "popular") q.set("sort", filter.sort);
    if (filter.real) q.set("real", "1");
    const ids = new Set([...comp, ...personal.alerts.map((a) => a.productId)]);
    if (ids.size) q.set("ids", [...ids].join(","));
    if (page === "secilmisler")
      q.set("favorites", personal.favorites.map((f) => f.productId).join(","));
    return q.toString();
  }, [path, city, pageOffset, filter, comp, personal, page]);
  // The server already rendered the first slice; fetch only once something differs from it.
  const renderedQuery = useRef(sliceQuery);
  // Mirrors renderedQuery for rendering; the ref alone would not re-render the loading state.
  const [loadedQuery, setLoadedQuery] = useState(sliceQuery);
  useEffect(() => {
    if (version === 0 && sliceQuery === renderedQuery.current) return;
    let cancelled = false;
    // Debounced so typing a price range does not send a request per keystroke.
    const timer = setTimeout(() => {
      api<CatalogSlice>("catalog?" + sliceQuery).then(
        (next) => {
          if (cancelled) return;
          renderedQuery.current = sliceQuery;
          setLoadedQuery(sliceQuery);
          setC(next);
          setError("");
        },
        (e) => !cancelled && setError(errorMessage(e)),
      );
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sliceQuery, version]);
  const products = useMemo(() => {
    const byId = new Map(c.products.map((p) => [p.id, p]));
    return c.matched.flatMap((id) => byId.get(id) || []);
  }, [c]);
  const listingTop = useRef<HTMLDivElement>(null);
  const listingLoading = sliceQuery !== loadedQuery && !error;
  const filtersActive = !!(filter.brand || filter.store || filter.min || filter.max || filter.real);
  // Nothing to narrow down: the sort and filter controls would only add noise to the empty state.
  const nothingToFilter = !listingLoading && !filtersActive && c.matchedTotal === 0;
  const currentStore = storeId ? c.stores.find((s) => s.id === storeId) : undefined;
  const totalPages = Math.max(1, Math.ceil(c.matchedTotal / PAGE_SIZE));
  const currentPage = Math.floor(c.pageOffset / PAGE_SIZE) + 1;
  // Crawlable ?page=N URLs; the server renders the same slice for them.
  const pageHref = (n: number) => {
    const [base, qs = ""] = path.split("?");
    const q = new URLSearchParams(qs);
    if (n > 1) q.set("page", String(n));
    else q.delete("page");
    return base + (q.size ? "?" + q.toString() : "");
  };
  const goToPage = (offset: number) => {
    const next = Math.max(0, offset);
    setPageOffset(next);
    // replaceState keeps `path` (and so the slice request) unchanged while the address bar
    // shows a shareable page URL.
    window.history.replaceState(null, "", pageHref(Math.floor(next / PAGE_SIZE) + 1));
    listingTop.current?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };
  const reset = () =>
    setFilter({ brand: "", store: "", min: "", max: "", sort: "popular", real: false });
  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    reset();
    nav("/axtaris?q=" + encodeURIComponent(query));
  };
  const title =
    page === "endirimler"
      ? "Qiyməti düşənlər"
      : page === "secilmisler"
        ? "Seçilmiş məhsullar"
        : page === "axtaris"
          ? `“${searchTerm}” üçün nəticələr`
          : currentCategory
            ? categories.find((v) => v.id === currentCategory)?.name
            : "Bütün məhsullar";
  const productCard = (p: Product) => {
    const available = validOffers(c, p.id, city),
      recorded = bestRecordedOffersFor(c, p.id, city),
      offers = available.length ? available : recorded,
      low = offers[0],
      high = available.length ? Math.max(...available.map((o) => o.price)) : 0,
      save = low && available.length > 1 ? high - low.price : 0,
      // A saving only earns a badge when it is worth acting on.
      worthSaving = save >= 5 && save >= high * 0.02,
      badge = p.marketplace
        ? { tone: "neutral", text: "Tap.az elanı" }
        : !available.length && offers.length
          ? {
              tone: "muted",
              text: low?.stockKnown === false ? "Stok məlumatı yoxdur" : "Stokda yoxdur",
            }
          : worthSaving
            ? { tone: "save", text: money(Math.round(save)) + " fərq" }
            : null;
    return (
      <article className={"pcard" + (available.length ? "" : " pcard-off")} key={p.id}>
        <a className="pcard-image" href={"/mehsul/" + p.id} tabIndex={-1} aria-hidden="true">
          <ProductImage
            src={p.image}
            alt=""
            width={200}
            height={200}
            loading="lazy"
            decoding="async"
          />
        </a>
        {badge && (
          <span className={"pcard-badge pcard-badge-" + badge.tone}>
            {badge.tone === "save" && <TrendingDown size={12} />}
            {badge.text}
          </span>
        )}
        <div className="pcard-actions">
          <button
            className={personal.favorites.some((f) => f.productId === p.id) ? "chosen" : ""}
            aria-label={p.name + " seçilmişlərə əlavə et"}
            aria-pressed={personal.favorites.some((f) => f.productId === p.id)}
            onClick={() => favorite(p)}
          >
            <Heart size={16} />
          </button>
          <button
            className={comp.includes(p.id) ? "chosen" : ""}
            aria-label={p.name + " müqayisəyə əlavə et"}
            aria-pressed={comp.includes(p.id)}
            onClick={() => compare(p)}
          >
            <Scale size={16} />
          </button>
        </div>
        <div className="pcard-body">
          <a className="pcard-title" href={"/mehsul/" + p.id}>
            {p.name}
          </a>
          {(p.variant || p.distinction) && (
            <p className="pcard-variant">
              {p.variant}
              {p.distinction && (
                <span title="Eyni adlı başqa məhsuldan fərqi">
                  {p.variant ? " · " : ""}
                  {p.distinction}
                </span>
              )}
            </p>
          )}
          <div className="pcard-price">
            <strong>
              {low?.priceRange && low.priceRange.max > low.priceRange.min
                ? money(low.priceRange.min) + " – " + money(low.priceRange.max)
                : low
                  ? money(low.price)
                  : "Qiymət yoxdur"}
            </strong>
            {low && !available.length && <small>son qiymət</small>}
          </div>
          {low && lowestMonthly(low) && (
            <p className="pcard-credit">
              Kreditlə {money(lowestMonthly(low)!.monthly)} × {lowestMonthly(low)!.months} ay
            </p>
          )}
          <a
            className="pcard-stores"
            href={"/mehsul/" + p.id}
            aria-label={p.name + " — mağaza qiymətlərinə bax"}
          >
            {available.length
              ? available.length + " mağazada qiymət"
              : !offers.length
                ? "Qiymət açıqlanmayıb"
                : low?.stockKnown === false
                  ? "Stok məlumatı yoxdur"
                  : "Hazırda stokda deyil"}
            <ChevronRight size={14} />
          </a>
        </div>
      </article>
    );
  };
  // An in-feed ad after the second full row of a long listing; reserved size, labelled "Reklam".
  const cards = (list: Product[], adSlot?: string) => (
    <div className="pgrid">
      {list.flatMap((p, i) =>
        adSlot && i === 8 && list.length > 12
          ? [
              <AdSlot key="ad" slot={adSlot} format="in-feed" className="pgrid-ad" />,
              productCard(p),
            ]
          : [productCard(p)],
      )}
    </div>
  );
  const Filter = () => (
    <aside className={"filters " + (mobileFilters ? "filters-open" : "")}>
      <div className="filter-title">
        <h3>Filtrlər</h3>
        <button className="text-button" onClick={reset}>
          Sıfırla
        </button>
      </div>
      <label>
        Brend
        <select
          value={filter.brand}
          onChange={(e) => setFilter({ ...filter, brand: e.target.value })}
        >
          <option value="">Bütün brendlər</option>
          {c.brands.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </label>
      <label>
        Qiymət aralığı, ₼
        <div className="price-inputs">
          <input
            type="number"
            min="0"
            aria-label="Minimum qiymət"
            placeholder="Min"
            value={filter.min}
            onChange={(e) => setFilter({ ...filter, min: e.target.value })}
          />
          <span>—</span>
          <input
            type="number"
            min="0"
            aria-label="Maksimum qiymət"
            placeholder="Maks"
            value={filter.max}
            onChange={(e) => setFilter({ ...filter, max: e.target.value })}
          />
        </div>
      </label>
      <label>
        Mağaza
        <select
          value={filter.store}
          onChange={(e) => setFilter({ ...filter, store: e.target.value })}
        >
          <option value="">Bütün mağazalar</option>
          {c.stores
            .filter((s) => s.active)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          checked={filter.real}
          onChange={(e) => setFilter({ ...filter, real: e.target.checked })}
        />
        Yalnız real qiymətlər
      </label>
      <div className="filter-note">
        <ShieldCheck size={22} />
        <strong>Eyni modeli müqayisə edin</strong>
        <p>Yaddaş, rəng və zəmanət şərtlərinə diqqət yetirin.</p>
      </div>
    </aside>
  );
  return (
    <AdsProvider value={c.settings.ads}>
      <div>
        <a className="skip-link" href="#main-content">
          Əsas məzmuna keç
        </a>
        <div className="top-strip">
          <div className="shell">
            <span>{c.settings.announcement}</span>
            <div>
              <button onClick={() => setModal({ type: "info", topic: "Haqqımızda" })}>
                Qəpik necə işləyir?
              </button>
              <a href={"/magaza-qeydiyyat"}>
                Mağazanı əlavə et <ArrowUpRight size={12} />
              </a>
              <span className="locale" lang="az" title="Sayt dili: Azərbaycan dili">
                AZ
              </span>
            </div>
          </div>
        </div>
        <header className="header">
          <div className="shell header-main">
            <a className="logo" aria-label="Qəpik ana səhifə" href={"/"}>
              <img className="brand-mark" src="/favicon.svg" alt="" width={42} height={42} />
              qəpik<span className="logo-dot">.</span>
            </a>
            <form className="search-bar" action="/axtaris" method="get" onSubmit={onSearch}>
              <Search size={21} />
              <input
                name="q"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Məhsul və ya brend axtar"
                aria-label="Məhsul axtar"
              />
              <button type="submit">
                Axtar <ArrowRight size={16} />
              </button>
            </form>
            <div className="header-actions">
              <a aria-label="Müqayisə" href={"/muqayise"}>
                <span className="action-icon">
                  <Scale size={22} />
                  {comp.length > 0 && <b>{comp.length}</b>}
                </span>
                <small>Müqayisə</small>
              </a>
              <a aria-label="Seçilmişlər" href={"/secilmisler"}>
                <Heart size={22} />
                <small>Seçilmişlər</small>
              </a>
              <a aria-label="Qiymət bildirişləri" href={"/bildirisler"}>
                <Bell size={22} />
                <small>Bildirişlər</small>
              </a>
              <button
                className="profile-button"
                onClick={() => setModal({ type: "login" })}
                aria-label="Hesab"
              >
                <UserRound size={22} />
              </button>
            </div>
          </div>
        </header>
        <nav className="nav-bar">
          <div className="shell">
            <button
              className={"category-toggle " + (menu ? "open" : "")}
              onClick={() => setMenu(!menu)}
              aria-expanded={menu}
              aria-controls="category-menu"
            >
              <Menu size={19} /> Bütün kateqoriyalar <ChevronDown size={13} />
            </button>
            <a href={"/endirimler"} aria-current={page === "endirimler" ? "page" : undefined}>
              <TrendingDown size={17} /> Qiyməti düşənlər
            </a>
            <a href={"/kataloq"} aria-current={page === "kataloq" ? "page" : undefined}>
              Populyar məhsullar
            </a>
            <a href={"/magazalar"} aria-current={page === "magazalar" ? "page" : undefined}>
              Mağazalar
            </a>
            <a href={"/rehber"} aria-current={page === "rehber" ? "page" : undefined}>
              Alış-veriş bələdçisi
            </a>
            <button className="location" onClick={() => setModal({ type: "city" })}>
              <MapPin size={15} />
              {city}
              <ChevronDown size={12} />
            </button>
          </div>
          {menu && (
            <div
              className="shell mega-menu"
              id="category-menu"
              onKeyDown={(e) => {
                if (e.key === "Escape") setMenu(false);
              }}
            >
              {categories.map((cat) => (
                <a key={cat.id} href={"/kateqoriya/" + cat.id}>
                  <CategoryIcon name={cat.icon} />
                  <span>
                    {cat.name}
                    {c.categoryStats[cat.id]?.count ? (
                      <small>{azNumber(c.categoryStats[cat.id].count)} məhsul</small>
                    ) : null}
                  </span>
                  <ChevronRight size={16} />
                </a>
              ))}
            </div>
          )}
        </nav>
        {page !== "admin" && (
          <nav className="category-bar" aria-label="Kateqoriyalar">
            <div className="shell">
              {categories
                .filter((cat) => (c.categoryStats[cat.id]?.count || 0) > 0)
                .map((cat) => (
                  <a
                    key={cat.id}
                    href={"/kateqoriya/" + cat.id}
                    aria-current={currentCategory === cat.id ? "page" : undefined}
                  >
                    <CategoryIcon name={cat.icon} size={18} />
                    {cat.name}
                  </a>
                ))}
            </div>
          </nav>
        )}
        {c.dataStatus && c.dataStatus.state !== "ready" && (
          <div
            className="shell data-notice data-status-banner"
            role={c.dataStatus.state === "unavailable" ? "alert" : "status"}
          >
            <Info size={18} />
            <span>
              {c.dataStatus.message ||
                (c.dataStatus.state === "unavailable"
                  ? "Kataloq hazırda yüklənmir. Yenidən yoxla."
                  : "Kataloq bazaya hazırlanır. Hazır olduqda məhsullar və qiymətlər burada görünəcək.")}
            </span>
            {c.dataStatus.state === "unavailable" && (
              <button className="outline-button" onClick={refresh}>
                Yenidən yoxla
              </button>
            )}
          </div>
        )}
        {error && (
          <div className="shell error-banner">
            <Info size={18} />
            <span>Məlumat yüklənmədi: {error}. Son yüklənmiş məlumat göstərilir.</span>
            <button onClick={refresh}>Yenidən yoxla</button>
          </div>
        )}
        {(isCatalog || storeId || page === "mehsul") && (
          <div className="ad-rails">
            <AdSlot slot="rail-left" format="rail" className="ad-rail-left" />
            <AdSlot slot="rail-right" format="rail" className="ad-rail-right" />
          </div>
        )}
        <main className="shell main-content" id="main-content" tabIndex={-1}>
          {page === "home" && <Home catalog={c} city={city} cards={cards} />}
          {(isCatalog || storeId) && (
            <>
              <nav className="breadcrumb" aria-label="Səhifə yolu">
                <a href={"/"}>Ana səhifə</a>
                <ChevronRight size={13} aria-hidden="true" />
                {storeId && (
                  <>
                    <a href={"/magazalar"}>Mağazalar</a>
                    <ChevronRight size={13} aria-hidden="true" />
                  </>
                )}
                <span aria-current="page">{storeId ? currentStore?.name : title}</span>
              </nav>
              <div className="page-heading" ref={listingTop}>
                <div>
                  <span className="eyebrow">
                    {storeId ? "MAĞAZA TƏKLİFLƏRİ" : "QİYMƏTİ BİL, AĞILLI SEÇ"}
                  </span>
                  <h1>
                    {storeId ? currentStore?.name : title}
                    {currentStore && isPremium(currentStore) && <PremiumBadge />}
                  </h1>
                  <p>
                    {azNumber(c.matchedTotal)} məhsul · {city} üçün müqayisə
                    {currentStore?.domain && (
                      <>
                        {" · "}
                        <a
                          className="text-link"
                          href={"https://" + currentStore.domain}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {currentStore.domain} <ArrowUpRight size={13} aria-hidden="true" />
                        </a>
                      </>
                    )}
                  </p>
                  {currentStore?.description && (
                    <p className="store-description">{currentStore.description}</p>
                  )}
                  {currentStore && <StoreContactList store={currentStore} />}
                </div>
                {!nothingToFilter && (
                  <label className="sort-control">
                    <span>Sırala</span>
                    <select
                      value={filter.sort}
                      onChange={(e) => setFilter({ ...filter, sort: e.target.value })}
                    >
                      <option value="popular">Ən çox mağazada</option>
                      <option value="low">Ən ucuzdan bahaya</option>
                      <option value="high">Ən bahadan ucuza</option>
                      <option value="saving">Ən böyük qiymət fərqi</option>
                      <option value="name">Ada görə</option>
                    </select>
                  </label>
                )}
              </div>
              <div className={"mobile-filterbar" + (nothingToFilter ? " is-hidden" : "")}>
                <button
                  className="outline-button"
                  onClick={() => setMobileFilters(!mobileFilters)}
                  aria-expanded={mobileFilters}
                >
                  <SlidersHorizontal size={17} />
                  Filtrlər{" "}
                  {filtersActive && <span className="live-dot" aria-label="aktiv filtr var" />}
                  <ChevronDown size={15} />
                </button>
                <span>{azNumber(c.matchedTotal)} nəticə</span>
              </div>
              <div className={"catalog-layout" + (nothingToFilter ? " no-filters" : "")}>
                {!nothingToFilter && Filter()}
                <div aria-busy={listingLoading} className="catalog-results">
                  {!nothingToFilter && (
                    <div className="data-notice">
                      <Info size={15} />
                      <span>
                        Rəsmi mənbə qiymətləri göstərilir. Stokda olmayan məhsullar da kataloqda
                        qalır; son qiyməti mağazada təsdiqləyin.
                      </span>
                    </div>
                  )}
                  {products.length ? (
                    <>
                      <p className="catalog-range" role="status" aria-live="polite">
                        {listingLoading
                          ? "Məhsullar yüklənir…"
                          : `${azNumber(c.pageOffset + 1)}–${azNumber(c.pageOffset + products.length)} / ${azNumber(c.matchedTotal)} məhsul`}
                      </p>
                      {cards(products, page === "axtaris" ? "search-feed" : "catalog-feed")}
                      {totalPages > 1 && (
                        <nav className="catalog-pagination" aria-label="Məhsul səhifələri">
                          <div className="catalog-page-actions">
                            {(
                              [
                                [
                                  "«",
                                  1,
                                  currentPage === 1,
                                  "İlk məhsul səhifəsi",
                                  "outline-button",
                                ],
                                [
                                  "Əvvəlki",
                                  currentPage - 1,
                                  currentPage === 1,
                                  "Əvvəlki səhifə",
                                  "outline-button",
                                ],
                                [
                                  "Növbəti",
                                  currentPage + 1,
                                  currentPage >= totalPages,
                                  "Növbəti səhifə",
                                  "dark-button",
                                ],
                                [
                                  "»",
                                  totalPages,
                                  currentPage >= totalPages,
                                  "Son məhsul səhifəsi",
                                  "outline-button",
                                ],
                              ] as const
                            ).map(([text, n, off, label, cls]) =>
                              off || listingLoading ? (
                                <span
                                  key={label}
                                  className={cls + " is-disabled"}
                                  aria-disabled="true"
                                  aria-label={label}
                                >
                                  {text}
                                  {text === "Növbəti" && <ArrowRight size={16} />}
                                </span>
                              ) : (
                                <a
                                  key={label}
                                  className={cls}
                                  href={pageHref(n)}
                                  rel={
                                    text === "Əvvəlki"
                                      ? "prev"
                                      : text === "Növbəti"
                                        ? "next"
                                        : undefined
                                  }
                                  aria-label={label}
                                  onClick={(e) => {
                                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0)
                                      return;
                                    e.preventDefault();
                                    goToPage((n - 1) * PAGE_SIZE);
                                  }}
                                >
                                  {text}
                                  {text === "Növbəti" && <ArrowRight size={16} />}
                                </a>
                              ),
                            )}
                          </div>
                          <form
                            key={currentPage}
                            onSubmit={(e) => {
                              e.preventDefault();
                              const input = e.currentTarget.elements.namedItem(
                                "page",
                              ) as HTMLInputElement;
                              const value = Number(input.value);
                              if (Number.isInteger(value) && value >= 1 && value <= totalPages)
                                goToPage((value - 1) * PAGE_SIZE);
                            }}
                          >
                            <label htmlFor="catalog-page">Səhifə</label>
                            <input
                              id="catalog-page"
                              name="page"
                              type="number"
                              min={1}
                              max={totalPages}
                              step={1}
                              defaultValue={currentPage}
                              required
                              disabled={listingLoading}
                            />
                            <span>/ {totalPages}</span>
                            <button
                              className="outline-button"
                              type="submit"
                              disabled={listingLoading}
                            >
                              Keç
                            </button>
                          </form>
                        </nav>
                      )}
                    </>
                  ) : storeId && !c.storeStats[storeId]?.count ? (
                    <Empty
                      icon={StoreIcon}
                      title="Bu mağazanın qiymətləri hələ qoşulmayıb"
                      text="Mağaza açıq kataloq və ya rəsmi məhsul feed-i təqdim etdikdə məhsullar burada görünəcək. Hələlik qiyməti mağazanın öz saytında yoxla."
                      action={
                        <a className="dark-button" href={"/magazalar"}>
                          Qoşulmuş mağazalara bax
                        </a>
                      }
                    />
                  ) : listingLoading ? (
                    <p className="catalog-range" role="status">
                      Məhsullar yüklənir…
                    </p>
                  ) : filtersActive ? (
                    <Empty
                      icon={SlidersHorizontal}
                      title="Bu filtrlərə uyğun məhsul yoxdur"
                      text="Qiymət aralığını genişləndir, brend və ya mağaza seçimini sıfırla."
                      action={
                        <button className="dark-button" onClick={reset}>
                          Filtrləri sıfırla
                        </button>
                      }
                    />
                  ) : (
                    <Empty
                      icon={Search}
                      title={
                        searchTerm
                          ? `“${searchTerm}” üzrə məhsul tapılmadı`
                          : "Uyğun məhsul tapılmadı"
                      }
                      text="Yazılışı yoxla, daha qısa söz və ya yalnız model adını yaz. Məsələn: “iPhone 16”, “Galaxy S25”."
                      action={
                        <div className="empty-suggestions">
                          <a className="dark-button" href={"/kataloq"}>
                            Bütün məhsullara bax
                          </a>
                          <div className="empty-chips" aria-label="Populyar kateqoriyalar">
                            {categories.slice(0, 5).map((cat) => (
                              <a key={cat.id} href={"/kateqoriya/" + cat.id}>
                                {cat.name}
                              </a>
                            ))}
                          </div>
                        </div>
                      }
                    />
                  )}
                </div>
              </div>
            </>
          )}
          {page === "mehsul" &&
            (selected && selected.active ? (
              <ProductDetail
                p={selected}
                c={c}
                city={city}
                alert={alert}
                favorite={favorite}
                compare={compare}
                comp={comp}
                nav={nav}
                setToast={setToast}
                needUser={needUser}
                openModal={setModal}
                extras={initialExtras?.productId === selected.id ? initialExtras : undefined}
              />
            ) : (
              <Empty
                title="Məhsul tapılmadı"
                text="Bu məhsul kataloqda mövcud deyil."
                action={
                  <a className="dark-button" href={"/kataloq"}>
                    Kataloqa qayıt
                  </a>
                }
              />
            ))}
          {page === "magazalar" && !storeId && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">YERLİ MAĞAZALAR</span>
                  <h1>
                    Tanıdığın mağazalar.
                    <br />
                    Daha aydın seçim.
                  </h1>
                  <p>
                    {c.stores.filter((s) => s.active).length} yerli mağaza · Loqo və rəsmi domen ·
                    Ada görə sıralama
                  </p>
                </div>
                <a className="dark-button" href={"/magaza-qeydiyyat"}>
                  Mağazanı əlavə et <Plus size={18} />
                </a>
              </div>
              <div className="merchant-search">
                <Search size={19} />
                <input
                  aria-label="Mağaza axtar"
                  placeholder="Mağaza adı və ya domen axtar…"
                  value={merchantQuery}
                  onChange={(e) => setMerchantQuery(e.target.value)}
                />
                <span>{c.stores.filter((s) => s.active).length} mağaza</span>
              </div>
              {[
                ["shops", "Mağazalar", c.stores.filter((s) => s.kind !== "marketplace")],
                ["marketplaces", "Elan saytları", c.stores.filter((s) => s.kind === "marketplace")],
              ].map(([key, label, list]) => {
                const shown = (list as Store[])
                  .filter(
                    (s) =>
                      s.active &&
                      (s.name + " " + s.domain)
                        .toLocaleLowerCase("az")
                        .includes(merchantQuery.toLocaleLowerCase("az")),
                  )
                  // Connected prices first; premium stores lead within each group (never in prices).
                  .sort(
                    (a, b) =>
                      Number(!!c.storeStats[b.id]?.count) - Number(!!c.storeStats[a.id]?.count) ||
                      Number(isPremium(b)) - Number(isPremium(a)) ||
                      a.name.localeCompare(b.name, "az"),
                  );
                if (!shown.length) return null;
                return (
                  <section key={key as string} className="store-group" aria-label={label as string}>
                    {key === "marketplaces" && (
                      <h2 className="store-group-title">{label as string}</h2>
                    )}
                    <div className="store-grid">
                      {shown.map((s) => (
                        <article
                          key={s.id}
                          className={"store-card" + (isPremium(s) ? " is-premium" : "")}
                        >
                          <div className="store-wordmark" style={{ color: s.color }}>
                            <StoreLogo store={s} />
                            {isPremium(s) && <PremiumBadge />}
                          </div>
                          <p>{s.description}</p>
                          <span
                            className={"badge " + (c.storeStats[s.id]?.count ? "neutral" : "red")}
                          >
                            {c.storeStats[s.id]?.count
                              ? azNumber(c.storeStats[s.id].count) + " məhsul"
                              : "Qiymətlər hələ qoşulmayıb"}
                          </span>
                          <StoreContactSummary store={s} />
                          <p className="micro muted">
                            {s.domain} ·{" "}
                            {s.sourceStatus === "marketplace_shop"
                              ? "Tap.az mağaza nişanı"
                              : s.sourceStatus === "public_catalog"
                                ? "Açıq mağaza kataloqu"
                                : c.storeStats[s.id]?.real
                                  ? s.id === "technomania"
                                    ? "Rəsmi feed"
                                    : "Mənbə yoxlanıb"
                                  : "Qiymət bağlantısı gözlənilir"}
                          </p>
                          <a className="card-button" href={"/magazalar/" + s.id}>
                            Mağaza səhifəsi <ArrowUpRight size={17} />
                          </a>
                        </article>
                      ))}
                    </div>
                  </section>
                );
              })}
            </>
          )}
          {page === "muqayise" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">YAN-YANA BAX</span>
                  <h1>Məhsulları müqayisə et</h1>
                  <p>Maksimum 4 məhsulun xüsusiyyətlərini müqayisə et.</p>
                </div>
                <a className="outline-button" href={"/kataloq"}>
                  Məhsul əlavə et <Plus size={17} />
                </a>
              </div>
              {comp.length ? (
                <div className="compare-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Xüsusiyyət</th>
                        {comp.map((id) => {
                          const p = c.products.find((p) => p.id === id);
                          return (
                            <th key={id}>
                              {p && (
                                <>
                                  <button
                                    className="remove-compare icon-button"
                                    onClick={() => compare(p)}
                                    aria-label="Müqayisədən sil"
                                  >
                                    <X size={17} />
                                  </button>
                                  <ProductImage src={p.image} alt="" />
                                  <a className="product-title" href={"/mehsul/" + p.id}>
                                    {p.name}
                                  </a>
                                  <p>{p.variant}</p>
                                </>
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Ən aşağı yekun</td>
                        {comp.map((id) => (
                          <td key={id}>
                            <strong className="price-text">{money(priceOf(c, id))}</strong>
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td>Mağaza sayı</td>
                        {comp.map((id) => (
                          <td key={id}>{validOffers(c, id).length}</td>
                        ))}
                      </tr>
                      {Array.from(
                        new Set(
                          comp.flatMap((id) =>
                            Object.keys(c.products.find((p) => p.id === id)?.specs || {}),
                          ),
                        ),
                      ).map((key) => (
                        <tr key={key}>
                          <td>{key}</td>
                          {comp.map((id) => (
                            <td key={id}>
                              {c.products.find((p) => p.id === id)?.specs[key] || "—"}
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr>
                        <td>Məlumat</td>
                        {comp.map((id) => (
                          <td key={id}>
                            {validOffers(c, id).every((o) => o.demo)
                              ? "Nümunə qiymətlər"
                              : "Mənbəni yoxlayın"}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  icon={Scale}
                  title="Müqayisə siyahın boşdur"
                  text="Məhsul kartındakı müqayisə düyməsi ilə ilk məhsulu əlavə et."
                  action={
                    <a className="dark-button" href={"/kataloq"}>
                      Məhsullara bax
                    </a>
                  }
                />
              )}
            </>
          )}
          {page === "bildirisler" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">QIYMƏTİ İZLƏ</span>
                  <h1>Qiymət bildirişlərin</h1>
                  <p>
                    Hədəfinə çatan qiymətləri bu səhifədə gör. E-poçt və push göndərişi qoşulmayıb.
                  </p>
                </div>
              </div>
              {personal.alerts.length ? (
                <div className="alert-list">
                  {personal.alerts.map((a) => {
                    const p = c.products.find((p) => p.id === a.productId);
                    if (!p) return null;
                    const reached =
                      validOffers(c, p.id, city).length > 0 && priceOf(c, p.id) <= a.target;
                    return (
                      <article className="alert-row" key={p.id}>
                        <ProductImage src={p.image} alt="" />
                        <div>
                          <a className="product-title" href={"/mehsul/" + p.id}>
                            {p.name}
                          </a>
                          <p>
                            Hədəf: <b>{money(a.target)}</b> · Hazırda: {money(priceOf(c, p.id))}
                          </p>
                          <span className={"badge " + (reached ? "green" : "neutral")}>
                            {reached
                              ? "Hədəf qiymətə çatıb"
                              : !validOffers(c, p.id, city).length
                                ? "Stok gözlənilir"
                                : "Qiymət gözlənilir"}
                            {validOffers(c, p.id).every((o) => o.demo) ? " · Nümunə" : ""}
                          </span>
                        </div>
                        <button className="outline-button" onClick={() => alert(p)}>
                          Dəyiş
                        </button>
                        <button
                          className="icon-button"
                          aria-label="Bildirişi sil"
                          onClick={() =>
                            act(async () => {
                              await api("personal", {
                                kind: "alert",
                                productId: p.id,
                                remove: true,
                              });
                              await refresh();
                            }, "Bildiriş silindi.")
                          }
                        >
                          <Trash2 size={19} />
                        </button>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <Empty
                  icon={Bell}
                  title="İlk qiymətini izləməyə başla"
                  text="Məhsul səhifəsində istədiyin qiyməti yaz, hədəfə çatanda burada gör."
                  action={
                    <a className="dark-button" href={"/kataloq"}>
                      Məhsul seç <ArrowRight size={18} />
                    </a>
                  }
                />
              )}
            </>
          )}
          {page === "magaza-qeydiyyat" && (
            <MerchantPage c={c} session={session} act={act} needUser={needUser} />
          )}
          {page === "rehber" && <Guide />}
          {page === "admin" && (
            <Admin
              c={c}
              session={session}
              refresh={refresh}
              toast={setToast}
              act={act}
              needUser={needUser}
            />
          )}
          {![
            "home",
            "kataloq",
            "kateqoriya",
            "axtaris",
            "endirimler",
            "secilmisler",
            "magazalar",
            "mehsul",
            "muqayise",
            "bildirisler",
            "magaza-qeydiyyat",
            "rehber",
            "admin",
          ].includes(page) && (
            <Empty
              title="Səhifə tapılmadı"
              text="Axtardığın səhifə mövcud deyil."
              action={
                <a className="dark-button" href={"/"}>
                  Ana səhifə
                </a>
              }
            />
          )}
        </main>
        <footer>
          <div className="shell footer-main">
            <div>
              <a className="logo" href={"/"}>
                <img className="brand-mark" src="/favicon.svg" alt="" width={38} height={38} />
                qəpik<span className="logo-dot">.</span>
              </a>
              <p>
                {c.settings.headline}
                <br />
                Qənaət sənin seçiminlə başlayır.
              </p>
              <span className="footer-made">Azərbaycan üçün, diqqətlə hazırlanıb.</span>
            </div>
            <div>
              <h4>Kəşf et</h4>
              <a href={"/kataloq"}>Bütün məhsullar</a>
              <a href={"/endirimler"}>Qiyməti düşənlər</a>
              <a href={"/magazalar"}>Mağazalar</a>
            </div>
            <div>
              <h4>Qəpik haqqında</h4>
              <button onClick={() => setModal({ type: "info", topic: "Haqqımızda" })}>
                Necə işləyir?
              </button>
              <a href={"/rehber"}>Alış-veriş bələdçisi</a>
              <button onClick={() => setModal({ type: "info", topic: "Sıralama qaydası" })}>
                Sıralama qaydası
              </button>
            </div>
            <div>
              <h4>Mağazalar üçün</h4>
              <a href={"/magaza-qeydiyyat"}>Mağazanı əlavə et</a>
              <a href={"/admin"}>
                İdarəetmə paneli <ArrowUpRight size={13} />
              </a>
              <button onClick={() => setModal({ type: "info", topic: "Məxfilik" })}>
                Məxfilik və məlumatlar
              </button>
            </div>
          </div>
          <div className="shell footer-bottom">
            <span>© {new Date().getFullYear()} Qəpik. Hər qəpiyin dəyəri var.</span>
            <span className="footer-brand">
              Nova Media məhsuludur · <b>Nova Group Azərbaycan</b>
            </span>
            <span>Qəpik məhsul satmır. Alış seçilən mağazada tamamlanır.</span>
          </div>
        </footer>
        {comp.length > 0 && page !== "muqayise" && page !== "admin" && (
          <div className="compare-tray">
            <span>
              <Scale size={17} /> {comp.length} məhsul seçilib
            </span>
            <a href={"/muqayise"}>
              Müqayisə et <ArrowRight size={16} />
            </a>
            <button
              className="icon-button"
              aria-label="Müqayisəni təmizlə"
              onClick={() => {
                setComp([]);
                localStorage.removeItem("qepik-compare");
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <nav className="mobile-nav" aria-label="Əsas bölmələr">
          <a
            className={page === "home" ? "current" : ""}
            aria-current={page === "home" ? "page" : undefined}
            href={"/"}
          >
            <Compass size={21} />
            Kəşf et
          </a>
          <a
            className={isCatalog ? "current" : ""}
            aria-current={isCatalog ? "page" : undefined}
            href={"/kataloq"}
          >
            <LayoutGrid size={21} />
            Kataloq
          </a>
          <a
            className={page === "muqayise" ? "current" : ""}
            aria-current={page === "muqayise" ? "page" : undefined}
            href={"/muqayise"}
          >
            <Scale size={21} />
            Müqayisə
          </a>
          <a
            className={page === "secilmisler" ? "current" : ""}
            aria-current={page === "secilmisler" ? "page" : undefined}
            href={"/secilmisler"}
          >
            <Heart size={21} />
            Seçilmişlər
          </a>
          <a
            className={page === "bildirisler" ? "current" : ""}
            aria-current={page === "bildirisler" ? "page" : undefined}
            href={"/bildirisler"}
          >
            <Bell size={21} />
            Bildirişlər
          </a>
        </nav>
        {toast && (
          <div className="toast" role="status">
            <Info size={18} />
            {toast}
            <button className="icon-button" aria-label="Bağla" onClick={() => setToast("")}>
              <X size={15} />
            </button>
          </div>
        )}
        {modal && (
          <Modal
            title={
              modal.type === "alert"
                ? "İstədiyin qiyməti seç"
                : modal.type === "city"
                  ? "Çatdırılma şəhərin"
                  : modal.type === "login"
                    ? "Qəpik hesabın"
                    : modal.topic
            }
            onClose={() => setModal(null)}
          >
            {modal.type === "login" && (
              <div className="login-content">
                <div className="login-icon">
                  <UserRound size={32} />
                </div>
                <h3>{session.user ? session.user.name : "Qənaətini yadda saxla."}</h3>
                <p>
                  {session.user
                    ? "Seçilmişlərin və qiymət bildirişlərin hesabında saxlanılır."
                    : "Seçilmiş məhsullarını saxla və öz qiymət bildirişlərini qur."}
                </p>
                {session.user ? (
                  <>
                    <a className="dark-button" href={"/bildirisler"}>
                      Bildirişlərim <ArrowRight size={17} />
                    </a>
                    <a className="text-link" href="/signout-with-chatgpt?return_to=/" target="_top">
                      Hesabdan çıx
                    </a>
                  </>
                ) : (
                  <a
                    className="dark-button"
                    href={"/signin-with-chatgpt?return_to=" + encodeURIComponent(path)}
                    target="_top"
                  >
                    ChatGPT ilə daxil ol <ArrowUpRight size={17} />
                  </a>
                )}
              </div>
            )}
            {modal.type === "city" && (
              <div className="city-list">
                {["Bakı", "Sumqayıt", "Gəncə", "Mingəçevir", "Şəki", "Lənkəran", "Naxçıvan"].map(
                  (v) => (
                    <button
                      key={v}
                      onClick={() => {
                        setPageOffset(0);
                        setCity(v);
                        localStorage.setItem("qepik-city", v);
                        setModal(null);
                      }}
                    >
                      <MapPin size={18} />
                      {v}
                      {city === v && <Check size={18} />}
                    </button>
                  ),
                )}
                <p className="muted micro">
                  Yalnız təklifdə çatdırılma şəhəri göstərilən mağazalar uyğun sayılır.
                </p>
              </div>
            )}
            {modal.type === "alert" && (
              <form
                className="form-stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const target = Number(new FormData(e.currentTarget).get("target"));
                  if (
                    await act(async () => {
                      await api("personal", { kind: "alert", productId: modal.p.id, target });
                      await refresh();
                    }, "Qiymət bildirişi saxlanıldı.")
                  )
                    setModal(null);
                }}
              >
                <div className="alert-product">
                  <ProductImage src={modal.p.image} alt="" />
                  <div>
                    <h3>{modal.p.name}</h3>
                    <span>Hazırda {money(priceOf(c, modal.p.id))}</span>
                  </div>
                </div>
                <label>
                  Hədəf qiymətin, ₼
                  <input
                    name="target"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    defaultValue={
                      personal.alerts.find((a) => a.productId === modal.p.id)?.target ||
                      Math.round(priceOf(c, modal.p.id) * 0.9)
                    }
                  />
                </label>
                <p className="form-help">
                  Bildiriş hesabında saxlanılır. Nəticəni “Bildirişlər” bölməsindən yoxla. E-poçt və
                  mobil push göndərişi hələ aktiv deyil.
                </p>
                <button className="dark-button" disabled={busy}>
                  <Bell size={17} />
                  {busy ? "Saxlanılır…" : "Bildirişi yadda saxla"}
                </button>
              </form>
            )}
            {modal.type === "info" && <InfoContent topic={modal.topic} />}
          </Modal>
        )}
      </div>
    </AdsProvider>
  );
}
function ProductDetail({
  p,
  c,
  city,
  alert,
  favorite,
  compare,
  comp,
  nav,
  setToast,
  needUser,
  openModal,
  extras,
}: {
  p: Product;
  c: Catalog;
  city: string;
  alert: (p: Product) => void;
  favorite: (p: Product) => void;
  compare: (p: Product) => void;
  comp: string[];
  nav: (to: string) => void;
  setToast: (message: string) => void;
  needUser: () => boolean;
  openModal: (modal: ModalState) => void;
  extras?: ProductExtras;
}) {
  const [views, setViews] = useState(extras?.views ?? 0);
  // One counted view per product per browser session; the server stores only daily totals.
  useEffect(() => {
    const key = "qepik-viewed:" + p.id;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}
    api<{ views?: number }>("view", { productId: p.id })
      .then((r) => typeof r?.views === "number" && setViews(r.views))
      .catch(() => {});
  }, [p.id]);
  const [tab, setTab] = useState("offers"),
    [sort, setSort] = useState("total"),
    [period, setPeriod] = useState(30),
    [free, setFree] = useState(false),
    [real, setReal] = useState(false),
    [stockOnly, setStockOnly] = useState(false),
    [term, setTerm] = useState(12),
    [sending, setSending] = useState(false),
    [now] = useState(() => Date.now());
  const storeOf = (o: Offer) => c.stores.find((s) => s.id === o.storeId);
  const allRecorded = bestRecordedOffersFor(c, p.id, city);
  // Classified ads (tap.az shop ads, lalafo) are listed apart and never count as the best offer.
  const classified = allRecorded.filter((o) => isClassified(o, storeOf(o)));
  const recordedOffers = allRecorded.filter((o) => !isClassified(o, storeOf(o)));
  const availableOffers = validOffers(c, p.id, city).filter((o) => !isClassified(o, storeOf(o)));
  let offers = [...recordedOffers];
  if (stockOnly) offers = offers.filter((o) => o.stock && o.stockKnown !== false);
  if (free) offers = offers.filter((o) => o.shipping === 0 && o.shippingKnown !== false);
  if (real) offers = offers.filter((o) => !o.demo);
  offers = [...offers].sort(
    (a, b) =>
      Number(b.stock && b.stockKnown !== false) - Number(a.stock && a.stockKnown !== false) ||
      (sort === "installment"
        ? (a.installmentOptions?.find((o) => o.months === term)?.total ||
            (a.months === term ? a.installmentTotal : 0) ||
            Infinity) -
          (b.installmentOptions?.find((o) => o.months === term)?.total ||
            (b.months === term ? b.installmentTotal : 0) ||
            Infinity)
        : a.price - b.price),
  );
  const low = availableOffers[0] || recordedOffers[0],
    allHistory = c.history
      .filter((h) => h.productId === p.id)
      .sort((a, b) => a.date.localeCompare(b.date));
  // With no history the period filter has nothing to cut, so the anchor value is irrelevant.
  const last = allHistory.length ? Date.parse(allHistory[allHistory.length - 1].date) : 0;
  const history = allHistory.filter((h) => Date.parse(h.date) >= last - period * 86400000);
  const min = history.length ? Math.min(...history.map((h) => h.price)) : 0,
    max = history.length ? Math.max(...history.map((h) => h.price)) : 0;
  const points = history
    .map(
      (h, i) =>
        `${30 + (i / Math.max(history.length - 1, 1)) * 740},${160 - ((h.price - min) / Math.max(max - min, 1)) * 120}`,
    )
    .join(" ");
  const reviews = c.reviews.filter((r) => r.productId === p.id);
  const go = (e: MouseEvent, o: Offer) => {
    if (o.demo) {
      e.preventDefault();
      openModal({ type: "info", topic: "Nümunə təklif" });
      return;
    }
    void api("click", { offerId: o.id }).catch(() => {});
  };
  return (
    <>
      <nav className="breadcrumb" aria-label="Səhifə yolu">
        <a href={"/"}>Ana səhifə</a>
        <ChevronRight size={13} aria-hidden="true" />
        <a href={"/kateqoriya/" + p.category}>
          {categories.find((x) => x.id === p.category)?.name}
        </a>
        <ChevronRight size={13} aria-hidden="true" />
        <span aria-current="page">{p.name}</span>
      </nav>
      <div className="detail-top">
        <div className="detail-picture">
          <span className="badge neutral">{p.brand}</span>
          <ProductImage src={p.image} alt={p.name} width={320} height={320} fetchPriority="high" />
          <span className="micro muted">
            {recordedOffers.length > 0 && recordedOffers.every((o) => o.demo)
              ? "Nümunə kataloq görsəli"
              : p.image === "/favicon.svg"
                ? "Şəkil mənbədə yoxdur"
                : "Məhsulun mağaza görsəli"}
          </span>
        </div>
        <div className="detail-overview">
          <span className="eyebrow">
            {p.brand} / {categories.find((x) => x.id === p.category)?.name}
          </span>
          <h1>{p.name}</h1>
          <p className="detail-variant">{p.variant}</p>
          {p.distinction && (
            <p className="product-code" title="Eyni adlı başqa məhsuldan fərqi">
              {p.distinction}
            </p>
          )}
          {p.familyId && (
            <label className="variant-selector">
              Rəng / variant seç
              <select
                aria-label="Məhsul variantı"
                value={p.id}
                onChange={(e) => nav("/mehsul/" + e.target.value)}
              >
                {c.products
                  .filter((other) => other.active && other.familyId === p.familyId)
                  .map((other) => (
                    <option key={other.id} value={other.id}>
                      {other.variant}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <div className="spec-chips">
            {Object.entries(p.specs)
              .slice(0, 3)
              .map(([k, v]) => (
                <span key={k}>
                  {k}: <b>{v}</b>
                </span>
              ))}
          </div>
          {(() => {
            const store = low ? storeOf(low) : undefined;
            const credit = low ? lowestMonthly(low) : undefined;
            return (
              <section
                className={"best-offer" + (availableOffers.length ? " is-live" : "")}
                aria-label="Ən sərfəli təklif"
              >
                <div className="best-offer-head">
                  <span>
                    {!low
                      ? "Qiymət mağazada dəqiqləşdirilir"
                      : availableOffers.length
                        ? "Ən sərfəli təklif"
                        : low.stockKnown === false
                          ? "Mənbədəki qiymət · stok məlum deyil"
                          : "Son bildirilən qiymət"}
                  </span>
                  {store && <StoreLogo store={store} />}
                </div>
                <strong className={availableOffers.length ? "price-current" : undefined}>
                  {low ? money(low.price) : "Qiymət soruş"}
                </strong>
                {credit && low && (
                  <p className="best-offer-credit">
                    Kreditlə: <b>{money(credit.monthly)}</b> × {credit.months} ay
                    {interestFree(credit, low.price) && (
                      <span className="badge green">0% faiz</span>
                    )}
                    {credit.provider && <small> · {credit.provider}</small>}
                  </p>
                )}
                <p className="best-offer-meta">
                  {availableOffers.length} mağazada stokda · {recordedOffers.length} qiymət mənbəyi
                  {classified.length > 0 && " · " + classified.length + " elan"}
                  {views > 0 && " · " + azNumber(views) + " dəfə baxılıb"}
                </p>
                {low && !low.demo && (
                  <a
                    className="dark-button best-offer-go"
                    href={low.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => go(e, low)}
                  >
                    {store ? locative(store.name) + " al" : "Mağazaya keç"}
                    <ArrowUpRight size={18} />
                  </a>
                )}
              </section>
            );
          })()}
          <div className="detail-actions">
            <button className="dark-button" onClick={() => alert(p)}>
              <Bell size={18} />
              Qiymət bildirişi qur
            </button>
            <button
              className={"outline-button " + (comp.includes(p.id) ? "active" : "")}
              onClick={() => compare(p)}
            >
              <Scale size={18} />
              Müqayisə
            </button>
            <button
              className="icon-button outlined"
              aria-label="Seçilmişlərə əlavə et"
              onClick={() => favorite(p)}
            >
              <Heart size={20} />
            </button>
          </div>
          {!offers.length && p.sourceUrl && (
            <a
              className="outline-button source-product-link"
              href={p.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Məhsula mağazada bax <ArrowUpRight size={16} />
            </a>
          )}
          <div className="data-notice">
            <Info size={17} />
            <span>
              Variant: <b>{p.variant}</b>.{" "}
              {recordedOffers.length > 0 && recordedOffers.every((o) => o.demo)
                ? "Nümunə qiymətlər real mağaza təklifi deyil."
                : "Mənbənin son yoxlanma vaxtı təklifdə göstərilir."}{" "}
              Taksit və zəmanəti mağazada yoxla.
            </span>
          </div>
        </div>
      </div>
      <AdSlot slot="product-side" format="banner" className="detail-ad" />
      <div className="detail-tabs" role="tablist" aria-label="Məhsul məlumatı">
        {[
          ["offers", "Mağaza təklifləri", offers.length],
          ["history", "Qiymət tarixçəsi", ""],
          ["specs", "Xüsusiyyətlər", ""],
          ["reviews", "Rəylər", reviews.length],
        ].map((v) => (
          <button
            className={tab === v[0] ? "active" : ""}
            key={v[0]}
            role="tab"
            id={"tab-" + v[0]}
            aria-selected={tab === v[0]}
            aria-controls={"panel-" + v[0]}
            tabIndex={tab === v[0] ? 0 : -1}
            onClick={() => setTab(v[0] as string)}
            onKeyDown={(e) => {
              const ids = ["offers", "history", "specs", "reviews"];
              const i = ids.indexOf(v[0] as string);
              const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (!step) return;
              e.preventDefault();
              const next = ids[(i + step + ids.length) % ids.length];
              setTab(next);
              document.getElementById("tab-" + next)?.focus();
            }}
          >
            {v[1]}
            {v[2] !== "" && <span>{v[2]}</span>}
          </button>
        ))}
      </div>
      {tab === "offers" && (
        <div role="tabpanel" id="panel-offers" aria-labelledby="tab-offers">
          <div className="offer-toolbar">
            <div>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={stockOnly}
                  onChange={(e) => setStockOnly(e.target.checked)}
                />
                Yalnız stokda
              </label>
              <label className="check-label">
                <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} />
                Pulsuz çatdırılma
              </label>
              <label className="check-label">
                <input type="checkbox" checked={real} onChange={(e) => setReal(e.target.checked)} />
                Yalnız real qiymətlər
              </label>
            </div>
            <select
              aria-label="Taksit müddəti"
              value={term}
              onChange={(e) => setTerm(Number(e.target.value))}
            >
              <option value="6">6 ay taksit</option>
              <option value="12">12 ay taksit</option>
              <option value="18">18 ay taksit</option>
            </select>
            <select
              aria-label="Təklifləri sırala"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="total">Ən aşağı nağd qiymət</option>
              <option value="installment">Taksit yekununa görə</option>
            </select>
          </div>
          <p className="micro muted">
            Sıralama nağd qiymətə əsaslanır. Çatdırılma və taksit yekunu ayrıca göstərilir. Reklam
            etiketi sıranı dəyişmir.
          </p>
          <div className="offer-list">
            {offers.length ? (
              offers.map((o) => {
                // recordedOffers only keeps offers whose store is known and active.
                const s = c.stores.find((s) => s.id === o.storeId)!;
                return (
                  <article
                    className={
                      "offer-row " +
                      (o.id === availableOffers[0]?.id ? "best" : "") +
                      (o.stockKnown === false
                        ? " stock-unknown"
                        : o.stock
                          ? ""
                          : " unavailable stock-out")
                    }
                    key={o.id}
                  >
                    <div className="offer-store">
                      <strong style={{ color: s.color }}>
                        <StoreLogo store={s} />
                      </strong>
                      <span
                        className={
                          "badge " +
                          (o.demo || now - Date.parse(o.checkedAt) > 86400000 ? "neutral" : "green")
                        }
                      >
                        {o.demo
                          ? "Nümunə təklif"
                          : now - Date.parse(o.checkedAt) > 86400000
                            ? "Yoxlanma köhnədir"
                            : "Mənbədən yoxlanıb"}
                      </span>
                      {o.id === availableOffers[0]?.id && (
                        <span className="badge green">Ən yaxşı qiymət</span>
                      )}
                      {o.sponsored && <span className="badge yellow">Reklam</span>}
                    </div>
                    <div className="offer-terms">
                      <b>{p.variant}</b>
                      <span
                        className={
                          o.stockKnown === false
                            ? "stock-unknown"
                            : o.stock
                              ? "stock-in"
                              : "stock-out"
                        }
                      >
                        {o.stockKnown === false ? (
                          <HelpCircle size={13} aria-hidden="true" />
                        ) : o.stock ? (
                          <CheckCircle2 size={13} aria-hidden="true" />
                        ) : (
                          <XCircle size={13} aria-hidden="true" />
                        )}
                        {o.stockKnown === false
                          ? "Stok satıcıda yoxlanmalıdır"
                          : o.stock
                            ? "Stokda var"
                            : "Stokda yoxdur"}
                      </span>
                      {o.warranty && (
                        <span>
                          <ShieldCheck size={13} aria-hidden="true" />
                          Zəmanət: {o.warranty}
                        </span>
                      )}
                      <span>
                        <Clock size={13} aria-hidden="true" />
                        Yoxlanıb: <time dateTime={o.checkedAt}>{azDateTime(o.checkedAt)}</time>
                      </span>
                      <span>
                        Çatdırılma:{" "}
                        {o.shippingKnown === false
                          ? "Dəqiqləşdirilməlidir"
                          : o.shipping
                            ? money(o.shipping)
                            : "Pulsuz"}
                      </span>
                    </div>
                    <div className="offer-installment">
                      {creditOptions(o).length ? (
                        <>
                          <span className="offer-credit-title">Kredit şərtləri</span>
                          <ul className="credit-list">
                            {creditOptions(o).map((x) => (
                              <li
                                key={x.months + ":" + (x.provider || "") + ":" + x.total}
                                className={x.months === term ? "is-term" : undefined}
                              >
                                <b>{x.months} ay</b> × {money(x.monthly)}
                                <small>
                                  {" "}
                                  · yekun {money(x.total)}
                                  {x.downPayment ? " · ilkin " + money(x.downPayment) : ""}
                                  {x.provider ? " · " + x.provider : ""}
                                  {interestFree(x, o.price) ? " · 0% faiz" : ""}
                                </small>
                              </li>
                            ))}
                          </ul>
                          <small>Mağazanın saytındakı şərtlər</small>
                        </>
                      ) : (
                        <span>Kredit məlumatı yoxdur</span>
                      )}
                    </div>
                    <div className="offer-price">
                      <small>Nağd qiymət</small>
                      <strong>{money(o.price)}</strong>
                      <span>
                        {o.shippingKnown === false
                          ? "Çatdırılmanı dəqiqləşdir"
                          : "Çatdırılma ilə: " + money(o.price + o.shipping)}
                      </span>
                    </div>
                    <a
                      className={o.id === availableOffers[0]?.id ? "dark-button" : "outline-button"}
                      href={o.demo ? undefined : o.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => go(e, o)}
                    >
                      {o.demo ? "Nümunəyə bax" : "Mağazaya keç"}
                      <ArrowUpRight size={16} />
                    </a>
                  </article>
                );
              })
            ) : (
              <Empty
                icon={StoreIcon}
                title="Uyğun təklif yoxdur"
                text="Şəhəri və ya təklif filtrlərini dəyiş."
              />
            )}
          </div>
          {classified.length > 0 && (
            <section className="classified-offers" aria-labelledby="classified-title">
              <h3 id="classified-title">Elan saytlarında</h3>
              <p className="micro muted">
                Mağaza nişanlı elanlar. Vəziyyəti (yeni / işlənmiş) elanda yoxla; bu qiymətlər ən
                sərfəli təklif sayılmır.
              </p>
              {classified.map((o) => {
                const s = storeOf(o);
                const name = s?.name || o.storeId;
                return (
                  <article className="classified-row" key={o.id}>
                    <div>
                      {s ? <StoreLogo store={s} /> : <b>{name}</b>}
                      {o.condition === "used" && <span className="badge neutral">İkinci əl</span>}
                    </div>
                    <strong>
                      {o.priceRange && o.priceRange.max > o.priceRange.min
                        ? locative(name) +
                          " " +
                          money(o.priceRange.min) +
                          " – " +
                          money(o.priceRange.max)
                        : money(o.price)}
                    </strong>
                    <small>
                      {o.priceRange ? o.priceRange.count + " elan" : "1 elan"} · yoxlanıb{" "}
                      <time dateTime={o.checkedAt}>{azDate(o.checkedAt)}</time>
                    </small>
                    <a
                      className="outline-button"
                      href={o.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => go(e, o)}
                    >
                      Elana bax <ArrowUpRight size={16} />
                    </a>
                  </article>
                );
              })}
            </section>
          )}
        </div>
      )}
      {tab === "history" && (
        <section
          className="history-panel"
          role="tabpanel"
          id="panel-history"
          aria-labelledby="tab-history"
        >
          <div className="section-heading">
            <div>
              <h2>Qiymətin hekayəsi</h2>
              <p className="muted">
                Yalnız toplanmış qeydlər göstərilir.{" "}
                {history.every((h) => h.demo) ? "Bu qrafik nümunə tarixçədir." : ""}
              </p>
            </div>
            <div className="segmented">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  className={period === d ? "active" : ""}
                  aria-pressed={period === d}
                  onClick={() => setPeriod(d)}
                >
                  {d} gün
                </button>
              ))}
            </div>
          </div>
          {history.length ? (
            <>
              <div className="history-stats">
                <div>
                  <span>Ən aşağı</span>
                  <strong>{money(min)}</strong>
                </div>
                <div>
                  <span>Ən yüksək</span>
                  <strong>{money(max)}</strong>
                </div>
                <div>
                  <span>Orta qiymət</span>
                  <strong>
                    {money(history.reduce((s: number, h) => s + h.price, 0) / history.length)}
                  </strong>
                </div>
              </div>
              {history.length < 2 ? (
                <p className="history-note muted">
                  Hələlik bu dövr üçün yalnız bir qiymət qeydi var ({azDate(history[0].date)}).
                  Qrafik ikinci qeyddən sonra görünəcək.
                </p>
              ) : (
                <svg
                  viewBox="0 0 800 200"
                  className="price-chart"
                  role="img"
                  aria-label="Qiymət tarixçəsi qrafiki"
                >
                  <path
                    d="M30 40H770 M30 100H770 M30 160H770"
                    className="chart-grid"
                    strokeDasharray="4 5"
                  />
                  <text x="30" y="32" className="chart-label">
                    {money(max)}
                  </text>
                  {max > min && (
                    <text x="30" y="176" className="chart-label">
                      {money(min)}
                    </text>
                  )}
                  <text x="30" y="196" className="chart-label">
                    {azDate(history[0].date)}
                  </text>
                  {history.length > 1 && (
                    <text x="770" y="196" className="chart-label" textAnchor="end">
                      {azDate(history[history.length - 1].date)}
                    </text>
                  )}
                  <polyline points={points} fill="none" className="chart-line" strokeWidth="3" />
                  {history.map((h, i) => (
                    <circle
                      key={h.id}
                      cx={30 + (i / Math.max(history.length - 1, 1)) * 740}
                      cy={160 - ((h.price - min) / Math.max(max - min, 1)) * 120}
                      r="4"
                      className="chart-dot"
                    >
                      <title>
                        {azDate(h.date)}: {money(h.price)}
                      </title>
                    </circle>
                  ))}
                </svg>
              )}
              <details>
                <summary>Bütün qiymət qeydləri</summary>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Tarix</th>
                      <th>Qiymət</th>
                      <th>Mənbə tipi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id}>
                        <td>{azDate(h.date)}</td>
                        <td>{money(h.price)}</td>
                        <td>{h.demo ? "Nümunə" : "Real təklif"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          ) : (
            <Empty
              title="Tarixçə hələ toplanmayıb"
              text="Real qiymətlər idxal edildikcə qeydlər burada görünəcək."
            />
          )}
        </section>
      )}
      {tab === "specs" && (
        <section
          className="specs-panel"
          role="tabpanel"
          id="panel-specs"
          aria-labelledby="tab-specs"
        >
          <h2>Məhsul haqqında</h2>
          <p>{p.description}</p>
          <table className="data-table">
            <tbody>
              {Object.entries(p.specs).map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {tab === "reviews" && (
        <section
          className="reviews-panel"
          role="tabpanel"
          id="panel-reviews"
          aria-labelledby="tab-reviews"
        >
          <div className="section-heading">
            <div>
              <h2>İstifadəçi rəyləri</h2>
              <p className="muted">Rəylər yoxlanıldıqdan sonra yayımlanır.</p>
            </div>
          </div>
          {reviews.map((r) => (
            <article className="review" key={r.id}>
              <strong>{r.name}</strong>
              <span>
                {"★".repeat(r.rating)}
                {"☆".repeat(5 - r.rating)}
              </span>
              <p>{r.text}</p>
            </article>
          ))}
          {!reviews.length && <p className="muted">Hələ rəy yoxdur. İlk təcrübəni paylaş.</p>}
          <form
            className="form-stack review-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!needUser()) return;
              const fd = new FormData(e.currentTarget);
              const form = e.currentTarget;
              setSending(true);
              try {
                await api("reviews", {
                  productId: p.id,
                  rating: Number(fd.get("rating")),
                  text: String(fd.get("text")),
                });
                setToast("Rəyin yoxlanışa göndərildi.");
                form.reset();
              } catch (e) {
                setToast(errorMessage(e));
              }
              setSending(false);
            }}
          >
            <label>
              Qiymətləndirmən
              <select name="rating">
                <option value="5">5 — Əla</option>
                <option value="4">4 — Yaxşı</option>
                <option value="3">3 — Orta</option>
                <option value="2">2 — Zəif</option>
                <option value="1">1 — Pis</option>
              </select>
            </label>
            <label>
              Təcrübən
              <textarea
                name="text"
                minLength={10}
                maxLength={2000}
                required
                placeholder="Məhsul haqqında təcrübəni paylaş…"
              />
            </label>
            <button className="dark-button" disabled={sending}>
              Rəyi göndər <Send size={16} />
            </button>
          </form>
        </section>
      )}
      <ProductQuestions
        productId={p.id}
        productName={p.name}
        initial={extras?.questions}
        needUser={needUser}
        setToast={setToast}
      />
    </>
  );
}
function InfoContent({ topic }: { topic: string }) {
  const content: Record<string, ReactNode> = {
    Haqqımızda: (
      <>
        <p>
          Qəpik Azərbaycan mağazalarındakı eyni məhsulun qiymətlərini müqayisə etmək üçün
          hazırlanıb. Qəpik məhsul satmır; alış seçdiyin mağazada tamamlanır.
        </p>
        <p>
          Platformanın ilk kataloqu nümunə məlumatlarla təqdim edilir. Mağazaların adının
          göstərilməsi rəsmi tərəfdaşlıq demək deyil.
        </p>
      </>
    ),
    "Məlumatın mənbəyi": (
      <>
        <p>
          “Nümunə” işarəli qiymətlər, çatdırılma, zəmanət və taksit rəqəmləri funksiyaları sınamaq
          üçündür. Cari mağaza qiyməti kimi qəbul edilməməlidir.
        </p>
        <p>
          Real təklif adminin daxil etdiyi mənbə linki və yoxlanma vaxtı ilə göstərilir. Məhsul
          variantı, stok, qiymət və zəmanət satınalma anında mağazada təsdiqlənməlidir.
        </p>
      </>
    ),
    "Nümunə təklif": (
      <>
        <p>
          Bu, mağazanın canlı təklifi deyil. Qiymət, taksit və zəmanət şərtləri nümayiş məqsədilə
          əlavə edilib.
        </p>
        <p>
          Real mənbə qiymətləri admin panelindən məhsul linki oxuma və ya manual idxalla əlavə
          olunur. Nümunə təklif alış linki kimi açılmır.
        </p>
      </>
    ),
    "Sıralama qaydası": (
      <>
        <p>
          Standart sıralama stokda olan eyni variant üzrə nağd qiymət + çatdırılma cəminə əsaslanır.
          Şəhər filtri mağazanın göstərilən çatdırılma ərazisinə tətbiq edilir.
        </p>
        <p>
          Taksit sıralaması aylıq ödənişə deyil, taksit üzrə tam yekuna əsaslanır. Reklam etiketi
          qiymət sırasını dəyişmir. Mağazalar səhifəsində ad üzrə sıralama var.
        </p>
      </>
    ),
    Məxfilik: (
      <>
        <p>
          Hesaba giriş ChatGPT vasitəsilə həyata keçirilir. Seçilmişlər və qiymət bildirişləri hesab
          identifikatoruna bağlı məlumat bazasında saxlanılır.
        </p>
        <p>
          Yalnız öz seçilmişlərini və bildirişlərini oxuya və silə bilərsən. Mağaza müraciətləri və
          rəylər admin yoxlanışı üçün saxlanılır. Müqayisə siyahısı və şəhər seçimi bu brauzerdə
          saxlanılır.
        </p>
        <p>
          Üçüncü tərəf məhsul şəkilləri onların domenindən yüklənə bilər. Qəpikdə ödəniş kartı
          məlumatları toplanmır. E-poçt və push göndərişi hazırda aktiv deyil.
        </p>
      </>
    ),
  };
  return <div className="info-content">{content[topic] || content["Haqqımızda"]}</div>;
}
function Guide() {
  return (
    <>
      <div className="guide-hero">
        <span className="eyebrow">QƏPİK BƏLƏDÇİSİ</span>
        <h1>
          Yaxşı alış-veriş
          <br />
          <em>yaxşı sualdan başlayır.</em>
        </h1>
        <p>Qiymət etiketindən kənara baxmağın kiçik bələdçisi.</p>
      </div>
      <div className="guide-grid">
        {[
          [
            "01",
            "Eyni məhsuldurmu?",
            "Model nömrəsi, yaddaş, rəng və region kodunu müqayisə et. Eyni adın arxasında fərqli variantlar ola bilər.",
          ],
          [
            "02",
            "Son qiymət nə qədərdir?",
            "Nağd qiymətə çatdırılmanı əlavə et. Kupon və ya xüsusi kart şərti varsa, şərtsiz qiymətlə qarışdırma.",
          ],
          [
            "03",
            "Aylıq ödəniş, yoxsa yekun?",
            "Aylıq məbləği ay sayına vur və komissiyaları əlavə et. Yuvarlaqlaşdırılmış aylıq rəqəm mağazanın yekunu ilə fərqlənə bilər.",
          ],
          [
            "04",
            "Endirim həqiqidirmi?",
            "Üstündən xətt çəkilmiş qiymətlə kifayətlənmə. Mövcud tarixçəyə bax; məlumat toplanmayıbsa, real endirim nəticəsi çıxarma.",
          ],
          [
            "05",
            "Zəmanət kimdəndir?",
            "İstehsalçı, distribütor və ya mağaza zəmanətini dəqiqləşdir. Müddəti və servis ünvanını mağazadan yazılı öyrən.",
          ],
          [
            "06",
            "Mənbə nə vaxt yoxlanılıb?",
            "Qiymət və stok dəyişir. Son yoxlanma vaxtına bax və ödəniş etmədən əvvəl mağazadakı yekunu yenidən təsdiqlə.",
          ],
        ].map((v) => (
          <article key={v[0]}>
            <span>{v[0]}</span>
            <h2>{v[1]}</h2>
            <p>{v[2]}</p>
          </article>
        ))}
      </div>
      <div className="guide-cta">
        <h2>İndi daha aydın seçim et.</h2>
        <a className="dark-button" href={"/kataloq"}>
          Məhsulları kəşf et <ArrowUpRight size={19} />
        </a>
      </div>
    </>
  );
}
