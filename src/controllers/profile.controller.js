import mongoose from "mongoose";
import User from "../../models/user.model.js";
import UserRewards from "../../models/userRewards.model.js";
import UserStatus from "../../models/userStatus.model.js";
import MarkedSpot from "../../models/markedSpots.model.js";
import Post from "../../models/feeds.model.js";
import { errorHandler } from "../../utils/errorHandler.js";
import { responseHandler } from "../../utils/responseHandler.js";
import { JWT_SECRET } from "../../config/envConfig.js";
import jwt from "jsonwebtoken";
import { uploadToCloudinary, deleteFromCloudinary } from "../../utils/Cloudinaryimage.utils.js";

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
                  if (s && s.markedAt) {
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

            const [userRewards, userStatus, dbMarkedSpots, dbCompletedSpots] = await Promise.all([
                  UserRewards.findOne({ $or: [{ user: userId }, { userId }] }),
                  UserStatus.findOne({ $or: [{ user: userId }, { userId }] })
                        .populate({ path: "MarkedSpots._id", model: "MarkedSpot" })
                        .populate({ path: "AssignedSpots._id", model: "MarkedSpot" })
                        .populate({ path: "CompletedSpots._id", model: "MarkedSpot" }),
                  MarkedSpot.find({ markedBy: userId }).sort({ markedAt: -1 }),
                  MarkedSpot.find({ "isCompletedBy.completedBy": userId }).sort({ markedAt: -1 }),
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
                  const s = item._id || item;
                  if (s && s._id && !markedMap.has(String(s._id))) {
                        markedMap.set(String(s._id), s);
                  }
            });
            const allMarkedSpots = Array.from(markedMap.values());

            const completedMap = new Map();
            dbCompletedSpots.forEach((s) => {
                  if (s && s._id) completedMap.set(String(s._id), s);
            });
            statusCompleted.forEach((item) => {
                  const s = item._id || item;
                  if (s && s._id && !completedMap.has(String(s._id))) {
                        completedMap.set(String(s._id), s);
                  }
            });
            const allCompletedSpots = Array.from(completedMap.values());

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
                  };
            });

            const assignedCaseItems = assignedSpots.map((item, i) => {
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

            let userCases = [];

            if (userRole === "civilian") {
                  userCases = [...markedCaseItems];
            } else if (userRole === "coordinator") {
                  userCases = [...assignedCaseItems, ...completedCaseItems];
            } else {
                  userCases = [...markedCaseItems, ...assignedCaseItems, ...completedCaseItems];
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
                  ...allMarkedSpots.map((s, idx) => ({
                        id: `ldg-mark-${s._id || idx}`,
                        title: `Reported: ${s.address || "Trash Spot"}`,
                        date: new Date(s.markedAt || s.createdAt || Date.now()).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                        amount: 10,
                        type: "earned",
                        icon: "add_location_alt",
                  })),
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
                        _id: user._id,
                        username: user.username,
                        email: user.email,
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
                  },
                  userStatus: {
                        reportedSpots: allMarkedSpots.length,
                        completedSpots: allCompletedSpots.length,
                        activeSpots: assignedCaseItems.length,
                        pendingSpots: markedCaseItems.filter((c) => c.status === "in_progress").length,
                        totalSpots: allMarkedSpots.length,
                        streaks: currentStreak,
                        markedSpotsList: markedCaseItems,
                        assignedSpotsList: assignedCaseItems,
                        completedSpotsList: completedCaseItems,
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

            const [userRewards, userStatus, dbMarkedSpots, dbCompletedSpots] = await Promise.all([
                  UserRewards.findOne({ $or: [{ user: userId }, { userId }] }),
                  UserStatus.findOne({ $or: [{ user: userId }, { userId }] }),
                  MarkedSpot.find({ markedBy: userId }),
                  MarkedSpot.find({ "isCompletedBy.completedBy": userId }),
            ]);

            const markedSpots = Array.isArray(userStatus?.MarkedSpots) ? userStatus.MarkedSpots : [];
            const assignedSpots = Array.isArray(userStatus?.AssignedSpots) ? userStatus.AssignedSpots : [];
            const completedSpots = Array.isArray(userStatus?.CompletedSpots) ? userStatus.CompletedSpots : [];
            const totalMarkedCount = Math.max(dbMarkedSpots.length, markedSpots.length);
            const totalCompletedCount = Math.max(dbCompletedSpots.length, completedSpots.length);

            return responseHandler(res, 200, "User Basic Info", {
                  user: {
                        _id: user._id,
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

            const [userRewards, userStatus, dbMarkedSpots, dbCompletedSpots] = await Promise.all([
                  UserRewards.findOne({ $or: [{ user: userId }, { userId }] }),
                  UserStatus.findOne({ $or: [{ user: userId }, { userId }] })
                        .populate({ path: "MarkedSpots._id", model: "MarkedSpot" })
                        .populate({ path: "AssignedSpots._id", model: "MarkedSpot" })
                        .populate({ path: "CompletedSpots._id", model: "MarkedSpot" }),
                  MarkedSpot.find({ markedBy: userId }).sort({ markedAt: -1 }),
                  MarkedSpot.find({ "isCompletedBy.completedBy": userId }).sort({ markedAt: -1 }),
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
                  if (spotIdStr && !markedMap.has(spotIdStr)) {
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

            const userRole = (user.role || "Civilian").toLowerCase();

            const completedCaseItems = allCompletedSpots.map((s, i) => {
                  const spotIdStr = s._id ? String(s._id) : `completed-${i}`;
                  return {
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
            });

            const completedSpotIds = new Set(allCompletedSpots.map((s) => String(s._id || s.id)));

            const assignedCaseItems = assignedSpots
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

            const reqUserId = req.user?._id?.toString();
            const isOwner = Boolean(reqUserId && reqUserId === userId.toString());

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
                        ...(isOwner && {
                              isVerified: Boolean(s.isVerified),
                              isCompletedVerify: s.isCompletedVerify || "pending",
                              isCompletedVerifyAt: s.isCompletedVerifyAt,
                              isAiVerified: s.isAiVerified || null,
                        }),
                  };
            });

            let userCases = [];

            if (userRole === "civilian") {
                  userCases = [...markedCaseItems];
            } else if (userRole === "coordinator") {
                  userCases = [...assignedCaseItems, ...completedCaseItems];
            } else {
                  userCases = [...markedCaseItems, ...assignedCaseItems, ...completedCaseItems];
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
                        _id: user._id,
                        name: user.name,
                        role: user.role,
                        username: user.username,
                        avatar: typeof user.avatar === "string" ? user.avatar : user.avatar?.url || "",
                        address: user.address,
                        pincode: user.pincode,
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
                  },
                  userStatus: {
                        reportedSpots: allMarkedSpots.length,
                        completedSpots: allCompletedSpots.length,
                        activeSpots: assignedCaseItems.length,
                        pendingSpots: markedCaseItems.filter((c) => c.status === "in_progress").length,
                        totalSpots: allMarkedSpots.length,
                        streaks: currentStreak,
                        markedSpotsList: markedCaseItems,
                        assignedSpotsList: assignedCaseItems,
                        completedSpotsList: completedCaseItems,
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
                              { path: "SpotedUser", select: "_id username name avatar role" },
                              { path: "CleanedUser", select: "_id username name avatar role" },
                        ],
                  })
                  .populate({
                        path: "PostThatLinked.postId",
                        model: "Post",
                        populate: [
                              { path: "SpotedUser", select: "_id username name avatar role" },
                              { path: "CleanedUser", select: "_id username name avatar role" },
                        ],
                  });

            // Query MarkedSpots and Posts directly from DB
            const [dbMarkedSpots, dbCompletedSpots, dbLinkedPosts] = await Promise.all([
                  MarkedSpot.find({ markedBy: userId }).sort({ markedAt: -1 }),
                  MarkedSpot.find({ "isCompletedBy.completedBy": userId }).sort({ markedAt: -1 }),
                  Post.find({
                        $or: [{ SpotedUser: userId }, { CleanedUser: userId }],
                  })
                        .populate("SpotedUser", "_id username name avatar role")
                        .populate("CleanedUser", "_id username name avatar role")
                        .sort({ createdAt: -1 }),
            ]);

            // Combine & format MarkedSpots
            const statusMarked = Array.isArray(userStatus?.MarkedSpots) ? userStatus.MarkedSpots : [];
            const markedMap = new Map();
            dbMarkedSpots.forEach((s) => {
                  if (s && s._id) markedMap.set(String(s._id), s);
            });
            statusMarked.forEach((item) => {
                  const s = item._id || item;
                  if (s && s._id && !markedMap.has(String(s._id))) {
                        markedMap.set(String(s._id), s);
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
                  const s = item._id || item;
                  if (s && s._id && !completedMap.has(String(s._id))) {
                        completedMap.set(String(s._id), s);
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
                        completedBy: user.username,
                  },
            }));

            // Combine & format AssignedSpots
            const assignedSpotsList = Array.isArray(userStatus?.AssignedSpots) ? userStatus.AssignedSpots : [];
            const assignedSpots = assignedSpotsList.map((item) => {
                  const s = item._id || item;
                  return {
                        id: `${String(s._id || item._id)}-assigned`,
                        type: "assigned",
                        category: "Assigned Spot",
                        title: s.description || s.address || "Assigned Civic Cleanup",
                        location: s.address || "Assigned Ward Spot",
                        image: s.image || "https://images.unsplash.com/photo-1604186837056-8e7c286756f2?w=500&auto=format&fit=crop&q=80",
                        imageAfter: s.completedImage || s.imageAfter,
                        isCompleted: Boolean(s.isCompleted),
                        status: s.isCompleted ? "Completed" : "In Progress",
                        date: item.assignedAt || s.updatedAt || s.createdAt,
                        details: {
                              critical: s.critcal || s.critical || "High",
                              description: s.description || s.address,
                        },
                  };
            });

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
                        _id: user._id,
                        username: user.username,
                        name: user.name,
                        role: user.role,
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
                        _id: user._id,
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

export const getProfileById = getProfileByUsername;

