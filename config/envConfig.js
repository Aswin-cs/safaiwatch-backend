import { config } from "dotenv";
config({ path: `.env` });
export const { PORT, MONGO_URI, FRONTEND_URL, JWT_SECRET, NODE_ENV, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL } = process.env;
