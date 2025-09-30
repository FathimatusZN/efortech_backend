const db = require("../config/db");
const { v4: uuidv4 } = require("uuid");
const {
  sendSuccessResponse,
  sendErrorResponse,
  sendBadRequestResponse,
} = require("../utils/responseUtils");
const axios = require("axios");

const getCertificateStatus = (expiredDate) => {
  if (!expiredDate) return "Valid";

  const today = new Date();
  const expiry = new Date(expiredDate);
  return today <= expiry ? "Valid" : "Expired";
};

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

// Endpoint to Generate Certificate Number
const generateCertificateNumber = async () => {
  const now = new Date();
  now.setHours(now.getHours() + 7); // UTC+7
  const YYMM =
    now.getFullYear().toString().slice(2) +
    String(now.getMonth() + 1).padStart(2, "0");

  let candidate;
  let isUnique = false;

  while (!isUnique) {
    const randomStr = [...Array(8)]
      .map(() => Math.random().toString(36).charAt(2).toUpperCase())
      .join("");

    candidate = YYMM + randomStr;

    const { rows } = await db.query(
      `SELECT 1 FROM certificate WHERE certificate_number = $1
       UNION
       SELECT 1 FROM user_certificates WHERE certificate_number = $1`,
      [candidate]
    );

    if (rows.length === 0) {
      isUnique = true;
    }
  }

  return candidate;
};

// Endpoint to generate and insert certificate
exports.generateCertificate = async (
  registration_participant_id,
  issued_date
) => {
  try {
    const certificate_number = await generateCertificateNumber();
    const certificate_id = generateCustomId("CERT");

    await db.query(
      `INSERT INTO certificate (certificate_id, certificate_number, registration_participant_id, issued_date)
       VALUES ($1, $2, $3, $4)`,
      [
        certificate_id,
        certificate_number,
        registration_participant_id,
        issued_date,
      ]
    );

    return {
      certificate_id,
      certificate_number,
    };
  } catch (error) {
    console.error("Certificate generation error:", error);
    throw error;
  }
};

