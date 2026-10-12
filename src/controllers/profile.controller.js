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

// ==========================================
// CONSTANTS & CONFIGURATIONS
// ==========================================

const DEFAULT_IMAGES = {
      SPOT: "https://images.unsplash.com/photo-1530587191325-3db32d826c18?w=500&auto=format&fit=crop&q=80",
      COMPLETED: "https://images.unsplash.com/photo-1618477461853-cf6ed80faba5?w=500&auto=format&fit=crop&q=80",
      ASSIGNED: "https://images.unsplash.com/photo-1604186837056-8e7c286756f2?w=500&auto=format&fit=crop&q=80",
};

const DAY_NAMES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const USER_BASIC_POPULATE = "username avatar role";
const USER_EXTENDED_POPULATE = "username name avatar role";

const SPOT_POPULATE_CONFIG = [
      { path: "markedBy", select: USER_BASIC_POPULATE },
      { path: "isAssignedBy.assignedBy", select: USER_BASIC_POPULATE },
      { path: "isCompletedBy.completedBy", select: USER_BASIC_POPULATE },
];

// ==========================================
// HELPER UTILITIES
// ==========================================

/**
 * Extracts and verifies requester user ID from request (req.user, cookie, or Bearer auth header)
 */
const getRequesterUserId = (req) => {
      if (req.user?._id) {
            return req.user._id.toString();
      }

      try {
            const token =
                  req.cookies?.token ||
                  (req.headers?.authorization?.startsWith("Bearer ")
                        ? req.headers.authorization.split(" ")[1]
                        : null);

            if (token) {
                  const decoded = jwt.verify(token, JWT_SECRET);
                  const resolvedId = decoded?.userId || decoded?.id || decoded?._id;
                  return resolvedId ? resolvedId.toString() : null;
            }
      } catch {
            // Invalid or expired token
      }

      return null;
};

/**
 * Returns date string in YYYY-MM-DD format
 */
const getYYYYMMDD = (d) => {
      if (!d) return "";
      const date = new Date(d);
      if (isNaN(date.getTime())) return "";
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
};

/**
 * Computes weekly activity statuses for current Monday-Sunday window
 */
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

      return DAY_NAMES.map((dayName, idx) => {
            const dayDate = new Date(monday);
            dayDate.setDate(monday.getDate() + idx);
            const dateStr = getYYYYMMDD(dayDate);

            return {
                  day: dayName,
                  date: dateStr,
                  isToday: dateStr === todayStr,
                  isPast: dateStr < todayStr,
                  isActive: activeDatesSet.has(dateStr),
            };
      });
};

/**
 * Calculates user streak based on lastStreakDate and current activity
 */
const calculateStreaks = (userRewards, userStatus) => {
      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];

      const lastActiveDateStr = userRewards?.lastStreakDate
            ? new Date(userRewards.lastStreakDate).toISOString().split("T")[0]
            : null;

      let currentStreak = userRewards?.currentStreak ?? userStatus?.streaks ?? 0;
      if (lastActiveDateStr && lastActiveDateStr !== todayStr && lastActiveDateStr !== yesterdayStr) {
            currentStreak = 0;
      }
      const longestStreak = Math.max(userRewards?.longestStreak || 0, currentStreak);

      return { currentStreak, longestStreak };
};

/**
 * Deduplicates and merges database spots with embedded UserStatus spot records
 */
const mergeSpots = (dbSpots = [], statusSpots = [], filterFn = null) => {
      const spotMap = new Map();

      (dbSpots || []).forEach((s) => {
            if (s && s._id) {
                  spotMap.set(String(s._id), s);
            }
      });

      (statusSpots || []).forEach((item) => {
            if (!item) return;
            let s = item;
            if (item._id && typeof item._id === "object" && (item._id.address || item._id.description || item._id._id)) {
                  s = item._id;
            }

            const spotIdStr = s._id ? String(s._id) : (typeof s.id === "string" ? s.id : null);
            if (!spotIdStr || spotMap.has(spotIdStr)) return;

            if (filterFn && !filterFn(s, item)) return;

            spotMap.set(spotIdStr, s);
      });

      return Array.from(spotMap.values());
};

const getCriticality = (spot, defaultVal = "Medium") => spot?.critcal || spot?.critical || defaultVal;

const getLatestAssigneeName = (spot, defaultName = "Ward Coordinator") => {
      const assignees = spot?.isAssignedBy;
      if (Array.isArray(assignees) && assignees.length > 0) {
            const last = assignees[assignees.length - 1]?.assignedBy;
            return last?.username || last?.name || defaultName;
      }
      return defaultName;
};

