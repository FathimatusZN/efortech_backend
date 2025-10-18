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

// Function to map training level to a readable format
const mapLevel = (level) => {
  switch (level.toString()) {
    case "1":
      return "Beginner";
    case "2":
      return "Intermediate";
    case "3":
      return "Advance";
    default:
      return level;
  }
};

// Function to create a new review
exports.createReview = async (req, res) => {
  const { registration_participant_id, score, review_description } = req.body;

  if (
    !registration_participant_id ||
    score === undefined ||
    !review_description
  ) {
    return sendBadRequestResponse(res, "Incomplete input data.");
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Cek if there is registrant and attendance_status = true
    const participantCheck = await client.query(
      `SELECT rp.registration_id, rp.attendance_status
       FROM registration_participant rp
       WHERE rp.registration_participant_id = $1`,
      [registration_participant_id]
    );

    if (participantCheck.rowCount === 0) {
      await client.query("ROLLBACK");
      return sendBadRequestResponse(res, "Participant not found.");
    }

    if (!participantCheck.rows[0].attendance_status) {
      await client.query("ROLLBACK");
      return sendBadRequestResponse(
        res,
        "You must attend the training to submit a review."
      );
    }

    const registration_id = participantCheck.rows[0].registration_id;

    // Get training_id from registration table
    const trainingRes = await client.query(
      `SELECT training_id FROM registration WHERE registration_id = $1`,
      [registration_id]
    );
    const training_id = trainingRes.rows[0]?.training_id;

    if (!training_id) {
      await client.query("ROLLBACK");
      return sendBadRequestResponse(res, "Training not found.");
    }

    // Save new review
    const review_id = generateCustomId("REVW");

    await client.query(
      `INSERT INTO review (review_id, registration_participant_id, score, review_description) 
       VALUES ($1, $2, $3, $4)`,
      [review_id, registration_participant_id, score, review_description]
    );

    // Update rating for the training
    await client.query(
      `UPDATE training 
       SET rating = (
         SELECT ROUND(AVG(score)::numeric, 2)
         FROM review r
         JOIN registration_participant rp ON r.registration_participant_id = rp.registration_participant_id
         JOIN registration reg ON rp.registration_id = reg.registration_id
         WHERE reg.training_id = $1
       )
       WHERE training_id = $1`,
      [training_id]
    );

    await client.query("COMMIT");
    return sendSuccessResponse(res, "Review created successfully.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error creating review:", err);
    return sendErrorResponse(res, "Failed to create review", err.message);
  } finally {
    client.release();
  }
};

// exports.createReview = async (req, res) => {
//   // Extract input data from request body
//   const { registration_participant_id, score, review_description } = req.body;

//   // Validate input data
//   if (
//     !registration_participant_id ||
//     score === undefined ||
//     !review_description
//   ) {
//     return sendBadRequestResponse(res, "Incomplete input data.");
//   }

//   const client = await db.connect();
//   try {
//     await client.query("BEGIN");

//     // 1. Check if registration_participant_id exists and has a certificate
//     const certificateCheck = await client.query(
//       `SELECT rp.registration_id, rp.has_certificate
//          FROM registration_participant rp
//          WHERE rp.registration_participant_id = $1`,
//       [registration_participant_id]
//     );

//     if (
//       certificateCheck.rowCount === 0 ||
//       !certificateCheck.rows[0].has_certificate
//     ) {
//       await client.query("ROLLBACK");
//       return sendBadRequestResponse(
//         res,
//         "You must have a certificate to submit a review."
//       );
//     }

//     const registration_id = certificateCheck.rows[0].registration_id;

//     // 2. Get training_id from registration
//     const trainingRes = await client.query(
//       `SELECT training_id FROM registration WHERE registration_id = $1`,
//       [registration_id]
//     );
//     const training_id = trainingRes.rows[0]?.training_id;

