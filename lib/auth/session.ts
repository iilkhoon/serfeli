// E-mail code sign-in shared by the website and the mobile app. A verified code creates a session;
// the website keeps its token in an HttpOnly cookie, the app sends it as `Authorization: Bearer`.
// Only SHA-256 hashes of tokens and HMACs of codes are stored.
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { getD1 } from "../../db/sqlite";
import { sendSignInCode } from "./mail";

export const SESSION_COOKIE = "qepik_session";
export const SESSION_DAYS = 60;
const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_HOUR = 5;
const RESEND_AFTER_MS = 45000;

export type SessionUser = { userId: string; email: string; displayName: string };

export class AuthError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export const normalizeEmail = (value: string) => value.trim().toLowerCase();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function secret() {
  const value = process.env.AUTH_SECRET;
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV === "production")
    throw new Error("AUTH_SECRET (ən azı 32 simvol) təyin edilməyib.");
  return "qepik-local-development-secret-not-for-production";
}

const codeHash = (email: string, code: string) =>
  createHmac("sha256", secret())
    .update(email + ":" + code)
    .digest("hex");
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

type CodeRow = {
  code_hash: string;
  expires_at: number;
  attempts: number;
  window_start: number;
  sends: number;
};

/** Creates a fresh code for the address and e-mails it. */
export async function requestCode(rawEmail: string) {
  const email = normalizeEmail(rawEmail);
  if (email.length > 254 || !EMAIL.test(email))
    throw new AuthError(400, "E-poçt ünvanı düzgün deyil.");
  const db = getD1();
  const now = Date.now();
  const row = await db
    .prepare("SELECT * FROM auth_codes WHERE email=?")
    .bind(email)
    .first<CodeRow>();
  const sameWindow = row && now - row.window_start < 3600000;
  if (row && now - (row.expires_at - CODE_MINUTES * 60000) < RESEND_AFTER_MS)
    throw new AuthError(429, "Kod artıq göndərildi. Bir az gözləyib yenidən cəhd edin.");
  if (sameWindow && row.sends >= MAX_SENDS_PER_HOUR)
    throw new AuthError(
      429,
      "Bu ünvana çox sayda kod göndərildi. Bir saat sonra yenidən cəhd edin.",
    );

  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  await db
    .prepare(
      "INSERT INTO auth_codes (email,code_hash,expires_at,attempts,window_start,sends) VALUES (?,?,?,0,?,1) ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at, attempts=0, window_start=?, sends=?",
    )
    .bind(
      email,
      codeHash(email, code),
      now + CODE_MINUTES * 60000,
      now,
      sameWindow ? row.window_start : now,
      sameWindow ? row.sends + 1 : 1,
    )
    .run();
  try {
    await sendSignInCode(email, code, CODE_MINUTES);
  } catch (e) {
    // The code never arrived, so it must not block a retry.
    await db.prepare("DELETE FROM auth_codes WHERE email=?").bind(email).run();
    throw e;
  }
}

/** Checks the code; on success returns a new session token for the account. */
export async function verifyCode(rawEmail: string, rawCode: string, client: "web" | "app") {
  const email = normalizeEmail(rawEmail);
  const code = rawCode.replace(/\D/g, "");
  const db = getD1();
  const now = Date.now();
  const row = await db
    .prepare("SELECT * FROM auth_codes WHERE email=?")
    .bind(email)
    .first<CodeRow>();
  const wrong = new AuthError(400, "Kod yanlışdır və ya vaxtı keçib.");
  if (!row || row.expires_at < now || row.attempts >= MAX_ATTEMPTS || code.length !== 6) {
    throw wrong;
  }
  const expected = Buffer.from(row.code_hash, "hex");
  const given = Buffer.from(codeHash(email, code), "hex");
  if (!timingSafeEqual(expected, given)) {
    await db.prepare("UPDATE auth_codes SET attempts=attempts+1 WHERE email=?").bind(email).run();
    throw wrong;
  }
  // A code works once.
  await db.prepare("DELETE FROM auth_codes WHERE email=?").bind(email).run();

  await db
    .prepare("INSERT OR IGNORE INTO users (id,email,name,created_at) VALUES (?,?,NULL,?)")
    .bind("u_" + randomBytes(12).toString("hex"), email, now)
    .run();
  const user = await db
    .prepare("SELECT id FROM users WHERE email=?")
    .bind(email)
    .first<{ id: string }>();
  if (!user) throw new Error("Hesab yaradıla bilmədi.");

  const token = randomBytes(32).toString("base64url");
  const expiresAt = now + SESSION_DAYS * 86400000;
  await db
    .prepare(
      "INSERT INTO sessions (token_hash,user_id,client,created_at,expires_at) VALUES (?,?,?,?,?)",
    )
    .bind(tokenHash(token), user.id, client, now, expiresAt)
    .run();
  // Housekeeping: drop expired sessions and codes.
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE expires_at<?").bind(now),
    db.prepare("DELETE FROM auth_codes WHERE expires_at<?").bind(now - 3600000),
  ]);
  return { token, expiresAt, user: { id: user.id, email } };
}

/** The account a session token belongs to, or null when it is unknown or expired. */
export async function sessionUser(token: string | null | undefined): Promise<SessionUser | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const row = await getD1()
    .prepare(
      "SELECT u.id AS id, u.email AS email, u.name AS name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
    )
    .bind(tokenHash(token), Date.now())
    .first<{ id: string; email: string; name: string | null }>();
  return row ? { userId: row.id, email: row.email, displayName: row.name || row.email } : null;
}

export async function endSession(token: string | null | undefined) {
  if (!token) return;
  await getD1().prepare("DELETE FROM sessions WHERE token_hash=?").bind(tokenHash(token)).run();
}

/** The session token on a request: a Bearer header (mobile app) or the session cookie (website). */
export function requestToken(headers: Headers) {
  const auth = headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return readCookie(headers.get("cookie"), SESSION_COOKIE);
}

export function readCookie(header: string | null, name: string) {
  for (const part of (header || "").split(";")) {
    const at = part.indexOf("=");
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim() || null;
  }
  return null;
}

const secureCookie = () => (process.env.NODE_ENV === "production" ? "; Secure" : "");
export const sessionCookie = (token: string) =>
  `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; SameSite=Lax${secureCookie()}`;
export const clearedSessionCookie = () =>
  `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secureCookie()}`;

/** OWNER_EMAIL is the only account that may run the admin panel. Without it nobody can. */
export function isOwnerEmail(email: string) {
  const owner = normalizeEmail(process.env.OWNER_EMAIL || "");
  if (!owner) return process.env.NODE_ENV !== "production";
  return normalizeEmail(email) === owner;
}
