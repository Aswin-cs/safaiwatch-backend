import { getMyProfile, getBasicInfo, getProfileById, getUserHistory } from '../controllers/profile.controller.js';
import { authorize } from '../middlewares/authorize.middleware.js';
import { Router } from 'express';

const profileRouter = Router();

profileRouter.get('/basic-info', authorize(), getBasicInfo);
profileRouter.get('/get-my-profile', authorize(), getMyProfile);
profileRouter.get('/history', authorize(), getUserHistory);
profileRouter.get("/:id", getProfileById);

export default profileRouter;
