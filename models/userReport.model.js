import mongoose from "mongoose";

const userReportSchema = new mongoose.Schema({
      user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
      },
      whichUsers: {
            type: [
                  {
                        userId: {
                              type: mongoose.Schema.Types.ObjectId,
                              ref: 'User'
                        },
                        reason: {
                              type: String,
                              enum: ["manipulated image", "not finished duty"],
                              required: true
                        },
                        description: {
                              type: String,
                              required: true
                        },
                        Basedon: {
                              type: mongoose.Schema.Types.ObjectId,
                              ref: 'UserStatus'
                        },
                        status: {
                              type: String,
                              enum: ["pending", "approved", "rejected"],
                              default: "pending"
                        }
                  }
            ],
            default: []
      },
      pendingCount: {
            type: Number,
            default: 0
      },
      approvedCount: {
            type: Number,
            default: 0
      },
      rejectedCount: {
            type: Number,
            default: 0
      },
});

export const UserReport = mongoose.model("UserReport", userReportSchema);