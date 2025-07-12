import mqtt from "mqtt/*";
import { jwt } from "@elysiajs/jwt";
import { cors } from "@elysiajs/cors";
import { Elysia, t } from "elysia";
import { getAllTemperatures, getTemperaturesOf, insert } from "./temperature";

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

mqttClient.on("message", (topic, message) => {
  switch (topic) {
    case "pi/readings":
      const [t, h, room] = message.toString().split("|");
      insert({
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
    if (username !== "x" || password !== "y") {
      return status(401, "Invalid credentials");
    }

    const user = {
      id: 1,
      username
    }
    
    const [accessToken, refreshToken] = await Promise.all([
      access_token.sign(user),
      refresh_token.sign(user)
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
      user
    }
  }, {
    cookie: t.Object({
      refresh_token: t.String()
    }),
    body: t.Object({
      username: t.String(),
      password: t.String(),
    })
  })
  .post("/signup", async ({ body, status, cookie, access_token, refresh_token }) => {
    const { username, password } = body;
    
    const user = {
      id: 1,
      username
    }
    
    const [accessToken, refreshToken] = await Promise.all([
      access_token.sign(user),
      refresh_token.sign(user)
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
      user
    })
  }, {
    body: t.Object({
      username: t.String(),
      password: t.String(),
    }),
    cookie: t.Object({
      refresh_token: t.String()
    })
  })
  .post("/logout", async ({ cookie }) => {
    cookie.refresh_token.remove();
  }, {
    cookie: t.Object({
      refresh_token: t.String()
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
      
      const [accessToken, refreshToken] = await Promise.all([
        access_token.sign({ id: user.id, username: user.username }),
        refresh_token.sign({ id: user.id, username: user.username })
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
        user
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

  .get("/me", async ({ access_token, cookie, status }) => {
    try {
      const user = await access_token.verify(cookie.access_token.value);
      if (!user) {
        return status(401, "Invalid access token");
      }
      return user;
    }
    catch (error) {
      console.error(error);
      return status(401, "Invalid access token");
    }
  }, {
    cookie: t.Object({
      access_token: t.String()
    })
  })
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
