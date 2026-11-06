// Response shapes of /api/v1 as the browser sees them.
import type { Catalog, Offer, Point, Product, Review, Store, StoreContacts } from "../lib/catalog";
import type { Placement } from "../lib/plans";

export type Session = {
  user: { id: string; name: string } | null;
  admin: boolean;
  needsSetup: boolean;
};

export type Favorite = { productId: string; date: string };
export type PriceAlert = { productId: string; target: number; date: string };
export type Personal = { favorites: Favorite[]; alerts: PriceAlert[] };

// Merchant applications: `type` is "store" (registration) or "promotion" (premium/ads request);
// records without `type` come from the original short form.
export type Application = {
  id: string;
  type?: "store" | "promotion";
  status: string;
  date: string;
  userId?: string;
  adminNote?: string;
  decidedAt?: string;
  storeId?: string;
  placementId?: string;
  note?: string;
  // Original short form.
  company?: string;
  email?: string;
  phone?: string;
  website?: string;
  voen?: string;
  // Store registration.
  storeName?: string;
  domain?: string;
  kind?: "shop" | "marketplace";
  categories?: string[];
  feedFormat?: string;
  feedUrl?: string;
  contacts?: StoreContacts;
  contactPerson?: { name: string; role?: string; email: string; phone: string };
  // Premium / ads request.
  promotion?: "premium" | "boost" | "banner";
  target?: string;
  period?: string;
  budget?: number;
};
// Product question (storefront Q&A); answered and moderated in the admin panel.
export type Question = {
  id: string;
  productId: string;
  text: string;
  name?: string;
  userId?: string;
  status: "pending" | "approved" | "rejected";
  date: string;
  answer?: string;
  answeredAt?: string;
};
// Product view counter; shape kept loose until the storefront settles it.
export type ProductView = { id: string; productId?: string; count?: number; views?: number };
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
  placement?: Placement[];
  question?: Question[];
  view?: ProductView[];
  sourceCoverage?: Catalog["sourceCoverage"];
  sitemapCoverage: SitemapCoverage[];
};

// One row of whichever admin table is open; each view reads only its own fields.
export type AdminRow = { id: string } & Partial<Product & Offer & Review> &
  Partial<Omit<Store, "kind" | "contacts">> &
  Partial<Omit<Application, "kind" | "contacts">>;
export type EditKind = "product" | "store" | "offer";
export type EditValue = Record<string, unknown>;

export type Act = (fn: () => Promise<unknown>, msg?: string) => Promise<boolean>;
