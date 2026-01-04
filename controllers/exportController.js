//efortech_backend\controllers\exportController.js
const db = require("../config/db");
const ExcelJS = require("exceljs");
const { sendBadRequestResponse } = require("../utils/responseUtils");

// Convert a Date object to 'YYYY-MM-DD HH:mm:ss' format in WIB (GMT+7)
function formatDateToWIB(date) {
  if (!date) return null;
  const d = new Date(date);
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const wib = new Date(utc + 7 * 60 * 60 * 1000); // Add 7 hours offset

  const pad = (n) => n.toString().padStart(2, "0");
  return `${wib.getFullYear()}-${pad(wib.getMonth() + 1)}-${pad(
    wib.getDate()
  )} ${pad(wib.getHours())}:${pad(wib.getMinutes())}:${pad(wib.getSeconds())}`;
}

// Generate timestamp string 'YYMMDDHHMMSS' in WIB (GMT+7), Used for unique export filenames
function generateTimestampWIB() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const wib = new Date(utc + 7 * 60 * 60 * 1000);

  const pad = (n) => n.toString().padStart(2, "0");
  const yy = wib.getFullYear().toString().slice(-2);
  const MM = pad(wib.getMonth() + 1);
  const dd = pad(wib.getDate());
  const HH = pad(wib.getHours());
  const mm = pad(wib.getMinutes());
  const ss = pad(wib.getSeconds());

  return `${yy}${MM}${dd}${HH}${mm}${ss}`;
}

