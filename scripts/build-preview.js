'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const composer = path.join(root, 'src', 'composer3');
let html = fs.readFileSync(path.join(composer, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(composer, 'styles.css'), 'utf8');

const mock = `
window.__desktopMock = {
  saved: [], exports: [], documentStates: [], ready: null, shutdown: null,
  recent: [], recoveries: [],
  settings: { autosaveSeconds: 45, defaultZoom: 'actual', defaultTemplate: 'lead', highContrast: false, largeControls: false }
};
const __previewMidiOutput = {
  id: 'preview-output',
  name: 'Preview MIDI Output',
  manufacturer: 'Airmonlink',
  state: 'connected',
  send(data, timestamp) {
    window.__desktopMock.midiMessages = window.__desktopMock.midiMessages || [];
    window.__desktopMock.midiMessages.push({ data: Array.from(data), timestamp: Number(timestamp) || 0 });
  },
  clear() { window.__desktopMock.midiCleared = true; }
};
Object.defineProperty(navigator, 'requestMIDIAccess', {
  configurable: true,
  value: async () => ({
    inputs: new Map(),
    outputs: new Map([[__previewMidiOutput.id, __previewMidiOutput]]),
    onstatechange: null
  })
});

window.airmonDesktop = {
  saveDocument(payload) {
    window.__desktopMock.saved.push(payload);
    return Promise.resolve({ canceled: false, filePath: payload.currentPath || '/preview/Untitled.airscore', backupCreated: false });
  },
  openDocument() { return Promise.resolve({ canceled: true }); },
  openRecent(filePath) {
    const item = window.__desktopMock.recent.find(entry => entry.filePath === filePath);
    if (!item || !item.content) return Promise.resolve({ canceled: true });
    return Promise.resolve({ canceled: false, filePath: item.filePath, content: item.content, readOnly: Boolean(item.readOnly) });
  },
  releaseDocument() { return Promise.resolve(true); },
  listRecent() { return Promise.resolve(window.__desktopMock.recent.map(({ content, ...entry }) => ({ ...entry, exists: entry.exists !== false }))); },
  autosaveDocument(payload) {
    const index = window.__desktopMock.recoveries.findIndex(item => item.documentId === payload.documentId);
    const record = { documentId: payload.documentId, title: payload.title, originalPath: payload.originalPath || '', savedAt: new Date().toISOString(), content: payload.content };
    if (index >= 0) window.__desktopMock.recoveries[index] = record;
    else window.__desktopMock.recoveries.push(record);
    return Promise.resolve(true);
  },
  listRecoveries() { return Promise.resolve(window.__desktopMock.recoveries.map(({ content, ...record }) => record)); },
  readRecovery(documentId) { return Promise.resolve(window.__desktopMock.recoveries.find(item => item.documentId === documentId) || null); },
  discardRecovery(documentId) {
    window.__desktopMock.recoveries = window.__desktopMock.recoveries.filter(item => item.documentId !== documentId);
    return Promise.resolve(true);
  },
  getSettings() { return Promise.resolve({ ...window.__desktopMock.settings }); },
  setSettings(value) {
    window.__desktopMock.settings = { ...window.__desktopMock.settings, ...value };
    return Promise.resolve({ ...window.__desktopMock.settings });
  },
  saveFile(payload) {
    window.__desktopMock.exports.push(payload);
    return Promise.resolve({ canceled: false, filePath: '/preview/' + payload.defaultName });
  },
  openFile() { return Promise.resolve({ canceled: true }); },
  exportPdf(payload) {
    window.__desktopMock.pdf = payload;
    return Promise.resolve({ canceled: false, filePath: '/preview/' + payload.defaultName, bytes: 4096 });
  },
  printPreview(payload) {
    window.__desktopMock.printPreview = payload;
    return Promise.resolve({ ok: true, bytes: 4096 });
  },
  print() { window.__desktopMock.printed = true; return Promise.resolve({ success: true }); },
  openExternal() { return Promise.resolve(true); },
  confirmClose() { return Promise.resolve('discard'); },
  rendererReady(payload) { window.__desktopMock.ready = payload; return Promise.resolve({ ok: true, build: payload.build }); },
  updateDocumentState(payload) { window.__desktopMock.documentStates.push(payload); },
  requestQuit() { window.__desktopMock.quit = true; },
  respondToShutdown(payload) { window.__desktopMock.shutdown = payload; },
  onShutdownRequest(callback) { window.__desktopMock.shutdownCallback = callback; return () => { window.__desktopMock.shutdownCallback = null; }; },
  onShutdownAbort(callback) { window.__desktopMock.shutdownAbort = callback; return () => { window.__desktopMock.shutdownAbort = null; }; },
  onOpenRequest(callback) { window.__desktopMock.openRequest = callback; return () => { window.__desktopMock.openRequest = null; }; },
  platform: 'linux'
};
`;

html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\s*/i, '');
html = html.replace('<link rel="stylesheet" href="styles.css">', `<style>\n${css}\n</style>`);
html = html.replace('<body>', `<body>\n<script>${mock.replace(/<\/script/gi, '<\\/script')}</script>`);

const scriptRegex = /<script src="([^"]+)"><\/script>/g;
html = html.replace(scriptRegex, (_tag, source) => {
  const file = path.resolve(composer, source);
  if (!file.startsWith(path.join(root, 'src'))) throw new Error(`Refusing to inline script outside src: ${source}`);
  const code = fs.readFileSync(file, 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script>\n${code}\n</script>`;
});

const output = path.join(root, 'Airmonlink-Composer-3-Preview.html');
fs.writeFileSync(output, html);
console.log(`Built ${output}`);
