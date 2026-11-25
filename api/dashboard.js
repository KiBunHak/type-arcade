const { Pool } = require("pg");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "change_this_to_a_long_secret_key";
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: "Missing token" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const userRes = await pool.query(
      `SELECT id, username, email, totalpoints, bestwpm, bio, avatarurl, createdat
       FROM users WHERE id = $1`,
      [decoded.id]
    );

    const rawUser = userRes.rows[0];
    if (!rawUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const historyRes = await pool.query(
      `SELECT id, userid, gamemode, wpm, accuracy, pointsearned, playedat
       FROM gamehistory
       WHERE userid = $1
       ORDER BY playedat DESC
       LIMIT 20`,
      [decoded.id]
    );

    const leaderboardRes = await pool.query(
      `SELECT id, username, totalpoints, bestwpm, avatarurl
       FROM users
       ORDER BY totalpoints DESC, bestwpm DESC
       LIMIT 10`
    );

    const user = {
      ...rawUser,
      totalPoints: rawUser.totalpoints ?? 0,
      bestWPM: rawUser.bestwpm ?? 0,
      gamesPlayed: historyRes.rows.length,
    };

    return res.json({
      user,
      stats: {
        totalPoints: rawUser.totalpoints ?? 0,
        bestWPM: rawUser.bestwpm ?? 0,
        gamesPlayed: historyRes.rows.length,
      },
      history: historyRes.rows,
      recentHistory: historyRes.rows,
      leaderboard: leaderboardRes.rows,
    });
  } catch (err) {
    console.error("Dashboard route error:", err);
    return res.status(401).json({ error: "Failed to load dashboard" });
  }
};
