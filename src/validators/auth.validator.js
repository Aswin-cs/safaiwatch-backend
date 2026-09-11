import { z } from "zod";

export const signUpCompletionSchema = z.object({
  username: z
    .string({ required_error: "Username is required" })
    .trim()
    .min(3, { message: "Username must be at least 3 characters long" })
    .max(30, { message: "Username must not exceed 30 characters" })
    .regex(/^[a-zA-Z0-9_]+$/, { message: "Username can only contain letters, numbers, and underscores" }),
  email: z
    .string({ required_error: "Email is required" })
    .trim()
    .email({ message: "Invalid email address" }),
  pincode: z
    .string({ required_error: "Pincode is required" })
    .trim()
    .regex(/^\d{6}$/, { message: "Pincode must be a 6-digit number" }),
  address: z
    .string({ required_error: "Address is required" })
    .trim()
    .min(1, { message: "Address is required" }),
  role: z
    .enum(["Civilian", "Coordinator", "Hybrid"])
    .default("Civilian"),
  geolocation: z.object({
    type: z.literal("Point"),
    coordinates: z
      .tuple([
        z.number({ required_error: "Longitude is required" }).min(-180).max(180),
        z.number({ required_error: "Latitude is required" }).min(-90).max(90)
      ], { invalid_type_error: "Coordinates must be [longitude, latitude]" })
  }),
  provider: z
    .enum(["email", "google"]).default("email"),
  providerId: z
    .string().default("email123"),
  avatarUrl: z.string().optional(),
});

export const signUpSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .trim()
    .email({ message: "Invalid email address" }),
});

export const signInSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .trim()
    .email({ message: "Invalid email address" })
});

export const isUniqueUsernameSchema = z.object({
  username: z
    .string({ required_error: "Username is required" })
    .trim()
    .min(3, { message: "Username must be at least 3 characters long" })
    .max(30, { message: "Username must not exceed 30 characters" })
    .regex(/^[a-zA-Z0-9_]+$/, { message: "Username can only contain letters, numbers, and underscores" }),
});