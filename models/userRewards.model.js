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
      totalSpotsCompleted: {
            type: Number,
            default: 0
      },
      badges: {
            type: [
                  {
                        name: {
                              type: String,
                              enum: ["bronze", "silver", "gold", "platinum"],
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
      rank: {
            type: String,
            enum: ["Seedling", "Sapling", "Tree", "Forest"],
            default: "Seedling"
      },
      lastStreakDate: {
            type: Date,
            default: Date.now
      },
      currentStreak: {
            type: Number,
            default: 0
      },

});

export default mongoose.model("UserRewards", userRewardsSchema) || mongoose.models.UserRewards;