import Platform from "./platform";
import { catalogSlice, DEFAULT_CITY } from "../lib/catalog-query";
import { publicCatalog } from "../lib/public-data";
import { pageSeo, structuredData } from "../lib/seo";
export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return pageSeo("/", await publicCatalog());
}
export default async function Home() {
  const c = await publicCatalog();
  const jsonLd = structuredData("/", c);
  return (
    <>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />}
      <Platform initialCatalog={catalogSlice(c, { path: "/", city: DEFAULT_CITY })} />
    </>
  );
}
