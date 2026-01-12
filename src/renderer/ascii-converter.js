/**
 * ASCII Art Converter - Pure JavaScript Implementation
 * Converts images and video frames to ASCII art without external dependencies
 */

class ASCIIConverter {
    // Character sets from dark to light
    static CHARSETS = {
        standard: '@%#*+=-:. ',
        detailed: '$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,"^`\'. ',
        blocks: '█▓▒░ ',
        simple: '#. ',
        binary: '01',
        braille: '⣿⣷⣶⣦⣤⣄⡄⡀ ',
        dots: '⠿⠾⠼⠸⠰⠠⠀',
    };
    
    // Color palettes for retro effects
    static COLOR_PALETTES = {
        full: null, // No palette, full 24-bit color
        ansi256: null, // Will be generated
        ansi16: [
            '#000000', '#800000', '#008000', '#808000', '#000080', '#800080', '#008080', '#c0c0c0',
            '#808080', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff'
        ],
        cga: [
            '#000000', '#0000AA', '#00AA00', '#00AAAA', '#AA0000', '#AA00AA', '#AA5500', '#AAAAAA',
            '#555555', '#5555FF', '#55FF55', '#55FFFF', '#FF5555', '#FF55FF', '#FFFF55', '#FFFFFF'
        ],
        gameboy: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f']
    };

    constructor(options = {}) {
        this.options = {
            width: options.width || 100,
            charset: options.charset || 'standard',
            customCharset: options.customCharset || null,
            colorMode: options.colorMode || 'color', // 'color' or 'grayscale'
            colorPalette: options.colorPalette || 'full', // 'full', 'ansi256', 'ansi16', 'cga', 'gameboy'
            fontSize: options.fontSize || 10,
            lineHeight: options.lineHeight || 1.0,
            contrast: options.contrast || 100,
            brightness: options.brightness || 100,
            invert: options.invert || false,
            backgroundColor: options.backgroundColor || '#00000000',
            ...options
        };
        
        // Create offscreen canvas for image processing
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        
        // Generate ANSI 256 palette if needed
        if (!ASCIIConverter.COLOR_PALETTES.ansi256) {
            ASCIIConverter.COLOR_PALETTES.ansi256 = this.generateANSI256Palette();
        }
    }
    
    /**
     * Generate ANSI 256 color palette (xterm colors)
     */
    generateANSI256Palette() {
        const palette = [];
        
        // 0-15: System colors (same as ANSI 16)
        palette.push(...ASCIIConverter.COLOR_PALETTES.ansi16);
        
        // 16-231: 216 colors (6x6x6 cube)
        for (let r = 0; r < 6; r++) {
            for (let g = 0; g < 6; g++) {
                for (let b = 0; b < 6; b++) {
                    const rv = r > 0 ? r * 40 + 55 : 0;
                    const gv = g > 0 ? g * 40 + 55 : 0;
                    const bv = b > 0 ? b * 40 + 55 : 0;
                    palette.push(`#${rv.toString(16).padStart(2, '0')}${gv.toString(16).padStart(2, '0')}${bv.toString(16).padStart(2, '0')}`);
                }
            }
        }
        
        // 232-255: Grayscale (24 shades)
        for (let i = 0; i < 24; i++) {
            const v = 8 + i * 10;
            palette.push(`#${v.toString(16).padStart(2, '0')}${v.toString(16).padStart(2, '0')}${v.toString(16).padStart(2, '0')}`);
        }
        
        return palette;
    }
    
    /**
     * Find closest color in palette
     */
    findClosestColor(r, g, b) {
        const palette = ASCIIConverter.COLOR_PALETTES[this.options.colorPalette];
        if (!palette) return `rgb(${r},${g},${b})`; // Full color mode
        
        let minDist = Infinity;
        let closestColor = palette[0];
        
        for (const hexColor of palette) {
            const pr = parseInt(hexColor.slice(1, 3), 16);
            const pg = parseInt(hexColor.slice(3, 5), 16);
            const pb = parseInt(hexColor.slice(5, 7), 16);
            
            // Euclidean distance in RGB space
            const dist = Math.sqrt(
                Math.pow(r - pr, 2) +
                Math.pow(g - pg, 2) +
                Math.pow(b - pb, 2)
            );
            
            if (dist < minDist) {
                minDist = dist;
                closestColor = hexColor;
            }
        }
        
        return closestColor;
    }

    /**
     * Get the character set to use
     */
    getCharset() {
        if (this.options.customCharset) {
            return this.options.customCharset;
        }
        return ASCIIConverter.CHARSETS[this.options.charset] || ASCIIConverter.CHARSETS.standard;
    }

    /**
     * Apply brightness and contrast adjustments to pixel values
     */
    adjustPixel(value) {
        // Apply brightness
        let adjusted = value * (this.options.brightness / 100);
        
        // Apply contrast
        const factor = (259 * (this.options.contrast + 255)) / (255 * (259 - this.options.contrast));
        adjusted = factor * (adjusted - 128) + 128;
        
        return Math.max(0, Math.min(255, adjusted));
    }

    /**
     * Convert RGB to grayscale using luminance formula
     */
    rgbToGray(r, g, b) {
        // Using luminosity method (human eye perception)
        return 0.299 * r + 0.587 * g + 0.114 * b;
    }

    /**
     * Map a brightness value to a character
     */
    brightnessToChar(brightness) {
        const charset = this.getCharset();
        const normalizedBrightness = brightness / 255;
        
        let index;
        if (this.options.invert) {
            index = Math.floor(normalizedBrightness * (charset.length - 1));
        } else {
            index = Math.floor((1 - normalizedBrightness) * (charset.length - 1));
        }
        
        return charset[Math.max(0, Math.min(charset.length - 1, index))];
    }

    /**
     * Convert an image element to ASCII art
     */
    convertImage(imageElement) {
        return new Promise((resolve) => {
            // Calculate dimensions maintaining aspect ratio
            // Characters are typically taller than wide, so we adjust
            const aspectRatio = imageElement.naturalHeight / imageElement.naturalWidth;
            const charAspectRatio = 0.5; // Characters are roughly twice as tall as wide
            
            const width = this.options.width;
            const height = Math.floor(width * aspectRatio * charAspectRatio);
            
            // Set canvas size
            this.canvas.width = width;
            this.canvas.height = height;
            
            // Draw image scaled down
            this.ctx.drawImage(imageElement, 0, 0, width, height);
            
            // Get pixel data
            const imageData = this.ctx.getImageData(0, 0, width, height);
            const pixels = imageData.data;
            
            // Convert to ASCII
            const result = this.processPixels(pixels, width, height);
            
            resolve(result);
        });
    }

    /**
     * Convert a video frame to ASCII art
     */
    convertVideoFrame(videoElement) {
        const aspectRatio = videoElement.videoHeight / videoElement.videoWidth;
        const charAspectRatio = 0.5;
        
        const width = this.options.width;
        const height = Math.floor(width * aspectRatio * charAspectRatio);
        
        this.canvas.width = width;
        this.canvas.height = height;
        
        this.ctx.drawImage(videoElement, 0, 0, width, height);
        
        const imageData = this.ctx.getImageData(0, 0, width, height);
        return this.processPixels(imageData.data, width, height);
    }

    /**
     * Convert raw ImageData to ASCII art (for cached frames)
     */
    convertImageData(imageData, originalWidth, originalHeight) {
        console.log(`[ASCIIConverter] convertImageData: ${originalWidth}x${originalHeight} -> ASCII width ${this.options.width}`);
        
        const aspectRatio = originalHeight / originalWidth;
        const charAspectRatio = 0.5;
        
        const width = this.options.width;
        const height = Math.floor(width * aspectRatio * charAspectRatio);
        
        console.log(`[ASCIIConverter] Creating temp canvas: ${originalWidth}x${originalHeight}, target: ${width}x${height}`);
        console.log(`[ASCIIConverter] Main canvas type: ${this.canvas.constructor.name}`);
        
        // Create temporary canvas matching this converter's canvas type
        const tempCanvas = this.canvas instanceof OffscreenCanvas
            ? new OffscreenCanvas(originalWidth, originalHeight)
            : document.createElement('canvas');
        
        if (!(tempCanvas instanceof OffscreenCanvas)) {
            tempCanvas.width = originalWidth;
            tempCanvas.height = originalHeight;
        }
        
        console.log(`[ASCIIConverter] Temp canvas type: ${tempCanvas.constructor.name}`);
        console.log(`[ASCIIConverter] ImageData dimensions: ${imageData.width}x${imageData.height}`);
        
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.putImageData(imageData, 0, 0);
        console.log('[ASCIIConverter] ImageData placed on temp canvas');
        
        // Set canvas size and draw scaled
        this.canvas.width = width;
        this.canvas.height = height;
        console.log('[ASCIIConverter] Drawing scaled image to main canvas...');
        this.ctx.drawImage(tempCanvas, 0, 0, width, height);
        console.log('[ASCIIConverter] Scaled image drawn successfully');
        
        // Get scaled pixel data
        const scaledImageData = this.ctx.getImageData(0, 0, width, height);
        console.log('[ASCIIConverter] Processing pixels...');
        return this.processPixels(scaledImageData.data, width, height);
    }

