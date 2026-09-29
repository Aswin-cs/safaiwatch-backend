import { Router } from "express";
import { authorize } from "../middlewares/authorize.middleware.js";
import {
  getRewardsCatalog,
  getMyRewards,
  redeemRewardHandler,
  getRewardsHistory,
  getRewardsLeaderboard,
} from "../controllers/rewards.controller.js";

const rewardsRouter = Router();

// Public / Protected Reward Routes
rewardsRouter.get("/catalog", getRewardsCatalog);
rewardsRouter.get("/leaderboard", getRewardsLeaderboard);

// Authenticated User Reward Routes
rewardsRouter.get("/", authorize(), getMyRewards);
rewardsRouter.get("/my-rewards", authorize(), getMyRewards);
rewardsRouter.get("/history", authorize(), getRewardsHistory);
rewardsRouter.post("/redeem", authorize(), redeemRewardHandler);
rewardsRouter.post("/select", authorize(), redeemRewardHandler);

export default rewardsRouter;
