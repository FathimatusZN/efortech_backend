/**
 * Scheduled job to cleanup unused uploaded files
 * - This script runs periodically (monthly) to remove files under /uploads that are no longer referenced in the database.
 * - It queries all columns that store file/image URLs, and deletes any physical files not present in those URLs.
 */

const cron = require("node-cron");
const fs = require("fs/promises");
const path = require("path");
const db = require("../config/db");
require("dotenv").config();

// Base uploads directory
const uploadsDir = path.join(__dirname, "../uploads/");

// The actual cleanup task
async function cleanupUnusedUploads() {
  try {
    console.log("=== Cleanup Job: Start ===");

    // 1. Query active URLs from DB
    const { rows } = await db.query(`
      SELECT cert_file AS url FROM user_certificates WHERE cert_file IS NOT NULL
      UNION
      SELECT payment_proof AS url FROM registration WHERE payment_proof IS NOT NULL
      UNION
      SELECT cert_file AS url FROM certificate WHERE cert_file IS NOT NULL
      UNION
      SELECT content_link AS url FROM home_content WHERE content_link IS NOT NULL
      UNION
      SELECT partner_logo AS url FROM partners WHERE partner_logo IS NOT NULL
      UNION
      SELECT user_photo AS url FROM users WHERE user_photo IS NOT NULL
      UNION
      SELECT unnest(images) AS url FROM articles WHERE images IS NOT NULL
      UNION
      SELECT unnest(images) AS url FROM training WHERE images IS NOT NULL
      UNION
      SELECT advantech_cert AS url FROM registration_participant WHERE advantech_cert IS NOT NULL
    `);

    // 2. Extract relative file paths
    const activeFiles = rows
      .map((row) => {
        const url = row.url;
        // Strip base URL → get relative path
        return url?.replace(`${process.env.BASE_URL}/uploads/`, "");
      })
      .filter(Boolean);

    // 3. Read all folders inside /uploads
    const filesInFolder = await fs.readdir(uploadsDir, { withFileTypes: true });

    // 4. Walk through each subfolder
    for (const entry of filesInFolder) {
      if (entry.isDirectory()) {
        const subFiles = await fs.readdir(path.join(uploadsDir, entry.name));

        for (const subFile of subFiles) {
          const relPath = `${entry.name}/${subFile}`;

          // 5. If not found in activeFiles → delete
          if (!activeFiles.includes(relPath)) {
            await fs.unlink(path.join(uploadsDir, relPath));
            console.log(`Deleted unused file: ${relPath}`);
          }
        }
      }
    }

    console.log("=== Cleanup Job: Done ===");
  } catch (err) {
    console.error("Cleanup job failed:", err);
  }
}

// Schedule: run at 03:00 AM on the 1st day of each month
cron.schedule("0 3 1 * *", cleanupUnusedUploads);

// Export in case you want to manually test
module.exports = cleanupUnusedUploads;
