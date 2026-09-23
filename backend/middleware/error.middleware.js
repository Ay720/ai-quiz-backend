/**
 * error.middleware.js — Centralized Error Handling Middleware
 */

function errorHandler(err, req, res, next) {
  console.error('[Backend Error]', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.originalUrl,
    method: req.method
  });

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    error: message,
    timestamp: new Date().toISOString()
  });
}

function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    error: `Endpoint ${req.method} ${req.originalUrl} not found`
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};
