const express = require("express");
const router = express.Router();
const {
  addPartner,
  getAllPartners,
  getPartnerById,
  editPartner,
  deletePartner,
  softDeletePartner,
  searchPartners,
} = require("../controllers/partnerController");
const uploadFile = require("../middlewares/imageUpload");
const {
  sendSuccessResponse,
  sendErrorResponse,
} = require("../utils/responseUtils");

// Get all partners (optional filters via query: category, status)
router.get("/", getAllPartners);

// Add a new partner
router.post("/", addPartner);

// Search or filter partner
router.get("/search", searchPartners);

// Get partner details by ID
router.get("/:id", getPartnerById);

// Update partner
router.put("/edit/:id", editPartner);

// Delete partner
router.delete("/delete/:id", deletePartner);

// Soft delete (archive)
router.put("/archive/:id", softDeletePartner);

// Upload partner logo
router.post("/partner_logo", uploadFile, (req, res) => {
  if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
    return sendErrorResponse(res, "No image uploaded");
  }

  const uploadedImage = req.files[0];

  if (!uploadedImage.fullUrl) {
    return sendErrorResponse(res, "Upload failed: No public URL found");
  }

  return sendSuccessResponse(res, "Upload successful", {
    imageUrl: uploadedImage.fullUrl,
  });
});

module.exports = router;
