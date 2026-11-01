// Reads a machine price (JSON-LD/meta) or a shelf price ("1 299,99 ₼", "1.299,99 AZN", "1299.00").
// Returns NaN for anything that is not one positive amount; a foreign currency sign is rejected.
export function parsePrice(raw: unknown) {
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : NaN;
  if (typeof raw !== "string") return NaN;
  if (/\b(?:USD|EUR|RUB|RUR|TRY|GBP)\b|[$€£₽₺]/i.test(raw)) return NaN;
  let amount = raw.replace(/AZN|₼|manat|man\.?/gi, "").replace(/[\s\u00a0\u202f\u2009']/g, "");
  if (!/^\d[\d.,]*$/.test(amount)) return NaN;
  const dots = amount.split(".").length - 1,
    commas = amount.split(",").length - 1;
  if (dots && commas) {
    // The last separator is the decimal one: "1.299,99" / "1,299.99".
    const decimal = amount.lastIndexOf(".") > amount.lastIndexOf(",") ? "." : ",";
    const [whole, fraction] = [
      amount.slice(0, amount.lastIndexOf(decimal)),
      amount.slice(amount.lastIndexOf(decimal) + 1),
    ];
    if (!/^\d+$/.test(fraction) || !/^(?:\d+|\d{1,3}(?:[.,]\d{3})+)$/.test(whole)) return NaN;
    amount = whole.replace(/[.,]/g, "") + "." + fraction;
  } else if (dots + commas > 1) {
    // Repeated separator: thousands groups only ("1.299.000", "1,299,000").
    if (!/^\d{1,3}(?:[.,]\d{3})+$/.test(amount)) return NaN;
    amount = amount.replace(/[.,]/g, "");
  } else if (commas) {
    amount = amount.replace(",", ".");
  }
  const price = Number(amount);
  return Number.isFinite(price) && price > 0 && price <= 10000000
    ? Math.round(price * 100) / 100
    : NaN;
}