const getLatestCompleterName = (spot, defaultName = "Clean Ranger") => {
      const completers = spot?.isCompletedBy;
      if (Array.isArray(completers) && completers.length > 0) {
            const last = completers[completers.length - 1]?.completedBy;
            return last?.username || last?.name || defaultName;
      }
      return defaultName;
};

/**
 * Case formatting helpers
 */
const formatCompletedCase = (s, i, isOwner = true) => {
      const spotIdStr = s._id ? String(s._id) : `completed-${i}`;
      const caseItem = {
            id: `${spotIdStr}-completed`,
            title: typeof s.description === "string" ? s.description : (typeof s.address === "string" ? s.address : "Resolved Spot"),
            location: typeof s.address === "string" ? s.address : "Municipal Spot",
            status: "resolved",
            karmaChange: isOwner ? "+50 Karma" : 150,
            badgeText: "Completed",
            badgeType: "green",
            image: typeof s.image === "string" && s.image ? s.image : DEFAULT_IMAGES.SPOT,
            imageAfter: s.completedImage || s.imageAfter || DEFAULT_IMAGES.COMPLETED,
            caseType: "completed",
            markedBy: s.markedBy?.username || s.markedBy?.name || "Civilian Reporter",
            assignedTo: getLatestAssigneeName(s, "Ward Coordinator"),
            completedBy: getLatestCompleterName(s, "Clean Ranger"),
            markedAt: s.markedAt || s.createdAt,
            completedAt: s.completedAt || s.updatedAt,
            critical: getCriticality(s, "Medium"),
            description: s.description || s.address,
      };

      if (isOwner) {
            caseItem.isVerified = Boolean(s.isVerified);
            caseItem.isCompletedVerify = s.isCompletedVerify || "completed";
            caseItem.isCompletedVerifyAt = s.isCompletedVerifyAt;
            caseItem.isAiVerified = s.isAiVerified || null;
      }

      return caseItem;
};

const formatAssignedCase = (item, i) => {
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
            image: typeof s.image === "string" && s.image ? s.image : DEFAULT_IMAGES.ASSIGNED,
            caseType: "assigned",
            markedBy: s.markedBy?.username || s.markedBy?.name || "Civilian Reporter",
            assignedTo: getLatestAssigneeName(s, "Ward Ranger"),
            markedAt: s.markedAt || s.createdAt,
            assignedAt: s.assignedAt || item.assignedAt || s.updatedAt,
            critical: getCriticality(s, "High"),
            description: s.description || s.address,
      };
};

const formatMarkedCase = (s, i, isOwner = true) => {
      const spotIdStr = s._id ? String(s._id) : `marked-${i}`;
      const isCompleted = Boolean(s.isCompleted);

      const caseItem = {
            id: `${spotIdStr}-marked`,
            title: typeof s.description === "string" ? s.description : (typeof s.address === "string" ? s.address : "Reported Civic Spot"),
            location: typeof s.address === "string" ? s.address : "Ward Locality",
            status: isCompleted ? "resolved" : "in_progress",
            badgeText: isCompleted ? "Completed" : "Pending",
            badgeType: isCompleted ? "green" : "yellow",
            image: typeof s.image === "string" && s.image ? s.image : DEFAULT_IMAGES.SPOT,
            imageAfter: isCompleted ? (s.completedImage || s.imageAfter || DEFAULT_IMAGES.COMPLETED) : undefined,
            caseType: "marked",
            markedBy: s.markedBy?.username || s.markedBy?.name || "Civilian Reporter",
            assignedTo: s.isAssignedBy?.length ? getLatestAssigneeName(s) : undefined,
            completedBy: s.isCompletedBy?.length ? getLatestCompleterName(s) : undefined,
            markedAt: s.markedAt || s.createdAt,
            completedAt: isCompleted ? (s.updatedAt || s.markedAt) : undefined,
            critical: getCriticality(s, "Medium"),
            description: s.description || s.address,
      };

      if (isOwner) {
            caseItem.isVerified = Boolean(s.isVerified);
            caseItem.isCompletedVerify = s.isCompletedVerify || "pending";
            caseItem.isCompletedVerifyAt = s.isCompletedVerifyAt;
            caseItem.isAiVerified = s.isAiVerified || null;
      }

      return caseItem;
};

/**
 * Filter case items according to user role
 */
const filterCasesByRole = (userRole, { markedCases, assignedCases, completedCases }) => {
      const role = (userRole || "civilian").toLowerCase();
      if (role === "coordinator") {
            return [...assignedCases, ...completedCases];
      }
      if (role === "hybrid") {
            return [...markedCases, ...assignedCases, ...completedCases];
      }
      return [...markedCases];
};

