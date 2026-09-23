/**
 * ai.js — Routing Definition for AI Quiz Endpoints
 */

const express = require('express');
const aiController = require('../controllers/aiController');

const router = express.Router();

router.post('/solve', aiController.solve);
router.get('/health', aiController.health);

module.exports = router;
