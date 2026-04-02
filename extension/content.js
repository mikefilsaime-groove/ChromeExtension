(function() {
  'use strict';

  const ALL_SPEEDS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 3.5, 4.0];
  const DEFAULT_PRESETS = [1.0, 1.5, 2.0, 3.0, 4.0];
  let PRESETS = [...DEFAULT_PRESETS];
  const controllers = new Map();
  let savedOffset = { x: 10, y: 10 };
  let positionRAF = null;
  let isMinimized = false;
  let preferredSpeed = 1.0;
  let customSpeeds = null;
  let storageLoaded = false;
  let pendingVideos = [];

  let dragState = {
    isDragging: false,
    currentContainer: null,
    currentVideo: null,
    startX: 0,
    startY: 0,
    initialLeft: 0,
    initialTop: 0
  };

  chrome.storage.sync.get(['controllerOffset', 'controllerPosition', 'isMinimized', 'preferredSpeed', 'customSpeeds'], (result) => {
    if (result.controllerOffset) {
      savedOffset = result.controllerOffset;
    } else if (result.controllerPosition) {
      savedOffset = { x: parseFloat(result.controllerPosition.left) || 10, y: parseFloat(result.controllerPosition.top) || 10 };
    }
    if (result.isMinimized !== undefined) {
      isMinimized = result.isMinimized;
    }
    if (result.preferredSpeed !== undefined) {
      preferredSpeed = result.preferredSpeed;
    }
    if (result.customSpeeds && result.customSpeeds.length > 0) {
      customSpeeds = result.customSpeeds;
      PRESETS = [...customSpeeds];
    }
    storageLoaded = true;

    pendingVideos.forEach(video => {
      createController(video);
    });
    pendingVideos = [];
  });

  function createController(video) {
    if (controllers.has(video)) {
      return;
    }

    if (!storageLoaded) {
      if (!pendingVideos.includes(video)) {
        pendingVideos.push(video);
      }
      return;
    }

    const container = document.createElement('div');
    container.className = 'vsp-controller';
    container.setAttribute('data-vsp-controller', 'true');

    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'vsp-buttons';

    const leftHandle = document.createElement('div');
    leftHandle.className = 'vsp-grab-handle vsp-grab-handle-left';
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('div');
      dot.className = 'vsp-grab-dot';
      leftHandle.appendChild(dot);
    }
    buttonsContainer.appendChild(leftHandle);

    PRESETS.forEach(speed => {
      const button = document.createElement('button');
      button.className = 'vsp-button';
      button.textContent = `${speed}x`;
      button.setAttribute('data-speed', speed);
      
      if (speed === 1.0 || speed === 2.0) {
        button.classList.add('vsp-prominent');
      }

      if (Math.abs(video.playbackRate - speed) < 0.01) {
        button.classList.add('vsp-active');
      }

      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setVideoSpeed(video, speed, container);
      });

      buttonsContainer.appendChild(button);
    });

    const currentSpeedDisplay = document.createElement('div');
    currentSpeedDisplay.className = 'vsp-current-speed';
    currentSpeedDisplay.textContent = `${video.playbackRate}x`;
    currentSpeedDisplay.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSpeedDial(container, video);
    });
    buttonsContainer.appendChild(currentSpeedDisplay);

    const settingsButton = document.createElement('button');
    settingsButton.className = 'vsp-settings-button';
    settingsButton.innerHTML = '⚙️';
    settingsButton.setAttribute('title', 'Customize Speed Presets');
    settingsButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openSettingsModal();
    });
    buttonsContainer.appendChild(settingsButton);

    const toggleButton = document.createElement('button');
    toggleButton.className = 'vsp-toggle-button';
    const toggleIcon = document.createElement('span');
    toggleIcon.className = 'vsp-toggle-icon';
    toggleButton.appendChild(toggleIcon);
    toggleButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMinimize(container);
    });
    buttonsContainer.appendChild(toggleButton);

    const rightHandle = document.createElement('div');
    rightHandle.className = 'vsp-grab-handle vsp-grab-handle-right';
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('div');
      dot.className = 'vsp-grab-dot';
      rightHandle.appendChild(dot);
    }
    buttonsContainer.appendChild(rightHandle);

    if (isMinimized) {
      container.classList.add('vsp-minimized');
    }

    container.appendChild(buttonsContainer);

    document.body.appendChild(container);
    updateControllerPosition(video, container);

    setupDraggable(container, video);
    setupVideoHover(video, container);

    controllers.set(video, container);

    if (!positionRAF) {
      startPositionLoop();
    }

    const ratechangeHandler = () => {
      updateActiveButton(container, video.playbackRate);
      updateCurrentSpeedDisplay(container, video.playbackRate);
    };
    video.addEventListener('ratechange', ratechangeHandler);
    container._ratechangeHandler = ratechangeHandler;

    if (preferredSpeed && preferredSpeed !== 1.0) {
      video.playbackRate = preferredSpeed;
      updateActiveButton(container, preferredSpeed);
      updateCurrentSpeedDisplay(container, preferredSpeed);
    }
  }

  function toggleMinimize(container) {
    isMinimized = !isMinimized;
    
    controllers.forEach((ctrl) => {
      if (isMinimized) {
        ctrl.classList.add('vsp-minimized');
      } else {
        ctrl.classList.remove('vsp-minimized');
      }
    });

    chrome.storage.sync.set({ isMinimized: isMinimized });
  }

  function openSettingsModal() {
    if (document.querySelector('.vsp-settings-modal')) return;

    const overlay = document.createElement('div');
    overlay.className = 'vsp-settings-overlay';

    const modal = document.createElement('div');
    modal.className = 'vsp-settings-modal';

    const title = document.createElement('h3');
    title.textContent = 'Customize Speed Presets';
    title.className = 'vsp-settings-title';
    modal.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.textContent = 'Select which speeds to show in the controller:';
    subtitle.className = 'vsp-settings-subtitle';
    modal.appendChild(subtitle);

    const checkboxContainer = document.createElement('div');
    checkboxContainer.className = 'vsp-checkbox-container';

    const selectedSpeeds = customSpeeds || [...DEFAULT_PRESETS];

    ALL_SPEEDS.forEach(speed => {
      const label = document.createElement('label');
      label.className = 'vsp-checkbox-label';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'vsp-checkbox';
      checkbox.value = speed;
      checkbox.checked = selectedSpeeds.includes(speed);

      const text = document.createElement('span');
      text.textContent = `${speed}x`;

      label.appendChild(checkbox);
      label.appendChild(text);
      checkboxContainer.appendChild(label);
    });

    modal.appendChild(checkboxContainer);

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'vsp-settings-buttons';

    const saveButton = document.createElement('button');
    saveButton.textContent = 'Save';
    saveButton.className = 'vsp-settings-save';
    saveButton.addEventListener('click', (e) => {
      e.stopPropagation();
      const checkboxes = modal.querySelectorAll('.vsp-checkbox');
      const newSpeeds = [];
      checkboxes.forEach(cb => {
        if (cb.checked) {
          newSpeeds.push(parseFloat(cb.value));
        }
      });

      if (newSpeeds.length === 0) {
        let warning = modal.querySelector('.vsp-settings-warning');
        if (!warning) {
          warning = document.createElement('div');
          warning.className = 'vsp-settings-warning';
          warning.textContent = 'Please select at least one speed.';
          buttonContainer.insertAdjacentElement('beforebegin', warning);
        }
        return;
      }

      newSpeeds.sort((a, b) => a - b);
      customSpeeds = newSpeeds;
      PRESETS = [...newSpeeds];
      chrome.storage.sync.set({ customSpeeds: newSpeeds });

      const controllersToRecreate = Array.from(controllers.entries());
      overlay.remove();
      
      controllersToRecreate.forEach(([video, container]) => {
        recreateController(video, container);
      });
    });

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.className = 'vsp-settings-cancel';
    cancelButton.addEventListener('click', (e) => {
      e.stopPropagation();
      overlay.remove();
    });

    buttonContainer.appendChild(saveButton);
    buttonContainer.appendChild(cancelButton);
    modal.appendChild(buttonContainer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });
  }

  function recreateController(video, oldContainer) {
    const wasVisible = oldContainer.classList.contains('vsp-visible');
    const wasMinimized = oldContainer.classList.contains('vsp-minimized');

    removeController(video);
    createController(video);

    const newContainer = controllers.get(video);
    if (newContainer) {
      if (wasVisible) {
        newContainer.classList.add('vsp-visible');
      }
      if (wasMinimized) {
        newContainer.classList.add('vsp-minimized');
      }
    }
  }

  function updateCurrentSpeedDisplay(container, speed) {
    const display = container.querySelector('.vsp-current-speed');
    if (display) {
      display.textContent = `${speed}x`;
    }
  }

  function toggleSpeedDial(container, video) {
    let dial = container.querySelector('.vsp-speed-dial');
    
    if (dial) {
      dial.remove();
      return;
    }

    const currentSpeed = video.playbackRate;
    const currentIndex = PRESETS.findIndex(speed => Math.abs(speed - currentSpeed) < 0.01);
    
    if (currentIndex === -1) return;

    dial = document.createElement('div');
    dial.className = 'vsp-speed-dial';

    PRESETS.forEach(speed => {
      const isCurrent = Math.abs(speed - currentSpeed) < 0.01;
      const option = createDialOption(speed, isCurrent, video, container);
      dial.appendChild(option);
    });

    container.appendChild(dial);

    document.addEventListener('click', function closeDialOutside(e) {
      if (!dial.contains(e.target) && !e.target.closest('.vsp-current-speed')) {
        dial.remove();
        document.removeEventListener('click', closeDialOutside);
      }
    });
  }

  function createDialOption(speed, isCurrent, video, container) {
    const option = document.createElement('button');
    option.className = 'vsp-dial-option';
    option.textContent = `${speed}x`;
    
    if (isCurrent) {
      option.classList.add('vsp-dial-current');
    }

    option.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (!isCurrent) {
        setVideoSpeed(video, speed, container);
      }
      
      const dial = container.querySelector('.vsp-speed-dial');
      if (dial) {
        dial.remove();
      }
    });

    return option;
  }

  function updateControllerPosition(video, container) {
    if (dragState.isDragging && dragState.currentContainer === container) return;
    const videoRect = video.getBoundingClientRect();
    const newLeft = videoRect.left + savedOffset.x;
    const newTop = videoRect.top + savedOffset.y;
    if (container._lastLeft !== newLeft || container._lastTop !== newTop) {
      container.style.left = `${newLeft}px`;
      container.style.top = `${newTop}px`;
      container._lastLeft = newLeft;
      container._lastTop = newTop;
    }
  }

  function startPositionLoop() {
    function update() {
      controllers.forEach((container, video) => {
        if (document.contains(video)) {
          updateControllerPosition(video, container);
        }
      });
      positionRAF = requestAnimationFrame(update);
    }
    positionRAF = requestAnimationFrame(update);
  }

  const globalHoverState = {
    mouseMoveListener: null,
    lastMouseX: 0,
    lastMouseY: 0,
    lastMoveTime: Date.now(),
    refCount: 0
  };

  function setupVideoHover(video, container) {
    let checkInterval = null;
    let outsideCount = 0;
    let wasHiddenByIdle = false;
    const OUTSIDE_THRESHOLD = 3;

    if (globalHoverState.refCount === 0) {
      globalHoverState.mouseMoveListener = (e) => {
        globalHoverState.lastMouseX = e.clientX;
        globalHoverState.lastMouseY = e.clientY;
        globalHoverState.lastMoveTime = Date.now();
      };
      document.addEventListener('mousemove', globalHoverState.mouseMoveListener, { passive: true });
    }
    globalHoverState.refCount++;

    const isInHoverZone = (x, y) => {
      const videoRect = video.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      
      const minX = Math.min(videoRect.left, containerRect.left);
      const minY = Math.min(videoRect.top, containerRect.top);
      const maxX = Math.max(videoRect.right, containerRect.right);
      const maxY = Math.max(videoRect.bottom, containerRect.bottom);
      
      return x >= minX && x <= maxX && y >= minY && y <= maxY;
    };

    const startChecking = () => {
      if (checkInterval) return;
      
      container.classList.add('vsp-visible');
      wasHiddenByIdle = false;
      outsideCount = 0;
      
      checkInterval = setInterval(() => {
        if (dragState.isDragging) {
          outsideCount = 0;
          return;
        }
        
        const inZone = isInHoverZone(globalHoverState.lastMouseX, globalHoverState.lastMouseY);
        const idleTime = Date.now() - globalHoverState.lastMoveTime;
        const isIdle = idleTime > 2500;

        if (!inZone) {
          outsideCount++;
          if (outsideCount >= OUTSIDE_THRESHOLD) {
            stopChecking(false);
          }
        } else if (isIdle) {
          stopChecking(true);
        } else {
          outsideCount = 0;
          if (wasHiddenByIdle && container.classList.contains('vsp-visible') === false) {
            startChecking();
          }
        }
      }, 50);
    };

    const stopChecking = (hiddenByIdle) => {
      if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
      }
      outsideCount = 0;
      wasHiddenByIdle = hiddenByIdle;
      container.classList.remove('vsp-visible');
      
      if (hiddenByIdle) {
        setTimeout(() => {
          const inZone = isInHoverZone(globalHoverState.lastMouseX, globalHoverState.lastMouseY);
          const idleTime = Date.now() - globalHoverState.lastMoveTime;
          const isStillIdle = idleTime > 2500;
          
          if (inZone && !isStillIdle) {
            startChecking();
          } else if (inZone) {
            stopChecking(true);
          }
        }, 100);
      }
    };

    video.addEventListener('mouseenter', startChecking);
    container.addEventListener('mouseenter', startChecking);
  }

  function setupDraggable(container, video) {
    container.addEventListener('mousedown', (e) => {
      if (e.target.closest('.vsp-button') ||
          e.target.closest('.vsp-toggle-button') ||
          e.target.closest('.vsp-settings-button') ||
          e.target.closest('.vsp-current-speed')) {
        return;
      }

      dragState.isDragging = true;
      dragState.currentContainer = container;
      dragState.currentVideo = video;
      dragState.startX = e.clientX;
      dragState.startY = e.clientY;
      dragState.initialLeft = savedOffset.x;
      dragState.initialTop = savedOffset.y;

      container.classList.add('vsp-dragging');
      e.preventDefault();
    });
  }

  function handleMouseMove(e) {
    if (!dragState.isDragging || !dragState.currentContainer || !dragState.currentVideo) return;

    const deltaX = e.clientX - dragState.startX;
    const deltaY = e.clientY - dragState.startY;

    let newOffsetX = dragState.initialLeft + deltaX;
    let newOffsetY = dragState.initialTop + deltaY;

    const video = dragState.currentVideo;
    const container = dragState.currentContainer;
    const videoRect = video.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    const MARGIN = 10;
    const maxOffsetX = videoRect.width - containerRect.width - MARGIN;
    const maxOffsetY = videoRect.height - containerRect.height - MARGIN;

    newOffsetX = Math.max(MARGIN, Math.min(newOffsetX, maxOffsetX));
    newOffsetY = Math.max(MARGIN, Math.min(newOffsetY, maxOffsetY));

    savedOffset.x = newOffsetX;
    savedOffset.y = newOffsetY;

    container.style.left = `${videoRect.left + newOffsetX}px`;
    container.style.top = `${videoRect.top + newOffsetY}px`;
  }

  function handleMouseUp() {
    if (dragState.isDragging && dragState.currentContainer) {
      dragState.currentContainer.classList.remove('vsp-dragging');

      chrome.storage.sync.set({ controllerOffset: { x: savedOffset.x, y: savedOffset.y } });

      dragState.isDragging = false;
      dragState.currentContainer = null;
      dragState.currentVideo = null;
    }
  }

  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);

  function setVideoSpeed(video, speed, container) {
    video.playbackRate = speed;
    updateActiveButton(container, speed);
    showSpeedOSD(video, speed);

    preferredSpeed = speed;
    chrome.storage.sync.set({ preferredSpeed: speed });
  }

  let osdTimeout = null;
  let osdElement = null;

  function showSpeedOSD(video, speed) {
    if (osdElement) {
      osdElement.remove();
      clearTimeout(osdTimeout);
    }

    osdElement = document.createElement('div');
    osdElement.className = 'vsp-osd';
    osdElement.textContent = `${speed}x`;

    const appendTarget = document.fullscreenElement || document.body;
    appendTarget.appendChild(osdElement);

    const videoRect = video.getBoundingClientRect();
    osdElement.style.left = `${videoRect.left + videoRect.width / 2}px`;
    osdElement.style.top = `${videoRect.top + videoRect.height / 2}px`;

    osdTimeout = setTimeout(() => {
      if (osdElement) {
        osdElement.classList.add('vsp-osd-fade');
        setTimeout(() => {
          if (osdElement) {
            osdElement.remove();
            osdElement = null;
          }
        }, 300);
      }
    }, 500);
  }

  function updateActiveButton(container, currentSpeed) {
    const buttons = container.querySelectorAll('.vsp-button');
    buttons.forEach(button => {
      const speed = parseFloat(button.getAttribute('data-speed'));
      if (Math.abs(speed - currentSpeed) < 0.01) {
        button.classList.add('vsp-active');
      } else {
        button.classList.remove('vsp-active');
      }
    });
  }

  function removeController(video) {
    const controller = controllers.get(video);
    if (!controller) return;

    if (controller._ratechangeHandler) {
      video.removeEventListener('ratechange', controller._ratechangeHandler);
    }

    if (controller.parentElement) {
      controller.remove();
    }
    controllers.delete(video);

    globalHoverState.refCount--;
    if (globalHoverState.refCount <= 0 && globalHoverState.mouseMoveListener) {
      document.removeEventListener('mousemove', globalHoverState.mouseMoveListener);
      globalHoverState.mouseMoveListener = null;
      globalHoverState.refCount = 0;
    }
  }

  function scanForVideos() {
    const videos = document.querySelectorAll('video');
    
    videos.forEach(video => {
      if (video.readyState >= 1 && !controllers.has(video)) {
        createController(video);
      } else if (!controllers.has(video)) {
        video.addEventListener('loadedmetadata', () => {
          createController(video);
        }, { once: true });
      }
    });

    controllers.forEach((controller, video) => {
      if (!document.contains(video)) {
        removeController(video);
      }
    });
  }

  const observer = new MutationObserver(() => {
    try {
      scanForVideos();
    } catch (e) {
      console.warn('VSP: Error scanning for videos:', e);
    }
  });

  function startObserver() {
    try {
      observer.disconnect();
    } catch (e) {
      // Ignore disconnect errors
    }

    try {
      if (document.documentElement) {
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true
        });
      } else {
        setTimeout(startObserver, 100);
      }
    } catch (e) {
      console.warn('VSP: Failed to start observer, retrying...', e);
      setTimeout(startObserver, 100);
    }
  }

  // Keyboard shortcuts
  function handleKeyDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' ||
        e.target.isContentEditable || e.target.closest('[contenteditable="true"]')) {
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;

    const key = e.key.toLowerCase();
    if (key !== 's' && key !== 'd' && key !== 'r') return;

    let targetVideo = null;
    let targetContainer = null;
    controllers.forEach((container, video) => {
      if (!targetVideo && document.contains(video)) {
        targetVideo = video;
        targetContainer = container;
      }
    });
    if (!targetVideo || !targetContainer) return;

    e.preventDefault();

    if (key === 'r') {
      setVideoSpeed(targetVideo, 1.0, targetContainer);
      return;
    }

    const currentSpeed = targetVideo.playbackRate;

    if (e.shiftKey) {
      const step = key === 'd' ? 0.25 : -0.25;
      const newSpeed = Math.round((currentSpeed + step) * 100) / 100;
      const clamped = Math.max(0.25, Math.min(4.0, newSpeed));
      if (Math.abs(clamped - currentSpeed) > 0.01) {
        setVideoSpeed(targetVideo, clamped, targetContainer);
      }
      return;
    }

    const sortedSpeeds = [...PRESETS].sort((a, b) => a - b);

    if (key === 'd') {
      const nextSpeed = sortedSpeeds.find(s => s > currentSpeed + 0.01);
      if (nextSpeed) {
        setVideoSpeed(targetVideo, nextSpeed, targetContainer);
      }
    } else if (key === 's') {
      const prevSpeed = sortedSpeeds.slice().reverse().find(s => s < currentSpeed - 0.01);
      if (prevSpeed) {
        setVideoSpeed(targetVideo, prevSpeed, targetContainer);
      }
    }
  }

  document.addEventListener('keydown', handleKeyDown);

  // Fullscreen support
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
      controllers.forEach((container, video) => {
        if (document.fullscreenElement.contains(video) || document.fullscreenElement === video) {
          document.fullscreenElement.appendChild(container);
        }
      });
    } else {
      controllers.forEach((container) => {
        if (container.parentElement !== document.body) {
          document.body.appendChild(container);
        }
      });
    }
  });

  // Message listener for popup communication
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'setSpeed') {
      controllers.forEach((container, video) => {
        if (document.contains(video)) {
          setVideoSpeed(video, message.speed, container);
        }
      });
      sendResponse({ success: true });
    } else if (message.action === 'getSpeed') {
      let speed = preferredSpeed;
      controllers.forEach((container, video) => {
        if (document.contains(video)) {
          speed = video.playbackRate;
        }
      });
      sendResponse({ speed: speed });
    } else if (message.action === 'setMinimized') {
      isMinimized = message.isMinimized;
      controllers.forEach((ctrl) => {
        if (isMinimized) {
          ctrl.classList.add('vsp-minimized');
        } else {
          ctrl.classList.remove('vsp-minimized');
        }
      });
      sendResponse({ success: true });
    }
    return true;
  });

  startObserver();
  scanForVideos();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      startObserver();
      scanForVideos();
    });
  }
})();
