/**
 * service-worker.js — Manifest V3 Background Service Worker
 * Central relay connecting Extension Popup, Content Scripts, and Backend API.
 */

'use strict';

const DEFAULT_BACKEND_URL = 'https://ai-quiz-backend-8tw9.onrender.com';

// Session state cache
const session = {
  questionsFound: 0,
  answeredCount: 0,
  isRunning: false,
  statusText: 'Ready',
  apiStatus: 'Checking...',
  lastError: null,
  backendUrl: DEFAULT_BACKEND_URL
};

// Initialize settings from storage
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['backendUrl'], (res) => {
    if (res.backendUrl) {
      session.backendUrl = res.backendUrl;
    }
  });
  console.log('[ServiceWorker] AI Quiz Assistant installed.');
});

// Central message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'GET_STATUS': {
      sendResponse({ ...session });
      break;
    }

    case 'UPDATE_STATE': {
      if (typeof request.questionsFound === 'number') session.questionsFound = request.questionsFound;
      if (typeof request.answeredCount === 'number') session.answeredCount = request.answeredCount;
      if (typeof request.isRunning === 'boolean') session.isRunning = request.isRunning;
      if (request.statusText) session.statusText = request.statusText;
      if (request.lastError !== undefined) session.lastError = request.lastError;
      sendResponse({ success: true });
      break;
    }

    case 'CHECK_BACKEND': {
      const url = request.backendUrl || session.backendUrl || DEFAULT_BACKEND_URL;
      checkBackendHealth(url)
        .then(result => {
          session.apiStatus = result.online ? 'Online' : 'Offline';
          sendResponse(result);
        })
        .catch(err => {
          session.apiStatus = 'Offline';
          sendResponse({ online: false, error: err.message });
        });
      return true; // Keep async channel open
    }

    case 'SOLVE_QUESTIONS': {
      const url = request.backendUrl || session.backendUrl || DEFAULT_BACKEND_URL;
      solveQuestions(url, request.questions)
        .then(result => sendResponse({ success: true, ...result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }

  return true;
});

/**
 * Checks backend health
 */
async function checkBackendHealth(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/api/ai/health`, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { online: true, provider: data.provider || 'unknown' };
  } catch (err) {
    return { online: false, error: err.message };
  }
}

/**
 * Sends questions to backend AI endpoint
 */
async function solveQuestions(baseUrl, questions) {
  const endpoint = `${baseUrl}/api/ai/solve`;
  console.log(`[ServiceWorker] Sending ${questions.length} questions to ${endpoint}`);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questions })
  });

  if (!res.ok) {
    let errDetail = '';
    try {
      const json = await res.json();
      errDetail = json.error || json.message;
    } catch (e) {
      errDetail = await res.text();
    }
    throw new Error(`Backend error (${res.status}): ${errDetail || res.statusText}`);
  }

  return await res.json();
}
