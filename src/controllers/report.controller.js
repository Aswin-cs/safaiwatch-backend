import mongoose from "mongoose";
import User from "../../models/user.model.js";
import Report from "../../models/report.model.js";
import MarkedSpot from "../../models/markedSpots.model.js";
import { preImageOrCodeVerification } from "./spots.controller.js";
import { wasteVerification } from "../../utils/aiPhotoVerification.utils.js";
import { uploadToCloudinary } from "../../utils/Cloudinaryimage.utils.js";
import UserStatus from "../../models/userStatus.model.js";
import { getIo } from "../../config/socketIoConfig.js";

export const reportOnContestSpot = async (req, res) => {
    try {
        const {
            userId: bodyUserId,
            spotId: bodySpotId,
            which,
            forWhat,
            reason,
            reasonForSpot,
            reasonForSpotComplete,
            description,
            details,
            imageUrl: bodyImageUrl,
            imageId: bodyImageId,
        } = req.body || {};

        let user = req.user;
        if (!user && bodyUserId) {
            if (mongoose.Types.ObjectId.isValid(bodyUserId)) {
                user = await User.findById(bodyUserId);
            }
            if (!user) {
                user = await User.findOne({ username: bodyUserId });
            }
        }

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const userId = user._id;

        const targetSpotId = bodySpotId || req.body?.spotId || req.params?.id || req.body?.id;
        if (!targetSpotId) {
            return res.status(400).json({ message: "Spot ID is required" });
        }

        const spot = await MarkedSpot.findById(targetSpotId);
        if (!spot) {
            return res.status(404).json({ message: "Spot not found" });
        }

        // Prevent duplicate reporting by the same user
        const alreadyReported = Array.isArray(spot.isReportedBy) && spot.isReportedBy.some((entry) => {
            const rId = entry?.reportedBy?._id
                ? entry.reportedBy._id.toString()
                : (entry?.reportedBy ? entry.reportedBy.toString() : (entry?._id ? entry._id.toString() : (typeof entry === "string" ? entry : "")));
            return rId && rId === userId.toString();
        });
        if (alreadyReported) {
            return res.status(400).json({ message: "You have already reported/contested this spot." });
        }

        const data = await preImageOrCodeVerification(req, "report");

        // Process image upload if provided in req.file, req.files, or req.body
        let imageUrl = bodyImageUrl || "";
        let imageId = bodyImageId || "";

        const uploadedFile = req.file || (req.files && (req.files.image?.[0] || req.files.counterPhoto?.[0] || (Array.isArray(req.files) ? req.files[0] : null)));

        if (uploadedFile) {
            let fileInput = uploadedFile.path;
            if (!fileInput && uploadedFile.buffer) {
                const b64 = Buffer.from(uploadedFile.buffer).toString("base64");
                fileInput = `data:${uploadedFile.mimetype};base64,${b64}`;
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
        } else if (req.body?.counterPhoto && req.body.counterPhoto.startsWith("data:image/")) {
            const uploadRes = await uploadToCloudinary(req.body.counterPhoto, "SafaiWatch_reports");
            if (uploadRes) {
                imageUrl = typeof uploadRes === "string" ? uploadRes : uploadRes.url || uploadRes.secure_url;
                imageId = uploadRes.public_id || "";
            }
        }

        const aiResult = await wasteVerification(imageUrl, "simulation");
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
            if (data?.type === "code" && !aiResult.codeMatched) {
                return res.status(400).json({ message: "Code mismatch" });
            }
            if (data?.type === "gesture" && !aiResult.gestureMatched) {
                return res.status(400).json({ message: "Gesture mismatch" });
            }
        }

        const targetForWhat = forWhat || which || "reportSpot";
        const selectedReason = reason || (targetForWhat === "reportSpot" ? reasonForSpot : reasonForSpotComplete);

        const reportData = {
            userId,
            forWhat: targetForWhat,
            spotId: targetSpotId,
            description: description || details || "",
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

        const markspot = await MarkedSpot.findByIdAndUpdate(
            targetSpotId,
            {
                $set: { isReported: true },
                $push: {
                    isReportedBy: {
                        reportedBy: userId,
                        ReportProb: report._id,
                        reportedAt: new Date(),
                    },
                },
            },
            { new: true }
        ).populate({ path: "markedBy", select: "username" });

        // Retrieve the user who originally marked the spot
        const markedUser = markspot?.markedBy;
        const markedUserId = markedUser?._id || markspot?.markedBy;
        let markedUsername = markedUser?.username;

        if (!markedUsername && markedUserId) {
            const foundUser = await User.findById(markedUserId).select("username");
            markedUsername = foundUser?.username;
        }

        // Add report details to UserStatus.reportForme for the marked user
        if (markedUserId) {
            await UserStatus.findOneAndUpdate(
                { user: markedUserId },
                {
                    $push: {
                        reportForme: {
                            _id: report._id,
                            forWhat: targetForWhat,
                            reportAt: new Date(),
                        },
                    },
                    $setOnInsert: { user: markedUserId },
                },
                { new: true, upsert: true }
            );
        }

        // Update UserStatus of the reporting user
        const statusUpdate = await UserStatus.findOneAndUpdate(
            { user: userId },
            {
                $push: {
                    reportOnContestSpots: {
                        _id: report._id,
                        reportAt: Date.now(),
                    },
                },
                $setOnInsert: { user: userId },
            },
            { new: true, upsert: true }
        );

        // Send message / notification to frontend via Socket.IO (without exposing markedBy user ID)
        try {
            const io = getIo();
            if (io) {
                const reportNotification = {
                    spotId: targetSpotId,
                    reportId: report._id,
                    forWhat: targetForWhat,
                    reason: selectedReason || (targetForWhat === "reportSpot" ? report.reasonForSpot : report.reasonForSpotComplete),
                    description: report.description,
                    message: `Notice: Your marked spot has been reported for ${selectedReason || targetForWhat || "review"}.`,
                    reportedAt: new Date(),
                };

                if (markedUsername) {
                    io.to(`user:${markedUsername}`).to(markedUsername).emit("spot:reported", reportNotification);
                    io.to(`user:${markedUsername}`).to(markedUsername).emit("notification", {
                        type: "spot:reported",
                        ...reportNotification,
                    });
                }
                if (markedUserId) {
                    io.to(`user:${markedUserId}`).to(String(markedUserId)).emit("spot:reported", reportNotification);
                }
            }
        } catch (socketErr) {
            console.error("Socket emit error for spot:reported:", socketErr);
        }

        return res.status(201).json({ message: "Reported successfully", report });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
};