import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { DatabaseSync } from "node:sqlite";

async function moduleAt(path) {
  const code = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}
const m = await moduleAt("lib/product-matching.ts");
const locks = await moduleAt("lib/match-store.ts");
const product = (id, changes = {}) => ({
  id,
  name: "Acme X10 128 GB Black",
  brand: "Acme",
  category: "telefon",
  variant: "128 GB · Black",
  specs: { MPN: "X10-128-BLK", Rəng: "Black", Yaddaş: "128 GB" },
  image: "https://example.test/phone.png",
  description: "Test model",
  active: true,
  featured: false,
  ...changes,
});
const offer = (pid, store, changes = {}) => ({
  id: "offer-" + pid,
  productId: pid,
  storeId: store,
  price: 100,
  shipping: 0,
  months: 0,
  installmentTotal: 0,
  stock: true,
  warranty: "12 ay",
  url: "https://" + store + ".test/phone",
  demo: false,
  checkedAt: "2026-10-28T00:00:00.000Z",
  cities: ["Bakı"],
  sponsored: false,
  condition: "new",
  sourceSku: pid,
  ...changes,
});
const catalog = () => ({
  products: [product("a"), product("b", { brand: "ACME" }), product("c"), product("d")],
  offers: [offer("a", "one"), offer("b", "two"), offer("c", "three"), offer("d", "two")],
  stores: ["one", "two", "three"].map((id) => ({ id, name: id, active: true })),
  history: [
    {
      id: "source-history",
      productId: "b",
      price: 90,
      date: "2026-10-27T00:00:00.000Z",
      demo: false,
    },
  ],
  reviews: [{ id: "review-b", productId: "b", status: "approved", rating: 4, text: "Test review" }],
  settings: { headline: "Test", announcement: "" },
});
const c = catalog();
const original = JSON.stringify(c);
const match = m.prepareProductMatch(c, "b", "a", []);
assert(m.productMatchValid(c, match));
const merged = m.applyProductMatches(c, [match]);
assert.equal(merged.productAliases.b, "a");
assert.equal(
  Object.getPrototypeOf(merged.productAliases),
  Object.prototype,
  "RSC requires a plain object",
);
assert.equal(merged.products.find((p) => p.id === "b").active, false);
assert.equal(merged.offers.find((o) => o.id === "offer-b").productId, "a");
assert.equal(merged.reviews[0].productId, "a");
assert.deepEqual(
  merged.history,
  c.history,
  "matching does not manufacture/merge historical observations",
);
assert.equal(JSON.stringify(c), original, "source records remain reversible and untouched");
assert.equal(
  m.applyProductMatches(c, [{ ...match, active: false }]).products.find((p) => p.id === "b").active,
  true,
);
assert.equal(
  m.applyProductMatches(c, [{ ...match, active: false }]).offers.find((o) => o.id === "offer-b")
    .productId,
  "b",
);

const changed = (fn) => {
  const copy = structuredClone(c);
  fn(copy);
  return copy;
};
assert(
  m.productMatchValid(
    changed((v) => {
      v.offers[1].price = 72;
      v.offers[1].stock = false;
      v.offers[1].checkedAt = new Date().toISOString();
    }),
    match,
  ),
  "price/stock refresh preserves identity approval",
);
for (const mutate of [
  (v) => {
    v.products[1].variant = "256 GB · Black";
  },
  (v) => {
    v.products[1].specs.MPN = "OTHER-CODE";
  },
  (v) => {
    v.offers[1].condition = "used";
  },
  (v) => {
    v.offers[0].condition = "used";
    v.offers[1].condition = "used";
  },
  (v) => {
    v.offers[1].sourceSku = "different-sku";
  },
  (v) => {
    v.offers[1].url += "-different";
  },
  (v) => {
    v.offers[1].storeId = "different-store";
  },
]) {
  const value = changed(mutate);
  assert.equal(
    m.productMatchValid(value, match),
    false,
    "changed model/condition/source invalidates approval",
  );
  assert.equal(m.applyProductMatches(value, [match]).productAliases.b, undefined);
}
for (const mutate of [
  (v) => {
    v.products[1].specs.Rəng = "White";
    v.products[1].variant = "128 GB White";
  },
  (v) => {
    v.products[1].specs.Yaddaş = "256 GB";
  },
  (v) => {
    v.products[1].brand = "Other";
  },
  (v) => {
    v.products[1].marketplace = true;
  },
  (v) => {
    v.offers[1].condition = "used";
  },
  (v) => {
    v.offers[1].storeId = "one";
  },
  (v) => {
    v.offers[1].demo = true;
  },
  (v) => {
    v.products[1].active = false;
  },
])
  assert.equal(m.checkProductPair(changed(mutate), "b", "a").allowed, false);
