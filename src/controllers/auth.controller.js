import mongoose from "mongoose";
import User from "../../models/user.model.js";
import Otp from "../../models/sample.modal.js";
import jwt from "jsonwebtoken";
import { signUpCompletionSchema, signInSchema, signUpSchema } from "../validators/auth.validator.js";
import { JWT_SECRET, NODE_ENV } from "../../config/envConfig.js";
import { oauth2Client, SCOPES } from "../../config/oauth.js";
import { google } from "googleapis";
import { generateOTP } from "../../utils/otpGenerator.utils.js";

const setAuthCookie = (res, user) => {
      const token = jwt.sign(
            { userId: user._id, role: user.role, isProfileCompleted: true, provider: user.Accprovider },
            JWT_SECRET,
            { expiresIn: '7d' }
      );
      console.log("Token set", token);
      res.cookie("token", token, {
            httpOnly: true,
            secure: NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
      });
};

const setUncompletedProfileCookie = (res, user) => {
      const token = jwt.sign(
            { userId: user._id, isProfileCompleted: false, provider: user.provider },
            JWT_SECRET,
            { expiresIn: '7d' }
      );
      console.log("Token set", token);
      res.cookie("token", token, {
            httpOnly: true,
            secure: NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
      });
};

const LogoutCookie = (res) => {
      res.clearCookie('token', {
            httpOnly: true,
            secure: NODE_ENV === 'production',
            sameSite: NODE_ENV === 'production' ? 'none' : 'lax',
            path: '/' // default is '/', ensure it matches the path used during login
      });
}

export const initiateGoogleAuth = (req, res) => {
      const url = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            prompt: 'consent',
            scope: SCOPES,
      });
      return res.redirect(url);
};

export const handleGoogleCallback = async (req, res, next) => {
      try {

            const { tokens } = await oauth2Client.getToken(req.query.code);
            oauth2Client.setCredentials(tokens);

            const { data: userInfo } = await google.people("v1").people.get({
                  resourceName: "people/me",
                  personFields: "names,emailAddresses,photos",
                  auth: oauth2Client,
            });

            const email = userInfo.emailAddresses[0].value;
            let user = await User.findOne({ email, Accprovider: "google", isProfileCompleted: true, isVerified: true });
            if (user) {
                  setAuthCookie(res, user);
                  return res.redirect("/");
            }
            if (!user) {
                  const otpUser = await Otp.create({
                        email,
                        name: userInfo.names[0].displayName,
                        otpVerified: true,
                        avatarUrl: userInfo.photos?.[0]?.url || "",
                        provider: "google",
                        providerId: userInfo.resourceName,
                  });
                  setUncompletedProfileCookie(res, otpUser);

                  return res.status(200).json({
                        success: true,
                        message: "User registered successfully",
                        user: {
                              username: otpUser.name,
                              email: otpUser.email,
                              avatarUrl: otpUser.avatarUrl,
                              provider: otpUser.provider
                        },
                  });
            }


      } catch (error) {
            next(error);
      }
};

