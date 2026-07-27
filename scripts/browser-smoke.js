'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const preview = path.join(root, 'Airmonlink-Composer-3-Preview.html');
const validation = path.join(root, 'validation');
const reportPath = path.join(validation, 'browser-smoke.json');
const screenshotPath = path.join(validation, 'composer3-browser.png');
const solfaScreenshotPath = path.join(validation, 'composer3-solfa.png');
const pdfPath = path.join(validation, 'composer3-print.pdf');
const chromium = process.env.CHROMIUM || '/usr/bin/chromium';
const port = Number(process.env.AIRMON_CDP_PORT || 9777);

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, response => {
      let data = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (error) { reject(error); }
      });
    });
    request.on('error', reject);
    request.setTimeout(1000, () => request.destroy(new Error('timeout')));
  });
}

function startPreviewServer() {
  const content = fs.readFileSync(preview);
  const server = http.createServer((request, response) => {
    if (request.url === '/' || request.url === '/preview.html') {
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': content.length,
        'Cache-Control': 'no-store'
      });
      response.end(content);
      return;
    }
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('Not found');
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, url: `http://127.0.0.1:${address.port}/preview.html` });
    });
  });
}

class Cdp {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.id = 0;
    this.pending = new Map();
    this.exceptions = [];
    this.consoleErrors = [];
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener('message', event => {
      const item = JSON.parse(String(event.data));
      if (item.method === 'Runtime.exceptionThrown') {
        const details = item.params?.exceptionDetails || {};
        this.exceptions.push(details.exception?.description || details.text || 'Unknown exception');
      }
      if (item.method === 'Runtime.consoleAPICalled' && item.params?.type === 'error') {
        this.consoleErrors.push((item.params.args || []).map(arg => arg.value || arg.description || '').join(' '));
      }
      if (item.id && this.pending.has(item.id)) {
        const { resolve, reject } = this.pending.get(item.id);
        this.pending.delete(item.id);
        if (item.error) reject(new Error(`${item.error.code}: ${item.error.message}`));
        else resolve(item.result || {});
      }
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebSocket connection timeout')), 10000);
      this.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.socket.addEventListener('error', event => { clearTimeout(timer); reject(new Error(String(event.message || 'WebSocket error'))); }, { once: true });
    });
  }

  call(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 30000);
      this.pending.set(id, {
        resolve: value => { clearTimeout(timer); resolve(value); },
        reject: error => { clearTimeout(timer); reject(error); }
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression, awaitPromise = false) {
    const result = await this.call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise
    });
    if (result.result?.subtype === 'error') throw new Error(result.result.description || 'JavaScript evaluation failed');
    return result.result?.value;
  }

  close() {
    if (this.socket) this.socket.close();
  }
}

async function waitForPage() {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      const pages = await fetchJson(`http://127.0.0.1:${port}/json`);
      const page = pages.find(item => item.type === 'page');
      if (page) return page;
    } catch (_) {}
    await sleep(100);
  }
  throw new Error('Chromium DevTools endpoint did not become available.');
}

function add(results, name, condition, details = '') {
  const passed = Boolean(condition);
  results.push({ name, status: passed ? 'PASS' : 'FAIL', details: String(details || '') });
  if (!passed) throw new Error(`${name}: ${details}`);
}

