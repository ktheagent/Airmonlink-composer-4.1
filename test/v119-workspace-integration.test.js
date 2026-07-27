'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('Build 29 loads the viewport service before the renderer', () => {
  const html = read('src/composer3/index.html');
  assert.match(html, /viewport-layout-service\.js"><\/script>\s*<script src="app\.js"/);
  assert.match(html, /id="staffPages"/);
  assert.match(html, /id="solfaPages" class="page-stage"/);
  assert.match(html, /id="pageStatus"/);
  assert.match(html, /id="pageLayoutMode"/);
});

test('Build 29 removes transform-only page compensation and hard-coded half-page dimensions', () => {
  const app = read('src/composer3/app.js');
  const css = read('src/composer3/styles.css');
  assert.doesNotMatch(app, /offsetWidth\s*\|\|\s*1120/);
  assert.doesNotMatch(app, /offsetHeight\s*\|\|\s*780/);
  assert.doesNotMatch(app, /marginBottom\s*=\s*`\$\{Math\.max/);
  assert.doesNotMatch(css, /width:1120px;min-height:780px/);
  assert.match(css, /--scaled-page-width/);
  assert.match(css, /--scaled-page-height/);
  assert.match(css, /\.page-slot\{/);
  assert.match(css, /\.physical-page\{/);
  assert.match(css, /\.app-shell\{width:100%;max-width:100vw;min-width:0\}/);
  assert.match(css, /html,body\{width:100%;max-width:100%;overflow:hidden\}/);
});

test('Build 29 uses one service for page size, zoom, page placement, margins, and pagination', () => {
  const app = read('src/composer3/app.js');
  assert.match(app, /new viewportApi\.ViewportLayoutService/);
  assert.match(app, /viewportService\.recompute/);
  assert.match(app, /viewportApi\.pageSpec\(physicalPageOptions\(\)\)/);
  assert.match(app, /viewportApi\.paginateSystems/);
  assert.match(app, /result\.page\.margins\.top/);
  assert.match(app, /pageLayoutMode === 'single'/);
  assert.match(app, /currentPageFromScroll/);
});

test('Build 29 observes real workspace changes and supports Ctrl-wheel zoom', () => {
  const app = read('src/composer3/app.js');
  assert.match(app, /new ResizeObserver/);
  assert.match(app, /window\.visualViewport\?\.addEventListener\('resize'/);
  assert.match(app, /addEventListener\('wheel'/);
  assert.match(app, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(app, /preservePosition/);
});

test('Staff and Tonic Sol-fa render into the same physical-page slot system', () => {
  const app = read('src/composer3/app.js');
  assert.match(app, /page\.className = 'paper physical-page staff-sheet'/);
  assert.match(app, /page\.className = 'solfa-sheet physical-page'/);
  assert.match(app, /slot\.className = 'page-slot'/);
  assert.match(app, /Page \$\{pageIndex \+ 1\} of \$\{pageCount\}/);
});
