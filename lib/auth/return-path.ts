// Where to go after signing in or out: only same-site paths, never back into the sign-in routes.
export function safeReturnPath(value: string | null | undefined) {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  try {
    const u = new URL(value, "http://local.invalid");
    if (u.origin !== "http://local.invalid") return "/";
    if (u.pathname === "/giris" || u.pathname === "/cixis") return "/";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/";
  }
}
