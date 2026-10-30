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
// Automatic merge: the same phone in three stores becomes one product; a store's second copy of
// a listing is hidden behind its cheaper in-stock twin; a listing without a colour stays apart.
const folded = m.mergeDuplicateProducts({
  ...catalog(),
  products: [
    ...[
      bakuPhone,
      ispacePhone,
      named("irshad-1", "iPhone 18 Pro 256 GB Glacier", "Apple"),
      named("irshad-2", "iPhone 18 Pro 256 GB Glacier", "Apple"),
    ].map((p) => ({
      ...p,
      specs: { MPN: "MP-18P-256-GLA", RAM: "8 GB", Yaddaş: "256 GB", Rəng: "Glacier" },
    })),
    named("tm-1", "Apple iPhone 18 Pro 256GB", "Apple"),
  ],
  offers: [
    offer("baku-1", "one"),
    offer("ispace-1", "two"),
    offer("irshad-1", "three", { price: 120 }),
    offer("irshad-2", "three", { price: 110 }),
    offer("tm-1", "four"),
  ],
});
const live = folded.products.filter((p) => p.active).map((p) => p.id);
assert.deepEqual(live.sort(), ["baku-1", "tm-1"]);
assert.deepEqual(folded.productAliases, {
  "ispace-1": "baku-1",
  "irshad-1": "baku-1",
  "irshad-2": "baku-1",
});
assert.deepEqual(
  folded.offers.filter((o) => o.productId === "baku-1").map((o) => [o.storeId, o.price]),
  [
    ["one", 100],
    ["two", 100],
    ["three", 110],
  ],
);
// A revoked match keeps the pair apart.
const kept = m.mergeDuplicateProducts(crossStore, [
  { id: "ispace-1", sourceId: "ispace-1", targetId: "baku-1", active: false },
]);
assert.equal(kept.products.filter((p) => p.active).length, 2);
// No automatic decision may silently discard uncertain variant fields or known conditions.
const pairCatalog = (products, changes = {}) => ({
  ...catalog(),
  products,
  offers: products.map((p, i) => offer(p.id, "shop-" + i)),
  ...changes,
});
const activeIds = (c) =>
  c.products
    .filter((p) => p.active)
    .map((p) => p.id)
    .sort();
