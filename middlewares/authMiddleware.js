const admin = require("firebase-admin");
const { getAuth } = require("firebase-admin/auth");
const {
  sendBadRequestResponse,
  sendUnauthorizedResponse,
} = require("../utils/responseUtils");

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return sendUnauthorizedResponse(res, "Unauthorized: No token provided");
  }

  const token = authHeader.split(" ")[1];

  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("Token verification error:", error);
    return sendUnauthorizedResponse(res, "Unauthorized: Invalid token");
  }
};

const verifyRoles = (allowedRoles = []) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.uid;

      const result = await db.query(
        `SELECT r.role_id
         FROM users u
         JOIN roles r ON u.role_id = r.role_id
         WHERE u.user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return sendUnauthorizedResponse(res, "Unauthorized: User not found");
      }

      const role = result.rows[0].role_desc;

      if (!allowedRoles.includes(role)) {
        return sendUnauthorizedResponse(res, "Unauthorized: Insufficient role");
      }

      next();
    } catch (err) {
      console.error("Role verification error:", err);
      return sendUnauthorizedResponse(res, "Unauthorized: Role check failed");
    }
  };
};

module.exports = {
  verifyToken,
  verifyRoles,
};
