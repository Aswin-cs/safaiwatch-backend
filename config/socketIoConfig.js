import { Server } from "socket.io";
import { FRONTEND_URL } from "./envConfig.js";

let io;
const initialize = async (httpServer) => {
      const cleanFrontendUrl = FRONTEND_URL ? FRONTEND_URL.replace(/\/$/, '') : null;
      io = new Server(httpServer, {
            cors: {
                  origin: (origin, callback) => {
                        if (!origin) return callback(null, true);
                        const cleanOrigin = origin.replace(/\/$/, '');
                        if (
                              cleanOrigin === cleanFrontendUrl ||
                              cleanOrigin === 'http://localhost:3000' ||
                              cleanOrigin === 'http://127.0.0.1:3000' ||
                              cleanOrigin.endsWith('.vercel.app')
                        ) {
                              return callback(null, true);
                        }
                        return callback(null, true);
                  },
                  methods: ["GET", "POST"],
                  credentials: true,
            },
      });

      io.on('connection', (socket) => {
            console.log('User connected:', socket.id);

            // Join room when joining a competition
            socket.on('joinCompetition', (data) => {
                  const { competitionId, userId, username, avatar } = data;
                  socket.join(competitionId);
                  console.log(`User ${username} (${socket.id}) joined competition: ${competitionId}`);
            });

            // Join user-specific room for targeted notifications (e.g. AI verification completion toasts)
            socket.on('joinUserRoom', (data) => {
                  const targetUser = typeof data === 'object' ? (data.username || data.userId || data._id || data.id) : data;
                  if (targetUser) {
                        socket.join(`user:${targetUser}`);
                        socket.join(String(targetUser));
                        console.log(`User socket ${socket.id} joined user room: user:${targetUser}`);
                  }
            });

            socket.on('disconnect', () => {
                  console.log('User disconnected:', socket.id);
            });
      });
      return io;
};


const getIo = () => {
      if (!io) {
            throw new Error("Socket.IO not initialized. Call initialize() first.");
      }
      return io;
};

export { initialize, getIo };