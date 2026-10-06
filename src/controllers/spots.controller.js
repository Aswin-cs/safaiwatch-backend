import mongoose from "mongoose";
import MarkedSpot from "../../models/markedSpots.model.js";
import UserStatus from "../../models/userStatus.model.js";
import UserRewards from "../../models/userRewards.model.js";
import User from "../../models/user.model.js";
import Post from "../../models/feeds.model.js";
import { responseHandler } from "../../utils/responseHandler.js";
import { errorHandler } from "../../utils/errorHandler.js";
import { deleteFromCloudinary, uploadToCloudinary } from "../../utils/Cloudinaryimage.utils.js";
import {
      rewardsCalculating,
      badgesCalculating,
      leaderboardRankCalculated,
      streaksCalculated,
} from "../../utils/rewards.utils.js";
import { getIo } from "../../config/socketIoConfig.js";
import { aiPhotoVerification, getImageFRomCLoudinary } from "../../utils/aiPhotoVerification.utils.js";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/envConfig.js";
import oneTimeModel from "../../models/one-time.model.js";

/**
 * Helper to get user ID from req.user or JWT token if available
 */
const getRequesterUserId = (req) => {
      if (req.user?._id) return req.user._id.toString();
      try {
            const token = req.cookies?.token || (req.headers?.authorization?.startsWith("Bearer ") ? req.headers.authorization.split(" ")[1] : null);
            if (token) {
                  const decoded = jwt.verify(token, JWT_SECRET);
                  return decoded?.userId?.toString() || decoded?.id?.toString() || null;
            }
      } catch (e) { }
      return null;
};

/**
 * Helper to upload image file or base64 data to Cloudinary if provided
 */
const handleImageUpload = async (req, defaultFolder = "SafaiWatch_spots", verificationData = null) => {
      let image = req.body?.image || "";

      if (req.file) {
            let fileInput = req.file.path;
            if (!fileInput && req.file.buffer) {
                  const b64 = Buffer.from(req.file.buffer).toString("base64");
                  fileInput = `data:${req.file.mimetype};base64,${b64}`;
            }
            const uploadRes = await uploadToCloudinary(fileInput, defaultFolder);
            image = uploadRes;
      } else if (image && image.startsWith("data:image/")) {
            const uploadRes = await uploadToCloudinary(image, defaultFolder);
            image = uploadRes;
      }

      return image;
};

/**
 * Helper to parse coordinates array [longitude, latitude]
 */
const parseCoordinates = (coords) => {
      if (Array.isArray(coords)) {
            return coords.map(Number);
      }
      if (typeof coords === "string") {
            try {
                  const parsed = JSON.parse(coords);
                  if (Array.isArray(parsed)) return parsed.map(Number);
            } catch (e) {
                  // Ignore JSON parse error, try comma separation
                  const parts = coords.split(",").map((item) => Number(item.trim()));
                  if (parts.length === 2 && !parts.some(isNaN)) return parts;
            }
      }
      if (coords && typeof coords === "object") {
            const lat = coords.latitude ?? coords.lat;
            const lng = coords.longitude ?? coords.lng;
            if (lat !== undefined && lng !== undefined) {
                  return [Number(lng), Number(lat)];
            }
      }
      return null;
};

/**
 * Mark/Create a new civic spot
 * POST /api/v1/spots
 */
