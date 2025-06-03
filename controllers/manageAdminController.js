const db = require("../config/db");
const admin = require("firebase-admin");
const { getAuth } = require("firebase-admin/auth");
const {
  sendSuccessResponse,
  sendCreatedResponse,
  sendBadRequestResponse,
  sendUnauthorizedResponse,
  sendForbiddenResponse,
  sendNotFoundResponse,
  sendErrorResponse,
} = require("../utils/responseUtils");

const roleMap = {
  role1: "User",
  role2: "Admin",
  role3: "Superadmin",
};

// Utility function to get user by email from Firebase
const getFirebaseUserByEmail = async (email) => {
  try {
    const userRecord = await getAuth().getUserByEmail(email);
    return userRecord;
  } catch (error) {
    throw new Error("User not found in Firebase");
  }
};

// Create Admin
exports.createAdmin = async (req, res) => {
  const { email, role_id } = req.body;

  const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!isValidEmail(email)) {
    return sendBadRequestResponse(res, "Invalid email format");
  }

  if (!["role2", "role3"].includes(role_id)) {
    return sendBadRequestResponse(
      res,
      "Invalid role_id. Use 'role2' (admin) or 'role3' (superadmin)."
    );
  }

  try {
    let firebaseUser;
    try {
      firebaseUser = await getFirebaseUserByEmail(email);
    } catch (firebaseError) {
      return sendNotFoundResponse(res, "User not found in Database");
    }

    const userId = firebaseUser.uid;

    const userResult = await db.query(
      `SELECT * FROM users WHERE user_id = $1`,
      [userId]
    );

    if (userResult.rowCount === 0) {
      return sendNotFoundResponse(res, "User not found in internal database");
    }

    const currentRole = userResult.rows[0].role_id;

    if (currentRole !== "role1") {
      const roleName = roleMap[currentRole];
      return sendBadRequestResponse(
        res,
        `User already has role '${roleName}', try to Edit instead`
      );
    }

    const existingAdmin = await db.query(
      `SELECT status FROM admin WHERE admin_id = $1`,
      [userId]
    );

    if (
      existingAdmin.rowCount > 0 &&
      existingAdmin.rows[0].status === "Active"
    ) {
      return sendBadRequestResponse(res, "User is already an active admin");
    }

    await db.query(`UPDATE users SET role_id = $1 WHERE user_id = $2`, [
      role_id,
      userId,
    ]);

    await db.query(
      `INSERT INTO admin (admin_id, created_date, last_updated, status)
       VALUES ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Active')
       ON CONFLICT (admin_id)
       DO UPDATE SET 
         status = 'Active',
         last_updated = CURRENT_TIMESTAMP`,
      [userId]
    );

    return sendCreatedResponse(res, "Admin data created successfully.", {
      user_id: userId,
      message: "Admin created or reactivated",
    });
  } catch (error) {
    console.error("Create admin error:", error);
    return sendErrorResponse(res, "Failed to create admin");
  }
};

// Update Admin Role
exports.updateAdmin = async (req, res) => {
  const { admin_id } = req.params;
  const { new_role_id } = req.body;

  if (!["role2", "role3"].includes(new_role_id)) {
    return sendBadRequestResponse(res, "Invalid role_id");
  }

  try {
    const user = await db.query(
      `SELECT * FROM users WHERE user_id = $1 AND role_id IN ('role2', 'role3')`,
      [admin_id]
    );

    if (user.rowCount === 0) {
      return sendNotFoundResponse(res, "Admin not found or not valid");
    }

    await db.query(`UPDATE users SET role_id = $1 WHERE user_id = $2`, [
      new_role_id,
      admin_id,
    ]);

    await db.query(
      `UPDATE admin SET last_updated = CURRENT_TIMESTAMP WHERE admin_id = $1`,
      [admin_id]
    );

    return sendSuccessResponse(res, "Admin data updated successfuly!", {
      admin_id,
      new_role_id,
    });
  } catch (error) {
    console.error("Update admin error:", error);
    return sendErrorResponse(res, "Failed to update admin");
  }
};

// Soft Delete Admin
exports.deleteAdmin = async (req, res) => {
  const { admin_id } = req.params;

  try {
    const user = await db.query(
      `SELECT * FROM users WHERE user_id = $1 AND role_id IN ('role2', 'role3')`,
      [admin_id]
    );
    if (user.rowCount === 0) {
      return sendNotFoundResponse(res, "Admin not found or already Inactive");
    }

    await db.query(`UPDATE users SET role_id = 'role1' WHERE user_id = $1`, [
      admin_id,
    ]);

    await db.query(
      `UPDATE admin SET status = 'Inactive', last_updated = CURRENT_TIMESTAMP WHERE admin_id = $1`,
      [admin_id]
    );

    return sendSuccessResponse(res, "Admin data deleted successfully!", {
      admin_id,
      status: "Inactive",
    });
  } catch (error) {
    console.error("Delete admin error:", error);
    return sendErrorResponse(res, "Failed to remove admin");
  }
};

