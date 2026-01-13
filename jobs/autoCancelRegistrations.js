// efortech_backend\jobs\autoCancelRegistrations.js
const cron = require("node-cron");
const db = require("../config/db");

/**
 * Core function to cancel overdue registrations
 * This function can be called manually or by cron job
 */
const executeCancelJob = async () => {
  console.log(
    `[${new Date().toISOString()}] Running auto-cancel registrations job...`
  );

  const client = await db.connect();
  try {
    // Calculate the cutoff date (current date - 14 days in WIB timezone)
    const now = new Date();
    now.setHours(now.getHours() + 7); // Convert to WIB (GMT+7)
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - 14);

    // Format date for SQL comparison (YYYY-MM-DD)
    const cutoffDateString = cutoffDate.toISOString().split("T")[0];

    console.log(
      `[${new Date().toISOString()}] Cutoff date: ${cutoffDateString} (training_date <= this date will be cancelled)`
    );

    // Update registrations where:
    // - status is 1, 2, or 3 (pending, confirmed, or in-progress)
    // - training_date + 14 days < current date
    // Change status to 5 (cancelled)
    const updateQuery = `
      UPDATE registration 
      SET status = 5
      WHERE 
        status IN (1, 2, 3)
        AND training_date <= $1
      RETURNING registration_id, training_id, training_date, status
    `;

    const result = await client.query(updateQuery, [cutoffDateString]);

    console.log(
      `[${new Date().toISOString()}] Auto-cancel job completed: ${
        result.rowCount
      } registration(s) changed to status 5 (cancelled)`
    );

    // Log which registrations were cancelled
    if (result.rowCount > 0) {
      console.log(`Cancelled registrations:`);
      result.rows.forEach((r) => {
        console.log(
          `  - ID: ${r.registration_id}, Training Date: ${r.training_date}, New Status: ${r.status}`
        );
      });
    } else {
      console.log(`  No registrations to cancel.`);
    }

    return {
      success: true,
      count: result.rowCount,
      cancelled: result.rows,
    };
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Auto-cancel job error:`, err);
    return {
      success: false,
      error: err.message,
    };
  } finally {
    client.release();
  }
};

/**
 * Auto-cancel registrations that have passed training_date + 14 days
 * Status 1, 2, or 3 will be changed to 5 (cancelled)
 * Runs every day at midnight (00:00) WIB (GMT+7)
 */
const autoCancelRegistrations = () => {
  // Schedule: Run at 00:00 WIB every day
  // Cron format: second minute hour day month weekday
  // Using timezone for Jakarta (Asia/Jakarta = GMT+7)
  cron.schedule(
    "0 0 * * *",
    async () => {
      await executeCancelJob();
    },
    {
      scheduled: true,
      timezone: "Asia/Jakarta", // GMT+7
    }
  );

  console.log(
    "Auto-cancel registrations job scheduled (00:00 WIB daily) - Status 1/2/3 → 5 after training_date + 14 days"
  );
};

// Export both the scheduled job and the manual execution function
module.exports = autoCancelRegistrations;
module.exports.executeCancelJob = executeCancelJob;