async function main() {
  if (!fs.existsSync(preview)) throw new Error('Run npm run preview first.');
  if (!fs.existsSync(chromium)) throw new Error(`Chromium unavailable: ${chromium}`);
  fs.mkdirSync(validation, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'airmon-composer3-cdp-'));
  const child = spawn(chromium, [
    '--headless',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--single-process',
    '--no-zygote',
    '--disable-gpu',
    '--remote-allow-origins=*',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--window-size=1600,1000',
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  let stderr = '';
  child.stderr.on('data', chunk => { stderr += String(chunk); });
  const results = [];
  let cdp = null;

  try {
    const page = await waitForPage();
    cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.call('Runtime.enable');
    await cdp.call('Page.enable');
    await cdp.call('Console.enable');
    const frameTree = await cdp.call('Page.getFrameTree');
    const frameId = frameTree.frameTree.frame.id;
    const previewHtml = fs.readFileSync(preview, 'utf8');
    await cdp.call('Page.setDocumentContent', { frameId, html: previewHtml });

    let ready = false;
    for (let attempt = 0; attempt < 300; attempt += 1) {
      ready = await cdp.evaluate("Boolean(window.AirmonComposer3 && document.documentElement.dataset.composer3Ready === 'true')");
      if (ready) break;
      await sleep(50);
    }
    add(results, 'Composer 3 mounted', ready);

    const verification = await cdp.evaluate('window.AirmonComposer3.verify()');
    add(results, 'Canonical semantic model', verification.canonicalModel, JSON.stringify(verification));
    add(results, 'Direct engine API', verification.directApi, JSON.stringify(verification));
    add(results, 'Exactly four voice layers', verification.fourVoiceLayers, JSON.stringify(verification));
    add(results, 'No legacy selectors', verification.legacySelectors === 0, JSON.stringify(verification));
    add(results, 'Six work-area tabs', verification.tabs === 6, JSON.stringify(verification));
    add(results, 'One active panel', verification.activePanels === 1, JSON.stringify(verification));
    add(results, 'Visible score viewport', verification.scoreViewport, JSON.stringify(verification));
    add(results, 'All commands connected', verification.allControlsConnected, JSON.stringify(verification));
    const shellGeometry = await cdp.evaluate(`(()=>{const area=document.querySelector('#scoreArea').getBoundingClientRect();const shell=document.querySelector('#app').getBoundingClientRect();return {innerWidth,areaLeft:area.left,areaRight:area.right,areaWidth:area.width,shellRight:shell.right,shellWidth:shell.width};})()`);
    add(results, 'Window shell and score workspace stay inside the viewport',
      shellGeometry.shellRight <= shellGeometry.innerWidth + 1 && shellGeometry.areaRight <= shellGeometry.innerWidth + 1,
      JSON.stringify(shellGeometry));

    const before = await cdp.evaluate('window.AirmonComposer3.state().score.parts.flatMap(part=>part.events||[]).length');
    await cdp.evaluate("window.AirmonComposer3.command('addNote')", true);
    const after = await cdp.evaluate('window.AirmonComposer3.state().score.parts.flatMap(part=>part.events||[]).length');
    add(results, 'Note command changes canonical score', after === before + 1, `before=${before};after=${after}`);

    await cdp.evaluate("document.querySelector('#voiceSelect').value='2';document.querySelector('#voiceSelect').dispatchEvent(new Event('change',{bubbles:true}))");
    await cdp.evaluate("window.AirmonComposer3.command('addNote')", true);
    add(results, 'Independent Voice 2 entry', await cdp.evaluate("window.AirmonComposer3.state().score.parts.some(part=>(part.events||[]).some(event=>Number(event.voice)===2))"));

    await cdp.evaluate("window.AirmonComposer3.command('trill')", true);
    add(results, 'Ornament command updates selected semantic note', await cdp.evaluate("window.AirmonComposer3.state().selectedEvents.some(item=>(item.event.ornaments||[]).includes('trill-mark'))"));

    await cdp.evaluate("document.querySelector('#techniqueType').value='fingering';document.querySelector('#techniqueValue').value='3';window.AirmonComposer3.command('applyTechnique')", true);
    add(results, 'Technique command updates selected semantic note', await cdp.evaluate("window.AirmonComposer3.state().selectedEvents.some(item=>(item.event.technical||[]).some(mark=>mark.type==='fingering'&&mark.value==='3'))"));

    await cdp.evaluate("window.AirmonComposer3.command('beamBegin')", true);
    add(results, 'Beam command updates selected semantic note', await cdp.evaluate("window.AirmonComposer3.state().selectedEvents.some(item=>(item.event.beam||[]).some(mark=>mark.number===1&&mark.value==='begin'))"));

    await cdp.evaluate("window.AirmonComposer3.command('fermata')", true);
    add(results, 'Fermata command updates selected semantic note', await cdp.evaluate("window.AirmonComposer3.state().selectedEvents.some(item=>item.event.fermata===true)"));

    await cdp.evaluate("document.querySelector('#solfaSyllableInput').value='s';window.AirmonComposer3.command('applySolfaSyllable')", true);
    const solfaEdited = await cdp.evaluate("(()=>{const state=window.AirmonComposer3.state();return state.selectedEvents.map(item=>{const part=state.score.parts.find(part=>part.id===item.partId);const converted=window.AirmonSolfa.eventToSolfa(item.event,state.score,part,{notationMode:'traditional'});return {midi:item.event.midi,pitch:item.event.pitch,syllable:converted.syllable}})})()");
    add(results, 'Sol-fa syllable edits the selected staff note', solfaEdited.some(item=>String(item.syllable).toLowerCase().startsWith('s')), JSON.stringify(solfaEdited));

    await cdp.evaluate(`document.querySelector('#voiceSelect').value='4';document.querySelector('#voiceSelect').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#solfaPassageInput').value="d r m f | s l t d'";window.AirmonComposer3.command('applySolfaPassage')`, true);
    add(results, 'Sol-fa passage creates authoritative Voice 4 events', await cdp.evaluate("window.AirmonComposer3.state().score.parts.some(part=>(part.events||[]).filter(event=>event.generatedBy!=='gap-fill'&&Number(event.voice)===4).length>=8)"));

    await cdp.evaluate("window.AirmonComposer3.command('verifySolfa')", true);
    add(results, 'Staff playback and Sol-fa verification passes', await cdp.evaluate("document.querySelector('#solfaStatus').textContent.includes('synchronized')"));

    await cdp.evaluate("document.querySelector('#showSolfaOverlay').checked=true;document.querySelector('#showSolfaOverlay').dispatchEvent(new Event('change',{bubbles:true}))");
    add(results, 'Optional Sol-fa staff overlay is stored in score settings', await cdp.evaluate("window.AirmonComposer3.state().score.settings.showSolfa===true"));

    await cdp.evaluate("document.querySelector('#lyricVerse').value='2';document.querySelector('#lyricsInput').value='Rejoice';window.AirmonComposer3.command('applyLyric')", true);
    const browserLyrics = await cdp.evaluate("window.AirmonComposer3.state().selectedEvents.flatMap(item=>item.event.lyrics||[])");
    add(results, 'Multi-verse lyric entry stores verse as metadata', browserLyrics.some(item=>item.verse===2&&item.text==='Rejoice')&&!browserLyrics.some(item=>/^2Rejoice$/.test(item.text)), JSON.stringify(browserLyrics));

    await cdp.evaluate("document.querySelector('#publicationSubtitle').value='Festival Edition';document.querySelector('#publicationDedication').value='For every choir';document.querySelector('#publicationLyricist').value='Airmon Writer';document.querySelector('#publicationDate').value='2026';window.AirmonComposer3.command('applyPublication')", true);
    add(results, 'Publication hierarchy renders semantic metadata', await cdp.evaluate("document.querySelector('#subtitleView').textContent==='Festival Edition'&&document.querySelector('#dedicationView').textContent==='For every choir'&&document.querySelector('#lyricistView').textContent.includes('Airmon Writer')&&document.querySelector('#compositionDateView').textContent==='2026'"));

    await cdp.evaluate("document.querySelector('#publicationField').value='staff:title';document.querySelector('#publicationOffsetX').value='16';document.querySelector('#publicationOffsetY').value='-5';window.AirmonComposer3.command('applyPublicationLayout')", true);
    add(results, 'Publication text position persists in semantic layout', await cdp.evaluate("window.AirmonComposer3.state().score.publicationTextLayout['staff:title'].offsetX===16&&window.AirmonComposer3.state().score.publicationTextLayout['staff:title'].offsetY===-5&&document.querySelector('#scoreTitleView').style.transform.includes('16px')"));

    await cdp.evaluate("document.querySelector('#pageTextPage').value='1';document.querySelector('#pageTextValue').value='Continuation header';window.AirmonComposer3.command('addPageText')", true);
    add(results, 'Page-scoped text is visible and semantic', await cdp.evaluate("window.AirmonComposer3.state().score.annotations.some(item=>item.type==='page-text'&&item.scope==='page'&&item.text==='Continuation header')&&document.querySelector('#pageTextView').textContent.includes('Continuation header')"));

    await cdp.evaluate("document.querySelector('#lyricsInput').value='Airmonlink';window.AirmonComposer3.command('applyLyric')", true);
    add(results, 'Lyric command updates score', await cdp.evaluate("window.AirmonComposer3.state().score.parts.some(part=>(part.events||[]).some(event=>Array.isArray(event.lyrics)&&event.lyrics.length))"));


    const pianoBefore = await cdp.evaluate("(()=>{const area=document.querySelector('#scoreArea').getBoundingClientRect();const panel=document.querySelector('#pianoPanel');return {height:area.height,hidden:panel.hidden}})()");
    add(results, 'Piano panel is hidden by default', pianoBefore.hidden === true, JSON.stringify(pianoBefore));

    await cdp.evaluate("window.AirmonComposer3.command('togglePianoPanel')", true);
    const pianoOpen = await cdp.evaluate("(()=>{const area=document.querySelector('#scoreArea').getBoundingClientRect();const panel=document.querySelector('#pianoPanel').getBoundingClientRect();return {hidden:document.querySelector('#pianoPanel').hidden,scoreHeight:area.height,panelHeight:panel.height,expanded:document.querySelector('[data-command=\"togglePianoPanel\"]').getAttribute('aria-expanded')}})()");
    add(results, 'Docked piano panel opens below score without overlay', !pianoOpen.hidden && pianoOpen.panelHeight > 0 && pianoOpen.scoreHeight < pianoBefore.height && pianoOpen.expanded === 'true', JSON.stringify({ before: pianoBefore, after: pianoOpen }));

    await cdp.evaluate("document.querySelector('#pianoOctave').value='4';document.querySelector('#pianoOctave').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#pianoVelocity').value='96';document.querySelector('#pianoVelocity').dispatchEvent(new Event('change',{bubbles:true}));");
    const chordResult = await cdp.evaluate("(()=>{const e=window.AirmonComposer3.engine;e.setActiveVoice(3);e.seek(0);e.setDuration(1);const before=e.score.parts.flatMap(p=>p.events||[]).length;const created=e.addPianoChord([60,64,67,64],{velocity:96,inputSource:'browser-piano'});const after=e.score.parts.flatMap(p=>p.events||[]).length;return {before,after,count:created.length,midis:created.map(n=>n.midi).sort((a,b)=>a-b),voices:created.map(n=>n.voice),chords:[...new Set(created.map(n=>n.chordId))],selected:document.querySelectorAll('.piano-key.selected').length};})()");
    add(results, 'Piano chord enters one deduplicated semantic chord in active Voice 3', chordResult.count === 3 && chordResult.after === chordResult.before + 3 && JSON.stringify(chordResult.midis) === JSON.stringify([60,64,67]) && chordResult.voices.every(voice => voice === 3) && chordResult.chords.length === 1, JSON.stringify(chordResult));
    add(results, 'Piano selection is reflected on visible keys', chordResult.selected >= 3, JSON.stringify(chordResult));

    const auditionOnly = await cdp.evaluate("(async()=>{const input=document.querySelector('#pianoInputMode');input.checked=false;input.dispatchEvent(new Event('change',{bubbles:true}));const before=window.AirmonComposer3.engine.score.parts.flatMap(p=>p.events||[]).length;window.dispatchEvent(new KeyboardEvent('keydown',{key:'a',bubbles:true}));await new Promise(resolve=>setTimeout(resolve,100));const after=window.AirmonComposer3.engine.score.parts.flatMap(p=>p.events||[]).length;return {before,after,inputMode:window.AirmonComposer3.engine.score.settings.pianoInputMode};})()", true);
    add(results, 'Piano audition mode does not create score events', auditionOnly.before === auditionOnly.after && auditionOnly.inputMode === false, JSON.stringify(auditionOnly));

    await cdp.evaluate("window.AirmonComposer3.command('collapsePianoPanel')", true);
    add(results, 'Piano panel collapses and returns score space', await cdp.evaluate("document.querySelector('#pianoPanel').hidden===true&&document.querySelector('[data-command=\"togglePianoPanel\"]').getAttribute('aria-expanded')==='false'"));


    await cdp.evaluate("document.querySelector('#countInMeasures').value='2';document.querySelector('#metronome').checked=true;window.AirmonComposer3.command('applyLoop')", true);
    add(results, 'Count-in and metronome options reach semantic transport', await cdp.evaluate("window.AirmonComposer3.engine.playbackState().countInMeasures===2&&window.AirmonComposer3.engine.playbackState().metronome===true"));

    await cdp.evaluate("document.querySelector('#jumpMeasureNumber').value='2';window.AirmonComposer3.command('jumpMeasure')", true);
    add(results, 'Measure navigation moves to exact measure boundary', await cdp.evaluate("window.AirmonComposer3.engine.cursor===window.AirmonScoreModel.measureStartBeat(window.AirmonComposer3.engine.score,1)"));

    const pausedState = await cdp.evaluate("(()=>{const e=window.AirmonComposer3.engine;e.playback={playing:true,currentBeat:1.75,stop(){this.playing=false;}};window.AirmonComposer3.command('pause');return e.playbackState();})()");
    add(results, 'Pause preserves playback position', pausedState.paused === true && pausedState.beat === 1.75, JSON.stringify(pausedState));

    const midiFailure = await cdp.evaluate("(async()=>{const original=navigator.requestMIDIAccess;Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:async()=>{throw new Error('Permission denied for reliability test')}});await window.AirmonComposer3.command('enableMidi');const status=document.querySelector('#midiStatus').dataset.status;const message=document.querySelector('#midiStatus').textContent;Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:original});return {status,message,errorVisible:!document.querySelector('#errorBanner').hidden};})()", true);
    add(results, 'MIDI permission failure is visible and nonfatal', midiFailure.status === 'permission-denied' && midiFailure.errorVisible, JSON.stringify(midiFailure));
    cdp.consoleErrors = cdp.consoleErrors.filter(message => !message.includes('Permission denied for reliability test'));
    await cdp.evaluate("document.querySelector('#dismissError').click()");

    await cdp.evaluate("window.AirmonComposer3.engine.playback=null;window.AirmonComposer3.command('enableMidiOutput')", true);
    await cdp.evaluate("window.AirmonComposer3.engine.seek(0);window.AirmonComposer3.command('playMidiOutput')", true);
    const midiOutput = await cdp.evaluate("({device:document.querySelector('#midiOutputSelect').value,messages:window.__desktopMock.midiMessages||[],status:document.querySelector('#midiOutputStatus').textContent})");
    add(results, 'Web MIDI output schedules note-on and note-off messages', midiOutput.device === 'preview-output' && midiOutput.messages.some(item=>(item.data[0]&0xf0)===0x90) && midiOutput.messages.some(item=>(item.data[0]&0xf0)===0x80), JSON.stringify(midiOutput));

    await cdp.evaluate("window.AirmonComposer3.command('printPreview')", true);
    add(results, 'Print preview reaches isolated desktop service', await cdp.evaluate("Boolean(window.__desktopMock.printPreview&&window.__desktopMock.printPreview.pageSize)"));

    await cdp.evaluate("window.AirmonComposer3.command('showSolfa')", true);
    add(results, 'Dedicated Tonic Sol-fa page', await cdp.evaluate("!document.querySelector('#solfaPage').hidden&&document.querySelector('#solfaPages').textContent.trim().length>0"));
    const solfaShot = await cdp.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(solfaScreenshotPath, Buffer.from(solfaShot.data, 'base64'));

    await cdp.evaluate("window.AirmonComposer3.command('showStaff')", true);
    const shot = await cdp.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(screenshotPath, Buffer.from(shot.data, 'base64'));

    await cdp.evaluate("window.AirmonComposer3.command('save')", true);
    add(results, 'Save reaches desktop service', await cdp.evaluate('window.__desktopMock.saved.length===1'));

    await cdp.evaluate("window.AirmonComposer3.command('exportMusicXml')", true);
    add(results, 'MusicXML export reaches desktop service', await cdp.evaluate("window.__desktopMock.exports.some(item=>item.defaultName.endsWith('.musicxml'))"));

    await cdp.evaluate("window.AirmonComposer3.command('exportMidi')", true);
    add(results, 'MIDI export reaches desktop service', await cdp.evaluate("window.__desktopMock.exports.some(item=>item.defaultName.endsWith('.mid'))"));

    await cdp.evaluate("window.AirmonComposer3.command('exportPdf')", true);
    add(results, 'PDF command reaches desktop service', await cdp.evaluate('Boolean(window.__desktopMock.pdf)'));

    const pdf = await cdp.call('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
    fs.writeFileSync(pdfPath, Buffer.from(pdf.data, 'base64'));
    add(results, 'Browser PDF signature', fs.readFileSync(pdfPath).subarray(0, 5).toString('ascii') === '%PDF-', fs.statSync(pdfPath).size);

    const colours = await cdp.evaluate("(()=>{const s=getComputedStyle(document.documentElement);return ['--navy-950','--royal-600','--gold-500'].map(n=>s.getPropertyValue(n).trim())})()");
    add(results, 'Official colour identity', colours.every(Boolean), JSON.stringify(colours));
    add(results, 'No runtime exceptions', cdp.exceptions.length === 0, JSON.stringify(cdp.exceptions));
    add(results, 'No console errors', cdp.consoleErrors.length === 0, JSON.stringify(cdp.consoleErrors));

    fs.writeFileSync(reportPath, JSON.stringify({ status: 'PASS', checks: results, exceptions: cdp.exceptions, consoleErrors: cdp.consoleErrors }, null, 2) + '\n');
    console.log(`Browser validation passed: ${results.length}/${results.length} checks.`);
    console.log(`Screenshot: ${screenshotPath}`);
    console.log(`Sol-fa screenshot: ${solfaScreenshotPath}`);
    console.log(`PDF: ${pdfPath}`);
  } catch (error) {
    fs.writeFileSync(reportPath, JSON.stringify({ status: 'FAIL', checks: results, error: error.stack || String(error), chromiumStderr: stderr.slice(-10000) }, null, 2) + '\n');
    throw error;
  } finally {
    if (cdp) cdp.close();
    child.kill('SIGTERM');
    await Promise.race([
      new Promise(resolve => child.once('exit', resolve)),
      sleep(3000)
    ]);
    if (!child.killed) child.kill('SIGKILL');
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
