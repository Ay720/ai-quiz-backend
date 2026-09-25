/**
 * server.js — Main Express Server Entry Point
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const aiRouter = require('./routes/ai');

const app = express();
const PORT = process.env.PORT || 3001;

// Global Middleware
app.use((req, res, next) => {
  // Normalize repeated slashes (e.g. //api/ai/health -> /api/ai/health)
  req.url = req.url.replace(/\/{2,}/g, '/');
  next();
});

app.use(cors({
  origin: '*', // Allow extension popups, content scripts, and web portals
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Request Logging
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url} - ${new Date().toLocaleTimeString()}`);
  next();
});

// Mount Routes
app.use('/api/ai', aiRouter);

// Root Welcome Route
app.get('/', (req, res) => {
  res.json({
    message: 'AI Quiz Assistant Backend is running.',
    version: '1.0.0',
    endpoints: {
      health: 'GET /api/ai/health',
      solve: 'POST /api/ai/solve'
    }
  });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('[Backend Error]', err.message);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

// Start Server
app.listen(PORT, () => {
  console.log('====================================================');
  console.log(`🤖 AI Quiz Assistant Backend is LIVE on port ${PORT}`);
  console.log(`   Provider: ${process.env.LLM_PROVIDER || 'openai'}`);
  console.log(`   Health Check: http://localhost:${PORT}/api/ai/health`);
  console.log('====================================================');
});

module.exports = app;
