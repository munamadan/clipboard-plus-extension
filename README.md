# ClipBoard+ Chrome Extension

A smart clipboard manager for Chrome/Chromium that keeps track of your clipboard history with support for text and images.

## Features

- 📋 Automatically captures copied text from web pages
- 🖼️ Right-click context menu to save images
- 📌 Pin important items to prevent them from being removed
- 🎨 Light and Dark theme support
- 🚫 Duplicate prevention (optional)
- ➕ Manually add text or images via popup
- 💾 Stores up to 50 items with FIFO queue management
- 🔒 All data stored locally (IndexedDB)

## Installation

### From Source

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top right)
4. Click **"Load unpacked"**
5. Select the `clipboard-extension` folder
6. Extension is now installed! 🎉

## Usage

### Automatic Text Capture
- Copy any text on a webpage (Ctrl+C / Cmd+C)
- Text is automatically saved to clipboard history

### Images
- Right-click any image → "Copy to ClipBoard+"
- Or use the ➕ button in popup to manually paste images

### Managing Items
- Click the extension icon to view history
- 📋 Click to copy item back to clipboard
- 📌 Pin items to keep them permanently
- 🗑 Delete items you don't need

### Settings
- Toggle dark mode
- Enable/disable duplicate entries

## Tech Stack

- Vanilla JavaScript (ES6+)
- Chrome Extension Manifest V3
- IndexedDB for persistent storage
- No external dependencies

## Permissions

- `clipboardRead` - Read clipboard content
- `clipboardWrite` - Write to clipboard
- `storage` - Store settings and history
- `contextMenus` - Right-click menu for images
- `tabs` - Open dashboard in new tab
- `<all_urls>` - Content script on all pages

## Privacy

All clipboard data is stored **locally** on your device using IndexedDB. No data is sent to external servers.

## License

MIT License - Feel free to use and modify!

## Author

Dipan Kharel

## Contributing

Pull requests are welcome! Feel free to open issues for bugs or feature requests.