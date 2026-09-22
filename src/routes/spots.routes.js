import { Router } from "express";
import {
      markSpot,
      getMarkedSpots,
      getMarkedSpot,
      updateSpot,
      deleteSpot,
      assignSpot,
      completeSpot,
      rateSpot,
      getRandomGestureVerification,
} from "../controllers/spots.controller.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import multer from "multer";

const storage = multer.memoryStorage();
const upload = multer({
      storage,
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
            if (file.mimetype && file.mimetype.startsWith("image/")) {
                  cb(null, true);
            } else {
                  cb(new Error("Only image files are allowed."), false);
            }
      },
});

const spotsRouter = Router();

// Gesture verification route
spotsRouter.post("/gesture-verification", authorize(), getRandomGestureVerification);
spotsRouter.post("/random-gesture", authorize(), getRandomGestureVerification);

// Public / Authenticated spot listing & detail retrieval
spotsRouter.get("/", getMarkedSpots);
spotsRouter.get("/:id", getMarkedSpot);

// Protected routes (require authorization token & specific role checks)
spotsRouter.post("/", authorize("Hybrid", "Civilian", "hybrid", "civilian"), upload.single("image"), markSpot);
spotsRouter.put("/:id", authorize(), upload.single("image"), updateSpot);
spotsRouter.delete("/:id", authorize(), deleteSpot);

// Status transition routes
spotsRouter.patch("/:id/assign", authorize(), assignSpot);
spotsRouter.patch("/:id/complete", authorize(), upload.single("imageAfter"), completeSpot);
spotsRouter.patch("/:id/rate", authorize(), rateSpot);

export default spotsRouter;
