/**
 * Glyphify - Renderer Process
 * Handles UI interactions and conversion logic
 */

// ============================================
// State Management
// ============================================
const state = {
    currentFile: null,
    currentType: null, // 'image' or 'video'
    asciiResult: null,
    converter: null,
    animationEncoder: null, // For video/GIF animation export
    animationPlayer: null, // For playing animation preview
    progressStartTime: null,
    sourceFPS: 0,
    videoDuration: 0,
    frameCache: null, // Cached extracted frames
    backgroundProcessing: false,
    abortController: null, // For canceling operations
    settings: {
        theme: 'dark',
        font: "'Consolas', monospace",
        livePreview: true,
        useWebWorker: true,
        previewQuality: 'medium',
        defaultWidth: 100,
        defaultCharset: 'standard',
        defaultMode: 'color',
        includeStyles: true,
        pngScale: 2,
        gifQuality: 10,
        backgroundColor: '#00000000' // Transparent black
    },

};

// ============================================
// DOM Elements
// ============================================
const elements = {
    // Window controls
    minimizeBtn: document.getElementById('minimizeBtn'),
    maximizeBtn: document.getElementById('maximizeBtn'),
    closeBtn: document.getElementById('closeBtn'),
    
    // Navigation
    navTabs: document.querySelectorAll('.nav-tab'),
    tabContents: document.querySelectorAll('.tab-content'),
    
    // Input panel
    dropZone: document.getElementById('dropZone'),
    browseBtn: document.getElementById('browseBtn'),
    clearInputBtn: document.getElementById('clearInputBtn'),
    previewContainer: document.getElementById('previewContainer'),
    imagePreview: document.getElementById('imagePreview'),
    videoPreview: document.getElementById('videoPreview'),
    mediaInfo: document.getElementById('mediaInfo'),
    
    // Controls
    toggleBtns: document.querySelectorAll('.toggle-btn'),
    charsetSelect: document.getElementById('charsetSelect'),
    customCharset: document.getElementById('customCharset'),
    widthSlider: document.getElementById('widthSlider'),
    widthValue: document.getElementById('widthValue'),
    fontSizeSlider: document.getElementById('fontSizeSlider'),
    fontSizeValue: document.getElementById('fontSizeValue'),
    lineHeightSlider: document.getElementById('lineHeightSlider'),
    lineHeightValue: document.getElementById('lineHeightValue'),
    contrastSlider: document.getElementById('contrastSlider'),
    contrastValue: document.getElementById('contrastValue'),
    brightnessSlider: document.getElementById('brightnessSlider'),
    brightnessValue: document.getElementById('brightnessValue'),
    invertCheck: document.getElementById('invertCheck'),
    bgColorPicker: document.getElementById('bgColorPicker'),
    bgColorText: document.getElementById('bgColorText'),
    gifOptions: document.getElementById('gifOptions'),
    sourceFPS: document.getElementById('sourceFPS'),
    frameRate: document.getElementById('frameRate'),
    convertBtn: document.getElementById('convertBtn'),
    
    // Output panel
    outputContainer: document.getElementById('outputContainer'),
    asciiOutput: document.getElementById('asciiOutput'),
    outputCanvas: document.getElementById('outputCanvas'),
    outputStatus: document.getElementById('outputStatus'),
    copyBtn: document.getElementById('copyBtn'),
    saveBtn: document.getElementById('saveBtn'),
    saveFormatSelect: document.getElementById('saveFormatSelect'),
    
    // Settings
    themeSelect: document.getElementById('themeSelect'),
    fontSelect: document.getElementById('fontSelect'),
    livePreviewCheck: document.getElementById('livePreviewCheck'),
    webWorkerCheck: document.getElementById('webWorkerCheck'),
    previewQualitySelect: document.getElementById('previewQualitySelect'),
    defaultWidthInput: document.getElementById('defaultWidthInput'),
    defaultCharsetSelect: document.getElementById('defaultCharsetSelect'),
    defaultModeSelect: document.getElementById('defaultModeSelect'),
    includeStylesCheck: document.getElementById('includeStylesCheck'),
    pngScaleSelect: document.getElementById('pngScaleSelect'),
    gifQualitySelect: document.getElementById('gifQualitySelect'),
    resetSettingsBtn: document.getElementById('resetSettingsBtn'),
    settingsSavedIndicator: document.getElementById('settingsSavedIndicator'),
    checkUpdatesBtn: document.getElementById('checkUpdatesBtn'),
    

    
    // Loading
    loadingOverlay: document.getElementById('loadingOverlay'),
    loadingText: document.getElementById('loadingText'),
    progressFill: document.getElementById('progressFill'),
    progressTime: document.getElementById('progressTime'),
    abortBtn: document.getElementById('abortBtn'),
    
    // Toast
    toastContainer: document.getElementById('toastContainer')
};

// ============================================
// Initialization
// ============================================
async function init() {
    // Load settings
    await loadSettings();
    
    // Initialize converter
    state.converter = new ASCIIConverter({
        width: state.settings.defaultWidth,
        charset: state.settings.defaultCharset,
        colorMode: state.settings.defaultMode
    });
    
    // Apply loaded settings to UI
    applySettingsToUI();
    
    // Setup event listeners
    setupWindowControls();
    setupNavigation();
    setupDropZone();
    setupControls();
    setupOutput();
    setupSettings();
    setupKeyboardShortcuts();

    // Intercept external links and open them in the user's default browser
    document.addEventListener('click', (e) => {
        const a = e.target.closest && e.target.closest('a[target="_blank"]');
        if (!a) return;
        const href = a.getAttribute('href');
        if (href && href.startsWith('http')) {
            e.preventDefault();
            window.electronAPI.openExternal(href).then((res) => {
                if (!res || !res.success) console.warn('openExternal failed', res && res.error);
            }).catch(err => console.error('openExternal error', err));
        }
    });

    // Listen for update events from main and show actionable toast
    try {
        window.electronAPI.onUpdateAvailable((payload) => {
            console.log('[Renderer] Received update:available payload', payload);
            const msg = `Update ${payload.latestTag} available — click to view release`;
            const toast = document.createElement('div');
            toast.className = 'toast update available';
            toast.innerHTML = `\n                <span class="toast-message">${msg}</span>\n                <button class="toast-action">View release</button>\n                <button class="toast-close">×</button>\n            `;
            elements.toastContainer.appendChild(toast);
            const action = toast.querySelector('.toast-action');
            const close = toast.querySelector('.toast-close');
            action.addEventListener('click', () => {
                window.electronAPI.openExternal(payload.url);
                toast.remove();
            });
            close.addEventListener('click', () => toast.remove());
            setTimeout(() => { if (toast.parentElement) toast.remove(); }, 15000);
        });
    } catch (e) {
        console.warn('[Renderer] Updater integration failed:', e);
    }

    // Update About version text to detected app version
    (async () => {
        try {
            const v = await window.electronAPI.getAppVersion();
            const el = document.querySelector('.version');
            if (el) el.textContent = `Version ${v || 'Unknown'}`;
        } catch (e) {
            console.warn('[App] getAppVersion failed', e);
        }
    })();
}

// ============================================
// Settings Management
// ============================================
async function loadSettings() {
    try {
        const saved = await window.electronAPI.loadSettings();
        if (saved) {
            state.settings = { ...state.settings, ...saved.settings };
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

async function saveSettings(showNotification = false) {
    try {
        await window.electronAPI.saveSettings({ settings: state.settings });
        if (showNotification) {
            showToast('Settings saved', 'success');
        } else {
            // Show small inline saved indicator
            const el = elements.settingsSavedIndicator;
            if (el) {
                el.hidden = false;
                el.classList.add('show');
                setTimeout(() => {
                    el.classList.remove('show');
                    el.hidden = true;
                }, 1400);
            }
        }
        return { success: true };
    } catch (error) {
        if (showNotification) showToast('Failed to save settings', 'error');
        return { success: false, error: error.message };
    }
}

function applySettingsToUI() {
    // Apply theme
    document.body.setAttribute('data-theme', state.settings.theme);
    elements.themeSelect.value = state.settings.theme;
    
    // Apply font
    elements.fontSelect.value = state.settings.font;
    elements.asciiOutput.style.fontFamily = state.settings.font;
    
    // Apply other settings
    elements.livePreviewCheck.checked = state.settings.livePreview;
    elements.webWorkerCheck.checked = state.settings.useWebWorker;
    elements.previewQualitySelect.value = state.settings.previewQuality;
    elements.defaultWidthInput.value = state.settings.defaultWidth;
    elements.defaultCharsetSelect.value = state.settings.defaultCharset;
    elements.defaultModeSelect.value = state.settings.defaultMode;
    elements.includeStylesCheck.checked = state.settings.includeStyles;
    elements.pngScaleSelect.value = state.settings.pngScale;
    elements.gifQualitySelect.value = state.settings.gifQuality;
    
    // Apply defaults to controls
    elements.widthSlider.value = state.settings.defaultWidth;
    elements.widthValue.textContent = state.settings.defaultWidth;
    elements.charsetSelect.value = state.settings.defaultCharset;
    
    // Set background color (handle both 6 and 8 char hex)
    const bgColor = state.settings.backgroundColor || '#00000000';
    elements.bgColorText.value = bgColor;
    if (bgColor.length >= 7) {
        elements.bgColorPicker.value = bgColor.substring(0, 7);
    }
    
    // Set color mode toggle
    elements.toggleBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === state.settings.defaultMode);
    });
}

// ============================================
// Window Controls
// ============================================
function setupWindowControls() {
    elements.minimizeBtn.addEventListener('click', () => {
        window.electronAPI.minimizeWindow();
    });
    
    elements.maximizeBtn.addEventListener('click', () => {
        window.electronAPI.maximizeWindow();
    });
    
    elements.closeBtn.addEventListener('click', () => {
        window.electronAPI.closeWindow();
    });
}

// ============================================
// Navigation
// ============================================
function setupNavigation() {
    elements.navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            
            // Update active tab
            elements.navTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Show corresponding content
            elements.tabContents.forEach(content => {
                content.classList.toggle('active', content.id === `tab-${tabId}`);
            });
        });
    });
}

// ============================================
// Drop Zone & File Handling
// ============================================
function setupDropZone() {
    const dropZone = elements.dropZone;
    
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    
    // Highlight drop zone
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('drag-over');
        });
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('drag-over');
        });
    });
    
    // Handle drop
    dropZone.addEventListener('drop', handleDrop);
    
    // Browse button
    elements.browseBtn.addEventListener('click', handleBrowse);
    
    // Clear button
    elements.clearInputBtn.addEventListener('click', clearInput);
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

