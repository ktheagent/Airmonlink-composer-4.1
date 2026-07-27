'use strict';

const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const { DocumentFileService } = require('../desktop/file-service');
const { ShutdownCoordinator, withBoundedWait } = require('../desktop/shutdown-controller');

const BUILD = 29;
const REQUIRED_VERIFICATION = Object.freeze({
  build: BUILD,
  mounted: true,
  canonicalModel: true,
  directApi: true,
  fourVoiceLayers: true,
  legacySelectors: 0,
  scoreViewport: true,
  allControlsConnected: true
});

let mainWindow = null;
let documentFiles = null;
let shutdownCoordinator = null;
let shutdownFinalizing = false;
let shutdownRequestActive = false;
let shutdownLogPath = null;
let rendererDocumentState = { dirty: false, title: 'Untitled Score', filePath: null };
let pendingOpenPath = null;

function logRecord(stage, details = {}) {
  const record = JSON.stringify({ timestamp: new Date().toISOString(), stage, ...details });
  try {
    if (shutdownLogPath) fsSync.appendFileSync(shutdownLogPath, `${record}\n`, 'utf8');
  } catch (_) {}
  if (process.argv.includes('--dev')) console.info(`[composer3] ${record}`);
}

function validateRenderer(payload = {}) {
  for (const [key, expected] of Object.entries(REQUIRED_VERIFICATION)) {
    if (payload[key] !== expected) {
      return { ok: false, error: `Renderer verification failed: ${key} expected ${expected}, received ${payload[key]}` };
    }
  }
  if (Number(payload.tabs) < 6 || Number(payload.activePanels) !== 1 || Number(payload.visibleControls) < 12) {
    return { ok: false, error: 'Renderer verification failed: incomplete visible Composer 3 interface.' };
  }
  return { ok: true };
}

async function showFatalStartup(message) {
  logRecord('startup-verification-failed', { message });
  if (mainWindow && !mainWindow.isDestroyed()) {
    await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Airmonlink Composer 3 could not start',
      message: 'The verified Composer 3 interface did not start correctly.',
      detail: String(message || 'Unknown startup verification failure.'),
      buttons: ['Close'],
      noLink: true
    }).catch(() => {});
    mainWindow.destroy();
  }
  app.exit(1);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1540,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#06152f',
    title: 'Airmonlink Composer 3',
    icon: path.join(__dirname, '..', '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  if (process.argv.includes('--dev')) mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.on('close', event => {
    if (shutdownCoordinator?.approved || shutdownFinalizing) return;
    event.preventDefault();
    void beginShutdown('window-close');
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function chooseSavePath({ currentPath, defaultName, filters, saveAs }) {
  if (currentPath && !saveAs) return currentPath;
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: currentPath || defaultName,
    filters: filters || [{ name: 'All Files', extensions: ['*'] }]
  });
  return result.canceled ? null : result.filePath || null;
}

async function confirmClose({ title } = {}) {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Unsaved changes',
    message: `Save changes to “${title || 'Untitled Score'}” before closing?`,
    detail: 'Save writes the score safely. Discard closes without saving. Cancel returns to the score.',
    buttons: ['Save', 'Discard', 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  });
  return result.response === 0 ? 'save' : result.response === 1 ? 'discard' : 'cancel';
}

async function beginShutdown(reason = 'application-quit') {
  if (shutdownFinalizing || shutdownCoordinator?.approved) return true;
  if (shutdownRequestActive) return false;
  shutdownRequestActive = true;
  try {
    if (!mainWindow || mainWindow.isDestroyed()) {
      shutdownFinalizing = true;
      app.quit();
      return true;
    }

    let decision = 'discard';
    if (rendererDocumentState.dirty) {
      decision = await confirmClose(rendererDocumentState);
      if (decision === 'cancel') return false;
    }

    const response = await shutdownCoordinator.request(reason, { decision });
    if (response.status === 'canceled') return false;
    if (response.status !== 'approved') {
      await dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Airmonlink Composer could not close safely',
        message: 'A background component did not finish its shutdown request.',
        detail: 'The application remains open to protect the score. Stop playback or close dialogs, then try again.',
        buttons: ['OK'],
        noLink: true
      }).catch(() => {});
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send('app:shutdown-abort', { reason, status: response.status });
      shutdownCoordinator.reset();
      return false;
    }

    shutdownFinalizing = true;
    await withBoundedWait(() => documentFiles?.releaseAllLocks(), 2500, 'document-lock-release', logRecord);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
    else app.quit();
    return true;
  } finally {
    if (!shutdownFinalizing) shutdownRequestActive = false;
  }
}

