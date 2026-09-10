import mongoose from "mongoose";

const userRewardsSchema = new mongoose.Schema({
      user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
      },
      karmaPoints: {
            type: Number,
            default: 0
      },
      SellingPoints: {
            type: Number,
            default: 0
      },
      totalSpotsCompleted: {
            type: Number,
            default: 0
      },
      badges: {
            type: [
                  {
                        name: {
                              type: String,
                              enum: ["The Beginner", "The Explorer", "The Hero", "The Icon", "The King", "The Legend"],
                              required: true
                        },
                        dateEarned: {
                              type: Date,
                              default: Date.now
                        }
                  }
            ],
            default: []
      },
      leaderboardRank: {
            type: Number,
            default: 0
      },
      selectedRewards: {
            type: [
                  {
                        category: {
                              type: String,
                              enum: ["gift card", "free meal", "clothing"],
                              required: true
                        },
                        name: {
                              type: String,
                              required: true
                        },
                        clothSize: {
                              type: String,
                              enum: ["S", "M", "L", "XL"]
                        },
                        pointsSpent: {
                              type: Number,
                              required: true
                        },
                        dateSelected: {
                              type: Date,
                              default: Date.now
                        }
                  }
            ],
            default: []
      },
      lastStreakDate: {
            type: Date,
            default: Date.now
      },
      currentStreak: {
            type: Number,
            default: 0
      },
      longestStreak: {
            type: Number,
            default: 0
      },
      activeDays: {
            type: [Date],
            default: []
      },
      freezeShields: {
            type: Number,
            default: 1
      },

});

export default mongoose.model("UserRewards", userRewardsSchema) || mongoose.models.UserRewards;