import {
  listCrawlJobs,
  startCrawlJob,
  tickCrawlJob,
  controlCrawlJob,
} from "../../../../lib/crawl-jobs";
import sitemapCoverage from "../../../../docs/sitemap-source-coverage.json";
import { catalogSlice, parseCatalogQuery } from "../../../../lib/catalog-query";
import { invalidatePublicCatalog, publicCatalog } from "../../../../lib/public-data";
import { fetchTechnomania } from "../../../../lib/technomania";
import { env } from "cloudflare:workers";
import { getChatGPTUser, type ChatGPTUser } from "../../../chatgpt-auth";
import {
  seedCatalog,
  seedProducts,
  seedStores,
  seedOffers,
  seedHistory,
} from "../../../../lib/server-catalog";
import { scanProduct, safeMerchantUrl } from "../../../../lib/extractor";
import { id, offer, saveRequest } from "../../../../lib/api/schemas";
import {
  audit,
  catalog,
  db,
  list,
  ownerId,
  runBatched,
  statement,
} from "../../../../lib/api/records";
import { z } from "zod";
export const dynamic = "force-dynamic";

const json = (v: unknown, status = 200) =>
  Response.json(v, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });

// Browsers always send Origin and/or Sec-Fetch-Site on cross-site writes; reject either signal.
// Requests with neither header come from non-browser clients, which cannot ride the viewer's session.
function crossSite(req: Request, url: URL) {
  const origin = req.headers.get("origin");
  if (origin && origin !== url.origin) return true;
  const site = req.headers.get("sec-fetch-site");
  return !!site && site !== "same-origin" && site !== "none";
}

// When OWNER_EMAIL is configured only that account may claim the first-owner slot.
function mayClaimOwner(user: ChatGPTUser) {
  const allowed = env.OWNER_EMAIL?.trim().toLowerCase();
  return !allowed || user.email.trim().toLowerCase() === allowed;
}

async function bootstrap(user: ChatGPTUser) {
  // An existing owner can never be replaced here.
  if (!(await ownerId()) && !mayClaimOwner(user))
    return json({ error: "Bu hesab platforma sahibi kimi təyin edilə bilməz." }, 403);
  await db()
    .prepare(
      "INSERT OR IGNORE INTO records (id,kind,payload,updated_at) VALUES ('system:owner','system',?,?)",
    )
    .bind(JSON.stringify({ userId: user.userId }), Date.now())
    .run();
  if ((await ownerId()) !== user.userId)
    return json({ error: "Admin yalnız platforma sahibidir." }, 403);
  const seed = await db().prepare("SELECT id FROM records WHERE id='system:seed'").first();
  if (!seed) {
    await runBatched([
      ...seedProducts.map((v) => statement("product", v)),
      ...seedStores.map((v) => statement("store", v)),
      ...seedOffers.map((v) => statement("offer", v)),
      ...seedHistory.map((v) => statement("history", v)),
      statement("settings", { id: "main", ...seedCatalog.settings }),
    ]);
    await statement("system", { id: "seed" }).run();
  }
  return json({ ok: true });
}

async function personalGet(user: ChatGPTUser | null) {
  if (!user) return json({ favorites: [], alerts: [] });
  const r = await db()
    .prepare("SELECT kind,payload FROM personal WHERE user_id=?")
    .bind(user.userId)
    .all<{ kind: string; payload: string }>();
  return json({
    favorites: r.results.filter((v) => v.kind === "favorite").map((v) => JSON.parse(v.payload)),
    alerts: r.results.filter((v) => v.kind === "alert").map((v) => JSON.parse(v.payload)),
  });
}