    /**
     * Process raw pixel data into ASCII with optimizations
     */
    processPixels(pixels, width, height) {
        const lines = [];
        const colorData = [];
        
        // Pre-allocate arrays for better performance
        const brightness = this.options.brightness / 100;
        const contrast = this.options.contrast;
        const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
        
        for (let y = 0; y < height; y++) {
            let line = '';
            const lineColors = new Array(width);
            
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                
                // Apply brightness and contrast inline
                let r = pixels[idx] * brightness;
                let g = pixels[idx + 1] * brightness;
                let b = pixels[idx + 2] * brightness;
                
                r = contrastFactor * (r - 128) + 128;
                g = contrastFactor * (g - 128) + 128;
                b = contrastFactor * (b - 128) + 128;
                
                // Clamp values
                r = Math.max(0, Math.min(255, r));
                g = Math.max(0, Math.min(255, g));
                b = Math.max(0, Math.min(255, b));
                
                const grayscale = 0.299 * r + 0.587 * g + 0.114 * b;
                const char = this.brightnessToChar(grayscale);
                
                line += char;
                
                if (this.options.colorMode === 'color') {
                    lineColors[x] = { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
                } else {
                    const gray = Math.round(grayscale);
                    lineColors[x] = { r: gray, g: gray, b: gray };
                }
            }
            
            lines.push(line);
            colorData.push(lineColors);
        }
        
        // Normalize braille blank (U+2800) to ASCII space for plain text output
        const textLines = lines.map(l => l.replace(/\u2800/g, ' '));

        return {
            text: textLines.join('\n'),
            lines,
            colorData,
            width,
            height
        };
    }

    /**
     * Generate HTML output with colors
     */
    generateHTML(asciiResult, includeStyles = true) {
        const { lines, colorData } = asciiResult;
        
        let html = '';
        
        if (includeStyles) {
            html += `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>ASCII Art</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            background: ${this.options.backgroundColor};
        }
        .ascii-art {
            font-family: 'Courier New', Consolas, monospace;
            font-size: ${this.options.fontSize}px;
            line-height: ${this.options.lineHeight};
            white-space: pre;
            letter-spacing: 0;
        }
    </style>
</head>
<body>
<div class="ascii-art">`;
        }
        
        for (let y = 0; y < lines.length; y++) {
            const line = lines[y];
            const colors = colorData[y];
            
            for (let x = 0; x < line.length; x++) {
                const char = line[x];
                const color = colors[x];
                
                if (this.isBlankChar(char)) {
                    // Treat braille blank as a normal space so spacing is consistent
                    html += ' ';
                } else {
                    html += `<span style="color:rgb(${color.r},${color.g},${color.b})">${this.escapeHTML(char)}</span>`;
                }
            }
            html += '\n';
        }
        
        if (includeStyles) {
            html += `</div>
</body>
</html>`;
        }
        
        return html;
    }

    /**
     * Generate colored HTML for display in app
     */
    generateDisplayHTML(asciiResult) {
        const { lines, colorData } = asciiResult;
        let html = '';
        
        for (let y = 0; y < lines.length; y++) {
            const line = lines[y];
            const colors = colorData[y];
            
            // Optimize by grouping consecutive characters with same/similar colors
            let currentSpan = '';
            let currentColor = null;
            
            for (let x = 0; x < line.length; x++) {
                const char = line[x];
                const color = colors[x];
                
                // Apply color palette if not in full color mode
                const colorStr = this.options.colorMode === 'color' 
                    ? this.findClosestColor(color.r, color.g, color.b)
                    : `rgb(${color.r},${color.g},${color.b})`;
                
                if (this.isBlankChar(char)) {
                    if (currentSpan) {
                        html += `<span style="color:${currentColor}">${currentSpan}</span>`;
                        currentSpan = '';
                        currentColor = null;
                    }
                    html += ' ';
                } else if (currentColor === colorStr) {
                    currentSpan += this.escapeHTML(char);
                } else {
                    if (currentSpan) {
                        html += `<span style="color:${currentColor}">${currentSpan}</span>`;
                    }
                    currentSpan = this.escapeHTML(char);
                    currentColor = colorStr;
                }
            }
            
            if (currentSpan) {
                html += `<span style="color:${currentColor}">${currentSpan}</span>`;
            }
            
            html += '\n';
        }
        
        return html;
    }

    /**
     * Render ASCII to canvas for PNG export
     */
    renderToCanvas(asciiResult, scale = 2) {
        const { lines, colorData } = asciiResult;
        
        const fontSize = this.options.fontSize * scale;
        const lineHeight = fontSize * this.options.lineHeight;
        let charWidth = fontSize * 0.6; // Monospace character width ratio
        
        const canvasWidth = lines[0].length * charWidth;
        const canvasHeight = lines.length * lineHeight;
        
        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        
        const ctx = canvas.getContext('2d', { alpha: true });
        
        // Parse background color for alpha support
        const bgColor = this.options.backgroundColor;
        if (bgColor.length === 9 && bgColor.startsWith('#')) {
            // #RRGGBBAA format
            const r = parseInt(bgColor.substr(1, 2), 16);
            const g = parseInt(bgColor.substr(3, 2), 16);
            const b = parseInt(bgColor.substr(5, 2), 16);
            const a = parseInt(bgColor.substr(7, 2), 16) / 255;
            ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
        } else {
            ctx.fillStyle = bgColor;
        }
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        
        // Set font and measure character width so Braille glyphs render with correct alignment
        ctx.font = `${fontSize}px Consolas, 'Courier New', monospace`;
        ctx.textBaseline = 'top';

        // Measure representative characters to compute accurate char width (supports braille glyphs)
        const sampleChars = [this.getCharset()[0] || 'M', 'M'];
        let measuredWidth = 0;
        for (const c of sampleChars) {
            measuredWidth = Math.max(measuredWidth, ctx.measureText(c).width);
        }
        charWidth = measuredWidth > 0 ? measuredWidth : fontSize * 0.6;

        // Draw characters
        for (let y = 0; y < lines.length; y++) {
            const line = lines[y];
            const colors = colorData[y];
            
            for (let x = 0; x < line.length; x++) {
                const char = line[x];
                // Treat Braille Pattern Blank (U+2800) the same as ASCII space to keep alignment
                if (!this.isBlankChar(char)) {
                    const color = colors[x];
                    ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
                    ctx.fillText(char, x * charWidth, y * lineHeight);
                }
            }
        }
        
        return canvas;
    }

    /**
     * Escape HTML characters
     */
    escapeHTML(str) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return str.replace(/[&<>"']/g, m => map[m]);
    }

    /**
     * Determine whether a character should be treated as a whitespace character
     * This includes ASCII space and Braille Pattern Blank (U+2800), which should
     * behave like a normal space for alignment purposes.
     */
    isBlankChar(char) {
        return char === ' ' || char === '\u2800';
    }

    /**
     * Update converter options
     */
    setOptions(options) {
        this.options = { ...this.options, ...options };
    }
}

/**
 * Video Frame Extractor with optimizations
 */
class VideoExtractor {
    constructor(videoElement) {
        this.video = videoElement;
        // Use OffscreenCanvas if available for better performance
        this.useOffscreen = typeof OffscreenCanvas !== 'undefined';
        // Check for modern frame extraction API
        this.hasVideoFrameCallback = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
    }

    /**
     * Detect or estimate video framerate with better precision
     */
    detectFrameRate() {
        // Try to get from video metadata (most accurate)
        try {
            const videoTracks = this.video.captureStream?.().getVideoTracks();
            if (videoTracks && videoTracks.length > 0) {
                const settings = videoTracks[0].getSettings();
                if (settings.frameRate && settings.frameRate > 0) {
                    console.log(`[VideoExtractor] Detected framerate: ${settings.frameRate} fps`);
                    return settings.frameRate;
                }
            }
        } catch (err) {
            console.warn('[VideoExtractor] Could not get frameRate from video track:', err);
        }
        
        // Calculate from duration and video metrics if available
        // For most videos, we can estimate based on duration vs expected frame count
        const duration = this.video.duration;
        if (duration > 0 && this.video.videoWidth > 0) {
            // Estimate based on common framerates and duration
            // Try common rates: 60, 30, 25, 24, 23.976, 15, etc.
            const commonRates = [60, 59.94, 50, 30, 29.97, 25, 24, 23.976, 15, 12];
            
            // For now, return based on duration heuristic
            if (duration < 5) return 30;
            if (duration < 30) return 24;
            return 24; // Safe default
        }
        
        // Final fallback
        console.log('[VideoExtractor] Using default framerate: 24 fps');
        return 24;
    }

    /**
     * Extract frames at specified interval with optimizations
     */
    async extractFrames(frameRate = null, progressCallback = null, abortSignal = null) {
        // Auto-detect framerate if not specified
        if (!frameRate) {
            frameRate = this.detectFrameRate();
        }
        
        console.log(`[VideoExtractor] Extracting at ${frameRate} fps`);
        const duration = this.video.duration;
        const interval = 1 / frameRate;
        const totalFrames = Math.floor(duration * frameRate);
        
        console.log(`[VideoExtractor] Extracting ${totalFrames} frames at ${frameRate} fps`);
        
        // Use faster method if available
        if (this.hasVideoFrameCallback && this.video.videoWidth > 0) {
            return this.extractFramesFast(frameRate, totalFrames, progressCallback, abortSignal);
        } else {
            return this.extractFramesCompat(frameRate, totalFrames, progressCallback, abortSignal);
        }
    }