const aiVerification = async (req, verificationData, savedSpotId, action = "marked", oneTimeRecordId = null) => {
      let fileInput = req.file?.path;
      if (!fileInput && req.file?.buffer) {
            const b64 = Buffer.from(req.file.buffer).toString("base64");
            fileInput = `data:${req.file.mimetype};base64,${b64}`;
      }
      if (!fileInput) {
            fileInput = req.body?.imageAfter || req.body?.image || "";
      }
      const userId = req.user?._id;
      (async () => {
            try {
                  const isvalid = await aiPhotoVerification(fileInput, req.file?.mimetype || "image/jpeg", verificationData, "real");
                  console.log(isvalid, `AI Audit Verification Result (${action})`);
                  const isVerified = Boolean(!isvalid?.isAiOrEdited && !isvalid?.isFraudulent);

                  if (savedSpotId && isvalid) {
                        const aiVerifiedData = {
                              isAiOrEdited: Boolean(isvalid?.isAiOrEdited),
                              forensicConfidence: Number(isvalid?.forensicConfidence || 0),
                              critcal: isvalid?.critcal || isvalid?.critical || "Low",
                              detectedManipulationType: isvalid?.detectedManipulationType || (isvalid?.isAiOrEdited ? "AI_GENERATED" : "AUTHENTIC_PHOTO"),
                              forensicDetails: isvalid?.forensicDetails || isvalid?.summary || "",
                              gestureMatched: Boolean(isvalid?.gestureMatched ?? isvalid?.codeMatched),
                              detectedGestureName: isvalid?.detectedGestureName || "",
                              detectedCode: isvalid?.detectedCode || "",
                              isValidWasteReport: Boolean(isvalid?.isValidWasteReport),
                              isFraudulent: Boolean(isvalid?.isFraudulent),
                              fraudReason: isvalid?.fraudReason || "",
                              summary: isvalid?.summary || "",
                              auditResult: isvalid,
                              verifiedAt: new Date(),
                        };

                        if (action === "marked") {
                              await MarkedSpot.findByIdAndUpdate(savedSpotId, {
                                    isVerified: isVerified,
                                    isCompletedVerify: "completed",
                                    isCompletedVerifyAt: new Date(),
                                    isAiVerified: aiVerifiedData,
                              });
                        }
                        else if (action === "completed" && isVerified) {
                              await newFunction(userId, savedSpotId, oneTimeRecordId, action);
                        } else if (action === "completed" && !isVerified) {
                              const failMsg = isvalid?.fraudReason || isvalid?.forensicDetails || "AI verification failed: Photo did not pass authenticity or cleanliness audit.";
                              if (oneTimeRecordId) {
                                    await oneTimeModel.findByIdAndUpdate(oneTimeRecordId, {
                                          message: failMsg,
                                          status: "failed",
                                          isVerified: false,
                                          aiAuditResult: isvalid,
                                    });
                              }
                              await UserStatus.findOneAndUpdate(
                                    { $or: [{ user: userId }, { userId }], "AssignedSpots._id": savedSpotId },
                                    {
                                          $set: { "AssignedSpots.$.isPending": false },
                                          $inc: { pendingCount: -1 }
                                    }
                              );
                        }

                        (async () => {
                              if (isVerified) {
                                    try {
                                          await rewardsCalculating(userId, { markedSpotId: savedSpotId }, action === "completed" ? "completed" : "marked");
                                          await streaksCalculated({ user_id: userId });
                                          await badgesCalculating({ user_id: userId });
                                          await leaderboardRankCalculated({ user_id: userId });
                                    } catch (rewardErr) {
                                          console.error(`Background reward calculation error in ${action}:`, rewardErr);
                                    }
                              }
                        })();

                        if (isVerified) {
                              try {
                                    const populatedSpot = await MarkedSpot.findById(savedSpotId)
                                          .populate("markedBy", "username avatar role email")
                                          .populate("isAssignedBy.assignedBy", "username avatar role email")
                                          .populate("isCompletedBy.completedBy", "username avatar role email");

                                    if (action === "completed") {
                                          getIo().emit("spot:completed", {
                                                spot: populatedSpot,
                                          });
                                    } else {
                                          getIo().emit("spot:created", {
                                                spot: populatedSpot,
                                          });
                                    }
                              } catch (socketErr) {
                                    console.error("Socket emit error in aiVerification:", socketErr);
                              }
                        }

                        const userDoc = userId ? await User.findById(userId).select("username") : null;
                        const targetUsername = userDoc?.username || "";

                        // Emit real-time notification event targeted specifically for the user
                        const toastPayload = {
                              spotId: savedSpotId,
                              userId: targetUsername,
                              username: targetUsername,
                              action: action,
                              isVerified: isVerified,
                              isCompletedVerify: "completed",
                              isAiOrEdited: Boolean(isvalid?.isAiOrEdited),
                              isFraudulent: Boolean(isvalid?.isFraudulent),
                              fraudReason: isvalid?.fraudReason || "",
                              forensicDetails: isvalid?.forensicDetails || "",
                              aiVerified: aiVerifiedData,
                              message: isVerified
                                    ? action === "completed"
                                          ? "AI Audit Complete: Spot cleanup has been verified authentic! ✓"
                                          : "AI Audit Complete: Your reported civic spot has been verified authentic! ✓"
                                    : `AI Audit Alert: Spot ${action} photo was flagged (${isvalid?.fraudReason || "verification failed"}).`
                        };

                        try {
                              if (targetUsername) {
                                    getIo().to(`user:${targetUsername}`).to(targetUsername).emit("spot:ai-verified", toastPayload);
                              }
                              if (userId) {
                                    getIo().to(`user:${userId}`).to(String(userId)).emit("spot:ai-verified", toastPayload);
                              }
                              getIo().emit("spot:ai-verified", toastPayload);
                        } catch (socketErr) {
                              console.error("Socket emit error for spot:ai-verified:", socketErr);
                        }
                  }

            } catch (error) {
                  console.log(error, `error in aiPhotoVerification (${action})`);
            }
      })();
};
export const markSpot = async (req, res, next) => {
      const session = await mongoose.startSession();
      let imageUrl = null;
      try {
            const userId = req.user?._id;
            if (!userId) {
                  return next(errorHandler(401, "Unauthorized"));
            }
            const isVerified = await preImageOrCodeVerification(req, "mark");
            console.log(isVerified, "isVerified,,,,,,,,,,,,,");
            imageUrl = await handleImageUpload(req, "SafaiWatch_spots");

            const { address, description, critical, critcal, type, category, wasteCategory, wasteType } = req.body;

            if (!address || !description) {
                  return next(errorHandler(400, "Address and description are required fields."));
            }



            const rawCoords = req.body.coordinates || req.body.geolocation?.coordinates;
            const coordinates = parseCoordinates(rawCoords);
            if (!coordinates || coordinates.length !== 2 || coordinates.some(isNaN)) {
                  return next(errorHandler(400, "Valid coordinates [longitude, latitude] are required."));
            }


            const finalImageUrl = typeof imageUrl === "string" ? imageUrl : (imageUrl?.secure_url || imageUrl?.url || "");
            const finalImageId = typeof imageUrl === "object" ? (imageUrl?.public_id || "") : "";

            if (!finalImageUrl) {
                  return next(errorHandler(400, "An image is required to mark a spot."));
            }

            const criticalLevel = critcal || critical || "Low";
            const validCriticalEnum = ["Very High", "High", "Medium", "Low"];
            const finalCritical = validCriticalEnum.includes(criticalLevel) ? criticalLevel : "Low";
            const finalCategory = category || wasteCategory || wasteType || "Mixed Waste";

            session.startTransaction();
            const newSpot = await MarkedSpot.findByIdAndUpdate({
                  _id: isVerified?.id
            }, {
                  address,
                  type: type === "Point" ? "Point" : "Point",
                  coordinates,
                  description,
                  category: finalCategory,
                  wasteCategory: finalCategory,
                  image: finalImageUrl,
                  imageId: finalImageId,
                  critcal: finalCritical,

            }).session(session);

            const aiData = await aiVerification(req, isVerified, isVerified.id);
            let userStatus = await UserStatus.findOne({
                  $or: [{ user: userId }, { userId }],
            }).session(session);

            if (!userStatus) {
                  userStatus = new UserStatus({ user: userId });
            }

            const userCoords = parseCoordinates(req.body.userLocation || req.body.currentLocation) || coordinates || req.user?.geolocation?.coordinates || [77.209, 28.6139];
            userStatus.currentLocation = {
                  type: "Point",
                  coordinates: userCoords,
            };

            userStatus.MarkedSpots.push({
                  _id: isVerified.id,
                  karmaPoints: (finalCritical === "High" || finalCritical === "Very High") ? 20 : finalCritical === "Medium" ? 10 : 5,
                  markedAt: newSpot.markedAt,
            });

            userStatus.pendingCount = (userStatus.pendingCount || 0) + 1;
            userStatus.totalCount = (userStatus.totalCount || 0) + 1;

            await userStatus.save({ session });
            await session.commitTransaction();
            await session.endSession();

            // Populate markedBy user object so the response contains the full user details (username, avatar, role)
            const populatedSpot = await MarkedSpot.findById({ _id: newSpot._id })
                  .populate("markedBy", "username avatar role email");

            // Calculate rewards, badges, streaks & leaderboard rank in parallel background task (non-blocking)


            return responseHandler(res, 201, "Spot marked successfully", {
                  spot: populatedSpot || savedSpot,
            });
      } catch (error) {
            if (session.inTransaction()) {
                  await session.abortTransaction();
            }
            if (imageUrl?.public_id) {
                  deleteFromCloudinary(imageUrl.public_id);
            }
            await session.endSession();
            next(error);
      }
};

export const createSpot = markSpot;

/**
 * Get all marked spots with filtering, search, and pagination
 * GET /api/v1/spots
 */
