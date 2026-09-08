import jwt from "jsonwebtoken";
import { JWT_SECRET, NODE_ENV } from "../../config/envConfig.js";
import User from "../../models/user.model.js";
import Otp from "../../models/sample.modal.js";
import { errorHandler } from "../../utils/errorHandler.js";

export const authorizeMiddleware = (...roles) => {
  return async (req, res, next) => {
    try {
      let token = req.cookies?.token;

      if (!token) {
        return next(errorHandler(401, "Unauthorized"));
      }

      const decodedToken = jwt.verify(token, JWT_SECRET);
      console.log("Decoded Token", decodedToken);
      if (!decodedToken || !decodedToken.userId) {
        return next(errorHandler(401, "Unauthorized"));
      }

      const user = await User.findById(decodedToken.userId);
      const otp = await Otp.findById(decodedToken.otpId || decodedToken.userId);
      console.log("User", user);
      console.log("OTP", otp);
      if (user && otp) {
        return next(errorHandler(401, "Unauthorized"));
      }
      if (otp && !user) {
        req.otp = otp;
        next();
      }
      else if (user && !otp) {
        if (user.accountActive === "ban" || user.accountActive === "blacklist") {
          return next(errorHandler(403, "Forbidden: Account is restricted"));
        }

        if (roles.length > 0 && !roles.includes(user.role)) {
          return next(errorHandler(403, "Forbidden"));
        }

        req.user = user;
        next();
      } else {
        return next(errorHandler(401, "Unauthorized"));
      }
    } catch (error) {
      if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
        return next(errorHandler(401, "Invalid or expired token"));
      }
      next(error);
    }
  };
};

export const authorize = authorizeMiddleware;
export default authorizeMiddleware;
