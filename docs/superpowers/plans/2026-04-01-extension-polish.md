# Video Speed Presets — Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add keyboard shortcuts, fullscreen support, speed-change OSD, fix memory leak, replace alert() with inline warning, clean up dead code, redesign the extension icon, and add a toolbar popup UI.

**Architecture:** Core changes are in the existing `content.js` + `styles.css`. New files: `popup.html`, `popup.css`, `popup.js` for the toolbar popup, and new SVG/PNG icon files. A background service worker (`background.js`) handles message passing between popup and content script. Keyboard shortcuts use a `keydown` listener that skips input/textarea elements. Fullscreen support listens for `fullscreenchange` and re-parents the controller. The OSD is a simple div appended to body with a CSS fade animation.

**Tech Stack:** Vanilla JS, CSS, Chrome Extension Manifest V3, Chrome Storage API

---

### Task 1: Fix memory leak — clean up ratechange listener

**Files:**
- Modify: `extension/content.js:155-170` (controllers.set and ratechange area)
- Modify: `extension/content.js:577-590` (removeController function)

**Context:** Currently `createController` adds a `ratechange` event listener to the video element at line 161 but `removeController` never removes it. On SPAs like YouTube where video elements are frequently swapped, this leaks listeners on detached DOM nodes.

- [ ] **Step 1: Store the ratechange handler reference when creating it**

In `createController`, right before `controllers.set(video, container)` at line 155, change the ratechange listener setup from:

```js
    video.addEventListener('ratechange', () => {
      updateActiveButton(container, video.playbackRate);
      updateCurrentSpeedDisplay(container, video.playbackRate);
    });
```

to:

```js
    const ratechangeHandler = () => {
      updateActiveButton(container, video.playbackRate);
      updateCurrentSpeedDisplay(container, video.playbackRate);
    };
    video.addEventListener('ratechange', ratechangeHandler);

    controllers.set(video, { container, ratechangeHandler });
```

- [ ] **Step 2: Update all `controllers.get` and `controllers.forEach` call sites**

The `controllers` Map currently stores `Map<video, container>`. After this change it stores `Map<video, { container, ratechangeHandler }>`. Update every reference:

In `createController` at line 51 (the `controllers.has(video)` check) — no change needed, `.has()` still works.

In `toggleMinimize` (line 173), change:
```js
    controllers.forEach((ctrl) => {
```
to:
```js
    controllers.forEach(({ container: ctrl }) => {
```

In `recreateController` (line 287), change:
```js
  function recreateController(video, oldContainer) {
    const wasVisible = oldContainer.classList.contains('vsp-visible');
    const wasMinimized = oldContainer.classList.contains('vsp-minimized');

    removeController(video);
    createController(video);

    const newContainer = controllers.get(video);
    if (newContainer) {
```
to:
```js
  function recreateController(video, oldEntry) {
    const wasVisible = oldEntry.container.classList.contains('vsp-visible');
    const wasMinimized = oldEntry.container.classList.contains('vsp-minimized');

    removeController(video);
    createController(video);

    const newEntry = controllers.get(video);
    if (newEntry) {
```
And update the references inside that function from `newContainer` to `newEntry.container`.

In `removeController` (line 577), change:
```js
  function removeController(video) {
    const controller = controllers.get(video);
    if (controller && controller.parentElement) {
      controller.remove();
    }
    controllers.delete(video);
```
to:
```js
  function removeController(video) {
    const entry = controllers.get(video);
    if (!entry) return;
    
    video.removeEventListener('ratechange', entry.ratechangeHandler);
    
    if (entry.container && entry.container.parentElement) {
      entry.container.remove();
    }
    controllers.delete(video);
```

In `startPositionLoop` (line 383), change:
```js
      controllers.forEach((container, video) => {
        if (document.contains(video)) {
          updateControllerPosition(video, container);
        }
      });
```
to:
```js
      controllers.forEach(({ container }, video) => {
        if (document.contains(video)) {
          updateControllerPosition(video, container);
        }
      });
```

In `scanForVideos` (line 592), change:
```js
    controllers.forEach((controller, video) => {
      if (!document.contains(video)) {
        removeController(video);
      }
    });
```
to:
```js
    controllers.forEach((entry, video) => {
      if (!document.contains(video)) {
        removeController(video);
      }
    });
```

