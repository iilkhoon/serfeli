// Shapes shared by the storefront and the API for product questions and view counts.
// Kept free of server imports so client components can use them.

// Stored as `records` kind "question"; userId never leaves the server. The owner answers through
// POST /api/v1/admin/questions/answer (lib/api/merchant.ts), which sets answer/answeredAt/answeredBy
// ("Qəpik" or the answering store's name).
export type Question = {
  id: string;
  productId: string;
  text: string;
  name: string;
  userId?: string;
  status: "pending" | "approved" | "rejected";
  date: string;
  answer?: string;
  answeredAt?: string;
  answeredBy?: string;
};

export type PublicQuestion = Omit<Question, "userId" | "status">;

// Server-rendered extras for a product page.
export type ProductExtras = {
  productId: string;
  questions: PublicQuestion[];
  views: number;
};

export type TopViewed = { productId: string; name: string; views: number };
