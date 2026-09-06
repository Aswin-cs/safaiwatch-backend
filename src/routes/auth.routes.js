import { Router } from "express";
import {
  signUp,
  signIn,
  signOut,
  signUpCompletion,
  resendSignInOtp,
  resendSignUpOtp,
  verifyOtpSignIn,
  verifyOtpSignUP,
  handleGoogleCallback,
  initiateGoogleAuth,
} from "../controllers/auth.controller.js";

const authRouter = Router();

// Health / Endpoint Check
authRouter.get("/", (req, res) => {
  res.send("auth endpoint active");
});

// Google OAuth Routes
authRouter.get("/google", initiateGoogleAuth);
authRouter.get("/google/callback", handleGoogleCallback);

// Sign Up & Profile Completion Routes
authRouter.post("/sign-up", signUp);
authRouter.post("/sign-up-completion", signUpCompletion);
authRouter.post("/verify/verify-otp-sign-up", verifyOtpSignUP);
authRouter.post("/resend/resend-otp-sign-up", resendSignUpOtp);

// Sign In & Verification Routes
authRouter.post("/sign-in", signIn);
authRouter.post("/verify/verify-otp", verifyOtpSignIn);
authRouter.post("/resend/resend-otp", resendSignInOtp);

// Sign Out Route
authRouter.post("/sign-out", signOut);

export default authRouter;
