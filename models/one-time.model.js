import mongoose from "mongoose";

const oneTimeSchema = new mongoose.Schema({
      user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
      },
      markspotid: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Markspot",
            required: true
      },
      forWhat: {
            type: String,
            enum: ["completeSpot", "reportSpot", "reportCleanUp", "reportCleanup", "reportCompleteSpot"]
      },
      image: {
            type: String,
      },
      imageId: {
            type: String,
      },
      guestureImage: {
            type: String,
      },
      guestureImageId: {
            type: String,
      },
      code: {
            type: String,
      },
      message: {
            type: String,
            default: ""
      },
      status: {
            type: String,
            enum: ["pending", "verified", "failed"],
            default: "pending"
      },
      isVerified: {
            type: Boolean,
            default: false
      },
      aiAuditResult: {
            type: mongoose.Schema.Types.Mixed,
      },
      expirationDate: {
            type: Date,
            default: () => new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
}, { timestamps: true })

export default mongoose.model("OneTime", oneTimeSchema) || mongoose.models.OneTime;