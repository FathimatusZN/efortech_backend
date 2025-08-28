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

// GET /api/registration/participants - Get completed registration participants
router.get("/participants", getCompletedParticipants);

// GET /api/registration/history/:user_id - Get training history for a specific user
router.get("/history/:user_id", getUserTrainingHistory);

// PUT /api/registration/attendance/:registration_participant_id - Update attendance status
router.put("/attendance/:registration_participant_id", updateAttendanceStatus);

// PUT /api/registration/attendances - Update multiple attendance status
router.put("/attendances", updateMultipleAttendanceStatus);

// PUT /api/registration/update-advantech-link - save advantech certificate link
router.put("/update-advantech-link", updateAdvantechCertificate);

// Upload advantech certificate file
router.post("/upload-advantech-certificate", uploadFile, (req, res) => {
  if (!req.files || req.files.length === 0 || !req.files[0].fullUrl) {
    return sendErrorResponse(res, "Failed Upload");
  }
  return sendSuccessResponse(res, "Upload successful", {
    fileUrl: req.files[0].fullUrl,
  });
});

module.exports = router;
