const { Pool } = require("pg");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "change_this_to_a_long_secret_key";
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function buildUserPayload(rawUser, gamesPlayed = 0) {
  const username = rawUser.username || "Player";
  const totalPoints = Number(rawUser.totalpoints ?? 0);
  const bestWPM = Number(rawUser.bestwpm ?? 0);
  const bio = rawUser.bio ?? "";
  const avatarUrl = rawUser.avatarurl ?? null;

  return {
    id: rawUser.id,
    username,
    Username: username,
    name: username,
    email: rawUser.email,
    bio,
    avatarurl: avatarUrl,
    avatarUrl,
    totalpoints: totalPoints,
    totalPoints,
    bestwpm: bestWPM,
    bestWPM,
    gamesPlayed,
    createdat: rawUser.createdat,
  };
}

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

    const gamesPlayed = historyRes.rows.length;
    const user = buildUserPayload(rawUser, gamesPlayed);

    const history = historyRes.rows.map((row) => ({
      ...row,
      userid: row.userid,
      userId: row.userid,
      gamemode: row.gamemode,
      gameMode: row.gamemode,
      pointsearned: Number(row.pointsearned ?? 0),
      pointsEarned: Number(row.pointsearned ?? 0),
      playedat: row.playedat,
      playedAt: row.playedat,
    }));

    const leaderboard = leaderboardRes.rows.map((row) => ({
      id: row.id,
      username: row.username,
      Username: row.username,
      name: row.username,
      totalpoints: Number(row.totalpoints ?? 0),
      totalPoints: Number(row.totalpoints ?? 0),
      bestwpm: Number(row.bestwpm ?? 0),
      bestWPM: Number(row.bestwpm ?? 0),
      avatarurl: row.avatarurl ?? null,
      avatarUrl: row.avatarurl ?? null,
    }));

    return res.json({
      ...user,
      user,
      stats: {
        totalPoints: user.totalPoints,
        bestWPM: user.bestWPM,
        gamesPlayed,
      },
      history,
      recentHistory: history,
      leaderboard,
    });
  } catch (err) {
    console.error("Dashboard route error:", err);
    return res.status(401).json({ error: "Failed to load dashboard" });
  }
};