export const getMarkedSpots = async (req, res, next) => {
      try {
            const {
                  status,
                  critcal,
                  critical,
                  markedBy,
                  search,
                  lat,
                  lng,
                  radius,
                  page = 1,
                  limit = 20,
            } = req.query;

            const query = {};
            const andConditions = [];

            if (status === "completed") {
                  query.isCompleted = true;
            } else if (status === "pending") {
                  query.isCompleted = false;
            }

            const targetCritical = critcal || critical;
            if (targetCritical) {
                  query.critcal = targetCritical;
            }

            if (markedBy && mongoose.Types.ObjectId.isValid(markedBy)) {
                  query.markedBy = markedBy;
            }

            if (search) {
                  andConditions.push({
                        $or: [
                              { address: { $regex: search, $options: "i" } },
                              { description: { $regex: search, $options: "i" } },
                        ],
                  });
            }

            if (lat && lng) {
                  const parsedLat = parseFloat(lat);
                  const parsedLng = parseFloat(lng);
                  const parsedRadiusKm = parseFloat(radius) || 10; // 10 km default

                  if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
                        query.coordinates = {
                              $near: {
                                    $geometry: {
                                          type: "Point",
                                          coordinates: [parsedLng, parsedLat],
                                    },
                                    $maxDistance: parsedRadiusKm * 1000,
                              },
                        };
                  }
            }

            // Verification & Ownership visibility restriction:
            // Spots marked by other users MUST have isVerified: true to be visible in frontend.
            // Spots marked by the requesting user themselves are visible even if unverified/pending verification.
            const requesterId = getRequesterUserId(req);

            if (markedBy) {
                  if (!requesterId || markedBy.toString() !== requesterId.toString()) {
                        query.isVerified = true;
                  }
            } else {
                  if (requesterId) {
                        andConditions.push({
                              $or: [
                                    { markedBy: requesterId },
                                    { isVerified: true },
                              ],
                        });
                  } else {
                        query.isVerified = true;
                  }
            }

            if (andConditions.length > 0) {
                  query.$and = andConditions;
            }

            const pageNum = Math.max(1, parseInt(page, 10));
            const limitNum = Math.max(1, parseInt(limit, 10));
            const skip = (pageNum - 1) * limitNum;

            const [spots, totalCount] = await Promise.all([
                  MarkedSpot.find(query)
                        .populate("markedBy", "username avatar role email")
                        .populate("isAssignedBy.assignedBy", "username avatar role email")
                        .populate("isCompletedBy.completedBy", "username avatar role email")
                        .sort({ markedAt: -1 })
                        .skip(skip)
                        .limit(limitNum),
                  MarkedSpot.countDocuments(query),
            ]);

            // Only attach pending verification data/message to the particular user who submitted it
            const pendingOneTimesBySpotId = new Map();
            if (requesterId) {
                  const userPendingRecords = await oneTimeModel.find({
                        user: requesterId,
                        image: { $exists: true, $ne: "" },
                  });
                  userPendingRecords.forEach((record) => {
                        if (record.markspotid) {
                              pendingOneTimesBySpotId.set(record.markspotid.toString(), record);
                        }
                  });
            }

            const sanitizedSpots = spots.map((spotDoc) => {
                  const markedById = spotDoc.markedBy?._id ? spotDoc.markedBy._id.toString() : spotDoc.markedBy?.toString();
                  const isOwner = Boolean(requesterId && markedById && requesterId === markedById);
                  const spotObj = spotDoc.toObject ? spotDoc.toObject() : { ...spotDoc };

                  if (!isOwner) {
                        delete spotObj.isAiVerified;
                        delete spotObj.isVerified;
                        delete spotObj.isCompletedVerify;
                        delete spotObj.isCompletedVerifyAt;
                  }

                  const spotIdStr = spotObj._id?.toString();
                  if (requesterId && pendingOneTimesBySpotId.has(spotIdStr)) {
                        const pendingDoc = pendingOneTimesBySpotId.get(spotIdStr);
                        const isFailed = pendingDoc.status === "failed";
                        spotObj.isPendingVerification = !isFailed;
                        spotObj.verificationStatus = pendingDoc.status || (pendingDoc.isVerified ? "verified" : "pending");
                        spotObj.pendingVerificationMsg = pendingDoc.message || (isFailed ? "AI verification failed: Photo did not pass verification." : "AI verification in progress for your cleanup submission.");
                        spotObj.pendingCleanupImage = pendingDoc.image;
                        spotObj.oneTimeVerificationId = pendingDoc._id;
                  } else {
                        spotObj.isPendingVerification = false;
                        spotObj.verificationStatus = null;
                        spotObj.oneTimeVerificationId = null;
                  }

                  return spotObj;
            });

            return responseHandler(res, 200, "Spots fetched successfully", {
                  spots: sanitizedSpots,
                  totalCount,
                  page: pageNum,
                  totalPages: Math.ceil(totalCount / limitNum),
            });
      } catch (error) {
            next(error);
      }
};

export const getAllSpots = getMarkedSpots;

/**
 * Get a single marked spot by ID
 * GET /api/v1/spots/:id
 */
export const getMarkedSpot = async (req, res, next) => {
      try {
            const spotId = req.params.id || req.query.id;

            if (!spotId || !mongoose.Types.ObjectId.isValid(spotId)) {
                  return next(errorHandler(400, "Invalid Spot ID"));
            }

            const spot = await MarkedSpot.findById(spotId)
                  .populate("markedBy", "username avatar role email")
                  .populate("isAssignedBy.assignedBy", "username avatar role email")
                  .populate("isCompletedBy.completedBy", "username avatar role email");

            if (!spot) {
                  return next(errorHandler(404, "Marked spot not found"));
            }

            const requesterId = getRequesterUserId(req);
            const markedById = spot.markedBy?._id ? spot.markedBy._id.toString() : (spot.markedBy ? spot.markedBy.toString() : "");
            const isOwner = Boolean(requesterId && markedById && requesterId === markedById);
            const spotObj = spot.toObject ? spot.toObject() : { ...spot };

            if (!isOwner && !spotObj.isVerified) {
                  return next(errorHandler(404, "Marked spot not found"));
            }

            if (!isOwner) {
                  delete spotObj.isAiVerified;
                  delete spotObj.isVerified;
                  delete spotObj.isCompletedVerify;
                  delete spotObj.isCompletedVerifyAt;
            }

            const spotIdStr = spotObj._id?.toString();
            if (requesterId) {
                  const pendingDoc = await oneTimeModel.findOne({
                        user: requesterId,
                        markspotid: spotIdStr,
                        image: { $exists: true, $ne: "" },
                  });
                  if (pendingDoc) {
                        const isFailed = pendingDoc.status === "failed";
                        spotObj.isPendingVerification = !isFailed;
                        spotObj.verificationStatus = pendingDoc.status || (pendingDoc.isVerified ? "verified" : "pending");
                        spotObj.pendingVerificationMsg = pendingDoc.message || (isFailed ? "AI verification failed: Photo did not pass verification." : "AI verification in progress for your cleanup submission.");
                        spotObj.pendingCleanupImage = pendingDoc.image;
                        spotObj.oneTimeVerificationId = pendingDoc._id;
                  } else {
                        spotObj.isPendingVerification = false;
                        spotObj.verificationStatus = null;
                        spotObj.oneTimeVerificationId = null;
                  }
            } else {
                  spotObj.isPendingVerification = false;
                  spotObj.verificationStatus = null;
                  spotObj.oneTimeVerificationId = null;
            }

            return responseHandler(res, 200, "Spot retrieved successfully", {
                  spot: spotObj,
            });
      } catch (error) {
            next(error);
      }
};

export const getSpotById = getMarkedSpot;

/**
 * Update spot details
 * PUT /api/v1/spots/:id
 */
