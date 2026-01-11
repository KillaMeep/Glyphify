const { app, BrowserWindow, ipcMain, dialog, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { Muxer, ArrayBufferTarget } = require('mp4-muxer');
const { GIFEncoder } = require('gif.js');

let mainWindow;

function createWindow() {
    console.log('[Main] Creating main window');
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        backgroundColor: '#1a1a2e',
        frame: false,
        titleBarStyle: 'hidden',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, '../assets/icon.ico')
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

    console.log('[Main] Window created and loaded');
    
    // Open DevTools in development
    if (process.argv.includes('--dev')) {
        console.log('[Main] Opening DevTools (development mode)');
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// IPC Handlers
ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
});

ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow?.maximize();
    }
});

ipcMain.handle('window:close', () => {
    mainWindow?.close();
});

ipcMain.handle('dialog:openFile', async (event, options) => {
    console.log('[Main] Opening file dialog');
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: options?.filters || [
            { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] },
            { name: 'Videos', extensions: ['mp4', 'webm', 'avi', 'mov'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        console.log(`[Main] File selected: ${filePath}`);
        const buffer = fs.readFileSync(filePath);
        const base64 = buffer.toString('base64');
        const ext = path.extname(filePath).toLowerCase().slice(1);
        
        let mimeType = 'image/png';
        if (['jpg', 'jpeg'].includes(ext)) mimeType = 'image/jpeg';
        else if (ext === 'gif') mimeType = 'image/gif';
        else if (ext === 'webp') mimeType = 'image/webp';
        else if (ext === 'bmp') mimeType = 'image/bmp';
        else if (ext === 'mp4') mimeType = 'video/mp4';
        else if (ext === 'webm') mimeType = 'video/webm';
        else if (ext === 'avi') mimeType = 'video/avi';
        else if (ext === 'mov') mimeType = 'video/quicktime';
        
        return {
            path: filePath,
            name: path.basename(filePath),
            data: `data:${mimeType};base64,${base64}`,
            type: mimeType.startsWith('video') ? 'video' : 'image',
            extension: ext
        };
    }
    return null;
});

ipcMain.handle('dialog:saveFile', async (event, options) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: options?.defaultPath || 'ascii-art',
        filters: options?.filters || [
            { name: 'Text File', extensions: ['txt'] },
            { name: 'HTML File', extensions: ['html'] },
            { name: 'PNG Image', extensions: ['png'] },
            { name: 'GIF Animation', extensions: ['gif'] }
        ]
    });
    
    return result.canceled ? null : result.filePath;
});

