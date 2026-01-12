// efortech_backend\routes\exportRoutes.js
const express = require("express");
const router = express.Router();
const {
  exportUsers,
  exportRegistrationsNeedProcess,
  exportRegistrationsOnProgress,
  exportRegistrationsCompleted,
  exportRegistrationsCancelled,
  exportTrainingCertificates,
  exportUserCertificates,
  exportAllCertificates,
  exportTrainingData,
  exportArticlesData,
} = require("../controllers/exportController");
const { verifyToken, verifyRoles } = require("../middlewares/authMiddleware");

// GET /api/export/users - Export user data (all/custom)
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

// GET /api/export/trainingcertificates - Export training certificates
router.get(
  "/trainingcertificates",
  verifyToken,
  verifyRoles(["role2", "role3"]),
  exportTrainingCertificates
);

// GET /api/export/usercertificates - Export User uploaded certificates
router.get(
  "/usercertificates",
  verifyToken,
  verifyRoles(["role2", "role3"]),
  exportUserCertificates
);

// GET /api/export/allcertificates - Export all certificates (training + user upload)
router.get(
  "/allcertificates",
  verifyToken,
  verifyRoles(["role2", "role3"]),
  exportAllCertificates
);

// GET /api/export/training - Export training data with insights
router.get(
  "/training",
  verifyToken,
  verifyRoles(["role2", "role3"]),
  exportTrainingData
);

// GET /api/export/articles - Export articles data
router.get(
  "/articles",
  verifyToken,
  verifyRoles(["role2", "role3"]),
  exportArticlesData
);

module.exports = router;
