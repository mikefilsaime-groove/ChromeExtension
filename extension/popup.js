document.addEventListener('DOMContentLoaded', () => {
  const speedButtonsContainer = document.getElementById('speedButtons');
  const currentSpeedDisplay = document.getElementById('currentSpeed');
  const compactToggle = document.getElementById('compactToggle');
  const extensionVersion = document.getElementById('extensionVersion');
  const popupStatus = document.getElementById('popupStatus');

  const DEFAULT_PRESETS = [1.0, 1.5, 2.0, 3.0, 4.0];

  let currentSpeed = 1.0;
  let presets = DEFAULT_PRESETS;

  extensionVersion.textContent = `Version ${chrome.runtime.getManifest().version}`;

  chrome.storage.sync.get(['preferredSpeed', 'customSpeeds', 'isMinimized'], (result) => {
    if (result.preferredSpeed !== undefined) {
      currentSpeed = result.preferredSpeed;
    }
    if (result.customSpeeds && result.customSpeeds.length > 0) {
      presets = result.customSpeeds;
    }
    if (result.isMinimized !== undefined) {
      compactToggle.checked = result.isMinimized;
    }
    renderSpeedButtons();
    updateCurrentDisplay();
    queryActiveTabSpeed();
  });

  function renderSpeedButtons() {
    speedButtonsContainer.innerHTML = '';
    presets.forEach(speed => {
      const btn = document.createElement('button');
      btn.className = 'vsp-popup-speed-btn';
      btn.textContent = `${speed}x`;
      if (Math.abs(speed - currentSpeed) < 0.01) {
        btn.classList.add('active');
      }
      btn.addEventListener('click', () => {
        currentSpeed = speed;
        chrome.storage.sync.set({ preferredSpeed: speed });
        sendToContent({ action: 'setSpeed', speed: speed }, (response) => {
          if (response && !response.appliedToVideo) {
            showStatus('No video detected on this page yet.');
          }
        });
        renderSpeedButtons();
        updateCurrentDisplay();
      });
      speedButtonsContainer.appendChild(btn);
    });
  }

  function updateCurrentDisplay() {
    currentSpeedDisplay.textContent = `${currentSpeed}x`;
  }

  function queryActiveTabSpeed() {
    sendToContent({ action: 'getSpeed' }, (response) => {
      if (response && response.speed !== undefined) {
        currentSpeed = response.speed;
        renderSpeedButtons();
        updateCurrentDisplay();
        if (!response.hasVideo) {
          showStatus('No video detected on this page yet.');
        }
      }
    });
  }

  function sendToContent(message, callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError || !tabs[0]) {
        showStatus('This extension is not available on this page.');
        return;
      }

      chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
        if (chrome.runtime.lastError) {
          showStatus('This extension is not available on this page.');
          return;
        }
        popupStatus.textContent = '';
        if (callback) callback(response);
      });
    });
  }

  function showStatus(message) {
    popupStatus.textContent = message;
  }

  compactToggle.addEventListener('change', () => {
    const isMinimized = compactToggle.checked;
    chrome.storage.sync.set({ isMinimized: isMinimized });
    sendToContent({ action: 'setMinimized', isMinimized: isMinimized });
  });
});