In the storage callback (line 26 area), the old `controllers.forEach` that applied saved position is already removed — no change needed.

- [ ] **Step 3: Test manually**

Load the extension on test.html. Verify:
1. Speed buttons still work (click each one)
2. Speed display updates correctly
3. Open Chrome DevTools > Performance > Heap snapshot before and after navigating between videos — confirm no growth in detached event listeners

- [ ] **Step 4: Commit**

```bash
git add extension/content.js
git commit -m "Fix ratechange listener memory leak on video element cleanup"
```

---

### Task 2: Remove dead dropup code

**Files:**
- Modify: `extension/styles.css:272-290` (dropup CSS)
- Modify: `extension/content.js` (no JS changes needed — the dropup logic was already removed in the speed dial fix)

**Context:** The `.vsp-dial-dropup` CSS class and `vsp-dial-appear-up` animation are never applied since the speed dial rewrite removed the directional logic. Clean them up.

- [ ] **Step 1: Remove dead CSS**

Delete these blocks from `styles.css`:

```css
.vsp-speed-dial.vsp-dial-dropup {
  top: auto;
  bottom: 100%;
  margin-top: 0;
  margin-bottom: 4px;
  animation: vsp-dial-appear-up 0.15s ease-out;
}

@keyframes vsp-dial-appear-up {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add extension/styles.css
git commit -m "Remove unused dropup CSS from speed dial"
```

---

### Task 3: Replace alert() with inline styled warning

**Files:**
- Modify: `extension/content.js` (openSettingsModal function, around line 247)
- Modify: `extension/styles.css` (add warning toast styles)

**Context:** The settings modal uses native `alert('Please select at least one speed preset.')` which is visually jarring against the dark-themed modal. Replace with an inline warning message styled consistently with the modal.

- [ ] **Step 1: Replace alert() with inline warning element**

In `openSettingsModal`, find the save button click handler. Change:

```js
      if (newSpeeds.length === 0) {
        alert('Please select at least one speed preset.');
        return;
      }
```

to:

```js
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
```

- [ ] **Step 2: Add warning CSS**

Add to end of `styles.css`:

```css
.vsp-settings-warning {
  background: rgba(255, 100, 100, 0.15);
  border: 1px solid rgba(255, 100, 100, 0.4);
  color: rgba(255, 150, 150, 1);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 12px;
  text-align: center;
  animation: vsp-fade-in 0.2s ease;
}
```

- [ ] **Step 3: Test manually**

Open settings modal, uncheck all speeds, click Save. Verify:
1. Red warning appears inline above the buttons
2. No native alert dialog
3. Warning disappears if you check a speed and save successfully

- [ ] **Step 4: Commit**

```bash
git add extension/content.js extension/styles.css
git commit -m "Replace native alert with inline styled warning in settings modal"
```

---

### Task 4: Add keyboard shortcuts

**Files:**
- Modify: `extension/content.js` (add keydown listener + helper functions)
- Modify: `extension/styles.css` (add OSD styles — combined with Task 5 since OSD is triggered by keyboard too)

**Context:** Add `S` to decrease speed, `D` to increase speed, and `R` to reset to 1.0x. These step through the PRESETS array. Skip the handler when focus is in an input, textarea, or contenteditable element to avoid hijacking typing.

- [ ] **Step 1: Add the keyboard shortcut handler**

Add this function and listener at the bottom of `content.js`, right before `startObserver();` (around line 640):

```js
  function handleKeyDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || 
        e.target.isContentEditable || e.target.closest('[contenteditable="true"]')) {
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;

    const key = e.key.toLowerCase();
    if (key !== 's' && key !== 'd' && key !== 'r') return;

    // Find the first visible video with a controller
    let targetVideo = null;
    let targetEntry = null;
    controllers.forEach((entry, video) => {
      if (!targetVideo && document.contains(video)) {
        targetVideo = video;
        targetEntry = entry;
      }
    });
    if (!targetVideo || !targetEntry) return;

    e.preventDefault();

    if (key === 'r') {
      setVideoSpeed(targetVideo, 1.0, targetEntry.container);
      return;
    }

    const currentSpeed = targetVideo.playbackRate;
    const sortedSpeeds = [...PRESETS].sort((a, b) => a - b);

    if (key === 'd') {
      const nextSpeed = sortedSpeeds.find(s => s > currentSpeed + 0.01);
      if (nextSpeed) {
        setVideoSpeed(targetVideo, nextSpeed, targetEntry.container);
      }
    } else if (key === 's') {
      const prevSpeed = sortedSpeeds.slice().reverse().find(s => s < currentSpeed - 0.01);
      if (prevSpeed) {
        setVideoSpeed(targetVideo, prevSpeed, targetEntry.container);
      }
    }
  }

  document.addEventListener('keydown', handleKeyDown);
```

