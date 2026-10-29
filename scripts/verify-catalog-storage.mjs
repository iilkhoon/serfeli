import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { DatabaseSync } from "node:sqlite";
const fixtures = {
  stores: [{ id: "retailer", name: "Retailer" }],
  products: Array.from({ length: 205 }, (_, i) => ({
    id: "p" + i,
    name: "Snapshot " + i,
    active: true,
  })),
  offers: [{ id: "o1", productId: "p1", price: 999, stock: true, demo: false }],
  history: [
    { id: "h1", productId: "p1", price: 999, demo: false },
    { id: "fake-history", demo: true },
  ],
  settings: { headline: "Test", announcement: "Test" },
};
let source = fs
  .readFileSync("lib/catalog-storage.ts", "utf8")
  .replace(
    /import \{ seedCatalog \} from "\.\/server-catalog";/,
    () => `const seedCatalog=${JSON.stringify(fixtures)};`,
  )
  .replace(
    /import \{ withStoreSnapshots \} from "\.\/store-snapshots";/,
    "const withStoreSnapshots=(c)=>c;",
  );
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { materializeCatalog, catalogMaterializationStatus } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(
  "CREATE TABLE records(id TEXT PRIMARY KEY,kind TEXT NOT NULL,payload TEXT NOT NULL,updated_at INTEGER NOT NULL)",
);
let failBatch = false;
class Statement {
  constructor(sql, values = []) {
    this.sql = sql;
    this.values = values;
  }
  bind(...values) {
    return new Statement(this.sql, values);
  }
  first() {
    return sqlite.prepare(this.sql).get(...this.values) || null;
  }
  run() {
    const r = sqlite.prepare(this.sql).run(...this.values);
    return { meta: { changes: Number(r.changes) } };
  }
}
const db = {
  prepare: (sql) => new Statement(sql),
  batch: async (statements) => {
    if (failBatch) {
      failBatch = false;
      throw Error("D1 batch unavailable");
    }
    sqlite.exec("BEGIN");
    try {
      const values = statements.map((s) => s.run());
      sqlite.exec("COMMIT");
      return values;
    } catch (e) {
      sqlite.exec("ROLLBACK");
      throw e;
    }
  },
};
sqlite
  .prepare("INSERT INTO records VALUES(?,?,?,?)")
  .run(
    "product:p1",
    "product",
    JSON.stringify({ id: "p1", name: "Operator correction", active: false }),
    10,
  );
sqlite
  .prepare("INSERT INTO records VALUES(?,?,?,?)")
  .run(
    "offer:o1",
    "offer",
    JSON.stringify({ id: "o1", productId: "p1", price: 123, stock: false, demo: false }),
    11,
  );
assert.equal(await catalogMaterializationStatus(db), null);
let progress = await materializeCatalog(db, 80);
assert.equal(progress.cursor, 80);
assert.equal(progress.complete, false);
failBatch = true;
await assert.rejects(materializeCatalog(db, 80), /unavailable/);
assert.equal((await catalogMaterializationStatus(db)).cursor, 80);
await Promise.all([materializeCatalog(db, 80), materializeCatalog(db, 80)]);
progress = await catalogMaterializationStatus(db);
assert.equal(progress.cursor, 160);
while (!progress.complete) progress = await materializeCatalog(db, 80);
assert.equal(progress.cursor, progress.total);
assert.equal(
  JSON.parse(sqlite.prepare("SELECT payload FROM records WHERE id=?").get("product:p1").payload)
    .name,
  "Operator correction",
);
assert.equal(
  JSON.parse(sqlite.prepare("SELECT payload FROM records WHERE id=?").get("product:p1").payload)
    .active,
  false,
);
assert.equal(
  JSON.parse(sqlite.prepare("SELECT payload FROM records WHERE id=?").get("offer:o1").payload)
    .price,
  123,
);
assert.equal(sqlite.prepare("SELECT count(*) n FROM records WHERE kind='product'").get().n, 205);
assert.equal(
  sqlite.prepare("SELECT count(*) n FROM records WHERE id='history:fake-history'").get().n,
  0,
);
const count = sqlite.prepare("SELECT count(*) n FROM records").get().n;
await materializeCatalog(db);
assert.equal(sqlite.prepare("SELECT count(*) n FROM records").get().n, count);
const apiSource = fs.readFileSync("lib/api/records.ts", "utf8");
assert(!/withStoreSnapshots\(await storedCatalog\(\)\)/.test(apiSource));
const publicSource = fs.readFileSync("lib/public-data.ts", "utf8");
assert(
  !/withLiveFeed|withStoreSnapshots|server-catalog/.test(publicSource),
  "public request must not fetch/overlay static prices",
);
console.log(
  "PASS: resumable idempotent snapshot materialization, operator edits preserved, failed batch cursor retained, concurrent replay safe, no demo history, database-only public read boundary. In-memory SQLite, no external writes.",
);
