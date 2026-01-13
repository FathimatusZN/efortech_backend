// efortech_backend\controllers\enrollmentController.js
const db = require("../config/db");
const {
  sendSuccessResponse,
  sendErrorResponse,
  sendBadRequestResponse,
} = require("../utils/responseUtils");
const { generateCertificate } = require("./certificateController");

// Function to update attendance status for a participant
exports.updateAttendanceStatus = async (req, res) => {
  const { registration_participant_id } = req.params;
  const { attendance_status } = req.body;

  if (attendance_status === undefined) {
    return sendBadRequestResponse(res, "Attendance status is required");
  }

  const client = await db.connect();

  try {
    const participantCheck = await client.query(
      `SELECT rp.registration_id, r.status 
       FROM registration_participant rp
       JOIN registration r ON rp.registration_id = r.registration_id
       WHERE rp.registration_participant_id = $1`,
      [registration_participant_id]
    );

    if (participantCheck.rows.length === 0) {
      return sendErrorResponse(res, "Participant not found", 404);
    }

    const { status } = participantCheck.rows[0];

    if (status !== 4) {
      return sendBadRequestResponse(
        res,
        "Attendance status can only be updated for completed registrations (status 4)."
      );
    }

    // Check if certificate already exists for this participant
    const certCheck = await client.query(
      `SELECT certificate_id FROM certificate WHERE registration_participant_id = $1`,
      [registration_participant_id]
    );

    const existingCertificate = certCheck.rows[0];

    if (attendance_status === true && existingCertificate) {
      // If trying to mark as attended but certificate already exists, return error
      return sendBadRequestResponse(
        res,
        "Certificate already exists for this participant."
      );
    }

    if (attendance_status === false && existingCertificate) {
      // If unmarking attendance and certificate exists, delete the certificate
      await client.query(`DELETE FROM certificate WHERE certificate_id = $1`, [
        existingCertificate.certificate_id,
      ]);
    }

    // Update the attendance status
    await client.query(
      `UPDATE registration_participant 
       SET attendance_status = $1 
       WHERE registration_participant_id = $2`,
      [attendance_status, registration_participant_id]
    );

    let certificateData = null;

    // If attendance is marked true, generate a certificate
    if (attendance_status === true) {
      certificateData = await generateCertificate(
        registration_participant_id,
        new Date()
      );
    }

    return sendSuccessResponse(
      res,
      "Attendance status updated successfully!",
      certificateData
    );
  } catch (err) {
    console.error("Update attendance status error:", err);
    return sendErrorResponse(res, "Failed to update attendance status");
  } finally {
    client.release();
  }
};

