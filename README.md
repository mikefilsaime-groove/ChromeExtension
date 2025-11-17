# Video Speed Presets - Chrome Extension

A simple Chrome extension for controlling HTML5 video playback speed with convenient preset buttons.

## Features

- **Preset Speed Buttons**: Quick access to 1.0x, 1.5x, 2.0x, 3.0x, and 4.0x speeds
- **Prominent 1.0x & 2.0x**: The most commonly used speeds are highlighted
- **Clean UI**: Minimalist overlay that appears in the top-left corner of videos
- **Universal Compatibility**: Works on any website with HTML5 video (YouTube, Netflix, Vimeo, etc.)
- **Active Speed Indicator**: Current speed is highlighted in blue
- **Auto-Detection**: Automatically finds all videos on any page

## Installation

1. **Download or clone this repository**

2. **Open Chrome Extensions**
   - Navigate to `chrome://extensions/`
   - Or: Menu → More Tools → Extensions

3. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top-right corner

4. **Load the Extension**
   - Click "Load unpacked" button
   - Select the folder containing these extension files

5. **Start Using**
   - Navigate to any page with a video
   - The speed controller will appear in the top-left corner of the video
   - Click any preset button to change speed instantly

## Usage

### Speed Presets

- **1.0x** - Normal speed (prominent)
- **1.5x** - Slightly faster
- **2.0x** - Double speed (prominent)
- **3.0x** - Triple speed
- **4.0x** - Quadruple speed

### Tips

- Hover over the video to see the controller clearly
- The active speed is highlighted in blue
- The controller adapts to work with any video player
- Works across all tabs automatically

## Testing

Open `test.html` in your browser to test the extension with a sample video.

## File Structure

```
video-speed-presets/
├── manifest.json      # Extension configuration
├── content.js         # Main logic and video detection
├── styles.css         # Controller styling
├── icon16.png         # Extension icon (16x16)
├── icon48.png         # Extension icon (48x48)
├── icon128.png        # Extension icon (128x128)
├── test.html          # Test page with sample video
└── README.md          # This file
```

## Privacy

This extension:
- Does NOT collect any data
- Does NOT track your browsing
- Does NOT require any special permissions beyond running on web pages
- Runs entirely locally in your browser
- Has no external connections

## Compatibility

- Chrome 88+
- Microsoft Edge 88+
- Any Chromium-based browser supporting Manifest V3

## License

Free for personal use.
