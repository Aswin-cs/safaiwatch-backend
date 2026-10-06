import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
      username: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
      },
      previousUsernames: {
            type: [{
                  username: {
                        type: String,
                        trim: true,
                  },
                  changedAt: {
                        type: Date,
                        default: Date.now
                  }
            }]
      },
      previousAvatar: {
            type: [{
                  url: {
                        type: String
                  },
                  id: {
                        type: String
                  },
                  changedAt: {
                        type: Date,
                        default: Date.now
                  }
            }],
      },
      email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
      },
      role: {
            type: String,
            required: true,
            enum: ['Civilian', 'Coordinator', 'Hybrid'],
            default: 'Civilian'
      },
      avatar: {
            type: {
                  url: {
                        type: String
                  },
                  id: {
                        type: String
                  }
            },
            default: {
                  url: '',
                  id: ''
            }
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

// Virtual getter for id returning unique username instead of internal MongoDB _id
userSchema.virtual("id").get(function () {
      return this.username;
});

// Configure toJSON and toObject transforms to omit _id/__v and provide username as id
userSchema.set("toJSON", {
      virtuals: true,
      transform: function (doc, ret) {
            delete ret._id;
            delete ret.__v;
            ret.id = ret.username;
            return ret;
      },
});

userSchema.set("toObject", {
      virtuals: true,
      transform: function (doc, ret) {
            delete ret._id;
            delete ret.__v;
            ret.id = ret.username;
            return ret;
      },
});

export default mongoose.model("User", userSchema) || mongoose.models.User;