// Soft Delete Multiple Admins
exports.deleteMultipleAdmins = async (req, res) => {
  const { admin_ids } = req.body;

  if (!Array.isArray(admin_ids) || admin_ids.length === 0) {
    return sendErrorResponse(res, "No admin IDs provided.");
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    for (const admin_id of admin_ids) {
      await client.query(
        `UPDATE users SET role_id = 'role1' WHERE user_id = $1`,
        [admin_id]
      );

      await client.query(
        `UPDATE admin SET status = 'Inactive', last_updated = CURRENT_TIMESTAMP WHERE admin_id = $1`,
        [admin_id]
      );
    }

    await client.query("COMMIT");
    return sendSuccessResponse(res, "Selected admins have been soft deleted.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Delete multiple admins error:", error);
    return sendErrorResponse(res, "Failed to delete selected admins.");
  } finally {
    client.release();
  }
};

// Get All Admins with optional filters
exports.getAdmins = async (req, res) => {
  const { name, email, id, role, status, search } = req.query;

  const formatWIB = (dateStr) => {
    if (!dateStr) return null;
    return new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      dateStyle: "short",
      timeStyle: "medium",
      hour12: true,
    }).format(new Date(dateStr));
  };

  let query = `
    SELECT a.admin_id, u.fullname, u.email, u.role_id, a.created_date, a.last_updated, a.status
    FROM admin a
    JOIN users u ON a.admin_id = u.user_id
    WHERE 1=1
  `;
  const params = [];
  let i = 1;

  if (id) {
    query += ` AND u.user_id ILIKE $${i++}`;
    params.push(`%${id}%`);
  }
  if (name) {
    query += ` AND u.fullname ILIKE $${i++}`;
    params.push(`%${name}%`);
  }
  if (email) {
    query += ` AND u.email ILIKE $${i++}`;
    params.push(`%${email}%`);
  }
  if (role) {
    query += ` AND u.role_id = $${i++}`;
    params.push(role);
  }
  if (status) {
    query += ` AND a.status = $${i++}`;
    params.push(status);
  }
  if (search) {
    query += ` AND (u.fullname ILIKE $${i} OR u.email ILIKE $${i})`;
    params.push(`%${search}%`);
    i++;
  }

  query += ` ORDER BY a.created_date DESC`;

  try {
    const result = await db.query(query, params);

    const enrichedAdmins = await Promise.all(
      result.rows.map(async (admin) => {
        let lastLogin = null;
        try {
          const fbUser = await getAuth().getUser(admin.admin_id);
          lastLogin = fbUser.metadata.lastSignInTime;
        } catch (err) {
          console.warn("Firebase error:", err.message);
        }

        return {
          ...admin,
          role_name: roleMap[admin.role_id] || "Unknown",
          status: admin.status || "Unknown",
          last_login: formatWIB(lastLogin),
          last_updated: formatWIB(admin.last_updated),
        };
      })
    );

    return sendSuccessResponse(res, "FETCH_SUCCESS", enrichedAdmins);
  } catch (error) {
    console.error("Fetch admins error:", error);
    return sendErrorResponse(res, "Failed to fetch admins");
  }
};

// Get Admin by ID
exports.getAdminById = async (req, res) => {
  const { admin_id } = req.params;

  try {
    const result = await db.query(
      `SELECT u.user_id, u.fullname, u.email, u.role_id, a.created_date, a.last_updated, a.status
       FROM admin a
       JOIN users u ON a.admin_id = u.user_id
       WHERE u.user_id = $1`,
      [admin_id]
    );

    if (result.rowCount === 0) {
      return sendNotFoundResponse(res, "Admin not found");
    }

    return sendSuccessResponse(res, "FETCH_SUCCESS", result.rows[0]);
  } catch (error) {
    console.error("Get admin by ID error:", error);
    return sendErrorResponse(res, "Failed to get admin");
  }
};

// Search User by Email
exports.searchUserByEmail = async (req, res) => {
  const { email } = req.query;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return sendBadRequestResponse(res, "Invalid email format.");
  }

  try {
    const user = await getFirebaseUserByEmail(email);

    const dbResult = await db.query("SELECT * FROM users WHERE user_id = $1", [
      user.uid,
    ]);

    if (dbResult.rows.length === 0) {
      return sendNotFoundResponse(res, "User not found in database.");
    }

    const dbUser = dbResult.rows[0];

    const result = {
      user_id: user.uid,
      email: user.email,
      fullname: dbUser.fullname,
      role_id: dbUser.role_id,
    };

    return sendSuccessResponse(res, "User found.", result);
  } catch (error) {
    return sendNotFoundResponse(res, error.message || "User not found.");
  }
};
