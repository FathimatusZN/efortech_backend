// efortech_backend\controllers\dashboardController.js
const db = require("../config/db");
const {
  sendSuccessResponse,
  sendErrorResponse,
} = require("../utils/responseUtils");

// PART 1 - Dashboard To-Do
exports.getDashboardTodo = async (req, res) => {
  const client = await db.connect();
  try {
    const query = `
          SELECT
            -- Pending registrations (status = 1)
            (SELECT COUNT(*) FROM registration WHERE status = 1) AS pending_registrations,
    
            -- Completed training but attendance not marked yet (attendance_status IS NULL AND reg.status = 4)
            (
            SELECT COUNT(*) 
            FROM registration_participant rp
            JOIN registration r ON rp.registration_id = r.registration_id
            WHERE rp.attendance_status IS NULL AND r.status = 4
            ) AS unmarked_attendance,

            -- Attendance marked true but no certificate yet (has_certificate = false) and no_certificate is false or null
            (SELECT COUNT(*) FROM registration_participant WHERE attendance_status = true AND has_certificate = false AND COALESCE(no_certificate, false) = false) AS pending_certificates,

            -- User uploaded certificate that need to be reviewed
            (SELECT COUNT(*) FROM user_certificates WHERE status = 1) AS pending_user_certificates
        `;

    const result = await client.query(query);
    return sendSuccessResponse(res, "Dashboard To-Do fetched", result.rows[0]);
  } catch (err) {
    console.error("Dashboard To-Do error:", err);
    return sendErrorResponse(res, "Failed to fetch dashboard to-do");
  } finally {
    client.release();
  }
};

// PART 2 - Summary Counts
exports.getDashboardSummary = async (req, res) => {
  const client = await db.connect();
  try {
    const query = `
      SELECT 
        (SELECT COUNT(*) FROM users) AS registered_users,
        (SELECT COUNT(*) FROM admin WHERE status='Active') AS active_admin,
        (SELECT COUNT(*) FROM training WHERE status=1) AS active_trainings,
        (SELECT COUNT(*) FROM registration) AS training_registrations,
        (SELECT COUNT(*) FROM registration WHERE status = 4) AS completed_registrations,
        (SELECT COUNT(*) FROM registration_participant) AS training_participants,
        (SELECT COUNT(*) FROM registration_participant WHERE has_certificate = true OR COALESCE(no_certificate, false) = true) AS training_graduates,
        (SELECT COUNT(*) FROM certificate) AS issued_certificates,
        (SELECT COUNT(*) FROM review) AS training_reviews,
        (SELECT SUM(total_payment) FROM registration) AS training_payments,
        (SELECT COUNT(*) FROM articles) AS published_articles,
        (SELECT SUM(views) FROM articles) AS article_views
    `;
    const result = await client.query(query);
    const data = result.rows[0];

    // Format training_payments to Rupiah
    data.training_payments = new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(data.training_payments || 0);

    return sendSuccessResponse(
      res,
      "Dashboard summary fetched",
      result.rows[0],
    );
  } catch (err) {
    console.error("Dashboard summary error:", err);
    return sendErrorResponse(res, "Failed to fetch dashboard summary");
  } finally {
    client.release();
  }
};

// PART 3 - Registration Stats by Training
exports.getRegistrationStats = async (req, res) => {
  const client = await db.connect();
  try {
    const query = `
        SELECT 
          t.training_id,
          t.training_name,
          SUM(r.participant_count) AS total_participants,
          SUM(CASE WHEN r.status = 4 THEN r.participant_count ELSE 0 END) AS completed,
          SUM(CASE WHEN r.status IN (1, 2, 3) THEN r.participant_count ELSE 0 END) AS onprogress,
          SUM(CASE WHEN r.status = 5 THEN r.participant_count ELSE 0 END) AS cancelled
        FROM registration r
        JOIN training t ON r.training_id = t.training_id
        GROUP BY t.training_id, t.training_name
        ORDER BY total_participants DESC;
      `;
    const result = await client.query(query);
    return sendSuccessResponse(res, "Registration stats fetched", result.rows);
  } catch (err) {
    console.error("Registration stats error:", err);
    return sendErrorResponse(res, "Failed to fetch registration stats");
  } finally {
    client.release();
  }
};

// PART 4 - Certificate Summary by Training
exports.getCertificateSummary = async (req, res) => {
  const client = await db.connect();
  try {
    const query = `
        SELECT 
          t.training_id,
          t.training_name,
          COUNT(c.certificate_id) AS total_issued,
          COUNT(CASE WHEN c.expired_date >= CURRENT_DATE THEN 1 END) AS valid_certificate,
          COUNT(CASE WHEN c.expired_date < CURRENT_DATE THEN 1 END) AS expired_certificate
        FROM certificate c
        JOIN registration_participant rp ON c.registration_participant_id = rp.registration_participant_id
        JOIN registration r ON rp.registration_id = r.registration_id
        JOIN training t ON r.training_id = t.training_id
        GROUP BY t.training_id, t.training_name
        ORDER BY t.training_name;
      `;

    const result = await client.query(query);
    return sendSuccessResponse(
      res,
      "Certificate summary by training fetched",
      result.rows,
    );
  } catch (err) {
    console.error("Certificate summary error:", err);
    return sendErrorResponse(res, "Failed to fetch certificate summary");
  } finally {
    client.release();
  }
};

