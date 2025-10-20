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
      available_date,
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
      `INSERT INTO training (training_id, training_name, description, duration, training_fees, discount, validity_period, available_date, term_condition, level, status, skills, images, created_by, created_date)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)`,
      [
        training_id,
        training_name,
        description,
        duration,
        training_fees,
        discount,
        validity_period,
        available_date,
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
      available_date,
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
      `UPDATE training SET training_name = $1, description = $2, duration = $3, training_fees = $4, discount = $5, validity_period = $6, available_date = $7, term_condition = $8, level = $9, status = $10, skills = $11, images = $12 WHERE training_id = $13`,
      [
        training_name,
        description,
        duration,
        training_fees,
        discount,
        validity_period,
        available_date,
        term_condition,
        level,
        status,
        skills,
        imageUrls,
        training_id,
      ]
    );

    if (result.rowCount === 0) {
      return sendSuccessResponse(res, "Training not found");
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
      return sendSuccessResponse(res, "Training not found");
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
      return sendSuccessResponse(res, "Training not found");
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

// Delete training with related records (registration, registration_participant, review), Only allowed if no participant has a certificate
exports.deleteTrainingWithRelations = async (req, res) => {
  const client = await db.connect();
  try {
    const { training_id } = req.params;

    // Step 1. Check if the training exists
    const { rows: trainingRows } = await client.query(
      `SELECT training_id FROM training WHERE training_id = $1`,
      [training_id]
    );
    if (trainingRows.length === 0) {
      return sendNotFoundResponse(res, "Training not found");
    }

    // Step 2. Find all registration_participants related to the training
    const { rows: participants } = await client.query(
      `
        SELECT rp.registration_participant_id, rp.has_certificate
        FROM registration_participant rp
        JOIN registration r ON rp.registration_id = r.registration_id
        WHERE r.training_id = $1
      `,
      [training_id]
    );

    // Step 3. Ensure no participant already has a certificate
    const hasCertifiedParticipant = participants.some(
      (p) => p.has_certificate === true
    );
    if (hasCertifiedParticipant) {
      return sendForbiddenResponse(
        res,
        "Cannot delete this training because one or more participants already have certificates."
      );
    }

    // Step 4. Begin transaction to maintain data integrity
    await client.query("BEGIN");

    // Step 5. Delete all reviews linked to registration participants of this training
    await client.query(
      `
        DELETE FROM review
        WHERE registration_participant_id IN (
          SELECT rp.registration_participant_id
          FROM registration_participant rp
          JOIN registration r ON rp.registration_id = r.registration_id
          WHERE r.training_id = $1
        )
      `,
      [training_id]
    );

    // Step 6. Delete registration participants linked to this training
    await client.query(
      `
        DELETE FROM registration_participant
        WHERE registration_id IN (
          SELECT registration_id FROM registration WHERE training_id = $1
        )
      `,
      [training_id]
    );

    // Step 7. Delete registrations linked to this training
    await client.query(
      `
        DELETE FROM registration
        WHERE training_id = $1
      `,
      [training_id]
    );

    // Step 8. Delete the training record itself
    const deleteTrainingResult = await client.query(
      `DELETE FROM training WHERE training_id = $1`,
      [training_id]
    );

    // Step 9. Commit transaction
    await client.query("COMMIT");

    if (deleteTrainingResult.rowCount === 0) {
      return sendNotFoundResponse(res, "Training not found or already deleted");
    }

    return sendSuccessResponse(
      res,
      "Training and related data deleted successfully"
    );
  } catch (error) {
    // Rollback transaction on error
    await client.query("ROLLBACK");
    console.error("Error deleting training with relations:", error);
    return sendErrorResponse(res, "Failed to delete training and related data");
  } finally {
    client.release();
  }
};

// Get all trainings with optional filters and sorting
exports.getTrainings = async (req, res) => {
  try {
    const {
      status = "1", // default: active
      level,
      search,
      skill,
      sort_by = "created_date", // default column to sort by
      sort_order = "desc", // default sort direction
    } = req.query;

    let query = `SELECT * FROM training`;
    let conditions = [];
    let params = [];
    let index = 1;

    // Filter by status (unless 'all')
    if (status !== "all") {
      conditions.push(`status = $${index++}`);
      params.push(status);
    }

    // Filter by level
    if (level) {
      conditions.push(`level = $${index++}`);
      params.push(level);
    }

    // Filter by name or description using search keyword
    if (search) {
      const like = `%${search}%`;
      conditions.push(
        `(training_name ILIKE $${index} OR description ILIKE $${index})`
      );
      params.push(like);
      index++;
    }

    // Filter by skill (checks if any skill in the array matches)
    if (skill) {
      conditions.push(`EXISTS (
        SELECT 1 FROM unnest(skills) AS s
        WHERE s ILIKE $${index++}
      )`);
      params.push(`%${skill}%`);
    }

    // Apply filters if any
    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    // Extend allowed sort options
    const allowedSortBy = [
      "created_date",
      "training_name",
      "level",
      "graduates",
      "rating",
    ];
    const allowedSortOrder = ["asc", "desc"];

    const sortBy = allowedSortBy.includes(sort_by) ? sort_by : "created_date";
    const sortOrder = allowedSortOrder.includes(sort_order.toLowerCase())
      ? sort_order.toUpperCase()
      : "DESC";

    query += ` ORDER BY ${sortBy} ${sortOrder}`;

    const { rows: trainings } = await db.query(query, params);

    // Post-process results
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
      return sendSuccessResponse(res, "Training not found");
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

// Check training relations: registration and certificate status
exports.checkTrainingRelations = async (req, res) => {
  const { training_id } = req.params;
  const client = await db.connect();

  try {
    // 🟦 1. Check if training exists
    const { rows: training } = await client.query(
      `SELECT training_id FROM training WHERE training_id = $1`,
      [training_id]
    );

    if (training.length === 0) {
      return sendNotFoundResponse(res, "Training not found");
    }

    // 🟦 2. Check related registrations
    const { rows: registrations } = await client.query(
      `SELECT registration_id FROM registration WHERE training_id = $1`,
      [training_id]
    );

    const totalRegistrations = registrations.length;

    if (totalRegistrations === 0) {
      // No registrations at all
      return sendSuccessResponse(
        res,
        "No registrations found for this training",
        {
          relation_status: 1, // 1 = No registration
          message:
            "This training has no registration data and can be safely deleted.",
          summary: {
            total_registration: 0,
            total_participant: 0,
            total_review: 0,
            total_certificate: 0,
          },
        }
      );
    }

    // 🟦 3. Check participants
    const { rows: participants } = await client.query(
      `
        SELECT rp.registration_participant_id, rp.has_certificate
        FROM registration_participant rp
        JOIN registration r ON rp.registration_id = r.registration_id
        WHERE r.training_id = $1
      `,
      [training_id]
    );

    const totalParticipants = participants.length;
    const totalCertificates = participants.filter(
      (p) => p.has_certificate === true
    ).length;

    // 🟦 4. Check reviews
    const { rows: reviews } = await client.query(
      `
        SELECT review_id 
        FROM review rv
        JOIN registration_participant rp ON rv.registration_participant_id = rp.registration_participant_id
        JOIN registration r ON rp.registration_id = r.registration_id
        WHERE r.training_id = $1
      `,
      [training_id]
    );
    const totalReviews = reviews.length;

    // 🟩 5. Determine relation status
    const hasCertified = totalCertificates > 0;

    if (hasCertified) {
      return sendSuccessResponse(
        res,
        "Training has registrations and at least one participant with a certificate",
        {
          relation_status: 3, // 3 = Has registrations and certificates
          message:
            "Cannot delete this training because some participants already have certificates.",
          summary: {
            total_registration: totalRegistrations,
            total_participant: totalParticipants,
            total_review: totalReviews,
            total_certificate: totalCertificates,
          },
        }
      );
    }

    // 🟨 If there are registrations but no certificates
    return sendSuccessResponse(
      res,
      "Training has registrations but no certificates yet",
      {
        relation_status: 2, // 2 = Has registration but no certificate
        message:
          "Training can be deleted safely since there are registrations but no certificates.",
        summary: {
          total_registration: totalRegistrations,
          total_participant: totalParticipants,
          total_review: totalReviews,
          total_certificate: totalCertificates,
        },
      }
    );
  } catch (error) {
    console.error("Error checking training relations:", error);
    sendErrorResponse(res, "Failed to check training relations");
  } finally {
    client.release();
  }
};
