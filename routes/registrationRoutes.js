// efortech_backend\routes\registrationRoutes.js
const express = require("express");
const router = express.Router();
const {
  createRegistration,
  getRegistrations,
  getRegistrationById,
  updateRegistrationStatus,
  getRegistrationsByStatus,
  savePaymentProof,
  searchRegistrations,
  checkUserRegistration,
  deleteRegistration,
  deleteMultipleRegistrations,
  deleteAllCancelledRegistrations,
} = require("../controllers/registrationController");
const uploadFile = require("../middlewares/fileUpload");
const {
  sendSuccessResponse,
  sendErrorResponse,
} = require("../utils/responseUtils");

// POST /api/registration - Create a new training registration
router.post("/", createRegistration);

// GET /api/registration - Get all registrations with participant info
router.get("/", getRegistrations);

// GET /api/registration/status - Get registrations by status
router.get("/status", getRegistrationsByStatus);

// GET /api/registration/search - Search registrations various criteria
router.get("/search", searchRegistrations);

// GET /api/registration/check/:user_id/:training_id - Check if user already registered
router.get("/check/:user_id/:training_id", checkUserRegistration);

// GET /api/registration/:registration_id - Get registration by ID with participant info
router.get("/:registration_id", getRegistrationById);

// PUT /api/registration/:registration_id - Update registration status
router.put("/update/:registration_id", updateRegistrationStatus);

// PUT /api/registration/save-payment - Save payment proof
router.put("/save-payment", savePaymentProof);

// DELETE /api/registration/delete-all-cancelled - Delete all cancelled registrations
router.delete("/delete-all-cancelled", deleteAllCancelledRegistrations);

// DELETE /api/registration/delete-multiple - Delete multiple selected registrations
router.delete("/delete-multiple", deleteMultipleRegistrations);

// DELETE /api/registration/:registration_id - Delete a single registration
router.delete("/:registration_id", deleteRegistration);

// Upload payment proof file
router.post("/upload-payment", uploadFile, (req, res) => {
  if (!req.files || req.files.length === 0 || !req.files[0].fullUrl) {
    return sendErrorResponse(res, "Failed Upload");
  }
  return sendSuccessResponse(res, "Upload successful", {
    fileUrl: req.files[0].fullUrl,
  });
});

module.exports = router;
