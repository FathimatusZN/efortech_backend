const express = require("express");
const router = express.Router();
const { exportUsers } = require("../controllers/exportController");

// GET /api/export - Export user data (all/custom)
router.get("/users", exportUsers);

module.exports = router;
