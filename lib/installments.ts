// Credit / instalment terms published on store pages. Every reader returns only figures the page
// itself prints (monthly payment and term, plus the total or first payment when shown). The total
// is the page's own "Yekun" amount when printed, otherwise monthly × months.
import type { Offer } from "./catalog";

export type InstallmentOption = NonNullable<Offer["installmentOptions"]>[number];
// One term as read from a page, before validation and merging.
export type RawInstallment = {
  months: number;
  monthly: number;
  total?: number;
  provider?: string;
  downPayment?: number;
};

const round = (n: number) => Math.round(n * 100) / 100;

// Shelf amount → number (NaN otherwise). The last "." or "," followed by one or two digits is the
// decimal separator; other separators and spaces group thousands. Kept free of imports so the
// offline verify scripts can load this module on its own.
export function parsePrice(raw: string) {
  const s = raw.replace(/AZN|₼|⫙|[\s\u00a0\u202f]/gi, "");
  if (!/^\d[\d.,]*$/.test(s)) return NaN;
  const m = s.match(/^(.*?)[.,](\d{1,2})$/);
  const n = Number(m ? m[1].replace(/[.,]/g, "") + "." + m[2] : s.replace(/[.,]/g, ""));
  return Number.isFinite(n) && n > 0 && n <= 10000000 ? round(n) : NaN;
}

const text = (value: string) =>
  value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();

const attr = (tag: string, key: string) =>
  tag.match(new RegExp("(?:^|\\s)" + key + "\\s*=\\s*([\"'])([\\s\\S]*?)\\1", "i"))?.[2];

/** Validates the terms, keeps the cheapest total for each term length (providers offering that
 * same total are listed together) and returns at most six terms, shortest first.
 * `interestFree` means the total does not exceed the cash price (rounding of the monthly payment
 * allowed), whatever the page calls the plan. */
export function normalizeInstallments(raw: RawInstallment[], cashPrice: number) {
  const byMonths = new Map<number, InstallmentOption>();
  for (const r of raw) {
    const months = Number(r.months),
      monthly = round(Number(r.monthly));
    if (!Number.isInteger(months) || months < 2 || months > 60) continue;
    if (!(monthly > 0) || monthly > 10000000) continue;
    const down = r.downPayment && r.downPayment > 0 ? round(r.downPayment) : 0;
    const total = round(r.total && r.total > 0 ? r.total : monthly * months + down);
    // A total far below the cash price means the figures were misread.
    if (!(total > 0) || (cashPrice > 0 && total < cashPrice * 0.9)) continue;
    const option: InstallmentOption = {
      months,
      total,
      monthly,
      ...(r.provider ? { provider: r.provider.trim().slice(0, 80) } : {}),
      ...(down ? { downPayment: down } : {}),
      interestFree: cashPrice > 0 && total <= cashPrice + months * 0.01,
    };
    const prior = byMonths.get(months);
    if (!prior || option.total < prior.total - 0.005) byMonths.set(months, option);
    else if (Math.abs(option.total - prior.total) < 0.005) {
      const names = new Set(
        [prior.provider, option.provider].flatMap((p) => (p || "").split(", ")).filter(Boolean),
      );
      if (names.size) prior.provider = [...names].join(", ").slice(0, 80);
    }
  }
  return [...byMonths.values()].sort((a, b) => a.months - b.months).slice(-6);
}

/** The single term kept in Offer.months / installmentTotal for older readers: the longest
 * interest-free term, otherwise 12 months, otherwise the longest term. */
export function representativeInstallment(options: InstallmentOption[]) {
  const free = options.filter((o) => o.interestFree);
  return (
    (free.length ? free[free.length - 1] : undefined) ||
    options.find((o) => o.months === 12) ||
    options[options.length - 1]
  );
}

/** Offer fields for scanned terms; spread into the Offer built from a ScannedProduct. */
export function offerInstallmentFields(options: InstallmentOption[] | undefined) {
  const list = options?.length ? options : [];
  const chosen = representativeInstallment(list);
  return {
    months: chosen?.months || 0,
    installmentTotal: chosen?.total || 0,
    ...(list.length ? { installmentOptions: list } : {}),
  };
}

