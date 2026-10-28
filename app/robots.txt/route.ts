import { SITE_URL } from "../../lib/seo";
export function GET() {
  return new Response(
    "User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /axtaris\nDisallow: /bildirisler\nDisallow: /secilmisler\nDisallow: /muqayise\nSitemap: " +
      SITE_URL +
      "/sitemap.xml\n",
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}
