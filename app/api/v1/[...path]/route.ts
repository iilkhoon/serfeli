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
import { materializeCatalog } from "../../../../lib/catalog-storage";
import {
  applyProductMatches,
  mergeDuplicateProducts,
  prepareProductMatch,
  productMatchCandidates,
  type ProductMatch,
} from "../../../../lib/product-matching";
import { withProductMatchLock, MatchConflictError } from "../../../../lib/match-store";
import { canonicalProductId } from "../../../../lib/catalog";
import { env } from "cloudflare:workers";
import { getChatGPTUser, type ChatGPTUser } from "../../../chatgpt-auth";
import { scanProduct, safeMerchantUrl } from "../../../../lib/extractor";
import {
  ApiError,
  MAX_BODY,
  bareHost,
  crossSite,
  errorResponse,
  rateLimited,
  readJson,
} from "../../../../lib/api/http";
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
import {
  answerQuestion,
  applicationPost,
  decideApplication,
  livePlacements,
  myApplications,
  placementsDelete,
  placementsSave,
  settingsPatch,
} from "../../../../lib/api/merchant";
import {
  adminListQuestions,
  approvedQuestions,
  createQuestion,
  productViews,
  recordView,
  topViewed,
  viewsByDay,
} from "../../../../lib/engagement";
export const dynamic = "force-dynamic";

const json = (v: unknown, status = 200) =>
  Response.json(v, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });

const clientKey = (req: Request, user: ChatGPTUser | null) =>
  user?.userId || req.headers.get("cf-connecting-ip") || "anonymous";
const tooMany = () =>
  Response.json(
    { error: "Çox sayda sorğu. Bir az sonra yenidən cəhd edin." },
    { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } },
  );

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
    let progress = await materializeCatalog(db());
    while (!progress.complete) progress = await materializeCatalog(db());
    await statement("system", { id: "seed" }).run();
  }
  return json({ ok: true });
}

async function personalGet(user: ChatGPTUser | null) {
  if (!user) return json({ favorites: [], alerts: [] });
  const r = await db()
    .prepare("SELECT kind,payload FROM personal WHERE user_id=? ORDER BY updated_at DESC")
    .bind(user.userId)
    .all<{ kind: string; payload: string }>();
  const aliases = (await publicCatalog()).productAliases || {};
  const unique = (kind: string) => {
    const found = new Map();
    for (const row of r.results.filter((v) => v.kind === kind)) {
      const value = JSON.parse(row.payload);
      const productId = canonicalProductId({ productAliases: aliases }, value.productId);
      if (!found.has(productId)) found.set(productId, { ...value, productId });
    }
    return [...found.values()];
  };
  return json({ favorites: unique("favorite"), alerts: unique("alert") });
}

