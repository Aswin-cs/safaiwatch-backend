import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import authRouter from './routes/auth.routes.js';
import profileRouter from './routes/profile.routes.js';
import spotsRouter from './routes/spots.routes.js';
import feedsRouter from './routes/feeds.routes.js';


const app = express();

app.use(
  cors({
    origin: [process.env.FRONTEND_URL, 'http://localhost:3000', 'http://127.0.0.1:3000'].filter(Boolean),
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

export default app;