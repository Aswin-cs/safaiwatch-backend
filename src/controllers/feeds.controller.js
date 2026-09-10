import mongoose from "mongoose";
import Post from "../../models/feeds.model.js";
import { responseHandler } from "../../utils/responseHandler.js";
import { errorHandler } from "../../utils/errorHandler.js";
import UserStatus from "../../models/userStatus.model.js";

/**
 * Get all feed posts with pagination and populated user details
 * GET /api/v1/feeds
 */
export const getAllPosts = async (req, res, next) => {
      try {
            const { page = 1, limit = 10 } = req.query;

            const pageNum = Math.max(1, parseInt(page, 10));
            const limitNum = Math.max(1, parseInt(limit, 10));
            const skip = (pageNum - 1) * limitNum;

            // Extract request user _id from req.user, query, params, body, or headers
            const userId =
                  req.user?._id ||
                  req.user?.id ||
                  req.user?.userId ||
                  req.query?.userId ||
                  req.query?._id ||
                  req.query?.user_id ||
                  req.params?.userId ||
                  req.params?._id ||
                  req.params?.user_id ||
                  req.body?.userId ||
                  req.body?._id ||
                  req.body?.user_id ||
                  req.headers?.["user-id"] ||
                  req.headers?.["userid"];

            const [posts, totalCount] = await Promise.all([
                  Post.find()
                        .populate("SpotedUser", "_id username avatar role ")
                        .populate("CleanedUser", "_id username avatar role ")
                        .sort({ createdAt: -1 })
                        .skip(skip)
                        .limit(limitNum),
                  Post.countDocuments(),
            ]);

            let likedPostIdsSet = new Set();
            let userLikePosts = [];

            if (userId && mongoose.Types.ObjectId.isValid(userId)) {
                  const userStatus = await UserStatus.findOne({
                        $or: [{ user: userId }, { userId: userId }],
                  });
                  if (userStatus && Array.isArray(userStatus.userLikePosts)) {
                        userLikePosts = userStatus.userLikePosts;
                        userStatus.userLikePosts.forEach((item) => {
                              const pid = item?.postId?._id || item?.postId || item;
                              if (pid) {
                                    likedPostIdsSet.add(pid.toString());
                              }
                        });
                  }
            }

            const formattedPosts = (posts || []).map((post) => {
                  const postObj = post.toObject ? post.toObject() : { ...post };
                  postObj.isLiked = likedPostIdsSet.has(post._id.toString());
                  return postObj;
            });

            if (!formattedPosts || formattedPosts.length === 0) {
                  return responseHandler(res, 200, "No posts found in the feed", {
                        posts: [],
                        userLikePosts,
                        totalCount: 0,
                        page: pageNum,
                        totalPages: 0,
                        limit: limitNum,
                        message: "No posts found in the feed",
                  });
            }

            return responseHandler(res, 200, "Posts fetched successfully", {
                  posts: formattedPosts,
                  userLikePosts,
                  totalCount,
                  page: pageNum,
                  totalPages: Math.ceil(totalCount / limitNum),
                  limit: limitNum,
            });
      } catch (error) {
            console.error("Error while fetching posts:", error);
            if (typeof next === "function") {
                  return next(error);
            }
            return res.status(500).json({
                  success: false,
                  message: "Error while fetching posts",
                  error: error.message,
            });
      }
};

/**
 * Get a single feed post by ID
 * GET /api/v1/feeds/:id
 */
