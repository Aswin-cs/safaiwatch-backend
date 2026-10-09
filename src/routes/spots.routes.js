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
      getRandomCodeVerification,
      deleteOneTimeVerification,
} from "../controllers/spots.controller.js";
import { reportOnContestSpot, submitCounterEvidence } from "../controllers/report.controller.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { verifySpotLocation } from "../middlewares/location.middleware.js";
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

// Liveness & Verification routes (Gesture & Code)
spotsRouter.post("/gesture-verification", authorize(), getRandomGestureVerification);
spotsRouter.post("/random-gesture", authorize(), getRandomGestureVerification);
spotsRouter.post("/code-verification", authorize(), getRandomCodeVerification);
spotsRouter.post("/random-code", authorize(), getRandomCodeVerification);

// Public / Authenticated spot listing & detail retrieval
spotsRouter.get("/", getMarkedSpots);
spotsRouter.get("/:id", getMarkedSpot);

// Protected routes (require authorization token & specific role checks)
spotsRouter.post("/", authorize("Hybrid", "Civilian", "hybrid", "civilian"), upload.single("image"), markSpot);
spotsRouter.put("/:id", authorize(), upload.single("image"), updateSpot);
spotsRouter.delete("/:id", authorize(), deleteSpot);
spotsRouter.delete("/:id/one-time", authorize(), deleteOneTimeVerification);
spotsRouter.delete("/one-time/:id", authorize(), deleteOneTimeVerification);

// Status transition routes
spotsRouter.patch("/:id/assign", authorize(), assignSpot);
spotsRouter.patch(
      "/:id/complete",
      authorize("Hybrid", "Coordinator", "hybrid", "coordinator"),
      upload.single("imageAfter"),
      verifySpotLocation(5),
      completeSpot
);
spotsRouter.patch("/:id/rate", authorize(), rateSpot);

// Dispute & Contest Report routes
spotsRouter.post("/:id/report", authorize(), upload.any(), reportOnContestSpot);
spotsRouter.post("/:id/contest", authorize(), upload.any(), reportOnContestSpot);
spotsRouter.post("/report", authorize(), upload.any(), reportOnContestSpot);
spotsRouter.post("/:id/counter-evidence", authorize(), submitCounterEvidence);
spotsRouter.post("/counter-evidence", authorize(), submitCounterEvidence);

export default spotsRouter;

