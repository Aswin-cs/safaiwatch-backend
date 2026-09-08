import mongoose from "mongoose";

const userStatusSchema = new mongoose.Schema({
      user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
      },
      status: {
            type: String,
            enum: ['Free', 'Assigned', 'Pending', ''],
            default: 'Free'
      },
      streaks: {
            type: String
      },
      currentLocation: {
            type: {
                  type: String,
                  enum: ['Point'],
                  required: true
            },
            coordinates: {
                  type: [Number],
                  required: true
            }
      },
      MarkedSpots: {
            type: [
                  {
                        _id: {
                              type: mongoose.Schema.Types.ObjectId,
                              ref: 'MarkedSpot'
                        },
                        isCompletedBy: {
                              type: mongoose.Schema.Types.ObjectId,
                              ref: 'User',
                              required: true
                        },
                        markedAt: {
                              type: Date,
                              default: Date.now
                        }
                  }
            ],
            default: []
      },
      AssignedSpots: {
            type: [
                  {
                        _id: {
                              type: mongoose.Schema.Types.ObjectId,
                              ref: 'MarkedSpot'
                        },
                        assignedBy: {
                              type: mongoose.Schema.Types.ObjectId,
                              ref: 'User'
                        },
                        assignedAt: {
                              type: Date,
                              default: Date.now
                        }
                  }
            ],
            default: []
      },
      CompletedSpots: {
            type: [
                  {
                        _id: {
                              type: mongoose.Schema.Types.ObjectId,
                              ref: 'MarkedSpot'
                        },
                        assignedBy: {
                              type: mongoose.Schema.Types.ObjectId,
                              ref: 'User',
                              required: true
                        },
                        completedAt: {
                              type: Date,
                              default: Date.now
                        }
                  }
            ],
            default: []
      },
      userLikePosts: {
            type: [
                  {
                        postId: {
                              type: mongoose.Schema.Types.ObjectId,
                              ref: 'Post'
                        },
                        likedAt: {
                              type: Date,
                              default: Date.now
                        }
                  }
            ],
            default: []
      },
      PostThatLinked: {
            type: [
                  {
                        postId: {
                              type: mongoose.Schema.Types.ObjectId,
                              ref: 'Post'
                        },
                        linkedAt: {
                              type: Date,
                              default: Date.now
                        }

                  }
            ],
            default: []
      },
      BlackListCount: {
            type: Number,
            default: 0
      },
      completedCount: {
            type: Number,
            default: 0
      },
      pendingCount: {
            type: Number,
            default: 0
      },
      assignedCount: {
            type: Number,
            default: 0
      },
      totalCount: {
            type: Number,
            default: 0
      },
      lastActiveAt: {
            type: Date
      }
}, { timestamps: true });

export default mongoose.model("UserStatus", userStatusSchema) || mongoose.models.UserStatus;