async function handleDrop(e) {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        await loadFile(files[0]);
    }
}

async function handleBrowse() {
    const result = await window.electronAPI.openFile();
    if (result) {
        await loadFileFromResult(result);
    }
}

async function loadFile(file) {
    // Revoke any temporary object URLs from previous previews
    try {
        if (state._tempPreviewObjectUrl) {
            URL.revokeObjectURL(state._tempPreviewObjectUrl);
            delete state._tempPreviewObjectUrl;
        }
    } catch (e) { /* ignore */ }

    // Reset preview fallback indicator when switching files
    try { hidePlaybackFallback(); } catch (e) {}

    console.log(`[Load] Loading file: ${file.name}, type: ${file.type}`);
    const reader = new FileReader();
    
    reader.onload = async (e) => {
        const dataUrl = e.target.result;
        const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
        const isVideo = file.type.startsWith('video/') || isGif;
        
        state.currentFile = {
            name: file.name,
            type: file.type,
            data: dataUrl,
            isGif: isGif
        };
        state.currentType = isVideo ? 'video' : 'image';
        
        await displayPreview(dataUrl, isVideo, isGif);
    };
    
    reader.readAsDataURL(file);
}

async function loadFileFromResult(result) {
    state.currentFile = result;
    // result.type may already be 'video' for GIFs returned from main
    state.currentType = result.isGif ? 'video' : result.type;
    
    await displayPreview(result.data, state.currentType === 'video', result.isGif);
}

async function displayPreview(dataUrl, isVideo, isGif = false) {
    console.log(`[Preview] Displaying ${isVideo ? (isGif ? 'GIF' : 'video') : 'image'} preview`);
    // Show preview container
    elements.previewContainer.classList.remove('hidden');
    document.querySelector('.drop-zone-content').classList.add('hidden');

    // Disable convert until the media preview is ready
    elements.convertBtn.disabled = true;
    
    if (isVideo && !isGif) {
        elements.imagePreview.classList.add('hidden');
        elements.videoPreview.classList.remove('hidden');
        elements.videoPreview.src = dataUrl;
        elements.videoPreview.loop = true; // Enable looping immediately
        elements.gifOptions.classList.remove('hidden');
        
        // Start playing the video immediately
        elements.videoPreview.play().catch(err => {
            console.warn('[Preview] Initial autoplay blocked:', err);
        });

        // Quick capability check: if the HTML video element cannot play this MIME, fall back
        try {
            const mime = state.currentFile && state.currentFile.type ? state.currentFile.type : null;
            if (mime && typeof elements.videoPreview.canPlayType === 'function') {
                const can = elements.videoPreview.canPlayType(mime);
                if (!can || can === '') {
                    console.warn('[Preview] Video MIME not supported by video element:', mime);
                    // Hide video and show image fallback (use object URL for better GIF compatibility)
                    elements.videoPreview.pause();
                    elements.videoPreview.classList.add('hidden');
                    elements.imagePreview.classList.remove('hidden');
                    (async () => {
                        try {
                            const blob = await dataUrlToBlob(dataUrl, mime);
                            const objUrl = URL.createObjectURL(blob);
                            // Store to revoke later if needed
                            state._tempPreviewObjectUrl = objUrl;
                            elements.imagePreview.src = objUrl;
                            elements.gifOptions.classList.remove('hidden');
                            showToast('Video format not supported by native playback; using frame extraction for animation.', 'warning');
                            showPlaybackFallback('Video playback not supported — using extracted frames');
                            // Kick off extraction in background to enable animation
                            startBackgroundProcessing().catch(err => console.warn('[Preview] Background extraction failed:', err));
                        } catch (err) {
                            console.warn('[Preview] Fallback image creation failed:', err);
                            elements.imagePreview.src = dataUrl;
                        }
                    })();
                    return; // Skip onloadedmetadata handlers since video won't be used
                }
            }
        } catch (err) {
            console.warn('[Preview] Video capability detection failed:', err);
        }
        
        elements.videoPreview.onloadedmetadata = async () => {
            const duration = elements.videoPreview.duration.toFixed(1);
            const width = elements.videoPreview.videoWidth;
            const height = elements.videoPreview.videoHeight;
            
            console.log(`[Preview] Video metadata: ${width}x${height}, ${duration}s`);

            // Try to detect source FPS from playback (requestVideoFrameCallback)
            state.videoDuration = elements.videoPreview.duration;

            async function detectFPSFromPlayback(videoEl) {
                if (!videoEl.requestVideoFrameCallback) return null;
                return await new Promise((resolve) => {
                    let count = 0;
                    let startTs = null;
                    const maxMs = 1200;
                    const stop = () => {
                        videoEl.pause();
                        videoEl.currentTime = 0;
                    };
                    const cb = (now, metadata) => {
                        if (startTs === null) startTs = now;
                        count += 1;
                        const elapsed = now - startTs;
                        if (elapsed >= 500 && count >= 5) {
                            stop();
                            resolve((count - 1) / (elapsed / 1000));
                            return;
                        }
                        if (elapsed >= maxMs) {
                            stop();
                            resolve(count / (elapsed / 1000));
                            return;
                        }
                        videoEl.requestVideoFrameCallback(cb);
                    };
                    videoEl.currentTime = 0; // Start from beginning
                    videoEl.play().then(() => {
                        videoEl.requestVideoFrameCallback(cb);
                    }).catch(() => resolve(null));
                });
            }

            let detectedFPS = await detectFPSFromPlayback(elements.videoPreview);
            
            // Restart video playback after FPS detection
            elements.videoPreview.currentTime = 0;
            elements.videoPreview.loop = true; // Ensure loop is set
            elements.videoPreview.play().catch(err => {
                console.warn('[Preview] Video playback error after FPS detection:', err);
            });

            // Fallback methods if playback detection fails
            if (!detectedFPS && elements.videoPreview.mozFrameDelay) {
                detectedFPS = 1 / elements.videoPreview.mozFrameDelay;
                console.log(`[Preview] Detected FPS from mozFrameDelay: ${detectedFPS}`);
            } else if (!detectedFPS && elements.videoPreview.getVideoPlaybackQuality) {
                const quality = elements.videoPreview.getVideoPlaybackQuality();
                if (quality.totalVideoFrames && duration > 0) {
                    detectedFPS = quality.totalVideoFrames / duration;
                    console.log(`[Preview] Calculated FPS from frame count: ${detectedFPS.toFixed(2)}`);
                }
            }

            // Heuristic fallback
            if (!detectedFPS) {
                console.log('[Preview] No FPS data, using heuristic');
                const commonFPS = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];
                let bestMatch = 30;
                let bestError = Infinity;
                for (const fps of commonFPS) {
                    const frameCount = duration * fps;
                    const error = Math.abs(frameCount - Math.round(frameCount));
                    if (error < bestError) {
                        bestError = error;
                        bestMatch = fps;
                    }
                }
                detectedFPS = bestMatch;
                console.log(`[Preview] Estimated FPS from common rates: ${detectedFPS}`);
            }

            state.sourceFPS = Math.round(detectedFPS * 100) / 100;
            console.log(`[Preview] Final detected FPS: ${state.sourceFPS}`);
            
            // Update UI - set frameRate input to detected FPS
            if (elements.frameRate) elements.frameRate.value = state.sourceFPS;
            if (elements.mediaInfo) elements.mediaInfo.textContent = `${state.currentFile.name} • ${width}x${height} • ${duration}s • ${state.sourceFPS}fps`;
            
            console.log(`[Preview] Set frameRate input to ${state.sourceFPS}fps`);
            
            // Enable convert button once metadata is ready
            if (elements.convertBtn) elements.convertBtn.disabled = false;

            // Start background frame extraction and conversion
            console.log('[Preview] About to call startBackgroundProcessing...');
            startBackgroundProcessing().catch(err => {
                console.error('[Preview] Background processing failed:', err);
            });
        };
        
        // Sync video playback with animation preview
        elements.videoPreview.addEventListener('play', () => {
            if (state.animationEncoder && state.animationEncoder.frames) {
                startAnimationPlayback();
            }
        });
        
        elements.videoPreview.addEventListener('pause', () => {
            stopAnimationPlayback();
        });
        
        elements.videoPreview.addEventListener('seeked', () => {
            if (state.animationEncoder && state.animationEncoder.frames) {
                syncAnimationToVideo();
            }
        });
        
        // Start video playback
        elements.videoPreview.play().catch(err => {
            console.warn('[Preview] Video autoplay blocked:', err);
            // Video might be blocked by browser, but user can click to play
        });
    } else if (isVideo && isGif) {
        // GIF is treated as animation but shown as an image preview
        elements.videoPreview.pause();
        elements.videoPreview.classList.add('hidden');
        elements.imagePreview.classList.remove('hidden');
        elements.imagePreview.src = dataUrl;
        elements.gifOptions.classList.remove('hidden');

        elements.imagePreview.onload = () => {
            try {
                const width = elements.imagePreview.naturalWidth;
                const height = elements.imagePreview.naturalHeight;
                if (elements.mediaInfo) elements.mediaInfo.textContent = `${state.currentFile.name} • ${width}x${height} • duration: unknown`;
                if (elements.sourceFPS) elements.sourceFPS.textContent = 'Unknown';
                if (elements.frameRate) elements.frameRate.value = 0;
                if (elements.convertBtn) elements.convertBtn.disabled = false;
                console.log('[Preview] GIF image loaded:', state.currentFile.name, `${width}x${height}`);

                // Probe the GIF for FPS and frame count (async). This is lightweight compared to full extraction.
                (async () => {
                    try {
                        console.log('[Preview] Probing GIF for duration...');
                        const res = await probeVideoWithWorker(state.currentFile.data);
                        console.log('[Preview] Probe result:', res);
                        if (res) {
                            const fps = res.fps || null;
                            const frames = res.frames || null;
                            if (frames && fps) {
                                const duration = frames / fps;
                                state.videoDuration = duration;
                                state.sourceFPS = fps;
                                if (elements.mediaInfo) elements.mediaInfo.textContent = `${state.currentFile.name} • ${width}x${height} • ${duration.toFixed(2)}s • ${fps}fps`;
                                if (elements.sourceFPS) elements.sourceFPS.textContent = `${fps} fps`;
                                if (elements.frameRate) elements.frameRate.value = Math.round(fps);
                                console.log('[Preview] Updated GIF duration and fps from probe:', duration, fps);
                            } else if (fps) {
                                state.sourceFPS = fps;
                                if (elements.sourceFPS) elements.sourceFPS.textContent = `${fps} fps`;
                                if (elements.mediaInfo) elements.mediaInfo.textContent = `${state.currentFile.name} • ${width}x${height} • fps: ${fps}`;
                            }
                        }
                    } catch (e) {
                        console.warn('[Preview] GIF probe failed:', e && e.message);
                    }
                })();

            } catch (err) {
                console.error('[Preview] Error in GIF image onload handler:', err);
            }
        };
    } else {
        // Image preview branch
        elements.videoPreview.pause();
        elements.videoPreview.classList.add('hidden');
        elements.imagePreview.classList.remove('hidden');
        elements.imagePreview.src = dataUrl;
        elements.gifOptions.classList.add('hidden');
        
        elements.imagePreview.onload = () => {
            try {
                const width = elements.imagePreview.naturalWidth;
                const height = elements.imagePreview.naturalHeight;
                if (elements.mediaInfo) elements.mediaInfo.textContent = `${state.currentFile.name} • ${width}x${height}`;
                if (elements.convertBtn) elements.convertBtn.disabled = false;
                console.log('[Preview] Image loaded:', state.currentFile.name, `${width}x${height}`);
            } catch (err) {
                console.error('[Preview] Error in image onload handler:', err);
            }
        };
    }
}

