import { Elysia, t } from "elysia";
import { getAllTemperatures, getTemperaturesOf, insert } from "./temperature";

new Elysia({ prefix: "/api", precompile: true })
  .get("/readings", async () => await getAllTemperatures())
  .get("/readings/:room", async ({ params }) => await getTemperaturesOf(params.room))
  .post("/readings", async ({ body }) => await insert(body), {
    body: t.Object({
      temperature: t.Number(),
      humidity: t.Number(),
      room: t.String(),
    })
  })
  .listen({ hostname: "0.0.0.0", port: 3000 });