// PART 5 - Training Overview
exports.getTrainingOverview = async (req, res) => {
  const client = await db.connect();
  try {
    const registrationQuery = `
        SELECT 
          t.training_id,
          t.training_name,
          SUM(r.participant_count) AS total_participants,
          SUM(CASE WHEN r.status = 4 THEN r.participant_count ELSE 0 END) AS completed,
          SUM(CASE WHEN r.status IN (1, 2, 3) THEN r.participant_count ELSE 0 END) AS onprogress,
          SUM(CASE WHEN r.status = 5 THEN r.participant_count ELSE 0 END) AS cancelled
        FROM registration r
        JOIN training t ON r.training_id = t.training_id
        GROUP BY t.training_id, t.training_name
      `;

    const certificateQuery = `
        SELECT 
          t.training_id,
          COUNT(c.certificate_id) AS total_issued,
          COUNT(CASE WHEN c.expired_date >= CURRENT_DATE THEN 1 END) AS valid_certificate,
          COUNT(CASE WHEN c.expired_date < CURRENT_DATE THEN 1 END) AS expired_certificate
        FROM certificate c
        JOIN registration_participant rp ON c.registration_participant_id = rp.registration_participant_id
        JOIN registration r ON rp.registration_id = r.registration_id
        JOIN training t ON r.training_id = t.training_id
        GROUP BY t.training_id
      `;

    const [registrationResult, certificateResult] = await Promise.all([
      client.query(registrationQuery),
      client.query(certificateQuery),
    ]);

    // Map untuk merge data
    const certMap = new Map();
    certificateResult.rows.forEach((item) => {
      certMap.set(item.training_id, item);
    });

    const merged = registrationResult.rows.map((reg) => {
      const cert = certMap.get(reg.training_id) || {
        total_issued: 0,
        valid_certificate: 0,
        expired_certificate: 0,
      };
      return {
        training_id: reg.training_id,
        training_name: reg.training_name,
        registration: {
          total_participants: Number(reg.total_participants),
          completed: Number(reg.completed),
          onprogress: Number(reg.onprogress),
          cancelled: Number(reg.cancelled),
        },
        certificate: {
          total_issued: Number(cert.total_issued),
          valid: Number(cert.valid_certificate),
          expired: Number(cert.expired_certificate),
        },
      };
    });

    return sendSuccessResponse(res, "Training performance fetched", merged);
  } catch (err) {
    console.error("Training performance error:", err);
    return sendErrorResponse(res, "Failed to fetch training performance");
  } finally {
    client.release();
  }
};

// PART 6 - Top Trainings by Rating
exports.getTopTrainingsByRating = async (req, res) => {
  const client = await db.connect();
  try {
    const query = `
        SELECT 
          t.training_id,
          t.training_name,
          t.rating AS average_rating,
          COUNT(CASE WHEN rv.score = 5 THEN 1 END) AS score_5,
          COUNT(CASE WHEN rv.score = 4 THEN 1 END) AS score_4,
          COUNT(CASE WHEN rv.score = 3 THEN 1 END) AS score_3,
          COUNT(CASE WHEN rv.score = 2 THEN 1 END) AS score_2,
          COUNT(CASE WHEN rv.score = 1 THEN 1 END) AS score_1
        FROM training t
        LEFT JOIN registration r ON t.training_id = r.training_id
        LEFT JOIN registration_participant rp ON r.registration_id = rp.registration_id
        LEFT JOIN review rv ON rp.registration_participant_id = rv.registration_participant_id
        GROUP BY t.training_id, t.training_name, t.rating
        ORDER BY t.rating DESC;
      `;
    const result = await client.query(query);
    return sendSuccessResponse(res, "Top trainings fetched", result.rows);
  } catch (err) {
    console.error("Top trainings error:", err);
    return sendErrorResponse(res, "Failed to fetch top trainings");
  } finally {
    client.release();
  }
};

// PART 7 - Monthly Registrations
exports.getMonthlyRegistrations = async (req, res) => {
  const client = await db.connect();
  try {
    const query = `
      SELECT 
        TO_CHAR(registration_date, 'YYYY-MM') AS month, 
        COUNT(*) AS total_registrations,
        SUM(participant_count) AS total_participants
      FROM registration
      WHERE registration_date >= NOW() - INTERVAL '12 months'
      GROUP BY month
      ORDER BY month
    `;
    const result = await client.query(query);
    return sendSuccessResponse(
      res,
      "Monthly registrations fetched",
      result.rows,
    );
  } catch (err) {
    console.error("Monthly registrations error:", err);
    return sendErrorResponse(res, "Failed to fetch monthly registrations");
  } finally {
    client.release();
  }
};
