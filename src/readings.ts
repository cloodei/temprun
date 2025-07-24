import { and, eq, gte, sql } from "drizzle-orm";
import { db } from ".";
import { InsertPayload } from "./types";
import { readingsTable } from "./db/schema";

export async function getAllReadings({ user_id }: { user_id: number }) {
  const data = await db.select({
    temperature: readingsTable.temperature,
    humidity: readingsTable.humidity,
    room: readingsTable.room,
    created_at: readingsTable.created_at
  })
    .from(readingsTable)
    .where(and(
      eq(readingsTable.user_id, user_id),
      gte(readingsTable.created_at, sql`NOW() - INTERVAL '30 DAY'`)
    ))

  return data;
}

export async function getReadingsOf({ user_id, room }: { user_id: number, room: string }) {
  const data = await db.select({
    temperature: readingsTable.temperature,
    humidity: readingsTable.humidity,
    created_at: readingsTable.created_at
  })
    .from(readingsTable)
    .where(and(
      eq(readingsTable.user_id, user_id),
      eq(readingsTable.room, room),
      gte(readingsTable.created_at, sql`NOW() - INTERVAL '30 DAY'`)
    ))

  return data;
}

export async function insertReading({ user_id, temperature, humidity, room }: InsertPayload) {
  await db.insert(readingsTable).values({ user_id, temperature, humidity, room })
}
