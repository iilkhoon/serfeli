// Request validation for /api/v1. Domains and URLs are checked again against the store on write.
import { z } from "zod";
import { allowedHosts } from "../extractor";
import { adsSettings, plansSettings } from "../plans";

export const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);

export const product = z.object({
  id,
  name: z.string().min(2).max(180),
  brand: z.string().min(1).max(80),
  category: z.enum([
    "telefon",
    "noutbuk",
    "audio",
    "planset",
    "ev",
    "saat",
    "oyun",
    "aksesuar",
    "foto",
    "gozellik",
    "tv",
    "mebel",
    "idman",
    "oyuncaq",
    "market",
    "avto",
    "kitab",
  ]),
  variant: z.string().min(1).max(180),
  image: z
    .string()
    .refine((v) => v.startsWith("https://") || (v.startsWith("/") && !v.startsWith("//"))),
  specs: z.record(z.string().max(200)),
  description: z.string().max(3000),
  active: z.boolean(),
  featured: z.boolean(),
  familyId: z.string().max(100).optional(),
  // Source fields set by importers; kept so an admin edit does not detach a product from its store.
  marketplace: z.boolean().optional(),
  sourceStoreId: z.string().max(100).optional(),
  sourceUrl: z.string().url().max(1000).optional(),
  distinction: z.string().max(200).optional(),
});

const optionalText = (max: number) => z.string().trim().max(max).optional();
export const storeContacts = z.object({
  phones: z.array(z.string().trim().min(5).max(30)).max(6).optional(),
  email: z.string().trim().email().max(150).optional(),
  address: optionalText(300),
  city: optionalText(60),
  hours: optionalText(150),
  whatsapp: optionalText(30),
  instagram: optionalText(150),
  facebook: optionalText(150),
  telegram: optionalText(150),
});
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarix YYYY-MM-DD formatında olmalıdır");
export const hostname = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?=.{3,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/, "Domen düzgün deyil");

// Stores registered through a merchant application may have a domain without a crawler adapter
// yet; such stores stay inactive until the domain is added to the verified source list.
export const store = z
  .object({
    id,
    name: z.string().min(2).max(100),
    domain: hostname,
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    active: z.boolean(),
    description: z.string().max(2000),
    logo: z.string().max(500).optional(),
    logoBackground: z.string().optional(),
    sourceStatus: z.string().optional(),
    contacts: storeContacts.optional(),
    kind: z.enum(["shop", "marketplace"]).optional(),
    plan: z.enum(["free", "premium"]).optional(),
    planFrom: day.optional(),
    planUntil: day.optional(),
  })
  .refine(
    (s) => !s.active || allowedHosts.includes(s.domain.replace(/^www\./, "")),
    "Aktiv mağazanın domeni yoxlanmış mənbə siyahısında olmalıdır",
  )
  .refine(
    (s) => !s.planFrom || !s.planUntil || s.planFrom <= s.planUntil,
    "Plan bitmə tarixi başlama tarixindən əvvəl ola bilməz",
  );

export const offer = z.object({
  stockKnown: z.boolean().optional(),
  condition: z.enum(["new", "used", "unknown"]).optional(),
  id,
  productId: id,
  storeId: id,
  price: z.number().positive().max(10000000),
  shipping: z.number().min(0).max(100000),
  months: z.number().int().min(0).max(60),
  installmentTotal: z.number().min(0).max(10000000),
  stock: z.boolean(),
  warranty: z.string().max(200),
  url: z.string().url(),
  demo: z.boolean(),
  checkedAt: z.string().datetime(),
  cities: z.array(z.string().max(60)).max(30),
  sponsored: z.boolean(),
  sourceSku: z.string().max(200).optional(),
  sourceName: z.string().max(300).optional(),
  shippingKnown: z.boolean().optional(),
  installmentOptions: z
    .array(
      z.object({
        months: z.number().int().positive(),
        total: z.number().positive(),
        monthly: z.number().min(0),
        provider: z.string().max(80).optional(),
        downPayment: z.number().min(0).optional(),
        interestFree: z.boolean().optional(),
      }),
    )
    .max(6)
    .optional(),
  priceRange: z
    .object({ min: z.number().min(0), max: z.number().min(0), count: z.number().int().min(0) })
    .optional(),
  feedProductId: z.string().max(100).optional(),
  feedVariantIndex: z.number().int().min(0).optional(),
  feedUpdatedAt: z.string().nullable().optional(),
});

export const settings = z.object({
  id: z.literal("main"),
  headline: z.string().min(3).max(100),
  announcement: z.string().max(160),
  plans: plansSettings.optional(),
  ads: adsSettings.optional(),
});

export const saveRequest = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("product"), value: product }),
  z.object({ kind: z.literal("store"), value: store }),
  z.object({ kind: z.literal("offer"), value: offer }),
  z.object({ kind: z.literal("settings"), value: settings }),
]);
