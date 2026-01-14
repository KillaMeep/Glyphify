const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Window controls
    minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
    maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
    closeWindow: () => ipcRenderer.invoke('window:close'),
    
    // File dialogs
    openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
    saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),
    
    // File operations
    writeFile: (filePath, data, encoding) => ipcRenderer.invoke('file:save', { filePath, data, encoding }),
    readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
    
    // Settings
    loadSettings: () => ipcRenderer.invoke('settings:load'),
    saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
    
    // Video encoding (via main process mp4-muxer)
    createVideoMuxer: (width, height, frameRate) => ipcRenderer.invoke('video:createMuxer', { width, height, frameRate }),
    addVideoChunk: (muxerId, chunkData, timestamp, duration, isKeyFrame, meta) => 
        ipcRenderer.invoke('video:addChunk', { muxerId, chunkData, timestamp, duration, isKeyFrame, meta }),
    finalizeVideo: (muxerId) => ipcRenderer.invoke('video:finalize', { muxerId }),

    // GIF encoding (via main process gifencoder)
    isGifEncoderAvailable: () => ipcRenderer.invoke('gif:available'),
    createGifEncoder: (opts) => ipcRenderer.invoke('gif:create', opts),
    addGifFrames: (gifId, frames) => ipcRenderer.invoke('gif:addFrames', { gifId, frames }),
    finalizeGif: (gifId, savePath) => ipcRenderer.invoke('gif:finalize', { gifId, savePath }),
    cancelGif: (gifId) => ipcRenderer.invoke('gif:cancel', { gifId }),

    // Updater
    checkForUpdates: () => ipcRenderer.invoke('updater:check'),
    onUpdateAvailable: (callback) => ipcRenderer.on('update:available', (event, payload) => callback(payload)),
    onUpdateSkipped: (callback) => ipcRenderer.on('update:skipped', (event, payload) => callback(payload)),
    // App info
    getAppVersion: () => ipcRenderer.invoke('app:getVersion'),

    // Video probe (Node-side ffprobe fallback). Accepts a data URL string or Uint8Array-like payload.
    probeVideoNode: (payload) => ipcRenderer.invoke('probe:video', payload),

    // Frame extraction (Node-side ffmpeg fallback)
    extractFramesNode: (payload) => ipcRenderer.invoke('extract:frames', payload),
    // Subscribe to native extraction progress; returns an unsubscribe function
    onExtractProgress: (callback) => {
        const handler = (event, payload) => callback(payload);
        ipcRenderer.on('extract:frames:progress', handler);
        return () => ipcRenderer.removeListener('extract:frames:progress', handler);
    },
    // One-time progress listener for native extraction (the callback will be removed after first call)
    onExtractProgressOnce: (callback) => {
        const handler = (event, payload) => {
            try { callback(payload); } finally { ipcRenderer.removeListener('extract:frames:progress', handler); }
        };
        ipcRenderer.on('extract:frames:progress', handler);
    },

    // Open external URLs in the user's default browser
    openExternal: (url) => ipcRenderer.invoke('open-external', url)
});
