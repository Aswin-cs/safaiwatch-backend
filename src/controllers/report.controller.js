import mongoose from "mongoose";
import User from "../../models/user.model.js";
import Report from "../../models/report.model.js";
import MarkedSpot from "../../models/markedSpots.model.js";
import { preImageOrCodeVerification } from "./spots.controller.js";
import { wasteVerification } from "../../utils/aiPhotoVerification.utils.js";
import { uploadToCloudinary } from "../../utils/Cloudinaryimage.utils.js";
import UserStatus from "../../models/userStatus.model.js";

export const reportOnContestSpot = async (req, res) => {
    try {
        const {
            userId: bodyUserId,
            spotId,
            which,
            forWhat,
            reason,
            reasonForSpot,
            reasonForSpotComplete,
            description,
        } = req.body;

        const userId = bodyUserId || req.user?._id;
        if (!userId) {
            return res.status(400).json({ message: "User ID is required" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const spot = await MarkedSpot.findById(spotId);
        if (!spot) {
            return res.status(404).json({ message: "Spot not found" });
        }

        const data = await preImageOrCodeVerification(req, "report");


        // Process image upload if provided in req.file or req.body.image
        let imageUrl = bodyImageUrl || "";
        let imageId = bodyImageId || "";

        if (req.file) {
            let fileInput = req.file.path;
            if (!fileInput && req.file.buffer) {
                const b64 = Buffer.from(req.file.buffer).toString("base64");
                fileInput = `data:${req.file.mimetype};base64,${b64}`;
            }
            const uploadRes = await uploadToCloudinary(fileInput, "SafaiWatch_reports");
            if (uploadRes) {
                imageUrl = typeof uploadRes === "string" ? uploadRes : uploadRes.url || uploadRes.secure_url;
                imageId = uploadRes.public_id || "";
            }
        } else if (req.body?.image && req.body.image.startsWith("data:image/")) {
            const uploadRes = await uploadToCloudinary(req.body.image, "SafaiWatch_reports");
            if (uploadRes) {
                imageUrl = typeof uploadRes === "string" ? uploadRes : uploadRes.url || uploadRes.secure_url;
                imageId = uploadRes.public_id || "";
            }
        }
        const aiResult = await wasteVerification(imageUrl, data);
        if (aiResult) {
            if (aiResult.isFraudulent) {
                await User.findByIdAndUpdate(
                    { _id: userId },
                    {
                        $inc: {
                            BlackListCount: 1,
                        },
                    },
                    { new: true }
                );
                return res.status(400).json({ message: aiResult.fraudReason });
            }
            if (!aiResult.isValidWasteReport) {
                return res.status(400).json({ message: "No waste detected" });
            }
            if (!aiResult.codeMatched || !aiResult.gestureMatched) {
                if (!aiResult.codeMatched) {
                    return res.status(400).json({ message: "Code mismatch" });
                }
                if (!aiResult.gestureMatched) {
                    return res.status(400).json({ message: "Gesture mismatch" });
                }
            }
        }

        const targetForWhat = forWhat || which || "reportSpot";
        const selectedReason = reason || (targetForWhat === "reportSpot" ? reasonForSpot : reasonForSpotComplete);

        const reportData = {
            userId,
            forWhat: targetForWhat,
            spotId,
            description,
            imageUrl,
            imageId,
        };

        if (targetForWhat === "reportSpot") {
            reportData.reasonForSpot = selectedReason || reasonForSpot || "other_spam";
        } else if (targetForWhat === "reportCompleteSpot") {
            reportData.reasonForSpotComplete = selectedReason || reasonForSpotComplete || "other_spam";
        }


        const report = new Report(reportData);
        await report.save();
        const statusUpdate = await UserStatus.findOneAndUpdate(
            { user: userId },
            {
                $push: {
                    reportOnContestSpots: {
                        _id: report._id,
                        reportAt: Date.now()
                    },
                },
            },
            { new: true }
        );
        return res.status(201).json({ message: "Reported successfully", report });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
};