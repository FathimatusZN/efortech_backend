const express = require("express");
const {
  registerUser,
  loginUser,
  registerGoogleUser,
} = require("../controllers/authController");

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/register-google", registerGoogleUser);

module.exports = router;
