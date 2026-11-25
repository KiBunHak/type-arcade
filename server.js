const express = require("express");
const sql = require("mssql");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const JWT_SECRET = process.env.JWT_SECRET || "change_this_to_a_long_secret_key";
const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  "718354343165-mb9o638ubgb52geku6ac40o4cgr5poiq.apps.googleusercontent.com";
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const dbConfig = {
  user: process.env.DB_USER || "sa",
  password: process.env.DB_PASSWORD || "typearcade123!",
  server: process.env.DB_SERVER || "localhost\\BunHak",
  database: process.env.DB_NAME || "TypeArcadeDB",
  options: {
    encrypt: process.env.DB_ENCRYPT === "true",
    trustServerCertificate: process.env.DB_TRUST_CERT !== "false",
  },
};

let poolPromise = null;

function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect(dbConfig).catch((err) => {
      poolPromise = null;
      console.error("DB Connection Failed:", err);
      throw err;
    });
  }
  return poolPromise;
}

if (!process.env.VERCEL) {
  getPool().then(() => console.log("Connected to SQL Server!"));
}

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

app.post("/api/register", async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const pool = await getPool();
    const hash = await bcrypt.hash(password, 10);
    const request = pool.request();
    request.input("username", sql.NVarChar, username);
    request.input("email", sql.NVarChar, email);
    request.input("hash", sql.NVarChar, hash);

    const result = await request.query(`
      INSERT INTO Users (Username, Email, PasswordHash)
      OUTPUT INSERTED.Id, INSERTED.Username
      VALUES (@username, @email, @hash)
    `);

    const user = result.recordset[0];
    const token = jwt.sign(
      { id: user.Id, username: user.Username },
      JWT_SECRET,
      { expiresIn: "7d" },
    );
    res.json({ token, username: user.Username });
  } catch (err) {
    res.status(400).json({ error: "Username or email already exists." });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input("email", sql.NVarChar, email);
    const result = await request.query(
      "SELECT * FROM Users WHERE Email = @email",
    );
    const user = result.recordset[0];

    if (
      !user ||
      !user.PasswordHash ||
      user.PasswordHash === "GOOGLE_AUTH" ||
      !(await bcrypt.compare(password, user.PasswordHash))
    ) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = jwt.sign(
      { id: user.Id, username: user.Username },
      JWT_SECRET,
      { expiresIn: "7d" },
    );
    res.json({ token, username: user.Username });
  } catch (err) {
    res.status(500).json({ error: "Server error." });
  }
});

app.post("/api/google-login", async (req, res) => {
  const { credential } = req.body;
  try {
    const pool = await getPool();
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const { email, name } = ticket.getPayload();

    const checkReq = pool.request();
    checkReq.input("email", sql.NVarChar, email);
    let result = await checkReq.query(
      "SELECT * FROM Users WHERE Email = @email",
    );
    let user = result.recordset[0];

    if (!user) {
      const baseName =
        (name || email.split("@")[0])
          .replace(/[^a-zA-Z0-9]/g, "")
          .slice(0, 15) || "Player";
      const uniqueUsername = baseName + Math.floor(100 + Math.random() * 900);
      const createReq = pool.request();
      createReq.input("username", sql.NVarChar, uniqueUsername);
      createReq.input("email", sql.NVarChar, email);

      const inserted = await createReq.query(`
        INSERT INTO Users (Username, Email, PasswordHash)
        OUTPUT INSERTED.Id, INSERTED.Username
        VALUES (@username, @email, 'GOOGLE_AUTH')
      `);
      user = inserted.recordset[0];
    }

    const token = jwt.sign(
      { id: user.Id, username: user.Username },
      JWT_SECRET,
      { expiresIn: "7d" },
    );
    res.json({ token, username: user.Username });
  } catch (err) {
    console.error("Google login error:", err);
    res.status(401).json({ error: "Google sign-in failed." });
  }
});

app.post("/api/scores", authMiddleware, async (req, res) => {
  const { gameMode, wpm, accuracy, pointsEarned } = req.body;
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input("userId", sql.Int, req.user.id);
    request.input("gameMode", sql.NVarChar, gameMode);
    request.input("wpm", sql.Int, wpm);
    request.input("accuracy", sql.Int, accuracy);
    request.input("points", sql.Int, pointsEarned);

    await request.query(`
      INSERT INTO GameHistory (UserId, GameMode, WPM, Accuracy, PointsEarned)
      VALUES (@userId, @gameMode, @wpm, @accuracy, @points);

      UPDATE Users
      SET TotalPoints = TotalPoints + @points,
          BestWPM = CASE WHEN @wpm > BestWPM THEN @wpm ELSE BestWPM END
      WHERE Id = @userId;
    `);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to save score." });
  }
});

app.get("/api/dashboard", authMiddleware, async (req, res) => {
  try {
    const pool = await getPool();
    const profileReq = pool.request();
    profileReq.input("userId", sql.Int, req.user.id);
    const profileRes = await profileReq.query(`
      SELECT Username, Bio, AvatarUrl, TotalPoints, BestWPM, CreatedAt,
             (SELECT COUNT(*) FROM GameHistory WHERE UserId = @userId) AS GamesPlayed
      FROM Users WHERE Id = @userId
    `);

    const leaderboard = await pool
      .request()
      .query(
        "SELECT TOP 10 Username, TotalPoints, BestWPM FROM Users ORDER BY TotalPoints DESC",
      );

    const histReq = pool.request();
    histReq.input("userId", sql.Int, req.user.id);
    const history = await histReq.query(
      "SELECT TOP 5 GameMode, WPM, Accuracy, PointsEarned FROM GameHistory WHERE UserId = @userId ORDER BY PlayedAt DESC",
    );

    res.json({
      profile: profileRes.recordset[0],
      leaderboard: leaderboard.recordset,
      history: history.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load dashboard." });
  }
});

app.put("/api/profile", authMiddleware, async (req, res) => {
  const { username, bio, avatarUrl } = req.body;
  const cleanUsername = (username || "").trim();

  if (cleanUsername.length < 2 || cleanUsername.length > 25) {
    return res
      .status(400)
      .json({ error: "Username must be between 2 and 25 characters." });
  }

  try {
    const pool = await getPool();
    const checkReq = pool.request();
    checkReq.input("username", sql.NVarChar(50), cleanUsername);
    checkReq.input("userId", sql.Int, req.user.id);
    const existing = await checkReq.query(
      "SELECT Id FROM Users WHERE Username = @username AND Id <> @userId",
    );

    if (existing.recordset.length > 0) {
      return res.status(400).json({ error: "That username is already taken." });
    }

    const request = pool.request();
    request.input("userId", sql.Int, req.user.id);
    request.input("username", sql.NVarChar(50), cleanUsername);
    request.input("bio", sql.NVarChar(160), (bio || "").trim().slice(0, 160));
    request.input("avatarUrl", sql.NVarChar(255), avatarUrl || null);

    await request.query(`
      UPDATE Users
      SET Username = @username, Bio = @bio, AvatarUrl = @avatarUrl
      WHERE Id = @userId
    `);

    const newToken = jwt.sign(
      { id: req.user.id, username: cleanUsername },
      JWT_SECRET,
      { expiresIn: "7d" },
    );
    res.json({ success: true, username: cleanUsername, token: newToken });
  } catch (err) {
    res.status(500).json({ error: "Failed to update profile." });
  }
});

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () =>
    console.log(`Server running on http://localhost:${PORT}`),
  );
}

module.exports = app;