// Function to update attendance status for multiple participants
exports.updateMultipleAttendanceStatus = async (req, res) => {
  const { registration_participant_ids } = req.body;
  const { attendance_status } = req.body;

  if (
    !Array.isArray(registration_participant_ids) ||
    registration_participant_ids.length === 0
  ) {
    return sendBadRequestResponse(
      res,
      "List of registration_participant_ids is required"
    );
  }

  if (attendance_status === undefined) {
    return sendBadRequestResponse(res, "Attendance status is required");
  }

  const client = await db.connect();

  try {
    // Get participant and registration status data
    const { rows: participants } = await client.query(
      `SELECT rp.registration_participant_id, rp.registration_id, r.status
       FROM registration_participant rp
       JOIN registration r ON rp.registration_id = r.registration_id
       WHERE rp.registration_participant_id = ANY($1)`,
      [registration_participant_ids]
    );

    if (participants.length !== registration_participant_ids.length) {
      return sendErrorResponse(res, "Some participants not found", 404);
    }

    const incomplete = participants.filter((p) => p.status !== 4);
    if (incomplete.length > 0) {
      return sendBadRequestResponse(
        res,
        "Attendance status can only be updated for completed registrations (status 4)."
      );
    }

    const certsRes = await client.query(
      `SELECT registration_participant_id, certificate_id 
       FROM certificate 
       WHERE registration_participant_id = ANY($1)`,
      [registration_participant_ids]
    );
    const certMap = new Map(
      certsRes.rows.map((row) => [
        row.registration_participant_id,
        row.certificate_id,
      ])
    );

    const certsToGenerate = [];
    const certsToDelete = [];

    for (const p of participants) {
      const hasCert = certMap.has(p.registration_participant_id);

      if (attendance_status === true && hasCert) {
        return sendBadRequestResponse(
          res,
          `Certificate already exists for participant ID ${p.registration_participant_id}`
        );
      }

      if (attendance_status === false && hasCert) {
        certsToDelete.push(certMap.get(p.registration_participant_id));
      }

      if (attendance_status === true && !hasCert) {
        certsToGenerate.push(p.registration_participant_id);
      }
    }

    // Delete certificate if needed
    if (certsToDelete.length > 0) {
      await client.query(
        `DELETE FROM certificate WHERE certificate_id = ANY($1)`,
        [certsToDelete]
      );
    }

    // Update attendance
    await client.query(
      `UPDATE registration_participant
       SET attendance_status = $1
       WHERE registration_participant_id = ANY($2)`,
      [attendance_status, registration_participant_ids]
    );

    // Generate certificate if needed
    const generatedCertificates = [];
    for (const id of certsToGenerate) {
      const cert = await generateCertificate(id, new Date());
      if (cert) generatedCertificates.push(cert);
    }

    return sendSuccessResponse(
      res,
      `Attendance status updated successfully for ${registration_participant_ids.length} participants`,
      {
        generated_certificates: generatedCertificates,
        deleted_certificates: certsToDelete,
      }
    );
  } catch (err) {
    console.error("Update multiple attendance status error:", err);
    return sendErrorResponse(res, "Failed to update attendance status");
  } finally {
    client.release();
  }
};

