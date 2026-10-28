"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Link2,
  RefreshCw,
  Search,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import { categories, money, type Offer, type Product } from "../lib/catalog";
import { api, errorMessage, Modal } from "./ui";

type Candidate = {
  source: Product;
  target: Product;
  sourceSignature: string;
  targetSignature: string;
  evidence: string[];
  warnings: string[];
};
type Approved = {
  id: string;
  sourceId: string;
  targetId: string;
  sourceName: string;
  targetName: string;
  approvedAt: string;
  valid: boolean;
};
type MatchesResponse = {
  candidates: Candidate[];
  total: number;
  offset: number;
  approved: Approved[];
  offers: Offer[];
  stores: { id: string; name: string }[];
};
const PAGE_SIZE = 24;
const date = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Vaxt göstərilməyib"
    : parsed.toLocaleString("az-AZ", { timeZone: "Asia/Baku" });
};
const condition = (offer: Offer) =>
  offer.condition === "new"
    ? "Yeni"
    : offer.condition === "used"
      ? "İşlənmiş"
      : "Vəziyyət göstərilməyib";
const safeHref = (value?: string) => (value?.startsWith("https://") ? value : undefined);

export default function MatchPanel({
  onCatalogRefresh,
}: {
  onCatalogRefresh: () => Promise<unknown>;
}) {
  const [loaded, setLoaded] = useState<MatchesResponse | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loadedKey, setLoadedKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const listStart = useRef<HTMLDivElement>(null);
  const changePage = (value: number) => {
    setOffset(value);
    listStart.current?.scrollIntoView({ block: "start", behavior: "instant" });
  };
  const closeReview = useCallback(() => {
    if (busy) return;
    setSelected(null);
    setConfirmed(false);
    setError("");
  }, [busy]);
  // Loading is derived: the list for the current request is shown once that request settles.
  const requestKey = `${query}
${offset}
${revision}`;
  const loading = loadedKey !== requestKey;
  const data = loading ? null : loaded;
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ q: query, offset: String(offset) });
    api<MatchesResponse>("admin/matches?" + params)
      .then(
        (next) => {
          if (cancelled) return;
          if (next.total && offset >= next.total) {
            setOffset(Math.floor((next.total - 1) / PAGE_SIZE) * PAGE_SIZE);
            return;
          }
          if (!next.total && offset) setOffset(0);
          setLoaded(next);
          setError("");
        },
        (e) => !cancelled && setError(errorMessage(e)),
      )
      .finally(() => !cancelled && setLoadedKey(requestKey));
    return () => {
      cancelled = true;
    };
  }, [query, offset, revision, requestKey]);
  const offersFor = (p: Product) => [
    ...new Map(
      (data?.offers || [])
        .filter((offer) => offer.productId === p.id)
        .map((offer) => [offer.id, offer]),
    ).values(),
  ];
  const storeName = (id: string) => data?.stores.find((store) => store.id === id)?.name || id;
  const summary = (p: Product) => {
    const offers = offersFor(p);
    const available = offers.filter((offer) => offer.stock && offer.stockKnown !== false);
    const shown = available.length ? available : offers;
    const price = shown.length ? Math.min(...shown.map((offer) => offer.price)) : undefined;
    const stores = [...new Set(offers.map((offer) => storeName(offer.storeId)))];
    return (
      <p className="match-product-summary">
        <span>{stores.join(" · ") || storeName(p.sourceStoreId || "Mənbə")}</span>
        <strong>{price === undefined ? "Qiymət yoxdur" : money(price)}</strong>
        <small>{available.length ? "Mənbədə stokda" : "Son bildirilən qiymət"}</small>
      </p>
    );
  };
  const refreshList = () => {
    setSelected(null);
    setConfirmed(false);
    setRevision((value) => value + 1);
  };
  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setFeedback("");
    setOffset(0);
    setQuery(search.trim());
    refreshList();
  };
  const mutate = async (body: unknown, message: string) => {
    setBusy(true);
    setError("");
    setFeedback("");
    let saved = false;
    try {
      await api("admin/matches", body);
      saved = true;
      setFeedback(message);
      refreshList();
      await onCatalogRefresh();
    } catch (e) {
      setError((saved ? "Əməliyyat saxlanıldı, görünüş yenilənmədi: " : "") + errorMessage(e));
      setConfirmed(false);
    } finally {
      setBusy(false);
    }
  };
  const productDetails = (p: Product, label: string) => (
    <section className="match-detail-product" aria-label={label}>
      <div className="match-detail-heading">
        <span>{label}</span>
        <span>{p.id}</span>
      </div>
      <div className="match-detail-image">
        <img
          src={p.image}
          alt={p.name}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.hidden = true;
          }}
        />
      </div>
      <p className="match-brand">
        {p.brand} · {categories.find((category) => category.id === p.category)?.name || p.category}
      </p>
      <h3>{p.name}</h3>
      <p className="match-variant">{p.variant}</p>
      {summary(p)}
      <details className="match-specifications" open>
        <summary>Variant və xüsusiyyətlər</summary>
        {Object.keys(p.specs).length ? (
          <dl>
            {Object.entries(p.specs).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p>Mənbə əlavə xüsusiyyət bildirməyib.</p>
        )}
      </details>
      <div className="match-source-offers">
        <h4>Mağaza məlumatı</h4>
        {offersFor(p).map((offer) => (
          <div className="match-source-offer" key={offer.id}>
            <a href={safeHref(offer.url)} target="_blank" rel="noreferrer">
              {storeName(offer.storeId)} <ArrowUpRight size={15} />
            </a>
            <strong>
              {money(offer.price)} <small>nağd</small>
            </strong>
            <span>
              {condition(offer)} ·{" "}
              {offer.stockKnown === false
                ? "Stok məlum deyil"
                : offer.stock
                  ? "Stokda"
                  : "Stokda yoxdur"}
            </span>
            <small>Yoxlanıb: {date(offer.checkedAt)}</small>
            {offer.sourceSku && <small>Mağaza SKU: {offer.sourceSku}</small>}
          </div>
        ))}
        {!offersFor(p).length && <p>Qiymət təklifi göstərilməyib.</p>}
        {safeHref(p.sourceUrl) && (
          <a
            className="match-source-page"
            href={safeHref(p.sourceUrl)}
            target="_blank"
            rel="noreferrer"
          >
            Orijinal məhsul səhifəsi <ArrowUpRight size={15} />
          </a>
        )}
      </div>
    </section>
  );
  return (
    <div className="match-panel">
      <article className="admin-panel match-introduction">
        <span className="eyebrow">EYNİ VARİANT, YANAŞI QİYMƏTLƏR</span>
        <h2>Mağaza qeydlərini dəqiqliklə uyğunlaşdır</h2>
        <p>
          Eyni ad və ya məhsul kodu yalnız yoxlama namizədidir. Mənbə səhifələrində modeli, yaddaşı,
          rəngi və yeni/işlənmiş vəziyyətini tutuşdur; sonra əlaqəni təsdiqlə. Namizədlər avtomatik
          birləşdirilmir.
        </p>
        <div className="match-process">
          <span>
            <Search size={17} /> Namizədi tap
          </span>
          <ArrowRight size={16} />
          <span>
            <ShieldCheck size={17} /> Variantı yoxla
          </span>
          <ArrowRight size={16} />
          <span>
            <Link2 size={17} /> Təklifləri birləşdir
          </span>
        </div>
      </article>
      <div className="match-toolbar" ref={listStart}>
        <form onSubmit={submitSearch} role="search" aria-label="Uyğunlaşdırma namizədləri">
          <Search size={19} />
          <input
            aria-label="Namizəd məhsulu axtar"
            placeholder="Məhsul adı və ya brend"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={100}
            disabled={busy}
          />
          <button className="dark-button" type="submit" disabled={busy || loading}>
            Axtar
          </button>
        </form>
        <button className="outline-button" onClick={refreshList} disabled={busy || loading}>
          <RefreshCw size={16} className={loading ? "spin" : ""} /> Siyahını yenilə
        </button>
      </div>
      {!selected && error && (
        <p className="match-error" role="alert">
          {error}
        </p>
      )}
      <p className="match-feedback" role="status" aria-live="polite">
        {feedback ||
          (loading
            ? "Uyğunlaşdırma namizədləri yüklənir…"
            : `${data?.total || 0} yoxlama namizədi`)}
      </p>
      <section className="match-candidates" aria-label="Yoxlama namizədləri" aria-busy={loading}>
        {data?.candidates.map((candidate) => (
          <article
            className="match-candidate"
            key={candidate.source.id + ":" + candidate.target.id}
          >
            <div className="match-candidate-products">
              {[candidate.target, candidate.source].map((product, index) => (
                <div className="match-candidate-product" key={product.id}>
                  <span className="match-product-order">
                    {index ? "Əlavə mağaza qeydi" : "Əsas məhsul"}
                  </span>
                  <div className="match-candidate-image">
                    <img
                      src={product.image}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.hidden = true;
                      }}
                    />
                  </div>
                  <div>
                    <h3>{product.name}</h3>
                    <p className="match-variant">{product.variant}</p>
                    {summary(product)}
                  </div>
                </div>
              ))}
            </div>
            <div className="match-candidate-bottom">
              <div className="match-evidence">
                {candidate.evidence.map((item) => (
                  <span key={item}>
                    <Check size={14} />
                    {item}
                  </span>
                ))}
                {candidate.warnings.length > 0 && (
                  <small>{candidate.warnings.length} məqam ayrıca yoxlanmalıdır</small>
                )}
              </div>
              <button
                className="outline-button"
                disabled={busy || loading}
                onClick={() => {
                  setSelected(candidate);
                  setConfirmed(false);
                  setError("");
                }}
              >
                Mənbələri yoxla <ArrowRight size={16} />
              </button>
            </div>
          </article>
        ))}
        {!loading && !error && !data?.candidates.length && (
          <div className="match-empty">
            <ShieldCheck size={28} />
            <h3>Bu axtarışda namizəd tapılmadı</h3>
            <p>
              Adı qısalt və ya brend üzrə axtar. Avtomatik tanınan uyğunluq yoxdursa, məlumatı
              məhsul redaktorunda dəqiqləşdir.
            </p>
          </div>
        )}
      </section>
      {!!data?.total && data.total > PAGE_SIZE && (
        <nav className="match-pagination" aria-label="Uyğunlaşdırma namizədlərinin səhifələri">
          <button
            className="outline-button"
            disabled={busy || loading || offset === 0}
            onClick={() => changePage(Math.max(0, offset - PAGE_SIZE))}
          >
            Əvvəlki
          </button>
          <span>
            {offset + 1}–{Math.min(offset + PAGE_SIZE, data.total)} / {data.total}
          </span>
          <button
            className="outline-button"
            disabled={busy || loading || offset + PAGE_SIZE >= data.total}
            onClick={() => changePage(offset + PAGE_SIZE)}
          >
            Növbəti <ArrowRight size={16} />
          </button>
        </nav>
      )}
      <section className="admin-panel match-approved" aria-labelledby="match-approved-title">
        <div className="match-approved-heading">
          <div>
            <span className="eyebrow">GERİ ALINA BİLƏN ƏLAQƏLƏR</span>
            <h2 id="match-approved-title">Təsdiqlənmiş uyğunlaşdırmalar</h2>
          </div>
          <span>{data?.approved.length || 0}</span>
        </div>
        <p>
          Mənbə məhsulları silinmir. Məlumat dəyişərsə əlaqə tətbiq edilmir və yenidən yoxlama tələb
          olunur. Əlaqəni geri aldıqda məhsullar ayrı göstərilir.
        </p>
        {!data?.approved.length && !loading && !error && (
          <p className="match-approved-empty">Hələ təsdiqlənmiş uyğunlaşdırma yoxdur.</p>
        )}
        {data?.approved.map((match) => (
          <article
            className={"match-approved-row " + (!match.valid ? "needs-review" : "")}
            key={match.id}
          >
            <div>
              <strong>{match.sourceName}</strong>
              <span>
                <ArrowRight size={15} /> {match.targetName}
              </span>
              <small>{date(match.approvedAt)}</small>
              <small>
                {match.sourceId} → {match.targetId}
              </small>
              <b className="match-status">
                {match.valid ? "Əlaqə tətbiq edilir" : "Mənbə dəyişib — yenidən yoxla"}
              </b>
            </div>
            <button
              className="outline-button"
              disabled={busy || loading}
              onClick={() =>
                void mutate(
                  { action: "revoke", id: match.id },
                  "Uyğunlaşdırma geri alındı. Məhsullar ayrı göstərilir.",
                )
              }
            >
              <Undo2 size={16} /> Əlaqəni geri al
            </button>
          </article>
        ))}
      </section>
      {selected && (
        <Modal title="Eyni məhsul variantını təsdiqlə" wide onClose={closeReview}>
          <div className="match-review">
            <p className="match-review-intro">
              Təsdiqdən sonra əlavə mağazanın təklifləri əsas məhsulda müqayisəyə daxil olacaq.
              Orijinal link, qiymət və mənbə yoxlanma vaxtı saxlanır.
            </p>
            <div className="match-review-products">
              {productDetails(selected.target, "Əsas məhsul")}
              {productDetails(selected.source, "Əlavə mağaza qeydi")}
            </div>
            <div className="match-review-facts">
              <h3>Uyğunluq əlamətləri</h3>
              <ul>
                {selected.evidence.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {selected.warnings.length > 0 && (
                <>
                  <h3>Diqqətlə yoxlanmalı məqamlar</h3>
                  <ul className="match-warnings">
                    {selected.warnings.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (confirmed && !busy)
                  void mutate(
                    {
                      action: "approve",
                      sourceId: selected.source.id,
                      targetId: selected.target.id,
                      sourceSignature: selected.sourceSignature,
                      targetSignature: selected.targetSignature,
                      confirmed: true,
                    },
                    "Uyğunlaşdırma təsdiqləndi. Mağaza təklifləri bir məhsulda göstərilir.",
                  );
              }}
            >
              <label className="match-confirmation">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  required
                  disabled={busy}
                />
                <span>
                  Mənbə səhifələrini yoxladım: model, yaddaş/RAM, rəng və yeni/işlənmiş vəziyyəti
                  eynidir.
                </span>
              </label>
              {error && (
                <p role="alert" className="match-error">
                  {error}
                </p>
              )}
              <div className="match-review-actions">
                <button
                  type="button"
                  className="outline-button"
                  onClick={refreshList}
                  disabled={busy}
                >
                  Bağla və siyahını yenilə
                </button>
                <button className="dark-button" type="submit" disabled={!confirmed || busy}>
                  {busy ? (
                    <>
                      <RefreshCw size={17} className="spin" /> Saxlanılır…
                    </>
                  ) : (
                    <>
                      <Link2 size={17} /> Uyğunlaşdırmanı təsdiqlə
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </div>
  );
}
