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
                        }
                  }
            ],
            default: []
      },
      AssignedSpots: {
            type: [
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
                        AssignedBy: {
                              type: mongoose.Schema.Types.ObjectId,
                              ref: 'User',
                              required: true
                        },
                        AssignedAt: {
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
                        CompletedAt: {
                              type: Date,
                              default: Date.now
                        },
                        rating: {
                              type: Number,
                              enum: [1, 2, 3, 4, 5],
                              required: true
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

export const UserStatus = mongoose.model("UserStatus", userStatusSchema);