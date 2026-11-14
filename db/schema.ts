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
  // scrypt$N$r$p$salt$hash (lib/auth/password.mjs)
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at").notNull(),
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
