import mongoose from "mongoose";
import MarkedSpot from "../../models/markedSpots.model.js";
import UserStatus from "../../models/userStatus.model.js";
import UserRewards from "../../models/userRewards.model.js";
import User from "../../models/user.model.js";
import Post from "../../models/feeds.model.js";
import { responseHandler } from "../../utils/responseHandler.js";
import { errorHandler } from "../../utils/errorHandler.js";
import OneTime from "../../models/one-time.model.js";
import { deleteFromCloudinary, uploadToCloudinary } from "../../utils/Cloudinaryimage.utils.js";
import {
      rewardsCalculating,
      badgesCalculating,
      leaderboardRankCalculated,
      streaksCalculated,
} from "../../utils/rewards.utils.js";
import { getIo } from "../../config/socketIoConfig.js";
import { aiPhotoVerification, getImageFRomCLoudinary } from "../../utils/aiPhotoVerification.utils.js";


/**
 * Helper to upload image file or base64 data to Cloudinary if provided
 */
const handleImageUpload = async (req, defaultFolder = "SafaiWatch_spots") => {
      let image = req.body?.image || "";

      if (req.file) {
            let fileInput = req.file.path;
            if (!fileInput && req.file.buffer) {
                  const b64 = Buffer.from(req.file.buffer).toString("base64");
                  fileInput = `data:${req.file.mimetype};base64,${b64}`;
            }
            (async () => {
                  try {
                        const isvalid = await aiPhotoVerification(fileInput, req.file.mimetype);
                        console.log(isvalid)
                  }
                  catch (error) {
                        console.log(error, "error")
                  }
            })()
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
export const markSpot = async (req, res, next) => {
      const session = await mongoose.startSession();
      const imageUrl = await handleImageUpload(req);
      try {
            const userId = req.user?._id;
            if (!userId) {
                  return next(errorHandler(401, "Unauthorized"));
            }

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

            const newSpot = new MarkedSpot({
                  address,
                  type: type === "Point" ? "Point" : "Point",
                  coordinates,
                  description,
                  category: finalCategory,
                  wasteCategory: finalCategory,
                  image: finalImageUrl,
                  imageId: finalImageId,
                  markedBy: userId,
                  markedAt: new Date(),
                  critcal: finalCritical,
            });

            const savedSpot = await newSpot.save({ session });

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
                  _id: savedSpot._id,
                  isCompletedBy: userId,
                  markedAt: savedSpot.markedAt,
            });

            userStatus.pendingCount = (userStatus.pendingCount || 0) + 1;
            userStatus.totalCount = (userStatus.totalCount || 0) + 1;

            await userStatus.save({ session });

            await session.commitTransaction();
            await session.endSession();

            // Populate markedBy user object so the response contains the full user details (username, avatar, role)
            const populatedSpot = await MarkedSpot.findById(savedSpot._id)
                  .populate("markedBy", "_id username avatar role email");

            // Calculate rewards, badges, streaks & leaderboard rank in parallel background task (non-blocking)
            (async () => {
                  try {
                        await rewardsCalculating(userId, { markedSpotId: savedSpot._id }, "marked");
                        await Promise.all([
                              streaksCalculated({ user_id: userId }),
                              badgesCalculating({ user_id: userId }),
                        ]);
                        await leaderboardRankCalculated({ user_id: userId });
                  } catch (rewardErr) {
                        console.error("Background reward calculation error in markSpot:", rewardErr);
                  }
            })();

            try {
                  getIo().emit("spot:created", {
                        spot: populatedSpot || savedSpot,
                  });
            } catch (socketErr) {
                  console.error("Socket emit error in markSpot:", socketErr);
            }

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
                  query.$or = [
                        { address: { $regex: search, $options: "i" } },
                        { description: { $regex: search, $options: "i" } },
                  ];
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

            const pageNum = Math.max(1, parseInt(page, 10));
            const limitNum = Math.max(1, parseInt(limit, 10));
            const skip = (pageNum - 1) * limitNum;

            const [spots, totalCount] = await Promise.all([
                  MarkedSpot.find(query)
                        .populate("markedBy", "_id username avatar role email")
                        .populate("isAssignedBy.assignedBy", "_id username avatar role email")
                        .populate("isCompletedBy.completedBy", "_id username avatar role email")
                        .sort({ markedAt: -1 })
                        .skip(skip)
                        .limit(limitNum),
                  MarkedSpot.countDocuments(query),
            ]);

            return responseHandler(res, 200, "Spots fetched successfully", {
                  spots,
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
                  .populate("markedBy", "_id username avatar role email")
                  .populate("isAssignedBy.assignedBy", "_id username avatar role email")
                  .populate("isCompletedBy.completedBy", "_id username avatar role email");

            if (!spot) {
                  return next(errorHandler(404, "Marked spot not found"));
            }

            return responseHandler(res, 200, "Spot retrieved successfully", {
                  spot,
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
 * Delete a spot
 * DELETE /api/v1/spots/:id
 */
export const deleteSpot = async (req, res, next) => {
      const session = await mongoose.startSession();
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

            // 1. Only the user who marked the spot can delete it (Civilian or Hybrid, but not a coordinator who didn't mark it)
            const isOwner = spot.markedBy.toString() === userId.toString();
            if (!isOwner) {
                  return next(errorHandler(403, "Forbidden: Only the user who marked this spot can delete it"));
            }

            // 2. If the spot is completed, user cannot delete that spot
            if (spot.isCompleted) {
                  return next(errorHandler(400, "Bad Request: Completed spots cannot be deleted"));
            }

            // Extract assigned user IDs from spot.isAssignedBy before deleting
            const assignedUserIds = (spot.isAssignedBy || [])
                  .map((item) => item.assignedBy?.toString())
                  .filter(Boolean);

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
      } catch (error) {
            if (session.inTransaction()) {
                  await session.abortTransaction();
            }
            await session.endSession();
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
                  .populate("markedBy", "_id username avatar role email")
                  .populate("isAssignedBy.assignedBy", "_id username avatar role email");

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
            const spotId = req.params.id;
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

            const completedUploadRes = await handleImageUpload(req, "SafaiWatch_completed_spots");
            const completedImageUrl = typeof completedUploadRes === "string" ? completedUploadRes : (completedUploadRes?.secure_url || completedUploadRes?.url || "");
            const completedImagePublicId = typeof completedUploadRes === "object" ? (completedUploadRes?.public_id || "") : "";

            session.startTransaction();

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

            if (!userStatus) {
                  userStatus = new UserStatus({ user: userId });
            }

            if (!userStatus.currentLocation || !userStatus.currentLocation.type || !userStatus.currentLocation.coordinates?.length) {
                  userStatus.currentLocation = {
                        type: "Point",
                        coordinates: spot.coordinates || req.user?.geolocation?.coordinates || [77.209, 28.6139],
                  };
            }

            userStatus.CompletedSpots.push({
                  _id: spot._id,
                  assignedBy: spot.isAssignedBy?.[spot.isAssignedBy.length - 1]?.assignedBy || userId,
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
                                          description: req.body?.description || spot.description || "Civic spot cleaned up successfully!",
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

            // Calculate rewards, badges, streaks & leaderboard rank in parallel background task (non-blocking)
            (async () => {
                  try {
                        await rewardsCalculating(userId, { markedSpotId: spot._id }, "completed");
                        await Promise.all([
                              streaksCalculated({ user_id: userId }),
                              badgesCalculating({ user_id: userId }),
                        ]);
                        await leaderboardRankCalculated({ user_id: userId });
                  } catch (rewardErr) {
                        console.error("Background reward calculation error in completeSpot:", rewardErr);
                  }
            })();

            const populatedCompletedSpot = await MarkedSpot.findById(spot._id)
                  .populate("markedBy", "_id username avatar role email")
                  .populate("isAssignedBy.assignedBy", "_id username avatar role email")
                  .populate("isCompletedBy.completedBy", "_id username avatar role email");

            try {
                  getIo().emit("spot:completed", {
                        spot: populatedCompletedSpot || spot,
                  });
            } catch (socketErr) {
                  console.error("Socket emit error in completeSpot:", socketErr);
            }

            return responseHandler(res, 200, "Spot marked as completed successfully", {
                  spot: populatedCompletedSpot || spot,
                  karmaEarned: 150,
                  newKarmaPoints: userRewards.karmaPoints,
                  rank: userRewards.rank,
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
            const userId = req.body?.userId || req.user?._id?.toString() || req.user?.id;
            const { coordinates } = req.body;
            if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
                  return next(errorHandler(400, "Invalid user ID"));
            }
            if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
                  return next(errorHandler(400, "Invalid coordinates"));
            }
            const isValidUser = await User.findById(userId);
            if (!isValidUser) {
                  return next(errorHandler(404, "User not found"));
            }
            if (isValidUser.role == "Coordinator") {
                  return next(errorHandler(400, "Coordinator cannot perform this action"));
            }

            // Remove any old gesture verifications for this user
            await OneTime.deleteMany({ user: userId });

            // get the random gesture
            const imageUrl = await getImageFRomCLoudinary();

            if (!imageUrl) {
                  return next(errorHandler(404, "Image not found"));
            }
            const randomVerification = new OneTime({
                  user: userId,
                  guestureImage: imageUrl,
                  coordinates: coordinates,
                  expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            });
            await randomVerification.save();

            return responseHandler(res, 200, "Random gesture verification sent successfully", {
                  imageId: randomVerification._id,
                  imageUrl: imageUrl
            });
      } catch (error) {
            console.log(error, "error");
            next(error);
      }
};
