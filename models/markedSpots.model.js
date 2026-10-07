import mongoose from "mongoose";

const markedSpotsSchema = new mongoose.Schema(
      {
            address: {
                  type: String,
                  required: true,
                  default: "Unknown"
            },
            type: {
                  type: String,
                  enum: ['Point'],
                  default: 'Point',
                  required: true
            },
            coordinates: {
                  type: [Number],
                  default: [0, 0],
                  required: true
            },
            description: {
                  type: String,
                  default: "No description provided",
                  required: true
            },
            category: {
                  type: String,
                  default: 'Mixed Waste'
            },
            wasteCategory: {
                  type: String,
                  default: 'Mixed Waste'
            },
            image: {
                  type: String,
                  required: true,
                  default: "https://res.cloudinary.com/dxj0gqv3f/image/upload/v1697040915/DefaultImage/DefaultImage_1_1_1_1_1_1_1_1_1_1_1_1_1_1_1_1_1_1_1_1_1_1.png"
            },
            imageId: {
                  type: String,
                  required: true,
                  default: " DefaultImage/DefaultImage_1_1_1_1_1_1_1_1_1_1_1_1_1_1_1_1_1_1_1_1_1_1"
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
                  required: true,
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
            preCodeOrGestureForMark: {
                  type: {
                        isUserCompleted: {
                              type: Boolean,
                              default: false
                        },
                        verificationtype: {
                              type: String,
                              enum: ["code", "gesture"],
                        },
                        verificationCode: {
                              type: String,
                        },
                        verificationGesture: {
                              type: String,
                        },
                        isCodeOrGestureVerified: {
                              type: Boolean,
                        },
                        expectedCompletionDate: {
                              type: Date,
                        },
                  },
                  isUserCompleted: {
                        type: Boolean,
                        default: false
                  }
            },
            isAiVerified: {
                  type: {
                        isAiOrEdited: {
                              type: Boolean,
                              default: false
                        },
                        forensicConfidence: {
                              type: Number,
                              default: 0
                        },
                        critcal: {
                              type: String,
                              enum: ['Very High', 'High', 'Medium', 'Low'],
                              default: 'Low'
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
                        detectedGestureName: {
                              type: String,
                              default: ''
                        },
                        detectedCode: {
                              type: String,
                              default: ''
                        },
                        summary: {
                              type: String,
                              default: ''
                        },
                        auditResult: {
                              type: Object,
                              default: {}
                        },
                        verifiedAt: {
                              type: Date,
                              default: Date.now
                        }
                  },
            },
            isVerified: {
                  type: Boolean,
                  default: false
            },
            isReported: {
                  type: Boolean
            },
            isReportedBy: {
                  type: [
                        {
                              reportedBy: {
                                    type: mongoose.Schema.Types.ObjectId,
                                    ref: 'User',
                              },
                              ReportProb: {
                                    type: mongoose.Schema.Types.ObjectId,
                                    ref: 'Report',
                              },
                              reportedAt: {
                                    type: Date,
                                    default: Date.now
                              }

                        }
                  ]
            },
            isCompletedVerify: {
                  type: String,
                  enum: ["pending", "completed", "uncompleted"],
                  default: "pending"
            },
            isCompletedVerifyAt: {
                  type: Date,
                  default: Date.now
            }
      }
)

export default mongoose.model("MarkedSpot", markedSpotsSchema) || mongoose.models.MarkedSpot;