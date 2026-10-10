import mongoose from "mongoose";
import User from "../../models/user.model.js";
import Report from "../../models/report.model.js";
import MarkedSpot from "../../models/markedSpots.model.js";
import { preImageOrCodeVerification } from "./spots.controller.js";
import { wasteVerification } from "../../utils/aiPhotoVerification.utils.js";
import { uploadToCloudinary } from "../../utils/Cloudinaryimage.utils.js";
import UserStatus from "../../models/userStatus.model.js";
import { getIo } from "../../config/socketIoConfig.js";
import { counterEvidenceSchema } from "../validators/report.validator.js";
import { isValidOptionForClaim } from "../../utils/citizenClaims.utils.js";

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

        const isCleanupReport =
            forWhat === "reportCompleteSpot" ||
            forWhat === "reportCleanup" ||
            forWhat === "reportCleanUp" ||
            which === "reportCompleteSpot" ||
            which === "reportCleanup" ||
            which === "reportCleanUp" ||
            req.body?.action === "reportCleanup" ||
            req.body?.action === "reportCleanUp" ||
            req.body?.action === "reportCompleteSpot" ||
            Boolean(req.path && req.path.includes("report-cleanup")) ||
            (spot.isCompleted && forWhat !== "reportSpot");

        if (isCleanupReport) {
            if (!spot.isCompleted) {
                return res.status(400).json({ message: "Cannot report cleanup on a spot that is not marked as completed" });
            }
            if (!spot.isVerified) {
                return res.status(400).json({ message: "Cannot report cleanup on an unverified spot" });
            }
            if (spot.isReported) {
                return res.status(400).json({ message: "Cannot report cleanup on a spot that has already been reported/contested" });
            }

            // Prevent duplicate reporting by the same user on completed spot
            const alreadyReportedOnComplete = Array.isArray(spot.isReportedOnComplete) && spot.isReportedOnComplete.some((entry) => {
                const rId = entry?.reportedBy?._id
                    ? entry.reportedBy._id.toString()
                    : (entry?.reportedBy ? entry.reportedBy.toString() : (entry?._id ? entry._id.toString() : (typeof entry === "string" ? entry : "")));
                return rId && rId === userId.toString();
            });
            if (alreadyReportedOnComplete) {
                return res.status(400).json({
                    message: "You have already registered an objection against this cleanup submission."
                });
            }
        } else {
            // Prevent duplicate reporting by the same user on marked spot
            const alreadyReported = Array.isArray(spot.isReportedBy) && spot.isReportedBy.some((entry) => {
                const rId = entry?.reportedBy?._id
                    ? entry.reportedBy._id.toString()
                    : (entry?.reportedBy ? entry.reportedBy.toString() : (entry?._id ? entry._id.toString() : (typeof entry === "string" ? entry : "")));
                return rId && rId === userId.toString();
            });
            if (alreadyReported) {
                return res.status(400).json({ message: "You have already reported/contested this spot." });
            }
        }

        const data = await preImageOrCodeVerification(req, isCleanupReport ? "reportCleanup" : "report");

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

        const aiResult = await wasteVerification(imageUrl, "real");
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

        const cleanupReasonAliases = {
            fake_photo: "fake_or_ai",
            not_cleaned: "not_completed",
            wrong_location: "wrong_cleaned_location",
            incomplete_cleanup: "not_completed",
            other_fraud: "other_spam",
        };

        const targetForWhat = isCleanupReport ? "reportCompleteSpot" : (forWhat || which || "reportSpot");
        const rawReason = reason || (isCleanupReport ? reasonForSpotComplete : reasonForSpot);
        const selectedReason = isCleanupReport
            ? (cleanupReasonAliases[rawReason] || rawReason || "other_spam")
            : (rawReason || "other_spam");

        const reportData = {
            userId,
            forWhat: targetForWhat,
            spotId: targetSpotId,
            description: description || details || "",
            imageUrl,
            imageId,
        };

        if (isCleanupReport) {
            reportData.reasonForSpotComplete = selectedReason;
        } else {
            reportData.reasonForSpot = selectedReason;
        }

        const report = new Report(reportData);
        await report.save();

        const spotUpdateQuery = isCleanupReport
            ? {
                $push: {
                    isReportedOnComplete: {
                        reportedBy: userId,
                        ReportProb: report._id,
                        reportedAt: new Date(),
                    },
                },
            }
            : {
                $set: { isReported: true },
                $push: {
                    isReportedBy: {
                        reportedBy: userId,
                        ReportProb: report._id,
                        reportedAt: new Date(),
                    },
                },
            };

        const markspot = await MarkedSpot.findByIdAndUpdate(
            targetSpotId,
            spotUpdateQuery,
            { new: true }
        )
            .populate({ path: "markedBy", select: "username" })
            .populate({ path: "isCompletedBy.completedBy", select: "username" });

        // Identify the accused user whose submission is being reported
        let targetAccusedUserId = null;
        let targetAccusedUsername = null;

        if (isCleanupReport) {
            const lastCompletion = Array.isArray(markspot?.isCompletedBy) && markspot.isCompletedBy.length > 0
                ? markspot.isCompletedBy[markspot.isCompletedBy.length - 1]
                : null;
            const completedUser = lastCompletion?.completedBy;
            targetAccusedUserId = completedUser?._id || completedUser;
            targetAccusedUsername = completedUser?.username;

            if (!targetAccusedUsername && targetAccusedUserId) {
                const foundUser = await User.findById(targetAccusedUserId).select("username");
                targetAccusedUsername = foundUser?.username;
            }
        }

        if (!targetAccusedUserId) {
            const markedUser = markspot?.markedBy;
            targetAccusedUserId = markedUser?._id || markspot?.markedBy;
            targetAccusedUsername = markedUser?.username;

            if (!targetAccusedUsername && targetAccusedUserId) {
                const foundUser = await User.findById(targetAccusedUserId).select("username");
                targetAccusedUsername = foundUser?.username;
            }
        }

        // Add report details to UserStatus.reportForme for the accused user
        if (targetAccusedUserId) {
            await UserStatus.findOneAndUpdate(
                { user: targetAccusedUserId },
                {
                    $push: {
                        reportForme: {
                            _id: report._id,
                            forWhat: targetForWhat,
                            reportAt: new Date(),
                        },
                    },
                    $setOnInsert: { user: targetAccusedUserId },
                },
                { new: true, upsert: true }
            );
        }

        // Update UserStatus of the reporting user
        const reporterUpdateQuery = isCleanupReport
            ? {
                $push: {
                    reportOnCompletedSpots: {
                        _id: report._id,
                        reportAt: Date.now(),
                    },
                    reportOnContestSpots: {
                        _id: report._id,
                        reportAt: Date.now(),
                    },
                },
                $setOnInsert: { user: userId },
            }
            : {
                $push: {
                    reportOnContestSpots: {
                        _id: report._id,
                        reportAt: Date.now(),
                    },
                },
                $setOnInsert: { user: userId },
            };

        await UserStatus.findOneAndUpdate(
            { user: userId },
            reporterUpdateQuery,
            { new: true, upsert: true }
        );

        // Send message / notification to frontend via Socket.IO
        try {
            const io = getIo();
            if (io) {
                const reportNotification = {
                    spotId: targetSpotId,
                    reportId: report._id,
                    forWhat: targetForWhat,
                    reason: selectedReason,
                    description: report.description,
                    message: isCleanupReport
                        ? `Notice: Your cleanup submission has been reported for ${selectedReason || "review"}.`
                        : `Notice: Your marked spot has been reported for ${selectedReason || targetForWhat || "review"}.`,
                    reportedAt: new Date(),
                };

                const eventName = isCleanupReport ? "cleanup:reported" : "spot:reported";

                if (targetAccusedUsername) {
                    io.to(`user:${targetAccusedUsername}`).to(targetAccusedUsername).emit(eventName, reportNotification);
                    io.to(`user:${targetAccusedUsername}`).to(targetAccusedUsername).emit("notification", {
                        type: eventName,
                        ...reportNotification,
                    });
                    if (eventName !== "spot:reported") {
                        io.to(`user:${targetAccusedUsername}`).to(targetAccusedUsername).emit("spot:reported", reportNotification);
                    }
                }
                if (targetAccusedUserId) {
                    io.to(`user:${targetAccusedUserId}`).to(String(targetAccusedUserId)).emit(eventName, reportNotification);
                    if (eventName !== "spot:reported") {
                        io.to(`user:${targetAccusedUserId}`).to(String(targetAccusedUserId)).emit("spot:reported", reportNotification);
                    }
                }
            }
        } catch (socketErr) {
            console.error("Socket emit error for report notification:", socketErr);
        }

        return res.status(201).json({
            success: true,
            message: isCleanupReport ? "Cleanup reported successfully" : "Reported successfully",
            report
        });
    } catch (error) {
        console.error("Error in reportOnContestSpot:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Controller to report / contest a completed cleanup submission.
 */
export const reportCleanup = async (req, res) => {
    if (!req.body) req.body = {};
    req.body.forWhat = "reportCompleteSpot";
    return reportOnContestSpot(req, res);
};

/**
 * Controller to submit Counter Evidence for a report.
 * - Validates options using citizenClaims.utils.js
 * - Performs Zod validation on explanation / description
 * - Submits value to report.counterExplanation
 * - Updates markedSpot.isSpotIsFake to true
 */
export const submitCounterEvidence = async (req, res) => {
    try {
        const userId = req.user?._id;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized: Please log in" });
        }

        const reportId = req.body?.reportId || req.params?.reportId || req.params?.id;
        const reason = req.body?.reason || req.body?.option || req.body?.stance;
        const explanation = req.body?.explanation || req.body?.description || req.body?.details;

        // 1. Zod validation for description / explanation and reason
        const validationResult = counterEvidenceSchema.safeParse({
            reportId: reportId ? String(reportId) : "",
            reason: reason ? String(reason) : "",
            explanation: explanation ? String(explanation) : undefined,
            description: req.body?.description ? String(req.body.description) : undefined,
        });

        if (!validationResult.success) {
            const firstError = validationResult.error.issues?.[0]?.message || "Validation failed";
            return res.status(400).json({
                success: false,
                message: firstError,
                errors: validationResult.error.issues,
            });
        }

        const { reason: validatedReason, explanation: validatedExplanation, description: validatedDescription } = validationResult.data;
        const finalExplanation = (validatedExplanation || validatedDescription || "").trim();

        if (!mongoose.Types.ObjectId.isValid(reportId)) {
            return res.status(400).json({ success: false, message: "Invalid Report ID" });
        }

        const report = await Report.findById(reportId);
        if (!report) {
            return res.status(404).json({ success: false, message: "Report not found" });
        }

        const spot = await MarkedSpot.findById(report.spotId);
        if (!spot) {
            return res.status(404).json({ success: false, message: "Associated spot not found" });
        }

        // Authorize: user must be the markedBy user, or completed/assigned user
        const isOwner = spot.markedBy?.toString() === userId.toString();
        const isCompletedBy = Array.isArray(spot.isCompletedBy) && spot.isCompletedBy.some(
            (c) => (c?.completedBy || c)?._id?.toString() === userId.toString() || (c?.completedBy || c)?.toString() === userId.toString()
        );
        if (!isOwner && !isCompletedBy) {
            return res.status(403).json({
                success: false,
                message: "Forbidden: Only the spot creator or cleanup assignee can submit counter evidence",
            });
        }

        // 2. Validate submitted option value using citizenClaims.utils.js
        const claimKey = report.forWhat === "reportCompleteSpot" ? report.reasonForSpotComplete : report.reasonForSpot;
        const isValidOption = isValidOptionForClaim(validatedReason, claimKey, report.forWhat);

        if (!isValidOption) {
            return res.status(400).json({
                success: false,
                message: `Invalid defense stance selected for this claim: "${validatedReason}". Please select a valid option from the list.`,
            });
        }

        // 3. Submit value to report.counterExplanation
        report.counterExplanation = {
            reason: validatedReason,
            explanation: finalExplanation,
            submittedAt: new Date(),
        };
        report.updatedAt = new Date();
        await report.save();

        // 4. Update markedSpot: make isSpotIsFake true
        await MarkedSpot.findByIdAndUpdate(
            report.spotId,
            {
                $set: { isSpotIsFake: true },
            },
            { new: true }
        );

        // 5. Check claim rules for BlackListCount on markedBy user:
        // - already_cleaned / fake_or_ai: always increment BlackListCount for marked user
        // - wrong_location / inaccessible: increment BlackListCount only if user already has BlackListCount > 0; otherwise do not mark anything
        // - other_spam: increment BlackListCount for both marked user and reporting user
        let updatedBlackListCount;
        const markedUserId = spot.markedBy?._id || spot.markedBy || userId;

        if (claimKey === "already_cleaned" || claimKey === "fake_or_ai") {
            const updatedStatus = await UserStatus.findOneAndUpdate(
                { $or: [{ user: markedUserId }, { userId: markedUserId }] },
                {
                    $inc: { BlackListCount: 1 },
                    $setOnInsert: { user: markedUserId },
                },
                { new: true, upsert: true }
            );
            if (updatedStatus) {
                updatedBlackListCount = updatedStatus.BlackListCount;
            }
        } else if (claimKey === "wrong_location" || claimKey === "wrong_cleaned_location" || claimKey === "inaccessible") {
            const updatedStatus = await UserStatus.findOneAndUpdate(
                {
                    $or: [{ user: markedUserId }, { userId: markedUserId }],
                    BlackListCount: { $gt: 0 },
                },
                {
                    $inc: { BlackListCount: 1 },
                },
                { new: true }
            );
            if (updatedStatus) {
                updatedBlackListCount = updatedStatus.BlackListCount;
            }
        } else if (claimKey === "other_spam") {
            // Increment BlackListCount by 1 both for marked user and reported user (report.userId)
            const updatedStatus = await UserStatus.findOneAndUpdate(
                { $or: [{ user: markedUserId }, { userId: markedUserId }] },
                {
                    $inc: { BlackListCount: 1 },
                    $setOnInsert: { user: markedUserId },
                },
                { new: true, upsert: true }
            );
            if (updatedStatus) {
                updatedBlackListCount = updatedStatus.BlackListCount;
            }

            const reportingUserId = report.userId;
            if (reportingUserId) {
                await UserStatus.findOneAndUpdate(
                    { $or: [{ user: reportingUserId }, { userId: reportingUserId }] },
                    {
                        $inc: { BlackListCount: 1 },
                        $setOnInsert: { user: reportingUserId },
                    },
                    { new: true, upsert: true }
                );
            }
        }

        // Notify via Socket.IO
        try {
            const io = getIo();
            if (io) {
                io.emit("spot:updated", { spotId: report.spotId, isSpotIsFake: true });
                io.emit("report:countered", {
                    reportId: report._id,
                    spotId: report.spotId,
                    isSpotIsFake: true,
                });
            }
        } catch (socketErr) {
            console.error("Socket emit error in submitCounterEvidence:", socketErr);
        }

        return res.status(200).json({
            success: true,
            message: "Counter evidence submitted successfully",
            data: {
                reportId: report._id,
                spotId: report.spotId,
                counterExplanation: report.counterExplanation,
                isSpotIsFake: true,
                ...(updatedBlackListCount !== undefined && { BlackListCount: updatedBlackListCount }),
            },
        });
    } catch (error) {
        console.error("Error in submitCounterEvidence:", error);
        return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
};
