import { knownSourceProduct } from "./store-snapshots";
import type { D1Database } from "@cloudflare/workers-types";
import {
  crawlSources,
  sourceUrlAllowed,
  isProductCandidate,
  parseSitemap,
  discoverCategoryLinks,
} from "./crawl-sources";
import { scanProduct, readMerchantSitemap, merchantPage, SourceAccessError } from "./extractor";
import type { Product, Offer } from "./catalog";
type Status = "discovering" | "importing" | "waiting" | "paused" | "blocked" | "complete";
export type CrawlJob = {
  id: string;
  sourceId: string;
  status: Status;
  phase: "discovering" | "importing";
  queue: { url: string; html?: boolean }[];
  seen: string[];
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
  const { queue, seen, recent, leaseToken, ...value } = j;
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
    queue: [{ url: source.root }],
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
export async function controlCrawlJob(db: D1Database, id: string, action: "pause" | "resume") {
  const j = await getJob(db, id);
  if (j.status === "complete") return jobSummary(j);
  if (action === "pause") {
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
async function saveJob(db: D1Database, j: CrawlJob, statements: D1PreparedStatement[] = []) {
  j.updatedAt = new Date().toISOString();
  j.leaseUntil = 0;
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
function remember(j: CrawlJob, url: string, message: string) {
  j.lastError = message;
  j.recent = [...j.recent, { url, error: message }].slice(-20);
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
  const source = crawlSources.find((s) => s.id === j.sourceId)!;
  const host = new URL(source.root).hostname;
  if (!(await acquireHost(db, host, leaseToken))) {
    j.nextRunAt = Date.now() + 2000;
    return await saveJob(db, j);
  }
  const minimumDelay = "intervalMs" in source ? source.intervalMs : 1500;
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
      if (current.html) {
        const links = discoverCategoryLinks(
          j.sourceId,
          current.url,
          await merchantPage(current.url),
        );
        products = links.products;
        for (const url of links.pages)
          if (!j.seen.includes(url) && !j.queue.some((x) => x.url === url))
            j.queue.push({ url, html: true });
      } else {
        const parsed = parseSitemap(await readMerchantSitemap(current.url));
        const locs = [...new Set(parsed.locs.filter((u) => sourceUrlAllowed(j.sourceId, u)))];
        if (parsed.index) {
          for (const url of locs)
            if (!j.seen.includes(url) && !j.queue.some((x) => x.url === url)) j.queue.push({ url });
        } else {
          products = locs.filter((u) => isProductCandidate(j.sourceId, u));
          if (j.sourceId === "bytelecom")
            for (const url of locs.filter((u) => new URL(u).pathname.startsWith("/category/")))
              if (!j.seen.includes(url) && !j.queue.some((x) => x.url === url))
                j.queue.push({ url, html: true });
        }
      }
      stage = "persist";
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
      j.seen.push(current.url);
      j.queue.shift();
      j.retryCount = 0;
      if (!j.queue.length) {
        j.phase = "importing";
        j.status = j.discovered ? "importing" : "complete";
      }
      j.nextRunAt = Date.now() + nextDelay;
      return await saveJob(db, j);
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
    stage = "persist";
    const statements: D1PreparedStatement[] = [];
    for (let variantIndex = 0; variantIndex < variants.length; variantIndex++) {
      const rich = variants[variantIndex];
      const known = knownSourceProduct(j.sourceId, url);
      if (known?.offer.sourceSku && rich.sku && known.offer.sourceSku !== rich.sku)
        throw new Error("Mənbə SKU-su dəyişib; variantın uyğunluğu yoxlanmalıdır.");
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
      const product: Product = {
        id: pid,
        name: rich.name.slice(0, 180),
        brand: String(rich.brand || known?.product?.brand || "Digər").slice(0, 80),
        category: known?.product?.category || rich.category || categoryOf(rich.name),
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
      statements.push(
        put(db, "product", pid, product, guard),
        put(db, "offer", offer.id, offer, guard),
      );
      if (offer.stock && offer.stockKnown) {
        const historyId = j.id + "-" + j.processed + "-" + variantIndex;
        statements.push(
          put(
            db,
            "history",
            historyId,
            {
              id: historyId,
              productId: pid,
              price: offer.price,
              date: offer.checkedAt,
              demo: false,
            },
            guard,
          ),
        );
      }
    }
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
    if (stage === "persist") {
      const restored = await getJob(db, id);
      restored.status = "blocked";
      remember(restored, j.lastUrl || source.root, "Saxlama xətası: " + message);
      return await saveJob(db, restored);
    }
    remember(j, j.lastUrl || source.root, message);
    if (access && (access.status === 403 || access.status === 401)) {
      j.status = "blocked";
    } else if (
      (access && (access.status === 429 || access.status >= 500)) ||
      ["AbortError", "TimeoutError", "TypeError"].includes(e.name)
    ) {
      j.retryCount++;
      nextDelay =
        access?.status === 429
          ? Math.max(minimumDelay, access.retryAfterMs)
          : Math.max(minimumDelay, Math.min(60000, 2000 * 2 ** j.retryCount));
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
