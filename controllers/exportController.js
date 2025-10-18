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
  const { start, end, roles } = req.query;
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
        END AS role_name,
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
    }

    // Apply role filter
    if (roles) {
      const roleArray = roles.split(",").map((r) => r.trim());
      query += ` AND u.role_id = ANY($${index})`;
      values.push(roleArray);
      index++;
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
      { header: "Gender", key: "gender", width: 10 },
      { header: "Birthdate", key: "birthdate", width: 15 },
      { header: "Role ID", key: "role_id", width: 15 },
      { header: "Role Name", key: "role_name", width: 15 },
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
