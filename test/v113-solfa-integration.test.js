'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('../src/composer3/engine-api');
const solfa = require('../src/core/solfa');

function authored(engine, voice = null) {
  return engine.state().score.parts.flatMap(part => (part.events || [])
    .filter(event => event.generatedBy !== 'gap-fill' && (voice == null || Number(event.voice) === Number(voice)))
    .map(event => ({ part, event })));
}

test('Build 23 edits the same selected staff note bidirectionally from Tonic Sol-fa', () => {
  const engine = createEngine();
  const note = engine.addNote({ pitch: 'C4', start: 0, duration: 1 });
  engine.selectEvent(note.id);
  const result = engine.updateSelectedFromSolfa('m');

  const updated = authored(engine).find(item => item.event.id === note.id).event;
  assert.equal(result.eventId, note.id);
  assert.equal(updated.pitch, 'E4');
  assert.equal(updated.midi, 64);
  assert.match(engine.solfaText(), /\bm\b/i);
  assert.deepEqual(engine.verifySolfa(), []);
});

test('Build 23 converts a complete Tonic Sol-fa passage into the authoritative score', () => {
  const engine = createEngine();
  engine.setActiveVoice(3);
  const result = engine.applySolfaPassage("d r m f | s l t d'", {
    voice: 3,
    replace: true,
    allowIncompleteMeasures: true
  });

  assert.equal(result.valid, true);
  assert.equal(result.created.length, 8);
  const notes = authored(engine, 3).filter(item => item.event.type === 'note');
  assert.deepEqual(notes.map(item => item.event.midi), [60, 62, 64, 65, 67, 69, 71, 72]);
  assert.ok(notes.every(item => item.event.voice === 3));
  assert.deepEqual(engine.verifySolfa(), []);
});

test('Build 23 rejects invalid Sol-fa passages before replacing staff notation', () => {
  const engine = createEngine();
  const note = engine.addNote({ pitch: 'C4', start: 0, duration: 1 });
  const before = JSON.stringify(engine.state().score);

  const preview = engine.previewSolfaPassage('d ? m', { allowIncompleteMeasures: true });
  assert.equal(preview.valid, false);
  assert.throws(
    () => engine.applySolfaPassage('d ? m', { allowIncompleteMeasures: true }),
    /Correct the tonic sol-fa errors/
  );
  assert.equal(JSON.stringify(engine.state().score), before);
  assert.equal(authored(engine).some(item => item.event.id === note.id), true);
});

test('Build 23 preserves Sol-fa conventions, overlay and imported source through airscore', () => {
  const engine = createEngine();
  engine.setSettings({
    showSolfa: true,
    solfaConvention: 'modern-teaching-v1',
    minorSolfaSystem: 'la-based',
    solfaShowRhythm: true,
    solfaShowOctaveMarks: true
  });
  engine.applySolfaPassage("do re mi fa | sol la ti do'", {
    convention: 'modern-teaching-v1',
    allowIncompleteMeasures: true
  });

  const reopened = createEngine();
  reopened.openAirscore(engine.serializeAirscore());
  assert.equal(reopened.state().score.settings.showSolfa, true);
  assert.equal(reopened.state().score.settings.solfaConvention, 'modern-teaching-v1');
  assert.equal(reopened.state().score.settings.minorSolfaSystem, 'la-based');
  assert.equal(reopened.state().score.solfaLastImport.source, "do re mi fa | sol la ti do'");
  assert.deepEqual(reopened.verifySolfa(), []);
});

test('Build 23 formal symbol table documents punctuation without ambiguity', () => {
  const table = solfa.symbolTable('airmonlink-traditional-v1');
  const bySymbol = new Map(table.map(item => [item.symbol, item]));
  for (const symbol of [',', '.', '- / —', '_', '|', ':']) {
    assert.ok(bySymbol.has(symbol), `${symbol} must be documented`);
    assert.ok(bySymbol.get(symbol).meaning.length > 10);
    assert.ok(bySymbol.get(symbol).context.length > 3);
  }
});

test('Build 23 modulation recalculates Tonic Sol-fa without changing sounding pitch', () => {
  const engine = createEngine({ score: require('../src/core/score-model').createScore({ measures: 2, key: 'C', autoFillRests: false }) });
  const first = engine.addNote({ pitch: 'C4', start: 0, duration: 1 });
  const second = engine.addNote({ pitch: 'G4', start: 4, duration: 1 });
  engine.setMeasureAttributes(1, { key: 'G' });

  const before = authored(engine).map(item => [item.event.id, item.event.midi]);
  const text = engine.solfaText();
  const after = authored(engine).map(item => [item.event.id, item.event.midi]);

  assert.deepEqual(after, before);
  assert.match(text, /\bd\b/i);
  assert.ok(first.id && second.id);
  assert.deepEqual(engine.verifySolfa(), []);
});
