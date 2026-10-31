// Azerbaijani display formats built by hand. Intl locale data for "az" is missing in some
// runtimes (the Worker and headless browsers fall back to "13,205" or "2026-10-27"), which
// also made the server and client renders disagree.
const BAKU = "Asia/Baku";

function parts(value: string | number | Date) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: BAKU,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return p as Record<"year" | "month" | "day" | "hour" | "minute", string>;
}

/** 27.10.2026 */
export function azDate(value: string | number | Date) {
  const p = parts(value);
  return p ? `${p.day}.${p.month}.${p.year}` : "—";
}

/** 27.10.2026, 14:29 */
export function azDateTime(value: string | number | Date) {
  const p = parts(value);
  return p ? `${p.day}.${p.month}.${p.year}, ${p.hour}:${p.minute}` : "—";
}

/** 13 205 — the same thousands separator as money(). */
export function azNumber(n: number) {
  if (!Number.isFinite(n)) return "—";
  const [a, b] = String(Math.round(n * 100) / 100).split(".");
  return a.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0") + (b ? "," + b : "");
}
