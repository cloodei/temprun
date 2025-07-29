import { drizzle } from "drizzle-orm/postgres-js";
import { upstashCache } from "drizzle-orm/cache/upstash";
import { eq, and, gte, sql } from "drizzle-orm";
import { usersTable, refreshTokensTable, readingsTable } from "./schema";

// const db = drizzle(process.env.NILE_URL!, {
//   cache: upstashCache({
//     url: process.env.UPSTASH_REDIS_REST_URL!,
//     token: process.env.UPSTASH_REDIS_REST_TOKEN!,
//     global: true,
//     config: {
//       ex: 60 * 60 * 24
//     }
//   })
// })
const db = drizzle(process.env.NILE_URL!)

const selectUser = db.select({
  id: usersTable.id,
  password: usersTable.password
})
  .from(usersTable)
  .where(eq(usersTable.username, sql.placeholder("username")))
  .prepare("selectUser")

const insertUser = db.insert(usersTable)
  .values({
    username: sql.placeholder("username"),
    password: sql.placeholder("password")
  })
  .returning({
    id: usersTable.id,
    username: usersTable.username,
    password: usersTable.password
  })
  .prepare("insertUser")


const selectRefresh = db.select({
  id: refreshTokensTable.id,
  user_id: refreshTokensTable.user_id,
  username: refreshTokensTable.username,
  created_at: refreshTokensTable.created_at
})
  .from(refreshTokensTable)
  .where(eq(refreshTokensTable.token_hash, sql.placeholder("token_hash")))
  .prepare("selectRefresh")

const insertRefresh = db.insert(refreshTokensTable)
  .values({
    user_id: sql.placeholder("user_id"),
    token_hash: sql.placeholder("token_hash"),
    username: sql.placeholder("username")
  })
  .prepare("insertRefresh")

const updateRefresh = db.update(refreshTokensTable)
  .set({
    created_at: sql`NOW()`,
    token_hash: sql.placeholder("token_hash") as any
  })
  .where(eq(refreshTokensTable.id, sql.placeholder("id")))
  .prepare("updateRefresh")
  
const deleteRefreshById = db.delete(refreshTokensTable)
  .where(eq(refreshTokensTable.id, sql.placeholder("id")))
  .prepare("deleteRefreshById")

const deleteRefreshByTokenHash = db.delete(refreshTokensTable)
  .where(eq(refreshTokensTable.token_hash, sql.placeholder("token_hash")))
  .prepare("deleteRefreshByTokenHash")


const selectReadingsAll = db.select({
  temperature: readingsTable.temperature,
  humidity: readingsTable.humidity,
  room: readingsTable.room,
  created_at: readingsTable.created_at
})
  .from(readingsTable)
  .where(eq(readingsTable.user_id, sql.placeholder("user_id")))
  .prepare("selectReadingsAll")

const selectReadingsOf = db.select({
  temperature: readingsTable.temperature,
  humidity: readingsTable.humidity,
  room: readingsTable.room,
  created_at: readingsTable.created_at
})
  .from(readingsTable)
  .where(and(
    eq(readingsTable.user_id, sql.placeholder("user_id")),
    eq(readingsTable.room, sql.placeholder("room")),
    gte(readingsTable.created_at, sql`NOW() - INTERVAL '30 DAY'`)
  ))
  .prepare("selectReadingsOf")

const insertReadings = db.insert(readingsTable)
  .values({
    user_id: sql.placeholder("user_id"),
    room: sql.placeholder("room"),
    temperature: sql.placeholder("temperature"),
    humidity: sql.placeholder("humidity")
  })
  .prepare("insertReadings")

export {
  db,

  selectUser,
  insertUser,

  insertRefresh,
  updateRefresh,
  selectRefresh,
  deleteRefreshById,
  deleteRefreshByTokenHash,

  selectReadingsAll,
  selectReadingsOf,
  insertReadings
}