function syncAnimationToVideo() {
    if (!state.animationEncoder || !state.animationEncoder.frames) return;
    
    const videoTime = elements.videoPreview.currentTime;
    const frameRate = state.animationEncoder.frameRate || state.sourceFPS || 10;
    const frameIndex = Math.floor(videoTime * frameRate);
    const frames = state.animationEncoder.frames;
    
    if (frameIndex >= 0 && frameIndex < frames.length) {
        const frame = frames[frameIndex];
        if (frame && frame.asciiResult) {
            elements.asciiOutput.innerHTML = state.converter.generateDisplayHTML(frame.asciiResult);
        }
    }
}

function startAnimationPlayback() {
    if (!state.animationEncoder || !state.animationEncoder.frames || state.animationEncoder.frames.length === 0) {
        console.log('[Animation] No frames to play');
        return;
    }

    console.log(`[Animation] Starting smooth animation playback`);

    // Ensure any previous playback is stopped and UI cleared
    stopAnimationPlayback();
    state.playbackRunning = true;

    // If there's a video, sync with it using requestAnimationFrame for smooth updates
    if (state.currentType === 'video' && elements.videoPreview.src) {
        // Make sure video is playing
        if (elements.videoPreview.paused) {
            elements.videoPreview.play().catch(err => {
                console.warn('[Animation] Could not start video:', err);
                showToast('Video playback not supported — running independent animation.', 'warning');
                showPlaybackFallback('Video playback not supported — running independent animation');
                // Fall back to independent timer-based playback
                startIndependentAnimationPlayback();
            });
        }

        // Use requestAnimationFrame for smooth 60fps updates, guard with playbackRunning
        const syncLoop = () => {
            if (!state.playbackRunning) return; // Stopped

            syncAnimationToVideo();
            state.animationPlayer = requestAnimationFrame(syncLoop);
        };

        state.animationPlayer = requestAnimationFrame(syncLoop);
        console.log('[Animation] Started video-synced animation loop');
        // Hide fallback indicator when video-synced playback is running
        try { hidePlaybackFallback(); } catch (e) {}
    } else {
        startIndependentAnimationPlayback();
    }
}

function stopAnimationPlayback() {
    // Ensure we stop any running playback loop
    try {
        if (typeof state.playbackRunning !== 'undefined') state.playbackRunning = false;
        if (state.animationPlayer) {
            try { cancelAnimationFrame(state.animationPlayer); } catch (e) { clearTimeout(state.animationPlayer); }
            state.animationPlayer = null;
        }
    } catch (e) {
        console.warn('[Animation] Error stopping playback:', e);
    }
    console.log('[Animation] Playback stopped');
}

function startIndependentAnimationPlayback() {
    if (!state.animationEncoder || !state.animationEncoder.frames || state.animationEncoder.frames.length === 0) {
        console.log('[Animation] No frames to play (independent)');
        return;
    }

    // Stop any running playback loops and start a timer-based loop
    stopAnimationPlayback();
    state.playbackRunning = true;

    let frameIndex = 0;
    const frames = state.animationEncoder.frames;
    const frameRate = state.animationEncoder.frameRate || state.animationEncoder?.options?.frameRate || state.sourceFPS || 10;
    const frameDuration = 1000 / frameRate;

    console.log(`[Animation] Starting independent playback at ${frameRate}fps`);

    function nextFrame() {
        if (!state.playbackRunning) return; // Stopped

        if (frameIndex >= frames.length) {
            frameIndex = 0; // Loop
        }

        const frame = frames[frameIndex];
        if (frame && frame.asciiResult) {
            // Replace content atomically to prevent overlay/ghosting
            elements.asciiOutput.innerHTML = state.converter.generateDisplayHTML(frame.asciiResult);
            // Ensure output is visible
            elements.asciiOutput.classList.remove('hidden');
        }
        frameIndex++;

        state.animationPlayer = setTimeout(nextFrame, frameDuration);
    }

    nextFrame();
}

async function dataUrlToUint8Array(dataUrl) {
    // Avoid fetch(data:) due to CSP restrictions; decode base64 directly
    try {
        const comma = dataUrl.indexOf(',');
        const meta = comma >= 0 ? dataUrl.slice(0, comma) : '';
        const payload = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;

        if (meta && /;base64$/i.test(meta) || /;base64,/.test(dataUrl)) {
            // base64 -> binary
            const binary = atob(payload);
            const len = binary.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes;
        } else {
            // percent-encoded data (unlikely from FileReader but handle defensively)
            const decoded = decodeURIComponent(payload);
            const len = decoded.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) bytes[i] = decoded.charCodeAt(i);
            return bytes;
        }
    } catch (err) {
        console.warn('[dataUrlToUint8Array] fallback to fetch due to decode error:', err);
        // Last-resort fallback (may be blocked by CSP)
        const res = await fetch(dataUrl);
        const ab = await res.arrayBuffer();
        return new Uint8Array(ab);
    }
}

async function dataUrlToBlob(dataUrl, mimeType) {
    // Convert data URL to Uint8Array and wrap as a Blob (useful for creating object URLs)
    const bytes = await dataUrlToUint8Array(dataUrl);
    const mt = mimeType || (dataUrl && dataUrl.slice(5, dataUrl.indexOf(';'))) || 'application/octet-stream';
    // bytes may be a Uint8Array; ensure we pass an ArrayBuffer
    const buffer = bytes.buffer ? bytes.buffer : (new Uint8Array(bytes)).buffer;
    return new Blob([buffer], { type: mt });
}

async function extractFramesWithWorker(dataUrl, frameRate, progressCallback, abortSignal) {
    const data = await dataUrlToUint8Array(dataUrl);
    return new Promise((resolve, reject) => {
        const worker = new Worker('frame-extractor-worker.js');
        let completed = false;

        const onMessage = (e) => {
            const d = e.data;
            if (!d || !d.type) return;
            if (d.type === 'progress') {
                if (progressCallback && typeof progressCallback === 'function') {
                    progressCallback(d.current / d.total);
                }
            } else if (d.type === 'status') {
                // optional status logs
                console.log('[FFmpeg Worker] status:', d.message);
            } else if (d.type === 'complete') {
                completed = true;
                clearTimeout(timer);
                worker.removeEventListener('message', onMessage);
                resolve(d.frames);
                worker.terminate();
            } else if (d.type === 'error') {
                clearTimeout(timer);
                worker.removeEventListener('message', onMessage);
                reject(new Error(d.message || 'Worker error'));
                worker.terminate();
            } else if (d.type === 'aborted') {
                clearTimeout(timer);
                worker.removeEventListener('message', onMessage);
                reject(new Error('AbortError'));
                worker.terminate();
            }
        };

        worker.addEventListener('message', onMessage);

        if (abortSignal) {
            abortSignal.addEventListener('abort', () => {
                try { worker.postMessage({ type: 'abort' }); } catch (e) { /* ignore */ }
                if (!completed) {
                    clearTimeout(timer);
                    worker.removeEventListener('message', onMessage);
                    worker.terminate();
                    reject(new Error('AbortError'));
                }
            }, { once: true });
        }

        const timer = setTimeout(async () => {
            if (completed) return;
            console.warn('[FFmpeg Worker] extraction timed out; attempting Node-side extraction fallback');
            worker.removeEventListener('message', onMessage);
            try { worker.terminate(); } catch (e) {}

            // Attempt Node-side extraction using main process ffmpeg
            try {
                if (window.electronAPI && typeof window.electronAPI.extractFramesNode === 'function') {
                    console.log('[Extract] Attempting node-side extraction');
                    if (elements.outputStatus) elements.outputStatus.textContent = 'Extracting frames (native ffmpeg)...';
                    const payload = { dataUrl, extension: state.currentFile && state.currentFile.extension ? state.currentFile.extension : undefined, frameRate };
                    const nodeRes = await window.electronAPI.extractFramesNode(payload);
                    console.log('[Extract] Node extraction response:', nodeRes);

                    if (nodeRes && nodeRes.success && Array.isArray(nodeRes.frames)) {
                        // Convert node frames (pixels Buffer) into ImageData objects to match worker output
                        const converted = [];

                        // Hook up progress listener for native extraction events (if provided)
                        let progressListener = null;
                        try {
                            if (window.electronAPI && typeof window.electronAPI.onExtractProgressOnce === 'function') {
                                progressListener = (p) => {
                                    if (progressCallback && typeof progressCallback === 'function') {
                                        const percent = (typeof p.percent === 'number') ? (p.percent / 100) : null;
                                        if (percent !== null) progressCallback(percent);
                                    }
                                };
                                window.electronAPI.onExtractProgressOnce(progressListener);
                            }
                        } catch (e) {
                            console.warn('[Extract] Failed to attach progress listener', e);
                        }

                        for (let i = 0; i < nodeRes.frames.length; i++) {
                            const nf = nodeRes.frames[i];
                            try {
                                const pixels = nf.pixels; // Uint8Array or Buffer
                                const width = nf.width;
                                const height = nf.height;
                                const delay = nf.delay || Math.round(1000 / (frameRate || 25));

                                const clamped = new Uint8ClampedArray(pixels);
                                const imageData = new ImageData(clamped, width, height);
                                converted.push({ imageData, width, height, delay });
                            } catch (err) {
                                console.warn('[Extract] Failed to convert node frame', err);
                            }
                        }

                                // Detach progress listener
                        try {
                            if (removeProgressListener && typeof removeProgressListener === 'function') {
                                removeProgressListener();
                            }
                        } catch (e) {}

                        clearTimeout(timer);
                        resolve(converted);
                        return;
                    }
                }
            } catch (err) {
                console.warn('[Extract] Node-side extraction failed:', err);
            }

            reject(new Error('Extraction timed out'));
        }, 20000); // 20s timeout before falling back to node

        try {
            worker.postMessage({ type: 'extract', videoData: data, frameRate: frameRate }, [data.buffer]);
        } catch (err) {
            clearTimeout(timer);
            worker.removeEventListener('message', onMessage);
            worker.terminate();
            reject(err);
        }
    });
}