const signUpCompletion = async (req, res, next) => {
      try {
            const { provider, email } = req.body;
            const otpUser = await Otp.findOne({ email, otpVerified: true });
            if (!otpUser) {
                  return res.status(400).json({
                        success: false,
                        message: "User not found"
                  });
            }
            const userExists = await User.findOne({ email, Accprovider: provider, isVerified: true, isProfileCompleted: true })
            if (userExists) {
                  return res.status(400).json({
                        success: false,
                        message: "User already exists"
                  });
            }
            if (provider === "google") {
                  let { avatarUrl } = req.body;
                  if (!avatarUrl) {
                        avatarUrl = "https://cdn-icons-png.flaticon.com/512/149/149071.png";
                  }
            }
            else if (provider === "email") {
                  let avatarUrl;
                  if (req.file) {
                        let { path } = req.file
                        avatarUrl = path
                        console.log(avatarUrl);
                  }
            }
            const session = await mongoose.startSession();
            session.startTransaction();
            const { name, pincode, address, role, geolocation, providerId } = req.body;
            const isUserExists = await User.findOne({ email });
            if (isUserExists) {
                  return res.status(400).json({
                        success: false,
                        message: "User already exists"
                  });
            }
            await Otp.deleteOne({ email, otpVerified: true });
            const validationResult = signUpCompletionSchema.safeParse({ name, email, pincode, address, role, geolocation, provider, providerId })
            if (!validationResult.success) {
                  return res.status(400).json({
                        success: false,
                        message: "Validation Error",
                        errors: validationResult.error.errors,
                  });
            }
            const newUser = new User({
                  name: validationResult.data.username,
                  email: validationResult.data.email,
                  pincode: validationResult.data.pincode,
                  address: validationResult.data.address,
                  role: validationResult.data.role,
                  geolocation: validationResult.data.geolocation,
                  Accprovider: provider,
                  ProviderId: providerId || "email@1234",
                  isVerified: true,
                  isProfileCompleted: true,
                  avatarUrl: avatarUrl || "https://cdn-icons-png.flaticon.com/512/149/149071.png",
            });
            await newUser.save({ session });
            session.commitTransaction();
            session.endSession();
            LogoutCookie(res);
            setAuthCookie(res, newUser);
            return res.status(200).json({
                  success: true,
                  message: "User registered successfully",
                  user: newUser,
            })
      } catch (error) {
            session.abortTransaction();
            session.endSession();
            next(error);
      }


}


/**
 * Handles user sign-up with Zod schema validation and transaction support.
 */
const signUp = async (req, res, next) => {
      // Validate request body using Zod schema
      const validationResult = signUpSchema.safeParse(req.body);
      if (!validationResult.success) {
            const formattedErrors = validationResult.error.errors.map((err) => ({
                  field: err.path.join("."),
                  message: err.message,
            }));
            return res.status(400).json({
                  success: false,
                  message: "Validation Error",
                  errors: formattedErrors,
            });
      }

      const { email } = validationResult.data;

      const session = await mongoose.startSession();
      session.startTransaction();
      try {
            const existingUser = await User.findOne({ email, isVerified: true, isProfileCompleted: true }).session(session);
            const existingOtpUser = await Otp.findOne({ email }).session(session);
            if (existingUser || existingOtpUser) {
                  await session.abortTransaction();
                  session.endSession();
                  return res.status(409).json({
                        success: false,
                        message: "User already exists with this email",
                  });
            }
            const otp = await generateOTP();

            const newOtp = new Otp({
                  otp,
                  email,
                  provider: "email",
                  providerId: "email@1235",
                  otpVerified: false,
                  expiresAt: Date.now() + 1000 * 60 * 10,
            });
            setUncompletedProfileCookie(res, newOtp);
            await newOtp.save({ session });
            await session.commitTransaction();
            session.endSession();
            return res.status(201).json({
                  success: true,
                  message: "Otp sent successfully",
                  user: {
                        email: newOtp.email,
                  },
            });
      } catch (error) {
            await session.abortTransaction();
            session.endSession();
            next(error);
      }
};

const resendSignUpOtp = async (req, res, next) => {
      const session = await mongoose.startSession();
      try {
            const { email } = req.body;
            const otpUser = await Otp.findOne({ email, otpVerified: false });
            const user = await User.findOne({ email });
            if (!otpUser || user) {
                  return res.status(404).json({
                        success: false,
                        message: "Invalid Credentials",
                  });
            }
            const otp = await generateOTP();

            session.startTransaction();
            await Otp.findOneAndUpdate({ email }, { otp, expiresAt: Date.now() + 1000 * 60 * 10, otpVerified: false });
            await session.commitTransaction();
            session.endSession();
            return res.status(200).json({
                  success: true,
                  message: "Otp resend successfully",
                  user: {
                        email: otpUser.email,
                  },
            });
      } catch (error) {
            session.abortTransaction();
            session.endSession();
            next(error);
      }
}

