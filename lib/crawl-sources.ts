export const crawlSources = [
  { id: "irshad", name: "İrşad", root: "https://irshad.az/sitemap.xml", intervalMs: 30000 },
  { id: "baku", name: "Baku Electronics", root: "https://bakuelectronics.az/sitemap.xml" },
  { id: "mgstore", name: "Music Gallery", root: "https://mgstore.az/media/sitemap/sitemap_az.xml" },
  { id: "soliton", name: "Soliton", root: "https://soliton.az/sitemap.xml" },
  { id: "bytelecom", name: "Bytelecom", root: "https://bytelecom.az/sitemap.xml" },
  { id: "alinino", name: "Ali & Nino", root: "https://alinino.az/sitemap.xml" },
] as const;
export function sourceUrlAllowed(sourceId: string, raw: string) {
  const source = crawlSources.find((s) => s.id === sourceId);
  if (!source) return false;
  try {
    const u = new URL(raw);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      u.hostname.replace(/^www\./, "") === new URL(source.root).hostname.replace(/^www\./, "")
    );
  } catch {
    return false;
  }
}
export function isProductCandidate(sourceId: string, raw: string) {
  const u = new URL(raw);
  if (u.search || !sourceUrlAllowed(sourceId, raw)) return false;
  const path = u.pathname;
  if (sourceId === "irshad") return /^\/az\/mehsullar\/[^/]+\/?$/.test(path);
  if (sourceId === "baku") return path.startsWith("/mehsul/");
  if (sourceId === "alinino") return path.startsWith("/product/");
  if (sourceId === "soliton")
    return path.startsWith("/az/") && path.endsWith(".html") && !path.includes("/pages/");
  if (sourceId === "bytelecom") return path.startsWith("/az/products/");
  return (
    !path.startsWith("/catalog/") &&
    !path.startsWith("/customer/") &&
    !path.startsWith("/media/") &&
    path !== "/" &&
    !path.endsWith("/")
  );
}
export function parseSitemap(xml: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("XML entity qəbul edilmir.");
  if (!/<(?:sitemapindex|urlset)[\s>]/.test(xml)) throw new Error("XML sitemap formatı tapılmadı.");
  const root = /<sitemapindex[\s>]/.test(xml) ? "sitemapindex" : "urlset";
  if (!xml.includes("</" + root + ">")) throw new Error("Sitemap sənədi yarımçıqdır.");
  const locs = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map((m) =>
    m[1].trim().replace(/&amp;/g, "&"),
  );
  if (locs.length > 60000) throw new Error("Sitemap URL limiti keçildi.");
  return { index: /<sitemapindex[\s>]/.test(xml), locs };
}
export function discoverCategoryLinks(sourceId: string, url: string, html: string) {
  const products = new Set<string>(),
    pages = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const u = new URL(m[1].trim().replace(/&amp;/g, "&"), url);
      if (!sourceUrlAllowed(sourceId, u.href)) continue;
      if (isProductCandidate(sourceId, u.href)) products.add(u.href);
      else if (
        u.pathname === new URL(url).pathname &&
        Number(u.searchParams.get("page")) > 1 &&
        Number(u.searchParams.get("page")) <= 100 &&
        [...u.searchParams.keys()].every((k) => k === "page")
      )
        pages.add(u.href);
    } catch {}
  }
  return { products: [...products], pages: [...pages] };
}