async function personalPost(req: Request, user: ChatGPTUser) {
  const b = z
    .object({
      kind: z.enum(["favorite", "alert"]),
      productId: id,
      target: z.number().positive().optional(),
      remove: z.boolean().optional(),
    })
    .parse(await req.json());
  const c = await catalog();
  if (!b.remove && !c.products.some((p) => p.id === b.productId && p.active))
    return json({ error: "Məhsul tapılmadı." }, 404);
  const key = `${user.userId}:${b.kind}:${b.productId}`;
  if (b.remove) {
    await db()
      .prepare("DELETE FROM personal WHERE id=? AND user_id=?")
      .bind(key, user.userId)
      .run();
    return json({ ok: true });
  }
  if (b.kind === "alert" && !b.target) return json({ error: "Hədəf qiyməti daxil edin." }, 400);
  await db()
    .prepare(
      "INSERT INTO personal (id,user_id,kind,payload,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",
    )
    .bind(
      key,
      user.userId,
      b.kind,
      JSON.stringify({ productId: b.productId, target: b.target, date: new Date().toISOString() }),
      Date.now(),
    )
    .run();
  return json({ ok: true });
}

async function reviewPost(req: Request, user: ChatGPTUser) {
  const b = z
    .object({
      productId: id,
      rating: z.number().int().min(1).max(5),
      text: z.string().min(10).max(2000),
    })
    .parse(await req.json());
  const c = await catalog();
  if (!c.products.some((p) => p.id === b.productId))
    return json({ error: "Məhsul tapılmadı." }, 404);
  await statement("review", {
    ...b,
    id: crypto.randomUUID(),
    name: user.displayName,
    userId: user.userId,
    status: "pending",
    date: new Date().toISOString(),
  }).run();
  return json({ ok: true });
}

async function applicationPost(req: Request) {
  const b = z
    .object({
      company: z.string().min(2).max(150),
      email: z.string().email(),
      phone: z.string().min(9).max(30),
      website: z
        .string()
        .url()
        .refine((v) => v.startsWith("https://")),
      voen: z.string().regex(/^\d{10}$/),
      note: z.string().max(2000),
    })
    .parse(await req.json());
  await statement("application", {
    ...b,
    id: crypto.randomUUID(),
    status: "pending",
    date: new Date().toISOString(),
  }).run();
  return json({ ok: true });
}

async function clickPost(req: Request) {
  const b = z.object({ offerId: id }).parse(await req.json());
  const c = await catalog();
  const o = c.offers.find((o) => o.id === b.offerId);
  if (!o || o.demo) return json({ error: "Nümunə təklifdən alış edilmir." }, 400);
  safeMerchantUrl(o.url);
  await statement("click", {
    id: crypto.randomUUID(),
    offerId: o.id,
    storeId: o.storeId,
    date: new Date().toISOString(),
  }).run();
  return json({ url: o.url });
}

const historyPoint = (productId: string, price: number, date: string) =>
  statement("history", { id: crypto.randomUUID(), productId, price, date, demo: false });

async function adminData() {
  const kinds = [
    "product",
    "store",
    "offer",
    "history",
    "review",
    "application",
    "audit",
    "click",
    "feed",
  ];
  const all = await Promise.all(kinds.map((k) => list(k)));
  const c = await catalog();
  return json({
    ...Object.fromEntries(kinds.map((k, i) => [k, all[i]])),
    product: c.products,
    offer: c.offers,
    store: c.stores,
    sourceCoverage: c.sourceCoverage,
    sitemapCoverage,
  });
}

async function feedSync(user: ChatGPTUser) {
  const feed = await fetchTechnomania();
  const c = await catalog();
  const currentIds = new Set(c.products.map((p) => p.id));
  const knownIds = new Set(feed.offers.map((o) => o.id));
  const commands: D1PreparedStatement[] = [];
  for (const p of feed.products) {
    if (p.id === "iphone16-black" && currentIds.has(p.id)) {
      const old = c.products.find((x) => x.id === p.id)!;
      commands.push(statement("product", { ...old, familyId: p.familyId }));
      continue;
    }
    commands.push(statement("product", p));
  }
  for (const o of feed.offers) commands.push(statement("offer", o));
  for (const old of c.offers.filter(
    (o) => o.storeId === "technomania" && o.id.startsWith("tm-offer-") && !knownIds.has(o.id),
  ))
    commands.push(statement("offer", { ...old, stock: false, checkedAt: feed.checkedAt }));
  const changedProducts = new Set(feed.offers.filter((o) => o.stock).map((o) => o.productId));
  for (const pid of changedProducts) {
    const candidates = [
      ...feed.offers,
      ...c.offers.filter((o) => o.storeId !== "technomania"),
    ].filter((o) => o.productId === pid && o.stock && !o.demo);
    if (candidates.length)
      commands.push(
        historyPoint(pid, Math.min(...candidates.map((o) => o.price + o.shipping)), feed.checkedAt),
      );
  }
  commands.push(
    statement("feed", {
      id: "technomania",
      source: feed.source,
      checkedAt: feed.checkedAt,
      sourceCount: feed.sourceCount,
      variantCount: feed.variantCount,
      inStock: feed.inStock,
      warnings: feed.warnings,
    }),
  );
  await runBatched(commands, 45);
  await audit(
    user.userId,
    `Technomania rəsmi feed yeniləndi: ${feed.sourceCount} məhsul / ${feed.variantCount} variant`,
  );
  return json({
    ok: true,
    sourceCount: feed.sourceCount,
    variantCount: feed.variantCount,
    inStock: feed.inStock,
    warnings: feed.warnings,
    checkedAt: feed.checkedAt,
  });
}

