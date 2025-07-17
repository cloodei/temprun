import mqtt from "mqtt";
import { jwt } from "@elysiajs/jwt";
import { cors } from "@elysiajs/cors";
import { drizzle } from "drizzle-orm/postgres-js";
import { Elysia, t } from "elysia";
import { authenticateUser, createUser } from "./auth";
import { getAllReadings, getReadingsOf, insertReading } from "./readings";


export const db = drizzle(process.env.DATABASE_URL!)

const mqttClient = mqtt.connect({
  host: process.env.MQTT_CLUSTER_URL,
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  port: 8883,
  protocol: "mqtts"
});

mqttClient.on("connect", () => {
  console.log("Connected to MQTT broker");
});

mqttClient.on("message", async (_, message) => {
  const [user_id, t, h, room] = message.toString().split("|");
  insertReading({
    user_id: Number(user_id),
    temperature: Number(t),
    humidity: Number(h),
    room
  });
});

mqttClient.subscribe("pi/readings");

mqttClient.on("error", (error) => {
  console.error("Error connecting to MQTT broker:", error);
});

const app = new Elysia({ precompile: true })
  .use(cors({
    origin: ["http://localhost:5173", "https://flare.nguyenan-study.workers.dev"],
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
      return status(404, "User not found");
    if (user === true)
      return status(400, "Invalid credentials");
    
    const payload = {
      id: user.id,
      username: username
    }
    const [accessToken, refreshToken] = await Promise.all([
      access_token.sign(payload),
      refresh_token.sign(payload)
    ]);
    
    cookie["refresh_token"].set({
      value: refreshToken,
      httpOnly: true,
      maxAge: Number(process.env.REFRESH_JWT_EXPIRATION_NUM),
      secure: true,
      sameSite: "none"
    })
    
    return {
      access_token: accessToken,
      user: payload
    }
  }, {
    body: t.Object({
      username: t.String(),
      password: t.String(),
    })
  })
  .post("/signup", async ({ body, status, cookie, access_token, refresh_token }) => {
    const { username, password } = body;
    const user = await createUser(username, password)
    
    if (user === false)
      return status(406, "Unable to create user");
    if (user === true)
      return status(409, "User already exists");
    
    const payload = {
      id: user.id,
      username
    }
    
    const [accessToken, refreshToken] = await Promise.all([
      access_token.sign(payload),
      refresh_token.sign(payload)
    ]);
    
    cookie["refresh_token"].set({
      value: refreshToken,
      httpOnly: true,
      maxAge: Number(process.env.REFRESH_JWT_EXPIRATION_NUM),
      secure: true,
      sameSite: "none"
    })
    
    return status(201, {
      access_token: accessToken,
      user: payload
    })
  }, {
    body: t.Object({
      username: t.String(),
      password: t.String(),
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
    cookie["refresh_token"].remove();
  })
  .post("/refresh", async ({ access_token, refresh_token, cookie, status }) => {
    try {
      if (!cookie["refresh_token"]?.value)
        return status(400, "Invalid refresh token");
      
      const user = await refresh_token.verify(cookie["refresh_token"].value);
      if (user === false)
        return status(400, "Invalid refresh token");
      
      const payload = {
        id: user.id,
        username: user.username
      }
      
      const [accessToken, refreshToken] = await Promise.all([
        access_token.sign(payload),
        refresh_token.sign(payload)
      ]);
      
      cookie["refresh_token"].set({
        value: refreshToken,
        httpOnly: true,
        maxAge: Number(process.env.REFRESH_JWT_EXPIRATION_NUM),
        secure: true,
        sameSite: "none"
      })
      
      return {
        access_token: accessToken,
        user: payload
      }
    }
    catch (error) {
      console.error(error);
      return status(400, "Invalid refresh token");
    }
  })
  .get("/me", async ({ headers, access_token, refresh_token, cookie, status }) => {
    const token = headers["authorization"]?.split(" ")[1];
    if (!token || !token.startsWith("Bearer "))
      return status(401, "Invalid access token");

    try {
      let user = await access_token.verify(token);
      if (user)
        return {
          access_token: token,
          user
        };
      
      if (!cookie["refresh_token"]?.value)
        return status(400, "Invalid refresh token");
      
      user = await refresh_token.verify(cookie["refresh_token"].value);
      if (user === false)
        return status(400, "Invalid refresh token");
        
      const payload = {
        id: user.id,
        username: user.username
      }
      
      const [accessToken, refreshToken] = await Promise.all([
        access_token.sign(payload),
        refresh_token.sign(payload)
      ]);
      
      cookie["refresh_token"].set({
        value: refreshToken,
        httpOnly: true,
        maxAge: Number(process.env.REFRESH_JWT_EXPIRATION_NUM),
        secure: true,
        sameSite: "none"
      })
      
      return {
        access_token: accessToken,
        user: payload
      }
    }
    catch (error) {
      console.error(error);
      return status(400, "Invalid access token");
    }
  })
  .derive(async ({ headers, access_token }) => {
    const token = headers["authorization"]?.split(" ");
    if (!token || token.length !== 2 || token[0] !== "Bearer")
      return { user: null };

    try {
      const user = await access_token.verify(token[1]);
      if (user === false)
        return { user: null };

      return { user };
    }
    catch (error) {
      console.error(error);
      return { user: null };
    }
  })

  .get("/readings", async ({ user, status }) => {
    if (!user)
      return status(400, "Invalid access token");

    return await getAllReadings({ user_id: user.id });
  })
  .get("/readings/:room", async ({ params, user, status }) => {
    if (!user)
      return status(400, "Invalid access token");
    
    return await getReadingsOf({ user_id: user.id, room: params.room });
  }, {
    params: t.Object({
      room: t.String()
    })
  })
  .post("/readings", async ({ body }) => await insertReading(body), {
    body: t.Object({
      user_id: t.Number(),
      temperature: t.Number(),
      humidity: t.Number(),
      room: t.String()
    })
  })
  .listen({ hostname: "0.0.0.0", port: 3000 });
