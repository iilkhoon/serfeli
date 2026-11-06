// Merchant plans, paid placements and ad settings shared by the merchant page, the admin panel
// and the API. Prices are owner-set placeholders stored in the `settings:main` record; nothing
// here processes payments. Paid placement never changes price order: it only adds a badge,
// store-list priority or a separate, labelled sponsored row.
import { z } from "zod";

export const PLAN_IDS = ["free", "premium", "ads"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type PlanSetting = {
  // Monthly price in AZN set by the owner; unset means "Qiymət razılaşma ilə".
  price?: number;
  period?: "ay" | "rüb" | "il";
  note?: string;
};
export type PlansSettings = Partial<Record<"premium" | "ads", PlanSetting>>;
// AdSense configuration read by the storefront's AdSlot component.
export type AdsSettings = { client?: string; slots?: Record<string, string> };

export const PRICE_ON_REQUEST = "Qiymət razılaşma ilə";

export function planPrice(p?: PlanSetting) {
  if (!p?.price) return PRICE_ON_REQUEST;
  const amount = new Intl.NumberFormat("az-AZ", { maximumFractionDigits: 2 }).format(p.price);
  return `${amount} ₼ / ${p.period || "ay"}`;
}

export const planSetting = z.object({
  price: z.number().positive().max(1000000).optional(),
  period: z.enum(["ay", "rüb", "il"]).optional(),
  note: z.string().max(300).optional(),
});
export const plansSettings = z.object({
  premium: planSetting.optional(),
  ads: planSetting.optional(),
});
export const adsSettings = z.object({
  client: z
    .string()
    .regex(/^ca-pub-\d{10,20}$/, "AdSense client ID ca-pub-… formatında olmalıdır")
    .optional(),
  slots: z
    .record(
      z.string().regex(/^[a-z0-9-]{1,40}$/),
      z.string().regex(/^\d{5,20}$/, "Slot ID yalnız rəqəmlərdən ibarətdir"),
    )
    .refine((v) => Object.keys(v).length <= 20, "Ən çoxu 20 slot")
    .optional(),
});

// Slot names the storefront's AdSlot component can render. The owner maps each to an AdSense slot ID.
export const AD_SLOT_NAMES: { id: string; label: string }[] = [
  { id: "home-top", label: "Ana səhifə — yuxarı banner" },
  { id: "home-feed", label: "Ana səhifə — məhsul lenti arası" },
  { id: "catalog-feed", label: "Kataloq — məhsul lenti arası" },
  { id: "product-side", label: "Məhsul səhifəsi — yan blok" },
  { id: "search-feed", label: "Axtarış nəticələri — lent arası" },
];

// Paid placements. `label` is always shown next to the placement on the storefront.
export const PLACEMENT_SLOTS = [
  { id: "home-premium", label: "Ana səhifə — “Premium mağazalar”" },
  { id: "store-list", label: "Mağazalar siyahısı — yuxarıda" },
  { id: "category-sponsored", label: "Kateqoriya — ayrıca “Reklam” sırası" },
  { id: "search-sponsored", label: "Axtarış — ayrıca “Reklam” sırası" },
  { id: "product-sponsored", label: "Məhsul səhifəsi — ayrıca “Reklam” bloku" },
  { id: "banner", label: "Banner yeri" },
] as const;
export type PlacementSlot = (typeof PLACEMENT_SLOTS)[number]["id"];

export type Placement = {
  id: string;
  type: "store" | "product" | "banner";
  // Store id for store placements, product id for boosted listings, free text for banners.
  targetId: string;
  storeId?: string;
  slot: PlacementSlot;
  label: "Reklam" | "Premium";
  startsAt: string; // YYYY-MM-DD
  endsAt: string; // YYYY-MM-DD, inclusive
  active: boolean;
  note?: string;
  applicationId?: string;
  createdAt?: string;
};

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarix YYYY-MM-DD formatında olmalıdır");
export const placementSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
    type: z.enum(["store", "product", "banner"]),
    targetId: z.string().min(1).max(200),
    storeId: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,100}$/)
      .optional(),
    slot: z.enum(PLACEMENT_SLOTS.map((s) => s.id) as [PlacementSlot, ...PlacementSlot[]]),
    label: z.enum(["Reklam", "Premium"]),
    startsAt: day,
    endsAt: day,
    active: z.boolean(),
    note: z.string().max(500).optional(),
    applicationId: z.string().max(100).optional(),
    createdAt: z.string().max(40).optional(),
  })
  .refine((p) => p.startsAt <= p.endsAt, "Bitmə tarixi başlama tarixindən əvvəl ola bilməz");

const bakuDay = (now: number) =>
  new Date(now + 4 * 3600000).toISOString().slice(0, 10); // Asia/Baku is UTC+4 all year.

export function placementLive(p: Placement, now = Date.now()) {
  const today = bakuDay(now);
  return p.active && p.startsAt <= today && today <= p.endsAt;
}

// A store's premium status honours its end date so lapsed plans stop showing the badge.
export function storeIsPremium(
  s: { plan?: string; planUntil?: string; active?: boolean },
  now = Date.now(),
) {
  return s.plan === "premium" && (!s.planUntil || bakuDay(now) <= s.planUntil);
}

export const APPLICATION_STATUSES = ["pending", "contacted", "approved", "rejected"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export const applicationStatusLabel: Record<string, string> = {
  pending: "Gözləyir",
  contacted: "Əlaqə saxlanılıb",
  approved: "Təsdiqlənib",
  rejected: "Rədd edilib",
};
export const PROMOTION_KINDS = [
  { id: "premium", label: "Premium mağaza" },
  { id: "boost", label: "Məhsulu önə çək (Reklam)" },
  { id: "banner", label: "Banner / lent arası reklam" },
] as const;
export const PERIODS = [
  { id: "1m", label: "1 ay", months: 1 },
  { id: "3m", label: "3 ay", months: 3 },
  { id: "6m", label: "6 ay", months: 6 },
  { id: "12m", label: "12 ay", months: 12 },
] as const;
export const FEED_FORMATS = [
  { id: "xml", label: "XML" },
  { id: "yml", label: "YML (Yandex Market)" },
  { id: "csv", label: "CSV" },
  { id: "sitemap", label: "Sitemap (məhsul səhifələri)" },
  { id: "manual", label: "Manual / hələ feed yoxdur" },
] as const;
