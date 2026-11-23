const multer = require('multer');

// Store files in memory buffer for direct streaming to Cloudinary
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG, WEBP, etc.) are allowed!'), false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit per image
    files: 5,                  // Max 5 images
  },
  fileFilter,
});

// Middleware accepting up to 5 files on the 'images' field
const uploadProductImages = (req, res, next) => {
  upload.array('images', 5)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
          success: false,
          message: 'Too many files uploaded. Maximum 5 images allowed.',
        });
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File size exceeds limit of 5MB per image.',
        });
      }
      return res.status(400).json({
        success: false,
        message: `Upload error: ${err.message}`,
      });
    } else if (err) {
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }
    next();
  });
};

module.exports = {
  upload,
  uploadProductImages,
};
