'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  pageSpec,
  computeZoom,
  scaledPageBox,
  layoutPages,
  paginateSystems,
  horizontalOverflow,
  anchorForScroll,
  scrollForAnchor,
  ViewportLayoutService
} = require('../src/composer3/viewport-layout-service');

test('A4 portrait uses a complete physical-page aspect ratio rather than Build 28 half-page dimensions', () => {
  const page = pageSpec({ size: 'A4', orientation: 'portrait' });
  assert.ok(page.height > page.width);
  assert.ok(Math.abs((page.height / page.width) - Math.SQRT2) < 0.01);
  assert.ok(page.height > 1100);
});

test('A4 landscape swaps physical dimensions without inventing another page system', () => {
  const portrait = pageSpec({ size: 'A4', orientation: 'portrait' });
  const landscape = pageSpec({ size: 'A4', orientation: 'landscape' });
  assert.equal(Math.round(landscape.width), Math.round(portrait.height));
  assert.equal(Math.round(landscape.height), Math.round(portrait.width));
});

test('Fit Width at 1366x768 accounts for inspector and workspace padding without horizontal overflow', () => {
  const page = pageSpec({ size: 'A4' });
  const viewport = { width: 1366, height: 768, insets: { left: 250, paddingX: 24, top: 176 + 56, bottom: 28 } };
  const zoom = computeZoom({ mode: 'width', viewport, page });
  const box = scaledPageBox(page, zoom);
  const available = 1366 - 250 - 48;
  assert.ok(box.width <= available + 0.001);
  const layout = layoutPages({ count: 3, page, zoom, gap: 32, mode: 'continuous' });
  assert.equal(horizontalOverflow(layout, available), false);
});

test('Fit Page at 1920x1080 fits the complete page, not only its upper half', () => {
  const page = pageSpec({ size: 'A4' });
  const viewport = { width: 1920, height: 1080, insets: { left: 250, paddingX: 24, paddingY: 24, top: 176 + 56, bottom: 28 } };
  const zoom = computeZoom({ mode: 'page', viewport, page });
  const box = scaledPageBox(page, zoom);
  assert.ok(box.width <= 1920 - 250 - 48 + 0.001);
  assert.ok(box.height <= 1080 - (176 + 56) - 28 - 48 + 0.001);
});

test('device-pixel ratio does not double-apply Windows display scaling', () => {
  const page = pageSpec({ size: 'A4' });
  const base = computeZoom({ mode: 'width', viewport: { width: 1000, height: 800 }, page });
  const scaledDisplay = computeZoom({
    mode: 'width',
    viewport: { width: 1000, height: 800, devicePixelRatio: 2 },
    page
  });
  assert.equal(scaledDisplay, base);
});

test('scaled layout boxes match visual dimensions at zoom below 100 percent', () => {
  const page = pageSpec({ size: 'A4' });
  const box = scaledPageBox(page, 0.5);
  assert.equal(box.width, page.width * 0.5);
  assert.equal(box.height, page.height * 0.5);
});

test('continuous page layout keeps complete pages in one connected column with stable gaps', () => {
  const page = pageSpec({ size: 'Letter' });
  const layout = layoutPages({ count: 4, page, zoom: 0.75, gap: 36, mode: 'continuous' });
  assert.equal(layout.pages.length, 4);
  assert.equal(layout.pages[1].x, 0);
  assert.equal(layout.pages[1].y - (layout.pages[0].y + layout.pages[0].height), 36);
  assert.equal(layout.extent.height, 4 * layout.pages[0].height + 3 * 36);
});

test('spread mode creates deterministic two-page rows', () => {
  const page = pageSpec({ size: 'A4' });
  const layout = layoutPages({ count: 3, page, zoom: 0.5, gap: 24, mode: 'spread' });
  assert.equal(layout.pages[0].y, layout.pages[1].y);
  assert.ok(layout.pages[1].x > layout.pages[0].x);
  assert.ok(layout.pages[2].y > layout.pages[0].y);
});

test('reflow preserves the current musical page anchor across zoom changes', () => {
  const page = pageSpec({ size: 'A4' });
  const before = layoutPages({ count: 5, page, zoom: 1, gap: 32, mode: 'continuous' });
  const scroll = { left: 0, top: before.pages[2].y + before.pages[2].height * 0.4 };
  const anchor = anchorForScroll(before, scroll);
  const after = layoutPages({ count: 5, page, zoom: 0.6, gap: 32, mode: 'continuous' });
  const restored = scrollForAnchor(after, anchor);
  const expected = after.pages[2].y + after.pages[2].height * 0.4;
  assert.ok(Math.abs(restored.top - expected) < 0.001);
});

test('one authoritative service recomputes page, viewport, zoom, layout and scroll together', () => {
  const service = new ViewportLayoutService({ page: { size: 'A4' }, zoomMode: 'width' });
  const first = service.recompute({
    viewport: { width: 1366, height: 768, insets: { left: 250, paddingX: 24, top: 232, bottom: 28 } },
    pageCount: 4
  });
  const second = service.recompute({
    viewport: { width: 1920, height: 1080, insets: { left: 250, paddingX: 24, top: 232, bottom: 28 } },
    pageCount: 4,
    previousLayout: first.layout,
    scroll: { top: first.layout.pages[1].y + 20, left: 0 }
  });
  assert.ok(second.zoom > first.zoom);
  assert.equal(second.layout.pages.length, 4);
  assert.ok(second.scroll.top >= second.layout.pages[1].y);
});


test('physical page margins produce one shared printable content box', () => {
  const page = pageSpec({ size: 'A4', orientation: 'portrait', margins: 15 });
  assert.ok(page.content.width < page.width);
  assert.ok(page.content.height < page.height);
  assert.ok(Math.abs(page.margins.left - page.margins.right) < 0.001);
  assert.ok(Math.abs(page.margins.top - page.margins.bottom) < 0.001);
});

test('staff systems are cast into complete physical pages without splitting a system', () => {
  const pages = paginateSystems({
    count: 11,
    systemHeight: 180,
    pageContentHeight: 980,
    firstHeaderHeight: 220,
    followingHeaderHeight: 100,
    footerHeight: 40
  });
  assert.ok(pages.length > 1);
  assert.equal(pages[0].firstSystem, 0);
  assert.equal(pages.at(-1).lastSystem, 11);
  for (let index = 1; index < pages.length; index += 1) {
    assert.equal(pages[index].firstSystem, pages[index - 1].lastSystem);
  }
  assert.ok(pages.every(page => page.systemCount >= 1 && page.systemCount <= page.capacity));
});
