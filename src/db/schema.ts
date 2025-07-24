import * as pg from "drizzle-orm/pg-core";

export const usersTable = pg.pgTable("users", {
  id: pg.serial("id").primaryKey(),
  username: pg.varchar({ length: 128 }).unique().notNull(),
  password: pg.varchar({ length: 255 }).notNull(),
  created_at: pg.timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updated_at: pg.timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull().$onUpdateFn(() => new Date())
})

export const refreshTokensTable = pg.pgTable("refresh_tokens", {
  id: pg.serial("id").primaryKey(),
  user_id: pg.serial("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  username: pg.varchar({ length: 128 }).notNull(),
  token_hash: pg.varchar({ length: 255 }).notNull().unique(),
  created_at: pg.timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull()
}, table => [
  pg.index("user_index").on(table.user_id)
])

export const readingsTable = pg.pgTable("readings", {
  id: pg.serial("id").primaryKey(),
  user_id: pg.serial("user_id").notNull().references(() => usersTable.id),
  room: pg.varchar({ length: 128 }).notNull(),
  temperature: pg.real().notNull(),
  humidity: pg.real().notNull(),
  created_at: pg.timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull()
}, table => [
  pg.index("room_idx").on(table.room),
  pg.index("user_idx").on(table.user_id)
])