// Probe video/GIF metadata (FPS and frame count) using the worker
async function probeVideoWithWorker(dataUrl, timeoutMs = 9000) {
    const data = await dataUrlToUint8Array(dataUrl);

    // Try Node-side ffprobe first (fast native probe) when available
    try {
        if (window.electronAPI && typeof window.electronAPI.probeVideoNode === 'function') {
            try {
                console.log('[Probe] Trying node ffprobe first (before worker)');
                const early = await window.electronAPI.probeVideoNode({ dataUrl, extension: state.currentFile && state.currentFile.extension ? state.currentFile.extension : undefined });
                console.log('[Probe] Node early probe result:', early);
                if (early && early.success) {
                    return { fps: early.fps, frames: early.frames };
                }
            } catch (err) {
                console.warn('[Probe] Node early probe failed:', err);
            }
        }
    } catch (err) {
        console.warn('[Probe] Node probe availability check failed:', err);
    }

    return new Promise((resolve, reject) => {
        const worker = new Worker('frame-extractor-worker.js');
        let finished = false;

        const onMessage = (e) => {
            const d = e.data;
            if (!d || !d.type) return;
            if (d.type === 'status') {
                console.log('[Probe Worker] status:', d.message);
                return;
            }
            if (d.type === 'probe-complete') {
                finished = true;
                clearTimeout(timer);
                worker.removeEventListener('message', onMessage);
                worker.terminate();
                resolve({ fps: d.fps, frames: d.frames });
            } else if (d.type === 'probe-error') {
                finished = true;
                clearTimeout(timer);
                worker.removeEventListener('message', onMessage);
                worker.terminate();
                reject(new Error(d.message || 'Probe error'));
            }
        };

        worker.addEventListener('message', onMessage);

        const timer = setTimeout(async () => {
            if (finished) return;
            console.warn('[Probe Worker] probe timed out; attempting Node-side ffprobe fallback');
            worker.removeEventListener('message', onMessage);
            try { worker.terminate(); } catch (e) {}

            // Try Node-side ffprobe in main process (if available)
            try {
                if (window.electronAPI && typeof window.electronAPI.probeVideoNode === 'function') {
                    console.log('[Probe] Attempting node-side ffprobe fallback');
                    const payload = { dataUrl: dataUrl };
                    if (state.currentFile && state.currentFile.extension) payload.extension = state.currentFile.extension;
                    const nodeRes = await window.electronAPI.probeVideoNode(payload);
                    console.log('[Probe] Node probe response:', nodeRes);
                    if (nodeRes && nodeRes.success) {
                        finished = true;
                        clearTimeout(timer);
                        worker.removeEventListener('message', onMessage);
                        try { worker.terminate(); } catch (e) {}
                        resolve({ fps: nodeRes.fps, frames: nodeRes.frames });
                        return;
                    }
                }
            } catch (err) {
                console.warn('[Probe] Node-side probe failed:', err);
            }

            // Fallback: give up
            resolve(null);
        }, timeoutMs);

        try {
            console.log('[Probe] Posting probe message to worker');
            worker.postMessage({ type: 'probe', videoData: data }, [data.buffer]);
        } catch (err) {
            clearTimeout(timer);
            worker.removeEventListener('message', onMessage);
            worker.terminate();
            reject(err);
        }
    });
}

async function extractFramesNativePreferred(dataUrl, frameRate, progressCallback, abortSignal) {
    // Prefer node-side extraction for GIFs and large files for reliability
    try {
        if (abortSignal && abortSignal.aborted) throw new Error('AbortError');
        if (window.electronAPI && typeof window.electronAPI.extractFramesNode === 'function') {
            console.log('[Extract] Using native ffmpeg extraction (preferred)');
            if (elements.outputStatus) elements.outputStatus.textContent = 'Extracting frames (native ffmpeg)...';
            const payload = { dataUrl, frameRate, extension: state.currentFile && state.currentFile.extension ? state.currentFile.extension : undefined };

            // Hook up continuous progress listener (remove after extraction)
            let removeProgressListener = null;
            try {
                if (window.electronAPI && typeof window.electronAPI.onExtractProgress === 'function') {
                    removeProgressListener = window.electronAPI.onExtractProgress((p) => {
                        try {
                            if (progressCallback && typeof progressCallback === 'function') {
                                if (typeof p.percent === 'number') progressCallback(p.percent / 100);
                            }
                        } catch (innerErr) {
                            console.warn('[Extract] Progress callback error:', innerErr);
                        }
                    });
                }
            } catch (e) { console.warn('[Extract] Failed to attach native progress listener', e); }

            const nodeRes = await window.electronAPI.extractFramesNode(payload);
            console.log('[Extract] Native extraction response:', nodeRes);
            if (nodeRes && nodeRes.success && Array.isArray(nodeRes.frames)) {
                const converted = [];
                for (let i = 0; i < nodeRes.frames.length; i++) {
                    const nf = nodeRes.frames[i];
                    const pixels = nf.pixels;
                    const width = nf.width;
                    const height = nf.height;
                    const delay = nf.delay || Math.round(1000 / (frameRate || 25));

                    const clamped = new Uint8ClampedArray(pixels);
                    const imageData = new ImageData(clamped, width, height);
                    converted.push({ imageData, width, height, delay });

                    // call progress callback per frame for better UI responsiveness
                    if (progressCallback && typeof progressCallback === 'function') {
                        progressCallback((i + 1) / nodeRes.frames.length);
                    }

                    if (abortSignal && abortSignal.aborted) throw new Error('AbortError');
                }

                if (elements.outputStatus) elements.outputStatus.textContent = '';
                return converted;
            }
        }
    } catch (err) {
        if (err && err.message === 'AbortError') throw err;
        console.warn('[Extract] Native extraction failed or not available, falling back to worker:', err);
    }

    // Fallback to worker extraction
    return extractFramesWithWorker(dataUrl, frameRate, progressCallback, abortSignal);
}

async function startBackgroundProcessing() {
    if (state.backgroundProcessing) {
        console.log('[Background] Already processing, skipping');
        return;
    }
    const totalStart = performance.now();
    console.log('[Background] Starting background frame extraction (DOM)');
    state.backgroundProcessing = true;

    // Show overlay progress for extraction
    showLoading('Extracting frames...');
    updateProgressWithTime(0, totalStart);
    
    // Small delay to let UI settle
    await new Promise(resolve => setTimeout(resolve, 500));
    
    let frameRate = state.sourceFPS || 30;
    const totalFrames = Math.ceil(state.videoDuration * frameRate);
    console.log(`[Background] Extracting ${totalFrames} raw video frames at ${frameRate}fps using DOM extraction`);
    
    try {
        elements.outputStatus.textContent = 'Extracting frames...';
        // If this is a GIF file, use native extraction (preferred) to extract frames from the gif bytes
        if (state.currentFile && state.currentFile.isGif) {
            const abortCtrl = new AbortController();
            state.abortController = abortCtrl;
            const frames = await extractFramesNativePreferred(state.currentFile.data, frameRate > 0 ? frameRate : null, (p) => {
                const percent = Math.round(p * 100);
                elements.outputStatus.textContent = `Extracting frames: ${percent}%`;
                updateProgressWithTime(percent, totalStart);
            }, abortCtrl.signal);

            // Determine effective frameRate and duration from frames
            const effectiveFrameRate = frames && frames.length && frames[0] && frames[0].delay ? Math.round(1000 / frames[0].delay) : (frameRate || 25);
            const duration = frames.reduce((acc, f) => acc + (f.delay || (1000 / effectiveFrameRate)), 0) / 1000;

            // Cache
            state.frameCache = {
                frameRate: effectiveFrameRate,
                videoFrames: frames,
                duration: duration
            };

            elements.outputStatus.textContent = `Ready - ${frames.length} frames extracted`;
            console.log(`[Background] Extracted ${frames.length} frames`);
            showToast('GIF frames extracted and ready', 'success');
        } else {
            const extractor = new VideoExtractor(elements.videoPreview);
            // Create an abort controller for extraction and tie it to global state so UI abort button works
            state.abortController = new AbortController();
            const videoFrames = await extractor.extractFrames(frameRate, (progress) => {
                const percent = Math.round(progress * 100);
                elements.outputStatus.textContent = `Extracting frames: ${percent}%`;
                updateProgressWithTime(percent, totalStart);
            }, state.abortController.signal);
            
            // Cache the raw video frames
            state.frameCache = {
                frameRate: frameRate,
                videoFrames: videoFrames,
                duration: state.videoDuration
            };
            
            elements.outputStatus.textContent = `Ready - ${videoFrames.length} frames extracted`;
            console.log(`[Background] Extracted ${videoFrames.length} raw frames with DOM extraction`);
            showToast('Video frames extracted and ready', 'success');
        }
    } catch (error) {
        console.error('[Background] Extraction error:', error);
        if (error && error.name === 'AbortError') {
            elements.outputStatus.textContent = 'Frame extraction canceled';
            console.log('[Background] Extraction aborted by user');
        } else {
            elements.outputStatus.textContent = 'Frame extraction failed';
        }
    }
    
    state.backgroundProcessing = false;
    // Clear any extraction abort controller
    if (state.abortController) {
        state.abortController = null;
    }
    console.log('[Background] Background extraction finished');
    // Hide overlay when done
    hideLoading();
}

