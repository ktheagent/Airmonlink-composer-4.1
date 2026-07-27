'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createEngine } = require('../src/composer3/engine-api');

function notes(engine) {
  return engine.state().score.parts.flatMap(part => (part.events || []).filter(event => event.type === 'note'));
}

function lyric(event, verse) {
  return (event.lyrics || []).find(item => Number(item.verse) === Number(verse));
}

test('Build 24 stores independent lyric verses as metadata without contaminating text', () => {
  const engine = createEngine();
  const first = engine.addNote({ pitch: 'C4', start: 0, duration: 1 });
  const second = engine.addNote({ pitch: 'D4', start: 1, duration: 1 });
  engine.selectEvents([first.id, second.id]);
  engine.setLyric('Glory', { verse: 1 });
  engine.setLyric('Peace', { verse: 2 });

  for (const event of notes(engine).filter(item => [first.id, second.id].includes(item.id))) {
    assert.equal(lyric(event, 1).text, 'Glory');
    assert.equal(lyric(event, 2).text, 'Peace');
    assert.equal(lyric(event, 1).text.includes('1'), false);
    assert.equal(lyric(event, 2).text.includes('2'), false);
  }
});

test('Build 24 rapid lyric entry preserves hyphens melismas and navigation order', () => {
  const engine = createEngine();
  for (let index = 0; index < 5; index += 1) {
    engine.addNote({ midi: 60 + index, start: index, duration: 1, advance: false });
  }
  engine.seek(0);
  const applied = engine.applyLyricsParagraph('Hal-le-lu-jah _', { verse: 3, startBeat: 0 });
  assert.ok(applied >= 4);
  const verse = notes(engine).map(event => lyric(event, 3)).filter(Boolean);
  assert.ok(verse.some(item => item.syllabic === 'begin'));
  assert.ok(verse.some(item => item.syllabic === 'end'));
  assert.ok(verse.some(item => item.melisma === true || item.text === ''));
});

test('Build 24 verse copy delete search replace and undo redo are semantic operations', () => {
  const engine = createEngine();
  const note = engine.addNote({ pitch: 'C4', start: 0, duration: 1 });
  engine.selectEvent(note.id);
  engine.setLyric('Light', { verse: 1 });
  assert.equal(engine.copyLyricVerse(1, 4), 1);
  assert.equal(engine.searchReplaceLyrics('Light', 'Hope', { verse: 4 }), 1);
  assert.equal(lyric(notes(engine)[0], 4).text, 'Hope');
  assert.equal(engine.deleteLyricVerse(4), 1);
  assert.equal(lyric(notes(engine)[0], 4), undefined);
  assert.equal(engine.undo(), true);
  assert.equal(lyric(notes(engine)[0], 4).text, 'Hope');
  assert.equal(engine.redo(), true);
  assert.equal(lyric(notes(engine)[0], 4), undefined);
});

test('Build 24 lyric offsets survive airscore round trip independently by verse', () => {
  const engine = createEngine();
  const note = engine.addNote({ pitch: 'C4', start: 0, duration: 1 });
  engine.selectEvent(note.id);
  engine.setLyric('One', { verse: 1 });
  engine.setLyric('Two', { verse: 2 });
  engine.setLyricOffset(12, -7, { verse: 2 });

  const reopened = createEngine();
  reopened.openAirscore(engine.serializeAirscore());
  const event = notes(reopened).find(item => item.id === note.id);
  assert.equal(lyric(event, 1).offsetX, 0);
  assert.equal(lyric(event, 2).offsetX, 12);
  assert.equal(lyric(event, 2).offsetY, -7);
});

test('Build 24 publication fields and staff text positions survive airscore', () => {
  const engine = createEngine();
  engine.setMetadata({
    title: 'A New Song',
    subtitle: 'For the Choir',
    dedication: 'Dedicated with gratitude',
    composer: 'A. Composer',
    lyricist: 'L. Writer',
    arranger: 'R. Arranger',
    compositionDate: '2026',
    copyright: 'Copyright Airmonlink',
    source: 'Original'
  });
  engine.setPublicationLayout('staff:title', { offsetX: 18, offsetY: -6, alignment: 'center', fontSize: 30 });
  engine.setPublicationLayout('staff:composer', { offsetX: -12, offsetY: 8, alignment: 'right' });

  const reopened = createEngine();
  reopened.openAirscore(engine.serializeAirscore());
  assert.equal(reopened.state().score.metadata.subtitle, 'For the Choir');
  assert.equal(reopened.state().score.metadata.dedication, 'Dedicated with gratitude');
  assert.equal(reopened.state().score.publicationTextLayout['staff:title'].offsetX, 18);
  assert.equal(reopened.state().score.publicationTextLayout['staff:title'].offsetY, -6);
  assert.equal(reopened.state().score.publicationTextLayout['staff:composer'].alignment, 'right');
});

test('Build 24 page text uses semantic page scope and persistent visual offsets', () => {
  const engine = createEngine();
  const item = engine.addAnnotation('page-text', 'Continuation header', {
    scope: 'page',
    partId: null,
    start: 0,
    sourceData: { page: 2 }
  });
  engine.setAnnotationLayout(item.id, { offsetX: 14, offsetY: 9 });

  const reopened = createEngine();
  reopened.openAirscore(engine.serializeAirscore());
  const restored = reopened.state().score.annotations.find(annotation => annotation.id === item.id);
  assert.equal(restored.type, 'page-text');
  assert.equal(restored.scope, 'page');
  assert.equal(restored.pageIndex, 1);
  assert.equal(restored.offsetX, 14);
  assert.equal(restored.offsetY, 9);
});

test('Build 24 MusicXML carries lyrics and publication credits', () => {
  const engine = createEngine();
  engine.setMetadata({ title: 'Publication Test', composer: 'Composer', lyricist: 'Lyricist' });
  const note = engine.addNote({ pitch: 'C4', start: 0, duration: 1 });
  engine.selectEvent(note.id);
  engine.setLyric('Sing', { verse: 1 });
  engine.setLyric('Rejoice', { verse: 2 });
  const xml = engine.exportMusicXml();
  assert.match(xml, /<work-title>Publication Test<\/work-title>/);
  assert.match(xml, /<creator type="composer">Composer<\/creator>/);
  assert.match(xml, /<creator type="lyricist">Lyricist<\/creator>/);
  assert.match(xml, /<lyric number="1"[^>]*>/);
  assert.match(xml, /<lyric number="2"[^>]*>/);
  assert.doesNotMatch(xml, />1Sing</);
});

test('Build 24 clean interface exposes draggable publication hierarchy without legacy controls', () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'src/composer3/index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'src/composer3/app.js'), 'utf8');
  for (const id of ['scoreTitleView', 'subtitleView', 'dedicationView', 'musicalFactsView', 'composerView', 'compositionDateView', 'lyricistView', 'arrangerView', 'sourceView', 'copyrightView']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /id="publicationLayoutMode"/);
  assert.match(app, /pointerdown/);
  assert.match(app, /pointermove/);
  assert.match(app, /setPublicationLayout/);
  assert.match(app, /setAnnotationLayout/);
  assert.doesNotMatch(html, /composer3CommandBridge|professional-nav|quick-toolbar/);
});