/**
 * Builds user karma ledger array
 */
const buildUserLedger = (allCompletedSpots = [], allMarkedSpots = [], userRewards = null) => [
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

/**
 * Formats user entity for profile responses
 */
const formatUserProfile = (user) => ({
      id: user.username,
      username: user.username,
      name: user.certificatePreferences?.displayName || user.name || user.username,
      displayName: user.certificatePreferences?.displayName || user.name || user.username,
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
});

/**
 * Formats user rewards entity for profile responses
 */
const formatUserRewards = (userRewards, { totalSpotsCompleted, currentStreak, longestStreak, weekDays, ledger }) => {
      const result = {
            karmaBalance: userRewards?.karmaPoints ?? 0,
            SellingPoints: userRewards?.SellingPoints ?? 0,
            totalSpotsCompleted: userRewards?.totalSpotsCompleted ?? totalSpotsCompleted,
            badges: userRewards?.badges ?? [],
            rank: userRewards?.rank || (userRewards?.leaderboardRank ? `Rank #${userRewards.leaderboardRank}` : "Seedling"),
            leaderboardRank: userRewards?.leaderboardRank ?? 0,
            currentStreak,
            longestStreak,
            activeDays: userRewards?.activeDays ?? [],
            weekDays: weekDays ?? [],
            freezeShields: userRewards?.freezeShields ?? 1,
            selectedRewards: userRewards?.selectedRewards ?? [],
      };

      if (ledger !== undefined) {
            result.ledger = ledger;
      }

      return result;
};

/**
 * Formats reports list from UserStatus.reportForme
 */
const formatReportNotifications = (rawList = []) => {
      return (Array.isArray(rawList) ? rawList : [])
            .filter((item) => {
                  const reportDoc = item?._id && typeof item._id === "object" ? item._id : null;
                  if (!reportDoc) return false;
                  const spotDoc = reportDoc.spotId && typeof reportDoc.spotId === "object" ? reportDoc.spotId : null;
                  return !(spotDoc && spotDoc.isSpotIsFake === true);
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
                        reason,
                        description: reportDoc?.description || "",
                        imageUrl: reportDoc?.imageUrl || "",
                        reportAt: item.reportAt || reportDoc?.createdAt || new Date(),
                        counterExplanation: reportDoc?.counterExplanation?.explanation
                              ? {
                                    reason: reportDoc.counterExplanation.reason || "",
                                    explanation: reportDoc.counterExplanation.explanation || "",
                                    submittedAt: reportDoc.counterExplanation.submittedAt || null,
                              }
                              : null,
                        spot: spotDoc
                              ? {
                                    id: spotDoc._id ? String(spotDoc._id) : null,
                                    address: spotDoc.address || "Reported Spot",
                                    category: spotDoc.category || spotDoc.wasteCategory || "Civic Spot",
                                    image: spotDoc.image || null,
                                    isSpotIsFake: Boolean(spotDoc.isSpotIsFake),
                              }
                              : null,
                        isSpotIsFake: Boolean(spotDoc?.isSpotIsFake),
                  };
            })
            .sort((a, b) => new Date(b.reportAt || 0).getTime() - new Date(a.reportAt || 0).getTime());
};

// ==========================================
// CONTROLLERS
// ==========================================

/**
 * Get authenticated user's profile with detailed rewards, spots, cases and ledger
 * GET /api/v1/profile/get-my-profile
 */
