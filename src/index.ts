import mqtt from "mqtt";
import { eq } from "drizzle-orm";
import { jwt } from "@elysiajs/jwt";
import { cors } from "@elysiajs/cors";
import { drizzle } from "drizzle-orm/bun-sql";
import { Elysia, t } from "elysia";
import { refreshTokensTable } from "./db/schema";
import { authenticateUser, createUser } from "./auth";
import { getAllReadings, getReadingsOf, insertReading } from "./readings";


export const db = drizzle(process.env.DATABASE_URL!)
db.execute('SELECT 1 FROM "refresh_tokens" WHERE "id"=1')

const refreshHashSecret = process.env.REFRESH_HASH_SECRET!, refreshExpiredTime = Number(process.env.REFRESH_EXPIRATION_TIME!);
const mqttClient = mqtt.connect({
  host: process.env.MQTT_CLUSTER_URL,
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  port: 8883,
  protocol: "mqtts"
});

mqttClient.on("connect",  () => console.log("Connected to MQTT broker"));
mqttClient.on("error", error => console.error("Error connecting to MQTT broker:", error));

mqttClient.on("message", (_, message) => {
  const [user_id, t, h, room] = message.toString().split("|");
  insertReading({
    user_id: Number(user_id),
    temperature: Number(t),
    humidity: Number(h),
    room
  });
});

mqttClient.subscribe("pi/readings");

const hasher = new Bun.CryptoHasher("sha256");

