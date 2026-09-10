import { Router } from "express";
import {
      getAllPosts,
      getParticularPost,
      getLikeToPost,
} from "../controllers/feeds.controller.js";
import { authorize } from "../middlewares/authorize.middleware.js";

const feedsRouter = Router();

// Middleware to attempt JWT auth if token cookie exists, otherwise proceed
const optionalAuth = (req, res, next) => {
      if (req.cookies?.token) {
            return authorize()(req, res, next);
      }
      next();
};

// GET /api/v1/feeds or /feed - Retrieve all feed posts with pagination
feedsRouter.get("/", optionalAuth, getAllPosts);

// GET /api/v1/feeds/:id - Retrieve a specific post by ID
feedsRouter.get("/:id", optionalAuth, getParticularPost);

// POST or PATCH /api/v1/feeds/:id/like - Toggle like on a post
feedsRouter.post("/:id/like", optionalAuth, getLikeToPost);
feedsRouter.patch("/:id/like", optionalAuth, getLikeToPost);

export default feedsRouter;