const missing = pairCatalog([
  named("missing-a", "Acme X10 128GB", "Acme"),
  named("missing-b", "Acme X10 128GB", "Acme"),
]);
assert.equal(
  activeIds(m.mergeDuplicateProducts(missing)).length,
  2,
  "unidentified colour/RAM needs review",
);
assert.equal(
  m.productMatchCandidates(missing, []).length,
  1,
  "uncertain pair remains available for manual review",
);
const duplicateStock = pairCatalog([product("duplicate-a"), product("duplicate-b")], {
  offers: [
    offer("duplicate-a", "one", { stock: false, price: 1 }),
    offer("duplicate-a", "one", { id: "live-a", stock: true, price: 120 }),
    offer("duplicate-b", "one", { price: 110 }),
  ],
});
const stockFolded = m.mergeDuplicateProducts(duplicateStock);
assert.deepEqual(activeIds(stockFolded), ["duplicate-b"]);
assert.equal(stockFolded.offers.length, 1);
assert.equal(
  stockFolded.offers[0].price,
  110,
  "unavailable low price must not determine the canonical listing",
);
assert.equal(stockFolded.productAliases["duplicate-a"], "duplicate-b");
const unknownStock = m.mergeDuplicateProducts(
  pairCatalog([product("unknown-stock")], {
    offers: [
      offer("unknown-stock", "one", { id: "unknown-offer", stockKnown: false, price: 1 }),
      offer("unknown-stock", "one", { id: "known-offer", stockKnown: true, price: 120 }),
    ],
  }),
);
assert.equal(unknownStock.offers[0].id, "known-offer");
const sameStoreRam = pairCatalog(
  [
    product("ram-a", { specs: { Rəng: "Black", Yaddaş: "128GB", RAM: "8GB" } }),
    product("ram-b", { specs: { Rəng: "Black", Yaddaş: "128GB", RAM: "12GB" } }),
  ],
  { offers: [offer("ram-a", "one"), offer("ram-b", "one")] },
);
assert.equal(
  activeIds(m.mergeDuplicateProducts(sameStoreRam)).length,
  2,
  "same-store RAM variants remain distinct",
);
const completeModel = pairCatalog(
  [
    product("complete-a", { specs: { Rəng: "Black", Yaddaş: "128GB", RAM: "8GB" } }),
    product("complete-b", { specs: { Rəng: "Qara", Yaddaş: "128GB", RAM: "8GB" } }),
  ],
  {
    offers: [
      offer("complete-a", "one", { price: 125 }),
      offer("complete-b", "one", { price: 100 }),
    ],
  },
);
assert.deepEqual(
  activeIds(m.mergeDuplicateProducts(completeModel)),
  ["complete-b"],
  "a complete exact model/variant also folds without a barcode",
);
const conditionConflict = pairCatalog([product("state-a"), product("state-b")], {
  offers: [
    offer("state-a", "one", { condition: "new" }),
    offer("state-b", "two", { condition: "used" }),
  ],
});
const ramOnly = pairCatalog([
  named("ram-only-a", "Acme X10 Black", "Acme", { specs: { RAM: "8GB", Rəng: "Black" } }),
  named("ram-only-b", "Acme X10 Black", "Acme", { specs: { RAM: "8GB", Rəng: "Black" } }),
]);
assert.equal(
  activeIds(m.mergeDuplicateProducts(ramOnly)).length,
  2,
  "RAM alone does not establish internal storage",
);
assert.equal(activeIds(m.mergeDuplicateProducts(conditionConflict)).length, 2);
const unknownCondition = pairCatalog([product("state-a"), product("state-b")], {
  offers: [
    offer("state-a", "one", { condition: "unknown" }),
    offer("state-b", "two", { condition: "unknown" }),
  ],
});
assert.equal(activeIds(m.mergeDuplicateProducts(unknownCondition)).length, 2);
const ordinaryRetail = pairCatalog([product("retail-a"), product("retail-b")], {
  offers: [
    offer("retail-a", "one", { condition: undefined }),
    offer("retail-b", "two", { condition: undefined }),
  ],
});
const ordinaryFold = m.mergeDuplicateProducts(ordinaryRetail);
assert.equal(
  activeIds(ordinaryFold).length,
  1,
  "explicit same manufacturer trade item permits unspecified ordinary retail without pretending new",
);
assert(ordinaryFold.offers.every((o) => o.condition === undefined));
const oneSidedCondition = {
  ...ordinaryRetail,
  offers: [ordinaryRetail.offers[0], { ...ordinaryRetail.offers[1], condition: "new" }],
};
assert.equal(activeIds(m.mergeDuplicateProducts(oneSidedCondition)).length, 2);
const outlet = {
  ...ordinaryRetail,
  products: ordinaryRetail.products.map((p) => ({ ...p, name: p.name + " (Outlet)" })),
};
assert.equal(activeIds(m.mergeDuplicateProducts(outlet)).length, 2);
const shades = pairCatalog([
  product("shade-a", { name: "Acme X10 128GB Deep Blue", variant: "128GB Deep Blue", specs: {} }),
  product("shade-b", { name: "Acme X10 128GB Blue", variant: "128GB Blue", specs: {} }),
]);
assert.equal(
  activeIds(m.mergeDuplicateProducts(shades)).length,
  2,
  "a shade is part of colour identity",
);
const sameStoreRevoked = m.mergeDuplicateProducts(duplicateStock, [
  { id: "duplicate-a", sourceId: "duplicate-a", targetId: "duplicate-b", active: false },
]);
assert.equal(activeIds(sameStoreRevoked).length, 2, "a revoked same-store pair must remain apart");
const bridge = pairCatalog([
  product("bridge-a", {
    specs: { EAN: "9780306406157", Rəng: "Black", Yaddaş: "128GB", RAM: "8GB" },
  }),
  product("bridge-b", {
    specs: { EAN: "9780306406157", MPN: "BRIDGE-C-128", Rəng: "Black", Yaddaş: "128GB" },
  }),
  product("bridge-c", {
    specs: { MPN: "BRIDGE-C-128", Rəng: "Black", Yaddaş: "128GB", RAM: "12GB" },
  }),
]);
assert.equal(
  activeIds(m.mergeDuplicateProducts(bridge)).length,
  2,
  "pairwise similarity is not transitive across conflicting RAM",
);
const transitiveRevocation = m.mergeDuplicateProducts(
  pairCatalog([product("tr-a"), product("tr-b"), product("tr-c")]),
  [{ id: "tr-c", sourceId: "tr-c", targetId: "tr-a", active: false }],
);
assert.equal(
  activeIds(transitiveRevocation).length,
  2,
  "revoked members cannot reconnect through a third product",
);
const prior = pairCatalog(
  [product("alias-old", { active: false }), product("alias-b"), product("alias-a")],
  {
    productAliases: { "alias-old": "alias-b" },
    offers: [offer("alias-b", "one"), offer("alias-a", "two")],
  },
);
const aliasFold = m.mergeDuplicateProducts(prior);
assert.equal(aliasFold.productAliases["alias-old"], "alias-a");
assert.equal(aliasFold.productAliases["alias-b"], "alias-a");
const priorRevoked = m.mergeDuplicateProducts(prior, [
  { id: "alias-old", sourceId: "alias-old", targetId: "alias-a", active: false },
]);
assert.equal(priorRevoked.productAliases["alias-old"], "alias-b");
assert.equal(activeIds(priorRevoked).length, 2);
const foldOriginal = JSON.stringify(duplicateStock);
m.mergeDuplicateProducts(duplicateStock);
assert.equal(
  JSON.stringify(duplicateStock),
  foldOriginal,
  "automatic matching preserves all input records for rollback",
);
assert.deepEqual(m.mergeDuplicateProducts(stockFolded), stockFolded, "normalization is idempotent");
const approvedBridge = pairCatalog(
  [
    product("approved-original", {
      active: false,
      specs: { MPN: "SAME-TRADE-ITEM", RAM: "8GB", Yaddaş: "128GB", Rəng: "Black" },
    }),
    product("approved-root", { specs: { MPN: "SAME-TRADE-ITEM", Yaddaş: "128GB", Rəng: "Black" } }),
    product("approved-incoming", {
      specs: { MPN: "SAME-TRADE-ITEM", RAM: "12GB", Yaddaş: "128GB", Rəng: "Black" },
    }),
  ],
  {
    productAliases: { "approved-original": "approved-root" },
    offers: [
      offer("approved-root", "one"),
      offer("approved-root", "two", { id: "second-approved" }),
      offer("approved-incoming", "three"),
    ],
  },
);
assert.equal(
  activeIds(m.mergeDuplicateProducts(approvedBridge)).length,
  2,
  "a known attribute of a previously approved alias must not be lost in a later merge",
);
const nestedAlias = {
  ...prior,
  products: [...prior.products, product("alias-older", { active: false })],
  productAliases: { "alias-older": "alias-old", "alias-old": "alias-b" },
};
const nestedKept = m.mergeDuplicateProducts(nestedAlias, [
  { id: "alias-older", sourceId: "alias-older", targetId: "alias-a", active: false },
]);
assert.equal(nestedKept.productAliases["alias-older"], "alias-b");
assert.equal(activeIds(nestedKept).length, 2, "revocation applies through prior nested aliases");
// Real source wording, with manufacturer fields explicitly checked by the source adapters.
// The two AirPods4 variants must have independent canonical products and store counts.
const airpods = pairCatalog([
  named("airpods4", "Apple AirPods 4", "Apple", {
    category: "audio",
    variant: "White",
    specs: { MPN: "MXP63ZE/A", Rəng: "White", ANC: "Xeyr" },
  }),
  named("baku-basic", "Simsiz qulaqlıq Apple AirPods 4 White (MXP63ZE/A)", "Apple", {
    category: "audio",
    specs: { MPN: "MXP63ZE/A", Rəng: "White", ANC: "Xeyr", "Mənbə SKU": "212472" },
  }),
  named("ispace-basic", "Qulaqlıqlar APPLE AirPods 4, Ağ", "APPLE", {
    category: "audio",
    specs: { MPN: "MXP63ZE/A", Rəng: "Ağ", ANC: "Xeyr" },
  }),
  named(
    "baku-anc",
    "Simsiz qulaqlıq Apple AirPods 4 with Active Noise Cancellation (MXP93ZE/A)",
    "Apple",
    { category: "audio", specs: { MPN: "MXP93ZE/A", Rəng: "White", ANC: "Bəli" } },
  ),
  named("ispace-anc", "Qulaqlıqlar APPLE AirPods 4 aktiv səsboğma ilə, Ağ", "APPLE", {
    category: "audio",
    specs: { MPN: "MXP93ZE/A", Rəng: "Ağ", ANC: "Bəli" },
  }),
  named("tm-ambiguous", "Apple AirPods 4", "Apple", {
    category: "audio",
    variant: "Ağ",
    specs: {
      Rəng: "Ağ",
      "Aktiv Səs-küy Boğucu (ANC)": "Adaptiv Aktiv Səs-küy Boğucu (ANC) və Şəffaflıq rejimi",
    },
  }),
  named("uniq-case", "UNIQ Apple AirPods 4 White Case", "UNIQ", {
    category: "aksesuar",
    variant: "White",
  }),
]);
airpods.offers = airpods.offers.map((o) => ({ ...o, condition: undefined }));
const airpodsFold = m.mergeDuplicateProducts(airpods);
assert.equal(activeIds(airpodsFold).length, 4);
const basicRoot = airpodsFold.productAliases["ispace-basic"] || "ispace-basic";
const ancRoot = airpodsFold.productAliases["ispace-anc"] || "ispace-anc";
assert.notEqual(basicRoot, ancRoot);
assert.equal(
  new Set(airpodsFold.offers.filter((o) => o.productId === basicRoot).map((o) => o.storeId)).size,
  3,
);
assert.equal(
  new Set(airpodsFold.offers.filter((o) => o.productId === ancRoot).map((o) => o.storeId)).size,
  2,
);
assert(
  !airpodsFold.productAliases["tm-ambiguous"],
  "contradictory source variant facts stay out of the basic variant",
);
assert(!airpodsFold.productAliases["uniq-case"]);
const unknownAnc = pairCatalog([
  named("plain-a", "Apple AirPods 4", "Apple", { category: "audio", variant: "White" }),
  named("plain-b", "Apple AirPods 4", "Apple", {
    category: "audio",
    variant: "White",
    specs: { ANC: "Bəli" },
  }),
]);
assert.equal(
  activeIds(m.mergeDuplicateProducts(unknownAnc)).length,
  2,
  "one-sided ANC information needs review even when titles are identical",
);
assert(
  m
    .checkProductPair(
      pairCatalog([
        product("code-a", {
          name: "Apple AirPods 4 White (MXP63ZE/A)",
          brand: "Apple",
          category: "audio",
          variant: "White",
          specs: {},
        }),
        product("code-b", {
          name: "Apple AirPods 4 White (MXP93ZE/A)",
          brand: "Apple",
          category: "audio",
          variant: "White",
          specs: {},
        }),
      ]),
      "code-a",
      "code-b",
    )
    .reasons.includes("Başlıqdakı model kodu fərqlidir."),
);
// AirPods as four stores write them: the part number in the title, bare, or in the SKU field;
// noise cancelling in English or Azerbaijani; one store files them as accessories. The ANC model
// becomes one product, the plain model (another part number) stays apart.
const pods = (id, name, extra = {}) =>
  product(id, {
    name,
    brand: "Apple",
    category: "audio",
    variant: "Mənbədəki model",
    specs: {},
    ...extra,
  });
