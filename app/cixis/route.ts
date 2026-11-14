import { safeReturnPath } from "../../lib/auth/return-path";
import { clearedSessionCookie, endSession, requestToken } from "../../lib/auth/session";
export const dynamic = "force-dynamic";

// Sign-out for the website: ends the session behind the cookie and returns to ?return_to.
// In `npm run dev` the local sign-in plugin answers /cixis before this route.
async function signOut(req: Request) {
  const url = new URL(req.url);
  const origin = req.headers.get("origin");
  if ((origin && origin !== url.origin) || req.headers.get("sec-fetch-site") === "cross-site")
    return new Response(null, { status: 403, headers: { "Cache-Control": "no-store" } });
  await endSession(requestToken(req.headers));
  return new Response(null, {
    status: req.method === "POST" ? 303 : 302,
    headers: {
      Location: safeReturnPath(url.searchParams.get("return_to")),
      "Set-Cookie": clearedSessionCookie(),
      "Cache-Control": "private, no-store",
    },
  });
}
export const GET = signOut;
export const POST = signOut;
