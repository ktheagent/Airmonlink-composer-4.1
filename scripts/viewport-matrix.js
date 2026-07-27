'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const preview = path.join(root, 'Airmonlink-Composer-3-Preview.html');
const validation = path.join(root, 'validation');
const chromium = process.env.CHROMIUM || '/usr/bin/chromium';

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

class Cdp {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.id = 0;
    this.pending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener('message', event => {
      const item = JSON.parse(String(event.data));
      if (item.id && this.pending.has(item.id)) {
        const pending = this.pending.get(item.id);
        this.pending.delete(item.id);
        if (item.error) pending.reject(new Error(`${item.error.code}: ${item.error.message}`));
        else pending.resolve(item.result || {});
      }
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebSocket connection timeout')), 10000);
      this.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.socket.addEventListener('error', event => {
        clearTimeout(timer);
        reject(new Error(String(event.message || 'WebSocket error')));
      }, { once: true });
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
    const response = await this.call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise
    });
    if (response.result?.subtype === 'error') {
      throw new Error(response.result.description || 'JavaScript evaluation failed');
    }
    return response.result?.value;
  }

  close() {
    this.socket?.close();
  }
}

async function waitForPage(port) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      const pages = await fetchJson(`http://127.0.0.1:${port}/json`);
      const page = pages.find(item => item.type === 'page');
      if (page) return page;
    } catch (_) {}
    await sleep(100);
  }
  throw new Error(`Chromium DevTools endpoint did not start on port ${port}.`);
}

function record(checks, name, passed, details) {
  checks.push({ name, status: passed ? 'PASS' : 'FAIL', details });
}

