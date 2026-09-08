import mongoose from "mongoose";
import User from "../../models/user.model.js";
import UserRewards from "../../models/userRewards.model.js";
import UserStatus from "../../models/userStatus.model.js";
import { errorHandler } from "../../utils/errorHandler.js";
import { responseHandler } from "../../utils/responseHandler.js";
import { JWT_SECRET } from "../../config/envConfig.js";
import jwt from "jsonwebtoken";

export const getMyProfile = async (req, res, next) => {
      try {
            const userId = req.user?._id;
            const user = await User.findById(userId);
            if (!user) {
                  return next(errorHandler(404, "User not found"));
            }
            const userRewards = await UserRewards.findOne({ userId });
            const userStatus = await UserStatus.findOne({ userId });

            const markedSpots = Array.isArray(userStatus?.MarkedSpots) ? userStatus.MarkedSpots : [];
            const assignedSpots = Array.isArray(userStatus?.AssignedSpots) ? userStatus.AssignedSpots : [];
            const completedSpots = Array.isArray(userStatus?.CompletedSpots) ? userStatus.CompletedSpots : [];

            const markedCaseItems = markedSpots.map((s, i) => ({
                  id: s._id ? String(s._id) : `marked-${i}`,
                  title: s.description || s.address || "Reported Civic Spot",
                  location: s.address || "Location Pending",
                  status: "in_progress",
                  badgeText: "AI Verification Pending",
                  badgeType: "yellow",
                  image: s.image || "https://images.unsplash.com/photo-1530587191325-3db32d826c18?w=300&auto=format&fit=crop&q=80",
                  caseType: "marked",
            }));

            const assignedCaseItems = assignedSpots.map((s, i) => ({
                  id: s._id ? String(s._id) : `assigned-${i}`,
                  title: s.description || s.address || "Assigned Spot Cleanup",
                  location: s.address || "Location Pending",
                  status: "in_progress",
                  badgeText: "Cleanup In Progress",
                  badgeType: "yellow",
                  image: s.image || "https://images.unsplash.com/photo-1604186837056-8e7c286756f2?w=300&auto=format&fit=crop&q=80",
                  caseType: "assigned",
            }));

            const completedCaseItems = completedSpots.map((s, i) => ({
                  id: s._id ? String(s._id) : `completed-${i}`,
                  title: s.description || s.address || "Resolved Civic Spot",
                  location: s.address || "Cleaned & Verified",
                  status: "resolved",
                  karmaChange: 150,
                  badgeText: "AI Verified Clean",
                  badgeType: "green",
                  image: s.image || "https://images.unsplash.com/photo-1618477461853-cf6ed80faba5?w=300&auto=format&fit=crop&q=80",
                  caseType: "completed",
            }));

            let userCases = [];
            const userRole = (user.role || "Civilian").toLowerCase();

            if (userRole === "civilian") {
                  userCases = [...markedCaseItems];
            } else if (userRole === "coordinator") {
                  userCases = [...assignedCaseItems, ...completedCaseItems];
            } else {
                  // Hybrid or default: mixture of both roles
                  userCases = [...markedCaseItems, ...assignedCaseItems, ...completedCaseItems];
            }

            const userLedger = [
                  ...(userRewards?.selectedRewards || []).map((r, i) => ({
                        id: r._id ? String(r._id) : `reward-${i}`,
                        title: r.name || "Redeemed Reward",
                        time: r.dateSelected ? new Date(r.dateSelected).toLocaleDateString() : "RECENT",
                        amount: -(r.pointsSpent || 0),
                        type: "reward",
                        icon: "local_activity",
                  })),
            ];

            return responseHandler(res, 200, "User Profile", {
                  user: {
                        username: user.username,
                        email: user.email,
                        avatarUrl: user.avatar?.url || "",
                        role: user.role,
                        address: user.address,
                        pincode: user.pincode,
                        geolocation: user.geolocation,
                        certificatePreferences: user.certificatePreferences,
                        accountActive: user.accountActive,
                        isVerified: user.isVerified,
                        isProfileCompleted: user.isProfileCompleted,
                        lastActiveAt: user.lastActiveAt,
                  },
                  userRewards: {
                        karmaBalance: userRewards?.karmaPoints ?? userRewards?.karmaBalance ?? 0,
                        totalSpotsCompleted: userRewards?.totalSpotsCompleted ?? 0,
                        badges: userRewards?.badges ?? [],
                        rank: userRewards?.rank ?? "Seedling",
                        currentStreak: userRewards?.currentStreak ?? 0,
                        ledger: userLedger,
                  },
                  userStatus: {
                        completedSpots: completedSpots.length,
                        activeSpots: assignedSpots.length,
                        pendingSpots: markedSpots.length,
                        totalSpots: userStatus?.totalCount ?? (markedSpots.length + assignedSpots.length + completedSpots.length),
                        streaks: userStatus?.streaks ?? 0,
                        cases: userCases,
                  },
            });
      } catch (error) {
            return next(errorHandler(500, error.message || "Internal Server Error"));
      }
};

