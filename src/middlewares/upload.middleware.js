import multer from "multer";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB limit

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only image files (JPG, PNG, WEBP, GIF, SVG) are allowed."), false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_SIZE,
  },
  fileFilter,
}).single("avatar");

export const uploadAvatarMiddleware = (req, res, next) => {
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          message: "Profile picture size exceeds 5MB limit. Please select an image under 5MB.",
        });
      }
      return res.status(400).json({
        success: false,
        message: `Image upload error: ${err.message}`,
      });
    } else if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || "Invalid image file uploaded.",
      });
    }
    next();
  });
};
