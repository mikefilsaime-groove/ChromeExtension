(function() {
  'use strict';

  const PRESETS = [1.0, 1.5, 2.0, 3.0, 4.0];
  const controllers = new Map();
  let savedPosition = null;
  let isMinimized = false;
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

  chrome.storage.sync.get(['controllerPosition', 'isMinimized'], (result) => {
    if (result.controllerPosition) {
      savedPosition = result.controllerPosition;
    }
    if (result.isMinimized !== undefined) {
      isMinimized = result.isMinimized;
    }
    storageLoaded = true;
    
    controllers.forEach((container, video) => {
      if (savedPosition) {
        container.style.top = savedPosition.top;
        container.style.left = savedPosition.left;
      }
    });
    
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
    buttonsContainer.appendChild(currentSpeedDisplay);

    const toggleButton = document.createElement('button');
    toggleButton.className = 'vsp-toggle-button';
    toggleButton.innerHTML = '<span class="vsp-toggle-icon">⋯</span>';
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

    const parent = video.parentElement;
    if (parent) {
      const style = window.getComputedStyle(parent);
      if (style.position === 'static') {
        parent.style.position = 'relative';
      }
      parent.insertBefore(container, video);
    }

    if (savedPosition) {
      container.style.top = savedPosition.top;
      container.style.left = savedPosition.left;
    }

    setupDraggable(container, video);
    setupVideoHover(video, container);

    controllers.set(video, container);

    video.addEventListener('ratechange', () => {
      updateActiveButton(container, video.playbackRate);
      updateCurrentSpeedDisplay(container, video.playbackRate);
    });
  }

  function toggleMinimize(container) {
    isMinimized = !isMinimized;
    
    if (isMinimized) {
      container.classList.add('vsp-minimized');
    } else {
      container.classList.remove('vsp-minimized');
    }

    chrome.storage.sync.set({ isMinimized: isMinimized });
  }

  function updateCurrentSpeedDisplay(container, speed) {
    const display = container.querySelector('.vsp-current-speed');
    if (display) {
      display.textContent = `${speed}x`;
    }
  }

  const globalHoverState = {
    mouseMoveListener: null,
    lastMouseX: 0,
    lastMouseY: 0,
    refCount: 0
  };

  function setupVideoHover(video, container) {
    let checkInterval = null;
    let outsideCount = 0;
    const OUTSIDE_THRESHOLD = 3;

    if (globalHoverState.refCount === 0) {
      globalHoverState.mouseMoveListener = (e) => {
        globalHoverState.lastMouseX = e.clientX;
        globalHoverState.lastMouseY = e.clientY;
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
      outsideCount = 0;
      
      checkInterval = setInterval(() => {
        if (dragState.isDragging) {
          outsideCount = 0;
          return;
        }
        
        const inZone = isInHoverZone(globalHoverState.lastMouseX, globalHoverState.lastMouseY);

        if (!inZone) {
          outsideCount++;
          if (outsideCount >= OUTSIDE_THRESHOLD) {
            stopChecking();
          }
        } else {
          outsideCount = 0;
        }
      }, 50);
    };

    const stopChecking = () => {
      if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
      }
      outsideCount = 0;
      container.classList.remove('vsp-visible');
    };

    video.addEventListener('mouseenter', startChecking);
    container.addEventListener('mouseenter', startChecking);
  }

  function setupDraggable(container, video) {
    container.addEventListener('mousedown', (e) => {
      if (e.target.closest('.vsp-button')) {
        return;
      }

      dragState.isDragging = true;
      dragState.currentContainer = container;
      dragState.currentVideo = video;
      dragState.startX = e.clientX;
      dragState.startY = e.clientY;
      
      dragState.initialLeft = container.offsetLeft;
      dragState.initialTop = container.offsetTop;

      container.classList.add('vsp-dragging');
      e.preventDefault();
    });
  }

  function handleMouseMove(e) {
    if (!dragState.isDragging || !dragState.currentContainer || !dragState.currentVideo) return;

    const deltaX = e.clientX - dragState.startX;
    const deltaY = e.clientY - dragState.startY;

    let newLeft = dragState.initialLeft + deltaX;
    let newTop = dragState.initialTop + deltaY;

    const container = dragState.currentContainer;
    const video = dragState.currentVideo;
    const parent = container.offsetParent;

    if (parent && video) {
      const containerRect = container.getBoundingClientRect();
      const videoRect = video.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      
      const videoLeftInParent = videoRect.left - parentRect.left - parent.clientLeft + parent.scrollLeft;
      const videoTopInParent = videoRect.top - parentRect.top - parent.clientTop + parent.scrollTop;
      
      const MARGIN = 10;
      const minLeft = videoLeftInParent + MARGIN;
      const minTop = videoTopInParent + MARGIN;
      const maxLeft = videoLeftInParent + videoRect.width - containerRect.width - MARGIN;
      const maxTop = videoTopInParent + videoRect.height - containerRect.height - MARGIN;

      newLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));
      newTop = Math.max(minTop, Math.min(newTop, maxTop));
    }

    dragState.currentContainer.style.left = `${newLeft}px`;
    dragState.currentContainer.style.top = `${newTop}px`;
  }

  function handleMouseUp() {
    if (dragState.isDragging && dragState.currentContainer) {
      dragState.currentContainer.classList.remove('vsp-dragging');

      const position = {
        top: dragState.currentContainer.style.top,
        left: dragState.currentContainer.style.left
      };
      
      savedPosition = position;
      chrome.storage.sync.set({ controllerPosition: position });

      const container = dragState.currentContainer;
      dragState.isDragging = false;
      dragState.currentContainer = null;
      dragState.currentVideo = null;

      const rect = container.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const elementUnderCursor = document.elementFromPoint(x, y);
      
      if (!container.contains(elementUnderCursor) && 
          (!elementUnderCursor || !elementUnderCursor.closest('video'))) {
        container.classList.remove('vsp-visible');
      }
    }
  }

  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);

  function setVideoSpeed(video, speed, container) {
    video.playbackRate = speed;
    updateActiveButton(container, speed);
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
    if (controller && controller.parentElement) {
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
    scanForVideos();
  });

  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  scanForVideos();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanForVideos);
  }
})();
