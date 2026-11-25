const { Pool } = require("pg");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "change_this_to_a_long_secret_key";
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function buildStatBundle(rawUser, gamesPlayed = 0) {
  const totalPoints = Number(
    rawUser.totalpoints ?? rawUser.totalPoints ?? rawUser.points ?? 0
  );
  const bestWPM = Number(
    rawUser.bestwpm ?? rawUser.bestWPM ?? rawUser.bestWpm ?? rawUser.wpm ?? 0
  );
  const games = Number(gamesPlayed ?? 0);

  return {
    totalpoints: totalPoints,
    totalPoints,
    Totalpoints: totalPoints,
    TotalPoints: totalPoints,
    total_points: totalPoints,
    points: totalPoints,
    Points: totalPoints,

    bestwpm: bestWPM,
    bestWPM,
    bestWpm: bestWPM,
    Bestwpm: bestWPM,
    BestWPM: bestWPM,
    BestWpm: bestWPM,
    best_wpm: bestWPM,
    wpm: bestWPM,
    Wpm: bestWPM,
    WPM: bestWPM,

    gamesPlayed: games,
    gamesplayed: games,
    gamesPlay: games,
    GamesPlayed: games,
    Gamesplayed: games,
    games_played: games,
  };
}

function formatUser(rawUser, gamesPlayed = 0) {
  const username = rawUser.username || "Player";
  const bio = rawUser.bio ?? "";
  const avatar = rawUser.avatarurl ?? null;
  const stats = buildStatBundle(rawUser, gamesPlayed);

  return {
    id: rawUser.id,
    username,
    Username: username,
    name: username,
    Name: username,
    email: rawUser.email,
    bio,
    Bio: bio,
    avatarurl: avatar,
    avatarUrl: avatar,
    avatarURL: avatar,
    avatar,
    ...stats,
    createdat: rawUser.createdat,
  };
}

function formatLeaderboardEntry(row) {
  const username = row.username || "Player";
  const stats = buildStatBundle(row, 0);
  const avatar = row.avatarurl ?? null;

  return {
    id: row.id,
    username,
    Username: username,
    name: username,
    Name: username,
    bio: row.bio ?? "",
    avatarurl: avatar,
    avatarUrl: avatar,
    avatar,
    ...stats,
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
      `SELECT id, username, totalpoints, bestwpm, bio, avatarurl
       FROM users
       ORDER BY totalpoints DESC, bestwpm DESC
       LIMIT 10`
    );

    const gamesPlayed = historyRes.rows.length;
    const user = formatUser(rawUser, gamesPlayed);
    const leaderboard = leaderboardRes.rows.map(formatLeaderboardEntry);

    const history = historyRes.rows.map((row) => {
      const pts = Number(row.pointsearned ?? 0);
      const wpm = Number(row.wpm ?? 0);
      const acc = Number(row.accuracy ?? 0);
      return {
        ...row,
        userid: row.userid,
        userId: row.userid,
        gamemode: row.gamemode,
        gameMode: row.gamemode,
        mode: row.gamemode,
        pointsearned: pts,
        pointsEarned: pts,
        points: pts,
        wpm,
        WPM: wpm,
        accuracy: acc,
        playedat: row.playedat,
        playedAt: row.playedat,
      };
    });

    const stats = buildStatBundle(rawUser, gamesPlayed);

    return res.json({
      ...user,
      user,
      profile: user,
      data: { user, stats, history, leaderboard },
      stats,
      history,
      recentHistory: history,
      games: history,
      leaderboard,
      topPlayers: leaderboard,
    });
  } catch (err) {
    console.error("Dashboard route error:", err);
    return res.status(401).json({ error: "Failed to load dashboard" });
  }
};
