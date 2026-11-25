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
  let activeVideo = null;
  let scanScheduled = false;
  let settingsOpen = false;
  const videosAwaitingMetadata = new WeakSet();

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

  // Every piece of UI lives in its own shadow root. Page styles cannot reach
  // into a shadow root, so the UI looks the same on every site.
  function createShadowMount(kind) {
    const host = document.createElement('div');
    host.setAttribute(`data-vsp-${kind}`, 'true');
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = VSP_STYLES;
    root.appendChild(style);
    return { host, root };
  }

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

    const { host, root } = createShadowMount('controller');

    const container = document.createElement('div');
    container.className = 'vsp-controller';
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', 'Video speed');
    container._host = host;

    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'vsp-buttons';

    const leftHandle = document.createElement('div');
    leftHandle.className = 'vsp-grab-handle vsp-grab-handle-left';
    leftHandle.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('div');
      dot.className = 'vsp-grab-dot';
      leftHandle.appendChild(dot);
    }
    buttonsContainer.appendChild(leftHandle);

    PRESETS.forEach(speed => {
      const button = document.createElement('button');
      button.type = 'button';
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

    const currentSpeedDisplay = document.createElement('button');
    currentSpeedDisplay.type = 'button';
    currentSpeedDisplay.className = 'vsp-current-speed';
    currentSpeedDisplay.textContent = `${video.playbackRate}x`;
    currentSpeedDisplay.setAttribute('title', 'Choose speed');
    currentSpeedDisplay.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSpeedDial(container, video);
    });
    buttonsContainer.appendChild(currentSpeedDisplay);

    const settingsButton = document.createElement('button');
    settingsButton.type = 'button';
    settingsButton.className = 'vsp-settings-button';
    settingsButton.innerHTML = '⚙️';
    settingsButton.setAttribute('title', 'Customize Speed Presets');
    settingsButton.setAttribute('aria-label', 'Customize speed presets');
    settingsButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openSettingsModal(video);
    });
    buttonsContainer.appendChild(settingsButton);

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'vsp-toggle-button';
    const toggleIcon = document.createElement('span');
    toggleIcon.className = 'vsp-toggle-icon';
    toggleIcon.setAttribute('aria-hidden', 'true');
    toggleButton.appendChild(toggleIcon);
    toggleButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMinimize(container);
    });
    buttonsContainer.appendChild(toggleButton);

    const rightHandle = document.createElement('div');
    rightHandle.className = 'vsp-grab-handle vsp-grab-handle-right';
    rightHandle.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('div');
      dot.className = 'vsp-grab-dot';
      rightHandle.appendChild(dot);
    }
    buttonsContainer.appendChild(rightHandle);

    container.appendChild(buttonsContainer);
    root.appendChild(container);
    applyMinimizedState(container);

    document.body.appendChild(host);
    updateControllerPosition(video, container);

    setupDraggable(container, video);
    container._cleanupHover = setupVideoHover(video, container);
    container._resizeObserver = new ResizeObserver(() => schedulePositionUpdate());
    container._resizeObserver.observe(video);

    controllers.set(video, container);

    schedulePositionUpdate();

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

  function applyMinimizedState(container) {
    container.classList.toggle('vsp-minimized', isMinimized);
    const toggleButton = container.querySelector('.vsp-toggle-button');
    if (toggleButton) {
      const label = isMinimized ? 'Show all speed buttons' : 'Switch to compact mode';
      toggleButton.setAttribute('aria-label', label);
      toggleButton.setAttribute('title', label);
    }
  }

  function toggleMinimize() {
    isMinimized = !isMinimized;
    controllers.forEach((container) => applyMinimizedState(container));
    chrome.storage.sync.set({ isMinimized: isMinimized });
  }

  function openSettingsModal(openerVideo) {
    if (settingsOpen) return;
    settingsOpen = true;

    const { host, root } = createShadowMount('settings');

    const overlay = document.createElement('div');
    overlay.className = 'vsp-settings-overlay';

    const modal = document.createElement('div');
    modal.className = 'vsp-settings-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'vsp-settings-title');

    const title = document.createElement('h3');
    title.textContent = 'Customize Speed Presets';
    title.className = 'vsp-settings-title';
    title.id = 'vsp-settings-title';
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
    saveButton.type = 'button';
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
          warning.setAttribute('role', 'alert');
          warning.textContent = 'Please select at least one speed.';
          buttonContainer.insertAdjacentElement('beforebegin', warning);
        }
        return;
      }

      newSpeeds.sort((a, b) => a - b);
      customSpeeds = newSpeeds;
      PRESETS = [...newSpeeds];
      chrome.storage.sync.set({ customSpeeds: newSpeeds });

      // Build each controller again with the new preset buttons.
      Array.from(controllers.keys()).forEach(video => {
        removeController(video);
        createController(video);
      });
      closeSettingsModal();
    });

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancel';
    cancelButton.className = 'vsp-settings-cancel';
    cancelButton.addEventListener('click', (e) => {
      e.stopPropagation();
      closeSettingsModal();
    });

    buttonContainer.appendChild(saveButton);
    buttonContainer.appendChild(cancelButton);
    modal.appendChild(buttonContainer);

    overlay.appendChild(modal);
    root.appendChild(overlay);
    document.body.appendChild(host);

    const closeSettingsModal = () => {
      if (!settingsOpen) return;
      settingsOpen = false;
      window.removeEventListener('keydown', handleModalKeyDown, true);
      window.removeEventListener('keyup', keepKeyInDialog, true);
      window.removeEventListener('keypress', keepKeyInDialog, true);
      host.remove();

      // Show the controller again and give focus back to its gear button.
      // A hidden controller cannot take focus.
      const container = controllers.get(openerVideo);
      if (container && openerVideo.isConnected) {
        container._showController();
        const gear = container.querySelector('.vsp-settings-button');
        if (gear) {
          gear.focus({ preventScroll: true });
        }
      }
    };

    // Keys belong to the dialog while it is open: Escape closes it, Tab stays
    // inside it, and no key reaches the shortcuts of the page or of this
    // extension.
    const handleModalKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeSettingsModal();
        return;
      }
      if (e.key === 'Tab') {
        const items = Array.from(modal.querySelectorAll('input, button'));
        const first = items[0];
        const last = items[items.length - 1];
        const active = root.activeElement;
        if (!modal.contains(active)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
      keepKeyInDialog(e);
    };
    const keepKeyInDialog = (e) => {
      if (e.composedPath().includes(host)) {
        e.stopPropagation();
      }
    };

    window.addEventListener('keydown', handleModalKeyDown, true);
    window.addEventListener('keyup', keepKeyInDialog, true);
    window.addEventListener('keypress', keepKeyInDialog, true);
    saveButton.focus();

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeSettingsModal();
      }
    });
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
    option.type = 'button';
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
    container._videoHasSize = videoRect.width >= 1 && videoRect.height >= 1;
    const newLeft = videoRect.left + savedOffset.x;
    const newTop = videoRect.top + savedOffset.y;
    if (container._lastLeft !== newLeft || container._lastTop !== newTop) {
      container.style.left = `${newLeft}px`;
      container.style.top = `${newTop}px`;
      container._lastLeft = newLeft;
      container._lastTop = newTop;
    }
  }

  function schedulePositionUpdate() {
    if (positionRAF) return;

    positionRAF = requestAnimationFrame(() => {
      positionRAF = null;
      controllers.forEach((container, video) => {
        if (document.contains(video)) {
          updateControllerPosition(video, container);
        }
      });
    });
  }

  window.addEventListener('resize', schedulePositionUpdate, { passive: true });
  window.addEventListener('scroll', schedulePositionUpdate, { passive: true, capture: true });

  function setupVideoHover(video, container) {
    let hideTimeout = null;
    const LEAVE_DELAY = 180;
    const IDLE_DELAY = 2500;

    const markActive = (e) => {
      activeVideo = video;
    };

    const clearHideTimeout = () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
    };

    const hideController = () => {
      hideTimeout = null;
      if (!dragState.isDragging || dragState.currentContainer !== container) {
        container.classList.remove('vsp-visible');
      }
    };

    const showController = (e) => {
      markActive(e);
      clearHideTimeout();
      container.classList.add('vsp-visible');
      hideTimeout = setTimeout(hideController, IDLE_DELAY);
    };

    const hideAfterPointerLeaves = () => {
      clearHideTimeout();
      hideTimeout = setTimeout(() => {
        hideTimeout = null;
        if (!video.matches(':hover') && !container.matches(':hover')) {
          hideController();
        }
      }, LEAVE_DELAY);
    };

    video.addEventListener('pointerenter', showController, { passive: true });
    video.addEventListener('pointermove', showController, { passive: true });
    video.addEventListener('pointerdown', showController, { passive: true });
    video.addEventListener('pointerleave', hideAfterPointerLeaves, { passive: true });
    container.addEventListener('pointerenter', showController, { passive: true });
    container.addEventListener('pointermove', showController, { passive: true });
    container.addEventListener('pointerleave', hideAfterPointerLeaves, { passive: true });
    container._showController = showController;

    return () => {
      clearHideTimeout();
      video.removeEventListener('pointerenter', showController);
      video.removeEventListener('pointermove', showController);
      video.removeEventListener('pointerdown', showController);
      video.removeEventListener('pointerleave', hideAfterPointerLeaves);
      container.removeEventListener('pointerenter', showController);
      container.removeEventListener('pointermove', showController);
      container.removeEventListener('pointerleave', hideAfterPointerLeaves);
    };
  }

  // A hidden controller gets no pointer events, so it cannot take clicks
  // from the page. Some players put a layer on top of the video, and then
  // the video gets no pointer events either. For those players, the pointer
  // on the place of a hidden controller shows it. This uses the position
  // that updateControllerPosition saved, and a video with no size (for
  // example display: none) has no place for a controller.
  function revealControllerUnderPointer(e) {
    if (settingsOpen || dragState.isDragging) return;
    controllers.forEach((container) => {
      if (!container._videoHasSize || container.classList.contains('vsp-visible')) return;
      const left = container._lastLeft;
      const top = container._lastTop;
      if (e.clientX < left || e.clientY < top) return;
      if (e.clientX <= left + container.offsetWidth && e.clientY <= top + container.offsetHeight) {
        container._showController();
      }
    });
  }

  window.addEventListener('pointermove', revealControllerUnderPointer, { capture: true, passive: true });

  function setupDraggable(container, video) {
    container.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
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

      activeVideo = video;
      container.classList.add('vsp-dragging');
      try {
        container.setPointerCapture?.(e.pointerId);
      } catch (err) {
        // The pointer is no longer active. The drag still works without capture.
      }
      e.preventDefault();
    });
  }

  function handlePointerMove(e) {
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

  function handlePointerUp() {
    if (dragState.isDragging && dragState.currentContainer) {
      const container = dragState.currentContainer;
      container.classList.remove('vsp-dragging');

      chrome.storage.sync.set({ controllerOffset: { x: savedOffset.x, y: savedOffset.y } });

      dragState.isDragging = false;
      dragState.currentContainer = null;
      dragState.currentVideo = null;

      if (!container.matches(':hover')) {
        container.classList.remove('vsp-visible');
      }
    }
  }

  document.addEventListener('pointermove', handlePointerMove);
  document.addEventListener('pointerup', handlePointerUp);
  document.addEventListener('pointercancel', handlePointerUp);

  function setVideoSpeed(video, speed, container) {
    activeVideo = video;
    video.playbackRate = speed;
    updateActiveButton(container, speed);
    showSpeedOSD(video, speed);

    preferredSpeed = speed;
    chrome.storage.sync.set({ preferredSpeed: speed });
  }

  let osdTimeout = null;
  let osdHost = null;

  function removeSpeedOSD() {
    clearTimeout(osdTimeout);
    osdTimeout = null;
    if (osdHost) {
      osdHost.remove();
      osdHost = null;
    }
  }

  function showSpeedOSD(video, speed) {
    removeSpeedOSD();

    const { host, root } = createShadowMount('osd');
    const osdElement = document.createElement('div');
    osdElement.className = 'vsp-osd';
    osdElement.textContent = `${speed}x`;
    root.appendChild(osdElement);
    osdHost = host;

    const appendTarget = document.fullscreenElement || document.body;
    appendTarget.appendChild(host);

    const videoRect = video.getBoundingClientRect();
    osdElement.style.left = `${videoRect.left + videoRect.width / 2}px`;
    osdElement.style.top = `${videoRect.top + videoRect.height / 2}px`;

    osdTimeout = setTimeout(() => {
      osdElement.classList.add('vsp-osd-fade');
      osdTimeout = setTimeout(removeSpeedOSD, 300);
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
    if (controller._cleanupHover) {
      controller._cleanupHover();
    }
    if (controller._resizeObserver) {
      controller._resizeObserver.disconnect();
    }

    controller._host.remove();
    controllers.delete(video);

    if (activeVideo === video) activeVideo = null;
  }

  function scanForVideos() {
    const videos = document.querySelectorAll('video');
    
    videos.forEach(video => {
      if (video.readyState >= 1 && !controllers.has(video)) {
        createController(video);
      } else if (!controllers.has(video) && !videosAwaitingMetadata.has(video)) {
        videosAwaitingMetadata.add(video);
        video.addEventListener('loadedmetadata', () => {
          videosAwaitingMetadata.delete(video);
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
    scheduleVideoScan();
  });

  function scheduleVideoScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      try {
        scanForVideos();
      } catch (e) {
        console.warn('VSP: Error scanning for videos:', e);
      }
    });
  }

  function getTargetController() {
    if (activeVideo && controllers.has(activeVideo) && document.contains(activeVideo)) {
      return { video: activeVideo, container: controllers.get(activeVideo) };
    }

    for (const [video, container] of controllers) {
      if (document.contains(video) && container.classList.contains('vsp-visible')) {
        return { video, container };
      }
    }

    for (const [video, container] of controllers) {
      if (document.contains(video)) return { video, container };
    }
    return null;
  }

  function cleanUp() {
    try {
      observer.disconnect();
      if (positionRAF) cancelAnimationFrame(positionRAF);
      controllers.forEach((container, video) => removeController(video));
    } catch (e) {
      // The document may already be unloading.
    }
  }

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

    const target = getTargetController();
    if (!target) return;
    const { video: targetVideo, container: targetContainer } = target;

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
          document.fullscreenElement.appendChild(container._host);
        }
      });
    } else {
      controllers.forEach((container) => {
        if (container._host.parentElement !== document.body) {
          document.body.appendChild(container._host);
        }
      });
    }
    schedulePositionUpdate();
  });

  // Message listener for popup communication
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'setSpeed') {
      const target = getTargetController();
      if (target) setVideoSpeed(target.video, message.speed, target.container);
      sendResponse({ success: true, appliedToVideo: Boolean(target) });
    } else if (message.action === 'getSpeed') {
      const target = getTargetController();
      sendResponse({
        speed: target ? target.video.playbackRate : preferredSpeed,
        hasVideo: Boolean(target)
      });
    } else if (message.action === 'setMinimized') {
      isMinimized = message.isMinimized;
      controllers.forEach((container) => applyMinimizedState(container));
      sendResponse({ success: true });
    }
    return true;
  });

  startObserver();
  scanForVideos();
  window.addEventListener('pagehide', cleanUp, { once: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      startObserver();
      scanForVideos();
    });
  }
})();
