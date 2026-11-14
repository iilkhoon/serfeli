// Durable application records; the crawl-source expression index is maintained in migration 0001.
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const records = sqliteTable(
  "records",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    payload: text("payload").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("records_kind_updated").on(t.kind, t.updatedAt)],
);
export const personal = sqliteTable("personal", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  kind: text("kind").notNull(),
  payload: text("payload").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// Sign-in (app/auth.ts, lib/auth/): one row per account, keyed by a random id.
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: integer("created_at").notNull(),
});
// The pending one-time sign-in code for an e-mail address (stored as an HMAC, never in clear).
export const authCodes = sqliteTable("auth_codes", {
  email: text("email").primaryKey(),
  codeHash: text("code_hash").notNull(),
  expiresAt: integer("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  windowStart: integer("window_start").notNull(),
  sends: integer("sends").notNull().default(1),
});
// Signed-in devices: the web cookie and mobile bearer tokens both map to a row here by SHA-256.
export const sessions = sqliteTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull(),
    client: text("client").notNull(),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("sessions_user").on(t.userId)],
);