const resendSignInOtp = async (req, res, next) => {
      const session = await mongoose.startSession();
      try {
            const { email } = req.body;
            const otpUser = await Otp.findOne({ email, otpVerified: false });
            const user = await User.findOne({ email, isVerified: true, isProfileCompleted: true });
            if (!otpUser || !user) {
                  return res.status(404).json({
                        success: false,
                        message: "Invalid Credentials",
                  });
            }
            const otp = await generateOTP();

            session.startTransaction();
            await Otp.findOneAndUpdate({ email }, { otp, expiresAt: Date.now() + 1000 * 60 * 10, otpVerified: false });
            await session.commitTransaction();
            session.endSession();
            return res.status(200).json({
                  success: true,
                  message: "Otp resend successfully",
                  user: {
                        email: otpUser.email,
                  },
            });
      } catch (error) {
            session.abortTransaction();
            session.endSession();
            next(error);
      }
}

const verifyOtpSignUP = async (req, res, next) => {
      try {
            const { email, otp } = req.body;
            const otpUser = await Otp.findOne({ email, otp });
            const user = await User.findOne({ email, isVerified: true, isProfileCompleted: true });
            if (!otpUser || user) {
                  return res.status(404).json({
                        success: false,
                        message: "Invalid Otp",
                  });
            }
            if (otpUser.expiresAt < Date.now()) {
                  return res.status(400).json({
                        success: false,
                        message: "Otp expired",
                  });
            }
            await Otp.findOneAndUpdate({ email, otp }, { otpVerified: true });
            return res.status(200).json({
                  success: true,
                  message: "Otp verified successfully",
                  user: {
                        email: otpUser.email,
                  },
            });
      } catch (error) {
            next(error);
      }
}

const verifyOtpSignIn = async (req, res, next) => {
      const session = await mongoose.startSession();
      try {
            const { email, otp } = req.body;
            const otpUser = await Otp.findOne({ email, otp });
            const user = await User.findOne({ email, isVerified: true, isProfileCompleted: true });
            if (!otpUser || !user) {
                  return res.status(404).json({
                        success: false,
                        message: "Invalid Otp",
                  });
            }
            if (otpUser.expiresAt < Date.now()) {
                  return res.status(400).json({
                        success: false,
                        message: "Otp expired",
                  });
            }
            session.startTransaction();
            const deletedOtp = await Otp.deleteOne({ email, otp });
            if (!deletedOtp) {
                  return res.status(404).json({
                        success: false,
                        message: "Otp deletion failed",
                  });
            }
            user.lastLogin = Date.now();
            await user.save();
            session.commitTransaction();
            session.endSession();
            setAuthCookie(res, user);
            return res.status(200).json({
                  success: true,
                  message: "Otp verified successfully",
                  user: {
                        email: otpUser.email,
                  },
            });
      } catch (error) {
            session.abortTransaction();
            session.endSession();
            next(error);
      }
}

/**
 * Handles user sign-in with Zod schema validation.
 */
const signIn = async (req, res, next) => {
      const validationResult = signInSchema.safeParse(req.body);
      if (!validationResult.success) {
            const formattedErrors = validationResult.error.errors.map((err) => ({
                  field: err.path.join("."),
                  message: err.message,
            }));
            return res.status(400).json({
                  success: false,
                  message: "Validation Error",
                  errors: formattedErrors,
            });
      }

      const { email } = validationResult.data;
      try {
            const user = await User.findOne({ email });

            if (!user) {
                  return res.status(404).json({
                        success: false,
                        message: "User not found",
                  });
            }
            const existingOtpUser = await Otp.findOne({ email });
            if (existingOtpUser) {
                  return res.status(404).json({
                        success: false,
                        message: "Invalid",
                  });
            }
            const otp = await generateOTP();
            await Otp.create({ email, otp, otpVerified: false, provider: "email", expiresAt: Date.now() + 1000 * 60 * 10 });
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
 * Handles user sign-out.
 */
const signOut = async (req, res, next) => {
      try {
            console.log("Sign out")
            LogoutCookie(res);
            return res.status(200).json({
                  success: true,
                  message: "Sign-out successful",
            });
      } catch (error) {
            next(error);
      }
};

export { signUp, signIn, signOut, signUpCompletion, resendSignInOtp, resendSignUpOtp, verifyOtpSignIn, verifyOtpSignUP };