export const getParticularPost = async (req, res, next) => {
      try {
            const postId = req.params.id || req.query.id || req.params.postId;
            const userId =
                  req.user?._id ||
                  req.user?.id ||
                  req.user?.userId ||
                  req.query?.userId ||
                  req.query?._id ||
                  req.query?.user_id ||
                  req.params?.userId ||
                  req.params?._id ||
                  req.params?.user_id ||
                  req.body?.userId ||
                  req.body?._id ||
                  req.body?.user_id ||
                  req.headers?.["user-id"] ||
                  req.headers?.["userid"];

            if (!postId || !mongoose.Types.ObjectId.isValid(postId)) {
                  return next ? next(errorHandler(400, "Invalid Post ID")) : res.status(400).json({ success: false, message: "Invalid Post ID" });
            }

            const post = await Post.findById(postId)
                  .populate("SpotedUser", "_id username avatar role")
                  .populate("CleanedUser", "_id username avatar role");

            if (!post) {
                  return next ? next(errorHandler(404, "Post not found")) : res.status(404).json({ success: false, message: "Post not found" });
            }

            const postObj = post.toObject ? post.toObject() : { ...post };
            postObj.isLiked = false;

            if (userId && mongoose.Types.ObjectId.isValid(userId)) {
                  const userStatus = await UserStatus.findOne({
                        $or: [{ user: userId }, { userId: userId }],
                  });
                  if (userStatus && Array.isArray(userStatus.userLikePosts)) {
                        postObj.isLiked = userStatus.userLikePosts.some((item) => {
                              const pid = item?.postId?._id || item?.postId || item;
                              return pid && pid.toString() === postId.toString();
                        });
                  }
            }

            return responseHandler(res, 200, "Post retrieved successfully", {
                  post: postObj,
                  isLiked: postObj.isLiked,
            });
      } catch (error) {
            console.error("Error while fetching post:", error);
            if (typeof next === "function") {
                  return next(error);
            }
            return res.status(500).json({
                  success: false,
                  message: "Error while fetching post",
                  error: error.message,
            });
      }
};


/**
 * Like or toggle like on a post using post ID and user ID, updating Post likeCount and UserStatus userLikePosts
 * POST /api/v1/feeds/:id/like
 */
export const getLikeToPost = async (req, res, next) => {
      try {
            const postId = req.params.id || req.params.postId || req.body.postId || req.query.postId;
            const userId = req.user?._id || req.body.userId || req.query.userId;

            if (!postId || !mongoose.Types.ObjectId.isValid(postId)) {
                  return next ? next(errorHandler(400, "Valid Post ID is required")) : res.status(400).json({ success: false, message: "Valid Post ID is required" });
            }

            if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
                  return next ? next(errorHandler(400, "Valid User ID is required")) : res.status(400).json({ success: false, message: "Valid User ID is required" });
            }

            const post = await Post.findById(postId);
            if (!post) {
                  return next ? next(errorHandler(404, "Post not found")) : res.status(404).json({ success: false, message: "Post not found" });
            }

            let userStatus = await UserStatus.findOne({
                  $or: [{ user: userId }, { userId }],
            });

            if (!userStatus) {
                  userStatus = new UserStatus({ user: userId });
            }

            const existingLikeIndex = userStatus.userLikePosts.findIndex(
                  (item) => item.postId && item.postId.toString() === postId.toString()
            );

            let isLiked = false;
            if (existingLikeIndex > -1) {
                  userStatus.userLikePosts.splice(existingLikeIndex, 1);
                  post.likeCount = Math.max(0, (post.likeCount || 0) - 1);
                  isLiked = false;
            } else {
                  userStatus.userLikePosts.push({
                        postId: postId,
                        likedAt: new Date(),
                  });
                  post.likeCount = (post.likeCount || 0) + 1;
                  isLiked = true;
            }

            await Promise.all([userStatus.save(), post.save()]);

            return responseHandler(res, 200, isLiked ? "Post liked successfully" : "Post unliked successfully", {
                  post,
                  isLiked,
                  likeCount: post.likeCount,
            });
      } catch (error) {
            console.error("Error in getLikeToPost:", error);
            if (typeof next === "function") {
                  return next(error);
            }
            return res.status(500).json({
                  success: false,
                  message: "Error while processing like on post",
                  error: error.message,
            });
      }
};

export default {
      getAllPosts,
      getParticularPost,
      getLikeToPost,

};