async function checkOffer(v: z.infer<typeof offer>, messages: { missing: string; domain: string }) {
  const c = await catalog();
  const s = c.stores.find((s) => s.id === v.storeId);
  if (!s || !c.products.some((p) => p.id === v.productId)) throw new Error(messages.missing);
  if (safeMerchantUrl(v.url).hostname.replace(/^www\./, "") !== s.domain)
    throw new Error(messages.domain);
  if (v.months > 0 && v.installmentTotal < v.price)
    throw new Error("Taksit yekunu nağd qiymətdən az ola bilməz.");
  v.checkedAt = new Date().toISOString();
}

async function adminSave(req: Request, user: ChatGPTUser) {
  const b = saveRequest.parse(await req.json());
  if (b.kind === "offer")
    await checkOffer(b.value, {
      missing: "Məhsul və mağaza mövcud olmalıdır.",
      domain: "Təklifin linki seçilmiş mağazaya aid deyil.",
    });
  await statement(b.kind, b.value).run();
  if (b.kind === "offer" && !b.value.demo)
    await historyPoint(
      b.value.productId,
      b.value.price + b.value.shipping,
      b.value.checkedAt,
    ).run();
  await audit(user.userId, `${b.kind}: ${b.value.id} yadda saxlanıldı`);
  return json({ ok: true });
}

async function adminImport(req: Request, user: ChatGPTUser) {
  const b = z.object({ offers: z.array(offer).min(1).max(100) }).parse(await req.json());
  for (const v of b.offers)
    await checkOffer(v, {
      missing: `Naməlum məhsul və ya mağaza: ${v.id}`,
      domain: `Mağaza domeni uyğun deyil: ${v.id}`,
    });
  await runBatched(
    b.offers.flatMap((v) => [
      statement("offer", v),
      ...(!v.demo ? [historyPoint(v.productId, v.price + v.shipping, v.checkedAt)] : []),
    ]),
  );
  await audit(user.userId, `${b.offers.length} təklif idxal edildi`);
  return json({ ok: true, count: b.offers.length });
}

async function adminModerate(req: Request, user: ChatGPTUser) {
  const b = z
    .object({
      kind: z.enum(["review", "application"]),
      id: z.string().max(100),
      status: z.enum(["approved", "rejected"]),
    })
    .parse(await req.json());
  const r = await db()
    .prepare("SELECT payload FROM records WHERE id=? AND kind=?")
    .bind(`${b.kind}:${b.id}`, b.kind)
    .first<{ payload: string }>();
  if (!r) return json({ error: "Qeyd tapılmadı." }, 404);
  await statement(b.kind, { ...JSON.parse(r.payload), status: b.status }).run();
  await audit(user.userId, `${b.kind}: ${b.status}`);
  return json({ ok: true });
}

