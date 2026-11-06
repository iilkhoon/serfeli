// Merchant applications, paid placements, plan/ad settings and Q&A moderation for /api/v1.
// Applications are requests only: nothing here takes or confirms a payment.
import { z } from "zod";
import { ApiError, readJson } from "./http";
import { id, hostname, storeContacts, settings as settingsSchema } from "./schemas";
import { audit, catalog, db, list, statement } from "./records";
import {
  APPLICATION_STATUSES,
  FEED_FORMATS,
  PERIODS,
  PROMOTION_KINDS,
  adsSettings,
  placementLive,
  placementSchema,
  plansSettings,
  type Placement,
} from "../plans";
import { categories, type Store } from "../catalog";
import { allowedHosts } from "../extractor";

type User = { userId: string; email?: string; displayName?: string };
const json = (v: unknown, status = 200) =>
  Response.json(v, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);
const httpsUrl = z
  .string()
  .trim()
  .url()
  .max(500)
  .refine((v) => v.startsWith("https://"), "Ünvan https:// ilə başlamalıdır");
const phone = z
  .string()
  .trim()
  .regex(/^[+\d][\d\s()-]{8,24}$/, "Telefon nömrəsi düzgün deyil");
const contactPerson = z.object({
  name: text(2, 100),
  role: optional(100),
  email: z.string().trim().email().max(150),
  phone,
});
const categoryIds = categories.map((c) => c.id) as [string, ...string[]];

export const storeApplication = z.object({
  type: z.literal("store"),
  storeName: text(2, 100),
  domain: hostname,
  kind: z.enum(["shop", "marketplace"]),
  categories: z.array(z.enum(categoryIds)).min(1).max(categoryIds.length),
  feedFormat: z.enum(FEED_FORMATS.map((f) => f.id) as [string, ...string[]]),
  feedUrl: httpsUrl.optional().or(z.literal("").transform(() => undefined)),
  contacts: storeContacts,
  contactPerson,
  voen: z
    .string()
    .trim()
    .regex(/^\d{10}$/, "VÖEN 10 rəqəmdən ibarətdir")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  note: optional(2000),
});
export const promotionApplication = z.object({
  type: z.literal("promotion"),
  promotion: z.enum(PROMOTION_KINDS.map((p) => p.id) as [string, ...string[]]),
  storeName: text(2, 100),
  storeId: id.optional(),
  target: text(2, 300),
  period: z.enum(PERIODS.map((p) => p.id) as [string, ...string[]]),
  budget: z.number().positive().max(10000000).optional(),
  contactPerson,
  note: optional(2000),
});
// The original short form (company, VÖEN, website) is still accepted.
const legacyApplication = z.object({
  company: text(2, 150),
  email: z.string().email(),
  phone: z.string().min(9).max(30),
  website: httpsUrl,
  voen: z.string().regex(/^\d{10}$/),
  note: z.string().max(2000),
});
const anyApplication = z.union([
  z.discriminatedUnion("type", [storeApplication, promotionApplication]),
  legacyApplication,
]);
export type ApplicationRecord = z.infer<typeof anyApplication> & {
  id: string;
  status: (typeof APPLICATION_STATUSES)[number];
  date: string;
  userId?: string;
  adminNote?: string;
  decidedAt?: string;
  storeId?: string;
  placementId?: string;
};

export async function applicationPost(req: Request, user: User) {
  const b = anyApplication.parse(await readJson(req));
  if ("type" in b && b.type === "promotion" && b.storeId) {
    const c = await catalog();
    if (!c.stores.some((s) => s.id === b.storeId))
      throw new ApiError(400, "Seçilmiş mağaza kataloqda tapılmadı.");
  }
  const record = {
    ...b,
    id: crypto.randomUUID(),
    userId: user.userId,
    status: "pending",
    date: new Date().toISOString(),
  };
  await statement("application", record).run();
  return json({ ok: true, id: record.id });
}

