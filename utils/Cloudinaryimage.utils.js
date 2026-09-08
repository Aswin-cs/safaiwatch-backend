import cloudinary from "../config/cloudinaryConfig.js";

const uploadToCloudinary = async (file, folder = "safaiWatch") => {
      try {
            const result = await cloudinary.uploader.upload(file, {
                  folder,
                  resource_type: "auto"
            });
            return result;
      } catch (error) {
            console.log(error);
            throw error;
      }
}

const deleteFromCloudinary = async (publicId) => {
      try {
            const result = await cloudinary.uploader.destroy(publicId);
            return result;
      } catch (error) {
            throw error;
      }
}

const uploadMultipleToCloudinary = async (files) => {
      try {
            const result = await cloudinary.uploader.upload(files);
            return result;
      } catch (error) {
            throw error;
      }
}

const transFormImage = async (publicId, queries = {}) => {
      try {
            return await cloudinary.url(publicId, {
                  secure: true,
                  transformation: [
                        ...queries
                  ]
            });
      } catch (error) {
            throw error;
      }
}

export {
      uploadToCloudinary,
      deleteFromCloudinary,
      uploadMultipleToCloudinary,
      transFormImage
}