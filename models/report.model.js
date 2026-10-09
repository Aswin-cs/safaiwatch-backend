import mongoose from "mongoose";

const ReportSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    forWhat: {
        type: String,
        enum: ["reportSpot", "reportCompleteSpot"],
        required: true,
    },
    spotId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "MarkedSpot",
        required: true,
    },
    imageUrl: {
        type: String,
    },
    imageId: {
        type: String,
    },
    reasonForSpot: {
        type: String,
        enum: ["fake_or_ai", "already_cleaned", "inaccessible", "wrong_location", "other_spam"],
        // required: true,
    },
    reasonForSpotComplete: {
        type: String,
        enum: ["fake_or_ai", "not_completed", "wrong_cleaned_location", "other_spam"],
        // required: true,
    },
    description: {
        type: String,
    },
    counterExplanation: {
        reason: {
            type: String,
        },
        explanation: {
            type: String,
        },
        submittedAt: {
            type: Date,
            default: Date.now,
        },
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});

export default mongoose.model("Report", ReportSchema) || mongoose.models.Report;
