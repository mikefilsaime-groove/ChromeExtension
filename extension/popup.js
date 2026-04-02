document.addEventListener('DOMContentLoaded', () => {
  const speedButtonsContainer = document.getElementById('speedButtons');
  const currentSpeedDisplay = document.getElementById('currentSpeed');
  const compactToggle = document.getElementById('compactToggle');

  const DEFAULT_PRESETS = [1.0, 1.5, 2.0, 3.0, 4.0];

  let currentSpeed = 1.0;
  let presets = DEFAULT_PRESETS;

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
        sendToContent({ action: 'setSpeed', speed: speed });
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
      }
    });
  }

  function sendToContent(message, callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, message, callback);
      }
    });
  }

  compactToggle.addEventListener('change', () => {
    const isMinimized = compactToggle.checked;
    chrome.storage.sync.set({ isMinimized: isMinimized });
    sendToContent({ action: 'setMinimized', isMinimized: isMinimized });
  });
});
