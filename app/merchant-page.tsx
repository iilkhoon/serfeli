"use client";
// "Mağazanı əlavə et" page: why list on Qəpik, how sources connect, plan comparison, the store
// registration and premium/ads request forms, the merchant's own request status and an FAQ.
// Requests are applications reviewed by the owner; no payment is taken or confirmed here.
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCircle2,
  Clock3,
  FileCode2,
  Megaphone,
  Minus,
  MousePointerClick,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  Store as StoreIcon,
  Users,
  Workflow,
} from "lucide-react";
import { categories, type Catalog } from "../lib/catalog";
import {
  FEED_FORMATS,
  PERIODS,
  PRICE_ON_REQUEST,
  PROMOTION_KINDS,
  applicationStatusLabel,
  planPrice,
} from "../lib/plans";
import { api } from "./ui";
import type { Act, Session } from "./types";

type MyApplication = {
  id: string;
  type: string;
  title: string;
  promotion?: string;
  status: string;
  date: string;
  decidedAt?: string;
};

// Drops empty strings so optional fields are omitted rather than sent blank.
function clean<T extends Record<string, unknown>>(v: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(v).filter(([, x]) => x !== "" && x !== undefined && x !== null),
  ) as Partial<T>;
}
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const bareDomain = (v: string) =>
  v
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "");

const planRows: { label: string; free: ReactNode; premium: ReactNode; ads: ReactNode }[] = [
  {
    label: "Mağaza profili və loqo",
    free: true,
    premium: true,
    ads: "Mağaza profili tələb olunur",
  },
  { label: "Qiymətlərin feed / sitemap ilə idxalı", free: true, premium: true, ads: "—" },
  { label: "Məhsul müqayisəsində iştirak", free: true, premium: true, ads: "—" },
  { label: "Mağazaya birbaşa keçid", free: true, premium: true, ads: true },
  { label: "“Premium” nişanı", free: false, premium: true, ads: false },
  { label: "Mağazalar siyahısında yuxarıda", free: false, premium: true, ads: false },
  {
    label: "Ana səhifədə “Premium mağazalar” bloku",
    free: false,
    premium: true,
    ads: false,
  },
  { label: "Vurğulanmış əlaqə bloku", free: false, premium: true, ads: false },
  { label: "Analitika: baxış və keçidlər", free: false, premium: true, ads: "Kampaniya üzrə" },
  {
    label: "“Məhsulu önə çək” — ayrıca “Reklam” sırası",
    free: false,
    premium: false,
    ads: true,
  },
  { label: "Banner və lent arası reklam yerləri", free: false, premium: false, ads: true },
];

function Cell({ v }: { v: ReactNode }) {
  if (v === true)
    return (
      <span className="mp-yes">
        <Check size={17} aria-hidden="true" />
        <span className="sr-only">Var</span>
      </span>
    );
  if (v === false)
    return (
      <span className="mp-no">
        <Minus size={17} aria-hidden="true" />
        <span className="sr-only">Yoxdur</span>
      </span>
    );
  return <span className="mp-text">{v}</span>;
}

const faq: [string, string][] = [
  [
    "Qəpik-də yer almaq ödənişlidir?",
    "Xeyr. Mağaza profili və qiymətlərin feed və ya sitemap vasitəsilə göstərilməsi pulsuzdur. Premium və reklam yerləri isə əlavə xidmətdir; şərtləri müraciətdən sonra razılaşdırılır.",
  ],
  [
    "Premium və ya reklam qiymət sırasını dəyişir?",
    "Xeyr. Təkliflər həmişə qiymətə görə sıralanır və daha ucuz təkliflər gizlədilmir. Premium mağaza nişan və mağazalar siyahısında üstünlük alır; “Məhsulu önə çək” isə qiymət cədvəlindən ayrı, “Reklam” etiketli sırada göstərilir.",
  ],
  [
    "Hansı feed formatlarını qəbul edirsiniz?",
    "XML, YML (Yandex Market formatı) və CSV. Feed yoxdursa, məhsul səhifələriniz sitemap-da olmalı və səhifədə qiymət JSON-LD (schema.org Product/Offer) ilə göstərilməlidir.",
  ],
  [
    "Qiymətlər nə qədər tez yenilənir?",
    "Mənbə qoşulduqdan sonra qiymətlər mütəmadi yoxlanılır. Hər təklifin yanında son yoxlanma vaxtı göstərilir ki, alıcı məlumatın təzəliyini görsün.",
  ],
  [
    "Müraciətdən sonra nə baş verir?",
    "Komanda saytınızı və mənbənizi yoxlayır, lazım olsa sizinlə əlaqə saxlayır. Müraciətin vəziyyətini bu səhifədə, hesabınıza daxil olduqda görə bilərsiniz.",
  ],
  [
    "Ödənişi sayt üzərindən edə bilərəm?",
    "Xeyr. Saytda onlayn ödəniş qəbul edilmir. Premium və reklam şərtləri və hesab-faktura müraciətdən sonra birbaşa razılaşdırılır.",
  ],
];

