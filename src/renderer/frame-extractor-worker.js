/**
 * Web Worker for Fast Frame Extraction using FFmpeg.wasm
 * Much faster than video.currentTime seeking
 */

// Create a minimal document shim for FFmpeg.wasm
self.document = {
    createElement: () => ({}),
    currentScript: { src: '' }
};

// Load FFmpeg from CDN
importScripts('https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js');
importScripts('https://unpkg.com/@ffmpeg/util@0.12.1/dist/umd/index.js');

let ffmpeg = null;
let isLoaded = false;
let logBuffer = '';
let workerAborted = false; // Set when main thread requests abort

// Initialize FFmpeg
async function loadFFmpeg() {
    if (isLoaded) return;
    
    const { FFmpeg } = FFmpegWASM;
    self.postMessage({ type: 'status', message: 'Loading FFmpeg core...' });
    ffmpeg = new FFmpeg();

    // Collect logs for parsing (fps detection)
    ffmpeg.on('log', ({ message }) => {
        logBuffer += message + '\n';
    });

    // Progress callback
    ffmpeg.on('progress', ({ progress }) => {
        self.postMessage({ type: 'ffmpeg-progress', progress });
    });
    
    // Load FFmpeg core
    await ffmpeg.load({
        coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
        wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
    });
    
    isLoaded = true;
    self.postMessage({ type: 'status', message: 'FFmpeg loaded' });
    console.log('[FrameExtractor Worker] FFmpeg loaded');
}

// Extract frames from video file
async function extractFrames(videoData, frameRate) {
    const startTime = performance.now();
    try {
        console.log('[FrameExtractor Worker] Starting extraction');
        const t0 = performance.now();
            workerAborted = false;
        await loadFFmpeg();
        console.log(`[FrameExtractor Worker] FFmpeg loaded in ${(performance.now() - t0).toFixed(0)}ms`);
        
        if (workerAborted) throw new Error('Aborted by user');
        self.postMessage({ type: 'status', message: 'Loading video...' });
        
        // Write video file
        const t1 = performance.now();
        await ffmpeg.writeFile('input.mp4', new Uint8Array(videoData));
        console.log(`[FrameExtractor Worker] Video written in ${(performance.now() - t1).toFixed(0)}ms`);
        if (workerAborted) throw new Error('Aborted by user');
        self.postMessage({ type: 'status', message: 'Decoding frames with FFmpeg...' });
        
        self.postMessage({ type: 'status', message: 'Extracting frames...' });
        
        // Extract frames as raw RGBA data
        const t2 = performance.now();
        await ffmpeg.exec([
            '-i', 'input.mp4',
            '-vf', `fps=${frameRate}`,
            '-f', 'image2',
            '-c:v', 'png',
            'frame%05d.png'
        ]);
        if (workerAborted) throw new Error('Aborted by user');
        console.log(`[FrameExtractor Worker] FFmpeg extraction complete in ${(performance.now() - t2).toFixed(0)}ms`);        
        self.postMessage({ type: 'status', message: 'Reading frames...' });
        
        // Get list of files
        const t3 = performance.now();
        const files = await ffmpeg.listDir('/');
        const frameFiles = files.filter(f => f.name.startsWith('frame') && f.name.endsWith('.png')).sort();
        console.log(`[FrameExtractor Worker] Listed ${frameFiles.length} frames in ${(performance.now() - t3).toFixed(0)}ms`);
        
        const frames = [];
        const decodeStart = performance.now();
        for (let i = 0; i < frameFiles.length; i++) {
            if (workerAborted) throw new Error('Aborted by user');
            const frameStart = performance.now();
            
            const frameData = await ffmpeg.readFile(frameFiles[i].name);
            if (workerAborted) throw new Error('Aborted by user');
            const readTime = performance.now() - frameStart;
            
            // Decode PNG to get dimensions
            const blobStart = performance.now();
            const blob = new Blob([frameData], { type: 'image/png' });
            const bitmap = await createImageBitmap(blob);
            if (workerAborted) throw new Error('Aborted by user');
            const decodeTime = performance.now() - blobStart;
            
            // Draw to canvas to get ImageData
            const canvasStart = performance.now();
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bitmap, 0, 0);
            const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
            const canvasTime = performance.now() - canvasStart;
            
            if (i === 0 || i === frameFiles.length - 1) {
                console.log(`[FrameExtractor Worker] Frame ${i}: read=${readTime.toFixed(0)}ms, decode=${decodeTime.toFixed(0)}ms, canvas=${canvasTime.toFixed(0)}ms, total=${(performance.now() - frameStart).toFixed(0)}ms`);
            }
            
            frames.push({
                imageData: imageData,
                width: bitmap.width,
                height: bitmap.height,
                time: i / frameRate,
                delay: Math.floor(1000 / frameRate)
            });
            
            // Clean up
            await ffmpeg.deleteFile(frameFiles[i].name);
            
            // Progress
            if (i % 10 === 0 || i === frameFiles.length - 1) {
                self.postMessage({ 
                    type: 'progress', 
                    current: i + 1, 
                    total: frameFiles.length 
                });
            }
        }
        console.log(`[FrameExtractor Worker] All frames processed in ${(performance.now() - decodeStart).toFixed(0)}ms, avg ${((performance.now() - decodeStart) / frameFiles.length).toFixed(0)}ms per frame`);
        
        // Clean up input file
        await ffmpeg.deleteFile('input.mp4');
        
        self.postMessage({ 
            type: 'complete', 
            frames: frames 
        });
        
    } catch (error) {
        console.error('[FrameExtractor Worker] Error:', error);
        self.postMessage({ 
            type: 'error', 
            message: error.message 
        });
    }
}

// Listen for messages
self.addEventListener('message', async (e) => {
    const { type, videoData, frameRate } = e.data;
    
    if (type === 'extract') {
        workerAborted = false;
        await extractFrames(videoData, frameRate);
    } else if (type === 'probe') {
        await probeVideo(videoData);
    } else if (type === 'abort') {
        console.log('[FrameExtractor Worker] Abort message received');
        workerAborted = true;
        self.postMessage({ type: 'aborted' });
    }
});

// Probe video metadata using FFmpeg
async function probeVideo(videoData) {
    try {
        await loadFFmpeg();
        
        console.log('[FrameExtractor Worker] Probing video metadata...');

        // Reset log buffer
        logBuffer = '';
        
        // Write video file
        await ffmpeg.writeFile('input.mp4', new Uint8Array(videoData));
        
        // Use ffmpeg to emit stream info; parse fps/tbr from logs
        await ffmpeg.exec([
            '-i', 'input.mp4',
            '-vf', 'showinfo',
            '-f', 'null',
            '-'
        ]);

        const logText = logBuffer;
        
        // Parse FPS from logs (look for "Stream #0:0" line with fps info)
        const fpsMatch = logText.match(/(\d+\.?\d*)\s*fps/);
        const tbMatch = logText.match(/(\d+\.?\d*)\s*tbr/);
        
        let fps = null;
        if (fpsMatch) {
            fps = parseFloat(fpsMatch[1]);
        } else if (tbMatch) {
            fps = parseFloat(tbMatch[1]);
        }
        
        console.log(`[FrameExtractor Worker] Detected FPS: ${fps}`);
        
        // Clean up
        await ffmpeg.deleteFile('input.mp4');
        
        self.postMessage({
            type: 'probe-complete',
            fps: fps
        });
        
    } catch (error) {
        console.error('[FrameExtractor Worker] Probe error:', error);
        self.postMessage({
            type: 'probe-error',
            message: error.message
        });
    }
}
