import mongoose from "mongoose";
import User from "../../models/user.model.js";
import UserRewards from "../../models/userRewards.model.js";
import UserStatus from "../../models/userStatus.model.js";
import MarkedSpot from "../../models/markedSpots.model.js";
import Report from "../../models/report.model.js";
import Post from "../../models/feeds.model.js";
import { errorHandler } from "../../utils/errorHandler.js";
import { responseHandler } from "../../utils/responseHandler.js";
import { JWT_SECRET } from "../../config/envConfig.js";
import jwt from "jsonwebtoken";
import { uploadToCloudinary, deleteFromCloudinary } from "../../utils/Cloudinaryimage.utils.js";
import { selectedRewards } from "../../utils/rewards.utils.js";
import { submitCounterEvidence } from "./report.controller.js";

/**
 * Helper to get user ID from req.user or JWT token if available
 */
const getRequesterUserId = async (req) => {
      if (req.user?._id) return req.user._id.toString();
      try {
            const token = req.cookies?.token || (req.headers?.authorization?.startsWith("Bearer ") ? req.headers.authorization.split(" ")[1] : null);
            if (token) {
                  const decoded = jwt.verify(token, JWT_SECRET);
                  const user = await User.findById(decodedToken.userId)
                  return user ? true : false
            }
      } catch (e) { }
      return false;
};

const getYYYYMMDD = (d) => {
      if (!d) return "";
      const date = new Date(d);
      if (isNaN(date.getTime())) return "";
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
};

const getWeekDays = (userActiveDays = [], userStatus = null) => {
      const now = new Date();
      const currentDayOfWeek = now.getDay();
      const distanceToMonday = (currentDayOfWeek + 6) % 7;

      const monday = new Date(now);
      monday.setDate(now.getDate() - distanceToMonday);
      monday.setHours(0, 0, 0, 0);

      const activeDatesSet = new Set();

      if (Array.isArray(userActiveDays)) {
            userActiveDays.forEach((d) => {
                  if (d) {
                        const str = getYYYYMMDD(d);
                        if (str) activeDatesSet.add(str);
                  }
            });
      }

      if (userStatus) {
            (userStatus.MarkedSpots || []).forEach((s) => {
                  if (s && s.markedAt && s.isUserCompleted !== false) {
                        const str = getYYYYMMDD(s.markedAt);
                        if (str) activeDatesSet.add(str);
                  }
            });
            (userStatus.AssignedSpots || []).forEach((s) => {
                  if (s && s.assignedAt) {
                        const str = getYYYYMMDD(s.assignedAt);
                        if (str) activeDatesSet.add(str);
                  }
            });
            (userStatus.CompletedSpots || []).forEach((s) => {
                  if (s && s.completedAt) {
                        const str = getYYYYMMDD(s.completedAt);
                        if (str) activeDatesSet.add(str);
                  }
            });
      }

      const todayStr = getYYYYMMDD(now);
      const dayNames = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

      return dayNames.map((dayName, idx) => {
            const dayDate = new Date(monday);
            dayDate.setDate(monday.getDate() + idx);
            const dateStr = getYYYYMMDD(dayDate);
            const isToday = dateStr === todayStr;
            const isPast = dateStr < todayStr;
            const isActive = activeDatesSet.has(dateStr);

            return {
                  day: dayName,
                  date: dateStr,
                  isToday,
                  isPast,
                  isActive,
            };
      });
};

