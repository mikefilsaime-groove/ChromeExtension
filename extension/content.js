(function() {
  'use strict';

  const PRESETS = [1.0, 1.5, 2.0, 3.0, 4.0];
  const controllers = new Map();
  let savedPosition = null;

  chrome.storage.sync.get(['controllerPosition'], (result) => {
    if (result.controllerPosition) {
      savedPosition = result.controllerPosition;
    }
  });

  function createController(video) {
    if (controllers.has(video)) {
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
      container.style.right = 'auto';
      container.style.bottom = 'auto';
    }

    makeDraggable(container);

    controllers.set(video, container);

    video.addEventListener('ratechange', () => {
      updateActiveButton(container, video.playbackRate);
    });
  }

  function makeDraggable(container) {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    container.addEventListener('mousedown', (e) => {
      if (e.target.closest('.vsp-button')) {
        return;
      }

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      
      const rect = container.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      container.classList.add('vsp-dragging');
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      const newLeft = initialLeft + deltaX;
      const newTop = initialTop + deltaY;

      container.style.left = `${newLeft}px`;
      container.style.top = `${newTop}px`;
      container.style.right = 'auto';
      container.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        container.classList.remove('vsp-dragging');

        const position = {
          top: container.style.top,
          left: container.style.left
        };
        
        savedPosition = position;
        chrome.storage.sync.set({ controllerPosition: position });
      }
    });
  }

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