export const updateSpot = async (req, res, next) => {
      try {
            const spotId = req.params.id;
            const userId = req.user?._id;

            if (!spotId || !mongoose.Types.ObjectId.isValid(spotId)) {
                  return next(errorHandler(400, "Invalid Spot ID"));
            }

            const spot = await MarkedSpot.findById(spotId);
            if (!spot) {
                  return next(errorHandler(404, "Spot not found"));
            }

            const isOwner = spot.markedBy.toString() === userId.toString();
            const isAuthorizedRole = ["Coordinator", "Hybrid"].includes(req.user?.role);

            if (!isOwner && !isAuthorizedRole) {
                  return next(errorHandler(403, "Forbidden: You cannot update this spot"));
            }

            const { address, description, critical, critcal, coordinates, category, wasteCategory, wasteType } = req.body;

            if (address) spot.address = address;
            if (description) spot.description = description;
            const targetCategory = category || wasteCategory || wasteType;
            if (targetCategory) {
                  spot.category = targetCategory;
                  spot.wasteCategory = targetCategory;
            }

            const targetCritical = critcal || critical;
            if (targetCritical && ["Very High", "High", "Medium", "Low"].includes(targetCritical)) {
                  spot.critcal = targetCritical;
            }

            if (coordinates) {
                  const parsedCoords = parseCoordinates(coordinates);
                  if (parsedCoords && parsedCoords.length === 2 && !parsedCoords.some(isNaN)) {
                        spot.coordinates = parsedCoords;
                  }
            }

            if (req.file || (req.body?.image && req.body.image.startsWith("data:image/"))) {
                  const newImageUrl = await handleImageUpload(req);
                  if (newImageUrl) spot.image = newImageUrl;
            } else if (req.body?.image) {
                  spot.image = req.body.image;
            }

            const updatedSpot = await spot.save();

            return responseHandler(res, 200, "Spot updated successfully", {
                  spot: updatedSpot,
            });
      } catch (error) {
            next(error);
      }
};

/**
 * Async helper to safely maintain and preserve already completed/submitted spots
 * when an unMarked action attempt is received.
 */
const maintainCompletedSpot = async (spot, userId) => {
      try {
            if (spot && !spot.preCodeOrGestureForMark?.isUserCompleted) {
                  spot.preCodeOrGestureForMark = {
                        ...spot.preCodeOrGestureForMark,
                        isUserCompleted: true,
                  };
                  await spot.save();
            }
            console.log(`Preserved and maintained completed spot ${spot?._id} for user ${userId}. Deletion prevented.`);
            return spot;
      } catch (err) {
            console.error("Error in maintainCompletedSpot:", err);
            return spot;
      }
};

/**
 * Delete a spot
 * DELETE /api/v1/spots/:id
 */
export const deleteSpot = async (req, res, next) => {
      let session = null;
      try {
            const spotId = req.params.id;
            const userId = req.user?._id;
            const action = req.body?.action || req.query?.action || "markedSpot";

            if (!spotId || !mongoose.Types.ObjectId.isValid(spotId)) {
                  return next(errorHandler(400, "Invalid Spot ID"));
            }

            const spot = await MarkedSpot.findById(spotId);
            if (!spot) {
                  return next(errorHandler(404, "Spot not found"));
            }

            // 1. Only the user who marked the spot can delete it (Civilian or Hybrid, but not a coordinator who didn't mark it)
            const isOwner = spot.markedBy?.toString() === userId?.toString();
            if (!isOwner) {
                  return next(errorHandler(403, "Forbidden: Only the user who marked this spot can delete it"));
            }

            // Handle unMarked action (triggered e.g. when user clicks back button during spot reporting)
            if (action === "unMarked") {
                  const isUserCompleted = Boolean(
                        spot.preCodeOrGestureForMark?.isUserCompleted
                  );
                  // If isUserCompleted is false, delete the draft/pending spot
                  if (!isUserCompleted) {
                        await MarkedSpot.findByIdAndDelete(spotId);
                        return responseHandler(res, 200, "Uncompleted draft spot discarded successfully");
                  } else {
                        // If it is true, don't delete it and maintain it in an async function for that
                        // await maintainCompletedSpot(spot, userId);
                        return responseHandler(res, 200, "Spot has already been submitted and completed. It cannot be deleted via back navigation.");
                  }
            }

            // Handle markedSpot action (standard civic spot deletion)
            if (action === "markedSpot") {
                  // If AI verification is still pending, don't delete and notify frontend
                  if (spot.isCompletedVerify === "pending") {
                        return responseHandler(
                              res,
                              400,
                              "Spot is still undergoing AI verification process. Please wait until verification is completed before deleting."
                        );
                  }
                  if (!spot.preCodeOrGestureForMark?.isUserCompleted) {
                        return responseHandler(
                              res, 400, "You cannot delete this spot"
                        )
                  }


                  // 2. If the spot is completed, user cannot delete that spot
                  if (spot.isCompleted) {
                        return next(errorHandler(400, "Bad Request: Completed spots cannot be deleted"));
                  }

                  // Extract assigned user IDs from spot.isAssignedBy before deleting
                  const assignedUserIds = (spot.isAssignedBy || [])
                        .map((item) => item.assignedBy?.toString())
                        .filter(Boolean);

                  session = await mongoose.startSession();
                  session.startTransaction();

                  // Delete the spot from MarkedSpot model
                  await MarkedSpot.findByIdAndDelete(spotId).session(session);

                  // Update UserStatus model of the creator user
                  let creatorStatus = await UserStatus.findOne({
                        $or: [{ user: userId }, { userId }],
                  }).session(session);

                  if (!creatorStatus) {
                        creatorStatus = new UserStatus({ user: userId });
                  }
                  if (creatorStatus.DeletedSpots.length >= 5) {
                        await session.abortTransaction();
                        await session.endSession();
                        return responseHandler(res, 400, "You have exceeded the maximum number of deleted spots. You can delete only 5 spots");
                  }

                  // Pull spot from MarkedSpots, AssignedSpots, CompletedSpots
                  creatorStatus.MarkedSpots.pull(spotId);
                  creatorStatus.AssignedSpots.pull(spotId);
                  creatorStatus.CompletedSpots.pull(spotId);

                  // Push deleted spot details to creator's DeletedSpots array
                  creatorStatus.DeletedSpots.push({
                        _id: spotId,
                        deletedBy: userId,
                        deletedAt: new Date(),
                  });

                  // Increment howManyTimesDeletedSpots count
                  creatorStatus.howManyTimesDeletedSpots = (creatorStatus.howManyTimesDeletedSpots || 0) + 1;

                  // Decrement pendingCount if spot was pending
                  if (creatorStatus.pendingCount && creatorStatus.pendingCount > 0) {
                        creatorStatus.pendingCount -= 1;
                  }

                  await creatorStatus.save({ session });

                  // Update UserStatus model of assigned user(s)
                  for (const assignedUserId of assignedUserIds) {
                        if (assignedUserId.toString() === userId.toString()) continue; // already updated creator

                        let assignedUserStatus = await UserStatus.findOne({
                              $or: [{ user: assignedUserId }, { userId: assignedUserId }],
                        }).session(session);

                        if (assignedUserStatus) {
                              assignedUserStatus.AssignedSpots.pull(spotId);
                              assignedUserStatus.MarkedSpots.pull(spotId);
                              assignedUserStatus.CompletedSpots.pull(spotId);

                              assignedUserStatus.DeletedSpots.push({
                                    _id: spotId,
                                    deletedBy: userId,
                                    deletedAt: new Date(),
                              });

                              if (assignedUserStatus.assignedCount && assignedUserStatus.assignedCount > 0) {
                                    assignedUserStatus.assignedCount -= 1;
                              }
                              if (assignedUserStatus.AssignedSpots.length === 0) {
                                    assignedUserStatus.status = "Free";
                              }

                              await assignedUserStatus.save({ session });
                        }
                  }

                  // Clean up image from Cloudinary
                  if (spot.imageId) {
                        await deleteFromCloudinary(spot.imageId);
                  }

                  await session.commitTransaction();
                  await session.endSession();

                  try {
                        getIo().emit("spot:deleted", { spotId });
                  } catch (socketErr) {
                        console.error("Socket emit error in deleteSpot:", socketErr);
                  }

                  return responseHandler(res, 200, "Spot deleted successfully");
            }
      } catch (error) {
            if (session && session.inTransaction()) {
                  await session.abortTransaction();
            }
            if (session) {
                  await session.endSession();
            }
            next(error);
      }
};

