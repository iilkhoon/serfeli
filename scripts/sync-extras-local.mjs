import fs from "node:fs";
const base = "http://127.0.0.1:5173",
  catMap = {
    phones: "telefon",
    laptops: "noutbuk",
    audio: "audio",
    home: "ev",
    tv: "tv",
    gaming: "oyun",
    wearables: "saat",
  };
const s = await fetch(base + "/signin-with-chatgpt?return_to=/admin", { redirect: "manual" });
const cookie = s.headers.get("set-cookie").split(";")[0];
async function post(b) {
  const r = await fetch(base + "/api/v1/admin/save", {
    method: "POST",
    headers: { cookie, "content-type": "application/json", origin: base },
    body: JSON.stringify(b),
  });
  if (!r.ok) throw new Error(await r.text());
}
for (const o of JSON.parse(fs.readFileSync("docs/additional-live-products.json", "utf8")).offers) {
  await post({
    kind: "product",
    value: {
      id: o.id,
      name: o.name,
      brand: o.brand,
      category: catMap[o.category] || "aksesuar",
      variant: [o.capacity, o.color].filter(Boolean).join(" · ") || "Mənbədəki model",
      image: o.localImage,
      specs: o.specs,
      description: o.name + " üçün mənbədən yoxlanmış real qiymət və stok məlumatları.",
      active: true,
      featured: true,
    },
  });
  await post({
    kind: "offer",
    value: {
      id: "live-" + o.id,
      productId: o.id,
      storeId: o.storeId,
      price: o.price,
      shipping: 0,
      shippingKnown: false,
      months: 0,
      installmentTotal: 0,
      stock: true,
      warranty: "Mağazada dəqiqləşdirin",
      url: o.sourceUrl,
      demo: false,
      checkedAt: new Date(o.checkedAt).toISOString(),
      cities: ["Bakı"],
      sponsored: false,
      sourceSku: o.sourceSku,
      sourceName: o.name,
    },
  });
}
console.log("24 additional real products and offers imported locally.");
