import { getMyProfile, getBasicInfo, getProfileByUsername, getProfileById, getUserHistory, updateProfile } from '../controllers/profile.controller.js';
import { authorize } from '../middlewares/authorize.middleware.js';
import { uploadAvatarMiddleware } from '../middlewares/upload.middleware.js';
import { Router } from 'express';

const profileRouter = Router();

profileRouter.get('/basic-info', authorize(), getBasicInfo);
profileRouter.get('/get-my-profile', authorize(), getMyProfile);
profileRouter.get('/history', authorize(), getUserHistory);
profileRouter.patch('/update', authorize(), uploadAvatarMiddleware, updateProfile);
profileRouter.get("/:username", getProfileByUsername);

export default profileRouter;