export const getMyProfile = async (req, res, next) => {
      try {
            const userId = req.user?._id;
            const user = await User.findById(userId);
            if (!user) {
                  return next(errorHandler(404, "User not found"));
            }

            const [userRewards, userStatus, dbMarkedSpots, dbCompletedSpots, dbAssignedSpots] = await Promise.all([
                  UserRewards.findOne({ $or: [{ user: userId }, { userId }] }),
                  UserStatus.findOne({ $or: [{ user: userId }, { userId }] })
                        .populate({ path: "MarkedSpots._id", model: "MarkedSpot" })
                        .populate({ path: "AssignedSpots._id", model: "MarkedSpot" })
                        .populate({ path: "CompletedSpots._id", model: "MarkedSpot" })
                        .populate({
                              path: "reportForme._id",
                              model: "Report",
                              select: "forWhat reasonForSpot reasonForSpotComplete spotId description imageUrl createdAt",
                              populate: {
                                    path: "spotId",
                                    model: "MarkedSpot",
                                    select: "address description category wasteCategory image coordinates",
                              },
                        }),
                  MarkedSpot.find({
                        markedBy: userId,
                        "preCodeOrGestureForMark.isUserCompleted": { $ne: false },
                  })
                        .populate("markedBy", "username avatar role")
                        .populate("isAssignedBy.assignedBy", "username avatar role")
                        .populate("isCompletedBy.completedBy", "username avatar role")
                        .sort({ markedAt: -1, createdAt: -1 }),
                  MarkedSpot.find({ "isCompletedBy.completedBy": userId })
                        .populate("markedBy", "username avatar role")
                        .populate("isAssignedBy.assignedBy", "username avatar role")
                        .populate("isCompletedBy.completedBy", "username avatar role")
                        .sort({ markedAt: -1, createdAt: -1 }),
                  MarkedSpot.find({ "isAssignedBy.assignedBy": userId, isCompleted: false })
                        .populate("markedBy", "username avatar role")
                        .populate("isAssignedBy.assignedBy", "username avatar role")
                        .sort({ markedAt: -1, createdAt: -1 }),
            ]);

            const userRole = (user.role || "Civilian").toLowerCase();

            const statusMarked = Array.isArray(userStatus?.MarkedSpots) ? userStatus.MarkedSpots : [];
            const assignedSpots = Array.isArray(userStatus?.AssignedSpots) ? userStatus.AssignedSpots : [];
            const statusCompleted = Array.isArray(userStatus?.CompletedSpots) ? userStatus.CompletedSpots : [];

            const markedMap = new Map();
            dbMarkedSpots.forEach((s) => {
                  if (s && s._id) markedMap.set(String(s._id), s);
            });
            statusMarked.forEach((item) => {
                  let s = item;
                  if (item._id && typeof item._id === "object" && (item._id.address || item._id.description || item._id._id)) {
                        s = item._id;
                  }
                  const spotIdStr = s._id ? String(s._id) : (typeof s.id === "string" ? s.id : null);
                  if (spotIdStr && s.preCodeOrGestureForMark?.isUserCompleted !== false && !markedMap.has(spotIdStr)) {
                        markedMap.set(spotIdStr, s);
                  }
            });
            const allMarkedSpots = Array.from(markedMap.values());

            const completedMap = new Map();
            dbCompletedSpots.forEach((s) => {
                  if (s && s._id) completedMap.set(String(s._id), s);
            });
            statusCompleted.forEach((item) => {
                  let s = item;
                  if (item._id && typeof item._id === "object" && (item._id.address || item._id.description || item._id._id)) {
                        s = item._id;
                  }
                  const spotIdStr = s._id ? String(s._id) : (typeof s.id === "string" ? s.id : null);
                  if (spotIdStr && !completedMap.has(spotIdStr)) {
                        completedMap.set(spotIdStr, s);
                  }
            });
            const allCompletedSpots = Array.from(completedMap.values());

            const assignedMap = new Map();
            dbAssignedSpots.forEach((s) => {
                  if (s && s._id) assignedMap.set(String(s._id), s);
            });
            assignedSpots.forEach((item) => {
                  let s = item;
                  if (item._id && typeof item._id === "object" && (item._id.address || item._id.description || item._id._id)) {
                        s = item._id;
                  }
                  const spotIdStr = s._id ? String(s._id) : (typeof s.id === "string" ? s.id : null);
                  if (spotIdStr && !assignedMap.has(spotIdStr)) {
                        assignedMap.set(spotIdStr, s);
                  }
            });
            const allAssignedSpots = Array.from(assignedMap.values());

            const completedCaseItems = allCompletedSpots.map((s, i) => {
                  const spotIdStr = s._id ? String(s._id) : `completed-${i}`;
                  return {
                        id: `${spotIdStr}-completed`,
                        title: typeof s.description === "string" ? s.description : (typeof s.address === "string" ? s.address : "Resolved Spot"),
                        location: typeof s.address === "string" ? s.address : "Municipal Spot",
                        status: "resolved",
                        karmaChange: "+50 Karma",
                        badgeText: "Completed",
                        badgeType: "green",
                        image: typeof s.image === "string" && s.image ? s.image : "https://images.unsplash.com/photo-1530587191325-3db32d826c18?w=300&auto=format&fit=crop&q=80",
                        imageAfter: s.completedImage || s.imageAfter || "https://images.unsplash.com/photo-1618477461853-cf6ed80faba5?w=500&auto=format&fit=crop&q=80",
                        caseType: "completed",
                        markedBy: s.markedBy?.username || s.markedBy?.name || "Civilian Reporter",
                        assignedTo: s.isAssignedBy?.[s.isAssignedBy.length - 1]?.assignedBy?.username || s.isAssignedBy?.[s.isAssignedBy.length - 1]?.assignedBy?.name || "Ward Coordinator",
                        completedBy: s.isCompletedBy?.[s.isCompletedBy.length - 1]?.completedBy?.username || s.isCompletedBy?.[s.isCompletedBy.length - 1]?.completedBy?.name || "Clean Ranger",
                        markedAt: s.markedAt || s.createdAt,
                        completedAt: s.completedAt || s.updatedAt,
                        critical: s.critcal || s.critical || "Medium",
                        description: s.description || s.address,
                        isVerified: Boolean(s.isVerified),
                        isCompletedVerify: s.isCompletedVerify || "completed",
                        isCompletedVerifyAt: s.isCompletedVerifyAt,
                        isAiVerified: s.isAiVerified || null,
                  };
            });

            const assignedCaseItems = allAssignedSpots.map((item, i) => {
                  let s = item;
                  if (item._id && typeof item._id === "object" && (item._id.address || item._id.description || item._id._id)) {
                        s = item._id;
                  }
                  const spotIdStr = s._id ? String(s._id) : `assigned-${i}`;
                  return {
                        id: `${spotIdStr}-assigned`,
                        title: typeof s.description === "string" ? s.description : (typeof s.address === "string" ? s.address : "Assigned Spot Cleanup"),
                        location: typeof s.address === "string" ? s.address : "Assigned Ward Spot",
                        status: "in_progress",
                        badgeText: "Pending",
                        badgeType: "yellow",
                        image: typeof s.image === "string" && s.image ? s.image : "https://images.unsplash.com/photo-1604186837056-8e7c286756f2?w=300&auto=format&fit=crop&q=80",
                        caseType: "assigned",
                        markedBy: s.markedBy?.username || s.markedBy?.name || "Civilian Reporter",
                        assignedTo: s.isAssignedBy?.[s.isAssignedBy.length - 1]?.assignedBy?.username || s.isAssignedBy?.[s.isAssignedBy.length - 1]?.assignedBy?.name || "Ward Ranger",
                        markedAt: s.markedAt || s.createdAt,
                        assignedAt: s.assignedAt || item.assignedAt || s.updatedAt,
                        critical: s.critcal || s.critical || "High",
                        description: s.description || s.address,
                  };
            });

            const markedCaseItems = allMarkedSpots.map((s, i) => {
                  const spotIdStr = s._id ? String(s._id) : `marked-${i}`;
                  return {
                        id: `${spotIdStr}-marked`,
                        title: typeof s.description === "string" ? s.description : (typeof s.address === "string" ? s.address : "Reported Civic Spot"),
                        location: typeof s.address === "string" ? s.address : "Ward Locality",
                        status: s.isCompleted ? "resolved" : "in_progress",
                        badgeText: s.isCompleted ? "Completed" : "Pending",
                        badgeType: s.isCompleted ? "green" : "yellow",
                        image: typeof s.image === "string" && s.image ? s.image : "https://images.unsplash.com/photo-1530587191325-3db32d826c18?w=300&auto=format&fit=crop&q=80",
                        imageAfter: s.isCompleted ? (s.completedImage || s.imageAfter || "https://images.unsplash.com/photo-1618477461853-cf6ed80faba5?w=500&auto=format&fit=crop&q=80") : undefined,
                        caseType: "marked",
                        markedBy: s.markedBy?.username || s.markedBy?.name || "Civilian Reporter",
                        assignedTo: s.isAssignedBy?.length ? (s.isAssignedBy[s.isAssignedBy.length - 1]?.assignedBy?.username || s.isAssignedBy[s.isAssignedBy.length - 1]?.assignedBy?.name) : undefined,
                        completedBy: s.isCompletedBy?.length ? (s.isCompletedBy[s.isCompletedBy.length - 1]?.completedBy?.username || s.isCompletedBy[s.isCompletedBy.length - 1]?.completedBy?.name) : undefined,
                        markedAt: s.markedAt || s.createdAt,
                        completedAt: s.isCompleted ? (s.updatedAt || s.markedAt) : undefined,
                        critical: s.critcal || s.critical || "Medium",
                        description: s.description || s.address,
                        isVerified: Boolean(s.isVerified),
                        isCompletedVerify: s.isCompletedVerify || "pending",
                        isCompletedVerifyAt: s.isCompletedVerifyAt,
                        isAiVerified: s.isAiVerified || null,
                  };
            });

            const isHybrid = userRole === "hybrid";
            const isCoordinator = userRole === "coordinator";
            const isCivilian = userRole === "civilian" || (!isHybrid && !isCoordinator);

            const canViewMarked = isHybrid || isCivilian;
            const canViewAssigned = isHybrid || isCoordinator;
            const canViewCompleted = isHybrid || isCoordinator;

            let userCases = [];

            if (isCoordinator) {
                  userCases = [...assignedCaseItems, ...completedCaseItems];
            } else if (isHybrid) {
                  userCases = [...markedCaseItems, ...assignedCaseItems, ...completedCaseItems];
            } else {
                  userCases = [...markedCaseItems];
            }

            const userLedger = [
                  ...allCompletedSpots.map((s, idx) => ({
                        id: `ldg-comp-${s._id || idx}`,
                        title: `Cleaned: ${s.address || "Spot Cleanup"}`,
                        date: new Date(s.updatedAt || s.createdAt || Date.now()).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                        amount: 50,
                        type: "earned",
                        icon: "check_circle",
                  })),
                  ...allMarkedSpots.map((s, idx) => {
                        const isAiVerified = Boolean(
                              s.isVerified === true ||
                              s.isAiVerified === true ||
                              (typeof s.isAiVerified === "object" &&
                                    s.isAiVerified !== null &&
                                    s.isAiVerified.isValidWasteReport !== false &&
                                    !s.isAiVerified.isAiOrEdited &&
                                    !s.isAiVerified.isFraudulent)
                        );
                        return {
                              id: `ldg-mark-${s._id || idx}`,
                              title: `Reported: ${s.address || "Trash Spot"}`,
                              date: new Date(s.markedAt || s.createdAt || Date.now()).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                              amount: isAiVerified ? 10 : 0,
                              type: "earned",
                              icon: "add_location_alt",
                        };
                  }),
                  ...(userRewards?.selectedRewards || []).map((r, idx) => ({
                        id: `ldg-rew-${idx}`,
                        title: `Redeemed: ${r.name || "Reward"}`,
                        date: new Date(r.dateSelected || Date.now()).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                        amount: -(r.pointsSpent || 0),
                        type: "reward",
                        icon: "local_activity",
                  })),
            ];

            const weekDays = getWeekDays(userRewards?.activeDays, userStatus);
            const now = new Date();
            const todayStr = now.toISOString().split("T")[0];
            const yesterday = new Date(now);
            yesterday.setDate(now.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split("T")[0];

            const lastActiveDateStr = userRewards?.lastStreakDate ? new Date(userRewards.lastStreakDate).toISOString().split("T")[0] : null;

            let currentStreak = userRewards?.currentStreak ?? userStatus?.streaks ?? 0;
            if (lastActiveDateStr && lastActiveDateStr !== todayStr && lastActiveDateStr !== yesterdayStr) {
                  currentStreak = 0;
            }
            const longestStreak = Math.max(userRewards?.longestStreak || 0, currentStreak);

            return responseHandler(res, 200, "User Profile", {
                  user: {
                        id: user.username,
                        username: user.username,
                        name: user.certificatePreferences?.displayName || user.username,
                        displayName: user.certificatePreferences?.displayName || user.username,
                        email: user.email,
                        avatar: user.avatar,
                        avatarUrl: typeof user.avatar === "string" ? user.avatar : user.avatar?.url || "",
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
                        karmaBalance: userRewards?.karmaPoints ?? 0,
                        SellingPoints: userRewards?.SellingPoints ?? 0,
                        totalSpotsCompleted: userRewards?.totalSpotsCompleted ?? allCompletedSpots.length,
                        badges: userRewards?.badges ?? [],
                        rank: userRewards?.rank || (userRewards?.leaderboardRank ? `Rank #${userRewards.leaderboardRank}` : "Seedling"),
                        leaderboardRank: userRewards?.leaderboardRank ?? 0,
                        currentStreak: currentStreak,
                        longestStreak: longestStreak,
                        activeDays: userRewards?.activeDays ?? [],
                        weekDays: weekDays,
                        freezeShields: userRewards?.freezeShields ?? 1,
                        ledger: userLedger,
                        selectedRewards: userRewards?.selectedRewards ?? [],
                  },
                  userStatus: {
                        reportedSpots: canViewMarked ? allMarkedSpots.length : 0,
                        completedSpots: canViewCompleted ? allCompletedSpots.length : 0,
                        activeSpots: canViewAssigned ? assignedCaseItems.length : 0,
                        pendingSpots: canViewMarked ? markedCaseItems.filter((c) => c.status === "in_progress").length : 0,
                        totalSpots: canViewMarked ? allMarkedSpots.length : 0,
                        streaks: currentStreak,
                        markedSpotsList: canViewMarked ? markedCaseItems : [],
                        assignedSpotsList: canViewAssigned ? assignedCaseItems : [],
                        completedSpotsList: canViewCompleted ? completedCaseItems : [],
                        cases: userCases,
                        reportForme: Array.isArray(userStatus?.reportForme)
                              ? userStatus.reportForme.map((item, idx) => {
                                    const reportDoc = item._id && typeof item._id === "object" ? item._id : null;
                                    const reason = reportDoc?.reasonForSpot || reportDoc?.reasonForSpotComplete || "Reported for review";
                                    const spotDoc = reportDoc?.spotId && typeof reportDoc.spotId === "object" ? reportDoc.spotId : null;
                                    return {
                                          id: reportDoc?._id ? String(reportDoc._id) : `rep-${idx}`,
                                          reportId: reportDoc?._id ? String(reportDoc._id) : (item._id ? String(item._id) : null),
                                          forWhat: item.forWhat || reportDoc?.forWhat || "reportSpot",
                                          reasonForSpot: reportDoc?.reasonForSpot || null,
                                          reasonForSpotComplete: reportDoc?.reasonForSpotComplete || null,
                                          reason,
                                          description: reportDoc?.description || "",
                                          imageUrl: reportDoc?.imageUrl || "",
                                          reportAt: item.reportAt || reportDoc?.createdAt,
                                          spot: spotDoc ? {
                                                id: spotDoc._id ? String(spotDoc._id) : null,
                                                address: spotDoc.address || "Reported Spot",
                                                category: spotDoc.category || spotDoc.wasteCategory || "Civic Spot",
                                                image: spotDoc.image || null,
                                          } : null,
                                    };
                              }).sort((a, b) => new Date(b.reportAt || 0).getTime() - new Date(a.reportAt || 0).getTime())
                              : [],
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

            const [userRewards, userStatus, dbMarkedSpots, dbCompletedSpots] = await Promise.all([
                  UserRewards.findOne({ $or: [{ user: userId }, { userId }] }),
                  UserStatus.findOne({ $or: [{ user: userId }, { userId }] }),
                  MarkedSpot.find({ markedBy: userId, isUserCompleted: true }),
                  MarkedSpot.find({ "isCompletedBy.completedBy": userId }),
            ]);

            const markedSpots = (Array.isArray(userStatus?.MarkedSpots) ? userStatus.MarkedSpots : []).filter((s) => s?.isUserCompleted === true);
            const assignedSpots = Array.isArray(userStatus?.AssignedSpots) ? userStatus.AssignedSpots : [];
            const completedSpots = Array.isArray(userStatus?.CompletedSpots) ? userStatus.CompletedSpots : [];
            const totalMarkedCount = Math.max(dbMarkedSpots.length, markedSpots.length);
            const totalCompletedCount = Math.max(dbCompletedSpots.length, completedSpots.length);

            return responseHandler(res, 200, "User Basic Info", {
                  user: {
                        id: user.username,
                        name: user.name,
                        role: user.role,
                        username: user.username,
                        avatarUrl: typeof user.avatar === "string" ? user.avatar : user.avatar?.url || user.avatarUrl || "",
                        avatar: user.avatar,
                  },
                  userRewards: {
                        karmaBalance: userRewards?.karmaPoints ?? 0,
                        SellingPoints: userRewards?.SellingPoints ?? 0,
                        totalSpotsCompleted: userRewards?.totalSpotsCompleted ?? totalCompletedCount,
                        rank: userRewards?.rank || (userRewards?.leaderboardRank ? `Rank #${userRewards.leaderboardRank}` : "Seedling"),
                        currentStreak: userRewards?.currentStreak ?? userStatus?.streaks ?? 0,
                  },
                  userStatus: {
                        reportedSpots: totalMarkedCount,
                        completedSpots: totalCompletedCount,
                        activeSpots: assignedSpots.filter((s) => !s.isCompleted).length,
                        pendingSpots: totalMarkedCount,
                        totalSpots: totalMarkedCount,
                        streaks: userStatus?.streaks ?? userRewards?.currentStreak ?? 0,
                  },
            });
      } catch (error) {
            return next(errorHandler(500, error.message || "Internal Server Error"));
      }
};

export const getProfileByUsername = async (req, res, next) => {
      let profileUsername = req.params.username || req.params.id;
      if (typeof profileUsername === "string" && profileUsername.startsWith("@")) {
            profileUsername = profileUsername.slice(1);
      }
      try {
            let user = null;
            user = await User.findOne({ username: new RegExp(`^${profileUsername}$`, "i") });
            if (!user) {
                  user = await User.findOne({ username: profileUsername });
            }
            if (!user && mongoose.Types.ObjectId.isValid(profileUsername)) {
                  user = await User.findById(profileUsername);
            }
            if (!user) {
                  return next(errorHandler(404, "User not found"));
            }

            const userId = user._id;

            const reqUserId = getRequesterUserId(req);
            const isOwner = Boolean(reqUserId && reqUserId === userId.toString());

            const markedSpotsFilter = {
                  markedBy: userId,
                  "preCodeOrGestureForMark.isUserCompleted": { $ne: false },
            };
            if (!isOwner) {
                  markedSpotsFilter.isVerified = true;
            }

            const [userRewards, userStatus, dbMarkedSpots, dbCompletedSpots, dbAssignedSpots] = await Promise.all([
                  UserRewards.findOne({ $or: [{ user: userId }, { userId }] }),
                  UserStatus.findOne({ $or: [{ user: userId }, { userId }] })
                        .populate({ path: "MarkedSpots._id", model: "MarkedSpot" })
                        .populate({ path: "AssignedSpots._id", model: "MarkedSpot" })
                        .populate({ path: "CompletedSpots._id", model: "MarkedSpot" }),
                  MarkedSpot.find(markedSpotsFilter)
                        .populate("markedBy", "username avatar role")
                        .populate("isAssignedBy.assignedBy", "username avatar role")
                        .populate("isCompletedBy.completedBy", "username avatar role")
                        .sort({ markedAt: -1, createdAt: -1 }),
                  MarkedSpot.find({ "isCompletedBy.completedBy": userId })
                        .populate("markedBy", "username avatar role")
                        .populate("isAssignedBy.assignedBy", "username avatar role")
                        .populate("isCompletedBy.completedBy", "username avatar role")
                        .sort({ markedAt: -1, createdAt: -1 }),
                  MarkedSpot.find({ "isAssignedBy.assignedBy": userId, isCompleted: false })
                        .populate("markedBy", "username avatar role")
                        .populate("isAssignedBy.assignedBy", "username avatar role")
                        .sort({ markedAt: -1, createdAt: -1 }),
            ]);

            const statusMarked = Array.isArray(userStatus?.MarkedSpots) ? userStatus.MarkedSpots : [];
            const assignedSpots = Array.isArray(userStatus?.AssignedSpots) ? userStatus.AssignedSpots : [];
            const statusCompleted = Array.isArray(userStatus?.CompletedSpots) ? userStatus.CompletedSpots : [];

            const markedMap = new Map();
            dbMarkedSpots.forEach((s) => {
                  if (s && s._id) markedMap.set(String(s._id), s);
            });
            statusMarked.forEach((item) => {
                  let s = item;
                  if (item._id && typeof item._id === "object" && (item._id.address || item._id.description || item._id._id)) {
                        s = item._id;
                  }
                  const spotIdStr = s._id ? String(s._id) : (typeof s.id === "string" ? s.id : null);
                  if (spotIdStr && s.preCodeOrGestureForMark?.isUserCompleted !== false && !markedMap.has(spotIdStr)) {
                        if (isOwner || s.isVerified === true) {
                              markedMap.set(spotIdStr, s);
                        }
                  }
            });
            const allMarkedSpots = Array.from(markedMap.values()).filter((s) => isOwner || s.isVerified === true);

            const completedMap = new Map();
            dbCompletedSpots.forEach((s) => {
                  if (s && s._id) completedMap.set(String(s._id), s);
            });
            statusCompleted.forEach((item) => {
                  let s = item;
                  if (item._id && typeof item._id === "object" && (item._id.address || item._id.description || item._id._id)) {
                        s = item._id;
                  }
                  const spotIdStr = s._id ? String(s._id) : (typeof s.id === "string" ? s.id : null);
                  if (spotIdStr && !completedMap.has(spotIdStr)) {
                        completedMap.set(spotIdStr, s);
                  }
            });
            const allCompletedSpots = Array.from(completedMap.values());

            const assignedMap = new Map();
            dbAssignedSpots.forEach((s) => {
                  if (s && s._id) assignedMap.set(String(s._id), s);
            });
            assignedSpots.forEach((item) => {
                  let s = item;
                  if (item._id && typeof item._id === "object" && (item._id.address || item._id.description || item._id._id)) {
                        s = item._id;
                  }
                  const spotIdStr = s._id ? String(s._id) : (typeof s.id === "string" ? s.id : null);
                  if (spotIdStr && !assignedMap.has(spotIdStr)) {
                        assignedMap.set(spotIdStr, s);
                  }
            });
            const allAssignedSpots = Array.from(assignedMap.values());

            const userRole = (user.role || "Civilian").toLowerCase();

            const completedCaseItems = allCompletedSpots.map((s, i) => {
                  const spotIdStr = s._id ? String(s._id) : `completed-${i}`;
                  const completedItem = {
                        id: `${spotIdStr}-completed`,
                        title: typeof s.description === "string" ? s.description : (typeof s.address === "string" ? s.address : "Resolved Civic Spot"),
                        location: typeof s.address === "string" ? s.address : "Cleaned & Verified",
                        status: "resolved",
                        karmaChange: 150,
                        badgeText: "Completed",
                        badgeType: "green",
                        image: typeof s.image === "string" && s.image ? s.image : "https://images.unsplash.com/photo-1618477461853-cf6ed80faba5?w=300&auto=format&fit=crop&q=80",
                        imageAfter: s.completedImage || s.imageAfter || "https://images.unsplash.com/photo-1618477461853-cf6ed80faba5?w=500&auto=format&fit=crop&q=80",
                        caseType: "completed",
                        markedBy: s.markedBy?.username || s.markedBy?.name || "Civilian Reporter",
                        assignedTo: s.isAssignedBy?.[s.isAssignedBy.length - 1]?.assignedBy?.username || s.isAssignedBy?.[s.isAssignedBy.length - 1]?.assignedBy?.name || "Ward Coordinator",
                        completedBy: s.isCompletedBy?.[s.isCompletedBy.length - 1]?.completedBy?.username || s.isCompletedBy?.[s.isCompletedBy.length - 1]?.completedBy?.name || "Clean Ranger",
                        markedAt: s.markedAt || s.createdAt,
                        completedAt: s.completedAt || s.updatedAt,
                        critical: s.critcal || s.critical || "Medium",
                        description: s.description || s.address,
                  };

                  if (isOwner) {
                        completedItem.isVerified = Boolean(s.isVerified);
                        completedItem.isCompletedVerify = s.isCompletedVerify || "completed";
                        completedItem.isCompletedVerifyAt = s.isCompletedVerifyAt;
                        completedItem.isAiVerified = s.isAiVerified || null;
                  }

                  return completedItem;
            });

            const completedSpotIds = new Set(allCompletedSpots.map((s) => String(s._id || s.id)));

            const assignedCaseItems = allAssignedSpots
                  .filter((item) => {
                        let s = item;
                        if (item._id && typeof item._id === "object" && (item._id.address || item._id.description || item._id._id)) {
                              s = item._id;
                        }
                        const spotIdStr = String(s._id || s.id || s);
                        return !s.isCompleted && !completedSpotIds.has(spotIdStr);
                  })
                  .map((item, i) => {
                        let s = item;
                        if (item._id && typeof item._id === "object" && (item._id.address || item._id.description || item._id._id)) {
                              s = item._id;
                        }
                        const spotIdStr = s._id ? String(s._id) : `assigned-${i}`;
                        return {
                              id: `${spotIdStr}-assigned`,
                              title: typeof s.description === "string" ? s.description : (typeof s.address === "string" ? s.address : "Assigned Spot Cleanup"),
                              location: typeof s.address === "string" ? s.address : "Assigned Ward Spot",
                              status: "in_progress",
                              badgeText: "Pending",
                              badgeType: "yellow",
                              image: typeof s.image === "string" && s.image ? s.image : "https://images.unsplash.com/photo-1604186837056-8e7c286756f2?w=300&auto=format&fit=crop&q=80",
                              caseType: "assigned",
                              markedBy: s.markedBy?.username || s.markedBy?.name || "Civilian Reporter",
                              assignedTo: s.isAssignedBy?.[s.isAssignedBy.length - 1]?.assignedBy?.username || s.isAssignedBy?.[s.isAssignedBy.length - 1]?.assignedBy?.name || "Ward Ranger",
                              markedAt: s.markedAt || s.createdAt,
                              assignedAt: item.assignedAt || s.updatedAt,
                              critical: s.critcal || s.critical || "High",
                              description: s.description || s.address,
                        };
                  });

            const markedCaseItems = allMarkedSpots.map((s, i) => {
                  const spotIdStr = s._id ? String(s._id) : `marked-${i}`;
                  const markedItem = {
                        id: `${spotIdStr}-marked`,
                        title: typeof s.description === "string" ? s.description : (typeof s.address === "string" ? s.address : "Reported Civic Spot"),
                        location: typeof s.address === "string" ? s.address : "Ward Locality",
                        status: s.isCompleted ? "resolved" : "in_progress",
                        badgeText: s.isCompleted ? "Completed" : "Pending",
                        badgeType: s.isCompleted ? "green" : "yellow",
                        image: typeof s.image === "string" && s.image ? s.image : "https://images.unsplash.com/photo-1530587191325-3db32d826c18?w=300&auto=format&fit=crop&q=80",
                        imageAfter: s.isCompleted ? (s.completedImage || s.imageAfter || "https://images.unsplash.com/photo-1618477461853-cf6ed80faba5?w=500&auto=format&fit=crop&q=80") : undefined,
                        caseType: "marked",
                        markedBy: s.markedBy?.username || s.markedBy?.name || "Civilian Reporter",
                        assignedTo: s.isAssignedBy?.length ? (s.isAssignedBy[s.isAssignedBy.length - 1]?.assignedBy?.username || s.isAssignedBy[s.isAssignedBy.length - 1]?.assignedBy?.name) : undefined,
                        completedBy: s.isCompletedBy?.length ? (s.isCompletedBy[s.isCompletedBy.length - 1]?.completedBy?.username || s.isCompletedBy[s.isCompletedBy.length - 1]?.completedBy?.name) : undefined,
                        markedAt: s.markedAt || s.createdAt,
                        completedAt: s.isCompleted ? (s.updatedAt || s.markedAt) : undefined,
                        critical: s.critcal || s.critical || "Medium",
                        description: s.description || s.address,
                  };

                  if (isOwner) {
                        markedItem.isVerified = Boolean(s.isVerified);
                        markedItem.isCompletedVerify = s.isCompletedVerify || "pending";
                        markedItem.isCompletedVerifyAt = s.isCompletedVerifyAt;
                        markedItem.isAiVerified = s.isAiVerified || null;
                  }

                  return markedItem;
            });

            const isHybrid = userRole === "hybrid";
            const isCoordinator = userRole === "coordinator";
            const isCivilian = userRole === "civilian" || (!isHybrid && !isCoordinator);

            const canViewMarked = isHybrid || isCivilian;
            const canViewAssigned = isHybrid || isCoordinator;
            const canViewCompleted = isHybrid || isCoordinator;

            let userCases = [];

            if (isCoordinator) {
                  userCases = [...assignedCaseItems, ...completedCaseItems];
            } else if (isHybrid) {
                  userCases = [...markedCaseItems, ...assignedCaseItems, ...completedCaseItems];
            } else {
                  userCases = [...markedCaseItems];
            }

            const weekDays = getWeekDays(userRewards?.activeDays, userStatus);
            const now = new Date();
            const todayStr = now.toISOString().split("T")[0];
            const yesterday = new Date(now);
            yesterday.setDate(now.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split("T")[0];

            const lastActiveDateStr = userRewards?.lastStreakDate ? new Date(userRewards.lastStreakDate).toISOString().split("T")[0] : null;

            let currentStreak = userRewards?.currentStreak ?? userStatus?.streaks ?? 0;
            if (lastActiveDateStr && lastActiveDateStr !== todayStr && lastActiveDateStr !== yesterdayStr) {
                  currentStreak = 0;
            }
            const longestStreak = Math.max(userRewards?.longestStreak || 0, currentStreak);

            return responseHandler(res, 200, "User Profile Info", {
                  user: {
                        id: user.username,
                        username: user.username,
                        name: user.certificatePreferences?.displayName || user.username,
                        displayName: user.certificatePreferences?.displayName || user.username,
                        email: user.email,
                        role: user.role,
                        avatar: user.avatar,
                        avatarUrl: typeof user.avatar === "string" ? user.avatar : user.avatar?.url || "",
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
                        karmaBalance: userRewards?.karmaPoints ?? 0,
                        SellingPoints: userRewards?.SellingPoints ?? 0,
                        totalSpotsCompleted: userRewards?.totalSpotsCompleted ?? allCompletedSpots.length,
                        badges: userRewards?.badges ?? [],
                        rank: userRewards?.rank || (userRewards?.leaderboardRank ? `Rank #${userRewards.leaderboardRank}` : "Seedling"),
                        currentStreak: currentStreak,
                        longestStreak: longestStreak,
                        activeDays: userRewards?.activeDays ?? [],
                        weekDays: weekDays,
                        freezeShields: userRewards?.freezeShields ?? 1,
                        selectedRewards: userRewards?.selectedRewards ?? [],
                  },
                  userStatus: {
                        reportedSpots: canViewMarked ? allMarkedSpots.length : 0,
                        completedSpots: canViewCompleted ? allCompletedSpots.length : 0,
                        activeSpots: canViewAssigned ? assignedCaseItems.length : 0,
                        pendingSpots: canViewMarked ? markedCaseItems.filter((c) => c.status === "in_progress").length : 0,
                        totalSpots: canViewMarked ? allMarkedSpots.length : 0,
                        streaks: currentStreak,
                        markedSpotsList: canViewMarked ? markedCaseItems : [],
                        assignedSpotsList: canViewAssigned ? assignedCaseItems : [],
                        completedSpotsList: canViewCompleted ? completedCaseItems : [],
                        cases: userCases,
                  },
            });
      } catch (error) {
            return next(errorHandler(500, error.message || "Internal Server Error"));
      }
};

/**
 * Get User History (Marked Spots, Completed Spots, Assigned Spots, Liked Posts, Linked Posts)
 * GET /api/v1/profile/history
 */
export const getUserHistory = async (req, res, next) => {
      try {
            const userId = req.user?._id;
            if (!userId) {
                  return next(errorHandler(401, "Unauthorized"));
            }

            const user = await User.findById(userId);
            if (!user) {
                  return next(errorHandler(404, "User not found"));
            }

            const userRole = (user.role || "Civilian").toLowerCase();

            // Find UserStatus with populated references
            const userStatus = await UserStatus.findOne({
                  $or: [{ user: userId }, { userId }],
            })
                  .populate({ path: "MarkedSpots._id", model: "MarkedSpot" })
                  .populate({ path: "AssignedSpots._id", model: "MarkedSpot" })
                  .populate({ path: "CompletedSpots._id", model: "MarkedSpot" })
                  .populate({
                        path: "userLikePosts.postId",
                        model: "Post",
                        populate: [
                              { path: "SpotedUser", select: "username name avatar role" },
                              { path: "CleanedUser", select: "username name avatar role" },
                        ],
                  })
                  .populate({
                        path: "PostThatLinked.postId",
                        model: "Post",
                        populate: [
                              { path: "SpotedUser", select: "username name avatar role" },
                              { path: "CleanedUser", select: "username name avatar role" },
                        ],
                  });

            // Query MarkedSpots and Posts directly from DB
            const [dbMarkedSpots, dbCompletedSpots, dbAssignedSpots, dbLinkedPosts] = await Promise.all([
                  MarkedSpot.find({
                        markedBy: userId,
                        "preCodeOrGestureForMark.isUserCompleted": { $ne: false },
                  })
                        .populate("markedBy", "username avatar role")
                        .populate("isAssignedBy.assignedBy", "username avatar role")
                        .populate("isCompletedBy.completedBy", "username avatar role")
                        .sort({ markedAt: -1, createdAt: -1 }),
                  MarkedSpot.find({ "isCompletedBy.completedBy": userId })
                        .populate("markedBy", "username avatar role")
                        .populate("isAssignedBy.assignedBy", "username avatar role")
                        .populate("isCompletedBy.completedBy", "username avatar role")
                        .sort({ markedAt: -1, createdAt: -1 }),
                  MarkedSpot.find({ "isAssignedBy.assignedBy": userId, isCompleted: false })
                        .populate("markedBy", "username avatar role")
                        .populate("isAssignedBy.assignedBy", "username avatar role")
                        .sort({ markedAt: -1, createdAt: -1 }),
                  Post.find({
                        $or: [{ SpotedUser: userId }, { CleanedUser: userId }],
                  })
                        .populate("SpotedUser", "username name avatar role")
                        .populate("CleanedUser", "username name avatar role")
                        .sort({ createdAt: -1 }),
            ]);

            // Combine & format MarkedSpots
            const statusMarked = Array.isArray(userStatus?.MarkedSpots) ? userStatus.MarkedSpots : [];
            const markedMap = new Map();
            dbMarkedSpots.forEach((s) => {
                  if (s && s._id) markedMap.set(String(s._id), s);
            });
            statusMarked.forEach((item) => {
                  let s = item;
                  if (item._id && typeof item._id === "object" && (item._id.address || item._id.description || item._id._id)) {
                        s = item._id;
                  }
                  const spotIdStr = s._id ? String(s._id) : (typeof s.id === "string" ? s.id : null);
                  if (spotIdStr && s.preCodeOrGestureForMark?.isUserCompleted !== false && !markedMap.has(spotIdStr)) {
                        markedMap.set(spotIdStr, s);
                  }
            });
            const markedSpots = Array.from(markedMap.values()).map((s) => ({
                  id: `${String(s._id)}-marked`,
                  type: "marked",
                  category: "Marked Spot",
                  title: s.description || s.address || "Reported Trash Spot",
                  location: s.address || "Ward Locality",
                  image: s.image || "https://images.unsplash.com/photo-1530587191325-3db32d826c18?w=500&auto=format&fit=crop&q=80",
                  imageAfter: s.completedImage || s.imageAfter,
                  isCompleted: Boolean(s.isCompleted),
                  status: s.isCompleted ? "Completed" : "Pending",
                  date: s.markedAt || s.createdAt,
                  isVerified: Boolean(s.isVerified),
                  isCompletedVerify: s.isCompletedVerify || "pending",
                  isCompletedVerifyAt: s.isCompletedVerifyAt,
                  isAiVerified: s.isAiVerified || null,
                  details: {
                        critical: s.critcal || s.critical || "Medium",
                        description: s.description || s.address,
                        markedBy: s.markedBy?.username || s.markedBy?.name || user.username,
                        isVerified: Boolean(s.isVerified),
                        isCompletedVerify: s.isCompletedVerify || "pending",
                        isCompletedVerifyAt: s.isCompletedVerifyAt,
                        isAiVerified: s.isAiVerified || null,
                  },
            }));

            // Combine & format CompletedSpots
            const statusCompleted = Array.isArray(userStatus?.CompletedSpots) ? userStatus.CompletedSpots : [];
            const completedMap = new Map();
            dbCompletedSpots.forEach((s) => {
                  if (s && s._id) completedMap.set(String(s._id), s);
            });
            statusCompleted.forEach((item) => {
                  let s = item;
                  if (item._id && typeof item._id === "object" && (item._id.address || item._id.description || item._id._id)) {
                        s = item._id;
                  }
                  const spotIdStr = s._id ? String(s._id) : (typeof s.id === "string" ? s.id : null);
                  if (spotIdStr && !completedMap.has(spotIdStr)) {
                        completedMap.set(spotIdStr, s);
                  }
            });
            const completedSpots = Array.from(completedMap.values()).map((s) => ({
                  id: `${String(s._id)}-completed`,
                  type: "completed",
                  category: "Completed Spot",
                  title: s.description || s.address || "Cleaned & Resolved Spot",
                  location: s.address || "Cleaned Locality",
                  image: s.image || "https://images.unsplash.com/photo-1530587191325-3db32d826c18?w=500&auto=format&fit=crop&q=80",
                  imageAfter: s.completedImage || s.imageAfter || "https://images.unsplash.com/photo-1618477461853-cf6ed80faba5?w=500&auto=format&fit=crop&q=80",
                  isCompleted: true,
                  status: "Completed",
                  date: s.completedAt || s.updatedAt || s.createdAt,
                  details: {
                        critical: s.critcal || s.critical || "Medium",
                        description: s.description || s.address,
                        completedBy: s.isCompletedBy?.[s.isCompletedBy.length - 1]?.completedBy?.username || user.username,
                  },
            }));

            // Combine & format AssignedSpots
            const assignedSpotsList = Array.isArray(userStatus?.AssignedSpots) ? userStatus.AssignedSpots : [];
            const assignedMap = new Map();
            dbAssignedSpots.forEach((s) => {
                  if (s && s._id) assignedMap.set(String(s._id), s);
            });
            assignedSpotsList.forEach((item) => {
                  let s = item;
                  if (item._id && typeof item._id === "object" && (item._id.address || item._id.description || item._id._id)) {
                        s = item._id;
                  }
                  const spotIdStr = s._id ? String(s._id) : (typeof s.id === "string" ? s.id : null);
                  if (spotIdStr && !assignedMap.has(spotIdStr)) {
                        assignedMap.set(spotIdStr, {
                              ...s,
                              assignedAt: item.assignedAt || s.assignedAt || s.createdAt,
                              isPending: item.isPending ?? s.isPending ?? false,
                        });
                  }
            });
            const assignedSpots = Array.from(assignedMap.values()).map((s, idx) => ({
                  id: `${String(s._id || `assigned-${idx}`)}-assigned`,
                  type: "assigned",
                  category: "Assigned Spot",
                  title: s.description || s.address || "Assigned Civic Cleanup",
                  location: s.address || "Assigned Ward Spot",
                  image: s.image || "https://images.unsplash.com/photo-1604186837056-8e7c286756f2?w=500&auto=format&fit=crop&q=80",
                  imageAfter: s.completedImage || s.imageAfter,
                  isCompleted: Boolean(s.isCompleted),
                  status: s.isCompleted ? "Completed" : "In Progress",
                  date: s.assignedAt || s.updatedAt || s.createdAt,
                  details: {
                        critical: s.critcal || s.critical || "High",
                        description: s.description || s.address,
                        assignedTo: s.isAssignedBy?.[s.isAssignedBy.length - 1]?.assignedBy?.username || user.username,
                  },
            }));

            // Format Liked Posts
            const rawLiked = Array.isArray(userStatus?.userLikePosts) ? userStatus.userLikePosts : [];
            const likedPosts = rawLiked
                  .filter((item) => item && item.postId)
                  .map((item) => {
                        const post = item.postId;
                        return {
                              id: `${String(post._id)}-liked`,
                              type: "liked_post",
                              category: "Liked Post",
                              title: post.postName || post.description || "Liked Feed Post",
                              location: post.geolocation?.address || "Ward Locality",
                              image: post.imageAfter || post.imageBefore || "https://images.unsplash.com/photo-1618477461853-cf6ed80faba5?w=500&auto=format&fit=crop&q=80",
                              imageBefore: post.imageBefore,
                              imageAfter: post.imageAfter,
                              isLiked: true,
                              likeCount: post.likeCount || 0,
                              date: item.likedAt || post.createdAt,
                              details: {
                                    spotedUser: post.SpotedUser?.username || post.SpotedUser?.name || "Spotter",
                                    cleanedUser: post.CleanedUser?.username || post.CleanedUser?.name || "Cleaner",
                                    description: post.description || post.postName,
                              },
                        };
                  });

            // Format Linked Posts
            const linkedMap = new Map();
            (dbLinkedPosts || []).forEach((post) => {
                  if (post && post._id) linkedMap.set(String(post._id), post);
            });
            const rawLinked = Array.isArray(userStatus?.PostThatLinked) ? userStatus.PostThatLinked : [];
            rawLinked.forEach((item) => {
                  if (item && item.postId && item.postId._id) {
                        linkedMap.set(String(item.postId._id), item.postId);
                  }
            });
            const linkedPosts = Array.from(linkedMap.values()).map((post) => ({
                  id: `${String(post._id)}-linked`,
                  type: "linked_post",
                  category: "Linked Post",
                  title: post.postName || post.description || "Tagged Cleanup Post",
                  location: post.geolocation?.address || "Ward Locality",
                  image: post.imageAfter || post.imageBefore || "https://images.unsplash.com/photo-1618477461853-cf6ed80faba5?w=500&auto=format&fit=crop&q=80",
                  imageBefore: post.imageBefore,
                  imageAfter: post.imageAfter,
                  likeCount: post.likeCount || 0,
                  date: post.createdAt,
                  details: {
                        spotedUser: post.SpotedUser?.username || post.SpotedUser?.name || "Spotter",
                        cleanedUser: post.CleanedUser?.username || post.CleanedUser?.name || "Cleaner",
                        description: post.description || post.postName,
                  },
            }));

            // Combine all items sorted by date descending
            const all = [
                  ...markedSpots,
                  ...completedSpots,
                  ...assignedSpots,
                  ...likedPosts,
                  ...linkedPosts,
            ].sort((a, b) => new Date(b.date || Date.now()).getTime() - new Date(a.date || Date.now()).getTime());

            return responseHandler(res, 200, "User History Data", {
                  role: userRole,
                  user: {
                        id: user.username,
                        username: user.username,
                        name: user.certificatePreferences?.displayName || user.username,
                        displayName: user.certificatePreferences?.displayName || user.username,
                        email: user.email,
                        role: user.role,
                        avatar: user.avatar,
                        avatarUrl: typeof user.avatar === "string" ? user.avatar : user.avatar?.url || "",
                        address: user.address,
                        pincode: user.pincode,
                        geolocation: user.geolocation,
                        certificatePreferences: user.certificatePreferences,
                        accountActive: user.accountActive,
                        isVerified: user.isVerified,
                        isProfileCompleted: user.isProfileCompleted,
                        lastActiveAt: user.lastActiveAt,
                  },
                  history: {
                        markedSpots,
                        completedSpots,
                        assignedSpots,
                        likedPosts,
                        linkedPosts,
                        all,
                  },
            });
      } catch (error) {
            console.error("Error in getUserHistory:", error);
            return next(errorHandler(500, error.message || "Internal Server Error"));
      }
};

/**
 * Controller to update profile details (avatar and username only)
 */
export const updateProfile = async (req, res, next) => {
      try {
            const user = req.user;
            if (!user) {
                  return next(errorHandler(401, "Unauthorized"));
            }

            const { username, avatarUrl } = req.body || {};
            let isUpdated = false;

            // 1. Handle Username Update
            if (username && typeof username === "string") {
                  const trimmedUsername = username.trim().toLowerCase();
                  if (trimmedUsername !== user.username.toLowerCase()) {
                        if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
                              return res.status(400).json({
                                    success: false,
                                    message: "Username must be between 3 and 30 characters.",
                              });
                        }
                        const usernameRegex = /^[a-zA-Z0-9_]+$/;
                        if (!usernameRegex.test(trimmedUsername)) {
                              return res.status(400).json({
                                    success: false,
                                    message: "Username can only contain letters, numbers, and underscores.",
                              });
                        }

                        const existingUser = await User.findOne({
                              username: trimmedUsername,
                              _id: { $ne: user._id },
                        });

                        if (existingUser) {
                              return res.status(400).json({
                                    success: false,
                                    message: "Username is already taken. Please choose another one.",
                              });
                        }
                        if (user.previousUsernames.length >= 5) {
                              user.previousUsernames.shift();
                        }
                        user.previousUsernames.push({
                              username: user.username,
                              changedAt: Date.now()
                        });
                        user.username = trimmedUsername;
                        isUpdated = true;
                  }
            }

            // 2. Handle Avatar Update (File Upload or Data URL / Image URL)
            if (req.file) {
                  let fileInput = req.file;
                  if (req.file.buffer) {
                        const b64 = Buffer.from(req.file.buffer).toString("base64");
                        fileInput = `data:${req.file.mimetype};base64,${b64}`;
                  }

                  try {
                        if (user.avatar?.id) {
                              try {
                                    await deleteFromCloudinary(user.avatar.id);
                              } catch (e) {
                                    console.warn("Old avatar deletion warning:", e);
                              }
                        }
                        const result = await uploadToCloudinary(fileInput, "Safaiwatch_avatars");
                        if (user.previousAvatar.length >= 5) {
                              user.previousAvatar.shift();
                        }
                        user.previousAvatar.push({
                              url: user.avatar.url,
                              id: user.avatar.id,
                              changedAt: Date.now()
                        });
                        user.avatar = {
                              url: result.secure_url,
                              id: result.public_id
                        };
                        isUpdated = true;
                  } catch (err) {
                        console.error("Cloudinary upload error in updateProfile:", err);
                        return res.status(500).json({
                              success: false,
                              message: "Failed to upload avatar image to Cloudinary.",
                        });
                  }
            } else if (avatarUrl && typeof avatarUrl === "string" && avatarUrl.trim()) {
                  const trimmedUrl = avatarUrl.trim();
                  if (trimmedUrl.startsWith("data:image/")) {
                        try {
                              if (user.avatar?.id) {
                                    try {
                                          await deleteFromCloudinary(user.avatar.id);
                                    } catch (e) {
                                          console.warn("Old avatar deletion warning:", e);
                                    }
                              }
                              const result = await uploadToCloudinary(trimmedUrl, "Safaiwatch_avatars");
                              user.avatar = {
                                    url: result.secure_url,
                                    id: result.public_id,
                              };
                              isUpdated = true;
                        } catch (err) {
                              console.error("Cloudinary upload error in updateProfile:", err);
                              return res.status(500).json({
                                    success: false,
                                    message: "Failed to upload avatar image to Cloudinary.",
                              });
                        }
                  } else if (trimmedUrl !== user.avatar?.url) {
                        user.avatar = {
                              url: trimmedUrl,
                              id: "",
                        };
                        isUpdated = true;
                  }
            }

            if (isUpdated) {
                  await user.save();
            }

            const updatedAvatarUrl = user.avatar?.url || "";

            return responseHandler(res, 200, "Profile updated successfully.", {
                  user: {
                        id: user.username,
                        username: user.username,
                        email: user.email,
                        role: user.role,
                        avatar: user.avatar,
                        avatarUrl: updatedAvatarUrl,
                        isProfileCompleted: user.isProfileCompleted,
                  },
            });
      } catch (error) {
            console.error("Error in updateProfile:", error);
            return next(errorHandler(500, error.message || "Internal Server Error"));
      }
};

export const redeemReward = async (req, res, next) => {
      try {
            const userId = req.user?._id || req.user?.id || req.user;
            if (!userId) {
                  return next(errorHandler(401, "Unauthorized"));
            }
            const { name, rewardName, category, cost, pointsSpent, clothSize, size } = req.body;
            const itemToRedeem = rewardName || name;
            if (!itemToRedeem) {
                  return next(errorHandler(400, "Reward name is required"));
            }

            const chosenSize = clothSize || size || null;
            const result = await selectedRewards(req.user, itemToRedeem, chosenSize);

            if (!result.success) {
                  return next(errorHandler(400, result.message || "Failed to redeem reward"));
            }

            return responseHandler(res, 200, result.message || "Reward redeemed successfully", {
                  userRewards: result.userRewards,
                  claimedReward: result.claimedReward,
            });
      } catch (error) {
            console.error("Error in redeemReward:", error);
            return next(errorHandler(500, error.message || "Internal Server Error"));
      }
};

export const getUserRewardsHistory = async (req, res, next) => {
      try {
            const userId = req.user?._id;
            if (!userId) {
                  return next(errorHandler(401, "Unauthorized"));
            }
            const userRewards = await UserRewards.findOne({ $or: [{ user: userId }, { userId }] });
            const selectedRewards = userRewards?.selectedRewards || [];

            return responseHandler(res, 200, "User rewards history", {
                  selectedRewards,
                  karmaBalance: userRewards?.karmaPoints ?? 0,
                  SellingPoints: userRewards?.SellingPoints ?? 0,
            });
      } catch (error) {
            console.error("Error in getUserRewardsHistory:", error);
            return next(errorHandler(500, error.message || "Internal Server Error"));
      }
};

export const getUserNotifications = async (req, res, next) => {
      try {
            const userId = req.user?._id;
            if (!userId) {
                  return next(errorHandler(401, "Unauthorized"));
            }

            const userStatus = await UserStatus.findOne({
                  $or: [{ user: userId }, { userId }],
            }).populate({
                  path: "reportForme._id",
                  model: "Report",
                  select: "forWhat reasonForSpot reasonForSpotComplete spotId description imageUrl createdAt counterExplanation",
                  populate: {
                        path: "spotId",
                        model: "MarkedSpot",
                        select: "address description category wasteCategory image coordinates isSpotIsFake",
                  },
            });

            const rawList = Array.isArray(userStatus?.reportForme) ? userStatus.reportForme : [];

            // Map and format without exposing reporting userId; filter out spots where isSpotIsFake is true
            const reports = rawList
                  .filter((item) => {
                        const reportDoc = item._id && typeof item._id === "object" ? item._id : null;
                        if (!reportDoc) return false;
                        const spotDoc = reportDoc?.spotId && typeof reportDoc.spotId === "object" ? reportDoc.spotId : null;
                        // Do not show this report notification if spot.isSpotIsFake is true
                        if (spotDoc && spotDoc.isSpotIsFake === true) {
                              return false;
                        }
                        return true;
                  })
                  .map((item, index) => {
                  const reportDoc = item._id && typeof item._id === "object" ? item._id : null;
                  const reason = reportDoc?.reasonForSpot || reportDoc?.reasonForSpotComplete || "Reported for review";
                  const spotDoc = reportDoc?.spotId && typeof reportDoc.spotId === "object" ? reportDoc.spotId : null;

                  return {
                        id: reportDoc?._id ? String(reportDoc._id) : `report-${index}`,
                        reportId: reportDoc?._id ? String(reportDoc._id) : (item._id ? String(item._id) : null),
                        forWhat: item.forWhat || reportDoc?.forWhat || "reportSpot",
                        reasonForSpot: reportDoc?.reasonForSpot || null,
                        reasonForSpotComplete: reportDoc?.reasonForSpotComplete || null,
                        reason: reason,
                        description: reportDoc?.description || "",
                        imageUrl: reportDoc?.imageUrl || "",
                        reportAt: item.reportAt || reportDoc?.createdAt || new Date(),
                        counterExplanation: reportDoc?.counterExplanation?.explanation ? {
                              reason: reportDoc.counterExplanation.reason || "",
                              explanation: reportDoc.counterExplanation.explanation || "",
                              submittedAt: reportDoc.counterExplanation.submittedAt || null,
                        } : null,
                        spot: spotDoc ? {
                              id: spotDoc._id ? String(spotDoc._id) : null,
                              address: spotDoc.address || "Reported Spot",
                              category: spotDoc.category || spotDoc.wasteCategory || "Civic Spot",
                              image: spotDoc.image || null,
                              isSpotIsFake: Boolean(spotDoc.isSpotIsFake),
                        } : null,
                        isSpotIsFake: Boolean(spotDoc?.isSpotIsFake),
                  };
            }).sort((a, b) => new Date(b.reportAt).getTime() - new Date(a.reportAt).getTime());

            return responseHandler(res, 200, "User Notifications", {
                  reports,
                  count: reports.length,
            });
      } catch (error) {
            console.error("Error in getUserNotifications:", error);
            return next(errorHandler(500, error.message || "Internal Server Error"));
      }
};

export const submitReportExplanation = submitCounterEvidence;


export const getProfileById = getProfileByUsername;