//     if (!training_id) {
//       await client.query("ROLLBACK");
//       return sendBadRequestResponse(res, "Training not found.");
//     }

//     // 3. Save review to the database

//     const review_id = generateCustomId("REVW"); // Generate a custom review ID

//     await client.query(
//       `INSERT INTO review (review_id, registration_participant_id, score, review_description)
//          VALUES ($1, $2, $3, $4)`,
//       [review_id, registration_participant_id, score, review_description]
//     );

//     // 4. Update rating for the training
//     await client.query(
//       `UPDATE training SET rating = (
//            SELECT ROUND(AVG(score)::numeric, 2)
//            FROM review r
//            JOIN registration_participant rp ON r.registration_participant_id = rp.registration_participant_id
//            JOIN registration reg ON rp.registration_id = reg.registration_id
//            WHERE reg.training_id = $1
//          )
//          WHERE training_id = $1`,
//       [training_id]
//     );

//     await client.query("COMMIT");
//     return sendSuccessResponse(res, "Review created successfully.");
//   } catch (err) {
//     await client.query("ROLLBACK");
//     console.error("Error creating review:", err);
//     return sendErrorResponse(res, "Failed to create review", err.message);
//   } finally {
//     client.release();
//   }
// };

// Get all reviews with user info and training info

exports.getAllReviews = async (req, res) => {
  const client = await db.connect();
  try {
    const result = await client.query(
      `SELECT 
           r.review_id,
           r.review_description,
           r.score,
           r.review_date,
           u.fullname,
           u.user_photo,
           t.training_name,
           t.level
         FROM review r
         JOIN registration_participant rp ON r.registration_participant_id = rp.registration_participant_id
         JOIN users u ON rp.user_id = u.user_id
         JOIN registration reg ON rp.registration_id = reg.registration_id
         JOIN training t ON reg.training_id = t.training_id
         ORDER BY r.review_date DESC`
    );

    const mappedData = result.rows.map((row) => ({
      ...row,
      level: mapLevel(row.level),
    }));

    return sendSuccessResponse(
      res,
      "All reviews retrieved successfully",
      mappedData
    );
  } catch (err) {
    console.error("Error getting all reviews:", err);
    return sendErrorResponse(res, "Failed to retrieve reviews", err.message);
  } finally {
    client.release();
  }
};

// Get a single review by participant ID
exports.getReviewByParticipantId = async (req, res) => {
  const { registration_participant_id } = req.params;

  const client = await db.connect();
  try {
    const result = await client.query(
      `SELECT 
           r.review_id,
           r.review_description,
           r.score,
           r.review_date,
           u.fullname,
           u.user_photo,
           t.training_name,
           t.level
         FROM review r
         JOIN registration_participant rp ON r.registration_participant_id = rp.registration_participant_id
         JOIN users u ON rp.user_id = u.user_id
         JOIN registration reg ON rp.registration_id = reg.registration_id
         JOIN training t ON reg.training_id = t.training_id
         WHERE r.registration_participant_id = $1`,
      [registration_participant_id]
    );

    if (result.rowCount === 0) {
      return sendBadRequestResponse(res, "Review not found.");
    }

    const review = result.rows[0];
    review.level = mapLevel(review.level);

    return sendSuccessResponse(res, "Review retrieved successfully", review);
  } catch (err) {
    console.error("Error getting review:", err);
    return sendErrorResponse(res, "Failed to retrieve review", err.message);
  } finally {
    client.release();
  }
};

