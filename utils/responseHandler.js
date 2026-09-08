/**
 * Custom Response Handler Utility
 * @param {Object} res - Express Response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Response message
 * @param {Object} data - Payload data object
 */
export const responseHandler = (res, statusCode, message, data = {}) => {
  return res.status(statusCode).json({
    success: statusCode >= 200 && statusCode < 300,
    message,
    ...data,
  });
};

export default responseHandler;
