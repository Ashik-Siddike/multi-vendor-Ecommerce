const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/**
 * Upload a memory buffer to Cloudinary using upload_stream
 * @param {Buffer} buffer - File buffer from Multer memoryStorage
 * @param {string} folder - Target folder in Cloudinary
 * @returns {Promise<string>} Uploaded secure URL
 */
const uploadBufferToCloudinary = (buffer, folder = 'multivendor_ecommerce/products') => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    uploadStream.end(buffer);
  });
};

module.exports = {
  cloudinary,
  uploadBufferToCloudinary,
};
