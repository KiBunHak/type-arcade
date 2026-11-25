const { Pool } = require("pg");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "change_this_to_a_long_secret_key";
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async function handler(req, res) {
  if (req.method !== "PUT" && req.method !== "POST") {
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

    const rawBio = body.bio ?? null;
    const nextBio =
      rawBio === null || rawBio === undefined
        ? null
        : String(rawBio).slice(0, 160);

    const rawAvatar =
      body.avatarurl ?? body.avatarUrl ?? body.avatar ?? null;
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

    return res.json({
      user: {
        ...rawUser,
        avatarUrl: rawUser.avatarurl,
        totalPoints: rawUser.totalpoints ?? 0,
        bestWPM: rawUser.bestwpm ?? 0,
      },
    });
  } catch (err) {
    console.error("Profile update error:", err);
    if (err.code === "23505") {
      return res.status(409).json({ error: "Username is already taken" });
    }
    return res.status(500).json({ error: "Failed to update profile" });
  }
};
