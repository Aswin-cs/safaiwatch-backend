import { z } from "zod";

export const counterEvidenceSchema = z.object({
  reportId: z
    .string({ required_error: "Report ID is required" })
    .trim()
    .min(1, { message: "Report ID is required" }),
  reason: z
    .string({ required_error: "Option/Reason is required" })
    .trim()
    .min(1, { message: "Option/Reason is required" }),
  explanation: z
    .string()
    .trim()
    .min(5, { message: "Explanation must be at least 5 characters long" })
    .max(2000, { message: "Explanation must not exceed 2000 characters" })
    .optional(),
  description: z
    .string()
    .trim()
    .min(5, { message: "Description must be at least 5 characters long" })
    .max(2000, { message: "Description must not exceed 2000 characters" })
    .optional(),
}).refine(
  (data) => Boolean((data.explanation && data.explanation.trim()) || (data.description && data.description.trim())),
  {
    message: "Explanation or description is required and must be at least 5 characters long",
    path: ["explanation"],
  }
);
