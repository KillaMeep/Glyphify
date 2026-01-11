const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { app, Notification, shell } = require('electron');

function normalizeVersion(v) {
  if (!v) return '';
  return v.toString().trim().replace(/^v/i, '');
}

function compareSemver(a, b) {
  const A = normalizeVersion(a).split('.').map(x => parseInt(x, 10) || 0);
  const B = normalizeVersion(b).split('.').map(x => parseInt(x, 10) || 0);
  const len = Math.max(A.length, B.length);
  for (let i = 0; i < len; i++) {
    const ai = A[i] || 0;
    const bi = B[i] || 0;
    if (ai > bi) return 1;
    if (ai < bi) return -1;
  }
  return 0;
}

function fetchLatestRelease(owner, repo) {
  const options = {
    hostname: 'api.github.com',
    path: `/repos/${owner}/${repo}/releases/latest`,
    headers: {
      'User-Agent': `${repo}-update-checker`,
      'Accept': 'application/vnd.github.v3+json'
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.get(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => raw += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          resolve(json);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function detectCurrentVersion(logger = console) {
  // 1) Try Electron app version
  try {
    if (app && typeof app.getVersion === 'function') {
      const av = app.getVersion();
      if (av && av !== '0.0.0') {
        logger.log('[Updater] Detected version from app.getVersion():', av);
        return av;
      }
    }
  } catch (e) {
    logger.warn('[Updater] app.getVersion() failed:', e && e.message);
  }

  // 2) Try package.json near app root
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg && pkg.version) {
        logger.log('[Updater] Detected version from package.json:', pkg.version);
        return pkg.version;
      }
    }
  } catch (e) {
    logger.warn('[Updater] package.json read failed:', e && e.message);
  }

  // 3) Try src/version.json (legacy fallback)
  try {
    const verPath = path.join(__dirname, 'version.json');
    if (fs.existsSync(verPath)) {
      const v = JSON.parse(fs.readFileSync(verPath, 'utf-8'));
      if (v && v.version) {
        logger.log('[Updater] Detected version from src/version.json:', v.version);
        return v.version;
      }
    }
  } catch (e) {
    logger.warn('[Updater] version.json read failed:', e && e.message);
  }

  // 4) Try git tags if a .git folder exists (development)
  try {
    const repoRoot = path.join(__dirname, '..');
    if (fs.existsSync(path.join(repoRoot, '.git'))) {
      const tag = execSync('git describe --tags --abbrev=0', { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      if (tag) {
        logger.log('[Updater] Detected version from git tag:', tag);
        return tag;
      }
    }
  } catch (e) {
    logger.warn('[Updater] git tag detection failed:', e && e.message);
  }

  logger.log('[Updater] Could not detect current version');
  return null;
}

let _lastNotifiedTag = null;

async function checkForUpdates({ owner, repo, currentVersion, window = null, logger = console, silent = false }) {
  try {
    if (!owner || !repo) throw new Error('owner and repo required');

    // Auto-detect current version when not provided
    let detected = currentVersion;
    if (!detected) detected = detectCurrentVersion(logger);

    const latest = await fetchLatestRelease(owner, repo);
    const latestTag = latest.tag_name || latest.name || '';
    const latestUrl = latest.html_url || `https://github.com/${owner}/${repo}/releases`;

    logger.log(`[Updater] Current: ${detected}, Latest: ${latestTag}`);

    if (!detected) {
      if (!silent) logger.warn('[Updater] Current version unknown; showing latest release info only');
      // Inform renderer (no comparison possible)
      if (window && window.webContents) {
        try {
          window.webContents.send('update:available', {
            currentVersion: null,
            latestTag,
            url: latestUrl,
            release: latest,
            note: 'current_version_unknown'
          });
        } catch (e) {
          logger.warn('[Updater] IPC send failed:', e);
        }
      }
      return { updateAvailable: null, latestTag, latestUrl, release: latest };
    }

    if (compareSemver(normalizeVersion(latestTag), normalizeVersion(detected)) > 0) {
      // Newer release found
      if (_lastNotifiedTag === latestTag) {
        // already notified in this session
        logger.log('[Updater] Already notified for this tag in this session');
        return { updateAvailable: true, latestTag, latestUrl, release: latest };
      }

      _lastNotifiedTag = latestTag;

      // Show system notification
      try {
        const notif = new Notification({
          title: 'Glyphify — Update available',
          body: `A new release ${latestTag} is available (you have ${detected}). Click to view.`,
        });
        notif.on('click', () => {
          shell.openExternal(latestUrl).catch(e => logger.error('[Updater] openExternal failed', e));
        });
        notif.show();
      } catch (e) {
        logger.warn('[Updater] Notification failed:', e);
      }

      // Send IPC to renderer if available
      if (window && window.webContents) {
        try {
          window.webContents.send('update:available', {
            currentVersion: detected,
            latestTag,
            url: latestUrl,
            release: latest
          });
        } catch (e) {
          logger.warn('[Updater] IPC send failed:', e);
        }
      }

      return { updateAvailable: true, latestTag, latestUrl, release: latest };
    }

    // up-to-date
    if (!silent) logger.log('[Updater] Already up-to-date');
    return { updateAvailable: false, latestTag, latestUrl, release: latest };
  } catch (err) {
    logger.warn('[Updater] Check failed:', err && err.message);
    return { error: err.message };
  }
}

module.exports = { checkForUpdates };
