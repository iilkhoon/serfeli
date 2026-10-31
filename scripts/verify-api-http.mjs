// Offline checks for the /api/v1 request helpers (lib/api/http.ts): body limits, JSON errors,
// rate limiting, cross-site writes and the error-to-status mapping. No server or network.
import assert from "node:assert/strict";
import { z } from "zod";
import {
  ApiError,
  readJson,
  rateLimited,
  crossSite,
  errorResponse,
  bareHost,
} from "../lib/api/http.ts";

const post = (body, headers = {}) =>
  new Request("https://qepik.test/api/v1/personal", { method: "POST", body, headers });
assert.deepEqual(await readJson(post('{"a":1}')), { a: 1 });
await assert.rejects(
  () => readJson(post("{bad")),
  (e) => e instanceof ApiError && e.status === 400,
);
await assert.rejects(
  () => readJson(new Request("https://qepik.test/x", { method: "POST" })),
  (e) => e.status === 400,
);
// A chunked body without Content-Length is still cut at the limit.
const big = new ReadableStream({
  start(c) {
    for (let i = 0; i < 20; i++) c.enqueue(new TextEncoder().encode("x".repeat(50000)));
    c.close();
  },
});
await assert.rejects(
  () =>
    readJson(new Request("https://qepik.test/x", { method: "POST", body: big, duplex: "half" })),
  (e) => e.status === 413,
);

const t0 = 1_000_000;
for (let i = 0; i < 5; i++) assert.equal(rateLimited("k", 5, 60000, t0 + i), false);
assert.equal(rateLimited("k", 5, 60000, t0 + 10), true);
assert.equal(rateLimited("other", 5, 60000, t0 + 10), false);
assert.equal(rateLimited("k", 5, 60000, t0 + 60001), false, "a new window resets the count");

const url = new URL("https://qepik.test/api/v1/personal");
assert(crossSite(post("{}", { origin: "https://evil.example" }), url));
assert(crossSite(post("{}", { origin: "null" }), url));
assert(crossSite(post("{}", { "sec-fetch-site": "cross-site" }), url));
assert(
  !crossSite(post("{}", { origin: "https://qepik.test", "sec-fetch-site": "same-origin" }), url),
);
assert(!crossSite(post("{}"), url));

assert.equal(bareHost("www.barkodelectronics.az"), bareHost("barkodelectronics.az"));

assert.deepEqual(errorResponse(new ApiError(409, "Konflikt"), false), {
  status: 409,
  error: "Konflikt",
});
const zod = z.object({ a: z.number() }).safeParse({ a: "x" }).error;
assert.equal(errorResponse(zod, false).status, 400);
// Public paths never leak internal messages; admin sees validator/crawler messages only.
const d1 = new Error("D1_ERROR: no such column: payloadx");
assert.equal(errorResponse(d1, false).status, 500);
assert.doesNotMatch(errorResponse(d1, false).error, /D1|column/);
assert.equal(errorResponse(d1, true).status, 500);
assert.doesNotMatch(errorResponse(d1, true).error, /D1|column/);
assert.equal(errorResponse(new Error("Mənbə SKU-su dəyişib"), false).status, 500);
assert.deepEqual(errorResponse(new Error("İdxal mənbəyi düzgün deyil."), true), {
  status: 400,
  error: "İdxal mənbəyi düzgün deyil.",
});
assert.equal(errorResponse(new TypeError("x is undefined"), true).status, 500);
const access = Object.assign(new Error("HTTP 403"), { name: "SourceAccessError" });
assert.equal(errorResponse(access, true).status, 502);
console.log(
  "PASS: API body size limit (chunked too), JSON errors, per-key rate limit windows, cross-site write rejection, www-insensitive store domains, error status mapping without leaking internals. No server.",
);
