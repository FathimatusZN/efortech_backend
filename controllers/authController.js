const { auth } = require("../config/firebase");
const db = require("../config/db");
const {
  sendSuccessResponse,
  sendCreatedResponse,
  sendBadRequestResponse,
  sendUnauthorizedResponse,
  sendForbiddenResponse,
  sendNotFoundResponse,
  sendErrorResponse,
} = require("../utils/responseUtils");

// Register user
exports.registerUser = async (req, res) => {
  const { fullName, email, password } = req.body;

  try {
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: fullName,
    });

    const userId = userRecord.uid;
    const roleId = "role1";
    const query = `
      INSERT INTO users (user_id, fullname, email, role_id, created_at)
      VALUES ($1, $2, $3, $4, NOW())
    `;

    await db.query(query, [userId, fullName, email, roleId]);

    return sendCreatedResponse(res, "User registered successfully");
  } catch (error) {
    console.error("Register user error:", error);
    return sendBadRequestResponse(res, error.message);
  }
};

// Login user
exports.loginUser = async (req, res) => {
  const { idToken } = req.body;

  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    const email = decodedToken.email;

    const query = `
      SELECT users.user_id, users.fullname, users.email, roles.role_desc 
      FROM users 
      JOIN roles ON users.role_id = roles.role_id 
      WHERE users.email = $1
    `;
    const result = await db.query(query, [email]);

    if (result.rows.length === 0) {
      return sendNotFoundResponse(res, "User data not found");
    }

    const user = result.rows[0];

    return sendSuccessResponse(res, "Login successful", {
      user_id: user.user_id,
      email: user.email,
      role: user.role_desc,
      fullname: user.fullname,
    });
  } catch (error) {
    console.error("Login user error:", error);
    return sendBadRequestResponse(res, "Invalid token");
  }
};

// Register user via Google
exports.registerGoogleUser = async (req, res) => {
  try {
    // Ambil token dari header Authorization
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return sendUnauthorizedResponse(res, "No token provided");
    }
    const idToken = authHeader.split(" ")[1]; // Bearer <token>

    // Verifikasi token menggunakan Firebase Admin
    const decodedToken = await auth.verifyIdToken(idToken);
    const { uid, email, name, picture } = decodedToken;

    if (!email) {
      return sendBadRequestResponse(res, "Email not found in token");
    }

    // Cek apakah user sudah ada di DB
    const existingUser = await db.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (existingUser.rows.length > 0) {
      return sendBadRequestResponse(res, "User already exists");
    }

    // Buat user baru di Firebase Auth (optional, tapi biasanya sudah ada di decodedToken)
    // const userRecord = await auth.createUser({ uid, email, displayName: name });

    // Simpan user ke database
    const roleId = "role1"; // default role, bisa diubah
    const query = `
      INSERT INTO users (user_id, fullname, email, role_id, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING *
    `;
    const result = await db.query(query, [
      uid,
      name || "Unknown",
      email,
      roleId,
    ]);

    return sendCreatedResponse(
      res,
      "User registered via Google successfully",
      result.rows[0]
    );
  } catch (error) {
    console.error("Google register error:", error);
    return sendErrorResponse(res, "Failed to register via Google");
  }
};