function clearInput() {
    state.currentFile = null;
    state.currentType = null;
    state.asciiResult = null;
    state.animationEncoder = null;
    state.frameCache = null;
    state.backgroundProcessing = false;
    stopAnimationPlayback();
    
    // Reset preview
    elements.previewContainer.classList.add('hidden');
    document.querySelector('.drop-zone-content').classList.remove('hidden');
    elements.imagePreview.src = '';
    elements.videoPreview.src = '';
    if (elements.mediaInfo) elements.mediaInfo.textContent = '';
    
    // Reset output
    if (elements.asciiOutput) elements.asciiOutput.innerHTML = '';
    if (elements.asciiOutput) elements.asciiOutput.classList.add('hidden');
    const placeholder = document.querySelector('.output-placeholder');
    if (placeholder) placeholder.classList.remove('hidden');
    if (elements.outputStatus) elements.outputStatus.textContent = '';
    
    // Reset export format to image defaults
    updateExportFormats(false);
    
    // Disable buttons
    elements.convertBtn.disabled = true;
    elements.copyBtn.disabled = true;
    elements.saveBtn.disabled = true;
    elements.saveFormatSelect.disabled = true;
}

// ============================================
// Controls
// ============================================
function setupControls() {
    // Color mode toggle
    elements.toggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.toggleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateConverterOptions();
            
            // Show/hide color palette options
            const colorMode = btn.dataset.mode;
            const paletteGroup = document.getElementById('colorPaletteGroup');
            if (paletteGroup) {
                paletteGroup.style.display = colorMode === 'color' ? 'block' : 'none';
            }
        });
    });
    
    // Color palette select
    const colorPaletteSelect = document.getElementById('colorPaletteSelect');
    if (colorPaletteSelect) {
        colorPaletteSelect.addEventListener('change', () => {
            updateConverterOptions();
        });
    }
    
    // Charset select
    elements.charsetSelect.addEventListener('change', (e) => {
        const isCustom = e.target.value === 'custom';
        elements.customCharset.classList.toggle('hidden', !isCustom);
        updateConverterOptions();
    });
    
    // Custom charset input
    elements.customCharset.addEventListener('input', () => {
        updateConverterOptions();
    });
    
    // Sliders
    setupSlider(elements.widthSlider, elements.widthValue, '');
    setupSlider(elements.fontSizeSlider, elements.fontSizeValue, '');
    setupSlider(elements.lineHeightSlider, elements.lineHeightValue, '', 1);
    setupSlider(elements.contrastSlider, elements.contrastValue, '');
    setupSlider(elements.brightnessSlider, elements.brightnessValue, '');
    
    // Invert checkbox
    elements.invertCheck.addEventListener('change', () => {
        updateConverterOptions();
    });
    
    // Background color
    elements.bgColorPicker.addEventListener('input', (e) => {
        // Color picker doesn't support alpha, so append full opacity
        const color = e.target.value + 'FF';
        elements.bgColorText.value = color;
        state.converter.options.backgroundColor = color;
        updateConverterOptions();
        updateOutputBackground();
    });
    
    elements.bgColorText.addEventListener('input', (e) => {
        let value = e.target.value;
        // Support both #RRGGBB and #RRGGBBAA formats
        if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            // Add full opacity if not specified
            value = value + 'FF';
        }
        if (/^#[0-9A-Fa-f]{8}$/.test(value)) {
            // Update color picker (without alpha)
            elements.bgColorPicker.value = value.substring(0, 7);
            state.converter.options.backgroundColor = value;
            updateConverterOptions();
            updateOutputBackground();
        }
    });
    
    // Convert button
    elements.convertBtn.addEventListener('click', convert);
}

function setupSlider(slider, valueElement, suffix, decimals = 0) {
    const update = () => {
        const value = decimals > 0 
            ? parseFloat(slider.value).toFixed(decimals)
            : slider.value;
        valueElement.textContent = value;
        updateConverterOptions();
        // Persist changes silently
        if (typeof saveSettingsDebounced === 'function') saveSettingsDebounced();
    };
    
    slider.addEventListener('input', update);
}

function updateConverterOptions() {
    const colorMode = document.querySelector('.toggle-btn.active')?.dataset.mode || 'color';
    const charset = elements.charsetSelect.value;
    const customCharset = charset === 'custom' ? elements.customCharset.value : null;
    const colorPaletteSelect = document.getElementById('colorPaletteSelect');
    const colorPalette = colorPaletteSelect ? colorPaletteSelect.value : 'full';
    
    state.converter.setOptions({
        width: parseInt(elements.widthSlider.value),
        charset: charset,
        customCharset: customCharset,
        colorMode: colorMode,
        colorPalette: colorPalette,
        fontSize: parseInt(elements.fontSizeSlider.value),
        lineHeight: parseFloat(elements.lineHeightSlider.value),
        contrast: parseInt(elements.contrastSlider.value),
        brightness: parseInt(elements.brightnessSlider.value),
        invert: elements.invertCheck.checked,
        backgroundColor: elements.bgColorPicker.value
    });
}

function updateOutputBackground() {
    const bgColor = elements.bgColorText.value;
    if (bgColor.length === 9 && bgColor.startsWith('#')) {
        // #RRGGBBAA format - convert to rgba
        const r = parseInt(bgColor.substr(1, 2), 16);
        const g = parseInt(bgColor.substr(3, 2), 16);
        const b = parseInt(bgColor.substr(5, 2), 16);
        const a = parseInt(bgColor.substr(7, 2), 16) / 255;
        elements.asciiOutput.style.backgroundColor = `rgba(${r},${g},${b},${a})`;
    } else {
        elements.asciiOutput.style.backgroundColor = bgColor;
    }
}

function updateConversionProgress(percent, label = 'Converting to ASCII...') {
    const clamped = Math.max(0, Math.min(100, percent));
    const text = `${label} ${Math.round(clamped)}%`;
    elements.outputStatus.textContent = text;
    updateLoadingText(text);
    updateProgressWithTime(clamped, state.progressStartTime);
}

