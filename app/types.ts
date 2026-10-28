// Response shapes of /api/v1 as the browser sees them.
import type { Catalog, Offer, Point, Product, Review, Store } from "../lib/catalog";

export type Session = {
  user: { id: string; name: string } | null;
  admin: boolean;
  needsSetup: boolean;
};

export type Favorite = { productId: string; date: string };
export type PriceAlert = { productId: string; target: number; date: string };
export type Personal = { favorites: Favorite[]; alerts: PriceAlert[] };

export type Application = {
  id: string;
  company: string;
  email: string;
  phone: string;
  website: string;
  voen: string;
  note: string;
  status: string;
  date: string;
};
export type AuditEntry = { id: string; userId: string; action: string; date: string };
export type Click = { id: string; offerId: string; storeId: string; date: string };
export type FeedStatus = {
  id?: string;
  checkedAt: string;
  sourceCount: number;
  variantCount: number;
  inStock: number;
  warnings: unknown[];
};
export type SitemapCoverage = { id: string; root: string; allUrls: number; error: string | null };

export type AdminData = {
  product: Product[];
  store: Store[];
  offer: Offer[];
  history: Point[];
  review: Review[];
  application: Application[];
  audit: AuditEntry[];
  click: Click[];
  feed: FeedStatus[];
  sourceCoverage?: Catalog["sourceCoverage"];
  sitemapCoverage: SitemapCoverage[];
};

// One row of whichever admin table is open; each view reads only its own fields.
export type AdminRow = { id: string } & Partial<Product & Offer & Store & Review & Application>;
export type EditKind = "product" | "store" | "offer";
export type EditValue = Record<string, unknown>;

export type Act = (fn: () => Promise<unknown>, msg?: string) => Promise<boolean>;
