// Password hashing with scrypt (node:crypto). Shared by the server (lib/auth/session.ts) and
// scripts/set-password.mjs, so it is plain JavaScript. Stored form: scrypt$N$r$p$salt$hash.
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

/** @type {(password: string, salt: Buffer, n: number, r: number, p: number) => Promise<Buffer>} */
function derive(password, salt, n, r, p) {
  return new Promise((resolve, reject) =>
    scrypt(
      password.normalize("NFKC"),
      salt,
      KEY_LENGTH,
      { N: n, r, p, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}

/** @param {string} password @returns {Promise<string>} */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

/** @param {string} password @param {string} stored @returns {Promise<boolean>} */
export async function verifyPassword(password, stored) {
  const [kind, n, r, p, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const key = await derive(password, Buffer.from(salt, "base64url"), +n, +r, +p);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** @param {string} password @returns {string | null} the problem, or null when acceptable */
export function passwordProblem(password) {
  if (password.length < 8) return "Parol ən azı 8 simvol olmalıdır.";
  if (password.length > 200) return "Parol çox uzundur.";
  return null;
}
