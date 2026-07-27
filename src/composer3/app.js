'use strict';

(() => {
  const BUILD = 29;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const svgNs = 'http://www.w3.org/2000/svg';
  const engine = window.AirmonComposer3Engine.createEngine({ template: 'lead', measures: 8 });
  const viewportApi = window.AirmonViewportLayout;
  if (!viewportApi?.ViewportLayoutService) throw new Error('Viewport layout service is unavailable.');
  const viewportService = new viewportApi.ViewportLayoutService({
    page: { size: 'A4', orientation: 'portrait' },
    zoomMode: 'actual',
    minimumZoom: 0.2,
    maximumZoom: 3,
    gap: 32,
    mode: 'continuous'
  });
  let activeView = 'staff';
  let zoomMode = 'actual';
  let zoom = 1;
  let pageLayoutMode = 'continuous';
  let currentPageIndex = 0;
  const viewportStates = { staff: null, solfa: null };
  let viewportFrame = 0;
  let viewportObserver = null;
  let currentOpenReadOnly = false;
  let autosaveTimer = null;
  let midiAccess = null;
  let midiInputPort = null;
  let midiOutputPort = null;
  const midiOutputTimers = new Set();
  let pianoAudioContext = null;
  let pianoChordTimer = null;
  const pendingPianoMidis = new Set();
  const activePianoPointers = new Map();
  let appSettings = {
    autosaveSeconds: 45,
    defaultZoom: 'actual',
    highContrast: false,
    largeControls: false,
    defaultTemplate: 'lead'
  };

  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();

  function bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunk) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(String(value || ''));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function textToBase64(value) {
    return bytesToBase64(textEncoder.encode(String(value ?? '')));
  }

  function base64ToText(value) {
    return textDecoder.decode(base64ToBytes(value));
  }

  function setStatus(message) {
    $('#status').textContent = String(message || 'Ready');
  }

  function showError(error, context = 'Composer operation') {
    const message = error?.message || String(error || 'Unknown error');
    $('#errorMessage').textContent = `${context}: ${message}`;
    $('#errorBanner').hidden = false;
    setStatus(message);
    console.error(context, error);
  }

  function escapeXml(value) {
    return String(value ?? '').replace(/[<>&'"]/g, char => ({
      '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
    }[char]));
  }

  function svgElement(name, attributes = {}, text = null) {
    const node = document.createElementNS(svgNs, name);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (text != null) node.textContent = String(text);
    return node;
  }

  function activateTab(name) {
    $$('.tab').forEach(tab => {
      const active = tab.dataset.tab === name;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    $$('.panel').forEach(panel => {
      const active = panel.dataset.panel === name;
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    });
  }

  function activePageStage() {
    return activeView === 'staff' ? $('#staffPages') : $('#solfaPages');
  }

  function activePageSlots() {
    const stage = activePageStage();
    return stage ? Array.from(stage.querySelectorAll(':scope > .page-slot')) : [];
  }

  function physicalPageOptions() {
    const settings = engine.score?.settings || {};
    return {
      size: settings.pageSize || 'A4',
      orientation: settings.pageOrientation || settings.orientation || 'portrait',
      margins: Number(settings.margins) || 15
    };
  }

  function scoreAreaInsets(scoreArea) {
    const style = window.getComputedStyle(scoreArea);
    return {
      left: Number.parseFloat(style.paddingLeft) || 0,
      right: Number.parseFloat(style.paddingRight) || 0,
      top: Number.parseFloat(style.paddingTop) || 0,
      bottom: Number.parseFloat(style.paddingBottom) || 0
    };
  }

  function updatePageStatus(totalPages = activePageSlots().length || 1) {
    const output = $('#pageStatus');
    if (!output) return;
    const safeTotal = Math.max(1, totalPages);
    currentPageIndex = Math.max(0, Math.min(safeTotal - 1, currentPageIndex));
    output.textContent = `Page ${currentPageIndex + 1} / ${safeTotal} · ${Math.round(zoom * 100)}%`;
  }

  function currentPageFromScroll(layout, totalPages) {
    if (pageLayoutMode === 'single') return currentPageIndex;
    const scoreArea = $('#scoreArea');
    const stage = activePageStage();
    if (!scoreArea || !stage || !layout?.pages?.length) return currentPageIndex;
    const horizontal = pageLayoutMode === 'horizontal';
    const offset = horizontal
      ? scoreArea.scrollLeft - stage.offsetLeft + scoreArea.clientWidth / 2
      : scoreArea.scrollTop - stage.offsetTop + scoreArea.clientHeight / 2;
    const layoutIndex = viewportApi.pageAtOffset(layout, Math.max(0, offset), horizontal ? 'horizontal' : 'vertical');
    return Math.max(0, Math.min(totalPages - 1, layoutIndex));
  }

  function reflowViewport({ preservePosition = true } = {}) {
    const scoreArea = $('#scoreArea');
    const stage = activePageStage();
    const allSlots = activePageSlots();
    if (!scoreArea || !stage || !allSlots.length) return;

    const totalPages = allSlots.length;
    currentPageIndex = Math.max(0, Math.min(totalPages - 1, currentPageIndex));
    const visibleSlots = pageLayoutMode === 'single'
      ? allSlots.filter((slot, index) => {
        slot.hidden = index !== currentPageIndex;
        return index === currentPageIndex;
      })
      : allSlots.map(slot => {
        slot.hidden = false;
        return slot;
      });

    const previous = viewportStates[activeView];
    const insets = scoreAreaInsets(scoreArea);
    const relativeScroll = previous && preservePosition
      ? {
          left: Math.max(0, scoreArea.scrollLeft - stage.offsetLeft),
          top: Math.max(0, scoreArea.scrollTop - stage.offsetTop)
        }
      : null;
    const result = viewportService.recompute({
      page: physicalPageOptions(),
      viewport: {
        width: scoreArea.clientWidth,
        height: scoreArea.clientHeight,
        insets
      },
      mode: pageLayoutMode,
      zoomMode: zoomMode === 'manual' ? 'custom' : zoomMode,
      customZoom: zoom,
      pageCount: visibleSlots.length,
      previousLayout: previous?.layout,
      scroll: relativeScroll
    });

    zoom = result.zoom;
    viewportStates[activeView] = result;
    stage.style.width = `${Math.ceil(result.layout.extent.width)}px`;
    stage.style.height = `${Math.ceil(result.layout.extent.height)}px`;
    stage.dataset.layoutMode = pageLayoutMode;
    scoreArea.dataset.layoutMode = pageLayoutMode;
    scoreArea.dataset.zoomMode = zoomMode;

    const pageWidth = `${result.page.width}px`;
    const pageHeight = `${result.page.height}px`;
    visibleSlots.forEach((slot, index) => {
      const box = result.layout.pages[index];
      slot.style.left = `${box.x}px`;
      slot.style.top = `${box.y}px`;
      slot.style.width = `${box.width}px`;
      slot.style.height = `${box.height}px`;
      slot.style.setProperty('--scaled-page-width', `${box.width}px`);
      slot.style.setProperty('--scaled-page-height', `${box.height}px`);
      const page = slot.querySelector('.physical-page');
      if (page) {
        page.style.setProperty('--page-width', pageWidth);
        page.style.setProperty('--page-height', pageHeight);
        page.style.setProperty('--page-scale', String(zoom));
        page.style.setProperty('--page-margin-top', `${result.page.margins.top}px`);
        page.style.setProperty('--page-margin-right', `${result.page.margins.right}px`);
        page.style.setProperty('--page-margin-bottom', `${result.page.margins.bottom}px`);
        page.style.setProperty('--page-margin-left', `${result.page.margins.left}px`);
      }
    });

    if (result.scroll && preservePosition) {
      scoreArea.scrollLeft = Math.max(0, stage.offsetLeft + result.scroll.left);
      scoreArea.scrollTop = Math.max(0, stage.offsetTop + result.scroll.top);
    }
    currentPageIndex = currentPageFromScroll(result.layout, totalPages);
    updatePageStatus(totalPages);
  }

  function scheduleViewportReflow(options = {}) {
    if (viewportFrame) window.cancelAnimationFrame(viewportFrame);
    viewportFrame = window.requestAnimationFrame(() => {
      viewportFrame = 0;
      reflowViewport(options);
    });
  }

  function setView(view) {
    activeView = view === 'solfa' ? 'solfa' : 'staff';
    $('#staffPage').hidden = activeView !== 'staff';
    $('#solfaPage').hidden = activeView !== 'solfa';
    currentPageIndex = 0;
    render();
    scheduleViewportReflow({ preservePosition: false });
    setStatus(activeView === 'staff' ? 'Staff notation page' : 'Dedicated Tonic Sol-fa page');
  }

  function fitZoom(mode) {
    zoomMode = mode === 'width' || mode === 'page' ? mode : 'actual';
    if (zoomMode === 'actual') zoom = 1;
    reflowViewport();
  }

  function applyZoom() {
    zoomMode = zoomMode === 'width' || zoomMode === 'page' || zoomMode === 'actual' ? zoomMode : 'manual';
    reflowViewport();
  }

  function goToPage(index) {
    const slots = activePageSlots();
    if (!slots.length) return;
    currentPageIndex = Math.max(0, Math.min(slots.length - 1, Number(index) || 0));
    if (pageLayoutMode === 'single') {
      reflowViewport({ preservePosition: false });
      return;
    }
    const stage = activePageStage();
    const state = viewportStates[activeView];
    const box = state?.layout?.pages?.[currentPageIndex];
    if (!stage || !box) return;
    const scoreArea = $('#scoreArea');
    scoreArea.scrollTo({
      left: Math.max(0, stage.offsetLeft + box.x - 12),
      top: Math.max(0, stage.offsetTop + box.y - 12),
      behavior: 'smooth'
    });
    updatePageStatus(slots.length);
  }

  function eventPitchLabel(event) {
    return event.writtenPitch || event.pitch || (Number.isFinite(Number(event.midi)) ? window.AirmonMusicTheory.pitchFromMidi(Number(event.midi)) : '');
  }

  function eventLyric(event, verse = 1) {
    const item = (event.lyrics || []).find(lyric => Number(lyric.verse) === Number(verse));
    return item?.text || event.lyric || '';
  }


  function currentMeasureIndex() {
    return window.AirmonScoreModel.measureIndexAt(engine.score, engine.cursor);
  }

  function currentMeasure() {
    return engine.score.measures[currentMeasureIndex()] || engine.score.measures[0];
  }

  function renderParts(state) {
    const select = $('#partSelect');
    const existing = select.value;
    select.replaceChildren();
    state.score.parts.forEach(part => {
      const option = document.createElement('option');
      option.value = part.id;
      option.textContent = part.name || part.instrument || 'Part';
      select.appendChild(option);
    });
    select.value = state.activePartId || existing || state.score.parts[0]?.id || '';
    $('#voiceSelect').value = String(state.activeVoice);
  }

  function ensureStaffPages(pageCount, score) {
    const stage = $('#staffPages');
    const firstSlot = stage.querySelector(':scope > .page-slot');
    Array.from(stage.querySelectorAll(':scope > .page-slot')).slice(1).forEach(slot => slot.remove());

    const firstPage = firstSlot.querySelector('.physical-page');
    firstSlot.dataset.page = '1';
    firstPage.dataset.page = '1';
    firstPage.querySelector('.page-footer').textContent = `Page 1 of ${pageCount}`;
    $('#staffSvg').setAttribute('aria-label', `Editable staff notation page 1 of ${pageCount}`);

    for (let pageIndex = 1; pageIndex < pageCount; pageIndex += 1) {
      const slot = document.createElement('div');
      slot.className = 'page-slot';
      slot.dataset.page = String(pageIndex + 1);

      const page = document.createElement('article');
      page.className = 'paper physical-page staff-sheet';
      page.dataset.page = String(pageIndex + 1);

      const header = document.createElement('header');
      header.className = 'staff-continuation-header';
      const title = document.createElement('strong');
      title.textContent = score.title || score.metadata?.title || 'Untitled Score';
      const meta = document.createElement('span');
      meta.textContent = `Page ${pageIndex + 1} of ${pageCount}`;
      header.append(title, meta);

      const svg = document.createElementNS(svgNs, 'svg');
      svg.classList.add('staff-svg');
      svg.dataset.page = String(pageIndex + 1);
      svg.setAttribute('role', 'img');
      svg.setAttribute('tabindex', '0');
      svg.setAttribute('aria-label', `Editable staff notation page ${pageIndex + 1} of ${pageCount}`);

      const footer = document.createElement('footer');
      footer.className = 'page-footer';
      footer.setAttribute('aria-label', 'Page number');
      footer.textContent = `Page ${pageIndex + 1} of ${pageCount}`;

      page.append(header, svg, footer);
      slot.appendChild(page);
      stage.appendChild(slot);
    }
    return Array.from(stage.querySelectorAll('.staff-svg'));
  }

  function renderStaffSystemPage(svg, state, firstSystem, lastSystem, measuresPerSystem) {
    svg.replaceChildren();
    const score = state.score;
    const left = 115;
    const right = 965;
    const systemTop = 36;
    const partGap = 118;
    const systemGap = Math.max(42, Number(score.settings.systemGap) || 58);
    const staffHeight = Math.max(1, score.parts.length) * partGap;
    const localSystems = Math.max(1, lastSystem - firstSystem);
    const totalHeight = systemTop + localSystems * (staffHeight + systemGap) + 24;
    svg.setAttribute('viewBox', `0 0 1000 ${totalHeight}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMin meet');
    svg.removeAttribute('height');

    const selected = new Set(state.selection.eventIds || []);
    const showSolfa = Boolean(score.settings.showSolfa);

    for (let globalSystemIndex = firstSystem; globalSystemIndex < lastSystem; globalSystemIndex += 1) {
      const localSystemIndex = globalSystemIndex - firstSystem;
      const firstMeasure = globalSystemIndex * measuresPerSystem;
      const lastMeasure = Math.min(score.measures.length, firstMeasure + measuresPerSystem);
      const firstBounds = window.AirmonScoreModel.measureBounds(score, firstMeasure);
      const lastBounds = window.AirmonScoreModel.measureBounds(score, lastMeasure - 1);
      const systemStart = firstBounds.start;
      const systemEnd = lastBounds.end;
      const systemDuration = Math.max(.001, systemEnd - systemStart);

      score.parts.forEach((part, partIndex) => {
        const baseY = systemTop + localSystemIndex * (staffHeight + systemGap) + partIndex * partGap;
        svg.appendChild(svgElement('text', { x: 10, y: baseY + 35, class: 'staff-label' }, part.name || 'Part'));

        for (let line = 0; line < 5; line += 1) {
          const y = baseY + line * 12;
          svg.appendChild(svgElement('line', { x1: left, y1: y, x2: right, y2: y, stroke: '#1c293b', 'stroke-width': 1 }));
        }

        for (let measureIndex = firstMeasure; measureIndex <= lastMeasure; measureIndex += 1) {
          const x = left + ((measureIndex - firstMeasure) / Math.max(1, lastMeasure - firstMeasure)) * (right - left);
          svg.appendChild(svgElement('line', { x1: x, y1: baseY, x2: x, y2: baseY + 48, stroke: '#25364d', 'stroke-width': measureIndex === firstMeasure || measureIndex === lastMeasure ? 1.6 : 1 }));
          if (measureIndex < lastMeasure) {
            svg.appendChild(svgElement('text', { x: x + 4, y: baseY - 7, class: 'measure-number' }, String(measureIndex + 1)));
          }
        }

        for (let measureIndex = firstMeasure; measureIndex < lastMeasure; measureIndex += 1) {
          const bounds = window.AirmonScoreModel.measureBounds(score, measureIndex);
          const measure = score.measures[measureIndex];
          const measureX = left + ((bounds.start - systemStart) / systemDuration) * (right - left);
          if (measure.rehearsalMark) {
            svg.appendChild(svgElement('text', { x: measureX + 8, y: baseY - 26, class: 'rehearsal-mark' }, measure.rehearsalMark));
          }
          (score.chordSymbols || []).filter(item => item.start >= bounds.start - 1e-8 && item.start < bounds.end - 1e-8
            && (!item.partId || item.partId === part.id)).forEach(item => {
              const x = left + ((item.start - systemStart) / systemDuration) * (right - left);
              svg.appendChild(svgElement('text', { x, y: baseY - 8, class: 'chord-symbol' }, item.symbol || item.text || 'C'));
          });
          (score.annotations || []).filter(item => item.start >= bounds.start - 1e-8 && item.start < bounds.end - 1e-8
            && (!item.partId || item.partId === part.id)).forEach(item => {
              const x = left + ((item.start - systemStart) / systemDuration) * (right - left);
              const y = item.placement === 'below' ? baseY + 94 : baseY - 42;
              svg.appendChild(svgElement('text', { x, y, class: `score-annotation annotation-${item.type || 'text'}` }, item.text));
          });
        }

        const visible = (part.events || []).filter(event => {
          if (event.hidden || event.generatedBy === 'gap-fill') return false;
          return event.start >= systemStart - 1e-8 && event.start < systemEnd - 1e-8;
        });

        visible.forEach(event => {
          const x = left + ((event.start - systemStart) / systemDuration) * (right - left);
          const voiceOffset = (Math.max(1, Math.min(4, Number(event.voice) || 1)) - 2.5) * 2.3;
          const midi = Number(event.midi);
          const y = event.type === 'rest'
            ? baseY + 24 + voiceOffset
            : baseY + 24 - ((Number.isFinite(midi) ? midi : 60) - 60) * 3 + voiceOffset;

          const group = svgElement('g', {
            class: `${event.type === 'rest' ? 'rest-event' : 'note-event'}${selected.has(String(event.id)) ? ' selected' : ''}`,
            'data-event-id': event.id,
            tabindex: 0,
            role: 'button',
            'aria-label': event.type === 'rest' ? `Rest ${event.duration} beats` : `${eventPitchLabel(event)} ${event.duration} beats voice ${event.voice || 1}`
          });

          if (event.type === 'rest') {
            group.appendChild(svgElement('rect', { x: x - 7, y: y - 4, width: 14, height: 8, rx: 2, class: 'rest-glyph', fill: '#111827' }));
          } else {
            group.appendChild(svgElement('ellipse', { cx: x, cy: y, rx: 7.5, ry: 5.5, transform: `rotate(-18 ${x} ${y})`, class: 'note-head', fill: '#111827' }));
            const stemUp = y > baseY + 24;
            const stemX = stemUp ? x + 7 : x - 7;
            const stemEnd = stemUp ? y - 37 : y + 37;
            group.appendChild(svgElement('line', { x1: stemX, y1: y, x2: stemX, y2: stemEnd, stroke: '#111827', 'stroke-width': 1.4 }));
          }

          const lyric = eventLyric(event, 1);
          if (lyric) group.appendChild(svgElement('text', { x, y: baseY + 75, class: 'lyric-text' }, lyric));

          if (event.type === 'note') {
            const markings = [];
            if (Array.isArray(event.ornaments)) {
              if (event.ornaments.includes('trill-mark')) markings.push('tr');
              if (event.ornaments.includes('turn')) markings.push('↝');
            }
            if (event.fermata) markings.push('𝄐');
            if (markings.length) group.appendChild(svgElement('text', { x, y: y - 23, class: 'note-marking' }, markings.join(' ')));
            if (Array.isArray(event.technical) && event.technical.length) {
              const technique = event.technical.map(item => item.value ? `${item.type}:${item.value}` : item.type).join(' ');
              group.appendChild(svgElement('text', { x, y: baseY + 91, class: 'technique-text' }, technique));
            }
            if (Array.isArray(event.beam) && event.beam.length) {
              const beam = event.beam[0];
              const stemUp = y > baseY + 24;
              const beamY = stemUp ? y - 37 : y + 37;
              group.appendChild(svgElement('line', { x1: x - 8, y1: beamY, x2: x + 11, y2: beamY, class: `beam beam-${String(beam.value).replace(/\s+/g, '-')}`, stroke: '#111827', 'stroke-width': 4 }));
            }
          }

          if (showSolfa && event.type === 'note') {
            try {
              const token = window.AirmonSolfa.eventToSolfa(event, score, part, { style: score.settings.solfaStyle || 'traditional' });
              const value = token?.text || token?.syllable || String(token || '');
              if (value) group.appendChild(svgElement('text', { x, y: baseY - 18, class: 'solfa-overlay' }, value));
            } catch (_) {}
          }

          svg.appendChild(group);
        });
      });
    }
  }

  function renderStaff(state) {
    const score = state.score;
    const measuresPerSystem = 4;
    const systems = Math.max(1, Math.ceil(score.measures.length / measuresPerSystem));
    const partGap = 118;
    const systemGap = Math.max(42, Number(score.settings.systemGap) || 58);
    const logicalSystemHeight = Math.max(1, score.parts.length) * partGap + systemGap;
    const page = viewportApi.pageSpec(physicalPageOptions());
    const logicalContentHeight = page.content.height * 1000 / Math.max(1, page.content.width);
    const systemPages = viewportApi.paginateSystems({
      count: systems,
      systemHeight: logicalSystemHeight,
      pageContentHeight: logicalContentHeight,
      firstHeaderHeight: 220,
      followingHeaderHeight: 100,
      footerHeight: 42
    });
    const svgs = ensureStaffPages(systemPages.length, score);

    svgs.forEach((svg, pageIndex) => {
      const range = systemPages[pageIndex];
      renderStaffSystemPage(svg, state, range.firstSystem, range.lastSystem, measuresPerSystem);
    });
    scheduleViewportReflow();
  }


  function renderSolfa(state) {
    const container = $('#solfaPages');
    container.replaceChildren();
    const score = state.score;
    let pagination;
    try {
      pagination = engine.solfaPages({
        pageSize: score.settings.pageSize || 'A4',
        orientation: score.settings.pageOrientation || 'portrait',
        measuresPerSystem: Number(score.settings.solfaMeasuresPerSystem) || 4
      });
    } catch (error) {
      showError(error, 'Tonic Sol-fa layout');
      pagination = { pages: [{ index: 0, systems: [] }] };
    }

    const completeText = engine.solfaText();
    const lines = completeText.split('\n');
    const pageCount = Math.max(1, pagination.pages?.length || 1);
    const linesPerPage = Math.max(1, Math.ceil(lines.length / pageCount));

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const slot = document.createElement('div');
      slot.className = 'page-slot';
      slot.dataset.page = String(pageIndex + 1);

      const page = document.createElement('article');
      page.className = 'solfa-sheet physical-page';
      page.dataset.page = String(pageIndex + 1);

      const header = document.createElement('header');
      const title = document.createElement('h1');
      title.textContent = score.title || score.metadata?.title || 'Untitled Score';
      header.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'solfa-meta';
      const left = document.createElement('span');
      left.textContent = `Key: ${score.settings.key || 'C'} · Time: ${score.settings.timeSignature || '4/4'}`;
      const right = document.createElement('span');
      right.textContent = `${score.composer || score.metadata?.composer || ''}${pageCount > 1 ? ` · Page ${pageIndex + 1}/${pageCount}` : ''}`;
      meta.append(left, right);
      header.appendChild(meta);
      page.appendChild(header);

      const body = document.createElement('div');
      body.className = 'solfa-body';
      body.textContent = lines.slice(pageIndex * linesPerPage, (pageIndex + 1) * linesPerPage).join('\n');
      page.appendChild(body);

      const footer = document.createElement('footer');
      footer.className = 'page-footer';
      footer.setAttribute('aria-label', 'Page number');
      footer.textContent = `Page ${pageIndex + 1} of ${pageCount}`;
      page.appendChild(footer);

      slot.appendChild(page);
      container.appendChild(slot);
    }
    scheduleViewportReflow();
  }


  function setMidiStatus(message, status = null) {
    const output = $('#midiStatus');
    if (output) {
      output.textContent = String(message || 'MIDI disabled');
      if (status) output.dataset.status = status;
    }
  }

  function midiInputs() {
    if (!midiAccess?.inputs) return [];
    return Array.from(midiAccess.inputs.values()).filter(input => input.state !== 'disconnected');
  }

  function renderMidiDevices(selectedId = null) {
    const select = $('#midiDeviceSelect');
    if (!select) return;
    const inputs = midiInputs();
    const previous = selectedId || select.value;
    select.replaceChildren();
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = inputs.length ? 'Choose MIDI input' : 'No MIDI device';
    select.appendChild(empty);
    for (const input of inputs) {
      const option = document.createElement('option');
      option.value = input.id;
      option.textContent = input.manufacturer ? `${input.manufacturer} — ${input.name || input.id}` : (input.name || input.id);
      select.appendChild(option);
    }
    if (inputs.some(input => input.id === previous)) select.value = previous;
    else if (inputs.length === 1) select.value = inputs[0].id;
  }


  function midiOutputs() {
    if (!midiAccess?.outputs) return [];
    return Array.from(midiAccess.outputs.values()).filter(output => output.state !== 'disconnected');
  }

  function renderMidiOutputDevices(selectedId = null) {
    const select = $('#midiOutputSelect');
    if (!select) return;
    const outputs = midiOutputs();
    const previous = selectedId || select.value;
    select.replaceChildren();
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = outputs.length ? 'Choose MIDI output' : 'No MIDI output device';
    select.appendChild(empty);
    for (const output of outputs) {
      const option = document.createElement('option');
      option.value = output.id;
      option.textContent = output.manufacturer ? `${output.manufacturer} — ${output.name || output.id}` : (output.name || output.id);
      select.appendChild(option);
    }
    if (outputs.some(output => output.id === previous)) select.value = previous;
    else if (outputs.length === 1) select.value = outputs[0].id;
  }

  function setMidiOutputStatus(message, status = null) {
    const output = $('#midiOutputStatus');
    if (!output) return;
    output.textContent = String(message || 'MIDI output disabled');
    if (status) output.dataset.status = status;
  }

  function connectMidiOutput(deviceId) {
    const output = midiOutputs().find(item => item.id === String(deviceId || ''));
    midiOutputPort = output || null;
    if (!midiOutputPort) {
      setMidiOutputStatus(midiOutputs().length ? 'Choose a MIDI output device' : 'No MIDI output device found', midiOutputs().length ? 'ready' : 'no-device');
      return false;
    }
    setMidiOutputStatus(`Connected: ${midiOutputPort.name || midiOutputPort.id}`, 'connected');
    return true;
  }

  function stopMidiOutput() {
    for (const timer of midiOutputTimers) clearTimeout(timer);
    midiOutputTimers.clear();
    try { midiOutputPort?.clear?.(); } catch (_) {}
    setMidiOutputStatus(midiOutputPort ? 'MIDI output stopped' : 'MIDI output disabled', midiOutputPort ? 'connected' : 'disabled');
    return true;
  }

  function sendMidiAt(data, delayMs) {
    if (!midiOutputPort) throw new Error('Enable and choose a MIDI output before playback.');
    const delay = Math.max(0, Number(delayMs) || 0);
    if (typeof midiOutputPort.send === 'function' && Number.isFinite(performance?.now?.())) {
      midiOutputPort.send(data, performance.now() + delay);
      return;
    }
    const timer = setTimeout(() => {
      midiOutputTimers.delete(timer);
      midiOutputPort?.send?.(data);
    }, delay);
    midiOutputTimers.add(timer);
  }

  function playScoreToMidiOutput() {
    if (!midiOutputPort) throw new Error('Enable and choose a MIDI output before playback.');
    stopMidiOutput();
    const tempo = Math.max(20, Math.min(400, Number(engine.score.settings.tempo) || 120));
    const millisecondsPerBeat = 60000 / tempo;
    const startBeat = Number(engine.cursor) || 0;
    const soloedParts = engine.score.parts.some(part => part.solo);
    let scheduled = 0;
    for (const part of engine.score.parts) {
      if (part.muted || (soloedParts && !part.solo)) continue;
      for (const event of part.events || []) {
        if (event.type !== 'note' || event.generatedBy === 'gap-fill' || Number(event.start) < startBeat) continue;
        const mix = engine.transport.layerMix[event.voice] || engine.transport.layerMix[String(event.voice)] || {};
        const anySolo = Object.values(engine.transport.layerMix).some(item => item.solo);
        if (mix.muted || (anySolo && !mix.solo)) continue;
        const delay = (Number(event.start) - startBeat) * millisecondsPerBeat;
        const duration = Math.max(40, Number(event.duration || 1) * millisecondsPerBeat);
        const channel = Math.max(0, Math.min(15, Number(part.midiChannel ?? part.channel ?? 0) || 0));
        const velocity = Math.max(1, Math.min(127, Math.round((Number(event.velocity) || 88) * (Number(mix.volume ?? 1)))));
        sendMidiAt([0x90 | channel, Number(event.midi) & 0x7f, velocity], delay);
        sendMidiAt([0x80 | channel, Number(event.midi) & 0x7f, 0], delay + duration);
        scheduled += 1;
      }
    }
    setMidiOutputStatus(`Scheduled ${scheduled} note${scheduled === 1 ? '' : 's'} to MIDI output`, 'playing');
    return scheduled;
  }

  function handleMidiStateChange() {
    renderMidiDevices(engine.midiState().deviceId);
    renderMidiOutputDevices(midiOutputPort?.id);
    if (midiInputPort && midiInputPort.state === 'disconnected') {
      detachMidiPort();
      engine.configureMidi({ mode: $('#midiMode').value, status: 'disconnected', deviceId: null });
      setMidiStatus('MIDI device disconnected', 'disconnected');
    }
    if (midiOutputPort && midiOutputPort.state === 'disconnected') {
      stopMidiOutput();
      midiOutputPort = null;
      setMidiOutputStatus('MIDI output disconnected', 'disconnected');
    }
  }

  async function ensureMidiAccess() {
    if (midiAccess) return midiAccess;
    if (typeof navigator.requestMIDIAccess !== 'function') throw new Error('Web MIDI is unavailable on this system.');
    midiAccess = await navigator.requestMIDIAccess({ sysex: false });
    midiAccess.onstatechange = handleMidiStateChange;
    return midiAccess;
  }

  async function enableMidiOutput() {
    try {
      await ensureMidiAccess();
      renderMidiOutputDevices();
      const first = $('#midiOutputSelect').value;
      if (!first) {
        setMidiOutputStatus('No MIDI output device found', 'no-device');
        return false;
      }
      return connectMidiOutput(first);
    } catch (error) {
      setMidiOutputStatus(`MIDI output failed: ${error.message || error}`, 'permission-denied');
      showError(error, 'MIDI output');
      return false;
    }
  }

  function detachMidiPort() {
    if (midiInputPort) midiInputPort.onmidimessage = null;
    midiInputPort = null;
  }

  function connectMidiDevice(deviceId) {
    detachMidiPort();
    const id = String(deviceId || '');
    const input = midiInputs().find(item => item.id === id);
    if (!input) {
      engine.configureMidi({ mode: $('#midiMode').value, deviceId: null, status: midiInputs().length ? 'ready' : 'no-device' });
      setMidiStatus(midiInputs().length ? 'Choose a MIDI input device' : 'No MIDI input device found', midiInputs().length ? 'ready' : 'no-device');
      return false;
    }
    midiInputPort = input;
    engine.configureMidi({ mode: $('#midiMode').value, deviceId: input.id, status: 'connected' });
    input.onmidimessage = event => {
      try {
        engine.handleMidiMessage(event.data, Number(event.timeStamp) || performance.now());
      } catch (error) {
        showError(error, 'MIDI input');
      }
    };
    setMidiStatus(`Connected: ${input.name || input.id}`, 'connected');
    return true;
  }

  async function enableMidi() {
    if (typeof navigator.requestMIDIAccess !== 'function') {
      engine.configureMidi({ mode: $('#midiMode').value, status: 'unavailable', deviceId: null });
      setMidiStatus('Web MIDI is unavailable on this system', 'unavailable');
      return false;
    }
    try {
      await ensureMidiAccess();
      renderMidiDevices();
      const first = $('#midiDeviceSelect').value;
      if (first) connectMidiDevice(first);
      else {
        engine.configureMidi({ mode: $('#midiMode').value, status: 'no-device', deviceId: null });
        setMidiStatus('No MIDI input device found', 'no-device');
      }
      return Boolean(first);
    } catch (error) {
      engine.configureMidi({ mode: $('#midiMode').value, status: 'permission-denied', deviceId: null });
      setMidiStatus(`MIDI permission failed: ${error.message || error}`, 'permission-denied');
      showError(error, 'MIDI permission');
      return false;
    }
  }

  function renderLayerMixer(state) {
    const container = $('#layerMixer');
    if (!container) return;
    if (!container.childElementCount) {
      for (let voice = 1; voice <= 4; voice += 1) {
        const row = document.createElement('div');
        row.className = 'layer-mix-row';
        row.dataset.voice = String(voice);
        row.innerHTML = `<strong>V${voice}</strong>
          <label><input type="checkbox" data-layer-control="muted"> Mute</label>
          <label><input type="checkbox" data-layer-control="solo"> Solo</label>
          <label>Level <input type="range" min="0" max="1" step="0.05" data-layer-control="volume" aria-label="Voice ${voice} volume"></label>`;
        container.appendChild(row);
      }
    }
    for (const row of $$('.layer-mix-row')) {
      const voice = Number(row.dataset.voice);
      const layer = state.transport.layerMix[voice] || state.transport.layerMix[String(voice)];
      row.querySelector('[data-layer-control="muted"]').checked = Boolean(layer?.muted);
      row.querySelector('[data-layer-control="solo"]').checked = Boolean(layer?.solo);
      row.querySelector('[data-layer-control="volume"]').value = String(layer?.volume ?? 1);
    }
  }

  const PIANO_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const PIANO_BLACK = new Set([1, 3, 6, 8, 10]);

  function pianoLabel(midi) {
    const value = Math.max(0, Math.min(127, Number(midi) || 60));
    return `${PIANO_NAMES[value % 12]}${Math.floor(value / 12) - 1}`;
  }

  function pianoSettings() {
    const settings = engine.score.settings || {};
    return {
      open: Boolean(settings.pianoPanelOpen),
      octave: Math.max(2, Math.min(6, Number(settings.pianoOctave) || 4)),
      inputMode: settings.pianoInputMode !== false,
      velocity: Math.max(1, Math.min(127, Number(settings.pianoVelocity) || 88))
    };
  }

  function setPianoOpen(open) {
    engine.setSettings({ pianoPanelOpen: Boolean(open) });
    const button = document.querySelector('[data-command="togglePianoPanel"]');
    if (button) {
      button.setAttribute('aria-expanded', String(Boolean(open)));
      button.textContent = open ? 'Hide piano' : 'Show piano';
    }
  }

  function auditionPiano(midi) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      pianoAudioContext = pianoAudioContext || new AudioContextClass();
      const oscillator = pianoAudioContext.createOscillator();
      const gain = pianoAudioContext.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.value = 440 * Math.pow(2, (Number(midi) - 69) / 12);
      gain.gain.setValueAtTime(0.0001, pianoAudioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, pianoAudioContext.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, pianoAudioContext.currentTime + 0.32);
      oscillator.connect(gain).connect(pianoAudioContext.destination);
      oscillator.start();
      oscillator.stop(pianoAudioContext.currentTime + 0.34);
    } catch (error) {
      $('#pianoStatus').textContent = 'Audio preview unavailable';
    }
  }

  function flushPianoChord() {
    if (pianoChordTimer) {
      clearTimeout(pianoChordTimer);
      pianoChordTimer = null;
    }
    const midis = Array.from(pendingPianoMidis);
    pendingPianoMidis.clear();
    if (!midis.length || !$('#pianoInputMode').checked) return [];
    const created = engine.addPianoChord(midis, {
      duration: engine.duration,
      velocity: Number($('#pianoVelocity').value) || 88,
      inputSource: 'piano-panel'
    });
    $('#pianoStatus').textContent = created.length > 1
      ? `${created.length}-note chord entered`
      : `${pianoLabel(created[0].midi)} entered`;
    return created;
  }

  function queuePianoMidi(midi) {
    auditionPiano(midi);
    if (!$('#pianoInputMode').checked) {
      $('#pianoStatus').textContent = `${pianoLabel(midi)} audition`;
      return;
    }
    pendingPianoMidis.add(Number(midi));
    if (pianoChordTimer) clearTimeout(pianoChordTimer);
    pianoChordTimer = setTimeout(flushPianoChord, 65);
  }

  function renderPiano(state) {
    const settings = pianoSettings();
    const panel = $('#pianoPanel');
    panel.hidden = !settings.open;
    const toggle = document.querySelector('[data-command="togglePianoPanel"]');
    if (toggle) {
      toggle.setAttribute('aria-expanded', String(settings.open));
      toggle.textContent = settings.open ? 'Hide piano' : 'Show piano';
    }
    $('#pianoOctave').value = String(settings.octave);
    $('#pianoInputMode').checked = settings.inputMode;
    $('#pianoVelocity').value = String(settings.velocity);

    const keyboard = $('#pianoKeyboard');
    const base = (settings.octave + 1) * 12;
    if (Number(keyboard.dataset.baseMidi) !== base) {
      keyboard.dataset.baseMidi = String(base);
      keyboard.replaceChildren();
      for (let offset = 0; offset <= 24; offset += 1) {
        const midi = base + offset;
        const key = document.createElement('button');
        key.type = 'button';
        key.className = `piano-key ${PIANO_BLACK.has(midi % 12) ? 'black' : 'white'}`;
        key.dataset.midi = String(midi);
        key.setAttribute('aria-label', pianoLabel(midi));
        key.title = pianoLabel(midi);
        if (!PIANO_BLACK.has(midi % 12)) key.textContent = pianoLabel(midi);
        keyboard.appendChild(key);
      }
    }

    const selected = new Set(state.selectedEvents
      .filter(item => item.event.type === 'note')
      .map(item => Number(item.event.midi)));
    $$('#pianoKeyboard .piano-key').forEach(key => {
      key.classList.toggle('selected', selected.has(Number(key.dataset.midi)));
    });
  }

  function publicationOffset(score, field) {
    const key = String(field || '');
    if (key.startsWith('annotation:')) {
      const annotation = (score.annotations || []).find(item => item.id === key.slice('annotation:'.length)) || {};
      return {
        x: Math.max(-300, Math.min(300, Number(annotation.offsetX) || 0)),
        y: Math.max(-300, Math.min(300, Number(annotation.offsetY) || 0))
      };
    }
    const item = score.publicationTextLayout?.[key] || {};
    return {
      x: Math.max(-300, Math.min(300, Number(item.offsetX) || 0)),
      y: Math.max(-300, Math.min(300, Number(item.offsetY) || 0))
    };
  }

  function savePublicationOffset(field, offset) {
    const key = String(field || '');
    if (key.startsWith('annotation:')) {
      return engine.setAnnotationLayout(key.slice('annotation:'.length), {
        offsetX: offset.x,
        offsetY: offset.y
      });
    }
    return engine.setPublicationLayout(key, {
      offsetX: offset.x,
      offsetY: offset.y,
      visible: true
    });
  }


  function applyPublicationTransform(element, score, field) {
    if (!element) return;
    const offset = publicationOffset(score, field);
    element.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
    element.dataset.offsetX = String(offset.x);
    element.dataset.offsetY = String(offset.y);
  }

  function renderPublicationHeader(score) {
    const metadata = score.metadata || {};
    $('#scoreTitleView').textContent = metadata.title || score.title || 'Untitled Score';
    $('#subtitleView').textContent = metadata.subtitle || '';
    $('#dedicationView').textContent = metadata.dedication || '';
    $('#musicalFactsView').textContent = `Key: ${score.settings.key || 'C'} · Time: ${score.settings.timeSignature || '4/4'}`;
    $('#composerView').textContent = metadata.composer || score.composer || '';
    $('#compositionDateView').textContent = metadata.compositionDate || metadata.dateText || '';
    $('#lyricistView').textContent = metadata.lyricist ? `Lyrics: ${metadata.lyricist}` : '';
    $('#arrangerView').textContent = metadata.arranger ? `Arranged by ${metadata.arranger}` : '';
    $('#sourceView').textContent = metadata.source ? `Source: ${metadata.source}` : '';
    $('#copyrightView').textContent = metadata.copyright || '';

    for (const element of $$('.publication-item')) {
      applyPublicationTransform(element, score, element.dataset.publicationField);
      element.hidden = !element.textContent.trim();
    }
    $('#scoreTitleView').hidden = false;

    const pageText = $('#pageTextView');
    pageText.replaceChildren();
    for (const annotation of (score.annotations || []).filter(item => item.type === 'page-text')) {
      const item = document.createElement('p');
      item.className = 'publication-item page-text-item';
      item.dataset.publicationField = `annotation:${annotation.id}`;
      item.dataset.annotationId = annotation.id;
      item.tabIndex = 0;
      item.textContent = annotation.text || '';
      item.setAttribute('aria-label', `Page ${annotation.sourceData?.page || 1} text`);
      applyPublicationTransform(item, score, `annotation:${annotation.id}`);
      pageText.appendChild(item);
    }

    const chosen = $('#publicationField').value || 'staff:title';
    const offset = publicationOffset(score, chosen);
    $('#publicationOffsetX').value = String(offset.x);
    $('#publicationOffsetY').value = String(offset.y);
  }

  function renderControls(state) {
    const score = state.score;
    $('#documentTitle').textContent = score.title || 'Untitled Score';
    $('#scoreTitle').value = score.title || '';
    $('#composerName').value = score.composer || '';
    renderPublicationHeader(score);
    $('#dirtyIndicator').textContent = state.dirty ? 'Unsaved' : 'Saved';
    $('#dirtyIndicator').dataset.dirty = String(state.dirty);
    $('#tempo').value = String(score.settings.tempo || 120);
    $('#metronome').checked = Boolean(state.transport.metronome);
    $('#countInMeasures').value = String(state.transport.countInMeasures || 0);
    $('#loopPlayback').checked = Boolean(state.transport.loop);
    $('#loopStart').value = String(state.transport.loopStart || 0);
    $('#loopEnd').max = String(Math.max(.125, window.AirmonScoreModel.totalBeats(score)));
    $('#loopEnd').value = String(state.transport.loopEnd == null ? window.AirmonScoreModel.totalBeats(score) : state.transport.loopEnd);
    $('#midiMode').value = state.midi.mode || 'step';
    setMidiStatus(
      state.midi.status === 'disabled' ? 'MIDI disabled' :
      state.midi.status === 'no-device' ? 'No MIDI input device found' :
      state.midi.status === 'unavailable' ? 'Web MIDI is unavailable on this system' :
      state.midi.status === 'recording' ? `Recording MIDI · ${state.midi.notesEntered} notes` :
      state.midi.deviceId ? `MIDI ${state.midi.status} · ${state.midi.notesEntered} notes` :
      `MIDI ${state.midi.status}`,
      state.midi.status
    );
    renderLayerMixer(state);
    renderPiano(state);
    $('#keySignature').value = score.settings.key || 'C';
    $('#timeSignature').value = score.settings.timeSignature || '4/4';
    $('#cursorBeat').value = String(Math.round(state.cursor * 1000) / 1000);
    $('#playbackPosition').max = String(Math.max(1, window.AirmonScoreModel.totalBeats(score)));
    $('#playbackPosition').value = String(Math.min(Number($('#playbackPosition').max), state.playbackBeat || state.cursor || 0));
    $('#beatDisplay').textContent = `${state.transport.paused ? 'Paused · ' : ''}Beat ${Math.round((state.playbackBeat || state.cursor || 0) * 100) / 100 + 1}`;
    $('#jumpMeasureNumber').max = String(score.measures.length);
    $('#jumpMeasureNumber').value = String(window.AirmonScoreModel.measureIndexAt(score, state.playbackBeat || state.cursor || 0) + 1);
    $('#selectionSummary').textContent = state.selectedEvents.length
      ? `${state.selectedEvents.length} event${state.selectedEvents.length === 1 ? '' : 's'} selected`
      : 'Nothing selected';
    const eventCount = score.parts.reduce((sum, part) => sum + part.events.filter(event => event.generatedBy !== 'gap-fill').length, 0);
    $('#scoreSummary').textContent = `${eventCount} event${eventCount === 1 ? '' : 's'} · ${score.measures.length} measure${score.measures.length === 1 ? '' : 's'}`;
    $('#layerSummary').textContent = `Voice ${state.activeVoice} active · four layers available`;
    $('#showSolfaOverlay').checked = Boolean(score.settings.showSolfa);
    $('#solfaConvention').value = score.settings.solfaConvention || 'airmonlink-traditional-v1';
    $('#minorSolfaSystem').value = score.settings.minorSolfaSystem || 'do-based';
    $('#pickupBeats').value = String(Number(score.settings.pickupBeats) || 0);
    $('#initialMeasures').value = String(score.measures.length);
    const measureIndex = window.AirmonScoreModel.measureIndexAt(score, state.cursor);
    $('#currentMeasure').value = String(measureIndex + 1);
    $('#rehearsalMark').value = score.measures[measureIndex]?.rehearsalMark || '';
    renderParts(state);
    const activePart = score.parts.find(part => part.id === state.activePartId) || score.parts[0];
    if (activePart) {
      if ([...$('#instrumentSelect').options].some(option => option.value === activePart.instrumentKey)) {
        $('#instrumentSelect').value = activePart.instrumentKey;
      }
      if ([...$('#clefSelect').options].some(option => option.value === activePart.clef)) {
        $('#clefSelect').value = activePart.clef;
      }
    }
    const metadata = score.metadata || {};
    $('#publicationSubtitle').value = metadata.subtitle || '';
    $('#publicationDedication').value = metadata.dedication || '';
    $('#publicationArranger').value = metadata.arranger || '';
    $('#publicationLyricist').value = metadata.lyricist || '';
    $('#publicationDate').value = metadata.compositionDate || metadata.dateText || '';
    $('#publicationSource').value = metadata.source || '';
    $('#publicationCopyright').value = metadata.copyright || '';
    $('#publicationSupportingText').value = metadata.supportingText || '';
    $('#pageSize').value = score.settings.pageSize || 'A4';
    $('#pageOrientation').value = score.settings.pageOrientation || score.settings.orientation || 'portrait';
    $('#pageMargins').value = String(score.settings.margins || 15);
    $('#pageStaffSize').value = String(score.settings.staffSize || 100);
    $('#pageSystemGap').value = String(score.settings.systemGap || 50);
    const verses = engine.lyricVerseSummary();
    const verseEntries = Object.entries(verses).sort((a, b) => Number(a[0]) - Number(b[0]));
    $('#lyricVerseSummary').textContent = verseEntries.length
      ? verseEntries.map(([verse, count]) => `V${verse}: ${count}`).join(' · ')
      : 'No lyrics';
    document.title = `${state.dirty ? '• ' : ''}${score.title || 'Untitled Score'} — Airmonlink Composer 3`;
  }

  function render() {
    const state = engine.state();
    renderControls(state);
    if (activeView === 'staff') renderStaff(state);
    else renderSolfa(state);
  }

  function showProjectDialog(title, status = 'Ready') {
    const dialog = $('#projectDialog');
    $('#projectDialogTitle').textContent = title;
    $('#projectDialogStatus').textContent = status;
    $('#projectDialogBody').replaceChildren();
    if (!dialog.open) dialog.showModal();
    return $('#projectDialogBody');
  }

  function dialogMessage(message, kind = 'info') {
    const body = $('#projectDialogBody');
    body.replaceChildren();
    const paragraph = document.createElement('p');
    paragraph.className = `dialog-message ${kind}`;
    paragraph.textContent = String(message);
    body.appendChild(paragraph);
  }

  async function loadDocumentResult(result, sourceLabel = 'Document') {
    if (!result || result.canceled) return false;
    const filePath = String(result.filePath || '');
    const lower = filePath.toLowerCase();
    const bytes = base64ToBytes(result.content);
    setStatus(`Loading ${filePath || sourceLabel}…`);
    if (result.recovery || !filePath) {
      engine.openAirscore(textDecoder.decode(bytes), {
        filePath: result.originalPath || null,
        documentId: result.documentId || engine.documentId
      });
      engine.filePath = result.originalPath || null;
      engine.dirty = true;
      engine.emit('Recovered document');
      currentOpenReadOnly = false;
      return true;
    }
    if (lower.endsWith('.airscore')) engine.openAirscore(textDecoder.decode(bytes), { filePath });
    else if (lower.endsWith('.mxl')) await engine.importMxl(bytes, { filePath });
    else if (lower.endsWith('.mid') || lower.endsWith('.midi')) engine.importMidi(bytes, { filePath });
    else if (lower.endsWith('.musicxml') || lower.endsWith('.xml')) engine.importMusicXml(textDecoder.decode(bytes), { filePath });
    else throw new Error(`Unsupported file type: ${filePath || 'unknown file'}`);
    engine.filePath = filePath;
    currentOpenReadOnly = Boolean(result.readOnly);
    engine.dirty = !lower.endsWith('.airscore');
    engine.emit('Document opened');
    setStatus(`${result.readOnly ? 'Opened read-only' : 'Opened'} ${filePath}`);
    return true;
  }

  async function showRecentFiles() {
    const body = showProjectDialog('Recent files', 'Loading recent files…');
    try {
      const recent = await window.airmonDesktop.listRecent();
      $('#projectDialogStatus').textContent = recent.length ? `${recent.length} recent file${recent.length === 1 ? '' : 's'}` : 'No recent files';
      if (!recent.length) {
        dialogMessage('No recent scores are available yet.', 'empty');
        return;
      }
      const list = document.createElement('div');
      list.className = 'project-list';
      for (const item of recent) {
        const row = document.createElement('article');
        row.className = 'project-list-row';
        const description = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = item.name || String(item.filePath || '').split(/[\\/]/).pop() || 'Score';
        const path = document.createElement('small');
        path.textContent = item.filePath || '';
        description.append(name, path);
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.recentPath = item.filePath || '';
        button.disabled = item.exists === false;
        button.textContent = item.exists === false ? 'Missing' : 'Open';
        row.append(description, button);
        list.appendChild(row);
      }
      body.appendChild(list);
    } catch (error) {
      $('#projectDialogStatus').textContent = 'Recent files failed';
      dialogMessage(error.message || String(error), 'error');
    }
  }

  async function showRecoveries() {
    const body = showProjectDialog('Recover work', 'Scanning local recovery checkpoints…');
    try {
      const records = await window.airmonDesktop.listRecoveries();
      $('#projectDialogStatus').textContent = records.length ? `${records.length} recovery checkpoint${records.length === 1 ? '' : 's'}` : 'No recovery checkpoints';
      if (!records.length) {
        dialogMessage('No unsaved recovery checkpoints were found.', 'empty');
        return;
      }
      const list = document.createElement('div');
      list.className = 'project-list';
      for (const record of records) {
        const row = document.createElement('article');
        row.className = 'project-list-row';
        const description = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = record.title || 'Untitled recovery';
        const detail = document.createElement('small');
        detail.textContent = `${record.savedAt || 'Unknown time'}${record.originalPath ? ` · ${record.originalPath}` : ''}`;
        description.append(name, detail);
        const actions = document.createElement('span');
        const restore = document.createElement('button');
        restore.type = 'button';
        restore.dataset.recoveryRestore = record.documentId;
        restore.textContent = 'Restore';
        const discard = document.createElement('button');
        discard.type = 'button';
        discard.dataset.recoveryDiscard = record.documentId;
        discard.textContent = 'Discard';
        actions.append(restore, discard);
        row.append(description, actions);
        list.appendChild(row);
      }
      body.appendChild(list);
    } catch (error) {
      $('#projectDialogStatus').textContent = 'Recovery scan failed';
      dialogMessage(error.message || String(error), 'error');
    }
  }

  function applyApplicationSettings(settings = {}) {
    appSettings = { ...appSettings, ...settings };
    document.body.classList.toggle('high-contrast', Boolean(appSettings.highContrast));
    document.body.classList.toggle('large-controls', Boolean(appSettings.largeControls));
    $('#highContrast').checked = Boolean(appSettings.highContrast);
    $('#largeControls').checked = Boolean(appSettings.largeControls);
    if (appSettings.defaultTemplate && [...$('#scoreTemplate').options].some(option => option.value === appSettings.defaultTemplate)) {
      $('#scoreTemplate').value = appSettings.defaultTemplate;
    }
    if (appSettings.defaultZoom === 'fit-width') fitZoom('width');
    else if (appSettings.defaultZoom === 'fit-page') fitZoom('page');
    else if (appSettings.defaultZoom === 'actual') {
      zoomMode = 'actual';
      zoom = 1;
      applyZoom();
    }
    if (autosaveTimer) window.clearInterval(autosaveTimer);
    const seconds = Math.max(15, Math.min(600, Number(appSettings.autosaveSeconds) || 45));
    autosaveTimer = window.setInterval(() => void autosave(), seconds * 1000);
    return appSettings;
  }

  async function showSettings() {
    const body = showProjectDialog('Application settings', 'Loading local settings…');
    try {
      const stored = await window.airmonDesktop.getSettings();
      appSettings = { ...appSettings, ...stored };
      $('#projectDialogStatus').textContent = 'Settings are stored locally';
      const form = document.createElement('div');
      form.className = 'settings-grid';
      form.innerHTML = `
        <label>Autosave seconds <input id="settingAutosave" type="number" min="15" max="600" value="${Math.max(15, Number(appSettings.autosaveSeconds) || 45)}"></label>
        <label>Default zoom <select id="settingZoom">
          <option value="actual">100%</option><option value="fit-width">Fit width</option><option value="fit-page">Fit page</option>
        </select></label>
        <label>Default template <select id="settingTemplate">
          <option value="lead">Lead sheet</option><option value="satb">SATB choir</option><option value="piano">Piano</option><option value="hymn">Hymn</option><option value="orchestra">Orchestra</option>
        </select></label>
        <label><input id="settingContrast" type="checkbox"> High contrast</label>
        <label><input id="settingLarge" type="checkbox"> Large controls</label>
        <button id="saveApplicationSettings" type="button">Save settings</button>`;
      body.appendChild(form);
      $('#settingZoom').value = appSettings.defaultZoom || 'actual';
      $('#settingTemplate').value = appSettings.defaultTemplate || 'lead';
      $('#settingContrast').checked = Boolean(appSettings.highContrast);
      $('#settingLarge').checked = Boolean(appSettings.largeControls);
    } catch (error) {
      $('#projectDialogStatus').textContent = 'Settings failed';
      dialogMessage(error.message || String(error), 'error');
    }
  }

  async function saveDocument(saveAs = false) {
    if (currentOpenReadOnly && !saveAs) saveAs = true;
    const state = engine.state();
    const result = await window.airmonDesktop.saveDocument({
      currentPath: state.filePath,
      defaultName: `${(state.score.title || 'Untitled Score').replace(/[<>:"/\\|?*]+/g, '-')}.airscore`,
      filters: [{ name: 'Airmonlink Score', extensions: ['airscore'] }],
      saveAs,
      content: textToBase64(engine.serializeAirscore()),
      documentId: state.documentId
    });
    if (result.canceled) return false;
    engine.markSaved(result.filePath);
    currentOpenReadOnly = false;
    await window.airmonDesktop.discardRecovery(state.documentId).catch(() => {});
    setStatus(`Saved ${result.filePath}`);
    return true;
  }

  async function openDocument() {
    const result = await window.airmonDesktop.openDocument({
      filters: [
        { name: 'Supported scores', extensions: ['airscore', 'musicxml', 'xml', 'mxl', 'mid', 'midi'] },
        { name: 'Airmonlink Score', extensions: ['airscore'] },
        { name: 'MusicXML', extensions: ['musicxml', 'xml', 'mxl'] },
        { name: 'MIDI', extensions: ['mid', 'midi'] }
      ]
    });
    return loadDocumentResult(result, 'Open document');
  }

  async function exportBinary(bytes, defaultName, extensions, name) {
    const result = await window.airmonDesktop.saveFile({
      content: bytesToBase64(bytes),
      defaultName,
      filters: [{ name, extensions }]
    });
    if (!result.canceled) setStatus(`Exported ${result.filePath}`);
  }

  async function exportText(text, defaultName, extensions, name) {
    return exportBinary(textEncoder.encode(text), defaultName, extensions, name);
  }

  async function exportPng() {
    if (activeView !== 'staff') throw new Error('Switch to the staff page before exporting PNG in this version.');
    const slots = activePageSlots();
    const slot = slots[Math.max(0, Math.min(slots.length - 1, currentPageIndex))] || slots[0];
    const svg = slot?.querySelector('.staff-svg');
    if (!svg) throw new Error('The current staff page is unavailable.');
    const serialized = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('The score image could not be rendered.'));
        image.src = url;
      });
      const viewBox = svg.viewBox.baseVal;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1200, Math.ceil(viewBox.width * 1.8));
      canvas.height = Math.max(900, Math.ceil(viewBox.height * 1.8));
      const context = canvas.getContext('2d');
      context.fillStyle = '#fffefa';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      const bytes = base64ToBytes(dataUrl.split(',')[1]);
      const pageNumber = Math.max(1, currentPageIndex + 1);
      await exportBinary(bytes, `${engine.score.title || 'score'}-page-${pageNumber}.png`, ['png'], 'PNG image');
    } finally {
      URL.revokeObjectURL(url);
    }
  }


  async function execute(name) {
    try {
      switch (name) {
        case 'newScore':
          if (engine.dirty && !window.confirm('Create a new score and discard unsaved changes?')) return;
          engine.newScore({ template: 'lead', measures: 8 });
          currentOpenReadOnly = false;
          setStatus('New score created');
          break;
        case 'open': await openDocument(); break;
        case 'save': await saveDocument(false); break;
        case 'saveAs': await saveDocument(true); break;
        case 'showRecent': await showRecentFiles(); break;
        case 'showRecovery': await showRecoveries(); break;
        case 'showSettings': await showSettings(); break;
        case 'exit':
          await window.airmonDesktop.requestQuit();
          break;
        case 'applyScoreSetup':
          if (engine.dirty && !window.confirm('Create a new score from this setup and discard unsaved changes?')) return;
          engine.newScore({
            template: $('#scoreTemplate').value,
            measures: Number($('#initialMeasures').value) || 8,
            key: $('#keySignature').value,
            timeSignature: $('#timeSignature').value,
            pickupBeats: Number($('#pickupBeats').value) || 0
          });
          if (Number($('#pickupBeats').value) > 0) engine.configurePickup($('#pickupBeats').value);
          currentOpenReadOnly = false;
          break;
        case 'addPart':
          engine.addPart($('#instrumentSelect').value, { clef: $('#clefSelect').value });
          break;
        case 'removePart':
          engine.removeActivePart();
          break;
        case 'applyPart':
          engine.updateActivePart({ instrumentKey: $('#instrumentSelect').value, clef: $('#clefSelect').value });
          break;
        case 'setActiveVoice': engine.setActiveVoice($('#voiceSelect').value); break;
        case 'applyMeasureAttributes': {
          const selected = engine.state().selectedEvents[0]?.event;
          const beat = selected ? Number(selected.start) || 0 : Number(engine.cursor) || 0;
          const measureIndex = window.AirmonScoreModel.measureIndexAt(engine.score, beat);
          engine.setMeasureAttributes(measureIndex, {
            keySignature: $('#keySignature').value,
            timeSignature: $('#timeSignature').value
          });
          break;
        }
        case 'undo': engine.undo(); break;
        case 'redo': engine.redo(); break;
        case 'copy': engine.copySelection(); setStatus('Selection copied'); break;
        case 'paste': engine.pasteSelection(); break;
        case 'addNote': engine.addNote({ pitch: 'C4' }); break;
        case 'pianoChord': flushPianoChord(); break;
        case 'addRest': engine.addRest(); break;
        case 'addChordTone': engine.addChordTone({ midi: 64 }); break;
        case 'addThird': engine.addIntervalToChord(4); break;
        case 'addFifth': engine.addIntervalToChord(7); break;
        case 'dotSelected': engine.toggleDot(); break;
        case 'tripletSelected': engine.setTuplet(3, 2); break;
        case 'deleteSelection': engine.deleteSelection(); break;
        case 'pitchDown': engine.transposeSelection(-1); break;
        case 'pitchUp': engine.transposeSelection(1); break;
        case 'octaveDown': engine.transposeSelection(-12); break;
        case 'octaveUp': engine.transposeSelection(12); break;
        case 'appendMeasure': engine.appendMeasures(1); break;
        case 'insertMeasure': engine.insertMeasures(currentMeasureIndex(), 1); break;
        case 'removeMeasure': engine.removeMeasure(currentMeasureIndex()); break;
        case 'repeatStart': engine.setMeasureAttributes(currentMeasureIndex(), { repeatStart: !currentMeasure().repeatStart }); break;
        case 'repeatEnd': engine.setMeasureAttributes(currentMeasureIndex(), { repeatEnd: !currentMeasure().repeatEnd, repeatTimes: 2 }); break;
        case 'systemBreak': engine.setMeasureAttributes(currentMeasureIndex(), { newSystem: !currentMeasure().newSystem, newPage: false }); break;
        case 'pageBreak': engine.setMeasureAttributes(currentMeasureIndex(), { newPage: !currentMeasure().newPage, newSystem: false }); break;
        case 'tie': engine.addTie(); break;
        case 'slur': engine.addSlur(); break;
        case 'staccato': engine.setArticulation('staccato', true); break;
        case 'accent': engine.setArticulation('accent', true); break;
        case 'tenuto': engine.setArticulation('tenuto', true); break;
        case 'marcato': engine.setArticulation('strong-accent', true); break;
        case 'trill': engine.setOrnament('trill-mark', true); break;
        case 'turn': engine.setOrnament('turn', true); break;
        case 'fermata': engine.setFermata(true); break;
        case 'applyTechnique': engine.setTechnique($('#techniqueType').value, $('#techniqueValue').value, true); break;
        case 'beamBegin': engine.setBeam('begin'); break;
        case 'beamContinue': engine.setBeam('continue'); break;
        case 'beamEnd': engine.setBeam('end'); break;
        case 'beamAuto': engine.setBeam('auto'); break;
        case 'removeSpanners': engine.removeSelectedSpanners(); break;
        case 'applyDynamic': engine.addDynamic($('#dynamicSelect').value); break;
        case 'copyToLayer':
          engine.copySelectionToLayer(Number($('#targetVoiceSelect').value), { conflictMode: 'replace-conflicts' });
          break;
        case 'replaceSelection':
          engine.replaceSelectionFromClipboard($('#replaceMode').value);
          break;
        case 'addChordSymbol':
          engine.addChordSymbol($('#chordSymbolInput').value);
          break;
        case 'addTextAnnotation':
          engine.addAnnotation($('#annotationType').value, $('#annotationText').value, {
            placement: $('#annotationType').value === 'expression' ? 'below' : 'above',
            sourceData: $('#annotationType').value === 'tempo' ? { tempo: Number($('#tempo').value) || engine.score.settings.tempo } : null
          });
          break;
        case 'applyLyric':
          engine.setLyric($('#lyricsInput').value, { verse: Number($('#lyricVerse').value) || 1 });
          break;
        case 'applyLyricsParagraph':
          engine.applyLyricsParagraph($('#lyricsParagraph').value, {
            verse: Number($('#lyricVerse').value) || 1,
            startBeat: engine.cursor
          });
          break;
        case 'copyLyricVerse': {
          const copied = engine.copyLyricVerse(
            Number($('#lyricSourceVerse').value) || 1,
            Number($('#lyricTargetVerse').value) || 2
          );
          setStatus(`Copied ${copied} lyric entr${copied === 1 ? 'y' : 'ies'}`);
          break;
        }
        case 'deleteLyricVerse': {
          const verse = Number($('#lyricTargetVerse').value) || 2;
          if (!window.confirm(`Delete every lyric in verse ${verse}?`)) break;
          const removed = engine.deleteLyricVerse(verse);
          setStatus(`Deleted ${removed} lyric entr${removed === 1 ? 'y' : 'ies'} from verse ${verse}`);
          break;
        }
        case 'replaceLyrics': {
          const search = $('#lyricSearch').value;
          if (!search) throw new Error('Enter lyric text to find first.');
          const verse = Number($('#lyricTargetVerse').value) || Number($('#lyricVerse').value) || 1;
          const replaced = engine.searchReplaceLyrics(search, $('#lyricReplacement').value, { verse });
          setStatus(`Replaced ${replaced} lyric entr${replaced === 1 ? 'y' : 'ies'} in verse ${verse}`);
          break;
        }
        case 'applyLyricOffset': {
          const updated = engine.setLyricOffset(
            Number($('#lyricOffsetX').value) || 0,
            Number($('#lyricOffsetY').value) || 0,
            { verse: Number($('#lyricVerse').value) || 1 }
          );
          setStatus(`Positioned ${updated} lyric entr${updated === 1 ? 'y' : 'ies'}`);
          break;
        }
        case 'resetLyricOffset': {
          const updated = engine.resetLyricOffset({ verse: Number($('#lyricVerse').value) || 1 });
          $('#lyricOffsetX').value = '0';
          $('#lyricOffsetY').value = '0';
          setStatus(`Reset ${updated} lyric position${updated === 1 ? '' : 's'}`);
          break;
        }
        case 'rewind': engine.seek(0); break;
        case 'pause': engine.pausePlayback(); break;
        case 'resume': engine.resumePlayback({
          countInMeasures: 0,
          loop: $('#loopPlayback').checked,
          metronome: $('#metronome').checked
        }); break;
        case 'jumpMeasure': engine.jumpToMeasure($('#jumpMeasureNumber').value); break;
        case 'applyLoop':
          engine.setPlaybackOptions({
            loop: $('#loopPlayback').checked,
            metronome: $('#metronome').checked,
            countInMeasures: Number($('#countInMeasures').value) || 0,
            loopStart: Number($('#loopStart').value) || 0,
            loopEnd: Number($('#loopEnd').value)
          });
          break;
        case 'resetLayerMix': engine.resetLayerPlayback(); break;
        case 'play':
          engine.startPlayback({
            startBeat: engine.cursor,
            loop: $('#loopPlayback').checked,
            metronome: $('#metronome').checked,
            countInMeasures: Number($('#countInMeasures').value) || 0,
            loopRange: {
              start: Number($('#loopStart').value) || 0,
              end: Number($('#loopEnd').value) || window.AirmonScoreModel.totalBeats(engine.score)
            }
          });
          break;
        case 'stop': engine.stopPlayback(); break;
        case 'enableMidi': await enableMidi(); break;
        case 'enableMidiOutput': await enableMidiOutput(); break;
        case 'playMidiOutput': playScoreToMidiOutput(); break;
        case 'stopMidiOutput': stopMidiOutput(); break;
        case 'startMidiRecord':
          if (!midiInputPort) throw new Error('Enable and choose a MIDI input device before recording.');
          engine.configureMidi({ mode: 'realtime', deviceId: midiInputPort.id, status: 'connected' });
          $('#midiMode').value = 'realtime';
          engine.startMidiRecording(performance.now());
          break;
        case 'stopMidiRecord': engine.stopMidiRecording(performance.now()); break;
        case 'disconnectMidi':
          detachMidiPort();
          if (midiAccess) midiAccess.onstatechange = null;
          midiAccess = null;
          engine.disconnectMidi();
          renderMidiDevices();
          setMidiStatus('MIDI disabled', 'disabled');
          break;
        case 'printPreview': {
          const result = await window.airmonDesktop.printPreview({
            title: engine.score.title || 'Untitled Score',
            pageSize: engine.score.settings.pageSize || 'A4'
          });
          if (result?.ok) setStatus(`Print preview opened · ${result.bytes || 0} bytes`);
          break;
        }
        case 'exportPdf': {
          const result = await window.airmonDesktop.exportPdf({ defaultName: `${engine.score.title || 'score'}.pdf`, pageSize: engine.score.settings.pageSize || 'A4' });
          if (!result.canceled) setStatus(`PDF exported to ${result.filePath}`);
          break;
        }
        case 'exportPng': await exportPng(); break;
        case 'print': await window.airmonDesktop.print(); break;
        case 'exportMusicXml':
          await exportText(engine.exportMusicXml(), `${engine.score.title || 'score'}.musicxml`, ['musicxml'], 'MusicXML');
          break;
        case 'exportMxl':
          await exportBinary(await engine.exportMxl(), `${engine.score.title || 'score'}.mxl`, ['mxl'], 'Compressed MusicXML');
          break;
        case 'exportMidi':
          await exportBinary(engine.exportMidi(), `${engine.score.title || 'score'}.mid`, ['mid'], 'Standard MIDI');
          break;
        case 'applyPublication':
          engine.setMetadata({
            subtitle: $('#publicationSubtitle').value,
            dedication: $('#publicationDedication').value,
            arranger: $('#publicationArranger').value,
            lyricist: $('#publicationLyricist').value,
            compositionDate: $('#publicationDate').value,
            dateText: $('#publicationDate').value,
            source: $('#publicationSource').value,
            copyright: $('#publicationCopyright').value,
            supportingText: $('#publicationSupportingText').value
          });
          setStatus('Publication metadata updated');
          break;
        case 'applyPublicationLayout': {
          const field = $('#publicationField').value;
          const offset = savePublicationOffset(field, {
            x: Number($('#publicationOffsetX').value) || 0,
            y: Number($('#publicationOffsetY').value) || 0
          });
          $('#publicationLayoutStatus').textContent = `${field}: ${Number(offset.offsetX) || 0}, ${Number(offset.offsetY) || 0}`;
          break;
        }
        case 'resetPublicationLayout': {
          const field = $('#publicationField').value;
          savePublicationOffset(field, { x: 0, y: 0 });
          $('#publicationOffsetX').value = '0';
          $('#publicationOffsetY').value = '0';
          $('#publicationLayoutStatus').textContent = `${field} reset`;
          break;
        }
        case 'applyPageSettings':
          engine.setSettings({
            pageSize: $('#pageSize').value,
            pageOrientation: $('#pageOrientation').value,
            margins: Number($('#pageMargins').value),
            staffSize: Number($('#pageStaffSize').value),
            systemGap: Number($('#pageSystemGap').value)
          });
          setStatus('Printed-page settings updated');
          break;
        case 'addPageText': {
          const text = $('#pageTextValue').value.trim();
          if (!text) throw new Error('Enter page text first.');
          const annotation = engine.addAnnotation('page-text', text, {
            scope: 'page',
            partId: null,
            start: 0,
            placement: 'above',
            sourceData: { page: Math.max(1, Number($('#pageTextPage').value) || 1) }
          });
          engine.setAnnotationLayout(annotation.id, { offsetX: 0, offsetY: 0 });
          $('#pageTextValue').value = '';
          setStatus(`Page text added to page ${Math.max(1, Number($('#pageTextPage').value) || 1)}`);
          break;
        }
        case 'selectPrevious': engine.selectAdjacent(-1); break;
        case 'selectNext': engine.selectAdjacent(1); break;
        case 'showStaff': setView('staff'); break;
        case 'showSolfa': setView('solfa'); break;
        case 'showSolfaOverlay': {
          const control = $('#showSolfaOverlay');
          control.checked = !control.checked;
          engine.setSettings({ showSolfa: control.checked });
          break;
        }
        case 'applySolfaSyllable': {
          const syllable = $('#solfaSyllableInput').value.trim();
          engine.updateSelectedFromSolfa(syllable, {
            convention: $('#solfaConvention').value,
            minorSystem: $('#minorSolfaSystem').value
          });
          $('#solfaStatus').textContent = `Applied ${syllable}`;
          break;
        }
        case 'applySolfaPassage': {
          const text = $('#solfaPassageInput').value.trim();
          const options = {
            convention: $('#solfaConvention').value,
            minorSystem: $('#minorSolfaSystem').value,
            voice: engine.activeVoice,
            replace: true,
            allowIncompleteMeasures: true
          };
          const preview = engine.previewSolfaPassage(text, options);
          if (!preview.valid) {
            const message = preview.diagnostics.map(item => item.message).join(' ');
            throw new Error(message || 'Correct the tonic sol-fa passage before applying it.');
          }
          const result = engine.applySolfaPassage(text, options);
          $('#solfaStatus').textContent = `${result.created.length} event${result.created.length === 1 ? '' : 's'} applied`;
          break;
        }
        case 'verifySolfa': {
          const issues = engine.verifySolfa();
          $('#solfaStatus').textContent = issues.length ? `${issues.length} synchronization issue${issues.length === 1 ? '' : 's'}` : 'Staff, playback and Tonic Sol-fa are synchronized';
          if (issues.length) throw new Error(issues.map(item => item.message).join(' '));
          break;
        }
        case 'togglePianoPanel': setPianoOpen(!pianoSettings().open); break;
        case 'collapsePianoPanel': setPianoOpen(false); break;
        case 'zoomOut': zoomMode = 'manual'; zoom = Math.max(.2, zoom - .1); applyZoom(); break;
        case 'zoomReset': zoomMode = 'actual'; zoom = 1; applyZoom(); break;
        case 'zoomIn': zoomMode = 'manual'; zoom = Math.min(3, zoom + .1); applyZoom(); break;
        case 'fitWidth': fitZoom('width'); break;
        case 'fitPage': fitZoom('page'); break;
        case 'previousPage': goToPage(currentPageIndex - 1); break;
        case 'nextPage': goToPage(currentPageIndex + 1); break;
        case 'focusScore': {
          const target = activeView === 'staff'
            ? activePageSlots()[currentPageIndex]?.querySelector('.staff-svg')
            : $('#solfaPages');
          target?.focus();
          break;
        }
        default: throw new Error(`Unknown interface command: ${name}`);
      }
    } catch (error) {
      showError(error, name);
    }
  }

  function installViewportObservers() {
    const targets = [
      $('#scoreArea'),
      document.querySelector('.workspace'),
      document.querySelector('.command-deck'),
      document.querySelector('.inspector'),
      $('#pianoPanel')
    ].filter(Boolean);

    if (typeof ResizeObserver === 'function') {
      viewportObserver = new ResizeObserver(() => scheduleViewportReflow());
      targets.forEach(target => viewportObserver.observe(target));
    }
    window.visualViewport?.addEventListener('resize', () => scheduleViewportReflow());
    document.fonts?.ready?.then(() => scheduleViewportReflow({ preservePosition: false })).catch(() => {});
  }

  function bindInterface() {
    $$('.tab').forEach(tab => {
      tab.addEventListener('click', () => activateTab(tab.dataset.tab));
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        const tabs = $$('.tab');
        const index = tabs.indexOf(tab);
        const target = tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
        target.focus();
        activateTab(target.dataset.tab);
      });
    });

    $$('[data-command]').forEach(button => button.addEventListener('click', () => void execute(button.dataset.command)));

    $('#scoreTitle').addEventListener('change', event => engine.setMetadata({ title: event.target.value }));
    $('#composerName').addEventListener('change', event => engine.setMetadata({ composer: event.target.value }));
    $('#duration').addEventListener('change', event => engine.setDuration(event.target.value));
    $('#voiceSelect').addEventListener('change', event => engine.setActiveVoice(event.target.value));
    $('#partSelect').addEventListener('change', event => {
      const part = engine.setActivePart(event.target.value);
      if ([...$('#instrumentSelect').options].some(option => option.value === part.instrumentKey)) $('#instrumentSelect').value = part.instrumentKey;
      if ([...$('#clefSelect').options].some(option => option.value === part.clef)) $('#clefSelect').value = part.clef;
    });
    $('#tempo').addEventListener('change', event => {
      engine.setSettings({ tempo: event.target.value });
      if (engine.state().playing) engine.startPlayback({ startBeat: engine.cursor });
    });
    $('#metronome').addEventListener('change', event => engine.setPlaybackOptions({ metronome: event.target.checked }));
    $('#loopPlayback').addEventListener('change', event => engine.setPlaybackOptions({ loop: event.target.checked }));
    $('#loopStart').addEventListener('change', () => void execute('applyLoop'));
    $('#loopEnd').addEventListener('change', () => void execute('applyLoop'));
    $('#midiDeviceSelect').addEventListener('change', event => connectMidiDevice(event.target.value));
    $('#midiOutputSelect').addEventListener('change', event => connectMidiOutput(event.target.value));
    $('#midiMode').addEventListener('change', event => {
      const deviceId = midiInputPort?.id || null;
      engine.configureMidi({ mode: event.target.value, deviceId, status: deviceId ? 'connected' : 'ready' });
    });
    $('#layerMixer').addEventListener('change', event => {
      const control = event.target.closest('[data-layer-control]');
      if (!control) return;
      const voice = Number(control.closest('.layer-mix-row').dataset.voice);
      const key = control.dataset.layerControl;
      engine.setLayerPlayback(voice, { [key]: key === 'volume' ? Number(control.value) : control.checked });
    });
    $('#layerMixer').addEventListener('input', event => {
      const control = event.target.closest('[data-layer-control="volume"]');
      if (!control) return;
      const voice = Number(control.closest('.layer-mix-row').dataset.voice);
      engine.setLayerPlayback(voice, { volume: Number(control.value) });
    });
    $('#keySignature').addEventListener('change', event => engine.setMeasureAttributes(0, { key: event.target.value }));
    $('#timeSignature').addEventListener('change', event => engine.setMeasureAttributes(0, { timeSignature: event.target.value }));
    $('#cursorBeat').addEventListener('change', event => engine.seek(event.target.value));
    $('#playbackPosition').addEventListener('input', event => engine.seek(event.target.value));
    $('#showSolfaOverlay').addEventListener('change', event => engine.setSettings({ showSolfa: event.target.checked }));
    $('#solfaConvention').addEventListener('change', event => engine.setSettings({ solfaConvention: event.target.value }));
    $('#minorSolfaSystem').addEventListener('change', event => engine.setSettings({ minorSolfaSystem: event.target.value }));
    $('#currentMeasure').addEventListener('change', event => {
      const index = Math.max(0, Math.min(engine.score.measures.length - 1, Number(event.target.value) - 1));
      engine.seek(window.AirmonScoreModel.measureStartBeat(engine.score, index));
    });
    $('#rehearsalMark').addEventListener('change', event => {
      engine.setMeasureAttributes(currentMeasureIndex(), { rehearsalMark: event.target.value });
    });
    $('#highContrast').addEventListener('change', event => document.body.classList.toggle('high-contrast', event.target.checked));
    $('#largeControls').addEventListener('change', event => document.body.classList.toggle('large-controls', event.target.checked));
    $('#dismissError').addEventListener('click', () => { $('#errorBanner').hidden = true; });

    $('#projectDialog').addEventListener('click', async event => {
      const recent = event.target.closest('[data-recent-path]');
      const restore = event.target.closest('[data-recovery-restore]');
      const discard = event.target.closest('[data-recovery-discard]');
      try {
        if (recent) {
          $('#projectDialogStatus').textContent = 'Opening recent score…';
          const result = await window.airmonDesktop.openRecent(recent.dataset.recentPath);
          if (await loadDocumentResult(result, 'Recent score')) $('#projectDialog').close();
          return;
        }
        if (restore) {
          $('#projectDialogStatus').textContent = 'Restoring recovery checkpoint…';
          const record = await window.airmonDesktop.readRecovery(restore.dataset.recoveryRestore);
          if (!record) throw new Error('The selected recovery checkpoint no longer exists.');
          const result = {
            canceled: false,
            filePath: record.originalPath || '',
            content: record.content,
            readOnly: false,
            recovery: true
          };
          if (await loadDocumentResult(result, 'Recovery checkpoint')) {
            engine.markDirty('Recovered unsaved work');
            $('#projectDialog').close();
          }
          return;
        }
        if (discard) {
          const id = discard.dataset.recoveryDiscard;
          if (!window.confirm('Permanently discard this recovery checkpoint?')) return;
          await window.airmonDesktop.discardRecovery(id);
          await showRecoveries();
          return;
        }
        if (event.target.id === 'saveApplicationSettings') {
          const settings = {
            autosaveSeconds: Math.max(15, Math.min(600, Number($('#settingAutosave').value) || 45)),
            defaultZoom: $('#settingZoom').value,
            defaultTemplate: $('#settingTemplate').value,
            highContrast: $('#settingContrast').checked,
            largeControls: $('#settingLarge').checked
          };
          const stored = await window.airmonDesktop.setSettings(settings);
          applyApplicationSettings(stored || settings);
          $('#projectDialogStatus').textContent = 'Settings saved locally';
          dialogMessage('Application settings were saved and applied.', 'success');
        }
      } catch (error) {
        $('#projectDialogStatus').textContent = 'Project service failed';
        dialogMessage(error.message || String(error), 'error');
      }
    });

    $('#pianoOctave').addEventListener('change', event => {
      engine.setSettings({ pianoOctave: Math.max(2, Math.min(6, Number(event.target.value) || 4)) });
    });
    $('#pianoInputMode').addEventListener('change', event => {
      engine.setSettings({ pianoInputMode: event.target.checked });
      $('#pianoStatus').textContent = event.target.checked ? 'Note input enabled' : 'Audition only';
    });
    $('#pianoVelocity').addEventListener('change', event => {
      const velocity = Math.max(1, Math.min(127, Number(event.target.value) || 88));
      event.target.value = String(velocity);
      engine.setSettings({ pianoVelocity: velocity });
    });

    $('#pianoKeyboard').addEventListener('pointerdown', event => {
      const key = event.target.closest('[data-midi]');
      if (!key) return;
      event.preventDefault();
      const midi = Number(key.dataset.midi);
      activePianoPointers.set(event.pointerId, midi);
      key.classList.add('sounding');
      key.setPointerCapture?.(event.pointerId);
      queuePianoMidi(midi);
    });
    const releasePianoPointer = event => {
      const midi = activePianoPointers.get(event.pointerId);
      if (midi == null) return;
      activePianoPointers.delete(event.pointerId);
      const key = document.querySelector(`#pianoKeyboard [data-midi="${midi}"]`);
      key?.classList.remove('sounding');
    };
    $('#pianoKeyboard').addEventListener('pointerup', releasePianoPointer);
    $('#pianoKeyboard').addEventListener('pointercancel', releasePianoPointer);
    $('#pianoKeyboard').addEventListener('click', event => {
      const key = event.target.closest('[data-midi]');
      if (!key || event.detail !== 0) return;
      queuePianoMidi(Number(key.dataset.midi));
    });

    $('#publicationLayoutMode').addEventListener('change', event => {
      document.body.classList.toggle('publication-layout-active', event.target.checked);
      $('#publicationLayoutStatus').textContent = event.target.checked ? 'Drag or use arrow keys to position text' : 'Layout mode off';
    });

    $('#publicationField').addEventListener('change', event => {
      const offset = publicationOffset(engine.score, event.target.value);
      $('#publicationOffsetX').value = String(offset.x);
      $('#publicationOffsetY').value = String(offset.y);
    });

    let publicationDrag = null;
    $('#publicationCanvas').addEventListener('pointerdown', event => {
      const item = event.target.closest('[data-publication-field]');
      if (!item || !$('#publicationLayoutMode').checked) return;
      event.preventDefault();
      const field = item.dataset.publicationField;
      const offset = publicationOffset(engine.score, field);
      publicationDrag = {
        item,
        field,
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        startX: offset.x,
        startY: offset.y,
        x: offset.x,
        y: offset.y
      };
      item.setPointerCapture?.(event.pointerId);
      $('#publicationField').value = field;
    });

    $('#publicationCanvas').addEventListener('pointermove', event => {
      if (!publicationDrag || publicationDrag.pointerId !== event.pointerId) return;
      publicationDrag.x = Math.max(-300, Math.min(300, Math.round(publicationDrag.startX + event.clientX - publicationDrag.originX)));
      publicationDrag.y = Math.max(-300, Math.min(300, Math.round(publicationDrag.startY + event.clientY - publicationDrag.originY)));
      publicationDrag.item.style.transform = `translate(${publicationDrag.x}px, ${publicationDrag.y}px)`;
      $('#publicationOffsetX').value = String(publicationDrag.x);
      $('#publicationOffsetY').value = String(publicationDrag.y);
      $('#publicationLayoutStatus').textContent = `${publicationDrag.field}: ${publicationDrag.x}, ${publicationDrag.y}`;
    });

    const finishPublicationDrag = event => {
      if (!publicationDrag || (event.pointerId != null && publicationDrag.pointerId !== event.pointerId)) return;
      const completed = publicationDrag;
      publicationDrag = null;
      savePublicationOffset(completed.field, { x: completed.x, y: completed.y });
    };
    $('#publicationCanvas').addEventListener('pointerup', finishPublicationDrag);
    $('#publicationCanvas').addEventListener('pointercancel', finishPublicationDrag);
    $('#publicationCanvas').addEventListener('keydown', event => {
      const item = event.target.closest('[data-publication-field]');
      if (!item || !$('#publicationLayoutMode').checked || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const field = item.dataset.publicationField;
      const offset = publicationOffset(engine.score, field);
      const step = event.shiftKey ? 10 : 1;
      if (event.key === 'ArrowLeft') offset.x -= step;
      if (event.key === 'ArrowRight') offset.x += step;
      if (event.key === 'ArrowUp') offset.y -= step;
      if (event.key === 'ArrowDown') offset.y += step;
      savePublicationOffset(field, offset);
      $('#publicationField').value = field;
    });

    $('#staffPages').addEventListener('click', event => {
      const target = event.target.closest('[data-event-id]');
      if (!target) return;
      engine.selectEvent(target.dataset.eventId, { additive: event.ctrlKey || event.metaKey, toggle: event.ctrlKey || event.metaKey });
    });

    $('#staffPages').addEventListener('keydown', event => {
      const target = event.target.closest('[data-event-id]');
      if (!target) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        engine.selectEvent(target.dataset.eventId, { additive: event.ctrlKey || event.metaKey });
      }
    });

    window.addEventListener('keydown', event => {
      const editingText = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      const ctrl = event.ctrlKey || event.metaKey;
      if (!editingText && pianoSettings().open && !ctrl && !event.altKey) {
        const pianoMap = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12 };
        const offset = pianoMap[event.key.toLowerCase()];
        if (offset != null) {
          event.preventDefault();
          queuePianoMidi((pianoSettings().octave + 1) * 12 + offset);
          return;
        }
      }
      if (ctrl && event.key.toLowerCase() === 's') { event.preventDefault(); void execute(event.shiftKey ? 'saveAs' : 'save'); return; }
      if (ctrl && event.key.toLowerCase() === 'o') { event.preventDefault(); void execute('open'); return; }
      if (ctrl && event.key.toLowerCase() === 'n') { event.preventDefault(); void execute('newScore'); return; }
      if (ctrl && event.key.toLowerCase() === 'z') { event.preventDefault(); void execute(event.shiftKey ? 'redo' : 'undo'); return; }
      if (ctrl && event.key.toLowerCase() === 'y') { event.preventDefault(); void execute('redo'); return; }
      if (ctrl && event.key.toLowerCase() === 'c') { event.preventDefault(); void execute('copy'); return; }
      if (ctrl && event.key.toLowerCase() === 'v') { event.preventDefault(); void execute('paste'); return; }
      if (editingText) return;
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); void execute('deleteSelection'); return; }
      if (event.key === 'Escape') { engine.clearSelection(); return; }
      if (event.key === 'ArrowLeft') { event.preventDefault(); if (event.shiftKey) engine.moveSelection(-engine.duration); else engine.selectAdjacent(-1); return; }
      if (event.key === 'ArrowRight') { event.preventDefault(); if (event.shiftKey) engine.moveSelection(engine.duration); else engine.selectAdjacent(1); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); engine.transposeSelection(event.shiftKey ? 12 : 1); return; }
      if (event.key === 'ArrowDown') { event.preventDefault(); engine.transposeSelection(event.shiftKey ? -12 : -1); return; }
      if (event.key === '.') { event.preventDefault(); engine.toggleDot(); return; }
      if (event.key === '3') { event.preventDefault(); engine.setTuplet(3, 2); return; }
      if (event.key === ' ') { event.preventDefault(); void execute(engine.playback?.playing ? 'stop' : 'play'); return; }
      const durationKeys = { '1': 4, '2': 2, '4': .5, '5': .25, '6': .125, '7': .0625 };
      if (durationKeys[event.key]) { event.preventDefault(); engine.setDuration(durationKeys[event.key]); $('#duration').value = String(durationKeys[event.key]); return; }
      const pitchKeys = { a: 'A4', b: 'B4', c: 'C4', d: 'D4', e: 'E4', f: 'F4', g: 'G4' };
      const pitch = pitchKeys[event.key.toLowerCase()];
      if (pitch) { event.preventDefault(); engine.addNote({ pitch }); }
    });

    window.addEventListener('resize', () => scheduleViewportReflow());
    $('#scoreArea').addEventListener('scroll', () => {
      const state = viewportStates[activeView];
      if (!state) return;
      currentPageIndex = currentPageFromScroll(state.layout, activePageSlots().length || 1);
      updatePageStatus();
    }, { passive: true });
    $('#scoreArea').addEventListener('wheel', event => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      zoomMode = 'manual';
      zoom = Math.max(.2, Math.min(3, zoom + (event.deltaY < 0 ? .1 : -.1)));
      reflowViewport();
    }, { passive: false });
    $('#pageLayoutMode').addEventListener('change', event => {
      pageLayoutMode = ['continuous', 'single', 'spread', 'horizontal'].includes(event.target.value)
        ? event.target.value
        : 'continuous';
      currentPageIndex = 0;
      reflowViewport({ preservePosition: false });
      setStatus(`Page layout: ${pageLayoutMode}`);
    });
  }

  async function autosave() {
    const state = engine.state();
    if (!state.dirty) return;
    try {
      await window.airmonDesktop.autosaveDocument({
        documentId: state.documentId,
        title: state.score.title,
        originalPath: state.filePath,
        content: textToBase64(engine.serializeAirscore())
      });
      setStatus('Recovery checkpoint saved locally');
    } catch (error) {
      showError(error, 'Autosave');
    }
  }

  function installShutdownHandler() {
    window.airmonDesktop.onShutdownRequest(async request => {
      let status = 'approved';
      const diagnostics = { dirty: engine.dirty, playback: Boolean(engine.playback?.playing) };
      try {
        if (request.decision === 'save' && engine.dirty) {
          const saved = await saveDocument(false);
          if (!saved) status = 'canceled';
        }
        if (status === 'approved') {
              stopMidiOutput();
              await engine.shutdown();
            }
      } catch (error) {
        status = 'failed';
        diagnostics.error = error.message || String(error);
      }
      window.airmonDesktop.respondToShutdown({ requestId: request.requestId, status, diagnostics });
    });
  }

  function shellVerification() {
    const engineVerification = engine.verify();
    return {
      build: BUILD,
      mounted: document.documentElement.dataset.composer3Ready === 'true',
      tabs: $$('.tab').length,
      activePanels: $$('.panel.active:not([hidden])').length,
      legacySelectors: $$('.professional-nav,.quick-toolbar,.titlebar,#composer3CommandBridge').length,
      visibleControls: $$('button:not([hidden]),input:not([hidden]),select:not([hidden])').length,
      scoreViewport: Boolean($('#scoreArea') && $('#staffPages') && $('#staffSvg') && $('#solfaPages')),
      physicalPageService: Boolean(viewportApi?.ViewportLayoutService),
      commandGroups: new Set($$('[data-group]').map(group => group.dataset.group)).size,
      allControlsConnected: $$('[data-command]').every(control => typeof control.dataset.command === 'string' && control.dataset.command.length > 0),
      ...engineVerification
    };
  }

  async function mount() {
    try {
      bindInterface();
      installViewportObservers();
      engine.onChange((state, label) => {
        render();
        window.airmonDesktop.updateDocumentState({
          dirty: state.dirty,
          title: state.score.title,
          filePath: state.filePath
        });
        if (label) setStatus(label);
      });
      engine.onError((error, context) => showError(error, context));

      $('#duration').value = String(engine.duration);
      render();
      installShutdownHandler();

      try {
        const storedSettings = await window.airmonDesktop.getSettings();
        applyApplicationSettings(storedSettings || {});
      } catch (error) {
        applyApplicationSettings({});
        showError(error, 'Load application settings');
      }
      window.addEventListener('beforeunload', () => {
        if (autosaveTimer) window.clearInterval(autosaveTimer);
        viewportObserver?.disconnect();
        if (viewportFrame) window.cancelAnimationFrame(viewportFrame);
      });

      document.documentElement.dataset.composer3Ready = 'true';
      $('#app').setAttribute('aria-busy', 'false');
      const verification = shellVerification();
      window.AirmonComposer3 = Object.freeze({
        build: BUILD,
        api: true,
        engine,
        command: execute,
        verify: shellVerification,
        state: () => engine.state(),
        viewport: () => ({
          activeView,
          zoomMode,
          zoom,
          pageLayoutMode,
          currentPage: currentPageIndex + 1,
          pageCount: activePageSlots().length,
          layout: viewportStates[activeView]?.layout || null
        })
      });
      await window.airmonDesktop.rendererReady(verification);
    } catch (error) {
      showError(error, 'Composer startup');
      await window.airmonDesktop.rendererReady({
        build: BUILD,
        mounted: false,
        canonicalModel: false,
        directApi: false,
        fourVoiceLayers: false,
        legacySelectors: 0,
        error: error.message || String(error)
      }).catch(() => {});
    }
  }

  window.addEventListener('load', () => void mount(), { once: true });
})();