/**
 * Assign a spot to a user/coordinator
 * PATCH /api/v1/spots/:id/assign
 */
/**
 * Helper: Get max allowed assignments based on criticality level
 */
const getMaxAssignments = (critcal) => {
      switch (critcal) {
            case 'Very High': return 4;
            case 'High': return 3;
            case 'Medium': return 2;
            case 'Low':
            default: return 1;
      }
};

export const assignSpot = async (req, res, next) => {
      const session = await mongoose.startSession();
      try {
            const spotId = req.params.id;
            const assignedByUserId = req.user?._id;
            const targetUserId = req.body?.assignedTo || assignedByUserId;


            if (!spotId || !mongoose.Types.ObjectId.isValid(spotId)) {
                  return next(errorHandler(400, "Invalid Spot ID"));
            }

            const spot = await MarkedSpot.findById(spotId);
            if (!spot) {
                  return next(errorHandler(404, "Spot not found"));
            }

            // Cannot assign a completed/closed spot
            if (spot.isCompleted) {
                  return next(errorHandler(400, "Bad Request: This spot is already completed and closed. No further assignments allowed."));
            }

            // Only Coordinator or Hybrid roles can assign spots
            const userRole = req.user?.role;
            if (!["Coordinator", "Hybrid"].includes(userRole)) {
                  return next(errorHandler(403, "Forbidden: Only Coordinators or Hybrid users can assign spots"));
            }

            // The user who marked the spot cannot assign it to themselves
            if (spot.markedBy.toString() === assignedByUserId.toString()) {
                  return next(errorHandler(403, "Forbidden: You cannot assign a spot that you reported yourself"));
            }

            // Prevent duplicate assignment of the same user
            const alreadyAssigned = (spot.isAssignedBy || []).some(
                  (entry) => entry.assignedBy && entry.assignedBy.toString() === assignedByUserId.toString()
            );
            if (alreadyAssigned) {
                  return next(errorHandler(400, "You are already assigned to this spot."));
            }

            // Enforce criticality-based assignment limit
            const maxAssignments = getMaxAssignments(spot.critcal);
            const currentAssignmentCount = (spot.isAssignedBy || []).length;
            if (currentAssignmentCount >= maxAssignments) {
                  return next(errorHandler(400, `Assignment limit reached. This spot (${spot.critcal || 'Low'} criticality) allows a maximum of ${maxAssignments} assigned user(s).`));
            }

            session.startTransaction();

            spot.isAssignedBy.push({
                  assignedBy: assignedByUserId,
                  assignedAt: new Date(),
            });

            await spot.save({ session });

            let userStatus = await UserStatus.findOne({
                  $or: [{ user: targetUserId }, { userId: targetUserId }],
            }).session(session);

            if (!userStatus) {
                  userStatus = new UserStatus({ user: targetUserId });
            }

            if (!userStatus.currentLocation || !userStatus.currentLocation.type || !userStatus.currentLocation.coordinates?.length) {
                  userStatus.currentLocation = {
                        type: "Point",
                        coordinates: spot.coordinates || req.user?.geolocation?.coordinates || [77.209, 28.6139],
                  };
            }

            userStatus.AssignedSpots.push({
                  _id: spot._id,
                  assignedBy: assignedByUserId,
                  assignedAt: new Date(),
            });

            userStatus.assignedCount = (userStatus.assignedCount || 0) + 1;
            userStatus.status = "Assigned";

            await userStatus.save({ session });

            await session.commitTransaction();
            await session.endSession();

            // Re-populate so response includes full assignment details
            const populatedSpot = await MarkedSpot.findById(spotId)
                  .populate("markedBy", "username avatar role email")
                  .populate("isAssignedBy.assignedBy", "username avatar role email");

            try {
                  getIo().emit("spot:assigned", {
                        spot: populatedSpot || spot,
                  });
            } catch (socketErr) {
                  console.error("Socket emit error in assignSpot:", socketErr);
            }

            return responseHandler(res, 200, "Spot assigned successfully", {
                  spot: populatedSpot || spot,
                  maxAssignments,
                  currentAssignments: (spot.isAssignedBy || []).length,
            });
      } catch (error) {
            if (session.inTransaction()) {
                  await session.abortTransaction();
            }
            await session.endSession();
            next(error);
      }
};

/**
 * Complete a spot cleanup
 * PATCH /api/v1/spots/:id/complete
 */
export const completeSpot = async (req, res, next) => {
      const session = await mongoose.startSession();
      try {
            const spotId = req.params.id || req.body?.spotId || req.body?.markspotid;
            const userId = req.user?._id;

            if (!spotId || !mongoose.Types.ObjectId.isValid(spotId)) {
                  return next(errorHandler(400, "Invalid Spot ID"));
            }

            const spot = await MarkedSpot.findById(spotId);
            if (!spot) {
                  return next(errorHandler(404, "Spot not found"));
            }

            if (spot.isCompleted) {
                  return next(errorHandler(400, "Spot has already been completed"));
            }

            // Only users who are assigned to this spot can complete it
            const isUserAssigned = (spot.isAssignedBy || []).some(
                  (entry) => entry.assignedBy && entry.assignedBy.toString() === userId.toString()
            );
            if (!isUserAssigned) {
                  return next(errorHandler(403, "Forbidden: Only assigned users can clean or complete this spot. You must first claim/assign yourself to this spot."));
            }

            // Check and consume pre-verification code or gesture if provided
            let isVerified = null;
            if (
                  req.body?.verificationId ||
                  req.body?.gestureVerificationId ||
                  req.body?.gestureId ||
                  req.body?.codeVerificationId ||
                  req.body?.codeId
            ) {
                  isVerified = await preImageOrCodeVerification(req, "complete");
                  console.log(isVerified, "completeSpot isVerified,,,,,,,,,,,,,");
            }

            const completedUploadRes = await handleImageUpload(req, "SafaiWatch_completed_spots");
            const completedImageUrl = typeof completedUploadRes === "string" ? completedUploadRes : (completedUploadRes?.secure_url || completedUploadRes?.url || "");
            const completedImagePublicId = typeof completedUploadRes === "object" ? (completedUploadRes?.public_id || "") : "";
            const userStatus = await UserStatus.findOneAndUpdate(
                  {
                        $or: [{ user: userId }, { userId }],
                        "AssignedSpots._id": spot._id, // MongoDB finds the exact index using its query engine
                  },
                  {
                        $set: {
                              "AssignedSpots.$.isPending": true, // '$' refers directly to the matched element
                        },
                        $inc: {
                              pendingCount: 1, // Atomically increments pendingCount in the same operation
                        },
                  },
                  { new: true } // Returns the updated document immediately
            );

            if (!userStatus) {
                  return next(errorHandler(404, "User status not found"));
            }

            const oneTimeRecord = await oneTimeModel.create({
                  user: userId,
                  forWhat: "completeSpot",
                  markspotid: spot._id,
                  image: completedImageUrl,
                  imageId: completedImagePublicId
            });

            // Trigger AI Audit Verification for cleanup resolution
            const aiData = await aiVerification(req, isVerified, spot._id, "completed", oneTimeRecord.id);

            // Real-time socket event to notify frontend of submitting user
            try {
                  const verifyingPayload = {
                        spotId: spot._id,
                        userId: userId.toString(),
                        action: "completed",
                        status: "verifying",
                        message: "Cleanup photo uploaded! AI verification in progress...",
                  };
                  if (userId) {
                        getIo().to(`user:${userId}`).to(String(userId)).emit("spot:ai-verifying", verifyingPayload);
                  }
                  getIo().emit("spot:ai-verifying", verifyingPayload);
            } catch (socketErr) {
                  console.error("Socket emit error for spot:ai-verifying:", socketErr);
            }

            return responseHandler(res, 200, "Image verification in progress", {
                  spot: oneTimeRecord,
                  userStatus,
                  isPending: true,
                  message: "Cleanup photo uploaded! AI verification in progress...",
            });
            //// we need ai verification for completed image and then we can update the spot with ai verification result


      } catch (error) {
            if (session.inTransaction()) {
                  await session.abortTransaction();
            }
            await session.endSession();
            next(error);
      }
};

