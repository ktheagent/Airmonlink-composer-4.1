'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const engineApi = require('../src/composer3/engine-api');

test('Build 25 provides a hidden-by-default docked piano panel with accessible controls', () => {
  const html = read('src/composer3/index.html');
  assert.match(html, /data-command="togglePianoPanel"[^>]*aria-expanded="false"/);
  assert.match(html, /id="pianoPanel"[^>]*aria-label="Piano input panel"[^>]*hidden/);
  assert.match(html, /id="pianoKeyboard"[^>]*role="application"[^>]*aria-label="Two-octave piano keyboard"/);
  assert.match(html, /id="pianoInputMode"[^>]*type="checkbox"/);
  assert.match(html, /id="pianoOctave"/);
  assert.match(html, /id="pianoVelocity"[^>]*min="1"[^>]*max="127"/);
  assert.match(html, /data-command="collapsePianoPanel"[^>]*aria-label="Hide piano panel"/);
});

test('piano chord entry creates one semantic chord without duplicate pitches and one undo removes it', () => {
  const engine = engineApi.createEngine({ measures: 2, autoFillRests: false });
  const created = engine.addPianoChord([67, 60, 64, 64], {
    start: 0,
    duration: 1,
    voice: 2,
    staff: 1,
    velocity: 99
  });
  assert.equal(created.length, 3);
  assert.deepEqual(created.map(event => event.midi).sort((a, b) => a - b), [60, 64, 67]);
  assert.equal(new Set(created.map(event => event.chordId)).size, 1);
  assert.equal(created.every(event => event.voice === 2 && event.staff === 1), true);
  assert.equal(created.every(event => event.start === 0 && event.duration === 1 && event.velocity === 99), true);
  assert.equal(engine.state().selectedEvents.length, 3);
  assert.equal(engine.state().cursor, 1);
  assert.equal(engine.undo(), true);
  assert.equal(engine.state().score.parts[0].events.length, 0);
});

test('piano entry routes through the active part, active voice, cursor and duration', () => {
  const engine = engineApi.createEngine({ measures: 3, autoFillRests: false });
  engine.setActiveVoice(4);
  engine.seek(2);
  engine.setDuration(0.5);
  const created = engine.addPianoChord([72, 76], { velocity: 73 });
  assert.equal(created.length, 2);
  assert.equal(created.every(event => event.voice === 4), true);
  assert.equal(created.every(event => event.start === 2), true);
  assert.equal(created.every(event => event.duration === 0.5), true);
  assert.equal(created.every(event => event.velocity === 73), true);
  assert.equal(engine.state().cursor, 2.5);
});

test('piano settings survive an airscore round trip', () => {
  const engine = engineApi.createEngine({ measures: 1, autoFillRests: false });
  engine.setSettings({
    pianoPanelOpen: true,
    pianoOctave: 5,
    pianoInputMode: false,
    pianoVelocity: 104,
    highContrast: true,
    largeControls: true
  });
  const serialized = engine.serializeAirscore();
  const reopened = engineApi.createEngine({ measures: 1, autoFillRests: false });
  reopened.openAirscore(serialized);
  assert.equal(reopened.score.settings.pianoPanelOpen, true);
  assert.equal(reopened.score.settings.pianoOctave, 5);
  assert.equal(reopened.score.settings.pianoInputMode, false);
  assert.equal(reopened.score.settings.pianoVelocity, 104);
  assert.equal(reopened.score.settings.highContrast, true);
  assert.equal(reopened.score.settings.largeControls, true);
});

test('professional interface keeps the piano dock below the score rather than overlaying it', () => {
  const css = read('src/composer3/styles.css');
  assert.match(css, /\.workspace\{[^}]*grid-template-rows:minmax\(0,1fr\) auto/);
  assert.match(css, /\.score-area\{[^}]*grid-column:2[^}]*grid-row:1/);
  assert.match(css, /\.piano-panel\{[^}]*grid-column:2[^}]*grid-row:2/);
  assert.match(css, /\.piano-panel\[hidden\]\{display:none\}/);
  assert.match(css, /@media\(max-width:900px\)[\s\S]*\.piano-panel\{grid-column:1/);
  assert.match(css, /@media print\{[\s\S]*\.piano-panel/);
});

test('piano panel uses direct engine commands and never hidden legacy controls', () => {
  const app = read('src/composer3/app.js');
  const api = read('src/composer3/engine-api.js');
  assert.match(app, /engine\.addPianoChord\(midis/);
  assert.match(app, /case 'togglePianoPanel'/);
  assert.match(app, /case 'collapsePianoPanel'/);
  assert.match(app, /pianoInputMode/);
  assert.match(app, /pointerdown/);
  assert.match(api, /pianoChord:\s*\(\)\s*=>\s*this\.addPianoChord/);
  assert.match(api, /\['NOTE ENTRY',[^\n]*'pianoChord'/);
  assert.doesNotMatch(app, /forwardCommand|source\.click\(\)/);
  assert.doesNotMatch(app, /createElement\(['"](?:button|nav|header)['"]\)[\s\S]{0,300}composer3CommandBridge/);
});

test('professional interface preserves official colour identity and accessibility modes', () => {
  const css = read('src/composer3/styles.css');
  assert.match(css, /--navy-950:#06152f/);
  assert.match(css, /--royal-600:#1d64c8/);
  assert.match(css, /--gold-500:#d9a928/);
  assert.match(css, /--paper:#fffefa/);
  assert.match(css, /body\.high-contrast/);
  assert.match(css, /body\.large-controls/);
  assert.match(css, /:focus-visible/);
});