    /**
     * Fast frame extraction using requestVideoFrameCallback (Chrome/Edge)
     */
    async extractFramesFast(frameRate, totalFrames, progressCallback, abortSignal = null) {
        const frames = [];
        const interval = 1 / frameRate;
        
        // Pre-create canvas for reuse
        const canvas = this.useOffscreen 
            ? new OffscreenCanvas(this.video.videoWidth, this.video.videoHeight)
            : document.createElement('canvas');
        canvas.width = this.video.videoWidth;
        canvas.height = this.video.videoHeight;
        const ctx = canvas.getContext('2d', { 
            alpha: false,
            willReadFrequently: true
        });
        
        console.log('[VideoExtractor] Using fast seek-based extraction');
        
        // Use seeking instead of playback for more reliable frame capture
        for (let i = 0; i < totalFrames; i++) {
            if (abortSignal?.aborted) {
                const ae = new Error('Aborted by user'); ae.name = 'AbortError'; throw ae;
            }

            const targetTime = i * interval;
            
            // Seek to target time (supports abort)
            await this.seekTo(targetTime, abortSignal);
            
            if (abortSignal?.aborted) {
                const ae = new Error('Aborted by user'); ae.name = 'AbortError'; throw ae;
            }

            // Capture frame
            ctx.drawImage(this.video, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            
            frames.push({
                imageData: imageData,
                width: canvas.width,
                height: canvas.height,
                time: targetTime,
                delay: Math.floor(interval * 1000)
            });
            
            // Update progress - yield to event loop every frame
            if (progressCallback) {
                progressCallback((i + 1) / totalFrames);
                // Yield to event loop to update UI
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        
        console.log(`[VideoExtractor] Fast extraction complete: ${frames.length} frames`);
        return frames;
    }

    /**
     * Compatible frame extraction with optimized seeking (fallback)
     */
    async extractFramesCompat(frameRate, totalFrames, progressCallback, abortSignal = null) {
        const frames = [];
        const interval = 1 / frameRate;
        
        // Pre-create canvas for reuse
        const canvas = this.useOffscreen 
            ? new OffscreenCanvas(this.video.videoWidth, this.video.videoHeight)
            : document.createElement('canvas');
        canvas.width = this.video.videoWidth;
        canvas.height = this.video.videoHeight;
        const ctx = canvas.getContext('2d', { 
            alpha: false,
            willReadFrequently: true
        });
        
        console.log('[VideoExtractor] Using compatible sequential extraction');
        
        // Process frames sequentially, yielding to event loop
        for (let i = 0; i < totalFrames; i++) {
            if (abortSignal?.aborted) {
                const ae = new Error('Aborted by user'); ae.name = 'AbortError'; throw ae;
            }
            const frame = await this.extractSingleFrame(ctx, canvas, i * interval, interval, abortSignal);
            frames.push(frame);
            
            if (progressCallback) {
                progressCallback((i + 1) / totalFrames);
                // Yield to event loop every frame to keep UI responsive
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        
        console.log(`[VideoExtractor] Compatible extraction complete: ${frames.length} frames`);
        return frames;
    }

    /**
     * Extract a single frame at specific time
     */
    async extractSingleFrame(ctx, canvas, time, interval, abortSignal = null) {
        await this.seekTo(time, abortSignal);
        if (abortSignal?.aborted) {
            const ae = new Error('Aborted by user'); ae.name = 'AbortError'; throw ae;
        }
        ctx.drawImage(this.video, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        return {
            imageData: imageData,
            width: canvas.width,
            height: canvas.height,
            time: time,
            delay: Math.floor(interval * 1000)
        };
    }

    /**
     * Seek to specific time and wait for frame (optimized)
     */
    seekTo(time, abortSignal = null) {
        return new Promise((resolve, reject) => {
            // Handle case where video is already at this time
            if (Math.abs(this.video.currentTime - time) < 0.001) {
                resolve();
                return;
            }
            
            const onSeeked = () => {
                cleanup();
                resolve(); // No delay needed - seeked event means frame is ready
            };

            const onAbort = () => {
                cleanup();
                const ae = new Error('Aborted by user'); ae.name = 'AbortError';
                reject(ae);
            };

            const cleanup = () => {
                this.video.removeEventListener('seeked', onSeeked);
                if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
            };
            
            this.video.addEventListener('seeked', onSeeked);
            if (abortSignal) abortSignal.addEventListener('abort', onAbort, { once: true });
            this.video.currentTime = Math.min(time, this.video.duration - 0.01);
        });
    }
}

/**
 * GIF Encoder - Pure JavaScript Implementation
 * Based on NeuQuant algorithm for color quantization
 */
class GIFEncoder {
    constructor(width, height) {
        this.width = ~~width;
        this.height = ~~height;
        this.transparent = null;
        this.transIndex = 0;
        this.repeat = 0;
        this.delay = 0;
        this.image = null;
        this.pixels = null;
        this.indexedPixels = null;
        this.colorDepth = null;
        this.colorTab = null;
        this.usedEntry = [];
        this.palSize = 7;
        this.dispose = -1;
        this.firstFrame = true;
        this.sample = 10;
        this.out = new ByteArray();
    }

    setDelay(ms) {
        this.delay = Math.round(ms / 10);
    }

    setFrameRate(fps) {
        this.delay = Math.round(100 / fps);
    }

    setDispose(code) {
        if (code >= 0) this.dispose = code;
    }

    setRepeat(iter) {
        this.repeat = iter;
    }

    setTransparent(color) {
        this.transparent = color;
    }

    addFrame(imageData) {
        this.image = imageData;
        this.getImagePixels();
        this.analyzePixels();
        
        if (this.firstFrame) {
            this.writeLSD();
            this.writePalette();
            if (this.repeat >= 0) {
                this.writeNetscapeExt();
            }
        }
        
        this.writeGraphicCtrlExt();
        this.writeImageDesc();
        
        if (!this.firstFrame) {
            this.writePalette();
        }
        
        this.writePixels();
        this.firstFrame = false;
    }

    finish() {
        this.out.writeByte(0x3b);
    }

    setQuality(quality) {
        if (quality < 1) quality = 1;
        this.sample = quality;
    }

    stream() {
        return this.out;
    }

    getImagePixels() {
        const w = this.width;
        const h = this.height;
        this.pixels = new Uint8Array(w * h * 3);
        
        const data = this.image;
        let count = 0;
        
        for (let i = 0; i < h; i++) {
            for (let j = 0; j < w; j++) {
                const b = (i * w * 4) + j * 4;
                this.pixels[count++] = data[b];
                this.pixels[count++] = data[b + 1];
                this.pixels[count++] = data[b + 2];
            }
        }
    }

    analyzePixels() {
        const len = this.pixels.length;
        const nPix = len / 3;
        
        this.indexedPixels = new Uint8Array(nPix);
        
        const nq = new NeuQuant(this.pixels, this.sample);
        this.colorTab = nq.process();
        
        // Map image pixels to new palette
        let k = 0;
        for (let i = 0; i < nPix; i++) {
            const index = nq.map(
                this.pixels[k++] & 0xff,
                this.pixels[k++] & 0xff,
                this.pixels[k++] & 0xff
            );
            this.usedEntry[index] = true;
            this.indexedPixels[i] = index;
        }
        
        this.pixels = null;
        this.colorDepth = 8;
        this.palSize = 7;
        
        // Get closest match to transparent color if specified
        if (this.transparent !== null) {
            this.transIndex = this.findClosest(this.transparent);
        }
    }

    findClosest(c) {
        if (this.colorTab === null) return -1;
        
        const r = (c & 0xFF0000) >> 16;
        const g = (c & 0x00FF00) >> 8;
        const b = (c & 0x0000FF);
        
        let minpos = 0;
        let dmin = 256 * 256 * 256;
        const len = this.colorTab.length;
        
        for (let i = 0; i < len;) {
            const dr = r - (this.colorTab[i++] & 0xff);
            const dg = g - (this.colorTab[i++] & 0xff);
            const db = b - (this.colorTab[i++] & 0xff);
            const d = dr * dr + dg * dg + db * db;
            const index = i / 3;
            if (this.usedEntry[index] && (d < dmin)) {
                dmin = d;
                minpos = index;
            }
        }
        
        return minpos;
    }

    writeLSD() {
        // Write header
        this.writeString('GIF89a');
        
        // Logical screen size
        this.writeShort(this.width);
        this.writeShort(this.height);
        
        // Packed fields
        this.out.writeByte(
            0x80 | // Global Color Table Flag
            0x70 | // Color Resolution
            0x00 | // Sort Flag
            this.palSize // Size of Global Color Table
        );
        
        this.out.writeByte(0); // Background Color Index
        this.out.writeByte(0); // Pixel Aspect Ratio
    }

    writePalette() {
        this.out.writeBytes(this.colorTab);
        const n = (3 * 256) - this.colorTab.length;
        for (let i = 0; i < n; i++) {
            this.out.writeByte(0);
        }
    }

    writeNetscapeExt() {
        this.out.writeByte(0x21); // Extension introducer
        this.out.writeByte(0xff); // App extension label
        this.out.writeByte(11); // Block size
        this.writeString('NETSCAPE2.0');
        this.out.writeByte(3); // Sub-block size
        this.out.writeByte(1); // Loop sub-block id
        this.writeShort(this.repeat); // Loop count
        this.out.writeByte(0); // Block terminator
    }

    writeGraphicCtrlExt() {
        this.out.writeByte(0x21); // Extension introducer
        this.out.writeByte(0xf9); // GCE label
        this.out.writeByte(4); // Block size
        
        let transp, disp;
        if (this.transparent === null) {
            transp = 0;
            disp = 0;
        } else {
            transp = 1;
            disp = 2;
        }
        
        if (this.dispose >= 0) {
            disp = this.dispose & 7;
        }
        disp <<= 2;
        
        this.out.writeByte(
            0 | // Reserved
            disp | // Disposal method
            0 | // User input
            transp // Transparent color flag
        );
        
        this.writeShort(this.delay); // Delay in centiseconds
        this.out.writeByte(this.transIndex); // Transparent color index
        this.out.writeByte(0); // Block terminator
    }

    writeImageDesc() {
        this.out.writeByte(0x2c); // Image separator
        this.writeShort(0); // Image position x
        this.writeShort(0); // Image position y
        this.writeShort(this.width); // Image width
        this.writeShort(this.height); // Image height
        
        // Packed fields
        if (this.firstFrame) {
            this.out.writeByte(0);
        } else {
            this.out.writeByte(
                0x80 | // Local Color Table Flag
                0 | // Interlace Flag
                0 | // Sort Flag
                0 | // Reserved
                this.palSize // Size of Local Color Table
            );
        }
    }

    writePixels() {
        const enc = new LZWEncoder(this.width, this.height, this.indexedPixels, this.colorDepth);
        enc.encode(this.out);
    }

    writeShort(value) {
        this.out.writeByte(value & 0xff);
        this.out.writeByte((value >> 8) & 0xff);
    }

    writeString(s) {
        for (let i = 0; i < s.length; i++) {
            this.out.writeByte(s.charCodeAt(i));
        }
    }
}

/**
 * ByteArray for GIF encoding
 */
class ByteArray {
    constructor() {
        this.data = [];
    }

    writeByte(val) {
        this.data.push(val);
    }

    writeBytes(array, offset = 0, length) {
        length = length || array.length;
        for (let i = offset; i < length; i++) {
            this.writeByte(array[i]);
        }
    }

    getData() {
        return new Uint8Array(this.data);
    }
}

/**
 * NeuQuant Neural-Net Quantization Algorithm
 */
class NeuQuant {
    constructor(pixels, samplefac) {
        this.netsize = 256;
        this.prime1 = 499;
        this.prime2 = 491;
        this.prime3 = 487;
        this.prime4 = 503;
        this.minpicturebytes = 3 * this.prime4;
        
        this.maxnetpos = this.netsize - 1;
        this.netbiasshift = 4;
        this.ncycles = 100;
        this.intbiasshift = 16;
        this.intbias = 1 << this.intbiasshift;
        this.gammashift = 10;
        this.gamma = 1 << this.gammashift;
        this.betashift = 10;
        this.beta = this.intbias >> this.betashift;
        this.betagamma = this.intbias << (this.gammashift - this.betashift);
        
        this.initrad = this.netsize >> 3;
        this.radiusbiasshift = 6;
        this.radiusbias = 1 << this.radiusbiasshift;
        this.initradius = this.initrad * this.radiusbias;
        this.radiusdec = 30;
        
        this.alphabiasshift = 10;
        this.initalpha = 1 << this.alphabiasshift;
        
        this.radbiasshift = 8;
        this.radbias = 1 << this.radbiasshift;
        this.alpharadbshift = this.alphabiasshift + this.radbiasshift;
        this.alpharadbias = 1 << this.alpharadbshift;
        
        this.thepicture = pixels;
        this.lengthcount = pixels.length;
        this.samplefac = samplefac;
        
        this.network = [];
        this.netindex = new Int32Array(256);
        this.bias = new Int32Array(this.netsize);
        this.freq = new Int32Array(this.netsize);
        this.radpower = new Int32Array(this.netsize >> 3);
        
        for (let i = 0; i < this.netsize; i++) {
            this.network[i] = new Float64Array([
                (i << (this.netbiasshift + 8)) / this.netsize,
                (i << (this.netbiasshift + 8)) / this.netsize,
                (i << (this.netbiasshift + 8)) / this.netsize,
                0
            ]);
            this.freq[i] = this.intbias / this.netsize;
            this.bias[i] = 0;
        }
    }

    process() {
        this.learn();
        this.unbiasnet();
        this.inxbuild();
        return this.colorMap();
    }

    colorMap() {
        const map = [];
        const index = [];
        
        for (let i = 0; i < this.netsize; i++) {
            index[this.network[i][3]] = i;
        }
        
        for (let i = 0; i < this.netsize; i++) {
            const j = index[i];
            map.push(this.network[j][0]);
            map.push(this.network[j][1]);
            map.push(this.network[j][2]);
        }
        
        return map;
    }

    inxbuild() {
        let previouscol = 0;
        let startpos = 0;
        
        for (let i = 0; i < this.netsize; i++) {
            const p = this.network[i];
            let smallpos = i;
            let smallval = p[1];
            
            for (let j = i + 1; j < this.netsize; j++) {
                const q = this.network[j];
                if (q[1] < smallval) {
                    smallpos = j;
                    smallval = q[1];
                }
            }
            
            const q = this.network[smallpos];
            if (i !== smallpos) {
                [p[0], q[0]] = [q[0], p[0]];
                [p[1], q[1]] = [q[1], p[1]];
                [p[2], q[2]] = [q[2], p[2]];
                [p[3], q[3]] = [q[3], p[3]];
            }
            
            if (smallval !== previouscol) {
                this.netindex[previouscol] = (startpos + i) >> 1;
                for (let j = previouscol + 1; j < smallval; j++) {
                    this.netindex[j] = i;
                }
                previouscol = smallval;
                startpos = i;
            }
        }
        
        this.netindex[previouscol] = (startpos + this.maxnetpos) >> 1;
        for (let j = previouscol + 1; j < 256; j++) {
            this.netindex[j] = this.maxnetpos;
        }
    }

    learn() {
        if (this.lengthcount < this.minpicturebytes) {
            this.samplefac = 1;
        }
        
        const alphadec = 30 + ((this.samplefac - 1) / 3);
        const samplepixels = this.lengthcount / (3 * this.samplefac);
        let delta = ~~(samplepixels / this.ncycles);
        let alpha = this.initalpha;
        let radius = this.initradius;
        
        let rad = radius >> this.radiusbiasshift;
        if (rad <= 1) rad = 0;
        
        for (let i = 0; i < rad; i++) {
            this.radpower[i] = alpha * (((rad * rad - i * i) * this.radbias) / (rad * rad));
        }
        
        let step;
        if (this.lengthcount < this.minpicturebytes) {
            step = 3;
        } else if (this.lengthcount % this.prime1 !== 0) {
            step = 3 * this.prime1;
        } else if (this.lengthcount % this.prime2 !== 0) {
            step = 3 * this.prime2;
        } else if (this.lengthcount % this.prime3 !== 0) {
            step = 3 * this.prime3;
        } else {
            step = 3 * this.prime4;
        }
        
        let pix = 0;
        
        for (let i = 0; i < samplepixels;) {
            const r = (this.thepicture[pix] & 0xff) << this.netbiasshift;
            const g = (this.thepicture[pix + 1] & 0xff) << this.netbiasshift;
            const b = (this.thepicture[pix + 2] & 0xff) << this.netbiasshift;
            
            const j = this.contest(r, g, b);
            this.altersingle(alpha, j, r, g, b);
            
            if (rad !== 0) {
                this.alterneigh(rad, j, r, g, b);
            }
            
            pix += step;
            if (pix >= this.lengthcount) {
                pix -= this.lengthcount;
            }
            
            i++;
            
            if (delta === 0) delta = 1;
            if (i % delta === 0) {
                alpha -= alpha / alphadec;
                radius -= radius / this.radiusdec;
                rad = radius >> this.radiusbiasshift;
                if (rad <= 1) rad = 0;
                
                for (let j = 0; j < rad; j++) {
                    this.radpower[j] = alpha * (((rad * rad - j * j) * this.radbias) / (rad * rad));
                }
            }
        }
    }

    contest(r, g, b) {
        let bestd = ~(1 << 31);
        let bestbiasd = bestd;
        let bestpos = -1;
        let bestbiaspos = bestpos;
        
        for (let i = 0; i < this.netsize; i++) {
            const n = this.network[i];
            const dist = Math.abs(n[0] - r) + Math.abs(n[1] - g) + Math.abs(n[2] - b);
            
            if (dist < bestd) {
                bestd = dist;
                bestpos = i;
            }
            
            const biasdist = dist - ((this.bias[i]) >> (this.intbiasshift - this.netbiasshift));
            if (biasdist < bestbiasd) {
                bestbiasd = biasdist;
                bestbiaspos = i;
            }
            
            const betafreq = this.freq[i] >> this.betashift;
            this.freq[i] -= betafreq;
            this.bias[i] += betafreq << this.gammashift;
        }
        
        this.freq[bestpos] += this.beta;
        this.bias[bestpos] -= this.betagamma;
        
        return bestbiaspos;
    }

    altersingle(alpha, i, r, g, b) {
        const n = this.network[i];
        n[0] -= (alpha * (n[0] - r)) / this.initalpha;
        n[1] -= (alpha * (n[1] - g)) / this.initalpha;
        n[2] -= (alpha * (n[2] - b)) / this.initalpha;
    }

    alterneigh(rad, i, r, g, b) {
        const lo = Math.max(i - rad, -1);
        const hi = Math.min(i + rad, this.netsize);
        
        let j = i + 1;
        let k = i - 1;
        let m = 1;
        
        while (j < hi || k > lo) {
            const a = this.radpower[m++];
            
            if (j < hi) {
                const n = this.network[j++];
                n[0] -= (a * (n[0] - r)) / this.alpharadbias;
                n[1] -= (a * (n[1] - g)) / this.alpharadbias;
                n[2] -= (a * (n[2] - b)) / this.alpharadbias;
            }
            
            if (k > lo) {
                const n = this.network[k--];
                n[0] -= (a * (n[0] - r)) / this.alpharadbias;
                n[1] -= (a * (n[1] - g)) / this.alpharadbias;
                n[2] -= (a * (n[2] - b)) / this.alpharadbias;
            }
        }
    }

    unbiasnet() {
        for (let i = 0; i < this.netsize; i++) {
            this.network[i][0] >>= this.netbiasshift;
            this.network[i][1] >>= this.netbiasshift;
            this.network[i][2] >>= this.netbiasshift;
            this.network[i][3] = i;
        }
    }

    map(r, g, b) {
        let bestd = 1000;
        let best = -1;
        let i = this.netindex[g];
        let j = i - 1;
        
        while (i < this.netsize || j >= 0) {
            if (i < this.netsize) {
                const n = this.network[i];
                let dist = n[1] - g;
                if (dist >= bestd) {
                    i = this.netsize;
                } else {
                    i++;
                    if (dist < 0) dist = -dist;
                    let a = n[0] - r;
                    if (a < 0) a = -a;
                    dist += a;
                    if (dist < bestd) {
                        a = n[2] - b;
                        if (a < 0) a = -a;
                        dist += a;
                        if (dist < bestd) {
                            bestd = dist;
                            best = n[3];
                        }
                    }
                }
            }
            
            if (j >= 0) {
                const n = this.network[j];
                let dist = g - n[1];
                if (dist >= bestd) {
                    j = -1;
                } else {
                    j--;
                    if (dist < 0) dist = -dist;
                    let a = n[0] - r;
                    if (a < 0) a = -a;
                    dist += a;
                    if (dist < bestd) {
                        a = n[2] - b;
                        if (a < 0) a = -a;
                        dist += a;
                        if (dist < bestd) {
                            bestd = dist;
                            best = n[3];
                        }
                    }
                }
            }
        }
        
        return best;
    }
}

/**
 * LZW Encoder for GIF
 */
class LZWEncoder {
    constructor(width, height, pixels, colorDepth) {
        this.width = width;
        this.height = height;
        this.pixels = pixels;
        this.colorDepth = Math.max(2, colorDepth);
        this.initCodeSize = this.colorDepth;
        this.accum = new Uint8Array(256);
        this.htab = new Int32Array(5003);
        this.codetab = new Int32Array(5003);
        this.cur_accum = 0;
        this.cur_bits = 0;
        this.a_count = 0;
        this.remaining = 0;
        this.curPixel = 0;
        
        this.BITS = 12;
        this.HSIZE = 5003;
        this.masks = [
            0x0000, 0x0001, 0x0003, 0x0007, 0x000F, 0x001F,
            0x003F, 0x007F, 0x00FF, 0x01FF, 0x03FF, 0x07FF,
            0x0FFF, 0x1FFF, 0x3FFF, 0x7FFF, 0xFFFF
        ];
    }

    encode(outs) {
        outs.writeByte(this.initCodeSize);
        this.remaining = this.width * this.height;
        this.curPixel = 0;
        this.compress(this.initCodeSize + 1, outs);
        outs.writeByte(0);
    }

    compress(init_bits, outs) {
        let fcode, c, i, ent, disp, hsize_reg, hshift;
        
        const g_init_bits = init_bits;
        let g_bits = g_init_bits;
        let g_maxcode = (1 << g_bits) - 1;
        
        const ClearCode = 1 << (init_bits - 1);
        const EOFCode = ClearCode + 1;
        let free_ent = ClearCode + 2;
        
        this.a_count = 0;
        
        ent = this.nextPixel();
        
        hshift = 0;
        for (fcode = this.HSIZE; fcode < 65536; fcode *= 2) {
            hshift++;
        }
        hshift = 8 - hshift;
        hsize_reg = this.HSIZE;
        
        for (i = 0; i < hsize_reg; i++) {
            this.htab[i] = -1;
        }
        
        this.output(ClearCode, g_bits, outs);
        
        outer: while ((c = this.nextPixel()) !== -1) {
            fcode = (c << this.BITS) + ent;
            i = (c << hshift) ^ ent;
            
            if (this.htab[i] === fcode) {
                ent = this.codetab[i];
                continue;
            } else if (this.htab[i] >= 0) {
                disp = hsize_reg - i;
                if (i === 0) disp = 1;
                
                do {
                    if ((i -= disp) < 0) i += hsize_reg;
                    if (this.htab[i] === fcode) {
                        ent = this.codetab[i];
                        continue outer;
                    }
                } while (this.htab[i] >= 0);
            }
            
            this.output(ent, g_bits, outs);
            ent = c;
            
            if (free_ent < (1 << this.BITS)) {
                this.codetab[i] = free_ent++;
                this.htab[i] = fcode;
            } else {
                for (i = 0; i < this.HSIZE; i++) {
                    this.htab[i] = -1;
                }
                free_ent = ClearCode + 2;
                this.output(ClearCode, g_bits, outs);
                g_bits = g_init_bits;
                g_maxcode = (1 << g_bits) - 1;
            }
            
            if (free_ent > g_maxcode) {
                g_bits++;
                if (g_bits > this.BITS) {
                    g_bits = this.BITS;
                }
                g_maxcode = (1 << g_bits) - 1;
            }
        }
        
        this.output(ent, g_bits, outs);
        this.output(EOFCode, g_bits, outs);
    }

    output(code, bits, outs) {
        this.cur_accum &= this.masks[this.cur_bits];
        
        if (this.cur_bits > 0) {
            this.cur_accum |= code << this.cur_bits;
        } else {
            this.cur_accum = code;
        }
        
        this.cur_bits += bits;
        
        while (this.cur_bits >= 8) {
            this.char_out(this.cur_accum & 0xff, outs);
            this.cur_accum >>= 8;
            this.cur_bits -= 8;
        }
        
        if (this.a_count >= 254) {
            this.flush_char(outs);
        }
    }

    char_out(c, outs) {
        this.accum[this.a_count++] = c;
    }

    flush_char(outs) {
        if (this.a_count > 0) {
            outs.writeByte(this.a_count);
            outs.writeBytes(this.accum, 0, this.a_count);
            this.a_count = 0;
        }
    }

    nextPixel() {
        if (this.remaining === 0) return -1;
        this.remaining--;
        return this.pixels[this.curPixel++] & 0xff;
    }
}

/**
 * ASCII Animation Handler
 * Manages converting video frames to ASCII and encoding them
 */
class ASCIIAnimationEncoder {
    constructor(converter, options = {}) {
        this.converter = converter;
        this.options = {
            frameRate: options.frameRate || 10,
            quality: options.quality || 10,
            scale: options.scale || 1,
            ...options
        };
        this.frames = [];
    }

    /**
     * Convert video frames to ASCII art frames
     */
    async convertFrames(videoElement, totalFrames, progressCallback = null, abortSignal = null) {
        console.log('[ASCIIAnimationEncoder] Converting frames:', totalFrames);
        const extractor = new VideoExtractor(videoElement);
        
        // Use specified frameRate or let extractor auto-detect
        const frameRate = this.options.frameRate || null;
        console.log(`[ASCIIAnimationEncoder] Using frameRate: ${frameRate || 'auto-detect'}`);
        
        const videoFrames = await extractor.extractFrames(
            frameRate,
            (p) => {
                if (abortSignal && abortSignal.aborted) {
                    const ae = new Error('Aborted by user'); ae.name = 'AbortError'; throw ae;
                }
                progressCallback && progressCallback(p * 0.5, 'Extracting frames...');
            },
            abortSignal
        );
        
        console.log(`[ASCIIAnimationEncoder] Extracted ${videoFrames.length} frames`);
        this.frames = [];
        
        for (let i = 0; i < videoFrames.length; i++) {
            // Check for abort
            if (abortSignal && abortSignal.aborted) {
                console.log('[ASCIIAnimationEncoder] Aborted during conversion');
                throw new Error('Aborted by user');
            }
            
            // Convert ImageData directly to ASCII (no intermediate canvas/image needed)
            const asciiResult = this.converter.convertImageData(
                videoFrames[i].imageData,
                videoFrames[i].width,
                videoFrames[i].height
            );
            
            // Render ASCII to canvas
            const asciiCanvas = this.converter.renderToCanvas(asciiResult, this.options.scale);
            
            this.frames.push({
                canvas: asciiCanvas,
                asciiResult,
                delay: videoFrames[i].delay
            });
            
            if (progressCallback) {
                progressCallback(0.5 + (i + 1) / videoFrames.length * 0.5, 'Converting to ASCII...');
            }
            
            // Yield to event loop every 10 frames to keep UI responsive
            if (i % 10 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        
        console.log(`[ASCIIAnimationEncoder] Converted ${this.frames.length} frames to ASCII`);
        return this.frames;
    }

    /**
     * Encode frames as animated GIF using Web Worker for multi-threading
     */
    async encodeGIF(progressCallback = null, abortSignal = null) {
        console.log('[ASCIIAnimationEncoder] Starting GIF encoding');
        if (this.frames.length === 0) {
            throw new Error('No frames to encode');
        }

        // Try main-process GIF encoder first for better speed/quality (if available)
        let mainAvailable = false;
        try {
            mainAvailable = !!(window.electronAPI && typeof window.electronAPI.isGifEncoderAvailable === 'function' && await window.electronAPI.isGifEncoderAvailable());
        } catch (e) {
            console.warn('[GIF] Could not query main GIF encoder availability:', e);
        }

        if (mainAvailable) {
            console.log('[GIF] Main-process gif-encoder is available; attempting main-process encode');
            try {
                const firstFrame = this.frames[0].canvas;
                const width = firstFrame.width;
                const height = firstFrame.height;

                const coreCount = navigator.hardwareConcurrency || 4;
                const batchSize = Math.max(12, Math.floor(coreCount * 2));
                const total = this.frames.length;

                console.log(`[GIF] Main-process encode: cores=${coreCount}, batchSize=${batchSize}, quality=${this.options.quality}`);

                const { gifId } = await window.electronAPI.createGifEncoder({ width, height, repeat: 0, quality: this.options.quality || 10, delay: Math.round(this.frames[0].delay || 100) });
                console.log('[GIF] Created main-process encoder id', gifId);

                // Attach abort listener to cancel main encoder if external abort happens
                const abortHandler = () => {
                    try {
                        window.electronAPI.cancelGif(gifId).catch(() => {});
                    } catch (e) {}
                };
                if (abortSignal) abortSignal.addEventListener('abort', abortHandler, { once: true });

                for (let i = 0; i < total; i += batchSize) {
                    if (abortSignal?.aborted) {
                        // ensure main process encoder is canceled
                        if (abortSignal) abortHandler();
                        const e = new Error('Aborted by user'); e.name = 'AbortError'; throw e;
                    }

                    const batch = [];
                    for (let j = i; j < Math.min(total, i + batchSize); j++) {
                        if (abortSignal?.aborted) {
                            if (abortSignal) abortHandler();
                            const e = new Error('Aborted by user'); e.name = 'AbortError'; throw e;
                        }
                        const frame = this.frames[j];
                        // Get raw RGBA pixel data from canvas (Uint8ClampedArray)
                        const ctx = frame.canvas.getContext('2d', { willReadFrequently: true });
                        const imageData = ctx.getImageData(0, 0, width, height);
                        // Send the underlying ArrayBuffer to avoid boxing into JS arrays
                        batch.push({ pixels: imageData.data.buffer, delay: Math.round(frame.delay || 100), index: j });
                    }

                    try {
                        await window.electronAPI.addGifFrames(gifId, batch);
                    } catch (err) {
                        // If abort, ensure it's rethrown as AbortError so we do not fallback to worker
                        if (abortSignal?.aborted) {
                            const ae = new Error('Aborted by user'); ae.name = 'AbortError'; throw ae;
                        }
                        console.error('[GIF] addGifFrames failed, will fallback to worker:', err);
                        throw err;
                    }

                    if (progressCallback) {
                        const p = Math.min(1, (Math.min(total, i + batchSize) / total));
                        progressCallback(p, `Sending frames... (${Math.min(total, i + batchSize)}/${total})`);
                    }

                    await new Promise(resolve => setTimeout(resolve, 0));
                }

                if (progressCallback) progressCallback(0.95, 'Finalizing GIF...');
                if (abortSignal?.aborted) { const ae = new Error('Aborted by user'); ae.name = 'AbortError'; throw ae; }
                const result = await window.electronAPI.finalizeGif(gifId);
                if (abortSignal?.aborted) { const ae = new Error('Aborted by user'); ae.name = 'AbortError'; throw ae; }
                if (progressCallback) progressCallback(1, 'GIF complete');

                if (!result) {
                    throw new Error('Main GIF encoder returned no result');
                }

                if (result.error) {
                    throw new Error(`Main GIF encoder error: ${result.error} (header=${result.header || 'n/a'} size=${result.size || 'n/a'} path=${result.path || 'n/a'})`);
                }

                if (!result.data) {
                    throw new Error(`Main GIF encoder did not return base64 data (header=${result.header || 'n/a'} size=${result.size || 'n/a'} path=${result.path || 'n/a'})`);
                }

                let base64Str = result.data;
                if (typeof base64Str === 'string' && base64Str.startsWith('data:')) {
                    base64Str = base64Str.split(',')[1];
                }

                let binaryString;
                try {
                    binaryString = atob(base64Str);
                } catch (err) {
                    throw new Error(`Failed decoding base64 from main GIF encoder: ${err.message} (header=${result.header || 'n/a'} size=${result.size || 'n/a'})`);
                }

                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const blob = new Blob([bytes], { type: 'image/gif' });
                console.log(`[GIF] Main-process encoding complete: ${blob.size} bytes`);
                return blob;
            } catch (err) {
                console.warn('[GIF] Main-process encoder failed, falling back to worker encoder:', err);
                // fall through to worker-based
            }
        } else {
            console.log('[GIF] Main-process gif-encoder not available; using worker-based encoder');
        }

        // Fallback to worker-based GIF encoding (runs off main thread)
        const firstFrame = this.frames[0].canvas;
        const width = firstFrame.width;
        const height = firstFrame.height;

        return new Promise((resolve, reject) => {
            const worker = new Worker('./gif-worker.js');
            let frameIndex = 0;
            const coreCount = navigator.hardwareConcurrency || 4;
            const batchSize = Math.max(3, Math.floor(coreCount)); // Send multiple frames per message for efficiency
            console.log(`[GIF Worker] Using batchSize=${batchSize}, cores=${coreCount}`);

            worker.onmessage = (e) => {
                if (e.data.type === 'ready') {
                    sendNextBatch();
                } else if (e.data.type === 'progress') {
                    if (progressCallback) {
                        // Normalize progress to 0..1 (worker may send percentage or fraction)
                        let p = e.data.progress;
                        if (typeof p === 'number' && p > 1) p = p / 100;
                        progressCallback(p, 'Encoding GIF...');
                    }
                    sendNextBatch();
                } else if (e.data.type === 'complete') {
                    worker.terminate();
                    const blob = new Blob([e.data.data], { type: 'image/gif' });
                    console.log(`[GIF] Encoding complete: ${blob.size} bytes`);
                    resolve(blob);
                } else if (e.data.type === 'error') {
                    worker.terminate();
                    reject(new Error(e.data.error));
                }
            };

            worker.onerror = (error) => {
                worker.terminate();
                reject(error);
            };

            const sendNextBatch = () => {
                if (abortSignal?.aborted) {
                    // Inform worker and then terminate cleanly
                    try { worker.postMessage({ type: 'abort' }); } catch (e) {}
                    worker.terminate();
                    const ae = new Error('Aborted by user'); ae.name = 'AbortError';
                    reject(ae);
                    return;
                }

                if (frameIndex < this.frames.length) {
                    const batch = [];
                    const transferables = [];

                    for (let i = 0; i < batchSize && frameIndex < this.frames.length; i++) {
                        const frame = this.frames[frameIndex];
                        const ctx = frame.canvas.getContext('2d', { willReadFrequently: true });
                        const imageData = ctx.getImageData(0, 0, width, height);

                        batch.push({
                            data: imageData.data,
                            delay: frame.delay,
                            index: frameIndex
                        });
                        transferables.push(imageData.data.buffer);
                        frameIndex++;
                    }

                    worker.postMessage({ type: 'frames', frames: batch }, transferables);
                } else if (frameIndex === this.frames.length) {
                    worker.postMessage({ type: 'finish' });
                    frameIndex++;
                }
            };

            worker.postMessage({
                type: 'init',
                width: width,
                height: height,
                totalFrames: this.frames.length,
                quality: Math.max(1, Math.min(30, this.options.quality)),
                repeat: 0,
                transparent: null
            });
        });
    }


    /**
     * Encode frames as WebM video using Web Worker + FFmpeg.wasm
     */
    async encodeWebM(progressCallback = null, abortSignal = null) {
        // Use MediaRecorder for faster WebM encoding (no FFmpeg)
        return this.encodeVideo('webm', progressCallback, abortSignal);
    }

    /**
     * Encode frames as MP4 video using Web Worker + FFmpeg.wasm
     */
    async encodeMP4(progressCallback = null, abortSignal = null) {
        // Prefer WebCodecs + muxer when available (Electron path)
        if (typeof VideoEncoder !== 'undefined' && typeof window.electronAPI?.createVideoMuxer === 'function') {
            try {
                console.log('[Encoder] MP4 encoding via WebCodecs + muxer (preferred)');
                return await this.encodeVideoWebCodecs(progressCallback, abortSignal);
            } catch (err) {
                console.warn('[Encoder] WebCodecs MP4 encoding failed, falling back to MediaRecorder:', err);
            }
        }

        // FFmpeg has been unreliable - fallback to MediaRecorder
        console.warn('[Encoder] MP4 encoding via FFmpeg disabled due to reliability issues. Using MediaRecorder instead.');
        return this.encodeVideo('mp4', progressCallback, abortSignal);
    }

    /**
     * Encode frames to video using FFmpeg worker (PNG frames -> ffmpeg -> mp4/webm)
     */
    async encodeVideoFFMPEG(format = 'mp4', progressCallback = null, abortSignal = null) {
        console.log(`[ASCIIAnimationEncoder] Starting ${format.toUpperCase()} encoding via FFmpeg worker`);
        if (this.frames.length === 0) {
            throw new Error('No frames to encode');
        }

        const width = this.frames[0].canvas.width;
        const height = this.frames[0].canvas.height;
        const fps = this.options.frameRate;

        // Prepare frames as raw RGBA pixel data (instant - just read pixels!)
        const frameImages = [];
        for (let i = 0; i < this.frames.length; i++) {
            if (abortSignal?.aborted) {
                throw new Error('Aborted by user');
            }

            // Get pixel data directly from existing canvas
            const ctx = this.frames[i].canvas.getContext('2d', { willReadFrequently: true });
            const imageData = ctx.getImageData(0, 0, width, height);
            frameImages.push(imageData.data); // Uint8ClampedArray - raw RGBA bytes

            if (progressCallback) {
                const percent = (i / this.frames.length) * 10; // 0-10% for frame prep
                progressCallback(percent, 'Preparing frames...');
            }
        }

        // Encode via worker
        return new Promise((resolve, reject) => {
            const worker = new Worker('./video-worker.js');

            const abortHandler = () => {
                worker.terminate();
                reject(new Error('Aborted by user'));
            };
            if (abortSignal) {
                abortSignal.addEventListener('abort', abortHandler, { once: true });
            }

            worker.onmessage = (e) => {
                if (e.data.type === 'progress') {
                    if (progressCallback) {
                        // Worker progress is 0-1; map to 10-100%
                        const percent = 10 + (e.data.progress * 90);
                        progressCallback(percent, 'Encoding video...');
                    }
                } else if (e.data.type === 'status') {
                    if (progressCallback) {
                        progressCallback(null, e.data.message);
                    }
                } else if (e.data.type === 'complete') {
                    worker.terminate();
                    if (abortSignal) abortSignal.removeEventListener('abort', abortHandler);
                    const mimeType = format === 'mp4' ? 'video/mp4' : 'video/webm';
                    const blob = new Blob([e.data.data], { type: mimeType });
                    resolve(blob);
                } else if (e.data.type === 'error') {
                    worker.terminate();
                    if (abortSignal) abortSignal.removeEventListener('abort', abortHandler);
                    reject(new Error(e.data.error));
                }
            };

            worker.onerror = (error) => {
                worker.terminate();
                if (abortSignal) abortSignal.removeEventListener('abort', abortHandler);
                reject(error);
            };

            worker.postMessage({
                frames: frameImages,
                width,
                height,
                fps,
                format,
                quality: this.options.quality
            });
        });
    }

    /**
     * Encode frames as video using WebCodecs API (fast) or MediaRecorder (fallback)
     */
    async encodeVideo(format = 'webm', progressCallback = null, abortSignal = null) {
        console.log(`[ASCIIAnimationEncoder] Starting ${format.toUpperCase()} encoding`);
        if (this.frames.length === 0) {
            throw new Error('No frames to encode');
        }
        
        // Try WebCodecs first (much faster, proper FPS control)
        if (typeof VideoEncoder !== 'undefined' && format === 'webm') {
            try {
                return await this.encodeVideoWebCodecs(progressCallback, abortSignal);
            } catch (err) {
                console.warn('[Encoder] WebCodecs failed, falling back to MediaRecorder:', err);
            }
        }
        
        // Fallback to MediaRecorder
        return await this.encodeVideoMediaRecorder(format, progressCallback, abortSignal);
    }

    /**
     * Encode using WebCodecs API + mp4-muxer (via main process) - FAST, proper metadata
     */
    async encodeVideoWebCodecs(progressCallback = null, abortSignal = null) {
        const width = this.frames[0].canvas.width;
        const height = this.frames[0].canvas.height;
        
        // Calculate FPS from frame delays with full precision
        let fps = this.options.frameRate;
        if (!fps && this.frames.length > 1) {
            const totalDelay = this.frames.reduce((sum, frame) => sum + (frame.delay || 100), 0);
            const avgDelay = totalDelay / this.frames.length;
            fps = 1000 / avgDelay; // Keep full precision
        }
        fps = fps || 24;
        
        console.log(`[WebCodecs] Encoding ${this.frames.length} frames at ${width}x${height}, ${fps.toFixed(2)} fps`);
        
        // Create muxer in main process (include frameRate for accurate MP4 metadata)
        const { muxerId } = await window.electronAPI.createVideoMuxer(width, height, Math.round(fps));
        console.log(`[WebCodecs] Created muxer: ${muxerId} (frameRate=${Math.round(fps)})`);
        
        return new Promise((resolve, reject) => {
            // Use appropriate H.264 level based on resolution
            // Level 3.1 supports up to 1280x720, Level 4.0 supports up to 2048x1024, Level 5.1 supports up to 4096x2304
            let codecString = 'avc1.42001f'; // Level 3.1 (default)
            if (width * height > 921600) { // > 1280x720
                codecString = 'avc1.640028'; // Level 4.0
            }
            if (width * height > 2097152) { // > ~1920x1080
                codecString = 'avc1.640033'; // Level 5.1
            }
            
            console.log(`[WebCodecs] Using codec: H.264 (${codecString})`);
            
        // Track if we've sent decoderConfig yet
        let decoderConfigSent = false;
        let chunkCount = 0;
        
        // Create encoder
        const encoder = new VideoEncoder({
            output: async (chunk, metadata) => {
                // Copy chunk data to array buffer
                const buffer = new ArrayBuffer(chunk.byteLength);
                chunk.copyTo(buffer);

                chunkCount++;
                
                // Prepare metadata to send
                let metaToSend = undefined;
                
                // If this is the first chunk or we have new metadata, prepare decoderConfig
                if (metadata && metadata.decoderConfig) {
                    const dc = metadata.decoderConfig;
                    const desc = dc.description ? Array.from(new Uint8Array(dc.description)) : undefined;
                    // Provide sensible defaults for color space if missing
                    const colorSpace = dc.colorSpace || {
                        primaries: 'bt709',
                        transfer: 'bt709',
                        matrix: 'bt709',
                        fullRange: false
                    };
                    metaToSend = {
                        decoderConfig: {
                            description: desc,
                            codec: dc.codec || codecString,
                            colorSpace: colorSpace
                        }
                    };
                    decoderConfigSent = true;
                    console.log('[WebCodecs] Sending decoderConfig with chunk', chunkCount);
                } else if (chunkCount === 1 && !decoderConfigSent) {
                    // First chunk but encoder didn't provide metadata - send minimal config
                    console.warn('[WebCodecs] First chunk has no metadata, sending minimal decoderConfig');
                    metaToSend = {
                        decoderConfig: {
                            codec: codecString,
                            description: undefined,
                            colorSpace: {
                                primaries: 'bt709',
                                transfer: 'bt709',
                                matrix: 'bt709',
                                fullRange: false
                            }
                        }
                    };
                    decoderConfigSent = true;
                }

                // Send to main process muxer
                console.log(`[WebCodecs] Adding chunk ${chunkCount} ts=${chunk.timestamp} duration=${chunk.duration} meta=${metaToSend ? 'yes' : 'no'} codec=${metaToSend?.decoderConfig?.codec ?? 'n/a'}`);
                try {
                    await window.electronAPI.addVideoChunk(
                        muxerId,
                        Array.from(new Uint8Array(buffer)), // Convert to array for IPC
                        chunk.timestamp, // microseconds
                        chunk.duration, // microseconds
                        chunk.type === 'key',
                        metaToSend
                    );
                } catch (err) {
                    console.error('[WebCodecs] Failed to add chunk:', err);
                }
            },
            error: (err) => {
                console.error('[WebCodecs] Encoder error:', err);
                reject(err);
            }
        });
            
            // Configure encoder
            encoder.configure({
                codec: codecString,
                width: width,
                height: height,
                bitrate: 8_000_000, // 8 Mbps
                framerate: fps,
                latencyMode: 'quality',
                hardwareAcceleration: 'prefer-hardware'
            });
            
            const encodeAllFrames = async () => {
                const frameDuration = 1_000_000 / fps; // microseconds per frame
                
                for (let i = 0; i < this.frames.length; i++) {
                    if (abortSignal?.aborted) {
                        await encoder.flush();
                        encoder.close();
                        reject(new Error('Aborted by user'));
                        return;
                    }
                    
                    // Create VideoFrame from canvas
                    const canvas = this.frames[i].canvas;
                    const timestamp = Math.round(i * frameDuration);
                    
                    const frame = new VideoFrame(canvas, {
                        timestamp: timestamp,
                        duration: Math.round(frameDuration)
                    });
                    
                    // Encode frame (keyframe every 2 seconds)
                    const keyFrame = i % Math.max(1, Math.round(fps * 2)) === 0;
                    encoder.encode(frame, { keyFrame: keyFrame });
                    frame.close();
                    
                    // Update progress (map frame encoding to 0-90%, leave room for flush/finalize)
                    if (progressCallback) {
                        const progress = ((i + 1) / this.frames.length) * 90; // 0..90
                        progressCallback(progress, `Encoding frame ${i + 1}/${this.frames.length}...`);
                    }
                    
                    // Yield every 10 frames to keep UI responsive
                    if (i % 10 === 0) {
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }
                }
                
                // Flush encoder
                console.log('[WebCodecs] Flushing encoder...');
                if (progressCallback) progressCallback(95, 'Flushing encoder...');
                await encoder.flush();
                encoder.close();
                
                // Wait a moment for all chunks to be sent via IPC
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Finalize muxer and get MP4 data
                console.log('[WebCodecs] Finalizing MP4...');
                if (progressCallback) progressCallback(98, 'Finalizing MP4...');
                const { data } = await window.electronAPI.finalizeVideo(muxerId);
                
                // Convert base64 back to blob
                const binaryString = atob(data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                
                const blob = new Blob([bytes], { type: 'video/mp4' });
                
                console.log(`[WebCodecs] Complete: ${blob.size} bytes, ${this.frames.length} frames at ${fps.toFixed(2)} fps`);
                
                // Log expected vs actual duration
                const expectedDuration = this.frames.length / fps;
                console.log(`[WebCodecs] Expected duration: ${expectedDuration.toFixed(2)}s`);

                if (progressCallback) progressCallback(100, 'MP4 encoding complete');
                
                resolve(blob);
            };
            
            encodeAllFrames().catch(reject);
        });
    }

    /**
     * Encode using MediaRecorder API (fallback)
     */
    async encodeVideoMediaRecorder(format = 'webm', progressCallback = null, abortSignal = null) {
        console.log(`[ASCIIAnimationEncoder] Starting ${format.toUpperCase()} encoding with MediaRecorder`);
        if (this.frames.length === 0) {
            throw new Error('No frames to encode');
        }
        
        const width = this.frames[0].canvas.width;
        const height = this.frames[0].canvas.height;
        // Determine fps: prefer explicit option, otherwise calculate from actual frame timings
        let fps = this.options.frameRate;
        if (!fps && this.frames.length > 1) {
            // Calculate actual FPS from frame delays (more accurate)
            const totalDelay = this.frames.reduce((sum, frame) => sum + (frame.delay || 100), 0);
            const avgDelay = totalDelay / this.frames.length;
            fps = Math.round((1000 / avgDelay) * 100) / 100; // Round to 2 decimal places
            console.log(`[Encoder] Calculated fps from frame delays: ${fps} fps (avg delay ${avgDelay.toFixed(2)}ms)`);
        }
        fps = fps || 24; // fallback
        console.log(`[Encoder] Using fps: ${fps}`);
        
        // Create regular canvas (not OffscreenCanvas) for captureStream support
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // Get stream with 0 fps - we'll manually control frame timing
        const stream = canvas.captureStream(0);
        const [videoTrack] = stream.getVideoTracks();
        
        // Determine MIME type based on format and browser support
        let mimeType;
        if (format === 'mp4') {
            // Try MP4 codecs in order of preference
            const mp4Types = [
                'video/mp4;codecs=avc1.42E01E',
                'video/mp4;codecs=h264',
                'video/mp4'
            ];
            mimeType = mp4Types.find(type => MediaRecorder.isTypeSupported(type));
            
            if (!mimeType) {
                console.warn('[Encoder] MP4 not supported, falling back to WebM');
                format = 'webm';
            }
        }
        
        if (format === 'webm') {
            // Try WebM codecs - VP9 first for stability, AV1 for quality
            const webmTypes = [
                'video/webm;codecs=vp9', // VP9 - stable, good quality
                'video/webm;codecs=av01', // AV1 - highest quality but slower
                'video/webm;codecs=vp8',
                'video/webm'
            ];
            mimeType = webmTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'video/webm';
        }
        
        console.log(`[Encoder] Using MIME type: ${mimeType}`);
        
        return new Promise((resolve, reject) => {
            if (abortSignal?.aborted) {
                reject(new Error('Aborted by user'));
                return;
            }
            
            const chunks = [];
            
            // Create MediaRecorder with high quality settings for ASCII art preservation
            const recorderOptions = {
                mimeType: mimeType,
                // High bitrate for ASCII detail (10 Mbps - balanced)
                videoBitsPerSecond: 10000000,
            };
            
            // Try to enable high quality for VP9/AV1
            if (mimeType.includes('vp9') || mimeType.includes('av01')) {
                recorderOptions.videoKeyFrameIntervalDuration = 2000; // Keyframe every 2 seconds
            }
            
            const recorder = new MediaRecorder(stream, recorderOptions);
            
            console.log(`[Encoder] MediaRecorder created:`, recorderOptions);
            
            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    chunks.push(e.data);
                }
            };
            
            recorder.onerror = (e) => {
                console.error('[Encoder] MediaRecorder error:', e);
                stream.getTracks().forEach(track => track.stop());
                reject(new Error('Video encoding failed'));
            };
            
            recorder.onstop = () => {
                stream.getTracks().forEach(track => track.stop());
                console.log(`[Encoder] Recording stopped, collected ${chunks.length} chunks`);
                
                // Create blob with proper MIME type
                const blob = new Blob(chunks, { type: mimeType });
                console.log(`[Encoder] Final blob size: ${blob.size} bytes, type: ${blob.type}`);
                
                if (blob.size === 0) {
                    reject(new Error('Video encoding produced empty file'));
                    return;
                }

                // Resolve immediately, but also probe the blob's metadata to validate duration
                resolve(blob);

                // Probe blob duration asynchronously for diagnostics
                try {
                    const url = URL.createObjectURL(blob);
                    const probeVideo = document.createElement('video');
                    probeVideo.preload = 'metadata';
                    probeVideo.src = url;
                    probeVideo.onloadedmetadata = () => {
                        const duration = probeVideo.duration;
                        const expectedDuration = (totalFrames / fps);
                        console.log(`[Encoder] Probed output duration: ${duration.toFixed(3)}s; expected ~${expectedDuration.toFixed(3)}s (frames: ${totalFrames}, fps: ${fps})`);
                        URL.revokeObjectURL(url);
                    };
                    probeVideo.onerror = (e) => {
                        console.warn('[Encoder] Failed to probe output video metadata', e);
                        URL.revokeObjectURL(url);
                    };
                } catch (err) {
                    console.warn('[Encoder] Error probing output blob metadata', err);
                }
            };
            
            // Start recording immediately
            recorder.start();
            
            if (progressCallback) {
                progressCallback(0, 'Starting video encoding...');
            }
            
            const totalFrames = this.frames.length;
            console.log(`[Encoder] Rendering ${totalFrames} frames at ${fps} fps`);
            
            // Draw frames quickly with minimal waits, manually trigger captures
            const renderAllFrames = async () => {
                const frameDuration = 1000 / fps; // Target ms per frame
                const minWait = Math.min(16, frameDuration); // Cap wait at 16ms for speed

                for (let i = 0; i < totalFrames; i++) {
                    if (abortSignal?.aborted) {
                        recorder.stop();
                        reject(new Error('Aborted by user'));
                        return;
                    }

                    // Draw frame immediately (max speed)
                    ctx.clearRect(0, 0, width, height);
                    ctx.drawImage(this.frames[i].canvas, 0, 0);
                    
                    // Request frame capture from stream manually
                    videoTrack.requestFrame();
                    
                    // Small wait to let encoder process + yield to event loop
                    await new Promise(resolve => setTimeout(resolve, minWait));

                    // Update progress every frame to keep UI responsive
                    if (progressCallback) {
                        const progress = ((i + 1) / totalFrames) * 100;
                        progressCallback(progress, `Encoding frame ${i + 1}/${totalFrames}...`);
                    }
                }

                // All frames rendered - wait to ensure proper finalization
                console.log('[Encoder] All frames rendered, finalizing...');
                await new Promise(resolve => setTimeout(resolve, 500));
                if (recorder.state === 'recording') {
                    recorder.stop();
                }
            };
            
            renderAllFrames().catch(reject);
        });
    }
}

// Export for use in renderer
window.ASCIIConverter = ASCIIConverter;
window.VideoExtractor = VideoExtractor;
window.GIFEncoder = GIFEncoder;
window.ASCIIAnimationEncoder = ASCIIAnimationEncoder;
