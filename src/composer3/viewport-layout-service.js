'use strict';

(function expose(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AirmonViewportLayout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createModule() {
  const CSS_DPI = 96;
  const MM_PER_INCH = 25.4;

  const PAGE_MM = Object.freeze({
    A4: Object.freeze({ width: 210, height: 297 }),
    A3: Object.freeze({ width: 297, height: 420 }),
    A5: Object.freeze({ width: 148, height: 210 }),
    Letter: Object.freeze({ width: 215.9, height: 279.4 }),
    Legal: Object.freeze({ width: 215.9, height: 355.6 })
  });

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function mmToCssPixels(mm) {
    return (finite(mm, 0) / MM_PER_INCH) * CSS_DPI;
  }

  function normalizeMargins(value = 15) {
    const source = typeof value === 'object' && value !== null ? value : {};
    const fallback = Math.max(0, finite(typeof value === 'number' ? value : 15, 15));
    const topMm = Math.max(0, finite(source.top, fallback));
    const rightMm = Math.max(0, finite(source.right, fallback));
    const bottomMm = Math.max(0, finite(source.bottom, fallback));
    const leftMm = Math.max(0, finite(source.left, fallback));
    return Object.freeze({
      mm: Object.freeze({ top: topMm, right: rightMm, bottom: bottomMm, left: leftMm }),
      pixels: Object.freeze({
        top: mmToCssPixels(topMm),
        right: mmToCssPixels(rightMm),
        bottom: mmToCssPixels(bottomMm),
        left: mmToCssPixels(leftMm)
      })
    });
  }

  function pageSpec(options = {}) {
    const requested = String(options.size || 'A4');
    const base = PAGE_MM[requested] || PAGE_MM.A4;
    const landscape = options.orientation === 'landscape';
    const widthMm = landscape ? base.height : base.width;
    const heightMm = landscape ? base.width : base.height;
    const width = mmToCssPixels(widthMm);
    const height = mmToCssPixels(heightMm);
    const margins = normalizeMargins(options.margins ?? options.marginMm ?? 15);
    const contentWidth = Math.max(1, width - margins.pixels.left - margins.pixels.right);
    const contentHeight = Math.max(1, height - margins.pixels.top - margins.pixels.bottom);
    return Object.freeze({
      size: PAGE_MM[requested] ? requested : 'A4',
      orientation: landscape ? 'landscape' : 'portrait',
      widthMm,
      heightMm,
      width,
      height,
      aspectRatio: width / height,
      marginsMm: margins.mm,
      margins: margins.pixels,
      content: Object.freeze({ width: contentWidth, height: contentHeight })
    });
  }

  function usableViewport(input = {}) {
    const width = Math.max(1, finite(input.width, 1));
    const height = Math.max(1, finite(input.height, 1));
    const insets = input.insets || {};
    const horizontal = Math.max(0, finite(insets.left, 0))
      + Math.max(0, finite(insets.right, 0))
      + Math.max(0, finite(insets.paddingX, 0) * 2);
    const vertical = Math.max(0, finite(insets.top, 0))
      + Math.max(0, finite(insets.bottom, 0))
      + Math.max(0, finite(insets.paddingY, 0) * 2);
    return Object.freeze({
      width: Math.max(1, width - horizontal),
      height: Math.max(1, height - vertical)
    });
  }

  function computeZoom(input = {}) {
    const mode = String(input.mode || 'actual');
    const viewport = usableViewport(input.viewport || {});
    const page = input.page || pageSpec();
    const pageWidth = Math.max(1, finite(page.width, 1));
    const pageHeight = Math.max(1, finite(page.height, 1));
    const minimum = clamp(finite(input.minimum, 0.2), 0.05, 1);
    const maximum = Math.max(minimum, finite(input.maximum, 3));
    let zoom;
    if (mode === 'width') zoom = viewport.width / pageWidth;
    else if (mode === 'page') zoom = Math.min(viewport.width / pageWidth, viewport.height / pageHeight);
    else if (mode === 'custom') zoom = finite(input.customZoom, 1);
    else zoom = 1;

    // CSS pixels already account for Windows display scaling. Multiplying by
    // devicePixelRatio here would apply display scale twice.
    return clamp(zoom, minimum, maximum);
  }

  function scaledPageBox(page, zoom) {
    const safeZoom = Math.max(0.01, finite(zoom, 1));
    return Object.freeze({
      width: Math.max(1, finite(page?.width, 1)) * safeZoom,
      height: Math.max(1, finite(page?.height, 1)) * safeZoom
    });
  }

  function layoutPages(input = {}) {
    const count = Math.max(1, Math.floor(finite(input.count, 1)));
    const page = input.page || pageSpec();
    const zoom = Math.max(0.01, finite(input.zoom, 1));
    const box = scaledPageBox(page, zoom);
    const gap = Math.max(0, finite(input.gap, 32));
    const mode = ['continuous', 'single', 'spread', 'horizontal'].includes(input.mode)
      ? input.mode
      : 'continuous';
    const pages = [];

    if (mode === 'horizontal') {
      for (let index = 0; index < count; index += 1) {
        pages.push(Object.freeze({ index, x: index * (box.width + gap), y: 0, ...box }));
      }
    } else if (mode === 'spread') {
      for (let index = 0; index < count; index += 1) {
        const row = Math.floor(index / 2);
        const column = index % 2;
        pages.push(Object.freeze({
          index,
          x: column * (box.width + gap),
          y: row * (box.height + gap),
          ...box
        }));
      }
    } else {
      for (let index = 0; index < count; index += 1) {
        pages.push(Object.freeze({
          index,
          x: 0,
          y: mode === 'single' ? 0 : index * (box.height + gap),
          ...box
        }));
      }
    }

    const right = Math.max(...pages.map(item => item.x + item.width));
    const bottom = Math.max(...pages.map(item => item.y + item.height));
    return Object.freeze({
      mode,
      zoom,
      gap,
      page: Object.freeze({ width: finite(page.width, 1), height: finite(page.height, 1) }),
      pages: Object.freeze(pages),
      extent: Object.freeze({ width: right, height: bottom })
    });
  }

  function paginateSystems(input = {}) {
    const count = Math.max(1, Math.floor(finite(input.count, 1)));
    const systemHeight = Math.max(1, finite(input.systemHeight, 1));
    const pageContentHeight = Math.max(systemHeight, finite(input.pageContentHeight, systemHeight));
    const footerHeight = Math.max(0, finite(input.footerHeight, 0));
    const firstHeaderHeight = Math.max(0, finite(input.firstHeaderHeight, 0));
    const followingHeaderHeight = Math.max(0, finite(input.followingHeaderHeight, 0));
    const pages = [];
    let firstSystem = 0;
    let pageIndex = 0;
    while (firstSystem < count) {
      const headerHeight = pageIndex === 0 ? firstHeaderHeight : followingHeaderHeight;
      const available = Math.max(systemHeight, pageContentHeight - headerHeight - footerHeight);
      const capacity = Math.max(1, Math.floor(available / systemHeight));
      const lastSystem = Math.min(count, firstSystem + capacity);
      pages.push(Object.freeze({
        index: pageIndex,
        firstSystem,
        lastSystem,
        systemCount: lastSystem - firstSystem,
        capacity
      }));
      firstSystem = lastSystem;
      pageIndex += 1;
    }
    return Object.freeze(pages);
  }

  function pageAtOffset(layout, offset, axis = 'vertical') {
    const value = Math.max(0, finite(offset, 0));
    const coordinate = axis === 'horizontal' ? 'x' : 'y';
    const size = axis === 'horizontal' ? 'width' : 'height';
    let best = layout.pages[0];
    let bestDistance = Infinity;
    for (const page of layout.pages) {
      const start = page[coordinate];
      const end = start + page[size];
      if (value >= start && value <= end) return page.index;
      const distance = Math.min(Math.abs(value - start), Math.abs(value - end));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = page;
      }
    }
    return best.index;
  }

  function anchorForScroll(layout, scroll = {}) {
    const pageIndex = pageAtOffset(layout, scroll.top || 0, 'vertical');
    const page = layout.pages[pageIndex];
    const withinY = clamp((finite(scroll.top, 0) - page.y) / Math.max(1, page.height), 0, 1);
    const withinX = clamp((finite(scroll.left, 0) - page.x) / Math.max(1, page.width), 0, 1);
    return Object.freeze({ pageIndex, withinX, withinY });
  }

  function scrollForAnchor(layout, anchor = {}) {
    const pageIndex = clamp(Math.floor(finite(anchor.pageIndex, 0)), 0, layout.pages.length - 1);
    const page = layout.pages[pageIndex];
    return Object.freeze({
      left: page.x + page.width * clamp(finite(anchor.withinX, 0), 0, 1),
      top: page.y + page.height * clamp(finite(anchor.withinY, 0), 0, 1)
    });
  }

  function horizontalOverflow(layout, viewportWidth, tolerance = 1) {
    return layout.extent.width - Math.max(1, finite(viewportWidth, 1)) > Math.max(0, finite(tolerance, 1));
  }

  class ViewportLayoutService {
    constructor(options = {}) {
      this.minimumZoom = finite(options.minimumZoom, 0.2);
      this.maximumZoom = finite(options.maximumZoom, 3);
      this.gap = finite(options.gap, 32);
      this.mode = options.mode || 'continuous';
      this.zoomMode = options.zoomMode || 'actual';
      this.customZoom = finite(options.customZoom, 1);
      this.page = pageSpec(options.page || {});
      this.viewport = usableViewport(options.viewport || {});
      this.zoom = 1;
      this.layout = layoutPages({ page: this.page, zoom: 1, gap: this.gap, mode: this.mode });
    }

    recompute(input = {}) {
      if (input.page) this.page = pageSpec(input.page);
      if (input.viewport) this.viewport = usableViewport(input.viewport);
      if (input.mode) this.mode = input.mode;
      if (input.zoomMode) this.zoomMode = input.zoomMode;
      if (input.customZoom != null) this.customZoom = finite(input.customZoom, this.customZoom);
      const anchor = input.previousLayout && input.scroll
        ? anchorForScroll(input.previousLayout, input.scroll)
        : null;
      this.zoom = computeZoom({
        mode: this.zoomMode,
        customZoom: this.customZoom,
        minimum: this.minimumZoom,
        maximum: this.maximumZoom,
        viewport: { width: this.viewport.width, height: this.viewport.height },
        page: this.page
      });
      this.layout = layoutPages({
        count: input.pageCount || 1,
        page: this.page,
        zoom: this.zoom,
        gap: this.gap,
        mode: this.mode
      });
      return Object.freeze({
        page: this.page,
        viewport: this.viewport,
        zoom: this.zoom,
        layout: this.layout,
        scroll: anchor ? scrollForAnchor(this.layout, anchor) : null
      });
    }
  }

  return Object.freeze({
    CSS_DPI,
    PAGE_MM,
    normalizeMargins,
    pageSpec,
    usableViewport,
    computeZoom,
    scaledPageBox,
    layoutPages,
    paginateSystems,
    pageAtOffset,
    anchorForScroll,
    scrollForAnchor,
    horizontalOverflow,
    ViewportLayoutService
  });
});
