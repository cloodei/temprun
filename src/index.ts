import mqtt from "mqtt/*";
import bcrypt from "bcrypt"
import { jwt } from "@elysiajs/jwt";
import { cors } from "@elysiajs/cors";
import { drizzle } from "drizzle-orm/postgres-js";
import { Elysia, t } from "elysia";
import { InfluxDBClient } from "@influxdata/influxdb3-client";
import { insertReading } from "./readings";
import { authenticateUser, createUser } from "./auth";
import { getAllTemperatures, getTemperaturesOf } from "./temperature";


const client = new InfluxDBClient({
  host: process.env.INFLUXDB_HOST!,
  token: process.env.INFLUXDB_TOKEN,
});

const db = drizzle(process.env.DATABASE_URL!)

const mqttClient = mqtt.connect({
  host: process.env.MQTT_CLUSTER_URL,
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  port: 8883,
  protocol: "mqtts"
});

export { client, db, mqttClient };


mqttClient.on("connect", () => {
  console.log("Connected to MQTT broker");
});

mqttClient.on("message", (topic, message) => {
  switch (topic) {
    case "pi/readings":
      const [user_id, t, h, room] = message.toString().split("|");
      insertReading({
        user_id: Number(user_id),
        temperature: Number(t),
        humidity: Number(h),
        room
      });
      break;

    default:
      console.log("Unknown topic:", topic);
      break;
  }
});

mqttClient.subscribe("pi/readings");

mqttClient.on("error", (error) => {
  console.error("Error connecting to MQTT broker:", error);
});


new Elysia({ precompile: true })
  .use(cors({
    origin: "*",
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  }))
  .use(jwt({
    name: "access_token",
    secret: process.env.JWT_SECRET!,
    exp: process.env.JWT_EXPIRATION,
    schema: t.Object({
      id: t.Number(),
      username: t.String(),
    })
  }))
  .use(jwt({
    name: "refresh_token",
    secret: process.env.REFRESH_JWT_SECRET!,
    exp: process.env.REFRESH_JWT_EXPIRATION,
    schema: t.Object({
      id: t.Number(),
      username: t.String(),
    })
  }))

  .post("/login", async ({ access_token, refresh_token, cookie, body, status }) => {
    const { username, password } = body;
    const user = await authenticateUser(username, password)
    
    if (user === false)
      return status(401, "User not found");
    if (user === true)
      return status(403, "Invalid credentials");
    
    const payload = {
      id: user.id,
      username: username
    }
    const [accessToken, refreshToken] = await Promise.all([
      access_token.sign(payload),
      refresh_token.sign(payload)
    ]);
    
    cookie.refresh_token.set({
      value: refreshToken,
      httpOnly: true,
      maxAge: Number(process.env.REFRESH_JWT_EXPIRATION_NUM),
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict"
    })
    
    return {
      access_token: accessToken,
      user: payload
    }
  }, {
    cookie: t.Object({
      refresh_token: t.Optional(t.String())
    }),
    body: t.Object({
      username: t.String(),
      password: t.String(),
    })
  })
  .post("/signup", async ({ body, status, cookie, access_token, refresh_token }) => {
    const { username, password } = body;
    const { id } = await createUser(username, await bcrypt.hash(password, 10))
    
    const payload = {
      id,
      username
    }
    
    const [accessToken, refreshToken] = await Promise.all([
      access_token.sign(payload),
      refresh_token.sign(payload)
    ]);
    
    cookie.refresh_token.set({
      value: refreshToken,
      httpOnly: true,
      maxAge: Number(process.env.REFRESH_JWT_EXPIRATION_NUM),
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict"
    })
    
    return status(201, {
      access_token: accessToken,
      user: payload
    })
  }, {
    body: t.Object({
      username: t.String(),
      password: t.String(),
    }),
    cookie: t.Object({
      refresh_token: t.Optional(t.String())
    })
  })
  .post("/pi/login", async ({ body }) => {
    const { username, password } = body;
    return await authenticateUser(username, password)
  }, {
    body: t.Object({
      username: t.String(),
      password: t.String()
    })
  })
  .post("/logout", async ({ cookie }) => {
    cookie.refresh_token.remove();
  }, {
    cookie: t.Object({
      refresh_token: t.Optional(t.String())
    })
  })
  .post("/refresh", async ({ access_token, refresh_token, cookie, status }) => {
    try {
      if (!cookie.refresh_token.value) {
        return status(401, "Invalid refresh token");
      }
      
      const user = await refresh_token.verify(cookie.refresh_token.value);
      if (!user) {
        return status(401, "Invalid refresh token");
      }
      
      const payload = {
        id: user.id,
        username: user.username
      }
      
      const [accessToken, refreshToken] = await Promise.all([
        access_token.sign(payload),
        refresh_token.sign(payload)
      ]);
      
      cookie.refresh_token.set({
        value: refreshToken,
        httpOnly: true,
        maxAge: Number(process.env.REFRESH_JWT_EXPIRATION_NUM),
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict"
      })
      
      return {
        access_token: accessToken,
        user: payload
      }
    }
    catch (error) {
      console.error(error);
      return status(401, "Invalid refresh token");
    }
  }, {
    cookie: t.Object({
      refresh_token: t.String()
    })
  })
  .derive(async ({ headers, access_token }) => {
    const token = headers["authorization"]?.split(" ")[1];
    if (!token || !token.startsWith("Bearer ")) {
      return { user: null };
    }

    try {
      return { user: await access_token.verify(token) };
    }
    catch (error) {
      console.error(error);
      return { user: null };
    }
  })

  .get("/me", async ({ user, status }) => {
    if (!user) {
      return status(401, "Invalid access token");
    }
    return user;
  })
  .get("/readings", async () => await getAllTemperatures())
  .get("/readings/:room", async ({ params }) => await getTemperaturesOf(params.room))
  .post("/readings", async ({ body }) => await insertReading(body), {
    body: t.Object({
      user_id: t.Number(),
      temperature: t.Number(),
      humidity: t.Number(),
      room: t.String()
    })
  })
  .listen({ hostname: "0.0.0.0", port: 3000 });
