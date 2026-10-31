import assert from "node:assert/strict";
const base = "http://127.0.0.1:5173";
const sign = await fetch(base + "/signin-with-chatgpt?return_to=/admin", { redirect: "manual" });
const cookie = sign.headers.get("set-cookie")?.split(";")[0];
assert(cookie);
async function call(path, body, auth = true) {
  const r = await fetch(base + "/api/v1/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(auth ? { cookie } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json", origin: base }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}
assert.equal((await call("admin/jobs", undefined, false)).status, 401);
assert.equal((await call("admin/jobs/start", { sourceId: "soliton" }, false)).status, 401);
assert.equal((await call("admin/jobs/start", { sourceId: "evil" })).status, 400);
const starts = await Promise.all([
  call("admin/jobs/start", { sourceId: "soliton" }),
  call("admin/jobs/start", { sourceId: "soliton" }),
]);
assert(starts.every((s) => s.status === 200));
assert.equal(starts[0].data.id, starts[1].data.id);
const id = starts[0].data.id;
await call("admin/jobs/control", { id, action: "pause" });
let job = (await call("admin/jobs/tick", { id })).data;
assert.equal(job.status, "paused");
const before = job.processed,
  imported = job.imported;
assert.equal((await call("admin/jobs/control", { id, action: "resume" })).status, 200);
if (job.phase === "discovering") job = (await call("admin/jobs/tick", { id })).data;
assert(job.discovered > 0);
assert.equal(job.pendingMaps, 0);
await new Promise((r) => setTimeout(r, Math.max(1800, job.nextRunAt - Date.now() + 100)));
await Promise.all([call("admin/jobs/tick", { id }), call("admin/jobs/tick", { id })]);
job = (await call("admin/jobs")).data.jobs.find((x) => x.id === id);
assert.equal(job.processed, before + 1);
assert.equal(job.imported, imported + 1);
await call("admin/jobs/control", { id, action: "pause" });
console.log(
  "PASS: source allowlist, owner access, concurrent start deduplication, persistent pause/resume, complete sitemap discovery, tick lease and real Soliton import. Local database only.",
);