const newFunction = async (userId, spotId, oneTimeRecordId, action) => {
      const session = await mongoose.startSession();
      try {
            session.startTransaction();
            const completedImageData = await oneTimeModel.findById(oneTimeRecordId).session(session);
            const completedImageUrl = completedImageData?.image || "";
            const completedImagePublicId = completedImageData?.imageId || "";
            const spot = await MarkedSpot.findById(spotId).session(session);
            if (!spot) {
                  throw new Error("Spot not found");
            }
            spot.isCompleted = true;
            if (completedImageUrl) {
                  spot.completedImage = completedImageUrl;
                  spot.completedImageId = completedImagePublicId;
            }

            spot.isCompletedBy.push({
                  completedBy: userId,
                  completedAt: new Date(),
            });

            await spot.save({ session });
            let userStatus = await UserStatus.findOne({
                  $or: [{ user: userId }, { userId }],
            }).session(session);
            await oneTimeModel.findByIdAndDelete(oneTimeRecordId).session(session);

            if (!userStatus) {
                  userStatus = new UserStatus({ user: userId });
            }

            if (!userStatus.currentLocation || !userStatus.currentLocation.type || !userStatus.currentLocation.coordinates?.length) {
                  userStatus.currentLocation = {
                        type: "Point",
                        coordinates: spot.coordinates || [77.209, 28.6139],
                  };
            }

            userStatus.CompletedSpots.push({
                  _id: spot._id,
                  assignedBy: spot.isAssignedBy?.[spot.isAssignedBy.length - 1]?.assignedBy || userId,
                  karmaPoints: (spot.critcal === "High" || spot.critcal === "Very High") ? 50 : spot.critcal === "Medium" ? 25 : (spot.critcal === "Low" ? 15 : 10),
                  completedAt: new Date(),
            });

            userStatus.AssignedSpots.pull(spot._id);

            userStatus.completedCount = (userStatus.completedCount || 0) + 1;
            if (userStatus.pendingCount && userStatus.pendingCount > 0) {
                  userStatus.pendingCount -= 1;
            }
            if (userStatus.assignedCount && userStatus.assignedCount > 0) {
                  userStatus.assignedCount -= 1;
            }
            userStatus.status = "Free";

            await userStatus.save({ session });

            let userRewards = await UserRewards.findOne({
                  $or: [{ user: userId }, { userId }],
            }).session(session);

            if (!userRewards) {
                  userRewards = new UserRewards({ user: userId });
            }

            userRewards.totalSpotsCompleted = (userRewards.totalSpotsCompleted || 0) + 1;

            const completedCount = userRewards.totalSpotsCompleted;
            if (completedCount >= 20) {
                  userRewards.rank = "Forest";
            } else if (completedCount >= 10) {
                  userRewards.rank = "Tree";
            } else if (completedCount >= 5) {
                  userRewards.rank = "Sapling";
            } else {
                  userRewards.rank = "Seedling";
            }

            await userRewards.save({ session });
            (async () => {
                  if (completedImageUrl) {
                        const post = await Post.create(
                              [
                                    {
                                          postName: `Cleanup at ${spot.address}`,
                                          SpotedUser: spot.markedBy,
                                          CleanedUser: userId,
                                          description: spot.description || "Civic spot cleaned up successfully!",
                                          imageBefore: spot.image,
                                          imageAfter: completedImageUrl,
                                          geolocation: {
                                                type: "Point",
                                                address: spot.address,
                                                coordinates: spot.coordinates,
                                          },
                                          createdAt: new Date(),
                                    },
                              ],

                        );
                        await UserStatus.findOneAndUpdate({
                              $or: [{ user: userId }, { userId }],
                        }, {
                              $push: {
                                    PostThatLinked: {
                                          PostId: post._id,
                                          linkedAt: new Date(),
                                    }
                              }
                        })
                        await UserStatus.findOneAndUpdate({
                              user: spot.markedBy,
                        },
                              {
                                    $push: {
                                          PostThatLinked: {
                                                PostId: post._id,
                                                linkedAt: new Date(),
                                          }
                                    }
                              })

                  }
            })();

            await session.commitTransaction();
            await session.endSession();

            // // Calculate rewards, badges, streaks & leaderboard rank in parallel background task (non-blocking)
            // (async () => {
            //       try {
            //             await rewardsCalculating(userId, { markedSpotId: spot._id }, "completed");
            //             await streaksCalculated({ user_id: userId });
            //             await badgesCalculating({ user_id: userId });
            //             await leaderboardRankCalculated({ user_id: userId });
            //       } catch (rewardErr) {
            //             console.error("Background reward calculation error in completeSpot:", rewardErr);
            //       }
            // })();

            const populatedCompletedSpot = await MarkedSpot.findById(spot._id)
                  .populate("markedBy", "username avatar role email")
                  .populate("isAssignedBy.assignedBy", "username avatar role email")
                  .populate("isCompletedBy.completedBy", "username avatar role email");

            try {
                  getIo().emit("spot:completed", {
                        spot: populatedCompletedSpot || spot,
                  });
            } catch (socketErr) {
                  console.error("Socket emit error in completeSpot:", socketErr);
            }



      }
      catch (error) {
            console.error("Error in newFunction:", error);
            return error;
      }
}
/**
 * Rate a completed spot
 * PATCH /api/v1/spots/:id/rate
 */
