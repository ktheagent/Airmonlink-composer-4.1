'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const api = Object.freeze({
  saveDocument: payload => ipcRenderer.invoke('document:save', payload),
  openDocument: payload => ipcRenderer.invoke('document:open', payload),
  openRecent: filePath => ipcRenderer.invoke('document:openPath', { filePath }),
  releaseDocument: filePath => ipcRenderer.invoke('document:release', { filePath }),
  listRecent: () => ipcRenderer.invoke('document:recent'),
  autosaveDocument: payload => ipcRenderer.invoke('document:autosave', payload),
  listRecoveries: () => ipcRenderer.invoke('document:recoveryList'),
  readRecovery: documentId => ipcRenderer.invoke('document:recoveryRead', { documentId }),
  discardRecovery: documentId => ipcRenderer.invoke('document:recoveryDiscard', { documentId }),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: patch => ipcRenderer.invoke('settings:set', patch),
  saveFile: payload => ipcRenderer.invoke('file:save', payload),
  openFile: payload => ipcRenderer.invoke('file:open', payload),
  exportPdf: payload => ipcRenderer.invoke('export:pdf', payload),
  printPreview: payload => ipcRenderer.invoke('app:print-preview', payload),
  print: () => ipcRenderer.invoke('app:print'),
  openExternal: url => ipcRenderer.invoke('app:openExternal', url),
  confirmClose: payload => ipcRenderer.invoke('app:confirm-close', payload),
  rendererReady: payload => ipcRenderer.invoke('composer3:ready', payload),
  updateDocumentState: payload => ipcRenderer.send('app:document-state', payload),
  requestQuit: () => ipcRenderer.send('app:request-quit'),
  respondToShutdown: payload => ipcRenderer.send('app:shutdown-response', payload),
  onShutdownRequest(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('app:shutdown-request', listener);
    return () => ipcRenderer.removeListener('app:shutdown-request', listener);
  },
  onShutdownAbort(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('app:shutdown-abort', listener);
    return () => ipcRenderer.removeListener('app:shutdown-abort', listener);
  },
  onOpenRequest(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('document:open-request', listener);
    return () => ipcRenderer.removeListener('document:open-request', listener);
  },
  platform: process.platform
});

contextBridge.exposeInMainWorld('airmonDesktop', api);
