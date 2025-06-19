require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { auth, db } = require("./config/firebase");
const cleanupUploadsJob = require("./jobs/cleanupUploads");

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

app.use("/auth", authRoutes);
app.use("/user", userRoutes);
app.use("/admin", adminRoutes);
app.use("/articles", articleRoutes);
app.use("/manageadmin", manageAdminRoutes);
app.use("/training", trainingRoutes);
app.use("/registration", registrationRoutes);
app.use("/certificate", certificateRoutes);
app.use("/enrollment", enrollmentRoutes);
app.use("/review", reviewRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/ucertificate", userCertificateRoutes);
app.use("/certificates", allCertificateRoutes);
app.use("/partner", partnerRoutes);
app.use("/email", emailRoutes);
app.use("/home", homeRoutes);

// Test API
app.get("/message", (req, res) => {
  res.json({ message: "Welcome to Efortech Edu!" });
});

app.get("/", (req, res) => {
  res.send("Backend is running...");
});

app.use("/uploads", express.static("uploads"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Optional: run manually for test
cleanupUploadsJob();
