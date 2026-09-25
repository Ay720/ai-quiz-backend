/**
 * popup.js — Controls the extension popup UI
 * Sends start/stop triggers to the content script, tracks progress,
 * and monitors backend connection health.
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const questionsFoundEl = document.getElementById('questionsFound');
  const answeredCountEl = document.getElementById('answeredCount');
  const statusTextEl = document.getElementById('statusText');
  const apiPill = document.getElementById('apiPill');
  const apiDot = document.getElementById('apiDot');
  const apiStatusText = document.getElementById('apiStatusText');
  const errorBox = document.getElementById('errorBox');
  const errorMsg = document.getElementById('errorMsg');
  const settingsToggle = document.getElementById('settingsToggle');
  const settingsContent = document.getElementById('settingsContent');
  const settingsArrow = document.getElementById('settingsArrow');
  const backendUrlInput = document.getElementById('backendUrlInput');
  const saveUrlBtn = document.getElementById('saveUrlBtn');

  const DEFAULT_BACKEND = 'https://ai-quiz-backend-8tw9.onrender.com';

  function normalizeUrl(url) {
    if (!url) return DEFAULT_BACKEND;
    let clean = url.trim().replace(/\/+$/, '');
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }
    // If user has old localhost from previous session, migrate to live Render URL
    if (clean.includes('localhost')) {
      clean = DEFAULT_BACKEND;
      chrome.storage.local.set({ backendUrl: DEFAULT_BACKEND });
    }
    return clean;
  }

  // Load configured backend URL
  chrome.storage.local.get(['backendUrl'], (res) => {
    const activeUrl = normalizeUrl(res.backendUrl);
    backendUrlInput.value = activeUrl;
    checkApiHealth(activeUrl);
  });

  // Settings accordion toggle
  settingsToggle.addEventListener('click', () => {
    const isHidden = settingsContent.style.display === 'none';
    settingsContent.style.display = isHidden ? 'flex' : 'none';
    settingsArrow.textContent = isHidden ? '▾' : '▸';
  });

  // Save backend URL
  saveUrlBtn.addEventListener('click', () => {
    const url = normalizeUrl(backendUrlInput.value);
    backendUrlInput.value = url;
    chrome.storage.local.set({ backendUrl: url }, () => {
      checkApiHealth(url);
      showStatus('Backend URL updated.');
    });
  });

  // Check API health directly and via service worker
  async function checkApiHealth(url) {
    const clean = normalizeUrl(url);
    apiDot.className = 'api-dot';
    apiStatusText.textContent = 'Checking...';

    try {
      const resp = await fetch(`${clean}/api/ai/health`, { method: 'GET' });
      if (resp.ok) {
        const data = await resp.json();
        apiDot.className = 'api-dot online';
        apiStatusText.textContent = `Online (${data.provider || 'Ready'})`;
        return;
      }
    } catch (e) {
      // Direct fetch failed, check via background relay
    }

    chrome.runtime.sendMessage({ type: 'CHECK_BACKEND', backendUrl: clean }, (res) => {
      if (res && res.online) {
        apiDot.className = 'api-dot online';
        apiStatusText.textContent = `Online (${res.provider})`;
      } else {
        apiDot.className = 'api-dot offline';
        apiStatusText.textContent = 'API Offline';
      }
    });
  }

  // Get current active tab state
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (activeTab && activeTab.id) {
    chrome.tabs.sendMessage(activeTab.id, { type: 'GET_PROGRESS' }, (res) => {
      if (chrome.runtime.lastError) {
        // Content script might not be injected yet or non-web page
        return;
      }
      if (res) {
        updateUI(res);
      }
    });
  }

  // Start AI Action
  startBtn.addEventListener('click', async () => {
    hideError();
    setRunningState(true);
    showStatus('Scanning current webpage for questions...');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) throw new Error('No active browser tab found.');

      const backendUrl = backendUrlInput.value.trim() || DEFAULT_BACKEND;

      chrome.tabs.sendMessage(
        tab.id,
        { type: 'START_AI', backendUrl: backendUrl },
        (response) => {
          if (chrome.runtime.lastError) {
            showError('Could not connect to this page. Please refresh the quiz tab.');
            setRunningState(false);
          } else if (response && !response.success) {
            showError(response.error || 'Failed to start AI Assistant.');
            setRunningState(false);
          }
        }
      );
    } catch (err) {
      showError(err.message);
      setRunningState(false);
    }
  });

  // Stop Action
  stopBtn.addEventListener('click', async () => {
    showStatus('Stopping...');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'STOP_AI' }, () => {
          setRunningState(false);
          showStatus('Stopped by user.');
        });
      }
    } catch (err) {
      setRunningState(false);
    }
  });

  // Listen for live updates from content script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'PROGRESS_UPDATE') {
      updateUI(message);
    }
  });

  function updateUI(data) {
    if (typeof data.questionsFound === 'number') {
      questionsFoundEl.textContent = data.questionsFound;
    }
    if (typeof data.answeredCount === 'number') {
      answeredCountEl.textContent = data.answeredCount;
    }
    if (data.statusText) {
      showStatus(data.statusText);
    }
    if (typeof data.isRunning === 'boolean') {
      setRunningState(data.isRunning);
    }
    if (data.error) {
      showError(data.error);
    }
  }

  function setRunningState(running) {
    startBtn.disabled = running;
    stopBtn.disabled = !running;
  }

  function showStatus(text) {
    statusTextEl.textContent = text;
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorBox.style.display = 'flex';
  }

  function hideError() {
    errorBox.style.display = 'none';
  }
});
