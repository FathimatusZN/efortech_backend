const db = require("../config/db");
const { v4: uuidv4 } = require("uuid");
const {
  sendSuccessResponse,
  sendErrorResponse,
  sendBadRequestResponse,
} = require("../utils/responseUtils");

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

// Function to check if certificate number contains invalid characters (for URL : /?#&)
const encodeCertificateNumber = (number) => {
  return number.replace(/[^a-zA-Z0-9\-]/g, "_");
};

// Controller function to create user-uploaded certificate
exports.createUserCertificate = async (req, res) => {
  const {
    user_id,
    fullname,
    cert_type,
    issuer,
    issued_date,
    expired_date,
    certificate_number,
    cert_file,
  } = req.body;

  // Required field validation
  if (
    !fullname ||
    !cert_type ||
    !issuer ||
    !issued_date ||
    !certificate_number ||
    !cert_file
  ) {
    return sendBadRequestResponse(res, "Incomplete certificate data");
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN"); // Start transaction

    const user_certificate_id = generateCustomId("UCRT");
    const encodedNumber = encodeCertificateNumber(certificate_number);

    // Insert certificate data into user_certificates table
    await client.query(
      `INSERT INTO user_certificates (
          user_certificate_id, user_id, fullname, cert_type, issuer, 
          issued_date, expired_date, certificate_number, original_number, cert_file, 
          status, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, 
          $6, $7, $8, $9, $10,
          1, NOW()
        )`,
      [
        user_certificate_id,
        user_id || null,
        fullname,
        cert_type,
        issuer,
        issued_date,
        expired_date || null,
        encodedNumber,
        encodedNumber !== certificate_number ? certificate_number : null, // only save original if modified
        cert_file,
      ]
    );

    await client.query("COMMIT");

    return sendSuccessResponse(res, "User certificate created successfully", {
      user_certificate_id,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Create user certificate error:", err);
    return sendErrorResponse(
      res,
      "Failed to create user certificate",
      err.message
    );
  } finally {
    client.release();
  }
};

// Admin-side function to upload a validated certificate for user
exports.createUserCertificateByAdmin = async (req, res) => {
  const {
    user_id,
    fullname,
    cert_type,
    issuer,
    issued_date,
    expired_date,
    certificate_number,
    cert_file,
    admin_id, // comes from frontend auth
    notes,
  } = req.body;

  if (
    !fullname ||
    !cert_type ||
    !issuer ||
    !issued_date ||
    !certificate_number ||
    !cert_file ||
    !admin_id
  ) {
    return sendBadRequestResponse(res, "Missing required certificate data");
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const user_certificate_id = generateCustomId("UCRT");
    const encodedNumber = encodeCertificateNumber(certificate_number);

    await client.query(
      `INSERT INTO user_certificates (
          user_certificate_id, user_id, fullname, cert_type, issuer,
          issued_date, expired_date, certificate_number, original_number, cert_file,
          status, created_at, verified_by, verification_date, notes
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          2, NOW(), $11, NOW(), $12
        )`,
      [
        user_certificate_id,
        user_id || null,
        fullname,
        cert_type,
        issuer,
        issued_date,
        expired_date || null,
        encodedNumber,
        encodedNumber !== certificate_number ? certificate_number : null,
        cert_file,
        admin_id,
        notes || null,
      ]
    );

    await client.query("COMMIT");

    return sendSuccessResponse(
      res,
      "User certificate (admin-verified) created successfully",
      { user_certificate_id }
    );
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Create admin-side certificate error:", err);
    return sendErrorResponse(
      res,
      "Failed to create validated certificate",
      err.message
    );
  } finally {
    client.release();
  }
};

// Update status and verification info of user certificate
exports.updateUserCertificateStatus = async (req, res) => {
  const { user_certificate_id, status, admin_id, notes } = req.body;

  if (!status || !admin_id) {
    return sendErrorResponse(res, "Status dan admin_id wajib diisi");
  }

  const client = await db.connect();
  try {
    const query = `
        UPDATE user_certificates
        SET 
          status = $1,
          verified_by = $2,
          notes = $3,
          verification_date = NOW()
        WHERE user_certificate_id = $4
        RETURNING *;
      `;

    const values = [status, admin_id, notes || null, user_certificate_id];
    const result = await client.query(query, values);

    if (result.rowCount === 0) {
      return sendErrorResponse(res, "Sertifikat tidak ditemukan");
    }

    return sendSuccessResponse(
      res,
      "Status sertifikat berhasil diperbarui",
      result.rows[0]
    );
  } catch (err) {
    console.error("Update status error:", err);
    return sendErrorResponse(
      res,
      "Gagal memperbarui status sertifikat",
      err.message
    );
  } finally {
    client.release();
  }
};

// Get all user certificates
exports.getUserCertificates = async (req, res) => {
  const client = await db.connect();
  try {
    const result = await client.query(`
        SELECT 
          uc.user_certificate_id,
          uc.user_id,
          COALESCE(u.fullname, uc.fullname) AS fullname,
          uc.cert_type,
          uc.issuer,
          uc.issued_date,
          uc.expired_date,
          uc.certificate_number,
          uc.original_number,
          uc.cert_file,
          uc.status,
          uc.created_at,
          uc.verified_by,
          COALESCE(admin.fullname, admin.email) AS verified_by_name,
          uc.verification_date,
          uc.notes
        FROM user_certificates uc
        LEFT JOIN users u ON u.user_id = uc.user_id
        LEFT JOIN users admin ON admin.user_id = uc.verified_by
        ORDER BY uc.created_at DESC
      `);

    const certificates = result.rows.map((row) => ({
      ...row,
      validity_status: getCertificateStatus(row.expired_date),
      verified_by: row.verified_by
        ? `${row.verified_by} (${row.verified_by_name})`
        : null,
      validity_status: getCertificateStatus(row.expired_date),
    }));

    return sendSuccessResponse(res, "Certificates retrieved", certificates);
  } catch (err) {
    console.error("Get certificates error:", err);
    return sendErrorResponse(
      res,
      "Failed to retrieve certificates",
      err.message
    );
  } finally {
    client.release();
  }
};

// Get user certificate by ID
exports.getUserCertificateById = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return sendBadRequestResponse(res, "Missing certificate ID");
  }

  const client = await db.connect();
  try {
    const result = await client.query(
      `
        SELECT 
          uc.user_certificate_id,
          uc.user_id,
          COALESCE(u.fullname, uc.fullname) AS fullname,
          uc.cert_type,
          uc.issuer,
          uc.issued_date,
          uc.expired_date,
          uc.certificate_number,
          uc.original_number,
          uc.cert_file,
          uc.status,
          uc.created_at,
          uc.verified_by,
          COALESCE(admin.fullname, admin.email) AS verified_by_name,
          uc.verification_date,
          uc.notes
        FROM user_certificates uc
        LEFT JOIN users u ON u.user_id = uc.user_id
        LEFT JOIN users admin ON admin.user_id = uc.verified_by
        WHERE uc.user_certificate_id = $1
        `,
      [id]
    );

    if (result.rowCount === 0) {
      return sendSuccessResponse(res, "Certificate not found");
    }

    const cert = result.rows[0];
    cert.validity_status = getCertificateStatus(cert.expired_date);
    cert.verified_by = cert.verified_by
      ? `${cert.verified_by} (${cert.verified_by_name})`
      : null;

    return sendSuccessResponse(res, "Certificate retrieved", cert);
  } catch (err) {
    console.error("Get certificate by ID error:", err);
    return sendErrorResponse(
      res,
      "Failed to retrieve certificate",
      err.message
    );
  } finally {
    client.release();
  }
};

