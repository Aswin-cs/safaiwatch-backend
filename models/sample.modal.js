import mongoose from "mongoose";

const otpSchema = new mongoose.Schema({
      otp: {
            type: String,
      },
      otpVerified: {
            type: Boolean,

            required: true,
            default: false
      },
      email: {
            type: String,
            required: true
      },
      name: {
            type: String,
            required: true
      },
      avatarUrl: {
            type: String,
      },
      provider: {
            type: String,
            required: true,
            enum: ["google", "email"],
      },
      providerId: {
            type: String,
      },
      createdAt: {
            type: Date,
            default: Date.now
      },


      expiresAt: {
            type: Date,
            required: true
      }

}, { timestamps: true });

export default mongoose.model("Otp", otpSchema) || mongoose.models.Otp;