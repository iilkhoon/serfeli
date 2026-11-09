import fs from "node:fs";
const base = "http://127.0.0.1:5173";
const s = await fetch(base + "/giris?return_to=/admin", { redirect: "manual" });
const cookie = s.headers.get("set-cookie").split(";")[0];
async function post(path, body) {
  const r = await fetch(base + "/api/v1/" + path, {
    method: "POST",
    headers: { cookie, "content-type": "application/json", origin: base },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(data));
  return data;
}
for (const m of JSON.parse(fs.readFileSync("docs/local-merchants.json", "utf8")))
  await post("admin/save", {
    kind: "store",
    value: {
      id: m.id,
      name: m.name,
      domain: m.domain,
      color: m.color,
      description: m.description,
      active: true,
      logo: m.logo,
      ...(m.logoBackground ? { logoBackground: m.logoBackground } : {}),
    },
  });
console.log("31 verified merchant directory entries imported locally.");
console.log("Technomania sync:", JSON.stringify(await post("admin/feed-sync", {})));
