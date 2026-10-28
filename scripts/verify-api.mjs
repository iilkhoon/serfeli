import assert from "node:assert/strict";
const base = "http://127.0.0.1:5173";
const sign = await fetch(base + "/signin-with-chatgpt?return_to=/admin", { redirect: "manual" });
const cookie = sign.headers.get("set-cookie")?.split(";")[0];
assert(cookie, "Local test auth cookie");
async function request(path, body, auth = true, origin = base) {
  const r = await fetch(base + "/api/v1/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(auth ? { cookie } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json", origin }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    if (r.status === 403) data = { error: text };
    else throw new Error(path + " status " + r.status + ": " + text.slice(0, 300));
  }
  return { status: r.status, data };
}
assert.equal((await request("admin/data", undefined, false)).status, 403);
assert.equal((await request("admin/catalog", undefined, false)).status, 403);
// The storefront gets one page of products, never the whole catalog.
const listing = (await request("catalog?path=/kataloq&limit=24", undefined, false)).data;
assert.equal(listing.matched.length, 24);
assert(listing.matchedTotal > 1000, "kataloq total " + listing.matchedTotal);
assert(listing.matched.every((id) => listing.products.some((p) => p.id === id)));
assert(listing.products.length < 200, "slice products " + listing.products.length);
const second = (await request("catalog?path=/kataloq&limit=24&offset=24", undefined, false)).data;
assert.equal(second.pageOffset, 24);
assert.equal(second.matched.length, 24);
assert(!second.matched.some((id) => listing.matched.includes(id)), "adjacent pages overlap");
const deep = (await request("catalog?path=/kataloq&limit=24&offset=960", undefined, false)).data;
assert.equal(deep.pageOffset, 960);
assert.equal(deep.matched.length, 24, "products beyond the old 960 limit are reachable");
const lastOffset = Math.floor((listing.matchedTotal - 1) / 24) * 24;
const last = (
  await request(`catalog?path=/kataloq&limit=24&offset=${lastOffset}`, undefined, false)
).data;
assert.equal(last.pageOffset, lastOffset);
assert.equal(last.matched.length, listing.matchedTotal - lastOffset);
const beyond = (await request("catalog?path=/kataloq&offset=999999999", undefined, false)).data;
assert.deepEqual(beyond.matched, last.matched, "out-of-range pages clamp to the final page");
const negative = (await request("catalog?path=/kataloq&offset=-24", undefined, false)).data;
assert.deepEqual(negative.matched, listing.matched, "negative offsets clamp to the first page");
const cheap = (await request("catalog?path=/kataloq&sort=low&min=100&max=200", undefined, false))
  .data;
assert(cheap.matched.length > 0);
const prices = cheap.matched.map((id) =>
  Math.min(...cheap.offers.filter((o) => o.productId === id).map((o) => o.price + o.shipping)),
);
assert(
  prices.every((p) => p >= 100 && p <= 200),
  "price filter " + prices.join(","),
);
assert.equal((await request("bootstrap", {})).status, 200);
assert.equal((await request("session")).data.admin, true);
assert.equal(
  (await request("personal", { kind: "favorite", productId: "iphone-13-pro" }, false)).status,
  401,
);
assert.equal(
  (
    await request(
      "personal",
      { kind: "favorite", productId: "iphone-13-pro" },
      true,
      "https://wrong.example",
    )
  ).status,
  403,
);
const crossSite = await fetch(base + "/api/v1/personal", {
  method: "POST",
  headers: { cookie, "content-type": "application/json", "sec-fetch-site": "cross-site" },
  body: JSON.stringify({ kind: "favorite", productId: "iphone-13-pro" }),
});
assert.equal(crossSite.status, 403);
const product = {
  id: "qa-product",
  name: "QA Product",
  brand: "QA",
  category: "telefon",
  variant: "128 GB Black",
  image: "https://cdn.dummyjson.com/product-images/smartphones/iphone-13-pro/1.webp",
  specs: { Yaddaş: "128 GB" },
  description: "Disposable local verification record",
  active: true,
  featured: false,
};
assert.equal((await request("admin/save", { kind: "product", value: product })).status, 200);
const offer = {
  id: "qa-offer",
  productId: "qa-product",
  storeId: "kontakt",
  price: 999,
  shipping: 5,
  months: 12,
  installmentTotal: 1200,
  stock: true,
  warranty: "QA",
  url: "https://kontakt.az/qa-product",
  demo: false,
  checkedAt: new Date().toISOString(),
  cities: ["Bakı"],
  sponsored: false,
};
assert.equal((await request("admin/save", { kind: "offer", value: offer })).status, 200);
assert.equal((await request("click", { offerId: "qa-offer" }, false)).status, 200);
let catalog = (await request("catalog?ids=qa-product")).data;
assert(catalog.products.some((p) => p.id === "qa-product"));
assert(catalog.history.some((p) => p.productId === "qa-product" && !p.demo));
assert.equal(
  (
    await request("admin/save", {
      kind: "offer",
      value: { ...offer, url: "https://irshad.az/wrong" },
    })
  ).status,
  400,
);
assert.equal(
  (await request("admin/import", { offers: [{ ...offer, id: "qa-bulk", price: 950 }] })).status,
  200,
);
assert.equal(
  (await request("personal", { kind: "favorite", productId: "qa-product" })).status,
  200,
);
assert.equal(
  (await request("personal", { kind: "alert", productId: "qa-product", target: 1000 })).status,
  200,
);
assert((await request("personal")).data.favorites.some((p) => p.productId === "qa-product"));
assert.equal((await request("personal", undefined, false)).data.favorites.length, 0);
assert.equal(
  (
    await request("reviews", {
      productId: "qa-product",
      rating: 5,
      text: "Local test review verification",
    })
  ).status,
  200,
);
const data = (await request("admin/data")).data;
const review = data.review.find((r) => r.productId === "qa-product");
assert(review);
assert(!(await request("catalog?ids=qa-product")).data.reviews.some((r) => r.id === review.id));
assert.equal(
  (await request("admin/moderate", { kind: "review", id: review.id, status: "approved" })).status,
  200,
);
assert((await request("catalog?ids=qa-product")).data.reviews.some((r) => r.id === review.id));
assert.equal((await request("admin/delete", { kind: "product", id: "qa-product" })).status, 400);
for (const id of ["qa-offer", "qa-bulk"])
  assert.equal((await request("admin/delete", { kind: "offer", id })).status, 200);
assert.equal((await request("admin/delete", { kind: "product", id: "qa-product" })).status, 200);
for (const kind of ["favorite", "alert"])
  await request("personal", { kind, productId: "iphone-13-pro", remove: true });
console.log(
  "PASS: API checks: bounded catalog pages (including after 960 and final page), offset bounds, price filter, authentication, admin, CSRF (Origin + Sec-Fetch-Site), CRUD, domain binding, import, real history, private records, moderation, reference protection. Local database only.",
);
