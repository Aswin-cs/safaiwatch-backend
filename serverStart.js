import express from 'express';
import app from './src/app.js';
import { PORT } from './config/envConfig.js';
const Port = PORT || 5000;
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const startServer = () => {
      try {
            app.on('error', (err) => {
                  console.error('Server error:', err);
                  throw err; // Rethrow the error to crash the server
            });
            app.listen(Port, () => {
                  console.log(`Server is running on  http://localhost:${Port}`);
            });
      } catch (error) {
            console.error('Error starting the server:', error);
            process.exit(1); // Exit the process with an error code
      }
};

startServer();