- [ ] **Step 2: Test manually**

Load extension on test.html. Start the video. Verify:
1. Press `D` — speed increases to next preset
2. Press `S` — speed decreases to previous preset
3. Press `R` — speed resets to 1.0x
4. Click in a text input on the page, press `S`/`D` — nothing happens (typing works normally)
5. Press `Ctrl+D` — nothing happens (browser bookmark shortcut works)

- [ ] **Step 3: Commit**

```bash
git add extension/content.js
git commit -m "Add keyboard shortcuts: S (slower), D (faster), R (reset to 1x)"
```

---

### Task 5: Add speed change OSD (on-screen display)

**Files:**
- Modify: `extension/content.js` (modify `setVideoSpeed` to show OSD)
- Modify: `extension/styles.css` (add OSD styles)

**Context:** When the playback speed changes, show a large centered "2.0x" indicator on the video that fades out after 800ms. This gives immediate visual feedback, especially useful when using keyboard shortcuts while watching the video (not looking at the controller).

- [ ] **Step 1: Add the OSD display function**

Add this function in `content.js`, right after the `setVideoSpeed` function (around line 563):

```js
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
    document.body.appendChild(osdElement);

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
```

- [ ] **Step 2: Call showSpeedOSD from setVideoSpeed**

Modify `setVideoSpeed` to call the OSD:

```js
  function setVideoSpeed(video, speed, container) {
    video.playbackRate = speed;
    updateActiveButton(container, speed);
    showSpeedOSD(video, speed);
    
    preferredSpeed = speed;
    chrome.storage.sync.set({ preferredSpeed: speed });
  }
```

- [ ] **Step 3: Add OSD CSS**

Add to end of `styles.css`:

```css
.vsp-osd {
  position: fixed;
  z-index: 2147483647;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.7);
  color: #ffffff;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
  font-size: 36px;
  font-weight: 700;
  padding: 12px 24px;
  border-radius: 10px;
  pointer-events: none;
  opacity: 1;
  transition: opacity 0.3s ease;
}

.vsp-osd-fade {
  opacity: 0;
}
```

- [ ] **Step 4: Test manually**