const podsFolded = m.mergeDuplicateProducts({
  ...catalog(),
  products: [
    pods("baku-anc", "Simsiz qulaqlıq Apple AirPods 4 with Active Noise Cancellation (MXP93ZE/A)"),
    pods("ispace-anc", "Qulaqlıqlar APPLE AirPods 4 aktiv səsboğma ilə, Ağ", {
      brand: "APPLE",
      specs: { "Mənbə SKU": "MXP93ZE/A" },
    }),
    pods("soliton-anc", "Qulaqlıq Apple Airpods 4 ANC / MXP93ZE/A", { category: "aksesuar" }),
    pods("baku-plain", "Simsiz qulaqlıq Apple AirPods 4 White (MXP63ZE/A)"),
    pods("irshad-5", "Apple AirPods 5 MKFW4ZE/A"),
    pods("baku-5", "Simsiz qulaqlıq Apple AirPods 5 (MKFW4ZE/A)"),
    // One store lists both models; the plain one carries the ANC model's spec sheet.
    pods("tm-plain", "Apple AirPods 4", {
      variant: "Ağ",
      specs: { "Aktiv Səs-küy Boğucu (ANC)": "Adaptiv ANC" },
    }),
    pods("tm-anc", "Apple AirPods 4 Active Noise Cancellation", { variant: "Ağ" }),
  ],
  offers: [
    offer("baku-anc", "one"),
    offer("ispace-anc", "two"),
    offer("soliton-anc", "three"),
    offer("baku-plain", "one"),
    offer("irshad-5", "two"),
    offer("baku-5", "one"),
    offer("tm-plain", "four"),
    offer("tm-anc", "four"),
  ],
});
assert.deepEqual(
  podsFolded.products
    .filter((p) => p.active)
    .map((p) => p.id)
    .sort(),
  ["baku-5", "baku-anc", "baku-plain"],
);
assert.equal(podsFolded.productAliases["ispace-anc"], "baku-anc");
assert.equal(podsFolded.productAliases["soliton-anc"], "baku-anc");
assert.equal(podsFolded.productAliases["irshad-5"], "baku-5");
assert.equal(podsFolded.productAliases["tm-plain"], "baku-plain");
assert.equal(podsFolded.productAliases["tm-anc"], "baku-anc");
// A store's own brand field does not split two copies of one model title.
const titled = m.mergeDuplicateProducts({
  ...catalog(),
  products: [
    named("dell-1", "Dell Vostro 3030 MT (210-BKVT)", "Grandstream", { category: "aksesuar" }),
    named("dell-2", "Dell Vostro 3030 MT (210-BKVT)", "DELL", { category: "aksesuar" }),
  ],
  offers: [
    offer("dell-1", "one", { stock: false }),
    offer("dell-2", "one", { id: "offer-dell-2b" }),
  ],
});
assert.equal(titled.products.filter((p) => p.active).length, 1);
console.log(
  "PASS: matching identity/variant/condition guards, valid identifier checks, merchant SKU exclusion, reversible aliases/history, duplicate-store/chain rejection, stale identity invalidation, RSC-compatible aliases, serialized fenced mutations and atomic rollback, cross-store model keys (storage, RAM, colour, retailer brand), automatic duplicate merge (same store and across stores). In-memory SQLite; no network.",
);