export const rateSpot = async (req, res, next) => {
      try {
            const spotId = req.params.id;
            const { rating } = req.body;

            if (!spotId || !mongoose.Types.ObjectId.isValid(spotId)) {
                  return next(errorHandler(400, "Invalid Spot ID"));
            }

            const numericRating = Number(rating);
            if (!numericRating || numericRating < 1 || numericRating > 5) {
                  return next(errorHandler(400, "Rating must be a number between 1 and 5"));
            }

            const spot = await MarkedSpot.findById(spotId);
            if (!spot) {
                  return next(errorHandler(404, "Spot not found"));
            }

            spot.rating = numericRating;
            await spot.save();

            return responseHandler(res, 200, "Spot rated successfully", {
                  spot,
            });
      } catch (error) {
            next(error);
      }
};

export const getRandomGestureVerification = async (req, res, next) => {
      try {
            let isValidUser = req.user;
            const bodyUserId = req.body?.userId;
            if (!isValidUser && bodyUserId) {
                  if (mongoose.Types.ObjectId.isValid(bodyUserId)) {
                        isValidUser = await User.findById(bodyUserId);
                  }
                  if (!isValidUser) {
                        isValidUser = await User.findOne({ username: bodyUserId });
                  }
            }

            if (!isValidUser) {
                  return next(errorHandler(404, "User not found"));
            }
            const userId = isValidUser._id;
            const { coordinates, markspotid, spotId } = req.body;


            const imageUrl = await getImageFRomCLoudinary();
            if (!imageUrl) {
                  return next(errorHandler(404, "Gesture image could not be loaded"));
            }

            const action = req.body?.action || req.body?.target || "mark";
            if (isValidUser.role === "Coordinator" && action != "complete") {
                  return next(errorHandler(400, "Coordinator cannot perform this action"));
            }
            const expirationDate = new Date(Date.now() + 5 * 60 * 1000);

            // 1. Action "complete" -> Stores in OneTime model
            if (action === "complete") {
                  const targetSpotId = markspotid || spotId || req.body?.markspotid || req.body?.spotId || req.params?.id || req.body?.id || req.query?.markspotid || req.query?.spotId || req.query?.id;
                  if (!targetSpotId || !mongoose.Types.ObjectId.isValid(targetSpotId)) {
                        return next(errorHandler(400, "Valid spot ID is required for completion verification"));
                  }

                  const targetSpot = await MarkedSpot.findById(targetSpotId);
                  if (!targetSpot) {
                        return next(errorHandler(404, "Spot not found"));
                  }
                  if (targetSpot.isCompleted) {
                        return next(errorHandler(400, "Spot has already been completed"));
                  }

                  const oneTimeVerification = await oneTimeModel.findOneAndUpdate(
                        { user: userId, markspotid: targetSpotId },
                        {
                              $set: {
                                    user: userId,
                                    markspotid: targetSpotId,
                                    guestureImage: imageUrl,
                                    expirationDate,
                              }
                        },
                        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
                  );

                  // Clean up any duplicate pending verifications for this user
                  await oneTimeModel.deleteMany({
                        user: userId,
                        _id: { $ne: oneTimeVerification._id }
                  });

                  return responseHandler(res, 200, "Random gesture verification generated successfully", {
                        imageId: oneTimeVerification._id,
                        verificationId: oneTimeVerification._id,
                        imageUrl,
                  });
            }

            // 2. Action "mark" -> Stores in MarkedSpot under preCodeOrGestureForMark
            if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
                  return next(errorHandler(400, "Valid coordinates are required"));
            }

            const randomVerification = await MarkedSpot.findOneAndUpdate(
                  {
                        markedBy: userId,
                        $or: [
                              { "preCodeOrGestureForMark.isUserCompleted": false },
                        ],
                  },
                  {
                        $set: {
                              markedBy: userId,
                              coordinates,
                              markedAt: new Date(),
                              expectedCompletionDate: expirationDate,
                              verificationtype: "gesture",
                              verificationGesture: imageUrl,
                              isUserCompleted: false,
                              preCodeOrGestureForMark: {
                                    isUserCompleted: false,
                                    verificationtype: "gesture",
                                    verificationGesture: imageUrl,
                                    isCodeOrGestureVerified: false,
                                    expectedCompletionDate: expirationDate,
                              },
                        }
                  },
                  { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
            );

            // Clean up any duplicate pending verifications for this user
            await MarkedSpot.deleteMany({
                  markedBy: userId,
                  $or: [
                        { "preCodeOrGestureForMark.isUserCompleted": false },
                        { isUserCompleted: false },
                  ],
                  _id: { $ne: randomVerification._id }
            });

            return responseHandler(res, 200, "Random gesture verification generated successfully", {
                  imageId: randomVerification._id,
                  verificationId: randomVerification._id,
                  imageUrl,
            });
      } catch (error) {
            console.error("Error in getRandomGestureVerification:", error);
            next(error);
      }
};

export const getRandomCodeVerification = async (req, res, next) => {
      try {
            let isValidUser = req.user;
            const bodyUserId = req.body?.userId;
            if (!isValidUser && bodyUserId) {
                  if (mongoose.Types.ObjectId.isValid(bodyUserId)) {
                        isValidUser = await User.findById(bodyUserId);
                  }
                  if (!isValidUser) {
                        isValidUser = await User.findOne({ username: bodyUserId });
                  }
            }

            if (!isValidUser) {
                  return next(errorHandler(404, "User not found"));
            }
            const userId = isValidUser._id;
            const { coordinates, markspotid, spotId } = req.body;
            const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
            const randomCode = Array.from(crypto.randomBytes(4), (b) => chars[b % chars.length]).join("");
            const action = req.body?.action || req.body?.target || "mark";
            if (isValidUser.role === "Coordinator" && action != "complete") {
                  return next(errorHandler(400, "Coordinator cannot perform this action"));
            }
            const expirationDate = new Date(Date.now() + 5 * 60 * 1000);

            // 1. Action "complete" -> Stores in OneTime model
            if (action === "complete") {
                  const targetSpotId = markspotid || spotId || req.body?.markspotid || req.body?.spotId || req.params?.id || req.body?.id || req.query?.markspotid || req.query?.spotId || req.query?.id;
                  if (!targetSpotId || !mongoose.Types.ObjectId.isValid(targetSpotId)) {
                        return next(errorHandler(400, "Valid spot ID is required for completion verification"));
                  }

                  const targetSpot = await MarkedSpot.findById(targetSpotId);
                  if (!targetSpot) {
                        return next(errorHandler(404, "Spot not found"));
                  }
                  if (targetSpot.isCompleted) {
                        return next(errorHandler(400, "Spot has already been completed"));
                  }

                  const oneTimeVerification = await oneTimeModel.findOneAndUpdate(
                        { user: userId, markspotid: targetSpotId },
                        {
                              $set: {
                                    user: userId,
                                    markspotid: targetSpotId,
                                    code: randomCode,
                                    expirationDate,
                              }
                        },
                        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
                  );

                  // Clean up any duplicate pending verifications for this user
                  await oneTimeModel.deleteMany({
                        user: userId,
                        _id: { $ne: oneTimeVerification._id }
                  });

                  return responseHandler(res, 200, "Random code verification generated successfully", {
                        verificationId: oneTimeVerification._id,
                        code: randomCode,
                  });
            }

            // 2. Action "mark" -> Stores in MarkedSpot under preCodeOrGestureForMark
            if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
                  return next(errorHandler(400, "Valid coordinates are required"));
            }

            const randomVerification = await MarkedSpot.findOneAndUpdate(
                  {
                        markedBy: userId,
                        $or: [
                              { "preCodeOrGestureForMark.isUserCompleted": false },
                        ],
                  },
                  {
                        $set: {
                              markedBy: userId,
                              coordinates,
                              markedAt: new Date(),
                              preCodeOrGestureForMark: {
                                    isUserCompleted: false,
                                    verificationtype: "code",
                                    verificationCode: randomCode,
                                    isCodeOrGestureVerified: false,
                                    expectedCompletionDate: expirationDate,
                              },
                        }
                  },
                  { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
            );

            // Clean up any duplicate pending verifications for this user
            await MarkedSpot.deleteMany({
                  markedBy: userId,
                  $or: [
                        { "preCodeOrGestureForMark.isUserCompleted": false },
                  ],
                  _id: { $ne: randomVerification._id }
            });

            return responseHandler(res, 200, "Random code verification generated successfully", {
                  verificationId: randomVerification._id,
                  code: randomCode,
            });
      } catch (error) {
            console.error("Error in getRandomCodeVerification:", error);
            next(error);
      }
};

