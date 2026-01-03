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

const generateCustomId = (prefix) => {
  const now = new Date();
  now.setHours(now.getHours() + 7);
  const timestamp = now
    .toISOString()
    .replace(/[-T:.Z]/g, "")
    .slice(0, 12);
  const randomStr = uuidv4().slice(0, 6).toUpperCase();
  return `${prefix}-${timestamp}-${randomStr}`;
};

const encodeCertificateNumber = (number) => {
  return number.replace(/[^a-zA-Z0-9\-]/g, "_");
};

const generateRandomCertNumber = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const generateUniqueCertificateNumber = async (client) => {
  let unique = false;
  let randomNumber;

  while (!unique) {
    randomNumber = generateRandomCertNumber();

    const check = await client.query(
      `
      SELECT 1 FROM user_certificates WHERE certificate_number = $1
      UNION
      SELECT 1 FROM certificate WHERE certificate_number = $1
      LIMIT 1
      `,
      [randomNumber]
    );

    if (check.rowCount === 0) {
      unique = true;
    }
  }

  return randomNumber;
};

const processCertificateNumber = async (certificate_number, client) => {
  let finalCertNumber = certificate_number;
  let originalNumber = null;

  const normalized = String(certificate_number)
    .trim()
    .replace(/^['"]|['"]$/g, "");

  if (normalized === "-" || normalized.length <= 2) {
    finalCertNumber = await generateUniqueCertificateNumber(client);
    originalNumber = "-";
  } else {
    const encodedNumber = encodeCertificateNumber(certificate_number);
    finalCertNumber = encodedNumber;
    if (encodedNumber !== certificate_number) {
      originalNumber = certificate_number;
    }
  }

  return { finalCertNumber, originalNumber };
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
    cert_file, // Now expecting an array
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

  // Validate cert_file is array with 1-3 items
  if (
    !Array.isArray(cert_file) ||
    cert_file.length === 0 ||
    cert_file.length > 3
  ) {
    return sendBadRequestResponse(
      res,
      "cert_file must be an array with 1-3 URLs"
    );
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const user_certificate_id = generateCustomId("UCRT");
    const { finalCertNumber, originalNumber } = await processCertificateNumber(
      certificate_number,
      client
    );

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
        finalCertNumber,
        originalNumber,
        cert_file, // PostgreSQL will automatically handle array
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
    cert_file, // Now expecting an array
    admin_id,
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

  // Validate cert_file is array with 1-3 items
  if (
    !Array.isArray(cert_file) ||
    cert_file.length === 0 ||
    cert_file.length > 3
  ) {
    return sendBadRequestResponse(
      res,
      "cert_file must be an array with 1-3 URLs"
    );
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const user_certificate_id = generateCustomId("UCRT");
    const { finalCertNumber, originalNumber } = await processCertificateNumber(
      certificate_number,
      client
    );

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
        finalCertNumber,
        originalNumber,
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
    return sendErrorResponse(res, "Status and admin_id are required");
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    if (status === 2) {
      const certNumberResult = await client.query(
        `
        SELECT certificate_number, original_number
        FROM user_certificates
        WHERE user_certificate_id = $1
      `,
        [user_certificate_id]
      );

      if (certNumberResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return sendErrorResponse(res, "Certificate not found");
      }

      const { certificate_number, original_number } = certNumberResult.rows[0];

      const conflictCheck = await client.query(
        `
        SELECT COUNT(*) 
        FROM user_certificates
        WHERE 
          status = 2
          AND user_certificate_id != $1
          AND (
            certificate_number = $2
            OR original_number = $2
            OR certificate_number = $3
            OR original_number = $3
          )
      `,
        [
          user_certificate_id,
          certificate_number,
          original_number || certificate_number,
        ]
      );

      if (parseInt(conflictCheck.rows[0].count) > 0) {
        await client.query("ROLLBACK");
        return sendErrorResponse(
          res,
          "Another certificate with this number has already been validated."
        );
      }
    }

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
      await client.query("ROLLBACK");
      return sendErrorResponse(res, "Certificate not found");
    }

    await client.query("COMMIT");

    return sendSuccessResponse(
      res,
      "Certificate status updated successfully",
      result.rows[0]
    );
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Update certificate status error:", err);
    return sendErrorResponse(
      res,
      "Failed to update certificate status",
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
    }));

    return sendSuccessResponse(res, "Search results", results);
  } catch (err) {
    console.error("Search certificate error:", err);
    return sendErrorResponse(res, "Search certificates", err.message);
  } finally {
    client.release();
  }
};
