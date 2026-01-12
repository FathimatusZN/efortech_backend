const express = require("express");
const {
  getUserProfile,
  changePassword,
  updateUserProfile,
  searchUserByEmail,
  getUserProfileNoToken,
  getAllUsers,
  checkUserProfileCompletion,
} = require("../controllers/userController");
const { verifyToken, verifyRoles } = require("../middlewares/authMiddleware");
const uploadFile = require("../middlewares/imageUpload");
const {
  sendSuccessResponse,
  sendErrorResponse,
} = require("../utils/responseUtils");

const router = express.Router();

// GET - User profile route
router.get("/me", verifyToken, getUserProfile);

// GET - User List
router.get("/list", verifyToken, verifyRoles(["role2", "role3"]), getAllUsers);

// GET - Search User by Email
router.get("/search", searchUserByEmail);

// GET - User profile (no token)
router.get("/:userId", getUserProfileNoToken);

// GET - Check user profile completion
router.get("/profile/:user_id/", checkUserProfileCompletion);

// POST - Change password route
router.post("/change-password", verifyToken, changePassword);

// PUT - Update user profile route
router.put("/edit-profile", verifyToken, updateUserProfile);

// POST - Endpoint for uploading user image
router.post("/upload-user-photo", uploadFile, (req, res) => {
  if (!req.files || req.files.length === 0 || !req.files[0].fullUrl) {
    return sendErrorResponse(res, "Failed Upload");
  }
  return sendSuccessResponse(res, "Upload successful", {
    imageUrl: req.files[0].fullUrl,
  });
});

module.exports = router;
