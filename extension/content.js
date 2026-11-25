(function() {
  'use strict';

  const ALL_SPEEDS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 3.5, 4.0];
  const DEFAULT_PRESETS = [1.0, 1.5, 2.0, 3.0, 4.0];
  const IDLE_HIDE_MS = 2500;
  const LEAVE_HIDE_MS = 150;

  let PRESETS = [...DEFAULT_PRESETS];
  // video element -> controller element (the .vsp-controller in a shadow root)
  const controllers = new Map();
  let savedOffset = { x: 10, y: 10 };
  let positionRAF = null;
  let isMinimized = false;
  let preferredSpeed = 1.0;
  let customSpeeds = null;
  let storageLoaded = false;
  let pendingVideos = [];
  let settingsOpen = false;

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

  function createGrabHandle(side) {
    const handle = document.createElement('div');
    handle.className = `vsp-grab-handle vsp-grab-handle-${side}`;
    handle.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('div');
      dot.className = 'vsp-grab-dot';
      handle.appendChild(dot);
    }
    return handle;
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
    container._state = {
      engaged: false,   // the pointer came onto this video and has not left it
      visible: false,
      lastActive: 0,
      idleTimer: null,
      leaveTimer: null
    };

    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'vsp-buttons';

    buttonsContainer.appendChild(createGrabHandle('left'));

    PRESETS.forEach(speed => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'vsp-button';
      button.textContent = `${speed}x`;
      button.setAttribute('data-speed', speed);

      if (speed === 1.0 || speed === 2.0) {
        button.classList.add('vsp-prominent');
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
    currentSpeedDisplay.setAttribute('aria-haspopup', 'true');
    currentSpeedDisplay.setAttribute('aria-expanded', 'false');
    currentSpeedDisplay.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSpeedDial(container, video);
    });
    buttonsContainer.appendChild(currentSpeedDisplay);

    const settingsButton = document.createElement('button');
    settingsButton.type = 'button';
    settingsButton.className = 'vsp-settings-button';
    settingsButton.textContent = '⚙️';
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

    buttonsContainer.appendChild(createGrabHandle('right'));

    container.appendChild(buttonsContainer);
    root.appendChild(container);
    applyMinimizedState(container);
    updateActiveButton(container, video.playbackRate);

    document.body.appendChild(host);
    updateControllerPosition(video, container);

    setupDraggable(container, video);

    controllers.set(video, container);

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
    if (!isMinimized) {
      closeSpeedDial(container);
    }
  }

  function toggleMinimize() {
    isMinimized = !isMinimized;
    controllers.forEach(applyMinimizedState);
    chrome.storage.sync.set({ isMinimized: isMinimized });
  }

  function openSettingsModal(openerVideo) {
    if (settingsOpen) return;
    settingsOpen = true;
    controllers.forEach(hideController);

    const { host, root } = createShadowMount('settings');

    const overlay = document.createElement('div');
    overlay.className = 'vsp-settings-overlay';

    const modal = document.createElement('div');
    modal.className = 'vsp-settings-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'vsp-settings-title');

    const title = document.createElement('h3');
    title.id = 'vsp-settings-title';
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

    const focusableElements = () => Array.from(modal.querySelectorAll('input, button'));

    // Keys belong to the dialog while it is open: Escape closes it, Tab stays
    // inside it, and no key reaches the shortcuts of the page or of this
    // extension.
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
      if (e.key === 'Tab') {
        const items = focusableElements();
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

    const close = () => {
      if (!settingsOpen) return;
      settingsOpen = false;
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', keepKeyInDialog, true);
      window.removeEventListener('keypress', keepKeyInDialog, true);
      host.remove();

      // Show the controller again and give focus back to its gear button.
      const container = controllers.get(openerVideo);
      if (container && openerVideo.isConnected) {
        container._state.engaged = true;
        showController(openerVideo, container);
        const gear = container.querySelector('.vsp-settings-button');
        if (gear) {
          gear.focus({ preventScroll: true });
        }
      }
    };

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
      close();
    });

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancel';
    cancelButton.className = 'vsp-settings-cancel';
    cancelButton.addEventListener('click', (e) => {
      e.stopPropagation();
      close();
    });

    buttonContainer.appendChild(saveButton);
    buttonContainer.appendChild(cancelButton);
    modal.appendChild(buttonContainer);

    overlay.appendChild(modal);
    root.appendChild(overlay);
    document.body.appendChild(host);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        close();
      }
    });

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', keepKeyInDialog, true);
    window.addEventListener('keypress', keepKeyInDialog, true);

    focusableElements()[0].focus({ preventScroll: true });
  }

  function updateCurrentSpeedDisplay(container, speed) {
    const display = container.querySelector('.vsp-current-speed');
    if (display) {
      display.textContent = `${speed}x`;
    }
  }

  function closeSpeedDial(container) {
    const dial = container.querySelector('.vsp-speed-dial');
    if (dial) {
      dial.remove();
    }
    if (container._dialOutsideHandler) {
      document.removeEventListener('click', container._dialOutsideHandler);
      container._dialOutsideHandler = null;
    }
    const display = container.querySelector('.vsp-current-speed');
    if (display) {
      display.setAttribute('aria-expanded', 'false');
    }
  }

  function toggleSpeedDial(container, video) {
    if (container.querySelector('.vsp-speed-dial')) {
      closeSpeedDial(container);
      return;
    }

    const currentSpeed = video.playbackRate;
    const currentIndex = PRESETS.findIndex(speed => Math.abs(speed - currentSpeed) < 0.01);

    if (currentIndex === -1) return;

    const dial = document.createElement('div');
    dial.className = 'vsp-speed-dial';

    PRESETS.forEach(speed => {
      const isCurrent = Math.abs(speed - currentSpeed) < 0.01;
      const option = createDialOption(speed, isCurrent, video, container);
      dial.appendChild(option);
    });

    container.appendChild(dial);

    const display = container.querySelector('.vsp-current-speed');
    display.setAttribute('aria-expanded', 'true');

    // A click outside the list closes it. Clicks inside a shadow root show
    // the host as their target, so look at the full path of the event.
    container._dialOutsideHandler = (e) => {
      const path = e.composedPath();
      if (!path.includes(dial) && !path.includes(display)) {
        closeSpeedDial(container);
      }
    };
    document.addEventListener('click', container._dialOutsideHandler);
  }

  function createDialOption(speed, isCurrent, video, container) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'vsp-dial-option';
    option.textContent = `${speed}x`;

    if (isCurrent) {
      option.classList.add('vsp-dial-current');
      option.setAttribute('aria-current', 'true');
    }

    option.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!isCurrent) {
        setVideoSpeed(video, speed, container);
      }

      closeSpeedDial(container);
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

  // Keeps visible controllers on their videos while the page scrolls or
  // changes layout. The loop stops when no controller is visible.
  function startPositionLoop() {
    if (positionRAF) return;
    function update() {
      let anyVisible = false;
      controllers.forEach((container, video) => {
        if (container._state.visible && video.isConnected) {
          anyVisible = true;
          updateControllerPosition(video, container);
        }
      });
      positionRAF = anyVisible ? requestAnimationFrame(update) : null;
    }
    positionRAF = requestAnimationFrame(update);
  }

  // ---- Show and hide ----
  //
  // All of this runs from mousemove events. When the pointer does not move,
  // the only thing left is one timer that hides the controller.

  function onPointerMove(e) {
    if (controllers.size === 0) return;
    const x = e.clientX;
    const y = e.clientY;
    const path = e.composedPath();

    controllers.forEach((container, video) => {
      const state = container._state;

      if (settingsOpen || !video.isConnected) {
        state.engaged = false;
        hideController(container);
        return;
      }

      if (dragState.isDragging && dragState.currentContainer === container) {
        showController(video, container);
        return;
      }

      const videoRect = video.getBoundingClientRect();

      // A video with no size (display: none, or not laid out) has no place
      // for a controller.
      if (videoRect.width < 1 || videoRect.height < 1) {
        state.engaged = false;
        hideController(container);
        return;
      }

      const inVideo = x >= videoRect.left && x <= videoRect.right &&
                      y >= videoRect.top && y <= videoRect.bottom;

      const left = videoRect.left + savedOffset.x;
      const top = videoRect.top + savedOffset.y;
      const inController = x >= left && x <= left + container.offsetWidth &&
                           y >= top && y <= top + container.offsetHeight;

      // The pointer comes onto the video when the video is the target of
      // the event. Some players put a layer on top of the video, so the
      // video is never the target: the pointer on the place of the
      // controller also counts.
      if (!state.engaged && (path.includes(video) || inController)) {
        state.engaged = true;
      }
      if (!state.engaged) return;

      if (inVideo || inController) {
        showController(video, container);
      } else if (!state.leaveTimer) {
        state.leaveTimer = setTimeout(() => {
          state.leaveTimer = null;
          state.engaged = false;
          hideController(container);
        }, LEAVE_HIDE_MS);
      }
    });
  }

  function showController(video, container) {
    const state = container._state;
    state.lastActive = Date.now();

    if (state.leaveTimer) {
      clearTimeout(state.leaveTimer);
      state.leaveTimer = null;
    }
    if (!state.idleTimer) {
      state.idleTimer = setTimeout(() => onIdleTimer(container), IDLE_HIDE_MS);
    }
    if (!state.visible) {
      state.visible = true;
      updateControllerPosition(video, container);
      container.classList.add('vsp-visible');
      startPositionLoop();
    }
  }

  function onIdleTimer(container) {
    const state = container._state;
    state.idleTimer = null;
    const dragging = dragState.isDragging && dragState.currentContainer === container;
    const remaining = dragging ? IDLE_HIDE_MS : IDLE_HIDE_MS - (Date.now() - state.lastActive);
    if (remaining > 0) {
      state.idleTimer = setTimeout(() => onIdleTimer(container), remaining);
    } else {
      hideController(container);
    }
  }

  function hideController(container) {
    const state = container._state;
    if (state.idleTimer) {
      clearTimeout(state.idleTimer);
      state.idleTimer = null;
    }
    if (state.leaveTimer) {
      clearTimeout(state.leaveTimer);
      state.leaveTimer = null;
    }
    if (!state.visible) return;
    state.visible = false;
    container.classList.remove('vsp-visible');
    closeSpeedDial(container);
  }

  function setupDraggable(container, video) {
    container.addEventListener('mousedown', (e) => {
      if (e.target.closest('.vsp-button') ||
          e.target.closest('.vsp-toggle-button') ||
          e.target.closest('.vsp-settings-button') ||
          e.target.closest('.vsp-current-speed') ||
          e.target.closest('.vsp-speed-dial')) {
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

  function handleDragMove(e) {
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

  // Capture phase, so a page that stops these events cannot break the
  // controller.
  window.addEventListener('mousemove', (e) => {
    handleDragMove(e);
    onPointerMove(e);
  }, { capture: true, passive: true });
  window.addEventListener('mouseup', handleMouseUp, true);

  function setVideoSpeed(video, speed, container) {
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
      const isActive = Math.abs(speed - currentSpeed) < 0.01;
      button.classList.toggle('vsp-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function removeController(video) {
    const controller = controllers.get(video);
    if (!controller) return;

    hideController(controller);
    closeSpeedDial(controller);

    if (controller._ratechangeHandler) {
      video.removeEventListener('ratechange', controller._ratechangeHandler);
    }
    if (dragState.currentContainer === controller) {
      dragState.isDragging = false;
      dragState.currentContainer = null;
      dragState.currentVideo = null;
    }

    controller._host.remove();
    controllers.delete(video);
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
      controllers.forEach(applyMinimizedState);
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
