const express = require("express");
const router = express.Router();
const {
  exportUsers,
  exportRegistrationsNeedProcess,
  exportRegistrationsOnProgress,
  exportRegistrationsCompleted,
  exportRegistrationsCancelled,
} = require("../controllers/exportController");
const { verifyToken, verifyRoles } = require("../middlewares/authMiddleware");

// GET /api/export - Export user data (all/custom)
router.get("/users", verifyToken, verifyRoles(["role3"]), exportUsers);

// GET /api/export/registrations/needprocess - Export registration training data (status 1-3)
router.get(
  "/registrations/needprocess",
  verifyToken,
  verifyRoles(["role2", "role3"]),
  exportRegistrationsNeedProcess
);

// GET /api/export/registrations/onprogress - Export registration training data (status 4, attendance_status = null or true)
router.get(
  "/registrations/onprogress",
  verifyToken,
  verifyRoles(["role2", "role3"]),
  exportRegistrationsOnProgress
);

// GET /api/export/registrations/completed - Export registration training data (status 4, attendance_status = true or false)
router.get(
  "/registrations/completed",
  verifyToken,
  verifyRoles(["role2", "role3"]),
  exportRegistrationsCompleted
);

// GET /api/export/registrations/cancelled - Export registration training data (status 5)
router.get(
  "/registrations/cancelled",
  verifyToken,
  verifyRoles(["role2", "role3"]),
  exportRegistrationsCancelled
);

module.exports = router;