async function runScenario(scenario, index, previewHtml) {
  const port = 9820 + index;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `airmon-build29-matrix-${index}-`));
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
    `--window-size=${scenario.width},${scenario.height}`,
    `--force-device-scale-factor=${scenario.scale}`,
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  let cdp;
  try {
    const page = await waitForPage(port);
    cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.call('Runtime.enable');
    await cdp.call('Page.enable');
    const frameTree = await cdp.call('Page.getFrameTree');
    await cdp.call('Page.setDocumentContent', {
      frameId: frameTree.frameTree.frame.id,
      html: previewHtml
    });

    for (let attempt = 0; attempt < 300; attempt += 1) {
      if (await cdp.evaluate("Boolean(window.AirmonComposer3 && document.documentElement.dataset.composer3Ready === 'true')")) break;
      await sleep(50);
    }

    const checks = [];
    const shell = await cdp.evaluate(`(()=>{const r=e=>{const x=e.getBoundingClientRect();return {left:x.left,right:x.right,top:x.top,bottom:x.bottom,width:x.width,height:x.height}};return {innerWidth,innerHeight,devicePixelRatio,app:r(document.querySelector('#app')),area:r(document.querySelector('#scoreArea'))};})()`);
    record(checks, 'desktop shell remains inside viewport',
      shell.app.right <= shell.innerWidth + 1 && shell.area.right <= shell.innerWidth + 1,
      shell);

    await cdp.evaluate("window.AirmonComposer3.command('fitWidth')", true);
    await sleep(80);
    const fitWidth = await cdp.evaluate(`(()=>{const a=document.querySelector('#scoreArea'),p=document.querySelector('#staffPages .physical-page');const ar=a.getBoundingClientRect(),pr=p.getBoundingClientRect();return {area:{left:ar.left,right:ar.right,width:ar.width},page:{left:pr.left,right:pr.right,width:pr.width,height:pr.height},scrollWidth:a.scrollWidth,clientWidth:a.clientWidth,zoom:window.AirmonComposer3.viewport().zoom};})()`);
    record(checks, 'Fit Width shows a complete page without horizontal workspace overflow',
      fitWidth.page.left >= fitWidth.area.left - 1
        && fitWidth.page.right <= fitWidth.area.right + 1
        && fitWidth.scrollWidth <= fitWidth.clientWidth + 1,
      fitWidth);

    await cdp.evaluate("window.AirmonComposer3.command('fitPage')", true);
    await sleep(80);
    const fitPage = await cdp.evaluate(`(()=>{const a=document.querySelector('#scoreArea'),p=document.querySelector('#staffPages .physical-page');const ar=a.getBoundingClientRect(),pr=p.getBoundingClientRect();return {area:{left:ar.left,right:ar.right,top:ar.top,bottom:ar.bottom,width:ar.width,height:ar.height},page:{left:pr.left,right:pr.right,top:pr.top,bottom:pr.bottom,width:pr.width,height:pr.height},zoom:window.AirmonComposer3.viewport().zoom};})()`);
    record(checks, 'Fit Page shows the complete portrait page',
      fitPage.page.left >= fitPage.area.left - 1
        && fitPage.page.right <= fitPage.area.right + 1
        && fitPage.page.top >= fitPage.area.top - 1
        && fitPage.page.bottom <= fitPage.area.bottom + 1
        && fitPage.page.height > fitPage.page.width,
      fitPage);

    await cdp.evaluate("window.AirmonComposer3.engine.newScore({template:'lead',measures:96});", true);
    await sleep(120);
    const continuous = await cdp.evaluate(`(()=>{const s=document.querySelector('#pageLayoutMode');s.value='continuous';s.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
    void continuous;
    await sleep(80);
    const continuousLayout = await cdp.evaluate("window.AirmonComposer3.viewport()");
    record(checks, 'Continuous mode casts a long score onto multiple physical pages',
      continuousLayout.pageCount > 1
        && continuousLayout.layout.pages.length === continuousLayout.pageCount
        && continuousLayout.layout.pages[1].y > continuousLayout.layout.pages[0].y,
      continuousLayout);

    await cdp.evaluate(`(()=>{const s=document.querySelector('#pageLayoutMode');s.value='spread';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await sleep(80);
    const spread = await cdp.evaluate("window.AirmonComposer3.viewport()");
    record(checks, 'Spread mode creates two-page rows',
      spread.layout.pages.length > 1
        && spread.layout.pages[0].y === spread.layout.pages[1].y
        && spread.layout.pages[1].x > spread.layout.pages[0].x,
      spread);

    await cdp.evaluate(`(()=>{const s=document.querySelector('#pageLayoutMode');s.value='horizontal';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await sleep(80);
    const horizontal = await cdp.evaluate("window.AirmonComposer3.viewport()");
    record(checks, 'Horizontal mode places pages on one horizontal sequence',
      horizontal.layout.pages.length > 1
        && horizontal.layout.pages[1].x > horizontal.layout.pages[0].x
        && horizontal.layout.pages[1].y === horizontal.layout.pages[0].y,
      horizontal);

    await cdp.evaluate("window.AirmonComposer3.command('showSolfa')", true);
    await cdp.evaluate("window.AirmonComposer3.command('fitWidth')", true);
    await sleep(100);
    const solfa = await cdp.evaluate(`(()=>{const a=document.querySelector('#scoreArea'),p=document.querySelector('#solfaPages .physical-page');const ar=a.getBoundingClientRect(),pr=p.getBoundingClientRect();return {area:{left:ar.left,right:ar.right},page:{left:pr.left,right:pr.right,width:pr.width,height:pr.height},pageCount:window.AirmonComposer3.viewport().pageCount};})()`);
    record(checks, 'Tonic Sol-fa uses the same complete-page Fit Width system',
      solfa.page.left >= solfa.area.left - 1
        && solfa.page.right <= solfa.area.right + 1
        && solfa.page.height > solfa.page.width,
      solfa);

    const screenshot = await cdp.call('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false
    });
    const screenshotName = `build29-viewport-${scenario.width}x${scenario.height}-${String(scenario.scale).replace('.', '_')}x.png`;
    fs.writeFileSync(path.join(validation, screenshotName), Buffer.from(screenshot.data, 'base64'));

    return {
      scenario,
      browser: shell,
      checks,
      screenshot: screenshotName,
      status: checks.every(item => item.status === 'PASS') ? 'PASS' : 'FAIL'
    };
  } finally {
    cdp?.close();
    if (!child.killed) child.kill('SIGTERM');
    await sleep(150);
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

async function main() {
  if (!fs.existsSync(preview)) throw new Error('Run npm run preview first.');
  if (!fs.existsSync(chromium)) throw new Error(`Chromium unavailable: ${chromium}`);
  fs.mkdirSync(validation, { recursive: true });
  const previewHtml = fs.readFileSync(preview, 'utf8');
  const scenarios = [
    { width: 1366, height: 768, scale: 1 },
    { width: 1366, height: 768, scale: 1.25 },
    { width: 1920, height: 1080, scale: 1 },
    { width: 1920, height: 1080, scale: 1.5 }
  ];
  const results = [];
  for (let index = 0; index < scenarios.length; index += 1) {
    results.push(await runScenario(scenarios[index], index, previewHtml));
  }
  const report = {
    product: 'Airmonlink Composer 3',
    version: '1.1.9',
    buildNumber: 29,
    githubEmbargoStatus: 'ACTIVE',
    createdUtc: new Date().toISOString(),
    scenarios: results,
    checks: results.flatMap(item => item.checks).length,
    passed: results.flatMap(item => item.checks).filter(item => item.status === 'PASS').length,
    status: results.every(item => item.status === 'PASS') ? 'PASS' : 'FAIL'
  };
  fs.writeFileSync(path.join(validation, 'build29-viewport-matrix.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Viewport matrix ${report.status}: ${report.passed}/${report.checks} checks across ${results.length} scenarios.`);
  if (report.status !== 'PASS') {
    for (const result of results) {
      for (const check of result.checks.filter(item => item.status === 'FAIL')) {
        console.error(`${result.scenario.width}x${result.scenario.height}@${result.scenario.scale}: ${check.name}`);
        console.error(JSON.stringify(check.details));
      }
    }
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
