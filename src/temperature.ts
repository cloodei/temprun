import { Point } from "@influxdata/influxdb3-client";
import { client } from "./db";

export async function getAllTemperatures() {
  const query = `SELECT * FROM readings WHERE time >= now() - interval '1 day' ORDER BY time DESC`;
  const result = client.query(query, process.env.INFLUXDB_BUCKET!);
  
  const data = new Array<{ time: Date; temperature: number; humidity: number }>();
  for await (const row of result) {
    data.push({
      time: new Date(row.time),
      temperature: row.temperature,
      humidity: row.humidity,
    });
  }
  return data;
}

export async function getTemperaturesOf(room: string) {
  const query = `SELECT * FROM readings WHERE room = '${room}' AND time >= now() - interval '1 day' ORDER BY time DESC`;
  const result = client.query(query, process.env.INFLUXDB_BUCKET!);

  const data = new Array<{ time: string; temperature: number; humidity: number }>();
  for await (const row of result) {
    data.push({
      time: row.time.toISOString(),
      temperature: row.temperature,
      humidity: row.humidity,
    });
  }
  return data;
}

type InsertPayload = {
  temperature: number;
  humidity: number;
  room: string;
};
export async function insert({ temperature, humidity, room }: InsertPayload) {
  const point = Point.measurement("readings")
    .setTag("room", room)
    .setFloatField("temperature", temperature)
    .setFloatField("humidity", humidity)
  
  await client.write(point, process.env.INFLUXDB_BUCKET!);
}
