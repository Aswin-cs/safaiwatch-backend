import mongoose from "mongoose";
import User from "../../models/user.model.js";
import Report from "../../models/report.model.js";
import MarkedSpot from "../../models/markedSpots.model.js";
import { preImageOrCodeVerification } from "./spots.controller.js";
import { wasteVerification } from "../../utils/aiPhotoVerification.utils.js";

export const reportOnContestSpot = async (req, res) => {
    try {
        const { userId, spotId, which, description } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const spot = await MarkedSpot.findById(spotId);
        if (!spot) {
            return res.status(404).json({ message: "Spot not found" });
        }
        const data = preImageOrCodeVerification(req, "report")
        const aiResult = await wasteVerification(req, data)
        if (aiResult) {
            if (aiResult.isFraudulent) {
                return res.status(400).json({ message: aiResult.fraudReason });
            }
            if (!aiResult.isValidWasteReport) {
                return res.status(400).json({ message: "No waste detected" });
            }
            if (!aiResult.codeMatched || !aiResult.gestureMatched) {
                return res.status(400).json({ message: "Code or gesture mismatch" });
            }
        }
        const report = new Report({
            userId,
            forWhat: which,
            spotId,
            description,
        });
        if (which == "reportSpot") {

        }
        await report.save();
        return res.status(201).json({ message: "Reported successfully" });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Internal server error" });
    }
}