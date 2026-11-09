import fs from "node:fs/promises";
import { createHash } from "node:crypto";
const queues = new Map();
const nextAt = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function politeText(
  url,
  {
    ttlMs = 86400000,
    maxBytes = 12000000,
    intervalMs = 1000,
    fetchImpl = fetch,
    cacheDir = "work/http-cache",
    requestHeaders = {},
  } = {},
) {
  const target = new URL(url);
  if (target.protocol !== "https:" && target.hostname !== "127.0.0.1")
    throw new Error("HTTPS tələb olunur");
  const headerKey = Object.entries(requestHeaders).sort(([a], [b]) => a.localeCompare(b));
  const key = createHash("sha256")
    .update(target.href + (headerKey.length ? "\n" + JSON.stringify(headerKey) : ""))
    .digest("hex");
  await fs.mkdir(cacheDir, { recursive: true });
  const path = cacheDir + "/" + key + ".json";
  let cache;
  try {
    cache = JSON.parse(await fs.readFile(path, "utf8"));
  } catch {}
  if (cache && Date.now() - cache.savedAt < ttlMs) return { ...cache, cached: true };
  const host = target.hostname;
  const prior = queues.get(host) || Promise.resolve();
  const task = prior
    .catch(() => {})
    .then(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        await sleep(Math.max(0, (nextAt.get(host) || 0) - Date.now()));
        nextAt.set(host, Date.now() + intervalMs);
        const response = await fetchImpl(target.href, {
          signal: AbortSignal.timeout(30000),
          redirect: "manual",
          headers: {
            ...requestHeaders,
            Accept: "application/json,application/xml,text/xml,text/html;q=0.8",
            "User-Agent": "Qepik/1.0 PublicCatalog",
            ...(cache?.headers?.etag ? { "If-None-Match": cache.headers.etag } : {}),
            ...(cache?.headers?.["last-modified"]
              ? { "If-Modified-Since": cache.headers["last-modified"] }
              : {}),
          },
        });
        if (response.status === 304 && cache) {
          cache.savedAt = Date.now();
          await fs.writeFile(path, JSON.stringify(cache));
          return { ...cache, cached: true };
        }
        if (response.status === 403 || response.status === 401)
          throw new Error(
            host + " icazə məhdudiyyəti: HTTP " + response.status + "; mənbə dayandırıldı",
          );
        if (response.status === 429) {
          const retry = response.headers.get("retry-after");
          const delay =
            retry && /^\d+$/.test(retry)
              ? Number(retry) * 1000
              : retry
                ? Math.max(0, Date.parse(retry) - Date.now())
                : 5000 * (attempt + 1);
          if (delay > 120000 || attempt === 2)
            throw new Error(host + " HTTP 429; Retry-After: " + (retry || "məlum deyil"));
          nextAt.set(host, Date.now() + delay);
          continue;
        }
        if (response.status >= 500 && attempt < 2) {
          nextAt.set(host, Date.now() + 2000 * 2 ** attempt);
          continue;
        }
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location) throw new Error("Yönləndirmə ünvanı yoxdur");
          const to = new URL(location, target);
          if (to.hostname !== target.hostname || to.protocol !== "https:")
            throw new Error("Domenlərarası yönləndirmə dayandırıldı");
          throw new Error("Yönləndirmə: " + to.href);
        }
        if (!response.ok) throw new Error(target.href + " HTTP " + response.status);
        const reader = response.body.getReader();
        let length = 0;
        const chunks = [];
        while (true) {
          const x = await reader.read();
          if (x.done) break;
          length += x.value.length;
          if (length > maxBytes) {
            await reader.cancel();
            throw new Error("Mənbə ölçü limitini keçir");
          }
          chunks.push(x.value);
        }
        const body = Buffer.concat(chunks.map((x) => Buffer.from(x))).toString("utf8");
        const value = {
          body,
          status: response.status,
          url: target.href,
          headers: Object.fromEntries(response.headers),
          savedAt: Date.now(),
          checkedAt: new Date().toISOString(),
        };
        await fs.writeFile(path, JSON.stringify(value));
        return value;
      }
    });
  queues.set(host, task);
  try {
    return await task;
  } finally {
    if (queues.get(host) === task) queues.delete(host);
  }
}