function registerIpc() {
  ipcMain.handle('composer3:ready', async (_event, payload) => {
    const result = validateRenderer(payload);
    if (!result.ok) {
      await showFatalStartup(result.error);
      return result;
    }
    logRecord('composer3-shell-ready', { build: payload.build, tabs: payload.tabs, controls: payload.visibleControls });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
      if (pendingOpenPath) {
        mainWindow.webContents.send('document:open-request', { filePath: pendingOpenPath });
        pendingOpenPath = null;
      }
    }
    return { ok: true, build: BUILD };
  });

  ipcMain.handle('document:save', async (_event, payload) => {
    if (shutdownCoordinator?.pending) shutdownCoordinator.extendTimeout(300000, 'save-dialog');
    const targetPath = await chooseSavePath(payload);
    if (shutdownCoordinator?.pending) shutdownCoordinator.extendTimeout(15000, 'post-save-cleanup');
    if (!targetPath) return { canceled: true };
    if (payload.currentPath && payload.currentPath !== targetPath) await documentFiles.releaseLock(payload.currentPath);
    const result = await documentFiles.saveDocument(targetPath, payload.content, {
      backup: true,
      overrideLock: Boolean(payload.overrideLock)
    });
    if (payload.documentId) await documentFiles.discardRecovery(payload.documentId);
    return { canceled: false, filePath: targetPath, backupCreated: result.backupCreated };
  });

  ipcMain.handle('document:open', async (_event, { filters } = {}) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: filters || [{ name: 'Airmonlink scores', extensions: ['airscore', 'musicxml', 'xml', 'mxl', 'mid', 'midi'] }]
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    return { canceled: false, ...(await documentFiles.openDocument(result.filePaths[0])) };
  });
  ipcMain.handle('document:openPath', async (_event, { filePath }) => {
    if (!filePath) throw new Error('No recent file was selected.');
    return { canceled: false, ...(await documentFiles.openDocument(filePath)) };
  });
  ipcMain.handle('document:release', (_event, { filePath } = {}) => documentFiles.releaseLock(filePath));
  ipcMain.handle('document:recent', () => documentFiles.listRecent());
  ipcMain.handle('document:autosave', (_event, payload) => documentFiles.writeRecovery(payload));
  ipcMain.handle('document:recoveryList', () => documentFiles.listRecoveries());
  ipcMain.handle('document:recoveryRead', (_event, { documentId }) => documentFiles.readRecovery(documentId));
  ipcMain.handle('document:recoveryDiscard', (_event, { documentId }) => documentFiles.discardRecovery(documentId));
  ipcMain.handle('settings:get', () => documentFiles.getSettings());
  ipcMain.handle('settings:set', (_event, patch) => documentFiles.setSettings(patch || {}));

  ipcMain.handle('file:save', async (_event, { content, defaultName, filters }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName,
      filters: filters || [{ name: 'All Files', extensions: ['*'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await documentFiles.atomicWrite(result.filePath, Buffer.from(content, 'base64'), { backup: false });
    return { canceled: false, filePath: result.filePath };
  });
  ipcMain.handle('file:open', async (_event, { filters } = {}) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: filters || [{ name: 'All Files', extensions: ['*'] }]
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const filePath = result.filePaths[0];
    const data = await fs.readFile(filePath);
    return { canceled: false, filePath, content: data.toString('base64') };
  });

  ipcMain.handle('export:pdf', async (_event, { defaultName = 'score.pdf', pageSize = 'A4' } = {}) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName,
      filters: [{ name: 'PDF document', extensions: ['pdf'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const pdf = await mainWindow.webContents.printToPDF({
      printBackground: true,
      pageSize,
      preferCSSPageSize: true,
      margins: { marginType: 'none' }
    });
    if (pdf.length < 5 || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error('Electron returned an invalid PDF document.');
    }
    await documentFiles.atomicWrite(result.filePath, pdf, { backup: false });
    return { canceled: false, filePath: result.filePath, bytes: pdf.length };
  });

  ipcMain.handle('app:print-preview', async (_event, { title = 'Print Preview', pageSize = 'A4' } = {}) => {
    const pdf = await mainWindow.webContents.printToPDF({
      printBackground: true,
      pageSize,
      preferCSSPageSize: true,
      margins: { marginType: 'none' }
    });
    if (pdf.length < 5 || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error('Electron returned an invalid PDF preview.');
    }
    const previewWindow = new BrowserWindow({
      width: 1100,
      height: 850,
      title: `${title} — Print Preview`,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    previewWindow.once('ready-to-show', () => previewWindow.show());
    await previewWindow.loadURL(`data:application/pdf;base64,${pdf.toString('base64')}`);
    return { ok: true, bytes: pdf.length };
  });

  ipcMain.handle('app:print', async () => new Promise((resolve, reject) => {
    mainWindow.webContents.print({ printBackground: true }, (success, failureReason) => {
      if (!success) reject(new Error(failureReason || 'Printing failed.'));
      else resolve({ success: true });
    });
  }));

  ipcMain.handle('app:confirm-close', (_event, payload) => confirmClose(payload));
  ipcMain.handle('app:openExternal', (_event, url) => shell.openExternal(url));
  ipcMain.on('app:document-state', (_event, payload = {}) => {
    rendererDocumentState = {
      dirty: Boolean(payload.dirty),
      title: String(payload.title || 'Untitled Score'),
      filePath: payload.filePath || null
    };
  });
  ipcMain.on('app:request-quit', () => { void beginShutdown('file-exit'); });
  ipcMain.on('app:shutdown-response', (_event, response) => shutdownCoordinator.receive(response));
}

function acceptedOpenPath(argv) {
  return argv.find(value => typeof value === 'string' && /\.airscore$/i.test(value) && fsSync.existsSync(value)) || null;
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
else {
  app.on('second-instance', (_event, argv) => {
    const requested = acceptedOpenPath(argv);
    if (requested) {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('document:open-request', { filePath: requested });
      else pendingOpenPath = requested;
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    documentFiles = new DocumentFileService({ userDataPath: app.getPath('userData') });
    await documentFiles.initialize();
    shutdownLogPath = path.join(app.getPath('userData'), 'shutdown.log');
    shutdownCoordinator = new ShutdownCoordinator({
      timeoutMs: 15000,
      logger: logRecord,
      sendRequest: payload => {
        if (!mainWindow || mainWindow.isDestroyed()) throw new Error('The main window is unavailable.');
        mainWindow.webContents.send('app:shutdown-request', payload);
      }
    });
    pendingOpenPath = acceptedOpenPath(process.argv);
    registerIpc();
    createWindow();
    app.on('activate', () => {
      if (!shutdownFinalizing && BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('before-quit', event => {
  if (shutdownCoordinator?.approved || shutdownFinalizing) return;
  event.preventDefault();
  void beginShutdown('application-quit');
});
app.on('will-quit', () => logRecord('will-quit'));
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