new Elysia({ precompile: true })
  .use(cors({
    origin: ["https://flare.nguyenan-study.workers.dev", "http://localhost:5173"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  }))
  .use(jwt({
    name: "access_token",
    secret: process.env.JWT_SECRET!,
    exp: process.env.JWT_EXPIRATION,
    schema: t.Object({
      id: t.Number(),
      username: t.String()
    })
  }))

  .post("/login", async ({ access_token, cookie, body, status }) => {
    const { username, password } = body;
    const user = await authenticateUser(username, password)
    
    if (user === false)
      return status(404, "User not found");
    if (user === true)
      return status(400, "Invalid credentials");
    
    const refreshToken = crypto.randomUUID();
    const accessToken = await access_token.sign({
      id: user.id,
      username
    });
    
    const refreshTokenHash = hasher.update(refreshHashSecret + refreshToken).digest("hex");
    db.insert(refreshTokensTable).values({
      user_id: user.id,
      token_hash: refreshTokenHash,
      username
    });

    cookie["refresh_token"].set({
      value: refreshToken,
      httpOnly: true,
      maxAge: Number(process.env.REFRESH_EXPIRATION_SECONDS),
      secure: true,
      sameSite: "none"
    })
    
    return {
      access_token: accessToken,
      user_id: user.id
    }
  }, {
    body: t.Object({
      username: t.String(),
      password: t.String()
    })
  })
  .post("/signup", async ({ body, status, cookie, access_token }) => {
    const { username, password } = body;
    const user = await createUser(username, password)
    
    if (user === false)
      return status(406, "Unable to create user");
    if (user === true)
      return status(409, "User already exists");
    
    const refreshToken = crypto.randomUUID();
    const accessToken = await access_token.sign({
      id: user.id,
      username
    });
    
    const refreshTokenHash = hasher.update(refreshHashSecret + refreshToken).digest("hex");
    db.insert(refreshTokensTable).values({
      user_id: user.id,
      token_hash: refreshTokenHash,
      username
    });
    
    cookie["refresh_token"].set({
      value: refreshToken,
      httpOnly: true,
      maxAge: Number(process.env.REFRESH_EXPIRATION_SECONDS),
      secure: true,
      sameSite: "none"
    })
    
    return status(201, {
      access_token: accessToken,
      user_id: user.id
    })
  }, {
    body: t.Object({
      username: t.String(),
      password: t.String()
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
  .get("/logoff", async ({ cookie }) => {
    cookie["refresh_token"]?.remove();
  })
  .post("/logout", async ({ cookie }) => {
    const refreshToken = cookie["refresh_token"];
    if (!refreshToken.value)
      return;
    
    db.delete(refreshTokensTable)
      .where(eq(
        refreshTokensTable.token_hash,
        hasher.update(refreshHashSecret + refreshToken.value).digest("hex")
      ));

    refreshToken?.remove();
  })
  .get("/refresh", async ({ access_token, cookie, status }) => {
    try {
      if (!cookie["refresh_token"]?.value)
        return status(400, "Invalid refresh token");
      
      let refreshToken = cookie["refresh_token"].value;
      const [token] = await db.select({
        id: refreshTokensTable.id,
        user_id: refreshTokensTable.user_id,
        username: refreshTokensTable.username,
        created_at: refreshTokensTable.created_at
      })
        .from(refreshTokensTable)
        .where(eq(
          refreshTokensTable.token_hash,
          hasher.update(refreshHashSecret + refreshToken).digest("hex")
        ));
      
      if (!token || !refreshTokenCheck(token.created_at))
        return status(400, "Invalid refresh token");
      
      const payload = {
        id: token.user_id,
        username: token.username
      }
      const accessToken = await access_token.sign(payload);
      
      refreshToken = crypto.randomUUID();
      const refreshTokenHash = hasher.update(refreshHashSecret + refreshToken).digest("hex");

      db.update(refreshTokensTable)
        .set({ created_at: new Date(), token_hash: refreshTokenHash })
        .where(eq(refreshTokensTable.id, token.id));
      
      cookie["refresh_token"].set({
        value: refreshToken,
        httpOnly: true,
        maxAge: Number(process.env.REFRESH_EXPIRATION_SECONDS),
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
  .get("/me", async ({ headers, access_token, cookie, status }) => {
    const token = headers["authorization"]?.split(" ");
    if (!token || token.length !== 2 || token[0] !== "Bearer")
      return status(401, "Invalid access token");

    try {
      const user = await access_token.verify(token[1]);
      if (user)
        return {
          access_token: token[1],
          user
        };
      
      const ckRefreshToken = cookie["refresh_token"].value;
      if (!ckRefreshToken)
        return status(400, "Invalid refresh token");
      
      const [rfToken] = await db.select({
        id: refreshTokensTable.id,
        user_id: refreshTokensTable.user_id,
        username: refreshTokensTable.username,
        created_at: refreshTokensTable.created_at
      })
        .from(refreshTokensTable)
        .where(eq(
          refreshTokensTable.token_hash,
          hasher.update(refreshHashSecret + ckRefreshToken).digest("hex")
        ));
      
      if (!rfToken || !refreshTokenCheck(rfToken.created_at))
        return status(400, "Invalid refresh token");
        
      const payload = {
        id: rfToken.user_id,
        username: rfToken.username
      }
      const accessToken = await access_token.sign(payload);
      
      const refreshToken = crypto.randomUUID();
      const refreshTokenHash = hasher.update(refreshHashSecret + refreshToken).digest("hex");

      db.update(refreshTokensTable)
        .set({ created_at: new Date(), token_hash: refreshTokenHash })
        .where(eq(refreshTokensTable.id, rfToken.id));
      
      cookie["refresh_token"].set({
        value: refreshToken,
        httpOnly: true,
        maxAge: Number(process.env.REFRESH_EXPIRATION_SECONDS),
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
      return status(401, "Invalid access token");
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
      return status(401, "Invalid access token");

    return await getAllReadings(user.id);
  })
  .get("/readings/:room", async ({ params, user, status }) => {
    if (!user)
      return status(401, "Invalid access token");
    
    return await getReadingsOf({ user_id: user.id, room: params.room });
  }, {
    params: t.Object({
      room: t.String()
    })
  })
  .post("/readings", async ({ body, user, status }) => {
    if (!user)
      return status(401, "Invalid access token");
    
    await insertReading({ user_id: user.id, ...body });
    return status(201, "Reading added successfully");
  }, {
    body: t.Object({
      temperature: t.Number(),
      humidity: t.Number(),
      room: t.String()
    })
  })
  .listen({ port: 3000, hostname: "0.0.0.0" });

function refreshTokenCheck(tokenDate: Date) {
  const now = new Date();
  if (tokenDate > now)
    return false;

  const refreshExpiredDate = new Date(now);
  refreshExpiredDate.setDate(now.getDate() - refreshExpiredTime);

  return tokenDate >= refreshExpiredDate;
}