// Function to fetch all registration_participant with registration.status = 4
exports.getCompletedParticipants = async (req, res) => {
  const client = await db.connect();

  try {
    const {
      attendance_status,
      has_certificate,
      keyword,
      sort_by = "r.training_date",
      sort_order = "DESC",
      reg_date_start,
      reg_date_end,
      training_date_start,
      training_date_end,
      group_by_training = true,
    } = req.query;

    if (req.query.group_by_training === "true") {
      const groupQuery = `
        SELECT 
          t.training_id,
          t.training_name,
          COUNT(*) FILTER (WHERE rp.has_certificate = true) AS total_graduates,
          COUNT(*) AS total_participants
        FROM registration_participant rp
        JOIN registration r ON rp.registration_id = r.registration_id
        JOIN training t ON r.training_id = t.training_id
        WHERE r.status = 4
        GROUP BY t.training_id, t.training_name
        ORDER BY total_graduates DESC
      `;

      const groupResult = await client.query(groupQuery);

      return sendSuccessResponse(
        res,
        "Graduation statistics per training fetched successfully",
        groupResult.rows
      );
    }

    const values = [];
    const filters = [];

    // Filter by registration.status = 4 (completed)
    filters.push(`r.status = 4`);

    // Optional filter by attendance_status
    if (attendance_status === "true" || attendance_status === "false") {
      values.push(attendance_status === "true");
      filters.push(`rp.attendance_status = $${values.length}`);
    } else if (attendance_status === "null") {
      filters.push(`rp.attendance_status IS NULL`);
    }

    // Optional filter by has_certificate
    if (has_certificate === "true" || has_certificate === "false") {
      values.push(has_certificate === "true");
      filters.push(`rp.has_certificate = $${values.length}`);
    }

    // Optional keyword on multiple fields
    if (keyword) {
      const ilikeKeyword = `%${keyword}%`;
      const keywordConditions = [
        `u.fullname ILIKE $${values.length + 1}`,
        `CAST(rp.registration_participant_id AS TEXT) ILIKE $${
          values.length + 1
        }`,
        `CAST(r.registration_date AS TEXT) ILIKE $${values.length + 1}`,
        `CAST(r.training_date AS TEXT) ILIKE $${values.length + 1}`,
        `t.training_name ILIKE $${values.length + 1}`,
      ];
      values.push(ilikeKeyword);
      filters.push(`(${keywordConditions.join(" OR ")})`);
    }

    // Filter by registration_date range
    if (reg_date_start) {
      values.push(reg_date_start);
      filters.push(`r.registration_date >= $${values.length}`);
    }
    if (reg_date_end) {
      values.push(reg_date_end);
      filters.push(`r.registration_date <= $${values.length}`);
    }

    // Filter by training_date range
    if (training_date_start) {
      values.push(training_date_start);
      filters.push(`r.training_date >= $${values.length}`);
    }
    if (training_date_end) {
      values.push(training_date_end);
      filters.push(`r.training_date <= $${values.length}`);
    }

    // Allowed sortable columns mapping
    const allowedSortFields = {
      fullname: "u.fullname",
      registration_participant_id: "rp.registration_participant_id",
      registration_date: "r.registration_date",
      training_date: "r.training_date",
      training_name: "t.training_name",
    };

    const orderByField = allowedSortFields[sort_by] || "r.training_date";
    const orderDirection = sort_order.toUpperCase() === "ASC" ? "ASC" : "DESC";

    // Special mode: onprogress or completed
    const { mode, ...restQuery } = req.query;

    if (mode === "onprogress") {
      filters.push(`(
        rp.attendance_status IS NULL OR
        (rp.attendance_status = true AND rp.has_certificate = false AND COALESCE(rp.no_certificate, false) = false)
      )`);
    }

    if (mode === "completed") {
      filters.push(`(
        rp.attendance_status = false OR
        (rp.attendance_status = true AND rp.has_certificate = true) OR
        (rp.attendance_status = true AND COALESCE(rp.no_certificate, false) = true)
      )`);
    }

    const query = `
      SELECT 
        rp.*,
        u.*,
        r.*,
        t.training_id, 
        t.training_name,
        c.certificate_id,
        c.certificate_number,
        c.issued_date,
        c.expired_date,
        EXISTS (
          SELECT 1 FROM review v 
          WHERE v.registration_participant_id = rp.registration_participant_id
        ) AS has_review
      FROM registration_participant rp
      JOIN registration r ON rp.registration_id = r.registration_id
      JOIN users u ON rp.user_id = u.user_id
      JOIN training t ON r.training_id = t.training_id
      LEFT JOIN certificate c ON c.registration_participant_id = rp.registration_participant_id
      ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
      ORDER BY ${orderByField} ${orderDirection}
    `;

    const result = await client.query(query, values);

    return sendSuccessResponse(
      res,
      "Completed participant registrations fetched successfully",
      result.rows
    );
  } catch (err) {
    console.error("Get completed participants error:", err);
    return sendErrorResponse(res, "Failed to fetch completed participants");
  } finally {
    client.release();
  }
};