// Export user data to an Excel file
exports.exportUsers = async (req, res) => {
  const { start, end, roles, role } = req.query;
  const client = await db.connect();

  try {
    // Build dynamic SQL query based on provided filters
    let query = `
      SELECT 
        u.user_id,
        u.fullname,
        u.email,
        u.phone_number,
        u.institution,
        u.role,
        CASE 
          WHEN u.role = 1 THEN 'Teacher / Lecturer'
          WHEN u.role = 2 THEN 'Student'
          WHEN u.role = 3 THEN 'University Student'
          WHEN u.role = 4 THEN 'Professional'
          WHEN u.role = 5 THEN 'Others'
          ELSE ' '
        END AS role_name,
        u.position,
        CASE 
          WHEN u.gender = 1 THEN 'Male'
          WHEN u.gender = 2 THEN 'Female'
          ELSE NULL
        END AS gender,
        u.birthdate,
        u.role_id,
        CASE 
          WHEN u.role_id = 'role1' THEN 'User'
          WHEN u.role_id = 'role2' THEN 'Admin'
          WHEN u.role_id = 'role3' THEN 'Superadmin'
          ELSE u.role_id
        END AS roles_name,
        u.created_at AS user_created_at,
        a.created_date AS admin_created_date,
        a.last_updated AS admin_last_updated,
        a.status AS admin_status
      FROM users u
      LEFT JOIN admin a ON u.user_id = a.admin_id
      WHERE 1=1
    `;

    const values = [];
    let index = 1;

    // Apply date range filter
    if (start && end) {
      query += ` AND u.created_at BETWEEN $${index} AND $${index + 1}`;
      values.push(start, end);
      index += 2;
    } else if (start) {
      query += ` AND u.created_at >= $${index}`;
      values.push(start);
      index += 1;
    } else if (end) {
      query += ` AND u.created_at <= $${index}`;
      values.push(end);
      index += 1;
    }

    // Apply role_id filter (role1, role2, …)
    if (roles && roles.length > 0) {
      const roleIdArray = roles.split(",").map((r) => r.trim());
      const placeholders = roleIdArray
        .map((_, i) => `$${index + i}`)
        .join(", ");
      query += ` AND u.role_id IN (${placeholders})`;
      values.push(...roleIdArray);
      index += roleIdArray.length;
    }

    // Apply users.role filter (integer + optional "others")
    if (role && role.length > 0) {
      const roleArray = role.split(",").map((r) => r.trim());

      const numericRoles = roleArray
        .filter((r) => !isNaN(r))
        .map((r) => parseInt(r, 10));

      const conditions = [];

      if (numericRoles.length > 0) {
        const placeholders = numericRoles
          .map((_, i) => `$${index + i}`)
          .join(", ");
        conditions.push(`u.role IN (${placeholders})`);
        values.push(...numericRoles);
        index += numericRoles.length;
      }

      // Ambil “others” = nilai selain 1–5 atau NULL
      const hasOthers = roleArray.includes("others"); // frontend bisa kirim "others" untuk nilai lain
      if (hasOthers) {
        conditions.push(`(u.role NOT IN (1,2,3,4,5) OR u.role IS NULL)`);
      }

      if (conditions.length > 0) {
        query += ` AND (${conditions.join(" OR ")})`;
      }
    }

    query += ` ORDER BY u.created_at DESC`;

    const result = await client.query(query, values);
    if (result.rows.length === 0) {
      return sendBadRequestResponse(res, "No user data found for export.");
    }

    // Format all date fields to WIB format for consistency
    const formattedRows = result.rows.map((row) => ({
      ...row,
      user_created_at: formatDateToWIB(row.user_created_at),
      admin_created_date: formatDateToWIB(row.admin_created_date),
      admin_last_updated: formatDateToWIB(row.admin_last_updated),
    }));

    // Initialize Excel workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("User Data");

    // Define worksheet column headers and mapping keys
    worksheet.columns = [
      { header: "User ID", key: "user_id", width: 25 },
      { header: "Full Name", key: "fullname", width: 25 },
      { header: "Email", key: "email", width: 30 },
      { header: "Phone Number", key: "phone_number", width: 18 },
      { header: "Institution", key: "institution", width: 25 },
      { header: "Role", key: "role_name", width: 25 },
      { header: "Position", key: "position", width: 50 },
      { header: "Gender", key: "gender", width: 10 },
      { header: "Birthdate", key: "birthdate", width: 15 },
      { header: "Role ID", key: "role_id", width: 15 },
      { header: "Role Name", key: "roles_name", width: 15 },
      { header: "User Created At", key: "user_created_at", width: 20 },
      { header: "Admin Created Date", key: "admin_created_date", width: 20 },
      { header: "Admin Last Updated", key: "admin_last_updated", width: 20 },
      { header: "Admin Status", key: "admin_status", width: 15 },
    ];

    worksheet.addRows(formattedRows);

    // Apply basic styling and borders to all cells
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    worksheet.eachRow((row) => {
      worksheet.columns.forEach((_, colIndex) => {
        const cell = row.getCell(colIndex + 1);
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
      row.height = 20;
    });

    // Generate Excel buffer and prepare file download response
    const buffer = await workbook.xlsx.writeBuffer();
    const timestamp = generateTimestampWIB();
    const filename = `users_export_${timestamp}.xlsx`;

    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({
      message: "Failed to export user data",
      error: err.message,
    });
  } finally {
    client.release();
  }
};

// Export Registration Training (Need to Process)
exports.exportRegistrationsNeedProcess = async (req, res) => {
  const {
    start,
    end,
    dateType = "registration_date", // registration_date / training_date
    statuses,
    training_id,
  } = req.query;

  const client = await db.connect();
  try {
    // Validate dateType
    if (!["registration_date", "training_date"].includes(dateType)) {
      return sendBadRequestResponse(res, "Invalid date type filter.");
    }

    // Build parameter array
    const values = [];
    const statusArray = statuses
      ? statuses.split(",").map((s) => parseInt(s.trim()))
      : [1, 2, 3];

    const placeholders = statusArray.map((_, i) => `$${i + 1}`).join(", ");

    // Base query
    let query = `
      SELECT 
        r.registration_id,
        r.registrant_id,
        u.fullname AS registrant_name,
        u.phone_number,
        u.email,
        r.training_id,
        t.training_name,
        r.registration_date,
        r.training_date,
        r.total_payment,
        r.status,
        r.participant_count,
        r.payment_proof
      FROM registration r
      JOIN users u ON r.registrant_id = u.user_id
      JOIN training t ON r.training_id = t.training_id
      WHERE r.status IN (${placeholders})
    `;

    values.push(...statusArray);
    let index = statusArray.length + 1;

    // Filter by date
    if (start && end) {
      query += ` AND r.${dateType} BETWEEN $${index} AND $${index + 1}`;
      values.push(start, end);
      index += 2;
    }

    // Filter by training_id
    if (training_id) {
      query += ` AND r.training_id = $${index}`;
      values.push(training_id);
      index++;
    }

    // Sort by date
    query += ` ORDER BY r.${dateType} DESC`;

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
      return sendBadRequestResponse(
        res,
        "No registration data found for export."
      );
    }

    // Format date & translate status
    const formattedRows = result.rows.map((row) => ({
      ...row,
      registration_date: formatDateToWIB(row.registration_date),
      training_date: formatDateToWIB(row.training_date),
      status:
        row.status === 1
          ? "Pending"
          : row.status === 2
          ? "Waiting For Payment"
          : row.status === 3
          ? "Validated"
          : "Unknown",
    }));

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Need Process Registrations");

    worksheet.columns = [
      { header: "Registration ID", key: "registration_id", width: 25 },
      { header: "Registrant Name", key: "registrant_name", width: 25 },
      { header: "Phone Number", key: "phone_number", width: 18 },
      { header: "Email", key: "email", width: 28 },
      { header: "Training ID", key: "training_id", width: 22 },
      { header: "Training Name", key: "training_name", width: 30 },
      { header: "Registration Date", key: "registration_date", width: 22 },
      { header: "Training Date", key: "training_date", width: 22 },
      { header: "Total Payment", key: "total_payment", width: 18 },
      { header: "Status", key: "status", width: 20 },
      { header: "Participant Count", key: "participant_count", width: 20 },
      { header: "Payment Proof", key: "payment_proof", width: 30 },
    ];

    worksheet.addRows(formattedRows);

    // Style header & border
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    worksheet.eachRow((row) => {
      worksheet.columns.forEach((_, colIndex) => {
        const cell = row.getCell(colIndex + 1);
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
      row.height = 20;
    });

    // Send Excel file
    const buffer = await workbook.xlsx.writeBuffer();
    const timestamp = generateTimestampWIB();
    const filename = `registraining_export_needprocess_${timestamp}.xlsx`;

    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error("Error exporting registrations (need process):", err);
    res.status(500).json({
      message: "Failed to export registration data (need process)",
      error: err.message,
    });
  } finally {
    client.release();
  }
};

// Export Registration Training (On Progress)
exports.exportRegistrationsOnProgress = async (req, res) => {
  const {
    start,
    end,
    dateType = "registration_date", // registration_date / training_date / completed_date
    attendance_status,
    training_id,
    has_review,
    has_advantech_cert,
  } = req.query;

  const client = await db.connect();
  try {
    // Validate dateType
    if (
      !["registration_date", "training_date", "completed_date"].includes(
        dateType
      )
    ) {
      return sendBadRequestResponse(res, "Invalid date type filter.");
    }

    // Base query
    let query = `
      SELECT 
        r.registration_id,
        r.registration_date,
        r.training_date,
        r.completed_date,
        rp.registration_participant_id,
        rp.attendance_status,
        CASE
          WHEN rp.attendance_status IS NULL THEN 'Not Marked'
          WHEN rp.attendance_status = true THEN 'Present'
          WHEN rp.attendance_status = false THEN 'Absent'
          ELSE NULL
        END AS attendance_label,
        rp.has_certificate,
        rp.advantech_cert,
        u.user_id,
        u.fullname AS participant_name,
        u.phone_number,
        u.email,
        u.institution,
        t.training_id,
        t.training_name,
        t.training_fees,
        c.certificate_id,
        c.certificate_number,
        c.cert_file,
        c.issued_date,
        c.expired_date,
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM review rv 
            WHERE rv.registration_participant_id = rp.registration_participant_id
          ) THEN TRUE
          ELSE FALSE
        END AS has_review
      FROM registration_participant rp
      JOIN registration r ON rp.registration_id = r.registration_id
      JOIN users u ON rp.user_id = u.user_id
      JOIN training t ON r.training_id = t.training_id
      LEFT JOIN certificate c ON rp.registration_participant_id = c.registration_participant_id
      WHERE r.status = 4
        AND (rp.attendance_status IS NULL OR rp.attendance_status = true)
        AND rp.has_certificate = false
    `;

    // Parameters
    const values = [];
    let index = 1;

    // Filter attendance_status
    if (attendance_status) {
      const statusArray = attendance_status
        .split(",")
        .map((s) => (s === "null" ? null : s === "true"));
      const conditions = statusArray
        .map((_, i) =>
          statusArray[i] === null
            ? `rp.attendance_status IS NULL`
            : `rp.attendance_status = $${index++}`
        )
        .join(" OR ");
      query += ` AND (${conditions})`;
      values.push(...statusArray.filter((s) => s !== null));
    }

    // Filter tanggal (registration_date / training_date / completed_date)
    if (start && end) {
      query += ` AND r.${dateType} BETWEEN $${index} AND $${index + 1}`;
      values.push(start, end);
      index += 2;
    }

    // Filter training
    if (training_id) {
      query += ` AND r.training_id = $${index}`;
      values.push(training_id);
      index++;
    }

    // Filter has_review (true / false)
    if (has_review === "true" || has_review === "false") {
      query += ` AND (
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM review rv 
            WHERE rv.registration_participant_id = rp.registration_participant_id
          ) THEN TRUE ELSE FALSE END
      ) = $${index}`;
      values.push(has_review === "true");
      index++;
    }

    // Filter has_advantech_cert (true: ada, false: null)
    if (has_advantech_cert === "true" || has_advantech_cert === "false") {
      if (has_advantech_cert === "true") {
        query += ` AND rp.advantech_cert IS NOT NULL`;
      } else {
        query += ` AND rp.advantech_cert IS NULL`;
      }
    }

    // Sort
    query += ` ORDER BY r.${dateType} DESC`;

    const result = await client.query(query, values);
    if (result.rows.length === 0) {
      return sendBadRequestResponse(
        res,
        "No on-progress registration data found for export."
      );
    }

    // Format tanggal ke WIB
    const formattedRows = result.rows.map((row) => ({
      ...row,
      registration_date: formatDateToWIB(row.registration_date),
      training_date: formatDateToWIB(row.training_date),
      completed_date: formatDateToWIB(row.completed_date),
      issued_date: formatDateToWIB(row.issued_date),
      expired_date: formatDateToWIB(row.expired_date),
      has_review: row.has_review ? "TRUE" : "FALSE",
    }));

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("On Progress Registrations");

    worksheet.columns = [
      { header: "Registration ID", key: "registration_id", width: 25 },
      { header: "Registration Date", key: "registration_date", width: 22 },
      { header: "Training Date", key: "training_date", width: 22 },
      { header: "Completed Date", key: "completed_date", width: 22 },
      {
        header: "Participant ID",
        key: "registration_participant_id",
        width: 25,
      },
      { header: "Participant Name", key: "participant_name", width: 25 },
      { header: "Phone Number", key: "phone_number", width: 18 },
      { header: "Email", key: "email", width: 28 },
      { header: "Institution", key: "institution", width: 40 },
      { header: "Attendance Status", key: "attendance_label", width: 18 },
      { header: "Has Certificate", key: "has_certificate", width: 18 },
      { header: "Advantech Cert", key: "advantech_cert", width: 25 },
      { header: "Has Review", key: "has_review", width: 18 },
      { header: "Training ID", key: "training_id", width: 22 },
      { header: "Training Name", key: "training_name", width: 30 },
      { header: "Training Fees", key: "training_fees", width: 18 },
      { header: "Certificate ID", key: "certificate_id", width: 25 },
      { header: "Certificate Number", key: "certificate_number", width: 25 },
      { header: "Certificate File", key: "cert_file", width: 35 },
      { header: "Issued Date", key: "issued_date", width: 22 },
      { header: "Expired Date", key: "expired_date", width: 22 },
    ];

    worksheet.addRows(formattedRows);

    // Style header
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    worksheet.eachRow((row) => {
      worksheet.columns.forEach((_, colIndex) => {
        const cell = row.getCell(colIndex + 1);
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
      row.height = 20;
    });

    // Generate Excel file
    const buffer = await workbook.xlsx.writeBuffer();
    const timestamp = generateTimestampWIB();
    const filename = `registraining_export_onprogress_${timestamp}.xlsx`;

    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error("Error exporting registrations (on progress):", err);
    res.status(500).json({
      message: "Failed to export registration data (on progress)",
      error: err.message,
    });
  } finally {
    client.release();
  }
};

// Export Registration Training (Completed)
exports.exportRegistrationsCompleted = async (req, res) => {
  const {
    start,
    end,
    dateType = "registration_date", // registration_date / training_date / completed_date
    attendance_status,
    training_id,
    has_review,
    has_advantech_cert,
  } = req.query;

  const client = await db.connect();
  try {
    // Validate dateType
    if (
      !["registration_date", "training_date", "completed_date"].includes(
        dateType
      )
    ) {
      return sendBadRequestResponse(res, "Invalid date type filter.");
    }

    // Base query
    let query = `
      SELECT 
        r.registration_id,
        r.registration_date,
        r.training_date,
        r.completed_date,
        rp.registration_participant_id,
        rp.attendance_status,
        CASE
          WHEN rp.attendance_status = true THEN 'Present'
          WHEN rp.attendance_status = false THEN 'Absent'
          ELSE NULL
        END AS attendance_label,
        rp.has_certificate,
        rp.advantech_cert,
        u.user_id,
        u.fullname AS participant_name,
        u.phone_number,
        u.email,
        u.institution,
        t.training_id,
        t.training_name,
        t.training_fees,
        c.certificate_id,
        c.certificate_number,
        c.cert_file,
        c.issued_date,
        c.expired_date,
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM review rv 
            WHERE rv.registration_participant_id = rp.registration_participant_id
          ) THEN TRUE
          ELSE FALSE
        END AS has_review
      FROM registration_participant rp
      JOIN registration r ON rp.registration_id = r.registration_id
      JOIN users u ON rp.user_id = u.user_id
      JOIN training t ON r.training_id = t.training_id
      LEFT JOIN certificate c ON rp.registration_participant_id = c.registration_participant_id
      WHERE r.status = 4
        AND ((rp.attendance_status IS TRUE AND rp.has_certificate = true) OR rp.attendance_status = false)
    `;

    // Parameters
    const values = [];
    let index = 1;

    // Filter attendance_status (present/absent only)
    if (attendance_status) {
      const statusArray = attendance_status.split(",").map((s) => s === "true"); // hanya true/false
      const conditions = statusArray
        .map((_, i) => `rp.attendance_status = $${index++}`)
        .join(" OR ");
      query += ` AND (${conditions})`;
      values.push(...statusArray);
    }

    // Filter tanggal (registration_date / training_date / completed_date)
    if (start && end) {
      query += ` AND r.${dateType} BETWEEN $${index} AND $${index + 1}`;
      values.push(start, end);
      index += 2;
    }

    // Filter training
    if (training_id) {
      query += ` AND r.training_id = $${index}`;
      values.push(training_id);
      index++;
    }

    // Filter has_review (true / false)
    if (has_review === "true" || has_review === "false") {
      query += ` AND (
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM review rv 
            WHERE rv.registration_participant_id = rp.registration_participant_id
          ) THEN TRUE ELSE FALSE END
      ) = $${index}`;
      values.push(has_review === "true");
      index++;
    }

    // Filter has_advantech_cert (true: ada, false: null)
    if (has_advantech_cert === "true" || has_advantech_cert === "false") {
      if (has_advantech_cert === "true") {
        query += ` AND rp.advantech_cert IS NOT NULL`;
      } else {
        query += ` AND rp.advantech_cert IS NULL`;
      }
    }

    // Sort
    query += ` ORDER BY r.${dateType} DESC`;

    const result = await client.query(query, values);
    if (result.rows.length === 0) {
      return sendBadRequestResponse(
        res,
        "No completed registration data found for export."
      );
    }

    // Format tanggal ke WIB
    const formattedRows = result.rows.map((row) => ({
      ...row,
      registration_date: formatDateToWIB(row.registration_date),
      training_date: formatDateToWIB(row.training_date),
      completed_date: formatDateToWIB(row.completed_date),
      issued_date: formatDateToWIB(row.issued_date),
      expired_date: formatDateToWIB(row.expired_date),
      has_review: row.has_review ? "TRUE" : "FALSE",
    }));

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Completed Registrations");

    worksheet.columns = [
      { header: "Registration ID", key: "registration_id", width: 25 },
      { header: "Registration Date", key: "registration_date", width: 22 },
      { header: "Training Date", key: "training_date", width: 22 },
      { header: "Completed Date", key: "completed_date", width: 22 },
      {
        header: "Participant ID",
        key: "registration_participant_id",
        width: 25,
      },
      { header: "Participant Name", key: "participant_name", width: 25 },
      { header: "Phone Number", key: "phone_number", width: 18 },
      { header: "Email", key: "email", width: 28 },
      { header: "Institution", key: "institution", width: 40 },
      { header: "Attendance Status", key: "attendance_label", width: 18 },
      { header: "Has Certificate", key: "has_certificate", width: 18 },
      { header: "Advantech Cert", key: "advantech_cert", width: 25 },
      { header: "Has Review", key: "has_review", width: 18 },
      { header: "Training ID", key: "training_id", width: 22 },
      { header: "Training Name", key: "training_name", width: 30 },
      { header: "Training Fees", key: "training_fees", width: 18 },
      { header: "Certificate ID", key: "certificate_id", width: 25 },
      { header: "Certificate Number", key: "certificate_number", width: 25 },
      { header: "Certificate File", key: "cert_file", width: 35 },
      { header: "Issued Date", key: "issued_date", width: 22 },
      { header: "Expired Date", key: "expired_date", width: 22 },
    ];

    worksheet.addRows(formattedRows);

    // Style header
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    worksheet.eachRow((row) => {
      worksheet.columns.forEach((_, colIndex) => {
        const cell = row.getCell(colIndex + 1);
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
      row.height = 20;
    });

    // Generate Excel file
    const buffer = await workbook.xlsx.writeBuffer();
    const timestamp = generateTimestampWIB();
    const filename = `registraining_export_completed_${timestamp}.xlsx`;

    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error("Error exporting registrations (completed):", err);
    res.status(500).json({
      message: "Failed to export registration data (completed)",
      error: err.message,
    });
  } finally {
    client.release();
  }
};

// Export Registration Training (Cancelled)
exports.exportRegistrationsCancelled = async (req, res) => {
  const {
    start,
    end,
    dateType = "registration_date", // registration_date / training_date
    training_id,
  } = req.query;

  const client = await db.connect();
  try {
    // Validate dateType
    if (!["registration_date", "training_date"].includes(dateType)) {
      return sendBadRequestResponse(res, "Invalid date type filter.");
    }

    // Build base query (status fixed = 5)
    const values = [5];
    let index = 2;

    let query = `
      SELECT 
        r.registration_id,
        r.registrant_id,
        u.fullname AS registrant_name,
        u.phone_number,
        u.email,
        r.training_id,
        t.training_name,
        r.registration_date,
        r.training_date,
        r.total_payment,
        r.status,
        r.participant_count,
        r.payment_proof
      FROM registration r
      JOIN users u ON r.registrant_id = u.user_id
      JOIN training t ON r.training_id = t.training_id
      WHERE r.status = $1
    `;

    // Filter by date
    if (start && end) {
      query += ` AND r.${dateType} BETWEEN $${index} AND $${index + 1}`;
      values.push(start, end);
      index += 2;
    }

    // Filter by training_id
    if (training_id) {
      query += ` AND r.training_id = $${index}`;
      values.push(training_id);
      index++;
    }

    // Sort by date
    query += ` ORDER BY r.${dateType} DESC`;

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
      return sendBadRequestResponse(
        res,
        "No cancelled registration data found for export."
      );
    }

    // Format date & set status label
    const formattedRows = result.rows.map((row) => ({
      ...row,
      registration_date: formatDateToWIB(row.registration_date),
      training_date: formatDateToWIB(row.training_date),
      status: "Cancelled",
    }));

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Cancelled Registrations");

    worksheet.columns = [
      { header: "Registration ID", key: "registration_id", width: 25 },
      { header: "Registrant Name", key: "registrant_name", width: 25 },
      { header: "Phone Number", key: "phone_number", width: 18 },
      { header: "Email", key: "email", width: 28 },
      { header: "Training ID", key: "training_id", width: 22 },
      { header: "Training Name", key: "training_name", width: 30 },
      { header: "Registration Date", key: "registration_date", width: 22 },
      { header: "Training Date", key: "training_date", width: 22 },
      { header: "Total Payment", key: "total_payment", width: 18 },
      { header: "Status", key: "status", width: 20 },
      { header: "Participant Count", key: "participant_count", width: 20 },
      { header: "Payment Proof", key: "payment_proof", width: 30 },
    ];

    worksheet.addRows(formattedRows);

    // Style header & border
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    worksheet.eachRow((row) => {
      worksheet.columns.forEach((_, colIndex) => {
        const cell = row.getCell(colIndex + 1);
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
      row.height = 20;
    });

    // Send Excel file
    const buffer = await workbook.xlsx.writeBuffer();
    const timestamp = generateTimestampWIB();
    const filename = `registraining_export_cancelled_${timestamp}.xlsx`;

    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error("Error exporting registrations (cancelled):", err);
    res.status(500).json({
      message: "Failed to export registration data (cancelled)",
      error: err.message,
    });
  } finally {
    client.release();
  }
};

// Export Registration Training Certificate
exports.exportTrainingCertificates = async (req, res) => {
  const {
    start,
    end,
    dateType = "issued_date", // issued_date / expired_date / training_date / completed_date / registration_date
    training_id,
    certificate_status, // valid / expired
  } = req.query;
  const client = await db.connect();
  try {
    // Validate dateType
    const validDateTypes = [
      "issued_date",
      "expired_date",
      "training_date",
      "completed_date",
      "registration_date",
    ];
    if (!validDateTypes.includes(dateType)) {
      return sendBadRequestResponse(res, "Invalid date type filter.");
    }
    // Base query with all required joins
    let query = `
      SELECT 
        c.certificate_id,
        c.certificate_number,
        c.issued_date,
        c.expired_date,
        c.cert_file,
        CASE 
          WHEN c.expired_date IS NULL THEN 'Valid'
          WHEN c.expired_date < CURRENT_DATE THEN 'Expired'
          ELSE 'Valid'
        END AS certificate_status,
        r.registration_id,
        r.registration_date,
        r.training_date,
        r.completed_date,
        rp.registration_participant_id,
        rp.advantech_cert,
        u.user_id,
        u.fullname,
        u.email,
        u.phone_number,
        u.institution,
        u.position,
        t.training_id,
        t.training_name
      FROM certificate c
      JOIN registration_participant rp ON c.registration_participant_id = rp.registration_participant_id
      JOIN registration r ON rp.registration_id = r.registration_id
      JOIN users u ON rp.user_id = u.user_id
      JOIN training t ON r.training_id = t.training_id
      WHERE 1=1
    `;
    const values = [];
    let index = 1;

    // Determine which column to filter based on dateType
    let dateColumn;
    let isDateOnly = false; // untuk kolom dengan tipe date (bukan timestamp)

    if (dateType === "issued_date" || dateType === "expired_date") {
      dateColumn = `c.${dateType}`;
      isDateOnly = true;
    } else if (dateType === "training_date") {
      dateColumn = "r.training_date";
      isDateOnly = true;
    } else if (dateType === "registration_date") {
      dateColumn = "r.registration_date";
      isDateOnly = false; // timestamp
    } else if (dateType === "completed_date") {
      dateColumn = "r.completed_date";
      isDateOnly = false; // timestamp
    }

    // Filter by date range based on selected dateType
    if (start && end) {
      if (isDateOnly) {
        // For date columns
        query += ` AND ${dateColumn} BETWEEN $${index}::date AND $${
          index + 1
        }::date`;
      } else {
        // For timestamp columns - end date includes full day (23:59:59)
        query += ` AND ${dateColumn} BETWEEN $${index}::timestamp AND $${
          index + 1
        }::timestamp + INTERVAL '23 hours 59 minutes 59 seconds'`;
      }
      values.push(start, end);
      index += 2;
    } else if (start) {
      // Only start date provided
      if (isDateOnly) {
        query += ` AND ${dateColumn} >= $${index}::date`;
      } else {
        query += ` AND ${dateColumn} >= $${index}::timestamp`;
      }
      values.push(start);
      index += 1;
    } else if (end) {
      // Only end date provided
      if (isDateOnly) {
        query += ` AND ${dateColumn} <= $${index}::date`;
      } else {
        query += ` AND ${dateColumn} <= $${index}::timestamp + INTERVAL '23 hours 59 minutes 59 seconds'`;
      }
      values.push(end);
      index += 1;
    }

    // Filter by training_id
    if (training_id) {
      query += ` AND r.training_id = $${index}`;
      values.push(training_id);
      index++;
    }

    // Filter by certificate status (valid / expired)
    if (certificate_status) {
      if (certificate_status.toLowerCase() === "expired") {
        query += ` AND c.expired_date IS NOT NULL AND c.expired_date < CURRENT_DATE`;
      } else if (certificate_status.toLowerCase() === "valid") {
        query += ` AND (c.expired_date IS NULL OR c.expired_date >= CURRENT_DATE)`;
      }
    }

    // Sort by the selected date type
    query += ` ORDER BY ${dateColumn} DESC`;

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
      return sendBadRequestResponse(
        res,
        "No training certificate data found for export."
      );
    }

    // Format all date fields to WIB format
    const formattedRows = result.rows.map((row) => ({
      ...row,
      issued_date: row.issued_date,
      expired_date: row.expired_date,
      registration_date: formatDateToWIB(row.registration_date),
      training_date: row.training_date,
      completed_date: formatDateToWIB(row.completed_date),
    }));

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Training Certificates");

    // Define columns in logical order
    worksheet.columns = [
      { header: "Certificate ID", key: "certificate_id", width: 25 },
      { header: "Certificate Number", key: "certificate_number", width: 30 },
      { header: "Certificate Status", key: "certificate_status", width: 18 },
      { header: "Issued Date", key: "issued_date", width: 15 },
      { header: "Expired Date", key: "expired_date", width: 15 },
      { header: "Certificate File", key: "cert_file", width: 35 },
      { header: "Advantech Certificate", key: "advantech_cert", width: 35 },
      { header: "Registration ID", key: "registration_id", width: 25 },
      { header: "Registration Date", key: "registration_date", width: 22 },
      { header: "Training Date", key: "training_date", width: 15 },
      { header: "Completed Date", key: "completed_date", width: 22 },
      {
        header: "Participant ID",
        key: "registration_participant_id",
        width: 25,
      },
      { header: "User ID", key: "user_id", width: 25 },
      { header: "Full Name", key: "fullname", width: 25 },
      { header: "Email", key: "email", width: 30 },
      { header: "Phone Number", key: "phone_number", width: 18 },
      { header: "Institution", key: "institution", width: 40 },
      { header: "Position", key: "position", width: 30 },
      { header: "Training ID", key: "training_id", width: 22 },
      { header: "Training Name", key: "training_name", width: 35 },
    ];

    worksheet.addRows(formattedRows);

    // Apply styling to header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    // Apply borders to all cells
    worksheet.eachRow((row) => {
      worksheet.columns.forEach((_, colIndex) => {
        const cell = row.getCell(colIndex + 1);
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
      row.height = 20;
    });

    // Generate Excel buffer and send response
    const buffer = await workbook.xlsx.writeBuffer();
    const timestamp = generateTimestampWIB();
    const filename = `training_certificates_export_${timestamp}.xlsx`;

    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error("Error exporting training certificates:", err);
    res.status(500).json({
      message: "Failed to export training certificate data",
      error: err.message,
    });
  } finally {
    client.release();
  }
};

// Export User Upload Certificates
exports.exportUserCertificates = async (req, res) => {
  const {
    start,
    end,
    dateType = "issued_date", // issued_date / expired_date / created_at / verification_date
    certificate_status, // valid / expired
    status, // 1=pending, 2=accepted, 3=rejected
  } = req.query;

  const client = await db.connect();
  try {
    // Validate dateType
    const validDateTypes = [
      "issued_date",
      "expired_date",
      "created_at",
      "verification_date",
    ];
    if (!validDateTypes.includes(dateType)) {
      return sendBadRequestResponse(res, "Invalid date type filter.");
    }

    // Base query with all required joins
    let query = `
      SELECT 
        uc.user_certificate_id,
        uc.fullname AS certificate_fullname,
        uc.cert_type,
        uc.issuer,
        uc.issued_date,
        uc.expired_date,
        uc.certificate_number,
        uc.original_number,
        uc.cert_file,
        uc.status,
        CASE 
          WHEN uc.status = 1 THEN 'Pending'
          WHEN uc.status = 2 THEN 'Accepted'
          WHEN uc.status = 3 THEN 'Rejected'
          ELSE 'Unknown'
        END AS status_label,
        uc.verified_by,
        uc.verification_date,
        uc.created_at,
        uc.notes,
        CASE 
          WHEN uc.expired_date IS NULL THEN 'Valid'
          WHEN uc.expired_date < CURRENT_DATE THEN 'Expired'
          ELSE 'Valid'
        END AS certificate_status,
        u.user_id,
        u.fullname AS user_fullname,
        u.email,
        u.phone_number,
        u.institution,
        u.position
      FROM user_certificates uc
      LEFT JOIN users u ON uc.user_id = u.user_id
      WHERE 1=1
    `;

    const values = [];
    let index = 1;

    // Determine which column to filter based on dateType
    let dateColumn;
    let isDateOnly = false; // for date type columns (not timestamp)

    if (dateType === "issued_date" || dateType === "expired_date") {
      dateColumn = `uc.${dateType}`;
      isDateOnly = true;
    } else if (dateType === "created_at" || dateType === "verification_date") {
      dateColumn = `uc.${dateType}`;
      isDateOnly = false; // timestamp
    }

    // Filter by date range based on selected dateType
    if (start && end) {
      if (isDateOnly) {
        query += ` AND ${dateColumn} BETWEEN $${index}::date AND $${
          index + 1
        }::date`;
      } else {
        query += ` AND ${dateColumn} BETWEEN $${index}::timestamp AND $${
          index + 1
        }::timestamp + INTERVAL '23 hours 59 minutes 59 seconds'`;
      }
      values.push(start, end);
      index += 2;
    } else if (start) {
      if (isDateOnly) {
        query += ` AND ${dateColumn} >= $${index}::date`;
      } else {
        query += ` AND ${dateColumn} >= $${index}::timestamp`;
      }
      values.push(start);
      index += 1;
    } else if (end) {
      if (isDateOnly) {
        query += ` AND ${dateColumn} <= $${index}::date`;
      } else {
        query += ` AND ${dateColumn} <= $${index}::timestamp + INTERVAL '23 hours 59 minutes 59 seconds'`;
      }
      values.push(end);
      index += 1;
    }

    // Filter by certificate validity status (valid / expired)
    if (certificate_status) {
      if (certificate_status.toLowerCase() === "expired") {
        query += ` AND uc.expired_date IS NOT NULL AND uc.expired_date < CURRENT_DATE`;
      } else if (certificate_status.toLowerCase() === "valid") {
        query += ` AND (uc.expired_date IS NULL OR uc.expired_date >= CURRENT_DATE)`;
      }
    }

    // Filter by status (1=pending, 2=accepted, 3=rejected)
    if (status) {
      const statusArray = status.split(",").map((s) => parseInt(s.trim()));
      const placeholders = statusArray
        .map((_, i) => `$${index + i}`)
        .join(", ");
      query += ` AND uc.status IN (${placeholders})`;
      values.push(...statusArray);
      index += statusArray.length;
    }

    // Sort by the selected date type
    query += ` ORDER BY ${dateColumn} DESC`;

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
      return sendBadRequestResponse(
        res,
        "No user certificate data found for export."
      );
    }

    // Format all date fields to WIB format
    const formattedRows = result.rows.map((row) => ({
      ...row,
      issued_date: row.issued_date,
      expired_date: row.expired_date,
      verification_date: formatDateToWIB(row.verification_date),
      created_at: formatDateToWIB(row.created_at),
    }));

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("User Certificates");

    // Define columns in logical order
    worksheet.columns = [
      { header: "User Certificate ID", key: "user_certificate_id", width: 30 },
      { header: "Certificate Status", key: "certificate_status", width: 18 },
      { header: "Certificate Number", key: "certificate_number", width: 30 },
      { header: "Issued Date", key: "issued_date", width: 15 },
      { header: "Expired Date", key: "expired_date", width: 15 },
      {
        header: "Certificate Fullname",
        key: "certificate_fullname",
        width: 30,
      },
      { header: "Certificate Type", key: "cert_type", width: 25 },
      { header: "Issuer", key: "issuer", width: 30 },
      { header: "Certificate File", key: "cert_file", width: 35 },
      { header: "Status", key: "status", width: 12 },
      { header: "Status Label", key: "status_label", width: 15 },
      { header: "Verified By", key: "verified_by", width: 25 },
      { header: "Verification Date", key: "verification_date", width: 22 },
      {
        header: "Original Certificate Number",
        key: "original_number",
        width: 30,
      },
      { header: "Created At", key: "created_at", width: 22 },
      { header: "Notes", key: "notes", width: 40 },
      { header: "User ID", key: "user_id", width: 25 },
      { header: "User Fullname", key: "user_fullname", width: 30 },
      { header: "Email", key: "email", width: 30 },
      { header: "Phone Number", key: "phone_number", width: 18 },
      { header: "Institution", key: "institution", width: 40 },
      { header: "Position", key: "position", width: 30 },
    ];

    worksheet.addRows(formattedRows);

    // Apply styling to header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    // Apply borders to all cells
    worksheet.eachRow((row) => {
      worksheet.columns.forEach((_, colIndex) => {
        const cell = row.getCell(colIndex + 1);
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
      row.height = 20;
    });

    // Generate Excel buffer and send response
    const buffer = await workbook.xlsx.writeBuffer();
    const timestamp = generateTimestampWIB();
    const filename = `user_certificates_export_${timestamp}.xlsx`;

    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error("Error exporting user certificates:", err);
    res.status(500).json({
      message: "Failed to export user certificate data",
      error: err.message,
    });
  } finally {
    client.release();
  }
};

// Export All Certificates (Training + User Upload)
exports.exportAllCertificates = async (req, res) => {
  const {
    start,
    end,
    dateType = "issued_date", // issued_date / expired_date
    certificate_status, // valid / expired
    type, // 1=training, 2=user_upload (optional, if empty = all)
  } = req.query;

  const client = await db.connect();
  try {
    // Validate dateType
    const validDateTypes = ["issued_date", "expired_date"];
    if (!validDateTypes.includes(dateType)) {
      return sendBadRequestResponse(res, "Invalid date type filter.");
    }

    // Build query for training certificates
    let trainingQuery = `
      SELECT 
        'Training' AS certificate_type,
        c.certificate_id AS id,
        c.certificate_number,
        c.issued_date,
        c.expired_date,
        c.cert_file,
        CASE 
          WHEN c.expired_date IS NULL THEN 'Valid'
          WHEN c.expired_date < CURRENT_DATE THEN 'Expired'
          ELSE 'Valid'
        END AS certificate_status,
        u.user_id,
        u.fullname,
        u.email,
        u.phone_number,
        u.institution,
        u.position,
        t.training_name AS certificate_title,
        rp.advantech_cert,
        NULL AS issuer,
        NULL AS original_number
      FROM certificate c
      JOIN registration_participant rp ON c.registration_participant_id = rp.registration_participant_id
      JOIN registration r ON rp.registration_id = r.registration_id
      JOIN users u ON rp.user_id = u.user_id
      JOIN training t ON r.training_id = t.training_id
      WHERE 1=1
    `;

    // Build query for user uploaded certificates
    let userQuery = `
      SELECT 
        'User Upload' AS certificate_type,
        uc.user_certificate_id AS id,
        uc.certificate_number,
        uc.issued_date,
        uc.expired_date,
        uc.cert_file,
        CASE 
          WHEN uc.expired_date IS NULL THEN 'Valid'
          WHEN uc.expired_date < CURRENT_DATE THEN 'Expired'
          ELSE 'Valid'
        END AS certificate_status,
        u.user_id,
        u.fullname,
        u.email,
        u.phone_number,
        u.institution,
        u.position,
        uc.cert_type AS certificate_title,
        NULL AS advantech_cert,
        uc.issuer,
        uc.original_number
      FROM user_certificates uc
      LEFT JOIN users u ON uc.user_id = u.user_id
      WHERE uc.status = 2
    `;

    const values = [];
    let index = 1;

    // Apply date filter to both queries
    const dateColumn = dateType; // issued_date or expired_date

    if (start && end) {
      trainingQuery += ` AND c.${dateColumn} BETWEEN $${index}::date AND $${
        index + 1
      }::date`;
      userQuery += ` AND uc.${dateColumn} BETWEEN $${index}::date AND $${
        index + 1
      }::date`;
      values.push(start, end);
      index += 2;
    } else if (start) {
      trainingQuery += ` AND c.${dateColumn} >= $${index}::date`;
      userQuery += ` AND uc.${dateColumn} >= $${index}::date`;
      values.push(start);
      index += 1;
    } else if (end) {
      trainingQuery += ` AND c.${dateColumn} <= $${index}::date`;
      userQuery += ` AND uc.${dateColumn} <= $${index}::date`;
      values.push(end);
      index += 1;
    }

    // Apply certificate status filter
    if (certificate_status) {
      if (certificate_status.toLowerCase() === "expired") {
        trainingQuery += ` AND c.expired_date IS NOT NULL AND c.expired_date < CURRENT_DATE`;
        userQuery += ` AND uc.expired_date IS NOT NULL AND uc.expired_date < CURRENT_DATE`;
      } else if (certificate_status.toLowerCase() === "valid") {
        trainingQuery += ` AND (c.expired_date IS NULL OR c.expired_date >= CURRENT_DATE)`;
        userQuery += ` AND (uc.expired_date IS NULL OR uc.expired_date >= CURRENT_DATE)`;
      }
    }

    // Combine queries based on type filter
    let finalQuery;
    if (type === "1") {
      // Only training certificates
      finalQuery = trainingQuery + ` ORDER BY c.${dateColumn} DESC`;
    } else if (type === "2") {
      // Only user upload certificates
      finalQuery = userQuery + ` ORDER BY uc.${dateColumn} DESC`;
    } else {
      // Both types
      finalQuery = `
        (${trainingQuery})
        UNION ALL
        (${userQuery})
        ORDER BY ${dateColumn} DESC
      `;
    }

    const result = await client.query(finalQuery, values);

    if (result.rows.length === 0) {
      return sendBadRequestResponse(
        res,
        "No certificate data found for export."
      );
    }

    // Format all date fields
    const formattedRows = result.rows.map((row) => ({
      ...row,
      issued_date: row.issued_date,
      expired_date: row.expired_date,
    }));

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("All Certificates");

    // Define columns
    worksheet.columns = [
      { header: "Certificate Type", key: "certificate_type", width: 20 },
      { header: "Certificate ID", key: "id", width: 30 },
      { header: "Certificate Number", key: "certificate_number", width: 30 },
      { header: "Certificate Status", key: "certificate_status", width: 18 },
      { header: "Issued Date", key: "issued_date", width: 15 },
      { header: "Expired Date", key: "expired_date", width: 15 },
      { header: "Certificate Title", key: "certificate_title", width: 40 },
      { header: "Issuer", key: "issuer", width: 30 },
      { header: "Certificate File", key: "cert_file", width: 35 },
      { header: "Advantech Cert", key: "advantech_cert", width: 35 },
      { header: "Original Number", key: "original_number", width: 30 },
      { header: "User ID", key: "user_id", width: 25 },
      { header: "Full Name", key: "fullname", width: 30 },
      { header: "Email", key: "email", width: 30 },
      { header: "Phone Number", key: "phone_number", width: 18 },
      { header: "Institution", key: "institution", width: 40 },
      { header: "Position", key: "position", width: 30 },
    ];

    worksheet.addRows(formattedRows);

    // Apply styling to header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    // Apply borders to all cells
    worksheet.eachRow((row) => {
      worksheet.columns.forEach((_, colIndex) => {
        const cell = row.getCell(colIndex + 1);
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
      row.height = 20;
    });

    // Generate Excel buffer and send response
    const buffer = await workbook.xlsx.writeBuffer();
    const timestamp = generateTimestampWIB();
    const filename = `all_certificates_export_${timestamp}.xlsx`;

    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error("Error exporting all certificates:", err);
    res.status(500).json({
      message: "Failed to export certificate data",
      error: err.message,
    });
  } finally {
    client.release();
  }
};

// Export Training Data with Insights
exports.exportTrainingData = async (req, res) => {
  const {
    start,
    end,
    dateType = "created_date", // created_date / available_date
    status,
    level,
    min_fees,
    max_fees,
  } = req.query;

  const client = await db.connect();
  try {
    // Validate dateType
    if (!["created_date", "available_date"].includes(dateType)) {
      return sendBadRequestResponse(res, "Invalid date type filter.");
    }

    // Base query with comprehensive insights
    let query = `
      SELECT 
        t.training_id,
        t.training_name,
        t.description,
        t.level,
        CASE 
          WHEN t.level = 1 THEN 'Beginner'
          WHEN t.level = 2 THEN 'Intermediate'
          WHEN t.level = 3 THEN 'Advanced'
          ELSE 'Unknown'
        END AS level_name,
        t.duration,
        t.training_fees,
        t.discount,
        t.training_fees - (t.training_fees * (t.discount / 100)) AS final_price,
        t.validity_period,
        t.term_condition,
        t.status,
        CASE 
          WHEN t.status = 1 THEN 'Active'
          WHEN t.status = 2 THEN 'Archived'
          ELSE 'Unknown'
        END AS status_name,
        t.graduates,
        t.rating,
        t.skills,
        t.created_by,
        t.created_date,
        t.available_date,
        
        -- Total participants (all registrations)
        COALESCE(COUNT(DISTINCT rp.registration_participant_id), 0) AS total_participants,
        
        -- Total registrations
        COALESCE(COUNT(DISTINCT r.registration_id), 0) AS total_registrations,
        
        -- Completed participants (has certificate)
        COALESCE(SUM(CASE WHEN rp.has_certificate = true THEN 1 ELSE 0 END), 0) AS total_graduates,
        
        -- Participants with Advantech certificate
        COALESCE(SUM(CASE WHEN rp.advantech_cert IS NOT NULL THEN 1 ELSE 0 END), 0) AS total_advantech_cert,
        
        -- Total reviews
        COALESCE(COUNT(DISTINCT rv.review_id), 0) AS total_reviews,
        
        -- Average review score
        COALESCE(ROUND(AVG(rv.score)::numeric, 2), 0) AS avg_review_score,
        
        -- Total revenue (from completed registrations with status 4)
        COALESCE(SUM(CASE WHEN r.status = 4 THEN r.total_payment ELSE 0 END), 0) AS total_revenue,
        
        -- Pending registrations (status 1-3)
        COALESCE(SUM(CASE WHEN r.status IN (1,2,3) THEN 1 ELSE 0 END), 0) AS pending_registrations,
        
        -- Cancelled registrations (status 5)
        COALESCE(SUM(CASE WHEN r.status = 5 THEN 1 ELSE 0 END), 0) AS cancelled_registrations,
        
        -- Present participants
        COALESCE(SUM(CASE WHEN rp.attendance_status = true THEN 1 ELSE 0 END), 0) AS total_present,
        
        -- Absent participants
        COALESCE(SUM(CASE WHEN rp.attendance_status = false THEN 1 ELSE 0 END), 0) AS total_absent

      FROM training t
      LEFT JOIN registration r ON t.training_id = r.training_id
      LEFT JOIN registration_participant rp ON r.registration_id = rp.registration_id
      LEFT JOIN review rv ON rp.registration_participant_id = rv.registration_participant_id
      WHERE 1=1
    `;

    const values = [];
    let index = 1;

    // Determine date column based on dateType
    const dateColumn =
      dateType === "created_date" ? "t.created_date" : "t.available_date";
    const isTimestamp = dateType === "created_date"; // created_date is timestamp

    // Filter by date range
    if (start && end) {
      if (isTimestamp) {
        query += ` AND ${dateColumn} BETWEEN $${index}::timestamp AND $${
          index + 1
        }::timestamp + INTERVAL '23 hours 59 minutes 59 seconds'`;
      } else {
        query += ` AND ${dateColumn}::text LIKE '%' || $${index} || '%' OR ${dateColumn}::text LIKE '%' || $${
          index + 1
        } || '%'`;
      }
      values.push(start, end);
      index += 2;
    } else if (start) {
      if (isTimestamp) {
        query += ` AND ${dateColumn} >= $${index}::timestamp`;
      } else {
        query += ` AND ${dateColumn}::text LIKE '%' || $${index} || '%'`;
      }
      values.push(start);
      index += 1;
    } else if (end) {
      if (isTimestamp) {
        query += ` AND ${dateColumn} <= $${index}::timestamp + INTERVAL '23 hours 59 minutes 59 seconds'`;
      } else {
        query += ` AND ${dateColumn}::text LIKE '%' || $${index} || '%'`;
      }
      values.push(end);
      index += 1;
    }

    // Filter by status
    if (status) {
      const statusArray = status.split(",").map((s) => parseInt(s.trim()));
      const placeholders = statusArray
        .map((_, i) => `$${index + i}`)
        .join(", ");
      query += ` AND t.status IN (${placeholders})`;
      values.push(...statusArray);
      index += statusArray.length;
    }

    // Filter by level
    if (level) {
      const levelArray = level.split(",").map((l) => parseInt(l.trim()));
      const placeholders = levelArray.map((_, i) => `$${index + i}`).join(", ");
      query += ` AND t.level IN (${placeholders})`;
      values.push(...levelArray);
      index += levelArray.length;
    }

    // Filter by training fees range
    if (min_fees) {
      query += ` AND t.training_fees >= $${index}`;
      values.push(parseFloat(min_fees));
      index++;
    }
    if (max_fees) {
      query += ` AND t.training_fees <= $${index}`;
      values.push(parseFloat(max_fees));
      index++;
    }

    // Group by training
    query += `
      GROUP BY 
        t.training_id, t.training_name, t.description, t.level, t.duration,
        t.training_fees, t.discount, t.validity_period, t.term_condition,
        t.status, t.graduates, t.rating, t.skills, t.created_by,
        t.created_date, t.available_date
      ORDER BY ${dateColumn} DESC
    `;

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
      return sendBadRequestResponse(res, "No training data found for export.");
    }

    // Format dates and skills
    const formattedRows = result.rows.map((row) => ({
      ...row,
      created_date: formatDateToWIB(row.created_date),
      skills: Array.isArray(row.skills) ? row.skills.join(", ") : "",
      term_condition: row.term_condition
        ? row.term_condition.replace(/\. /g, ". ")
        : "",
    }));

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Training Data");

    // Define columns
    worksheet.columns = [
      { header: "Training ID", key: "training_id", width: 25 },
      { header: "Training Name", key: "training_name", width: 35 },
      { header: "Description", key: "description", width: 50 },
      { header: "Level", key: "level", width: 12 },
      { header: "Level Name", key: "level_name", width: 15 },
      { header: "Duration (Hours)", key: "duration", width: 18 },
      { header: "Training Fees", key: "training_fees", width: 18 },
      { header: "Discount (%)", key: "discount", width: 15 },
      { header: "Final Price", key: "final_price", width: 18 },
      { header: "Validity Period (Months)", key: "validity_period", width: 25 },
      { header: "Status", key: "status", width: 12 },
      { header: "Status Name", key: "status_name", width: 15 },
      { header: "Total Participants", key: "total_participants", width: 20 },
      { header: "Total Registrations", key: "total_registrations", width: 20 },
      { header: "Total Graduates", key: "total_graduates", width: 18 },
      { header: "Advantech Certified", key: "total_advantech_cert", width: 20 },
      { header: "Total Reviews", key: "total_reviews", width: 18 },
      { header: "Avg Review Score", key: "avg_review_score", width: 18 },
      { header: "Total Revenue", key: "total_revenue", width: 18 },
      {
        header: "Pending Registrations",
        key: "pending_registrations",
        width: 22,
      },
      {
        header: "Cancelled Registrations",
        key: "cancelled_registrations",
        width: 25,
      },
      { header: "Total Present", key: "total_present", width: 18 },
      { header: "Total Absent", key: "total_absent", width: 18 },
      { header: "Rating", key: "rating", width: 12 },
      { header: "Skills", key: "skills", width: 40 },
      { header: "Terms & Conditions", key: "term_condition", width: 60 },
      { header: "Created By", key: "created_by", width: 25 },
      { header: "Created Date", key: "created_date", width: 22 },
      { header: "Available Date", key: "available_date", width: 22 },
    ];

    worksheet.addRows(formattedRows);

    // Style header
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    // Apply borders
    worksheet.eachRow((row) => {
      worksheet.columns.forEach((_, colIndex) => {
        const cell = row.getCell(colIndex + 1);
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
      row.height = 20;
    });

    // Generate Excel buffer
    const buffer = await workbook.xlsx.writeBuffer();
    const timestamp = generateTimestampWIB();
    const filename = `training_data_export_${timestamp}.xlsx`;

    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error("Error exporting training data:", err);
    res.status(500).json({
      message: "Failed to export training data",
      error: err.message,
    });
  } finally {
    client.release();
  }
};

// Export Articles Data
exports.exportArticlesData = async (req, res) => {
  const {
    start,
    end,
    dateType = "create_date", // create_date only
    category,
    author,
    min_views,
    max_views,
  } = req.query;

  const client = await db.connect();
  try {
    // Build base query
    let query = `
      SELECT 
        a.article_id,
        a.title,
        a.category,
        CASE 
          WHEN a.category = 1 THEN 'Education'
          WHEN a.category = 2 THEN 'Event'
          WHEN a.category = 3 THEN 'Success Story'
          ELSE 'Unknown'
        END AS category_name,
        a.content_body,
        a.create_date,
        a.admin_id,
        a.author,
        a.views,
        a.sources,
        a.images,
        a.tags,
        ad.status AS admin_status,
        u.fullname AS admin_fullname,
        u.email AS admin_email
      FROM articles a
      LEFT JOIN admin ad ON a.admin_id = ad.admin_id
      LEFT JOIN users u ON ad.admin_id = u.user_id
      WHERE 1=1
    `;

    const values = [];
    let index = 1;

    // Filter by date range (create_date is timestamp)
    if (start && end) {
      query += ` AND a.create_date BETWEEN $${index}::timestamp AND $${
        index + 1
      }::timestamp + INTERVAL '23 hours 59 minutes 59 seconds'`;
      values.push(start, end);
      index += 2;
    } else if (start) {
      query += ` AND a.create_date >= $${index}::timestamp`;
      values.push(start);
      index += 1;
    } else if (end) {
      query += ` AND a.create_date <= $${index}::timestamp + INTERVAL '23 hours 59 minutes 59 seconds'`;
      values.push(end);
      index += 1;
    }

    // Filter by category
    if (category) {
      const categoryArray = category.split(",").map((c) => parseInt(c.trim()));
      const placeholders = categoryArray
        .map((_, i) => `$${index + i}`)
        .join(", ");
      query += ` AND a.category IN (${placeholders})`;
      values.push(...categoryArray);
      index += categoryArray.length;
    }

    // Filter by author (partial match)
    if (author) {
      query += ` AND a.author ILIKE $${index}`;
      values.push(`%${author}%`);
      index++;
    }

    // Filter by views range
    if (min_views) {
      query += ` AND a.views >= $${index}`;
      values.push(parseInt(min_views));
      index++;
    }
    if (max_views) {
      query += ` AND a.views <= $${index}`;
      values.push(parseInt(max_views));
      index++;
    }

    // Sort by create_date
    query += ` ORDER BY a.create_date DESC`;

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
      return sendBadRequestResponse(res, "No article data found for export.");
    }

    // Format dates and arrays
    const formattedRows = result.rows.map((row) => ({
      ...row,
      create_date: formatDateToWIB(row.create_date),
      sources: row.sources ? JSON.stringify(row.sources) : "",
      images: Array.isArray(row.images) ? row.images.join(", ") : "",
      tags: Array.isArray(row.tags) ? row.tags.join(", ") : "",
      content_preview: row.content_body
        ? row.content_body.substring(0, 200) + "..."
        : "",
    }));

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Articles Data");

    // Define columns
    worksheet.columns = [
      { header: "Article ID", key: "article_id", width: 25 },
      { header: "Title", key: "title", width: 40 },
      { header: "Category", key: "category", width: 12 },
      { header: "Category Name", key: "category_name", width: 20 },
      { header: "Content Preview", key: "content_preview", width: 60 },
      { header: "Full Content", key: "content_body", width: 100 },
      { header: "Created Date", key: "create_date", width: 22 },
      { header: "Author", key: "author", width: 25 },
      { header: "Views", key: "views", width: 12 },
      { header: "Sources", key: "sources", width: 40 },
      { header: "Images", key: "images", width: 50 },
      { header: "Tags", key: "tags", width: 30 },
      { header: "Admin ID", key: "admin_id", width: 25 },
      { header: "Admin Name", key: "admin_fullname", width: 25 },
      { header: "Admin Email", key: "admin_email", width: 30 },
      { header: "Admin Status", key: "admin_status", width: 15 },
    ];

    worksheet.addRows(formattedRows);

    // Style header
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    // Apply borders
    worksheet.eachRow((row) => {
      worksheet.columns.forEach((_, colIndex) => {
        const cell = row.getCell(colIndex + 1);
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
        // Wrap text for content columns
        if (colIndex === 4 || colIndex === 5) {
          cell.alignment = { wrapText: true, vertical: "top" };
        }
      });
      row.height = 20;
    });

    // Generate Excel buffer
    const buffer = await workbook.xlsx.writeBuffer();
    const timestamp = generateTimestampWIB();
    const filename = `articles_data_export_${timestamp}.xlsx`;

    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error("Error exporting articles data:", err);
    res.status(500).json({
      message: "Failed to export articles data",
      error: err.message,
    });
  } finally {
    client.release();
  }
};
