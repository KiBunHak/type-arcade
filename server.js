const express = require("express");
const { Pool } = require("pg");
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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing or invalid token" });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function signUserToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, email: user.email },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function formatUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    totalpoints: row.totalpoints ?? 0,
    totalPoints: row.totalpoints ?? 0,
    bestwpm: row.bestwpm ?? 0,
    bestWPM: row.bestwpm ?? 0,
    bio: row.bio ?? null,
    avatarurl: row.avatarurl ?? null,
    avatarUrl: row.avatarurl ?? null,
    createdat: row.createdat,
  };
}

async function handleRegister(req, res) {
  try {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password) {
      return res
        .status(400)
        .json({ error: "Username, email, and password are required" });
    }

    const cleanUsername = String(username).trim();
    const cleanEmail = String(email).trim();

    const existing = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($2)",
      [cleanEmail, cleanUsername]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Username or email already exists" });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const result = await pool.query(
      `INSERT INTO users (username, email, passwordhash)
       VALUES ($1, $2, $3)
       RETURNING id, username, email, totalpoints, bestwpm, bio, avatarurl, createdat`,
      [cleanUsername, cleanEmail, passwordHash]
    );

    const user = formatUser(result.rows[0]);
    const token = signUserToken(user);
    return res.status(201).json({ token, user });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ error: "Database error during registration" });
  }
}

async function handleEmailLogin(req, res) {
  try {
    const { email, username, password } = req.body || {};
    const identifier = String(email || username || "").trim();
    if (!identifier || !password) {
      return res
        .status(400)
        .json({ error: "Email/username and password are required" });
    }

    const result = await pool.query(
      `SELECT id, username, email, passwordhash, totalpoints, bestwpm, bio, avatarurl, createdat
       FROM users
       WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($1)`,
      [identifier]
    );

    const rawUser = result.rows[0];
    if (!rawUser || !rawUser.passwordhash) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(String(password), rawUser.passwordhash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = formatUser(rawUser);
    const token = signUserToken(user);
    return res.json({ token, user });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Database error during login" });
  }
}

async function handleGoogleLogin(req, res) {
  try {
    const { credential, idToken, token: bodyToken } = req.body || {};
    const rawToken = credential || idToken || bodyToken;
    if (!rawToken) {
      return res.status(400).json({ error: "Missing Google credential token" });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: rawToken,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = payload.email;
    const picture = payload.picture || null;
    const baseName =
      (payload.name || email.split("@")[0] || "player")
        .replace(/[^a-zA-Z0-9_]/g, "")
        .slice(0, 20) || "player";

    let found = await pool.query(
      `SELECT id, username, email, totalpoints, bestwpm, bio, avatarurl, createdat
       FROM users
       WHERE LOWER(email) = LOWER($1)`,
      [email]
    );

    let row = found.rows[0];
    if (!row) {
      const uniqueUsername = `${baseName}_${Math.floor(1000 + Math.random() * 9000)}`.slice(
        0,
        50
      );
      const randomHash = await bcrypt.hash(`${payload.sub}_${Date.now()}`, 10);
      const inserted = await pool.query(
        `INSERT INTO users (username, email, passwordhash, avatarurl)
         VALUES ($1, $2, $3, $4)
         RETURNING id, username, email, totalpoints, bestwpm, bio, avatarurl, createdat`,
        [uniqueUsername, email, randomHash, picture]
      );
      row = inserted.rows[0];
    } else if (picture && !row.avatarurl) {
      const updated = await pool.query(
        `UPDATE users SET avatarurl = $1 WHERE id = $2
         RETURNING id, username, email, totalpoints, bestwpm, bio, avatarurl, createdat`,
        [picture, row.id]
      );
      row = updated.rows[0];
    }

    const user = formatUser(row);
    const jwtToken = signUserToken(user);
    return res.json({ token: jwtToken, user });
  } catch (err) {
    console.error("Google auth error:", err);
    return res.status(401).json({ error: "Google authentication failed" });
  }
}

app.post("/api/login", handleEmailLogin);
app.post("/api/auth/login", handleEmailLogin);
app.post("/api/google-login", handleGoogleLogin);
app.post("/api/auth/google", handleGoogleLogin);
app.post("/api/register", handleRegister);
app.post("/api/auth/register", handleRegister);

// Current user profile
app.get("/api/me", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, email, totalpoints, bestwpm, bio, avatarurl, createdat
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: "User not found" });
    }
    return res.json({ user: formatUser(result.rows[0]) });
  } catch (err) {
    console.error("Profile fetch error:", err);
    return res.status(500).json({ error: "Database error" });
  }
});

