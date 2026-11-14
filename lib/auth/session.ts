// E-mail + password sign-in shared by the website and the mobile app, with no outside service.
// Signing in creates a session: the website keeps its token in an HttpOnly cookie, the app sends it
// as `Authorization: Bearer`. Only scrypt password hashes and SHA-256 token hashes are stored.
import { createHash, randomBytes } from "node:crypto";
import { getD1 } from "../../db/sqlite";
import { hashPassword, passwordProblem, verifyPassword } from "./password.mjs";

export const SESSION_COOKIE = "qepik_session";
export const SESSION_DAYS = 60;

export type SessionUser = { userId: string; email: string; displayName: string };
export type Client = "web" | "app";

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
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
// Compared against when the address is unknown, so a wrong address costs the same time.
const DUMMY_HASH = hashPassword(randomBytes(16).toString("hex"));

/** OWNER_EMAIL is the only account that may run the admin panel. Without it nobody can. */
export function isOwnerEmail(email: string) {
  const owner = normalizeEmail(process.env.OWNER_EMAIL || "");
  if (!owner) return process.env.NODE_ENV !== "production";
  return normalizeEmail(email) === owner;
}

/** Creates an account. The owner account is made on the server (scripts/set-password.mjs). */
export async function register(rawEmail: string, password: string, client: Client) {
  const email = normalizeEmail(rawEmail);
  if (email.length > 254 || !EMAIL.test(email))
    throw new AuthError(400, "E-poçt ünvanı düzgün deyil.");
  const problem = passwordProblem(password);
  if (problem) throw new AuthError(400, problem);
  if (process.env.OWNER_EMAIL && isOwnerEmail(email))
    throw new AuthError(409, "Bu e-poçtla qeydiyyat mümkün deyil.");
  const db = getD1();
  const id = "u_" + randomBytes(12).toString("hex");
  const inserted = await db
    .prepare("INSERT OR IGNORE INTO users (id,email,password_hash,created_at) VALUES (?,?,?,?)")
    .bind(id, email, await hashPassword(password), Date.now())
    .run();
  if (inserted.meta.changes !== 1)
    throw new AuthError(409, "Bu e-poçtla hesab artıq var. Daxil olun.");
  return createSession({ id, email }, client);
}

export async function login(rawEmail: string, password: string, client: Client) {
  const email = normalizeEmail(rawEmail);
  const user = await getD1()
    .prepare("SELECT id, email, password_hash FROM users WHERE email=?")
    .bind(email)
    .first<{ id: string; email: string; password_hash: string }>();
  const ok = await verifyPassword(
    password.slice(0, 200),
    user?.password_hash ?? (await DUMMY_HASH),
  );
  if (!user || !ok) throw new AuthError(401, "E-poçt və ya parol yanlışdır.");
  return createSession(user, client);
}

async function createSession(user: { id: string; email: string }, client: Client) {
  const db = getD1();
  const now = Date.now();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = now + SESSION_DAYS * 86400000;
  await db.batch([
    db
      .prepare(
        "INSERT INTO sessions (token_hash,user_id,client,created_at,expires_at) VALUES (?,?,?,?,?)",
      )
      .bind(tokenHash(token), user.id, client, now, expiresAt),
    db.prepare("DELETE FROM sessions WHERE expires_at<?").bind(now),
  ]);
  return { token, expiresAt, user: { id: user.id, email: user.email } };
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

function readCookie(header: string | null, name: string) {
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
