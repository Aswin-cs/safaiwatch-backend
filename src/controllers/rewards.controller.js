import UserRewards from "../../models/userRewards.model.js";
import UserStatus from "../../models/userStatus.model.js";
import User from "../../models/user.model.js";
import { errorHandler } from "../../utils/errorHandler.js";
import { responseHandler } from "../../utils/responseHandler.js";
import {
  PriceList,
  selectedRewards,
  badgesCalculating,
  streaksCalculated,
  leaderboardRankCalculated,
} from "../../utils/rewards.utils.js";

/**
 * Get available reward catalog with categories and items
 */
export const getRewardsCatalog = async (req, res, next) => {
  try {
    return responseHandler(res, 200, "Rewards catalog fetched successfully", {
      catalog: PriceList,
    });
  } catch (error) {
    console.error("Error in getRewardsCatalog:", error);
    return next(errorHandler(500, error.message || "Failed to fetch rewards catalog"));
  }
};

/**
 * Get current user's rewards status, streaks, badges and history
 */
export const getMyRewards = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id || req.user;
    if (!userId) {
      return next(errorHandler(401, "Unauthorized"));
    }

    // Refresh badges and streak in background/sync
    try {
      await Promise.all([
        badgesCalculating(userId),
        streaksCalculated(userId),
      ]);
    } catch (e) {
      console.warn("Background rewards sync warning:", e);
    }

    const [userRewards, userStatus, userDoc] = await Promise.all([
      UserRewards.findOne({ $or: [{ user: userId }, { userId }] }),
      UserStatus.findOne({ $or: [{ user: userId }, { userId }] }),
      User.findById(userId).select("username avatar role"),
    ]);

    const karmaPoints = userRewards?.karmaPoints || 0;
    const sellingPoints = userRewards?.SellingPoints !== undefined ? userRewards.SellingPoints : karmaPoints;
    const completedSpotsCount = userStatus?.CompletedSpots?.length || userRewards?.totalSpotsCompleted || 0;

    // Determine civic rank label based on karma
    let rankTitle = "Seedling";
    if (karmaPoints >= 1000) rankTitle = "Civic Legend";
    else if (karmaPoints >= 400) rankTitle = "Sanitation King";
    else if (karmaPoints >= 200) rankTitle = "Community Leader";
    else if (karmaPoints >= 100) rankTitle = "Ward Defender";
    else if (karmaPoints >= 25) rankTitle = "Spot Explorer";
    else if (completedSpotsCount >= 1 || karmaPoints >= 10) rankTitle = "Civic Spotter";

    return responseHandler(res, 200, "User rewards retrieved successfully", {
      userRewards: {
        karmaBalance: karmaPoints,
        karmaPoints: karmaPoints,
        SellingPoints: sellingPoints,
        totalSpotsCompleted: completedSpotsCount,
        rank: rankTitle,
        currentStreak: userRewards?.currentStreak || 0,
        longestStreak: userRewards?.longestStreak || 0,
        freezeShields: userRewards?.freezeShields ?? 1,
        badges: userRewards?.badges || [],
        selectedRewards: userRewards?.selectedRewards || [],
        leaderboardRank: userRewards?.leaderboardRank || 0,
      },
      user: {
        _id: userDoc?._id || userId,
        username: userDoc?.username || "Civic Champion",
        avatar: userDoc?.avatar,
        role: userDoc?.role || "Civilian",
      },
    });
  } catch (error) {
    console.error("Error in getMyRewards:", error);
    return next(errorHandler(500, error.message || "Failed to retrieve user rewards"));
  }
};

/**
 * Redeem / select a reward using selectedRewards utility
 */
export const redeemRewardHandler = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id || req.user;
    if (!userId) {
      return next(errorHandler(401, "Unauthorized"));
    }

    const { name, rewardName, clothSize, size } = req.body;
    const itemToRedeem = rewardName || name;

    if (!itemToRedeem) {
      return next(errorHandler(400, "Reward item name is required"));
    }

    const chosenSize = clothSize || size || null;

    // Call dedicated utility function from backend/utils/rewards.utils.js
    const result = await selectedRewards(req.user, itemToRedeem, chosenSize);

    if (!result.success) {
      return next(errorHandler(400, result.message || "Failed to redeem reward"));
    }

    return responseHandler(res, 200, result.message || "Reward redeemed successfully", {
      claimedReward: result.claimedReward,
      userRewards: result.userRewards,
    });
  } catch (error) {
    console.error("Error in redeemRewardHandler:", error);
    return next(errorHandler(500, error.message || "Failed to redeem reward"));
  }
};

/**
 * Get user's claimed reward redemption history
 */
export const getRewardsHistory = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id || req.user;
    if (!userId) {
      return next(errorHandler(401, "Unauthorized"));
    }

    const userRewards = await UserRewards.findOne({ $or: [{ user: userId }, { userId }] });
    const selectedRewardsList = userRewards?.selectedRewards || [];

    return responseHandler(res, 200, "Rewards history retrieved successfully", {
      selectedRewards: selectedRewardsList,
      karmaBalance: userRewards?.karmaPoints ?? 0,
      SellingPoints: userRewards?.SellingPoints ?? 0,
    });
  } catch (error) {
    console.error("Error in getRewardsHistory:", error);
    return next(errorHandler(500, error.message || "Failed to fetch rewards history"));
  }
};

/**
 * Get leaderboard rankings for rewards / karma
 */
export const getRewardsLeaderboard = async (req, res, next) => {
  try {
    try {
      await leaderboardRankCalculated();
    } catch (e) {
      console.warn("Leaderboard calculation warning:", e);
    }

    const leaderboard = await UserRewards.find({})
      .sort({ karmaPoints: -1 })
      .limit(50)
      .populate({ path: "user", select: "username avatar role" });

    return responseHandler(res, 200, "Leaderboard fetched successfully", {
      leaderboard: leaderboard.map((entry, idx) => ({
        rank: entry.leaderboardRank || idx + 1,
        user: entry.user,
        karmaPoints: entry.karmaPoints,
        SellingPoints: entry.SellingPoints,
        badgesCount: entry.badges?.length || 0,
        currentStreak: entry.currentStreak || 0,
      })),
    });
  } catch (error) {
    console.error("Error in getRewardsLeaderboard:", error);
    return next(errorHandler(500, error.message || "Failed to fetch leaderboard"));
  }
};
