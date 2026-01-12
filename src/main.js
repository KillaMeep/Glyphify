const { app, BrowserWindow, ipcMain, dialog, nativeTheme, shell } = require('electron');
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

app.whenReady().then(async () => {
    await createWindow();

    // Start update checks on startup and every 24 hours
    try {
        const updater = require('./update-checker');
        // Run once on startup (silent = true to avoid noisy logs). Let the updater auto-detect the running version.
        console.log('[Main] Initializing updater and running first check');
        updater.checkForUpdates({ owner: 'KillaMeep', repo: 'Glyphify', window: mainWindow, silent: true });
        // Periodic check every 24 hours
        const intervalMs = 24 * 60 * 60 * 1000;
        setInterval(() => {
            console.log('[Main] Running scheduled update check');
            updater.checkForUpdates({ owner: 'KillaMeep', repo: 'Glyphify', window: mainWindow });
        }, intervalMs);
        console.log(`[Main] Scheduled recurring update check every ${intervalMs}ms`);

        // Expose manual check via IPC
        ipcMain.handle('updater:check', async (event) => {
            console.log('[Main] Manual update check requested from renderer');
            const result = await updater.checkForUpdates({ owner: 'KillaMeep', repo: 'Glyphify', window: mainWindow });
            console.log('[Main] Manual update check result:', result && (result.updateAvailable === true ? `update ${result.latestTag}` : result.error || 'no update'));
            console.log('[Main] Manual update check current version:', result && result.currentVersion ? result.currentVersion : '(unknown)');
            return result;
        });
    } catch (e) {
        console.warn('[Main] Updater failed to initialize:', e);
    }
});

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
        
        const isGif = ext === 'gif';
        const isVideo = mimeType.startsWith('video') || isGif;

        return {
            path: filePath,
            name: path.basename(filePath),
            data: `data:${mimeType};base64,${base64}`,
            type: isVideo ? 'video' : 'image',
            extension: ext,
            isGif: isGif
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

// Allow renderer to query the packaged/current app version
ipcMain.handle('app:getVersion', async () => {
    try {
        return app.getVersion();
    } catch (e) {
        console.warn('[Main] app.getVersion failed:', e && e.message);
        return null;
    }
});

// Probe video/GIF metadata using system ffprobe (fallback for when worker probe times out)
ipcMain.handle('probe:video', async (event, payload) => {
    let tmpFile = null;
    try {
        // Normalize payload to Buffer
        let buffer = null;
        if (typeof payload === 'string') {
            // data URL
            const m = payload.match(/^data:(.*?);base64,(.*)$/);
            if (!m) throw new Error('invalid_data_url');
            buffer = Buffer.from(m[2], 'base64');
        } else if (payload && payload.dataUrl) {
            const m = payload.dataUrl.match(/^data:(.*?);base64,(.*)$/);
            if (!m) throw new Error('invalid_data_url');
            buffer = Buffer.from(m[2], 'base64');
        } else if (payload && (payload.buffer || payload.byteLength)) {
            // structured clone may give typed array
            buffer = Buffer.from(payload.buffer ? payload.buffer : payload);
        } else {
            throw new Error('unsupported_payload');
        }

        const ext = (payload && payload.extension) ? `.${payload.extension}` : '';
        tmpFile = path.join(os.tmpdir(), `glyphify-probe-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
        fs.writeFileSync(tmpFile, buffer);

        const ffprobePath = require('ffprobe-static').path;
        const util = require('util');
        const execFile = util.promisify(require('child_process').execFile);
        const args = ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_frames', tmpFile];

        console.log('[Main] Running ffprobe on', tmpFile);
        const { stdout } = await execFile(ffprobePath, args, { maxBuffer: 200 * 1024 * 1024 });
        const parsed = JSON.parse(stdout);

        let fps = null;
        let frames = null;
        const s = parsed.streams && parsed.streams[0];
        if (s) {
            const rate = s.avg_frame_rate || s.r_frame_rate;
            if (rate && rate !== '0/0') {
                const parts = rate.split('/');
                if (parts.length === 2 && Number(parts[1]) !== 0) {
                    fps = Number(parts[0]) / Number(parts[1]);
                }
            }
            if (s.nb_frames) frames = parseInt(s.nb_frames, 10);
        }
        if ((!frames || frames === 0) && Array.isArray(parsed.frames)) {
            frames = parsed.frames.length;
        }

        console.log('[Main] ffprobe result:', { fps, frames });
        return { success: true, fps: fps ? Math.round(fps * 100) / 100 : null, frames: frames || null, raw: parsed };
    } catch (err) {
        console.error('[Main] probe:video failed:', err);
        return { success: false, error: err && err.message ? err.message : String(err) };
    } finally {
        try { if (tmpFile) fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }
    }
});

// Extract frames using native ffmpeg (fallback when worker stalls)
ipcMain.handle('extract:frames', async (event, payload) => {
    let tmpFile = null;
    let tmpDir = null;
    try {
        // Normalize payload to Buffer
        let buffer = null;
        if (typeof payload === 'string') {
            const m = payload.match(/^data:(.*?);base64,(.*)$/);
            if (!m) throw new Error('invalid_data_url');
            buffer = Buffer.from(m[2], 'base64');
        } else if (payload && payload.dataUrl) {
            const m = payload.dataUrl.match(/^data:(.*?);base64,(.*)$/);
            if (!m) throw new Error('invalid_data_url');
            buffer = Buffer.from(m[2], 'base64');
        } else if (payload && (payload.buffer || payload.byteLength)) {
            buffer = Buffer.from(payload.buffer ? payload.buffer : payload);
        } else {
            throw new Error('unsupported_payload');
        }

        const ext = (payload && payload.extension) ? `.${payload.extension}` : '';
        tmpFile = path.join(os.tmpdir(), `glyphify-extract-${Date.now()}${ext}`);
        fs.writeFileSync(tmpFile, buffer);

        // Prepare temp directory for frames
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glyphify-extract-'));

        const ffmpegPath = require('ffmpeg-static');
        const ffprobePath = require('ffprobe-static').path;
        const util = require('util');
        const execFile = util.promisify(require('child_process').execFile);
        const spawn = require('child_process').spawn;

        // Run ffprobe to estimate total frames/duration so we can report progress
        let expectedFrames = null;
        try {
            const probeArgs = ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', tmpFile];
            console.log('[Main] Probing for duration/frame info before extraction');
            const { stdout: probeOut } = await execFile(ffprobePath, probeArgs, { maxBuffer: 200 * 1024 * 1024 });
            const parsedProbe = JSON.parse(probeOut);
            const s = parsedProbe.streams && parsedProbe.streams[0];
            const format = parsedProbe.format || {};
            const duration = parseFloat(format.duration) || (s && s.duration ? parseFloat(s.duration) : null);
            let avgRate = null;
            if (s) {
                const rate = s.avg_frame_rate || s.r_frame_rate;
                if (rate && rate !== '0/0') {
                    const parts = rate.split('/');
                    if (parts.length === 2 && Number(parts[1]) !== 0) {
                        avgRate = Number(parts[0]) / Number(parts[1]);
                    }
                }
                if (s.nb_frames) expectedFrames = parseInt(s.nb_frames, 10);
            }
            if (!expectedFrames && duration) {
                const useFps = payload && payload.frameRate ? payload.frameRate : (avgRate || 25);
                expectedFrames = Math.max(1, Math.round(duration * useFps));
            }
            console.log('[Main] Expected frames estimate:', expectedFrames);
        } catch (probeErr) {
            console.warn('[Main] Pre-extract probe failed:', probeErr && probeErr.message);
        }

        // Optional frameRate limiting
        const args = ['-i', tmpFile, '-vsync', '0'];
        if (payload && payload.frameRate) {
            args.push('-vf', `fps=${payload.frameRate}`);
        }
        args.push(path.join(tmpDir, 'frame%05d.png'));

        console.log('[Main] Running ffmpeg to extract frames ->', args.join(' '));

        // Spawn ffmpeg and poll tmpDir for progress
        await new Promise((resolveRun, rejectRun) => {
            const ff = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'ignore'] });
            let lastSent = 0;

            const pollInterval = setInterval(() => {
                try {
                    const files = fs.readdirSync(tmpDir).filter(n => n.endsWith('.png'));
                    const current = files.length;
                    let percent = null;
                    if (expectedFrames) {
                        percent = Math.min(99, Math.round((current / expectedFrames) * 100));
                    } else {
                        // Heuristic: use current frames vs an arbitrary cap
                        const cap = Math.max(100, current, 500);
                        percent = Math.min(99, Math.round((current / cap) * 100));
                    }
                    if (percent !== lastSent) {
                        lastSent = percent;
                        try { event.sender.send('extract:frames:progress', { current, total: expectedFrames, percent }); } catch (e) { /* ignore */ }
                    }
                } catch (e) {
                    // ignore read errors
                }
            }, 400);

            ff.on('error', (err) => {
                clearInterval(pollInterval);
                rejectRun(err);
            });

            ff.on('exit', (code, sig) => {
                clearInterval(pollInterval);
                try { event.sender.send('extract:frames:progress', { current: expectedFrames || 0, total: expectedFrames || 0, percent: 100 }); } catch (e) {}
                if (code === 0) resolveRun(); else rejectRun(new Error('ffmpeg_failed'));
            });
        });

        // Use ffprobe to read frame timestamps
        const probeArgs = ['-v', 'quiet', '-print_format', 'json', '-show_frames', tmpFile];
        const { stdout } = await execFile(ffprobePath, probeArgs, { maxBuffer: 200 * 1024 * 1024 });
        const parsed = JSON.parse(stdout);
        const timestamps = Array.isArray(parsed.frames) ? parsed.frames.map(f => {
            return (f.best_effort_timestamp_time || f.pkt_pts_time || f.pts_time || f.time) ? Number(f.best_effort_timestamp_time || f.pkt_pts_time || f.pts_time || f.time) : null;
        }) : [];

        // Read extracted frames
        const files = fs.readdirSync(tmpDir).filter(n => n.endsWith('.png')).sort();

        // Safety cap
        const maxFrames = 1000;
        if (files.length === 0) throw new Error('no_frames_extracted');
        if (files.length > maxFrames) throw new Error('too_many_frames');

        const PNG = require('pngjs').PNG;
        const frames = [];
        for (let i = 0; i < files.length; i++) {
            const p = path.join(tmpDir, files[i]);
            const buf = fs.readFileSync(p);
            const png = PNG.sync.read(buf);
            const width = png.width;
            const height = png.height;
            const pixels = Buffer.from(png.data); // RGBA

            // Derive delay using timestamps when available
            let delay = null;
            if (timestamps && timestamps.length > i) {
                const t0 = timestamps[i];
                const t1 = timestamps[i + 1] || null;
                if (t0 != null && t1 != null) {
                    delay = Math.round((t1 - t0) * 1000);
                }
            }
            // Fallback delay
            if (!delay) delay = Math.round(1000 / (payload && payload.frameRate ? payload.frameRate : 25));

            frames.push({ width, height, pixels, delay });
        }

        // Cleanup
        try { fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }

        const fps = null; // best-effort FPS can be computed from timestamps
        return { success: true, fps, framesCount: frames.length, frames };
    } catch (err) {
        console.error('[Main] extract:frames failed:', err);
        try { if (tmpFile) fs.unlinkSync(tmpFile); } catch (e) {}
        try { if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
        return { success: false, error: err && err.message ? err.message : String(err) };
    }
});

// Open external URLs using the OS default browser
ipcMain.handle('open-external', async (event, url) => {
    try {
        if (!url || typeof url !== 'string') return { success: false, error: 'invalid_url' };
        console.log(`[Main] open-external -> ${url}`);
        await shell.openExternal(url);
        return { success: true };
    } catch (err) {
        console.error('[Main] open-external error:', err);
        return { success: false, error: err.message };
    }
});
