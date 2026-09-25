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

function cleanBackendUrl(rawUrl) {
  if (!rawUrl) return DEFAULT_BACKEND_URL;
  let clean = rawUrl.trim().replace(/\/+$/, '');
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = 'https://' + clean;
  }
  if (clean.includes('localhost')) {
    clean = DEFAULT_BACKEND_URL;
  }
  return clean;
}

/**
 * Checks backend health
 */
async function checkBackendHealth(rawUrl) {
  const baseUrl = cleanBackendUrl(rawUrl);
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
async function solveQuestions(rawUrl, questions) {
  const baseUrl = cleanBackendUrl(rawUrl);
  const endpoint = `${baseUrl}/api/ai/solve`;
  console.log(`[ServiceWorker] Processing ${questions.length} questions for ${endpoint}`);

  // Ensure any image URLs are converted to base64 (bypasses page CORS restrictions)
  await ensureImageBase64(questions);

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

/**
 * Converts image URLs to base64 using background service worker network permissions
 */
async function ensureImageBase64(questions) {
  for (const q of questions) {
    if (q.images && Array.isArray(q.images)) {
      for (const img of q.images) {
        if (!img.data && img.url && (img.url.startsWith('http://') || img.url.startsWith('https://'))) {
          try {
            console.log(`[ServiceWorker] Fetching image from: ${img.url.substring(0, 80)}...`);
            const resp = await fetch(img.url);
            if (resp.ok) {
              const blob = await resp.blob();
              const base64 = await blobToBase64(blob);
              if (base64) {
                img.data = base64;
                img.mimeType = blob.type || 'image/jpeg';
              }
            }
          } catch (e) {
            console.warn('[ServiceWorker] Image fetch error:', e.message);
          }
        }
      }
    }
  }
}

function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result;
      if (typeof res === 'string') {
        const pure = res.replace(/^data:[^;]+;base64,/, '');
        resolve(pure);
      } else {
        resolve(null);
      }
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}
