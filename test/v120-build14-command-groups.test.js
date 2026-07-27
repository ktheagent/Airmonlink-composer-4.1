'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { commandGroups } = require('../src/composer3/engine-api');

test('Composer 3 defines every required functional command group', () => {
  const required = [
    'FILE AND PROJECT', 'SELECTION AND CLIPBOARD', 'NOTE ENTRY', 'PITCH AND TONALITY',
    'RHYTHM AND MEASURES', 'VOICES AND LAYERS', 'ARTICULATIONS AND EXPRESSION',
    'TIES SLURS AND SPANNERS', 'LYRICS AND TEXT', 'HARMONY AND CHORDS',
    'STAFF AND INSTRUMENTS', 'TONIC SOLFA', 'LAYOUT AND PAGES', 'PLAYBACK',
    'IMPORT AND EXPORT', 'ACCESSIBILITY AND VIEW'
  ];
  assert.deepEqual(commandGroups.map(([name]) => name), required);
});

test('every generated group command is implemented by the clean renderer command dispatcher', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const renderer = fs.readFileSync(path.resolve(__dirname, '../src/composer3/app.js'), 'utf8');
  const commands = new Set(commandGroups.flatMap(([, names]) => names));
  for (const command of commands) {
    assert.match(renderer, new RegExp(`case ['"]${command}['"]`), `${command} needs a Composer 3 command handler`);
  }
});
