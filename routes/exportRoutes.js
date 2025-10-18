const express = require("express");
const router = express.Router();
const {
  exportUsers,
  exportRegistrationsNeedProcess,
} = require("../controllers/exportController");

// GET /api/export - Export user data (all/custom)
router.get("/users", exportUsers);

// GET /api/export/registrations/needprocess - Export registration training data (status 1-3)
router.get("/registrations/needprocess", exportRegistrationsNeedProcess);

module.exports = router;
