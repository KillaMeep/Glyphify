# Glyphify

Glyphify converts images and videos to ASCII art. It is a desktop app built with Electron.

![Glyphify](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Electron](https://img.shields.io/badge/electron-28.x-green.svg)
![License](https://img.shields.io/badge/license-MIT-yellow.svg)

## Features

- **Image Conversion**: Convert PNG, JPG, GIF, WebP, and BMP images to ASCII art
- **Video Conversion**: Convert MP4 and WebM videos to animated ASCII
- **Multiple Output Modes**: Color and grayscale ASCII output
- **Customizable Character Sets**:
  - Standard (@%#*+=-:. )
  - Detailed (70 characters)
  - Block elements
  - Simple (#.)
  - Binary (01)
  - Braille patterns
  - Custom character sets
- **Export Options**: Save as TXT, HTML, PNG, or animated GIF
- **Themes**: You can select from several themes

## Automatic Installation

- [Download For Windows (EXE)](https://github.com/KillaMeep/Glyphify/releases/latest/download/Glyphify.exe)
- [Download For Linux (AppImage)](https://github.com/KillaMeep/Glyphify/releases/latest/download/Glyphify.AppImage)

> Note: These links point directly to the latest release assets, and will download the files immediately.

## Manual Installation

### Prerequisites

- Node.js 24 or higher
- npm or yarn

### Setup

```bash
# If you already cloned the repository, move into its folder
cd Glyphify

# Install dependencies
npm install

# Run this only if you updated an existing clone.
# It installs ffprobe-static, which Node uses to read GIF and video files.
npm install ffprobe-static --save

# Run the application
npm start

# Run with DevTools open
npm start -- --dev
```

## Building for Distribution

```bash
# Build for Windows
npm run build:win

# Build for macOS
npm run build:mac

# Build for Linux
npm run build:linux

# Build for all platforms
npm run build
```

## Usage

1. **Load an Image/Video**: Drag and drop a file onto the app, or click "Browse Files"
2. **Adjust Settings**:
   - Choose color or grayscale mode
   - Select a character set
   - Adjust width, font size, contrast, brightness
   - Toggle character inversion
   - Set background color
3. **Convert**: Click "Convert to ASCII" or press Enter
4. **Export**: Save your ASCII art as text, HTML, or image

## License

MIT License - See LICENSE file for details
