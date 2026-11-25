const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");

const JWT_SECRET = process.env.JWT_SECRET || "change_this_to_a_long_secret_key";
const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  "718354343165-mb9o638ubgb52geku6ac40o4cgr5poiq.apps.googleusercontent.com";

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { credential, idToken, token } = req.body || {};
    const rawToken = credential || idToken || token;
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
       FROM users WHERE LOWER(email) = LOWER($1)`,
      [email]
    );

    let user = found.rows[0];
    if (!user) {
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
      user = inserted.rows[0];
    } else if (picture && !user.avatarurl) {
      const updated = await pool.query(
        `UPDATE users SET avatarurl = $1 WHERE id = $2
         RETURNING id, username, email, totalpoints, bestwpm, bio, avatarurl, createdat`,
        [picture, user.id]
      );
      user = updated.rows[0];
    }

    const jwtToken = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({ token: jwtToken, user });
  } catch (err) {
    console.error("Google login route error:", err);
    return res.status(401).json({ error: "Google authentication failed" });
  }
};
