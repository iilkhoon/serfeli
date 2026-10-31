import { knownSourceProduct } from "./store-snapshots";
import type { D1Database } from "@cloudflare/workers-types";
import {
  crawlSources,
  sourceUrlAllowed,
  isProductCandidate,
  parseSitemap,
  discoverCategoryLinks,
  categoryPagesFromSitemap,
} from "./crawl-sources";
import {
  scanProduct,
  readMerchantSitemap,
  merchantPage,
  SourceAccessError,
  crawlDelayMs,
  type ScannedProduct,
} from "./extractor";
import { brandFromName, extractListing, listingCategories } from "./listing-sources";
import type { Product, Offer } from "./catalog";
import { materializeCatalog } from "./catalog-storage";
type Status = "discovering" | "importing" | "waiting" | "paused" | "blocked" | "complete";
export type CrawlJob = {
  id: string;
  sourceId: string;
  status: Status;
  phase: "discovering" | "importing";
  // advertised: a sitemap listed by a sitemap index (robots.txt rules were applied to the index).
  queue: { url: string; html?: boolean; advertised?: boolean }[];
  seen: string[];
  // Product URLs already queued from category pages, so overlapping categories are read once.
  found?: string[];
  listingPages?: number;
  chunkCount: number;
  cursorChunk: number;
  cursorOffset: number;
  discovered: number;
  imported: number;
  failed: number;
  skipped: number;
  processed: number;
  nextRunAt: number;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  leaseUntil?: number;
  leaseToken?: string;
  pauseRequested?: boolean;
  lastError?: string;
  lastUrl?: string;
  recent: { url: string; error: string }[];
};
const key = (id: string) => "crawlJob:" + id;
const encode = (value: unknown) => JSON.stringify(value);
function put(
  db: D1Database,
  kind: string,
  id: string,
  value: unknown,
  guard?: { id: string; token: string },
) {
  const data = [kind + ":" + id, kind, encode(value), Date.now()];
  return guard
    ? db
        .prepare(
          "INSERT INTO records(id,kind,payload,updated_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND json_extract(payload,'$.leaseToken')=?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",
        )
        .bind(...data, key(guard.id), guard.token)
    : db
        .prepare(
          "INSERT INTO records(id,kind,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",
        )
        .bind(...data);
}
async function getJob(db: D1Database, id: string) {
  const row = await db
    .prepare("SELECT payload FROM records WHERE id=? AND kind=?")
    .bind(key(id), "crawlJob")
    .first<{ payload: string }>();
  if (!row) throw new Error("İdxal işi tapılmadı.");
  return JSON.parse(row.payload) as CrawlJob;
}
export function jobSummary(j: CrawlJob) {
  const { queue, seen, recent, leaseToken, found, ...value } = j;
  return { ...value, pendingMaps: queue.length, readMaps: seen.length, recent: recent.slice(-6) };
}
export type CrawlRuntime = {
  runId: string;
  startedAt: number;
  completedAt?: number;
  status: "running" | "complete" | "error";
  jobs: number;
  ticks: number;
  errors: { jobId?: string; message: string }[];
};
async function crawlRuntime(db: D1Database): Promise<CrawlRuntime | null> {
  const row = await db
    .prepare("SELECT payload FROM records WHERE id='crawlRuntime:scheduled'")
    .first<{ payload: string }>();
  return row ? JSON.parse(row.payload) : null;
}
export async function listCrawlJobs(db: D1Database) {
  const rows = await db
    .prepare("SELECT payload FROM records WHERE kind='crawlJob' ORDER BY updated_at DESC LIMIT 30")
    .all<{ payload: string }>();
  return {
    sources: crawlSources,
    jobs: rows.results.map((r) => jobSummary(JSON.parse(r.payload))),
    runtime: await crawlRuntime(db),
  };
}
export async function startCrawlJob(db: D1Database, sourceId: string) {
  const source = crawlSources.find((s) => s.id === sourceId);
  if (!source) throw new Error("İdxal mənbəyi düzgün deyil.");
  const existing = await db
    .prepare(
      "SELECT payload FROM records WHERE kind='crawlJob' AND json_extract(payload,'$.sourceId')=? AND json_extract(payload,'$.status')!='complete' ORDER BY updated_at DESC LIMIT 1",
    )
    .bind(sourceId)
    .first<{ payload: string }>();
  if (existing) return jobSummary(JSON.parse(existing.payload));
  const now = new Date().toISOString();
  const j: CrawlJob = {
    id: crypto.randomUUID(),
    sourceId,
    status: "discovering",
    phase: "discovering",
    queue: [source.listingStart ? { url: source.listingStart, html: true } : { url: source.root }],
    seen: [],
    chunkCount: 0,
    cursorChunk: 0,
    cursorOffset: 0,
    discovered: 0,
    imported: 0,
    failed: 0,
    skipped: 0,
    processed: 0,
    nextRunAt: 0,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
    recent: [],
  };
  try {
    await put(db, "crawlJob", j.id, j).run();
  } catch (e) {
    const current = await db
      .prepare(
        "SELECT payload FROM records WHERE kind='crawlJob' AND json_extract(payload,'$.sourceId')=? AND json_extract(payload,'$.status')!='complete' LIMIT 1",
      )
      .bind(sourceId)
      .first<{ payload: string }>();
    if (current) return jobSummary(JSON.parse(current.payload));
    throw e;
  }
  return jobSummary(j);
}
export async function controlCrawlJob(
  db: D1Database,
  id: string,
  action: "pause" | "resume" | "cancel",
) {
  const j = await getJob(db, id);
  if (j.status === "complete") return jobSummary(j);
  if (action === "cancel") {
    // Ends the run; already imported products stay. The next start or refresh begins a fresh run.
    if ((j.leaseUntil || 0) > Date.now()) throw new Error("Cari sorğu tamamlanana qədər gözləyin.");
    j.status = "complete";
    j.pauseRequested = false;
    j.lastError = "Admin tərəfindən dayandırılıb.";
    await put(db, "crawlJob", id, j).run();
  } else if (action === "pause") {
    await db
      .prepare(
        "UPDATE records SET payload=json_set(payload,'$.pauseRequested',1,'$.status','paused'),updated_at=? WHERE id=?",
      )
      .bind(Date.now(), key(id))
      .run();
  } else {
    if ((j.leaseUntil || 0) > Date.now()) throw new Error("Cari sorğu tamamlanana qədər gözləyin.");
    j.pauseRequested = false;
    j.retryCount = 0;
    j.leaseToken = crypto.randomUUID();
    j.status = j.phase;
    delete j.lastError;
    await put(db, "crawlJob", id, j).run();
  }
  return jobSummary(await getJob(db, id));
}
// Offers of this store that a finished run did not see again are no longer known to be in stock.
// Skipped when the run imported (almost) nothing, so a broken parser or an empty sitemap cannot
// wipe a store; the age sweep in tickDueCrawlJobs covers those cases later.
function expireUnseenOffers(db: D1Database, j: CrawlJob) {
  if (!(j.imported > 0 && j.imported * 10 >= j.imported + j.failed)) return [];
  return [
    db
      .prepare(
        "UPDATE records SET payload=json_set(payload,'$.stock',json('false'),'$.stockKnown',json('false')),updated_at=? WHERE kind='offer' AND json_extract(payload,'$.storeId')=? AND coalesce(json_extract(payload,'$.demo'),0)=0 AND json_extract(payload,'$.checkedAt')<? AND (coalesce(json_extract(payload,'$.stock'),0)=1 OR coalesce(json_extract(payload,'$.stockKnown'),1)=1) AND EXISTS(SELECT 1 FROM records WHERE id=? AND json_extract(payload,'$.leaseToken')=?)",
      )
      .bind(Date.now(), j.sourceId, j.createdAt, key(j.id), j.leaseToken || ""),
  ];
}
// Offers of a crawled store older than this are shown as unknown stock even when no run finished
// (blocked or paused source).
export const offerMaxAgeMs = (refreshHours: number) => Math.max(7 * 24, refreshHours * 3) * 3600000;
export async function expireStaleOffers(db: D1Database, now = Date.now()) {
  const statements = crawlSources.map((source) =>
    db
      .prepare(
        "UPDATE records SET payload=json_set(payload,'$.stock',json('false'),'$.stockKnown',json('false')),updated_at=? WHERE kind='offer' AND json_extract(payload,'$.storeId')=? AND coalesce(json_extract(payload,'$.demo'),0)=0 AND json_extract(payload,'$.checkedAt')<? AND (coalesce(json_extract(payload,'$.stock'),0)=1 OR coalesce(json_extract(payload,'$.stockKnown'),1)=1)",
      )
      .bind(now, source.id, new Date(now - offerMaxAgeMs(source.refreshHours)).toISOString()),
  );
  const results = await db.batch(statements);
  return results.reduce((n, r) => n + (r.meta?.changes || 0), 0);
}
async function saveJob(db: D1Database, j: CrawlJob, statements: D1PreparedStatement[] = []) {
  j.updatedAt = new Date().toISOString();
  j.leaseUntil = 0;
  if (j.status === "complete") statements = [...statements, ...expireUnseenOffers(db, j)];
  const value = encode(j);
  const update = db
    .prepare(
      "UPDATE records SET payload=CASE WHEN json_extract(payload,'$.pauseRequested')=1 THEN json_set(?,'$.status','paused','$.pauseRequested',1) ELSE ? END,updated_at=? WHERE id=? AND json_extract(payload,'$.leaseToken')=?",
    )
    .bind(value, value, Date.now(), key(j.id), j.leaseToken || "");
  await db.batch([...statements, update]);
  return jobSummary(await getJob(db, j.id));
}
async function acquireHost(db: D1Database, host: string, token: string) {
  const now = Date.now();
  const r = await db
    .prepare(
      "INSERT INTO records(id,kind,payload,updated_at) VALUES(?,'crawlLock',?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at WHERE json_extract(records.payload,'$.until')<=?",
    )
    .bind("crawlLock:" + host, encode({ until: now + 240000, token }), now, now)
    .run();
  return r.meta.changes === 1;
}
async function releaseHost(db: D1Database, host: string, delay: number, token: string) {
  await db
    .prepare(
      "UPDATE records SET payload=?,updated_at=? WHERE id=? AND json_extract(payload,'$.token')=?",
    )
    .bind(
      encode({ until: Date.now() + Math.max(1500, delay), token }),
      Date.now(),
      "crawlLock:" + host,
      token,
    )
    .run();
}
function categoryOf(name: string) {
  const n = name.toLocaleLowerCase("az");
  if (/qulaql|airpods|dinamik|audio|headphone/.test(n)) return "audio";
  if (/iphone|smartfon|galaxy|redmi|poco|honor/.test(n)) return "telefon";
  if (/noutbuk|notebook|macbook|laptop/.test(n)) return "noutbuk";
  if (/planşet|planset|ipad/.test(n)) return "planset";
  if (/televizor|television|tv /.test(n)) return "tv";
  if (/saat|watch/.test(n)) return "saat";
  if (/playstation|xbox|oyun/.test(n)) return "oyun";
  if (/kitab|isbn/.test(n)) return "kitab";
  if (/foto|kamera|camera/.test(n)) return "foto";
  if (/fen|saç|hair|kosmet|ətir/.test(n)) return "gozellik";
  if (/soyuducu|paltaryuyan|qabyuyan|tozsoran|soba|ütü|mikser|blender|meishet|meiset/.test(n))
    return "ev";
  return "aksesuar";
}
async function identity(sourceId: string, url: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url));
  return (
    "crawl-" +
    sourceId +
    "-" +
    Array.from(new Uint8Array(digest))
      .slice(0, 12)
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("")
  );
}
// A single product that must not be written (its identity changed); the run continues.
class SkipItemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkipItemError";
  }
}
function remember(j: CrawlJob, url: string, message: string) {
  j.lastError = message;
  j.recent = [...j.recent, { url, error: message }].slice(-20);
}
// Shared by product-page and category-page imports so both produce identical records.
async function productStatements(
  db: D1Database,
  j: CrawlJob,
  url: string,
  rich: ScannedProduct,
  historyId: string,
  guard: { id: string; token: string },
) {
  const source = crawlSources.find((s) => s.id === j.sourceId)!;
  const known = knownSourceProduct(j.sourceId, url);
  if (known?.offer.sourceSku && rich.sku && known.offer.sourceSku !== rich.sku)
    throw new SkipItemError("Mənbə SKU-su dəyişib; variantın uyğunluğu yoxlanmalıdır.");
  const pid =
    known?.product?.id ||
    (await identity(j.sourceId, url + (rich.variantId ? "#variant-" + rich.variantId : "")));
  const existing = await db
    .prepare("SELECT payload FROM records WHERE id=? AND kind='product'")
    .bind("product:" + pid)
    .first<{ payload: string }>();
  const previous = existing ? JSON.parse(existing.payload) : undefined;
  let image = known?.product?.image || "/favicon.svg";
  if (rich.image) {
    try {
      const u = new URL(rich.image, url);
      if (u.protocol === "https:") image = u.href;
    } catch {}
  }
  // Some stores put their own name in the brand field; the maker is then read from the title.
  const ownBrand =
    rich.brand && rich.brand.toLowerCase() !== source.name.toLowerCase() ? rich.brand : "";
  const product: Product = {
    id: pid,
    name: rich.name.slice(0, 180),
    brand: String(ownBrand || known?.product?.brand || brandFromName(rich.name) || "Digər").slice(
      0,
      80,
    ),
    category:
      known?.product?.category ||
      // A single lowercase word is already a storefront category id; other text is a source path.
      (source.listing && !/^[a-z]+$/.test(rich.category || "")
        ? categoryOf(rich.name + " " + (rich.category || ""))
        : rich.category) ||
      categoryOf(rich.name),
    variant: known?.product?.variant || rich.variant || "Mənbədəki model",
    image,
    specs: {
      ...known?.product?.specs,
      ...rich.specs,
      "Mənbə SKU": rich.sku || known?.offer.sourceSku || "",
      ...(rich.gtin ? { GTIN: rich.gtin } : {}),
    },
    description: rich.description || source.name + " məhsul səhifəsindən yoxlanmış məlumat.",
    active: previous?.active ?? true,
    featured: previous?.featured ?? false,
    sourceStoreId: j.sourceId,
    sourceUrl: url,
    ...(rich.familyId ? { familyId: rich.familyId } : {}),
  };
  const offer: Offer = {
    id: known?.offer.id || pid + "-offer",
    productId: pid,
    storeId: j.sourceId,
    price: rich.price,
    shipping: 0,
    shippingKnown: false,
    months: 0,
    installmentTotal: 0,
    stock: rich.stock,
    stockKnown: rich.stockKnown,
    warranty: "Mağazada dəqiqləşdirin",
    url,
    demo: false,
    checkedAt: rich.checkedAt,
    cities: ["Bakı"],
    sponsored: false,
    sourceSku: rich.sku || known?.offer.sourceSku || "",
    sourceName: rich.name,
  };
  const statements = [
    put(db, "product", pid, product, guard),
    put(db, "offer", offer.id, offer, guard),
  ];
  if (offer.stock && offer.stockKnown)
    statements.push(
      put(
        db,
        "history",
        historyId,
        { id: historyId, productId: pid, price: offer.price, date: offer.checkedAt, demo: false },
        guard,
      ),
    );
  return statements;
}
// Already-normalized rows (Store API). Admin choices on existing products are kept.
async function recordStatements(
  db: D1Database,
  j: CrawlJob,
  records: { products: Product[]; offers: Offer[]; completeSnapshot?: boolean } | undefined,
  guard: { id: string; token: string },
) {
  if (!records) return [];
  const statements: D1PreparedStatement[] = [];
  for (const p of records.products) {
    const existing = await db
      .prepare("SELECT payload FROM records WHERE id=? AND kind='product'")
      .bind("product:" + p.id)
      .first<{ payload: string }>();
    const previous = existing ? (JSON.parse(existing.payload) as Product) : undefined;
    statements.push(
      put(
        db,
        "product",
        p.id,
        { ...p, active: previous?.active ?? p.active, featured: previous?.featured ?? p.featured },
        guard,
      ),
    );
  }
  for (const o of records.offers) {
    statements.push(put(db, "offer", o.id, o, guard));
    if (o.stock) {
      const historyId = j.id + "-" + o.id;
      statements.push(
        put(
          db,
          "history",
          historyId,
          { id: historyId, productId: o.productId, price: o.price, date: o.checkedAt, demo: false },
          guard,
        ),
      );
    }
  }
  if (records.completeSnapshot && j.sourceId === "technomania") {
    statements.push(
      db
        .prepare(
          "UPDATE records SET payload=json_set(payload,'$.stock',json('false'),'$.stockKnown',json('true')),updated_at=? WHERE kind='offer' AND json_extract(payload,'$.storeId')=? AND json_extract(payload,'$.id') NOT IN (SELECT value FROM json_each(?)) AND EXISTS(SELECT 1 FROM records WHERE id=? AND json_extract(payload,'$.leaseToken')=?)",
        )
        .bind(
          Date.now(),
          j.sourceId,
          JSON.stringify(records.offers.map((o) => o.id)),
          key(guard.id),
          guard.token,
        ),
    );
  }
  return statements;
}
export async function tickCrawlJob(db: D1Database, id: string) {
  let j = await getJob(db, id);
  if (["paused", "blocked", "complete"].includes(j.status) || j.pauseRequested)
    return jobSummary(j);
  if (j.nextRunAt > Date.now()) return jobSummary(j);
  const now = Date.now(),
    leaseToken = crypto.randomUUID();
  const lock = await db
    .prepare(
      "UPDATE records SET payload=json_set(payload,'$.leaseUntil',?,'$.leaseToken',?),updated_at=? WHERE id=? AND coalesce(json_extract(payload,'$.leaseUntil'),0)<=?",
    )
    .bind(now + 240000, leaseToken, now, key(id), now)
    .run();
  if (lock.meta.changes !== 1) return { ...jobSummary(j), busy: true };
  j = await getJob(db, id);
  if (j.leaseToken !== leaseToken) return jobSummary(j);
  const guard = { id, token: leaseToken };
  const source = crawlSources.find((s) => s.id === j.sourceId);
  if (!source) {
    j.status = "blocked";
    remember(j, j.sourceId, "Mənbə konfiqurasiyadan çıxarılıb.");
    return await saveJob(db, j);
  }
  const host = new URL(source.root).hostname;
  const statements: D1PreparedStatement[] = [];
  if (!(await acquireHost(db, host, leaseToken))) {
    j.nextRunAt = Date.now() + 2000;
    return await saveJob(db, j);
  }
  let minimumDelay = Math.max(source.intervalMs ?? 1500, crawlDelayMs(host));
  let nextDelay: number = minimumDelay;
  let stage: "fetch" | "persist" = "fetch";
  try {
    j.status = j.phase;
    delete j.lastError;
    if (j.phase === "discovering") {
      const current = j.queue[0];
      if (!current) {
        j.phase = "importing";
        j.status = "importing";
        return await saveJob(db, j);
      }
      if (j.seen.includes(current.url)) {
        j.queue.shift();
        return await saveJob(db, j);
      }
      if (!sourceUrlAllowed(j.sourceId, current.url)) throw new Error("Mənbə domeni uyğun deyil.");
      if (j.seen.length >= 1000) throw new Error("Sitemap/kateqoriya sayı limitinə çatıldı.");
      j.lastUrl = current.url;
      let products: string[] = [];
      if (current.html && source.listing) {
        // Category pages are not remembered in seen; this cap ends a run whose pages never stop.
        j.listingPages = (j.listingPages || 0) + 1;
        if (j.listingPages > 5000) throw new Error("Kateqoriya səhifəsi limitinə çatıldı.");
        const listing = extractListing(
          j.sourceId,
          await merchantPage(current.url, {
            fragment: source.listingFragment,
            json: source.listingJson,
          }),
          current.url,
        );
        stage = "persist";
        let skipped = 0;
        for (const item of listing.items) {
          try {
            statements.push(
              ...(await productStatements(
                db,
                j,
                item.url!,
                item,
                j.id + "-" + (item.sku || item.url) + (item.variantId ? "-" + item.variantId : ""),
                guard,
              )),
            );
          } catch (error) {
            if (!(error instanceof SkipItemError)) throw error;
            skipped++;
            j.failed++;
            remember(j, item.url!, error.message);
          }
        }
        statements.push(...(await recordStatements(db, j, listing.records, guard)));
        const rows = listing.items.length - skipped + (listing.records?.products.length || 0);
        while (statements.length > 40) await db.batch(statements.splice(0, 40));
        for (const url of listing.pages)
          if (!j.queue.some((x) => x.url === url)) j.queue.push({ url, html: true });
        j.discovered += rows;
        j.imported += rows;
        j.processed += rows;
      } else if (current.html) {
        const links = discoverCategoryLinks(
          j.sourceId,
          current.url,
          await merchantPage(current.url),
        );
        const found = new Set(j.found || []);
        products = links.products.filter((u) => !found.has(u));
        j.found = [...found, ...products].slice(-10000);
        for (const url of links.pages)
          if (!j.seen.includes(url) && !j.queue.some((x) => x.url === url))
            j.queue.push({ url, html: true });
      } else {
        const parsed = parseSitemap(
          await readMerchantSitemap(current.url, { advertised: current.advertised }),
        );
        const locs = [...new Set(parsed.locs.filter((u) => sourceUrlAllowed(j.sourceId, u)))];
        if (parsed.index) {
          for (const url of locs)
            if (!j.seen.includes(url) && !j.queue.some((x) => x.url === url))
              j.queue.push({ url, advertised: true });
        } else if (source.listing) {
          for (const url of listingCategories(j.sourceId, locs))
            if (!j.queue.some((x) => x.url === url)) j.queue.push({ url, html: true });
        } else {
          products = locs.filter((u) => isProductCandidate(j.sourceId, u));
          for (const url of categoryPagesFromSitemap(j.sourceId, locs))
            if (!j.seen.includes(url) && !j.queue.some((x) => x.url === url))
              j.queue.push({ url, html: true });
        }
      }
      stage = "persist";
      nextDelay = minimumDelay = Math.max(minimumDelay, crawlDelayMs(host));
      const chunks: D1PreparedStatement[] = [];
      for (let i = 0; i < products.length; i += 1000) {
        chunks.push(
          put(
            db,
            "crawlChunk",
            j.id + "-" + j.chunkCount,
            { urls: products.slice(i, i + 1000) },
            guard,
          ),
        );
        j.chunkCount++;
      }
      for (let i = 0; i < chunks.length; i += 40) await db.batch(chunks.slice(i, i + 40));
      j.discovered += products.length;
      // Category pages come from page counts and never loop, so only maps are remembered.
      if (!(current.html && source.listing)) j.seen.push(current.url);
      j.queue.shift();
      j.retryCount = 0;
      if (!j.queue.length) {
        j.phase = "importing";
        j.status = j.discovered ? "importing" : "complete";
      }
      j.nextRunAt = Date.now() + nextDelay;
      return await saveJob(db, j, statements);
    }
    if (j.cursorChunk >= j.chunkCount) {
      j.status = "complete";
      return await saveJob(db, j);
    }
    const chunkRow = await db
      .prepare("SELECT payload FROM records WHERE id=? AND kind='crawlChunk'")
      .bind("crawlChunk:" + j.id + "-" + j.cursorChunk)
      .first<{ payload: string }>();
    if (!chunkRow) throw new Error("Növbə hissəsi tapılmadı.");
    const urls = JSON.parse(chunkRow.payload).urls as string[];
    const url = urls[j.cursorOffset];
    if (!url) throw new Error("Növbə mövqeyi düzgün deyil.");
    j.lastUrl = url;
    const parsed = await scanProduct(url, { variants: true });
    const variants = parsed.variants || [parsed];
    if (variants.some((p) => !String(p.name || "").trim())) throw new Error("Məhsul adı boşdur.");
    nextDelay = minimumDelay = Math.max(minimumDelay, crawlDelayMs(host));
    stage = "persist";
    for (let variantIndex = 0; variantIndex < variants.length; variantIndex++)
      statements.push(
        ...(await productStatements(
          db,
          j,
          url,
          variants[variantIndex],
          j.id + "-" + j.processed + "-" + variantIndex,
          guard,
        )),
      );
    // Large variant groups are replayable by stable IDs; the URL cursor commits only after all groups.
    while (statements.length > 40) await db.batch(statements.splice(0, 40));
    j.imported++;
    j.processed++;
    j.cursorOffset++;
    if (j.cursorOffset >= urls.length) {
      j.cursorChunk++;
      j.cursorOffset = 0;
    }
    if (j.cursorChunk >= j.chunkCount) j.status = "complete";
    j.retryCount = 0;
    j.nextRunAt = Date.now() + nextDelay;
    return await saveJob(db, j, statements);
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    const access = e instanceof SourceAccessError ? e : undefined;
    const latest = await getJob(db, id);
    if (latest.leaseToken !== leaseToken) return jobSummary(latest);
    const message = e.message || "Mənbə oxunmadı.";
    minimumDelay = Math.max(minimumDelay, crawlDelayMs(host));
    nextDelay = minimumDelay;
    if (stage === "persist" && !(e instanceof SkipItemError)) {
      const restored = await getJob(db, id);
      restored.status = "blocked";
      remember(restored, j.lastUrl || source.root, "Saxlama xətası: " + message);
      return await saveJob(db, restored);
    }
    remember(j, j.lastUrl || source.root, message);
    // Owner rule: 401/403/429 and bot challenges stop the source; it is never retried around them.
    if (access && ([401, 403, 429].includes(access.status) || access.challenge)) {
      j.status = "blocked";
    } else if (
      (access && access.status >= 500) ||
      ["AbortError", "TimeoutError", "TypeError"].includes(e.name)
    ) {
      j.retryCount++;
      nextDelay = Math.max(
        minimumDelay,
        access?.retryAfterMs || 0,
        Math.min(60000, 2000 * 2 ** j.retryCount),
      );
      j.status = j.retryCount >= 5 ? "blocked" : "waiting";
      j.nextRunAt = Date.now() + nextDelay;
    } else {
      j.failed++;
      if (j.phase === "discovering") {
        if (j.queue[0]) j.seen.push(j.queue.shift()!.url);
        if (!j.queue.length) {
          j.phase = "importing";
          j.status = j.discovered ? "importing" : "complete";
        }
      } else {
        j.processed++;
        j.cursorOffset++;
        const chunk = await db
          .prepare("SELECT payload FROM records WHERE id=?")
          .bind("crawlChunk:" + j.id + "-" + j.cursorChunk)
          .first<{ payload: string }>();
        if (chunk && j.cursorOffset >= JSON.parse(chunk.payload).urls.length) {
          j.cursorChunk++;
          j.cursorOffset = 0;
        }
        if (j.cursorChunk >= j.chunkCount) j.status = "complete";
      }
      j.nextRunAt = Date.now() + nextDelay;
    }
    return await saveJob(db, j);
  } finally {
    await releaseHost(db, host, nextDelay, leaseToken);
  }
}
const activeStatuses: Status[] = ["discovering", "importing", "waiting"];
// Starts the first run of every configured source and a new run for every source whose latest run
// finished more than refreshHours ago. Paused or blocked runs are left for the admin to decide.
export async function startDueRefreshes(db: D1Database, now = Date.now()) {
  const rows = await db
    .prepare(
      "SELECT json_extract(payload,'$.sourceId') AS sourceId, json_extract(payload,'$.status') AS status, json_extract(payload,'$.updatedAt') AS updatedAt FROM records WHERE kind='crawlJob' ORDER BY updated_at DESC",
    )
    .all<{ sourceId: string; status: Status; updatedAt: string }>();
  const latest = new Map<string, { status: Status; updatedAt: string }>();
  for (const r of rows.results) if (!latest.has(r.sourceId)) latest.set(r.sourceId, r);
  const started: string[] = [];
  for (const source of crawlSources) {
    const last = latest.get(source.id);
    if (last && last.status !== "complete") continue;
    if (last && now - Date.parse(last.updatedAt) < source.refreshHours * 3600000) continue;
    await startCrawlJob(db, source.id);
    started.push(source.id);
  }
  return started;
}
// Background driver for the cron trigger: advances every unpaused job one URL at a time, honouring
// each job's nextRunAt and the per-host lock, until the time budget runs out.
export async function tickDueCrawlJobs(db: D1Database, budgetMs = 45000) {
  const deadline = Date.now() + budgetMs;
  const runtime: CrawlRuntime = {
    runId: crypto.randomUUID(),
    startedAt: Date.now(),
    status: "running",
    jobs: 0,
    ticks: 0,
    errors: [],
  };
  await put(db, "crawlRuntime", "scheduled", runtime).run();
  try {
    await materializeCatalog(db);
    await expireStaleOffers(db);
    await startDueRefreshes(db);
    const rows = await db
      .prepare(
        "SELECT payload FROM records WHERE kind='crawlJob' AND json_extract(payload,'$.status') IN ('discovering','importing','waiting') AND coalesce(json_extract(payload,'$.pauseRequested'),0)=0 ORDER BY updated_at ASC LIMIT 10",
      )
      .all<{ payload: string }>();
    runtime.jobs = rows.results.length;
    const pending = new Map(
      rows.results.map((r) => {
        const job = JSON.parse(r.payload) as CrawlJob;
        return [job.id, job.nextRunAt || 0];
      }),
    );
    while (pending.size && Date.now() < deadline) {
      const [id, runAt] = [...pending].sort((a, b) => a[1] - b[1])[0];
      const wait = runAt - Date.now();
      if (wait > 0) {
        if (Date.now() + wait >= deadline) break;
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
      try {
        const job = await tickCrawlJob(db, id);
        runtime.ticks++;
        if (!activeStatuses.includes(job.status as Status) || "busy" in job) pending.delete(id);
        else pending.set(id, job.nextRunAt);
      } catch (error) {
        runtime.errors.push({
          jobId: id,
          message: error instanceof Error ? error.message : String(error),
        });
        pending.delete(id);
      }
    }
  } catch (error) {
    runtime.errors.push({ message: error instanceof Error ? error.message : String(error) });
    throw error;
  } finally {
    runtime.completedAt = Date.now();
    runtime.status = runtime.errors.length ? "error" : "complete";
    // A late run must not replace the heartbeat of a newer invocation.
    await db
      .prepare(
        "UPDATE records SET payload=?,updated_at=? WHERE id='crawlRuntime:scheduled' AND json_extract(payload,'$.runId')=?",
      )
      .bind(encode(runtime), Date.now(), runtime.runId)
      .run();
  }
  return { jobs: runtime.jobs, ticks: runtime.ticks, errors: runtime.errors.length };
}
