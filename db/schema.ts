// Durable application records; the crawl-source expression index is maintained in migration 0001.
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const records = sqliteTable('records', { id:text('id').primaryKey(),kind:text('kind').notNull(),payload:text('payload').notNull(),updatedAt:integer('updated_at').notNull() },t=>[index('records_kind_updated').on(t.kind,t.updatedAt)]);
export const personal = sqliteTable('personal', { id:text('id').primaryKey(),userId:text('user_id').notNull(),kind:text('kind').notNull(),payload:text('payload').notNull(),updatedAt:integer('updated_at').notNull() });
