import { config } from "dotenv";
config({ path: `.env` });

const cleanEnv = (val) => (typeof val === "string" ? val.trim().replace(/^["']|["']$/g, "") : val);

export const PORT = cleanEnv(process.env.PORT);
export const MONGO_URI = cleanEnv(process.env.MONGO_URI);
export const FRONTEND_URL = cleanEnv(process.env.FRONTEND_URL);
export const JWT_SECRET = cleanEnv(process.env.JWT_SECRET);
export const NODE_ENV = cleanEnv(process.env.NODE_ENV);
export const GOOGLE_CLIENT_ID = cleanEnv(process.env.GOOGLE_CLIENT_ID);
export const GOOGLE_CLIENT_SECRET = cleanEnv(process.env.GOOGLE_CLIENT_SECRET);
export const GOOGLE_CALLBACK_URL = cleanEnv(process.env.GOOGLE_CALLBACK_URL);
export const CLOUDINARY_NAME = cleanEnv(process.env.CLOUDINARY_NAME);
export const CLOUDINARY_API_KEY = cleanEnv(process.env.CLOUDINARY_API_KEY);
export const CLOUDINARY_API_SECRET = cleanEnv(process.env.CLOUDINARY_API_SECRET);
export const GEMINI_API_KEY = cleanEnv(process.env.GEMINI_API_KEY);
export const GEMINI_MODEL = cleanEnv(process.env.GEMINI_MODEL) || "gemini-3.6-flash";

