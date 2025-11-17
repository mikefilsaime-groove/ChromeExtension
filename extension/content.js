(function() {
  'use strict';

  const PRESETS = [1.0, 1.5, 2.0, 3.0, 4.0];
  const controllers = new Map();
  let savedPosition = null;
  let storageLoaded = false;
  let pendingVideos = [];

  let dragState = {
    isDragging: false,
    currentContainer: null,
    startX: 0,
    startY: 0,
    initialLeft: 0,
    initialTop: 0
  };

  chrome.storage.sync.get(['controllerPosition'], (result) => {
    if (result.controllerPosition) {
      savedPosition = result.controllerPosition;
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

    setupDraggable(container);

    controllers.set(video, container);

    video.addEventListener('ratechange', () => {
      updateActiveButton(container, video.playbackRate);
    });
  }

  function setupDraggable(container) {
    container.addEventListener('mousedown', (e) => {
      if (e.target.closest('.vsp-button')) {
        return;
      }

      dragState.isDragging = true;
      dragState.currentContainer = container;
      dragState.startX = e.clientX;
      dragState.startY = e.clientY;
      
      dragState.initialLeft = container.offsetLeft;
      dragState.initialTop = container.offsetTop;

      container.classList.add('vsp-dragging');
      e.preventDefault();
    });
  }

  function handleMouseMove(e) {
    if (!dragState.isDragging || !dragState.currentContainer) return;

    const deltaX = e.clientX - dragState.startX;
    const deltaY = e.clientY - dragState.startY;

    const newLeft = dragState.initialLeft + deltaX;
    const newTop = dragState.initialTop + deltaY;

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

      dragState.isDragging = false;
      dragState.currentContainer = null;
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
