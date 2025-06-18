const express = require("express");
const router = express.Router();
const {
  createUserCertificate,
  createUserCertificateByAdmin,
  getUserCertificates,
  getUserCertificateById,
  searchUserCertificates,
  updateUserCertificateStatus,
} = require("../controllers/userCertificateController");
const uploadFile = require("../middlewares/fileUpload");
const {
  sendSuccessResponse,
  sendErrorResponse,
} = require("../utils/responseUtils");

// POST /api/ucertificate - Create a new user certificate
router.post("/", createUserCertificate);

// POST /api/ucertificate/create-by-admin - Create a new user certificate (by admin)
router.post("/create-by-admin", createUserCertificateByAdmin);

// PUT /api/ucertificates/update-status
router.put("/update-status", updateUserCertificateStatus);

// GET /api/ucertificate - get all user certificates
router.get("/", getUserCertificates);

// GET /api/ucertificate/search - search user certificate by query
router.get("/search", searchUserCertificates);

// GET /api/ucertificate/:id - get user certificate by ID
router.get("/:id", getUserCertificateById);

// Upload certificate file
router.post("/upload-ucertificate", uploadFile, (req, res) => {
  if (!req.files || req.files.length === 0 || !req.files[0].fullUrl) {
    return sendErrorResponse(res, "Failed Upload");
  }
  return sendSuccessResponse(res, "Upload successful", {
    fileUrl: req.files[0].fullUrl,
  });
});

module.exports = router;
