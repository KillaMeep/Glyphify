# Glyphify

A modern Electron desktop application for converting images and videos to ASCII art.

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
- **Themes**: Multiple themes to choose from

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
# Clone or navigate to the project directory
cd Glyphify

# Install dependencies
npm install

# Run the application
npm start

# Run in development mode with DevTools
npm start
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