async function adminDelete(req: Request, user: ChatGPTUser) {
  const b = z.object({ kind: z.enum(["product", "store", "offer"]), id }).parse(await req.json());
  if (/^(wc-|tap-|soliton-)/.test(b.id))
    throw new Error(
      "Bu qeyd mənbə kataloqundan gəlir. Məhsulu redaktə edərək deaktiv edin və ya mağazanı deaktiv edin.",
    );
  if (b.kind !== "offer") {
    const c = await catalog();
    if (c.offers.some((o) => (b.kind === "product" ? o.productId === b.id : o.storeId === b.id)))
      throw new Error("Əvvəlcə bu qeydə bağlı təklifləri silin və ya qeydi deaktiv edin.");
  }
  await db()
    .prepare("DELETE FROM records WHERE id=? AND kind=?")
    .bind(`${b.kind}:${b.id}`, b.kind)
    .run();
  await audit(user.userId, `${b.kind}: ${b.id} silindi`);
  return json({ ok: true });
}

async function admin(req: Request, path: string, user: ChatGPTUser) {
  const route = `${req.method} ${path}`;
  switch (route) {
    case "GET admin/jobs":
      return json(await listCrawlJobs(db()));
    case "POST admin/jobs/start": {
      const b = z.object({ sourceId: z.string().max(50) }).parse(await req.json());
      const job = await startCrawlJob(db(), b.sourceId);
      await audit(user.userId, "Mənbə idxalı hazırlandı: " + b.sourceId);
      return json(job);
    }
    case "POST admin/jobs/tick":
      return json(await tickCrawlJob(db(), z.object({ id }).parse(await req.json()).id));
    case "POST admin/jobs/control": {
      const b = z.object({ id, action: z.enum(["pause", "resume"]) }).parse(await req.json());
      return json(await controlCrawlJob(db(), b.id, b.action));
    }
    case "GET admin/catalog":
      return json(await publicCatalog());
    case "GET admin/data":
      return adminData();
    case "POST admin/feed-preview":
      return json(await fetchTechnomania());
    case "POST admin/feed-sync":
      return feedSync(user);
    case "POST admin/scan":
      return json(
        await scanProduct(z.object({ url: z.string().url() }).parse(await req.json()).url),
      );
    case "POST admin/save":
      return adminSave(req, user);
    case "POST admin/import":
      return adminImport(req, user);
    case "POST admin/moderate":
      return adminModerate(req, user);
    case "POST admin/delete":
      return adminDelete(req, user);
  }
  return json({ error: "Əməliyyat tapılmadı." }, 404);
}

async function route(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace("/api/v1/", "");
  const method = req.method;
  const user = await getChatGPTUser();
  if (method !== "GET") {
    if (crossSite(req, url)) return json({ error: "Sorğunun mənbəyi uyğun deyil." }, 403);
    if (Number(req.headers.get("content-length") || 0) > 500000)
      return json({ error: "Məlumat 500 KB limitini keçir." }, 413);
    if (path === "click" && method === "POST") return clickPost(req);
    if (!user) return json({ error: "Bu əməliyyat üçün hesabınıza daxil olun." }, 401);
  }
  if (path === "catalog" && method === "GET")
    return json(catalogSlice(await publicCatalog(), parseCatalogQuery(url.searchParams)));
  if (path === "session" && method === "GET") {
    const owner = await ownerId();
    return json({
      user: user ? { id: user.userId, name: user.displayName } : null,
      admin: !!user && owner === user.userId,
      needsSetup: !owner,
    });
  }
  if (path === "personal" && method === "GET") return personalGet(user);
  if (method === "POST" && user) {
    if (path === "bootstrap") return bootstrap(user);
    if (path === "personal") return personalPost(req, user);
    if (path === "reviews") return reviewPost(req, user);
    if (path === "applications") return applicationPost(req);
  }
  if (!path.startsWith("admin/")) return json({ error: "Ünvan tapılmadı." }, 404);
  if (!user || (await ownerId()) !== user.userId)
    return json({ error: "Admin icazəsi tələb olunur." }, 403);
  return admin(req, path, user);
}

async function handle(req: Request) {
  try {
    // Awaited here so rejections from every delegated handler reach the catch below.
    const res = await route(req);
    if (req.method !== "GET" && res.ok) invalidatePublicCatalog();
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("API:", message);
    return json(
      {
        error:
          e instanceof z.ZodError
            ? "Daxil edilən məlumatlar düzgün deyil: " +
              e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
            : message || "Əməliyyat alınmadı.",
      },
      400,
    );
  }
}
export const GET = handle;
export const POST = handle;