// "130.50 AZN x 18 ay" followed by "uCard ilə 18 aya faizsiz ödə!" (irshad.az, w-t.az card
// sliders). The card name is the provider.
export function cardSliderTerms(html: string): RawInstallment[] {
  const out: RawInstallment[] = [];
  const t = text(html);
  for (const m of t.matchAll(
    /(\d[\d.,\s]*?)\s*(?:AZN|₼)\s*x\s*(\d{1,2})\s*ay\s+([\p{L}][\p{L}\p{N} .-]{1,40}?)\s+ilə\s+(\d{1,2})\s+aya\s+faizsiz/giu,
  )) {
    if (m[2] !== m[4]) continue;
    const monthly = parsePrice(m[1].trim());
    if (Number.isFinite(monthly))
      out.push({ months: Number(m[2]), monthly, provider: m[3].trim() });
  }
  return out;
}

// compstore.az: <td class="payment-card"><span>BirKart</span></td>
// <td class="payment-card-price">7409.43 ₼ x 2 ay</td>
function compstoreTerms(html: string): RawInstallment[] {
  const area = html.match(/<div\b[^>]*class=["'][^"']*\bpayment-cards-area\b[\s\S]*$/i)?.[0] || "";
  const out: RawInstallment[] = [];
  for (const row of area.matchAll(
    /<td\b[^>]*class=["'][^"']*\bpayment-card\b["'][^>]*>([\s\S]*?)<\/td>\s*<td\b[^>]*class=["'][^"']*\bpayment-card-price\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/gi,
  )) {
    const term = text(row[2]).match(/^(\d[\d.,\s]*?)\s*(?:AZN|₼)\s*x\s*(\d{1,2})\s*ay$/i);
    const monthly = term ? parsePrice(term[1]) : NaN;
    if (term && Number.isFinite(monthly))
      out.push({ months: Number(term[2]), monthly, provider: text(row[1]) || undefined });
  }
  return out;
}

// minorstore.az: <div class="... monthly-amount" data-months="6">171.5 ⫙</div>
function minorstoreTerms(html: string): RawInstallment[] {
  const out: RawInstallment[] = [];
  for (const m of html.matchAll(/<div\b([^>]*\bmonthly-amount\b[^>]*)>([^<]*)<\/div>/gi)) {
    const months = Number(attr(m[1], "data-months"));
    const monthly = parsePrice(m[2].replace(/⫙/g, "").trim());
    if (months && Number.isFinite(monthly)) out.push({ months, monthly });
  }
  return out;
}

// mgstore.az: <div class="calks__circle" data-month="6" data-mountly-payment="40.00">
function mgstoreTerms(html: string): RawInstallment[] {
  const out: RawInstallment[] = [];
  for (const m of html.matchAll(/<div\b([^>]*\bcalks__circle\b[^>]*)>/gi)) {
    const months = Number(attr(m[1], "data-month"));
    const monthly = parsePrice(attr(m[1], "data-mountly-payment") || "");
    if (months && Number.isFinite(monthly)) out.push({ months, monthly });
  }
  return out;
}

// w-t.az: the store's own plan table (radio inputs carry month, first payment, monthly, total)
// plus the bank-card slider.
function worldTelecomTerms(html: string): RawInstallment[] {
  const out: RawInstallment[] = [];
  for (const m of html.matchAll(/<input\b([^>]*\binstallment-radio\b[^>]*)>/gi)) {
    const months = Number(attr(m[1], "data-month"));
    const monthly = parsePrice(attr(m[1], "data-monthly") || "");
    const total = parsePrice(attr(m[1], "data-total") || "");
    const down = Number(attr(m[1], "data-initial") || "0");
    if (months && Number.isFinite(monthly))
      out.push({
        months,
        monthly,
        ...(Number.isFinite(total) ? { total } : {}),
        ...(down > 0 ? { downPayment: down } : {}),
        provider: "W-T hissəli ödəniş",
      });
  }
  const cards = html.match(/<div\b[^>]*class=["'][^"']*\binstallment-card-wrapper\b[\s\S]*$/i)?.[0];
  return cards ? [...out, ...cardSliderTerms(cards)] : out;
}

// telehome.az: term buttons "<strong>3 ay</strong><small>549.67 ₼ / ay</small>".
function telehomeTerms(html: string): RawInstallment[] {
  const grid = html.match(/<div\b[^>]*class=["'][^"']*termGrid[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  const out: RawInstallment[] = [];
  for (const b of grid?.[1].matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi) || []) {
    const m = text(b[1]).match(/^(\d{1,2})\s*ay\s+(\d[\d.,\s]*?)\s*₼\s*\/\s*ay$/i);
    const monthly = m ? parsePrice(m[2]) : NaN;
    if (m && Number.isFinite(monthly)) out.push({ months: Number(m[1]), monthly });
  }
  return out;
}

// bytelecom.az: only the selected term is rendered (monthly + "Yekun məbləğ"), with no first
// payment; other terms are computed after a click and are not read.
function bytelecomTerms(html: string): RawInstallment[] {
  const block = html.match(
    /<div\b[^>]*class=["']detail-calculator["'][\s\S]*?class=["']full-fee["'][\s\S]*?<\/h5>/i,
  )?.[0];
  if (!block) return [];
  const months = Number(
    text(
      block.match(
        /<div\b[^>]*class=["'][^"']*\bactive-month\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      )?.[1] || "",
    ).match(/^(\d{1,2})\s*ay$/)?.[1],
  );
  const monthly = parsePrice(
    text(block.match(/class=["']monthly-fee["'][\s\S]*?<h5>([\s\S]*?)<\/h5>/i)?.[1] || ""),
  );
  const total = parsePrice(
    text(block.match(/class=["']full-fee["'][\s\S]*?<h5>([\s\S]*?)<\/h5>/i)?.[1] || ""),
  );
  return months && Number.isFinite(monthly)
    ? [{ months, monthly, ...(Number.isFinite(total) ? { total } : {}) }]
    : [];
}

type BakuDetails = {
  price?: unknown;
  discount?: unknown;
  perMonth?: { month?: unknown; price?: unknown } | null;
  installments?: { cardName?: unknown; condition?: { month?: unknown; percent?: unknown }[] }[];
};
// bakuelectronics.az: __NEXT_DATA__ prodDetails. `perMonth` is the store's own credit term;
// `installments` lists bank cards with a percentage per term. The page computes the card payment
// as (price − discount) × (1 + percent/100) / months (its product-page script); the same formula is
// applied here, nothing else is inferred.
export function bakuInstallments(details: BakuDetails): RawInstallment[] {
  const out: RawInstallment[] = [];
  const price = Number(details.price),
    discount = Number(details.discount) || 0;
  const cash = price - (discount > 0 && discount < price ? discount : 0);
  const per = details.perMonth;
  if (per && Number(per.month) > 0 && Number(per.price) > 0)
    out.push({ months: Number(per.month), monthly: Number(per.price) });
  if (cash > 0)
    for (const card of details.installments || [])
      for (const c of card.condition || []) {
        const months = Number(c.month),
          percent = Number(c.percent);
        if (!(months > 0) || !Number.isFinite(percent) || percent < 0 || percent > 100) continue;
        const total = round(cash * (1 + percent / 100));
        out.push({
          months,
          monthly: round(total / months),
          total,
          provider: typeof card.cardName === "string" ? card.cardName : undefined,
        });
      }
  return out;
}
function bakuPageTerms(html: string): RawInstallment[] {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  try {
    const details = JSON.parse(m[1])?.props?.pageProps?.prodDetails;
    return details && typeof details === "object" ? bakuInstallments(details) : [];
  } catch {
    return [];
  }
}

// Product-page readers by host (www. stripped).
export const installmentReaders: Record<string, (html: string) => RawInstallment[]> = {
  "bakuelectronics.az": bakuPageTerms,
  "compstore.az": compstoreTerms,
  "minorstore.az": minorstoreTerms,
  "mgstore.az": mgstoreTerms,
  "w-t.az": worldTelecomTerms,
  "telehome.az": telehomeTerms,
  "bytelecom.az": bytelecomTerms,
};

export function pageInstallments(host: string, html: string, cashPrice: number) {
  const reader = installmentReaders[host.replace(/^www\./, "")];
  if (!reader) return [];
  try {
    return normalizeInstallments(reader(html), cashPrice);
  } catch {
    return [];
  }
}