assert.throws(() => m.prepareProductMatch(c, "a", "b", [match]), /Zəncir/);
assert.throws(() => m.prepareProductMatch(c, "c", "b", [match]), /Zəncir/);
assert.throws(() => m.prepareProductMatch(c, "b", "c", [match]), /Zəncir/);
assert.throws(() => m.prepareProductMatch(c, "d", "a", [match]), /mağazanın/);
const third = m.prepareProductMatch(c, "c", "a", [match]);
assert.equal(
  m.applyProductMatches(c, [match, third]).offers.filter((o) => o.productId === "a").length,
  3,
);
const collision = m.prepareProductMatch(c, "d", "a", []);
const collided = m.applyProductMatches(c, [match, collision]);
assert.equal(
  Object.keys(collided.productAliases).length,
  1,
  "corrupt duplicate-store approvals cannot add another store offer",
);

const isbn = changed((v) => {
  v.products[0].specs = { ISBN: "9780306406157" };
  v.products[1].specs = { ISBN: "978-0-306-40615-7" };
  v.products[1].name = "Same book alternate title";
});
assert(m.checkProductPair(isbn, "b", "a").evidence.includes("Eyni barkod / ISBN"));
const differentBarcode = structuredClone(isbn);
differentBarcode.products[1].specs.ISBN = "4006381333931";
assert.equal(m.checkProductPair(differentBarcode, "b", "a").allowed, false);
const invalidBarcode = structuredClone(isbn);
invalidBarcode.products[0].specs.ISBN = invalidBarcode.products[1].specs.ISBN = "9780306406158";
assert.equal(
  m.checkProductPair(invalidBarcode, "b", "a").allowed,
  false,
  "an invalid check digit is not shared identity evidence",
);
const merchantSku = changed((v) => {
  v.products[1].name = "Unrelated product";
  v.products[0].specs = {};
  v.products[1].specs = {};
  v.offers[0].sourceSku = v.offers[1].sourceSku = "123456";
});
assert.equal(
  m.checkProductPair(merchantSku, "b", "a").allowed,
  false,
  "merchant SKU is not a manufacturer identifier",
);
assert(m.productMatchCandidates(c, [], "Acme").length > 0);
assert.equal(m.productMatchCandidates(c, [], "doesnotexist").length, 0);
assert(
  !m
    .productMatchCandidates(c, [match])
    .some((pair) => pair.source.id === "b" || pair.source.id === "a"),
);

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(
  "CREATE TABLE records(id TEXT PRIMARY KEY,kind TEXT NOT NULL,payload TEXT NOT NULL,updated_at INTEGER NOT NULL)",
);
let failBatch = false;
class Statement {
  constructor(sql, args = []) {
    this.sql = sql;
    this.args = args;
  }
  bind(...args) {
    return new Statement(this.sql, args);
  }
  run() {
    const result = sqlite.prepare(this.sql).run(...this.args);
    return { meta: { changes: Number(result.changes) } };
  }
}
const db = {
  prepare: (sql) => new Statement(sql),
  batch: (statements) => {
    sqlite.exec("BEGIN");
    try {
      const result = statements.map((statement, i) => {
        if (failBatch && i === 2) throw new Error("Simulated D1 write failure");
        return statement.run();
      });
      sqlite.exec("COMMIT");
      return result;
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  },
};
let release;
let acquired;
const held = new Promise((r) => {
  acquired = r;
});
const first = locks.withProductMatchLock(db, async (save) => {
  acquired();
  await new Promise((r) => {
    release = r;
  });
  await save([
    { kind: "productMatch", id: match.id, value: match },
    { kind: "audit", id: "approved", value: { action: "approved" } },
  ]);
});
await held;
await assert.rejects(
  locks.withProductMatchLock(db, async () => {}),
  locks.MatchConflictError,
  "concurrent mutation is rejected",
);
release();
await first;
assert.equal(
  sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind='productMatch'").get().n,
  1,
);
assert.equal(
  JSON.parse(sqlite.prepare("SELECT payload FROM records WHERE id='audit:approved'").get().payload)
    .id,
  "approved",
);
assert.equal(
  sqlite.prepare("SELECT count(*) AS n FROM records WHERE id='system:productMatchLock'").get().n,
  0,
);
failBatch = true;
await assert.rejects(
  locks.withProductMatchLock(db, async (save) =>
    save([
      { kind: "productMatch", id: "atomic", value: match },
      { kind: "audit", id: "atomic", value: { action: "failed" } },
    ]),
  ),
  /Simulated/,
);
failBatch = false;
assert.equal(
  sqlite
    .prepare("SELECT count(*) AS n FROM records WHERE id IN ('productMatch:atomic','audit:atomic')")
    .get().n,
  0,
  "match and audit roll back atomically",
);
await assert.rejects(
  locks.withProductMatchLock(db, async (save) => {
    sqlite
      .prepare(
        "UPDATE records SET payload=json_set(payload,'$.token','new-holder','$.until',?) WHERE id='system:productMatchLock'",
      )
      .run(Date.now() + 240000);
    await save([{ kind: "productMatch", id: "stale", value: match }]);
  }),
  locks.MatchConflictError,
);
assert.equal(
  sqlite.prepare("SELECT count(*) AS n FROM records WHERE id='productMatch:stale'").get().n,
  0,
);
assert.equal(
  JSON.parse(
    sqlite.prepare("SELECT payload FROM records WHERE id='system:productMatchLock'").get().payload,
  ).token,
  "new-holder",
  "stale holder cannot release newer lock",
);
sqlite.exec("DELETE FROM records WHERE id='system:productMatchLock'");
await assert.rejects(
  locks.withProductMatchLock(db, async (save) => {
    sqlite
      .prepare(
        "UPDATE records SET payload=json_set(payload,'$.until',?) WHERE id='system:productMatchLock'",
      )
      .run(Date.now() - 2000);
    await save([{ kind: "productMatch", id: "expired", value: match }]);
  }),
  locks.MatchConflictError,
);
assert.equal(
  sqlite.prepare("SELECT count(*) AS n FROM records WHERE id='productMatch:expired'").get().n,
  0,
);
// Cross-store wording: the same model, storage and colour give one key; any difference splits it.
const named = (id, name, brand, extra = {}) =>
  product(id, { name, brand, variant: "Mənbədəki model", specs: {}, ...extra });
const bakuPhone = named("baku-1", "Smartfon Apple iPhone 18 Pro 256GB GLACIER", "Apple");
const ispacePhone = named("ispace-1", "iPhone 18 Pro, 256 GB, Glacier", "ISPACE", {
  sourceStoreId: "ispace",
});
assert.equal(m.canonicalBrand(ispacePhone), "apple");
assert.ok(m.modelKey(bakuPhone));
assert.equal(m.modelKey(bakuPhone), m.modelKey(ispacePhone));
assert.notEqual(
  m.modelKey(bakuPhone),
  m.modelKey(named("b2", "Smartfon Apple iPhone 18 Pro 256GB BURGUNDY", "Apple")),
);
assert.notEqual(
  m.modelKey(bakuPhone),
  m.modelKey(named("b3", "Smartfon Apple iPhone 18 Pro Max 256GB GLACIER", "Apple")),
);
assert.notEqual(
  m.modelKey(bakuPhone),
  m.modelKey(named("b4", "Smartfon Apple iPhone 18 Pro 512GB GLACIER", "Apple")),
);
assert.equal(
  m.modelKey(named("s1", "Smartfon Samsung Galaxy S26 FE 8GB/256GB Black (S741)", "Samsung")),
  m.modelKey(named("s2", "Samsung Galaxy S26 FE 256 GB qara", "SAMSUNG")),
);
assert.equal(m.modelKey(named("g", "Paltaryuyan maşın qara", "Digər")), "");
assert.equal(m.modelKey(named("w", "Telefon qabı", "Samsung")), "");
const crossStore = {
  ...catalog(),
  products: [bakuPhone, ispacePhone],
  offers: [offer("baku-1", "one"), offer("ispace-1", "two")],
};
const crossPair = m.checkProductPair(crossStore, "ispace-1", "baku-1");
assert.equal(crossPair.allowed, true, crossPair.reasons.join(" "));
assert.deepEqual(crossPair.evidence, ["Eyni model, yaddaş və rəng"]);
assert.equal(m.productMatchCandidates(crossStore, []).length, 1);
const ram = m.checkProductPair(
  {
    ...crossStore,
    products: [
      named("baku-1", "Samsung Galaxy S26 FE 8GB/256GB Black", "Samsung"),
      named("ispace-1", "Samsung Galaxy S26 FE 12GB/256GB Black", "Samsung"),
    ],
  },
  "ispace-1",
  "baku-1",
);
assert(ram.reasons.includes("Yaddaş / RAM uyğun deyil."));
console.log(
  "PASS: matching identity/variant/condition guards, valid identifier checks, merchant SKU exclusion, reversible aliases/history, duplicate-store/chain rejection, stale identity invalidation, RSC-compatible aliases, serialized fenced mutations and atomic rollback, cross-store model keys (storage, RAM, colour, retailer brand). In-memory SQLite; no network.",
);
