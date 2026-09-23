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

  // Load configured backend URL
  chrome.storage.local.get(['backendUrl'], (res) => {
    if (res.backendUrl) {
      backendUrlInput.value = res.backendUrl;
    }
    checkApiHealth(backendUrlInput.value);
  });

  // Settings accordion toggle
  settingsToggle.addEventListener('click', () => {
    const isHidden = settingsContent.style.display === 'none';
    settingsContent.style.display = isHidden ? 'flex' : 'none';
    settingsArrow.textContent = isHidden ? '▾' : '▸';
  });

  // Save backend URL
  saveUrlBtn.addEventListener('click', () => {
    const url = backendUrlInput.value.trim() || 'http://localhost:3001';
    chrome.storage.local.set({ backendUrl: url }, () => {
      checkApiHealth(url);
      showStatus('Backend URL updated.');
    });
  });

  // Check API health via background service worker
  function checkApiHealth(url) {
    apiDot.className = 'api-dot';
    apiStatusText.textContent = 'Checking...';

    chrome.runtime.sendMessage({ type: 'CHECK_BACKEND', backendUrl: url }, (res) => {
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

      const backendUrl = backendUrlInput.value.trim() || 'http://localhost:3001';

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
