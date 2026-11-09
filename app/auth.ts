import { headers } from "next/headers";
import { USER_EMAIL_HEADER, USER_ID_HEADER, USER_NAME_HEADER } from "./auth-headers";

// The signed-in account, as set on the request by whatever runs in front of the app. Locally that
// is scripts/vite/local-auth-plugin.ts; a production server must strip these headers from incoming
// requests and set them only after its own sign-in has verified the account.
export type User = {
  userId: string;
  displayName: string;
  email: string;
};

export async function getUser(): Promise<User | null> {
  const h = await headers();
  const userId = h.get(USER_ID_HEADER);
  const email = h.get(USER_EMAIL_HEADER);
  if (!userId || !email) return null;
  const name = h.get(USER_NAME_HEADER);
  return { userId, email, displayName: name ? safeDecode(name) : email };
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