// ============================================
// Conversion
// ============================================
async function convert() {
    if (!state.currentFile) {
        showToast('Please select a file first', 'warning');
        return;
    }
    
    console.log('[Convert] Starting conversion, type:', state.currentType);
    
    showLoading('Converting to ASCII...');
    // Stop any previous animations and clear previous output to avoid overlay issues
    try {
        stopAnimationPlayback();
        state.asciiResult = null;
        state.animationEncoder = null;
        if (elements.asciiOutput) elements.asciiOutput.innerHTML = '';
        const placeholder = document.querySelector('.output-placeholder');
        if (placeholder) placeholder.classList.remove('hidden');
        if (elements.asciiOutput) elements.asciiOutput.classList.add('hidden');
        if (elements.outputStatus) elements.outputStatus.textContent = '';
    } catch (e) {
        console.warn('[Convert] Failed to clear previous output:', e);
    }

    updateConverterOptions();
    updateConversionProgress(0, 'Converting to ASCII...');
    
    const conversionStart = performance.now();
    try {
        if (state.currentType === 'video') {
            await convertVideo();
        } else {
            await convertImage();
        }
        console.log('[Convert] Conversion completed successfully');
        // Sync output with input/video now that conversion is finished
        try {
            const conversionTime = performance.now() - conversionStart;
            if (state.animationEncoder && state.animationEncoder.frames && state.animationEncoder.frames.length > 0) {
                await displayResult(state.asciiResult, conversionTime, state.animationEncoder.frames.length);
            }
        } catch (e) {
            console.warn('[Convert] displayResult sync failed:', e);
        }
    } catch (error) {
        console.error('[Convert] CONVERSION FAILED:', error);
        console.error('[Convert] Error stack:', error.stack);
        showToast('Conversion failed: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function convertImage() {
    const img = elements.imagePreview;
    updateConversionProgress(0, 'Converting image...');
    
    // Wait for image to be fully loaded
    if (!img.complete) {
        await new Promise(resolve => img.onload = resolve);
    }

    // Small delay to ensure overlay renders
    await new Promise(resolve => setTimeout(resolve, 50));

    const startTime = performance.now();
    state.asciiResult = await state.converter.convertImage(img);
    const endTime = performance.now();
    updateConversionProgress(100, 'Converting image...');
    
    await displayResult(state.asciiResult, endTime - startTime);
}

async function convertVideo() {
    console.log('[Convert] Starting video conversion');
    const video = elements.videoPreview;
    let frameRate = parseInt(elements.frameRate.value);
    updateConversionProgress(0, 'Converting video...');
    
    // Use source FPS if not specified or 0
    if (!frameRate || frameRate === 0) {
        frameRate = state.sourceFPS || 30;
    }
    console.log(`[Convert] Frame rate: ${frameRate}fps, Duration: ${state.videoDuration}s`);
    
    const startTime = performance.now();
    const totalFrames = Math.ceil(state.videoDuration * frameRate);
    console.log(`[Convert] Total frames to process: ${totalFrames}`);
    
    // Create abort controller
    state.abortController = new AbortController();
    
    // Create animation encoder with CURRENT settings
    state.animationEncoder = new ASCIIAnimationEncoder(state.converter, {
        frameRate: frameRate,
        quality: state.settings.gifQuality,
        scale: state.settings.pngScale
    });
    
    try {
        // Check if we can use cached raw frames (with smart resampling)
        if (state.frameCache && state.frameCache.videoFrames && state.frameCache.videoFrames.length > 0) {
            const cachedFPS = state.frameCache.frameRate;
            const requestedFPS = frameRate;
            
            // Can we use the cache? (either exact match or we can downsample)
            if (cachedFPS >= requestedFPS) {
                console.log(`[Convert] Using cached video frames at ${cachedFPS}fps, resampling to ${requestedFPS}fps if needed`);
                
                let videoFrames = state.frameCache.videoFrames;
                
                // Resample if FPS doesn't match
                if (cachedFPS !== requestedFPS) {
                    console.log(`[Convert] Resampling from ${cachedFPS}fps to ${requestedFPS}fps`);
                    const resampledFrames = [];
                    const interval = cachedFPS / requestedFPS;
                    const targetCount = Math.ceil(state.videoDuration * requestedFPS);
                    
                    for (let i = 0; i < targetCount && i * interval < videoFrames.length; i++) {
                        const sourceIndex = Math.floor(i * interval);
                        resampledFrames.push(videoFrames[sourceIndex]);
                    }
                    
                    videoFrames = resampledFrames;
                    console.log(`[Convert] Resampled to ${videoFrames.length} frames`);
                }
                
                console.log(`[Convert] Converting ${videoFrames.length} cached frames to ASCII with current settings`);
                updateLoadingText('Converting cached frames to ASCII...');
                updateConversionProgress(0, 'Converting to ASCII...');
                
                // Small delay to ensure overlay renders
                await new Promise(resolve => setTimeout(resolve, 50));
                
                // Convert cached video frames to ASCII with current settings
                state.animationEncoder.frames = [];
                
                console.log(`[Convert] Current converter settings: width=${state.converter.options.width}, mode=${state.converter.options.colorMode}`);
                
                for (let i = 0; i < videoFrames.length; i++) {
                    if (state.abortController.signal.aborted) {
                        throw new Error('Aborted by user');
                    }
                    
                    console.log(`[Convert] Processing cached frame ${i + 1}/${videoFrames.length}`);
                    console.log(`[Convert] Frame ${i} data: ${videoFrames[i].width}x${videoFrames[i].height}, ImageData: ${videoFrames[i].imageData ? 'OK' : 'MISSING'}`);
                    
                    try {
                        // Convert ImageData directly to ASCII (FAST - no image encoding/decoding)
                        const asciiResult = state.converter.convertImageData(
                            videoFrames[i].imageData,
                            videoFrames[i].width,
                            videoFrames[i].height
                        );
                        console.log(`[Convert] Frame ${i} ASCII conversion successful`);
                        
                        const asciiCanvas = state.converter.renderToCanvas(asciiResult, state.settings.pngScale);
                        console.log(`[Convert] Frame ${i} rendered to canvas`);
                        
                        state.animationEncoder.frames.push({
                            canvas: asciiCanvas,
                            asciiResult: asciiResult,
                            delay: videoFrames[i].delay
                        });
                    } catch (error) {
                        console.error(`[Convert] ERROR on frame ${i}:`, error);
                        console.error(`[Convert] Frame data:`, {
                            width: videoFrames[i].width,
                            height: videoFrames[i].height,
                            hasImageData: !!videoFrames[i].imageData,
                            imageDataType: videoFrames[i].imageData?.constructor.name
                        });
                        throw error;
                    }
                    
                    const progress = (i + 1) / videoFrames.length;
                    updateConversionProgress(progress * 100, 'Converting to ASCII...');
                    
                    // Yield to UI every 10 frames to allow progress updates
                    if (i % 10 === 0) {
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }
                }
                console.log(`[Convert] All ${videoFrames.length} cached frames converted successfully`);
            } else {
                console.log(`[Convert] Cache FPS (${cachedFPS}) lower than requested (${requestedFPS}), need to re-extract`);
                throw new Error('Cache invalid - need re-extraction');
            }
        } else {
            console.log('[Convert] No cache available, extracting and converting frames');
            
            // Extract frames first and cache them
            console.log('[Convert] Extracting frames to cache...');

            if (state.currentFile && state.currentFile.isGif) {
                // Use native ffmpeg extraction (preferred) to extract frames from GIF bytes
                const abortCtrl = new AbortController();
                state.abortController = abortCtrl;
                const gifFrames = await extractFramesNativePreferred(state.currentFile.data, frameRate > 0 ? frameRate : null, (p) => {
                    const percent = Math.round(p * 100);
                    updateConversionProgress(percent, 'Extracting frames...');
                }, abortCtrl.signal);

                // Derive effective frameRate and duration
                const effectiveFPS = gifFrames.length && gifFrames[0] && gifFrames[0].delay ? Math.round(1000 / gifFrames[0].delay) : (frameRate || 25);
                const duration = gifFrames.reduce((acc, f) => acc + (f.delay || Math.floor(1000 / effectiveFPS)), 0) / 1000;

                // Cache
                state.frameCache = {
                    frameRate: effectiveFPS,
                    videoFrames: gifFrames,
                    duration: duration
                };
                console.log(`[Convert] Cached ${gifFrames.length} GIF frames`);

                // Now convert to ASCII
                state.animationEncoder.frames = [];
                for (let i = 0; i < gifFrames.length; i++) {
                    if (state.abortController.signal.aborted) {
                        throw new Error('Aborted by user');
                    }
                    const asciiResult = state.converter.convertImageData(
                        gifFrames[i].imageData,
                        gifFrames[i].width,
                        gifFrames[i].height
                    );
                    const asciiCanvas = state.converter.renderToCanvas(asciiResult, state.settings.pngScale);

                    state.animationEncoder.frames.push({
                        canvas: asciiCanvas,
                        asciiResult: asciiResult,
                        delay: gifFrames[i].delay
                    });

                    const progress = 50 + ((i + 1) / gifFrames.length * 50);
                    updateConversionProgress(progress, 'Converting to ASCII...');

                    // Yield to UI every 10 frames to allow progress updates
                    if (i % 10 === 0) {
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }
                }
            } else {
                const extractor = new VideoExtractor(video);
                const videoFrames = await extractor.extractFrames(
                    frameRate,
                    (progress) => {
                        if (state.abortController.signal.aborted) {
                            const ae = new Error('Aborted by user'); ae.name = 'AbortError'; throw ae;
                        }
                        const percent = progress * 50;
                        updateConversionProgress(percent, 'Extracting frames...');
                    },
                    state.abortController.signal
                );
                
                // Cache the extracted frames
                state.frameCache = {
                    frameRate: frameRate,
                    videoFrames: videoFrames,
                    duration: state.videoDuration
                };
                console.log(`[Convert] Cached ${videoFrames.length} frames`);
                
                // Now convert to ASCII
                state.animationEncoder.frames = [];
                for (let i = 0; i < videoFrames.length; i++) {
                    if (state.abortController.signal.aborted) {
                        throw new Error('Aborted by user');
                    }
                    
                    const asciiResult = state.converter.convertImageData(
                        videoFrames[i].imageData,
                        videoFrames[i].width,
                        videoFrames[i].height
                    );
                    const asciiCanvas = state.converter.renderToCanvas(asciiResult, state.settings.pngScale);
                    
                    state.animationEncoder.frames.push({
                        canvas: asciiCanvas,
                        asciiResult: asciiResult,
                        delay: videoFrames[i].delay
                    });
                    
                    const progress = 50 + ((i + 1) / videoFrames.length * 50);
                    updateConversionProgress(progress, 'Converting to ASCII...');
                    
                    // Yield to UI every 10 frames to allow progress updates
                    if (i % 10 === 0) {
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }
                }
            }
        }
    } catch (error) {
        if (error && (error.name === 'AbortError' || error.message === 'Aborted by user')) {
            console.log('[Convert] Conversion aborted');
            hideLoading();
            return;
        }
        throw error;
    }
    
    // Get the first frame for preview
    if (state.currentFile && state.currentFile.isGif) {
        // Use the first extracted GIF frame imageData for preview
        const first = state.animationEncoder.frames[0];
        if (first && first.asciiResult) {
            state.asciiResult = first.asciiResult;
        } else if (first && first.canvas) {
            // render to get asciiResult if needed
            state.asciiResult = state.converter.convertImageData(first.imageData || first.canvas, first.width, first.height);
        } else {
            // Fallback: show generic message
            state.asciiResult = { text: '', width: 0, height: 0 };
        }
        state.asciiResult.isAnimation = true;
        state.asciiResult.frameCount = state.animationEncoder.frames.length;
        state.asciiResult.frameRate = state.frameCache ? state.frameCache.frameRate : frameRate;
    } else {
        video.currentTime = 0;
        await new Promise(resolve => setTimeout(resolve, 100));
        
        state.asciiResult = state.converter.convertVideoFrame(video);
        state.asciiResult.isAnimation = true;
        state.asciiResult.frameCount = state.animationEncoder.frames.length;
        state.asciiResult.frameRate = frameRate;
    }
    
    const endTime = performance.now();
    
    displayResult(state.asciiResult, endTime - startTime, state.animationEncoder.frames.length);
}

async function displayResult(result, conversionTime, frameCount = null) {
    // Hide placeholder
    document.querySelector('.output-placeholder').classList.add('hidden');
    
    // Show output
    elements.asciiOutput.classList.remove('hidden');
    elements.asciiOutput.innerHTML = state.converter.generateDisplayHTML(result);
    elements.asciiOutput.style.fontSize = state.converter.options.fontSize + 'px';
    elements.asciiOutput.style.lineHeight = state.converter.options.lineHeight;
    elements.asciiOutput.style.backgroundColor = state.converter.options.backgroundColor;
    elements.asciiOutput.style.fontFamily = state.settings.font;
    
    // Update status
    let status = `${result.width}x${result.height} characters • ${conversionTime.toFixed(0)}ms`;
    if (frameCount) {
        status += ` • ${frameCount} frames • Playing`;
        // Stop any previous playback and start fresh, then sync to input (video) if present
        try {
            stopAnimationPlayback();

            if (state.currentType === 'video' && elements.videoPreview && elements.videoPreview.src) {
                // Force both input (video) and output to start together from 0s for side-by-side sync
                try {
                    // Pause and seek to 0, wait for seek to complete, then play both
                    elements.videoPreview.pause();
                    await new Promise((resolve) => {
                        const onSeeked = () => { elements.videoPreview.removeEventListener('seeked', onSeeked); resolve(); };
                        elements.videoPreview.addEventListener('seeked', onSeeked);
                        try { elements.videoPreview.currentTime = 0; } catch (e) { elements.videoPreview.removeEventListener('seeked', onSeeked); resolve(); }
                        // Safety timeout
                        setTimeout(resolve, 250);
                    });

                    // Start video and output playback together
                    try { await elements.videoPreview.play(); } catch (e) { 
                        console.warn('[DisplayResult] Video play failed:', e);
                        const msg = (e && e.message) ? e.message.toLowerCase() : '';
                        if (msg.includes('no supported sources') || e.name === 'NotSupportedError' || msg.includes('not supported')) {
                            showToast('Video playback not supported on this system; using extracted frames for animation.', 'warning');
                            showPlaybackFallback('Video playback not supported — using extracted frames');
                            // Start independent/timer-based playback
                            startIndependentAnimationPlayback();
                            return;
                        }
                    }
                    startAnimationPlayback();

                    // Immediately sync one frame to ensure alignment
                    try { syncAnimationToVideo(); } catch (e) { console.warn('[DisplayResult] Failed to sync animation to video:', e); }
                } catch (e) {
                    console.warn('[DisplayResult] Failed to sync and start video+output:', e);
                    // Fallback: just start animation playback
                    startAnimationPlayback();
                }
            } else {
                // Non-video: just start playback
                startAnimationPlayback();
            }
        } catch (e) {
            console.warn('[DisplayResult] Failed to start animation playback:', e);
        }
    }
    elements.outputStatus.textContent = status;
    
    // Enable output buttons
    elements.copyBtn.disabled = false;
    elements.saveBtn.disabled = false;
    elements.saveFormatSelect.disabled = false;
}

// ============================================
// Output Actions
// ============================================
function setupOutput() {
    // Copy button
    elements.copyBtn.addEventListener('click', async () => {
        if (!state.asciiResult) return;
        
        try {
            await navigator.clipboard.writeText(state.asciiResult.text);
            showToast('Copied to clipboard', 'success');
        } catch (error) {
            showToast('Failed to copy', 'error');
        }
    });
    
    // Save button
    elements.saveBtn.addEventListener('click', saveOutput);
}

async function saveOutput() {
    if (!state.asciiResult) return;
    
    const format = elements.saveFormatSelect.value;
    
    try {
        switch (format) {
            case 'txt':
                await saveAsText();
                break;
            case 'html':
                await saveAsHTML();
                break;
            case 'png':
                await saveAsPNG();
                break;
            case 'gif':
                await saveAsGIF();
                break;
            case 'mp4':
                await saveAsMP4();
                break;
            case 'webm':
                await saveAsWebM();
                break;
            default:
                showToast('Unknown format', 'error');
        }
    } catch (error) {
        console.error('Save error:', error);
        showToast('Failed to save: ' + error.message, 'error');
        hideLoading();
    }
}

async function saveAsText() {
    const filters = [{ name: 'Text File', extensions: ['txt'] }];
    const defaultPath = 'ascii-art.txt';
    
    const filePath = await window.electronAPI.saveFile({ filters, defaultPath });
    if (!filePath) return;
    
    const result = await window.electronAPI.writeFile(filePath, state.asciiResult.text, 'utf-8');
    
    if (result.success) {
        showToast('Saved as TXT', 'success');
    } else {
        showToast('Failed to save file', 'error');
    }
}

async function saveAsHTML() {
    const filters = [{ name: 'HTML File', extensions: ['html'] }];
    const defaultPath = 'ascii-art.html';
    
    const filePath = await window.electronAPI.saveFile({ filters, defaultPath });
    if (!filePath) return;
    
    const data = state.converter.generateHTML(state.asciiResult, state.settings.includeStyles);
    const result = await window.electronAPI.writeFile(filePath, data, 'utf-8');
    
    if (result.success) {
        showToast('Saved as HTML', 'success');
    } else {
        showToast('Failed to save file', 'error');
    }
}

async function saveAsPNG() {
    const filters = [{ name: 'PNG Image', extensions: ['png'] }];
    const defaultPath = 'ascii-art.png';
    
    const filePath = await window.electronAPI.saveFile({ filters, defaultPath });
    if (!filePath) return;
    
    const canvas = state.converter.renderToCanvas(state.asciiResult, state.settings.pngScale);
    const data = canvas.toDataURL('image/png');
    const result = await window.electronAPI.writeFile(filePath, data, 'base64');
    
    if (result.success) {
        showToast('Saved as PNG', 'success');
    } else {
        showToast('Failed to save file', 'error');
    }
}

async function saveAsGIF() {
    console.log('[Export] Starting GIF export');
    if (!state.animationEncoder || state.animationEncoder.frames.length === 0) {
        console.log('[Export] No animation data available');
        showToast('No animation data. Convert the video first.', 'warning');
        return;
    }
    
    console.log(`[Export] Encoding ${state.animationEncoder.frames.length} frames to GIF`);
    showLoading('Preparing to encode GIF...');
    
    // Small delay to ensure loading overlay renders
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Create abort controller
    state.abortController = new AbortController();
    
    try {
        const startTime = performance.now();
        const blob = await state.animationEncoder.encodeGIF((progress) => {
            if (state.abortController.signal.aborted) {
                throw new Error('Aborted by user');
            }
            updateProgressWithTime(progress * 100, startTime);
            updateLoadingText(`Encoding GIF... ${Math.round(progress * 100)}%`);
        }, state.abortController.signal);

        // Quick diagnostic: inspect header
        try {
            const headerBuf = await blob.slice(0, 6).arrayBuffer();
            const headerStr = new TextDecoder('ascii').decode(new Uint8Array(headerBuf));
            console.log('[GIF Save] Blob header:', headerStr, 'size:', blob.size);
            if (!headerStr.startsWith('GIF')) {
                console.error('[GIF Save] Invalid GIF header detected in blob; aborting save and requesting debug info.');
                showToast('Encoded GIF appears invalid. Check console for details.', 'error');
                // Don't proceed to save; bail out early
                hideLoading();
                return;
            }
        } catch (e) {
            console.warn('[GIF Save] Could not inspect blob header:', e);
        }

        updateLoadingText('Converting to file...');
        updateProgressWithTime(100, startTime);
        
        // Convert blob to base64
        const reader = new FileReader();
        const base64Promise = new Promise((resolve, reject) => {
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
        });
        reader.readAsDataURL(blob);
        const dataUrl = await base64Promise;
        
        const filters = [{ name: 'GIF Image', extensions: ['gif'] }];
        const defaultPath = 'ascii-animation.gif';
        
        const filePath = await window.electronAPI.saveFile({ filters, defaultPath });
        if (!filePath) {
            hideLoading();
            return;
        }
        
        updateLoadingText('Saving file...');
        const result = await window.electronAPI.writeFile(filePath, dataUrl, 'base64');
        
        hideLoading();
        
        if (result.success) {
            console.log('[Export] GIF saved successfully');
            showToast('Saved as animated GIF', 'success');
        } else {
            console.error('[Export] Failed to save GIF');
            showToast('Failed to save GIF', 'error');
        }
    } catch (error) {
        console.error('[Export] GIF export error:', error);
        hideLoading();
        if (error.message !== 'Aborted by user') {
            showToast('Failed to export GIF: ' + error.message, 'error');
        }
    }
}

async function saveAsWebM() {
    console.log('[Export] Starting WebM export');
    if (!state.animationEncoder || state.animationEncoder.frames.length === 0) {
        console.log('[Export] No animation data available');
        showToast('No animation data. Convert the video first.', 'warning');
        return;
    }
    
    console.log(`[Export] Encoding ${state.animationEncoder.frames.length} frames to WebM`);
    showLoading('Preparing to encode WebM...');
    state.progressStartTime = performance.now();
    
    // Small delay to ensure loading overlay renders
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Create abort controller
    state.abortController = new AbortController();
    
    try {
        const blob = await state.animationEncoder.encodeWebM((progress, status) => {
            if (state.abortController.signal.aborted) {
                throw new Error('Aborted by user');
            }
            if (status) {
                updateLoadingText(status);
            }
            if (progress !== null && progress !== undefined) {
                updateProgressWithTime(progress, state.progressStartTime);
            }
        }, state.abortController.signal);
        
        updateLoadingText('Preparing file for save...');
        updateProgressWithTime(100, state.progressStartTime);
        
        // Convert blob to base64
        const reader = new FileReader();
        const base64Promise = new Promise((resolve, reject) => {
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
        });
        reader.readAsDataURL(blob);
        const dataUrl = await base64Promise;
        
        const filters = [{ name: 'WebM Video', extensions: ['webm'] }];
        const defaultPath = 'ascii-animation.webm';
        
        const filePath = await window.electronAPI.saveFile({ filters, defaultPath });
        if (!filePath) {
            hideLoading();
            return;
        }
        
        updateLoadingText('Saving file...');
        const result = await window.electronAPI.writeFile(filePath, dataUrl, 'base64');
        
        hideLoading();
        
        if (result.success) {
            console.log('[Export] WebM saved successfully');
            showToast('Saved as WebM video', 'success');
        } else {
            console.error('[Export] Failed to save WebM');
            showToast('Failed to save WebM', 'error');
        }
    } catch (error) {
        console.error('[Export] WebM export error:', error);
        hideLoading();
        if (error.message !== 'Aborted by user') {
            showToast('Failed to export WebM: ' + error.message, 'error');
        }
    }
}

async function saveAsMP4() {
    console.log('[Export] Starting MP4 export');
    if (!state.animationEncoder || state.animationEncoder.frames.length === 0) {
        console.log('[Export] No animation data available');
        showToast('No animation data. Convert the video first.', 'warning');
        return;
    }
    
    console.log(`[Export] Encoding ${state.animationEncoder.frames.length} frames to MP4`);
    showLoading('Preparing to encode MP4...');
    state.progressStartTime = performance.now();
    
    // Small delay to ensure loading overlay renders
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Create abort controller
    state.abortController = new AbortController();
    
    try {
        const blob = await state.animationEncoder.encodeMP4((progress, status) => {
            if (state.abortController.signal.aborted) {
                throw new Error('Aborted by user');
            }
            if (status) {
                updateLoadingText(status);
            }
            if (progress !== null && progress !== undefined) {
                updateProgressWithTime(progress, state.progressStartTime);
            }
        }, state.abortController.signal);
        
        updateLoadingText('Preparing file for save...');
        updateProgressWithTime(100, state.progressStartTime);
        
        // Determine actual format from blob type
        const isActuallyWebM = blob.type.includes('webm');
        const extension = isActuallyWebM ? 'webm' : 'mp4';
        const filterName = isActuallyWebM ? 'WebM Video' : 'MP4 Video';
        
        if (isActuallyWebM) {
            console.log('[Export] Browser does not support MP4 encoding, using WebM instead');
            showToast('MP4 not supported by browser - saving as WebM', 'info');
        }
        
        // Convert blob to base64
        const reader = new FileReader();
        const base64Promise = new Promise((resolve, reject) => {
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
        });
        reader.readAsDataURL(blob);
        const dataUrl = await base64Promise;
        
        const filters = [{ name: filterName, extensions: [extension] }];
        const defaultPath = `ascii-animation.${extension}`;
        
        const filePath = await window.electronAPI.saveFile({ filters, defaultPath });
        if (!filePath) {
            hideLoading();
            return;
        }
        
        updateLoadingText('Saving file...');
        const result = await window.electronAPI.writeFile(filePath, dataUrl, 'base64');
        
        hideLoading();
        
        if (result.success) {
            console.log('[Export] MP4 saved successfully');
            showToast('Saved as MP4 video', 'success');
        } else {
            console.error('[Export] Failed to save MP4');
            showToast('Failed to save MP4', 'error');
        }
    } catch (error) {
        console.error('[Export] MP4 export error:', error);
        hideLoading();
        if (error.message !== 'Aborted by user') {
            showToast('Failed to export MP4: ' + error.message, 'error');
        }
    }
}

// ============================================
// Settings UI
// ============================================
function setupSettings() {
    // Theme
    // global debounced save for all settings
    const saveSettingsDebounced = debounce(() => saveSettings(false), 300);
    elements.themeSelect.addEventListener('change', (e) => {
        state.settings.theme = e.target.value;
        document.body.setAttribute('data-theme', e.target.value);
        // Persist theme selection silently
        saveSettingsDebounced();
    });
    
    // Font
    elements.fontSelect.addEventListener('change', (e) => {
        state.settings.font = e.target.value;
        elements.asciiOutput.style.fontFamily = e.target.value;
        saveSettingsDebounced();
    });
    
    // Other settings
    elements.livePreviewCheck.addEventListener('change', (e) => {
        state.settings.livePreview = e.target.checked;
        saveSettingsDebounced();
    });
    
    elements.webWorkerCheck.addEventListener('change', (e) => {
        state.settings.useWebWorker = e.target.checked;
        saveSettingsDebounced();
    });
    
    elements.previewQualitySelect.addEventListener('change', (e) => {
        state.settings.previewQuality = e.target.value;
        saveSettingsDebounced();
    });
    
    elements.defaultWidthInput.addEventListener('change', (e) => {
        state.settings.defaultWidth = parseInt(e.target.value);
        saveSettingsDebounced();
    });
    
    elements.defaultCharsetSelect.addEventListener('change', (e) => {
        state.settings.defaultCharset = e.target.value;
        saveSettingsDebounced();
    });
    
    elements.defaultModeSelect.addEventListener('change', (e) => {
        state.settings.defaultMode = e.target.value;
        saveSettingsDebounced();
    });
    
    elements.includeStylesCheck.addEventListener('change', (e) => {
        state.settings.includeStyles = e.target.checked;
        saveSettingsDebounced();
    });
    
    elements.pngScaleSelect.addEventListener('change', (e) => {
        state.settings.pngScale = parseInt(e.target.value);
        saveSettingsDebounced();
    });
    
    elements.gifQualitySelect.addEventListener('change', (e) => {
        state.settings.gifQuality = parseInt(e.target.value);
        saveSettingsDebounced();
    });
    
    // Reset button
    elements.resetSettingsBtn.addEventListener('click', () => {
        state.settings = {
            theme: 'dark',
            font: "'Consolas', monospace",
            livePreview: true,
            useWebWorker: true,
            previewQuality: 'medium',
            defaultWidth: 100,
            defaultCharset: 'standard',
            defaultMode: 'color',
            includeStyles: true,
            pngScale: 2,
            gifQuality: 10,
            backgroundColor: '#00000000'
        };
        applySettingsToUI();
        showToast('Settings reset to defaults', 'info');
    });

    // Check for updates button
    elements.checkUpdatesBtn.addEventListener('click', async () => {
        try {
            console.log('[Updater] Manual check initiated by user');
            elements.checkUpdatesBtn.disabled = true;
            const res = await window.electronAPI.checkForUpdates();
            elements.checkUpdatesBtn.disabled = false;
            console.log('[Updater] Manual check result:', res);
            console.log('[Updater] Current running version:', res && res.currentVersion ? res.currentVersion : '(unknown)');

            if (res && res.updateAvailable === true) {
                // actionable toast
                const msg = `Update ${res.latestTag} available — click to view release`;
                const toast = document.createElement('div');
                toast.className = 'toast update-manual';
                toast.innerHTML = `\n                    <span class="toast-message">${msg}</span>\n                    <button class="toast-action">View release</button>\n                    <button class="toast-close">×</button>\n                `;
                elements.toastContainer.appendChild(toast);
                const action = toast.querySelector('.toast-action');
                const close = toast.querySelector('.toast-close');
                action.addEventListener('click', () => {
                    window.electronAPI.openExternal(res.latestUrl);
                    toast.remove();
                });
                close.addEventListener('click', () => toast.remove());
                setTimeout(() => { if (toast.parentElement) toast.remove(); }, 15000);
            } else if (res && res.updateAvailable === false) {
                showToast('No updates available', 'success');
            } else if (res && res.updateAvailable === null) {
                const msg = `Latest release: ${res.latestTag} — click to view release`;
                const toast = document.createElement('div');
                toast.className = 'toast update-manual';
                toast.innerHTML = `\n                    <span class="toast-message">${msg}</span>\n                    <button class="toast-action">View release</button>\n                    <button class="toast-close">×</button>\n                `;
                elements.toastContainer.appendChild(toast);
                const action = toast.querySelector('.toast-action');
                const close = toast.querySelector('.toast-close');
                action.addEventListener('click', () => {
                    window.electronAPI.openExternal(res.latestUrl);
                    toast.remove();
                });
                close.addEventListener('click', () => toast.remove());
                setTimeout(() => { if (toast.parentElement) toast.remove(); }, 15000);
            } else if (res && res.error) {
                showToast('Update check failed', 'error');
            } else {
                showToast('No update information', 'warning');
            }
        } catch (e) {
            elements.checkUpdatesBtn.disabled = false;
            showToast('Failed to check updates', 'error');
            console.warn('[Updater] Manual check failed', e);
        }
    });
    
}



// ============================================
// Keyboard Shortcuts
// ============================================
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl+O - Open file
        if (e.ctrlKey && e.key === 'o') {
            e.preventDefault();
            handleBrowse();
        }
        
        // Ctrl+S - Save output
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            if (state.asciiResult) {
                saveOutput();
            }
        }
        
        // Ctrl+C - Copy (when not in input)
        if (e.ctrlKey && e.key === 'c' && !e.target.matches('input, textarea')) {
            if (state.asciiResult) {
                navigator.clipboard.writeText(state.asciiResult.text);
                showToast('Copied to clipboard', 'success');
            }
        }
        
        // Enter - Convert
        if (e.key === 'Enter' && !e.target.matches('input, textarea, button')) {
            e.preventDefault();
            if (state.currentFile) {
                convert();
            }
        }
        
        // Escape - Clear
        if (e.key === 'Escape') {
            clearInput();
        }
    });
}