// Search certificates with multiple filters and optional fulltext query
exports.searchUserCertificates = async (req, res) => {
  const {
    user_id,
    fullname,
    cert_type,
    issuer,
    issued_date,
    expired_date,
    certificate_number,
    original_number,
    status,
    created_at,
    query,
    sort_by = "created_at",
    sort_order = "desc",
  } = req.query;

  const allowedSortFields = [
    "fullname",
    "cert_type",
    "issuer",
    "issued_date",
    "expired_date",
    "certificate_number",
    "original_number",
    "status",
    "created_at",
  ];
  const sortField = allowedSortFields.includes(sort_by)
    ? sort_by
    : "created_at";
  const sortOrder = sort_order.toLowerCase() === "asc" ? "ASC" : "DESC";

  const conditions = [];
  const values = [];
  let idx = 1;

  if (user_id) {
    conditions.push(`CAST(uc.user_id AS TEXT) ILIKE $${idx++}`);
    values.push(`%${user_id}%`);
  }
  if (fullname) {
    conditions.push(`LOWER(COALESCE(u.fullname, uc.fullname)) ILIKE $${idx++}`);
    values.push(`%${fullname.toLowerCase()}%`);
  }
  if (cert_type) {
    conditions.push(`LOWER(COALESCE(uc.cert_type, '')) ILIKE $${idx++}`);
    values.push(`%${cert_type.toLowerCase()}%`);
  }
  if (issuer) {
    conditions.push(`LOWER(COALESCE(uc.issuer, '')) ILIKE $${idx++}`);
    values.push(`%${issuer.toLowerCase()}%`);
  }
  if (issued_date) {
    conditions.push(`DATE(uc.issued_date) = $${idx++}`);
    values.push(issued_date);
  }
  if (expired_date) {
    conditions.push(`DATE(uc.expired_date) = $${idx++}`);
    values.push(expired_date);
  }
  if (certificate_number) {
    conditions.push(
      `LOWER(COALESCE(uc.certificate_number, '')) ILIKE $${idx++}`
    );
    values.push(`%${certificate_number.toLowerCase()}%`);
  }
  if (original_number) {
    conditions.push(`LOWER(COALESCE(uc.original_number, '')) ILIKE $${idx++}`);
    values.push(`%${original_number.toLowerCase()}%`);
  }
  if (status) {
    const statusArray = Array.isArray(status) ? status : [status];
    const placeholders = statusArray.map(() => `$${idx++}`).join(", ");
    conditions.push(`uc.status IN (${placeholders})`);
    values.push(...statusArray);
  }
  if (created_at) {
    conditions.push(`DATE(uc.created_at) = $${idx++}`);
    values.push(created_at);
  }

  if (query) {
    conditions.push(`(
        CAST(uc.user_id AS TEXT) ILIKE $${idx} OR
        LOWER(COALESCE(u.fullname, uc.fullname)) ILIKE $${idx} OR
        LOWER(COALESCE(uc.cert_type, '')) ILIKE $${idx} OR
        LOWER(COALESCE(uc.certificate_number, '')) ILIKE $${idx} OR
        LOWER(COALESCE(uc.original_number, '')) ILIKE $${idx}
      )`);
    values.push(`%${query.toLowerCase()}%`);
    idx++;
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const client = await db.connect();
  try {
    const result = await client.query(
      `
        SELECT 
          uc.user_certificate_id,
          uc.user_id,
          COALESCE(u.fullname, uc.fullname) AS fullname,
          uc.cert_type,
          uc.issuer,
          uc.issued_date,
          uc.expired_date,
          uc.certificate_number,
          uc.original_number,
          uc.cert_file,
          uc.status,
          uc.created_at,
          uc.verified_by,
          COALESCE(admin.fullname, admin.email) AS verified_by_name,
          uc.verification_date,
          uc.notes
        FROM user_certificates uc
        LEFT JOIN users u ON u.user_id = uc.user_id
        LEFT JOIN users admin ON admin.user_id = uc.verified_by
        ${whereClause}
        ORDER BY ${sortField} ${sortOrder}
        `,
      values
    );

    if (result.rows.length === 0) {
      return sendSuccessResponse(res, "Certificate not found", []);
    }

    const results = result.rows.map((row) => ({
      ...row,
      validity_status: getCertificateStatus(row.expired_date),
      verified_by: row.verified_by
        ? `${row.verified_by} (${row.verified_by_name})`
        : null,
      validity_status: getCertificateStatus(row.expired_date),
    }));

    return sendSuccessResponse(res, "Search results", results);
  } catch (err) {
    console.error("Search certificate error:", err);
    return sendErrorResponse(res, "Failed to search certificates", err.message);
  } finally {
    client.release();
  }
};