// Function to fetch training history for a specific user
exports.getUserTrainingHistory = async (req, res) => {
  const client = await db.connect();

  try {
    const { user_id } = req.params;
    const { status } = req.query;

    let query = `
        SELECT 
          r.registration_id,
          r.status,
          r.training_date,
          t.training_name,
          c.certificate_id,
          c.issued_date,
          c.expired_date,
          c.cert_file,
          u.fullname,
          u.email,
          u.user_photo,
          rp.registration_participant_id,
          rp.attendance_status,
          rp.has_certificate,
          rp.advantech_cert,
          EXISTS (
            SELECT 1 FROM review v 
            WHERE v.registration_participant_id = rp.registration_participant_id
          ) AS has_review
        FROM registration r
        JOIN registration_participant rp ON r.registration_id = rp.registration_id
        JOIN training t ON r.training_id = t.training_id
        LEFT JOIN certificate c ON rp.registration_participant_id = c.registration_participant_id
        JOIN users u ON rp.user_id = u.user_id
        WHERE u.user_id = $1
      `;

    if (status) {
      query += ` AND r.status = $2`;
    }

    query += ` ORDER BY r.training_date DESC`;

    const result = await client.query(
      query,
      status ? [user_id, status] : [user_id]
    );

    if (result.rows.length === 0) {
      return sendSuccessResponse(
        res,
        "No training history found for this user"
      );
    }

    return sendSuccessResponse(
      res,
      "Training history fetched successfully",
      result.rows
    );
  } catch (err) {
    console.error("Error fetching user training history:", err);
    return sendErrorResponse(res, "Failed to fetch user training history");
  } finally {
    client.release();
  }
};

// Update the Advantech certificate links for a participant (now supports array)
exports.updateAdvantechCertificate = async (req, res) => {
  const { registration_participant_id, fileUrls } = req.body;

  if (
    !registration_participant_id ||
    !fileUrls ||
    !Array.isArray(fileUrls) ||
    fileUrls.length === 0
  ) {
    return sendBadRequestResponse(
      res,
      "registration_participant_id and fileUrls array are required."
    );
  }

  if (fileUrls.length > 3) {
    return sendBadRequestResponse(res, "Maximum 3 certificate files allowed.");
  }

  try {
    // Check if the participant exists
    const checkRes = await db.query(
      `SELECT * FROM registration_participant WHERE registration_participant_id = $1`,
      [registration_participant_id]
    );

    if (checkRes.rows.length === 0) {
      return sendBadRequestResponse(res, "Participant not found.");
    }

    // Update the Advantech certificate links (as array)
    await db.query(
      `UPDATE registration_participant
       SET advantech_cert = $1
       WHERE registration_participant_id = $2`,
      [fileUrls, registration_participant_id]
    );

    return sendSuccessResponse(
      res,
      "Advantech certificate links updated successfully.",
      { fileUrls }
    );
  } catch (err) {
    console.error("Error updating advantech_cert:", err);
    return sendErrorResponse(
      res,
      "Failed to update Advantech certificate links.",
      err.message
    );
  }
};

// Mark participant as "no certificate"
exports.markNoCertificate = async (req, res) => {
  const { registration_participant_id } = req.params;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Check participant exists and attended
    const participantCheck = await client.query(
      `SELECT rp.*, r.status 
       FROM registration_participant rp
       JOIN registration r ON rp.registration_id = r.registration_id
       WHERE rp.registration_participant_id = $1`,
      [registration_participant_id]
    );

    if (participantCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return sendErrorResponse(res, "Participant not found", 404);
    }

    const participant = participantCheck.rows[0];

    if (participant.status !== 4) {
      await client.query("ROLLBACK");
      return sendBadRequestResponse(
        res,
        "Can only mark 'no certificate' for completed registrations"
      );
    }

    if (participant.attendance_status !== true) {
      await client.query("ROLLBACK");
      return sendBadRequestResponse(
        res,
        "Can only mark 'no certificate' for participants who attended"
      );
    }

    if (participant.has_certificate) {
      await client.query("ROLLBACK");
      return sendBadRequestResponse(
        res,
        "Certificate already exists for this participant"
      );
    }

    // Update to no_certificate
    await client.query(
      `UPDATE registration_participant 
       SET no_certificate = true 
       WHERE registration_participant_id = $1`,
      [registration_participant_id]
    );

    await client.query("COMMIT");

    return sendSuccessResponse(
      res,
      "Participant marked as 'no certificate' successfully"
    );
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Mark no certificate error:", err);
    return sendErrorResponse(res, "Failed to mark no certificate");
  } finally {
    client.release();
  }
};