1. Click a speed button — verify centered "2.0x" (or whichever speed) flashes on the video and fades
2. Press `D` key — verify OSD shows the new speed
3. Rapidly press `D` multiple times — verify OSD updates (doesn't stack multiple)
4. Verify OSD disappears cleanly after ~800ms

- [ ] **Step 5: Commit**

```bash
git add extension/content.js extension/styles.css
git commit -m "Add on-screen speed display that flashes on speed change"
```

---

### Task 6: Add fullscreen support

**Files:**
- Modify: `extension/content.js` (add fullscreenchange listener, modify position loop)

**Context:** With `position: fixed` on `document.body`, the controller disappears when a video enters fullscreen because fullscreen creates a new top-layer stacking context. We need to detect fullscreen and re-parent the controller into `document.fullscreenElement`, then move it back to body on exit.

- [ ] **Step 1: Add fullscreen change handler**

Add this right before the `startObserver();` call (and after the keyboard handler):

```js
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
      // Move controllers into fullscreen element
      controllers.forEach(({ container }, video) => {
        if (document.fullscreenElement.contains(video) || document.fullscreenElement === video) {
          document.fullscreenElement.appendChild(container);
        }
      });
    } else {
      // Move all controllers back to body
      controllers.forEach(({ container }) => {
        if (container.parentElement !== document.body) {
          document.body.appendChild(container);
        }
      });
    }
  });
```

- [ ] **Step 2: Update OSD to also work in fullscreen**

In `showSpeedOSD`, change the append target:

```js
    const appendTarget = document.fullscreenElement || document.body;
    appendTarget.appendChild(osdElement);
```

- [ ] **Step 3: Test manually**

1. Open test.html or YouTube, enter fullscreen on a video
2. Hover over video — controller should appear
3. Click speed buttons — should work and OSD should show
4. Press `D`/`S` keys — should work
5. Exit fullscreen — controller should return to normal behavior

- [ ] **Step 4: Commit**

```bash
git add extension/content.js
git commit -m "Add fullscreen support by re-parenting controller into fullscreen element"
```

---

### Task 7: Add incremental speed control via keyboard

**Files:**
- Modify: `extension/content.js` (extend handleKeyDown)

**Context:** In addition to `S`/`D` stepping through presets, add `Shift+S` / `Shift+D` for fine-grained 0.25x increments. This lets the user fine-tune beyond their presets when needed.

- [ ] **Step 1: Extend handleKeyDown for shift+key**

In the `handleKeyDown` function, modify the block after `e.preventDefault()`:

```js
    if (key === 'r') {
      setVideoSpeed(targetVideo, 1.0, targetEntry.container);
      return;
    }

    const currentSpeed = targetVideo.playbackRate;

    if (e.shiftKey) {
      // Fine-grained: 0.25x increments, clamped to 0.25–4.0
      const step = key === 'd' ? 0.25 : -0.25;
      const newSpeed = Math.round((currentSpeed + step) * 100) / 100;
      const clamped = Math.max(0.25, Math.min(4.0, newSpeed));
      if (Math.abs(clamped - currentSpeed) > 0.01) {
        setVideoSpeed(targetVideo, clamped, targetEntry.container);
      }
      return;
    }

    const sortedSpeeds = [...PRESETS].sort((a, b) => a - b);

    if (key === 'd') {
      const nextSpeed = sortedSpeeds.find(s => s > currentSpeed + 0.01);
      if (nextSpeed) {
        setVideoSpeed(targetVideo, nextSpeed, targetEntry.container);
      }
    } else if (key === 's') {
      const prevSpeed = sortedSpeeds.slice().reverse().find(s => s < currentSpeed - 0.01);
      if (prevSpeed) {
        setVideoSpeed(targetVideo, prevSpeed, targetEntry.container);
      }
    }
```

- [ ] **Step 2: Test manually**

1. Press `Shift+D` — speed increases by 0.25x (e.g., 1.0 -> 1.25)
2. Press `Shift+S` — speed decreases by 0.25x
3. Press `Shift+D` repeatedly until 4.0x — verify it stops at 4.0x
4. Press `Shift+S` repeatedly until 0.25x — verify it stops at 0.25x
5. OSD should show the incremental speed value

- [ ] **Step 3: Commit**

```bash
git add extension/content.js
git commit -m "Add Shift+S/D for fine-grained 0.25x speed increments"
```

---

### Task 8: Redesign extension icon

**Files:**
- Create: `extension/icon.svg` (source SVG)
- Create: `extension/icon16.png` (toolbar icon)
- Create: `extension/icon48.png` (extensions page icon)
- Create: `extension/icon128.png` (Chrome Web Store / install icon)
- Modify: `extension/manifest.json` (update icon references if paths change)

**Context:** The current icon is generic and low quality. Create a custom icon: YouTube red (#FF0000) color scheme, representing video speed. Design concept: a rounded-corner play triangle with horizontal speed/motion lines, suggesting fast playback. Must be crisp at 16px.

- [ ] **Step 1: Create the SVG icon**

Create `extension/icon.svg` with a design that features:
- YouTube red (#FF0000) as the primary fill color
- A white play triangle as the central element
- 2-3 horizontal speed lines trailing behind the triangle to suggest motion/speed
- Clean geometry that reads well at 16x16

The SVG should use a 128x128 viewBox for maximum detail:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <!-- Red rounded square background -->
  <rect x="4" y="4" width="120" height="120" rx="24" ry="24" fill="#FF0000"/>
  
  <!-- Speed lines (white, behind the play triangle) -->
  <rect x="20" y="38" width="28" height="4" rx="2" fill="rgba(255,255,255,0.5)"/>
  <rect x="14" y="56" width="34" height="5" rx="2.5" fill="rgba(255,255,255,0.7)"/>
  <rect x="14" y="68" width="34" height="5" rx="2.5" fill="rgba(255,255,255,0.7)"/>
  <rect x="20" y="86" width="28" height="4" rx="2" fill="rgba(255,255,255,0.5)"/>
  
  <!-- Play triangle -->
  <polygon points="52,30 104,64 52,98" fill="#FFFFFF"/>
</svg>
```

- [ ] **Step 2: Generate PNG icons from the SVG**

Use a canvas-based HTML converter or the `sips` command (macOS built-in) to generate PNGs:

```bash
# macOS: use sips to convert SVG to PNGs (if supported), or use qlmanage
# Alternative: create a tiny Node script or use the browser

# If sips doesn't handle SVG, create PNGs using rsvg-convert or a quick script
```

If CLI tools aren't available, create a small helper script `generate-icons.html` that loads the SVG into a canvas and exports PNGs at 16, 48, and 128px. Then download them.

Alternatively, since this is a personal extension, use the SVG directly — modern Chrome supports SVG in `action.default_icon`. But for `icons` in manifest, PNGs are required. The simplest approach: write the PNG files directly as base64-decoded content using a small Node script.

- [ ] **Step 3: Update manifest.json if needed**

The icon file names (`icon16.png`, `icon48.png`, `icon128.png`) match the existing manifest references, so no manifest changes needed unless file names change. Add the popup action reference (handled in Task 9).

- [ ] **Step 4: Delete old icon files and verify**

Remove the old icon PNGs and replace with the new ones. Reload the extension in `chrome://extensions` and verify:
1. Extension icon in toolbar shows the new YouTube-red speed icon
2. Icon is crisp and recognizable at toolbar size
3. Icon looks good on the extensions management page

- [ ] **Step 5: Commit**

```bash
git add extension/icon.svg extension/icon16.png extension/icon48.png extension/icon128.png
git commit -m "Redesign extension icon with YouTube-red speed motif"
```

---

### Task 9: Add toolbar popup UI

**Files:**
- Create: `extension/popup.html`
- Create: `extension/popup.css`
- Create: `extension/popup.js`
- Create: `extension/background.js`
- Modify: `extension/manifest.json` (add action.default_popup, background service worker)
- Modify: `extension/content.js` (add message listener for popup commands)

**Context:** Add a popup that appears when clicking the extension icon in the toolbar. It shows the current speed, preset buttons, and quick settings toggles. Communicates with the content script via Chrome messaging (popup -> background -> content script).

- [ ] **Step 1: Update manifest.json**

Add the `action` and `background` fields to `manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "Video Speed Presets",
  "version": "1.8.0",
  "description": "Control HTML5 video playback speed with simple preset buttons",
  "permissions": [
    "activeTab",
    "storage"
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icon16.png",
      "48": "icon48.png",
      "128": "icon128.png"
    }
  },
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "css": ["styles.css"],
      "run_at": "document_end",
      "all_frames": true
    }
  ],
  "icons": {
    "16": "icon16.png",
    "48": "icon48.png",
    "128": "icon128.png"
  }
}
```

- [ ] **Step 2: Create background.js**

A minimal service worker that relays messages between popup and content script:

```js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === 'content') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, message, sendResponse);
      }
    });
    return true;
  }
});
```

- [ ] **Step 3: Create popup.html**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="vsp-popup">
    <div class="vsp-popup-header">
      <div class="vsp-popup-title">Video Speed</div>
      <div class="vsp-popup-current" id="currentSpeed">1.0x</div>
    </div>

    <div class="vsp-popup-speeds" id="speedButtons"></div>

    <div class="vsp-popup-divider"></div>

    <div class="vsp-popup-section">
      <div class="vsp-popup-toggle">
        <span>Compact Mode</span>
        <label class="vsp-switch">
          <input type="checkbox" id="compactToggle">
          <span class="vsp-slider"></span>
        </label>
      </div>
    </div>

    <div class="vsp-popup-divider"></div>

    <div class="vsp-popup-section vsp-popup-shortcuts">
      <div class="vsp-popup-shortcut-title">Keyboard Shortcuts</div>
      <div class="vsp-popup-shortcut"><kbd>S</kbd> Slower</div>
      <div class="vsp-popup-shortcut"><kbd>D</kbd> Faster</div>
      <div class="vsp-popup-shortcut"><kbd>R</kbd> Reset 1x</div>
      <div class="vsp-popup-shortcut"><kbd>Shift+S/D</kbd> Fine tune</div>
    </div>
  </div>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create popup.css**

Style the popup with a dark theme matching the in-video controller aesthetic. Width: 240px. Consistent with the glassmorphism style.

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  width: 240px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
  background: #1a1a1a;
  color: #ffffff;
}

.vsp-popup {
  padding: 16px;
}

.vsp-popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.vsp-popup-title {
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.vsp-popup-current {
  font-size: 18px;
  font-weight: 700;
  color: rgb(100, 150, 255);
}

.vsp-popup-speeds {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
  gap: 6px;
  margin-bottom: 4px;
}

.vsp-popup-speed-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #ffffff;
  padding: 8px 4px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: center;
  transition: all 0.15s ease;
}

.vsp-popup-speed-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.3);
}

