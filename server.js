require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { auth, db } = require("./config/firebase");

const app = express();

// Middleware
app.use(bodyParser.json({ limit: "5mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "5mb" }));

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://edu.efortechsolutions.com",
      "http://157.66.34.124/",
    ],
  })
);
app.use(express.json());

// Import & gunakan routes
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes");
const articleRoutes = require("./routes/articleRoutes");
const manageAdminRoutes = require("./routes/manageAdminRoutes");
const trainingRoutes = require("./routes/trainingRoutes");
const registrationRoutes = require("./routes/registrationRoutes");
const certificateRoutes = require("./routes/certificateRoutes");
const enrollmentRoutes = require("./routes/enrollmentRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const userCertificateRoutes = require("./routes/userCertificateRoutes");
const allCertificateRoutes = require("./routes/allCertificateRoutes");
const partnerRoutes = require("./routes/partnerRoutes");
const emailRoutes = require("./routes/emailRoutes");
const homeRoutes = require("./routes/homeRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/articles", articleRoutes);
app.use("/api/manageadmin", manageAdminRoutes);
app.use("/api/training", trainingRoutes);
app.use("/api/registration", registrationRoutes);
app.use("/api/certificate", certificateRoutes);
app.use("/api/enrollment", enrollmentRoutes);
app.use("/api/review", reviewRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/ucertificate", userCertificateRoutes);
app.use("/api/certificates", allCertificateRoutes);
app.use("/api/partner", partnerRoutes);
app.use("/api/email", emailRoutes);
app.use("/api/home", homeRoutes);

// Test API
app.get("/api/message", (req, res) => {
  res.json({ message: "Welcome to Efortech Edu!" });
});

app.get("/", (req, res) => {
  res.send("Backend is running...");
});

app.use("/uploads", express.static("uploads"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
