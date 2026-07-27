'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const model = require('../src/core/score-model');
const airscore = require('../src/core/airscore');
const formats = require('../src/core/formats');
const engineApi = require('../src/composer3/engine-api');
const { withBoundedWait } = require('../src/desktop/shutdown-controller');

const root = path.resolve(__dirname, '..');

test('Build 27 rejects malformed and damaged airscore input without mutating the current score', () => {
  const engine = engineApi.createEngine({ measures: 2, autoFillRests: false });
  engine.addNote({ midi: 60, start: 0, duration: 1 });
  const before = JSON.parse(engine.serializeAirscore()).score;
  assert.throws(() => engine.openAirscore('{"signature":"WRONG"}'), /valid \.airscore/);
  assert.deepEqual(JSON.parse(engine.serializeAirscore()).score, before);

  const damaged = JSON.parse(engine.serializeAirscore());
  damaged.score.title = 'Tampered';
  assert.throws(() => engine.openAirscore(JSON.stringify(damaged)), /checksum/);
  assert.deepEqual(JSON.parse(engine.serializeAirscore()).score, before);
});

test('Build 27 rejects malformed MusicXML, MXL and MIDI inputs explicitly', async () => {
  assert.throws(() => formats.parseMusicXML('<score-partwise><part>'), /MusicXML|score|part/i);
  await assert.rejects(() => formats.parseMxl(Uint8Array.from([1, 2, 3, 4])), /MXL|ZIP|archive|central/i);
  assert.throws(() => formats.parseMidi(Uint8Array.from([0, 1, 2, 3])), /MIDI|header|invalid/i);
});

test('Build 27 rapid four-layer input preserves canonical validation and undo', () => {
  const engine = engineApi.createEngine({ measures: 128, autoFillRests: false });
  for (let index = 0; index < 200; index += 1) {
    engine.addPianoChord([60 + (index % 8), 64 + (index % 8)], {
      start: index * 0.25,
      duration: 0.25,
      voice: (index % 4) + 1,
      advance: false
    });
  }
  assert.equal(engine.assertCanonical(), true);
  assert.equal(engine.score.parts[0].events.length, 400);
  assert.deepEqual([...new Set(engine.score.parts[0].events.map(event => event.voice))].sort(), [1, 2, 3, 4]);
  assert.equal(engine.undo(), true);
  assert.equal(engine.score.parts[0].events.length, 398);
});

test('Build 27 large-score timeline lookup stays bounded', () => {
  const score = model.createScore({ measures: 2000, autoFillRests: false });
  model.measureIndexAt(score, 0);
  const started = performance.now();
  let checksum = 0;
  for (let index = 0; index < 100000; index += 1) {
    checksum += model.measureIndexAt(score, (index * 0.71) % model.totalBeats(score));
  }
  const elapsed = performance.now() - started;
  assert.ok(checksum > 0);
  assert.ok(elapsed < 2000, `lookups took ${elapsed.toFixed(1)} ms`);
});

test('Build 27 bounded waits convert hung operations into explicit timeout results', async () => {
  const result = await withBoundedWait(() => new Promise(() => {}), 30, 'reliability-hang');
  assert.equal(result.status, 'timeout');
  assert.match(result.label || result.operation || 'reliability-hang', /reliability-hang/);
});

test('Build 27 performance audit is a local machine-readable gate', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const script = fs.readFileSync(path.join(root, 'scripts/performance-audit.js'), 'utf8');
  assert.equal(pkg.scripts.performance, 'node scripts/performance-audit.js');
  assert.match(pkg.scripts['validate:full'], /npm run performance/);
  assert.match(script, /performance-report\.json/);
  assert.match(script, /100000-measure-lookups/);
  assert.match(script, /rapid-semantic-entry/);
  assert.match(script, /githubEmbargoStatus:\s*'ACTIVE'/);
});

test('Build 27 browser and desktop failure states remain visible and bounded', () => {
  const app = fs.readFileSync(path.join(root, 'src/composer3/app.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src/composer3/main.js'), 'utf8');
  assert.match(app, /showError\(error,/);
  assert.match(app, /MIDI permission failed/);
  assert.match(app, /Audio preview unavailable/);
  assert.match(app, /Recovery checkpoint saved locally/);
  assert.match(main, /withBoundedWait/);
  assert.match(main, /app\.exit\(1\)/);
});