ipcMain.handle('file:save', async (event, { filePath, data, encoding }) => {
    try {
        if (encoding === 'base64') {
            const base64Data = data.replace(/^data:.*?;base64,/, '');
            fs.writeFileSync(filePath, base64Data, 'base64');
        } else {
            fs.writeFileSync(filePath, data, encoding || 'utf-8');
        }
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('file:read', async (event, filePath) => {
    try {
        const data = fs.readFileSync(filePath);
        return { success: true, data: data.toString('base64') };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Settings persistence
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

ipcMain.handle('settings:load', async () => {
    try {
        if (fs.existsSync(settingsPath)) {
            const data = fs.readFileSync(settingsPath, 'utf-8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
    return null;
});

ipcMain.handle('settings:save', async (event, settings) => {
    try {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Video encoding handlers
ipcMain.handle('video:createMuxer', async (event, { width, height, frameRate }) => {
    // Store muxer in a Map with unique ID
    const muxerId = Date.now().toString();
    const videoOptions = {
        codec: 'avc',
        width: width,
        height: height
    };
    if (Number.isFinite(frameRate) && Number.isInteger(Math.round(frameRate))) {
        videoOptions.frameRate = Math.round(frameRate);
    }
    const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: videoOptions,
        fastStart: 'in-memory'
    });
    global.muxers = global.muxers || new Map();
    global.muxers.set(muxerId, muxer);
    console.log(`[Main] Created muxer ${muxerId} for ${width}x${height} ${videoOptions.frameRate ? `@ ${videoOptions.frameRate}fps` : ''}`);
    return { muxerId };
});

ipcMain.handle('video:addChunk', async (event, { muxerId, chunkData, timestamp, duration, isKeyFrame, meta }) => {
    const muxer = global.muxers?.get(muxerId);
    if (!muxer) throw new Error('Muxer not found');

    // Convert array back to Uint8Array
    const data = new Uint8Array(chunkData);

    // Rehydrate meta.decoderConfig.description to Uint8Array if provided
    let metaForMuxer = undefined;
    if (meta && meta.decoderConfig) {
        const dc = { ...meta.decoderConfig };
        if (Array.isArray(dc.description)) {
            dc.description = new Uint8Array(dc.description);
        }
        metaForMuxer = { decoderConfig: dc };
    }

    // timestamp and duration are expected in microseconds by mp4-muxer
    const ts = timestamp !== undefined ? Number(timestamp) : 0;
    const dur = duration !== undefined ? Number(duration) : 0;

    console.log(`[Main] Adding chunk: muxer=${muxerId}, bytes=${data.byteLength}, key=${isKeyFrame}, ts=${ts}μs, dur=${dur}μs`);

    // Diagnostic: log whether decoderConfig metadata was provided
    if (metaForMuxer && metaForMuxer.decoderConfig) {
        const dc = metaForMuxer.decoderConfig;
        console.log(`[Main] Chunk meta: decoderConfig present (codec=${dc.codec || 'unknown'}, hasDescription=${!!dc.description}, hasColorSpace=${!!dc.colorSpace})`);
    } else {
        console.log('[Main] Chunk meta: none');
    }

    // Defensive fallback: if no decoderConfig has ever been provided for this muxer, inject a minimal one
    global._muxerDecoderProvided = global._muxerDecoderProvided || new Set();
    if (!metaForMuxer && !global._muxerDecoderProvided.has(muxerId)) {
        console.warn(`[Main] No decoderConfig received for muxer ${muxerId}; injecting default decoderConfig (bt709)`);
        metaForMuxer = {
            decoderConfig: {
                codec: 'avc1',
                description: undefined,
                colorSpace: {
                    primaries: 'bt709',
                    transfer: 'bt709',
                    matrix: 'bt709',
                    fullRange: false
                }
            }
        };
        global._muxerDecoderProvided.add(muxerId);
    } else if (metaForMuxer && metaForMuxer.decoderConfig) {
        global._muxerDecoderProvided.add(muxerId);
    }

    muxer.addVideoChunkRaw(
        data,
        isKeyFrame ? 'key' : 'delta',
        ts,
        dur,
        metaForMuxer,
        undefined
    );
});

ipcMain.handle('video:finalize', async (event, { muxerId }) => {
    const muxer = global.muxers?.get(muxerId);
    if (!muxer) throw new Error('Muxer not found');
    
    muxer.finalize();
    const buffer = muxer.target.buffer;
    
    // Cleanup
    global.muxers.delete(muxerId);
    console.log(`[Main] Finalized muxer ${muxerId}, size: ${buffer.byteLength} bytes`);
    
    // Return as base64 for IPC transfer
    return { data: Buffer.from(buffer).toString('base64') };
});

// GIF encoder using gif.js
let hasGifEncoder = true;
const os = require('os');

ipcMain.handle('gif:available', async () => { return hasGifEncoder; });

ipcMain.handle('gif:create', async (event, { width, height, repeat = 0, quality = 10, delay = 100 }) => {
    const gifId = Date.now().toString();
    const tmpPath = path.join(os.tmpdir(), `ascii-gif-${gifId}.gif`);

    // Create GIFEncoder instance (Node API)
    const encoder = new GIFEncoder(width, height);
    // Ensure GIF header is written (gif.js GIFEncoder requires explicit header)
    encoder.writeHeader();
    // Use a global palette (computed from first frame) and disable dithering for speed
    encoder.setGlobalPalette(true);
    encoder.setDither(false);
    const effectiveQuality = Math.min(30, Math.max(1, Math.round((quality || 10) * 1.8)));
    encoder.setQuality(effectiveQuality);
    encoder.setRepeat(repeat);
    encoder.setDelay(delay);
    console.log(`[Main] GIF encoder configured: quality=${effectiveQuality}, globalPalette=true, dither=false`);


    global.gifEncoders = global.gifEncoders || new Map();
    global.gifEncoders.set(gifId, {
        encoder,
        path: tmpPath,
        width,
        height
    });

    console.log(`[Main] Created GIF encoder ${gifId} -> ${tmpPath}`);
    return { gifId };
});

ipcMain.handle('gif:addFrames', async (event, { gifId, frames }) => {
    const info = global.gifEncoders?.get(gifId);
    if (!info) throw new Error('GIF encoder not found');
    const { encoder, width, height, delay } = info;

    for (const f of frames) {
        // Normalize incoming pixel formats: Array, Buffer, ArrayBuffer, TypedArray
        let pixels;
        try {
            if (Array.isArray(f.pixels)) {
                pixels = Uint8Array.from(f.pixels);
            } else if (Buffer.isBuffer(f.pixels)) {
                pixels = Uint8Array.from(f.pixels);
            } else if (f.pixels instanceof Uint8Array) {
                pixels = f.pixels;
            } else if (f.pixels instanceof ArrayBuffer) {
                pixels = new Uint8Array(f.pixels);
            } else if (f.pixels && typeof f.pixels === 'object' && typeof f.pixels.byteLength === 'number') {
                // covers cases where structured clone yields an object with a 'byteLength' and 'slice' etc
                pixels = new Uint8Array(f.pixels);
            } else if (f.pixels && f.pixels.data && Array.isArray(f.pixels.data)) {
                pixels = Uint8Array.from(f.pixels.data);
            } else if (f.pixels && f.pixels.data && f.pixels.data instanceof ArrayBuffer) {
                pixels = new Uint8Array(f.pixels.data);
            } else {
                console.error('[Main] Unsupported frame pixel format:', f.pixels && f.pixels.constructor && f.pixels.constructor.name, f.pixels && typeof f.pixels, Object.keys(f.pixels || {}));
                throw new Error('Unsupported frame pixel format');
            }
        } catch (err) {
            console.error('[Main] Error normalizing frame pixels:', err);
            throw err;
        }

        if (pixels.length !== width * height * 4) {
            throw new Error('Frame pixel size does not match encoder size');
        }

        const frameDelay = typeof f.delay === 'number' ? f.delay : delay;
        encoder.setDelay(Math.round(frameDelay));
        encoder.addFrame(pixels);
        // Yield to event loop
        await new Promise(resolve => setImmediate(resolve));
    }

    return { added: frames.length };
});

ipcMain.handle('gif:finalize', async (event, { gifId, savePath }) => {
    const info = global.gifEncoders?.get(gifId);
    if (!info) throw new Error('GIF encoder not found');
    const { encoder, path: tmpPath } = info;

    // Finish encoding and write to temp file
    try {
        encoder.finish();
        const dataStr = encoder.out.getData();
        const buffer = Buffer.from(dataStr, 'binary');
        fs.writeFileSync(tmpPath, buffer);

        // Log header and size for diagnostics
        const header = buffer.slice(0, 6).toString('ascii');
        console.log(`[Main] Finalized GIF ${gifId}: header=${header}, size=${buffer.byteLength} bytes`);

        const isGif = header === 'GIF89a' || header === 'GIF87a';

        if (savePath) {
            fs.copyFileSync(tmpPath, savePath);
            global.gifEncoders.delete(gifId);
            try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ }
            return { path: savePath, header, size: buffer.byteLength };
        }

        if (!isGif) {
            console.error(`[Main] Invalid GIF header for ${tmpPath}: ${header}. Keeping debug file at ${tmpPath}`);
            return { error: 'invalid_gif', header, size: buffer.byteLength, path: tmpPath };
        }

        // Return as base64 for IPC transfer
        const data = buffer.toString('base64');

        // Cleanup temp file
        global.gifEncoders.delete(gifId);
        try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ }

        return { data, header, size: buffer.byteLength };
    } catch (err) {
        console.error('[Main] GIF finalize error:', err);
        throw err;
    }
});

// Allow canceling an in-progress main-process GIF encoder (cleanup and remove temp file)
ipcMain.handle('gif:cancel', async (event, { gifId }) => {
    const info = global.gifEncoders?.get(gifId);
    if (!info) return { canceled: false };
    const { path: tmpPath } = info;

    try {
        // Drop reference so finalize won't try to return it
        global.gifEncoders.delete(gifId);
        // Attempt to remove temp file (if present)
        try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ }
        console.log(`[Main] Canceled GIF encoder ${gifId} and removed ${tmpPath}`);
        return { canceled: true };
    } catch (err) {
        console.error(`[Main] Error canceling GIF encoder ${gifId}:`, err);
        throw err;
    }
});