// Controller function to create a new certificate
exports.createCertificate = async (req, res) => {
  // Extract input data from request body
  const {
    issued_date,
    expired_date,
    certificate_number,
    cert_file,
    registration_participant_id,
  } = req.body;

  // Basic validation for required fields
  if (
    !issued_date ||
    !certificate_number ||
    !cert_file ||
    !registration_participant_id
  ) {
    return sendBadRequestResponse(res, "Incomplete certificate data");
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN"); // Start DB transaction

    // Check if the participant has attended (attendance_status = true)
    const attendanceRes = await client.query(
      `SELECT attendance_status 
     FROM registration_participant 
     WHERE registration_participant_id = $1`,
      [registration_participant_id]
    );

    if (!attendanceRes.rows.length) {
      await client.query("ROLLBACK");
      return sendBadRequestResponse(res, "Participant not found.");
    }

    if (attendanceRes.rows[0].attendance_status !== true) {
      await client.query("ROLLBACK");
      return sendBadRequestResponse(
        res,
        "Cannot issue certificate: participant has not attended."
      );
    }

    const certificate_id = generateCustomId("CERT");

    // Insert the certificate data into the database
    await client.query(
      `INSERT INTO certificate
            (certificate_id, issued_date, expired_date, certificate_number, cert_file, registration_participant_id) 
            VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        certificate_id,
        issued_date,
        expired_date,
        certificate_number,
        cert_file,
        registration_participant_id,
      ]
    );

    if (cert_file) {
      await client.query(
        "UPDATE registration_participant SET has_certificate = true WHERE registration_participant_id = $1",
        [registration_participant_id]
      );
    }

    // Get registration_id and training_id
    const regRes = await client.query(
      `SELECT rp.registration_id, r.training_id 
         FROM registration_participant rp
         JOIN registration r ON rp.registration_id = r.registration_id
         WHERE rp.registration_participant_id = $1`,
      [registration_participant_id]
    );

    const training_id = regRes.rows[0]?.training_id;

    if (!training_id) {
      await client.query("ROLLBACK");
      return sendBadRequestResponse(res, "Training not found.");
    }

    // Recalculate the number of graduates for the training
    await client.query(
      `UPDATE training SET graduates = (
           SELECT COUNT(*) 
           FROM registration_participant rp
           JOIN registration r ON rp.registration_id = r.registration_id
           WHERE rp.has_certificate = true AND r.training_id = $1
         )
         WHERE training_id = $1`,
      [training_id]
    );

    await client.query("COMMIT"); // Commit transaction if all queries succeed

    // Send back success response with the certificate ID
    return sendSuccessResponse(res, "Certificate created successfully", {
      certificate_id,
    });
  } catch (err) {
    await client.query("ROLLBACK"); // Rollback on any error
    console.error("Create certificate error:", err);
    return sendErrorResponse(res, "Failed to create certificate", err.message);
  } finally {
    client.release(); // Release DB connection back to pool
  }
};

// Controller function to update certificate data
exports.updateCertificate = async (req, res) => {
  const {
    certificate_id,
    issued_date,
    cert_file,
    registration_participant_id,
  } = req.body;

  let { expired_date } = req.body;

  // Validate required input
  if (!certificate_id || !registration_participant_id || !issued_date) {
    return sendBadRequestResponse(res, "All required fields must be complete");
  }

  // Normalisasi expired_date
  if (!expired_date || expired_date.trim() === "") {
    expired_date = null;
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Check if certificate exists
    const certRes = await client.query(
      `SELECT * FROM certificate WHERE certificate_id = $1`,
      [certificate_id]
    );

    if (certRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return sendBadRequestResponse(res, "Certificate not found");
    }

    // Update certificate fields that are provided
    await client.query(
      `UPDATE certificate 
       SET 
         issued_date = COALESCE($1, issued_date),
         expired_date = $2,
         cert_file = COALESCE(NULLIF($3, ''), cert_file)
       WHERE certificate_id = $4 AND registration_participant_id = $5`,
      [
        issued_date,
        expired_date,
        cert_file,
        certificate_id,
        registration_participant_id,
      ]
    );

    // Ensure has_certificate is true
    if (cert_file) {
      await client.query(
        `UPDATE registration_participant 
     SET has_certificate = true 
     WHERE registration_participant_id = $1`,
        [registration_participant_id]
      );
    }

    // Get training_id for graduates recalculation
    const trainingRes = await client.query(
      `SELECT r.training_id 
       FROM registration_participant rp
       JOIN registration r ON rp.registration_id = r.registration_id
       WHERE rp.registration_participant_id = $1`,
      [registration_participant_id]
    );

    const training_id = trainingRes.rows[0]?.training_id;
    if (!training_id) {
      await client.query("ROLLBACK");
      return sendBadRequestResponse(res, "Training not found");
    }

    // Recalculate graduates
    await client.query(
      `UPDATE training SET graduates = (
         SELECT COUNT(*) 
         FROM registration_participant rp
         JOIN registration r ON rp.registration_id = r.registration_id
         WHERE rp.has_certificate = true AND r.training_id = $1
       )
       WHERE training_id = $1`,
      [training_id]
    );

    await client.query("COMMIT");
    return sendSuccessResponse(res, "Certificate updated successfully", {
      certificate_id,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Update certificate error:", err);
    return sendErrorResponse(res, "Failed to update certificate", err.message);
  } finally {
    client.release();
  }
};

// Function to fetch all certificates
exports.getCertificates = async (req, res) => {
  const client = await db.connect();
  const { status } = req.query;

  // Validate status parameter
  const allowedStatus = ["Valid", "Expired"];
  if (status && !allowedStatus.includes(status)) {
    return sendBadRequestResponse(
      res,
      "Invalid status parameter. Use 'Valid' or 'Expired'."
    );
  }

  try {
    const query = `
        SELECT 
            c.certificate_id,
            c.issued_date,
            c.expired_date,
            c.cert_file,
            c.registration_participant_id,
            c.certificate_number,
            u.fullname,
            u.user_photo,
            r.registration_id,
            r.status AS registration_status,
            r.completed_date,
            r.training_date,
            t.training_name
        FROM certificate c
        JOIN registration_participant rp ON c.registration_participant_id = rp.registration_participant_id
        JOIN registration r ON rp.registration_id = r.registration_id
        JOIN users u ON rp.user_id = u.user_id
        JOIN training t ON r.training_id = t.training_id
        ORDER BY c.issued_date DESC, u.fullname ASC
      `;

    const result = await client.query(query);

    if (result.rows.length === 0) {
      return sendSuccessResponse(res, "Certificate not found");
    }

    const certificatesWithStatus = result.rows.map((row) => ({
      ...row,
      status_certificate: getCertificateStatus(row.expired_date),
    }));

    const filteredCertificates = status
      ? certificatesWithStatus.filter(
          (row) => row.status_certificate === status
        )
      : certificatesWithStatus;

    return sendSuccessResponse(
      res,
      "Certificates fetched successfully",
      filteredCertificates
    );
  } catch (err) {
    console.error("Get certificates error:", err);
    return sendErrorResponse(res, "Failed to fetch certificates");
  } finally {
    client.release();
  }
};

// Controller function to fetch a single certificate by ID
exports.getCertificateById = async (req, res) => {
  const client = await db.connect();
  const { certificate_id } = req.params;

  try {
    const query = `
        SELECT 
            c.*,
            u.fullname,
            u.user_photo,
            t.training_name,
            r.completed_date
        FROM certificate c
        JOIN registration_participant rp ON c.registration_participant_id = rp.registration_participant_id
        JOIN registration r ON rp.registration_id = r.registration_id
        JOIN users u ON rp.user_id = u.user_id
        JOIN training t ON r.training_id = t.training_id
        WHERE c.certificate_id = $1
      `;

    const result = await client.query(query, [certificate_id]);

    if (result.rows.length === 0) {
      return sendSuccessResponse(res, "Certificate not found");
    }

    const certificate = {
      ...result.rows[0],
      status_certificate: getCertificateStatus(result.rows[0].expired_date),
    };

    return sendSuccessResponse(
      res,
      "Certificate fetched successfully",
      certificate
    );
  } catch (err) {
    console.error("Get certificate by ID error:", err);
    return sendErrorResponse(res, "Failed to fetch certificate");
  } finally {
    client.release();
  }
};

// Controller function for download certificate by registration_participant_id
exports.getDownloadCertificate = async (req, res) => {
  const client = await db.connect();
  const { registration_participant_id } = req.params;

  try {
    const query = `
      SELECT cert_file FROM certificate WHERE registration_participant_id = $1
    `;

    const result = await client.query(query, [registration_participant_id]);

    if (result.rows.length === 0 || !result.rows[0].cert_file) {
      return res.status(404).send("Certificate file not found");
    }

    const certificate = result.rows[0];

    // Ambil file dari GCS (streaming)
    const fileRes = await axios.get(certificate.cert_file, {
      responseType: "stream",
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${certificate.certificate_number}-${certificate.fullname}-${certificate.training_name}.pdf"`
    );

    fileRes.data.pipe(res);
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).send("Failed to fetch certificate");
  } finally {
    client.release();
  }
};

