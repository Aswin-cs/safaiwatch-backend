import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
      username: {
            type: String,
            required: true,

      },
      email: {
            type: String,
            required: true,
            unique: true
      },
      role: {
            type: String,
            required: true,
            enum: ['Civilian', 'Coordinator', 'Hybrid'],
            default: 'Civilian'
      },
      avatarUrl: {
            type: String,
            default: ''
      },
      certificatePreferences: {
            includePhoto: { type: Boolean, default: true },
            displayName: { type: String }
      },
      address: {
            type: String,
            required: true,
      },
      pincode: {
            type: String,
            required: true,
      },
      geolocation: {
            type: {
                  type: String, // Don't forget the type! Default is 'Point'
                  enum: ['Point'], // Ensure it's always a point
                  required: true
            },
            coordinates: {
                  type: [Number], // [longitude, latitude]
                  required: true
            }, default: {}

      },
      accountActive: {
            type: String,
            enum: ["none", "blacklist", "ban"],
            default: "none"
      },
      isVerified: {
            type: Boolean,
            required: true
      },
      Accprovider: {
            type: String,
            enum: ['email', 'google'],
            default: "email",
            required: true
      },
      ProviderId: {
            type: String,
            default: "email123"
      },
      isProfileCompleted: {
            type: Boolean,
            default: false
      },
      lastActiveAt: { type: Date },

});

export default mongoose.model("User", userSchema) || mongoose.models.User;