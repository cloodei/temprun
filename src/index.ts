import mqtt from "mqtt";
import { jwt } from "@elysiajs/jwt";
import { cors } from "@elysiajs/cors";
import { Elysia, t } from "elysia";
import { authenticateUser, createUser } from "./auth";
import { hashToken, refreshTokenCheck } from "./utils";
import { getAllReadings, getReadingsOf, insertReading } from "./readings";
import { deleteRefreshByTokenHash, insertRefresh, updateRefresh, selectRefresh } from "./db/db";


const mqttClient = mqtt.connect(process.env.MQTT_CLUSTER_URL!, {
  protocol: "mqtts",
  username: process.env.MQTT_USERNAME!,
  password: process.env.MQTT_PASSWORD!
});

mqttClient.on("error", error => console.error("Error connecting to MQTT broker:", error));
mqttClient.on("connect",  () => console.log("Connected to MQTT broker"));

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

new Elysia({ precompile: true })
  .use(cors({
    maxAge: 120,
    origin: [process.env.CORS_ORIGIN!, process.env.LOCAL_ORIGIN!],
    allowedHeaders: "Content-Type, Authorization"
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
  .onAfterHandle(({ set }) => {
    set.headers["access-control-max-age"] = "120";
    set.headers["access-control-allow-origin"] = process.env.ORIGIN!;
    set.headers["access-control-allow-headers"] = "Content-Type, Authorization";
  })
  
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
    
    insertRefresh.execute({
      user_id: user.id,
      token_hash: hashToken(refreshToken),
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
    
    insertRefresh.execute({
      user_id: user.id,
      token_hash: hashToken(refreshToken),
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
  .get("/logoff", ({ cookie }) => {
    cookie["refresh_token"]?.remove();
  })
  .post("/logout", ({ cookie }) => {
    const refreshToken = cookie["refresh_token"];
    if (!refreshToken.value)
      return;
    
    deleteRefreshByTokenHash.execute({ token_hash: hashToken(refreshToken.value) });
    refreshToken?.remove();
  })
  .get("/refresh", async ({ access_token, cookie, status }) => {
    try {
      if (!cookie["refresh_token"]?.value)
        return status(400, "Invalid refresh token");
      
      let refreshToken = cookie["refresh_token"].value;
      let refreshTokenHash = hashToken(refreshToken);
      const [token] = await selectRefresh.execute({ token_hash: refreshTokenHash });
      
      if (!token || !refreshTokenCheck(token.created_at))
        return status(400, "Invalid refresh token");
      
      const payload = {
        id: token.user_id,
        username: token.username
      }
      const accessToken = await access_token.sign(payload);
      
      refreshToken = crypto.randomUUID();
      refreshTokenHash = hashToken(refreshToken);

      updateRefresh.execute({
        id: token.id,
        token_hash: refreshTokenHash
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
      
      let refreshTokenHash = hashToken(ckRefreshToken);
      const [rfToken] = await selectRefresh.execute({ token_hash: refreshTokenHash });
      if (!rfToken || !refreshTokenCheck(rfToken.created_at))
        return status(400, "Invalid refresh token");
        
      const payload = {
        id: rfToken.user_id,
        username: rfToken.username
      }
      const accessToken = await access_token.sign(payload);
      
      const refreshToken = crypto.randomUUID();
      refreshTokenHash = hashToken(refreshToken);

      updateRefresh.execute({
        id: rfToken.id,
        token_hash: refreshTokenHash
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
    
    try {
      await insertReading({ user_id: user.id, ...body });
      return status(201, "Reading added successfully");
    }
    catch (error) {
      console.error(error);
      return status(500, "Internal server error");
    }
  }, {
    body: t.Object({
      temperature: t.Number(),
      humidity: t.Number(),
      room: t.String()
    })
  })
  .listen({ port: 3000 })
