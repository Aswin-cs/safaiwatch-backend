import { Server } from "socket.io";
import { FRONTEND_URL } from "./envConfig.js";

let io;
const initialize = async (httpServer) => {
      io = new Server(httpServer, {
            cors: {
                  origin: FRONTEND_URL,
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
                  const targetUserId = typeof data === 'object' ? (data.userId || data._id || data.id) : data;
                  if (targetUserId) {
                        socket.join(`user:${targetUserId}`);
                        socket.join(String(targetUserId));
                        console.log(`User socket ${socket.id} joined user room: user:${targetUserId}`);
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