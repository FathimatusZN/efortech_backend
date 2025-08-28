const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { sendErrorResponse } = require("../utils/responseUtils");

const getFolderFromPath = (reqPath) => {
  if (reqPath.includes("/registration")) return "registration_payment";
  if (reqPath.includes("/certificate")) return "certificate_files";
  if (reqPath.includes("/ucertificate")) return "user_certificate_files";
  if (reqPath.includes("/enrollment")) return "advantech_cert_files";
  return "misc_files";
};

const BASE_URL = process.env.BASE_URL;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = getFolderFromPath(req.originalUrl);
    const fullPath = path.join(__dirname, "..", "uploads", folder);
    fs.mkdirSync(fullPath, { recursive: true });
    req.uploadFolder = folder;
    cb(null, fullPath);
  },
  filename: (req, file, cb) => {
    const timestamp = new Date()
      .toISOString()
      .replace(/[-T:.Z]/g, "")
      .slice(0, 14);
    const safeName = file.originalname.replace(/\s+/g, "_");
    cb(null, `${timestamp}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedImageMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/jpg",
      "image/heic",
      "image/webp",
    ];
    const allowedFileMimeTypes = ["application/pdf", "application/msword"];
    if (
      allowedImageMimeTypes.includes(file.mimetype) ||
      allowedFileMimeTypes.includes(file.mimetype)
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only image, PDF, or DOCX files are allowed"), false);
    }
  },
}).array("files", 3);

module.exports = (req, res, next) => {
  upload(req, res, (err) => {
    if (err) {
      console.error("Upload error:", err);

      if (err.code === "LIMIT_FILE_SIZE") {
        return sendErrorResponse(res, "File too large, maximum 10MB");
      }

      return sendErrorResponse(res, err.message || "File upload error");
    }
    if (!req.files || req.files.length === 0) {
      return sendErrorResponse(res, "No file uploaded");
    }

    const folder = req.uploadFolder || "misc_files";
    req.files = req.files.map((file) => {
      file.localFilePath = `/uploads/${folder}/${file.filename}`;
      file.fullUrl = `${BASE_URL}/uploads/${folder}/${file.filename}`;
      console.log("Saved file URL to DB:", file.fullUrl);
      return file;
    });
    next();
  });
};
