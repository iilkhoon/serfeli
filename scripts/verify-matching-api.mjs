import assert from "node:assert/strict";

// Deliberately fixed to local preview; this script must never write to a published catalog.
const base = "http://127.0.0.1:5173";
const auth = await fetch(base + "/signin-with-chatgpt?return_to=/admin", { redirect: "manual" });
const cookie = auth.headers.get("set-cookie")?.split(";")[0];
assert(cookie, "local auth cookie");
async function api(path, body, authenticated = true, origin = base) {
  const response = await fetch(base + "/api/v1/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(authenticated ? { cookie } : {}),
      ...(body === undefined ? {} : { origin, "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text };
  }
  return { status: response.status, data };
}
assert.equal((await api("bootstrap", {})).status, 200);
assert.equal((await api("admin/matches", undefined, false)).status, 403);
assert.equal(
  (await api("admin/matches", { action: "revoke", id: "qa-match-b" }, false)).status,
  401,
);
assert.equal(
  (await api("admin/matches", { action: "revoke", id: "qa-match-b" }, true, "https://wrong.test"))
    .status,
  403,
);
const ids = ["qa-match-a", "qa-match-b", "qa-match-c"];
const offers = ids.map((productId, i) => ({
  id: "qa-match-offer-" + i,
  productId,
  storeId: ["irshad", "technomania", "baku"][i],
  price: [200, 180, 190][i],
  shipping: 0,
  shippingKnown: false,
  months: 0,
  installmentTotal: 0,
  stock: true,
  condition: "new",
  warranty: "QA fixture",
  url:
    "https://" + ["irshad.az", "technomania.az", "bakuelectronics.az"][i] + "/qa-matching-fixture",
  demo: false,
  checkedAt: new Date().toISOString(),
  cities: ["Bakı"],
  sponsored: false,
  sourceSku: productId,
  sourceName: "QA Matching ZX128 128 GB Black",
}));
const products = ids.map((id) => ({
  id,
  name: "QA Matching ZX128 128 GB Black",
  brand: "QA Matching",
  category: "telefon",
  variant: "128 GB · Black",
  specs: { MPN: "QAMATCH-ZX128-BLACK", Yaddaş: "128 GB", Rəng: "Black" },
  image: "/favicon.svg",
  description: "Local automated fixture; removed after verification.",
  active: true,
  featured: false,
}));
async function cleanup() {
  const result = await api("admin/matches?q=QA%20Matching");
  for (const match of result.data.approved || [])
    if (ids.includes(match.sourceId))
      await api("admin/matches", { action: "revoke", id: match.id });
  for (const productId of ids)
    for (const kind of ["favorite", "alert"])
      await api("personal", { productId, kind, remove: true });
  for (const offer of offers) await api("admin/delete", { kind: "offer", id: offer.id });
  for (const product of products) await api("admin/delete", { kind: "product", id: product.id });
}
await cleanup();
try {
  for (const value of products)
    assert.equal((await api("admin/save", { kind: "product", value })).status, 200);
  for (const value of offers)
    assert.equal((await api("admin/save", { kind: "offer", value })).status, 200);
  const result = await api("admin/matches?q=QA%20Matching");
  assert.equal(result.status, 200);
  const pair = result.data.candidates.find(
    (p) => p.source.id === "qa-match-b" && p.target.id === "qa-match-a",
  );
  assert(pair, "fixture pair is offered for manual review");
  const approve = {
    action: "approve",
    sourceId: pair.source.id,
    targetId: pair.target.id,
    sourceSignature: pair.sourceSignature,
    targetSignature: pair.targetSignature,
    confirmed: true,
  };
  assert.equal((await api("admin/matches", { ...approve, confirmed: false })).status, 400);
  assert.equal(
    (await api("admin/matches", { ...approve, sourceSignature: "outdated-review" })).status,
    409,
  );
  assert.equal((await api("personal", { kind: "favorite", productId: "qa-match-b" })).status, 200);
  assert.equal(
    (await api("personal", { kind: "alert", productId: "qa-match-b", target: 150 })).status,
    200,
  );
  const racing = await Promise.all([api("admin/matches", approve), api("admin/matches", approve)]);
  assert.equal(racing.filter((r) => r.status === 200).length, 1, "one concurrent approval wins");
  assert(racing.some((r) => r.status === 409 || r.status === 400));
  const slice = (await api("catalog?" + new URLSearchParams({ path: "/axtaris?q=QA%20Matching" })))
    .data;
  assert.equal(slice.productAliases["qa-match-b"], "qa-match-a");
  assert.equal(slice.matched.includes("qa-match-b"), false);
  assert.equal(slice.offers.find((o) => o.id === "qa-match-offer-1").productId, "qa-match-a");
  const raw = (await api("admin/catalog")).data;
  assert.equal(
    raw.offers.find((o) => o.id === "qa-match-offer-1").productId,
    "qa-match-b",
    "admin editing sees original records",
  );
  assert.equal(raw.products.find((p) => p.id === "qa-match-b").active, true);
  let personal = (await api("personal")).data;
  assert(personal.favorites.some((p) => p.productId === "qa-match-a"));
  assert(personal.alerts.some((p) => p.productId === "qa-match-a" && p.target === 150));
  const redirect = await fetch(base + "/mehsul/qa-match-b", { redirect: "manual" });
  assert.equal(redirect.status, 308);
  assert.equal(new URL(redirect.headers.get("location"), base).pathname, "/mehsul/qa-match-a");
  // Undo without touching personal records restores the viewer's original source references.
  assert.equal((await api("admin/matches", { action: "revoke", id: "qa-match-b" })).status, 200);
  personal = (await api("personal")).data;
  assert(personal.favorites.some((p) => p.productId === "qa-match-b"));
  assert(personal.alerts.some((p) => p.productId === "qa-match-b" && p.target === 150));
  assert.equal((await api("admin/matches", approve)).status, 200);
  assert.equal(
    (await api("admin/save", { kind: "offer", value: { ...offers[1], condition: "used" } })).status,
    200,
  );
  let state = (await api("admin/matches?q=QA%20Matching")).data;
  assert.equal(
    state.approved.find((m) => m.id === "qa-match-b").valid,
    false,
    "condition change suspends mapping",
  );
  const stale = (await api("catalog?" + new URLSearchParams({ path: "/axtaris?q=QA%20Matching" })))
    .data;
  assert.equal(stale.productAliases["qa-match-b"], undefined);
  assert(stale.matched.includes("qa-match-b"));
  assert.equal((await api("admin/save", { kind: "offer", value: offers[1] })).status, 200);
  assert.equal(
    (await api("personal", { kind: "favorite", productId: "qa-match-a", remove: true })).status,
    200,
  );
  assert.equal(
    (await api("personal", { kind: "alert", productId: "qa-match-a", remove: true })).status,
    200,
  );
  assert.equal((await api("admin/matches", { action: "revoke", id: "qa-match-b" })).status, 200);
  personal = (await api("personal")).data;
  assert(
    !personal.favorites.some((p) => ["qa-match-a", "qa-match-b"].includes(p.productId)),
    "canonical favorite removal also removes source aliases",
  );
  assert(
    !personal.alerts.some((p) => ["qa-match-a", "qa-match-b"].includes(p.productId)),
    "canonical alert removal also removes source aliases",
  );
  const restored = (
    await api("catalog?" + new URLSearchParams({ path: "/axtaris?q=QA%20Matching" }))
  ).data;
  assert(restored.matched.includes("qa-match-b"));
  assert.equal(restored.offers.find((o) => o.id === "qa-match-offer-1").productId, "qa-match-b");
  console.log(
    "PASS: matching API authorization/CSRF, reviewed signatures, concurrent approval, canonical listings/offers, 308 aliases, raw admin editing, favorite/alert preservation and alias deletion, condition invalidation, reversible unmatch. Local database only.",
  );
} finally {
  await cleanup();
}
