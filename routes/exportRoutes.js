const express = require("express");
const router = express.Router();
const {
  exportUsers,
  exportRegistrationsNeedProcess,
  exportRegistrationsOnProgress,
  exportRegistrationsCompleted,
  exportRegistrationsCancelled,
} = require("../controllers/exportController");

// GET /api/export - Export user data (all/custom)
router.get("/users", exportUsers);

// GET /api/export/registrations/needprocess - Export registration training data (status 1-3)
router.get("/registrations/needprocess", exportRegistrationsNeedProcess);

// GET /api/export/registrations/onprogress - Export registration training data (status 4, attendance_status = null or true)
router.get("/registrations/onprogress", exportRegistrationsOnProgress);

// GET /api/export/registrations/completed - Export registration training data (status 4, attendance_status = true or false)
router.get("/registrations/completed", exportRegistrationsCompleted);

// GET /api/export/registrations/cancelled - Export registration training data (status 5)
router.get("/registrations/cancelled", exportRegistrationsCancelled);

module.exports = router;
