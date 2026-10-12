import mongoose from "mongoose";
import User from "../../models/user.model.js";
import Otp from "../../models/sample.modal.js";
import jwt from "jsonwebtoken";
import {
  signUpCompletionSchema,
  signInSchema,
  signUpSchema,
  isUniqueUsernameSchema,
} from "../validators/auth.validator.js";
import { JWT_SECRET, NODE_ENV, FRONTEND_URL, GOOGLE_CLIENT_ID } from "../../config/envConfig.js";
import { oauth2Client, SCOPES } from "../../config/oauth.js";
import { google } from "googleapis";
import { generateOTP } from "../../utils/otpGenerator.utils.js";
import { uploadToCloudinary } from "../../utils/Cloudinaryimage.utils.js";
import { sendOtpMail } from "../../utils/nodemailer.utils.js";

// ==========================================
// CONSTANTS & CONFIGURATION
// ==========================================
const isProduction = NODE_ENV === "production" || process.env.NODE_ENV === "production";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes in milliseconds
const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5 MB
const DEFAULT_AVATAR_URL = "https://cdn-icons-png.flaticon.com/512/149/149071.png";

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Standard cookie configuration helper.
 * @param {number|null} maxAge - Cookie maxAge in ms, or null for session/clear
 */
const getCookieOptions = (maxAge = COOKIE_MAX_AGE) => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  path: "/",
  ...(maxAge !== null && maxAge !== undefined ? { maxAge } : {}),
});

/**
 * Sets standard JWT auth cookie for verified user with complete profile.
 */
