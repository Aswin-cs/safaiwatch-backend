import mongoose from "mongoose";

const oneTimeSchema = new mongoose.Schema({
      guestureImage: {
            type: String,
      },
      imageId: {
            type: String,
      },
      coordinates: {
            type: [Number],
            required: true,
            default: [0, 0]
      },
      user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
      },

      feedbackImage: {
            type: String,
      },
      feedbackImageId: {
            type: String,
      },
      expiresAt: {
            type: Date,
            required: true
      }
}, { timestamps: true })

export default mongoose.model("OneTime", oneTimeSchema) || mongoose.models.OneTime;