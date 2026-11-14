import { headers } from "next/headers";
import { isOwnerEmail, requestToken, sessionUser } from "../lib/auth/session";
import { USER_EMAIL_HEADER, USER_ID_HEADER, USER_NAME_HEADER } from "./auth-headers";

export { isOwnerEmail };

// The signed-in account. Production trusts only a session token (cookie or Bearer, see
// lib/auth/session.ts). The x-qepik-user-* headers are read in `npm run dev` alone, where
// scripts/vite/local-auth-plugin.ts strips them from the browser and sets them itself; the
// production build compiles that branch out, so a forged header grants nothing.
export type User = {
  userId: string;
  displayName: string;
  email: string;
};

export async function getUser(): Promise<User | null> {
  const h = await headers();
  if (import.meta.env.DEV) {
    const userId = h.get(USER_ID_HEADER);
    const email = h.get(USER_EMAIL_HEADER);
    if (userId && email) {
      const name = h.get(USER_NAME_HEADER);
      return { userId, email, displayName: name ? safeDecode(name) : email };
    }
  }
  return sessionUser(requestToken(h));
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
