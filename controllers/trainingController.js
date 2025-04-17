const db = require("../config/db");
const { v4: uuidv4 } = require("uuid");
const {
  sendSuccessResponse,
  sendCreatedResponse,
  sendBadRequestResponse,
  sendUnauthorizedResponse,
  sendForbiddenResponse,
  sendNotFoundResponse,
  sendErrorResponse,
} = require("../utils/responseUtils");
const e = require("express");

const calculateDiscountedPrice = (fee, discount) => {
  if (!discount || discount <= 0 || discount >= 100) return null;
  return Math.round(fee - (fee * discount) / 100);
};

// Add training
exports.addTraining = async (req, res) => {
  try {
    const {
      training_name,
      description,
      duration,
      training_fees,
      discount,
      validity_period,
      term_condition,
      level,
      status,
      admin_id,
    } = req.body;

    const parsedSkills = Array.isArray(req.body.skills) ? req.body.skills : [];

    if (
      training_name == null ||
      description == null ||
      duration == null ||
      training_fees == null ||
      discount == null ||
      validity_period == null ||
      term_condition == null ||
      level == null ||
      status == null ||
      admin_id == null
    ) {
      return sendBadRequestResponse(res, "Missing required fields");
    }

    // Skills validation
    if (!Array.isArray(parsedSkills)) {
      return sendBadRequestResponse(res, "Skills must be an array of strings");
    }

    // training_id generation
    const generateTrainingId = () => {
      const now = new Date();
      now.setHours(now.getHours() + 7);
      const timestamp = now
        .toISOString()
        .replace(/[-T:.Z]/g, "")
        .slice(0, 12);
      const randomStr = Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();
      return `TRNG-${timestamp}-${randomStr}`;
    };

    const training_id = generateTrainingId();

    const imageUrls = Array.isArray(req.body.images)
      ? req.body.images.filter(
          (url) => typeof url === "string" && url.startsWith("http")
        )
      : [];

    await db.query(
      `INSERT INTO training (training_id, training_name, description, duration, training_fees, discount, validity_period, term_condition, level, status, skills, images, created_by, created_date)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)`,
      [
        training_id,
        training_name,
        description,
        duration,
        training_fees,
        discount,
        validity_period,
        term_condition,
        level,
        status,
        parsedSkills,
        imageUrls,
        admin_id,
      ]
    );

    sendCreatedResponse(res, "Training added successfully", { training_id });
  } catch (error) {
    console.error("Error adding training:", error);
    return sendErrorResponse(res, "Failed to add training");
  }
};

// Update training
exports.updateTraining = async (req, res) => {
  try {
    const { training_id } = req.params;
    const {
      training_name,
      description,
      duration,
      training_fees,
      discount,
      validity_period,
      term_condition,
      level,
      status,
      skills,
      images,
    } = req.body;

    if (
      training_name == null ||
      description == null ||
      duration == null ||
      training_fees == null ||
      discount == null ||
      validity_period == null ||
      term_condition == null ||
      level == null ||
      status == null
    ) {
      return sendBadRequestResponse(res, "All required fields must be filled");
    }

    // Skills validation
    if (!Array.isArray(skills)) {
      return sendBadRequestResponse(res, "Skills must be an array of strings");
    }

    // Images validation
    const imageUrls = Array.isArray(images)
      ? images.filter(
          (url) => typeof url === "string" && url.startsWith("http")
        )
      : [];

    const result = await db.query(
      `UPDATE training SET training_name = $1, description = $2, duration = $3, training_fees = $4, discount = $5, validity_period = $6, term_condition = $7, level = $8, status = $9, skills = $10, images = $11 WHERE training_id = $12`,
      [
        training_name,
        description,
        duration,
        training_fees,
        discount,
        validity_period,
        term_condition,
        level,
        status,
        skills,
        imageUrls,
        training_id,
      ]
    );

    if (result.rowCount === 0) {
      return sendNotFoundResponse(res, "Training not found");
    }

    sendSuccessResponse(res, "Training updated successfully");
  } catch (error) {
    console.error("Error updating training:", error);
    return sendErrorResponse(res, "Failed to update training");
  }
};

// Delete training
exports.deleteTraining = async (req, res) => {
  try {
    const { training_id } = req.params;

    const result = await db.query(
      `DELETE FROM training WHERE training_id = $1`,
      [training_id]
    );
    if (result.rowCount === 0) {
      return sendNotFoundResponse(res, "Training not found");
    }

    sendSuccessResponse(res, "Training deleted successfully");
  } catch (error) {
    console.error("Error deleting training:", error);
    return sendErrorResponse(res, "Failed to delete training");
  }
};

