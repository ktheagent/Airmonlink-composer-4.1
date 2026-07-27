'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('../src/composer3/engine-api');

function noteEvents(engine) {
  return engine.state().score.parts.flatMap(part =>
    part.events.filter(event => event.type === 'note').map(event => ({ part, event }))
  );
}

test('Build 22 preserves ornaments, techniques, fermata and beams in the semantic event', () => {
  const engine = createEngine();
  const note = engine.addNote({ midi: 60, duration: 0.5, start: 0 });
  engine.selectEvent(note.id);

  assert.equal(engine.setOrnament('trill', true), 1);
  assert.equal(engine.setTechnique('fingering', '2', true), 1);
  assert.equal(engine.setBeam('begin', 1), 1);
  assert.equal(engine.setFermata(true), 1);

  const event = noteEvents(engine).find(item => item.event.id === note.id).event;
  assert.deepEqual(event.ornaments, ['trill']);
  assert.deepEqual(event.technical, [{ type: 'fingering', value: '2' }]);
  assert.deepEqual(event.beam, [{ number: 1, value: 'begin' }]);
  assert.equal(event.fermata, true);
});

test('Build 22 airscore round trip preserves notation-core extensions', () => {
  const engine = createEngine();
  const note = engine.addNote({ midi: 67, duration: 0.5, start: 0 });
  engine.selectEvent(note.id);
  engine.setOrnament('turn', true);
  engine.setTechnique('string', '3', true);
  engine.setBeam('continue', 1);
  engine.setFermata(true);

  const reopened = createEngine();
  reopened.openAirscore(engine.serializeAirscore());

  const event = noteEvents(reopened).find(item => item.event.midi === 67).event;
  assert.deepEqual(event.ornaments, ['turn']);
  assert.deepEqual(event.technical, [{ type: 'string', value: '3' }]);
  assert.deepEqual(event.beam, [{ number: 1, value: 'continue' }]);
  assert.equal(event.fermata, true);
});

test('Build 22 MusicXML export contains semantic notation-core elements', () => {
  const engine = createEngine();
  const note = engine.addNote({ midi: 64, duration: 0.5, start: 0 });
  engine.selectEvent(note.id);
  engine.setOrnament('trill', true);
  engine.setTechnique('fingering', '4', true);
  engine.setBeam('end', 1);
  engine.setFermata(true);

  const xml = engine.exportMusicXml();
  assert.match(xml, /<ornaments><trill\/><\/ornaments>/);
  assert.match(xml, /<technical><fingering>4<\/fingering><\/technical>/);
  assert.match(xml, /<fermata\/>/);
  assert.match(xml, /<beam number="1">end<\/beam>/);
});

test('Build 22 keeps exactly four independent user-facing voice layers', () => {
  const engine = createEngine();
  const created = [];

  for (let voice = 1; voice <= 4; voice += 1) {
    engine.setActiveVoice(voice);
    created.push(engine.addNote({
      midi: 59 + voice,
      duration: 1,
      start: 0,
      voice
    }));
  }

  const notes = noteEvents(engine).filter(item => created.some(event => event.id === item.event.id));
  assert.equal(notes.length, 4);
  assert.deepEqual(notes.map(item => item.event.voice).sort(), [1, 2, 3, 4]);
  assert.equal(new Set(notes.map(item => item.event.id)).size, 4);
  assert.equal(engine.state().score.parts[0].voiceLayers.length, 4);
  assert.deepEqual(engine.state().score.parts[0].voiceLayers, [1, 2, 3, 4]);
});

test('Build 22 undo and redo retain notation-core edits', () => {
  const engine = createEngine();
  const note = engine.addNote({ midi: 72, duration: 0.5, start: 0 });
  engine.selectEvent(note.id);
  engine.setOrnament('trill', true);

  assert.equal(noteEvents(engine).find(item => item.event.id === note.id).event.ornaments.includes('trill'), true);
  assert.equal(engine.undo(), true);
  assert.equal(noteEvents(engine).find(item => item.event.id === note.id).event.ornaments.includes('trill'), false);
  assert.equal(engine.redo(), true);
  assert.equal(noteEvents(engine).find(item => item.event.id === note.id).event.ornaments.includes('trill'), true);
});
