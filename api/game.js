const { Pool } = require("pg");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "change_this_to_a_long_secret_key";
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function buildUserResponse(rawUser, gamesPlayed) {
  const totalPoints = Number(rawUser.totalpoints ?? 0);
  const bestWPM = Number(rawUser.bestwpm ?? 0);
  const username = rawUser.username || "Player";
  const bio = rawUser.bio ?? "";
  const avatarUrl = rawUser.avatarurl ?? null;

  return {
    id: rawUser.id,
    username,
    Username: username,
    name: username,
    email: rawUser.email,
    bio,
    Bio: bio,
    avatarurl: avatarUrl,
    avatarUrl,
    avatar: avatarUrl,
    totalpoints: totalPoints,
    totalPoints,
    total_points: totalPoints,
    points: totalPoints,
    bestwpm: bestWPM,
    bestWPM,
    bestWpm: bestWPM,
    best_wpm: bestWPM,
    wpm: bestWPM,
    gamesPlayed,
    gamesplayed: gamesPlayed,
    games_played: gamesPlayed,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const client = await pool.connect();
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: "Missing token" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const body = req.body || {};

    const gamemode = String(
      body.gamemode ?? body.gameMode ?? body.mode ?? "standard"
    ).slice(0, 50);

    const wpm = Math.max(
      0,
      Math.round(Number(body.wpm ?? body.WPM ?? body.bestWpm ?? 0) || 0)
    );

    const accuracy = Math.max(
      0,
      Math.min(100, Number(body.accuracy ?? 0) || 0)
    );

    const rawPoints =
      body.pointsearned ??
      body.pointsEarned ??
      body.points ??
      body.score ??
      0;
    const pointsEarned = Math.max(0, Math.round(Number(rawPoints) || 0));

    await client.query("BEGIN");

    const insertGame = await client.query(
      `INSERT INTO gamehistory (userid, gamemode, wpm, accuracy, pointsearned)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, userid, gamemode, wpm, accuracy, pointsearned, playedat`,
      [decoded.id, gamemode, wpm, accuracy, pointsEarned]
    );

    const updateUser = await client.query(
      `UPDATE users
       SET totalpoints = COALESCE(totalpoints, 0) + $1,
           bestwpm = GREATEST(COALESCE(bestwpm, 0), $2)
       WHERE id = $3
       RETURNING id, username, email, totalpoints, bestwpm, bio, avatarurl, createdat`,
      [pointsEarned, wpm, decoded.id]
    );

    const countRes = await client.query(
      "SELECT COUNT(*)::int AS count FROM gamehistory WHERE userid = $1",
      [decoded.id]
    );

    await client.query("COMMIT");

    const rawUser = updateUser.rows[0];
    const gamesPlayed = countRes.rows[0]?.count ?? 0;
    const user = buildUserResponse(rawUser, gamesPlayed);
    const game = insertGame.rows[0];

    return res.status(201).json({
      match: {
        ...game,
        userid: game.userid,
        userId: game.userid,
        gamemode: game.gamemode,
        gameMode: game.gamemode,
        pointsearned: Number(game.pointsearned ?? 0),
        pointsEarned: Number(game.pointsearned ?? 0),
        points: Number(game.pointsearned ?? 0),
        wpm: Number(game.wpm ?? 0),
        accuracy: Number(game.accuracy ?? 0),
        playedat: game.playedat,
        playedAt: game.playedat,
      },
      user,
      stats: {
        totalPoints: user.totalPoints,
        totalpoints: user.totalPoints,
        bestWPM: user.bestWPM,
        bestwpm: user.bestWPM,
        gamesPlayed,
        gamesplayed: gamesPlayed,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Save game error:", err);
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    return res.status(500).json({ error: "Failed to save game result" });
  } finally {
    client.release();
  }
};
