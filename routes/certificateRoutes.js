const express = require("express");
const router = express.Router();
const {
  createCertificate,
  getCertificates,
  getCertificateById,
  getDownloadCertificate,
  searchCertificates,
  deleteCertificate,
  updateCertificate,
} = require("../controllers/certificateController");
const uploadFile = require("../middlewares/fileUpload");
const {
  sendSuccessResponse,
  sendErrorResponse,
} = require("../utils/responseUtils");

// POST /api/certificate - Create a new training certificate
router.post("/", createCertificate);

// PUT /api/certificate/update - Update existing certificate
router.put("/update", updateCertificate);

// GET /api/certificate - Get all certificates
router.get("/", getCertificates);

// GET /api/certificate/search - Search for certificates by various criteria
router.get("/search", searchCertificates);

// GET /api/certificate/:certificate_id - Get a certificate by ID
router.get("/:certificate_id", getCertificateById);

// GET /api/certificate/download/:registration_participant_id - Get a certificate by ID Participant
router.get("/download/:registration_participant_id", getDownloadCertificate);

// DELETE /api/certificate/:certificate_id - Delete a certificate by ID
router.delete("/:certificate_id", deleteCertificate);

// Upload certificate file
router.post("/upload-certificate", uploadFile, (req, res) => {
  if (!req.files || req.files.length === 0 || !req.files[0].fullUrl) {
    return sendErrorResponse(res, "Failed Upload");
  }
  return sendSuccessResponse(res, "Upload successful", {
    fileUrl: req.files[0].fullUrl,
  });
});

module.exports = router;