// The signed-in merchant sees the status of their own requests (never other users' requests).
export async function myApplications(user: User) {
  const rows = (await list<ApplicationRecord>("application")).filter(
    (a) => a.userId === user.userId,
  );
  return json({
    applications: rows.map((a) => ({
      id: a.id,
      type: "type" in a ? a.type : "store",
      title:
        "storeName" in a ? a.storeName : "company" in a ? (a as { company: string }).company : "",
      promotion: "promotion" in a ? a.promotion : undefined,
      status: a.status,
      date: a.date,
      decidedAt: a.decidedAt,
    })),
  });
}

const slug = (v: string) =>
  v
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.[a-z]{2,}$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "magaza";

const addMonths = (from: string, months: number) => {
  const d = new Date(from + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};
const today = () => new Date(Date.now() + 4 * 3600000).toISOString().slice(0, 10);

// Approving a store application creates (or updates) the store profile. Approving a promotion
// switches the store to premium or creates a dated placement. Both stay editable afterwards.
export async function decideApplication(req: Request, user: User) {
  const b = z
    .object({
      id: z.string().max(100),
      status: z.enum(APPLICATION_STATUSES),
      adminNote: z.string().max(2000).optional(),
      // Optional overrides for the approval side effects.
      storeId: id.optional(),
      startsAt: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    })
    .parse(await readJson(req));
  const row = await db()
    .prepare("SELECT payload FROM records WHERE id=? AND kind='application'")
    .bind("application:" + b.id)
    .first<{ payload: string }>();
  if (!row) throw new ApiError(404, "Müraciət tapılmadı.");
  const app = JSON.parse(row.payload) as ApplicationRecord;
  const next: ApplicationRecord = {
    ...app,
    status: b.status,
    adminNote: b.adminNote ?? app.adminNote,
    decidedAt: new Date().toISOString(),
  };
  const commands: D1PreparedStatement[] = [];
  let message = `Müraciət ${b.status}: ${b.id}`;
  if (b.status === "approved" && "type" in app && app.status !== "approved") {
    const c = await catalog();
    if (app.type === "store") {
      const domain = app.domain.replace(/^www\./, "");
      const existing =
        c.stores.find((s) => s.id === b.storeId) ||
        c.stores.find((s) => s.domain.replace(/^www\./, "") === domain);
      const storeId = existing?.id || b.storeId || slug(domain);
      const verified = allowedHosts.includes(domain);
      const value: Store = {
        ...(existing || {
          id: storeId,
          color: "#1f5eff",
          description: "",
          active: false,
          plan: "free" as const,
        }),
        id: storeId,
        name: existing?.name || app.storeName,
        domain: existing?.domain || domain,
        kind: app.kind,
        contacts: { ...existing?.contacts, ...app.contacts },
        // A new domain stays inactive until its source adapter is connected.
        active: existing ? existing.active : false,
        sourceStatus:
          existing?.sourceStatus ||
          (verified
            ? "Müraciət təsdiqləndi — mənbə idxalını başladın"
            : "Müraciət təsdiqləndi — mənbə qoşulması gözləyir"),
      };
      commands.push(statement("store", value));
      next.storeId = storeId;
      message = `Mağaza müraciəti təsdiqləndi: ${storeId}`;
    } else {
      const storeId =
        b.storeId ||
        app.storeId ||
        c.stores.find((s) => s.name.toLowerCase() === app.storeName.toLowerCase())?.id;
      const store = c.stores.find((s) => s.id === storeId);
      if (!store)
        throw new ApiError(
          400,
          "Təsdiq üçün kataloqdakı mağazanı seçin (əvvəlcə mağaza profilini yaradın).",
        );
      const startsAt = b.startsAt || today();
      const months = PERIODS.find((p) => p.id === app.period)?.months || 1;
      const endsAt = addMonths(startsAt, months);
      if (app.promotion === "premium") {
        commands.push(
          statement("store", { ...store, plan: "premium", planFrom: startsAt, planUntil: endsAt }),
        );
        message = `Premium plan aktivləşdirildi: ${store.id} (${startsAt} — ${endsAt})`;
      } else {
        const placement: Placement = {
          id: "app-" + app.id.slice(0, 8),
          type: app.promotion === "banner" ? "banner" : "store",
          targetId: store.id,
          storeId: store.id,
          slot: app.promotion === "banner" ? "banner" : "category-sponsored",
          label: "Reklam",
          startsAt,
          endsAt,
          active: true,
          note: app.target,
          applicationId: app.id,
          createdAt: new Date().toISOString(),
        };
        commands.push(statement("placement", placement));
        next.placementId = placement.id;
        message = `Reklam yerləşdirməsi yaradıldı: ${placement.id}`;
      }
      next.storeId = store.id;
    }
  }
  commands.push(statement("application", next));
  await db().batch(commands);
  await audit(user.userId, message);
  return json({ ok: true, storeId: next.storeId, placementId: next.placementId });
}

export async function placementsSave(req: Request, user: User) {
  const p = placementSchema.parse(await readJson(req)) as Placement;
  const c = await catalog();
  if (p.type === "store" && !c.stores.some((s) => s.id === p.targetId))
    throw new ApiError(400, "Mağaza tapılmadı.");
  if (p.type === "product" && !c.products.some((x) => x.id === p.targetId))
    throw new ApiError(400, "Məhsul tapılmadı.");
  if (p.storeId && !c.stores.some((s) => s.id === p.storeId))
    throw new ApiError(400, "Mağaza tapılmadı.");
  await statement("placement", { ...p, createdAt: p.createdAt || new Date().toISOString() }).run();
  await audit(user.userId, `Reklam yerləşdirməsi saxlanıldı: ${p.id}`);
  return json({ ok: true });
}

export async function placementsDelete(req: Request, user: User) {
  const b = z.object({ id }).parse(await readJson(req));
  await db()
    .prepare("DELETE FROM records WHERE id=? AND kind='placement'")
    .bind("placement:" + b.id)
    .run();
  await audit(user.userId, `Reklam yerləşdirməsi silindi: ${b.id}`);
  return json({ ok: true });
}

// Public: placements running today, for the storefront's labelled sponsored rows.
export async function livePlacements() {
  const now = Date.now();
  const rows = (await list<Placement>("placement")).filter((p) => placementLive(p, now));
  return json({
    placements: rows.map(({ id, type, targetId, storeId, slot, label, startsAt, endsAt }) => ({
      id,
      type,
      targetId,
      storeId,
      slot,
      label,
      startsAt,
      endsAt,
    })),
  });
}

// Merges a partial settings patch so saving one section never drops another.
export async function settingsPatch(req: Request, user: User) {
  const b = z
    .object({
      headline: z.string().min(3).max(100).optional(),
      announcement: z.string().max(160).optional(),
      plans: plansSettings.optional(),
      ads: adsSettings.optional(),
    })
    .parse(await readJson(req));
  const c = await catalog();
  const value = settingsSchema.parse({ ...c.settings, ...b, id: "main" });
  await statement("settings", value).run();
  await audit(user.userId, "Sayt parametrləri yeniləndi: " + Object.keys(b).join(", "));
  return json({ ok: true, settings: value });
}

// Owner answers or moderates a product question (record kind `question`).
export async function answerQuestion(req: Request, user: User) {
  const b = z
    .object({
      id: z.string().max(100),
      answer: z.string().trim().max(2000).optional(),
      status: z.enum(["pending", "approved", "rejected"]),
    })
    .parse(await readJson(req));
  const row = await db()
    .prepare("SELECT payload FROM records WHERE id=? AND kind='question'")
    .bind("question:" + b.id)
    .first<{ payload: string }>();
  if (!row) throw new ApiError(404, "Sual tapılmadı.");
  const q = JSON.parse(row.payload) as {
    id: string;
    status?: string;
    answer?: string;
    answeredAt?: string;
    answeredBy?: string;
  };
  const answered = b.answer !== undefined && b.answer !== q.answer;
  await statement("question", {
    ...q,
    status: b.status,
    ...(b.answer !== undefined
      ? {
          answer: b.answer || undefined,
          answeredAt: answered ? new Date().toISOString() : q.answeredAt,
          answeredBy: answered ? "Qəpik" : q.answeredBy,
        }
      : {}),
  }).run();
  await audit(user.userId, `Sual ${b.status}${answered ? " və cavablandı" : ""}: ${b.id}`);
  return json({ ok: true });
}
