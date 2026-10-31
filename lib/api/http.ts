// Request/response helpers for /api/v1 that do not touch the database (tested offline by
// scripts/verify-api-http.mjs).
import { z } from "zod";

// Thrown for expected request failures; the message is safe to show to the caller.
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export const MAX_BODY = 500000;

// Reads a JSON body with a hard size limit (Content-Length can be absent on chunked bodies).
export async function readJson(req: Request, limit = MAX_BODY): Promise<unknown> {
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, "Sorğu məlumatı boşdur.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      throw new ApiError(413, "Məlumat 500 KB limitini keçir.");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(all));
  } catch {
    throw new ApiError(400, "Sorğu JSON formatında deyil.");
  }
}

// Fixed-window limiter per Worker isolate. It bounds abuse from one client; it is not a global
// quota (isolates do not share it).
const windows = new Map<string, { start: number; count: number }>();
export function rateLimited(key: string, limit: number, windowMs = 60000, now = Date.now()) {
  if (windows.size > 5000)
    for (const [k, w] of windows) if (now - w.start > windowMs) windows.delete(k);
  const w = windows.get(key);
  if (!w || now - w.start > windowMs) {
    windows.set(key, { start: now, count: 1 });
    return false;
  }
  w.count++;
  return w.count > limit;
}

// Browsers always send Origin and/or Sec-Fetch-Site on cross-site writes; reject either signal.
// Requests with neither header come from non-browser clients, which cannot ride the viewer's session.
export function crossSite(req: Request, url: URL) {
  const origin = req.headers.get("origin");
  if (origin && origin !== url.origin) return true;
  const site = req.headers.get("sec-fetch-site");
  return !!site && site !== "same-origin" && site !== "none";
}

export const bareHost = (h: string) => h.toLowerCase().replace(/^www\./, "");

const internal = (message: string) =>
  /D1_|SQLITE|no such table|Network connection lost|internal error/i.test(message);
const GENERIC = "Əməliyyat alınmadı. Bir az sonra yenidən cəhd edin.";

// Maps a thrown value to a status and a message that is safe to return. Admin (owner-only)
// operations see crawler/validator messages; storage/runtime failures and every public path get a
// generic 500 so internals are not exposed.
export function errorResponse(e: unknown, admin: boolean): { status: number; error: string } {
  if (e instanceof ApiError) return { status: e.status, error: e.message };
  if (e instanceof z.ZodError)
    return {
      status: 400,
      error:
        "Daxil edilən məlumatlar düzgün deyil: " +
        e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  if (admin && e instanceof Error && e.message && !internal(e.message)) {
    if (e.name === "SourceAccessError") return { status: 502, error: e.message };
    if (e.name === "Error" || e.name === "RobotsDisallowedError")
      return { status: 400, error: e.message };
  }
  return { status: 500, error: GENERIC };
}
