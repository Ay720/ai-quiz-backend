/**
 * content.js — Master Content Script Orchestrator
 * Coordinates question extraction, backend LLM communication, answer matching,
 * and safe option selection.
 * STRICT RULE: NEVER automatically submits the entire quiz.
 */

(function () {
  'use strict';

  // Ignore tiny/hidden helper iframes (Google Docs fonts, analytics sandboxes)
  if (window.self !== window.top) {
    if (window.innerWidth < 100 || window.innerHeight < 100) return;
  }

  // Prevent multiple injections
  if (window.__AI_QUIZ_ASSISTANT_CONTENT_LOADED__) return;
  window.__AI_QUIZ_ASSISTANT_CONTENT_LOADED__ = true;

  console.log('[AI Quiz Assistant] Content script ready on:', window.location.hostname);

  const state = {
    isRunning: false,
    questionsFound: 0,
    answeredCount: 0,
    statusText: 'Ready',
    lastError: null,
    extractedQuestions: []
  };

  /**
   * Main AI Solving Workflow
   */
  async function runAiAssistant(backendUrl) {
    if (state.isRunning) return;
    state.isRunning = true;
    state.answeredCount = 0;
    state.lastError = null;

    console.log('[AI Quiz Assistant] Starting solving workflow...');
    updateProgress('Scanning page for questions...');

    try {
      // Step 1: Scan DOM and extract all questions
      const questions = window.AIGenericExtractor.extractAllQuestions();
      state.extractedQuestions = questions;
      state.questionsFound = questions.length;

      if (questions.length === 0) {
        if (window.self !== window.top) {
          state.isRunning = false;
          return;
        }
        throw new Error('No quiz questions detected on this page. Ensure questions and options are visible.');
      }

      updateProgress(`Found ${questions.length} questions. Querying AI model...`);

      // Step 2: Format payload for backend API (including images and question types)
      const payloadQuestions = questions.map(q => ({
        id: q.id,
        type: q.type || (q.options?.length ? 'choice' : 'text'),
        question: q.question,
        options: (q.options || []).map(o => o.text),
        images: (q.images || []).map(img => ({
          url: img.url,
          data: img.data,
          alt: img.alt
        }))
      }));

      // Step 3: Request answers via background service worker
      const response = await sendToBackground({
        type: 'SOLVE_QUESTIONS',
        backendUrl: backendUrl,
        questions: payloadQuestions
      });

      if (!response || !response.success || !response.results) {
        throw new Error(response?.error || 'Failed to receive answers from backend.');
      }

      const answers = response.results;
      updateProgress(`Received ${answers.length} answers. Filling responses...`);

      // Step 4: Iterate and fill text or select matched options on the webpage
      for (let i = 0; i < answers.length; i++) {
        if (!state.isRunning) {
          updateProgress('Stopped by user.');
          break;
        }

        const ansObj = answers[i];
        const questionItem = questions.find(q => q.id === ansObj.id);

        if (questionItem) {
          if (questionItem.type === 'text') {
            // WRITTEN / TEXT INPUT QUESTION
            updateProgress(`Writing answer for question ${i + 1} of ${answers.length}...`);
            const writeRes = window.AIOptionSelector.fillTextInput(questionItem, ansObj.answer);
            if (writeRes.success) {
              state.answeredCount++;
              console.log(`[AI Quiz] Filled written answer for question ${questionItem.id}: "${ansObj.answer}"`);
            } else {
              console.warn(`[AI Quiz] Writing failed for question ${questionItem.id}:`, writeRes.error);
            }
          } else if (questionItem.options && questionItem.options.length > 0) {
            // MULTIPLE CHOICE QUESTION
            updateProgress(`Selecting option for question ${i + 1} of ${answers.length}...`);
            const matched = window.AIOptionMatcher.findMatch(ansObj.answer, questionItem.options);

            if (matched) {
              const selectRes = window.AIOptionSelector.select(matched);
              if (selectRes.success) {
                state.answeredCount++;
                console.log(`[AI Quiz] Selected: "${matched.text}" for question "${questionItem.question.substring(0, 40)}..."`);
              } else {
                console.warn(`[AI Quiz] Selection failed for question ${questionItem.id}:`, selectRes.error);
              }
            } else {
              console.warn(`[AI Quiz] Could not match AI answer "${ansObj.answer}" with options for question ${questionItem.id}`);
            }
          }
        }

        // Brief human-like pause between actions (600ms)
        await sleep(600);
      }

      // Step 5: Final status (STRICTLY WITHOUT SUBMISSION)
      if (state.isRunning) {
        state.isRunning = false;
        updateProgress(`Complete! Answered ${state.answeredCount} of ${state.questionsFound} questions.`);
      }
    } catch (err) {
      console.error('[AI Quiz] Error during execution:', err);
      state.isRunning = false;
      state.lastError = err.message;
      updateProgress(`Error: ${err.message}`, err.message);
    }
  }

  function stopAiAssistant() {
    state.isRunning = false;
    updateProgress('Stopped by user.');
  }

  function updateProgress(statusText, errorMsg = null) {
    state.statusText = statusText;
    if (errorMsg) state.lastError = errorMsg;

    const msg = {
      type: 'PROGRESS_UPDATE',
      questionsFound: state.questionsFound,
      answeredCount: state.answeredCount,
      isRunning: state.isRunning,
      statusText: state.statusText,
      error: state.lastError
    };

    // Forward to popup and background
    chrome.runtime.sendMessage(msg).catch(() => {});
  }

  function sendToBackground(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        resolve(response);
      });
    });
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Listen for popup triggers
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.type) {
      case 'START_AI': {
        runAiAssistant(request.backendUrl);
        sendResponse({ success: true });
        break;
      }

      case 'STOP_AI': {
        stopAiAssistant();
        sendResponse({ success: true });
        break;
      }

      case 'GET_PROGRESS': {
        sendResponse({
          questionsFound: state.questionsFound,
          answeredCount: state.answeredCount,
          isRunning: state.isRunning,
          statusText: state.statusText,
          error: state.lastError
        });
        break;
      }

      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
    return true;
  });

  console.log('[AI Quiz Assistant] Content script active on this page.');
})();
