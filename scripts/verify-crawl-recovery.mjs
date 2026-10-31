import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { DatabaseSync } from "node:sqlite";
const compile = (s) =>
  ts.transpileModule(s, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
const rules =
  "data:text/javascript;base64," +
  Buffer.from(
    // These scenarios exercise the one-URL-per-tick product-page path, so no source reads listings.
    compile(fs.readFileSync("lib/crawl-sources.ts", "utf8")).replace(/listing: true,?/g, ""),
  ).toString("base64");
let code = compile(fs.readFileSync("lib/crawl-jobs.ts", "utf8"));
code = code.replace(
  /import \{ materializeCatalog \} from ["'].\/catalog-storage["'];/,
  "const materializeCatalog=async()=>({complete:true});",
);
code = code.replace(
  /import \{ knownSourceProduct \} from ["'].\/store-snapshots["'];/,
  () => `const knownSourceProduct=()=>undefined;`,
);
code = code.replace(/from ["'].\/crawl-sources["']/, () => `from '${rules}'`);
code = code.replace(
  /import \{[^}]*\} from ["'].\/listing-sources["'];/,
  () =>
    "const extractListing=()=>({items:[],pages:[]}),listingCategories=()=>[],brandFromName=()=>'';",
);
const fake = `let scenario='ok',hook;let calls=0;export function configure(s,h){scenario=s;hook=h;}export function callCount(){return calls;}const crawlDelayMs=()=>0;class SourceAccessError extends Error{constructor(message,status,retryAfterMs=0,challenge=false){super(message);this.status=status;this.retryAfterMs=retryAfterMs;this.challenge=challenge;}}async function readMerchantSitemap(){return '<urlset><url><loc>https://bakuelectronics.az/mehsul/test-123</loc></url></urlset>';}async function merchantPage(){return '';}async function scanProduct(url){calls++;if(scenario==='timeout'){const e=new Error('Timed out');e.name='TimeoutError';throw e;}if(scenario==='403')throw new SourceAccessError('HTTP 403',403);if(scenario==='429')throw new SourceAccessError('HTTP 429',429,120000);if(scenario==='503')throw new SourceAccessError('HTTP 503',503,0);if(scenario==='challenge')throw new SourceAccessError('challenge',403,0,true);if(hook)await hook();return{name:'Fixture Product',price:scenario==='stale'?999:123.45,currency:'AZN',sku:'123',stock:true,stockKnown:true,image:'https://bakuelectronics.az/image.jpg',checkedAt:new Date().toISOString()};}`;
code = code.replace(/import \{[^}]*\} from ["'].\/extractor["'];/, () => fake);
const crawlJobs = await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(
  "CREATE TABLE records(id TEXT PRIMARY KEY,kind TEXT NOT NULL,payload TEXT NOT NULL,updated_at INTEGER NOT NULL)",
);
sqlite.exec(fs.readFileSync("drizzle/0001_striped_electro.sql", "utf8"));
let failNextBatch = false;
let failJobRead = "";
class Statement {
  constructor(sql, values = []) {
    this.sql = sql;
    this.values = values;
  }
  bind(...values) {
    return new Statement(this.sql, values);
  }
  first() {
    if (failJobRead && this.values[0] === "crawlJob:" + failJobRead) {
      failJobRead = "";
      throw new Error("Simulated job read failure");
    }
    return sqlite.prepare(this.sql).get(...this.values) || null;
  }
  all() {
    return { results: sqlite.prepare(this.sql).all(...this.values) };
  }
  run() {
    const r = sqlite.prepare(this.sql).run(...this.values);
    return { meta: { changes: Number(r.changes) } };
  }
}
const db = {
  prepare: (sql) => new Statement(sql),
  batch: (statements) => {
    if (failNextBatch) {
      failNextBatch = false;
      throw new Error("Simulated D1 storage failure");
    }
    sqlite.exec("BEGIN");
    try {
      const results = statements.map((s) => s.run());
      sqlite.exec("COMMIT");
      return results;
    } catch (e) {
      sqlite.exec("ROLLBACK");
      throw e;
    }
  },
};
function ready(id) {
  sqlite
    .prepare(
      `UPDATE records SET payload=json_set(payload,'$.nextRunAt',0,'$.leaseUntil',0) WHERE id=?`,
    )
    .run("crawlJob:" + id);
  sqlite
    .prepare(`UPDATE records SET payload=json_set(payload,'$.until',0) WHERE kind='crawlLock'`)
    .run();
}
let job = await crawlJobs.startCrawlJob(db, "baku");
job = await crawlJobs.tickCrawlJob(db, job.id);
assert.equal(job.discovered, 1);
ready(job.id);
crawlJobs.configure("403");
job = await crawlJobs.tickCrawlJob(db, job.id);
assert.equal(job.status, "blocked");
assert.equal(job.processed, 0);
await crawlJobs.controlCrawlJob(db, job.id, "resume");
ready(job.id);
// Owner rule: 429 stops the source like 401/403; it is not retried automatically.
crawlJobs.configure("429");
job = await crawlJobs.tickCrawlJob(db, job.id);
assert.equal(job.status, "blocked");
assert.equal(job.processed, 0);
const calls = crawlJobs.callCount();
ready(job.id);
await crawlJobs.tickCrawlJob(db, job.id);
assert.equal(crawlJobs.callCount(), calls, "a blocked source makes no requests");
await crawlJobs.controlCrawlJob(db, job.id, "resume");
ready(job.id);
crawlJobs.configure("challenge");
job = await crawlJobs.tickCrawlJob(db, job.id);
assert.equal(job.status, "blocked", "a bot challenge stops the source");
await crawlJobs.controlCrawlJob(db, job.id, "resume");
ready(job.id);
crawlJobs.configure("503");
const before = Date.now();
job = await crawlJobs.tickCrawlJob(db, job.id);
assert.equal(job.status, "waiting");
assert(job.nextRunAt >= before + 2000);
assert.equal(job.processed, 0);
await crawlJobs.controlCrawlJob(db, job.id, "resume");
ready(job.id);
crawlJobs.configure("timeout");
job = await crawlJobs.tickCrawlJob(db, job.id);
assert.equal(job.status, "waiting");
assert.equal(job.processed, 0);
await crawlJobs.controlCrawlJob(db, job.id, "resume");
ready(job.id);
crawlJobs.configure("ok");
failNextBatch = true;
job = await crawlJobs.tickCrawlJob(db, job.id);
assert.equal(job.status, "blocked");
assert.equal(job.processed, 0);
assert.equal(sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind='product'").get().n, 0);
await crawlJobs.controlCrawlJob(db, job.id, "resume");
ready(job.id);
job = await crawlJobs.tickCrawlJob(db, job.id);
assert.equal(job.status, "complete");
assert.equal(job.imported, 1);
assert.equal(job.processed, 1);
assert.equal(sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind='product'").get().n, 1);
assert.equal(sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind='history'").get().n, 1);
let second = await crawlJobs.startCrawlJob(db, "baku");
ready(second.id);
second = await crawlJobs.tickCrawlJob(db, second.id);
ready(second.id);
crawlJobs.configure("ok", () => crawlJobs.controlCrawlJob(db, second.id, "pause"));
second = await crawlJobs.tickCrawlJob(db, second.id);
assert.equal(second.status, "paused");
assert.equal(second.processed, 1);
assert.equal(second.imported, 1);
await crawlJobs.controlCrawlJob(db, second.id, "resume");
ready(second.id);
await crawlJobs.tickCrawlJob(db, second.id);
let third = await crawlJobs.startCrawlJob(db, "baku");
ready(third.id);
third = await crawlJobs.tickCrawlJob(db, third.id);
ready(third.id);
const historyBefore = sqlite
  .prepare("SELECT count(*) AS n FROM records WHERE kind='history'")
  .get().n;
crawlJobs.configure("stale", () => {
  sqlite
    .prepare(`UPDATE records SET payload=json_set(payload,'$.leaseToken','new-owner') WHERE id=?`)
    .run("crawlJob:" + third.id);
  sqlite
    .prepare(
      `UPDATE records SET payload=json_set(payload,'$.token','new-owner','$.until',?) WHERE kind='crawlLock'`,
    )
    .run(Date.now() + 240000);
});
third = await crawlJobs.tickCrawlJob(db, third.id);
assert.equal(third.processed, 0);
assert.equal(
  JSON.parse(sqlite.prepare("SELECT payload FROM records WHERE kind='offer' LIMIT 1").get().payload)
    .price,
  123.45,
);
assert.equal(
  sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind='history'").get().n,
  historyBefore,
);
assert(
  JSON.parse(
    sqlite.prepare("SELECT payload FROM records WHERE kind='crawlLock' LIMIT 1").get().payload,
  ).until >
    Date.now() + 100000,
);
assert.equal("leaseToken" in third, false);
// Cron driver: finishes a fresh job on its own and leaves paused jobs alone. Every other source
// gets a recently finished run so the driver does not start their first runs here.
sqlite.exec(
  "UPDATE records SET payload=json_set(payload,'$.status','complete') WHERE kind='crawlJob'",
);
const allSources = (await crawlJobs.listCrawlJobs(db)).sources.map((s) => s.id);
function seedFinished(except = []) {
  for (const sourceId of allSources.filter((id) => !except.includes(id)))
    sqlite.prepare("INSERT INTO records(id,kind,payload,updated_at) VALUES(?,?,?,?)").run(
      "crawlJob:seed-" + sourceId + "-" + Math.random(),
      "crawlJob",
      JSON.stringify({
        id: "seed",
        sourceId,
        status: "complete",
        queue: [],
        seen: [],
        recent: [],
        updatedAt: new Date().toISOString(),
      }),
      Date.now() - 1000,
    );
}
seedFinished();
sqlite.exec("DELETE FROM records WHERE kind='crawlLock'");
crawlJobs.configure("ok");
const cronJob = await crawlJobs.startCrawlJob(db, "baku");
const cron = await crawlJobs.tickDueCrawlJobs(db, 10000);
assert.equal(cron.jobs, 1);
assert(cron.ticks >= 2);
assert.equal(
  JSON.parse(
    sqlite.prepare("SELECT payload FROM records WHERE id=?").get("crawlJob:" + cronJob.id).payload,
  ).status,
  "complete",
);
const pausedJob = await crawlJobs.startCrawlJob(db, "baku");
await crawlJobs.controlCrawlJob(db, pausedJob.id, "pause");
assert.equal((await crawlJobs.tickDueCrawlJobs(db, 2000)).jobs, 0);
const status = await crawlJobs.listCrawlJobs(db);
assert.equal(status.runtime.status, "complete");
assert.equal(status.runtime.jobs, 0);
assert(status.runtime.completedAt >= status.runtime.startedAt);
// A database read failure for one job must not stop another merchant's job.
sqlite.exec(
  "UPDATE records SET payload=json_set(payload,'$.status','complete') WHERE kind='crawlJob'",
);
sqlite.exec("DELETE FROM records WHERE kind='crawlLock'");
const broken = await crawlJobs.startCrawlJob(db, "soliton");
const healthy = await crawlJobs.startCrawlJob(db, "baku");
failJobRead = broken.id;
const isolated = await crawlJobs.tickDueCrawlJobs(db, 10000);
assert.equal(isolated.errors, 1);
assert.equal(
  JSON.parse(
    sqlite.prepare("SELECT payload FROM records WHERE id=?").get("crawlJob:" + healthy.id).payload,
  ).status,
  "complete",
);
const failedRuntime = (await crawlJobs.listCrawlJobs(db)).runtime;
assert.equal(failedRuntime.status, "error");
assert.equal(failedRuntime.errors[0].jobId, broken.id);
await crawlJobs.controlCrawlJob(db, broken.id, "pause");
const future = await crawlJobs.startCrawlJob(db, "baku");
sqlite
  .prepare("UPDATE records SET payload=json_set(payload,'$.nextRunAt',?) WHERE id=?")
  .run(Date.now() + 120000, "crawlJob:" + future.id);
const callsBeforeFuture = crawlJobs.callCount();
assert.equal((await crawlJobs.tickDueCrawlJobs(db, 1000)).ticks, 0);
assert.equal(crawlJobs.callCount(), callsBeforeFuture, "future jobs must not make network calls");
ready(future.id);
crawlJobs.configure("ok", () => {
  sqlite
    .prepare(
      "UPDATE records SET payload=json_set(payload,'$.runId','newer-run','$.ticks',999) WHERE id='crawlRuntime:scheduled'",
    )
    .run();
});
await crawlJobs.tickDueCrawlJobs(db, 10000);
assert.equal((await crawlJobs.listCrawlJobs(db)).runtime.runId, "newer-run");
assert.equal(
  (await crawlJobs.listCrawlJobs(db)).runtime.ticks,
  999,
  "a late driver must not overwrite a newer heartbeat",
);
// Cancel ends a run; the scheduled refresh restarts sources whose finished run is old enough.
assert.equal((await crawlJobs.controlCrawlJob(db, future.id, "cancel")).status, "complete");
assert.deepEqual(await crawlJobs.startDueRefreshes(db), [], "a fresh run is not restarted");
const later = Date.now() + 25 * 3600000;
assert((await crawlJobs.startDueRefreshes(db, later)).includes("baku"));
assert(
  !(await crawlJobs.startDueRefreshes(db, later)).includes("baku"),
  "one active run per source",
);

// A configured source that never ran gets its first run from the scheduler; active runs do not.
sqlite.exec(
  "DELETE FROM records WHERE kind='crawlJob' AND json_extract(payload,'$.sourceId')='compstore'",
);
const firstRuns = await crawlJobs.startDueRefreshes(db);
assert(firstRuns.includes("compstore"), "never-run sources start automatically");
assert(!firstRuns.includes("baku"));
assert(!(await crawlJobs.startDueRefreshes(db)).includes("compstore"));

// A finished run marks this store's offers it did not see again as unknown stock; demo offers and
// other stores stay as they were.
sqlite.exec(
  "UPDATE records SET payload=json_set(payload,'$.status','complete') WHERE kind='crawlJob'",
);
sqlite.exec("DELETE FROM records WHERE kind='crawlLock'");
const putOffer = (id, storeId, checkedAt, extra = {}) =>
  sqlite.prepare("INSERT OR REPLACE INTO records(id,kind,payload,updated_at) VALUES(?,?,?,?)").run(
    "offer:" + id,
    "offer",
    JSON.stringify({
      id,
      storeId,
      productId: "p-" + id,
      price: 10,
      stock: true,
      stockKnown: true,
      demo: false,
      checkedAt,
      ...extra,
    }),
    Date.now(),
  );
const offerOf = (id) =>
  JSON.parse(sqlite.prepare("SELECT payload FROM records WHERE id=?").get("offer:" + id).payload);
const hourAgo = new Date(Date.now() - 3600000).toISOString();
putOffer("gone-baku", "baku", hourAgo);
putOffer("demo-baku", "baku", hourAgo, { demo: true });
putOffer("other-store", "soliton", hourAgo);
crawlJobs.configure("ok");
let expiring = await crawlJobs.startCrawlJob(db, "baku");
for (let i = 0; i < 5 && expiring.status !== "complete"; i++) {
  ready(expiring.id);
  expiring = await crawlJobs.tickCrawlJob(db, expiring.id);
}
assert.equal(expiring.status, "complete");
assert.deepEqual([offerOf("gone-baku").stock, offerOf("gone-baku").stockKnown], [false, false]);
assert.equal(offerOf("demo-baku").stock, true);
assert.equal(offerOf("other-store").stock, true);
const seenAgain = sqlite
  .prepare(
    "SELECT payload FROM records WHERE kind='offer' AND json_extract(payload,'$.storeId')='baku' AND json_extract(payload,'$.checkedAt')>=?",
  )
  .all(expiring.createdAt)
  .map((r) => JSON.parse(r.payload));
assert(seenAgain.length >= 1 && seenAgain.every((o) => o.stock && o.stockKnown));
// Age sweep: a crawled store's offer older than max(7 days, 3 × refreshHours) becomes unknown even
// without a finished run; fresh offers and stores outside crawlSources are untouched.
putOffer("ancient-soliton", "soliton", new Date(Date.now() - 30 * 86400000).toISOString());
putOffer("recent-soliton", "soliton", new Date(Date.now() - 86400000).toISOString());
putOffer("ancient-tap", "tap-shop", new Date(Date.now() - 30 * 86400000).toISOString());
assert.equal(await crawlJobs.expireStaleOffers(db), 1);
assert.equal(offerOf("ancient-soliton").stockKnown, false);
assert.equal(offerOf("recent-soliton").stock, true);
assert.equal(offerOf("ancient-tap").stock, true);
sqlite.exec(
  "UPDATE records SET payload=json_set(payload,'$.status','complete') WHERE kind='crawlJob'",
);

// Category-page sources store every row of a page and follow the page links they return.
const listingRules =
  "data:text/javascript;base64," +
  Buffer.from(compile(fs.readFileSync("lib/crawl-sources.ts", "utf8"))).toString("base64");
const listingFake = `const crawlDelayMs=()=>0;class SourceAccessError extends Error{constructor(m,s){super(m);this.status=s;}}async function readMerchantSitemap(){throw new Error('no sitemap');}async function merchantPage(url){return url;}async function scanProduct(){throw new Error('product pages are not read');}`;
const listingStub = `const listingCategories=()=>[],brandFromName=()=>"";function extractListing(source,html,url){const page=new URL(url).searchParams.get('page')||'1';const row=(n)=>({name:'Listing '+n,sku:'sku-'+n,price:100+Number(n),currency:'AZN',stock:true,stockKnown:true,checkedAt:new Date().toISOString(),url:'https://irshad.az/az/mehsullar/item-'+n,variantId:'v'+n});return page==='1'?{items:[row(1),row(2)],pages:[url+'&page=2']}:{items:[row(3)],pages:[]};}`;
const listingCode = compile(fs.readFileSync("lib/crawl-jobs.ts", "utf8"))
  .replace(
    /import \{ materializeCatalog \} from ["'].\/catalog-storage["'];/,
    "const materializeCatalog=async()=>({complete:true});",
  )
  .replace(
    /import \{ knownSourceProduct \} from ["'].\/store-snapshots["'];/,
    // item-2 is a known snapshot product whose SKU changed: it is skipped, the run continues.
    () =>
      "const knownSourceProduct=(s,u)=>u.endsWith('item-2')?{offer:{id:'snap-2',sourceSku:'other'}}:undefined;",
  )
  .replace(/from ["'].\/crawl-sources["']/, () => `from '${listingRules}'`)
  .replace(/import \{[^}]*\} from ["'].\/listing-sources["'];/, () => listingStub)
  .replace(/import \{[^}]*\} from ["'].\/extractor["'];/, () => listingFake);
const listingJobs = await import(
  "data:text/javascript;base64," + Buffer.from(listingCode).toString("base64")
);
let listingJob = await listingJobs.startCrawlJob(db, "irshad");
for (let i = 0; i < 5 && listingJob.status !== "complete"; i++) {
  ready(listingJob.id);
  sqlite.prepare("DELETE FROM records WHERE kind='crawlLock'").run();
  listingJob = await listingJobs.tickCrawlJob(db, listingJob.id);
}
assert.equal(listingJob.status, "complete");
assert.equal(listingJob.imported, 2);
assert.equal(listingJob.failed, 1);
const listed = sqlite
  .prepare(
    "SELECT payload FROM records WHERE kind='offer' AND json_extract(payload,'$.storeId')='irshad'",
  )
  .all()
  .map((r) => JSON.parse(r.payload));
assert.deepEqual(listed.map((o) => o.price).sort(), [101, 103]);
assert(listed.every((o) => o.stock && !o.demo && o.url.startsWith("https://irshad.az/")));
console.log(
  "PASS: 403/429 recovery, atomic D1 retry, pause and stale leases, background driver completion, paused/future job exclusion, per-job error isolation, persisted heartbeat and newer-run fencing, cancel, scheduled refresh, first runs, 429/challenge stop, unseen and aged offer expiry, skipped SKU-changed rows, category-page paging. In-memory SQLite; no network.",
);