const setAuthCookie = (res, user) => {
  const token = jwt.sign(
    {
      userId: user._id,
      role: user.role,
      isProfileCompleted: true,
      provider: user.Accprovider || "email",
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.cookie("token", token, getCookieOptions(COOKIE_MAX_AGE));
  return token;
};

/**
 * Sets temporary JWT auth cookie for user with uncompleted profile.
 */
const setUncompletedProfileCookie = (res, otpUser) => {
  const token = jwt.sign(
    {
      userId: otpUser._id,
      otpId: otpUser._id,
      isProfileCompleted: false,
      provider: otpUser.provider || "email",
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.cookie("token", token, getCookieOptions(COOKIE_MAX_AGE));
  return token;
};

/**
 * Clears authentication token cookie.
 */
const clearAuthCookie = (res) => {
  res.clearCookie("token", getCookieOptions(null));
};
const LogoutCookie = clearAuthCookie;

/**
 * Formats and sends standard Zod validation error response.
 */
const sendValidationError = (res, zodError) => {
  const formattedErrors = zodError.errors.map((err) => ({
    field: err.path.join("."),
    message: err.message,
  }));
  return res.status(400).json({
    success: false,
    message: "Validation Error",
    errors: formattedErrors,
  });
};

/**
 * Resolves avatar image upload: Multer file, Base64 data URI, plain URL, or default avatar.
 * Throws an object with statusCode and message on validation/upload failure.
 */
const processAvatar = async (req) => {
  // 1. Multipart file upload via Multer
  if (req.file) {
    if (req.file.size > MAX_AVATAR_SIZE) {
      const err = new Error("Profile picture size exceeds 5MB limit. Please upload an image under 5MB.");
      err.statusCode = 400;
      throw err;
    }
    if (!req.file.mimetype || !req.file.mimetype.startsWith("image/")) {
      const err = new Error("Invalid file type. Profile picture must be an image (JPG, PNG, WEBP, GIF, SVG).");
      err.statusCode = 400;
      throw err;
    }

    let fileInput = req.file.path;
    if (!fileInput && req.file.buffer) {
      const b64 = Buffer.from(req.file.buffer).toString("base64");
      fileInput = `data:${req.file.mimetype};base64,${b64}`;
    }

    try {
      const result = await uploadToCloudinary(fileInput, "Safaiwatch_avatars");
      return {
        url: result.secure_url,
        id: result.public_id,
      };
    } catch (uploadErr) {
      console.error("Cloudinary upload error:", uploadErr);
      const err = new Error("Failed to upload profile picture to Cloudinary.");
      err.statusCode = 500;
      throw err;
    }
  }

  // 2. Base64 data URI or plain URL in body
  const avatarUrl = req.body?.avatarUrl;
  if (avatarUrl && typeof avatarUrl === "string") {
    if (avatarUrl.startsWith("data:image/")) {
      const base64Data = avatarUrl.split(",")[1] || "";
      const approximateSize = (base64Data.length * 3) / 4;

      if (approximateSize > MAX_AVATAR_SIZE) {
        const err = new Error("Profile picture size exceeds 5MB limit. Please upload an image under 5MB.");
        err.statusCode = 400;
        throw err;
      }

      const mimeMatch = avatarUrl.match(/^data:(image\/[a-zA-Z0-9\+\-\.]+);base64,/);
      if (!mimeMatch) {
        const err = new Error("Invalid image format. Profile picture must be a valid image.");
        err.statusCode = 400;
        throw err;
      }

      try {
        const result = await uploadToCloudinary(avatarUrl, "Safaiwatch_avatars");
        return {
          url: result.secure_url,
          id: result.public_id,
        };
      } catch (uploadErr) {
        console.error("Cloudinary upload error:", uploadErr);
        const err = new Error("Failed to upload profile picture to Cloudinary.");
        err.statusCode = 500;
        throw err;
      }
    }

    return {
      url: avatarUrl,
      id: avatarUrl.slice(avatarUrl.lastIndexOf("/") + 1) || `avatar_${Date.now()}`,
    };
  }

  // 3. Fallback default avatar
  return {
    url: DEFAULT_AVATAR_URL,
    id: "sample444",
  };
};

// ==========================================
// CONTROLLER HANDLERS
// ==========================================

/**
 * Initiates Google OAuth redirection.
 */
export const initiateGoogleAuth = (req, res) => {
  if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === "your_google_client_id_here") {
    console.warn("Google Client ID is missing or unconfigured.");
    const frontend = FRONTEND_URL || "http://localhost:3000";
    return res.redirect(`${frontend}/login?error=google_config_missing`);
  }

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  return res.redirect(url);
};

/**
 * Handles Google OAuth callback.
 */
export const handleGoogleCallback = async (req, res, next) => {
  const frontend = FRONTEND_URL || "http://localhost:3000";
  try {
    const { code } = req.query;
    if (!code) {
      return res.redirect(`${frontend}/login?error=google_auth_failed`);
    }

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    const email = userInfo.email?.toLowerCase().trim();
    if (!email) {
      return res.redirect(`${frontend}/login?error=google_email_missing`);
    }

    // Check for existing completed and verified user
    const user = await User.findOne({ email, isProfileCompleted: true, isVerified: true });
    if (user) {
      if (user.accountActive === "ban" || user.accountActive === "blacklist") {
        return res.redirect(`${frontend}/login?error=account_restricted`);
      }
      user.lastLogin = Date.now();
      await user.save();
      setAuthCookie(res, user);
      return res.redirect(`${frontend}/feed`);
    }

    // New or uncompleted user: create or update temporary Otp state
    const name = userInfo.name || email.split("@")[0];
    const avatarUrl = userInfo.picture || "";
    const providerId = userInfo.id || email;
    const expiresAt = new Date(Date.now() + COOKIE_MAX_AGE);

    let otpUser = await Otp.findOne({ email });
    if (otpUser) {
      otpUser.name = name;
      otpUser.avatarUrl = avatarUrl;
      otpUser.provider = "google";
      otpUser.providerId = providerId;
      otpUser.otpVerified = true;
      otpUser.expiresAt = expiresAt;
      await otpUser.save();
    } else {
      otpUser = await Otp.create({
        email,
        name,
        otpVerified: true,
        avatarUrl,
        provider: "google",
        for: "signIn",
        providerId,
        expiresAt,
      });
    }

    setUncompletedProfileCookie(res, otpUser);
    return res.redirect(`${frontend}/onboarding?email=${encodeURIComponent(email)}&provider=google`);
  } catch (error) {
    console.error("Google OAuth error:", error);
    return res.redirect(`${frontend}/login?error=google_auth_failed`);
  }
};

/**
 * Handles user sign-up: sends an OTP email.
 */
export const signUp = async (req, res, next) => {
  const validationResult = signUpSchema.safeParse(req.body);
  if (!validationResult.success) {
    return sendValidationError(res, validationResult.error);
  }

  const email = validationResult.data.email.toLowerCase().trim();

  try {
    const existingUser = await User.findOne({ email, isVerified: true, isProfileCompleted: true });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User already exists with this email",
      });
    }

    // Clean up previous unverified sign-up OTP requests for this email
    await Otp.deleteMany({ email, for: "signUp" });

    const otp = await generateOTP();
    const newOtp = await Otp.create({
      otp,
      for: "signUp",
      email,
      provider: "email",
      providerId: "email@1235",
      otpVerified: false,
      expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
    });

    try {
      await sendOtpMail({ to: email, otp, purpose: "Sign Up" });
    } catch (mailError) {
      console.error("Failed to send sign-up OTP email:", mailError);
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP email. Please try again.",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Otp sent successfully",
      user: {
        email: newOtp.email,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Resends OTP for user sign-up.
 */
export const resendSignUpOtp = async (req, res, next) => {
  const validationResult = signUpSchema.safeParse(req.body);
  if (!validationResult.success) {
    return sendValidationError(res, validationResult.error);
  }

  const email = validationResult.data.email.toLowerCase().trim();

  try {
    const otpUser = await Otp.findOne({ email, otpVerified: false, for: "signUp" });
    const user = await User.findOne({ email, isVerified: true, isProfileCompleted: true });

    if (!otpUser || user) {
      return res.status(404).json({
        success: false,
        message: "Invalid Credentials",
      });
    }

    const otp = await generateOTP();
    await Otp.findOneAndUpdate(
      { email, for: "signUp" },
      { otp, expiresAt: new Date(Date.now() + OTP_EXPIRY_MS), otpVerified: false }
    );

    try {
      await sendOtpMail({ to: email, otp, purpose: "Sign Up" });
    } catch (mailError) {
      console.error("Failed to send OTP email:", mailError);
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP email. Please try again.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Otp resend successfully",
      user: {
        email: otpUser.email,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verifies OTP for user sign-up and sets incomplete profile session cookie.
 */
export const verifyOtpSignUP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const otpUser = await Otp.findOne({ email: normalizedEmail, otp, for: "signUp" });
    const user = await User.findOne({ email: normalizedEmail, isVerified: true, isProfileCompleted: true });

    if (!otpUser || user) {
      return res.status(404).json({
        success: false,
        message: "Invalid Otp",
      });
    }

    if (new Date(otpUser.expiresAt).getTime() < Date.now()) {
      return res.status(400).json({
        success: false,
        message: "Otp expired",
      });
    }

    otpUser.otpVerified = true;
    await otpUser.save();

    setUncompletedProfileCookie(res, otpUser);

    return res.status(200).json({
      success: true,
      message: "Otp verified successfully",
      authorizationType: "incomplete",
      isProfileCompleted: false,
      user: {
        email: otpUser.email,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Handles completing user onboarding and profile creation.
 */
export const signUpCompletion = async (req, res, next) => {
  let session = null;
  try {
    let { pincode, address, role, geolocation, provider = "email", providerId, avatarUrl, username, email } = req.body;

    // Parse geolocation JSON string if sent via multipart/form-data
    if (typeof geolocation === "string") {
      try {
        geolocation = JSON.parse(geolocation);
      } catch (parseErr) {
        // Zod validation will handle the error below
      }
    }

    const validationResult = signUpCompletionSchema.safeParse({
      username,
      email,
      pincode,
      address,
      role,
      geolocation,
      provider,
      providerId,
      avatarUrl,
    });

    if (!validationResult.success) {
      return sendValidationError(res, validationResult.error);
    }

    const validData = validationResult.data;
    const normalizedEmail = validData.email.toLowerCase().trim();
    const normalizedUsername = validData.username.toLowerCase().trim();

    // Verify authorized session context against the submitted email
    if (req.otp?.email && req.otp.email.toLowerCase().trim() !== normalizedEmail) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Verified email does not match submitted email",
      });
    }

    // Verify that a verified OTP record exists for this email
    const otpUser = await Otp.findOne({ email: normalizedEmail, otpVerified: true });
    if (!otpUser) {
      return res.status(400).json({
        success: false,
        message: "User verification pending or expired. Please verify OTP first.",
      });
    }

    // Check if username or email is already taken by a registered user
    const userExists = await User.findOne({
      $or: [{ email: normalizedEmail }, { username: normalizedUsername }],
    });
    if (userExists) {
      const conflictField = userExists.email === normalizedEmail ? "Email" : "Username";
      return res.status(400).json({
        success: false,
        message: `${conflictField} is already registered.`,
      });
    }

    // Process and validate avatar upload
    const avatar = await processAvatar(req);

    // Persist new user and clean up temp OTP using transaction
    session = await mongoose.startSession();
    session.startTransaction();

    const newUser = new User({
      username: normalizedUsername,
      email: normalizedEmail,
      pincode: validData.pincode,
      address: validData.address,
      role: validData.role,
      geolocation: validData.geolocation,
      Accprovider: validData.provider,
      ProviderId: validData.providerId || (validData.provider === "google" ? otpUser.providerId : "email@1234"),
      isVerified: true,
      isProfileCompleted: true,
      avatar,
    });

    await newUser.save({ session });
    await Otp.deleteMany({ email: normalizedEmail }).session(session);

    await session.commitTransaction();

    clearAuthCookie(res);
    setAuthCookie(res, newUser);

    return res.status(200).json({
      success: true,
      message: "User registered successfully",
      user: newUser,
    });
  } catch (error) {
    if (session && session.inTransaction()) {
      await session.abortTransaction();
    }
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  } finally {
    if (session) {
      await session.endSession();
    }
  }
};

/**
 * Handles user sign-in: sends OTP to existing user's email.
 */
export const signIn = async (req, res, next) => {
  const validationResult = signInSchema.safeParse(req.body);
  if (!validationResult.success) {
    return sendValidationError(res, validationResult.error);
  }

  const email = validationResult.data.email.toLowerCase().trim();

  try {
    const user = await User.findOne({ email, isVerified: true, isProfileCompleted: true });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No account found with this email. Please sign up first.",
      });
    }

    if (user.accountActive === "ban" || user.accountActive === "blacklist") {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Account is restricted",
      });
    }

    // Clean up previous sign-in OTP requests
    await Otp.deleteMany({ email, for: "signIn" });

    const otp = await generateOTP();
    await Otp.create({
      email,
      for: "signIn",
      otp,
      otpVerified: false,
      provider: "email",
      expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
    });

    try {
      await sendOtpMail({ to: email, otp, purpose: "Sign In" });
    } catch (mailError) {
      console.error("Failed to send sign-in OTP email:", mailError);
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP email. Please try again.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Otp sent successfully",
      user: {
        email: user.email,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verifies sign-in OTP and establishes authenticated session.
 */
export const verifyOtpSignIn = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const otpUser = await Otp.findOne({ email: normalizedEmail, otp, for: "signIn" });
    const user = await User.findOne({ email: normalizedEmail, isVerified: true, isProfileCompleted: true });

    if (!otpUser || !user) {
      return res.status(404).json({
        success: false,
        message: "Invalid Otp",
      });
    }

    if (new Date(otpUser.expiresAt).getTime() < Date.now()) {
      return res.status(400).json({
        success: false,
        message: "Otp expired",
      });
    }

    if (user.accountActive === "ban" || user.accountActive === "blacklist") {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Account is restricted",
      });
    }

    await Otp.deleteOne({ _id: otpUser._id });

    user.lastLogin = Date.now();
    await user.save();

    setAuthCookie(res, user);

    return res.status(200).json({
      success: true,
      message: "Otp verified successfully",
      user: {
        email: user.email,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Resends sign-in OTP.
 */
export const resendSignInOtp = async (req, res, next) => {
  const validationResult = signInSchema.safeParse(req.body);
  if (!validationResult.success) {
    return sendValidationError(res, validationResult.error);
  }

  const email = validationResult.data.email.toLowerCase().trim();

  try {
    const otpUser = await Otp.findOne({ email, otpVerified: false, for: "signIn" });
    const user = await User.findOne({ email, isVerified: true, isProfileCompleted: true });

    if (!otpUser || !user) {
      return res.status(404).json({
        success: false,
        message: "Invalid Credentials",
      });
    }

    const otp = await generateOTP();
    await Otp.findOneAndUpdate(
      { email, for: "signIn" },
      { otp, expiresAt: new Date(Date.now() + OTP_EXPIRY_MS), otpVerified: false }
    );

    try {
      await sendOtpMail({ to: email, otp, purpose: "Sign In" });
    } catch (mailError) {
      console.error("Failed to send OTP email:", mailError);
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP email. Please try again.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Otp resend successfully",
      user: {
        email: otpUser.email,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Handles user sign-out by clearing the session token cookie.
 */
export const signOut = async (req, res, next) => {
  try {
    clearAuthCookie(res);
    return res.status(200).json({
      success: true,
      message: "Sign-out successful",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieves current authenticated user or uncompleted profile info based on token cookie.
 */
export const getMe = async (req, res, next) => {
  try {
    if (req.user) {
      return res.status(200).json({
        success: true,
        authorizationType: "normal",
        isProfileCompleted: true,
        user: req.user,
      });
    }

    if (req.otp) {
      return res.status(200).json({
        success: true,
        authorizationType: "incomplete",
        isProfileCompleted: false,
        user: {
          email: req.otp.email,
          username: req.otp.name,
          avatarUrl: req.otp.avatarUrl,
          provider: req.otp.provider,
        },
      });
    }

    return res.status(401).json({
      success: false,
      authorizationType: "none",
      isProfileCompleted: false,
      message: "Unauthorized",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Validates and checks whether a username is unique and available.
 */
export const isUniqueUsername = async (req, res, next) => {
  try {
    const validationResult = isUniqueUsernameSchema.safeParse(req.body);
    if (!validationResult.success) {
      return sendValidationError(res, validationResult.error);
    }

    const username = validationResult.data.username.toLowerCase().trim();
    const user = await User.findOne({ username });

    if (user) {
      return res.status(400).json({
        success: false,
        message: "Username already exists",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Username is unique",
    });
  } catch (error) {
    next(error);
  }
};

// Aliases for compatibility
export const verifyOtpSignUp = verifyOtpSignUP;

export { LogoutCookie };