.vsp-popup-speed-btn.active {
  background: rgba(100, 150, 255, 0.9);
  border-color: rgba(120, 170, 255, 1);
  font-weight: 600;
}

.vsp-popup-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 12px 0;
}

.vsp-popup-section {
  margin-bottom: 2px;
}

.vsp-popup-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
}

.vsp-switch {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
}

.vsp-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.vsp-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  transition: 0.2s;
}

.vsp-slider::before {
  content: "";
  position: absolute;
  height: 14px;
  width: 14px;
  left: 3px;
  bottom: 3px;
  background: white;
  border-radius: 50%;
  transition: 0.2s;
}

.vsp-switch input:checked + .vsp-slider {
  background: rgba(100, 150, 255, 0.9);
}

.vsp-switch input:checked + .vsp-slider::before {
  transform: translateX(16px);
}

.vsp-popup-shortcuts {
  padding-top: 2px;
}

.vsp-popup-shortcut-title {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.vsp-popup-shortcut {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

kbd {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 3px;
  padding: 1px 5px;
  font-family: inherit;
  font-size: 11px;
  min-width: 22px;
  text-align: center;
}
```

- [ ] **Step 5: Create popup.js**

```js
document.addEventListener('DOMContentLoaded', () => {
  const speedButtonsContainer = document.getElementById('speedButtons');
  const currentSpeedDisplay = document.getElementById('currentSpeed');
  const compactToggle = document.getElementById('compactToggle');

  const ALL_SPEEDS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 3.5, 4.0];
  const DEFAULT_PRESETS = [1.0, 1.5, 2.0, 3.0, 4.0];

  let currentSpeed = 1.0;
  let presets = DEFAULT_PRESETS;

  // Load state from storage
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
```

- [ ] **Step 6: Add message listener in content.js**

Add this at the bottom of `content.js`, right before `startObserver();`:

```js
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'setSpeed') {
      controllers.forEach(({ container }, video) => {
        if (document.contains(video)) {
          setVideoSpeed(video, message.speed, container);
        }
      });
      sendResponse({ success: true });
    } else if (message.action === 'getSpeed') {
      let speed = preferredSpeed;
      controllers.forEach(({ container }, video) => {
        if (document.contains(video)) {
          speed = video.playbackRate;
        }
      });
      sendResponse({ speed: speed });
    } else if (message.action === 'setMinimized') {
      isMinimized = message.isMinimized;
      controllers.forEach(({ container: ctrl }) => {
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
```

- [ ] **Step 7: Test manually**

1. Reload extension in `chrome://extensions`
2. Click extension icon — popup should appear with dark theme
3. Speed buttons should show current presets with active highlight
4. Click a speed in popup — video speed should change, OSD should flash
5. Toggle "Compact Mode" — controller on video should minimize/expand
6. Open popup on a page with no video — should still show (just can't change speed)
7. Keyboard shortcuts reference should display correctly

- [ ] **Step 8: Commit**

```bash
git add extension/popup.html extension/popup.css extension/popup.js extension/background.js extension/manifest.json extension/content.js
git commit -m "Add toolbar popup with speed controls, compact toggle, and shortcut reference"
```
