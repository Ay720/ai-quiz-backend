/**
 * aiController.js — Controller for Quiz Solving Endpoints
 */

const llmService = require('../services/llmService');

/**
 * POST /api/ai/solve
 * Body: { questions: [ { id: "q1", question: "...", options: ["A", "B"] } ] }
 */
async function solve(req, res, next) {
  try {
    const { questions } = req.body;

    if (!questions || !Array.isArray(questions)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payload: "questions" must be an array.'
      });
    }

    if (questions.length === 0) {
      return res.status(200).json({
        success: true,
        results: []
      });
    }

    console.log(`[aiController] Processing ${questions.length} questions.`);

    const output = await llmService.solveQuestions(questions);

    return res.status(200).json({
      success: true,
      results: output.results
    });
  } catch (err) {
    next(err);
  }
}

function health(req, res) {
  const geminiKey = Boolean(process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.includes('your_'));
  const groqKey = Boolean(process.env.GROQ_API_KEY && !process.env.GROQ_API_KEY.includes('your_'));
  const openAiKey = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.includes('sk-'));

  const provider = process.env.LLM_PROVIDER || 'groq';
  let active = 'builtin-engine';
  if (provider === 'groq' && groqKey) active = 'groq (ultra-fast)';
  else if (provider === 'gemini' && geminiKey) active = 'gemini (free)';
  else if (provider === 'openai' && openAiKey) active = 'openai';
  else if (groqKey) active = 'groq (ultra-fast)';
  else if (geminiKey) active = 'gemini (free)';

  res.status(200).json({
    status: 'online',
    provider: active,
    uptime: process.uptime()
  });
}

module.exports = {
  solve,
  health
};