// ============================================
// UI Helpers
// ============================================
function showLoading(text = 'Loading...') {
    elements.loadingOverlay.classList.remove('hidden');
    elements.loadingText.textContent = text;
    elements.progressFill.style.width = '0%';
    state.progressStartTime = performance.now(); // Use performance.now() for consistency
    document.getElementById('progressTime').textContent = '';
}

function hideLoading() {
    elements.loadingOverlay.classList.add('hidden');
    state.progressStartTime = null;
}

function updateLoadingText(text) {
    elements.loadingText.textContent = text;
    // Don't override progress time - let updateProgressWithTime handle it
}

function updateProgress(percent) {
    elements.progressFill.style.width = `${percent}%`;
}

function updateProgressWithTime(percent, startTime) {
    // Clamp percent to valid range
    percent = Math.max(0, Math.min(100, percent));
    
    console.log(`[Progress] ${percent.toFixed(1)}% complete`);
    elements.progressFill.style.width = `${percent}%`;
    
    const now = performance.now();
    const start = startTime || state.progressStartTime;
    
    // Safeguard against invalid timestamps
    if (!start || start > now) {
        document.getElementById('progressTime').textContent = '';
        return;
    }
    
    // Convert from milliseconds to seconds
    const elapsed = (now - start) / 1000;
    const elapsedStr = formatTime(elapsed);
    
    let timeText = `Elapsed: ${elapsedStr}`;
    
    if (percent > 5 && percent < 100) { // Only show ETA between 5-100%
        const percentDecimal = percent / 100;
        const estimatedTotal = elapsed / percentDecimal;
        const remaining = Math.max(0, estimatedTotal - elapsed);
        
        // Clamp remaining to reasonable value (max 24 hours)
        const clampedRemaining = Math.min(remaining, 86400);
        const etaStr = formatTime(clampedRemaining);
        timeText += ` • ETA: ${etaStr}`;
        console.log(`[Progress] Elapsed: ${elapsed.toFixed(1)}s, ETA: ${clampedRemaining.toFixed(1)}s`);
    }
    
    document.getElementById('progressTime').textContent = timeText;
}