// Update profile bio / username
app.put("/api/profile", authMiddleware, async (req, res) => {
  try {
    const body = req.body || {};
    const username = body.username ?? null;
    const bio = body.bio ?? null;
    const avatarurl = body.avatarurl ?? body.avatarUrl ?? null;

    const result = await pool.query(
      `UPDATE users
       SET username = COALESCE($1, username),
           bio = COALESCE($2, bio),
           avatarurl = COALESCE($3, avatarurl)
       WHERE id = $4
       RETURNING id, username, email, totalpoints, bestwpm, bio, avatarurl, createdat`,
      [username, bio, avatarurl, req.user.id]
    );
    return res.json({ user: formatUser(result.rows[0]) });
  } catch (err) {
    console.error("Profile update error:", err);
    return res.status(500).json({ error: "Failed to update profile" });
  }
});

// Save match result & update stats
app.post("/api/games", authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const body = req.body || {};
    const safeMode = String(body.gamemode ?? body.gameMode ?? "standard").slice(0, 50);
    const safeWpm = Number(body.wpm ?? 0) || 0;
    const safeAccuracy = Number(body.accuracy ?? 0) || 0;
    const safePoints = Number(body.pointsearned ?? body.pointsEarned ?? 0) || 0;

    await client.query("BEGIN");
    const gameRes = await client.query(
      `INSERT INTO gamehistory (userid, gamemode, wpm, accuracy, pointsearned)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, userid, gamemode, wpm, accuracy, pointsearned, playedat`,
      [req.user.id, safeMode, safeWpm, safeAccuracy, safePoints]
    );

    const userRes = await client.query(
      `UPDATE users
       SET totalpoints = totalpoints + $1,
           bestwpm = GREATEST(bestwpm, $2)
       WHERE id = $3
       RETURNING id, username, email, totalpoints, bestwpm, bio, avatarurl, createdat`,
      [safePoints, safeWpm, req.user.id]
    );

    await client.query("COMMIT");
    const m = gameRes.rows[0];
    return res.status(201).json({
      match: {
        ...m,
        userid: m.userid,
        userId: m.userid,
        gamemode: m.gamemode,
        gameMode: m.gamemode,
        pointsearned: m.pointsearned,
        pointsEarned: m.pointsearned,
        playedat: m.playedat,
        playedAt: m.playedat,
      },
      user: formatUser(userRes.rows[0]),
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Save game error:", err);
    return res.status(500).json({ error: "Failed to save game result" });
  } finally {
    client.release();
  }
});

// Recent match history
app.get("/api/history", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, userid, gamemode, wpm, accuracy, pointsearned, playedat
       FROM gamehistory
       WHERE userid = $1
       ORDER BY playedat DESC
       LIMIT 25`,
      [req.user.id]
    );
    return res.json({ history: result.rows });
  } catch (err) {
    console.error("History error:", err);
    return res.status(500).json({ error: "Failed to fetch game history" });
  }
});

// Leaderboard
app.get("/api/leaderboard", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, totalpoints, bestwpm, avatarurl
       FROM users
       ORDER BY totalpoints DESC, bestwpm DESC
       LIMIT 20`
    );
    return res.json({ leaderboard: result.rows.map(formatUser) });
  } catch (err) {
    console.error("Leaderboard error:", err);
    return res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`TypeArcade server running on port ${PORT}`);
});

module.exports = app;
