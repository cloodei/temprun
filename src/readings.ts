import { selectReadingsAll, selectReadingsOf, insertReadings } from "./db/db";

export function getAllReadings(user_id: number) {
  return selectReadingsAll.execute({ user_id })
}

export function getReadingsOf({ user_id, room }: { user_id: number, room: string }) {
  return selectReadingsOf.execute({ user_id, room })
}

interface InsertPayload {
  user_id: number;
  temperature: number;
  humidity: number;
  room: string;
}
export async function insertReading(payload: InsertPayload) {
  await insertReadings.execute({
    user_id: payload.user_id,
    room: payload.room,
    temperature: payload.temperature,
    humidity: payload.humidity
  })
}
