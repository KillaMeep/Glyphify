/**
 * Web Worker for Video Encoding using FFmpeg.wasm
 * Provides hardware-accelerated MP4/WebM encoding in a separate thread
 */

// Create a minimal document shim for FFmpeg.wasm
self.document = {
    createElement: () => ({}),
    currentScript: { src: '' }
};

// Load FFmpeg from CDN
importScripts('https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js');

let ffmpeg = null;
let isLoaded = false;

// Initialize FFmpeg
async function loadFFmpeg() {
    if (isLoaded) return;
    
    const { FFmpeg } = FFmpegWASM;
    ffmpeg = new FFmpeg();
    
    // Set up logging
    ffmpeg.on('log', ({ message }) => {
        console.log('[FFmpeg]', message);
    });
    
    ffmpeg.on('progress', ({ progress, time }) => {
        // Scale progress: 0.1-1.0 (10% was frame writing, 90% is encoding)
        const scaledProgress = 0.1 + (progress * 0.9);
        self.postMessage({ type: 'progress', progress: scaledProgress });
    });
    
    // Load FFmpeg core
    self.postMessage({ type: 'status', message: 'Loading FFmpeg...' });
    await ffmpeg.load({
        coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
        wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
    });
    
    isLoaded = true;
    self.postMessage({ type: 'status', message: 'FFmpeg loaded' });
}

// Encode frames to video
async function encodeVideo(frames, width, height, fps, format, quality, abortSignal) {
    try {
        await loadFFmpeg();
        
        if (abortSignal?.aborted) {
            throw new Error('Aborted by user');
        }
        
        self.postMessage({ type: 'status', message: 'Preparing video stream...' });
        
        // Write raw RGBA frames as a single raw video file (much faster)
        // Concatenate all frames into one buffer
        const frameSize = width * height * 4; // RGBA = 4 bytes per pixel
        const totalSize = frameSize * frames.length;
        const rawVideo = new Uint8Array(totalSize);
        
        for (let i = 0; i < frames.length; i++) {
            if (abortSignal?.aborted) {
                throw new Error('Aborted by user');
            }
            
            rawVideo.set(frames[i], i * frameSize);
            
            if (i % 10 === 0) { // Update progress every 10 frames
                self.postMessage({ 
                    type: 'progress', 
                    progress: (i / frames.length) * 0.1  // First 10% is writing
                });
            }
        }
        
        // Write the raw video file
        await ffmpeg.writeFile('input.rgba', rawVideo);
        
        self.postMessage({ type: 'status', message: `Encoding ${format.toUpperCase()}...` });
        
        // Build FFmpeg command based on format
        // Input is raw RGBA video stream
        let codecArgs, outputFile;
        
        if (format === 'mp4') {
            outputFile = 'output.mp4';
            // H.264 encoding with RAW RGBA input (no PNG decode overhead)
            codecArgs = [
                '-f', 'rawvideo',              // Input format: raw video
                '-pixel_format', 'rgba',       // RGBA pixel format
                '-video_size', `${width}x${height}`,  // Frame dimensions
                '-framerate', fps.toString(),  // Frame rate
                '-i', 'input.rgba',            // Input file
                '-c:v', 'libx264',             // H.264 codec
                '-preset', 'ultrafast',        // Fast encoding
                '-crf', '23',                  // Quality (lower = better)
                '-pix_fmt', 'yuv420p',         // Output pixel format
                '-movflags', '+faststart',     // Web optimization
                outputFile
            ];
        } else if (format === 'webm') {
            outputFile = 'output.webm';
            // VP9 encoding with RAW RGBA input - proper frame-accurate encoding
            codecArgs = [
                '-f', 'rawvideo',
                '-pixel_format', 'rgba',
                '-video_size', `${width}x${height}`,
                '-framerate', fps.toString(),
                '-i', 'input.rgba',
                '-c:v', 'libvpx-vp9',
                '-deadline', 'realtime',       // Fast encoding
                '-cpu-used', '8',              // Fastest CPU preset
                '-b:v', '2M',                  // 2 Mbps target bitrate
                '-crf', '30',                  // Quality (4-63, lower=better)
                '-pix_fmt', 'yuv420p',         // Output pixel format
                '-row-mt', '1',                // Multi-threaded rows
                outputFile
            ];
        } else {
            throw new Error(`Unsupported format: ${format}`);
        }
        
        // Run FFmpeg encoding with timeout
        console.log('[Worker] Running FFmpeg with args:', codecArgs.join(' '));
        self.postMessage({ type: 'status', message: `Encoding ${format.toUpperCase()} video...` });
        
        if (abortSignal?.aborted) {
            throw new Error('Aborted by user');
        }
        
        try {
            // Create timeout promise (60 seconds max)
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('FFmpeg encoding timeout (60s)')), 60000)
            );
            
            // Race between FFmpeg and timeout
            await Promise.race([
                ffmpeg.exec(codecArgs),
                timeoutPromise
            ]);
            
            console.log('[Worker] FFmpeg encoding complete');
        } catch (execError) {
            console.error('[Worker] FFmpeg exec error:', execError);
            throw new Error(`FFmpeg encoding failed: ${execError.message}`);
        }
        
        self.postMessage({ type: 'status', message: 'Reading output...' });
        self.postMessage({ type: 'progress', progress: 0.95 });
        
        // Read the output file
        const data = await ffmpeg.readFile(outputFile);
        
        // Clean up
        self.postMessage({ type: 'status', message: 'Cleaning up...' });
        
        // Delete input and output files
        try {
            await ffmpeg.deleteFile('input.rgba');
        } catch (e) {
            // Ignore deletion errors
        }
        try {
            await ffmpeg.deleteFile(outputFile);
        } catch (e) {
            // Ignore deletion errors
        }
        
        // Send the result
        self.postMessage({
            type: 'complete',
            data: data.buffer
        }, [data.buffer]);
        
    } catch (error) {
        self.postMessage({
            type: 'error',
            error: error.message
        });
    }
}

// Global abort controller for this worker
let workerAborted = false;

// Message handler
self.onmessage = async function(e) {
    if (e.data.type === 'abort') {
        console.log('[Worker] Abort signal received');
        workerAborted = true;
        return;
    }
    
    const { frames, width, height, fps, format, quality } = e.data;
    workerAborted = false;
    
    // Create mock abort signal
    const abortSignal = {
        get aborted() { return workerAborted; }
    };
    
    await encodeVideo(frames, width, height, fps, format, quality, abortSignal);
};