function formatTime(seconds) {
    if (seconds < 60) {
        return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
        return `${mins}m ${secs}s`;
    } else {
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${mins}m`;
    }
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-message">${message}</span>
        <button class="toast-close">×</button>
    `;
    
    elements.toastContainer.appendChild(toast);
    
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.remove();
    });
    
    // Auto remove after 4 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }
    }, 4000);
}

function showPlaybackFallback(message = null) {
    try {
        if (!elements.playbackFallback) return;
        if (message) {
            const textEl = elements.playbackFallback.querySelector('.fallback-text');
            if (textEl) textEl.textContent = message;
        }
        elements.playbackFallback.classList.remove('hidden');
    } catch (e) { console.warn('[UI] Failed to show playback fallback indicator:', e); }
}

function hidePlaybackFallback() {
    try {
        if (!elements.playbackFallback) return;
        elements.playbackFallback.classList.add('hidden');
    } catch (e) { console.warn('[UI] Failed to hide playback fallback indicator:', e); }
}

// Debounce helper
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ============================================
// Start Application
// ============================================

// Abort button handler
elements.abortBtn.addEventListener('click', () => {
    console.log('[Abort] User requested abort');
    if (state.abortController) {
        state.abortController.abort();
        showToast('Operation canceled', 'warning');
    }
});

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Init] App starting...');
    init();
    checkMP4Support();
});

function checkMP4Support() {
    // Prefer the internal WebCodecs + mp4-muxer path when available (Electron)
    const webcodecsAvailable = typeof window.VideoEncoder !== 'undefined';
    const hasMuxerAPI = typeof window.electronAPI?.createVideoMuxer === 'function' && typeof window.electronAPI?.finalizeVideo === 'function';

    if (webcodecsAvailable && hasMuxerAPI) {
        console.log('[App] MP4 encoding supported via WebCodecs + muxer (Electron native path)');
        return;
    }

    // Fallback: check MediaRecorder support for MP4 in the browser
    const mp4Types = [
        'video/mp4;codecs=avc1.42E01E',
        'video/mp4;codecs=h264',
        'video/mp4'
    ];
    
    const mp4Supported = mp4Types.some(type => {
        try {
            return MediaRecorder.isTypeSupported(type);
        } catch (e) {
            return false;
        }
    });
    
    if (!mp4Supported) {
        console.warn('[App] MP4 encoding not supported by browser, will use WebM (browser fallback)');
        
        // Update the MP4 option in the dropdown to indicate WebM fallback
        const saveFormatSelect = document.getElementById('saveFormatSelect');
        if (saveFormatSelect) {
            const mp4Option = Array.from(saveFormatSelect.options).find(opt => opt.value === 'mp4');
            if (mp4Option) {
                mp4Option.textContent = 'Video (.webm) - MP4 not supported in browser';
            }
        }
    } else {
        console.log('[App] MP4 encoding supported via MediaRecorder');
    }
}

