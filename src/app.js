import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import authRouter from './routes/auth.routes.js';
import profileRouter from './routes/profile.routes.js';
import spotsRouter from './routes/spots.routes.js';
import feedsRouter from './routes/feeds.routes.js';
import rewardsRouter from './routes/rewards.routes.js';
import nodeCron from 'node-cron';
import MarkedSpot from "../models/markedSpots.model.js";
import oneTimeModel from "../models/one-time.model.js";

const app = express();
app.set('trust proxy', 1);

nodeCron.schedule("*/5 * * * *", async () => {
  try {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    await MarkedSpot.deleteMany({
      $and: [
        {
          $or: [
            { "preCodeOrGestureForMark.isUserCompleted": false },
          ]
        },
        {
          $or: [
            { markedAt: { $lt: fiveMinutesAgo } },
            { "preCodeOrGestureForMark.expectedCompletionDate": { $lt: now } },
            { expectedCompletionDate: { $lt: now } }
          ]
        }
      ]
    });
    const hello = await oneTimeModel.deleteMany({
      expirationDate: { $lt: now }
    });
    console.log("Old one-time codes deleted successfully", hello);
  } catch (error) {
    console.error("Error deleting old one-time codes:", error);
  }
});

const cleanFrontendEnv = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.replace(/\/$/, '') : null;

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const cleanOrigin = origin.replace(/\/$/, '');
      if (
        cleanOrigin === cleanFrontendEnv ||
        cleanOrigin === 'http://localhost:3000' ||
        cleanOrigin === 'http://127.0.0.1:3000' ||
        cleanOrigin.endsWith('.vercel.app')
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/profile', profileRouter);
app.use('/api/v1/spots', spotsRouter);
app.use('/api/v1/feeds', feedsRouter);
app.use('/feed', feedsRouter);
app.use('/api/v1/rewards', rewardsRouter);
app.use('/api/v1/reward', rewardsRouter);

export default app;