// Local sign-in for `npm run dev`: /giris signs in one fixed test account, /cixis signs out.
// It only answers requests from this machine; identity headers sent by the browser are always
// removed first, so they can only come from here. Production uses e-mail code sign-in instead
// (app/giris, lib/auth/session.ts); its build never reads these headers (see app/auth.ts).
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import {
  SIGN_IN_PATH,
  SIGN_OUT_PATH,
  USER_EMAIL_HEADER,
  USER_ID_HEADER,
  USER_NAME_HEADER,
} from "../../app/auth-headers";

const LOCAL_USER = { id: "local_owner", email: "owner@qepik.test", name: "Yerli test hesabı" };
const COOKIE = "qepik_local_auth";
const IDENTITY_PREFIX = "x-qepik-user-";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const LOCAL_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function localAuth(): Plugin {
  return {
    name: "qepik-local-auth",
    apply: "serve",
    configureServer(server) {
      server.config.logger.info(`Yerli giriş: ${LOCAL_USER.email} (${SIGN_IN_PATH})`);
      server.middlewares.use((req, res, next) => {
        for (const name of Object.keys(req.headers))
          if (name.startsWith(IDENTITY_PREFIX)) removeHeader(req, name);

        let url: URL;
        try {
          url = new URL(req.url ?? "/", `http://${req.headers.host}`);
        } catch {
          return next();
        }
        const authRoute = url.pathname === SIGN_IN_PATH || url.pathname === SIGN_OUT_PATH;
        const local =
          LOCAL_HOSTS.has(url.hostname.replace(/^\[|\]$/g, "").toLowerCase()) &&
          LOCAL_ADDRESSES.has(req.socket.remoteAddress ?? "");
        if (!local) return authRoute ? end(res, 403) : next();

        const cookies = (req.headers.cookie ?? "").split(";").map((c) => c.trim());
        const signedIn = cookies.includes(COOKIE + "=1");
        // The app never sees the sign-in cookie, only the identity it stands for.
        const rest = cookies.filter((c) => c && !c.startsWith(COOKIE + "="));
        removeHeader(req, "cookie");
        if (rest.length) setHeader(req, "cookie", rest.join("; "));

        if (!authRoute) {
          if (signedIn) {
            setHeader(req, USER_ID_HEADER, LOCAL_USER.id);
            setHeader(req, USER_EMAIL_HEADER, LOCAL_USER.email);
            setHeader(req, USER_NAME_HEADER, encodeURIComponent(LOCAL_USER.name));
          }
          return next();
        }
        const crossSite =
          (req.headers.origin && req.headers.origin !== url.origin) ||
          req.headers["sec-fetch-site"] === "cross-site";
        if (crossSite) return end(res, 403);
        if (isPrefetch(req)) return end(res, 204);
        const signIn = url.pathname === SIGN_IN_PATH;
        if (req.method !== "GET" && (signIn || req.method !== "POST")) {
          res.setHeader("Allow", signIn ? "GET" : "GET, POST");
          return end(res, 405);
        }
        res.statusCode = req.method === "POST" ? 303 : 302;
        res.setHeader("Cache-Control", "private, no-store");
        res.setHeader("Location", safeReturn(url.searchParams.get("return_to")));
        res.setHeader(
          "Set-Cookie",
          `${COOKIE}=${signIn ? "1" : ""}; Path=/; ${signIn ? "" : "Max-Age=0; "}HttpOnly; SameSite=Lax`,
        );
        res.end();
      });
    },
  };
}

function isPrefetch(req: IncomingMessage) {
  if (req.headers["next-router-prefetch"] !== undefined) return true;
  if (req.headers["x-middleware-prefetch"] === "1") return true;
  return [req.headers.purpose, req.headers["sec-purpose"]].some(
    (v) => typeof v === "string" && /(^|[;,\s])prefetch($|[;,\s])/i.test(v),
  );
}

// Only same-site paths, never back into the sign-in routes themselves.
function safeReturn(value: string | null) {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const u = new URL(value, "http://local.invalid");
    if (u.origin !== "http://local.invalid") return "/";
    if (u.pathname === SIGN_IN_PATH || u.pathname === SIGN_OUT_PATH) return "/";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/";
  }
}

function removeHeader(req: IncomingMessage, name: string) {
  delete req.headers[name];
  for (let i = req.rawHeaders.length - 2; i >= 0; i -= 2)
    if (req.rawHeaders[i]?.toLowerCase() === name) req.rawHeaders.splice(i, 2);
}

function setHeader(req: IncomingMessage, name: string, value: string) {
  removeHeader(req, name);
  req.headers[name] = value;
  req.rawHeaders.push(name, value);
}

function end(res: ServerResponse, status: number) {
  res.statusCode = status;
  res.setHeader("Cache-Control", "private, no-store");
  res.end();
}
