import jwt from "jsonwebtoken";
import { JWT_SECRET, NODE_ENV } from "../../config/envConfig.js";
import User from "../../models/user.model.js";
import Otp from "../../models/sample.modal.js";
import { errorHandler } from "../../utils/errorHandler.js";

export const authorizeMiddleware = (...args) => {
  let roles = [];
  let allowIncomplete = false;

  if (args.length > 0) {
    if (typeof args[0] === "object" && args[0] !== null && !Array.isArray(args[0])) {
      roles = args[0].roles || [];
      allowIncomplete = Boolean(args[0].allowIncomplete);
    } else {
      roles = args;
    }
  }

  return async (req, res, next) => {
    try {
      let token = req.cookies?.token;

      if (!token) {
        return next(errorHandler(401, "Unauthorized"));
      }

      const decodedToken = jwt.verify(token, JWT_SECRET);
      if (!decodedToken || (!decodedToken.userId && !decodedToken.otpId)) {
        return next(errorHandler(401, "Unauthorized"));
      }

      const user = await User.findById(decodedToken.userId);
      const otp = await Otp.findById(decodedToken.otpId || decodedToken.userId);

      if (user && otp) {
        return next(errorHandler(401, "Unauthorized"));
      }
      if (otp && !user) {
        if (!allowIncomplete) {
          return next(errorHandler(403, "Forbidden: Profile completion required"));
        }
        req.otp = otp;
        return next();
      } else if (user && !otp) {
        if (user.accountActive === "ban" || user.accountActive === "blacklist") {
          return next(errorHandler(403, "Forbidden: Account is restricted"));
        }

        if (roles.length > 0 && !roles.some((r) => r.toLowerCase() === user.role?.toLowerCase())) {
          return next(errorHandler(403, "Forbidden"));
        }

        req.user = user;
        return next();
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