export const getMyProfile = async (req, res, next) => {
      try {
            const userId = req.user?._id;
            if (!userId) {
                  return next(errorHandler(401, "Unauthorized"));
            }

            const user = req.user.toObject ? req.user : await User.findById(userId).lean();
            if (!user) {
                  return next(errorHandler(404, "User not found"));
            }

            const [userRewards, userStatus, dbMarkedSpots, dbCompletedSpots, dbAssignedSpots] = await Promise.all([
                  UserRewards.findOne({ $or: [{ user: userId }, { userId }] }).lean(),
                  UserStatus.findOne({ $or: [{ user: userId }, { userId }] })
                        .populate({ path: "MarkedSpots._id", model: "MarkedSpot" })
                        .populate({ path: "AssignedSpots._id", model: "MarkedSpot" })
                        .populate({ path: "CompletedSpots._id", model: "MarkedSpot" })
                        .populate({
                              path: "reportForme._id",
                              model: "Report",
                              select: "forWhat reasonForSpot reasonForSpotComplete spotId description imageUrl createdAt counterExplanation",
                              populate: {
                                    path: "spotId",
                                    model: "MarkedSpot",
                                    select: "address description category wasteCategory image coordinates isSpotIsFake",
                              },
                        })
                        .lean(),
                  MarkedSpot.find({
                        markedBy: userId,
                        "preCodeOrGestureForMark.isUserCompleted": { $ne: false },
                  })
                        .populate(SPOT_POPULATE_CONFIG)
                        .sort({ markedAt: -1, createdAt: -1 })
                        .lean(),
                  MarkedSpot.find({ "isCompletedBy.completedBy": userId })
                        .populate(SPOT_POPULATE_CONFIG)
                        .sort({ markedAt: -1, createdAt: -1 })
                        .lean(),
                  MarkedSpot.find({ "isAssignedBy.assignedBy": userId, isCompleted: false })
                        .populate("markedBy", USER_BASIC_POPULATE)
                        .populate("isAssignedBy.assignedBy", USER_BASIC_POPULATE)
                        .sort({ markedAt: -1, createdAt: -1 })
                        .lean(),
            ]);

            const userRole = (user.role || "Civilian").toLowerCase();

            // Merge DB queries and status arrays with deduplication
            const allMarkedSpots = mergeSpots(
                  dbMarkedSpots,
                  userStatus?.MarkedSpots,
                  (s) => s.preCodeOrGestureForMark?.isUserCompleted !== false
            );
            const allCompletedSpots = mergeSpots(dbCompletedSpots, userStatus?.CompletedSpots);
            const allAssignedSpots = mergeSpots(dbAssignedSpots, userStatus?.AssignedSpots);

            // Format case items
            const completedCaseItems = allCompletedSpots.map((s, i) => formatCompletedCase(s, i, true));
            const assignedCaseItems = allAssignedSpots.map(formatAssignedCase);
            const markedCaseItems = allMarkedSpots.map((s, i) => formatMarkedCase(s, i, true));

            const isHybrid = userRole === "hybrid";
            const isCoordinator = userRole === "coordinator";
            const isCivilian = userRole === "civilian" || (!isHybrid && !isCoordinator);

            const canViewMarked = isHybrid || isCivilian;
            const canViewAssigned = isHybrid || isCoordinator;
            const canViewCompleted = isHybrid || isCoordinator;

            const userCases = filterCasesByRole(userRole, {
                  markedCases: markedCaseItems,
                  assignedCases: assignedCaseItems,
                  completedCases: completedCaseItems,
            });

            const userLedger = buildUserLedger(allCompletedSpots, allMarkedSpots, userRewards);
            const weekDays = getWeekDays(userRewards?.activeDays, userStatus);
            const { currentStreak, longestStreak } = calculateStreaks(userRewards, userStatus);

            return responseHandler(res, 200, "User Profile", {
                  user: formatUserProfile(user),
                  userRewards: formatUserRewards(userRewards, {
                        totalSpotsCompleted: allCompletedSpots.length,
                        currentStreak,
                        longestStreak,
                        weekDays,
                        ledger: userLedger,
                  }),
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
                        reportForme: formatReportNotifications(userStatus?.reportForme),
                  },
            });
      } catch (error) {
            return next(errorHandler(500, error.message || "Internal Server Error"));
      }
};

/**
 * Get basic summary info for user navigation, top bar, and lightweight views
 * GET /api/v1/profile/basic-info
 */
