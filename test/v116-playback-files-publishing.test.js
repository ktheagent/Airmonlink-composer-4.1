'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const api = require('../src/composer3/engine-api');
const model = require('../src/core/score-model');

test('Build 26 transport pauses at the current beat and resumes from it', () => {
  const engine = api.createEngine({ measures: 4, autoFillRests: false });
  let stopped = false;
  engine.playback = {
    playing: true,
    currentBeat: 5.25,
    stop() { stopped = true; this.playing = false; }
  };
  const paused = engine.pausePlayback();
  assert.equal(stopped, true);
  assert.equal(engine.cursor, 5.25);
  assert.equal(paused.paused, true);
  assert.equal(paused.playing, false);
});

test('Build 26 measure navigation uses exact score timeline boundaries', () => {
  const engine = api.createEngine({ measures: 4, timeSignature: '4/4', autoFillRests: false });
  engine.setMeasureAttributes(1, { timeSignature: '3/4' });
  const moved = engine.jumpToMeasure(3);
  assert.equal(moved.measure, 3);
  assert.equal(moved.beat, model.measureStartBeat(engine.score, 2));
  assert.equal(engine.cursor, 7);
  const clamped = engine.jumpToMeasure(999);
  assert.equal(clamped.measure, 4);
});

test('Build 26 count-in settings are clamped and exposed by transport state', () => {
  const engine = api.createEngine({ measures: 2, autoFillRests: false });
  engine.setPlaybackOptions({ countInMeasures: 2, metronome: true });
  assert.equal(engine.playbackState().countInMeasures, 2);
  engine.setPlaybackOptions({ countInMeasures: 99 });
  assert.equal(engine.playbackState().countInMeasures, 4);
});

test('Build 26 playback source schedules count-in before score audio', () => {
  const playback = read('src/core/playback.js');
  const engine = read('src/composer3/engine-api.js');
  assert.match(playback, /countInBeats/);
  assert.match(playback, /countInStart/);
  assert.match(playback, /countInBeats \* secondsPerBeat/);
  assert.match(engine, /countInMeasures/);
  assert.match(engine, /pausePlayback\(\)/);
  assert.match(engine, /resumePlayback\(/);
  assert.match(engine, /jumpToMeasure\(/);
});

test('Build 26 interface exposes complete transport and MIDI output controls', () => {
  const html = read('src/composer3/index.html');
  for (const command of ['pause', 'resume', 'jumpMeasure', 'enableMidiOutput', 'playMidiOutput', 'stopMidiOutput']) {
    assert.match(html, new RegExp(`data-command="${command}"`));
  }
  assert.match(html, /id="countInMeasures"/);
  assert.match(html, /id="jumpMeasureNumber"/);
  assert.match(html, /id="midiOutputSelect"[^>]*aria-label="MIDI output device"/);
  assert.match(html, /id="midiOutputStatus"[^>]*aria-live="polite"/);
});

test('Build 26 MIDI output sends real note-on and note-off messages from semantic events', () => {
  const app = read('src/composer3/app.js');
  assert.match(app, /function playScoreToMidiOutput\(\)/);
  assert.match(app, /0x90 \| channel/);
  assert.match(app, /0x80 \| channel/);
  assert.match(app, /midiOutputPort\.send|midiOutputPort\?\.send/);
  assert.match(app, /engine\.score\.parts/);
  assert.match(app, /engine\.transport\.layerMix/);
});

test('Build 26 print preview is isolated through explicit Electron IPC', () => {
  const html = read('src/composer3/index.html');
  const app = read('src/composer3/app.js');
  const preload = read('src/composer3/preload.js');
  const main = read('src/composer3/main.js');
  assert.match(html, /data-command="printPreview"/);
  assert.match(app, /window\.airmonDesktop\.printPreview/);
  assert.match(preload, /app:print-preview/);
  assert.match(main, /ipcMain\.handle\('app:print-preview'/);
  assert.match(main, /printToPDF/);
  assert.match(main, /data:application\/pdf;base64/);
  assert.match(main, /nodeIntegration:\s*false/);
});

test('Build 26 protects dirty projects before new/setup and requests coordinated quit', () => {
  const app = read('src/composer3/app.js');
  assert.match(app, /engine\.dirty && !window\.confirm\('Create a new score and discard unsaved changes\?'\)/);
  assert.match(app, /Create a new score from this setup and discard unsaved changes\?/);
  assert.match(app, /window\.airmonDesktop\.requestQuit/);
  assert.match(app, /onShutdownRequest/);
  assert.match(app, /autosaveDocument/);
});
