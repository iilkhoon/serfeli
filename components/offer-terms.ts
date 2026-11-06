// Credit (instalment) and classified-ad helpers shared by product cards and the product page.
// They only reshape what the store published; nothing here estimates missing terms.
import type { Offer, Store } from "../lib/catalog";

export type CreditOption = {
  months: number;
  total: number;
  monthly: number;
  provider?: string;
  downPayment?: number;
  interestFree?: boolean;
};

// Published credit options, longest term last. Legacy offers only carry months + installmentTotal.
export function creditOptions(o: Offer): CreditOption[] {
  const list: CreditOption[] = o.installmentOptions?.length
    ? o.installmentOptions.filter((x) => x.months > 0 && x.total > 0)
    : o.months > 0 && o.installmentTotal > 0
      ? [{ months: o.months, total: o.installmentTotal, monthly: o.installmentTotal / o.months }]
      : [];
  return [...list]
    .map((x) => ({ ...x, monthly: x.monthly > 0 ? x.monthly : x.total / x.months }))
    .sort((a, b) => a.months - b.months || a.total - b.total);
}

// "0% faiz" only when the store says so or the instalment total equals the cash price.
export const interestFree = (x: CreditOption, price: number) =>
  x.interestFree === true || (x.interestFree !== false && Math.abs(x.total - price) < 0.5);

// The lowest monthly payment an offer publishes (usually its longest term).
export function lowestMonthly(o: Offer): CreditOption | undefined {
  return creditOptions(o).sort((a, b) => a.monthly - b.monthly)[0];
}

// Classified listings (tap.az shop ads, lalafo) are not shop offers: they are listed apart and
// never used as the "best offer".
export function isClassified(o: Offer, store?: Store) {
  return !!o.priceRange || store?.kind === "marketplace" || o.condition === "used";
}

// Azerbaijani locative suffix by the last vowel: "Tap.az-da", "Lalafo-da", "Kontakt-da".
export function locative(name: string) {
  const vowels = name.toLocaleLowerCase("az").match(/[aıoueəiöü]/g);
  const last = vowels?.[vowels.length - 1];
  return name + (last && "eəiöü".includes(last) ? "-də" : "-da");
}
