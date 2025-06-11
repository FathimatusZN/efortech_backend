const express = require("express");
const router = express.Router();
const homeController = require("../controllers/homeController");
const uploadFile = require("../middlewares/imageUpload");
const {
  sendSuccessResponse,
  sendErrorResponse,
} = require("../utils/responseUtils");

// Endpoint for get all home content
router.get("/", homeController.getAllHomeContent);

// Endpoint for get home content by id
router.get("/:content_id", homeController.getHomeContentById);

// Endpoint for update home content by id
router.put("/:content_id", homeController.updateHomeContentById);

// Endpoint for uploading home content (image)
router.post("/upload-home-content", uploadFile, (req, res) => {
  if (!req.files || req.files.length === 0 || !req.files[0].fullUrl) {
    return sendErrorResponse(res, "Failed Upload");
  }
  return sendSuccessResponse(res, "Upload successful", {
    imageUrl: req.files[0].fullUrl,
  });
});

module.exports = router;