export const preImageOrCodeVerification = async (req, target = "mark") => {
      const verificationId =
            req.body?.verificationId ||
            req.body?.gestureVerificationId ||
            req.body?.gestureId ||
            req.body?.codeVerificationId ||
            req.body?.codeId ||
            (target === "mark" ? req.params?.id : undefined);

      if (!verificationId || !mongoose.Types.ObjectId.isValid(verificationId)) {
            throw errorHandler(400, "Valid verification ID is required");
      }

      const userId = req.user?._id?.toString() || req.user?.id || "";
      if (!userId) {
            throw errorHandler(401, "Unauthorized");
      }

      const isValidUser = await User.findById(userId);
      if (!isValidUser) {
            throw errorHandler(404, "User not found");
      }

      if (isValidUser.role === "Coordinator" && target !== "complete") {
            throw errorHandler(400, "Coordinator cannot perform this action");
      }

      // 1. Completion Action: Verify against OneTime model
      if (target === "complete" || req.body?.action == "complete") {
            const oneTimeDoc = await oneTimeModel.findById(verificationId);
            if (!oneTimeDoc) {
                  throw errorHandler(404, "Invalid or expired completion verification ID");
            }

            if (oneTimeDoc.expirationDate && new Date(oneTimeDoc.expirationDate).getTime() < Date.now()) {
                  await oneTimeModel.findByIdAndDelete(verificationId);
                  throw errorHandler(400, "Verification code/gesture has expired");
            }

            if (oneTimeDoc.user && oneTimeDoc.user.toString() !== userId) {
                  throw errorHandler(403, "Verification does not belong to this user");
            }

            // Clean up any duplicate pending verifications for this user
            await oneTimeModel.deleteMany({
                  user: userId,
                  _id: { $ne: oneTimeDoc._id }
            });

            const vType = oneTimeDoc.code ? "code" : "gesture";
            const vVal = oneTimeDoc.code || oneTimeDoc.guestureImage;

            return {
                  data: vVal,
                  type: vType,
                  id: oneTimeDoc.markspotid || oneTimeDoc._id,
                  verificationId: oneTimeDoc._id,
            };
      }

      // 2. Mark Action: Verify against MarkedSpot preCodeOrGestureForMark
      const markedSpot = await MarkedSpot.findById(verificationId);
      if (!markedSpot) {
            throw errorHandler(404, "Invalid or expired verification spot ID");
      }

      const markData = markedSpot.preCodeOrGestureForMark || {};
      const isVerified = markData.isCodeOrGestureVerified ?? markedSpot.isCodeOrGestureVerified;
      const isCompleted = markData.isUserCompleted ?? markedSpot.isUserCompleted;
      const expiry = markData.expectedCompletionDate || markedSpot.expectedCompletionDate;

      if (isVerified) {
            throw errorHandler(400, "Verification code/gesture has already been verified");
      }
      if (isCompleted) {
            throw errorHandler(400, "Verification code/gesture has already been used");
      }
      if (expiry && new Date(expiry).getTime() < Date.now()) {
            throw errorHandler(400, "Verification code/gesture has expired");
      }

      if (markedSpot.markedBy && markedSpot.markedBy.toString() !== userId) {
            throw errorHandler(403, "Verification does not belong to this user");
      }

      // Mark as verified and consumed
      await MarkedSpot.findOneAndUpdate(
            { _id: verificationId, markedBy: userId },
            {
                  "preCodeOrGestureForMark.isUserCompleted": true,
                  "preCodeOrGestureForMark.isCodeOrGestureVerified": true,
                  "preCodeOrGestureForMark.expectedCompletionDate": new Date(),
            }
      );

      const vType = markData.verificationtype || markedSpot.verificationtype;
      const vVal = vType === "gesture"
            ? (markData.verificationGesture || markedSpot.verificationGesture)
            : (markData.verificationCode || markedSpot.verificationCode);

      return {
            data: vVal,
            type: vType,
            id: markedSpot._id,
      };
};

/**
 * Delete one-time verification document (e.g. after AI verification failure)
 * and revert spot isPending status so the user can re-upload
 * DELETE /api/v1/spots/:id/one-time
 */
export const deleteOneTimeVerification = async (req, res, next) => {
      try {
            const id = req.params.id;
            const userId = req.user?._id?.toString() || req.user?.id;

            if (!userId) {
                  return next(errorHandler(401, "Unauthorized"));
            }

            if (!id || !mongoose.Types.ObjectId.isValid(id)) {
                  return next(errorHandler(400, "Valid Spot ID or Verification ID is required"));
            }

            // Find oneTime record by its own _id OR by markspotid belonging to this user
            const record = await oneTimeModel.findOne({
                  $or: [
                        { _id: id, user: userId },
                        { markspotid: id, user: userId },
                  ],
            });

            if (!record) {
                  return next(errorHandler(404, "Verification record not found"));
            }

            const spotId = record.markspotid;

            // Delete the one-time record
            await oneTimeModel.findByIdAndDelete(record._id);

            // Set isPending = false in UserStatus for this spot
            if (spotId) {
                  const userStatus = await UserStatus.findOne({
                        $or: [{ user: userId }, { userId }],
                  });
                  if (userStatus) {
                        const assignedSpot = userStatus.AssignedSpots?.find(
                              (s) => s._id && s._id.toString() === spotId.toString()
                        );
                        if (assignedSpot) {
                              assignedSpot.isPending = false;
                        }
                        if (userStatus.pendingCount && userStatus.pendingCount > 0) {
                              userStatus.pendingCount -= 1;
                        }
                        await userStatus.save();
                  }
            }

            return responseHandler(res, 200, "Verification document deleted successfully. You can now upload a new cleanup photo.", {
                  spotId,
                  oneTimeVerificationId: record._id,
            });
      } catch (error) {
            next(error);
      }
};



