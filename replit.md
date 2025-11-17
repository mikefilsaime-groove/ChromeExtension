# Video Speed Presets - Chrome Extension

## Overview

Video Speed Presets is a Chrome extension that provides a simple overlay interface for controlling HTML5 video playback speed across any website. The extension automatically detects video elements on web pages and injects a clean, minimalist speed controller with preset buttons (1.0x, 1.5x, 2.0x, 3.0x, 4.0x) in the top-left corner of videos. It's designed to work universally across platforms like YouTube, Netflix, Vimeo, and any other site using HTML5 video players.

## Recent Changes

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

### UI Design Pattern

**Glassmorphism Overlay**: The controller uses a semi-transparent dark background with backdrop blur for a modern glassmorphic effect that remains readable over any video content while maintaining visual elegance.

**Adaptive Opacity**: The controller reduces opacity when not hovered (0.6) to minimize video obstruction, then returns to full opacity on hover for better visibility during interaction.

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