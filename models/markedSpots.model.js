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
            imageId: {
                  type: String,
                  required: true
            },
            completedImage: {
                  type: String,
                  required: false
            },
            completedImageId: {
                  type: String,
                  required: false
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
                  default: 1
            },
            isAiVerified: {
                  type: [{
                        isAiOrEdited: {
                              type: Boolean,
                              default: false
                        },
                        forensicConfidence: {
                              type: Number,
                              default: 0
                        },
                        detectedManipulationType: {
                              type: String,
                              default: ''
                        },
                        forensicDetails: {
                              type: String,
                              default: ''
                        },
                        gestureMatched: {
                              type: Boolean,
                              default: false
                        },
                        isValidWasteReport: {
                              type: Boolean,
                              default: false
                        },
                        isFraudulent: {
                              type: Boolean,
                              default: false
                        },
                        fraudReason: {
                              type: String,
                              default: ''
                        },
                        auditResult: {
                              type: Object,
                              default: {}
                        },
                        verifiedBy: {
                              type: mongoose.Schema.Types.ObjectId,
                              ref: 'User',
                              required: true
                        },
                        verifiedAt: {
                              type: Date,
                              default: Date.now
                        }
                  }],
                  default: []
            }
      }
)

export default mongoose.model("MarkedSpot", markedSpotsSchema) || mongoose.models.MarkedSpot;