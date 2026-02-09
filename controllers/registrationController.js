const db = require("../config/db");
const { v4: uuidv4 } = require("uuid");
const {
  sendSuccessResponse,
  sendErrorResponse,
  sendBadRequestResponse,
} = require("../utils/responseUtils");

// Function to generate a custom ID with prefix + timestamp + 6-char random string
const generateCustomId = (prefix) => {
  const now = new Date();
  now.setHours(now.getHours() + 7); // UTC+7 (WIB timezone)
  const timestamp = now
    .toISOString()
    .replace(/[-T:.Z]/g, "")
    .slice(0, 12);
  const randomStr = uuidv4().slice(0, 6).toUpperCase();
  return `${prefix}-${timestamp}-${randomStr}`; // Format: PREFIX-YYYYMMDDHHMM-RANDOM
};

// Controller function to create a new training registration
exports.createRegistration = async (req, res) => {
  // Extract input data from request body
  const {
    training_id,
    registrant_id,
    participant_count,
    final_price,
    training_fees,
    training_date,
    participants, // Expected to be an array of objects with user_id
    payment_proof,
  } = req.body;

  // Basic validation for required fields
  if (
    !training_id ||
    !registrant_id ||
    !training_date ||
    !participant_count ||
    !participants ||
    participants.length === 0
  ) {
    return sendBadRequestResponse(res, "Incomplete registration data");
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN"); // Start DB transaction

    // Check if training exists and is active (status = 1)
    const trainingCheck = await client.query(
      `SELECT training_id, status FROM training WHERE training_id = $1`,
      [training_id],
    );

    if (trainingCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return sendErrorResponse(res, "Training not found", 404);
    }

    const trainingStatus = trainingCheck.rows[0].status;

    // Only allow registration for active training (status = 1)
    if (trainingStatus !== 1) {
      await client.query("ROLLBACK");
      return sendBadRequestResponse(
        res,
        "Registration is only allowed for active training programs",
      );
    }

    const registration_id = generateCustomId("REGT");

    // Calculate total payment: either use `final_price` or fallback to fees * count
    const total_payment =
      (final_price ? Number(final_price) : Number(training_fees)) *
      Number(participant_count);

    // Insert the registration data into `registration` table
    await client.query(
      `INSERT INTO registration 
          (registration_id, registrant_id, training_id, training_date, participant_count, total_payment, payment_proof) 
          VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        registration_id,
        registrant_id,
        training_id,
        training_date,
        participant_count,
        total_payment,
        payment_proof || null, // Store null if no proof uploaded
      ],
    );

    // Loop through the participants array to insert each into `registration_participant` table
    for (const participant of participants) {
      const reg_participant_id = generateCustomId("REGP"); // Generate unique ID for participant

      await client.query(
        `INSERT INTO registration_participant 
          (registration_participant_id, registration_id, user_id) 
          VALUES ($1, $2, $3)`,
        [reg_participant_id, registration_id, participant.user_id],
      );
    }

    await client.query("COMMIT"); // Commit transaction if all queries succeed

    // Send back success response with the registration ID
    return sendSuccessResponse(res, "Registration created successfully", {
      registration_id,
    });
  } catch (err) {
    await client.query("ROLLBACK"); // Rollback on any error
    console.error("Create registration error:", err);
    return sendErrorResponse(res, "Failed to create registration");
  } finally {
    client.release(); // Release DB connection back to pool
  }
};

// Function to fetch all registration data including participants
exports.getRegistrations = async (req, res) => {
  const client = await db.connect();
  try {
    // Get all registrations
    const registrationsResult = await client.query(
      `SELECT r.*, u.fullname AS registrant_name, t.training_name AS training_name
           FROM registration r
           JOIN users u ON r.registrant_id = u.user_id
           JOIN training t ON r.training_id = t.training_id
           ORDER BY r.registration_date DESC`,
    );

    const registrations = registrationsResult.rows;

    // For each registration, fetch its participants
    for (const reg of registrations) {
      const participantsResult = await client.query(
        `SELECT rp.*, u.fullname AS participant_name, u.email
             FROM registration_participant rp
             JOIN users u ON rp.user_id = u.user_id
             WHERE rp.registration_id = $1`,
        [reg.registration_id],
      );

      // Add participants array into the registration object
      reg.participants = participantsResult.rows;
    }

    return sendSuccessResponse(
      res,
      "Registrations fetched successfully",
      registrations,
    );
  } catch (err) {
    console.error("Get registration error:", err);
    return sendErrorResponse(res, "Failed to fetch registration data");
  } finally {
    client.release();
  }
};

// Function to fetch registration data by ID
exports.getRegistrationById = async (req, res) => {
  const { registration_id } = req.params;
  const client = await db.connect();

  try {
    // Fetch the registration data
    const registrationResult = await client.query(
      `SELECT r.*, u.fullname AS registrant_name, t.training_name AS training_name
       FROM registration r
       JOIN users u ON r.registrant_id = u.user_id
       JOIN training t ON r.training_id = t.training_id
       WHERE r.registration_id = $1`,
      [registration_id],
    );

    if (registrationResult.rows.length === 0) {
      return sendErrorResponse(res, "Registration not found", 404);
    }

    const registration = registrationResult.rows[0];

    // Fetch participants linked to this registration
    const participantsResult = await client.query(
      `SELECT rp.*, u.fullname AS participant_name, u.email
       FROM registration_participant rp
       JOIN users u ON rp.user_id = u.user_id
       WHERE rp.registration_id = $1`,
      [registration_id],
    );

    registration.participants = participantsResult.rows;

    return sendSuccessResponse(
      res,
      "Registration fetched successfully",
      registration,
    );
  } catch (err) {
    console.error("Get registration by ID error:", err);
    return sendErrorResponse(res, "Failed to fetch registration data");
  } finally {
    client.release();
  }
};

// Function to fetch registrations by multiple status
exports.getRegistrationsByStatus = async (req, res) => {
  const { status } = req.query; // Get status from query params

  // Basic validation
  if (!status) {
    return sendBadRequestResponse(res, "status parameter is required");
  }

  // Split and check each status value
  const statusArray = status.split(",").map((status) => {
    // Check if the value can be parsed to a number
    const parsedStatus = Number(status);
    if (isNaN(parsedStatus)) {
      return null; // If it's not a valid number, return null
    }
    return parsedStatus; // Return the valid number
  });

  // If there's any invalid status value, reject the request
  if (
    statusArray.includes(null) ||
    !statusArray.every((status) => [1, 2, 3, 4, 5].includes(status))
  ) {
    return sendBadRequestResponse(res, "Invalid status value. Must be 1-5.");
  }

  const client = await db.connect();
  try {
    // Get registrations matching the given status
    const registrationsResult = await client.query(
      `SELECT r.*, u.fullname AS registrant_name, t.training_name AS training_name
       FROM registration r
       JOIN users u ON r.registrant_id = u.user_id
       JOIN training t ON r.training_id = t.training_id
       WHERE r.status = ANY($1) -- Match any of the status
       ORDER BY r.registration_date DESC`,
      [statusArray],
    );

    const registrations = registrationsResult.rows;

    // For each registration, fetch its participants
    for (const reg of registrations) {
      const participantsResult = await client.query(
        `SELECT rp.*, u.fullname AS participant_name, u.email
         FROM registration_participant rp
         JOIN users u ON rp.user_id = u.user_id
         WHERE rp.registration_id = $1`,
        [reg.registration_id],
      );

      // Add participants array into the registration object
      reg.participants = participantsResult.rows;
    }

    return sendSuccessResponse(
      res,
      "Registrations fetched successfully",
      registrations,
    );
  } catch (err) {
    console.error("Get registrations by status error:", err);
    return sendErrorResponse(res, "Failed to fetch registration data");
  } finally {
    client.release();
  }
};

// Fuction to update status of registration
exports.updateRegistrationStatus = async (req, res) => {
  const { registration_id } = req.params;
  const { status } = req.body;

  // Basic validation
  if (!registration_id || status === undefined) {
    return sendBadRequestResponse(
      res,
      "Registration ID and new status are required",
    );
  }

  const validStatuses = [1, 2, 3, 4, 5];
  if (!validStatuses.includes(Number(status))) {
    return sendBadRequestResponse(res, "Invalid status value. Must be 1-5.");
  }

  const client = await db.connect();

  try {
    // Check if the registration exists
    const registrationCheck = await client.query(
      `SELECT registration_id FROM registration WHERE registration_id = $1`,
      [registration_id],
    );

    if (registrationCheck.rows.length === 0) {
      return sendErrorResponse(res, "Registration not found", 404);
    }

    let updateQuery = "";
    let params = [];

    if (Number(status) === 4) {
      const now = new Date();
      now.setHours(now.getHours() + 7);

      const completedDate = now.toISOString();

      updateQuery = `
        UPDATE registration 
        SET status = $1, completed_date = $2
        WHERE registration_id = $3
      `;
      params = [status, completedDate, registration_id];
    } else {
      updateQuery = `
        UPDATE registration 
        SET status = $1
        WHERE registration_id = $2
      `;
      params = [status, registration_id];
    }

    // Execute the update
    await client.query(updateQuery, params);

    return sendSuccessResponse(res, "Registration status updated successfully");
  } catch (err) {
    console.error("Update registration status error:", err);
    return sendErrorResponse(res, "Failed to update registration status");
  } finally {
    client.release();
  }
};

// Function to save payment proof URL to database
exports.savePaymentProof = async (req, res) => {
  const { registration_id, fileUrl } = req.body;

  // Basic validation
  if (!registration_id || !fileUrl) {
    return sendBadRequestResponse(
      res,
      "Registration ID and file URL are required",
    );
  }

  const client = await db.connect();
  try {
    // Check if the registration exists
    const registrationCheck = await client.query(
      `SELECT registration_id FROM registration WHERE registration_id = $1`,
      [registration_id],
    );

    if (registrationCheck.rows.length === 0) {
      return sendErrorResponse(res, "Registration not found", 404);
    }

    // Update the payment proof in the registration table
    await client.query(
      `UPDATE registration 
       SET payment_proof = $1 
       WHERE registration_id = $2`,
      [fileUrl, registration_id],
    );

    return sendSuccessResponse(res, "Payment proof saved successfully");
  } catch (err) {
    console.error("Save payment proof error:", err);
    return sendErrorResponse(res, "Failed to save payment proof");
  } finally {
    client.release();
  }
};

// Function to search registrations based on various criteria
exports.searchRegistrations = async (req, res) => {
  const client = await db.connect();

  try {
    // Extract query parameters
    const {
      keyword,
      training_date_from,
      training_date_to,
      registration_date_from,
      registration_date_to,
      registrant_name,
      training_name,
      sort_by = "r.registration_date",
      sort_order = "DESC",
      group_by_month,
      months_back,
      group_by_date = "completed_date",
      group_by_training = true,
    } = req.query;

    if (group_by_month === "true") {
      let groupQuery = `
        SELECT 
          TO_CHAR(r.${group_by_date}, 'YYYY-MM') AS month,
          COUNT(r.registration_id) AS total_registrations,
          SUM(r.participant_count) AS total_participants
        FROM registration r
        LEFT JOIN (
          SELECT registration_id, COUNT(*) AS participant_count
          FROM registration_participant
          GROUP BY registration_id
        ) rp ON r.registration_id = rp.registration_id
        WHERE r.${group_by_date} IS NOT NULL
      `;

      const groupParams = [];
      let index = 1;

      // Filter by months_back
      if (months_back) {
        groupQuery += ` AND r.${group_by_date} >= NOW() - INTERVAL '${months_back} months'`;
      }

      // Filter based on date range
      if (registration_date_from) {
        groupQuery += ` AND r.${group_by_date} >= $${index}`;
        groupParams.push(registration_date_from);
        index++;
      }

      if (registration_date_to) {
        groupQuery += ` AND r.${group_by_date} <= $${index}`;
        groupParams.push(registration_date_to);
        index++;
      }

      groupQuery += ` GROUP BY month ORDER BY month DESC`;

      const groupResult = await client.query(groupQuery, groupParams);

      return sendSuccessResponse(
        res,
        `Trainings Registration per month by ${group_by_date}`,
        groupResult.rows,
        {
          total: groupResult.rows.length,
          data: groupResult.rows,
        },
      );
    }

    if (req.query.group_by_training === "true") {
      const trainingQuery = `
        SELECT
          t.training_id,
          t.training_name,
          COUNT(DISTINCT r.registration_id) AS total_registrations,
          COUNT(rp.registration_participant_id) AS total_participants
        FROM training t
        LEFT JOIN registration r ON r.training_id = t.training_id
        LEFT JOIN registration_participant rp ON rp.registration_id = r.registration_id
        GROUP BY t.training_id, t.training_name
        ORDER BY total_participants DESC
      `;

      const trainingResult = await client.query(trainingQuery);

      return sendSuccessResponse(
        res,
        "Total participants and registrations per training fetched successfully",
        trainingResult.rows,
      );
    }

    // Normal queries for registrations
    let { status } = req.query;

    if (status) {
      if (!Array.isArray(status)) {
        status = [status];
      }
      status = status.map((s) => parseInt(s, 10)).filter((s) => !isNaN(s));
    }

    let baseQuery = `
      SELECT r.*, u.fullname AS registrant_name, t.training_name
      FROM registration r
      JOIN users u ON r.registrant_id = u.user_id
      JOIN training t ON r.training_id = t.training_id
      WHERE 1=1
    `;

    const queryParams = [];
    let paramIndex = 1;

    // Keyword search
    if (keyword) {
      baseQuery += ` AND (
        CAST(r.registration_id AS TEXT) ILIKE $${paramIndex} OR
        LOWER(u.fullname) LIKE LOWER($${paramIndex}) OR
        LOWER(t.training_name) LIKE LOWER($${paramIndex}) OR
        CAST(r.registration_date AS TEXT) ILIKE $${paramIndex}
      )`;
      queryParams.push(`%${keyword}%`);
      paramIndex++;
    }

    // Filter by status array
    if (status && status.length > 0) {
      baseQuery += ` AND r.status = ANY($${paramIndex})`;
      queryParams.push(status);
      paramIndex++;
    }

    // Filter by training date range
    if (training_date_from) {
      baseQuery += ` AND r.training_date >= $${paramIndex}`;
      queryParams.push(training_date_from);
      paramIndex++;
    }

    if (training_date_to) {
      baseQuery += ` AND r.training_date <= $${paramIndex}`;
      queryParams.push(training_date_to);
      paramIndex++;
    }

    // Filter by registration date range
    if (registration_date_from) {
      baseQuery += ` AND r.registration_date >= $${paramIndex}`;
      queryParams.push(registration_date_from);
      paramIndex++;
    }

    if (registration_date_to) {
      baseQuery += ` AND r.registration_date <= $${paramIndex}`;
      queryParams.push(registration_date_to);
      paramIndex++;
    }

    // Filter by registrant name
    if (registrant_name) {
      baseQuery += ` AND LOWER(u.fullname) LIKE LOWER($${paramIndex})`;
      queryParams.push(`%${registrant_name}%`);
      paramIndex++;
    }

    // Filter by training name
    if (training_name) {
      baseQuery += ` AND LOWER(t.training_name) LIKE LOWER($${paramIndex})`;
      queryParams.push(`%${training_name}%`);
      paramIndex++;
    }

    // Sorting
    const allowedSortFields = {
      registration_id: "r.registration_id",
      registrant_name: "u.fullname",
      training_name: "t.training_name",
      training_date: "r.training_date",
      registration_date: "r.registration_date",
      participant_count:
        "(SELECT COUNT(*) FROM registration_participant rp WHERE rp.registration_id = r.registration_id)",
    };

    const orderBy = allowedSortFields[sort_by] || "r.registration_date";
    const order = sort_order.toUpperCase() === "ASC" ? "ASC" : "DESC";
    baseQuery += ` ORDER BY ${orderBy} ${order}`;

    // Execute query
    const registrationsResult = await client.query(baseQuery, queryParams);
    const registrations = registrationsResult.rows;

    // Fetch participants for each registration
    for (const reg of registrations) {
      const participantsResult = await client.query(
        `SELECT rp.*, u.fullname AS participant_name, u.email
         FROM registration_participant rp
         JOIN users u ON rp.user_id = u.user_id
         WHERE rp.registration_id = $1`,
        [reg.registration_id],
      );
      reg.participants = participantsResult.rows;
    }

    return sendSuccessResponse(
      res,
      "Registrations fetched successfully",
      registrations,
    );
  } catch (err) {
    console.error("Search registrations error:", err);
    return sendErrorResponse(res, "Failed to fetch registrations");
  } finally {
    client.release();
  }
};

// Function to check if a user is already registered in a specific training
exports.checkUserRegistration = async (req, res) => {
  const { user_id, training_id } = req.params;

  // Basic validation
  if (!user_id || !training_id) {
    return sendBadRequestResponse(res, "user_id and training_id are required");
  }

  const client = await db.connect();
  try {
    // Check if training exists and is active (status = 1)
    const trainingCheck = await client.query(
      `SELECT training_id, status FROM training WHERE training_id = $1`,
      [training_id],
    );

    if (trainingCheck.rows.length === 0) {
      return sendErrorResponse(res, "Training not found", 404);
    }

    const trainingStatus = trainingCheck.rows[0].status;

    // Only allow checking registration for active training (status = 1)
    if (trainingStatus !== 1) {
      return sendBadRequestResponse(
        res,
        "Registration check is only allowed for active training programs",
      );
    }

    // Query to check if user has an ACTIVE registration (excluding cancelled and absent)
    // User can re-register if:
    // 1. Registration status = 5 (cancelled)
    // 2. Registration status = 4 (completed) AND attendance_status = false (absent)
    const query = `
      SELECT 
        rp.registration_participant_id,
        rp.attendance_status,
        r.registration_id,
        r.status AS registration_status,
        r.registration_date,
        r.training_date,
        t.training_name
      FROM registration_participant rp
      JOIN registration r ON rp.registration_id = r.registration_id
      JOIN training t ON r.training_id = t.training_id
      WHERE rp.user_id = $1 AND r.training_id = $2
      ORDER BY r.registration_date DESC
      LIMIT 1
    `;

    const result = await client.query(query, [user_id, training_id]);

    if (result.rows.length > 0) {
      const data = result.rows[0];

      // Allow re-registration if:
      // 1. Status is cancelled (5)
      // 2. Status is completed (4) AND attendance is false (absent)
      const isCancelled = data.registration_status === 5;
      const isAbsent =
        data.registration_status === 4 && data.attendance_status === false;

      if (isCancelled || isAbsent) {
        // User can register again
        return sendSuccessResponse(res, "User can register for this training", {
          isRegistered: false,
          canReRegister: true,
          previousRegistration: {
            registration_id: data.registration_id,
            status: isCancelled ? "Cancelled" : "Absent",
          },
        });
      }

      // User has active registration - block re-registration
      let statusLabel = "Upcoming";
      switch (data.registration_status) {
        case 4:
          statusLabel = "Done";
          break;
        case 5:
          statusLabel = "Cancelled";
          break;
        default:
          statusLabel = "Upcoming";
      }

      // Build detailed response object
      const responseData = {
        isRegistered: true,
        registration_participant_id: data.registration_participant_id,
        registration_id: data.registration_id,
        training_name: data.training_name,
        registration_date: data.registration_date,
        training_date: data.training_date,
        status_label: statusLabel,
      };

      return sendSuccessResponse(
        res,
        "User already registered in this training",
        responseData,
      );
    } else {
      // Not registered yet
      return sendSuccessResponse(res, "User not registered in this training", {
        isRegistered: false,
      });
    }
  } catch (err) {
    console.error("Check user registration error:", err);
    return sendErrorResponse(res, "Failed to check user registration");
  } finally {
    client.release();
  }
};

// Function to permanently delete a single registration and all related data
exports.deleteRegistration = async (req, res) => {
  const { registration_id } = req.params;

  if (!registration_id) {
    return sendBadRequestResponse(res, "Registration ID is required");
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Check if registration exists and is cancelled (status = 5)
    const regCheck = await client.query(
      `SELECT registration_id, status FROM registration WHERE registration_id = $1`,
      [registration_id],
    );

    if (regCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return sendNotFoundResponse(res, "Registration not found");
    }

    if (regCheck.rows[0].status !== 5) {
      await client.query("ROLLBACK");
      return sendBadRequestResponse(
        res,
        "Only cancelled registrations can be deleted",
      );
    }

    // Get all participant IDs related to this registration
    const participantsResult = await client.query(
      `SELECT registration_participant_id FROM registration_participant WHERE registration_id = $1`,
      [registration_id],
    );

    const participantIds = participantsResult.rows.map(
      (row) => row.registration_participant_id,
    );

    // Delete related data in order (respecting foreign key constraints)
    if (participantIds.length > 0) {
      // Delete reviews
      await client.query(
        `DELETE FROM review WHERE registration_participant_id = ANY($1)`,
        [participantIds],
      );

      // Delete certificates
      await client.query(
        `DELETE FROM certificate WHERE registration_participant_id = ANY($1)`,
        [participantIds],
      );
    }

    // Delete registration participants
    await client.query(
      `DELETE FROM registration_participant WHERE registration_id = $1`,
      [registration_id],
    );

    // Delete the registration itself
    await client.query(`DELETE FROM registration WHERE registration_id = $1`, [
      registration_id,
    ]);

    await client.query("COMMIT");

    return sendSuccessResponse(res, "Registration data deleted successfully", {
      registration_id,
      deleted_participants: participantIds.length,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Delete registration error:", err);
    return sendErrorResponse(res, "Failed to delete registration data");
  } finally {
    client.release();
  }
};

// Function to delete multiple selected registrations
exports.deleteMultipleRegistrations = async (req, res) => {
  const { registration_ids } = req.body;

  if (!Array.isArray(registration_ids) || registration_ids.length === 0) {
    return sendBadRequestResponse(res, "No registration IDs provided");
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Check which registrations exist and are cancelled
    const regCheck = await client.query(
      `SELECT registration_id FROM registration WHERE registration_id = ANY($1) AND status = 5`,
      [registration_ids],
    );

    const validIds = regCheck.rows.map((row) => row.registration_id);

    if (validIds.length === 0) {
      await client.query("ROLLBACK");
      return sendBadRequestResponse(
        res,
        "No valid cancelled registrations found to delete",
      );
    }

    // Get all participant IDs related to these registrations
    const participantsResult = await client.query(
      `SELECT registration_participant_id FROM registration_participant WHERE registration_id = ANY($1)`,
      [validIds],
    );

    const participantIds = participantsResult.rows.map(
      (row) => row.registration_participant_id,
    );

    let deletedCertificates = 0;
    let deletedReviews = 0;

    // Delete related data
    if (participantIds.length > 0) {
      // Delete reviews
      const reviewResult = await client.query(
        `DELETE FROM review WHERE registration_participant_id = ANY($1)`,
        [participantIds],
      );
      deletedReviews = reviewResult.rowCount;

      // Delete certificates
      const certResult = await client.query(
        `DELETE FROM certificate WHERE registration_participant_id = ANY($1)`,
        [participantIds],
      );
      deletedCertificates = certResult.rowCount;
    }

    // Delete registration participants
    await client.query(
      `DELETE FROM registration_participant WHERE registration_id = ANY($1)`,
      [validIds],
    );

    // Delete the registrations
    await client.query(
      `DELETE FROM registration WHERE registration_id = ANY($1)`,
      [validIds],
    );

    await client.query("COMMIT");

    return sendSuccessResponse(
      res,
      "Selected registration data deleted successfully",
      {
        deleted_registrations: validIds.length,
        deleted_participants: participantIds.length,
        deleted_certificates: deletedCertificates,
        deleted_reviews: deletedReviews,
      },
    );
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Delete multiple registrations error:", err);
    return sendErrorResponse(res, "Failed to delete selected registrations");
  } finally {
    client.release();
  }
};

// Function to delete all cancelled registrations
exports.deleteAllCancelledRegistrations = async (req, res) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Get all cancelled registrations
    const regResult = await client.query(
      `SELECT registration_id FROM registration WHERE status = 5`,
    );

    const cancelledIds = regResult.rows.map((row) => row.registration_id);

    if (cancelledIds.length === 0) {
      await client.query("ROLLBACK");
      return sendSuccessResponse(res, "No cancelled registrations to delete", {
        deleted_registrations: 0,
      });
    }

    // Get all participant IDs related to these registrations
    const participantsResult = await client.query(
      `SELECT registration_participant_id FROM registration_participant WHERE registration_id = ANY($1)`,
      [cancelledIds],
    );

    const participantIds = participantsResult.rows.map(
      (row) => row.registration_participant_id,
    );

    let deletedCertificates = 0;
    let deletedReviews = 0;

    // Delete related data
    if (participantIds.length > 0) {
      // Delete reviews
      const reviewResult = await client.query(
        `DELETE FROM review WHERE registration_participant_id = ANY($1)`,
        [participantIds],
      );
      deletedReviews = reviewResult.rowCount;

      // Delete certificates
      const certResult = await client.query(
        `DELETE FROM certificate WHERE registration_participant_id = ANY($1)`,
        [participantIds],
      );
      deletedCertificates = certResult.rowCount;
    }

    // Delete registration participants
    await client.query(
      `DELETE FROM registration_participant WHERE registration_id = ANY($1)`,
      [cancelledIds],
    );

    // Delete the registrations
    await client.query(`DELETE FROM registration WHERE status = 5`);

    await client.query("COMMIT");

    return sendSuccessResponse(
      res,
      "All cancelled registration data deleted successfully",
      {
        deleted_registrations: cancelledIds.length,
        deleted_participants: participantIds.length,
        deleted_certificates: deletedCertificates,
        deleted_reviews: deletedReviews,
      },
    );
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Delete all cancelled registrations error:", err);
    return sendErrorResponse(
      res,
      "Failed to delete all cancelled registrations",
    );
  } finally {
    client.release();
  }
};
