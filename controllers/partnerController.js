const db = require("../config/db");
const { v4: uuidv4 } = require("uuid");
const {
  sendSuccessResponse,
  sendCreatedResponse,
  sendErrorResponse,
  sendBadRequestResponse,
} = require("../utils/responseUtils");
const e = require("express");

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

// Get all partners with optional search and filter
exports.getAllPartners = async (req, res) => {
  const { search = "", category, status } = req.query;

  try {
    let baseQuery = "SELECT * FROM partners WHERE 1=1";
    const values = [];

    if (search) {
      values.push(`%${search.toLowerCase()}%`);
      baseQuery += ` AND LOWER(partner_name) LIKE $${values.length}`;
    }

    if (category !== undefined) {
      values.push(Number(category));
      baseQuery += ` AND category = $${values.length}`;
    }

    if (status !== undefined) {
      values.push(Number(status));
      baseQuery += ` AND status = $${values.length}`;
    }

    baseQuery += " ORDER BY partner_name ASC";

    const result = await db.query(baseQuery, values);
    return sendSuccessResponse(res, "Partner list fetched successfully", result.rows);
  } catch (error) {
    console.error("Error fetching partners:", error);
    return sendErrorResponse(res, "Failed to fetch partners");
  }
};

// Get partner by ID
exports.getPartnerById = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      "SELECT * FROM partners WHERE partner_id = $1",
      [id]
    );

    if (result.rowCount === 0) {
      return sendSuccessResponse(res, "Partner not found");
    }

    return sendSuccessResponse(
      res,
      "Partner fetched successfully",
      result.rows[0]
    );
  } catch (error) {
    console.error("Error fetching partner by ID:", error);
    return sendErrorResponse(res, "Failed to fetch partner");
  }
};

// Add new partner
exports.addPartner = async (req, res) => {
  const { partner_name, category, status } = req.body;
  const partner_logo = req.body.partner_logo || null;
  const partner_id = generateCustomId("PART");

  if (!partner_name) {
    return sendBadRequestResponse(res, "Partner name is required");
  }

  if (status !== undefined && ![0, 1].includes(Number(status))) {
    return sendBadRequestResponse(res, "Invalid status value. Must be 0 or 1.");
  }

  try {
    const result = await db.query(
      "INSERT INTO partners (partner_id, partner_name, partner_logo, category, status) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [partner_id, partner_name, partner_logo, category || null, status ?? 1]
    );

    return sendSuccessResponse(
      res,
      "Partner added successfully",
      result.rows[0]
    );
  } catch (error) {
    console.error("Error adding partner:", error);
    return sendErrorResponse(res, "Failed to add partner");
  }
};

// Delete partner
exports.deletePartner = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      "DELETE FROM partners WHERE partner_id = $1 RETURNING *",
      [id]
    );

    if (result.rowCount === 0) {
      return sendSuccessResponse(res, "Partner not found");
    }

    return sendSuccessResponse(
      res,
      "Partner deleted successfully",
      result.rows[0]
    );
  } catch (error) {
    console.error("Error deleting partner:", error);
    return sendErrorResponse(res, "Failed to delete partner");
  }
};

// Update partner
exports.editPartner = async (req, res) => {
  const { id } = req.params;
  const { partner_name, partner_logo, category, status } = req.body;

  if (!partner_name) {
    return sendBadRequestResponse(res, "Partner name is required");
  }

  if (status !== undefined && ![0, 1].includes(Number(status))) {
    return sendBadRequestResponse(res, "Invalid status value. Must be 0 or 1.");
  }

  try {
    const result = await db.query(
      "UPDATE partners SET partner_name = $1, partner_logo = $2, category = $3, status = $4 WHERE partner_id = $5 RETURNING *",
      [partner_name, partner_logo || null, category || null, status ?? 1, id]
    );

    if (result.rowCount === 0) {
      return sendSuccessResponse(res, "Partner not found");
    }

    return sendSuccessResponse(
      res,
      "Partner updated successfully",
      result.rows[0]
    );
  } catch (error) {
    console.error("Error updating partner:", error);
    return sendErrorResponse(res, "Failed to update partner");
  }
};

exports.softDeletePartner = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      "UPDATE partners SET status = 0 WHERE partner_id = $1 RETURNING *",
      [id]
    );

    if (result.rowCount === 0) {
      return sendSuccessResponse(res, "Partner not found");
    }

    return sendSuccessResponse(
      res,
      "Partner soft-deleted successfully",
      result.rows[0]
    );
  } catch (error) {
    console.error("Error soft-deleting partner:", error);
    return sendErrorResponse(res, "Failed to soft-delete partner");
  }
};

// Search and filter partners
exports.searchPartners = async (req, res) => {
  try {
    const { category, status, search, sortBy, sortOrder } = req.query;

    const conditions = [];
    const values = [];
    let index = 1;

    // Filter category
    if (category !== undefined) {
      const categoryInt = parseInt(category);
      if (isNaN(categoryInt)) {
        return sendBadRequestResponse(
          res,
          "Invalid category value. Must be an integer."
        );
      }
      conditions.push(`category = $${index++}`);
      values.push(categoryInt);
    }

    // Filter status
    if (status !== undefined) {
      conditions.push(`status = $${index++}`);
      values.push(Number(status));
    }

    // Search by name
    if (search) {
      conditions.push(`partner_name ILIKE $${index++}`);
      values.push(`%${search}%`);
    }

    // Default sort: created_at DESC
    let sortClause = `ORDER BY created_at DESC`;
    if (sortBy === "created_at" || sortBy === "updated_at") {
      const safeOrder =
        sortOrder && sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";
      sortClause = `ORDER BY ${sortBy} ${safeOrder}`;
    }

    // Combine conditions
    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT * FROM partners
      ${whereClause}
      ${sortClause}
    `;

    const result = await db.query(query, values);

    return sendSuccessResponse(
      res,
      "Partners fetched with filters successfully",
      result.rows
    );
  } catch (error) {
    console.error("Error searching partners:", error);
    return sendErrorResponse(res, "Failed to search partners");
  }
};
