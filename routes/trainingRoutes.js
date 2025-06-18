const express = require("express");
const router = express.Router();
const {
  addTraining,
  updateTraining,
  deleteTraining,
  softDeleteTraining,
  getTrainings,
  getTrainingById,
  searchTraining,
} = require("../controllers/trainingController");
const uploadFile = require("../middlewares/imageUpload");
const {
  sendSuccessResponse,
  sendErrorResponse,
} = require("../utils/responseUtils");

// Get all trainings (optional filters via query: status, level, skill, created_date)
router.get("/", getTrainings);

// Get detail training by ID
router.get("/id/:training_id", getTrainingById);

// Add training
router.post("/", addTraining);

// Update training
router.put("/update/:training_id", updateTraining);

// Delete training
router.delete("/delete/:training_id", deleteTraining);

// Soft delete (archive)
router.put("/archive/:training_id", softDeleteTraining);

// Upload image
router.post("/upload-training-image", uploadFile, (req, res) => {
  if (!req.files || req.files.length === 0 || !req.files[0].fullUrl) {
    return sendErrorResponse(res, "Failed Upload");
  }
  return sendSuccessResponse(res, "Upload successful", {
    imageUrl: req.files[0].fullUrl,
  });
});

module.exports = router;
