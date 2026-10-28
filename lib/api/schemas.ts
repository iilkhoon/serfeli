// Request validation for /api/v1. Domains and URLs are checked again against the store on write.
import { z } from "zod";
import { allowedHosts } from "../extractor";

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
});

export const store = z.object({
  id,
  name: z.string().min(2).max(100),
  domain: z
    .string()
    .refine((d) => allowedHosts.includes(d), "Domen yoxlanmış mağaza siyahısında olmalıdır"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  active: z.boolean(),
  description: z.string().max(2000),
  logo: z.string().max(500).optional(),
  logoBackground: z.string().optional(),
  sourceStatus: z.string().optional(),
});

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
      }),
    )
    .max(6)
    .optional(),
  feedProductId: z.string().max(100).optional(),
  feedVariantIndex: z.number().int().min(0).optional(),
  feedUpdatedAt: z.string().nullable().optional(),
});

export const settings = z.object({
  id: z.literal("main"),
  headline: z.string().min(3).max(100),
  announcement: z.string().max(160),
});

export const saveRequest = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("product"), value: product }),
  z.object({ kind: z.literal("store"), value: store }),
  z.object({ kind: z.literal("offer"), value: offer }),
  z.object({ kind: z.literal("settings"), value: settings }),
]);
