# Video Speed Presets - Chrome Extension

## Overview

Video Speed Presets is a Chrome extension that provides a simple overlay interface for controlling HTML5 video playback speed across any website. The extension automatically detects video elements on web pages and injects a clean, minimalist speed controller with preset buttons (1.0x, 1.5x, 2.0x, 3.0x, 4.0x) in the top-left corner of videos. It's designed to work universally across platforms like YouTube, Netflix, Vimeo, and any other site using HTML5 video players.

## Recent Changes

**November 17, 2025**: Minimize/maximize toggle (v1.4.0)
- Added minimize/maximize toggle button to reduce screen clutter
- Toggle button appears only on hover (like grab handles) for cleaner interface
- When maximized: shows all speed preset buttons with inward arrows (← →) minimize icon
- When minimized: shows only current speed (e.g., "2.0x") with outward arrows (→ ←) maximize icon
- Icons use horizontal arrows similar to YouTube's fullscreen controls for intuitive UX
- State persists across all videos using Chrome storage
- Clicking toggle updates all controllers on the page simultaneously
- Current speed display updates in real-time with playback rate changes

**November 17, 2025**: Visual grab handles (v1.3.2)
- Added subtle grab handles on left and right sides of controller
- Handles appear when hovering over the controller
- Provides clear visual indication that the controller is draggable
- Three-dot design that fades in smoothly without interfering with functionality

**November 17, 2025**: Hover stability fix (v1.3.1)
- Fixed critical bug where controller would disappear when trying to hover over it on some YouTube videos
- Implemented bounding-box hover zone that encompasses both video and controller
- Controller stays visible when traversing YouTube overlays between video and controller
- Uses continuous polling (50ms) with 3-poll grace period (150ms total) before hiding
- Properly manages global mousemove listener with reference counting to prevent memory leaks

**November 17, 2025**: Drag boundary constraints (v1.3.0)
- Fixed critical bug where controller could be dragged outside video and get lost
- Controller now constrained to stay within video bounds with 10px margin on all edges
- Prevents controller from being positioned where user can't find it
- Accounts for parent padding, borders, and scroll when calculating boundaries

**November 17, 2025**: Hover-to-show behavior
- Controller is now completely hidden by default
- Appears instantly when hovering over video (full menu, no nested hovers)
- Disappears when mouse leaves video area for distraction-free viewing
- Stays visible during drag operations

**November 17, 2025**: Drag and position memory feature
- Added drag-and-drop functionality to reposition controller
- Implemented position persistence using Chrome storage API
- Controller remembers user's preferred position across all videos
- Added move/grabbing cursor visual feedback

**November 17, 2025**: Initial project creation
- Created Chrome extension with Manifest V3
- Implemented preset speed buttons (1.0x, 1.5x, 2.0x, 3.0x, 4.0x)
- Made 1.0x and 2.0x speeds visually prominent with enhanced styling
- Created test page with sample video for local testing
- Organized files with `extension/` folder structure

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Content Script Pattern**: The extension uses a content script (`content.js`) that runs on all web pages (`<all_urls>`) to detect and enhance video elements. This approach ensures the extension works universally without requiring site-specific implementations.

**Controller Lifecycle Management**: Uses a Map to track which videos already have controllers attached, preventing duplicate controller creation. The Map allows iteration to clean up controllers when videos are removed from the DOM. Controllers are explicitly removed during the scan cycle when their associated videos are no longer in the document.

**DOM Injection Strategy**: Controllers are injected as sibling elements to videos (inserted before the video in the parent element) rather than as overlays. The parent element's position is automatically adjusted to `relative` if it's `static`, ensuring the absolutely positioned controller displays correctly.

**Event Delegation**: Each speed button has its own click handler that prevents event propagation to avoid interfering with the underlying video player's controls.

**Drag-and-Drop System**: Controllers are draggable using a mousedown/mousemove/mouseup event pattern. The drag handler detects clicks outside of buttons (allowing buttons to remain clickable) and updates the controller position in real-time. Position changes are persisted to Chrome's sync storage immediately after drag completion.

**Position Persistence**: Uses Chrome's `chrome.storage.sync` API to save and retrieve the controller's last position. The saved position is loaded on initialization and applied to all new video controllers, creating a consistent experience across different videos and websites.

### UI Design Pattern

**Glassmorphism Overlay**: The controller uses a semi-transparent dark background with backdrop blur for a modern glassmorphic effect that remains readable over any video content while maintaining visual elegance.

**Show on Hover**: The controller is completely hidden (opacity: 0) by default. When the user hovers over the video element, it smoothly fades in. When the mouse leaves both the video and controller areas, it fades out. This provides a distraction-free viewing experience while keeping controls instantly accessible.

**Visual Hierarchy**: 1.0x and 2.0x speeds are styled as "prominent" with enhanced styling (larger size, bolder font, stronger background) since these are the most commonly used presets.

**Active State Indication**: The currently active speed button receives a distinct blue highlight, providing immediate visual feedback about the current playback rate.

### Code Organization

**Single-File Content Script**: All logic is contained in `content.js` as an IIFE (Immediately Invoked Function Expression) to avoid polluting the global namespace and prevent conflicts with page scripts.

**Constant Configuration**: Speed presets are defined as a constant array at the top of the script, making it easy to modify available speeds if needed.

**CSS Namespace**: All styles use the `vsp-` prefix (Video Speed Presets) to avoid conflicts with existing page styles.

### Browser Extension Architecture

**Manifest V3**: Uses the latest Chrome extension manifest version for future compatibility and security.

**Minimal Permissions**: Only requests `activeTab` permission, providing access only when the extension is actively used on a tab.

**All Frames Support**: Content scripts run in all frames (`all_frames: true`), ensuring the extension works with embedded videos (iframes) as well as main page videos.

**Run Timing**: Scripts execute at `document_end` to ensure the DOM is ready but before all resources are fully loaded, balancing functionality with performance.

## External Dependencies

**Native Browser APIs**: 
- HTML5 Video API (`playbackRate` property) for speed control
- Chrome Extension APIs (manifest v3) for browser integration
- Standard DOM APIs for element creation and manipulation

**No External Libraries**: The extension is built entirely with vanilla JavaScript and CSS, avoiding any third-party dependencies. This keeps the extension lightweight, fast, and reduces security surface area.

**CSS Features**:
- CSS backdrop-filter for glassmorphism effect
- CSS transitions for smooth visual interactions
- Modern CSS layout (Flexbox) for button arrangement

**Testing Infrastructure**: Includes a standalone `test.html` file for local development and testing without requiring the full Chrome extension environment.