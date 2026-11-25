const { Pool } = require("pg");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "change_this_to_a_long_secret_key";
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async function handler(req, res) {
  if (req.method !== "PUT" && req.method !== "POST" && req.method !== "PATCH") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: "Missing token" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const body = req.body || {};

    const nextUsername =
      typeof body.username === "string" && body.username.trim().length > 0
        ? body.username.trim().slice(0, 25)
        : null;

    const rawBio = body.bio ?? body.Bio ?? null;
    const nextBio =
      rawBio === null || rawBio === undefined
        ? null
        : String(rawBio).slice(0, 160);

    const rawAvatar =
      body.avatarurl ?? body.avatarUrl ?? body.avatar ?? body.avatarURL ?? null;
    const nextAvatar =
      rawAvatar === null || rawAvatar === undefined
        ? null
        : String(rawAvatar);

    const result = await pool.query(
      `UPDATE users
       SET username = COALESCE($1, username),
           bio = COALESCE($2, bio),
           avatarurl = COALESCE($3, avatarurl)
       WHERE id = $4
       RETURNING id, username, email, totalpoints, bestwpm, bio, avatarurl, createdat`,
      [nextUsername, nextBio, nextAvatar, decoded.id]
    );

    const rawUser = result.rows[0];
    if (!rawUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const countRes = await pool.query(
      "SELECT COUNT(*)::int AS count FROM gamehistory WHERE userid = $1",
      [rawUser.id]
    );
    const gamesPlayed = countRes.rows[0]?.count ?? 0;

    const username = rawUser.username || "Player";
    const bio = rawUser.bio ?? "";
    const avatar = rawUser.avatarurl ?? null;
    const totalPoints = Number(rawUser.totalpoints ?? 0);
    const bestWPM = Number(rawUser.bestwpm ?? 0);

    const user = {
      id: rawUser.id,
      username,
      Username: username,
      name: username,
      email: rawUser.email,
      bio,
      Bio: bio,
      avatarurl: avatar,
      avatarUrl: avatar,
      avatar,
      totalpoints: totalPoints,
      totalPoints,
      total_points: totalPoints,
      points: totalPoints,
      bestwpm: bestWPM,
      bestWPM,
      best_wpm: bestWPM,
      wpm: bestWPM,
      gamesPlayed,
      gamesplayed: gamesPlayed,
      createdat: rawUser.createdat,
    };

    return res.json({
      ...user,
      user,
      profile: user,
    });
  } catch (err) {
    console.error("Profile update error:", err);
    if (err.code === "23505") {
      return res.status(409).json({ error: "Username is already taken" });
    }
    return res.status(500).json({ error: "Failed to update profile" });
  }
};
