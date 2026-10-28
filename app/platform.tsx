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
  ArrowDownUp,
  LayoutGrid,
  TrendingDown,
  Wallet,
  Store as StoreIcon,
  UserRound,
  Plus,
  Trash2,
  CheckCircle2,
  Info,
  Clock,
  Send,
  Scale,
  Compass,
} from "lucide-react";
import {
  categories,
  seedCatalog,
  recordedOffersFor,
  validOffers,
  priceOf,
  money,
  type Product,
  type Catalog,
  type Offer,
} from "../lib/catalog";
import {
  DEFAULT_CITY,
  HERO_PRODUCT,
  MAX_LIMIT,
  PAGE_SIZE,
  type CatalogSlice,
} from "../lib/catalog-query";
import { api, errorMessage, Modal, Empty, CategoryIcon, StoreLogo } from "./ui";
import type { Act, Personal, Session } from "./types";
import Admin from "./admin";
import Home from "./home";
type ModalState =
  | { type: "login" }
  | { type: "city" }
  | { type: "alert"; p: Product }
  | { type: "info"; topic: string }
  | null;
export default function Platform({
  initialPath = "/",
  initialCatalog,
}: {
  initialPath?: string;
  initialCatalog?: CatalogSlice;
}) {
  const [c, setC] = useState<CatalogSlice>(
      () =>
        initialCatalog || {
          ...seedCatalog,
          matched: [],
          matchedTotal: 0,
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
    [comp, setComp] = useState<string[]>([]),
    [toast, setToast] = useState(""),
    [modal, setModal] = useState<ModalState>(null),
    [busy, setBusy] = useState(false),
    [menu, setMenu] = useState(false),
    [mobileFilters, setMobileFilters] = useState(false),
    [merchantQuery, setMerchantQuery] = useState(""),
    [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [filter, setFilter] = useState({
    brand: "",
    store: "",
    min: "",
    max: "",
    sort: "popular",
    real: false,
  });
  const nav = (to: string) => {
    setVisibleLimit(PAGE_SIZE);
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
  const heroProduct = c.products.find((p) => p.id === HERO_PRODUCT) || c.products[0];
  const currentCategory = page === "kateqoriya" ? parts[1] : "";
  const isCatalog = ["kataloq", "kateqoriya", "axtaris", "endirimler", "secilmisler"].includes(
    page,
  );
  const storeId = page === "magazalar" ? parts[1] : "";
  // Filtering and sorting run on the server; this only says which slice the page needs.
  const sliceQuery = useMemo(() => {
    const q = new URLSearchParams({ path, city, limit: String(visibleLimit) });
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
  }, [path, city, visibleLimit, filter, comp, personal, page]);
  // The server already rendered the first slice; fetch only once something differs from it.
  const renderedQuery = useRef(sliceQuery);
  useEffect(() => {
    if (version === 0 && sliceQuery === renderedQuery.current) return;
    let cancelled = false;
    // Debounced so typing a price range does not send a request per keystroke.
    const timer = setTimeout(() => {
      api<CatalogSlice>("catalog?" + sliceQuery).then(
        (next) => {
          if (cancelled) return;
          renderedQuery.current = sliceQuery;
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
      recorded = recordedOffersFor(c, p.id, city),
      realRecords = recorded.filter((o) => !o.demo),
      offers = available.length
        ? available
        : (realRecords.length ? realRecords : recorded).sort((a, b) => a.price - b.price),
      low = offers[0],
      high = offers.length ? Math.max(...offers.map((o) => o.price + o.shipping)) : 0,
      save = low && available.length > 1 ? high - low.price - low.shipping : 0;
    return (
      <article className="product-card" key={p.id}>
        <div className="card-top">
          <span className={"badge " + (save ? "green" : "neutral")}>
            {p.marketplace ? (
              "Tap.az · Mağaza elanı"
            ) : !available.length && offers.length ? (
              low?.stockKnown === false ? (
                "Stok açıqlanmayıb"
              ) : (
                "Stokda yoxdur"
              )
            ) : save ? (
              <>
                <TrendingDown size={12} /> {money(save)} fərq
              </>
            ) : (
              "Qiymət müqayisəsi"
            )}
          </span>
          <button
            className={
              "icon-button favorite " +
              (personal.favorites.some((f) => f.productId === p.id) ? "chosen" : "")
            }
            aria-label={p.name + " seçilmişlərə əlavə et"}
            onClick={() => favorite(p)}
          >
            <Heart size={18} />
          </button>
        </div>
        <a className="product-image" href={"/mehsul/" + p.id}>
          <img
            src={p.image}
            alt={p.name}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.src = "/favicon.svg";
            }}
          />
        </a>
        <div className="product-copy">
          <span className="brand-label">{p.brand}</span>
          <a className="product-title" href={"/mehsul/" + p.id}>
            {p.name}
          </a>
          <p className="variant">{p.variant}</p>
          <div className="card-offer-count">
            <span className="tiny-dots">
              <i />
              <i />
              <i />
            </span>
            {offers.length ? offers.length + " mağazada" : "Qiymət mənbədə açıqlanmır"}
          </div>
          <div className="card-price">
            <div>
              <span className="muted micro">
                {!offers.length
                  ? "Qiymət açıqlanmayıb"
                  : p.marketplace
                    ? "Elandakı qiymət"
                    : !available.length && offers.length
                      ? "Son bildirilən qiymət"
                      : offers.length && offers.every((o) => o.demo)
                        ? "Nümunə qiymət"
                        : low?.shippingKnown === false
                          ? "Ən aşağı nağd"
                          : "Ən aşağı yekun"}
              </span>
              <strong>{low ? money(low.price + low.shipping) : "Qiymət soruş"}</strong>
            </div>
            <button
              className={"compare-icon " + (comp.includes(p.id) ? "active" : "")}
              aria-label={p.name + " müqayisəyə əlavə et"}
              onClick={() => compare(p)}
            >
              <ArrowDownUp size={17} />
            </button>
          </div>
          <a className="card-button" href={"/mehsul/" + p.id}>
            Qiymətlərə bax <ArrowUpRight size={16} />
          </a>
        </div>
      </article>
    );
  };
  const cards = (list: Product[]) => <div className="product-grid">{list.map(productCard)}</div>;
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
    <div>
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
            <span className="locale">
              AZ <ChevronDown size={11} />
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
              placeholder="Nə axtarırsan? Qiymətini müqayisə et."
              aria-label="Məhsul axtar"
            />
            <button type="submit">
              Axtar <ArrowRight size={16} />
            </button>
          </form>
          <div className="header-actions">
            <a aria-label="Müqayisə" href={"/muqayise"}>
              <span className="action-icon">
                <ArrowDownUp size={22} />
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
          >
            <Menu size={19} /> Bütün kateqoriyalar <ChevronDown size={13} />
          </button>
          <a href={"/endirimler"}>
            <TrendingDown size={17} /> Qiyməti düşənlər
          </a>
          <a href={"/kataloq"}>Populyar məhsullar</a>
          <a href={"/magazalar"}>Mağazalar</a>
          <a href={"/rehber"}>Alış-veriş bələdçisi</a>
          <button className="location" onClick={() => setModal({ type: "city" })}>
            <MapPin size={15} />
            {city}
            <ChevronDown size={12} />
          </button>
        </div>
        {menu && (
          <div className="shell mega-menu">
            {categories.map((cat) => (
              <a key={cat.id} href={"/kateqoriya/" + cat.id}>
                <CategoryIcon name={cat.icon} />
                <span>{cat.name}</span>
                <ChevronRight size={16} />
              </a>
            ))}
          </div>
        )}
      </nav>
      {error && (
        <div className="shell error-banner">
          <Info size={18} />
          <span>Məlumat yüklənmədi: {error}. Hazırda nümunə kataloq göstərilir.</span>
          <button onClick={refresh}>Yenidən yoxla</button>
        </div>
      )}
      <main className="shell main-content">
        {page === "home" && (
          <Home
            catalog={c}
            cards={cards}
            onAlert={alert}
            onInfo={(topic) => setModal({ type: "info", topic })}
          />
        )}
        {(isCatalog || storeId) && (
          <>
            <div className="breadcrumb">
              <a href={"/"}>Ana səhifə</a>
              <ChevronRight size={13} />
              <span>{storeId ? "Mağaza təklifləri" : title}</span>
            </div>
            <div className="page-heading">
              <div>
                <span className="eyebrow">QIYMƏTİ BİL, AĞILLI SEÇ</span>
                <h1>{storeId ? c.stores.find((s) => s.id === storeId)?.name : title}</h1>
                <p>
                  {c.matchedTotal} məhsul · {city} üçün müqayisə
                </p>
              </div>
              <select
                aria-label="Sıralama"
                value={filter.sort}
                onChange={(e) => setFilter({ ...filter, sort: e.target.value })}
              >
                <option value="popular">Seçilmiş sıralama</option>
                <option value="low">Ən ucuzdan bahaya</option>
                <option value="high">Ən bahadan ucuza</option>
                <option value="saving">Ən böyük qiymət fərqi</option>
                <option value="name">Ada görə</option>
              </select>
            </div>
            <div className="mobile-filterbar">
              <button className="outline-button" onClick={() => setMobileFilters(!mobileFilters)}>
                <SlidersHorizontal size={17} />
                Filtrlər{" "}
                {(filter.brand || filter.store || filter.min || filter.max || filter.real) && (
                  <span className="live-dot" />
                )}
                <ChevronDown size={15} />
              </button>
              <span>{c.matchedTotal} nəticə</span>
            </div>
            <div className="catalog-layout">
              {Filter()}
              <div>
                <div className="data-notice">
                  <Info size={15} />
                  <span>
                    Rəsmi mənbə qiymətləri göstərilir. Stokda olmayan məhsullar da kataloqda qalır;
                    son qiyməti mağazada təsdiqləyin.
                  </span>
                </div>
                {products.length ? (
                  <>
                    {cards(products)}
                    {c.matchedTotal > products.length && products.length < MAX_LIMIT && (
                      <div className="load-more">
                        <button
                          className="outline-button"
                          disabled={visibleLimit > products.length}
                          onClick={() => setVisibleLimit(visibleLimit + PAGE_SIZE)}
                        >
                          {visibleLimit > products.length
                            ? "Yüklənir…"
                            : `Daha çox göstər · ${c.matchedTotal - products.length} məhsul qalıb`}{" "}
                          <Plus size={16} />
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <Empty
                    icon={Search}
                    title="Uyğun məhsul tapılmadı"
                    text="Axtarış sözünü və ya filtrləri dəyişərək yenidən yoxla."
                    action={
                      <a className="dark-button" href={"/kataloq"}>
                        Bütün məhsullara bax
                      </a>
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
                  {c.stores.filter((s) => s.active).length} yerli mağaza · Loqo və rəsmi domen · Ada
                  görə sıralama
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
            <div className="store-grid">
              {c.stores
                .filter(
                  (s) =>
                    s.active &&
                    (s.name + " " + s.domain)
                      .toLocaleLowerCase("az")
                      .includes(merchantQuery.toLocaleLowerCase("az")),
                )
                .sort((a, b) => a.name.localeCompare(b.name, "az"))
                .map((s) => (
                  <article key={s.id} className="store-card">
                    <div className="store-wordmark" style={{ color: s.color }}>
                      <StoreLogo store={s} />
                    </div>
                    <p>{s.description}</p>
                    <span className="badge neutral">{c.storeStats[s.id]?.count || 0} məhsul</span>
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
                      Təklifləri göstər <ArrowUpRight size={17} />
                    </a>
                  </article>
                ))}
            </div>
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
                                <img src={p.image} alt="" />
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
                          <td key={id}>{c.products.find((p) => p.id === id)?.specs[key] || "—"}</td>
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
                      <img src={p.image} alt="" />
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
                            await api("personal", { kind: "alert", productId: p.id, remove: true });
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
        {page === "magaza-qeydiyyat" && <MerchantForm act={act} needUser={needUser} />}
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
          <span>© 2026 Qəpik. Hər qəpiyin dəyəri var.</span>
          <span>Qəpik məhsul satmır. Alış seçilən mağazada tamamlanır.</span>
        </div>
      </footer>
      {comp.length > 0 && page !== "muqayise" && page !== "admin" && (
        <div className="compare-tray">
          <span>
            <ArrowDownUp size={17} /> {comp.length} məhsul seçilib
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
      <div className="mobile-nav">
        <a className={page === "home" ? "current" : ""} href={"/"}>
          <Compass size={21} />
          Kəşf et
        </a>
        <a className={isCatalog ? "current" : ""} href={"/kataloq"}>
          <LayoutGrid size={21} />
          Kataloq
        </a>
        <a className={page === "muqayise" ? "current" : ""} href={"/muqayise"}>
          <Scale size={21} />
          Müqayisə
        </a>
        <a className={page === "secilmisler" ? "current" : ""} href={"/secilmisler"}>
          <Heart size={21} />
          Seçilmişlər
        </a>
        <a className={page === "bildirisler" ? "current" : ""} href={"/bildirisler"}>
          <Bell size={21} />
          Bildirişlər
        </a>
      </div>
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
                <img src={modal.p.image} alt="" />
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
}) {
  const [tab, setTab] = useState("offers"),
    [sort, setSort] = useState("total"),
    [period, setPeriod] = useState(30),
    [free, setFree] = useState(false),
    [real, setReal] = useState(false),
    [stockOnly, setStockOnly] = useState(false),
    [term, setTerm] = useState(12),
    [sending, setSending] = useState(false),
    [now] = useState(() => Date.now());
  const recordedOffers: Offer[] = c.offers.filter(
    (o: Offer) =>
      o.productId === p.id &&
      o.cities.includes(city) &&
      c.stores.some((s) => s.id === o.storeId && s.active),
  );
  let offers: Offer[] = recordedOffers.some((o) => !o.demo)
    ? recordedOffers.filter((o) => !o.demo)
    : recordedOffers;
  if (stockOnly) offers = offers.filter((o) => o.stock);
  if (free) offers = offers.filter((o) => o.shipping === 0 && o.shippingKnown !== false);
  if (real) offers = offers.filter((o) => !o.demo);
  offers = [...offers].sort(
    (a, b) =>
      Number(b.stock) - Number(a.stock) ||
      (sort === "installment"
        ? (a.installmentOptions?.find((o) => o.months === term)?.total ||
            (a.months === term ? a.installmentTotal : 0) ||
            Infinity) -
          (b.installmentOptions?.find((o) => o.months === term)?.total ||
            (b.months === term ? b.installmentTotal : 0) ||
            Infinity)
        : a.price + a.shipping - (b.price + b.shipping)),
  );
  const low = offers[0],
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
      <div className="breadcrumb">
        <a href={"/"}>Ana səhifə</a>
        <ChevronRight size={13} />
        <a href={"/kateqoriya/" + p.category}>
          {categories.find((x) => x.id === p.category)?.name}
        </a>
        <ChevronRight size={13} />
        <span>{p.name}</span>
      </div>
      <div className="detail-top">
        <div className="detail-picture">
          <span className="badge neutral">{p.brand}</span>
          <img src={p.image} alt={p.name} />
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
          {p.familyId && (
            <label className="variant-selector">
              Rəng / variant seç
              <select
                aria-label="Məhsul variantı"
                value={p.id}
                onChange={(e) => nav("/mehsul/" + e.target.value)}
              >
                {c.products
                  .filter((other) => other.familyId === p.familyId)
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
          <div className="detail-price">
            <span>
              {!low
                ? "Qiymət mağazada dəqiqləşdirilir"
                : low?.stockKnown === false
                  ? "Mənbədəki qiymət · stok mağazada yoxlanmalıdır"
                  : low && !low.stock
                    ? "Son bildirilən qiymət"
                    : low?.shippingKnown === false
                      ? "Ən aşağı nağd qiymət · çatdırılmanı yoxla"
                      : "Çatdırılma daxil ən aşağı qiymət"}
            </span>
            <strong>{low ? money(low.price + low.shipping) : "Qiymət soruş"}</strong>
            <small>
              {offers.length} mağaza təklifi · {city}
              {low?.stockKnown === false
                ? " · Stok açıqlanmayıb"
                : low && !low.stock
                  ? " · Hazırda stokda yoxdur"
                  : ""}
            </small>
          </div>
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
      <div className="detail-tabs">
        {[
          ["offers", "Mağaza təklifləri", offers.length],
          ["history", "Qiymət tarixçəsi", ""],
          ["specs", "Xüsusiyyətlər", ""],
          ["reviews", "Rəylər", reviews.length],
        ].map((v) => (
          <button
            className={tab === v[0] ? "active" : ""}
            key={v[0]}
            onClick={() => setTab(v[0] as string)}
          >
            {v[1]}
            {v[2] !== "" && <span>{v[2]}</span>}
          </button>
        ))}
      </div>
      {tab === "offers" && (
        <>
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
              <option value="total">Ən aşağı məlum qiymət</option>
              <option value="installment">Taksit yekununa görə</option>
            </select>
          </div>
          <p className="micro muted">
            Sıralama məlum qiymətə əsaslanır. Çatdırılma məlum deyilsə nağd qiymət göstərilir.
            Reklam etiketi sıranı dəyişmir.
          </p>
          <div className="offer-list">
            {offers.length ? (
              offers.map((o, i) => {
                // recordedOffers only keeps offers whose store is known and active.
                const s = c.stores.find((s) => s.id === o.storeId)!;
                const finance = o.installmentOptions?.find((x) => x.months === term);
                const months = finance?.months || (o.months === term ? o.months : 0);
                const total = finance?.total || (months ? o.installmentTotal : 0);
                return (
                  <article
                    className={
                      "offer-row " +
                      (i === 0 && o.stock ? "best" : "") +
                      (o.stock ? "" : " unavailable")
                    }
                    key={o.id}
                  >
                    <div className="offer-store">
                      <strong style={{ color: s.color }}>
                        <StoreLogo store={s} />
                      </strong>
                      <span className={"badge " + (o.demo ? "neutral" : "green")}>
                        {o.demo
                          ? "Nümunə təklif"
                          : now - Date.parse(o.checkedAt) > 86400000
                            ? "Yoxlanma köhnədir"
                            : "Mənbədən yoxlanıb"}
                      </span>
                      {o.sponsored && <span className="badge yellow">Reklam</span>}
                    </div>
                    <div className="offer-terms">
                      <b>{p.variant}</b>
                      <span>
                        <CheckCircle2 size={13} />
                        {o.warranty} ·{" "}
                        {o.stockKnown === false
                          ? "Stok satıcıda yoxlanmalıdır"
                          : o.stock
                            ? "Stokda"
                            : "Stokda yoxdur"}
                      </span>
                      <span>
                        <Clock size={13} />
                        {new Date(o.checkedAt).toLocaleString("az-AZ", { timeZone: "Asia/Baku" })}
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
                      {months > 0 ? (
                        <>
                          <strong>
                            {money(finance?.monthly || total / months)} <small>× {months} ay</small>
                          </strong>
                          <span>Taksit yekunu: {money(total)}</span>
                          <small>Mağaza şərtlərinə əsasən</small>
                        </>
                      ) : (
                        <span>Taksit məlumatı yoxdur</span>
                      )}
                    </div>
                    <div className="offer-price">
                      <small>
                        {o.shippingKnown === false
                          ? "Nağd qiymət"
                          : i === 0
                            ? "Ən aşağı yekun"
                            : "Çatdırılma daxil"}
                      </small>
                      <strong>{money(o.price + o.shipping)}</strong>
                      <span>Nağd: {money(o.price)}</span>
                    </div>
                    <a
                      className={i === 0 ? "dark-button" : "outline-button"}
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
        </>
      )}
      {tab === "history" && (
        <section className="history-panel">
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
              <svg
                viewBox="0 0 800 200"
                className="price-chart"
                role="img"
                aria-label="Qiymət tarixçəsi qrafiki"
              >
                <path
                  d="M30 40H770 M30 100H770 M30 160H770"
                  stroke="#e3e7de"
                  strokeDasharray="4 5"
                />
                <polyline points={points} fill="none" stroke="#398366" strokeWidth="3" />
                {history.map((h, i) => (
                  <circle
                    key={h.id}
                    cx={30 + (i / Math.max(history.length - 1, 1)) * 740}
                    cy={160 - ((h.price - min) / Math.max(max - min, 1)) * 120}
                    r="4"
                    fill="#398366"
                  >
                    <title>
                      {new Date(h.date).toLocaleDateString("az-AZ")}: {money(h.price)}
                    </title>
                  </circle>
                ))}
              </svg>
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
                        <td>{new Date(h.date).toLocaleDateString("az-AZ")}</td>
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
        <section className="specs-panel">
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
        <section className="reviews-panel">
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
    </>
  );
}
function MerchantForm({ act, needUser }: { act: Act; needUser: () => boolean }) {
  const [done, setDone] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <div className="merchant-layout">
      <div>
        <span className="eyebrow">BİRLİKDƏ BÖYÜYƏK</span>
        <h1>
          Mağazanı
          <br />
          daha çox insan
          <br />
          <em>kəşf etsin.</em>
        </h1>
        <p>
          Qiymətlərini aydın göstər.
          <br />
          Məhsul axtaran alıcılarla bir araya gəl.
        </p>
        <div className="merchant-benefits">
          {[
            "Eyni məhsul üzrə şəffaf müqayisə",
            "Mənbəyə birbaşa keçid",
            "Kataloq və qiymət idxalı",
          ].map((t) => (
            <p key={t}>
              <CheckCircle2 size={20} />
              {t}
            </p>
          ))}
        </div>
      </div>
      {done ? (
        <Empty
          icon={CheckCircle2}
          title="Müraciətin qəbul edildi"
          text="Məlumatlar admin panelində yoxlanış gözləyir. Təsdiq avtomatik tərəfdaşlıq yaratmır."
        />
      ) : (
        <form
          className="form-stack merchant-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!needUser()) return;
            setBusy(true);
            const f = new FormData(e.currentTarget);
            if (await act(() => api("applications", Object.fromEntries(f)))) setDone(true);
            setBusy(false);
          }}
        >
          <h2>Mağaza müraciəti</h2>
          <div className="form-two">
            <label>
              Şirkətin adı
              <input name="company" required minLength={2} />
            </label>
            <label>
              VÖEN
              <input
                name="voen"
                required
                pattern="[0-9]{10}"
                maxLength={10}
                placeholder="10 rəqəm"
              />
            </label>
          </div>
          <label>
            Mağazanın veb-saytı
            <input
              name="website"
              type="url"
              pattern="https://.*"
              placeholder="https://magazaniz.az"
              required
            />
          </label>
          <div className="form-two">
            <label>
              E-poçt
              <input name="email" type="email" required />
            </label>
            <label>
              Telefon
              <input name="phone" minLength={9} required placeholder="+994 …" />
            </label>
          </div>
          <label>
            Əlavə məlumat
            <textarea
              name="note"
              maxLength={2000}
              placeholder="Məhsul çeşidi, feed və ya əlaqə məlumatı…"
            />
          </label>
          <label className="check-label">
            <input type="checkbox" required />
            Müraciət məlumatlarımın yoxlanış üçün saxlanmasına razıyam.
          </label>
          <button className="dark-button" disabled={busy}>
            {busy ? "Göndərilir…" : "Müraciəti göndər"}
            <ArrowUpRight size={18} />
          </button>
        </form>
      )}
    </div>
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
