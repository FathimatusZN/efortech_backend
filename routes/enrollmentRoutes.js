const express = require("express");
const router = express.Router();
const {
  updateAttendanceStatus,
  updateMultipleAttendanceStatus,
  getCompletedParticipants,
  getUserTrainingHistory,
  updateAdvantechCertificate,
} = require("../controllers/enrollmentController");
const uploadFile = require("../middlewares/fileUpload");
const {
  sendSuccessResponse,
  sendErrorResponse,
} = require("../utils/responseUtils");

// GET /api/enrollment/participants - Get completed registration participants
router.get("/participants", getCompletedParticipants);

// GET /api/enrollment/history/:user_id - Get training history for a specific user
router.get("/history/:user_id", getUserTrainingHistory);

// PUT /api/enrollment/attendance/:registration_participant_id - Update attendance status
router.put("/attendance/:registration_participant_id", updateAttendanceStatus);

// PUT /api/enrollment/attendances - Update multiple attendance status
router.put("/attendances", updateMultipleAttendanceStatus);

// PUT /api/enrollment/update-advantech-link - save advantech certificate links (supports multiple files)
router.put("/update-advantech-link", updateAdvantechCertificate);

// POST /api/enrollment/upload-advantech-certificate - Upload advantech certificate files (1-3 files)
router.post("/upload-advantech-certificate", uploadFile, (req, res) => {
  if (!req.files || req.files.length === 0) {
    return sendErrorResponse(res, "Failed Upload: No files uploaded");
  }

  const fileUrls = req.files.map((file) => file.fullUrl);

  return sendSuccessResponse(res, "Upload successful", {
    fileUrls,
    count: fileUrls.length,
  });
});

module.exports = router;
