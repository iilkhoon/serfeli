import { catalogSlice, DEFAULT_CITY } from "../../lib/catalog-query";
import { publicCatalog } from "../../lib/public-data";
import { pageSeo, structuredData } from "../../lib/seo";
import { categories } from "../../lib/catalog";
import { notFound } from "next/navigation";
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
    c = await publicCatalog(),
    parts = path.split("?")[0].split("/").filter(Boolean);
  if (parts[0] === "mehsul" && !c.products.some((p) => p.id === parts[1] && p.active)) notFound();
  if (parts[0] === "kateqoriya" && !categories.some((cat) => cat.id === parts[1])) notFound();
  if (parts[0] === "magazalar" && parts[1] && !c.stores.some((s) => s.id === parts[1] && s.active))
    notFound();
  if (
    ![
      "mehsul",
      "kateqoriya",
      "magazalar",
      "kataloq",
      "endirimler",
      "rehber",
      "magaza-qeydiyyat",
      "admin",
      "bildirisler",
      "secilmisler",
      "muqayise",
      "axtaris",
    ].includes(parts[0])
  )
    notFound();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: structuredData(path, c) }}
      />
      <Platform initialPath={path} initialCatalog={catalogSlice(c, { path, city: DEFAULT_CITY })} />
    </>
  );
}
