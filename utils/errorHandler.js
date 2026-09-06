/**
 * Custom Error Handler Utility
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @returns {Error} Custom Error object with statusCode attached
 */
export const errorHandler = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

export default errorHandler;
