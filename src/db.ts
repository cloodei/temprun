import { InfluxDBClient } from "@influxdata/influxdb3-client";

export const client = new InfluxDBClient({
  host: process.env.INFLUXDB_HOST!,
  token: process.env.INFLUXDB_TOKEN,
});
