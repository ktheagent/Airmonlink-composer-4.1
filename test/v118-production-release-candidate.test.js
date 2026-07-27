'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('Build 29 integration metadata is internally consistent', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));

  assert.equal(pkg.version, '1.1.9');
  assert.equal(String(pkg.buildNumber), '29');
  assert.equal(pkg.build.buildVersion, '1.1.9.29');
  assert.equal(lock.version, '1.1.9');
  assert.equal(lock.packages[''].version, '1.1.9');
  assert.match(pkg.build.nsis.artifactName, /Build29-Setup/);
  assert.match(pkg.build.portable.artifactName, /Build29-Portable/);
});

test('Build 29 lockfile contains no private internal registry host', () => {
  const lock = read('package-lock.json');
  assert.doesNotMatch(lock, /packages\.hub\.ace-research\.openai\.org/);
  assert.doesNotMatch(lock, /packages\.applied-caas-gateway1\.internal\.api\.openai\.org/);
  assert.match(lock, /https:\/\/registry\.npmjs\.org\//);
});

test('Build 29 packages only the canonical Composer 3 application boundary', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.deepEqual(pkg.build.files, [
    'src/composer3/**/*',
    'src/core/**/*',
    'src/desktop/**/*',
    'assets/**/*',
    'package.json'
  ]);

  for (const legacy of [
    'src/ui',
    'src/main.js',
    'src/preload.js',
    'src/bootstrap.js',
    'src/startup-guard.js'
  ]) {
    assert.equal(fs.existsSync(path.join(root, legacy)), false, `${legacy} must be absent`);
  }
});

test('Build 29 Windows package declares installer, portable target and airscore association', () => {
  const pkg = JSON.parse(read('package.json'));
  const targets = pkg.build.win.target.map(item => item.target).sort();
  assert.deepEqual(targets, ['nsis', 'portable']);
  assert.deepEqual(pkg.build.win.target.flatMap(item => item.arch), ['x64', 'x64']);
  assert.equal(pkg.build.fileAssociations[0].ext, 'airscore');
  assert.equal(pkg.build.fileAssociations[0].role, 'Editor');
  assert.equal(pkg.build.nsis.deleteAppDataOnUninstall, false);
});

test('Build 29 stays under the local GitHub embargo until the exit gate passes', () => {
  const status = read('docs/development/PROJECT-STATUS.md');
  assert.match(status, /GITHUB_EMBARGO_STATUS:\s*ACTIVE/);
  assert.doesNotMatch(status, /GITHUB_EMBARGO_STATUS:\s*LIFTED/);
  assert.match(status, /NOT FINAL|NOT COMPLETE|BLOCKED/i);
});

test('Build 29 status documents every unavailable production gate', () => {
  const audit = read('docs/development/BUILD29-INTEGRATION-AUDIT.md');
  for (const token of [
    'Clean dependency installation',
    'Windows x64 installer',
    'Portable executable',
    'PE metadata',
    'File association',
    'Upgrade',
    'Human Windows visual inspection',
    'Physical audio',
    'Physical MIDI',
    'Physical printer',
    'Code signing',
    'Best-Version Exit Gate'
  ]) {
    assert.match(audit, new RegExp(token, 'i'));
  }
});