export const getBasicInfo = async (req, res, next) => {
      try {
            const token = req.cookies?.token;
            if (!token) {
                  return next(errorHandler(401, "Unauthorized"));
            }
            const decodedToken = jwt.verify(token, JWT_SECRET);
            const userId = decodedToken.id;
            const user = await User.findById(userId);
            if (!user) {
                  return next(errorHandler(404, "User not found"));
            }
            const userStatus = await UserStatus.findOne({ userId });
            const userRewards = await UserRewards.findOne({ userId });

            const markedSpots = Array.isArray(userStatus?.MarkedSpots) ? userStatus.MarkedSpots : [];
            const assignedSpots = Array.isArray(userStatus?.AssignedSpots) ? userStatus.AssignedSpots : [];
            const completedSpots = Array.isArray(userStatus?.CompletedSpots) ? userStatus.CompletedSpots : [];
            return responseHandler(res, 200, "User Basic Info", {
                  user: {
                        _id: user._id,
                        name: user.name,
                        role: user.role,
                        username: user.username,
                        avatarUrl: user.avatar?.url || "",
                  },
                  userRewards: {
                        karmaBalance: userRewards?.karmaPoints ?? userRewards?.karmaBalance ?? 0,
                        totalSpotsCompleted: userRewards?.totalSpotsCompleted ?? completedSpots.length,
                        rank: userRewards?.rank ?? "Seedling",
                        currentStreak: userRewards?.currentStreak ?? userStatus?.streaks ?? 0,
                  },
                  userStatus: {
                        completedSpots: completedSpots.length,
                        activeSpots: assignedSpots.length,
                        pendingSpots: markedSpots.length,
                        totalSpots: userStatus?.totalCount ?? (markedSpots.length + assignedSpots.length + completedSpots.length),
                        streaks: userStatus?.streaks ?? userRewards?.currentStreak ?? 0,
                  },
            });
      } catch (error) {
            return next(errorHandler(500, error.message || "Internal Server Error"));
      }
};

export const getProfileById = async (req, res, next) => {
      const profileId = req.params.id;
      try {
            let user = null;
            if (mongoose.Types.ObjectId.isValid(profileId)) {
                  user = await User.findById(profileId);
            }
            if (!user) {
                  user = await User.findOne({ username: profileId });
            }
            if (!user) {
                  return next(errorHandler(404, "User not found"));
            }

            const userId = user._id;
            const userRewards = await UserRewards.findOne({ userId });
            const userStatus = await UserStatus.findOne({ userId });
            const completedSpots = Array.isArray(userStatus?.CompletedSpots) ? userStatus.CompletedSpots : [];

            const userCases = [
                  ...completedSpots.map((s, i) => ({
                        id: s._id ? String(s._id) : `completed-${i}`,
                        title: s.description || s.address || "Resolved Civic Spot",
                        location: s.address || "Cleaned & Verified",
                        status: "resolved",
                        karmaChange: 150,
                        badgeText: "AI Verified Clean",
                        badgeType: "green",
                        image: s.image || "https://images.unsplash.com/photo-1618477461853-cf6ed80faba5?w=300&auto=format&fit=crop&q=80",
                  })),
            ];

            return responseHandler(res, 200, "User Profile Info", {
                  user: {
                        _id: user._id,
                        name: user.name,
                        role: user.role,
                        username: user.username,
                        avatar: user.avatar?.url || "",
                        address: user.address,
                        pincode: user.pincode,
                  },
                  userRewards: {
                        karmaBalance: userRewards?.karmaPoints ?? userRewards?.karmaBalance ?? 0,
                        totalSpotsCompleted: userRewards?.totalSpotsCompleted ?? 0,
                        badges: userRewards?.badges ?? [],
                        rank: userRewards?.rank ?? "Seedling",
                  },
                  userStatus: {
                        completedSpots: completedSpots.length,
                        cases: userCases,
                  },
            });
      } catch (error) {
            return next(errorHandler(500, error.message || "Internal Server Error"));
      }
};
