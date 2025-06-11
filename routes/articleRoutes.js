const express = require("express");
const {
  addArticle,
  getArticles,
  getArticleById,
  deleteArticle,
  updateArticle,
  searchArticles,
  getArticlesByCategory,
  getArticlesByTag,
  updateViewsArticle,
} = require("../controllers/articleController");
const {
  sendSuccessResponse,
  sendErrorResponse,
} = require("../utils/responseUtils");

const uploadFile = require("../middlewares/imageUpload");
const router = express.Router();

// Endpoint for adding an article
router.post("/add", addArticle);

// Endpoint for updating article views
router.patch("/update-views/:article_id", updateViewsArticle);

// Endpoint for getting all articles
router.get("/", getArticles);

// Endpoint for searching articles
router.get("/search", searchArticles);

// Endpoint for getting articles by category
router.get("/category/:category", getArticlesByCategory);

// Endpoint for getting articles by tag
router.get("/tag/:tag_text", getArticlesByTag);

// Endpoint for getting an article by ID
router.get("/:id", getArticleById);

// Endpoint for deleting an article by ID
router.delete("/:id", deleteArticle);

// Endpoint for updating an article by ID
router.put("/update/:id", updateArticle);

// Endpoint for uploading an image
router.post("/upload-image", uploadFile, (req, res) => {
  if (!req.files || req.files.length === 0 || !req.files[0].fullUrl) {
    return sendErrorResponse(res, "Failed Upload");
  }
  return sendSuccessResponse(res, "Upload successful", {
    imageUrl: req.files[0].fullUrl,
  });
});

module.exports = router;