async function personalPost(req: Request, user: ChatGPTUser) {
  const b = z
    .object({
      kind: z.enum(["favorite", "alert"]),
      productId: id,
      target: z.number().positive().max(10000000).optional(),
      remove: z.boolean().optional(),
    })
    .parse(await readJson(req));
  const c = await publicCatalog();
  b.productId = canonicalProductId(c, b.productId);
  if (!b.remove && !c.products.some((p) => p.id === b.productId && p.active))
    return json({ error: "Məhsul tapılmadı." }, 404);
  const key = `${user.userId}:${b.kind}:${b.productId}`;
  if (b.remove) {
    const ids = [
      b.productId,
      ...Object.keys(c.productAliases || {}).filter(
        (alias) => c.productAliases![alias] === b.productId,
      ),
    ];
    await runBatched(
      ids.map((pid) =>
        db()
          .prepare("DELETE FROM personal WHERE id=? AND user_id=?")
          .bind(`${user.userId}:${b.kind}:${pid}`, user.userId),
      ),
    );
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
    .parse(await readJson(req));
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

async function clickPost(req: Request) {
  const b = z.object({ offerId: id }).parse(await readJson(req));
  const c = await catalog();
  const o = c.offers.find((o) => o.id === b.offerId);
  if (!o) return json({ error: "Təklif tapılmadı." }, 404);
  if (o.demo) return json({ error: "Nümunə təklifdən alış edilmir." }, 400);
  try {
    safeMerchantUrl(o.url);
  } catch {
    throw new ApiError(400, "Mağaza linki etibarlı deyil.");
  }
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
    "placement",
    "question",
    "view",
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
  if (!s || !c.products.some((p) => p.id === v.productId))
    throw new ApiError(400, messages.missing);
  // Store domains may be saved with "www." (e.g. www.barkodelectronics.az).
  if (bareHost(safeMerchantUrl(v.url).hostname) !== bareHost(s.domain))
    throw new ApiError(400, messages.domain);
  if (v.months > 0 && v.installmentTotal < v.price)
    throw new ApiError(400, "Taksit yekunu nağd qiymətdən az ola bilməz.");
  v.checkedAt = new Date().toISOString();
}

async function adminSave(req: Request, user: ChatGPTUser) {
  const b = saveRequest.parse(await readJson(req));
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
  const b = z.object({ offers: z.array(offer).min(1).max(100) }).parse(await readJson(req));
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
    .parse(await readJson(req));
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
  const b = z
    .object({ kind: z.enum(["product", "store", "offer"]), id })
    .parse(await readJson(req));
  if (/^(wc-|tap-|soliton-)/.test(b.id))
    throw new ApiError(
      409,
      "Bu qeyd mənbə kataloqundan gəlir. Məhsulu redaktə edərək deaktiv edin və ya mağazanı deaktiv edin.",
    );
  if (b.kind !== "offer") {
    const c = await catalog();
    if (c.offers.some((o) => (b.kind === "product" ? o.productId === b.id : o.storeId === b.id)))
      throw new ApiError(409, "Əvvəlcə bu qeydə bağlı təklifləri silin və ya qeydi deaktiv edin.");
  }
  await db()
    .prepare("DELETE FROM records WHERE id=? AND kind=?")
    .bind(`${b.kind}:${b.id}`, b.kind)
    .run();
  await audit(user.userId, `${b.kind}: ${b.id} silindi`);
  return json({ ok: true });
}

async function matchesGet(req: Request) {
  const query = new URL(req.url).searchParams;
  const c = await catalog(),
    matches = await list<ProductMatch>("productMatch");
  // Pairs the public catalog already folds automatically need no review.
  const folded = mergeDuplicateProducts(applyProductMatches(c, matches), matches);
  const candidates = productMatchCandidates(
    c,
    matches,
    (query.get("q") || "").slice(0, 100),
  ).filter(
    (pair) =>
      canonicalProductId(folded, pair.source.id) !== canonicalProductId(folded, pair.target.id),
  );
  const requested = Number(query.get("offset"));
  const offset = Math.min(
    Number.isFinite(requested) ? Math.max(0, Math.floor(requested / 24) * 24) : 0,
    Math.max(0, Math.ceil(candidates.length / 24) - 1) * 24,
  );
  const aliases = applyProductMatches(c, matches).productAliases || {};
  return json({
    candidates: candidates.slice(offset, offset + 24),
    total: candidates.length,
    offset,
    approved: matches
      .filter((m) => m.active)
      .map((m) => ({
        id: m.id,
        sourceId: m.sourceId,
        targetId: m.targetId,
        sourceName: c.products.find((p) => p.id === m.sourceId)?.name || m.sourceId,
        targetName: c.products.find((p) => p.id === m.targetId)?.name || m.targetId,
        approvedAt: m.approvedAt,
        valid: aliases[m.sourceId] === m.targetId,
      })),
    stores: c.stores.map((s) => ({ id: s.id, name: s.name })),
    offers: [
      ...new Map(
        candidates
          .slice(offset, offset + 24)
          .flatMap((pair) =>
            c.offers.filter(
              (o) => !o.demo && [pair.source.id, pair.target.id].includes(o.productId),
            ),
          )
          .map((o) => [o.id, o]),
      ).values(),
    ],
  });
}
async function matchesPost(req: Request, user: ChatGPTUser) {
  const b = z
    .discriminatedUnion("action", [
      z.object({
        action: z.literal("approve"),
        sourceId: id,
        targetId: id,
        sourceSignature: z.string().max(20000),
        targetSignature: z.string().max(20000),
        confirmed: z.literal(true),
      }),
      z.object({ action: z.literal("revoke"), id }),
    ])
    .parse(await readJson(req));
  try {
    return await withProductMatchLock(db(), async (save) => {
      const matches = await list<ProductMatch>("productMatch");
      if (b.action === "revoke") {
        const existing = matches.find((m) => m.id === b.id);
        if (!existing) return json({ error: "Uyğunlaşdırma tapılmadı." }, 404);
        if (existing.active)
          await save([
            { kind: "productMatch", id: existing.id, value: { ...existing, active: false } },
            {
              kind: "audit",
              id: crypto.randomUUID(),
              value: {
                userId: user.userId,
                action: "Məhsul uyğunlaşdırması geri alındı: " + b.id,
                date: new Date().toISOString(),
              },
            },
          ]);
        return json({ ok: true });
      }
      const raw = await catalog();
      const match = prepareProductMatch(raw, b.sourceId, b.targetId, matches);
      if (
        match.sourceSignature !== b.sourceSignature ||
        match.targetSignature !== b.targetSignature
      )
        return json({ error: "Məhsul məlumatı dəyişib. Siyahını yeniləyib yenidən yoxla." }, 409);
      await save([
        { kind: "productMatch", id: match.id, value: match },
        {
          kind: "audit",
          id: crypto.randomUUID(),
          value: {
            userId: user.userId,
            action: `Məhsullar uyğunlaşdırıldı: ${b.sourceId} → ${b.targetId}`,
            date: match.approvedAt,
          },
        },
      ]);
      return json({ ok: true });
    });
  } catch (error) {
    if (error instanceof MatchConflictError) return json({ error: error.message }, 409);
    throw error;
  }
}

async function admin(req: Request, path: string, user: ChatGPTUser) {
  const route = `${req.method} ${path}`;
  const url = new URL(req.url);
  switch (route) {
    case "POST admin/catalog/materialize":
      return json(await materializeCatalog(db()));
    case "GET admin/matches":
      return matchesGet(req);
    case "POST admin/matches":
      return matchesPost(req, user);
    case "GET admin/jobs":
      return json(await listCrawlJobs(db()));
    case "POST admin/jobs/start": {
      const b = z.object({ sourceId: z.string().max(50) }).parse(await readJson(req));
      const job = await startCrawlJob(db(), b.sourceId);
      await audit(user.userId, "Mənbə idxalı hazırlandı: " + b.sourceId);
      return json(job);
    }
    case "POST admin/jobs/tick":
      return json(await tickCrawlJob(db(), z.object({ id }).parse(await readJson(req)).id));
    case "POST admin/jobs/control": {
      const b = z
        .object({ id, action: z.enum(["pause", "resume", "cancel"]) })
        .parse(await readJson(req));
      return json(await controlCrawlJob(db(), b.id, b.action));
    }
    case "GET admin/catalog":
      return json(await catalog());
    case "GET admin/data":
      return adminData();
    case "POST admin/feed-preview":
      return json(await fetchTechnomania());
    case "POST admin/feed-sync":
      return feedSync(user);
    case "POST admin/scan":
      return json(
        await scanProduct(z.object({ url: z.string().url() }).parse(await readJson(req)).url),
      );
    case "POST admin/save":
      return adminSave(req, user);
    case "POST admin/import":
      return adminImport(req, user);
    case "POST admin/moderate":
      return adminModerate(req, user);
    case "POST admin/delete":
      return adminDelete(req, user);
    case "POST admin/applications/decide":
      return decideApplication(req, user);
    case "POST admin/placements":
      return placementsSave(req, user);
    case "POST admin/placements/delete":
      return placementsDelete(req, user);
    case "POST admin/settings":
      return settingsPatch(req, user);
    case "POST admin/questions/answer":
      return answerQuestion(req, user);
    // Storefront engagement data for the admin panel (lib/engagement.ts).
    case "GET admin/questions":
      return json(await adminListQuestions(url.searchParams.get("status")));
    case "GET admin/views":
      return json({
        top: await topViewed(Number(url.searchParams.get("days")) || 30, 50),
        daily: await viewsByDay(Number(url.searchParams.get("days")) || 30),
      });
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
    if (Number(req.headers.get("content-length") || 0) > MAX_BODY)
      return json({ error: "Məlumat 500 KB limitini keçir." }, 413);
    if (path === "click" && method === "POST") {
      if (rateLimited("click:" + clientKey(req, user), 60)) return tooMany();
      return clickPost(req);
    }
    // Anonymous view counter: limited per IP in memory only; nothing about the viewer is stored.
    if (path === "view" && method === "POST") {
      if (rateLimited("view:" + (req.headers.get("cf-connecting-ip") || "anonymous"), 30))
        return tooMany();
      return json(await recordView(await readJson(req, 2000)));
    }
    if (!user) return json({ error: "Bu əməliyyat üçün hesabınıza daxil olun." }, 401);
    // Public writes (favourites, reviews, applications); admin work is owner-only and unlimited.
    if (!path.startsWith("admin/")) {
      const strict = path === "reviews" || path === "applications" || path === "questions";
      if (rateLimited(path + ":" + user.userId, strict ? 5 : 60, strict ? 600000 : 60000))
        return tooMany();
    }
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
  if (method === "GET" && (path === "questions" || path === "views")) {
    const pid = url.searchParams.get("productId") || "";
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(pid)) return json({ error: "Məhsul göstərilməyib." }, 400);
    return path === "questions"
      ? json({ productId: pid, questions: await approvedQuestions(pid) })
      : json({ productId: pid, views: await productViews(pid) });
  }
  if (path === "views/top" && method === "GET")
    return json({
      days: Number(url.searchParams.get("days")) || 30,
      items: await topViewed(
        Number(url.searchParams.get("days")) || 30,
        Number(url.searchParams.get("limit")) || 10,
      ),
    });
  if (path === "placements" && method === "GET") return livePlacements();
  if (path === "applications/mine" && method === "GET")
    return user ? myApplications(user) : json({ applications: [] });
  if (method === "POST" && user) {
    if (path === "bootstrap") return bootstrap(user);
    if (path === "personal") return personalPost(req, user);
    if (path === "reviews") return reviewPost(req, user);
    if (path === "questions") return json(await createQuestion(await readJson(req), user));
    if (path === "applications") return applicationPost(req, user);
  }
  if (!path.startsWith("admin/")) return json({ error: "Ünvan tapılmadı." }, 404);
  if (!user) return json({ error: "Bu əməliyyat üçün hesabınıza daxil olun." }, 401);
  if ((await ownerId()) !== user.userId) return json({ error: "Admin icazəsi tələb olunur." }, 403);
  return admin(req, path, user);
}

async function handle(req: Request) {
  const admin = new URL(req.url).pathname.startsWith("/api/v1/admin/");
  try {
    // Awaited here so rejections from every delegated handler reach the catch below.
    const res = await route(req);
    // Views and new (pending) questions never change the public catalog.
    const path = new URL(req.url).pathname;
    if (req.method !== "GET" && res.ok && !/^\/api\/v1\/(view|questions)$/.test(path))
      invalidatePublicCatalog();
    return res;
  } catch (e) {
    console.error("API:", e instanceof Error ? e.name + ": " + e.message : String(e));
    const { status, error } = errorResponse(e, admin);
    return json({ error }, status);
  }
}
export const GET = handle;
export const POST = handle;