// Controller function to search for certificates based on various criteria
exports.searchCertificates = async (req, res) => {
  const client = await db.connect();

  try {
    const {
      training_name,
      certificate_number,
      fullname,
      issued_date,
      expired_date,
      issued_date_from,
      issued_date_to,
      expired_date_from,
      expired_date_to,
      group_by_month,
      months_back,
    } = req.query;

    if (group_by_month === "true") {
      let groupQuery = `
        SELECT 
          TO_CHAR(c.issued_date, 'YYYY-MM') AS month,
          COUNT(*) AS total_certificates
        FROM certificate c
        WHERE 1=1
      `;

      const groupParams = [];
      let index = 1;

      // Filter based on last N months
      if (months_back) {
        groupQuery += ` AND c.issued_date >= NOW() - INTERVAL '${months_back} months'`;
      }

      groupQuery += ` GROUP BY month ORDER BY month DESC`;

      const groupResult = await client.query(groupQuery, groupParams);

      return sendSuccessResponse(
        res,
        "Certificate summary per month",
        groupResult.rows,
        {
          total: groupResult.rowCount,
          data: groupResult.rows,
        }
      );
    }

    let baseQuery = `
        SELECT 
            c.certificate_id,
            c.issued_date,
            c.expired_date,
            c.cert_file,
            c.registration_participant_id,
            c.certificate_number,
            u.fullname,
            u.user_photo,
            r.registration_id,
            r.status AS registration_status,
            r.completed_date,
            r.training_date,
            t.training_name
        FROM certificate c
        JOIN registration_participant rp ON c.registration_participant_id = rp.registration_participant_id
        JOIN registration r ON rp.registration_id = r.registration_id
        JOIN users u ON rp.user_id = u.user_id
        JOIN training t ON r.training_id = t.training_id
        WHERE 1=1
      `;

    const queryParams = [];
    let paramIndex = 1;

    // Search by param
    if (req.query.query) {
      const generalQuery = `%${req.query.query.toLowerCase()}%`;
      baseQuery += ` AND (
        LOWER(u.fullname) LIKE $${paramIndex}
        OR LOWER(c.certificate_number) LIKE $${paramIndex}
        OR LOWER(t.training_name) LIKE $${paramIndex}
        OR LOWER(CAST(c.issued_date AS TEXT)) LIKE $${paramIndex}
        OR LOWER(CAST(c.expired_date AS TEXT)) LIKE $${paramIndex}
      )`;
      queryParams.push(generalQuery);
      paramIndex++;
    }

    // Search by training_name (case-insensitive, partial match)
    if (training_name) {
      baseQuery += ` AND LOWER(t.training_name) LIKE LOWER($${paramIndex})`;
      queryParams.push(`%${training_name}%`);
      paramIndex++;
    }

    // Search by certificate_number (partial match)
    if (certificate_number) {
      baseQuery += ` AND LOWER(c.certificate_number) LIKE LOWER($${paramIndex})`;
      queryParams.push(`%${certificate_number}%`);
      paramIndex++;
    }

    // Search by fullname (case-insensitive, partial match)
    if (fullname) {
      baseQuery += ` AND LOWER(u.fullname) LIKE LOWER($${paramIndex})`;
      queryParams.push(`%${fullname}%`);
      paramIndex++;
    }

    // Exact match issued_date
    if (issued_date) {
      baseQuery += ` AND c.issued_date = $${paramIndex}`;
      queryParams.push(issued_date);
      paramIndex++;
    }

    // Exact match expired_date
    if (expired_date) {
      baseQuery += ` AND c.expired_date = $${paramIndex}`;
      queryParams.push(expired_date);
      paramIndex++;
    }

    // Range issued_date
    if (issued_date_from) {
      baseQuery += ` AND c.issued_date >= $${paramIndex}`;
      queryParams.push(issued_date_from);
      paramIndex++;
    }

    if (issued_date_to) {
      baseQuery += ` AND c.issued_date <= $${paramIndex}`;
      queryParams.push(issued_date_to);
      paramIndex++;
    }

    // Range expired_date
    if (expired_date_from) {
      baseQuery += ` AND c.expired_date >= $${paramIndex}`;
      queryParams.push(expired_date_from);
      paramIndex++;
    }

    if (expired_date_to) {
      baseQuery += ` AND c.expired_date <= $${paramIndex}`;
      queryParams.push(expired_date_to);
      paramIndex++;
    }

    baseQuery += ` ORDER BY c.issued_date DESC, u.fullname ASC`;

    const result = await client.query(baseQuery, queryParams);

    if (result.rows.length === 0) {
      return sendSuccessResponse(res, "Certificate not found");
    }

    const certificates = result.rows.map((row) => ({
      ...row,
      status_certificate: getCertificateStatus(row.expired_date),
    }));

    return sendSuccessResponse(
      res,
      "Certificates searched successfully",
      certificates,
      {
        total: certificates.length,
        data: certificates,
      }
    );
  } catch (err) {
    console.error("Search certificates error:", err);
    return sendErrorResponse(res, "Failed to search certificates");
  } finally {
    client.release();
  }
};

// Controller function to delete a certificate
exports.deleteCertificate = async (req, res) => {
  const { certificate_id } = req.params;
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE registration_participant 
         SET has_certificate = false 
         WHERE registration_participant_id = (
           SELECT registration_participant_id 
           FROM certificate 
           WHERE certificate_id = $1
         )`,
      [certificate_id]
    );

    const result = await client.query(
      "DELETE FROM certificate WHERE certificate_id = $1 RETURNING *",
      [certificate_id]
    );

    await client.query("COMMIT");

    if (result.rowCount === 0) {
      return sendErrorResponse(res, "Certificate not found");
    }

    return sendSuccessResponse(res, "Certificate deleted successfully");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Delete certificate error:", err);
    return sendErrorResponse(res, "Failed to delete certificate");
  } finally {
    client.release();
  }
};