export const getBasicInfo = async (req, res, next) => {
      try {
            const userId = req.user?._id || getRequesterUserId(req);
            if (!userId) {
                  return next(errorHandler(401, "Unauthorized"));
            }

            const user = req.user || (await User.findById(userId).lean());
            if (!user) {
                  return next(errorHandler(404, "User not found"));
            }

            const [userRewards, userStatus, dbMarkedSpots, dbCompletedSpots] = await Promise.all([
                  UserRewards.findOne({ $or: [{ user: userId }, { userId }] }).lean(),
                  UserStatus.findOne({ $or: [{ user: userId }, { userId }] }).lean(),
                  MarkedSpot.find({ markedBy: userId, isUserCompleted: true }).select("_id").lean(),
                  MarkedSpot.find({ "isCompletedBy.completedBy": userId }).select("_id").lean(),
            ]);

            const markedSpots = (Array.isArray(userStatus?.MarkedSpots) ? userStatus.MarkedSpots : []).filter(
                  (s) => s?.isUserCompleted === true
            );
            const assignedSpots = Array.isArray(userStatus?.AssignedSpots) ? userStatus.AssignedSpots : [];
            const completedSpots = Array.isArray(userStatus?.CompletedSpots) ? userStatus.CompletedSpots : [];

            const totalMarkedCount = Math.max(dbMarkedSpots.length, markedSpots.length);
            const totalCompletedCount = Math.max(dbCompletedSpots.length, completedSpots.length);

            return responseHandler(res, 200, "User Basic Info", {
                  user: {
                        id: user.username,
                        name: user.certificatePreferences?.displayName || user.name || user.username,
                        role: user.role,
                        username: user.username,
                        avatarUrl: typeof user.avatar === "string" ? user.avatar : user.avatar?.url || "",
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

/**
 * Public profile view by username or ObjectId
 * GET /api/v1/profile/:username
 */
export const getProfileByUsername = async (req, res, next) => {
      let profileUsername = req.params.username || req.params.id;
      if (typeof profileUsername === "string" && profileUsername.startsWith("@")) {
            profileUsername = profileUsername.slice(1);
      }

      try {
            let user = await User.findOne({ username: new RegExp(`^${profileUsername}$`, "i") }).lean();
            if (!user) {
                  user = await User.findOne({ username: profileUsername }).lean();
            }
            if (!user && mongoose.Types.ObjectId.isValid(profileUsername)) {
                  user = await User.findById(profileUsername).lean();
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
                  UserRewards.findOne({ $or: [{ user: userId }, { userId }] }).lean(),
                  UserStatus.findOne({ $or: [{ user: userId }, { userId }] })
                        .populate({ path: "MarkedSpots._id", model: "MarkedSpot" })
                        .populate({ path: "AssignedSpots._id", model: "MarkedSpot" })
                        .populate({ path: "CompletedSpots._id", model: "MarkedSpot" })
                        .lean(),
                  MarkedSpot.find(markedSpotsFilter)
                        .populate(SPOT_POPULATE_CONFIG)
                        .sort({ markedAt: -1, createdAt: -1 })
                        .lean(),
                  MarkedSpot.find({ "isCompletedBy.completedBy": userId })
                        .populate(SPOT_POPULATE_CONFIG)
                        .sort({ markedAt: -1, createdAt: -1 })
                        .lean(),
                  MarkedSpot.find({ "isAssignedBy.assignedBy": userId, isCompleted: false })
                        .populate("markedBy", USER_BASIC_POPULATE)
                        .populate("isAssignedBy.assignedBy", USER_BASIC_POPULATE)
                        .sort({ markedAt: -1, createdAt: -1 })
                        .lean(),
            ]);

            const allMarkedSpots = mergeSpots(
                  dbMarkedSpots,
                  userStatus?.MarkedSpots,
                  (s) => (s.preCodeOrGestureForMark?.isUserCompleted !== false) && (isOwner || s.isVerified === true)
            ).filter((s) => isOwner || s.isVerified === true);

            const allCompletedSpots = mergeSpots(dbCompletedSpots, userStatus?.CompletedSpots);
            const allAssignedSpots = mergeSpots(dbAssignedSpots, userStatus?.AssignedSpots);

            const userRole = (user.role || "Civilian").toLowerCase();

            const completedCaseItems = allCompletedSpots.map((s, i) => formatCompletedCase(s, i, isOwner));

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
                  .map(formatAssignedCase);

            const markedCaseItems = allMarkedSpots.map((s, i) => formatMarkedCase(s, i, isOwner));

            const isHybrid = userRole === "hybrid";
            const isCoordinator = userRole === "coordinator";
            const isCivilian = userRole === "civilian" || (!isHybrid && !isCoordinator);

            const canViewMarked = isHybrid || isCivilian;
            const canViewAssigned = isHybrid || isCoordinator;
            const canViewCompleted = isHybrid || isCoordinator;

            const userCases = filterCasesByRole(userRole, {
                  markedCases: markedCaseItems,
                  assignedCases: assignedCaseItems,
                  completedCases: completedCaseItems,
            });

            const weekDays = getWeekDays(userRewards?.activeDays, userStatus);
            const { currentStreak, longestStreak } = calculateStreaks(userRewards, userStatus);

            return responseHandler(res, 200, "User Profile Info", {
                  user: formatUserProfile(user),
                  userRewards: formatUserRewards(userRewards, {
                        totalSpotsCompleted: allCompletedSpots.length,
                        currentStreak,
                        longestStreak,
                        weekDays,
                  }),
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

            const user = req.user || (await User.findById(userId).lean());
            if (!user) {
                  return next(errorHandler(404, "User not found"));
            }

            const userRole = (user.role || "Civilian").toLowerCase();

            const [userStatus, dbMarkedSpots, dbCompletedSpots, dbAssignedSpots, dbLinkedPosts] = await Promise.all([
                  UserStatus.findOne({ $or: [{ user: userId }, { userId }] })
                        .populate({ path: "MarkedSpots._id", model: "MarkedSpot" })
                        .populate({ path: "AssignedSpots._id", model: "MarkedSpot" })
                        .populate({ path: "CompletedSpots._id", model: "MarkedSpot" })
                        .populate({
                              path: "userLikePosts.postId",
                              model: "Post",
                              populate: [
                                    { path: "SpotedUser", select: USER_EXTENDED_POPULATE },
                                    { path: "CleanedUser", select: USER_EXTENDED_POPULATE },
                              ],
                        })
                        .populate({
                              path: "PostThatLinked.postId",
                              model: "Post",
                              populate: [
                                    { path: "SpotedUser", select: USER_EXTENDED_POPULATE },
                                    { path: "CleanedUser", select: USER_EXTENDED_POPULATE },
                              ],
                        })
                        .lean(),
                  MarkedSpot.find({
                        markedBy: userId,
                        "preCodeOrGestureForMark.isUserCompleted": { $ne: false },
                  })
                        .populate(SPOT_POPULATE_CONFIG)
                        .sort({ markedAt: -1, createdAt: -1 })
                        .lean(),
                  MarkedSpot.find({ "isCompletedBy.completedBy": userId })
                        .populate(SPOT_POPULATE_CONFIG)
                        .sort({ markedAt: -1, createdAt: -1 })
                        .lean(),
                  MarkedSpot.find({ "isAssignedBy.assignedBy": userId, isCompleted: false })
                        .populate("markedBy", USER_BASIC_POPULATE)
                        .populate("isAssignedBy.assignedBy", USER_BASIC_POPULATE)
                        .sort({ markedAt: -1, createdAt: -1 })
                        .lean(),
                  Post.find({
                        $or: [{ SpotedUser: userId }, { CleanedUser: userId }],
                  })
                        .populate("SpotedUser", USER_EXTENDED_POPULATE)
                        .populate("CleanedUser", USER_EXTENDED_POPULATE)
                        .sort({ createdAt: -1 })
                        .lean(),
            ]);

            // Combine & format MarkedSpots
            const allMarkedSpots = mergeSpots(
                  dbMarkedSpots,
                  userStatus?.MarkedSpots,
                  (s) => s.preCodeOrGestureForMark?.isUserCompleted !== false
            );
            const markedSpots = allMarkedSpots.map((s) => ({
                  id: `${String(s._id)}-marked`,
                  type: "marked",
                  category: "Marked Spot",
                  title: s.description || s.address || "Reported Trash Spot",
                  location: s.address || "Ward Locality",
                  image: s.image || DEFAULT_IMAGES.SPOT,
                  imageAfter: s.completedImage || s.imageAfter,
                  isCompleted: Boolean(s.isCompleted),
                  status: s.isCompleted ? "Completed" : "Pending",
                  date: s.markedAt || s.createdAt,
                  isVerified: Boolean(s.isVerified),
                  isCompletedVerify: s.isCompletedVerify || "pending",
                  isCompletedVerifyAt: s.isCompletedVerifyAt,
                  isAiVerified: s.isAiVerified || null,
                  details: {
                        critical: getCriticality(s, "Medium"),
                        description: s.description || s.address,
                        markedBy: s.markedBy?.username || s.markedBy?.name || user.username,
                        isVerified: Boolean(s.isVerified),
                        isCompletedVerify: s.isCompletedVerify || "pending",
                        isCompletedVerifyAt: s.isCompletedVerifyAt,
                        isAiVerified: s.isAiVerified || null,
                  },
            }));

            // Combine & format CompletedSpots
            const allCompletedSpots = mergeSpots(dbCompletedSpots, userStatus?.CompletedSpots);
            const completedSpots = allCompletedSpots.map((s) => ({
                  id: `${String(s._id)}-completed`,
                  type: "completed",
                  category: "Completed Spot",
                  title: s.description || s.address || "Cleaned & Resolved Spot",
                  location: s.address || "Cleaned Locality",
                  image: s.image || DEFAULT_IMAGES.SPOT,
                  imageAfter: s.completedImage || s.imageAfter || DEFAULT_IMAGES.COMPLETED,
                  isCompleted: true,
                  status: "Completed",
                  date: s.completedAt || s.updatedAt || s.createdAt,
                  details: {
                        critical: getCriticality(s, "Medium"),
                        description: s.description || s.address,
                        completedBy: s.isCompletedBy?.[s.isCompletedBy.length - 1]?.completedBy?.username || user.username,
                  },
            }));

            // Combine & format AssignedSpots
            const assignedSpotsMap = new Map();
            (dbAssignedSpots || []).forEach((s) => {
                  if (s && s._id) assignedSpotsMap.set(String(s._id), s);
            });
            (userStatus?.AssignedSpots || []).forEach((item) => {
                  if (!item) return;
                  let s = item;
                  if (item._id && typeof item._id === "object" && (item._id.address || item._id.description || item._id._id)) {
                        s = item._id;
                  }
                  const spotIdStr = s._id ? String(s._id) : (typeof s.id === "string" ? s.id : null);
                  if (spotIdStr && !assignedSpotsMap.has(spotIdStr)) {
                        assignedSpotsMap.set(spotIdStr, {
                              ...s,
                              assignedAt: item.assignedAt || s.assignedAt || s.createdAt,
                              isPending: item.isPending ?? s.isPending ?? false,
                        });
                  }
            });

            const assignedSpots = Array.from(assignedSpotsMap.values()).map((s, idx) => ({
                  id: `${String(s._id || `assigned-${idx}`)}-assigned`,
                  type: "assigned",
                  category: "Assigned Spot",
                  title: s.description || s.address || "Assigned Civic Cleanup",
                  location: s.address || "Assigned Ward Spot",
                  image: s.image || DEFAULT_IMAGES.ASSIGNED,
                  imageAfter: s.completedImage || s.imageAfter,
                  isCompleted: Boolean(s.isCompleted),
                  status: s.isCompleted ? "Completed" : "In Progress",
                  date: s.assignedAt || s.updatedAt || s.createdAt,
                  details: {
                        critical: getCriticality(s, "High"),
                        description: s.description || s.address,
                        assignedTo: s.isAssignedBy?.[s.isAssignedBy.length - 1]?.assignedBy?.username || user.username,
                  },
            }));

            // Format Liked Posts
            const likedPosts = (Array.isArray(userStatus?.userLikePosts) ? userStatus.userLikePosts : [])
                  .filter((item) => item?.postId)
                  .map((item) => {
                        const post = item.postId;
                        return {
                              id: `${String(post._id)}-liked`,
                              type: "liked_post",
                              category: "Liked Post",
                              title: post.postName || post.description || "Liked Feed Post",
                              location: post.geolocation?.address || "Ward Locality",
                              image: post.imageAfter || post.imageBefore || DEFAULT_IMAGES.COMPLETED,
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
            (userStatus?.PostThatLinked || []).forEach((item) => {
                  if (item?.postId?._id) {
                        linkedMap.set(String(item.postId._id), item.postId);
                  }
            });

            const linkedPosts = Array.from(linkedMap.values()).map((post) => ({
                  id: `${String(post._id)}-linked`,
                  type: "linked_post",
                  category: "Linked Post",
                  title: post.postName || post.description || "Tagged Cleanup Post",
                  location: post.geolocation?.address || "Ward Locality",
                  image: post.imageAfter || post.imageBefore || DEFAULT_IMAGES.COMPLETED,
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
                  user: formatUserProfile(user),
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
 * PATCH /api/v1/profile/update
 */
export const updateProfile = async (req, res, next) => {
      try {
            const requesterId = req.user?._id;
            if (!requesterId) {
                  return next(errorHandler(401, "Unauthorized"));
            }

            const user = await User.findById(requesterId);
            if (!user) {
                  return next(errorHandler(404, "User not found"));
            }

            const { username, avatarUrl } = req.body || {};
            let isUpdated = false;

            // Safe array initialization
            user.previousUsernames = Array.isArray(user.previousUsernames) ? user.previousUsernames : [];
            user.previousAvatar = Array.isArray(user.previousAvatar) ? user.previousAvatar : [];

            // 1. Handle Username Update
            if (username && typeof username === "string") {
                  const trimmedUsername = username.trim().toLowerCase();
                  if (trimmedUsername !== user.username.toLowerCase()) {
                        if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
                              return next(errorHandler(400, "Username must be between 3 and 30 characters."));
                        }
                        const usernameRegex = /^[a-zA-Z0-9_]+$/;
                        if (!usernameRegex.test(trimmedUsername)) {
                              return next(errorHandler(400, "Username can only contain letters, numbers, and underscores."));
                        }

                        const existingUser = await User.findOne({
                              username: trimmedUsername,
                              _id: { $ne: user._id },
                        });

                        if (existingUser) {
                              return next(errorHandler(400, "Username is already taken. Please choose another one."));
                        }

                        if (user.previousUsernames.length >= 5) {
                              user.previousUsernames.shift();
                        }
                        user.previousUsernames.push({
                              username: user.username,
                              changedAt: Date.now(),
                        });
                        user.username = trimmedUsername;
                        isUpdated = true;
                  }
            }

            // Helper to archive current avatar
            const archiveCurrentAvatar = () => {
                  if (user.avatar?.url || user.avatar?.id) {
                        if (user.previousAvatar.length >= 5) {
                              user.previousAvatar.shift();
                        }
                        user.previousAvatar.push({
                              url: user.avatar.url || "",
                              id: user.avatar.id || "",
                              changedAt: Date.now(),
                        });
                  }
            };

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
                        archiveCurrentAvatar();
                        user.avatar = {
                              url: result.secure_url,
                              id: result.public_id,
                        };
                        isUpdated = true;
                  } catch (err) {
                        console.error("Cloudinary upload error in updateProfile:", err);
                        return next(errorHandler(500, "Failed to upload avatar image to Cloudinary."));
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
                              archiveCurrentAvatar();
                              user.avatar = {
                                    url: result.secure_url,
                                    id: result.public_id,
                              };
                              isUpdated = true;
                        } catch (err) {
                              console.error("Cloudinary upload error in updateProfile:", err);
                              return next(errorHandler(500, "Failed to upload avatar image to Cloudinary."));
                        }
                  } else if (trimmedUrl !== user.avatar?.url) {
                        archiveCurrentAvatar();
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

            return responseHandler(res, 200, "Profile updated successfully.", {
                  user: {
                        id: user.username,
                        username: user.username,
                        email: user.email,
                        role: user.role,
                        avatar: user.avatar,
                        avatarUrl: user.avatar?.url || "",
                        isProfileCompleted: user.isProfileCompleted,
                  },
            });
      } catch (error) {
            console.error("Error in updateProfile:", error);
            return next(errorHandler(500, error.message || "Internal Server Error"));
      }
};

/**
 * Redeem reward item with points
 * POST /api/v1/profile/redeem-reward
 */
export const redeemReward = async (req, res, next) => {
      try {
            const user = req.user;
            if (!user) {
                  return next(errorHandler(401, "Unauthorized"));
            }

            const { name, rewardName, clothSize, size } = req.body || {};
            const itemToRedeem = rewardName || name;
            if (!itemToRedeem) {
                  return next(errorHandler(400, "Reward name is required"));
            }

            const chosenSize = clothSize || size || null;
            const result = await selectedRewards(user, itemToRedeem, chosenSize);

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

/**
 * Get user rewards redemption history
 * GET /api/v1/profile/rewards-history
 */
export const getUserRewardsHistory = async (req, res, next) => {
      try {
            const userId = req.user?._id;
            if (!userId) {
                  return next(errorHandler(401, "Unauthorized"));
            }

            const userRewards = await UserRewards.findOne({ $or: [{ user: userId }, { userId }] }).lean();
            const rewardsList = userRewards?.selectedRewards || [];

            return responseHandler(res, 200, "User rewards history", {
                  selectedRewards: rewardsList,
                  karmaBalance: userRewards?.karmaPoints ?? 0,
                  SellingPoints: userRewards?.SellingPoints ?? 0,
            });
      } catch (error) {
            console.error("Error in getUserRewardsHistory:", error);
            return next(errorHandler(500, error.message || "Internal Server Error"));
      }
};

/**
 * Get user report notifications and counter explanation status
 * GET /api/v1/profile/notifications
 */
export const getUserNotifications = async (req, res, next) => {
      try {
            const userId = req.user?._id;
            if (!userId) {
                  return next(errorHandler(401, "Unauthorized"));
            }

            const userStatus = await UserStatus.findOne({
                  $or: [{ user: userId }, { userId }],
            })
                  .populate({
                        path: "reportForme._id",
                        model: "Report",
                        select: "forWhat reasonForSpot reasonForSpotComplete spotId description imageUrl createdAt counterExplanation",
                        populate: {
                              path: "spotId",
                              model: "MarkedSpot",
                              select: "address description category wasteCategory image coordinates isSpotIsFake",
                        },
                  })
                  .lean();

            const reports = formatReportNotifications(userStatus?.reportForme);

            return responseHandler(res, 200, "User Notifications", {
                  reports,
                  count: reports.length,
            });
      } catch (error) {
            console.error("Error in getUserNotifications:", error);
            return next(errorHandler(500, error.message || "Internal Server Error"));
      }
};

// Aliases for route backward compatibility
export const submitReportExplanation = submitCounterEvidence;
export const getProfileById = getProfileByUsername;
