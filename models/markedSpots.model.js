import mongoose from "mongoose";

const markedSpotsSchema = new mongoose.Schema(
      {
            address: {
                  type: String,
                  required: true
            },
            type: {
                  type: String,
                  enum: ['Point'],
                  required: true
            },
            coordinates: {
                  type: [Number],
                  required: true
            },
            description: {
                  type: String,
                  required: true
            },
            image: {
                  type: String,
                  required: true
            },
            markedBy: {
                  type: mongoose.Schema.Types.ObjectId,
                  ref: 'User',
                  required: true
            },
            markedAt: {
                  type: Date,
                  default: Date.now
            },
            critcal: {
                  type: String,
                  enum: ['Very High', 'High', 'Medium', 'Low'],
                  default: 'Low'
            },
            isAssignedBy: {
                  type: [{
                        assignedBy: {
                              type: mongoose.Schema.Types.ObjectId,
                              ref: 'User',
                              required: true
                        },
                        assignedAt: {
                              type: Date,
                              default: Date.now
                        },
                  }],
                  default: []
            },
            isCompletedBy: {
                  type: [{
                        completedBy: {
                              type: mongoose.Schema.Types.ObjectId,
                              ref: 'User',
                              required: true
                        },
                        completedAt: {
                              type: Date,
                              default: Date.now
                        }
                  }],
                  default: []
            },
            isCompleted: {
                  type: Boolean,
                  default: false
            },
            rating: {
                  type: Number,
                  enum: [1, 2, 3, 4, 5],
                  default: 0
            }
      }
)

export default mongoose.model("MarkedSpot", markedSpotsSchema) || mongoose.models.MarkedSpot;