// Search and filter reviews with multiple options or aggregate by training
exports.searchAndFilterReviews = async (req, res) => {
  const {
    training_id,
    training_name,
    sort_by = "review_date",
    sort_order = "desc",
    date_from,
    date_to,
    score,
    group_by, // "training" to enable aggregate view
  } = req.query;

  const client = await db.connect();
  try {
    const values = [];
    let i = 1;
    let query;

    if (group_by === "training") {
      // Aggregate mode: group reviews by training, show avg score and review count
      query = `
        SELECT 
          t.training_id,
          t.training_name,
          t.level,
          COUNT(r.review_id) AS total_reviews,
          ROUND(AVG(r.score)::numeric, 2) AS average_score
        FROM review r
        JOIN registration_participant rp ON r.registration_participant_id = rp.registration_participant_id
        JOIN registration reg ON rp.registration_id = reg.registration_id
        JOIN training t ON reg.training_id = t.training_id
        WHERE 1=1
      `;

      // Filters
      if (training_id) {
        query += ` AND t.training_id = $${i++}`;
        values.push(training_id);
      }
      if (training_name) {
        query += ` AND LOWER(t.training_name) LIKE LOWER($${i++})`;
        values.push(`%${training_name}%`);
      }
      if (date_from) {
        query += ` AND r.review_date >= $${i++}`;
        values.push(date_from);
      }
      if (date_to) {
        query += ` AND r.review_date <= $${i++}`;
        values.push(date_to);
      }
      if (score) {
        if (Array.isArray(score)) {
          query += ` AND r.score = ANY($${i++})`;
          values.push(score);
        } else {
          query += ` AND r.score = $${i++}`;
          values.push(score);
        }
      }

      // Grouping and sorting
      query += ` GROUP BY t.training_id, t.training_name, t.level`;

      const allowedGroupSortFields = [
        "average_score",
        "total_reviews",
        "training_name",
      ];
      const sortField = allowedGroupSortFields.includes(sort_by)
        ? sort_by
        : "average_score";
      const order = sort_order.toLowerCase() === "asc" ? "ASC" : "DESC";
      query += ` ORDER BY ${sortField} ${order}`;
    } else {
      // Normal mode: list all reviews
      query = `
        SELECT 
          r.review_id,
          r.review_description,
          r.score,
          r.review_date,
          u.fullname,
          u.user_photo,
          t.training_name,
          t.level
        FROM review r
        JOIN registration_participant rp ON r.registration_participant_id = rp.registration_participant_id
        JOIN users u ON rp.user_id = u.user_id
        JOIN registration reg ON rp.registration_id = reg.registration_id
        JOIN training t ON reg.training_id = t.training_id
        WHERE 1=1
      `;

      // Filters
      if (training_id) {
        query += ` AND t.training_id = $${i++}`;
        values.push(training_id);
      }
      if (training_name) {
        query += ` AND LOWER(t.training_name) LIKE LOWER($${i++})`;
        values.push(`%${training_name}%`);
      }
      if (date_from) {
        query += ` AND r.review_date >= $${i++}`;
        values.push(date_from);
      }
      if (date_to) {
        query += ` AND r.review_date <= $${i++}`;
        values.push(date_to);
      }
      if (score) {
        if (Array.isArray(score)) {
          query += ` AND r.score = ANY($${i++})`;
          values.push(score);
        } else {
          query += ` AND r.score = $${i++}`;
          values.push(score);
        }
      }

      const allowedSortFields = ["review_date", "score"];
      const sortField = allowedSortFields.includes(sort_by)
        ? sort_by
        : "review_date";
      const order = sort_order.toLowerCase() === "asc" ? "ASC" : "DESC";
      query += ` ORDER BY ${sortField} ${order}`;
    }

    const result = await client.query(query, values);

    let data;
    if (group_by === "training") {
      // No mapping needed
      data = result.rows.map((row) => ({
        ...row,
        level: mapLevel(row.level),
      }));
    } else {
      data = result.rows.map((row) => ({
        ...row,
        level: mapLevel(row.level),
      }));
    }

    return sendSuccessResponse(
      res,
      group_by === "training"
        ? "Aggregated reviews per training"
        : "Filtered reviews retrieved successfully",
      data
    );
  } catch (err) {
    console.error("Error filtering reviews:", err);
    return sendErrorResponse(res, "Failed to filter reviews", err.message);
  } finally {
    client.release();
  }
};
