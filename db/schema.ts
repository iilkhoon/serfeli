// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const records = sqliteTable('records', { id:text('id').primaryKey(),kind:text('kind').notNull(),payload:text('payload').notNull(),updatedAt:integer('updated_at').notNull() });
export const personal = sqliteTable('personal', { id:text('id').primaryKey(),userId:text('user_id').notNull(),kind:text('kind').notNull(),payload:text('payload').notNull(),updatedAt:integer('updated_at').notNull() });
