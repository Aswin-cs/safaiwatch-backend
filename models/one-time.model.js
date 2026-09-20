import mongoose from "mongoose";

const oneTimeSchema = new mongoose.Schema({
      guestureImage: {
            type: String,
      },
      imageId: {
            type: String,
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
      }
}, { timestamps: true })

export default mongoose.model("OneTime", oneTimeSchema);