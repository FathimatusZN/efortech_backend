const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { sendErrorResponse } = require("../utils/responseUtils");

const BASE_URL = process.env.BASE_URL;

const getFolderFromPath = (reqPath) => {
  if (reqPath.includes("/articles")) return "article_image";
  if (reqPath.includes("/user")) return "user_image";
  if (reqPath.includes("/training")) return "training_image";
  if (reqPath.includes("/partner")) return "partner_logo";
  if (reqPath.includes("/home")) return "home_content";
  return "misc_image";
};

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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("File must be an image"), false);
    }
    cb(null, true);
  },
}).array("images", 3);

module.exports = (req, res, next) => {
  upload(req, res, (err) => {
    if (err) {
      console.error("Upload error:", err);
      return sendErrorResponse(res, err.message || "Image upload error");
    }

    if (!req.files || req.files.length === 0) {
      return sendErrorResponse(res, "No image uploaded");
    }

    const folder = req.uploadFolder || "misc_image";
    req.files = req.files.map((file) => {
      const localPath = `/uploads/${folder}/${file.filename}`;
      const fullUrl = `${BASE_URL}${localPath}`;
      file.localFilePath = localPath;
      file.fullUrl = fullUrl;
      console.log("Saved file URL to DB:", fullUrl); // LOG untuk debug
      return file;
    });

    next();
  });
};
