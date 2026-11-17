import { pgTable, text, timestamp, bigint, integer, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
export const pockets = pgTable('finance_pockets', {
  id: text().primaryKey(), owner: text().notNull(), name: text().notNull(),
  kind: text().notNull(), category: text().notNull(), description: text().notNull().default(''),
  target: bigint({ mode: 'number' }).notNull(), balance: bigint({ mode: 'number' }).notNull().default(0),
  contribution: bigint({ mode: 'number' }).notNull(), frequency: text().notNull(), firstDate: text('first_date').notNull(),
  nextIndex: integer('next_index').notNull().default(0), cycle: text().notNull(),
  image: text(), createdAt: timestamp('created_at').defaultNow().notNull(),
});
export const entries = pgTable('finance_entries', {
  id: text().primaryKey(), owner: text().notNull(), pocketId: text('pocket_id').notNull().references(() => pockets.id, { onDelete: 'cascade' }),
  type: text().notNull(), amount: bigint({ mode: 'number' }).notNull(), note: text().notNull().default(''),
  date: text().notNull(), occurrence: text(), createdAt: timestamp('created_at').defaultNow().notNull(),
}, t => [uniqueIndex('finance_occurrence_unique').on(t.pocketId, t.occurrence)]);
export const credentials = pgTable('finance_credentials', {
  id: text().primaryKey(), owner: text().notNull(), publicKey: text('public_key').notNull(), counter: bigint({ mode: 'number' }).notNull(), transports: jsonb().$type<string[]>().notNull(),
});
export const sessions = pgTable('finance_sessions', {
  id: text().primaryKey(), owner: text().notNull(), expiresAt: timestamp('expires_at').notNull(),
});
export const challenges = pgTable('finance_challenges', {
  id: text().primaryKey(), owner: text(), challenge: text().notNull(), kind: text().notNull(), origin: text().notNull(), expiresAt: timestamp('expires_at').notNull(),
});
