import { catalogSlice, DEFAULT_CITY, PAGE_SIZE } from "../../lib/catalog-query";
import { publicCatalog } from "../../lib/public-data";
import {
  listingPageNumber,
  pageSeo,
  parseRoute,
  routeDecision,
  structuredData,
} from "../../lib/seo";
import { notFound, permanentRedirect } from "next/navigation";
import Platform from "../platform";
export const dynamic = "force-dynamic";
type Props = {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
async function routePath({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query || {})) if (typeof v === "string") q.set(k, v);
  return "/" + slug.join("/") + (q.size ? "?" + q.toString() : "");
}
export async function generateMetadata(props: Props) {
  return pageSeo(await routePath(props), await publicCatalog());
}
export default async function Page(props: Props) {
  const path = await routePath(props),
    c = await publicCatalog();
  const decision = routeDecision(path, c);
  if (decision.kind === "redirect") permanentRedirect(decision.to);
  if (decision.kind === "notFound") {
    // While the database is unreachable the catalog is empty; a 404 would tell search engines
    // that every product is gone. Failing with a server error keeps the pages in the index.
    const { page } = parseRoute(path);
    if (c.dataStatus?.state === "unavailable" && ["mehsul", "magazalar"].includes(page))
      throw new Error("Kataloq müvəqqəti əlçatan deyil.");
    notFound();
  }
  // ?page=N renders that listing page on the server, so paginated URLs have their own content.
  const pageNo = listingPageNumber(parseRoute(path).params);
  const offset = pageNo ? (pageNo - 1) * PAGE_SIZE : 0;
  const slice = catalogSlice(c, { path, city: DEFAULT_CITY, offset });
  if (pageNo && slice.pageOffset < offset && slice.matchedTotal > 0) notFound();
  const jsonLd = structuredData(path, c);
  return (
    <>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />}
      <Platform initialPath={path} initialCatalog={slice} />
    </>
  );
}
