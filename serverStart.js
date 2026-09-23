import express from 'express';
import app from './src/app.js';
import { PORT } from './config/envConfig.js';
import connectDB from './config/connectDb.js';
import http from 'http';
import { initialize } from './config/socketIoConfig.js';
const Port = PORT || 5000;
app.use(express.json());
// app.use(express.urlencoded({ extended: false }));
const httpServer = http.createServer(app);
const io = await initialize(httpServer);
app.set('io', io);

const startServer = async () => {
      try {

            await connectDB();
            httpServer.on('error', (err) => {
                  console.error('Server error:', err);
                  throw err; // Rethrow the error to crash the server
            });
            httpServer.listen(Port, () => {
                  console.log(`Server is running on  http://localhost:${Port}`);
            });
      } catch (error) {
            console.error('Error starting the server:', error);
            process.exit(1); // Exit the process with an error code
      }
};

startServer();