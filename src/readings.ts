import { sql } from "bun";
import { type InsertPayload } from "./types";

// export async function getAllReadings(user_id: number) {
//   const data = await db.select({
//     temperature: readingsTable.temperature,
//     humidity: readingsTable.humidity,
//     room: readingsTable.room,
//     created_at: readingsTable.created_at
//   })
//     .from(readingsTable)
//     .where(and(
//       eq(readingsTable.user_id, user_id),
//       gte(readingsTable.created_at, sql`NOW() - INTERVAL '30 DAY'`)
//     ))

//   return data;
// }

export async function getAllReadings(user_id: number) {
  const data: {
    temperature: number
    humidity: number
    room: string
    created_at: Date
  }[] = await sql`SELECT temperature, humidity, room, created_at FROM readings WHERE user_id=${user_id}`;

  return data;
}

export async function getReadingsOf({ user_id, room }: { user_id: number, room: string }) {
  const data: {
    temperature: number
    humidity: number
    created_at: Date
  }[] = await sql`SELECT temperature, humidity, created_at FROM readings WHERE user_id=${user_id} AND room='${room}'`;

  return data;
}

// export async function getReadingsOf({ user_id, room }: { user_id: number, room: string }) {
//   const data = await db.select({
//     temperature: readingsTable.temperature,
//     humidity: readingsTable.humidity,
//     created_at: readingsTable.created_at
//   })
//     .from(readingsTable)
//     .where(and(
//       eq(readingsTable.user_id, user_id),
//       eq(readingsTable.room, room),
//       gte(readingsTable.created_at, sql`NOW() - INTERVAL '30 DAY'`)
//     ))

//   return data;
// }

export async function insertReading(payload: InsertPayload) {
  await sql
    `INSERT INTO readings (user_id, room, temperature, humidity) VALUES (${payload.user_id}, ${payload.room}, ${payload.temperature}, ${payload.humidity})`
}