// Soft Delete training
exports.softDeleteTraining = async (req, res) => {
  const { training_id } = req.params;

  try {
    const training = await db.query(
      `UPDATE training SET status = 2 WHERE training_id = $1`,
      [training_id]
    );
    if (training.rowCount === 0) {
      return sendNotFoundResponse(res, "Training not found");
    }

    return sendSuccessResponse(res, "Training data archived successfully!", {
      training_id,
      status: "2",
    });
  } catch (error) {
    console.error("Error archiving training:", error);
    sendErrorResponse(res, "Failed to archive training");
  }
};

// Get all trainings
exports.getTrainings = async (req, res) => {
  try {
    const { status = "1", level, search, skill } = req.query;

    let query = `SELECT * FROM training`;
    let conditions = [];
    let params = [];
    let index = 1;

    // Filter by status
    if (status !== "all") {
      conditions.push(`status = $${index++}`);
      params.push(status);
    }

    // Filter by level
    if (level) {
      conditions.push(`level = $${index++}`);
      params.push(level);
    }

    // Filter by search (name/desc)
    if (search) {
      const like = `%${search}%`;
      conditions.push(
        `(training_name ILIKE $${index} OR description ILIKE $${index})`
      );
      params.push(like);
      index++;
    }

    // Filter by skill
    if (skill) {
      conditions.push(`EXISTS (
        SELECT 1 FROM unnest(skills) AS s
        WHERE s ILIKE $${index++}
      )`);
      params.push(`%${skill}%`);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY training_name ASC";

    const { rows: trainings } = await db.query(query, params);

    trainings.forEach((training) => {
      training.skills = training.skills || [];
      training.images = Array.isArray(training.images) ? training.images : [];

      training.final_price = calculateDiscountedPrice(
        training.training_fees,
        training.discount
      );
    });

    sendSuccessResponse(res, "Trainings fetched successfully", trainings);
  } catch (error) {
    console.error("Error fetching trainings:", error);
    sendErrorResponse(res, "Failed to fetch trainings");
  }
};

// Get training by ID
exports.getTrainingById = async (req, res) => {
  try {
    const { training_id } = req.params;
    const { rows } = await db.query(
      `SELECT * FROM training WHERE training_id = $1`,
      [training_id]
    );

    const training = rows[0];
    if (!training) {
      return sendNotFoundResponse(res, "Training not found");
    }

    if (training.images && Array.isArray(training.images)) {
      training.images = Array.isArray(training.images) ? training.images : [];
    } else {
      training.images = [];
    }
    training.skills = training.skills || [];

    training.final_price = calculateDiscountedPrice(
      training.training_fees,
      training.discount
    );

    sendSuccessResponse(res, "Training fetched successfully", training);
  } catch (error) {
    console.error("Error fetching training:", error);
    return sendErrorResponse(res, "Failed to fetch training");
  }
};

// Search training by name, description, or skills
exports.searchTraining = async (req, res) => {
  try {
    const { query, status } = req.query;

    if (!query || query.trim() === "") {
      return sendBadRequestResponse(res, "Query parameter is required");
    }

    const searchTerm = `%${query}%`;
    const isAllStatus = status === "all";

    // Base query
    let sql = `
      SELECT * FROM training
      WHERE (
        training_name ILIKE $1 
        OR description ILIKE $1 
        OR EXISTS (
          SELECT 1 FROM unnest(skills) AS s
          WHERE s ILIKE $1
        )
      )
    `;

    // Tambahkan filter status kalau bukan "all"
    if (!isAllStatus) {
      sql += ` AND status = 1`;
    }

    sql += ` ORDER BY training_name ASC`;

    const { rows: trainings } = await db.query(sql, [searchTerm]);

    if (trainings.length === 0) {
      return sendNotFoundResponse(res, "No trainings found");
    }

    trainings.forEach((training) => {
      training.skills = training.skills || [];
      training.images = Array.isArray(training.images) ? training.images : [];
      training.final_price = calculateDiscountedPrice(
        training.training_fees,
        training.discount
      );
    });

    sendSuccessResponse(res, "Training fetched successfully", trainings);
  } catch (error) {
    console.error("Error searching trainings:", error);
    sendErrorResponse(res, "Failed to fetch training");
  }
};
