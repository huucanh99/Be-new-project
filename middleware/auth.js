const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

/**
 * Middleware that validates JWT access token and attaches user info to request.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  // Optional: allow token via query for debugging
  const queryToken = req.query?.token;

  const token = bearerToken || queryToken || null;

  if (!token) {
    return res.status(401).json({ message: "Unauthorized: missing token" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    req.user = {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
    };

    return next();
  } catch (err) {
    console.error("JWT verify failed:", err.message);

    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired" });
    }

    return res.status(401).json({ message: "Invalid token" });
  }
}

/**
 * Middleware that allows access only to admin users.
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin only" });
  }

  return next();
}

module.exports = {
  requireAuth,
  requireAdmin,
};
