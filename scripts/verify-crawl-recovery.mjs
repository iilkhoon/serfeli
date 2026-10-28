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
  Buffer.from(compile(fs.readFileSync("lib/crawl-sources.ts", "utf8"))).toString("base64");
let code = compile(fs.readFileSync("lib/crawl-jobs.ts", "utf8"));
code = code.replace(
  /import \{ knownSourceProduct \} from ["'].\/store-snapshots["'];/,
  () => `const knownSourceProduct=()=>undefined;`,
);
code = code.replace(/from ["'].\/crawl-sources["']/, () => `from '${rules}'`);
const fake = `let scenario='ok',hook;let calls=0;export function configure(s,h){scenario=s;hook=h;}export function callCount(){return calls;}class SourceAccessError extends Error{constructor(message,status,retryAfterMs=0){super(message);this.status=status;this.retryAfterMs=retryAfterMs;}}async function readMerchantSitemap(){return '<urlset><url><loc>https://bakuelectronics.az/mehsul/test-123</loc></url></urlset>';}async function merchantPage(){return '';}async function scanProduct(url){calls++;if(scenario==='timeout'){const e=new Error('Timed out');e.name='TimeoutError';throw e;}if(scenario==='403')throw new SourceAccessError('HTTP 403',403);if(scenario==='429')throw new SourceAccessError('HTTP 429',429,120000);if(hook)await hook();return{name:'Fixture Product',price:scenario==='stale'?999:123.45,currency:'AZN',sku:'123',stock:true,stockKnown:true,image:'https://bakuelectronics.az/image.jpg',checkedAt:new Date().toISOString()};}`;
code = code.replace(
  /import \{ scanProduct, readMerchantSitemap, merchantPage, SourceAccessError \} from ["'].\/extractor["'];/,
  () => fake,
);
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
crawlJobs.configure("429");
const before = Date.now();
job = await crawlJobs.tickCrawlJob(db, job.id);
assert.equal(job.status, "waiting");
assert(job.nextRunAt >= before + 120000);
assert.equal(job.processed, 0);
const calls = crawlJobs.callCount();
await crawlJobs.tickCrawlJob(db, job.id);
assert.equal(crawlJobs.callCount(), calls);
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
// Cron driver: finishes a fresh job on its own and leaves paused jobs alone.
sqlite.exec(
  "UPDATE records SET payload=json_set(payload,'$.status','complete') WHERE kind='crawlJob'",
);
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
console.log(
  "PASS: 403/429 recovery, atomic D1 retry, pause and stale leases, background driver completion, paused/future job exclusion, per-job error isolation, persisted heartbeat and newer-run fencing. In-memory SQLite; no network.",
);