export default function MerchantPage({
  c,
  session,
  act,
  needUser,
}: {
  c: Pick<Catalog, "stores" | "settings" | "totals">;
  session: Session;
  act: Act;
  needUser: () => boolean;
}) {
  const [tab, setTab] = useState<"store" | "promotion">("store"),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState<"store" | "promotion" | null>(null),
    [mine, setMine] = useState<MyApplication[] | null>(null),
    [reload, setReload] = useState(0);
  const plans = c.settings.plans || {};
  const userId = session.user?.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    api<{ applications: MyApplication[] }>("applications/mine").then(
      (r) => !cancelled && setMine(r.applications),
      () => !cancelled && setMine([]),
    );
    return () => {
      cancelled = true;
    };
  }, [userId, reload]);

  const submit = async (e: FormEvent<HTMLFormElement>, kind: "store" | "promotion") => {
    e.preventDefault();
    if (!needUser()) return;
    const form = e.currentTarget;
    const f = new FormData(form);
    const contactPerson = clean({
      name: str(f, "personName"),
      role: str(f, "personRole"),
      email: str(f, "personEmail"),
      phone: str(f, "personPhone"),
    });
    let body: Record<string, unknown>;
    if (kind === "store") {
      const phones = str(f, "phones")
        .split(/[,;]/)
        .map((p) => p.trim())
        .filter(Boolean)
        .slice(0, 6);
      body = clean({
        type: "store",
        storeName: str(f, "storeName"),
        domain: bareDomain(str(f, "domain")),
        kind: str(f, "kind") || "shop",
        categories: f.getAll("categories").map(String),
        feedFormat: str(f, "feedFormat"),
        feedUrl: str(f, "feedUrl"),
        voen: str(f, "voen"),
        note: str(f, "note"),
        contactPerson,
        contacts: clean({
          phones: phones.length ? phones : undefined,
          email: str(f, "email"),
          address: str(f, "address"),
          city: str(f, "city"),
          hours: str(f, "hours"),
          whatsapp: str(f, "whatsapp"),
          instagram: str(f, "instagram"),
          facebook: str(f, "facebook"),
          telegram: str(f, "telegram"),
        }),
      });
      if (!(body.categories as string[]).length) {
        await act(async () => {
          throw new Error("Ən azı bir kateqoriya seçin.");
        });
        return;
      }
    } else {
      const budget = Number(str(f, "budget"));
      body = clean({
        type: "promotion",
        promotion: str(f, "promotion"),
        storeName: str(f, "storeName"),
        storeId: str(f, "storeId"),
        target: str(f, "target"),
        period: str(f, "period"),
        budget: budget > 0 ? budget : undefined,
        note: str(f, "note"),
        contactPerson,
      });
    }
    setBusy(true);
    if (await act(() => api("applications", body))) {
      setSent(kind);
      form.reset();
      setReload((n) => n + 1);
    }
    setBusy(false);
  };

  const contactFields = (
    <fieldset className="mp-fieldset">
      <legend>Əlaqə şəxsi</legend>
      <div className="form-two">
        <label>
          Ad, soyad
          <input name="personName" required minLength={2} maxLength={100} autoComplete="name" />
        </label>
        <label>
          Vəzifə <span className="mp-optional">(istəyə bağlı)</span>
          <input name="personRole" maxLength={100} autoComplete="organization-title" />
        </label>
      </div>
      <div className="form-two">
        <label>
          E-poçt
          <input name="personEmail" type="email" required maxLength={150} autoComplete="email" />
        </label>
        <label>
          Telefon
          <input
            name="personPhone"
            type="tel"
            required
            pattern="[+0-9][0-9 ()\-]{8,24}"
            placeholder="+994 50 000 00 00"
            autoComplete="tel"
          />
        </label>
      </div>
    </fieldset>
  );

  return (
    <div className="mp">
      <section className="mp-hero">
        <div>
          <span className="eyebrow">MAĞAZALAR ÜÇÜN</span>
          <h1>Məhsullarınızı qiymət müqayisə edən alıcılara göstərin</h1>
          <p>
            Qəpik Azərbaycan mağazalarının qiymətlərini bir yerdə müqayisə edir. Alıcı sizin
            təklifinizi görür və alışı birbaşa sizin saytınızda tamamlayır.
          </p>
          <div className="mp-hero-actions">
            <a className="dark-button" href="#qeydiyyat" onClick={() => setTab("store")}>
              Pulsuz qoşulun <ArrowUpRight size={18} />
            </a>
            <a className="outline-button" href="#planlar">
              Planları müqayisə et
            </a>
          </div>
        </div>
        <dl className="mp-hero-stats">
          <div>
            <dt>Kataloqda məhsul</dt>
            <dd>{(c.totals?.products ?? 0).toLocaleString("az-AZ")}</dd>
          </div>
          <div>
            <dt>Qoşulmuş mağaza</dt>
            <dd>
              {(c.totals?.stores ?? c.stores.filter((s) => s.active).length).toLocaleString(
                "az-AZ",
              )}
            </dd>
          </div>
          <div>
            <dt>Mağaza profili</dt>
            <dd>Pulsuz</dd>
          </div>
        </dl>
      </section>

      <section className="mp-section" aria-labelledby="mp-why">
        <h2 id="mp-why">Niyə Qəpik?</h2>
        <div className="mp-cards">
          {(
            [
              [
                Search,
                "Alış niyyəti olan trafik",
                "Qəpik-ə gələn istifadəçi konkret məhsulu axtarır və almağa hazırdır.",
              ],
              [
                Scale,
                "Şəffaf müqayisə",
                "Qiymət, çatdırılma, taksit və stok bir cədvəldə göstərilir — rəqabətli təklifiniz görünür.",
              ],
              [
                MousePointerClick,
                "Birbaşa keçid",
                "Alıcı məhsul səhifənizə yönləndirilir; sifariş və ödəniş sizin saytda qalır.",
              ],
              [
                BarChart3,
                "Ölçülə bilən nəticə",
                "Premium mağazalar profil baxışlarını və mağazaya keçidləri izləyir.",
              ],
            ] as const
          ).map(([Icon, t, d]) => (
            <article className="mp-card" key={t}>
              <Icon size={22} aria-hidden="true" />
              <h3>{t}</h3>
              <p>{d}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mp-section" aria-labelledby="mp-how">
        <h2 id="mp-how">Necə işləyir</h2>
        <ol className="mp-steps">
          <li>
            <b>Müraciət edin</b>
            <span>Mağaza məlumatlarını və məhsul mənbəyinizi aşağıdakı formada göndərin.</span>
          </li>
          <li>
            <b>Mənbəni yoxlayırıq</b>
            <span>Feed və ya məhsul səhifələrinizin düzgün oxunduğunu yoxlayırıq.</span>
          </li>
          <li>
            <b>Kataloqda görünün</b>
            <span>Təkliflər uyğun məhsullara bağlanır və qiymət müqayisəsində göstərilir.</span>
          </li>
        </ol>
        <div className="mp-cards three">
          {(
            [
              [
                FileCode2,
                "Məhsul feed-i",
                "XML, YML və ya CSV faylı: ad, qiymət (AZN), stok, link, şəkil. Ən sürətli və dəqiq üsul.",
              ],
              [
                Workflow,
                "Sitemap + məhsul səhifələri",
                "Feed yoxdursa, sitemap-dakı məhsul səhifələri oxunur. Qiymət JSON-LD (schema.org) ilə göstərilməlidir.",
              ],
              [
                StoreIcon,
                "Manual əlavə",
                "Kiçik çeşid üçün qiymətlər komanda tərəfindən əl ilə yoxlanılıb əlavə edilə bilər.",
              ],
            ] as const
          ).map(([Icon, t, d]) => (
            <article className="mp-card" key={t}>
              <Icon size={22} aria-hidden="true" />
              <h3>{t}</h3>
              <p>{d}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mp-section" id="planlar" aria-labelledby="mp-plans">
        <h2 id="mp-plans">Planlar</h2>
        <p className="mp-lead">
          Ödənişli yerləşdirmə qiymət sırasını heç vaxt dəyişmir və daha ucuz təklifləri gizlətmir.
          Reklam və premium yerlər həmişə “Reklam” və ya “Premium” etiketi ilə göstərilir.
        </p>
        <div className="mp-table-wrap" role="region" aria-label="Planların müqayisəsi" tabIndex={0}>
          <table className="mp-table">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">İmkan</span>
                </th>
                <th scope="col">
                  <span className="mp-plan-name">Pulsuz</span>
                  <span className="mp-plan-price">0 ₼</span>
                  <small>Profil + feed/sitemap qiymətləri</small>
                </th>
                <th scope="col" className="mp-featured">
                  <span className="mp-plan-name">
                    <Sparkles size={15} aria-hidden="true" /> Premium mağaza
                  </span>
                  <span className="mp-plan-price">{planPrice(plans.premium)}</span>
                  <small>{plans.premium?.note || "Nişan, prioritet və analitika"}</small>
                </th>
                <th scope="col">
                  <span className="mp-plan-name">
                    <Megaphone size={15} aria-hidden="true" /> Reklam
                  </span>
                  <span className="mp-plan-price">{planPrice(plans.ads)}</span>
                  <small>{plans.ads?.note || "Banner, lent arası və önə çəkmə"}</small>
                </th>
              </tr>
            </thead>
            <tbody>
              {planRows.map((r) => (
                <tr key={r.label}>
                  <th scope="row">{r.label}</th>
                  <td>
                    <Cell v={r.free} />
                  </td>
                  <td className="mp-featured">
                    <Cell v={r.premium} />
                  </td>
                  <td>
                    <Cell v={r.ads} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="form-help">
          {plans.premium?.price || plans.ads?.price
            ? "Qiymətlər ƏDV və müqavilə şərtləri razılaşdırılarkən dəqiqləşdirilir."
            : `${PRICE_ON_REQUEST}: müraciətdən sonra sizinlə əlaqə saxlanılır.`}{" "}
          Saytda onlayn ödəniş qəbul edilmir.
        </p>
      </section>

      <section className="mp-section mp-forms" id="qeydiyyat" aria-labelledby="mp-apply">
        <h2 id="mp-apply">Müraciət</h2>
        <div className="mp-tabs" role="tablist" aria-label="Müraciət növü">
          {(
            [
              ["store", "Mağaza qeydiyyatı", StoreIcon],
              ["promotion", "Premium / reklam sorğusu", Sparkles],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              role="tab"
              id={"mp-tab-" + id}
              aria-controls={"mp-panel-" + id}
              aria-selected={tab === id}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                setSent(null);
              }}
            >
              <Icon size={17} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        {sent === tab ? (
          <div className="mp-sent" role="status">
            <CheckCircle2 size={32} aria-hidden="true" />
            <h3>Müraciətiniz qəbul edildi</h3>
            <p>
              Komanda məlumatları yoxlayıb sizinlə əlaqə saxlayacaq. Vəziyyəti aşağıdakı
              “Müraciətlərim” bölməsində izləyə bilərsiniz.
            </p>
            <button className="outline-button" onClick={() => setSent(null)}>
              Yeni müraciət
            </button>
          </div>
        ) : tab === "store" ? (
          <form
            className="form-stack mp-form"
            id="mp-panel-store"
            role="tabpanel"
            aria-labelledby="mp-tab-store"
            onSubmit={(e) => submit(e, "store")}
          >
            <fieldset className="mp-fieldset">
              <legend>Mağaza</legend>
              <div className="form-two">
                <label>
                  Mağazanın adı
                  <input name="storeName" required minLength={2} maxLength={100} />
                </label>
                <label>
                  Sayt domeni
                  <input
                    name="domain"
                    required
                    placeholder="magazaniz.az"
                    inputMode="url"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                </label>
              </div>
              <div className="mp-radio-row" role="radiogroup" aria-label="Mağaza növü">
                <label className="check-label">
                  <input type="radio" name="kind" value="shop" defaultChecked /> Onlayn / pərakəndə
                  mağaza
                </label>
                <label className="check-label">
                  <input type="radio" name="kind" value="marketplace" /> Marketplace / elan saytı
                </label>
              </div>
              <div className="mp-chips" role="group" aria-label="Kateqoriyalar">
                <span className="mp-chips-label">Kateqoriyalar</span>
                {categories.map((cat) => (
                  <label className="mp-chip" key={cat.id}>
                    <input type="checkbox" name="categories" value={cat.id} />
                    <span>{cat.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="mp-fieldset">
              <legend>Məhsul mənbəyi</legend>
              <div className="form-two">
                <label>
                  Format
                  <select name="feedFormat" defaultValue="xml">
                    {FEED_FORMATS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Feed və ya sitemap linki <span className="mp-optional">(istəyə bağlı)</span>
                  <input
                    name="feedUrl"
                    type="url"
                    pattern="https://.*"
                    placeholder="https://magazaniz.az/feed.xml"
                  />
                </label>
              </div>
            </fieldset>
            <fieldset className="mp-fieldset">
              <legend>Mağazanın ictimai əlaqə məlumatları</legend>
              <div className="form-two">
                <label>
                  Telefon(lar)
                  <input
                    name="phones"
                    placeholder="+994 12 000 00 00, +994 50 000 00 00"
                    inputMode="tel"
                  />
                </label>
                <label>
                  E-poçt
                  <input name="email" type="email" maxLength={150} />
                </label>
              </div>
              <div className="form-two">
                <label>
                  Şəhər
                  <input name="city" maxLength={60} placeholder="Bakı" />
                </label>
                <label>
                  İş saatları
                  <input name="hours" maxLength={150} placeholder="B.e.–Ş. 10:00–20:00" />
                </label>
              </div>
              <label>
                Ünvan
                <input name="address" maxLength={300} />
              </label>
              <details className="mp-more">
                <summary>Sosial şəbəkələr və messencerlər</summary>
                <div className="form-two">
                  <label>
                    WhatsApp
                    <input name="whatsapp" maxLength={30} inputMode="tel" />
                  </label>
                  <label>
                    Instagram
                    <input name="instagram" maxLength={150} placeholder="@magaza" />
                  </label>
                  <label>
                    Facebook
                    <input name="facebook" maxLength={150} />
                  </label>
                  <label>
                    Telegram
                    <input name="telegram" maxLength={150} />
                  </label>
                </div>
              </details>
            </fieldset>
            {contactFields}
            <div className="form-two">
              <label>
                VÖEN <span className="mp-optional">(istəyə bağlı)</span>
                <input name="voen" pattern="[0-9]{10}" maxLength={10} placeholder="10 rəqəm" />
              </label>
            </div>
            <label>
              Əlavə qeyd
              <textarea name="note" maxLength={2000} placeholder="Çeşid, filiallar, sual…" />
            </label>
            <label className="check-label">
              <input type="checkbox" required />
              Məlumatlarımın müraciətin yoxlanması üçün saxlanmasına razıyam.
            </label>
            <button className="dark-button" disabled={busy}>
              {busy ? "Göndərilir…" : "Qeydiyyat müraciətini göndər"}
              <ArrowUpRight size={18} />
            </button>
          </form>
        ) : (
          <form
            className="form-stack mp-form"
            id="mp-panel-promotion"
            role="tabpanel"
            aria-labelledby="mp-tab-promotion"
            onSubmit={(e) => submit(e, "promotion")}
          >
            <fieldset className="mp-fieldset">
              <legend>Xidmət</legend>
              <div className="mp-radio-cards">
                {PROMOTION_KINDS.map((p, i) => (
                  <label className="mp-radio-card" key={p.id}>
                    <input type="radio" name="promotion" value={p.id} defaultChecked={i === 0} />
                    <span>
                      <b>{p.label}</b>
                      <small>
                        {p.id === "premium"
                          ? planPrice(plans.premium)
                          : planPrice(plans.ads) + " · “Reklam” etiketi ilə"}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="mp-fieldset">
              <legend>Nə təbliğ olunur?</legend>
              <div className="form-two">
                <label>
                  Mağazanın adı
                  <input name="storeName" required minLength={2} maxLength={100} />
                </label>
                <label>
                  Kataloqdakı mağaza <span className="mp-optional">(varsa)</span>
                  <select name="storeId" defaultValue="">
                    <option value="">Hələ kataloqda deyil</option>
                    {[...c.stores]
                      .sort((a, b) => a.name.localeCompare(b.name, "az"))
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <label>
                Məhsul və ya mağaza səhifəsi
                <input
                  name="target"
                  required
                  minLength={2}
                  maxLength={300}
                  placeholder="Məhsulun adı / linki və ya “bütün mağaza”"
                />
              </label>
              <div className="form-two">
                <label>
                  Müddət
                  <select name="period" defaultValue="1m">
                    {PERIODS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Aylıq büdcə, ₼ <span className="mp-optional">(istəyə bağlı)</span>
                  <input name="budget" type="number" min={1} step="1" inputMode="numeric" />
                </label>
              </div>
            </fieldset>
            {contactFields}
            <label>
              Əlavə qeyd
              <textarea name="note" maxLength={2000} />
            </label>
            <p className="form-help">
              Bu, ödəniş deyil — sorğudur. Şərtlər və hesab-faktura komanda ilə razılaşdırılır.
              Reklam yerləri qiymət sırasını dəyişmir.
            </p>
            <label className="check-label">
              <input type="checkbox" required />
              Məlumatlarımın sorğunun cavablandırılması üçün saxlanmasına razıyam.
            </label>
            <button className="dark-button" disabled={busy}>
              {busy ? "Göndərilir…" : "Sorğunu göndər"}
              <ArrowUpRight size={18} />
            </button>
          </form>
        )}
        {!session.user && (
          <p className="form-help">
            <ShieldCheck size={14} aria-hidden="true" /> Müraciət göndərmək və vəziyyətini izləmək
            üçün hesabınıza daxil olun.
          </p>
        )}
      </section>

      {session.user && (
        <section className="mp-section" aria-labelledby="mp-mine">
          <h2 id="mp-mine">Müraciətlərim</h2>
          {mine === null ? (
            <p className="form-help">Yüklənir…</p>
          ) : mine.length ? (
            <ul className="mp-mine">
              {mine.map((a) => (
                <li key={a.id}>
                  {a.type === "promotion" ? (
                    <Sparkles size={18} aria-hidden="true" />
                  ) : (
                    <StoreIcon size={18} aria-hidden="true" />
                  )}
                  <div>
                    <b>{a.title || "Mağaza müraciəti"}</b>
                    <small>
                      {a.type === "promotion"
                        ? PROMOTION_KINDS.find((p) => p.id === a.promotion)?.label ||
                          "Premium / reklam"
                        : "Mağaza qeydiyyatı"}{" "}
                      · {new Date(a.date).toLocaleDateString("az-AZ", { timeZone: "Asia/Baku" })}
                    </small>
                  </div>
                  <span className={"mp-status " + a.status}>
                    {a.status === "pending" && <Clock3 size={14} aria-hidden="true" />}
                    {applicationStatusLabel[a.status] || a.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="form-help">
              <Users size={14} aria-hidden="true" /> Hələ müraciətiniz yoxdur.
            </p>
          )}
        </section>
      )}

      <section className="mp-section" aria-labelledby="mp-faq">
        <h2 id="mp-faq">Tez-tez verilən suallar</h2>
        <div className="mp-faq">
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
