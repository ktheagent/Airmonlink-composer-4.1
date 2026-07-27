'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('Version 1.1.9 Build 29 has one clean production entry and source allowlist', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.version, '1.1.9');
  assert.equal(String(pkg.buildNumber), '29');
  assert.equal(pkg.main, 'src/composer3/main.js');
  assert.deepEqual(pkg.build.files, [
    'src/composer3/**/*',
    'src/core/**/*',
    'src/desktop/**/*',
    'assets/**/*',
    'package.json'
  ]);
  assert.equal(fs.existsSync(path.join(root, 'src/ui')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/main.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/preload.js')), false);
});

test('clean Composer 3 startup fails closed until the semantic renderer verifies', () => {
  const main = read('src/composer3/main.js');
  assert.match(main, /show:\s*false/);
  assert.match(main, /validateRenderer/);
  assert.match(main, /canonicalModel:\s*true/);
  assert.match(main, /fourVoiceLayers:\s*true/);
  assert.match(main, /legacySelectors:\s*0/);
  assert.match(main, /mainWindow\.show\(\)/);
  assert.match(main, /app\.exit\(1\)/);
  assert.doesNotMatch(main, /src[\\/]+ui|loadFile\([^)]*ui/);
});

test('clean Composer 3 HTML has six work areas, official palette and no legacy bridge', () => {
  const html = read('src/composer3/index.html');
  const css = read('src/composer3/styles.css');
  assert.equal((html.match(/data-tab=/g) || []).length, 6);
  for (const token of ['Compose', 'Notation', 'Lyrics', 'Playback', 'Publish', 'View']) {
    assert.match(html, new RegExp(`>${token}<`));
  }
  assert.doesNotMatch(html, /professional-nav|quick-toolbar|composer3CommandBridge|Build 14/);
  assert.match(css, /--navy-950:#06152f/);
  assert.match(css, /--royal-600:#1d64c8/);
  assert.match(css, /--gold-500:#d9a928/);
  assert.match(css, /--paper:#fffefa/);
});

test('renderer calls the canonical engine directly instead of hidden DOM controls', () => {
  const app = read('src/composer3/app.js');
  const api = read('src/composer3/engine-api.js');
  assert.match(app, /AirmonComposer3Engine\.createEngine/);
  assert.match(app, /window\.AirmonComposer3\s*=\s*Object\.freeze/);
  assert.match(api, /class Composer3Engine/);
  assert.match(api, /assertCanonical\(\)/);
  assert.doesNotMatch(app, /createElement\(['\"](?:button|nav|header)['\"]\)[\s\S]{0,300}composer3CommandBridge|forwardCommand|source\.click\(\)/);
});

test('preload exposes only explicit Composer 3 desktop operations', () => {
  const preload = read('src/composer3/preload.js');
  assert.match(preload, /contextBridge\.exposeInMainWorld\('airmonDesktop'/);
  assert.match(preload, /exportPdf/);
  assert.match(preload, /rendererReady/);
  assert.doesNotMatch(preload, /nodeIntegration|require:\s*require|process:\s*process/);
});
